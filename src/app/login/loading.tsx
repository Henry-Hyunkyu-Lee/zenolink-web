import styles from "./login.module.css";

export default function Loading() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.spinner} />
        <h1 className={styles.loadingTitle}>Checking session...</h1>
        <p className={styles.loadingSubtitle}>Please wait.</p>
      </div>
    </div>
  );
}
