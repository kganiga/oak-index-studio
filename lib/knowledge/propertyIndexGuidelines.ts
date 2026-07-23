import { KnowledgeEntry } from "./types";

export const propertyIndexGuidelines: KnowledgeEntry[] = [
  {
    id: "propidx-set-flag",
    topic: "Property Index Guidelines",
    bestPractice: "Set propertyIndex=true on every property the query filters, range-compares, or checks existence on.",
    explanation: "Without propertyIndex=true, a property's value is not stored for lookup in the index at all — the condition falls back to being post-filtered over every candidate node, which is exactly what an index is meant to avoid.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index property definitions.",
    example: "{ name: \"jcr:content/cq:template\", propertyIndex: true }",
    recommendation: "Every property definition that backs a =, !=, range, LIKE, IN, or exists condition needs propertyIndex=true.",
    matchCategories: ["propertyIndex", "missing-property"]
  },
  {
    id: "propidx-correct-type",
    topic: "Property Index Guidelines",
    bestPractice: "Declare the correct type (Date, Long, Double, Boolean) on typed properties.",
    explanation: "Without a declared type, Lucene stores and compares values as strings. String-ordered dates and numbers sort and range-compare lexicographically, not chronologically or numerically — '2' > '10' as strings, which silently breaks range queries and ordering.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index property definitions (type).",
    example: "{ name: \"jcr:content/cq:lastModified\", type: \"Date\", ordered: true }",
    recommendation: "Set type explicitly whenever the query implies a non-String value (CAST(... AS DATE), numeric comparisons, boolean values).",
    matchCategories: ["property types", "incorrect-property-type"]
  },
  {
    id: "propidx-analyzed-for-fulltext",
    topic: "Property Index Guidelines",
    bestPractice: "Set analyzed=true only on properties that genuinely need word-level full-text matching (CONTAINS()).",
    explanation: "Analyzed (tokenized) storage is larger and costlier to index than a plain propertyIndex value — it stores every token of the value, not just the raw value. Marking a property analyzed 'just in case' inflates the index for no query benefit if nothing actually uses CONTAINS() on it.",
    reference: "Apache Jackrabbit Oak documentation — Lucene full-text search (analyzed properties).",
    example: "{ name: \"jcr:content/jcr:title\", analyzed: true } — only add this if the query actually does CONTAINS(title, ...).",
    recommendation: "Audit analyzed properties periodically; drop analyzed from any property no query full-text searches on.",
    matchCategories: ["analyzed"]
  },
  {
    id: "propidx-nodescope-needs-analyzed",
    topic: "Property Index Guidelines",
    bestPractice: "nodeScopeIndex must be paired with analyzed=true on the same property definition.",
    explanation: "nodeScopeIndex feeds a property's tokenized value into the node's aggregate full-text field (used by CONTAINS(., ...)). Without analyzed=true on the same definition, there's nothing tokenized to feed in, and the flag has no effect.",
    reference: "Apache Jackrabbit Oak documentation — Lucene full-text search (nodeScopeIndex).",
    example: "{ name: \"jcr:content/jcr:description\", analyzed: true, nodeScopeIndex: true }",
    recommendation: "Whenever nodeScopeIndex is set, verify analyzed=true is set on that same property definition.",
    matchCategories: ["nodeScopeIndex"]
  },
  {
    id: "propidx-function-based",
    topic: "Property Index Guidelines",
    bestPractice: "LOWER()/UPPER() in a query require a matching function=lower([...])/upper([...]) property definition.",
    explanation: "Oak can index a function-based value (Oak 1.6+) so a case-folded query still resolves in the index, but only if the property definition explicitly declares that function. Without it, the condition is post-filtered in memory over every candidate node from the rest of the query — the index doesn't help at all.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index property definitions (function-based indexing).",
    example: "{ function: \"lower([jcr:content/status])\" } for a query using LOWER(status) = 'active'.",
    recommendation: "Whenever a query wraps a property in LOWER()/UPPER(), add the matching function=... property definition — or better, store a pre-normalized value at write time.",
    matchCategories: ["lower-function", "upper-function"]
  },
  {
    id: "propidx-length-function",
    topic: "Property Index Guidelines",
    bestPractice: "LENGTH() in a query is function-indexable too — it is NOT automatically post-filtered.",
    explanation: "Oak's function-based indexing documents length([relPath]) alongside lower(...)/upper(...) as a supported form. A property definition with function=\"length([...])\" lets a LENGTH(...) comparison resolve in the index, the same way a case-folded comparison does with function=lower/upper.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index, function-based indexing.",
    example: "{ function: \"length([jcr:content/data])\" } for a query using LENGTH(jcr:content/data) > 100.",
    recommendation: "Whenever a query wraps a property in LENGTH(), add the matching function=\"length([...])\" property definition — this app's generator already does this automatically.",
    matchCategories: ["length-function"]
  },
  {
    id: "propidx-remove-unused",
    topic: "Property Index Guidelines",
    bestPractice: "Remove property definitions nothing queries against.",
    explanation: "Every property definition — even an inert one with no capability flags — adds a node to the index definition and, once flags are set, storage overhead on every indexed content node. Definitions left over from a query that was later changed or removed provide no benefit.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index property definitions.",
    example: "If a query no longer filters on jcr:content/legacyStatus, remove that property's definition from the index rule.",
    recommendation: "When a query changes, re-check its generated/existing index for property definitions that are no longer referenced.",
    matchCategories: ["unused-property"]
  }
];
