"use client";

import { useState } from "react";
import styles from "./login.module.css";
import { createBrowserClient, isSupabaseConfigured } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!isSupabaseConfigured || isLoading) {
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const supabase = createBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/app`,
        },
      });

      if (authError) {
        setError(authError.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.appName}>
            {process.env.NEXT_PUBLIC_APP_NAME ?? "Zenolink V2"}
          </span>
          <span className={styles.badge}>Private Beta</span>
        </div>
        <h1 className={styles.title}>Invitation Only</h1>
        <p className={styles.subtitle}>
          This service is available to invited users only.
        </p>

        <button
          className={styles.loginButton}
          onClick={handleLogin}
          disabled={!isSupabaseConfigured || isLoading}
        >
          {isLoading ? "연결 중..." : "Google로 로그인"}
        </button>

        {!isSupabaseConfigured && (
          <p className={styles.notice}>
            Supabase 환경 변수가 필요합니다:
            <br />
            NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
          </p>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
