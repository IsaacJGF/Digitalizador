import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileSearch,
  Filter,
  Image as ImageIcon,
  Info,
  Layers,
  Loader2,
  Search,
  Sigma,
  Sparkles,
  Target,
  TextSearch,
  TrendingUp,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { AnalysisCrossPanel } from "@/components/AnalysisCrossPanel";
import { AnalysisDataQualityPanel } from "@/components/AnalysisDataQualityPanel";
import { AnalysisDeepAIPanel } from "@/components/AnalysisDeepAIPanel";
import { AnalysisGeneralSummaryPanel } from "@/components/AnalysisAISummaryPanel";
import { AnalysisLanguagePanel } from "@/components/AnalysisLanguagePanel";
import { AnalysisReferencePanel } from "@/components/AnalysisReferencePanel";
import { AnalysisSimulationSuggestionPanel } from "@/components/AnalysisSimulationSuggestionPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { analyzeProvaQuestions, type FrequencyRow, type ProvaAnalysisQuestion, type ProvaAnalysisSummary } from "@/lib/prova-analysis";
import { toast } from "sonner";

export const Route = createFileRoute("/analise-provas")({
  head: () => ({ meta: [{ title: "Análise de Provas" }] }),
  component: Page,
});

type CatalogItem = { id: string; nome: string; ativo: boolean; area_id?: string | null; conteudo_id?: string | null };
type AnalysisFilters = {
  prova: string;
  instituicao: string;
  anoInicial: string;
  anoFinal: string;
  areaGeral: string;
  conteudoPrincipal: string;
  subconteudoPrincipal: string;
  tipo: string;
};
type QuestionRow = ProvaAnalysisQuestion;
type MatrixRow = { content: string; byYear: Record<string, number>; total: number };
type AnalysisTab = "geral" | "conteudos" | "linguagem" | "referencias" | "cruzamentos" | "ia" | "qualidade";
type FilterChipData = { key: keyof AnalysisFilters; label: string; value: string; clearKeys?: Array<keyof AnalysisFilters> };
type QuickFilterMatch = { key: keyof AnalysisFilters; label: string; value: string };
type DrilldownRequest = {
  title: string;
  subtitle?: string;
  evidence: string[];
  recommendations: string[];
  questions: ProvaAnalysisQuestion[];
};
type FrequencyKind = "area" | "conteudo" | "subconteudo" | "relacionado" | "tag" | "tipo";

const EMPTY_FILTERS: AnalysisFilters = {
  prova: "", instituicao: "", anoInicial: "", anoFinal: "",
  areaGeral: "", conteudoPrincipal: "", subconteudoPrincipal: "", tipo: "",
};

const TYPE_OPTIONS = [
  { value: "multipla_escolha", label: "Múltipla escolha" },
  { value: "certo_errado", label: "Certo ou errado" },
  { value: "numerica", label: "Numérica" },
  { value: "discursiva", label: "Discursiva" },
];

const ANALYSIS_COLUMNS = [
  "id", "numero", "enunciado", "tipo", "resposta", "ano", "prova", "instituicao",
  "area_geral", "conteudo_principal", "subconteudo_principal", "conteudos_relacionados",
  "tags_livres", "tags", "grupo_id", "referencia_texto", "referencia_texto_apos",
  "referencia_imagem", "enunciado_imagem", "tem_imagem", "tem_equacao", "alternativas",
].join(",");

const DONUT_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#64748b"];
const FILTER_STORAGE_KEY = "paper-to-word-wiz.analysis.filters";
const FREQUENCY_PAGE_SIZE = 12;

