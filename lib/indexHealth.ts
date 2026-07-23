import { inferTypeFromName } from "./types";

export type IndexHealthCategory = "Excellent" | "Good" | "Needs improvement" | "Critical";

/** One evaluated dimension. deduction is 0 when the check passed — reasoning is always present, for pass or fail. */
export interface IndexHealthCheck {
  dimension: string;
  target: string;
  deduction: number;
  reasoning: string;
}

export interface IndexHealthReport {
  score: number;
  category: IndexHealthCategory;
  checks: IndexHealthCheck[];
}

function isNode(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

interface PropDef {
  key: string;
  label: string;
  pd: Record<string, unknown>;
}

function collectPropertyDefs(def: Record<string, unknown>): PropDef[] {
  const out: PropDef[] = [];
  const rules = def.indexRules;
  if (!isNode(rules)) return out;
  for (const [nodeType, rule] of Object.entries(rules)) {
    if (nodeType === "jcr:primaryType" || !isNode(rule)) continue;
    const props = rule.properties;
    if (!isNode(props)) continue;
    for (const [key, pd] of Object.entries(props)) {
      if (key === "jcr:primaryType" || !isNode(pd)) continue;
      const label = typeof pd.name === "string" ? pd.name : typeof pd.function === "string" ? pd.function : key;
      out.push({ key, label, pd });
    }
  }
  return out;
}

function categorize(score: number): IndexHealthCategory {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 50) return "Needs improvement";
  return "Critical";
}

/**
 * Scores an Oak lucene index definition (the JSON shape produced by generate())
 * from a 100-point baseline, deducting for each structural issue found across
 * the 14 evaluated dimensions. Every check — pass or fail — gets a reasoning
 * string, not just the ones that lose points.
 */
