// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Documentation site for @erne/monitor.
// Starlight fails the build on broken internal links (link validation is on
// by default for `[text](/path)` links resolved against the content collection),
// so a successful `astro build` is also a broken-link check.
export default defineConfig({
  site: 'https://erne.dev',
  // Keep the published path namespaced so it can live under a docs subpath
  // without colliding with the marketing site. Use a relative root in dev.
  base: '/',
  integrations: [
    starlight({
      title: '@erne/monitor',
      description:
        'Runtime intelligence for React Native & Expo — crash, ANR, performance, ' +
        'and session monitoring, AI-assisted fix PRs, MCP integration, and a ' +
        'self-hostable dashboard. RN/Expo-first, self-hosted by default, MIT.',
      tagline: 'Runtime intelligence for React Native & Expo.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/JubaKitiashvili',
        },
      ],
      // Validate internal links at build time and fail on any that don't resolve.
      // (Starlight's default behaviour; declared explicitly so it is never
      // silently relaxed by a future config edit.)
      sidebar: [
        {
          label: 'Overview',
          items: [{ label: 'What is @erne/monitor?', link: '/' }],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Getting started', slug: 'getting-started' },
            { label: 'SDK configuration', slug: 'sdk-configuration' },
            { label: 'Self-hosting the dashboard', slug: 'self-hosting' },
            { label: 'MCP integration', slug: 'mcp-integration' },
          ],
        },
      ],
    }),
  ],
});
