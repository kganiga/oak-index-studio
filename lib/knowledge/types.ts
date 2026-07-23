export type KnowledgeTopic =
  | "Oak Best Practices"
  | "Common Mistakes"
  | "AEM Cloud Recommendations"
  | "AMS Recommendations"
  | "Lucene Limitations"
  | "Property Index Guidelines"
  | "Ordering Recommendations"
  | "Null Check Guidance"
  | "Relative Property Guidance"
  | "Cost Override Guidance"
  | "Tags Guidance"
  | "Selection Policy Guidance";

/**
 * One knowledge-base entry. matchCategories lists every finding "category" key
 * (from QualityIssue, IndexHealthCheck.dimension, ExplainImprovement,
 * IndexDiffFinding, or the fixed "selector-ownership" key) that should surface
 * this entry. platform narrows an entry to a specific deploy target when the
 * guidance genuinely differs between them; omit (or "both") when it applies
 * either way.
 */
export interface KnowledgeEntry {
  id: string;
  topic: KnowledgeTopic;
  bestPractice: string;
  explanation: string;
  reference: string;
  example: string;
  recommendation: string;
  matchCategories: string[];
  platform?: "cloud" | "65" | "both";
}
