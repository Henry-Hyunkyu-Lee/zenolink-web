import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <p className={styles.kicker}>Zenolink V2</p>
        <h1>Invitation-only affinity runs.</h1>
        <p className={styles.subtitle}>
          로그인 화면으로 이동해 인증을 진행하세요.
        </p>
        <Link className={styles.cta} href="/login">
          로그인으로 이동
        </Link>
      </main>
    </div>
  );
}
