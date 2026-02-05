"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient, isSupabaseConfigured } from "@/lib/supabase/browser";
import styles from "./callback.module.css";

const isInviteDenied = (message: string) => {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("not allowed") ||
    lowered.includes("signup") ||
    lowered.includes("signups") ||
    lowered.includes("invite") ||
    lowered.includes("invitation")
  );
};

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      if (!isSupabaseConfigured) {
        router.replace("/login?reason=auth_error");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const rawError = params.get("error") ?? params.get("error_description");
      if (rawError) {
        const decoded = decodeURIComponent(rawError.replace(/\+/g, " "));
        router.replace(
          isInviteDenied(decoded) ? "/login?reason=not_invited" : "/login?reason=auth_error"
        );
        return;
      }

      const supabase = createBrowserClient();
      const code = params.get("code");
      if (!code) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.replace("/app");
        } else {
          router.replace("/login?reason=auth_error");
        }
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        router.replace(
          isInviteDenied(error.message)
            ? "/login?reason=not_invited"
            : "/login?reason=auth_error"
        );
        return;
      }

      router.replace("/app");
    };

    run();
  }, [router]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.spinner} />
        <h1 className={styles.title}>Signing you in...</h1>
        <p className={styles.subtitle}>Please wait.</p>
      </div>
    </div>
  );
}

