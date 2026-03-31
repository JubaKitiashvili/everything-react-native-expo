import { BM25, type SearchResult } from './bm25';
import { getAllSearchableContent } from '../hig';

let engine: BM25 | null = null;

function getEngine(): BM25 {
  if (!engine) {
    engine = new BM25();
    engine.index(getAllSearchableContent());
  }
  return engine;
}

export function searchHig(query: string, maxResults = 10, category?: string): SearchResult[] {
  return getEngine().search(query, maxResults, category);
}

export { BM25, type SearchResult };
