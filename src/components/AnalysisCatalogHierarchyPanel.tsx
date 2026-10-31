import { useMemo } from "react";
import { ChevronRight, Layers } from "lucide-react";
import type { ProvaAnalysisQuestion, ProvaAnalysisSummary } from "@/lib/prova-analysis";

type SubcontentGroup = { name: string; count: number };
type ContentGroup = { name: string; count: number; subcontents: Map<string, SubcontentGroup> };
type AreaGroup = { name: string; count: number; contents: Map<string, ContentGroup> };

export function AnalysisCatalogHierarchyPanel({ summary }: { summary: ProvaAnalysisSummary }) {
  const areas = useMemo(() => buildHierarchy(summary.questions), [summary.questions]);

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="size-5 text-muted-foreground" />
        <div>
          <h2 className="font-semibold">Hierarquia dos conteúdos</h2>
          <p className="text-xs text-muted-foreground">Área geral → conteúdo principal → subconteúdo, com contagem de questões.</p>
        </div>
      </div>

      {areas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
          Não há questões para montar esta hierarquia.
        </p>
      ) : (
        <div className="space-y-2">
          {areas.map((area, index) => (
            <details key={area.name} open={index === 0} className="group rounded-lg border bg-background">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  <span className="truncate">{area.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {area.count} {area.count === 1 ? "questão" : "questões"} · {formatPercent(area.count, summary.total)}
                </span>
              </summary>
              <div className="space-y-2 border-t p-3">
                {[...area.contents.values()].sort(sortByCount).map((content) => (
                  <div key={content.name} className="rounded-md bg-muted/30 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <strong className="text-sm">{content.name}</strong>
                      <span className="text-xs text-muted-foreground">
                        {content.count} {content.count === 1 ? "questão" : "questões"} · {formatPercent(content.count, summary.total)}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 border-l pl-3">
                      {[...content.subcontents.values()].sort(sortByCount).map((subcontent) => (
                        <li key={subcontent.name} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                          <span>{subcontent.name}</span>
                          <span>{subcontent.count} · {formatPercent(subcontent.count, summary.total)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function buildHierarchy(questions: ProvaAnalysisQuestion[]) {
  const areas = new Map<string, AreaGroup>();

  for (const question of questions) {
    const areaName = question.area_geral?.trim() || "Sem área geral";
    const contentName = question.conteudo_principal?.trim() || "Sem conteúdo principal";
    const subcontentName = question.subconteudo_principal?.trim() || "Sem subconteúdo";

    let area = areas.get(areaName);
    if (!area) {
      area = { name: areaName, count: 0, contents: new Map() };
      areas.set(areaName, area);
    }
    area.count += 1;

    let content = area.contents.get(contentName);
    if (!content) {
      content = { name: contentName, count: 0, subcontents: new Map() };
      area.contents.set(contentName, content);
    }
    content.count += 1;

    let subcontent = content.subcontents.get(subcontentName);
    if (!subcontent) {
      subcontent = { name: subcontentName, count: 0 };
      content.subcontents.set(subcontentName, subcontent);
    }
    subcontent.count += 1;
  }

  return [...areas.values()].sort(sortByCount);
}

function sortByCount<T extends { name: string; count: number }>(a: T, b: T) {
  return b.count - a.count || a.name.localeCompare(b.name, "pt-BR");
}

function formatPercent(value: number, total: number) {
  const percent = total > 0 ? (value / total) * 100 : 0;
  return percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
}