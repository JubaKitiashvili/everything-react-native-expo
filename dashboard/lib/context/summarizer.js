'use strict';

/**
 * Content Summarizer — produces concise summaries for maximum context savings.
 * Unlike truncation (which keeps portions of raw text), summarization extracts
 * only the essential information, achieving 94-99% savings.
 */

const MIN_SUMMARIZE_BYTES = 500;

// ── Content type detectors ──────────────────────────────────────────────────

const CONTENT_TYPES = [
  {
    type: 'markdown',
    detect(content) {
      const signals = [
        /^#{1,6}\s+/m,
        /^\s*[-*]\s+/m,
        /```[\s\S]*?```/,
        /\[.*?\]\(.*?\)/,
        /^\s*>\s+/m,
      ];
      const hits = signals.filter(r => r.test(content)).length;
      return hits >= 2;
    },
  },
  {
    type: 'html',
    detect(content) {
      return /<!DOCTYPE\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(content);
    },
  },
  {
    type: 'json_array',
    detect(content) {
      const trimmed = content.trim();
      if (trimmed[0] !== '[') return false;
      try { const p = JSON.parse(trimmed); return Array.isArray(p) && p.length > 0; } catch { return false; }
    },
  },
  {
    type: 'json_object',
    detect(content) {
      const trimmed = content.trim();
      if (trimmed[0] !== '{') return false;
      try { JSON.parse(trimmed); return true; } catch { return false; }
    },
  },
  {
    type: 'test_output',
    detect(content) {
      return /Test Suites?:.*total|Tests:.*total|✓.*passing|✕.*failing|FAIL\s+\w|test.*\.(?:js|ts|jsx|tsx)/im.test(content)
        && /(?:pass|fail|error|✓|✕|●)/im.test(content);
    },
  },
  {
    type: 'typescript_errors',
    detect(content) {
      return /TS\d{4,5}:/m.test(content) && /error TS\d+/m.test(content);
    },
  },
  {
    type: 'csv',
    detect(content) {
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length < 3) return false;
      const commas = lines.slice(0, 5).map(l => (l.match(/,/g) || []).length);
      return commas[0] >= 2 && commas.every(c => c === commas[0]);
    },
  },
  {
    type: 'git_log',
    detect(content) {
      if (/^commit [0-9a-f]{40}/m.test(content)) return true;
      if (/^[0-9a-f]{7,40}\s/m.test(content) && /Author:|Date:|Merge:/m.test(content)) return true;
      const lines = content.split('\n').filter(l => l.trim());
      const hashLines = lines.filter(l => /^[0-9a-f]{7,12}\s/.test(l));
      return hashLines.length >= 10 && hashLines.length >= lines.length * 0.7;
    },
  },
  {
    type: 'build_output',
    detect(content) {
      return /(?:Route|Compiling|Bundling|Building|Compiled|built in|webpack|vite|next|esbuild)/im.test(content)
        && /(?:\d+\s*[kKmM]?[bB]|\d+\.\d+\s*s|chunks?|modules?|routes?)/im.test(content);
    },
  },
  {
    type: 'log_file',
    detect(content) {
      const lines = content.split('\n').slice(0, 20);
      const logLike = lines.filter(l =>
        /\d{4}[-/]\d{2}[-/]\d{2}/.test(l) || /\s(?:GET|POST|PUT|DELETE|PATCH)\s/.test(l) || /\s(?:200|301|302|404|500)\s/.test(l)
      );
      return logLike.length >= 3;
    },
  },
  {
    type: 'network_requests',
    detect(content) {
      return /(?:GET|POST|PUT|DELETE|PATCH|OPTIONS)\s+https?:\/\//m.test(content)
        && /\b(?:200|201|204|301|302|400|401|403|404|500)\b/m.test(content);
    },
  },
];

function detectContentType(content) {
  if (!content || typeof content !== 'string') return 'unknown';
  for (const ct of CONTENT_TYPES) {
    if (ct.detect(content)) return ct.type;
  }
  return 'unknown';
}

// ── Summarizers ─────────────────────────────────────────────────────────────

