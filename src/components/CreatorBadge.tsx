import { Sprout } from "lucide-react";
import { BADGE_INFO, getCreatorBadges, type CreatorStatsForBadges } from "../utils/creatorBadges";

const ICONS = { rising: Sprout } as const;

interface CreatorBadgesProps extends CreatorStatsForBadges {
  /** "sm" for compact rows (watch page), "md" for the channel header */
  size?: "sm" | "md";
  className?: string;
}

/** Renders every badge the creator has earned (nothing if none). */
export default function CreatorBadges({ size = "md", className = "", ...stats }: CreatorBadgesProps) {
  const badges = getCreatorBadges(stats);
  if (badges.length === 0) return null;

  const pill = size === "sm"
    ? "gap-1 px-1.5 py-0.5 text-[10px]"
    : "gap-1.5 px-2.5 py-1 text-xs";
  const icon = size === "sm" ? 11 : 14;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {badges.map((id) => {
        const Icon = ICONS[id];
        const { label, description } = BADGE_INFO[id];
        return (
          <span
            key={id}
            title={description}
            className={`inline-flex items-center flex-shrink-0 rounded-full font-semibold whitespace-nowrap
              bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30 ${pill}`}
          >
            <Icon size={icon} aria-hidden="true" />
            {label}
            <span className="sr-only">: {description}</span>
          </span>
        );
      })}
    </span>
  );
}
