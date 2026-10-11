/**
 * Creator badges — earned automatically from public activity.
 *
 * Rules live in ONE place so the channel page, watch page and any future
 * surface (comments, video cards) always agree. To add a badge: add its id
 * to CreatorBadgeId, a rule in getCreatorBadges(), and its look in
 * BADGE_INFO.
 */

export type CreatorBadgeId = "rising";

/** Published (ready + public) videos needed for the Rising Creator badge. */
export const RISING_CREATOR_MIN_VIDEOS = 3;

export interface CreatorStatsForBadges {
  /** Count of the creator's ready + public videos */
  videoCount?: number | null;
}

export function getCreatorBadges({ videoCount }: CreatorStatsForBadges): CreatorBadgeId[] {
  const badges: CreatorBadgeId[] = [];
  if ((videoCount ?? 0) >= RISING_CREATOR_MIN_VIDEOS) badges.push("rising");
  return badges;
}

export const BADGE_INFO: Record<CreatorBadgeId, { label: string; description: string }> = {
  rising: {
    label: "Rising Creator",
    description: `Published ${RISING_CREATOR_MIN_VIDEOS}+ videos on AirStreamX`,
  },
};
