#!/usr/bin/env node

/**
 * Daily React Native & Expo News Scanner
 *
 * Scans multiple sources for RN/Expo updates, analyzes relevance to ERNE,
 * and creates ClickUp tasks for actionable items.
 *
 * Sources:
 * - GitHub releases (react-native, expo, key libraries)
 * - React Native blog RSS
 * - Expo blog RSS
 * - GitHub trending repos
 */

const SOURCES = {
  github_releases: [
    'facebook/react-native',
    'expo/expo',
    'expo/router',
    'software-mansion/react-native-reanimated',
    'software-mansion/react-native-screens',
    'Shopify/flash-list',
    'callstack/react-native-paper',
    'react-native-community/cli',
    'mrousavy/react-native-vision-camera',
    'margelo/react-native-nitro-modules',
  ],
  rss_feeds: [
    'https://reactnative.dev/blog/rss.xml',
    'https://blog.expo.dev/feed',
  ],
};

const CLICKUP_API = 'https://api.clickup.com/api/v2';

async function fetchGitHubReleases(repo) {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/releases?per_page=3`,
    {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );
  if (!res.ok) return [];
  const releases = await res.json();

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return releases
    .filter((r) => new Date(r.published_at).getTime() > oneDayAgo)
    .map((r) => ({
      type: 'release',
      source: repo,
      title: `${repo} ${r.tag_name}`,
      body: r.body?.slice(0, 1000) || '',
      url: r.html_url,
      date: r.published_at,
    }));
}

async function fetchRSS(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const xml = await res.text();

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/);
      const link = item.match(/<link>(.*?)<\/link>/);
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/);
      const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/);

      if (title && pubDate) {
        const date = new Date(pubDate[1]);
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (date.getTime() > oneDayAgo) {
          items.push({
            type: 'blog',
            source: new URL(url).hostname,
            title: title[1] || title[2],
            body: (desc?.[1] || desc?.[2] || '').slice(0, 500),
            url: link?.[1] || '',
            date: date.toISOString(),
          });
        }
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function analyzeRelevance(items) {
  if (items.length === 0) return [];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `You are analyzing React Native & Expo news for the ERNE project (an AI coding agent harness for RN/Expo development with agents, skills, rules, commands, and hooks).

Analyze these items and return ONLY a JSON array of relevant ones. For each relevant item include:
- "title": short task title
- "description": why this matters for ERNE (1-2 sentences)
- "priority": "urgent" | "high" | "normal" | "low"
- "action": what ERNE should do about it
- "source_url": original URL

Items to analyze:
${JSON.stringify(items, null, 2)}

Return JSON array only. If nothing is relevant, return [].`,
        },
      ],
    }),
  });

  if (!res.ok) {
    console.error('Claude API error:', res.status);
    return [];
  }

  const data = await res.json();
  const text = data.content[0].text;

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    console.error('Failed to parse Claude response');
    return [];
  }
}

async function createClickUpTask(task) {
  const listId = process.env.CLICKUP_LIST_ID;
  if (!listId) {
    console.log('CLICKUP_LIST_ID not set, skipping task creation');
    console.log('Task:', task.title);
    return;
  }

  const priorityMap = { urgent: 1, high: 2, normal: 3, low: 4 };

  const res = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: process.env.CLICKUP_API_TOKEN,
    },
    body: JSON.stringify({
      name: task.title,
      markdown_description: [
        `## Why This Matters`,
        task.description,
        '',
        `## Action Required`,
        task.action,
        '',
        `**Source:** [${task.source_url}](${task.source_url})`,
        '',
        `---`,
        `*Auto-generated by ERNE Daily Scanner*`,
      ].join('\n'),
      priority: priorityMap[task.priority] || 3,
    }),
  });

  if (res.ok) {
    const data = await res.json();
    console.log(`Created task: ${task.title} (${data.id})`);
  } else {
    console.error(`Failed to create task: ${task.title}`, res.status);
  }
}

async function main() {
  console.log('=== ERNE Daily RN/Expo News Scanner ===');
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Gather news from all sources
  const allItems = [];

  // GitHub releases
  console.log('Fetching GitHub releases...');
  for (const repo of SOURCES.github_releases) {
    const releases = await fetchGitHubReleases(repo);
    allItems.push(...releases);
    if (releases.length > 0) {
      console.log(`  ${repo}: ${releases.length} new release(s)`);
    }
  }

  // RSS feeds
  console.log('Fetching RSS feeds...');
  for (const feed of SOURCES.rss_feeds) {
    const posts = await fetchRSS(feed);
    allItems.push(...posts);
    if (posts.length > 0) {
      console.log(`  ${new URL(feed).hostname}: ${posts.length} new post(s)`);
    }
  }

  console.log(`\nTotal items found: ${allItems.length}`);

  if (allItems.length === 0) {
    console.log('No new items today. Exiting.');
    return;
  }

  // Analyze relevance with Claude
  console.log('\nAnalyzing relevance with Claude...');
  const relevant = await analyzeRelevance(allItems);
  console.log(`Relevant items: ${relevant.length}`);

  // Create ClickUp tasks
  if (relevant.length > 0) {
    console.log('\nCreating ClickUp tasks...');
    for (const task of relevant) {
      await createClickUpTask(task);
    }
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Scanner failed:', err);
  process.exit(1);
});
