import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useUiStore } from '@/shared/store/uiStore';
import { CrashExplorer } from './components/CrashExplorer';
import { Symbolication } from './components/Symbolication';
import { BreadcrumbTimeline } from './components/BreadcrumbTimeline';
import styles from './CrashesPage.module.css';

/**
 * Crashes page. Serves both `/crashes` (list + auto-selected detail) and
 * `/crashes/:fingerprint` (deep-link to a specific crash group). The route
 * param seeds the selected fingerprint one-way (URL → store); the explorer
 * panel then drives its own master/detail off that selection.
 */
export function CrashesPage() {
  const { fingerprint } = useParams<{ fingerprint?: string }>();
  const setSelected = useUiStore((s) => s.setSelectedCrashFingerprint);

  useEffect(() => {
    if (fingerprint) setSelected(fingerprint);
  }, [fingerprint, setSelected]);

  return (
    <div className={styles.page}>
      <CrashExplorer />
      <Symbolication />
      <BreadcrumbTimeline />
    </div>
  );
}
