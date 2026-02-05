"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./login.module.css";
import { createBrowserClient, isSupabaseConfigured } from "@/lib/supabase/browser";

type AuthState = "checking" | "anon" | "authed";

export default function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const toastMessage = useMemo(() => {
    const reason = searchParams.get("reason");
    if (reason === "not_invited") return "Invited users only";
    if (reason === "auth_error") return "Login failed";
    return null;
  }, [searchParams]);

  useEffect(() => {
    if (toastMessage) {
      setToast(toastMessage);
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.delete("reason");
      const next = params.toString();
      router.replace(next ? `/login?${next}` : "/login");
    }
  }, [toastMessage, searchParams, router]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthState("anon");
      return;
    }

    const supabase = createBrowserClient();
    let isActive = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isActive) return;
      if (data.session) {
        setAuthState("authed");
        router.replace("/app");
      } else {
        setAuthState("anon");
      }
    };

    checkSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isActive) return;
        if (session) {
          setAuthState("authed");
          router.replace("/app");
        } else {
          setAuthState("anon");
        }
      }
    );

    return () => {
      isActive = false;
      subscription.subscription.unsubscribe();
    };
  }, [router]);

  const handleLogin = async () => {
    if (!isSupabaseConfigured || isLoading || authState !== "anon") {
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const supabase = createBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError(authError.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const content = authState !== "anon" ? (
    <div className={styles.card}>
      <div className={styles.spinner} />
      <h1 className={styles.loadingTitle}>Checking session...</h1>
      <p className={styles.loadingSubtitle}>Please wait.</p>
    </div>
  ) : (
    <div className={styles.card}>
      <div className={styles.brand}>
        <span className={styles.appName}>
          {process.env.NEXT_PUBLIC_APP_NAME ?? "Zenolink V2"}
        </span>
        <span className={styles.badge}>Private Beta</span>
      </div>
      <h1 className={styles.title}>Invitation Only</h1>
      <p className={`${styles.subtitle} ${styles.warning}`}>
        This service is available to invited users only.
      </p>

      <button
        className={styles.loginButton}
        onClick={handleLogin}
        disabled={!isSupabaseConfigured || isLoading}
      >
        {isLoading ? "Logging in..." : "Continue with Google"}
      </button>

      {!isSupabaseConfigured && (
        <p className={styles.notice}>
          Supabase env vars are missing.
          <br />
          NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        </p>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );

  return (
    <div className={styles.page}>
      {toast && (
        <div className={styles.toast} role="status" aria-live="polite">
          <span className={styles.toastIcon} aria-hidden="true" />
          <span className={styles.toastMessage}>{toast}</span>
          <button
            className={styles.toastClose}
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      {content}
    </div>
  );
}

