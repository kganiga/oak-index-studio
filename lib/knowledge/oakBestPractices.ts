import { KnowledgeEntry } from "./types";

export const oakBestPractices: KnowledgeEntry[] = [
  {
    id: "oak-scope-every-index",
    topic: "Oak Best Practices",
    bestPractice: "Every custom Lucene index should be scoped with includedPaths, queryPaths, and evaluatePathRestrictions=true.",
    explanation: "Without a path restriction, an index rule applies to every matching node in the entire repository. That inflates index size, slows reindexing, and makes it harder for Oak to estimate accurate costs. queryPaths additionally tells the query planner the index only answers queries under those paths, preventing it from being wrongly selected for unrelated content.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index (indexRules, includedPaths, queryPaths).",
    example: "includedPaths: [\"/content/mysite\"], queryPaths: [\"/content/mysite\"], evaluatePathRestrictions: true",
    recommendation: "Scope every new index to the narrowest stable path that still covers the queries it needs to serve.",
    matchCategories: ["includedPaths", "queryPaths", "evaluatePathRestrictions", "missing-path", "wrong-path", "wrong-included-paths", "wrong-query-paths"]
  },
  {
    id: "oak-compat-version-2",
    topic: "Oak Best Practices",
    bestPractice: "Set compatVersion=2 on new Lucene index definitions.",
    explanation: "compatVersion 2 is the only Lucene index type that supports the full combination of property, ordered, analyzed, and facet definitions in one index. It's required on AEMaaCS and is the standard baseline everywhere else too — earlier compat versions are legacy and limited.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index (compatVersion).",
    example: "compatVersion: 2",
    recommendation: "Always author new index definitions with compatVersion: 2; don't carry forward an older compatVersion from a copied template.",
    matchCategories: ["compatVersion"]
  },
  {
    id: "oak-avoid-nt-base",
    topic: "Oak Best Practices",
    bestPractice: "Avoid indexRules scoped to nt:base without a strong path restriction.",
    explanation: "nt:base matches every node type in the repository. An nt:base rule with no path restriction is effectively an index over the whole content tree — one of the most common causes of oversized, slow-to-maintain custom indexes.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index (indexRules).",
    example: "Prefer indexRules/cq:Page or indexRules/dam:Asset over indexRules/nt:base whenever the query's actual target type is known.",
    recommendation: "Restrict the node type as tightly as the query allows before falling back to nt:base.",
    matchCategories: ["missing-path"]
  }
];
