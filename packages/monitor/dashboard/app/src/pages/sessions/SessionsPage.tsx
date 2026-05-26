import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useUiStore } from '@/shared/store/uiStore';
import { SessionReplay } from './components/SessionReplay';
import { DeviceSwitcher } from './components/DeviceSwitcher';
import styles from './SessionsPage.module.css';

/**
 * Sessions page. Serves both `/sessions` (list + auto-selected detail) and
 * `/sessions/:id` (deep-link to a specific session). The route param seeds the
 * selected session one-way (URL → store); the replay panel then drives its own
 * master/detail off that selection.
 */
export function SessionsPage() {
  const { id } = useParams<{ id?: string }>();
  const setSelectedSession = useUiStore((s) => s.setSelectedSession);

  useEffect(() => {
    if (id) setSelectedSession(id);
  }, [id, setSelectedSession]);

  return (
    <div className={styles.page}>
      <SessionReplay />
      <DeviceSwitcher />
    </div>
  );
}
