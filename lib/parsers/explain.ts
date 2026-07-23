import { ExplainCostReport, ExplainIndexCandidate, ExplainInfo } from "../types";

export function parseExplain(text: string): ExplainInfo {
  const t = (text || "").trim();
  if (!t) return { provided: false, traversal: false };
  const info: ExplainInfo = { provided: true, traversal: false };
  if (/\btraverse\b/i.test(t) || /no-index/i.test(t)) info.traversal = true;
  const idx = t.match(/\/oak:index\/([\w:\-.]+)/);
  if (idx) info.usedIndex = idx[1];
  return info;
}

/**
 * Parses a per-index cost breakdown, e.g.:
 *   [damAssetLucene] cost=23
 *   [customLucene] cost=91
 * Oak's query optimizer always picks the lowest-cost candidate, so the
 * chosen index is derived as the minimum-cost entry (no explicit "chosen"
 * marker is required in the input). Additive to, and independent of,
 * parseExplain — that function still handles the single-index / traversal
 * detection format used elsewhere in this app.
 */
export function parseExplainCosts(text: string): ExplainCostReport {
  const candidates: ExplainIndexCandidate[] = [];
  const parseErrors: string[] = [];
  const t = (text || "").trim();
  if (!t) return { candidates, chosen: null, rejected: [], parseErrors };

  const re = /\[([\w:\-.]+)\]\s*cost\s*=\s*(-?\d+(?:\.\d+)?)/gi;
  for (const m of t.matchAll(re)) {
    candidates.push({ name: m[1], cost: parseFloat(m[2]), raw: m[0].trim() });
  }

  if (!candidates.length) {
    parseErrors.push("No '[indexName] cost=N' lines found — paste Oak's per-index cost breakdown, e.g. '[damAssetLucene] cost=23'.");
    return { candidates, chosen: null, rejected: [], parseErrors };
  }

  const chosen = candidates.reduce((min, c) => (c.cost < min.cost ? c : min), candidates[0]);
  const rejected = candidates.filter((c) => c !== chosen);
  return { candidates, chosen, rejected, parseErrors };
}
