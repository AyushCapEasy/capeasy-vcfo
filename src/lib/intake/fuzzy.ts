// src/lib/intake/fuzzy.ts — fuzzy suggestion of a canonical category for a source account,
// assisting (never replacing) the analyst's one-time mapping (Bible §3.2, §3.4). No deps.
//
// Key idea: multi-word synonyms (e.g. "cost of services") are matched as PHRASES by containment,
// not tokenized into individual words — otherwise generic words like "services"/"cost"/"sales" leak
// between categories (COGS "cost of services" vs revenue "Sales – Services"). Single words and
// distinctive name words drive token matching; accounting-generic words are stoplisted from the
// category vocabulary so they can't create spurious hits.
import { CATEGORY_SYNONYMS } from './categories';
import type { CategoryMeta } from './types';

const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'to', 'for', 'on', 'ac', 'c', 'account']);
// Generic accounting words removed from a category's *word* vocabulary (still usable inside phrases).
const GENERIC = new Set(['cost', 'other', 'services', 'service', 'general', 'misc', 'miscellaneous', 'total', 'expense']);

const stem = (t: string) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t);
const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
function tokens(s: string, dropGeneric = false): string[] {
  return normText(s)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t) && (!dropGeneric || !GENERIC.has(t)))
    .map(stem);
}

/** Levenshtein distance (small strings only). */
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function wordSim(token: string, vocab: Set<string>): number {
  if (vocab.has(token)) return 1;
  let best = 0;
  for (const v of vocab) {
    if (token.length >= 4 && (v.includes(token) || token.includes(v))) best = Math.max(best, 0.85);
    else {
      const d = lev(token, v);
      const sim = 1 - d / Math.max(token.length, v.length);
      if (sim > 0.8) best = Math.max(best, sim * 0.8);
    }
  }
  return best;
}

type Vocab = { words: Set<string>; phrases: string[] };
function buildVocab(c: CategoryMeta): Vocab {
  const words = new Set<string>(tokens(c.name, true)); // distinctive name words
  const phrases: string[] = [normText(c.name)];
  for (const syn of CATEGORY_SYNONYMS[c.code] ?? []) {
    const n = normText(syn);
    if (n.includes(' ')) phrases.push(n.split(' ').map(stem).join(' '));
    else tokens(syn, true).forEach((w) => words.add(w));
  }
  return { words, phrases };
}

export type Suggestion = { code: string; name: string; score: number };

export function suggestCategories(
  source: { code: string; name: string },
  categories: CategoryMeta[],
  topN = 3
): Suggestion[] {
  const srcText = tokens(`${source.name} ${source.code}`).join(' ');
  const srcTokens = tokens(`${source.name} ${source.code}`);

  const ranked = categories
    .map((c) => {
      const { words, phrases } = buildVocab(c);
      // Phrase containment (either direction) is the strongest signal.
      let phraseScore = 0;
      for (const p of phrases) {
        if (!p) continue;
        if (srcText.includes(p) || (p.length >= 4 && p.includes(srcText) && srcText.length >= 4)) {
          phraseScore = Math.max(phraseScore, 1);
        }
      }
      const wordScore = srcTokens.length
        ? srcTokens.reduce((s, t) => s + wordSim(t, words), 0) / srcTokens.length
        : 0;
      return { code: c.code, name: c.name, score: Math.max(phraseScore, wordScore) };
    })
    .filter((s) => s.score > 0.15)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, topN);
}
