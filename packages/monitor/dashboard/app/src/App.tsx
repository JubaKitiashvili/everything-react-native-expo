import styles from './App.module.css';

export function App() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>●</span>
          <span className={styles.brandName}>@erne/monitor</span>
          <span className={styles.brandVersion}>v0.1.0</span>
        </div>
        <p className={styles.subtitle}>Runtime intelligence dashboard</p>
      </header>
      <main className={styles.main}>
        <div className={styles.placeholder}>
          <h2 className={styles.placeholderTitle}>Scaffold ready</h2>
          <p className={styles.placeholderBody}>
            Vite + React 19 + TypeScript shell is live. Panels land in Task 97+.
          </p>
        </div>
      </main>
    </div>
  );
}
