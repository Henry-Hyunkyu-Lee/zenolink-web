"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./app.module.css";
import { createBrowserClient, isSupabaseConfigured } from "@/lib/supabase/browser";

type RunRow = {
  id: string;
  status: string | null;
  memo: string | null;
  created_at: string | null;
  warnings: string[] | null;
  affinity_value: number | null;
  affinity_prob: number | null;
  ligand_name: string | null;
  gene_name: string | null;
};

export default function AppPage() {
  const [memo, setMemo] = useState("");
  const [ligandFileName, setLigandFileName] = useState<string | null>(null);
  const [targetFileName, setTargetFileName] = useState<string | null>(null);
  const [ligandFile, setLigandFile] = useState<File | null>(null);
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSummary, setSubmitSummary] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  const [sortKey, setSortKey] = useState("created_at_desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  const supabase = useMemo(() => {
    if (!isSupabaseConfigured) {
      return null;
    }
    return createBrowserClient();
  }, []);

  const loadRuns = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setIsLoadingRuns(true);
    setRunsError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    setIsAuthed(Boolean(session));
    setUserEmail(session?.user?.email ?? null);

    if (!session) {
      setRuns([]);
      setIsLoadingRuns(false);
      setAuthChecked(true);
      router.replace("/login");
      return;
    }

    let query = supabase
      .from("runs")
      .select(
        "id,status,memo,created_at,warnings,affinity_value,affinity_prob,ligand_name,gene_name",
        {
          count: "exact",
        }
      );

    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      const escaped = trimmedQuery.replace(/%/g, "\\%").replace(/,/g, "\\,");
      query = query.or(
        `memo.ilike.%${escaped}%,ligand_name.ilike.%${escaped}%,gene_name.ilike.%${escaped}%,smiles.eq.${escaped},sequence.eq.${escaped}`
      );
    }

    switch (sortKey) {
      case "created_at_asc":
        query = query.order("created_at", { ascending: true });
        break;
      case "status_asc":
        query = query.order("status", { ascending: true });
        break;
      case "status_desc":
        query = query.order("status", { ascending: false });
        break;
      case "affinity_value_desc":
        query = query.order("affinity_value", {
          ascending: false,
          nullsFirst: false,
        });
        break;
      case "affinity_value_asc":
        query = query.order("affinity_value", {
          ascending: true,
          nullsFirst: true,
        });
        break;
      case "affinity_prob_desc":
        query = query.order("affinity_prob", {
          ascending: false,
          nullsFirst: false,
        });
        break;
      case "affinity_prob_asc":
        query = query.order("affinity_prob", {
          ascending: true,
          nullsFirst: true,
        });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }

    const from = pageIndex * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) {
      setRunsError(error.message);
      setRuns([]);
      setTotalCount(0);
    } else {
      setRuns(data ?? []);
      setTotalCount(count ?? 0);
    }

    setIsLoadingRuns(false);
    setAuthChecked(true);
  }, [supabase, router, searchQuery, sortKey, pageIndex]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isActive = true;

    loadRuns();

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      if (isActive) {
        loadRuns();
      }
    });

    return () => {
      isActive = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase, loadRuns]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthChecked(true);
    }
  }, []);

  const handleSubmit = async () => {
    if (!supabase) {
      setSubmitError("Supabase 설정이 필요합니다.");
      return;
    }

    if (!ligandFile || !targetFile) {
      setSubmitError("리간드/타겟 CSV 파일이 필요합니다.");
      return;
    }

    setSubmitError(null);
    setSubmitSummary(null);
    setIsSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      setSubmitError("로그인이 필요합니다.");
      setIsSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.append("ligand_csv", ligandFile);
    formData.append("target_csv", targetFile);
    formData.append("memo", memo);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        setSubmitError(payload.error ?? "요청에 실패했습니다.");
      } else if (payload.summary) {
        const { total, queued, done, failed } = payload.summary;
        setSubmitSummary(
          `총 ${total}건 생성 (queued ${queued}, done ${done}, failed ${failed})`
        );
        await loadRuns();
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "요청에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatAffinityValue = (value: number | null) => {
    if (value == null || Number.isNaN(value)) {
      return "-";
    }
    return value.toFixed(4);
  };

  const formatAffinityProb = (value: number | null) => {
    if (value == null || Number.isNaN(value)) {
      return "-";
    }
    return `${(value * 100).toFixed(2)}%`;
  };

  const formatLocalTime = (value: string | null) => {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleString();
  };

  const formatName = (value: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : "-";
  };


  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCount / pageSize));
  }, [totalCount, pageSize]);

  useEffect(() => {
    if (pageIndex > totalPages - 1) {
      setPageIndex(Math.max(0, totalPages - 1));
    }
  }, [pageIndex, totalPages]);

  const statusClass = (status: string | null) => {
    if (!status) return styles.statusNeutral;
    switch (status) {
      case "queued":
        return styles.statusQueued;
      case "running":
        return styles.statusRunning;
      case "done":
        return styles.statusDone;
      case "failed":
        return styles.statusFailed;
      default:
        return styles.statusNeutral;
    }
  };

  const handleLogout = async () => {
    if (!supabase) {
      setShowLogoutConfirm(false);
      return;
    }
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setIsLoggingOut(false);
      setShowLogoutConfirm(false);
      router.replace("/login");
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className={styles.page}>
        <section className={styles.panel}>
          <h1>Supabase 설정이 필요합니다.</h1>
          <p className={styles.subtitle}>
            NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY를
            확인해주세요.
          </p>
        </section>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div className={styles.page}>
        <section className={styles.panel}>
          <p className={styles.subtitle}>세션 확인 중...</p>
        </section>
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className={styles.page}>
        <section className={styles.panel}>
          <p className={styles.subtitle}>
            로그인이 필요합니다. 로그인 페이지로 이동 중입니다.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Zenolink V2</p>
          <h1>Runs</h1>
          <p className={styles.subtitle}>
            CSV를 업로드하고 affinity 예측을 실행하세요.
          </p>
        </div>
        <div className={styles.actions}>
          {isAuthed && userEmail && (
            <span className={styles.userEmail}>{userEmail}</span>
          )}
          <button
            className={styles.logoutButton}
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
          >
            로그아웃
          </button>
        </div>
      </header>

      <section className={styles.panel}>
        <form className={styles.form}>
          <label className={styles.label}>
            리간드 CSV (smiles)
            <input
              className={styles.fileInput}
              type="file"
              accept=".csv"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setLigandFile(file);
                setLigandFileName(file?.name ?? null);
              }}
            />
          </label>

          {ligandFileName && <p className={styles.fileName}>{ligandFileName}</p>}

          <label className={styles.label}>
            타겟 CSV (sequence)
            <input
              className={styles.fileInput}
              type="file"
              accept=".csv"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setTargetFile(file);
                setTargetFileName(file?.name ?? null);
              }}
            />
          </label>

          {targetFileName && <p className={styles.fileName}>{targetFileName}</p>}

          <label className={styles.label}>
            Memo
            <textarea
              className={styles.textarea}
              rows={4}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="실행 메모를 입력하세요."
            />
          </label>

          <button
            className={styles.runButton}
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "처리 중..." : "실행"}
          </button>

          {submitSummary && <p className={styles.summary}>{submitSummary}</p>}
          {submitError && <p className={styles.error}>{submitError}</p>}

          <div className={styles.hint}>
            <p>리간드 CSV: `smiles` 필수, `name` 컬럼 optional</p>
            <p>타겟 CSV: `sequence` 필수, `name` 컬럼 optional</p>
            <p>sequence 길이 제한: 1280</p>
            <p>리간드 × 타겟 모든 조합으로 runs 생성</p>
          </div>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Runs 목록</h2>
          <div className={styles.panelActions}>
            <div className={styles.searchGroup}>
              <input
                className={styles.searchInput}
                type="search"
                placeholder="ligand/gene/memo 검색"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPageIndex(0);
                }}
              />
              {searchQuery && (
                <button
                  className={styles.clearButton}
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setPageIndex(0);
                  }}
                >
                  지우기
                </button>
              )}
            </div>
            <button
              className={styles.refreshButton}
              type="button"
              onClick={loadRuns}
              disabled={isLoadingRuns}
            >
              {isLoadingRuns ? "로딩 중" : "새로고침"}
            </button>
            {isLoadingRuns && <span className={styles.badge}>로딩 중</span>}
          </div>
        </div>

        {runsError && <p className={styles.error}>{runsError}</p>}

        {!runsError && runs.length === 0 && (
          <p className={styles.empty}>표시할 runs가 없습니다.</p>
        )}

        {runs.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>
                    <button
                      className={styles.sortButton}
                      type="button"
                      onClick={() =>
                        setSortKey((prev) => {
                          setPageIndex(0);
                          return prev === "status_desc"
                            ? "status_asc"
                            : "status_desc";
                        })
                      }
                    >
                      Status
                      <span className={styles.sortIndicator}>
                        {sortKey.startsWith("status")
                          ? sortKey.endsWith("asc")
                            ? "▲"
                            : "▼"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                  <th>Ligand</th>
                  <th>Gene</th>
                  <th>Memo</th>
                  <th>User</th>
                  <th>
                    <button
                      className={styles.sortButton}
                      type="button"
                      onClick={() =>
                        setSortKey((prev) => {
                          setPageIndex(0);
                          return prev === "created_at_desc"
                            ? "created_at_asc"
                            : "created_at_desc";
                        })
                      }
                    >
                      Created
                      <span className={styles.sortIndicator}>
                        {sortKey.startsWith("created_at")
                          ? sortKey.endsWith("asc")
                            ? "▲"
                            : "▼"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                  <th>
                    <button
                      className={styles.sortButton}
                      type="button"
                      onClick={() =>
                        setSortKey((prev) => {
                          setPageIndex(0);
                          return prev === "affinity_value_desc"
                            ? "affinity_value_asc"
                            : "affinity_value_desc";
                        })
                      }
                    >
                      Affinity Value
                      <span className={styles.sortIndicator}>
                        {sortKey.startsWith("affinity_value")
                          ? sortKey.endsWith("asc")
                            ? "▲"
                            : "▼"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                  <th>
                    <button
                      className={styles.sortButton}
                      type="button"
                      onClick={() =>
                        setSortKey((prev) => {
                          setPageIndex(0);
                          return prev === "affinity_prob_desc"
                            ? "affinity_prob_asc"
                            : "affinity_prob_desc";
                        })
                      }
                    >
                      Affinity Prob
                      <span className={styles.sortIndicator}>
                        {sortKey.startsWith("affinity_prob")
                          ? sortKey.endsWith("asc")
                            ? "▲"
                            : "▼"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                  <th>Warnings</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <span className={`${styles.statusBadge} ${statusClass(run.status)}`}>
                        {run.status ?? "-"}
                      </span>
                    </td>
                    <td className={styles.mono}>
                      {formatName(run.ligand_name)}
                    </td>
                    <td className={styles.mono}>
                      {formatName(run.gene_name)}
                    </td>
                    <td>{run.memo ?? "-"}</td>
                    <td className={styles.mono}>{userEmail ?? "-"}</td>
                    <td className={styles.mono}>
                      {formatLocalTime(run.created_at)}
                    </td>
                    <td className={styles.mono}>
                      {formatAffinityValue(run.affinity_value)}
                    </td>
                    <td className={styles.mono}>
                      {formatAffinityProb(run.affinity_prob)}
                    </td>
                    <td>
                      {Array.isArray(run.warnings)
                        ? run.warnings.join(", ")
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.pagination}>
          <span className={styles.pageMeta}>
            총 {totalCount}건 · {pageIndex + 1} / {totalPages}
          </span>
          <div className={styles.pageButtons}>
            <button
              className={styles.pageButton}
              type="button"
              onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
              disabled={pageIndex === 0}
            >
              이전
            </button>
            <button
              className={styles.pageButton}
              type="button"
              onClick={() =>
                setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))
              }
              disabled={pageIndex + 1 >= totalPages}
            >
              다음
            </button>
          </div>
        </div>
      </section>

      {showLogoutConfirm && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            if (!isLoggingOut) {
              setShowLogoutConfirm(false);
            }
          }}
        >
          <div
            className={styles.modal}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>로그아웃할까요?</h3>
            <p className={styles.modalBody}>
              로그아웃하면 다시 로그인해야 합니다.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.modalCancel}
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                disabled={isLoggingOut}
              >
                취소
              </button>
              <button
                className={styles.modalConfirm}
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
