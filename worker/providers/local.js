'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Local JSON file provider for testing.
 * Reads tickets from a JSON file, supports status transitions via file updates.
 *
 * Config:
 *   provider.file — path to JSON file (default: './worker-tasks.json')
 *
 * File format:
 * {
 *   "tickets": [
 *     {
 *       "id": "local-1",
 *       "title": "Fix login button",
 *       "description": "The login button is not responding...",
 *       "type": "bug",
 *       "status": "ready",
 *       "labels": ["bug", "auth"],
 *       "priority": "high"
 *     }
 *   ]
 * }
 *
 * Statuses: ready → in_progress → done | failed
 */

function createLocalProvider(providerConfig, logger) {
  const filePath = path.resolve(providerConfig.file || './worker-tasks.json');

  function readTasks() {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      return data.tickets || [];
    } catch (err) {
      logger.warn(`Could not read local tasks file: ${err.message}`);
      return [];
    }
  }

  function writeTasks(tickets) {
    fs.writeFileSync(filePath, JSON.stringify({ tickets }, null, 2) + '\n', 'utf-8');
  }

  function updateTicketStatus(ticketId, newStatus) {
    const tickets = readTasks();
    const ticket = tickets.find((t) => t.id === ticketId);
    if (ticket) {
      ticket.status = newStatus;
      writeTasks(tickets);
    }
  }

  return {
    async fetchReadyTickets() {
      const tickets = readTasks();
      const ready = tickets.filter((t) => t.status === 'ready');
      logger.info(`Local provider: ${ready.length} ready ticket(s) in ${filePath}`);
      return ready.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description || '',
        type: t.type || 'task',
        labels: t.labels || [],
        priority: t.priority || 'medium',
        url: `file://${filePath}#${t.id}`,
      }));
    },

    async transitionStatus(ticketId, status) {
      updateTicketStatus(ticketId, status);
      logger.info(`Local provider: ticket ${ticketId} → ${status}`);
    },

    async postComment(ticketId, comment) {
      // Append comment to ticket's comments array
      const tickets = readTasks();
      const ticket = tickets.find((t) => t.id === ticketId);
      if (ticket) {
        if (!ticket.comments) ticket.comments = [];
        ticket.comments.push({
          timestamp: new Date().toISOString(),
          body: comment,
        });
        writeTasks(tickets);
      }
      logger.info(`Local provider: comment added to ${ticketId}`);
    },
  };
}

module.exports = { createLocalProvider };
