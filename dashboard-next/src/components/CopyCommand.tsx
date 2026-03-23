import { useState } from 'react';

interface CopyCommandProps {
  title: string;
  detail?: string;
  fix?: string;
}

export function CopyCommand({ title, detail, fix }: CopyCommandProps) {
  const [copied, setCopied] = useState(false);
  const command = generateErneCommand(title, detail, fix);

  const handleCopy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-bg-hover border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] text-text-muted uppercase tracking-wide">
          Run in Claude Code
        </span>
        <button
          onClick={handleCopy}
          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
            copied
              ? 'bg-accent-green/15 text-accent-green'
              : 'bg-bg-surface text-text-secondary hover:text-accent-blue border border-border'
          }`}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <code className="text-[12px] text-accent-blue font-mono block whitespace-pre-wrap break-all">
        {command}
      </code>
    </div>
  );
}

export function generateErneCommand(title: string, detail?: string, fix?: string): string {
  const lower = title.toLowerCase();
  const fixLower = (fix || '').toLowerCase();

  if (fixLower.startsWith('npm ') || fixLower.startsWith('npx ')) {
    return fix!;
  }

  if (lower.includes('exceed') && lower.includes('line')) {
    const files = (detail || '').match(/\S+\.tsx?\b/g) || [];
    if (files.length > 0) {
      return `/erne-code "Refactor ${files[0].split('/').pop()} — extract sub-components to reduce file size"`;
    }
  }

  if (lower.includes('error boundary')) {
    return '/erne-code "Add an ErrorBoundary component wrapping the root navigator with graceful error UI"';
  }

  if (lower.includes('test') && (lower.includes('low') || lower.includes('ratio'))) {
    return '/erne-tdd "Add unit tests for the most critical untested components and hooks"';
  }
  if (lower.includes('e2e')) {
    return '/erne-tdd "Set up Detox E2E testing for critical user flows"';
  }

  if (lower.includes('permission') && lower.includes('missing')) {
    return `/erne-build-fix "Fix missing iOS permission: ${title.split(':').pop()?.trim() || title}"`;
  }
  if (lower.includes('permission') && lower.includes('unused')) {
    return `/erne-build-fix "Remove unused iOS permission: ${title.split(':').pop()?.trim() || title}"`;
  }

  if (lower.includes('dependency count') || lower.includes('dependency')) {
    return '/erne-code-review "Audit dependencies — identify unused or replaceable packages and create removal plan"';
  }

  if (lower.includes('new arch')) {
    return '/erne-upgrade "Check New Architecture compatibility for all native dependencies"';
  }

  if (lower.includes('platform')) {
    return '/erne-code-review "Review platform-specific code and extract to .ios.tsx/.android.tsx files where needed"';
  }

  if (
    lower.includes('security') ||
    lower.includes('secret') ||
    lower.includes('ssl') ||
    lower.includes('hardcoded')
  ) {
    return `/erne-code "Fix security issue: ${title}"`;
  }

  if (lower.includes('performance') || lower.includes('re-render') || lower.includes('bundle')) {
    return `/erne-perf "Optimize: ${title}"`;
  }

  return `/erne-code "${fix || title}"`;
}