function Page() {
  const [filters, setFilters] = useState<AnalysisFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AnalysisFilters>(EMPTY_FILTERS);
  const [areas, setAreas] = useState<CatalogItem[]>([]);
  const [conteudos, setConteudos] = useState<CatalogItem[]>([]);
  const [subconteudos, setSubconteudos] = useState<CatalogItem[]>([]);
  const [provas, setProvas] = useState<CatalogItem[]>([]);
  const [instituicoes, setInstituicoes] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ProvaAnalysisSummary | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");

  useEffect(() => {
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const tables = [
        ["catalog_areas", setAreas],
        ["catalog_conteudos", setConteudos],
        ["catalog_subconteudos", setSubconteudos],
        ["catalog_provas", setProvas],
        ["catalog_instituicoes", setInstituicoes],
      ] as const;
      for (const [table, setter] of tables) {
        const { data, error } = await db.from(table).select("*").order("nome");
        if (!error) setter((data ?? []) as CatalogItem[]);
      }
    })();
  }, []);

  useEffect(() => {
    const saved = readStoredFilters();
    if (saved) setFilters(saved);
  }, []);

  useEffect(() => {
    writeStoredFilters(filters);
  }, [filters]);

  const selectedArea = areas.find((item) => item.nome === filters.areaGeral);
  const conteudoOptions = selectedArea ? conteudos.filter((item) => item.area_id === selectedArea.id) : conteudos;
  const selectedConteudo = conteudoOptions.find((item) => item.nome === filters.conteudoPrincipal);
  const subconteudoOptions = selectedConteudo ? subconteudos.filter((item) => item.conteudo_id === selectedConteudo.id) : subconteudos;
  const activeFilterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);
  const appliedFilterCount = useMemo(() => Object.values(appliedFilters).filter(Boolean).length, [appliedFilters]);

  const updateFilter = <K extends keyof AnalysisFilters>(key: K, value: AnalysisFilters[K]) => {
    if (key === "areaGeral") {
      setFilters((c) => ({ ...c, areaGeral: value, conteudoPrincipal: "", subconteudoPrincipal: "" }));
      return;
    }
    if (key === "conteudoPrincipal") {
      setFilters((c) => ({ ...c, conteudoPrincipal: value, subconteudoPrincipal: "" }));
      return;
    }
    setFilters((c) => ({ ...c, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setSummary(null);
    setHasAnalyzed(false);
  };

  const analyze = async (overrideFilters = filters) => {
    const normalizedFilters = normalizeFilters(overrideFilters);
    if (!isValidYearRange(normalizedFilters)) {
      toast.error("Confira o intervalo de anos antes de analisar.");
      return;
    }
    setLoading(true);
    setHasAnalyzed(true);
    setAppliedFilters(normalizedFilters);
    setFilterOpen(false);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      let query = db.from("questions").select(ANALYSIS_COLUMNS);
      query = applyFiltersToQuery(query, normalizedFilters);
      const { data, error } = await query.order("ano", { ascending: true }).order("created_at", { ascending: true });
      if (error) {
        console.error("Erro ao consultar questões para análise:", error);
        toast.error("Não foi possível carregar as questões para análise.");
        setSummary(null);
        return;
      }
      setSummary(analyzeProvaQuestions((data ?? []) as QuestionRow[]));
    } finally {
      setLoading(false);
    }
  };

  const appliedChips = buildFilterChips(appliedFilters);
  const draftChips = buildFilterChips(filters);
  const quickFilterMatches = useMemo(
    () => buildQuickFilterMatches(filterSearch, { provas, instituicoes, areas, conteudos: conteudoOptions, subconteudos: subconteudoOptions }),
    [areas, conteudoOptions, filterSearch, instituicoes, provas, subconteudoOptions],
  );

  const removeDraftFilter = (chip: FilterChipData) => {
    setFilters((current) => clearFilterChip(current, chip));
  };
  const removeAppliedFilter = (chip: FilterChipData) => {
    const next = clearFilterChip(appliedFilters, chip);
    setFilters(next);
    void analyze(next);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
        {/* Compact header */}
        <div className="mb-4 flex flex-col gap-3 sm:mb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Análise de Provas</h1>
            <p className="text-sm text-muted-foreground">Padrões de conteúdo, linguagem e cobrança da banca.</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 gap-2 sm:flex-none">
                  <Filter className="size-4" />
                  Filtros
                  {activeFilterCount > 0 && (
                    <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Filtro avançado</SheetTitle>
                  <SheetDescription>Use busca rápida, chips e seleção hierárquica para analisar em menos cliques.</SheetDescription>
                </SheetHeader>
                <div className="grid gap-3 py-4">
                  <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                    <Label htmlFor="analysis-filter-search">Busca rápida</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="analysis-filter-search"
                        value={filterSearch}
                        onChange={(event) => setFilterSearch(event.target.value)}
                        placeholder="Digite ENEM, UnB, Mecânica..."
                        className="pl-9"
                      />
                    </div>
                    {quickFilterMatches.length > 0 && (
                      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                        {quickFilterMatches.map((match) => (
                          <button
                            key={`${match.key}-${match.value}`}
                            type="button"
                            onClick={() => {
                              updateFilter(match.key, match.value);
                              setFilterSearch("");
                            }}
                            className="rounded-full border bg-background px-2 py-1 text-left text-xs hover:bg-muted"
                          >
                            <span className="text-muted-foreground">{match.label}: </span>
                            <strong>{match.value}</strong>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {draftChips.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Filtros escolhidos</p>
                      <div className="flex flex-wrap gap-1.5">
                        {draftChips.map((chip) => (
                          <FilterChip key={chip.key} chip={chip} onRemove={() => removeDraftFilter(chip)} />
                        ))}
                      </div>
                    </div>
                  )}

                  <FilterSelect label="Prova" value={filters.prova} onChange={(v) => updateFilter("prova", v)} options={provas} placeholder="Todas" search={filterSearch} />
                  <FilterSelect label="Instituição" value={filters.instituicao} onChange={(v) => updateFilter("instituicao", v)} options={instituicoes} placeholder="Todas" search={filterSearch} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Ano inicial</Label>
                      <Input value={filters.anoInicial} onChange={(e) => updateFilter("anoInicial", onlyYearDigits(e.target.value))} placeholder="2018" inputMode="numeric" maxLength={4} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Ano final</Label>
                      <Input value={filters.anoFinal} onChange={(e) => updateFilter("anoFinal", onlyYearDigits(e.target.value))} placeholder="2024" inputMode="numeric" maxLength={4} />
                    </div>
                  </div>
                  <FilterSelect label="Área geral" value={filters.areaGeral} onChange={(v) => updateFilter("areaGeral", v)} options={areas} placeholder="Todas" search={filterSearch} />
                  <FilterSelect label="Conteúdo principal" value={filters.conteudoPrincipal} onChange={(v) => updateFilter("conteudoPrincipal", v)} options={conteudoOptions} placeholder="Todos" disabled={Boolean(filters.areaGeral) && conteudoOptions.length === 0} search={filterSearch} />
                  <FilterSelect label="Subconteúdo" value={filters.subconteudoPrincipal} onChange={(v) => updateFilter("subconteudoPrincipal", v)} options={subconteudoOptions} placeholder="Todos" disabled={Boolean(filters.conteudoPrincipal) && subconteudoOptions.length === 0} search={filterSearch} />
                  <div className="space-y-1.5">
                    <Label>Tipo de questão</Label>
                    <select value={filters.tipo} onChange={(e) => updateFilter("tipo", e.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-sm">
                      <option value="">Todos</option>
                      {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <SheetFooter className="mt-auto grid grid-cols-2 gap-2 sm:flex sm:justify-between">
                  <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar campos</Button>
                  <Button onClick={() => analyze()} disabled={loading} className="gap-2">
                    {loading ? <Loader2 className="size-4 animate-spin" /> : <FileSearch className="size-4" />}
                    Analisar
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
            {hasAnalyzed && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar</Button>
            )}
            <Button size="sm" onClick={() => analyze()} disabled={loading} className="flex-1 gap-2 sm:flex-none">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <FileSearch className="size-4" />}
              Analisar
            </Button>
          </div>
        </div>

        {/* Applied filter chips */}
        {appliedFilterCount > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Filtros:</span>
            {appliedChips.map((chip) => (
              <FilterChip key={chip.key} chip={chip} onRemove={() => removeAppliedFilter(chip)} />
            ))}
          </div>
        )}

        {/* Results */}
        {!hasAnalyzed && <EmptyState text="Selecione filtros (opcional) e clique em Analisar para ver os padrões da prova." />}

        {hasAnalyzed && loading && (
          <AnalysisSkeleton />
        )}

        {hasAnalyzed && !loading && summary && summary.total === 0 && (
          <EmptyState text="Nenhuma questão encontrada. Revise os filtros ou cadastre metadados nas questões." />
        )}

        {hasAnalyzed && !loading && summary && summary.total > 0 && (
          <AnalysisResult summary={summary} filters={appliedFilters} />
        )}
      </div>
    </AppLayout>
  );
}

function FilterSelect({ label, value, onChange, options, placeholder, disabled, search = "" }: {
  label: string; value: string; onChange: (v: string) => void; options: CatalogItem[]; placeholder: string; disabled?: boolean; search?: string;
}) {
  const normalizedSearch = normalizeSearch(search);
  const visible = options
    .filter((i) => i.ativo || i.nome === value)
    .filter((i) => !normalizedSearch || normalizeSearch(i.nome).includes(normalizedSearch) || i.nome === value)
    .slice(0, 80);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60">
        <option value="">{placeholder}</option>
        {visible.map((i) => <option key={i.id} value={i.nome}>{i.nome}{i.ativo ? "" : " (inativo)"}</option>)}
      </select>
    </div>
  );
}

function FilterChip({ chip, onRemove }: { chip: FilterChipData; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2 py-1 text-xs shadow-sm">
      <span className="shrink-0 text-muted-foreground">{chip.label}:</span>
      <strong className="truncate font-medium">{chip.value}</strong>
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remover filtro ${chip.label}`}>
        <X className="size-3" />
      </button>
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-4 py-16 text-center">
      <BarChart3 className="mx-auto mb-3 size-8 text-muted-foreground/60" />
      <p className="mx-auto max-w-md text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-xl border bg-card p-2 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <SkeletonBlock key={index} className="h-24" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <SkeletonBlock className="h-72" />
        <SkeletonBlock className="h-72" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonBlock className="h-64" />
        <SkeletonBlock className="h-64" />
      </div>
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}

function AnalysisResult({ summary, filters }: { summary: ProvaAnalysisSummary; filters: AnalysisFilters }) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>("geral");
  const [drilldown, setDrilldown] = useState<DrilldownRequest | null>(null);
  const period = formatPeriod(filters, summary.years);
  const openFrequencyDrilldown = (title: string, kind: FrequencyKind, row: FrequencyRow) => {
    setDrilldown(buildFrequencyDrilldown(summary, title, kind, row));
  };
  const openTextDrilldown = (title: string, evidence: string[], recommendations: string[] = []) => {
    setDrilldown(buildTextDrilldown(summary, title, evidence, recommendations));
  };

  return (
    <div className="space-y-4">
      {summary.total < 10 && (
        <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <strong>Amostra pequena ({summary.total}):</strong> as tendências podem não representar um padrão sólido.
        </div>
      )}

      <SummaryStrip summary={summary} period={period} />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AnalysisTab)}>
        <TabsList className="flex h-auto w-full justify-start overflow-x-auto rounded-lg p-1 [scrollbar-width:none]">
          <TabsTrigger value="geral" className="shrink-0">Visão geral</TabsTrigger>
          <TabsTrigger value="conteudos" className="shrink-0">Conteúdos</TabsTrigger>
          <TabsTrigger value="linguagem" className="shrink-0">Linguagem</TabsTrigger>
          <TabsTrigger value="referencias" className="shrink-0">Textos-base</TabsTrigger>
          <TabsTrigger value="cruzamentos" className="shrink-0">Cruzamentos</TabsTrigger>
          <TabsTrigger value="ia" className="shrink-0 gap-1"><Sparkles className="size-3.5" />IA</TabsTrigger>
          <TabsTrigger value="qualidade" className="shrink-0">Qualidade</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <HorizontalBarChart
              title="Conteúdos mais cobrados"
              rows={summary.contentFrequency}
              emptyText="Nenhum conteúdo principal encontrado."
              onRowClick={(row) => openFrequencyDrilldown("Conteúdo mais cobrado", "conteudo", row)}
            />
            <TypeBreakdownCard summary={summary} onTypeClick={(row) => openFrequencyDrilldown("Tipo de questão", "tipo", row)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <VerticalBarChart title="Questões por ano" rows={summary.questionsByYear} />
            <DonutChart title="Distribuição por área" rows={summary.areaFrequency} total={summary.total} />
          </div>
        </TabsContent>

        <TabsContent value="conteudos" className="mt-4 space-y-4">
          <HeatmapChart title="Mapa Ano × Conteúdo" {...buildContentYearMatrix(summary)} />
          <div className="grid gap-4 lg:grid-cols-2">
            <VisualFrequencyTable title="Conteúdos" rows={summary.contentFrequency} total={summary.total} highlightFirst onRowClick={(row) => openFrequencyDrilldown("Conteúdo", "conteudo", row)} />
            <VisualFrequencyTable title="Subconteúdos" rows={summary.subcontentFrequency} total={summary.total} highlightFirst onRowClick={(row) => openFrequencyDrilldown("Subconteúdo", "subconteudo", row)} />
            <VisualFrequencyTable title="Tags" rows={summary.tagFrequency} total={summary.total} emptyText="Nenhuma tag cadastrada." onRowClick={(row) => openFrequencyDrilldown("Tag", "tag", row)} />
            <VisualFrequencyTable title="Conteúdos relacionados" rows={summary.relatedContentFrequency} total={summary.total} emptyText="Nenhum relacionado cadastrado." onRowClick={(row) => openFrequencyDrilldown("Conteúdo relacionado", "relacionado", row)} />
          </div>
        </TabsContent>

        <TabsContent value="linguagem" className="mt-4"><AnalysisLanguagePanel summary={summary} /></TabsContent>
        <TabsContent value="referencias" className="mt-4"><AnalysisReferencePanel summary={summary} /></TabsContent>
        <TabsContent value="cruzamentos" className="mt-4"><AnalysisCrossPanel summary={summary} /></TabsContent>
        <TabsContent value="ia" className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <AnalysisGeneralSummaryPanel summary={summary} onEvidenceClick={openTextDrilldown} />
            <AnalysisSimulationSuggestionPanel summary={summary} />
          </div>
          <AnalysisDeepAIPanel
            summary={summary}
            filters={filters}
            onPatternClick={(pattern, sectionTitle) => {
              openTextDrilldown(
                `${sectionTitle}: ${pattern.titulo}`,
                [pattern.evidencia, pattern.explicacao].filter(Boolean),
                sectionTitle.toLowerCase().includes("recomenda") ? [pattern.explicacao] : [],
              );
            }}
            onEvidenceClick={(value, sectionTitle) => openTextDrilldown(sectionTitle, [value])}
          />
        </TabsContent>
        <TabsContent value="qualidade" className="mt-4"><AnalysisDataQualityPanel summary={summary} /></TabsContent>
      </Tabs>
      <DrilldownSheet request={drilldown} onOpenChange={(open) => !open && setDrilldown(null)} />
    </div>
  );
}

function SummaryStrip({ summary, period }: { summary: ProvaAnalysisSummary; period: string }) {
  const topContent = summary.contentFrequency.find((row) => row.count > 0);
  const missingCore = summary.missingMetadata.area + summary.missingMetadata.content + summary.missingMetadata.subcontent;
  const missingCorePercent = summary.total > 0 ? Math.round((missingCore / (summary.total * 3)) * 100) : 0;
  const resourceRows = [
    { label: "texto-base", count: summary.withReference, icon: <TextSearch className="size-4" /> },
    { label: "imagem", count: summary.withImage, icon: <ImageIcon className="size-4" /> },
    { label: "equação", count: summary.withEquation, icon: <Sigma className="size-4" /> },
  ].sort((a, b) => b.count - a.count);
  const mainResource = resourceRows[0];
  const dominantType = summary.typeCounts[0];
  const cards = [
    {
      label: "Base analisada",
      value: `${summary.total}`,
      detail: `${summary.years.length || 0} ano(s) · ${period}`,
      icon: <FileSearch className="size-4" />,
      tone: summary.total < 10 ? "warning" : "good",
    },
    {
      label: "Conteúdo dominante",
      value: topContent?.value ?? "Sem conteúdo",
      detail: topContent ? `${topContent.count} itens · ${formatPercent(topContent.percent)}` : "Classifique as questões para ativar este dado",
      icon: topContent && topContent.percent >= 45 ? <Target className="size-4" /> : <TrendingUp className="size-4" />,
      tone: topContent && topContent.percent >= 45 ? "warning" : "info",
    },
    {
      label: "Classificação",
      value: missingCore === 0 ? "Completa" : `${missingCore} lacuna(s)`,
      detail: missingCore === 0 ? "Área, conteúdo e subconteúdo preenchidos" : `${missingCorePercent}% dos campos essenciais vazios`,
      icon: missingCore === 0 ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />,
      tone: missingCore === 0 ? "good" : missingCorePercent >= 20 ? "critical" : "warning",
    },
    {
      label: "Recurso mais usado",
      value: mainResource.count > 0 ? mainResource.label : "Só texto",
      detail: mainResource.count > 0 ? `${mainResource.count} itens · ${percentage(mainResource.count, summary.total)}` : "Nenhum texto-base, imagem ou equação marcado",
      icon: mainResource.count > 0 ? mainResource.icon : <Info className="size-4" />,
      tone: mainResource.label === "imagem" && mainResource.count > 0 ? "warning" : "info",
    },
    {
      label: "Tipo principal",
      value: dominantType ? formatType(dominantType.value) : "Sem tipo",
      detail: dominantType ? `${dominantType.count} itens · ${formatPercent(dominantType.percent)}` : "Cadastre o tipo para cruzamentos melhores",
      icon: <Layers className="size-4" />,
      tone: dominantType?.value === "Sem tipo" ? "warning" : "info",
    },
  ];
  return (
    <div className="grid gap-2 rounded-xl border bg-card p-2 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((s) => (
        <div key={s.label} className={`rounded-lg border px-3 py-2 ${metricToneClass(s.tone)}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {s.icon}
            {s.label}
          </div>
          <div className="mt-1 line-clamp-1 text-xl font-semibold tabular-nums" title={s.value}>{s.value}</div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.detail}</p>
        </div>
      ))}
    </div>
  );
}

function metricToneClass(tone: string) {
  if (tone === "critical") return "border-red-200 bg-red-50";
  if (tone === "warning") return "border-amber-200 bg-amber-50";
  if (tone === "good") return "border-emerald-200 bg-emerald-50";
  return "bg-background";
}

function TypeBreakdownCard({ summary, onTypeClick }: { summary: ProvaAnalysisSummary; onTypeClick?: (row: FrequencyRow) => void }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Por tipo de questão</h2>
      <div className="space-y-2.5">
        {summary.typeCounts.map((item) => (
          <button key={item.value} type="button" onClick={() => onTypeClick?.(item)} className="block w-full rounded-md p-1 text-left hover:bg-muted/50">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{formatType(item.value)}</span>
              <span><strong className="tabular-nums">{item.count}</strong> · {formatPercent(item.percent)}</span>
            </div>
            <ProgressBar percent={item.percent} />
          </button>
        ))}
      </div>
    </div>
  );
}

function HorizontalBarChart({ title, rows, emptyText, onRowClick }: { title: string; rows: FrequencyRow[]; emptyText: string; onRowClick?: (row: FrequencyRow) => void }) {
  const visible = rows.filter((r) => r.count > 0).slice(0, 10);
  const max = Math.max(...visible.map((r) => r.count), 0);
  return (
    <ChartCard title={title}>
      {visible.length === 0 ? <p className="text-sm text-muted-foreground">{emptyText}</p> : (
        <div className="space-y-2.5">
          {visible.map((row) => (
            <button key={row.value} type="button" onClick={() => onRowClick?.(row)} className="grid w-full gap-2 rounded-md p-1 text-left hover:bg-muted/50 sm:grid-cols-[160px_1fr_80px] sm:items-center">
              <span className="line-clamp-1 text-sm" title={row.value}>{row.value}</span>
              <ProgressBar percent={max > 0 ? (row.count / max) * 100 : 0} />
              <span className="text-right text-xs text-muted-foreground tabular-nums">{row.count} · {formatPercent(row.percent)}</span>
            </button>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

function VerticalBarChart({ title, rows }: { title: string; rows: Array<{ year: string; count: number }> }) {
  const visible = rows.filter((r) => r.count > 0).slice(-12);
  const max = Math.max(...visible.map((r) => r.count), 0);
  return (
    <ChartCard title={title}>
      {visible.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum ano informado.</p> : (
        <div className="flex h-56 items-end gap-2 overflow-x-auto rounded-lg bg-muted/20 p-3">
          {visible.map((row) => (
            <div key={row.year} className="flex min-w-10 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-xs font-semibold tabular-nums">{row.count}</span>
              <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.max(6, max > 0 ? (row.count / max) * 160 : 0)}px` }} />
              <span className="text-[11px] text-muted-foreground">{row.year}</span>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

function DonutChart({ title, rows, total }: { title: string; rows: FrequencyRow[]; total: number }) {
  const visible = rows.filter((r) => r.count > 0).slice(0, 6);
  const gradient = buildDonutGradient(visible, total);
  return (
    <ChartCard title={title}>
      {visible.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma área encontrada.</p> : (
        <div className="grid gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
          <div className="relative mx-auto size-32 rounded-full" style={{ background: gradient }}>
            <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-card">
              <strong className="text-xl tabular-nums">{total}</strong>
              <span className="text-[10px] text-muted-foreground">questões</span>
            </div>
          </div>
          <div className="space-y-1.5">
            {visible.map((row, i) => (
              <div key={row.value} className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  <span className="line-clamp-1">{row.value}</span>
                </span>
                <strong className="tabular-nums">{formatPercent(row.percent)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function HeatmapChart({ title, years, rows }: { title: string; years: string[]; rows: MatrixRow[] }) {
  const max = Math.max(...rows.flatMap((r) => Object.values(r.byYear)), 0);
  return (
    <ChartCard title={title}>
      {years.length === 0 || rows.length === 0 ? <p className="text-sm text-muted-foreground">Dados insuficientes.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="sticky left-0 bg-card py-2 pr-2 text-left font-medium">Conteúdo</th>
                {years.map((y) => <th key={y} className="px-2 py-2 text-center font-medium">{y}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.content} className="border-b last:border-0">
                  <td className="sticky left-0 max-w-52 bg-card py-2 pr-2 text-sm"><span className="line-clamp-1" title={row.content}>{row.content}</span></td>
                  {years.map((y) => {
                    const v = row.byYear[y] ?? 0;
                    return (
                      <td key={y} className="p-1 text-center">
                        <span className="inline-flex h-7 w-full items-center justify-center rounded text-xs font-semibold tabular-nums" style={{ backgroundColor: heatmapCellColor(v, max) }}>
                          {v || ""}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function VisualFrequencyTable({ title, rows, total, emptyText = "Sem dados.", highlightFirst, onRowClick }: { title: string; rows: FrequencyRow[]; total: number; emptyText?: string; highlightFirst?: boolean; onRowClick?: (row: FrequencyRow) => void }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / FREQUENCY_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * FREQUENCY_PAGE_SIZE;
  const visible = rows.slice(start, start + FREQUENCY_PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [rows]);
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">Base: {total}</span>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {visible.map((row, i) => (
            <button key={row.value} type="button" onClick={() => onRowClick?.(row)} className="group block w-full rounded-md p-1 text-left hover:bg-muted/50">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 truncate">
                  {highlightFirst && start + i === 0 && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">#1</span>}
                  <span className="truncate" title={row.value}>{row.value}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{row.count} · {formatPercent(row.percent)}</span>
              </div>
              <ProgressBar percent={row.percent} />
            </button>
          ))}
          {rows.length > FREQUENCY_PAGE_SIZE && (
            <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
              <span>{start + 1}-{Math.min(start + FREQUENCY_PAGE_SIZE, rows.length)} de {rows.length}</span>
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="outline" className="h-8 px-2" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 px-2" disabled={safePage >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DrilldownSheet({ request, onOpenChange }: { request: DrilldownRequest | null; onOpenChange: (open: boolean) => void }) {
  const [page, setPage] = useState(0);
  const questions = request?.questions ?? [];
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(questions.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = questions.slice(safePage * pageSize, safePage * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [request?.title]);

  return (
    <Sheet open={Boolean(request)} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{request?.title ?? "Detalhes"}</SheetTitle>
          {request?.subtitle && <SheetDescription>{request.subtitle}</SheetDescription>}
        </SheetHeader>

        {request && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Questões relacionadas</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{questions.length}</p>
              <p className="text-xs text-muted-foreground">Clique em abrir para editar a questão na aba de questões salvas.</p>
            </div>

            {request.evidence.length > 0 && (
              <DrilldownList title="Evidências" values={request.evidence} />
            )}
            {request.recommendations.length > 0 && (
              <DrilldownList title="Recomendações" values={request.recommendations} />
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Itens encontrados</h3>
                {questions.length > pageSize && (
                  <span className="text-xs text-muted-foreground">
                    {safePage * pageSize + 1}-{Math.min((safePage + 1) * pageSize, questions.length)} de {questions.length}
                  </span>
                )}
              </div>
              {visible.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma questão relacionada foi encontrada para este padrão.</p>
              ) : (
                <div className="space-y-2">
                  {visible.map((question) => (
                    <div key={question.id} className="rounded-lg border bg-background p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="font-mono">#{question.id.slice(0, 6)}</span>
                            {question.numero && <span>Item {question.numero}</span>}
                            {question.prova && <span>{question.prova}</span>}
                            {question.instituicao && <span>{question.instituicao}</span>}
                            {question.ano && <span>{question.ano}</span>}
                          </div>
                          <p className="mt-1 line-clamp-3 text-sm">{plainQuestionText(question) || "Sem texto cadastrado."}</p>
                        </div>
                        <Button asChild size="sm" variant="outline" className="h-8 shrink-0 gap-1 px-2">
                          <a href={`/questoes?editId=${encodeURIComponent(question.id)}`}>
                            Abrir <ExternalLink className="size-3" />
                          </a>
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {questionMetadataChips(question).map((chip) => (
                          <span key={chip} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{chip}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {questions.length > pageSize && (
                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button type="button" size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
                    <ChevronLeft className="mr-1 size-3.5" /> Anterior
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={safePage >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>
                    Próxima <ChevronRight className="ml-1 size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrilldownList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {values.map((value) => <li key={value}>• {value}</li>)}
      </ul>
    </div>
  );
}

function buildFrequencyDrilldown(summary: ProvaAnalysisSummary, title: string, kind: FrequencyKind, row: FrequencyRow): DrilldownRequest {
  const questions = summary.questions.filter((question) => questionMatchesFrequency(question, kind, row.value));
  return {
    title: `${title}: ${row.value}`,
    subtitle: `${row.count} questão${row.count === 1 ? "" : "ões"} · ${formatPercent(row.percent)} da base analisada`,
    evidence: [
      `${row.value} aparece em ${row.count} de ${summary.total} questões analisadas.`,
      row.years.length > 0 ? `Anos associados: ${row.years.join(", ")}.` : "Sem ano cadastrado nas questões relacionadas.",
    ],
    recommendations: [
      kind === "tipo"
        ? "Use este recorte para equilibrar tipos de questão no simulado."
        : "Abra os itens relacionados para conferir como esse conteúdo aparece no enunciado, nas alternativas e nos textos-base.",
    ],
    questions,
  };
}

function buildTextDrilldown(summary: ProvaAnalysisSummary, title: string, evidence: string[], recommendations: string[] = []): DrilldownRequest {
  const terms = evidence.flatMap(extractDrilldownTerms).slice(0, 12);
  const questions = terms.length === 0
    ? summary.questions.slice(0, 24)
    : summary.questions.filter((question) => {
      const searchable = normalizeSearch(plainQuestionText(question));
      return terms.some((term) => searchable.includes(term));
    });
  return {
    title,
    subtitle: terms.length > 0 ? `Busca por: ${terms.slice(0, 5).join(", ")}` : "Amostra inicial da base analisada",
    evidence,
    recommendations,
    questions,
  };
}

function questionMatchesFrequency(question: ProvaAnalysisQuestion, kind: FrequencyKind, value: string) {
  if (kind === "area") return (question.area_geral || "Sem área geral") === value;
  if (kind === "conteudo") return (question.conteudo_principal || "Sem conteúdo principal") === value;
  if (kind === "subconteudo") return (question.subconteudo_principal || "Sem subconteúdo principal") === value;
  if (kind === "relacionado") return (question.conteudos_relacionados ?? []).includes(value);
  if (kind === "tag") return [...(question.tags_livres ?? []), ...(question.tags ?? [])].includes(value);
  if (kind === "tipo") return (question.tipo || "Sem tipo") === value;
  return false;
}

function extractDrilldownTerms(value: string) {
  return normalizeSearch(value)
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length >= 4 && !DRILLDOWN_STOP_WORDS.has(term));
}

const DRILLDOWN_STOP_WORDS = new Set([
  "questao", "questoes", "analise", "padrao", "padroes", "conteudo", "conteudos",
  "evidencia", "base", "itens", "item", "mais", "menos", "para", "como", "com",
  "sem", "dos", "das", "uma", "que", "por", "quando", "sobre", "dados",
]);

function plainQuestionText(question: ProvaAnalysisQuestion) {
  return [
    question.referencia_texto,
    question.referencia_texto_apos,
    question.enunciado,
    ...(question.alternativas ?? []).map((alt) => alt.texto),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\[\[img:\d+\]\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\$+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function questionMetadataChips(question: ProvaAnalysisQuestion) {
  return [
    question.area_geral,
    question.conteudo_principal,
    question.subconteudo_principal,
    ...(question.conteudos_relacionados ?? []).slice(0, 2),
    ...(question.tags_livres?.length ? question.tags_livres : question.tags ?? []).slice(0, 2),
  ].filter((value): value is string => Boolean(value));
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
    </div>
  );
}

function buildFilterChips(f: AnalysisFilters): FilterChipData[] {
  const chips: FilterChipData[] = [];
  if (f.prova) chips.push({ key: "prova", label: "Prova", value: f.prova });
  if (f.instituicao) chips.push({ key: "instituicao", label: "Instituição", value: f.instituicao });
  if (f.anoInicial || f.anoFinal) chips.push({ key: "anoInicial", clearKeys: ["anoInicial", "anoFinal"], label: "Período", value: `${f.anoInicial || "…"}–${f.anoFinal || "…"}` });
  if (f.areaGeral) chips.push({ key: "areaGeral", label: "Área", value: f.areaGeral });
  if (f.conteudoPrincipal) chips.push({ key: "conteudoPrincipal", label: "Conteúdo", value: f.conteudoPrincipal });
  if (f.subconteudoPrincipal) chips.push({ key: "subconteudoPrincipal", label: "Subconteúdo", value: f.subconteudoPrincipal });
  if (f.tipo) chips.push({ key: "tipo", label: "Tipo", value: formatType(f.tipo) });
  return chips;
}

function clearFilterChip(filters: AnalysisFilters, chip: FilterChipData): AnalysisFilters {
  const next = { ...filters };
  const keys = chip.clearKeys ?? [chip.key];
  for (const key of keys) next[key] = "";
  if (keys.includes("areaGeral")) {
    next.conteudoPrincipal = "";
    next.subconteudoPrincipal = "";
  }
  if (keys.includes("conteudoPrincipal")) {
    next.subconteudoPrincipal = "";
  }
  return next;
}

function buildQuickFilterMatches(search: string, catalogs: { provas: CatalogItem[]; instituicoes: CatalogItem[]; areas: CatalogItem[]; conteudos: CatalogItem[]; subconteudos: CatalogItem[] }): QuickFilterMatch[] {
  const value = normalizeSearch(search);
  if (value.length < 2) return [];
  const sources: Array<{ key: keyof AnalysisFilters; label: string; items: CatalogItem[] }> = [
    { key: "prova", label: "Prova", items: catalogs.provas },
    { key: "instituicao", label: "Instituição", items: catalogs.instituicoes },
    { key: "areaGeral", label: "Área", items: catalogs.areas },
    { key: "conteudoPrincipal", label: "Conteúdo", items: catalogs.conteudos },
    { key: "subconteudoPrincipal", label: "Subconteúdo", items: catalogs.subconteudos },
  ];
  return sources
    .flatMap((source) => source.items
      .filter((item) => item.ativo && normalizeSearch(item.nome).includes(value))
      .slice(0, 6)
      .map((item) => ({ key: source.key, label: source.label, value: item.nome })))
    .slice(0, 18);
}

function readStoredFilters(): AnalysisFilters | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isAnalysisFilters(parsed) ? normalizeFilters(parsed) : null;
  } catch {
    return null;
  }
}

function writeStoredFilters(filters: AnalysisFilters) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore storage limits or private browsing restrictions.
  }
}

function isAnalysisFilters(value: unknown): value is AnalysisFilters {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Object.keys(EMPTY_FILTERS).every((key) => typeof record[key] === "string");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFiltersToQuery(query: any, filters: AnalysisFilters) {
  if (filters.prova) query = query.eq("prova", filters.prova);
  if (filters.instituicao) query = query.eq("instituicao", filters.instituicao);
  if (filters.anoInicial) query = query.gte("ano", filters.anoInicial);
  if (filters.anoFinal) query = query.lte("ano", filters.anoFinal);
  if (filters.areaGeral) query = query.eq("area_geral", filters.areaGeral);
  if (filters.conteudoPrincipal) query = query.eq("conteudo_principal", filters.conteudoPrincipal);
  if (filters.subconteudoPrincipal) query = query.eq("subconteudo_principal", filters.subconteudoPrincipal);
  if (filters.tipo) query = query.eq("tipo", filters.tipo);
  return query;
}

function normalizeFilters(f: AnalysisFilters): AnalysisFilters {
  return {
    prova: f.prova.trim(), instituicao: f.instituicao.trim(),
    anoInicial: f.anoInicial.trim(), anoFinal: f.anoFinal.trim(),
    areaGeral: f.areaGeral.trim(), conteudoPrincipal: f.conteudoPrincipal.trim(),
    subconteudoPrincipal: f.subconteudoPrincipal.trim(), tipo: f.tipo.trim(),
  };
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isValidYearRange(f: AnalysisFilters) {
  const s = f.anoInicial ? Number(f.anoInicial) : null;
  const e = f.anoFinal ? Number(f.anoFinal) : null;
  if (f.anoInicial && (!Number.isFinite(s) || f.anoInicial.length !== 4)) return false;
  if (f.anoFinal && (!Number.isFinite(e) || f.anoFinal.length !== 4)) return false;
  if (s && e && s > e) return false;
  return true;
}

function buildContentYearMatrix(summary: ProvaAnalysisSummary) {
  const years = summary.years.slice(-10);
  const topContents = summary.contentFrequency.slice(0, 8).map((r) => r.value);
  const rows = topContents.map((content) => ({ content, byYear: {} as Record<string, number>, total: 0 }));
  const rowMap = new Map(rows.map((r) => [r.content, r]));
  for (const q of summary.questions) {
    const content = q.conteudo_principal || "Sem conteúdo principal";
    const year = q.ano;
    if (!year || !years.includes(year)) continue;
    const row = rowMap.get(content);
    if (!row) continue;
    row.byYear[year] = (row.byYear[year] ?? 0) + 1;
    row.total += 1;
  }
  return { years, rows: rows.filter((r) => r.total > 0) };
}

function buildDonutGradient(rows: FrequencyRow[], total: number) {
  if (rows.length === 0 || total === 0) return "#e5e7eb";
  let current = 0;
  const parts: string[] = [];
  rows.forEach((row, i) => {
    const start = current;
    const end = current + (row.count / total) * 100;
    parts.push(`${DONUT_COLORS[i % DONUT_COLORS.length]} ${start}% ${end}%`);
    current = end;
  });
  if (current < 100) parts.push(`#e5e7eb ${current}% 100%`);
  return `conic-gradient(${parts.join(", ")})`;
}

function heatmapCellColor(value: number, max: number) {
  if (!value || !max) return "hsl(var(--muted))";
  const opacity = 0.15 + (value / max) * 0.65;
  return `rgba(37, 99, 235, ${opacity})`;
}

function percentage(value: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatPeriod(f: AnalysisFilters, years: string[]) {
  if (f.anoInicial && f.anoFinal) return `${f.anoInicial}–${f.anoFinal}`;
  if (f.anoInicial) return `Desde ${f.anoInicial}`;
  if (f.anoFinal) return `Até ${f.anoFinal}`;
  if (years.length > 0) return `${years[0]}–${years[years.length - 1]}`;
  return "Todos";
}

function onlyYearDigits(v: string) {
  return v.replace(/\D/g, "").slice(0, 4);
}

function formatType(tipo: string) {
  const labels: Record<string, string> = {
    multipla_escolha: "Múltipla escolha",
    certo_errado: "Certo ou errado",
    numerica: "Numérica",
    discursiva: "Discursiva",
    "Sem tipo": "Sem tipo",
  };
  return labels[tipo] ?? tipo;
}
