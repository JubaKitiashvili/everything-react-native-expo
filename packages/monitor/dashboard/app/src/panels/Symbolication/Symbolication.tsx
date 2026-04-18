import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Panel } from '../../shared/ui/Panel/Panel';
import { Pill } from '../../shared/ui/Pill/Pill';
import { Timestamp } from '../../shared/ui/Timestamp/Timestamp';
import { useApi } from '../../shared/api/useApi';
import { queryKeys } from '../../shared/hooks/queryKeys';
import type { ResolvedFrame, SymbolFileRecord, SymbolPlatform } from '../../shared/api/types';
import type { UploadSymbolFileInput } from '../../shared/api/client';
import { formatBytes, groupSymbolFiles } from './summary';
import styles from './Symbolication.module.css';

export interface SymbolicationProps {
  /** Supply to bypass providers (tests). */
  files?: SymbolFileRecord[];
  now?: number;
  onUpload?: (input: UploadSymbolFileInput) => Promise<SymbolFileRecord | null>;
  onDelete?: (id: string) => Promise<void>;
  onResolve?: (input: {
    platform: SymbolPlatform;
    bundleId: string;
    version: string;
    symbol: string;
    fileId?: string;
  }) => Promise<ResolvedFrame>;
}

export function Symbolication(props: SymbolicationProps = {}) {
  if (props.files !== undefined) {
    return <SymbolicationView {...props} files={props.files} />;
  }
  return <SymbolicationContainer {...props} />;
}

function SymbolicationContainer(props: SymbolicationProps) {
  const api = useApi();
  const queryClient = useQueryClient();

  const filesQuery = useQuery({
    queryKey: queryKeys.symbols.root(),
    queryFn: () => api.fetchSymbolFiles(),
  });

  const uploadMutation = useMutation({
    mutationFn: (input: UploadSymbolFileInput) => api.uploadSymbolFile(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.symbols.root() }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSymbolFile(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.symbols.root() }),
  });

  if (filesQuery.isPending) {
    return (
      <Panel title="Symbolication" description="Upload dSYM / ProGuard maps and resolve frames.">
        <div className={styles.placeholder}>Loading symbols…</div>
      </Panel>
    );
  }
  if (filesQuery.isError) {
    return (
      <Panel title="Symbolication" description="Upload dSYM / ProGuard maps and resolve frames.">
        <div className={styles.error}>Couldn&apos;t load symbol files.</div>
      </Panel>
    );
  }

  return (
    <SymbolicationView
      {...props}
      files={filesQuery.data ?? []}
      onUpload={async (input) => uploadMutation.mutateAsync(input)}
      onDelete={async (id) => {
        await deleteMutation.mutateAsync(id);
      }}
      onResolve={async (input) => api.resolveFrame(input)}
    />
  );
}

interface ViewProps extends Omit<SymbolicationProps, 'files'> {
  files: SymbolFileRecord[];
}

function SymbolicationView({ files, now, onUpload, onDelete, onResolve }: ViewProps) {
  const groups = useMemo(() => groupSymbolFiles(files), [files]);

  return (
    <Panel
      title="Symbolication"
      description="Upload iOS dSYM / Android ProGuard mapping artefacts and preview frame resolution."
    >
      <div className={styles.layout}>
        <UploadForm onUpload={onUpload} />
        <ArtefactHistory
          groups={groups}
          {...(now !== undefined ? { now } : {})}
          {...(onDelete !== undefined ? { onDelete } : {})}
        />
        <ResolvePreview files={files} {...(onResolve !== undefined ? { onResolve } : {})} />
      </div>
    </Panel>
  );
}

// ---------- Upload form ------------------------------------------------------

interface UploadFormProps {
  onUpload?: SymbolicationProps['onUpload'];
}

