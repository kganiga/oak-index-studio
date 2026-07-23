import { KnowledgeEntry } from "./types";

export const aemCloudRecommendations: KnowledgeEntry[] = [
  {
    id: "cloud-async-nrt",
    topic: "AEM Cloud Recommendations",
    bestPractice: "On AEMaaCS, use async=[\"async\",\"nrt\"] so index updates are visible near-real-time between async cycles.",
    explanation: "AEMaaCS's default async indexing cycle can leave a visible lag between a content change and it appearing in query results. Adding 'nrt' supplements the async cycle with near-real-time visibility, which is the expected baseline for AEMaaCS custom indexes.",
    reference: "Adobe Experience Manager as a Cloud Service documentation — Query and Indexing.",
    example: "async: [\"async\", \"nrt\"]",
    recommendation: "Default new AEMaaCS index definitions to async: [\"async\", \"nrt\"] unless you have a specific reason not to.",
    matchCategories: ["async"],
    platform: "cloud"
  },
  {
    id: "cloud-naming-deploy",
    topic: "AEM Cloud Recommendations",
    bestPractice: "Name custom indexes <name>-custom-<version>, deploy them under /oak:index via ui.apps, and never set reindex=true in the package.",
    explanation: "Cloud Manager's pipeline detects index definition changes automatically and triggers reindexing itself. Manually setting reindex=true in a deployed package is not needed on AEMaaCS and can conflict with the pipeline's own reindex handling.",
    reference: "Adobe Experience Manager as a Cloud Service documentation — Deploying Custom Indexes.",
    example: "/oak:index/damAssetLucene-custom-1 deployed under ui.apps/src/main/content/jcr_root/_oak_index/.",
    recommendation: "Let Cloud Manager trigger reindexing automatically; only bump the -custom-N suffix when the definition changes.",
    matchCategories: ["async", "missing-node-type"],
    platform: "cloud"
  }
];
