'use strict';

const { validateTicket } = require('./ticket-validator');
const { calculateConfidence } = require('./confidence-scorer');
const { resolveContext } = require('./context-resolver');
const { executePipeline } = require('./pipeline');
const { publishDashboardEvent } = require('./dashboard-events');

const NEEDS_MORE_INFO_TEMPLATE = [
  '## ERNE Worker — Needs More Info',
  '',
  'This ticket was picked up by the ERNE worker but cannot be processed yet.',
  '',
  '**Issues found:**',
  '{issues}',
  '',
  'Please update the ticket with the missing information and move it back to the ready state.',
].join('\n');

const TOO_COMPLEX_TEMPLATE = [
  '## ERNE Worker — Too Complex for Automation',
  '',
  'Confidence score: **{score}/100** ({level})',
  '',
  '**Factors:**',
  '{factors}',
  '',
  'This ticket requires manual implementation. Consider breaking it into smaller tasks.',
].join('\n');

const SUCCESS_TEMPLATE = [
  '## ERNE Worker — Task Complete',
  '',
  '| Metric | Value |',
  '|--------|-------|',
  '| Agent | {agent} |',
  '| Duration | {duration} |',
  '| Confidence | {confidence_score}/100 ({confidence_level}) |',
  '',
  '### Self-Review',
  '{self_review_summary}',
  '',
  '### Test Results',
  '| Status | Details |',
  '|--------|---------|',
  '| {test_status} | {test_details} |',
  '',
  '### Health Delta',
  '{health_summary}',
].join('\n');

const FAILURE_TEMPLATE = [
  '## ERNE Worker — Task Failed',
  '',
  '| Metric | Value |',
  '|--------|-------|',
  '| Stage | {stage} |',
  '| Retries | {retries} |',
  '',
  '### Error Output',
  '```',
  '{error}',
  '```',
].join('\n');

/**
 * Process a single ticket through the full lifecycle.
 *
 * @param {object} options
 * @param {object} options.ticket - The ticket to process
 * @param {object} options.provider - TicketProvider instance
 * @param {object} options.config - Worker config
 * @param {object} [options.auditData] - Parsed audit-data.json
 * @param {object} [options.stackInfo] - Detected stack info
 * @param {object} options.logger - Logger instance
 */
async function processTicket({ ticket, provider, config, auditData, stackInfo, logger }) {
  const startTime = Date.now();

  // 1. Validate ticket
  publishDashboardEvent('worker:step', { taskId: ticket.id, step: 'validate' });
  const validation = validateTicket(ticket);
  if (!validation.valid) {
    const issueList = validation.issues.map((i) => `- ${i}`).join('\n');
    const comment = NEEDS_MORE_INFO_TEMPLATE.replace('{issues}', issueList);
    await provider.postComment(ticket.id, comment);
    publishDashboardEvent('worker:ticket-rejected', {
      ticketId: ticket.id,
      issues: validation.issues,
    });
    logger.warn(`Ticket ${ticket.id} rejected: ${validation.issues.join('; ')}`);
    return;
  }

  // 2. Calculate confidence
  publishDashboardEvent('worker:step', { taskId: ticket.id, step: 'score' });
  const context = resolveContext(ticket, auditData, stackInfo);
  const confidence = calculateConfidence(ticket, auditData, context);

  const minConfidence = (config.erne && config.erne.min_confidence) || 70;
  if (confidence.score < minConfidence) {
    const factorList = confidence.factors.map((f) => `- ${f.factor} (${f.impact})`).join('\n');
    const comment = TOO_COMPLEX_TEMPLATE.replace('{score}', String(confidence.score))
      .replace('{level}', confidence.level)
      .replace('{factors}', factorList);
    await provider.postComment(ticket.id, comment);
    await provider.transitionStatus(ticket.id, 'failed');
    publishDashboardEvent('worker:confidence-scored', {
      ticketId: ticket.id,
      score: confidence.score,
      level: confidence.level,
    });
    logger.warn(`Ticket ${ticket.id} too complex (confidence: ${confidence.score})`);
    return;
  }

  publishDashboardEvent('worker:confidence-scored', {
    ticketId: ticket.id,
    score: confidence.score,
    level: confidence.level,
  });

  // 3. Claim ticket
  await provider.transitionStatus(ticket.id, 'in_progress');
  publishDashboardEvent('worker:task-start', {
    ticketId: ticket.id,
    title: ticket.title || ticket.id,
    source: (config.provider && config.provider.type) || 'worker',
    confidence: confidence.score,
  });
  logger.info(`Claimed ticket ${ticket.id} (confidence: ${confidence.score})`);

  // 4. Execute pipeline
  const result = await executePipeline({
    ticket,
    config,
    provider,
    auditData,
    stackInfo,
    logger,
  });

  const duration = formatDuration(Date.now() - startTime);

  // 5. Report
  publishDashboardEvent('worker:step', { taskId: ticket.id, step: 'pr' });
  if (result.success) {
    await provider.transitionStatus(ticket.id, 'done');

    const testStatus = result.testResults && result.testResults.passed ? 'Passed' : 'Failed';
    const testDetails = result.testResults
      ? (result.testResults.output || '').slice(0, 200)
      : 'No tests run';

    const comment = SUCCESS_TEMPLATE.replace('{agent}', result.agent || 'unknown')
      .replace('{duration}', duration)
      .replace('{confidence_score}', String(result.confidence ? result.confidence.score : '?'))
      .replace('{confidence_level}', result.confidence ? result.confidence.level : '?')
      .replace('{self_review_summary}', result.selfReview ? result.selfReview.summary : 'N/A')
      .replace('{test_status}', testStatus)
      .replace('{test_details}', testDetails)
      .replace('{health_summary}', result.healthDelta ? result.healthDelta.summary : 'N/A');

    await provider.postComment(ticket.id, comment);
    logger.info(`Ticket ${ticket.id} completed successfully in ${duration}`);
  } else {
    await provider.transitionStatus(ticket.id, 'failed');

    const errorOutput = (result.error || 'Unknown error').slice(0, 1000);
    const comment = FAILURE_TEMPLATE.replace('{stage}', result.stage || 'unknown')
      .replace('{retries}', String(result.retriesAttempted || 0))
      .replace('{error}', errorOutput);

    await provider.postComment(ticket.id, comment);
    logger.error(`Ticket ${ticket.id} failed at stage: ${result.stage}`);
  }

  publishDashboardEvent('worker:task-complete', {
    ticketId: ticket.id,
    success: result.success,
    duration,
    agent: result.agent,
  });
}

/**
 * Format milliseconds into a human-readable duration.
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

module.exports = { processTicket };