function UploadForm({ onUpload }: UploadFormProps) {
  const [platform, setPlatform] = useState<SymbolPlatform>('android');
  const [bundleId, setBundleId] = useState('com.example.app');
  const [version, setVersion] = useState('1.0.0');
  const [filename, setFilename] = useState('mapping.txt');
  const [uuid, setUuid] = useState('');
  const [mappingText, setMappingText] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    // Read only text for ProGuard uploads. dSYM bundles are binary and
    // uploaded as metadata-only (no text body) — the dashboard records the
    // UUID and filename so the operator can cross-reference with Xcode.
    if (platform === 'android') {
      const reader = new FileReader();
      reader.onload = () => setMappingText(String(reader.result ?? ''));
      reader.readAsText(file);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onUpload) return;
    setStatus('saving');
    setErrorMessage(null);
    try {
      const input: UploadSymbolFileInput = {
        platform,
        bundleId: bundleId.trim() || 'unknown',
        version: version.trim() || '0.0.0',
        filename: filename.trim() || 'upload',
      };
      if (uuid.trim().length > 0) input.uuid = uuid.trim();
      if (platform === 'android' && mappingText.length > 0) {
        input.mappingText = mappingText;
        input.sizeBytes = mappingText.length;
      }
      await onUpload(input);
      setStatus('done');
      setMappingText('');
      setUuid('');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section aria-label="Upload symbol artefact" className={styles.uploadCell}>
      <h3 className={styles.subhead}>Upload artefact</h3>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span>Platform</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as SymbolPlatform)}
            aria-label="Platform"
          >
            <option value="android">Android (ProGuard)</option>
            <option value="ios">iOS (dSYM)</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Bundle ID</span>
          <input
            type="text"
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
            aria-label="Bundle ID"
          />
        </label>
        <label className={styles.field}>
          <span>Version</span>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            aria-label="Version"
          />
        </label>
        <label className={styles.field}>
          <span>File</span>
          <input type="file" onChange={handleFile} aria-label="Artefact file" />
        </label>
        {platform === 'ios' ? (
          <label className={styles.field}>
            <span>dSYM UUID</span>
            <input
              type="text"
              value={uuid}
              onChange={(e) => setUuid(e.target.value)}
              placeholder="ABCDEF01-2345-6789-ABCD-EF0123456789"
              aria-label="dSYM UUID"
            />
          </label>
        ) : null}
        {platform === 'android' && mappingText.length > 0 ? (
          <p className={styles.hint}>
            Parsed {formatBytes(mappingText.length)} of mapping text — ready to upload.
          </p>
        ) : null}
        {platform === 'ios' ? (
          <p className={styles.hint}>
            dSYM bundles are recorded as metadata only (UUID + filename). The binary stays on your
            machine.
          </p>
        ) : null}
        <button type="submit" className={styles.submit} disabled={status === 'saving'}>
          {status === 'saving' ? 'Uploading…' : 'Upload'}
        </button>
        {status === 'done' ? <p className={styles.success}>Uploaded.</p> : null}
        {status === 'error' && errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
      </form>
    </section>
  );
}

// ---------- History list -----------------------------------------------------

interface HistoryProps {
  groups: ReturnType<typeof groupSymbolFiles>;
  now?: number;
  onDelete?: (id: string) => Promise<void>;
}

