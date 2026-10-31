import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, GitCompareArrows, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProvaAnalysisQuestion, ProvaAnalysisSummary } from "@/lib/prova-analysis";

type Dimension = "area" | "content" | "subcontent" | "related" | "tag" | "type";
type PeriodStats = { total: number; counts: Map<string, number> };
type ComparisonRow = { label: string; countA: number; countB: number; shareA: number; shareB: number; delta: number };

const DIMENSIONS: Array<{ value: Dimension; label: string }> = [
  { value: "area", label: "Área geral" },
  { value: "content", label: "Conteúdo principal" },
  { value: "subcontent", label: "Subconteúdo" },
  { value: "related", label: "Conteúdo relacionado" },
  { value: "tag", label: "Tag" },
  { value: "type", label: "Tipo de questão" },
];

export function AnalysisPeriodComparisonPanel({ summary }: { summary: ProvaAnalysisSummary }) {
  const years = useMemo(
    () => summary.years.filter((year) => parseYear(year) !== null).sort((a, b) => (parseYear(a) ?? 0) - (parseYear(b) ?? 0)),
    [summary.years],
  );
  const [startA, setStartA] = useState("");
  const [endA, setEndA] = useState("");
  const [startB, setStartB] = useState("");
  const [endB, setEndB] = useState("");
  const [dimension, setDimension] = useState<Dimension>("content");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (years.length === 0) {
      setStartA("");
      setEndA("");
      setStartB("");
      setEndB("");
      return;
    }
    if (years.length === 1) {
      setStartA(years[0]);
      setEndA(years[0]);
      setStartB(years[0]);
      setEndB(years[0]);
      return;
    }
    const split = Math.floor(years.length / 2);
    setStartA(years[0]);
    setEndA(years[Math.max(0, split - 1)]);
    setStartB(years[split]);
    setEndB(years[years.length - 1]);
  }, [years]);

  const periodA = useMemo(
    () => summarizePeriod(summary.questions, dimension, startA, endA),
    [summary.questions, dimension, startA, endA],
  );
  const periodB = useMemo(
    () => summarizePeriod(summary.questions, dimension, startB, endB),
    [summary.questions, dimension, startB, endB],
  );

  const rows = useMemo(() => {
    const labels = new Set([...periodA.counts.keys(), ...periodB.counts.keys()]);
    return [...labels]
      .map((label) => {
        const countA = periodA.counts.get(label) ?? 0;
        const countB = periodB.counts.get(label) ?? 0;
        const shareA = periodA.total > 0 ? (countA / periodA.total) * 100 : 0;
        const shareB = periodB.total > 0 ? (countB / periodB.total) * 100 : 0;
        return { label, countA, countB, shareA, shareB, delta: shareB - shareA };
      })
      .sort((a, b) => Math.max(b.countA, b.countB) - Math.max(a.countA, a.countB) || a.label.localeCompare(b.label, "pt-BR"));
  }, [periodA, periodB]);

  const visibleRows = rows.filter((row) => row.label.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  const rises = rows.filter((row) => row.delta > 0).sort((a, b) => b.delta - a.delta);
  const falls = rows.filter((row) => row.delta < 0).sort((a, b) => a.delta - b.delta);
  const rangeOverlaps = rangesOverlap(startA, endA, startB, endB);
  const missingYearCount = summary.questions.filter((question) => parseYear(question.ano) === null).length;

  if (years.length < 2) {
    return (
      <section className="rounded-xl border border-dashed bg-card p-6 text-center">
        <GitCompareArrows className="mx-auto mb-2 size-6 text-muted-foreground" />
        <h2 className="font-semibold">Comparar períodos</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          {years.length === 0
            ? "Cadastre o ano nas questões para habilitar a comparação."
            : "A base filtrada tem questões de apenas um ano. Inclua pelo menos dois anos na análise para comparar períodos."}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <GitCompareArrows className="size-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">Comparar períodos</h2>
            <p className="text-sm text-muted-foreground">Compare áreas, conteúdos, tags e outros critérios usando somente as questões deste recorte.</p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_220px]">
          <YearRange label="Período A" start={startA} end={endA} years={years} onStartChange={setStartA} onEndChange={setEndA} />
          <YearRange label="Período B" start={startB} end={endB} years={years} onStartChange={setStartB} onEndChange={setEndB} />
          <div className="space-y-2 rounded-lg border bg-background p-3">
            <Label htmlFor="comparison-dimension">Comparar por</Label>
            <select
              id="comparison-dimension"
              value={dimension}
              onChange={(event) => setDimension(event.target.value as Dimension)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {DIMENSIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>

        {rangeOverlaps && (
          <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            Os períodos se sobrepõem. As questões dos anos em comum entram nos dois lados da comparação.
          </p>
        )}
        {missingYearCount > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {missingYearCount} questão{missingYearCount === 1 ? "" : "ões"} sem ano ficou{missingYearCount === 1 ? "" : "ram"} fora desta comparação.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <PeriodCountCard label={rangeLabel(startA, endA)} count={periodA.total} />
        <PeriodCountCard label={rangeLabel(startB, endB)} count={periodB.total} />
      </div>

      {(periodA.total < 10 || periodB.total < 10) && (
        <p className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Um dos períodos tem menos de 10 questões. Use as diferenças como descrição desta amostra, não como tendência consolidada.
        </p>
      )}

      {periodA.total === 0 || periodB.total === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-5 text-center text-sm text-muted-foreground">
          Não há questões em um dos períodos selecionados.
        </p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <VariationCard title="Maior aumento de participação" row={rises[0]} direction="up" />
            <VariationCard title="Maior redução de participação" row={falls[0]} direction="down" />
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-semibold">Distribuição comparada</h3>
                <p className="text-xs text-muted-foreground">A variação mostra a diferença entre os percentuais dos períodos, em pontos percentuais.</p>
              </div>
              <div className="w-full sm:max-w-xs">
                <Label htmlFor="comparison-search" className="sr-only">Buscar categoria</Label>
                <Input id="comparison-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar área, conteúdo ou tag" />
              </div>
            </div>

            {visibleRows.length === 0 ? (
              <p className="py-5 text-center text-sm text-muted-foreground">Nenhuma categoria corresponde à busca.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-3 font-medium">Categoria</th>
                      <th className="py-2 pr-3 text-right font-medium">{rangeLabel(startA, endA)}</th>
                      <th className="py-2 pr-3 text-right font-medium">{rangeLabel(startB, endB)}</th>
                      <th className="py-2 text-right font-medium">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.label} className="border-b last:border-0">
                        <td className="max-w-[280px] py-2.5 pr-3 font-medium">{formatDimensionValue(row.label, dimension)}</td>
                        <td className="py-2.5 pr-3 text-right">{row.countA} <span className="text-xs text-muted-foreground">({formatPercent(row.shareA)})</span></td>
                        <td className="py-2.5 pr-3 text-right">{row.countB} <span className="text-xs text-muted-foreground">({formatPercent(row.shareB)})</span></td>
                        <td className="py-2.5 text-right">
                          <ChangeValue value={row.delta} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {dimension === "tag" || dimension === "related" ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Uma questão pode ter várias tags ou conteúdos relacionados; por isso, os percentuais dessas categorias não precisam somar 100%.
              </p>
            ) : null}
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">A comparação descreve os registros e não atribui causas às diferenças observadas.</p>
    </section>
  );
}

function YearRange({ label, start, end, years, onStartChange, onEndChange }: {
  label: string;
  start: string;
  end: string;
  years: string[];
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  const idPrefix = label === "Período A" ? "period-a" : "period-b";
  return (
    <fieldset className="space-y-2 rounded-lg border bg-background p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={idPrefix + "-start"} className="text-xs">De</Label>
          <select id={idPrefix + "-start"} value={start} onChange={(event) => onStartChange(event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Selecione</option>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={idPrefix + "-end"} className="text-xs">Até</Label>
          <select id={idPrefix + "-end"} value={end} onChange={(event) => onEndChange(event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      </div>
    </fieldset>
  );
}

function PeriodCountCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{count.toLocaleString("pt-BR")}</p>
      <p className="text-sm text-muted-foreground">questões no período</p>
    </div>
  );
}

function VariationCard({ title, row, direction }: { title: string; row?: ComparisonRow; direction: "up" | "down" }) {
  const Icon = direction === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex gap-3 rounded-xl border bg-card p-4">
      <Icon className={"mt-0.5 size-5 " + (direction === "up" ? "text-emerald-600" : "text-amber-600")} />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        {row ? (
          <>
            <p className="mt-1 font-semibold">{row.label}</p>
            <p className="text-sm text-muted-foreground">
              {formatSigned(row.delta)} p.p. · {row.countA} → {row.countB} questão{row.countB === 1 ? "" : "ões"}
            </p>
          </>
        ) : <p className="mt-1 text-sm text-muted-foreground">Não houve variação nesta direção neste recorte.</p>}
      </div>
    </div>
  );
}

function ChangeValue({ value }: { value: number }) {
  if (Math.abs(value) < 0.05) {
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="size-3" />0,0 p.p.</span>;
  }
  const positive = value > 0;
  return (
    <span className={"inline-flex items-center gap-1 text-xs font-medium " + (positive ? "text-emerald-700" : "text-amber-700")}>
      {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {formatSigned(value)} p.p.
    </span>
  );
}

function summarizePeriod(questions: ProvaAnalysisQuestion[], dimension: Dimension, start: string, end: string): PeriodStats {
  const startYear = parseYear(start);
  const endYear = parseYear(end);
  if (startYear === null || endYear === null) return { total: 0, counts: new Map() };

  const low = Math.min(startYear, endYear);
  const high = Math.max(startYear, endYear);
  const counts = new Map<string, number>();
  let total = 0;

  for (const question of questions) {
    const year = parseYear(question.ano);
    if (year === null || year < low || year > high) continue;
    total += 1;
    const values = uniqueValues(getValues(question, dimension));
    const selectedValues = values.length > 0 ? values : [emptyLabel(dimension)];
    for (const value of selectedValues) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return { total, counts };
}

function getValues(question: ProvaAnalysisQuestion, dimension: Dimension): string[] {
  if (dimension === "area") return [question.area_geral ?? ""];
  if (dimension === "content") return [question.conteudo_principal ?? ""];
  if (dimension === "subcontent") return [question.subconteudo_principal ?? ""];
  if (dimension === "related") return question.conteudos_relacionados ?? [];
  if (dimension === "tag") return question.tags_livres?.length ? question.tags_livres : question.tags ?? [];
  return [question.tipo ?? ""];
}

function emptyLabel(dimension: Dimension) {
  const labels: Record<Dimension, string> = {
    area: "Sem área geral",
    content: "Sem conteúdo principal",
    subcontent: "Sem subconteúdo",
    related: "Sem conteúdo relacionado",
    tag: "Sem tag",
    type: "Sem tipo",
  };
  return labels[dimension];
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseYear(value?: string | null) {
  const match = String(value ?? "").match(/\b(?:19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  const a1 = parseYear(startA);
  const a2 = parseYear(endA);
  const b1 = parseYear(startB);
  const b2 = parseYear(endB);
  if (a1 === null || a2 === null || b1 === null || b2 === null) return false;
  return Math.max(Math.min(a1, a2), Math.min(b1, b2)) <= Math.min(Math.max(a1, a2), Math.max(b1, b2));
}

function rangeLabel(start: string, end: string) {
  const first = parseYear(start);
  const last = parseYear(end);
  if (first === null || last === null) return "Período";
  return Math.min(first, last) === Math.max(first, last) ? String(first) : Math.min(first, last) + "–" + Math.max(first, last);
}

function formatDimensionValue(value: string, dimension: Dimension) {
  if (dimension !== "type") return value;
  const labels: Record<string, string> = {
    multipla_escolha: "Múltipla escolha",
    certo_errado: "Certo ou errado",
    numerica: "Numérica",
    discursiva: "Discursiva",
    "Sem tipo": "Sem tipo",
  };
  return labels[value] ?? value;
}

function formatPercent(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
}

function formatSigned(value: number) {
  const formatted = Math.abs(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (value > 0 ? "+" : value < 0 ? "−" : "") + formatted;
}