function summarizeMarkdown(content) {
  const lines = content.split('\n');

  // Title: first H1 or first heading
  const titleMatch = content.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Section headings
  const headings = [];
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) headings.push({ level: m[1].length, text: m[2].trim() });
  }

  // Code blocks
  const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;

  // Key terms: extract bold and inline-code terms (short ones only)
  const boldTerms = [...new Set((content.match(/\*\*([^*]+)\*\*/g) || []).map(m => m.replace(/\*\*/g, '')).filter(t => t.length <= 30))].slice(0, 8);
  const codeTerms = [...new Set((content.match(/`([^`\n]+)`/g) || []).map(m => m.replace(/`/g, '')).filter(t => t.length <= 25))].slice(0, 8);
  const keyTerms = [...new Set([...boldTerms, ...codeTerms])].slice(0, 10);

  // Links
  const linkCount = (content.match(/\[.*?\]\(.*?\)/g) || []).length;

  const parts = [];
  if (title) parts.push(title);
  parts.push(`${headings.length} sections, ${codeBlocks} code examples`);
  if (keyTerms.length > 0) parts.push(`Key topics: ${keyTerms.join(', ')}`);
  if (linkCount > 0) parts.push(`${linkCount} links`);

  const summary = parts.join('. ');
  const metadata = { title, headingCount: headings.length, codeBlocks, linkCount, keyTerms, headings: headings.slice(0, 20) };
  return { summary, metadata };
}

function summarizeHTML(content) {
  // Title
  const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled page';

  // Nav items
  const navSection = content.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i);
  const navLinks = navSection
    ? [...navSection[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)].map(m => m[1].trim()).filter(Boolean).slice(0, 10)
    : [];

  // Headings
  const headings = [...content.matchAll(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi)].map(m => m[1].trim()).slice(0, 10);

  // Forms
  const formCount = (content.match(/<form[\s>]/gi) || []).length;
  const inputCount = (content.match(/<input[\s>]/gi) || []).length;

  // Links
  const linkCount = (content.match(/<a[\s]/gi) || []).length;

  // Lists and items for content structure
  const listItems = [...content.matchAll(/<li[^>]*>([^<]{1,80})/gi)].map(m => m[1].trim()).slice(0, 5);

  const parts = [title];
  if (listItems.length > 0) parts.push(`${(content.match(/<li[\s>]/gi) || []).length} list items`);
  if (navLinks.length > 0) parts.push(`navigation: [${navLinks.join(', ')}]`);
  if (headings.length > 0) parts.push(`headings: [${headings.slice(0, 5).join(', ')}]`);
  if (formCount > 0) parts.push(`${formCount} forms, ${inputCount} inputs`);
  parts.push(`${linkCount} links`);
  if (listItems.length > 0) parts.push(`Top: '${listItems[0]}'`);

  const summary = parts.join('. ');
  const metadata = { title, navLinks, headings, formCount, inputCount, linkCount };
  return { summary, metadata };
}

function summarizeJSONArray(content) {
  const arr = JSON.parse(content.trim());
  const total = arr.length;

  // Schema from first object
  const first = arr[0];
  const isObjectArray = typeof first === 'object' && first !== null && !Array.isArray(first);
  const keys = isObjectArray ? Object.keys(first) : [];

  const parts = [`${total} items`];

  if (isObjectArray && keys.length > 0) {
    const schemaDesc = keys.map(k => {
      const val = first[k];
      if (Array.isArray(val)) return `${k}[]`;
      return k;
    }).join(', ');
    parts.push(`Schema: {${schemaDesc}}`);

    // Aggregate common fields
    const stateField = keys.find(k => /state|status/i.test(k));
    if (stateField) {
      const counts = {};
      for (const item of arr) {
        const v = String(item[stateField] || 'unknown');
        counts[v] = (counts[v] || 0) + 1;
      }
      const stateParts = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}: ${v}`);
      parts.push(stateParts.join(', '));
    }

    // Sample recent/first item
    const titleField = keys.find(k => /title|name|message|subject|text/i.test(k));
    const idField = keys.find(k => /^id$|number|key/i.test(k));
    const last = arr[arr.length - 1];
    if (titleField) {
      const label = idField && first[idField] ? `#${first[idField]} ` : '';
      parts.push(`Recent: ${label}'${String(first[titleField]).slice(0, 60)}'`);
    }
  } else {
    // Primitive array
    const sample = arr.slice(0, 3).map(v => JSON.stringify(v)).join(', ');
    parts.push(`Sample: [${sample}]`);
  }

  const summary = parts.join('. ');
  const metadata = { total, keys, isObjectArray };
  return { summary, metadata };
}

