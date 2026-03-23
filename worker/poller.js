'use strict';

const { publishDashboardEvent } = require('./dashboard-events');

/**
 * Create a polling loop that fetches tickets from a provider.
 *
 * @param {object} options
 * @param {object} options.provider - TicketProvider instance (fetchReadyTickets)
 * @param {number} options.intervalMs - Milliseconds between polls
 * @param {object} options.logger - Logger instance
 * @param {function} options.onTicket - Async callback invoked with the first ready ticket
 * @returns {{ start: () => Promise<void>, stop: () => void }}
 */
function createPoller({ provider, intervalMs, logger, onTicket, providerType, repoPath }) {
  let isRunning = false;
  let wakeSleep = null;

  /**
   * Sleep that can be interrupted by stop().
   */
  function interruptibleSleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      wakeSleep = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  async function start() {
    isRunning = true;
    publishDashboardEvent('worker:start', {
      intervalMs,
      provider: providerType || 'unknown',
      repo: repoPath || '',
    });

    while (isRunning) {
      let tickets = [];
      try {
        tickets = await provider.fetchReadyTickets();
      } catch (err) {
        logger.error(`Poll failed: ${err.message}`);
        if (!isRunning) break;
        await interruptibleSleep(intervalMs);
        continue;
      }

      publishDashboardEvent('worker:poll', { ticketsFound: tickets.length });

      if (tickets.length > 0) {
        await onTicket(tickets[0]);
      } else {
        publishDashboardEvent('worker:idle', { nextPollIn: intervalMs });
      }

      if (!isRunning) break;
      await interruptibleSleep(intervalMs);
    }
  }

  function stop() {
    isRunning = false;
    if (wakeSleep) {
      wakeSleep();
      wakeSleep = null;
    }
  }

  return { start, stop };
}

module.exports = { createPoller };
