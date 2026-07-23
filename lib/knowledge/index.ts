import { KnowledgeEntry } from "./types";
import { oakBestPractices } from "./oakBestPractices";
import { commonMistakes } from "./commonMistakes";
import { aemCloudRecommendations } from "./aemCloudRecommendations";
import { amsRecommendations } from "./amsRecommendations";
import { luceneLimitations } from "./luceneLimitations";
import { propertyIndexGuidelines } from "./propertyIndexGuidelines";
import { orderingRecommendations } from "./orderingRecommendations";
import { nullCheckGuidance } from "./nullCheckGuidance";
import { relativePropertyGuidance } from "./relativePropertyGuidance";
import { costOverrideGuidance } from "./costOverrideGuidance";
import { tagsGuidance } from "./tagsGuidance";
import { selectionPolicyGuidance } from "./selectionPolicyGuidance";

export type { KnowledgeEntry, KnowledgeTopic } from "./types";

/**
 * The full knowledge base — one array per topic, concatenated here. To add a
 * new rule: add an entry to an existing topic file, or create a new topic
 * file exporting a KnowledgeEntry[] and add it to this list. Nothing else
 * needs to change; findKnowledge() and every caller work over the flat list.
 */
export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  ...oakBestPractices,
  ...commonMistakes,
  ...aemCloudRecommendations,
  ...amsRecommendations,
  ...luceneLimitations,
  ...propertyIndexGuidelines,
  ...orderingRecommendations,
  ...nullCheckGuidance,
  ...relativePropertyGuidance,
  ...costOverrideGuidance,
  ...tagsGuidance,
  ...selectionPolicyGuidance
];

/**
 * Looks up every knowledge-base entry relevant to a finding's category key
 * (e.g. a QualityIssue.category, an IndexHealthCheck.dimension, an
 * ExplainImprovement.category, an IndexDiffFinding.category, or the fixed
 * "selector-ownership" key), optionally narrowed to the current deploy target.
 */
export function findKnowledge(categoryKey: string, platform?: "cloud" | "65"): KnowledgeEntry[] {
  return KNOWLEDGE_BASE.filter(
    (e) => e.matchCategories.includes(categoryKey) && (!e.platform || e.platform === "both" || e.platform === platform)
  );
}
