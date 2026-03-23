import { NavLink } from 'react-router';

interface SidebarProps {
  issueCount: number;
  taskCount: number;
  activeAgents: number;
}

interface NavItem {
  to: string;
  label: string;
  badge?: number;
  badgeColor?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export function Sidebar({ issueCount, taskCount, activeAgents }: SidebarProps) {
  const groups: NavGroup[] = [
    {
      title: 'Monitor',
      items: [
        { to: '/', label: 'Command Center' },
        { to: '/issues', label: 'Issues', badge: issueCount, badgeColor: 'text-accent-amber' },
        { to: '/insights', label: 'Insights' },
      ],
    },
    {
      title: 'Work',
      items: [
        { to: '/tasks', label: 'Tasks', badge: taskCount, badgeColor: 'text-accent-blue' },
        { to: '/agents', label: 'Agents', badge: activeAgents, badgeColor: 'text-accent-green' },
      ],
    },
    {
      title: 'Project',
      items: [{ to: '/project', label: 'Project' }],
    },
    {
      title: 'Config',
      items: [
        { to: '/settings', label: 'Settings' },
        { to: '/commands', label: 'Commands' },
      ],
    },
  ];

  return (
    <aside className="w-[200px] min-w-[200px] bg-bg-surface/50 border-r border-border flex flex-col">
      <nav className="flex-1 py-4">
        {groups.map((group) => (
          <div key={group.title} className="mb-5">
            <div className="px-5 py-1 text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold">
              {group.title}
            </div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-between mx-2 px-3 py-2 rounded-xl text-[13px] transition-all duration-150 ${
                    isActive
                      ? 'bg-accent-blue/15 text-accent-blue font-medium'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                  }`
                }
              >
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`text-[11px] tabular-nums ${item.badgeColor ?? 'text-text-muted'}`}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="p-5 border-t border-border text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-green shadow-[0_0_6px_rgba(48,209,88,0.4)]" />
          <span>
            {activeAgents} agent{activeAgents !== 1 ? 's' : ''} active
          </span>
        </div>
      </div>
    </aside>
  );
}
