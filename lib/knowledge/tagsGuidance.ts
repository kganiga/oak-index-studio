import { KnowledgeEntry } from "./types";

export const tagsGuidance: KnowledgeEntry[] = [
  {
    id: "tags-only-when-needed",
    topic: "Tags Guidance",
    bestPractice: "Only add an index tag (and option(index tag ...) in the query) when Oak is demonstrably selecting the wrong index — not preemptively.",
    explanation: "Index tags let a query force or prefer a specific index by name, bypassing normal cost-based selection. Adding one before there's a proven wrong-index-selection problem adds a coupling between the query and a specific index name that has to be maintained forever afterward, for no measured benefit.",
    reference: "Apache Jackrabbit Oak documentation — Query index selection (tags, option(index tag ...)).",
    example: "Confirm the wrong index is selected via Explain Query first, then add tags: [\"mytag\"] to the intended index and option(index tag mytag) to the query.",
    recommendation: "Reach for tags only after Explain Query shows Oak picking an index other than the one intended, and simpler fixes (better property definitions, path scoping) haven't resolved it.",
    matchCategories: ["tags"]
  }
];
