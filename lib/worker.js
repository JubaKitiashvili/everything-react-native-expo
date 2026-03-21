'use strict';
const path = require('path');

module.exports = async function worker() {
  const args = process.argv.slice(2);
  const configIdx = args.indexOf('--config');
  const configPath = configIdx !== -1 ? args[configIdx + 1] : null;
  const dryRun = args.includes('--dry-run');
  const once = args.includes('--once');

  if (!configPath) {
    console.error('  Usage: erne worker --config <path.json>');
    console.error('  Options: --dry-run, --once');
    process.exit(1);
  }

  const { loadConfig, validateConfig } = require('../worker/config');
  const { createProvider } = require('../worker/providers/factory');
  const { createPoller } = require('../worker/poller');
  const { processTicket } = require('../worker/scheduler');
  const { createLogger } = require('../worker/logger');
  const { publishDashboardEvent } = require('../worker/dashboard-events');

  // 1. Load config
  const fullPath = path.resolve(configPath);
  const { config, error: configError } = loadConfig(fullPath);
  if (configError) {
    console.error('  Config error: ' + configError);
    process.exit(1);
  }
  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error('  Config errors:');
    validation.errors.forEach(e => console.error('    \u2717 ' + e));
    process.exit(1);
  }

  // 2. Create logger
  const logger = createLogger({ file: config.log?.file, level: config.log?.level || 'info' });

  // 3. Detect project and scan (if audit-scanner available)
  let stackInfo = { layers: [] };
  let auditData = {};
  try {
    const { detectProject } = require('./detect');
    stackInfo = detectProject(config.repo.path);
  } catch { /* detect not critical */ }
  try {
    const { runScan } = require('./audit-scanner');
    if (config.erne?.audit_refresh !== false) {
      auditData = runScan(config.repo.path, { skipDepHealth: true, maxFiles: 500 });
    }
  } catch { /* scan not critical */ }

  // 4. Create provider
  const provider = createProvider(config, logger);

  // 5. Print banner
  const pollSec = config.provider.poll_interval_seconds || 60;
  console.log(`
  erne worker — Autonomous Agent

  Provider: ${config.provider.type}
  Repo: ${config.repo.path}
  Profile: ${config.erne?.hook_profile || 'standard'}
  Polling every ${pollSec}s
  ${dryRun ? '  Mode: DRY RUN (no execution)\n' : ''}
  Waiting for tickets...
  `);

  // 6. Dry run mode
  if (dryRun) {
    logger.info('Dry run — fetching tickets...');
    try {
      const tickets = await provider.fetchReadyTickets();
      if (tickets.length === 0) {
        console.log('  No ready tickets found.');
      } else {
        console.log(`  ${tickets.length} ticket(s) found:`);
        tickets.forEach(t => console.log(`    - ${t.identifier}: ${t.title}`));
      }
    } catch (err) {
      console.error('  Error fetching tickets:', err.message);
    }
    process.exit(0);
  }

  // 7. Publish start event
  publishDashboardEvent('worker:start', { provider: config.provider.type, repo: config.repo.path, interval: pollSec });

  // 8. Create poller
  const poller = createPoller({
    provider,
    intervalMs: pollSec * 1000,
    logger,
    onTicket: async (ticket) => {
      await processTicket({ ticket, provider, config, auditData, stackInfo, logger });
    },
  });

  // 9. Handle shutdown
  const shutdown = () => {
    logger.info('Shutting down worker...');
    poller.stop();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 10. Start (once mode or continuous)
  if (once) {
    logger.info('Once mode — processing first available ticket');
    try {
      const tickets = await provider.fetchReadyTickets();
      if (tickets.length > 0) {
        await processTicket({ ticket: tickets[0], provider, config, auditData, stackInfo, logger });
      } else {
        logger.info('No ready tickets found');
      }
    } catch (err) {
      logger.error('Error:', { error: err.message });
    }
    process.exit(0);
  }

  await poller.start();
};