function ArtefactHistory({ groups, now, onDelete }: HistoryProps) {
  if (groups.length === 0) {
    return (
      <section aria-label="Artefact history" className={styles.historyCell}>
        <h3 className={styles.subhead}>History</h3>
        <p className={styles.empty}>No symbol artefacts uploaded yet.</p>
      </section>
    );
  }
  return (
    <section aria-label="Artefact history" className={styles.historyCell}>
      <h3 className={styles.subhead}>History</h3>
      <ul className={styles.groupList} aria-label="Symbol artefact groups">
        {groups.map((group) => (
          <li key={group.key} className={styles.group}>
            <header className={styles.groupHeader}>
              <Pill size="sm" severity={group.platform === 'ios' ? 'info' : 'success'}>
                {group.platform.toUpperCase()}
              </Pill>
              <span className={styles.groupBundle}>{group.bundleId}</span>
              <span className={styles.groupVersion}>{group.version}</span>
              <span className={styles.groupMeta}>
                {group.files.length} file{group.files.length === 1 ? '' : 's'} ·{' '}
                {formatBytes(group.totalSizeBytes)}
                {group.totalEntries > 0 ? ` · ${group.totalEntries} entries` : ''}
              </span>
            </header>
            <ul className={styles.fileList}>
              {group.files.map((file) => (
                <li key={file.id} className={styles.file}>
                  <span className={styles.filename}>{file.filename}</span>
                  <span className={styles.fileMeta}>
                    <Timestamp ts={file.uploadedAt} {...(now !== undefined ? { now } : {})} />
                    {' · '}
                    {formatBytes(file.sizeBytes)}
                    {file.uuid ? ` · uuid ${file.uuid.slice(0, 8)}…` : ''}
                  </span>
                  {onDelete ? (
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => {
                        void onDelete(file.id);
                      }}
                      aria-label={`Delete ${file.filename}`}
                    >
                      Delete
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Resolver preview -------------------------------------------------

interface ResolveProps {
  files: SymbolFileRecord[];
  onResolve?: SymbolicationProps['onResolve'];
}

function ResolvePreview({ files, onResolve }: ResolveProps) {
  const [fileId, setFileId] = useState<string>('');
  const [symbol, setSymbol] = useState('a.b.c.e');
  const [result, setResult] = useState<ResolvedFrame | null>(null);
  const [status, setStatus] = useState<'idle' | 'resolving' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedFile = files.find((f) => f.id === fileId) ?? files[0];

  const handleResolve = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onResolve) return;
    if (!selectedFile) return;
    setStatus('resolving');
    setErrorMessage(null);
    try {
      const frame = await onResolve({
        platform: selectedFile.platform,
        bundleId: selectedFile.bundleId,
        version: selectedFile.version,
        symbol,
        fileId: selectedFile.id,
      });
      setResult(frame);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section aria-label="Frame resolver" className={styles.resolveCell}>
      <h3 className={styles.subhead}>Resolve frame</h3>
      {files.length === 0 ? (
        <p className={styles.empty}>Upload an artefact first to resolve frames.</p>
      ) : (
        <form className={styles.form} onSubmit={handleResolve}>
          <label className={styles.field}>
            <span>Artefact</span>
            <select
              value={selectedFile?.id ?? ''}
              onChange={(e) => setFileId(e.target.value)}
              aria-label="Select artefact"
            >
              {files.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.platform} · {file.bundleId} · {file.version} · {file.filename}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Symbol</span>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              aria-label="Symbol input"
            />
          </label>
          <button type="submit" className={styles.submit} disabled={status === 'resolving'}>
            {status === 'resolving' ? 'Resolving…' : 'Resolve'}
          </button>
          {status === 'error' && errorMessage ? (
            <p className={styles.error}>{errorMessage}</p>
          ) : null}
        </form>
      )}
      {result ? (
        <div className={styles.resolveResult} aria-label="Resolve result">
          <div className={styles.resolveStatus}>
            {result.resolved ? (
              <Pill size="sm" severity="success">
                Resolved
              </Pill>
            ) : (
              <Pill size="sm" severity="warning">
                Unresolved
              </Pill>
            )}
            {result.note ? <span className={styles.resolveNote}>{result.note}</span> : null}
          </div>
          <div className={styles.resolveRow}>
            <span className={styles.resolveLabel}>Input</span>
            <code>{result.input.symbol}</code>
          </div>
          <div className={styles.resolveRow}>
            <span className={styles.resolveLabel}>Output</span>
            <code>{result.symbol}</code>
          </div>
        </div>
      ) : null}
    </section>
  );
}
