import { KnowledgeEntry } from "./types";

export const commonMistakes: KnowledgeEntry[] = [
  {
    id: "mistake-forgot-ordered",
    topic: "Common Mistakes",
    bestPractice: "Don't forget ordered=true on properties used in ORDER BY or range comparisons.",
    explanation: "A property definition can have propertyIndex=true and still be unusable for sorting or seeking a range if ordered=true is missing. This is one of the most common reasons a 'correct-looking' index still causes Oak to sort in memory.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index property definitions (ordered).",
    example: "{ name: \"jcr:content/cq:lastModified\", propertyIndex: true, ordered: true, type: \"Date\" }",
    recommendation: "Whenever a property appears in ORDER BY or a range comparison (>, <, BETWEEN), double-check ordered=true is set.",
    matchCategories: ["ordered", "missing-ordered", "large-order-by"]
  },
  {
    id: "mistake-broad-like",
    topic: "Common Mistakes",
    bestPractice: "Don't use LIKE with wildcards on both sides as a substitute for full-text search.",
    explanation: "LIKE '%value%' has no fixed prefix to seek on, so Oak scans every indexed value for that property. This is frequently used to approximate 'contains' search, but CONTAINS() with an analyzed property definition is both faster and semantically closer to what's usually wanted.",
    reference: "Apache Jackrabbit Oak documentation — Lucene full-text search (analyzed properties, CONTAINS).",
    example: "Instead of WHERE p.[title] LIKE '%draft%', use WHERE CONTAINS(p.[title], 'draft') with analyzed=true on the title property.",
    recommendation: "Reserve LIKE for prefix matches (value%); use CONTAINS for anything resembling substring or word search.",
    matchCategories: ["like-wildcard-both", "leading-wildcard"]
  },
  {
    id: "mistake-cost-override-first",
    topic: "Common Mistakes",
    bestPractice: "Don't reach for a cost override the first time Oak picks an unexpected index.",
    explanation: "costPerEntry/costPerExecution overrides mask the underlying reason a query planned poorly — usually a missing property definition, missing ordered flag, or an over-broad path restriction on the actual index that should have won. Overrides also silently go stale as the schema evolves.",
    reference: "Apache Jackrabbit Oak documentation — Query cost overrides.",
    example: "Before adding a cost override, run Explain Query and check the '/analysis/health' and '/analysis/explain' panels for the real gap first.",
    recommendation: "Fix the underlying index definition; treat a cost override as a last resort, not a first response.",
    matchCategories: ["cost-too-high"]
  },
  {
    id: "mistake-not-equals-scan",
    topic: "Common Mistakes",
    bestPractice: "Don't assume != or <> is as cheap as =.",
    explanation: "An inequality has no single value to seek to — Oak walks the property's indexed range and excludes the one value, which for a low-cardinality property can mean scanning most of the index. This is easy to miss because the query still 'uses' the index technically.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index query evaluation (range/inequality conditions).",
    example: "WHERE p.[status] != 'draft' still costs roughly as much as scanning every non-draft node.",
    recommendation: "If the excluded domain is small (e.g. a status enum), rewrite as an explicit IN(...) of the allowed values instead.",
    matchCategories: ["not-equals", "angle-not-equals"]
  },
  {
    id: "mistake-unbounded-or",
    topic: "Common Mistakes",
    bestPractice: "Don't let OR branches grow unchecked without checking each one is separately indexable.",
    explanation: "Oak rewrites OR into a union of sub-queries, each planned independently. Every branch needs its own coverable index condition — a single unindexed branch falls back to traversal for that branch alone, which can dominate the query's total cost even if the other branches are fast.",
    reference: "Apache Jackrabbit Oak documentation — Query evaluation (OR / union planning).",
    example: "WHERE a = 1 OR b = 2 OR c = 3 needs a, b, and c to each be indexed — not just the first condition.",
    recommendation: "Verify every OR branch is covered by an indexed property; consider splitting into separate queries if branches target genuinely different data.",
    matchCategories: ["or-branches"]
  }
];
