import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCrashGroups } from '@/shared/hooks/useCrashGroups';
import { useSessions } from '@/shared/hooks/useSessions';
import { buildResults, flattenResults, type SearchResult } from './search';
import styles from './CommandPalette.module.css';

/** Sanitize a result id into a DOM-id-safe token for aria-activedescendant. */
function domId(id: string): string {
  return `cmdk-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/**
 * Global command palette (Task 117.14). Opens on Cmd/Ctrl-K from anywhere,
 * searches navigation destinations + crash groups + sessions + users, and is
 * fully keyboard-driven (↑/↓ to move, Enter to open, Esc to dismiss). Mounted
 * once in the AppShell. Data is only fetched while the palette is open.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut: toggle on Cmd/Ctrl-K; close on Escape.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Fetch only while open (cheap when the lists are already cached elsewhere).
  const crashGroups = useCrashGroups({ enabled: open });
  const sessions = useSessions({ enabled: open });

  const groups = useMemo(
    () =>
      buildResults(query, {
        crashGroups: crashGroups.data ?? [],
        sessions: sessions.data ?? [],
      }),
    [query, crashGroups.data, sessions.data],
  );
  const flat = useMemo(() => flattenResults(groups), [groups]);

  // Reset query + selection each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  // Keep the active index in range as results shrink/grow.
  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  if (!open) return null;

  const close = () => setOpen(false);
  const select = (result: SearchResult) => {
    close();
    navigate(result.to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, flat.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = flat[activeIndex];
      if (result) select(result);
    }
  };

  const activeId = flat[activeIndex] ? domId(flat[activeIndex]!.id) : undefined;

  return (
    <div className={styles.backdrop} role="presentation" onClick={close}>
      <div
        className={styles.palette}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          autoFocus
          placeholder="Search crashes, sessions, users — or jump to a page…"
          aria-label="Search"
          aria-controls="cmdk-results"
          aria-activedescendant={activeId}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul id="cmdk-results" className={styles.results} role="listbox" aria-label="Results">
          {flat.length === 0 ? (
            <li className={styles.empty}>No results.</li>
          ) : (
            groups.map((group) => (
              <li key={group.type} className={styles.group}>
                <div className={styles.groupHeading}>{group.heading}</div>
                <ul className={styles.groupList} role="presentation">
                  {group.results.map((result) => {
                    const index = flat.indexOf(result);
                    const active = index === activeIndex;
                    return (
                      <li
                        key={result.id}
                        id={domId(result.id)}
                        role="option"
                        aria-selected={active}
                        className={[styles.option, active ? styles.optionActive : undefined]
                          .filter(Boolean)
                          .join(' ')}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => select(result)}
                      >
                        <span className={styles.optionLabel}>{result.label}</span>
                        {result.sublabel ? (
                          <span className={styles.optionSub}>{result.sublabel}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