function summarizeJSONObject(content) {
  const obj = JSON.parse(content.trim());
  const topKeys = Object.keys(obj);

  // Categorize values
  const arrays = [];
  const objects = [];
  const scalars = [];
  for (const key of topKeys) {
    const val = obj[key];
    if (Array.isArray(val)) arrays.push({ key, length: val.length });
    else if (typeof val === 'object' && val !== null) objects.push({ key, keyCount: Object.keys(val).length });
    else scalars.push({ key, value: val });
  }

  const parts = [`${topKeys.length} top-level keys`];

  // Describe arrays — try to categorize if items have type/category fields
  for (const { key, length } of arrays.slice(0, 3)) {
    const arr = obj[key];
    if (length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
      const catField = Object.keys(arr[0]).find(k => /type|category|kind|group/i.test(k));
      if (catField) {
        const cats = {};
        for (const item of arr) {
          const v = String(item[catField] || 'other');
          cats[v] = (cats[v] || 0) + 1;
        }
        const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6);
        parts.push(`${key}: ${length} items. Categories: ${sorted.map(([k, v]) => `${k}(${v})`).join(', ')}`);
      } else {
        const nameField = Object.keys(arr[0]).find(k => /name|title|id/i.test(k));
        const sample = nameField
          ? arr.slice(0, 5).map(i => i[nameField]).join(', ')
          : `${length} items`;
        parts.push(`${key}: ${sample}`);
      }
    } else {
      parts.push(`${key}: [${length} items]`);
    }
  }

  // Scalar highlights
  const importantScalars = scalars.filter(s => /name|version|status|type|count|total/i.test(s.key)).slice(0, 5);
  if (importantScalars.length > 0) {
    parts.push(importantScalars.map(s => `${s.key}: ${String(s.value).slice(0, 50)}`).join(', '));
  }

  const summary = parts.join('. ');
  const metadata = { topKeys, arrayCount: arrays.length, objectCount: objects.length, scalarCount: scalars.length };
  return { summary, metadata };
}

function summarizeTestOutput(content) {
  const lines = content.split('\n');

  // Summary lines
  const suiteLine = lines.find(l => /Test Suites?:/.test(l));
  const testLine = lines.find(l => /^Tests?:/m.test(l));
  const timeLine = lines.find(l => /Time:/i.test(l));

  // Failures
  const failureBlocks = [];
  let inFailure = false;
  let currentFailure = [];
  for (const line of lines) {
    if (/FAIL\s|✕|●/.test(line)) {
      if (currentFailure.length > 0) failureBlocks.push(currentFailure.join(' ').slice(0, 120));
      currentFailure = [line.trim()];
      inFailure = true;
    } else if (inFailure && /^\s+(Expected|Received|Error|at\s)/.test(line)) {
      currentFailure.push(line.trim());
    } else {
      if (currentFailure.length > 0) failureBlocks.push(currentFailure.join(' ').slice(0, 120));
      currentFailure = [];
      inFailure = false;
    }
  }
  if (currentFailure.length > 0) failureBlocks.push(currentFailure.join(' ').slice(0, 120));

  // Extract counts
  const suiteMatch = suiteLine ? suiteLine.match(/(\d+)\s+passed.*?(\d+)\s+failed/i) || suiteLine.match(/(\d+)\s+total/) : null;
  const testMatch = testLine ? testLine.match(/(\d+)\s+total/) : null;

  const parts = [];
  if (suiteLine) parts.push(suiteLine.trim());
  if (failureBlocks.length > 0) {
    parts.push(`Failures: ${failureBlocks.slice(0, 5).join('; ')}`);
  }
  if (testMatch) parts.push(`${testMatch[1]} tests total`);
  if (timeLine) parts.push(timeLine.trim());

  const summary = parts.join('. ') || 'Test output (could not parse summary)';
  const metadata = { failureCount: failureBlocks.length, suiteInfo: suiteLine, totalTests: testMatch ? testMatch[1] : null };
  return { summary, metadata };
}