export function evaluateIndexHealth(def: Record<string, unknown>): IndexHealthReport {
  const checks: IndexHealthCheck[] = [];
  const push = (dimension: string, target: string, deduction: number, reasoning: string) =>
    checks.push({ dimension, target, deduction, reasoning });

  const props = collectPropertyDefs(def);
  const includedPaths = Array.isArray(def.includedPaths) ? (def.includedPaths as unknown[]).map(String) : [];
  const hasIncludedPaths = includedPaths.length > 0;

  // includedPaths
  if (!hasIncludedPaths) {
    push("includedPaths", "index root", 15, "No includedPaths defined — the index applies to the entire repository, inflating index size and reindex time. Scope it to the content actually queried.");
  } else if (includedPaths.some((p) => p === "/" || p === "/content")) {
    push("includedPaths", "index root", 8, `includedPaths is set to a very broad root (${includedPaths.join(", ")}) — provides little narrowing benefit over no restriction at all.`);
  } else {
    push("includedPaths", "index root", 0, `includedPaths (${includedPaths.join(", ")}) scopes the index to specific content — good.`);
  }

  // queryPaths
  if (hasIncludedPaths) {
    const queryPaths = Array.isArray(def.queryPaths) ? (def.queryPaths as unknown[]).map(String) : [];
    if (!queryPaths.length) {
      push("queryPaths", "index root", 5, "includedPaths is set but queryPaths is missing — Oak may still consider this index for queries outside includedPaths, risking wrong index selection.");
    } else if (queryPaths.join(",") !== includedPaths.join(",")) {
      push("queryPaths", "index root", 5, `queryPaths (${queryPaths.join(", ")}) differs from includedPaths (${includedPaths.join(", ")}) — verify this divergence is intentional.`);
    } else {
      push("queryPaths", "index root", 0, "queryPaths matches includedPaths — good.");
    }
  } else {
    push("queryPaths", "index root", 0, "No includedPaths set, so queryPaths is not applicable.");
  }

  // ordered
  const orderedNoIndex = props.filter((p) => p.pd.ordered === true && p.pd.propertyIndex !== true);
  if (orderedNoIndex.length) {
    for (const p of orderedNoIndex) {
      push("ordered", p.label, 6, `${p.label} has ordered=true without propertyIndex=true — Oak typically needs propertyIndex alongside ordered for the property to be usable for both filtering and sorting; verify this is intentional.`);
    }
  } else {
    const anyOrdered = props.some((p) => p.pd.ordered === true);
    push("ordered", "all properties", 0, anyOrdered ? "Every ordered property also has propertyIndex=true — good." : "No ordered properties defined.");
  }

  // property types
  const looksLikeDateWrongType = props.filter((p) => inferTypeFromName(p.label) === "Date" && p.pd.type !== "Date");
  for (const p of looksLikeDateWrongType) {
    push("property types", p.label, 6, `${p.label} looks like a date field by name but has no type=Date — string-ordered dates compare lexicographically, not chronologically, breaking range queries and sort order.`);
  }
  if (!looksLikeDateWrongType.length) {
    push("property types", "all properties", 0, "No obviously mistyped properties detected.");
  }

  // propertyIndex (inert definitions)
  const inert = props.filter((p) => !p.pd.propertyIndex && !p.pd.analyzed && !p.pd.ordered && !p.pd.facets && !p.pd.nodeScopeIndex);
  for (const p of inert) {
    push("propertyIndex", p.label, 5, `${p.label} has no propertyIndex, ordered, analyzed, or facets flag — this definition does not contribute to query performance as written. Add the flag the query actually needs, or remove the definition.`);
  }
  if (!inert.length) {
    push("propertyIndex", props.length ? "all properties" : "index root", 0, props.length ? "Every property definition has at least one capability flag set — good." : "No property definitions to evaluate.");
  }

  // analyzed
  const analyzedProps = props.filter((p) => p.pd.analyzed === true);
  if (analyzedProps.length > 5) {
    push("analyzed", `${analyzedProps.length} properties`, 8, `${analyzedProps.length} properties are analyzed — analyzed (tokenized) storage is larger and costlier to index than plain propertyIndex. Verify each one genuinely needs word-level full-text matching.`);
  } else {
    push("analyzed", analyzedProps.length ? `${analyzedProps.length} properties` : "none", 0, analyzedProps.length ? "Analyzed property count is reasonable." : "No analyzed properties.");
  }

  // nodeScopeIndex
  const badNodeScope = props.filter((p) => p.pd.nodeScopeIndex === true && p.pd.analyzed !== true);
  for (const p of badNodeScope) {
    push("nodeScopeIndex", p.label, 8, `${p.label} has nodeScopeIndex=true but analyzed is not set — nodeScopeIndex requires the property to also be analyzed to feed the node's aggregate full-text field.`);
  }
  if (!badNodeScope.length) {
    push("nodeScopeIndex", "all properties", 0, "nodeScopeIndex usage is consistent — always paired with analyzed.");
  }

  // evaluatePathRestrictions
  if (hasIncludedPaths && def.evaluatePathRestrictions !== true) {
    push("evaluatePathRestrictions", "index root", 8, "includedPaths is set but evaluatePathRestrictions is not enabled — path restrictions will be post-filtered over every hit instead of evaluated inside the index.");
  } else {
    push("evaluatePathRestrictions", "index root", 0, def.evaluatePathRestrictions === true ? "evaluatePathRestrictions=true — good." : "Not needed without includedPaths.");
  }

  // null checks
  const nullChecked = props.filter((p) => p.pd.nullCheckEnabled === true);
  for (const p of nullChecked) {
    push("null checks", p.label, 10, `${p.label} has nullCheckEnabled=true — this indexes an entry for every node LACKING the property, which for a common node type can dominate index size. Verify this is genuinely needed.`);
  }
  if (!nullChecked.length) {
    push("null checks", "all properties", 0, "No nullCheckEnabled properties — good.");
  }

  // regex
  const regexDefs = props.filter((p) => p.pd.isRegexp === true);
  for (const p of regexDefs) {
    push("regex", p.label, 8, `Property definition matches via isRegexp=true (pattern '${p.label}') — regex definitions match many properties per node, increasing index size versus explicit named definitions. Use only when genuinely needed (e.g. node-scope full-text).`);
  }
  if (!regexDefs.length) {
    push("regex", "all properties", 0, "No regex-based property definitions — good.");
  }

  // tags
  const tags = def.tags;
  push("tags", "index root", 0, tags
    ? `Index tag set (${JSON.stringify(tags)}) — only needed if Oak was picking the wrong index; verify it's still required.`
    : "No index tag set — fine unless Oak is currently selecting the wrong index for this query.");

  // selectionPolicy
  const selectionPolicy = def.selectionPolicy;
  push("selectionPolicy", "index root", 0, selectionPolicy
    ? `selectionPolicy is set (${JSON.stringify(selectionPolicy)}) — verify it doesn't unexpectedly exclude this index from valid queries.`
    : "No selectionPolicy set — Oak's default cost-based selection applies.");

  // compatVersion
  const compat = def.compatVersion;
  if (compat !== 2) {
    push("compatVersion", "index root", 20, `compatVersion is ${compat === undefined ? "missing" : JSON.stringify(compat)} — compatVersion 2 is required for combined property/ordered/analyzed/facet support and is standard on modern Oak/AEMaaCS; earlier versions are deprecated and limited.`);
  } else {
    push("compatVersion", "index root", 0, "compatVersion=2 — good.");
  }

  // async
  const asyncArr = Array.isArray(def.async) ? (def.async as unknown[]).map(String) : [];
  if (!asyncArr.includes("async")) {
    push("async", "index root", 15, `async is ${asyncArr.length ? JSON.stringify(asyncArr) : "not set"} — without 'async', this index updates synchronously with every commit, adding latency to every write that touches matching content.`);
  } else if (asyncArr.includes("nrt")) {
    push("async", "index root", 0, `async=${JSON.stringify(asyncArr)} — async with near-real-time visibility, good.`);
  } else {
    push("async", "index root", 0, 'async=["async"] — standard asynchronous indexing, good.');
  }

  const totalDeduction = checks.reduce((sum, c) => sum + c.deduction, 0);
  const score = Math.max(0, Math.min(100, 100 - totalDeduction));

  return { score, category: categorize(score), checks };
}
