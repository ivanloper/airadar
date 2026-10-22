import Link from "next/link";
import type { TrendLite } from "@/lib/datasets";
import { CategoryText, PlatformList, StageBadge } from "./badges";
import { RelTime } from "./rel-time";
import { breakdownFromArrays, ScoreMeter } from "./score-meter";

export function TrendRow({ trend, rank }: { trend: TrendLite; rank?: number }) {
  return (
    <li className="grid grid-cols-1 gap-x-4 gap-y-2 border-b border-line py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="flex min-w-0 gap-2.5">
        {rank !== undefined && <span className="num w-5 shrink-0 pt-0.5 text-sm text-ink-3">{rank}</span>}
        <div className="min-w-0">
          <Link href={`/t/${trend.slug}`} className="block break-words font-medium leading-snug hover:text-signal">
            {trend.title}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <StageBadge stage={trend.stage} />
            <CategoryText category={trend.cat} />
            <PlatformList platforms={trend.plats} />
            <span className="text-xs text-ink-3">
              <RelTime date={trend.last} />
            </span>
          </div>
        </div>
      </div>
      <div className={rank !== undefined ? "pl-7 sm:pl-0" : ""}>
        <ScoreMeter breakdown={breakdownFromArrays(trend.fv, trend.fe)} score={trend.score} confidence={trend.conf} />
      </div>
    </li>
  );
}
