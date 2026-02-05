"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient, isSupabaseConfigured } from "@/lib/supabase/browser";
import styles from "./callback.module.css";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      if (!isSupabaseConfigured) {
        router.replace("/login");
        return;
      }

      const supabase = createBrowserClient();
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }
      router.replace("/app");
    };

    run();
  }, [router]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.spinner} />
        <h1 className={styles.title}>로그인 처리 중...</h1>
        <p className={styles.subtitle}>잠시만 기다려 주세요.</p>
      </div>
    </div>
  );
}
