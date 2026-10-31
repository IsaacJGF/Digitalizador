import { useMemo, type ReactNode } from "react";
import { BarChart3, CheckSquare, Image as ImageIcon, Sigma, TextSearch } from "lucide-react";
import type { FrequencyRow, ProvaAnalysisSummary } from "@/lib/prova-analysis";

export function AnalysisResolutionPanel({ summary }: { summary: ProvaAnalysisSummary }) {
  const resourceRows = useMemo(() => [
    { label: "Com texto-base", count: summary.withReference, icon: TextSearch },
    { label: "Com imagem", count: summary.withImage, icon: ImageIcon },
    { label: "Com equação", count: summary.withEquation, icon: Sigma },
    { label: "Com alternativas", count: summary.withAlternatives, icon: CheckSquare },
  ], [summary]);

  const tags = summary.tagFrequency.filter((row) => !row.value.toLocaleLowerCase("pt-BR").startsWith("sem "));
  const types = summary.typeCounts;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Como as questões são resolvidas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Distribuição das tags de resolução e dos recursos registrados nas questões desta base.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {resourceRows.map((row) => {
            const Icon = row.icon;
            return <MetricCard key={row.label} label={row.label} count={row.count} total={summary.total} icon={<Icon className="size-4 text-muted-foreground" />} />;
          })}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <DistributionCard
          title="Tags de resolução"
          description="Ex.: sem cálculo, com cálculo, usa fórmula ou análise de figura."
          rows={tags}
          total={summary.total}
          emptyText="Nenhuma tag de resolução foi registrada nesta base."
          icon={<BarChart3 className="size-4 text-muted-foreground" />}
        />
        <DistributionCard
          title="Tipo de questão"
          description="Formato das questões registradas."
          rows={types}
          total={summary.total}
          emptyText="Nenhum tipo de questão foi registrado."
          icon={<CheckSquare className="size-4 text-muted-foreground" />}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Uma questão pode ter várias tags; por isso, as porcentagens das tags não precisam somar 100%.
      </p>
    </div>
  );
}

function MetricCard({ label, count, total, icon }: { label: string; count: number; total: number; icon: ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {label}
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold">{count}</p>
      <p className="text-xs text-muted-foreground">{formatPercent(count, total)} das questões</p>
    </div>
  );
}

function DistributionCard({ title, description, rows, total, emptyText, icon }: {
  title: string;
  description: string;
  rows: FrequencyRow[];
  total: number;
  emptyText: string;
  icon: ReactNode;
}) {
  const max = Math.max(...rows.map((row) => row.count), 0);
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {icon}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.value}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium" title={row.value}>{row.value}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{row.count} · {formatPercent(row.count, total)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: Math.max(3, max > 0 ? (row.count / max) * 100 : 0) + "%" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatPercent(count: number, total: number) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
}