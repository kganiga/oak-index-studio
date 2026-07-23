import { KnowledgeEntry } from "./types";

export const luceneLimitations: KnowledgeEntry[] = [
  {
    id: "lucene-large-in",
    topic: "Lucene Limitations",
    bestPractice: "Large IN() lists don't scale the way a single equality does — each value is a separate seek, unioned together.",
    explanation: "Oak evaluates property IN (a, b, c, ...) as a union of individual equality lookups. A handful of values is cheap; a list with hundreds of values means hundreds of seeks and a large in-memory union before results merge with the rest of the query.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index query evaluation.",
    example: "WHERE p.[status] IN ('a','b','c') is fine; WHERE p.[id] IN (<500 values>) is not.",
    recommendation: "For large value sets, restrict by a shared path or node type instead, or paginate/pre-filter the list before querying.",
    matchCategories: ["large-in"]
  },
  {
    id: "lucene-unsupported-functions",
    topic: "Lucene Limitations",
    bestPractice: "Not every SQL2 function has a Lucene property-index equivalent — those without one force post-filtering.",
    explanation: "Oak's Lucene property index can only accelerate a condition it has a matching stored representation for: the raw value, a supported function-based transform (lower(...), upper(...), length(...), first(...), name(), path() are all documented function-index forms), or analyzed tokens. A function outside that supported set is evaluated in memory over every candidate node produced by the rest of the query.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index, function-based indexing.",
    example: "LOWER(), UPPER(), and LENGTH() are all function-indexable via function=lower([...])/upper([...])/length([...]) — don't assume a function needs post-filtering without checking Oak's supported list first.",
    recommendation: "Check whether the function you need is one of Oak's documented function-based index forms before assuming it must be post-filtered.",
    matchCategories: ["unsupported-function"]
  },
  {
    id: "lucene-join-no-optimization",
    topic: "Lucene Limitations",
    bestPractice: "A single Lucene index cannot optimize a JOIN — each selector is planned and evaluated independently, then merged in memory.",
    explanation: "There is no cross-selector index in Oak's Lucene implementation. Every selector in a JOIN needs its own covering index; Oak evaluates each side separately and merges matching rows afterward, so a missing index on either side falls back to traversal for that side.",
    reference: "Apache Jackrabbit Oak documentation — Query joins.",
    example: "SELECT * FROM [dam:Asset] AS asset INNER JOIN [nt:base] AS content ON ISCHILDNODE(content, asset) needs indexes covering both asset's and content's own conditions.",
    recommendation: "Give every selector in a JOIN its own matching index, or denormalize the joined property onto one node type to avoid the join.",
    matchCategories: ["join", "cartesian-join"]
  },
  {
    id: "lucene-regex-definitions",
    topic: "Lucene Limitations",
    bestPractice: "A regex property definition (isRegexp=true) matches every property whose name fits the pattern, per node.",
    explanation: "Regex definitions are powerful (e.g. covering node-scope full-text without naming every property) but broad by nature — they increase index size compared to explicit named definitions, since they can't be scoped as tightly.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index property definitions (isRegexp).",
    example: "{ name: \"^[^\\\\/]*$\", isRegexp: true, analyzed: true, nodeScopeIndex: true } covers every direct string property for node-scope CONTAINS(., ...).",
    recommendation: "Use regex definitions only when the properties genuinely can't be enumerated (e.g. node-scope full-text); prefer explicit named definitions otherwise.",
    matchCategories: ["regex"]
  }
];
