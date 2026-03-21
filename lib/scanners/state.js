// lib/scanners/state.js — State management scanner for ERNE audit
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Scan state management patterns: Zustand stores, React contexts, React Query keys.
 * @param {string} cwd - Project root
 * @param {string[]} sourceFiles - Relative paths to source files
 * @returns {{ stores: object[], contexts: object[], queryKeys: object[] }}
 */
function scanState(cwd, sourceFiles) {
  const resolvedCwd = path.resolve(cwd);
  const stores = [];
  const contexts = [];
  const queryKeys = [];

  for (const relFile of sourceFiles) {
    const filePath = path.join(resolvedCwd, relFile);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    // --- Zustand stores ---
    if (content.includes('zustand') || content.includes("from 'zustand'") || content.includes('from "zustand"')) {
      const createRe = /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*create\s*(?:<[^>]*>)?\s*\(/g;
      let match;
      while ((match = createRe.exec(content)) !== null) {
        const storeName = match[1];
        // Extract action names: look for key: value patterns that are functions
        const actions = [];
        // Find the create() body — rough heuristic: from match to balanced paren
        const startIdx = match.index;
        const bodyStart = content.indexOf('(', startIdx + match[0].length - 1);
        if (bodyStart !== -1) {
          // Extract method-like keys: name: (...) => or name(...) { or name: function
          const bodySnippet = content.substring(bodyStart, Math.min(bodyStart + 2000, content.length));
          const actionRe = /(\w+)\s*:\s*(?:\([^)]*\)\s*=>|function)/g;
          let actionMatch;
          while ((actionMatch = actionRe.exec(bodySnippet)) !== null) {
            const name = actionMatch[1];
            // Skip set/get/state internal names
            if (name !== 'set' && name !== 'get' && name !== 'state') {
              actions.push(name);
            }
          }
        }
        stores.push({ name: storeName, file: relFile, actions });
      }
    }

    // --- React contexts ---
    const contextRe = /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:React\.)?createContext/g;
    let ctxMatch;
    while ((ctxMatch = contextRe.exec(content)) !== null) {
      contexts.push({ name: ctxMatch[1], file: relFile });
    }

    // --- React Query keys ---
    const useQueryRe = /useQuery\s*(?:<[^>]*>)?\s*\(\s*\[?\s*[`'"](.*?)[`'"]/g;
    let queryMatch;
    while ((queryMatch = useQueryRe.exec(content)) !== null) {
      queryKeys.push({ key: queryMatch[1], file: relFile, type: 'query' });
    }

    const useMutationRe = /useMutation\s*(?:<[^>]*>)?\s*\(\s*\{[^}]*mutationKey\s*:\s*\[?\s*[`'"](.*?)[`'"]/g;
    let mutMatch;
    while ((mutMatch = useMutationRe.exec(content)) !== null) {
      queryKeys.push({ key: mutMatch[1], file: relFile, type: 'mutation' });
    }
  }

  return { stores, contexts, queryKeys };
}

module.exports = scanState;
