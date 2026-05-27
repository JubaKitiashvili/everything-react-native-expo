import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// Registers the `docs` content collection Starlight reads from
// `src/content/docs/`. Required since Astro's content-layer loaders.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
