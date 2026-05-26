import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

interface NavItem {
  to: string;
  label: string;
  /** `end` so the index route ("/") only highlights on an exact match. */
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', end: true },
  { to: '/crashes', label: 'Crashes' },
  { to: '/anrs', label: 'ANRs' },
  { to: '/performance', label: 'Performance' },
  { to: '/sessions', label: 'Sessions' },
  { to: '/quality', label: 'Quality' },
  { to: '/settings', label: 'Settings' },
];

export function Sidebar() {
  return (
    <nav className={styles.sidebar} aria-label="Primary navigation">
      <div className={styles.logo}>
        <span className={styles.logoMark}>●</span>
        <span className={styles.logoText}>monitor</span>
      </div>
      <ul className={styles.list}>
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.active}` : styles.link
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
