import { ExplainInfo, PropRestriction, QueryModel, SelectorPropertyWarning, SQL2SelectorModel } from "./types";

export type Target = "cloud" | "65";

/** Warnings derivable purely from the parsed query model + explain info (no index-def decisions involved). */
export function buildWarnings(model: QueryModel, explain: ExplainInfo, props: PropRestriction[]): string[] {
  const warnings: string[] = [];

  if (model.nodeType === "nt:base") {
    warnings.push(
      "Node type not restricted (nt:base). An nt:base index rule matches every node in the repository — index size and maintenance cost will be large. Add a node type restriction to the query if at all possible."
    );
  }
  if (!model.paths.length) {
    warnings.push(
      "Path restriction missing. Without ISDESCENDANTNODE / path= the index cannot use includedPaths and the query cannot narrow by path — add one (e.g. /content/yoursite)."
    );
  } else if (model.paths.some((p) => p === "/" || p === "/content")) {
    warnings.push(
      "Large includedPaths (" + model.paths.join(", ") + "). Indexing all of /content (or /) grows the index and slows reindexing — restrict to the deepest stable path you can."
    );
  }
  if (model.join) {
    warnings.push(
      "JOIN detected. Oak evaluates joins by running each side separately and merging in memory — a single index cannot optimize the join itself. Each join selector needs its own matching index; consider denormalizing the joined property onto one node type."
    );
  }
  if (model.leadingWildcards > 0) {
    warnings.push(
      `LIKE / nodename with a leading wildcard (${model.leadingWildcards}x). Leading-% forces a scan over all indexed values for that property — the index bounds the scan but cannot seek. Prefer full-text (CONTAINS) or restructure the value.`
    );
  }
  const plainLike = props.filter((p) => p.ops.includes("like"));
  if (plainLike.length && model.leadingWildcards === 0) {
    warnings.push(
      "LIKE detected. Even with a bound prefix, LIKE is evaluated as a range+filter over the property index — measurably slower than equality. If you need word matching, use CONTAINS with analyzed=true instead."
    );
  }
  if (model.orCount >= 3) {
    warnings.push(
      `Too many OR branches (${model.orCount + 1} unions). Oak rewrites OR into a union of sub-queries; each branch is planned separately. Every branch must be coverable by this index or a traversal appears in one branch. Verify each OR branch hits an indexed property.`
    );
  }
  if (model.nodeScopeFulltext && props.some((p) => p.ordered || p.ops.includes("range"))) {
    warnings.push(
      "Fulltext mixed with property/range restrictions. This is fine in one lucene index, but confirm ALL non-fulltext restrictions are in this same index — Oak cannot combine a fulltext index with a separate property index for one query."
    );
  }
  for (const fn of model.unsupportedFns) {
    warnings.push(`${fn} is not supported by lucene property indexes — this condition will be post-filtered in memory over all index hits.`);
  }
  if (explain.provided && explain.traversal) {
    warnings.push("Explain output shows TRAVERSAL — no existing index covers this query today. Deploying the generated index removes the traversal.");
  }
  if (!props.length && !model.nodeScopeFulltext && !model.indexNodeName) {
    warnings.push("No property, fulltext or nodename restrictions detected — nothing to index beyond node type + path. Check the query or the parser notes.");
  }

  return warnings;
}

/** Suggestions derivable purely from the query model + deploy target (no index-def decisions involved). */
export function buildSuggestions(target: Target, indexName: string, model: QueryModel): string[] {
  const suggestions: string[] = [];

  if (target === "cloud") {
    suggestions.push(`AEMaaCS naming: '${indexName}' follows the required <name>-custom-<version> convention; deploy under /oak:index in ui.apps — Cloud Manager triggers reindexing automatically. Never set reindex=true in the package on AEMaaCS.`);
  } else {
    suggestions.push("AEM 6.5: after deploying, set reindex=true once (or use oak-run for large repositories) — reindex is not included in the definition on purpose.");
  }
  suggestions.push("Deliberately omitted: tags, selectionPolicy, costPerEntry/costPerExecution. Add an index tag + option(index tag ...) only if Oak picks the wrong index; cost overrides are a last resort and mask real problems.");
  if (model.orCount >= 1) {
    suggestions.push("OR branches: all branches here reference the same node type, so one index with all involved properties covers every union branch — separate indexes are NOT needed. Multiple indexes are only required when OR spans different node types.");
  }
  for (const n of model.notes) suggestions.push(n);

  return suggestions;
}

