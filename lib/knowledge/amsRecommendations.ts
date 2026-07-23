import { KnowledgeEntry } from "./types";

export const amsRecommendations: KnowledgeEntry[] = [
  {
    id: "ams-reindex-once",
    topic: "AMS Recommendations",
    bestPractice: "On AEM 6.5 / AMS, set reindex=true once after deploying a new or changed index definition, or use oak-run offline indexing for large repositories.",
    explanation: "Unlike AEMaaCS, there is no managed pipeline that triggers reindexing automatically. A newly deployed or modified index definition sits unused until a reindex is explicitly triggered — easy to forget, and easy to leave set (causing repeated reindexing) if not removed afterward.",
    reference: "Adobe Experience Manager 6.5 documentation — Oak Query Index; Apache Jackrabbit Oak oak-run indexing tool.",
    example: "Set reindex{Boolean}=true on the index node, wait for the async indexer (or run oak-run index for an offline reindex on a large instance), then remove the reindex flag.",
    recommendation: "Trigger reindex explicitly after deploying, and always clear the flag once reindexing completes.",
    matchCategories: ["async", "missing-node-type"],
    platform: "65"
  },
  {
    id: "ams-async-plain",
    topic: "AMS Recommendations",
    bestPractice: "On AEM 6.5 / AMS, async=[\"async\"] is the standard setting — add 'nrt' only if sub-5-second visibility is a hard requirement.",
    explanation: "AMS instances are typically sized and tuned around the standard async indexing cadence. Adding 'nrt' increases indexing overhead on every commit; it's justified for specific near-real-time UX requirements, not as a default.",
    reference: "Apache Jackrabbit Oak documentation — Lucene Index (async).",
    example: "async: [\"async\"]",
    recommendation: "Default to async: [\"async\"] on AMS; only add 'nrt' when a concrete near-real-time requirement exists.",
    matchCategories: ["async"],
    platform: "65"
  }
];
