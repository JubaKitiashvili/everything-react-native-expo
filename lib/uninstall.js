'use strict';
const fs = require('fs');
const path = require('path');

module.exports = async function uninstall() {
  const cwd = process.cwd();
  console.log('\n  erne — Removing ERNE from project\n');

  const toRemove = [
    '.claude/agents',
    '.claude/skills',
    '.claude/rules',
    '.claude/contexts',
    '.claude/hooks',
    '.claude/hooks.json',
    '.claude/mcp',
    '.claude/mcp-configs',
    '.claude/settings.json',
    '.mcp.json',
    '.erne',
    'erne-docs',
  ];

  let removed = 0;
  for (const rel of toRemove) {
    const full = path.join(cwd, rel);
    if (fs.existsSync(full)) {
      fs.rmSync(full, { recursive: true, force: true });
      console.log('    ✓ Removed ' + rel);
      removed++;
    }
  }

  // Remove ERNE hooks from settings.local.json
  const settingsLocalPath = path.join(cwd, '.claude', 'settings.local.json');
  if (fs.existsSync(settingsLocalPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsLocalPath, 'utf8'));
      if (settings.hooks) {
        delete settings.hooks;
        fs.writeFileSync(settingsLocalPath, JSON.stringify(settings, null, 2) + '\n');
        console.log('    ✓ Removed hooks from settings.local.json');
        removed++;
      }
    } catch {
      /* skip */
    }
  }

  // Restore CLAUDE.md backup
  const backupPath = path.join(cwd, 'CLAUDE.md.pre-erne');
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  if (fs.existsSync(backupPath)) {
    if (fs.existsSync(claudeMdPath)) fs.unlinkSync(claudeMdPath);
    fs.renameSync(backupPath, claudeMdPath);
    console.log('    ✓ Restored original CLAUDE.md');
    removed++;
  } else if (fs.existsSync(claudeMdPath)) {
    // Check if CLAUDE.md is ERNE-generated
    const content = fs.readFileSync(claudeMdPath, 'utf8');
    if (content.includes('ERNE-GENERATED') || content.includes('erne-profile:')) {
      fs.unlinkSync(claudeMdPath);
      console.log('    ✓ Removed ERNE-generated CLAUDE.md');
      removed++;
    }
  }

  if (removed === 0) {
    console.log('    No ERNE files found.\n');
  } else {
    console.log('\n  Removed ' + removed + ' items. ERNE has been uninstalled.');
    console.log('  Restart Claude Code session to complete.\n');
  }
};
