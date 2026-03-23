import { useState } from 'react';

const CMDS = [
  {
    cmd: '/erne-plan',
    desc: 'Design feature architecture',
    icon: '🏗️',
    ex: '/erne-plan "Add user profile screen"',
  },
  {
    cmd: '/erne-code',
    desc: 'Implement features',
    icon: '💻',
    ex: '/erne-code "Build login form with validation"',
  },
  { cmd: '/erne-code-review', desc: 'Code review', icon: '🔍', ex: '/erne-code-review' },
  {
    cmd: '/erne-tdd',
    desc: 'Test-driven development',
    icon: '🧪',
    ex: '/erne-tdd "Test UserCard component"',
  },
  {
    cmd: '/erne-build-fix',
    desc: 'Fix build failures',
    icon: '🔧',
    ex: '/erne-build-fix "Pod install failing"',
  },
  {
    cmd: '/erne-perf',
    desc: 'Performance optimization',
    icon: '⚡',
    ex: '/erne-perf "FlatList is laggy"',
  },
  {
    cmd: '/erne-debug',
    desc: 'Bug diagnosis',
    icon: '🐛',
    ex: '/erne-debug "App crashes on login"',
  },
  {
    cmd: '/erne-debug-visual',
    desc: 'Visual debugging',
    icon: '📸',
    ex: '/erne-debug-visual + screenshot',
  },
  {
    cmd: '/erne-upgrade',
    desc: 'Version migration',
    icon: '📦',
    ex: '/erne-upgrade "Expo SDK 52"',
  },
  {
    cmd: '/erne-component',
    desc: 'UI components',
    icon: '🎨',
    ex: '/erne-component "Bottom sheet modal"',
  },
  { cmd: '/erne-deploy', desc: 'App submission', icon: '🚀', ex: '/erne-deploy' },
  { cmd: '/erne-quality-gate', desc: 'Pre-merge checks', icon: '✅', ex: '/erne-quality-gate' },
  {
    cmd: '/erne-worker',
    desc: 'Autonomous tickets',
    icon: '🤖',
    ex: '/erne-worker --config worker.json',
  },
  {
    cmd: '/erne-navigate',
    desc: 'Navigation design',
    icon: '🗺️',
    ex: '/erne-navigate "Tab + stack layout"',
  },
  {
    cmd: '/erne-animate',
    desc: 'Animations',
    icon: '✨',
    ex: '/erne-animate "Card flip transition"',
  },
  {
    cmd: '/erne-feature',
    desc: 'Feature unit',
    icon: '🧩',
    ex: '/erne-feature "Push notifications"',
  },
  {
    cmd: '/erne-native-module',
    desc: 'Native modules',
    icon: '🔌',
    ex: '/erne-native-module "Bluetooth"',
  },
  { cmd: '/erne-orchestrate', desc: 'Multi-agent pipeline', icon: '🎯', ex: '/erne-orchestrate' },
  { cmd: '/erne-learn', desc: 'Pattern extraction', icon: '🧠', ex: '/erne-learn' },
  { cmd: '/erne-retrospective', desc: 'Session review', icon: '📊', ex: '/erne-retrospective' },
];

export function Commands() {
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? CMDS.filter(
        (c) => c.cmd.includes(filter) || c.desc.toLowerCase().includes(filter.toLowerCase()),
      )
    : CMDS;

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div className="p-6 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Commands</h1>
          <div className="text-[11px] text-text-muted mt-1">
            Run these in Claude Code. Click to copy the example.
          </div>
        </div>
        <input
          type="text"
          placeholder="Filter commands..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue w-48"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {filtered.map((c) => (
          <button
            key={c.cmd}
            onClick={() => copy(c.ex, c.cmd)}
            className="flex items-start gap-4 p-4 bg-bg-surface border border-border rounded-lg hover:border-border-light transition-colors text-left group"
          >
            <span className="text-2xl mt-0.5 shrink-0">{c.icon}</span>
            <div className="flex-1 min-w-0">
              <code className="text-sm text-accent-blue font-mono font-semibold">{c.cmd}</code>
              <div className="text-[11px] text-text-secondary mt-1">{c.desc}</div>
              <div className="text-[10px] text-text-muted mt-2 font-mono bg-bg-primary px-2 py-1 rounded truncate">
                {c.ex}
              </div>
            </div>
            <span
              className={`text-[10px] shrink-0 mt-1 transition-colors ${copied === c.cmd ? 'text-accent-green' : 'text-text-muted opacity-0 group-hover:opacity-100'}`}
            >
              {copied === c.cmd ? 'Copied!' : 'Copy'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