/** Heuristic before/after query-cost scores (0-100), independent of the generated index definition's exact shape. */
export function scoreQuery(model: QueryModel, explain: ExplainInfo, props: PropRestriction[]): { before: number; after: number } {
  let before = 90;
  if (props.length || model.nodeScopeFulltext || model.indexNodeName) before -= 45; // would traverse / mis-index without the generated index
  if (!model.paths.length) before -= 15;
  before -= Math.min(20, model.leadingWildcards * 8);
  if (model.join) before -= 10;
  before -= Math.min(15, Math.max(0, model.orCount - 1) * 4);
  before -= Math.min(10, model.unsupportedFns.length * 5);
  if (explain.provided && explain.traversal) before = Math.min(before, 15);
  before = Math.max(5, Math.min(95, before));

  let after = 100;
  if (model.join) after -= 20;
  after -= Math.min(24, model.leadingWildcards * 8);
  if (model.orCount >= 4) after -= 8;
  after -= Math.min(15, model.unsupportedFns.length * 5);
  if (!model.paths.length) after -= 6;
  if (model.nodeType === "nt:base") after -= 10;
  after = Math.max(30, Math.min(99, after));

  return { before, after };
}

/**
 * Cross-references the flat QueryModel (which parseSQL2 attributes entirely to
 * model.nodeType, regardless of which JOIN selector a property actually came
 * from) against the per-selector SQL2SelectorModel, and flags every queried
 * property whose real owning selector's node type isn't covered by ANY rule
 * in the actual generated indexDef. generate() now creates a separate
 * indexRules entry per JOIN selector when it can, so this only fires for a
 * genuine remaining gap (e.g. unresolved/ambiguous ownership) — not merely
 * because the property came from a different selector than the primary one.
 * Analysis only — does not affect index generation.
 */
export function buildSelectorPropertyWarnings(
  model: QueryModel,
  selectorModel: SQL2SelectorModel,
  indexDef: Record<string, unknown>
): SelectorPropertyWarning[] {
  const warnings: SelectorPropertyWarning[] = [];
  if (selectorModel.selectors.length < 2) return warnings; // nothing to cross-check without a JOIN

  const target = selectorModel.selectors.find((s) => s.nodeType === model.nodeType) ?? selectorModel.selectors[0];
  const indexRules = indexDef.indexRules;
  const coveredNodeTypes = new Set(
    indexRules && typeof indexRules === "object" && !Array.isArray(indexRules)
      ? Object.keys(indexRules).filter((k) => k !== "jcr:primaryType")
      : []
  );

  for (const p of Object.values(model.props)) {
    const owners = selectorModel.selectors.filter((s) => s.properties.includes(p.name));
    if (!owners.length) continue;               // unresolved ownership — don't guess
    if (owners.some((s) => s.alias === target.alias)) continue; // the index's own selector already owns it

    const owner = owners[0];
    if (coveredNodeTypes.has(owner.nodeType)) continue; // generate() already created a rule for this selector's node type — no gap
    const viaChildJoin = selectorModel.joins.some(
      (j) =>
        ((j.left === target.alias && j.right === owner.alias) || (j.left === owner.alias && j.right === target.alias)) &&
        /ischildnode/i.test(j.condition)
    );

    warnings.push({
      property: p.name,
      owningSelector: owner.alias,
      owningNodeType: owner.nodeType,
      generatedIndexNodeType: model.nodeType,
      viaChildJoin,
      recommendation: viaChildJoin
        ? `Use relative property jcr:content/${p.name}, or create an index rule for ${owner.nodeType} (selector '${owner.alias}').`
        : `Create an index rule for ${owner.nodeType} (selector '${owner.alias}') — this property cannot be indexed under ${model.nodeType}.`
    });
  }

  return warnings;
}
