'use strict';

/**
 * @typedef {Object} Ticket
 * @property {string|number} id - Provider-specific unique identifier
 * @property {string} identifier - Human-readable identifier (e.g. '#42', 'PROJ-123', 'ENG-456')
 * @property {string} title - Ticket title / summary
 * @property {string} [description] - Full description or body text
 * @property {string[]} [labels] - Associated labels or tags
 * @property {string} [type] - Ticket type (bug, feature, task, etc.)
 * @property {string} [priority] - Priority level (urgent, high, normal, low)
 * @property {string} [url] - Web URL to the ticket
 * @property {string} providerName - Source provider ('github'|'linear'|'clickup'|'jira'|'gitlab')
 */

/**
 * @typedef {Object} TicketProvider
 * @property {() => Promise<Ticket[]>} fetchReadyTickets - Fetch tickets ready for agent processing
 * @property {(id: string|number, status: string) => Promise<void>} transitionStatus - Move ticket to a new status
 * @property {(id: string|number, body: string) => Promise<void>} postComment - Add a comment to a ticket
 */

// Re-export for documentation — no runtime code
module.exports = {};