function summarizeTypeScriptErrors(content) {
  const lines = content.split('\n');

  // Parse errors: file(line,col): error TSxxxx: message
  const errors = [];
  for (const line of lines) {
    const m = line.match(/(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/);
    if (m) {
      errors.push({ file: m[1], line: +m[2], code: m[4], message: m[5].trim() });
    } else {
      // Alternative format: file:line:col - error TSxxxx: message
      const m2 = line.match(/(.+?):(\d+):(\d+)\s*-\s*error\s+(TS\d+):\s*(.+)/);
      if (m2) errors.push({ file: m2[1], line: +m2[2], code: m2[4], message: m2[5].trim() });
    }
  }

  const total = errors.length;

  // Group by file
  const byFile = {};
  for (const e of errors) {
    byFile[e.file] = (byFile[e.file] || 0) + 1;
  }
  const topFiles = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Group by code
  const byCode = {};
  for (const e of errors) {
    byCode[e.code] = (byCode[e.code] || 0) + 1;
  }
  const topCodes = Object.entries(byCode).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const fileCount = Object.keys(byFile).length;

  const parts = [`${total} TS errors in ${fileCount} files`];
  if (topFiles.length > 0) parts.push(`Top: ${topFiles.map(([f, c]) => `${f}(${c})`).join(', ')}`);
  if (topCodes.length > 0) parts.push(`Codes: ${topCodes.map(([c, n]) => `${c}(${n})`).join(', ')}`);

  const summary = parts.join('. ');
  const metadata = { total, fileCount, topFiles, topCodes };
  return { summary, metadata };
}

function summarizeBuildOutput(content) {
  const lines = content.split('\n');

  // Routes
  const routeLines = lines.filter(l => /^\s*[/○●λ◐ƒ]/.test(l) || /Route\s/.test(l));
  const routeCount = routeLines.length || null;

  // Bundle sizes
  const sizeMatches = [...content.matchAll(/(\S+)\s+([\d.]+)\s*([kKmM]?[bB])/g)];
  let totalSize = null;
  let largest = null;
  let largestSize = 0;
  for (const m of sizeMatches) {
    const num = parseFloat(m[2]);
    const unit = m[3].toLowerCase();
    const bytes = unit.startsWith('k') ? num * 1024 : unit.startsWith('m') ? num * 1024 * 1024 : num;
    if (bytes > largestSize) {
      largestSize = bytes;
      largest = { name: m[1], size: `${m[2]}${m[3]}` };
    }
  }

  // Total size from summary lines
  const totalMatch = content.match(/(?:Total|Bundle|Size)[:\s]+([\d.]+)\s*([kKmM]?[bB])/i);
  if (totalMatch) totalSize = `${totalMatch[1]}${totalMatch[2]}`;

  // Warnings and errors
  const warningCount = (content.match(/warn(?:ing)?/gi) || []).length;
  const errorCount = (content.match(/\berror\b/gi) || []).length;

  // Time
  const timeMatch = content.match(/([\d.]+)\s*(?:s|seconds|ms)/i);
  const time = timeMatch ? `${timeMatch[1]}${timeMatch[0].match(/ms/i) ? 'ms' : 's'}` : null;

  const parts = ['Build'];
  if (routeCount) parts.push(`${routeCount} routes`);
  if (totalSize) parts.push(`${totalSize} total`);
  if (largest) parts.push(`Largest: ${largest.name}(${largest.size})`);
  if (warningCount > 0) parts.push(`Warnings: ${warningCount}`);
  if (errorCount > 0) parts.push(`Errors: ${errorCount}`);
  if (time) parts.push(`Time: ${time}`);

  const summary = parts.join('. ');
  const metadata = { routeCount, totalSize, largest, warningCount, errorCount, time };
  return { summary, metadata };
}

function summarizeLogFile(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const total = lines.length;

  // Status codes
  const statusCounts = {};
  for (const line of lines) {
    const m = line.match(/\s(1\d{2}|2\d{2}|3\d{2}|4\d{2}|5\d{2})\s/);
    if (m) statusCounts[m[1]] = (statusCounts[m[1]] || 0) + 1;
  }
  const statusEntries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);

  // Paths
  const pathCounts = {};
  for (const line of lines) {
    const m = line.match(/(?:GET|POST|PUT|DELETE|PATCH)\s+(\S+)/);
    if (m) {
      const path = m[1].split('?')[0]; // strip query
      pathCounts[path] = (pathCounts[path] || 0) + 1;
    }
  }
  const topPaths = Object.entries(pathCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Error rate
  const errorCount = Object.entries(statusCounts).filter(([s]) => s.startsWith('5')).reduce((sum, [, c]) => sum + c, 0);
  const totalWithStatus = statusEntries.reduce((sum, [, c]) => sum + c, 0);
  const errorRate = totalWithStatus > 0 ? ((errorCount / totalWithStatus) * 100).toFixed(1) : 0;

  const parts = [`${total} requests`];
  if (statusEntries.length > 0) parts.push(`Status: ${statusEntries.slice(0, 6).map(([s, c]) => `${s}(${c})`).join(', ')}`);
  if (topPaths.length > 0) parts.push(`Top paths: ${topPaths.map(([p, c]) => `${p}(${c})`).join(', ')}`);
  parts.push(`Error rate: ${errorRate}%`);

  const summary = parts.join('. ');
  const metadata = { total, statusCounts, topPaths: Object.fromEntries(topPaths), errorRate: +errorRate };
  return { summary, metadata };
}

function summarizeGitLog(content) {
  const lines = content.split('\n').filter(l => l.trim());

  // Detect format: full vs oneline
  const isFullFormat = /^commit [0-9a-f]{40}/m.test(content);

  let total, topAuthors = [], dateRange = null, recentMsg = null;

  if (isFullFormat) {
    // Full-format commits
    const commitHashes = content.match(/^commit [0-9a-f]{40}/gm) || [];
    total = commitHashes.length;

    // Authors
    const authorCounts = {};
    for (const line of lines) {
      const m = line.match(/^Author:\s+(.+?)(?:\s+<.*>)?$/);
      if (m) authorCounts[m[1].trim()] = (authorCounts[m[1].trim()] || 0) + 1;
    }
    topAuthors = Object.entries(authorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Date range
    const dates = [];
    for (const line of lines) {
      const m = line.match(/^Date:\s+(.+)/);
      if (m) {
        const d = new Date(m[1].trim());
        if (!isNaN(d.getTime())) dates.push(d);
      }
    }
    if (dates.length >= 2) {
      dates.sort((a, b) => a - b);
      const fmt = d => d.toISOString().split('T')[0];
      dateRange = `${fmt(dates[0])}..${fmt(dates[dates.length - 1])}`;
    }

    recentMsg = lines.find(l => l.trim() && !/^commit\s|^Author:|^Date:|^Merge:/.test(l));
  } else {
    // Oneline format: "<hash> <message>"
    const commitLines = lines.filter(l => /^[0-9a-f]{7,12}\s/.test(l));
    total = commitLines.length;

    // Extract commit types for summary
    const typeCounts = {};
    for (const line of commitLines) {
      const msg = line.replace(/^[0-9a-f]+\s+/, '');
      const typeMatch = msg.match(/^(feat|fix|refactor|test|docs|chore|style|perf|ci|build)[\s(:]/i);
      const type = typeMatch ? typeMatch[1].toLowerCase() : 'other';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
    topAuthors = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([type, count]) => [type, count]);

    recentMsg = commitLines[0]?.replace(/^[0-9a-f]+\s+/, '');
  }

  const parts = [`${total} commits`];
  if (dateRange) parts.push(`(${dateRange})`);
  if (isFullFormat && topAuthors.length > 0) {
    parts.push(`Authors: ${topAuthors.map(([a, c]) => `${a}(${c})`).join(', ')}`);
  } else if (!isFullFormat && topAuthors.length > 0) {
    parts.push(`Types: ${topAuthors.map(([t, c]) => `${t}(${c})`).join(', ')}`);
  }
  if (recentMsg) parts.push(`Recent: '${recentMsg.trim().slice(0, 80)}'`);

  const summary = parts.join('. ');
  const metadata = { total, topAuthors, dateRange };
  return { summary, metadata };
}

function summarizeCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { summary: `CSV: ${lines.length} lines`, metadata: {} };

  // Parse header
  const header = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rowCount = lines.length - 1;
  const colCount = header.length;

  // Aggregate a categorical column if found
  const categoricalIdx = header.findIndex(h => /event|type|category|status|country|device/i.test(h));
  let categoryCounts = null;
  if (categoricalIdx >= 0) {
    const counts = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const val = (cols[categoricalIdx] || '').trim().replace(/^["']|["']$/g, '');
      if (val) counts[val] = (counts[val] || 0) + 1;
    }
    categoryCounts = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }

  const parts = [`${rowCount} rows x ${colCount} cols (${header.join(',')})`];
  if (categoryCounts) {
    const fieldName = header[categoricalIdx];
    parts.push(`${fieldName}: ${categoryCounts.map(([k, v]) => `${k}(${v})`).join(', ')}`);
  }

  const summary = parts.join('. ');
  const metadata = { rowCount, colCount, header, categoryCounts };
  return { summary, metadata };
}

function summarizeNetworkRequests(content) {
  const lines = content.split('\n').filter(l => l.trim());

  // If small enough, pass through
  if (content.length < 500) {
    return { summary: content, metadata: { passthrough: true } };
  }

  const total = lines.length;

  // Methods
  const methodCounts = {};
  for (const line of lines) {
    const m = line.match(/\b(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/);
    if (m) methodCounts[m[1]] = (methodCounts[m[1]] || 0) + 1;
  }

  // Status codes
  const statusCounts = {};
  for (const line of lines) {
    const m = line.match(/\b([12345]\d{2})\b/);
    if (m) statusCounts[m[1]] = (statusCounts[m[1]] || 0) + 1;
  }

  const parts = [`${total} requests`];
  const methods = Object.entries(methodCounts).sort((a, b) => b[1] - a[1]);
  if (methods.length > 0) parts.push(`Methods: ${methods.map(([m, c]) => `${m}(${c})`).join(', ')}`);
  const statuses = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
  if (statuses.length > 0) parts.push(`Status: ${statuses.slice(0, 6).map(([s, c]) => `${s}(${c})`).join(', ')}`);

  const summary = parts.join('. ');
  const metadata = { total, methodCounts, statusCounts };
  return { summary, metadata };
}

function summarizeGeneric(content) {
  const lines = content.split('\n');
  const lineCount = lines.length;
  const byteCount = content.length;

  // Best-effort: first non-empty line as hint, plus stats
  const firstLine = lines.find(l => l.trim()) || '';
  const hint = firstLine.slice(0, 100);

  const summary = `${lineCount} lines, ${byteCount} bytes. First: "${hint}"`;
  const metadata = { lineCount, byteCount };
  return { summary, metadata };
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

const SUMMARIZERS = {
  markdown: summarizeMarkdown,
  html: summarizeHTML,
  json_array: summarizeJSONArray,
  json_object: summarizeJSONObject,
  test_output: summarizeTestOutput,
  typescript_errors: summarizeTypeScriptErrors,
  build_output: summarizeBuildOutput,
  log_file: summarizeLogFile,
  git_log: summarizeGitLog,
  csv: summarizeCSV,
  network_requests: summarizeNetworkRequests,
  unknown: summarizeGeneric,
};

/**
 * Summarize content with intelligent type detection.
 * @param {string} content - Raw content to summarize
 * @param {string} [contentType] - Optional override (auto-detected if omitted)
 * @param {object} [opts] - Options ({ maxSummaryLength })
 * @returns {{ summary: string, contentType: string, originalBytes: number, summaryBytes: number, savingsPct: number, metadata: object }}
 */
function summarize(content, contentType, opts = {}) {
  if (!content || typeof content !== 'string') {
    return { summary: '', contentType: 'empty', originalBytes: 0, summaryBytes: 0, savingsPct: 0, metadata: {} };
  }

  const originalBytes = content.length;

  // Small content: pass through without summarization
  if (originalBytes < MIN_SUMMARIZE_BYTES) {
    return { summary: content, contentType: 'passthrough', originalBytes, summaryBytes: originalBytes, savingsPct: 0, metadata: { passthrough: true } };
  }

  const detectedType = contentType || detectContentType(content);
  const summarizer = SUMMARIZERS[detectedType] || SUMMARIZERS.unknown;

  let result;
  try {
    result = summarizer(content);
  } catch {
    result = summarizeGeneric(content);
  }

  let { summary, metadata } = result;

  // Apply max length cap if specified
  const maxLen = opts.maxSummaryLength || 2000;
  if (summary.length > maxLen) {
    summary = summary.slice(0, maxLen - 3) + '...';
  }

  const summaryBytes = summary.length;
  const savingsPct = originalBytes > 0 ? Math.round(((originalBytes - summaryBytes) / originalBytes) * 100) : 0;

  return { summary, contentType: detectedType, originalBytes, summaryBytes, savingsPct, metadata };
}

module.exports = { summarize, detectContentType };
