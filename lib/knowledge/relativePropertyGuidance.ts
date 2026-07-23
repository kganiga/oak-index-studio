import { KnowledgeEntry } from "./types";

export const relativePropertyGuidance: KnowledgeEntry[] = [
  {
    id: "relprop-own-definition",
    topic: "Relative Property Guidance",
    bestPractice: "Relative properties (e.g. jcr:content/cq:template) need their own explicit property definition.",
    explanation: "A property definition named 'cq:template' does not automatically cover 'jcr:content/cq:template' — Oak matches property definitions by their exact relative path from the indexed node. A definition for the wrong (or missing) relative path is silently ignored for that condition.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index property definitions (relative properties).",
    example: "{ name: \"jcr:content/cq:template\", propertyIndex: true }",
    recommendation: "Match the property definition's name to the exact relative path used in the query, including the jcr:content/ prefix where applicable.",
    matchCategories: ["missing-relative-property"]
  },
  {
    id: "relprop-join-alternative",
    topic: "Relative Property Guidance",
    bestPractice: "When a JOIN's second selector represents a child node reached via ISCHILDNODE, prefer a relative property on the parent's index rule over a second index rule where possible.",
    explanation: "If the child relationship is fixed (e.g. every dam:Asset's metadata lives at jcr:content), indexing the property as a relative path on the parent's own rule avoids the join entirely — cheaper than evaluating two selectors and merging them.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index property definitions (relative properties); Query joins.",
    example: "Instead of joining dam:Asset to a separate nt:base selector for jcr:content/status, add { name: \"jcr:content/status\" } directly to the dam:Asset index rule.",
    recommendation: "Check whether a JOIN can be replaced by a relative property definition on the primary selector's own index rule before adding a second selector's index.",
    matchCategories: ["selector-ownership"]
  }
];
