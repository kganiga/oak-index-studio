import { KnowledgeEntry } from "./types";

export const costOverrideGuidance: KnowledgeEntry[] = [
  {
    id: "costoverride-last-resort",
    topic: "Cost Override Guidance",
    bestPractice: "Treat costPerEntry / costPerExecution overrides as a last resort, not a first fix.",
    explanation: "Cost overrides change how Oak's query planner compares this index against others, but they don't change what the index actually does. They mask real problems (a missing property definition, a missing ordered flag, an over-broad path) and are easy to leave in place after the underlying issue is later fixed elsewhere, causing confusing planner behavior down the line.",
    reference: "Apache Jackrabbit Oak documentation — Query cost overrides.",
    example: "Before adding a cost override, check the /analysis/health and /analysis/explain panels to find why Oak is estimating a higher cost than expected.",
    recommendation: "Only add a cost override after confirming, via Explain Query, that the index definition itself is already correct and the planner is still choosing wrong.",
    matchCategories: ["cost-too-high"]
  },
  {
    id: "costoverride-document",
    topic: "Cost Override Guidance",
    bestPractice: "If a cost override is genuinely needed, document why and revisit it periodically.",
    explanation: "Cost overrides don't self-correct as the query workload or content model changes. An override that was correct when added can become wrong (or unnecessary) later, silently degrading query planning until someone notices.",
    reference: "Apache Jackrabbit Oak documentation — Query cost overrides.",
    example: "Add a comment or changelog entry noting which query pattern required the override and the Explain output that justified it.",
    recommendation: "Track cost overrides explicitly and re-verify them whenever the related query or index definition changes.",
    matchCategories: ["cost-too-high"]
  }
];
