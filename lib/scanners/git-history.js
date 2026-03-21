// lib/scanners/git-history.js — Git history scanner for ERNE audit
'use strict';

const { execSync } = require('child_process');
const path = require('path');

/**
 * Run a git command and return stdout, or null on failure.
 * @param {string} cmd
 * @param {string} cwd
 * @returns {string|null}
 */
function gitExec(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

/**
 * Scan git history for the project.
 * @param {string} cwd - Project root
 * @returns {{ commits: object[], contributors: object[], activeFiles: object[] }}
 */
function scanGitHistory(cwd) {
  const root = path.resolve(cwd);
  const empty = { commits: [], contributors: [], activeFiles: [] };

  // Check if it's a git repo
  const gitCheck = gitExec('git rev-parse --is-inside-work-tree', root);
  if (!gitCheck || gitCheck.trim() !== 'true') return empty;

  // Recent commits
  const logOutput = gitExec(
    'git log --oneline -50 --format="%H|%s|%aI|%an"',
    root,
  );
  const commits = [];
  if (logOutput) {
    for (const line of logOutput.trim().split('\n')) {
      if (!line) continue;
      const [hash, subject, date, author] = line.split('|');
      if (hash) {
        commits.push({ hash, subject: subject || '', date: date || '', author: author || '' });
      }
    }
  }

  // Contributors
  const shortlogOutput = gitExec(
    'git shortlog -sn --no-merges -50',
    root,
  );
  const contributors = [];
  if (shortlogOutput) {
    for (const line of shortlogOutput.trim().split('\n')) {
      if (!line) continue;
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (match) {
        contributors.push({ commits: parseInt(match[1], 10), name: match[2].trim() });
      }
    }
  }

  // Active files (frequency in last 50 commits)
  const namesOutput = gitExec(
    'git log --name-only --pretty=format:"" -50',
    root,
  );
  const fileCounts = {};
  if (namesOutput) {
    for (const line of namesOutput.split('\n')) {
      const file = line.trim();
      if (!file) continue;
      fileCounts[file] = (fileCounts[file] || 0) + 1;
    }
  }
  const activeFiles = Object.entries(fileCounts)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  return { commits, contributors, activeFiles };
}

module.exports = scanGitHistory;
