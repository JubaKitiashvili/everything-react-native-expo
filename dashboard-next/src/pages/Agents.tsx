import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card } from '../components/Card';
import { StatusDot } from '../components/Badge';
import { PixelArtOffice } from '../components/PixelArtOffice';
import type { AgentMap, HistoryMap, HistoryEntry } from '../types';

interface AgentsProps {
  agents: AgentMap;
  history: HistoryMap;
}

interface AgentConfig {
  name: string;
  room: string;
  displayName: string | null;
  enabled: boolean;
  custom: boolean;
  emoji?: string;
  description?: string;
}

type SortKey = 'name' | 'status' | 'tasks';
type SortDir = 'asc' | 'desc';

export function Agents({ agents, history }: AgentsProps) {
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/config');
      if (res.ok) {
        const data = await res.json();
        setAgentConfigs(data.agents ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const rows = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const configMap = new Map(agentConfigs.map((c) => [c.name, c]));

    return Object.entries(agents)
      .map(([name, agent]) => {
        const entries = history[name] ?? [];
        const tasksToday = entries.filter((e: HistoryEntry) =>
          e.timestamp?.startsWith(today),
        ).length;
        const config = configMap.get(name);
        return {
          name,
          displayName: config?.displayName ?? null,
          status: agent.status,
          task: agent.task,
          room: agent.room,
          tasksToday,
          enabled: config?.enabled !== false,
          custom: config?.custom ?? false,
          emoji: config?.emoji,
        };
      })
      .sort((a, b) => {
        const statusOrder: Record<string, number> = { working: 0, planning: 1, done: 2, idle: 3 };
        let cmp = 0;
        if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortKey === 'status')
          cmp = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
        else if (sortKey === 'tasks') cmp = b.tasksToday - a.tasksToday;
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [agents, history, agentConfigs, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleRename = async (agentName: string, displayName: string) => {
    await fetch(`/api/agents/${agentName}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: displayName || null }),
    });
    setEditingName(null);
    fetchConfigs();
  };

  const handleCreateAgent = async (data: {
    name: string;
    emoji: string;
    vibe: string;
    description: string;
  }) => {
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setShowCreateForm(false);
    fetchConfigs();
  };

  const selectedHistory = selectedAgent ? (history[selectedAgent] ?? []) : [];

  return (
    <div className="p-6 flex gap-4 h-full">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">Agents</h1>
          <div className="flex items-center gap-2">
            <span className="text-text-secondary text-[11px]">{rows.length} total</span>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-accent-purple/15 text-accent-purple border border-accent-purple/30 px-3 py-1 rounded-md text-[11px] hover:bg-accent-purple/25 transition-colors"
            >
              {showCreateForm ? 'Cancel' : '+ New Agent'}
            </button>
          </div>
        </div>

        {showCreateForm && <CreateAgentForm onSubmit={handleCreateAgent} />}

        {/* Pixel-art office */}
        <div className="mb-4 border border-border rounded-lg overflow-hidden bg-bg-surface">
          <PixelArtOffice
            agents={agents}
            onAgentClick={(name) => setSelectedAgent(selectedAgent === name ? null : name)}
          />
        </div>

        {/* Data table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[2fr_1.5fr_1fr_2fr_0.5fr] bg-bg-surface px-4 py-2 border-b border-border text-[10px] text-text-secondary uppercase tracking-wide">
            <SortHeader
              label="Agent"
              sortKey="name"
              current={sortKey}
              dir={sortDir}
              onSort={toggleSort}
            />
            <span>Custom Name</span>
            <SortHeader
              label="Status"
              sortKey="status"
              current={sortKey}
              dir={sortDir}
              onSort={toggleSort}
            />
            <span>Current Task</span>
            <SortHeader
              label="Today"
              sortKey="tasks"
              current={sortKey}
              dir={sortDir}
              onSort={toggleSort}
            />
          </div>
          <div className="divide-y divide-border/50">
            {rows.map((row) => (
              <button
                key={row.name}
                onClick={() => setSelectedAgent(selectedAgent === row.name ? null : row.name)}
                className={`grid grid-cols-[2fr_1.5fr_1fr_2fr_0.5fr] px-4 py-2.5 text-sm cursor-pointer transition-colors w-full text-left ${
                  selectedAgent === row.name ? 'bg-accent-blue/5' : 'hover:bg-bg-hover'
                }`}
              >
                <span
                  className={`flex items-center gap-1.5 ${row.status === 'idle' ? 'text-text-secondary' : 'text-text-primary'}`}
                >
                  {row.emoji && <span>{row.emoji}</span>}
                  {row.name}
                </span>
                <span className="text-text-muted text-[11px]">
                  {editingName === row.name ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleRename(row.name, editValue)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(row.name, editValue);
                        if (e.key === 'Escape') setEditingName(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-bg-primary border border-accent-blue rounded px-1.5 py-0.5 text-[11px] text-text-primary w-24 focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingName(row.name);
                        setEditValue(row.displayName || '');
                      }}
                      className={`cursor-pointer transition-colors px-1.5 py-0.5 rounded ${
                        row.displayName
                          ? 'hover:text-accent-blue'
                          : 'border border-dashed border-border-light text-text-muted hover:border-accent-blue hover:text-accent-blue'
                      }`}
                      title="Click to set custom name"
                    >
                      {row.displayName || '+ Set name'}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <StatusDot status={row.status} />
                  <span
                    className={
                      row.status === 'idle'
                        ? 'text-text-muted text-[11px]'
                        : 'text-text-secondary text-[11px]'
                    }
                  >
                    {row.status}
                  </span>
                </span>
                <span className={row.task ? 'text-text-secondary truncate' : 'text-text-muted'}>
                  {row.task ?? '—'}
                </span>
                <span className="text-text-primary">{row.tasksToday}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedAgent && (
        <div className="w-[280px] min-w-[280px]">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">{selectedAgent}</span>
              <button
                onClick={() => setSelectedAgent(null)}
                className="text-text-muted hover:text-text-primary text-sm"
              >
                &times;
              </button>
            </div>
            <div className="text-[10px] text-text-muted uppercase tracking-wide mb-2">
              Activity History
            </div>
            {selectedHistory.length === 0 ? (
              <div className="text-text-muted text-[11px]">No activity</div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {selectedHistory
                  .slice()
                  .reverse()
                  .slice(0, 20)
                  .map((entry: HistoryEntry, i: number) => (
                    <div key={i} className="text-[11px] flex items-start gap-2">
                      <span className="text-text-muted whitespace-nowrap">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}
                      </span>
                      <div>
                        <span
                          className={
                            entry.type === 'complete'
                              ? 'text-accent-green'
                              : entry.type === 'start'
                                ? 'text-accent-blue'
                                : 'text-text-secondary'
                          }
                        >
                          {entry.type}
                        </span>
                        {entry.task && <span className="text-text-muted ml-1">{entry.task}</span>}
                        {entry.durationMs && (
                          <span className="text-text-muted ml-1">
                            ({Math.round(entry.durationMs / 1000)}s)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function CreateAgentForm({
  onSubmit,
}: {
  onSubmit: (data: {
    name: string;
    emoji: string;
    vibe: string;
    description: string;
    room?: string;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🤖');
  const [vibe, setVibe] = useState('');
  const [description, setDescription] = useState('');
  const [room, setRoom] = useState('development');

  return (
    <Card className="mb-4">
      <div className="text-sm font-semibold mb-3">Create New Agent</div>
      <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
        <label className="text-[11px] text-text-secondary">Name</label>
        <input
          type="text"
          placeholder="e.g. security-auditor"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-bg-primary border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple"
          autoFocus
        />
        <label className="text-[11px] text-text-secondary">Emoji</label>
        <input
          type="text"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          className="bg-bg-primary border border-border rounded-md px-3 py-1.5 text-sm text-text-primary w-16 focus:outline-none focus:border-accent-purple"
        />
        <label className="text-[11px] text-text-secondary">Vibe</label>
        <input
          type="text"
          placeholder="e.g. Vigilant and thorough"
          value={vibe}
          onChange={(e) => setVibe(e.target.value)}
          className="bg-bg-primary border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple"
        />
        <label className="text-[11px] text-text-secondary">Description</label>
        <textarea
          placeholder="What does this agent do?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="bg-bg-primary border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple resize-none"
        />
        <label className="text-[11px] text-text-secondary">Room</label>
        <select
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="bg-bg-primary border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-purple"
        >
          <option value="development">Development</option>
          <option value="review">Code Review</option>
          <option value="testing">Testing</option>
          <option value="conference">Conference</option>
        </select>
      </div>
      <button
        onClick={() =>
          name.trim() &&
          description.trim() &&
          onSubmit({
            name: name.trim(),
            emoji,
            vibe: vibe.trim(),
            description: description.trim(),
            room,
          })
        }
        disabled={!name.trim() || !description.trim()}
        className="mt-3 bg-accent-purple/15 text-accent-purple border border-accent-purple/30 px-4 py-1.5 rounded-md text-sm hover:bg-accent-purple/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Create Agent
      </button>
    </Card>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="text-left flex items-center gap-1 hover:text-text-primary transition-colors"
    >
      {label}
      {current === sortKey && <span className="text-accent-blue">{dir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );
}
