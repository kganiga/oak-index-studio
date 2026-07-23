import { QualityIssue, QueryModel, SQL2SelectorModel } from "./types";

const IN_CLAUSE_THRESHOLD = 8;
const LARGE_ORDER_BY_THRESHOLD = 3;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

/**
 * Detects common Oak/lucene query-quality problems and explains each one —
 * problem, why it hurts Oak, a recommended rewrite, and a rough performance
 * impact. Read-only: never rewrites the query, only reports on it.
 */
export function analyzeQueryQuality(
  model: QueryModel,
  rawQuery: string,
  selectorModel?: SQL2SelectorModel | null
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const isSQL2 = model.source === "SQL2";
  const q = (rawQuery || "").replace(/\s+/g, " ");

  // LIKE '%abc%' — wildcard on both ends of the value.
  const bothWildcards = countMatches(q, /(?:\blike|jcr:like)[\s\S]{0,40}?'%[^%']*%'/gi);
  if (bothWildcards > 0) {
    issues.push({
      category: "like-wildcard-both",
      problem: `LIKE with a wildcard on both sides of the value (${bothWildcards}x, e.g. '%abc%').`,
      why: "There is no fixed prefix to seek on, so Oak scans every indexed value for that property — cost scales with index size, not result size.",
      recommendedRewrite: "Use CONTAINS(property, 'abc') with analyzed=true for substring/word matching instead of LIKE.",
      performanceImpact: "high"
    });
  }

  // LOWER()
  const lowerProps = Object.values(model.props).filter((p) => p.func === "lower");
  if (lowerProps.length) {
    issues.push({
      category: "lower-function",
      problem: `LOWER(${lowerProps.map((p) => p.name).join(", ")}) wraps ${lowerProps.length > 1 ? "indexed properties" : "an indexed property"} in a case-folding function.`,
      why: "Oak can only use the index if the property definition carries a matching function=lower([...]) entry; without it the condition is post-filtered over every candidate node from the rule.",
      recommendedRewrite: "Store an already-lowercased copy of the value at write time if you control the content model; otherwise ensure the generated index includes the function=lower([...]) definition (it does, below).",
      performanceImpact: "medium"
    });
  }

  // UPPER()
  const upperProps = Object.values(model.props).filter((p) => p.func === "upper");
  if (upperProps.length) {
    issues.push({
      category: "upper-function",
      problem: `UPPER(${upperProps.map((p) => p.name).join(", ")}) wraps ${upperProps.length > 1 ? "indexed properties" : "an indexed property"} in a case-folding function.`,
      why: "Same as LOWER(): requires a matching function=upper([...]) property definition, or the condition is post-filtered over every candidate node.",
      recommendedRewrite: "Prefer a consistent stored case for the value; otherwise ensure the generated index includes the function=upper([...]) definition (it does, below).",
      performanceImpact: "medium"
    });
  }

  // LENGTH()
  const lengthProps = Object.values(model.props).filter((p) => p.func === "length");
  if (lengthProps.length) {
    issues.push({
      category: "length-function",
      problem: `LENGTH(${lengthProps.map((p) => p.name).join(", ")}) wraps ${lengthProps.length > 1 ? "indexed properties" : "an indexed property"} in a function.`,
      why: "Oak's Lucene function-based indexing supports length([...]) alongside lower()/upper() — this is indexed, not post-filtered, as long as the property definition carries a matching function=length([...]) entry.",
      recommendedRewrite: "No rewrite needed for indexing purposes; ensure the generated index includes the function=length([...]) definition (it does, below).",
      performanceImpact: "low"
    });
  }

  // NOT / IS NULL / operation=not
  const negatedProps = Object.values(model.props).filter((p) => p.nullCheck);
  const rawNot = isSQL2 ? countMatches(q, /\bnot\s*\(/gi) : 0;
  if (negatedProps.length || rawNot > 0) {
    issues.push({
      category: "negation",
      problem: `Negation detected${negatedProps.length ? ` (IS NULL / not-exists on ${negatedProps.map((p) => p.name).join(", ")})` : " (NOT (...) clause)"}.`,
      why: "nullCheckEnabled indexes an entry for every node that LACKS the property, which for a common node type can be a huge fraction of the repository — the opposite of what an index is for.",
      recommendedRewrite: "Prefer a positive condition (property EXISTS / IS NOT NULL, or an explicit value check) over asserting absence, if the query logic allows it.",
      performanceImpact: "medium"
    });
  }

  // !=
  const notEquals = isSQL2 || model.source === "XPath" ? countMatches(q, /!=/g) : 0;
  if (notEquals > 0) {
    issues.push({
      category: "not-equals",
      problem: `!= (not-equals) used ${notEquals}x.`,
      why: "An inequality can't seek to a single value — Oak must walk the property's indexed range and exclude the one value, effectively scanning most of the index for that property.",
      recommendedRewrite: "If the domain is small (e.g. a status enum), rewrite as an explicit IN(...) of the allowed values instead of excluding one.",
      performanceImpact: "medium"
    });
  }

  // <>
  const angleNotEquals = isSQL2 ? countMatches(q, /<>/g) : 0;
  if (angleNotEquals > 0) {
    issues.push({
      category: "angle-not-equals",
      problem: `<> (not-equals) used ${angleNotEquals}x.`,
      why: "Same cost profile as !=: no single value to seek to, so Oak scans the property's index excluding one value.",
      recommendedRewrite: "Prefer != for readability (identical cost), or better, rewrite as an explicit IN(...) of the allowed values if the domain is small.",
      performanceImpact: "medium"
    });
  }

  // OR
  if (model.orCount >= 1) {
    issues.push({
      category: "or-branches",
      problem: `OR used — ${model.orCount + 1} union branch(es).`,
      why: "Oak rewrites OR into a union of sub-queries planned independently; every branch must be coverable by an index or that branch alone falls back to traversal.",
      recommendedRewrite: model.orCount >= 3
        ? "Consider splitting into separate queries per branch (e.g. one per node type or path) if the branches target genuinely different data."
        : "Verify each OR branch hits an indexed property — no rewrite needed if all branches are covered by this index.",
      performanceImpact: model.orCount >= 3 ? "high" : "medium"
    });
  }

  // Large IN()
  if (isSQL2) {
    let maxIn = 0;
    for (const m of q.matchAll(/\bin\s*\(([^)]*)\)/gi)) {
      const n = m[1].split(",").map((s) => s.trim()).filter(Boolean).length;
      if (n > maxIn) maxIn = n;
    }
    if (maxIn > IN_CLAUSE_THRESHOLD) {
      issues.push({
        category: "large-in",
        problem: `Large IN() clause (${maxIn} values).`,
        why: "Oak evaluates IN(...) as a union of equality lookups, one per value — a very large list means a very large number of index seeks and result-set merges for a single condition.",
        recommendedRewrite: "If the values represent a path or type grouping, restrict by path/node type instead; if the list comes from user input, consider paginating or pre-filtering it before querying.",
        performanceImpact: "medium"
      });
    }
  }

  // Functions (unsupported — post-filtered)
  if (model.unsupportedFns.length) {
    issues.push({
      category: "unsupported-function",
      problem: `Unsupported function(s): ${model.unsupportedFns.join(", ")}.`,
      why: "These are not supported by lucene property indexes — Oak fetches every candidate node from the rest of the query and evaluates the function in memory over each one.",
      recommendedRewrite: "Avoid the function in the query if possible (e.g. store a precomputed value), or accept the post-filter cost if the rest of the query already narrows the candidate set tightly.",
      performanceImpact: "medium"
    });
  }

  // Leading wildcard
  if (model.leadingWildcards > 0) {
    issues.push({
      category: "leading-wildcard",
      problem: `Leading wildcard in ${model.leadingWildcards} value(s) (e.g. '%abc').`,
      why: "A value starting with a wildcard has no fixed prefix, so Oak cannot seek into the property's sorted index — it scans every indexed value for that property.",
      recommendedRewrite: "Use full-text (CONTAINS) instead, or restructure the stored value so the fixed part comes first (e.g. store a reversed string for suffix lookups).",
      performanceImpact: "high"
    });
  }

  // Joins
  if (model.join) {
    const n = selectorModel?.selectors.length ?? 2;
    issues.push({
      category: "join",
      problem: `JOIN across ${n} selector(s).`,
      why: "Oak evaluates each selector's condition independently against its own index, then merges matching rows in memory — a single index cannot optimize the join itself.",
      recommendedRewrite: "Ensure every selector has its own covering index; if the joined property is small and stable, consider denormalizing it onto one node type to avoid the join entirely.",
      performanceImpact: "medium"
    });
  }

  // Cartesian joins
  if (selectorModel) {
    for (const j of selectorModel.joins) {
      const referencesBoth =
        j.condition && new RegExp(`\\b${j.left}\\b`).test(j.condition) && new RegExp(`\\b${j.right}\\b`).test(j.condition);
      if (!referencesBoth) {
        issues.push({
          category: "cartesian-join",
          problem: `Cartesian join risk: JOIN [${j.right}] has no condition connecting it back to [${j.left}]${j.condition ? ` (condition: '${j.condition}' doesn't reference both selectors)` : " (no ON condition)"}.`,
          why: "Without a condition tying the two selectors together, Oak must pair every row from one selector with every row from the other — result size grows as the PRODUCT of both selectors' sizes, not the sum.",
          recommendedRewrite: `Add an ON condition that relates ${j.left} and ${j.right} (e.g. ISCHILDNODE(${j.right}, ${j.left}) or a shared property equality).`,
          performanceImpact: "high"
        });
      }
    }
  }

  // Large ORDER BY
  if (model.orderBy.length >= LARGE_ORDER_BY_THRESHOLD) {
    issues.push({
      category: "large-order-by",
      problem: `ORDER BY on ${model.orderBy.length} properties.`,
      why: "Lucene can pre-sort on one ordered property efficiently; sorting on several properties at once typically requires Oak to sort the full result set in memory after retrieval.",
      recommendedRewrite: "Reduce to the one or two properties that actually need deterministic ordering, or accept the in-memory sort cost if the result set is small.",
      performanceImpact: "medium"
    });
  }

  // Missing path restriction
  if (!model.paths.length) {
    issues.push({
      category: "missing-path",
      problem: "No path restriction (ISDESCENDANTNODE / ISCHILDNODE / path=).",
      why: "Without a path restriction, the index can't use includedPaths to narrow the candidate set — every matching node in the entire repository is a candidate, regardless of where it lives.",
      recommendedRewrite: "Add a path restriction to the query (e.g. under /content/yoursite) so both the query and the generated index can be scoped.",
      performanceImpact: "high"
    });
  }

  return issues;
}
