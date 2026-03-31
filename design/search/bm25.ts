export interface SearchDocument {
  id: string;
  text: string;
  category: string;
}

export interface SearchResult {
  id: string;
  score: number;
  category: string;
  text: string;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

export class BM25 {
  private k1: number;
  private b: number;
  private docs: SearchDocument[] = [];
  private docLengths: number[] = [];
  private avgDl = 0;
  private docFreqs: Map<string, number> = new Map();
  private termFreqs: Array<Map<string, number>> = [];

  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
  }

  index(documents: SearchDocument[]): void {
    this.docs = documents;
    this.docLengths = [];
    this.docFreqs = new Map();
    this.termFreqs = [];

    let totalLength = 0;

    for (const doc of documents) {
      const tokens = tokenize(doc.text);
      this.docLengths.push(tokens.length);
      totalLength += tokens.length;

      const tf = new Map<string, number>();
      const seen = new Set<string>();

      for (const token of tokens) {
        tf.set(token, (tf.get(token) ?? 0) + 1);
        if (!seen.has(token)) {
          seen.add(token);
          this.docFreqs.set(token, (this.docFreqs.get(token) ?? 0) + 1);
        }
      }

      this.termFreqs.push(tf);
    }

    this.avgDl = documents.length > 0 ? totalLength / documents.length : 0;
  }

  search(query: string, maxResults = 10, category?: string): SearchResult[] {
    const queryTokens = tokenize(query);
    const scores: Array<{ index: number; score: number }> = [];
    const nDocs = this.docs.length;

    for (let i = 0; i < nDocs; i++) {
      if (category && this.docs[i].category !== category) continue;

      let score = 0;
      const dl = this.docLengths[i];
      const tf = this.termFreqs[i];

      for (const token of queryTokens) {
        const termFreq = tf.get(token) ?? 0;
        if (termFreq === 0) continue;

        const df = this.docFreqs.get(token) ?? 0;
        const idf = Math.log((nDocs - df + 0.5) / (df + 0.5) + 1.0);
        const numerator = termFreq * (this.k1 + 1);
        const denominator = termFreq + this.k1 * (1 - this.b + this.b * dl / this.avgDl);
        score += idf * numerator / denominator;
      }

      if (score > 0) {
        scores.push({ index: i, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, maxResults).map((s) => ({
      id: this.docs[s.index].id,
      score: s.score,
      category: this.docs[s.index].category,
      text: this.docs[s.index].text,
    }));
  }
}
