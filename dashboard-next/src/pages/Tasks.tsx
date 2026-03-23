import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card } from '../components/Card';
import type { WorkerState, LocalTask } from '../types';

interface TasksProps {
  workerState: WorkerState | null;
}

interface KanbanTask {
  id: string;
  title: string;
  source: string;
  status: 'queue' | 'in_progress' | 'in_review' | 'done';
  description?: string;
  agent?: string;
  step?: string;
  prUrl?: string | null;
  confidence?: number;
  isLocal?: boolean;
}

const columns = [
  { key: 'queue' as const, label: 'Queue', color: 'border-text-muted' },
  { key: 'in_progress' as const, label: 'In Progress', color: 'border-accent-blue' },
  { key: 'in_review' as const, label: 'In Review', color: 'border-accent-amber' },
  { key: 'done' as const, label: 'Done', color: 'border-accent-green' },
];

export function Tasks({ workerState }: TasksProps) {
  const [localTasks, setLocalTasks] = useState<LocalTask[]>([]);
  const [showForm, setShowForm] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        setLocalTasks(data.tasks ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const allTasks = useMemo(() => {
    const workerDerived = deriveTasksFromWorker(workerState);
    const local: KanbanTask[] = localTasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      source: t.source,
      status: t.status,
      prUrl: t.prUrl,
      isLocal: true,
    }));
    return [...local, ...workerDerived];
  }, [workerState, localTasks]);

  const grouped = useMemo(() => {
    const map: Record<string, KanbanTask[]> = {
      queue: [],
      in_progress: [],
      in_review: [],
      done: [],
    };
    for (const task of allTasks) {
      (map[task.status] ?? map.queue).push(task);
    }
    return map;
  }, [allTasks]);

  const handleCreateTask = async (title: string, description: string, photos?: string[]) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, photos: photos ?? [] }),
      });
      if (!res.ok) return; // Keep form open on failure
      setShowForm(false);
      fetchTasks();
    } catch {
      // Server unreachable — keep form open
    }
  };

  const handleDeleteTask = async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    fetchTasks();
  };

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Tasks</h1>
        <div className="flex items-center gap-2">
          {workerState && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded ${
                workerState.status === 'polling' || workerState.status === 'working'
                  ? 'bg-accent-green/15 text-accent-green'
                  : 'bg-border text-text-muted'
              }`}
            >
              Worker: {workerState.status}
            </span>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-accent-blue/15 text-accent-blue border border-accent-blue/30 px-3 py-1 rounded-md text-[11px] hover:bg-accent-blue/25 transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Task'}
          </button>
        </div>
      </div>

      {/* New Task form */}
      {showForm && <NewTaskForm onSubmit={handleCreateTask} />}

      {/* Task Providers */}
      <TaskProviders workerStatus={workerState?.status} provider={workerState?.provider} />

      {/* Kanban board */}
      <div className="grid grid-cols-4 gap-3 flex-1 min-h-0">
        {columns.map((col) => (
          <div key={col.key} className="flex flex-col min-h-0">
            <div className={`flex items-center gap-2 mb-2 pb-2 border-b-2 ${col.color}`}>
              <span className="text-sm font-medium text-text-primary">{col.label}</span>
              <span className="text-[10px] bg-border text-text-secondary px-1.5 py-0.5 rounded-full">
                {grouped[col.key].length}
              </span>
            </div>
            <div className="space-y-2 overflow-y-auto flex-1">
              {grouped[col.key].length === 0 ? (
                <div className="text-text-muted text-[11px] text-center py-4">No tasks</div>
              ) : (
                grouped[col.key].map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onDelete={task.isLocal ? () => handleDeleteTask(task.id) : undefined}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewTaskForm({
  onSubmit,
}: {
  onSubmit: (title: string, desc: string, photos?: string[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/tasks/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setPhotos((prev) => [...prev, data.filename]);
      }
    } catch {
      // Upload failed
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <Card className="mb-4">
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Task title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue"
          autoFocus
        />
        <textarea
          placeholder="Description (optional)..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue resize-none"
        />
        {/* Photo upload */}
        <div className="flex items-center gap-3">
          <label className="bg-bg-primary border border-border rounded-md px-3 py-1.5 text-sm text-text-secondary hover:border-border-light cursor-pointer transition-colors">
            {uploading ? 'Uploading...' : '+ Photo'}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploading}
            />
          </label>
          {photos.length > 0 && (
            <div className="flex gap-2">
              {photos.map((p) => (
                <img
                  key={p}
                  src={`/api/tasks/uploads/${p}`}
                  alt="Upload"
                  className="w-10 h-10 rounded border border-border object-cover"
                />
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() =>
            title.trim() &&
            onSubmit(title.trim(), description.trim(), photos.length > 0 ? photos : undefined)
          }
          disabled={!title.trim() || uploading}
          className="bg-accent-blue/15 text-accent-blue border border-accent-blue/30 px-4 py-1.5 rounded-md text-sm hover:bg-accent-blue/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Create Task
        </button>
      </div>
    </Card>
  );
}

function TaskCard({ task, onDelete }: { task: KanbanTask; onDelete?: () => void }) {
  return (
    <Card className="!p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-text-primary mb-1 leading-tight flex-1">
          {task.title || 'Untitled'}
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-text-muted hover:text-accent-red text-[11px] transition-colors"
            title="Delete task"
          >
            &times;
          </button>
        )}
      </div>
      {task.description && (
        <div className="text-[11px] text-text-secondary mb-1 line-clamp-2">{task.description}</div>
      )}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="bg-border text-text-secondary px-1.5 py-0.5 rounded">{task.source}</span>
        {task.agent && <span className="text-accent-purple">{task.agent}</span>}
      </div>
      {task.step && task.status === 'in_progress' && (
        <div className="mt-2">
          <PipelineSteps current={task.step} />
        </div>
      )}
      {task.status === 'in_review' && task.prUrl && (
        <a
          href={task.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 bg-accent-blue/15 text-accent-blue border border-accent-blue/30 px-2 py-0.5 rounded text-[10px] hover:bg-accent-blue/25 transition-colors"
        >
          View PR &rarr;
        </a>
      )}
    </Card>
  );
}

const PIPELINE_STEPS = ['validate', 'score', 'route', 'build', 'review', 'test', 'health', 'pr'];

function PipelineSteps({ current }: { current: string }) {
  const currentIdx = PIPELINE_STEPS.indexOf(current);
  return (
    <div className="flex gap-0.5">
      {PIPELINE_STEPS.map((step, i) => (
        <div
          key={step}
          title={step}
          className={`h-1 flex-1 rounded-full ${
            i < currentIdx
              ? 'bg-accent-green'
              : i === currentIdx
                ? 'bg-accent-blue animate-pulse'
                : 'bg-border'
          }`}
        />
      ))}
    </div>
  );
}

function deriveTasksFromWorker(state: WorkerState | null): KanbanTask[] {
  if (!state) return [];
  const tasks: KanbanTask[] = [];

  // Tasks from workerTasks Map (multi-task support)
  if (state.tasks && Array.isArray(state.tasks)) {
    for (const t of state.tasks) {
      tasks.push({
        id: t.ticketId || `wt-${tasks.length}`,
        title: t.title || t.ticketId || 'Worker task',
        source: t.source || state.provider || 'worker',
        status: (t.status as KanbanTask['status']) || 'in_progress',
        agent: t.agent,
        step: t.step,
        prUrl: t.prUrl,
        confidence: t.confidence,
      });
    }
    return tasks;
  }

  // Fallback: single currentTicket
  if (state.currentTicket) {
    const ct = state.currentTicket;
    tasks.push({
      id: ct.ticketId ?? ct.identifier ?? 'current',
      title: ct.title ?? ct.ticketId ?? 'Current task',
      source: ct.source ?? state.provider ?? 'worker',
      status: ct.prUrl ? 'in_review' : 'in_progress',
      agent: ct.agent,
      step: ct.step,
      prUrl: ct.prUrl,
      confidence: ct.confidence,
    });
  }

  return tasks;
}

interface TaskProvider {
  id: string;
  name: string;
  icon: string;
  description: string;
  envVar: string | null;
  configExample: string;
  setupSteps: string[];
}

const TASK_PROVIDERS: TaskProvider[] = [
  {
    id: 'clickup',
    name: 'ClickUp',
    icon: '📋',
    description: 'Project management with tasks, docs, goals',
    envVar: 'CLICKUP_API_KEY',
    configExample: `{
  "provider": {
    "type": "clickup",
    "list_id": "YOUR_LIST_ID",
    "filter": { "status": "ready for dev" }
  },
  "repo": { "path": "." },
  "erne": { "min_confidence": 70 }
}`,
    setupSteps: [
      'Go to ClickUp Settings → Apps → Generate API Token',
      'Export: export CLICKUP_API_KEY=pk_YOUR_TOKEN',
      'Find your List ID from the URL: app.clickup.com/list/LIST_ID',
      'Create worker.json with the config below',
      'Run: npx erne-universal worker --config worker.json --dry-run',
    ],
  },
  {
    id: 'github',
    name: 'GitHub Issues',
    icon: '🐙',
    description: 'Issues and pull requests from GitHub repos',
    envVar: 'GITHUB_TOKEN',
    configExample: `{
  "provider": {
    "type": "github",
    "owner": "your-org",
    "repo": "your-repo",
    "filter": { "labels": "erne-ready" }
  },
  "repo": { "path": "." },
  "erne": { "min_confidence": 70 }
}`,
    setupSteps: [
      'Create a GitHub Personal Access Token (Settings → Developer → Tokens)',
      'Export: export GITHUB_TOKEN=ghp_YOUR_TOKEN',
      'Label issues with "erne-ready" when they\'re ready for worker',
      'Create worker.json with the config below',
      'Run: npx erne-universal worker --config worker.json --dry-run',
    ],
  },
  {
    id: 'linear',
    name: 'Linear',
    icon: '🔷',
    description: 'Issue tracking built for modern teams',
    envVar: 'LINEAR_API_KEY',
    configExample: `{
  "provider": {
    "type": "linear",
    "team_id": "YOUR_TEAM_ID",
    "filter": { "state": "Ready for Dev" }
  },
  "repo": { "path": "." },
  "erne": { "min_confidence": 70 }
}`,
    setupSteps: [
      'Go to Linear Settings → API → Personal API Keys → Create Key',
      'Export: export LINEAR_API_KEY=lin_api_YOUR_KEY',
      'Find your Team ID from Linear settings',
      'Create worker.json with the config below',
      'Run: npx erne-universal worker --config worker.json --dry-run',
    ],
  },
  {
    id: 'jira',
    name: 'Jira',
    icon: '🔵',
    description: 'Enterprise project management by Atlassian',
    envVar: 'JIRA_API_TOKEN',
    configExample: `{
  "provider": {
    "type": "jira",
    "host": "your-org.atlassian.net",
    "project": "PROJ",
    "filter": { "status": "Ready for Dev" }
  },
  "repo": { "path": "." },
  "erne": { "min_confidence": 70 }
}`,
    setupSteps: [
      'Go to Atlassian Account → Security → API Tokens → Create',
      'Export: export JIRA_EMAIL=you@company.com',
      'Export: export JIRA_API_TOKEN=YOUR_TOKEN',
      'Create worker.json with the config below',
      'Run: npx erne-universal worker --config worker.json --dry-run',
    ],
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    icon: '🦊',
    description: 'Issues and merge requests from GitLab repos',
    envVar: 'GITLAB_TOKEN',
    configExample: `{
  "provider": {
    "type": "gitlab",
    "project_id": "12345",
    "filter": { "labels": "erne-ready" }
  },
  "repo": { "path": "." },
  "erne": { "min_confidence": 70 }
}`,
    setupSteps: [
      'Go to GitLab → User Settings → Access Tokens → Create',
      'Export: export GITLAB_TOKEN=glpat_YOUR_TOKEN',
      'Find Project ID from Settings → General',
      'Create worker.json with the config below',
      'Run: npx erne-universal worker --config worker.json --dry-run',
    ],
  },
  {
    id: 'local',
    name: 'Local JSON',
    icon: '📁',
    description: 'Local file-based task queue for testing',
    envVar: null,
    configExample: `{
  "provider": {
    "type": "local",
    "file": "./worker-tasks.json"
  },
  "repo": { "path": "." },
  "erne": { "min_confidence": 50 }
}`,
    setupSteps: [
      'Create worker-tasks.json with tickets (see format below)',
      'Create worker.json with the config below',
      'Run: npx erne-universal worker --config worker.json --once',
      'Ticket format: { "tickets": [{ "id": "1", "title": "...", "description": "...", "type": "bug", "status": "ready" }] }',
    ],
  },
];

function TaskProviders({ workerStatus, provider }: { workerStatus?: string; provider?: string }) {
  const isWorkerRunning = workerStatus === 'polling' || workerStatus === 'working';
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const copyConfig = (config: string) => {
    navigator.clipboard.writeText(config).then(() => {
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    });
  };

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-text-muted uppercase tracking-wide">Task Providers</span>
        {isWorkerRunning ? (
          <span className="text-[10px] bg-accent-green/15 text-accent-green px-2 py-0.5 rounded">
            Connected to {provider || 'worker'}
          </span>
        ) : (
          <span className="text-[10px] bg-border text-text-muted px-2 py-0.5 rounded">
            Worker not running — click a provider for setup guide
          </span>
        )}
      </div>
      <div className="grid grid-cols-6 gap-2">
        {TASK_PROVIDERS.map((p) => {
          const isActive = provider === p.id;
          const isExpanded = expandedProvider === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setExpandedProvider(isExpanded ? null : p.id)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all text-center ${
                isActive
                  ? 'border-accent-green/40 bg-accent-green/5'
                  : isExpanded
                    ? 'border-accent-blue/40 bg-accent-blue/5'
                    : 'border-border hover:border-border-light'
              }`}
            >
              <span className="text-xl">{p.icon}</span>
              <span className="text-[11px] text-text-primary font-medium">{p.name}</span>
              <span className="text-[9px] text-text-muted leading-tight">{p.description}</span>
              {isActive && (
                <span className="text-[8px] text-accent-green uppercase tracking-wide">Active</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Expanded Setup Guide */}
      {expandedProvider &&
        (() => {
          const p = TASK_PROVIDERS.find((t) => t.id === expandedProvider);
          if (!p) return null;
          return (
            <div className="mt-3 p-4 bg-bg-surface border border-border rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary">
                  {p.icon} {p.name} Setup Guide
                </h3>
                <button
                  onClick={() => setExpandedProvider(null)}
                  className="text-text-muted hover:text-text-primary text-xs"
                >
                  Close
                </button>
              </div>

              {/* Steps */}
              <div className="space-y-2 mb-4">
                {p.setupSteps.map((step, i) => (
                  <div key={i} className="flex gap-2 text-[12px]">
                    <span className="text-accent-blue font-mono shrink-0">{i + 1}.</span>
                    <span className="text-text-secondary">
                      {step.includes('export') || step.includes('npx') ? (
                        <code className="bg-bg-hover px-1 py-0.5 rounded text-accent-blue text-[11px]">
                          {step}
                        </code>
                      ) : (
                        step
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* Config Example */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-text-muted uppercase tracking-wide">
                    worker.json
                  </span>
                  <button
                    onClick={() => copyConfig(p.configExample)}
                    className="text-[10px] text-accent-blue hover:text-accent-blue/80"
                  >
                    {copiedConfig ? 'Copied!' : 'Copy config'}
                  </button>
                </div>
                <pre className="bg-bg-primary border border-border rounded p-3 text-[11px] text-text-secondary font-mono overflow-x-auto">
                  {p.configExample}
                </pre>
              </div>

              {p.envVar && (
                <div className="mt-3 p-2 bg-accent-amber/5 border border-accent-amber/20 rounded text-[11px] text-accent-amber">
                  Required env var: <code className="font-mono">{p.envVar}</code>
                </div>
              )}
            </div>
          );
        })()}

      <div className="mt-3 flex items-center gap-3 flex-wrap text-[11px] text-text-muted">
        {!isWorkerRunning ? (
          <>
            <span>Start worker:</span>
            <code className="bg-bg-hover px-1.5 py-0.5 rounded text-accent-blue text-[10px]">
              npx erne-universal worker --config worker.json
            </code>
            <span className="text-border-light">|</span>
            <span>Preview:</span>
            <code className="bg-bg-hover px-1.5 py-0.5 rounded text-accent-amber text-[10px]">
              --dry-run
            </code>
            <span className="text-border-light">|</span>
            <span>Single:</span>
            <code className="bg-bg-hover px-1.5 py-0.5 rounded text-accent-purple text-[10px]">
              --once
            </code>
          </>
        ) : (
          <span className="text-accent-green">Worker active — polling {provider} for tickets</span>
        )}
      </div>
    </Card>
  );
}
