'use strict';

const { execSync } = require('child_process');
const { routeTicketToAgent } = require('./agent-router');
const { resolveContext } = require('./context-resolver');
const { buildTaskVars, interpolate } = require('./interpolate');
const { createWorktree, removeWorktree } = require('./worktree');
const { buildPrompt } = require('./prompt-builder');
const { executeClaudeCode } = require('./executor');
const { selfReview } = require('./self-reviewer');
const { runTests } = require('./test-verifier');
const { calculateHealthDelta } = require('./health-delta');
const { publishDashboardEvent } = require('./dashboard-events');

/**
 * Execute the full per-ticket pipeline.
 *
 * @param {object} options
 * @param {object} options.ticket - The ticket to process
 * @param {object} options.config - Worker config
 * @param {object} options.provider - TicketProvider instance
 * @param {object} [options.auditData] - Parsed audit-data.json
 * @param {object} [options.stackInfo] - Detected stack info
 * @param {object} options.logger - Logger instance
 * @returns {Promise<object>} Pipeline result
 */
async function executePipeline({ ticket, config, provider, auditData, stackInfo, logger }) {
  // 1. Route to agent
  const agent = routeTicketToAgent(ticket, auditData, config);
  logger.info(`Routed ticket ${ticket.id} to agent: ${agent}`);

  // 2. Resolve context
  const context = resolveContext(ticket, auditData, stackInfo);

  // 3. Build task variables
  const taskVars = buildTaskVars(ticket, agent);

  // 4. Create worktree
  const repoPath = config.repo.path;
  const worktree = createWorktree(repoPath, taskVars.branch, logger);
  if (!worktree.path) {
    return { success: false, stage: 'worktree', error: worktree.error, agent };
  }

  const retries = (config.executor && config.executor.retries) || 0;

  try {
    // 5a. Pre-hooks
    const preHooks = (config.hooks && config.hooks.pre) || [];
    for (const hook of preHooks) {
      const cmd = interpolate(hook, taskVars);
      logger.info(`Running pre-hook: ${cmd}`);
      try {
        execSync(cmd, { cwd: worktree.path, stdio: 'pipe', timeout: 30000 });
      } catch (err) {
        logger.warn(`Pre-hook failed: ${err.message}`);
      }
    }

    // 5b. Build prompt
    const prompt = buildPrompt({ ticket, agent, taskVars, context, config });

    // 5c. Execute Claude Code with retries
    let execResult = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) logger.info(`Retry ${attempt}/${retries}`);
      execResult = await executeClaudeCode(prompt, worktree.path, config.executor, logger);
      if (execResult.success) break;
    }

    // 5d. Check execution result
    if (!execResult || !execResult.success) {
      return {
        success: false,
        stage: 'executor',
        error: (execResult && execResult.output) || 'Execution failed',
        agent,
        retriesAttempted: retries,
      };
    }

    // 5e. Self-review
    const reviewResult = selfReview(execResult.output, logger);

    // 5f. Test verification
    let testResults = runTests(worktree.path, config, logger);
    publishDashboardEvent('worker:tests-run', {
      ticketId: ticket.id,
      passed: testResults.passed,
    });

    if (!testResults.passed) {
      // Auto-fix attempt: feed test errors back to Claude and retry once
      logger.info('Tests failed — attempting auto-fix');
      const fixPrompt = [
        'The following tests failed after your changes. Fix the code so all tests pass.',
        '',
        '## Test Output',
        testResults.error || testResults.output,
      ].join('\n');

      const fixResult = await executeClaudeCode(fixPrompt, worktree.path, config.executor, logger);
      if (fixResult.success) {
        testResults = runTests(worktree.path, config, logger);
        publishDashboardEvent('worker:tests-run', {
          ticketId: ticket.id,
          passed: testResults.passed,
          autoFixAttempt: true,
        });
      }
    }

    // 5g. Health delta
    const { calculateConfidence } = require('./confidence-scorer');
    const confidenceResult = calculateConfidence(ticket, auditData, context);
    const healthDelta = calculateHealthDelta({
      testResults,
      selfReview: reviewResult,
      confidence: confidenceResult.score,
      logger,
    });
    publishDashboardEvent('worker:health-delta', {
      ticketId: ticket.id,
      improved: healthDelta.improved,
      summary: healthDelta.summary,
    });

    // 5h. Post-hooks
    const postHooks = (config.hooks && config.hooks.post) || [];
    for (const hook of postHooks) {
      const cmd = interpolate(hook, taskVars);
      logger.info(`Running post-hook: ${cmd}`);
      try {
        execSync(cmd, { cwd: worktree.path, stdio: 'pipe', timeout: 30000 });
      } catch (err) {
        logger.warn(`Post-hook failed: ${err.message}`);
      }
    }

    // 5i. Return success
    return {
      success: true,
      output: execResult.output,
      agent,
      confidence: confidenceResult,
      testResults,
      healthDelta,
      selfReview: reviewResult,
    };
  } finally {
    // 6. Always clean up worktree
    removeWorktree(repoPath, worktree.path, logger);
  }
}

module.exports = { executePipeline };
