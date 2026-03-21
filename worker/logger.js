'use strict';

const fs = require('fs');
const path = require('path');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const COLORS = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

const RESET = '\x1b[0m';

const REDACT_PATTERNS = [
  /sk[-_]\w{20,}/g,
  /ghp_\w{36}/g,
  /xoxb-\w+/g,
];

function redact(str) {
  if (typeof str !== 'string') return str;
  let result = str;
  for (const pattern of REDACT_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function timestamp() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function createLogger(opts) {
  const file = opts && opts.file ? opts.file : null;
  const minLevel = opts && opts.level != null ? opts.level : LEVELS.info;
  const isTTY = process.stdout.isTTY;

  let fileStream = null;
  if (file) {
    try {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fileStream = fs.createWriteStream(file, { flags: 'a' });
    } catch {
      // Graceful — no file logging if it fails
    }
  }

  function log(level, message, data) {
    if (LEVELS[level] < minLevel) return;

    const safeMessage = redact(typeof message === 'string' ? message : String(message));

    // TTY output
    if (isTTY) {
      const color = COLORS[level] || '';
      const tag = level.toUpperCase().padEnd(5);
      process.stderr.write(`${color}[${timestamp()}] ${tag}${RESET} ${safeMessage}\n`);
    }

    // File output (JSON lines)
    if (fileStream) {
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        message: safeMessage,
      };
      if (data !== undefined) {
        entry.data = typeof data === 'string' ? redact(data) : data;
      }
      try {
        fileStream.write(JSON.stringify(entry) + '\n');
      } catch {
        // Graceful
      }
    }
  }

  return {
    debug: (msg, data) => log('debug', msg, data),
    info: (msg, data) => log('info', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
  };
}

module.exports = { createLogger, LEVELS };
