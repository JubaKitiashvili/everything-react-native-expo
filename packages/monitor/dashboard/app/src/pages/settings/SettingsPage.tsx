import { Onboarding } from './components/Onboarding';
import { Settings } from './components/Settings';
import { ConsentPrivacy } from './components/ConsentPrivacy';
import { ReplayMasker } from './components/ReplayMasker';
import { UserManagement } from './components/UserManagement';
import { RequireRole } from '@/shared/auth/RequireRole';
import styles from './SettingsPage.module.css';

/**
 * Settings page at `/settings`. Stacks the workspace configuration panels:
 * an onboarding welcome banner, core settings, consent/privacy controls, the
 * replay masker, and (Owner only) user administration. No detail route —
 * every panel drives its own state.
 */
export function SettingsPage() {
  return (
    <div className={styles.page}>
      <Onboarding />
      <Settings />
      <ConsentPrivacy />
      <ReplayMasker />
      <RequireRole role="owner">
        <UserManagement />
      </RequireRole>
    </div>
  );
}
