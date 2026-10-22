import { getConnector } from "@/connectors/registry";
import { guardDashboard } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { Notice, PageHeader, Section } from "./ui";

export async function PlannedConnectorPage({
  kind,
  title,
  goals,
  limited,
  setup,
}: {
  kind: string;
  title: string;
  goals: string[];
  limited: string[];
  setup: string[];
}) {
  await guardDashboard();
  const status = getConnector(kind)!.status(getConfig());
  return (
    <>
      <PageHeader title={title} intro="Conector no configurado. El resto de AI Radar funciona con normalidad sin él." />
      <div className="space-y-6">
        <Notice tone="warn">
          <p className="font-medium">{status.reason}</p>
          {status.limits && <p className="mt-1 text-ink-2">Cuotas y costes: {status.limits}</p>}
        </Notice>
        <div className="grid gap-6 md:grid-cols-2">
          <Section title="Qué aportará" id="goals">
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
              {goals.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </Section>
          <Section title="Qué queda limitado ahora" id="limited">
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
              {limited.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </Section>
        </div>
        <Section title="Cómo activarlo" id="setup">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
            {setup.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}
