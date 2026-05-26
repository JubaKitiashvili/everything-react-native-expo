import { Onboarding } from './components/Onboarding';
import { Settings } from './components/Settings';
import { ConsentPrivacy } from './components/ConsentPrivacy';
import { ReplayMasker } from './components/ReplayMasker';
import styles from './SettingsPage.module.css';

/**
 * Settings page at `/settings`. Stacks the workspace configuration panels:
 * an onboarding welcome banner, core settings, consent/privacy controls, and
 * the replay masker. No detail route — every panel drives its own state.
 */
export function SettingsPage() {
  return (
    <div className={styles.page}>
      <Onboarding />
      <Settings />
      <ConsentPrivacy />
      <ReplayMasker />
    </div>
  );
}
