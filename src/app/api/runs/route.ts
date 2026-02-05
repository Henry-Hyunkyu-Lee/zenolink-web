import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseCsv } from "@/lib/csv";

export const runtime = "nodejs";

type DoneRun = {
  input_hash: string;
  affinity_value: number | null;
  affinity_prob: number | null;
};

const WARNING_SEQUENCE_TOO_LONG = "sequence_too_long";
const WARNING_INVALID_SMILES = "invalid_smiles";
const WARNING_SEQUENCE_MISSING = "sequence_missing";
const WARNING_PREVIOUS_RESULT = "previous_result_available";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY ?? "";
  const modelVersion = process.env.MODEL_VERSION ?? "";

  if (!supabaseUrl || !supabaseServiceKey || !modelVersion) {
    return NextResponse.json(
      { error: "서버 설정이 필요합니다." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(
    token
  );

  if (userError || !userData?.user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const formData = await request.formData();
  const ligandFile = formData.get("ligand_csv");
  const targetFile = formData.get("target_csv");
  const memo = (formData.get("memo") ?? "").toString();

  if (!(ligandFile instanceof File) || !(targetFile instanceof File)) {
    return NextResponse.json(
      { error: "CSV 파일 2개가 필요합니다." },
      { status: 400 }
    );
  }

  const ligandCsv = parseCsv(await ligandFile.text());
  const targetCsv = parseCsv(await targetFile.text());

  const ligandHeader = ligandCsv.headers.map((h) => h.toLowerCase());
  const targetHeader = targetCsv.headers.map((h) => h.toLowerCase());

  const smilesIndex = ligandHeader.indexOf("smiles");
  const sequenceIndex = targetHeader.indexOf("sequence");
  const ligandNameIndex = ligandHeader.indexOf("name");
  const geneNameIndex = targetHeader.indexOf("name");

  if (smilesIndex === -1 || sequenceIndex === -1) {
    return NextResponse.json(
      { error: "CSV 헤더에 smiles 또는 sequence 컬럼이 필요합니다." },
      { status: 400 }
    );
  }

  const ligands = ligandCsv.rows.map((row) => ({
    smiles: row[smilesIndex]?.trim() ?? "",
    ligandName:
      ligandNameIndex >= 0 ? row[ligandNameIndex]?.trim() ?? "" : "",
  }));
  const targets = targetCsv.rows.map((row) => ({
    sequence: row[sequenceIndex]?.trim() ?? "",
    geneName: geneNameIndex >= 0 ? row[geneNameIndex]?.trim() ?? "" : "",
  }));

  if (ligands.length === 0 || targets.length === 0) {
    return NextResponse.json(
      { error: "CSV 데이터 행이 비어 있습니다." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const candidateHashes: string[] = [];
  const pairs: Array<{
    smiles: string;
    sequence: string;
    ligand_name: string | null;
    gene_name: string | null;
    input_hash: string | null;
    warnings: string[];
  }> = [];

  for (const ligand of ligands) {
    for (const target of targets) {
      const smiles = ligand.smiles;
      const sequence = target.sequence;
      const ligand_name = ligand.ligandName.trim() || null;
      const gene_name = target.geneName.trim() || null;
      const warnings: string[] = [];

      if (!smiles.trim()) {
        warnings.push(WARNING_INVALID_SMILES);
      }

      if (!sequence.trim()) {
        warnings.push(WARNING_SEQUENCE_MISSING);
      } else if (sequence.length > 1280) {
        warnings.push(WARNING_SEQUENCE_TOO_LONG);
      }

      const input_hash =
        smiles.trim() && sequence.trim()
          ? sha256Hex(`${smiles}|${sequence}|${modelVersion}`)
          : null;

      if (!warnings.length && input_hash) {
        candidateHashes.push(input_hash);
      }

      pairs.push({
        smiles,
        sequence,
        ligand_name,
        gene_name,
        input_hash,
        warnings,
      });
    }
  }

  const uniqueHashes = Array.from(new Set(candidateHashes));
  const doneByHash = new Map<string, DoneRun>();

  if (uniqueHashes.length > 0) {
    for (const batch of chunk(uniqueHashes, 200)) {
      const { data, error } = await supabase
        .from("runs")
        .select("input_hash, affinity_value, affinity_prob")
        .eq("status", "done")
        .in("input_hash", batch);

      if (error) {
        return NextResponse.json(
          { error: "중복 검사에 실패했습니다." },
          { status: 500 }
        );
      }

      (data ?? []).forEach((row) => {
        if (row.input_hash) {
          doneByHash.set(row.input_hash, row as DoneRun);
        }
      });
    }
  }

  const rowsToInsert = pairs.map((pair) => {
    const hasWarnings = pair.warnings.length > 0;
    const prior = pair.input_hash ? doneByHash.get(pair.input_hash) : undefined;

    if (!hasWarnings && prior) {
      return {
        id: crypto.randomUUID(),
        user_id: userData.user.id,
        status: "done",
        memo,
        created_at: now,
        smiles: pair.smiles,
        smiles_canon: null,
        sequence: pair.sequence,
        ligand_name: pair.ligand_name,
        gene_name: pair.gene_name,
        affinity_value: prior.affinity_value,
        affinity_prob: prior.affinity_prob,
        input_hash: pair.input_hash,
        warnings: [WARNING_PREVIOUS_RESULT],
        model_version: modelVersion,
      };
    }

    return {
      id: crypto.randomUUID(),
      user_id: userData.user.id,
      status: hasWarnings ? "failed" : "queued",
      memo,
      created_at: now,
      smiles: pair.smiles,
      smiles_canon: null,
      sequence: pair.sequence,
      ligand_name: pair.ligand_name,
      gene_name: pair.gene_name,
      affinity_value: null,
      affinity_prob: null,
      input_hash: pair.input_hash,
      warnings: pair.warnings.length ? pair.warnings : null,
      model_version: modelVersion,
    };
  });

  const { error: insertError } = await supabase
    .from("runs")
    .insert(rowsToInsert);

  if (insertError) {
    return NextResponse.json(
      { error: "runs 저장에 실패했습니다." },
      { status: 500 }
    );
  }

  const summary = rowsToInsert.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.status === "queued") acc.queued += 1;
      if (row.status === "done") acc.done += 1;
      if (row.status === "failed") acc.failed += 1;
      return acc;
    },
    { total: 0, queued: 0, done: 0, failed: 0 }
  );

  return NextResponse.json({ summary });
}
