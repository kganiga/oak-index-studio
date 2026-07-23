import { KnowledgeEntry } from "./types";

export const nullCheckGuidance: KnowledgeEntry[] = [
  {
    id: "nullcheck-sparingly",
    topic: "Null Check Guidance",
    bestPractice: "Use nullCheckEnabled sparingly.",
    explanation: "nullCheckEnabled indexes an entry for every node of the rule that LACKS the property — for a common node type, that can be a large fraction of the entire repository, which is the opposite of what a selective index should do.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index property definitions (nullCheckEnabled).",
    example: "Only set nullCheckEnabled on a property when 'IS NULL' / absence checks are a genuine, frequent part of the query workload.",
    recommendation: "Prefer a positive condition (existence check, or an explicit value check) over asserting absence wherever the query logic allows it.",
    matchCategories: ["null checks", "negation"]
  },
  {
    id: "nullcheck-prefer-exists",
    topic: "Null Check Guidance",
    bestPractice: "Prefer notNullCheckEnabled (existence) over nullCheckEnabled (absence) when the query allows it.",
    explanation: "IS NOT NULL / exists checks are typically far cheaper than IS NULL checks, since most content models have a property present on a minority of nodes rather than absent from a minority — notNullCheckEnabled indexes the (usually smaller) set of nodes that DO have the property.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index property definitions (notNullCheckEnabled).",
    example: "{ name: \"jcr:content/onTime\", notNullCheckEnabled: true }",
    recommendation: "Check whether the query's intent can be flipped from an absence check to an existence check before enabling nullCheckEnabled.",
    matchCategories: ["null checks", "negation"]
  }
];
