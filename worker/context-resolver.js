'use strict';

/**
 * Resolve context for a ticket — affected files and known files from audit data.
 *
 * @param {object} ticket
 * @param {object} [auditData]
 * @param {object} [stackInfo]
 * @returns {{ affectedFiles: string[], knownFiles: string[] }}
 */
function resolveContext(ticket, auditData, stackInfo) {
  const affectedFiles = [];
  const knownFiles = [];

  // Extract file references from description
  const desc = (ticket && ticket.description) || '';
  const fileRe = /(?:^|\s)([\w./-]+\.\w{1,5})(?:\s|$|,|:)/g;
  let match;
  while ((match = fileRe.exec(desc)) !== null) {
    affectedFiles.push(match[1]);
  }

  // Gather known files from audit data
  if (auditData && Array.isArray(auditData.files)) {
    for (const f of auditData.files) {
      knownFiles.push(typeof f === 'string' ? f : f.file || '');
    }
  }

  return { affectedFiles, knownFiles };
}

module.exports = { resolveContext };
