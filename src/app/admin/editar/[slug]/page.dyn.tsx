import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminTrendActions } from "@/components/admin-trend-actions";
import { StatusText } from "@/components/badges";
import { breakdownFromArrays, ScoreMeter } from "@/components/score-meter";
import { NoDatabase, PageHeader } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { factorArrays } from "@/lib/datasets";
import { renderPerRequest } from "@/lib/mode";
import { trendDetail } from "@/lib/queries";
import { appContext } from "@/lib/server";
import type { Status } from "@/lib/statuses";

export const metadata: Metadata = { title: "Revisar tendencia", robots: { index: false } };

export default async function EditTrendPage({ params }: { params: Promise<{ slug: string }> }) {
  await renderPerRequest();
  if (!(await isAdmin())) redirect("/admin");
  const { slug } = await params;
  const { db } = appContext();
  if (!db) return <NoDatabase />;
  const d = await trendDetail(db, slug);
  if (!d) notFound();
  const t = d.trend;
  const { fv, fe } = factorArrays(t.breakdown);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.title} intro={<StatusText status={t.status} />} />
      <div className="rounded-xl border border-line bg-surface p-4">
        <ScoreMeter breakdown={breakdownFromArrays(fv, fe)} score={t.score} confidence={t.confidence} />
        <p className="mt-3 text-sm text-ink-2">{t.summary}</p>
        <Link href={`/t/${t.slug}`} className="mt-3 inline-block text-sm font-semibold text-signal">
          Ver ficha pública
        </Link>
      </div>
      <AdminTrendActions id={t.id} status={t.status as Status} title={t.title} summary={t.summary} recommendation={t.recommendation ?? ""} />
    </div>
  );
}
