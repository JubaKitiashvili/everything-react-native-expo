import { AlertsConsole } from './components/AlertsConsole';
import { BugReportsInbox } from './components/BugReportsInbox';
import { Frustration } from './components/Frustration';
import { PatternLibrary } from './components/PatternLibrary';
import styles from './QualityPage.module.css';

/**
 * Quality page. Serves `/quality` and stacks the four quality-signal panels:
 * the alerts console, the shake-submitted bug-report inbox, the error-tap
 * frustration view, and the pattern library. Each panel drives its own data
 * and state — the page is purely a layout container with no route params.
 */
export function QualityPage() {
  return (
    <div className={styles.page}>
      <AlertsConsole />
      <BugReportsInbox />
      <Frustration />
      <PatternLibrary />
    </div>
  );
}
