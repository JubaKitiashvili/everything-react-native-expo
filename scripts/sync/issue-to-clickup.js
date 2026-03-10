#!/usr/bin/env node

/**
 * GitHub Issue → ClickUp Task Sync
 *
 * Routes issues to the correct ClickUp list based on labels:
 * - bug → Dev Tasks
 * - enhancement, feature → Backlog
 * - partnership → Discussion
 * - skill-proposal → Backlog
 * - discussion, question → Discussion
 * - Default → Backlog
 */

const CLICKUP_API = 'https://api.clickup.com/api/v2';

const LABEL_TO_LIST = {
  bug: process.env.CLICKUP_DEV_LIST_ID,
  enhancement: process.env.CLICKUP_BACKLOG_LIST_ID,
  'skill-proposal': process.env.CLICKUP_BACKLOG_LIST_ID,
  partnership: process.env.CLICKUP_DISCUSSION_LIST_ID,
  discussion: process.env.CLICKUP_DISCUSSION_LIST_ID,
  question: process.env.CLICKUP_DISCUSSION_LIST_ID,
};

const LABEL_TO_PRIORITY = {
  bug: 2, // high
  enhancement: 3, // normal
  'skill-proposal': 3,
  partnership: 3,
  discussion: 4, // low
  question: 4,
};

function getListId(labels) {
  const labelList = labels.split(',').map((l) => l.trim().toLowerCase());
  for (const label of labelList) {
    if (LABEL_TO_LIST[label]) return LABEL_TO_LIST[label];
  }
  return process.env.CLICKUP_BACKLOG_LIST_ID;
}

function getPriority(labels) {
  const labelList = labels.split(',').map((l) => l.trim().toLowerCase());
  for (const label of labelList) {
    if (LABEL_TO_PRIORITY[label]) return LABEL_TO_PRIORITY[label];
  }
  return 3; // normal
}

async function createClickUpTask() {
  const { ISSUE_TITLE, ISSUE_BODY, ISSUE_URL, ISSUE_LABELS, ISSUE_NUMBER, ISSUE_AUTHOR } =
    process.env;

  const listId = getListId(ISSUE_LABELS || '');
  if (!listId) {
    console.error('No ClickUp list ID configured for labels:', ISSUE_LABELS);
    process.exit(1);
  }

  const priority = getPriority(ISSUE_LABELS || '');
  const labels = (ISSUE_LABELS || '').split(',').filter(Boolean);

  const description = [
    `## GitHub Issue #${ISSUE_NUMBER}`,
    '',
    `**Author:** @${ISSUE_AUTHOR}`,
    `**Labels:** ${labels.length > 0 ? labels.join(', ') : 'none'}`,
    `**Link:** [#${ISSUE_NUMBER} on GitHub](${ISSUE_URL})`,
    '',
    '---',
    '',
    ISSUE_BODY || '*No description provided*',
    '',
    '---',
    `*Synced from GitHub by ERNE Issue Sync*`,
  ].join('\n');

  const res = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: process.env.CLICKUP_API_TOKEN,
    },
    body: JSON.stringify({
      name: `[GH-${ISSUE_NUMBER}] ${ISSUE_TITLE}`,
      markdown_description: description,
      priority,
    }),
  });

  if (res.ok) {
    const data = await res.json();
    console.log(`Created ClickUp task: ${data.id} for GitHub issue #${ISSUE_NUMBER}`);
    console.log(`  List: ${listId}`);
    console.log(`  Priority: ${priority}`);
    console.log(`  Labels: ${labels.join(', ')}`);
  } else {
    const err = await res.text();
    console.error(`Failed to create ClickUp task:`, res.status, err);
    process.exit(1);
  }
}

createClickUpTask().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
