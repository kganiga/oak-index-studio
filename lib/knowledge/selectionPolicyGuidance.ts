import { KnowledgeEntry } from "./types";

export const selectionPolicyGuidance: KnowledgeEntry[] = [
  {
    id: "selectionpolicy-rarely-needed",
    topic: "Selection Policy Guidance",
    bestPractice: "Only set selectionPolicy when you need to explicitly forbid or force this index for certain query shapes.",
    explanation: "Oak's default cost-based selection correctly picks the cheapest matching index for almost all queries without any explicit policy. selectionPolicy exists for edge cases (e.g. preventing an expensive index from ever being auto-selected for traversal-shaped queries) — it is not a routine setting.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index (selectionPolicy).",
    example: "selectionPolicy: \"custom\" combined with a specific tag, reserved for indexes that must never be picked by default cost comparison alone.",
    recommendation: "Leave selectionPolicy unset unless you have a specific, tested reason Oak's default selection isn't sufficient.",
    matchCategories: ["selectionPolicy"]
  }
];
