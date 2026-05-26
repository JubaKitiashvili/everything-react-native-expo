import { useParams } from 'react-router-dom';
import { ANRInspector } from './components/ANRInspector';
import styles from './AnrsPage.module.css';

/**
 * ANRs page. Serves both `/anrs` (overview + list) and `/anrs/:id`
 * (deep-link to a specific ANR instance). The route param seeds the
 * inspector's internal selection one-way (URL → panel state); the panel
 * then drives its own overview/detail flow off that selection.
 */
export function AnrsPage() {
  const { id } = useParams<{ id?: string }>();

  return (
    <div className={styles.page}>
      <ANRInspector {...(id ? { selectedInstanceId: id } : {})} />
    </div>
  );
}
