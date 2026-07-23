import { KnowledgeEntry } from "./types";

export const orderingRecommendations: KnowledgeEntry[] = [
  {
    id: "order-single-property",
    topic: "Ordering Recommendations",
    bestPractice: "Prefer ordering by a single property where possible.",
    explanation: "Lucene can pre-sort efficiently on one ordered property. Sorting on several properties at once typically requires Oak to retrieve the full result set and sort it in memory, since a single index doesn't maintain a combined multi-property sort order.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index (ordered properties, sort order).",
    example: "ORDER BY p.[jcr:content/cq:lastModified] DESC is cheap; ORDER BY a, b, c usually isn't.",
    recommendation: "Reduce ORDER BY to the one or two properties that genuinely need deterministic ordering.",
    matchCategories: ["large-order-by"]
  },
  {
    id: "order-needs-ordered-flag",
    topic: "Ordering Recommendations",
    bestPractice: "Every property used in ORDER BY needs ordered=true on its property definition.",
    explanation: "ordered=true tells Lucene to maintain a sortable doc-value structure for that property. Without it, Oak still executes the query but sorts the entire result set in memory after retrieval instead of returning pre-sorted results from the index.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index property definitions (ordered).",
    example: "{ name: \"jcr:content/cq:lastModified\", ordered: true }",
    recommendation: "Cross-check every ORDER BY property against its index definition for ordered=true.",
    matchCategories: ["ordered", "missing-ordered"]
  }
];
