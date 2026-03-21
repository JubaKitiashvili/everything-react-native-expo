'use strict';

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

/**
 * Create a git worktree for a branch.
 */
function createWorktree(repoPath, branch, logger) {
  const sanitized = branch.replace(/[^a-zA-Z0-9._-]/g, '-');
  const worktreePath = path.join(os.tmpdir(), 'erne-worker-' + sanitized);

  try {
    // Try creating a new branch from main
    execSync(`git worktree add -b ${branch} ${worktreePath} main`, {
      cwd: repoPath,
      stdio: 'pipe',
    });
    if (logger) logger.info(`Created worktree at ${worktreePath} (new branch: ${branch})`);
  } catch {
    // Branch may already exist — try attaching to existing branch
    try {
      execSync(`git worktree add ${worktreePath} ${branch}`, {
        cwd: repoPath,
        stdio: 'pipe',
      });
      if (logger) logger.info(`Created worktree at ${worktreePath} (existing branch: ${branch})`);
    } catch (err) {
      if (logger) logger.error(`Failed to create worktree: ${err.message}`);
      return { path: null, error: err.message };
    }
  }

  return { path: worktreePath, error: null };
}

/**
 * Remove a git worktree.
 */
function removeWorktree(repoPath, worktreePath, logger) {
  try {
    execSync(`git worktree remove --force ${worktreePath}`, {
      cwd: repoPath,
      stdio: 'pipe',
    });
    if (logger) logger.info(`Removed worktree at ${worktreePath}`);
    return { error: null };
  } catch (err) {
    // Gracefully handle if already removed
    if (logger) logger.warn(`Worktree removal note: ${err.message}`);
    return { error: null };
  }
}

module.exports = { createWorktree, removeWorktree };
