import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  Copy,
  Loader2,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CatalogMultiSelect } from "@/components/CatalogSelect";
import { QuestionReviewPdfPanel } from "@/components/QuestionReviewPdfPanel";
import { QuestionPreviewContent } from "@/components/QuestionPreviewDialog";
import type { PreviewQuestion } from "@/components/QuestionPreviewDialog";
import { supabase } from "@/integrations/supabase/client";
import { legacyReferenceToContent } from "@/lib/content-blocks";
import { normalizeExtraImages, type ExtraImage, type ImagePlacementLayout } from "@/lib/image-layout";
import { toast } from "sonner";

const PAGE_SIZE = 25;
const RESTORE_KEY = "digitalizador.revisao-interna.return-state";
const SUMMARY_COLUMNS = [
  "id",
  "numero",
  "ano",
  "prova",
  "instituicao",
  "enunciado",
  "area_geral",
  "conteudo_principal",
  "subconteudo_principal",
  "grupo_id",
  "fonte",
  "referencia_texto",
  "referencia_texto_apos",
  "referencia_fonte",
  "total_criteria",
  "completed_criteria",
  "pending_criteria",
  "attention_criteria",
  "is_complete",
  "adjustment_count",
  "last_adjustment_at",
].join(",");

type CatalogOption = { id: string; nome: string; ativo: boolean };
type ReviewFilters = { anos: string[]; provas: string[]; instituicoes: string[] };
type ReviewCriterion =
  | "texto_base" | "enunciado" | "alternativas" | "gabarito"
  | "imagens" | "formatacao" | "dados_prova" | "classificacao";
type ReviewStatus =
  | "pendente" | "precisa_ajuste" | "ajustado_pendente_conferencia"
  | "conferido_ok" | "nao_se_aplica" | "duvida";
type ReviewQueueMode = "pending" | "changed" | "all";
type ReviewCheck = {
  question_id: string;
  criterio: ReviewCriterion;
  status: ReviewStatus;
  observacao: string;
  updated_at: string;
};
type ReviewHistoryEntry = {
  id: string;
  question_id: string;
  criterio: ReviewCriterion;
  status_anterior: ReviewStatus | null;
  status_novo: ReviewStatus;
  observacao: string;
  motivo: "manual" | "questao_editada";
  changed_at: string;
};
type ReviewStats = { total: number; completed: number; pending: number; changed: number };
type ReviewListItem = {
  id: string;
  numero: string | null;
  ano: string | null;
  prova: string | null;
  instituicao: string | null;
  enunciado: string;
  area_geral: string | null;
  conteudo_principal: string | null;
  subconteudo_principal: string | null;
  grupo_id: string | null;
  total_criteria: number;
  completed_criteria: number;
  pending_criteria: number;
  attention_criteria: number;
  is_complete: boolean;
  adjustment_count: number;
  last_adjustment_at: string | null;
};
type ReviewQuestion = PreviewQuestion & {
  id: string;
  ano: string | null;
  prova: string | null;
  instituicao: string | null;
  area_geral: string | null;
  conteudo_principal: string | null;
  subconteudo_principal: string | null;
  conteudos_relacionados: string[];
  tags_livres: string[];
  dificuldade: string | null;
  observacoes: string | null;
  referencia_texto: string | null;
  referencia_texto_apos: string | null;
  referencia_fonte: string | null;
  referencia_imagem: string | null;
  referencia_imagem_pos: string | null;
  referencia_imagem_layout: ImagePlacementLayout | null;
  referencia_imagens_extra: ExtraImage[];
  created_at: string | null;
  updated_at: string | null;
  tem_equacao: boolean;
  tem_imagem: boolean;
  imagem_original_url: string | null;
  grupo_id: string | null;
};

const EMPTY_FILTERS: ReviewFilters = { anos: [], provas: [], instituicoes: [] };
const REVIEW_CRITERIA: Array<{ id: ReviewCriterion; label: string }> = [
  { id: "texto_base", label: "Texto-base" },
  { id: "enunciado", label: "Enunciado" },
  { id: "alternativas", label: "Alternativas" },
  { id: "gabarito", label: "Gabarito" },
  { id: "imagens", label: "Imagens" },
  { id: "formatacao", label: "Formatação" },
  { id: "dados_prova", label: "Dados da prova" },
  { id: "classificacao", label: "Classificação" },
];
const REVIEW_STATUSES: Array<{ value: ReviewStatus; label: string }> = [
  { value: "pendente", label: "Pendente" },
  { value: "precisa_ajuste", label: "Precisa de ajuste" },
  { value: "ajustado_pendente_conferencia", label: "Ajuste feito — falta conferir" },
  { value: "conferido_ok", label: "Conferido — OK" },
  { value: "nao_se_aplica", label: "Não se aplica" },
  { value: "duvida", label: "Dúvida" },
];
const REVIEW_STATUS_LABELS = Object.fromEntries(
  REVIEW_STATUSES.map((status) => [status.value, status.label]),
) as Record<ReviewStatus, string>;

export const Route = createFileRoute("/revisao-interna")({
  head: () => ({ meta: [{ title: "Revisão interna de questões" }] }),
  component: ReviewWorkspace,
});

function ReviewWorkspace() {
  const [initialized, setInitialized] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 350);
  const [filters, setFilters] = useState<ReviewFilters>(EMPTY_FILTERS);
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const [years, setYears] = useState<CatalogOption[]>([]);
  const [tests, setTests] = useState<CatalogOption[]>([]);
  const [institutions, setInstitutions] = useState<CatalogOption[]>([]);
  const [items, setItems] = useState<ReviewListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [question, setQuestion] = useState<ReviewQuestion | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [queueMode, setQueueMode] = useState<ReviewQueueMode>("pending");
  const [reviewChecks, setReviewChecks] = useState<ReviewCheck[]>([]);
  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryEntry[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [reviewMetadataLoading, setReviewMetadataLoading] = useState(false);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const [stats, setStats] = useState<ReviewStats>({ total: 0, completed: 0, pending: 0, changed: 0 });
  const [copied, setCopied] = useState(false);
  const pendingPageDirection = useRef<"first" | "last" | null>(null);
  const preferredQuestionId = useRef("");
  const selectedIdRef = useRef("");
  const filterChangeInitialized = useRef(false);

  selectedIdRef.current = selectedId;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(RESTORE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          query?: unknown;
          filters?: Partial<ReviewFilters>;
          page?: unknown;
          selectedId?: unknown;
        };
        if (typeof parsed.query === "string") setQuery(parsed.query);
        if (parsed.filters && typeof parsed.filters === "object") {
          setFilters({
            anos: stringArray(parsed.filters.anos),
            provas: stringArray(parsed.filters.provas),
            instituicoes: stringArray(parsed.filters.instituicoes),
          });
        }
        if (typeof parsed.page === "number" && Number.isInteger(parsed.page) && parsed.page >= 0) {
          setPage(parsed.page);
        }
        if (typeof parsed.selectedId === "string") preferredQuestionId.current = parsed.selectedId;
        sessionStorage.removeItem(RESTORE_KEY);
      }
    } catch (error) {
      console.warn("Não foi possível recuperar o estado da revisão:", error);
      sessionStorage.removeItem(RESTORE_KEY);
    } finally {
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [yearResult, testResult, institutionResult] = await Promise.all([
        db.from("questions").select("ano").not("ano", "is", null).order("ano", { ascending: false }).limit(3000),
        db.from("catalog_provas").select("id,nome,ativo").order("nome"),
        db.from("catalog_instituicoes").select("id,nome,ativo").order("nome"),
      ]);
      if (cancelled) return;
      if (yearResult.error || testResult.error || institutionResult.error) {
        console.error("Falha ao carregar opções da revisão:", yearResult.error ?? testResult.error ?? institutionResult.error);
        toast.error("Não foi possível carregar todas as opções de filtro.");
      }
      const uniqueYearNames = [...new Set(((yearResult.data ?? []) as Array<{ ano?: string | null }>)
        .flatMap((row) => row.ano ? [row.ano] : []))].sort((a, b) => b.localeCompare(a, "pt-BR"));
      setYears(uniqueYearNames.map((nome) => ({ id: "ano-" + nome, nome, ativo: true })));
      setTests((testResult.data ?? []) as CatalogOption[]);
      setInstitutions((institutionResult.data ?? []) as CatalogOption[]);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (!filterChangeInitialized.current) {
      filterChangeInitialized.current = true;
      return;
    }
    pendingPageDirection.current = null;
    preferredQuestionId.current = "";
    setPage(0);
    setSelectedId("");
  }, [debouncedQuery, filterKey, initialized, queueMode]);

  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;
    setLoadingList(true);
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any;
        let request = db.from("question_review_queue").select(SUMMARY_COLUMNS, { count: "exact" });
        if (queueMode === "pending") request = request.eq("is_complete", false);
        if (queueMode === "changed") request = request.gt("adjustment_count", 0);
        const term = debouncedQuery.trim().replace(/[^a-zA-ZÀ-ÿ0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
        if (term) {
          request = request.or(
            "enunciado.ilike.%"+term+"%,referencia_texto.ilike.%"+term+
            "%,referencia_texto_apos.ilike.%"+term+"%,referencia_fonte.ilike.%"+term+
            "%,fonte.ilike.%"+term+"%",
          );
        }
        if (filters.anos.length) request = request.in("ano", filters.anos);
        if (filters.provas.length) request = request.in("prova", filters.provas);
        if (filters.instituicoes.length) request = request.in("instituicao", filters.instituicoes);
        const { data, count, error } = await request
          .order("ano", { ascending: false })
          .order("numero", { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (cancelled) return;
        if (error) {
          console.error("Falha ao carregar fila de revisão:", error);
          toast.error("Não foi possível carregar as questões para revisão.");
          setItems([]);
          setTotal(0);
          setSelectedId("");
          return;
        }

        const rows = ((data ?? []) as Array<Partial<ReviewListItem>>).map(normalizeListItem);
        if (rows.length === 0 && (count ?? 0) > 0 && page > 0) {
          setPage(Math.max(0, Math.ceil((count ?? 0) / PAGE_SIZE) - 1));
          return;
        }
        setItems(rows);
        setTotal(count ?? 0);
        const preferred = preferredQuestionId.current;
        const saved = selectedIdRef.current;
        const target = rows.find((item) => item.id === preferred)
          ?? rows.find((item) => item.id === saved)
          ?? (pendingPageDirection.current === "last" ? rows[rows.length - 1] : rows[0]);
        pendingPageDirection.current = null;
        preferredQuestionId.current = "";
        setSelectedId(target?.id ?? "");
      } catch (error) {
        if (cancelled) return;
        console.error("Falha inesperada ao carregar fila de revisão:", error);
        toast.error("Ocorreu um erro ao carregar a fila.");
        setItems([]);
        setTotal(0);
        setSelectedId("");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialized, page, debouncedQuery, filters, queueMode, reviewRefreshKey]);

  const loadQuestion = useCallback(async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("questions")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return normalizeQuestion(data as Record<string, unknown>);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setQuestion(null);
      return;
    }
    let cancelled = false;
    setQuestion(null);
    setLoadingQuestion(true);
    void loadQuestion(selectedId)
      .then((full) => { if (!cancelled) setQuestion(full); })
      .catch((error) => {
        if (cancelled) return;
        console.error("Falha ao abrir questão para revisão:", error);
        toast.error("Não foi possível carregar todos os campos da questão.");
      })
      .finally(() => { if (!cancelled) setLoadingQuestion(false); });
    return () => { cancelled = true; };
  }, [selectedId, loadQuestion]);

  const loadReviewMetadata = useCallback(async (id: string) => {
    setReviewMetadataLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [checksResult, historyResult] = await Promise.all([
        db.from("question_review_checks").select("*").eq("question_id", id).order("criterio"),
        db.from("question_review_history").select("*").eq("question_id", id).order("changed_at", { ascending: false }).limit(60),
      ]);
      if (checksResult.error) throw checksResult.error;
      if (historyResult.error) throw historyResult.error;
      const checks = (checksResult.data ?? []) as ReviewCheck[];
      setReviewChecks(checks);
      setNoteDrafts(Object.fromEntries(checks.map((check) => [check.criterio, check.observacao ?? ""])));
      setReviewHistory((historyResult.data ?? []) as ReviewHistoryEntry[]);
    } catch (error) {
      console.error("Falha ao carregar o histórico da revisão:", error);
      toast.error("Não foi possível carregar o checklist. Verifique se a migração da revisão foi aplicada.");
      setReviewChecks([]);
      setReviewHistory([]);
      setNoteDrafts({});
    } finally {
      setReviewMetadataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setReviewChecks([]);
      setReviewHistory([]);
      setNoteDrafts({});
      return;
    }
    void loadReviewMetadata(selectedId);
  }, [selectedId, loadReviewMetadata]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const count = async (filter?: (query: any) => any) => {
      let request = db.from("question_review_summary").select("question_id", { count: "exact", head: true });
      if (filter) request = filter(request);
      const result = await request;
      if (result.error) throw result.error;
      return result.count ?? 0;
    };
    void Promise.all([
      count(),
      count((request) => request.eq("is_complete", true)),
      count((request) => request.eq("is_complete", false)),
      count((request) => request.gt("adjustment_count", 0)),
    ]).then(([totalCount, completedCount, pendingCount, changedCount]) => {
      if (!cancelled) setStats({ total: totalCount, completed: completedCount, pending: pendingCount, changed: changedCount });
    }).catch((error) => {
      if (!cancelled) console.error("Falha ao carregar resumo da revisão:", error);
    });
    return () => { cancelled = true; };
  }, [reviewRefreshKey]);

  const updateReviewCheck = async (criterion: ReviewCriterion, status?: ReviewStatus, note?: string) => {
    if (!question) return;
    const current = reviewChecks.find((check) => check.criterio === criterion);
    if (!current) {
      toast.error("O critério ainda não foi inicializado. Verifique a migração da revisão.");
      return;
    }
    const nextStatus = status ?? current.status;
    const nextNote = note ?? noteDrafts[criterion] ?? current.observacao;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("question_review_checks")
      .update({ status: nextStatus, observacao: nextNote })
      .eq("question_id", question.id)
      .eq("criterio", criterion)
      .select("*")
      .single();
    if (error) {
      console.error("Falha ao salvar checklist:", error);
      toast.error("Não foi possível salvar este critério.");
      return;
    }
    const updated = data as ReviewCheck;
    setReviewChecks((currentChecks) => currentChecks.map((check) => check.criterio === criterion ? updated : check));
    setNoteDrafts((currentNotes) => ({ ...currentNotes, [criterion]: updated.observacao ?? "" }));
    await loadReviewMetadata(question.id);
    setReviewRefreshKey((value) => value + 1);
    toast.success("Critério de revisão atualizado.");
  };

  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const position = page * PAGE_SIZE + Math.max(0, selectedIndex) + 1;

  const navigateQuestion = (direction: -1 | 1) => {
    if (loadingList || !items.length) return;
    const nextIndex = selectedIndex + direction;
    if (nextIndex >= 0 && nextIndex < items.length) {
      setSelectedId(items[nextIndex].id);
      return;
    }
    if (direction > 0 && page + 1 < totalPages) {
      pendingPageDirection.current = "first";
      setPage((current) => current + 1);
    } else if (direction < 0 && page > 0) {
      pendingPageDirection.current = "last";
      setPage((current) => current - 1);
    }
  };

  const openEditor = () => {
    if (!question) return;
    try {
      sessionStorage.setItem(RESTORE_KEY, JSON.stringify({
        query,
        filters,
        page,
        selectedId: question.id,
      }));
    } catch (error) {
      console.warn("Não foi possível guardar a posição da revisão:", error);
    }
    const params = new URLSearchParams({
      editar: question.id,
      voltar: "/revisao-interna",
    });
    window.location.assign("/questoes?" + params.toString());
  };

  const copyQuestion = async () => {
    if (!question) return;
    const packet = {
      id: question.id,
      tipo: question.tipo,
      prova: question.prova,
      instituicao: question.instituicao,
      ano: question.ano,
      numero: question.numero,
      fonte: question.fonte,
      referencia: {
        texto: question.referencia_texto,
        texto_apos: question.referencia_texto_apos,
        fonte: question.referencia_fonte,
        imagem: question.referencia_imagem,
        imagem_pos: question.referencia_imagem_pos,
        imagem_layout: question.referencia_imagem_layout,
        imagens_adicionais: question.referencia_imagens_extra,
      },
      enunciado: {
        texto: question.enunciado,
        imagem: question.enunciado_imagem,
        imagem_pos: question.enunciado_imagem_pos,
        imagem_layout: question.enunciado_imagem_layout,
        imagens_adicionais: question.enunciado_imagens_extra,
      },
      alternativas: question.alternativas,
      gabarito: question.resposta,
      classificacao: {
        area_geral: question.area_geral,
        conteudo_principal: question.conteudo_principal,
        subconteudo_principal: question.subconteudo_principal,
        conteudos_relacionados: question.conteudos_relacionados,
        tags: question.tags_livres,
        dificuldade: question.dificuldade,
      },
      observacoes: question.observacoes,
      imagem_original_url: question.imagem_original_url,
      tem_equacao: question.tem_equacao,
      tem_imagem: question.tem_imagem,
      created_at: question.created_at,
      updated_at: question.updated_at,
      revisao_interna: {
        criterios: REVIEW_CRITERIA.map(({ id, label }) => {
          const check = reviewChecks.find((item) => item.criterio === id);
          return {
            criterio: label,
            status: check?.status ?? "pendente",
            status_label: check ? REVIEW_STATUS_LABELS[check.status] : "Pendente",
            observacao: check?.observacao ?? "",
          };
        }),
        historico_recente: reviewHistory.slice(0, 30).map((event) => ({
          criterio: REVIEW_CRITERIA.find((item) => item.id === event.criterio)?.label ?? event.criterio,
          de: event.status_anterior ? REVIEW_STATUS_LABELS[event.status_anterior] : null,
          para: REVIEW_STATUS_LABELS[event.status_novo],
          motivo: event.motivo,
          observacao: event.observacao,
          em: event.changed_at,
        })),
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(packet, null, 2));
      setCopied(true);
      toast.success("Dados completos copiados. Cole-os na conversa de revisão.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("Falha ao copiar questão:", error);
      toast.error("Não foi possível copiar os dados desta questão.");
    }
  };

  const clearFilters = () => {
    setQuery("");
    setFilters(EMPTY_FILTERS);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1500px] space-y-4 px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ClipboardCheck className="size-4 text-primary" />
              <span>Ferramenta interna</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold">Revisão de questões</h1>
            <p className="text-sm text-muted-foreground">
              Encontre uma questão, confira o registro completo e edite pelo fluxo normal do sistema.
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <a href="/questoes"><ArrowLeft className="size-4" /> Voltar às questões salvas</a>
          </Button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo das revisões">
          <ReviewStat label="Questões cadastradas" value={stats.total} />
          <ReviewStat label="Conferidas por completo" value={stats.completed} />
          <ReviewStat label="Com pendências" value={stats.pending} />
          <ReviewStat label="Alteradas após conferência" value={stats.changed} />
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-3" aria-label="Filtros da revisão">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Fila de revisão">
            <Button type="button" size="sm" variant={queueMode === "pending" ? "default" : "outline"} onClick={() => setQueueMode("pending")}>
              Pendentes ({stats.pending})
            </Button>
            <Button type="button" size="sm" variant={queueMode === "changed" ? "default" : "outline"} onClick={() => setQueueMode("changed")}>
              Alteradas ({stats.changed})
            </Button>
            <Button type="button" size="sm" variant={queueMode === "all" ? "default" : "outline"} onClick={() => setQueueMode("all")}>
              Todas ({stats.total})
            </Button>
            <span className="text-xs text-muted-foreground">
              A fila abre em Pendentes e pula questões concluídas.
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar no texto-base, enunciado ou fonte..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Buscar questões para revisão"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <CatalogMultiSelect
              values={filters.anos}
              onChange={(anos) => setFilters((current) => ({ ...current, anos }))}
              options={years}
              placeholder="Todos os anos"
              emptyHint="Nenhum ano encontrado."
            />
            <CatalogMultiSelect
              values={filters.provas}
              onChange={(provas) => setFilters((current) => ({ ...current, provas }))}
              options={tests}
              placeholder="Todas as provas"
              emptyHint="Nenhuma prova cadastrada."
            />
            <CatalogMultiSelect
              values={filters.instituicoes}
              onChange={(instituicoes) => setFilters((current) => ({ ...current, instituicoes }))}
              options={institutions}
              placeholder="Todas as instituições"
              emptyHint="Nenhuma instituição cadastrada."
            />
            <Button
              type="button"
              variant="outline"
              onClick={clearFilters}
              disabled={!query && !filters.anos.length && !filters.provas.length && !filters.instituicoes.length}
              className="gap-2"
            >
              <X className="size-4" /> Limpar
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm text-muted-foreground">
            <p>{total} questão{total === 1 ? "" : "ões"} {queueMode === "pending" ? "pendente" : queueMode === "changed" ? "alterada" : "encontrada"}{total === 1 ? "" : "s"}</p>
            <p>Página {Math.min(page + 1, totalPages)} de {totalPages}</p>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(250px,300px)_minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <aside className="flex min-h-[360px] flex-col overflow-hidden rounded-xl border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">Fila</h2>
              <p className="text-xs text-muted-foreground">
                {queueMode === "pending" ? "Questões com algum critério não concluído." : queueMode === "changed" ? "Questões editadas depois de uma conferência." : "Histórico completo de questões."}
              </p>
            </div>
            <div className="max-h-[70vh] flex-1 overflow-y-auto p-2">
              {loadingList && items.length === 0 ? (
                <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-muted-foreground">Nenhuma questão encontrada com esses filtros.</p>
              ) : (
                <div className="space-y-1">
                  {items.map((item, index) => {
                    const active = item.id === selectedId;
                    const source = [item.prova, item.instituicao, item.ano].filter(Boolean).join(" · ") || "Fonte não informada";
                    const excerpt = plainText(item.enunciado).slice(0, 150);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        aria-current={active ? "true" : undefined}
                        className={"w-full rounded-lg border px-3 py-3 text-left transition-colors " +
                          (active ? "border-primary bg-primary/10" : "border-transparent hover:border-border hover:bg-muted/60")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">{source}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {item.numero ? "Q" + item.numero : "#" + (page * PAGE_SIZE + index + 1)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-3 text-sm text-foreground">{excerpt || "Enunciado não preenchido."}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                          <span>{item.completed_criteria}/{item.total_criteria} critérios concluídos</span>
                          {item.pending_criteria > 0 && <span>· {item.pending_criteria} pendentes</span>}
                          {item.attention_criteria > 0 && <span className="text-amber-600 dark:text-amber-400">· {item.attention_criteria} precisam de atenção</span>}
                          {item.adjustment_count > 0 && <span className="text-primary">· {item.adjustment_count} ajuste(s) após revisão</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t p-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loadingList || page === 0 || !items.length}
                onClick={() => { pendingPageDirection.current = "last"; setPage((current) => Math.max(0, current - 1)); }}
              >
                Página anterior
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loadingList || page + 1 >= totalPages || !items.length}
                onClick={() => { pendingPageDirection.current = "first"; setPage((current) => current + 1); }}
              >
                Próxima página
              </Button>
            </div>
          </aside>

          <main className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3">
              <div className="flex items-center gap-2">
                <Button type="button" size="icon" variant="outline" aria-label="Questão anterior" title="Questão anterior" onClick={() => navigateQuestion(-1)} disabled={!selectedId || loadingList || (selectedIndex === 0 && page === 0)}>
                  <ArrowLeft className="size-4" />
                </Button>
                <Button type="button" size="icon" variant="outline" aria-label="Próxima questão" title="Próxima questão" onClick={() => navigateQuestion(1)} disabled={!selectedId || loadingList || (selectedIndex === items.length - 1 && page + 1 >= totalPages)}>
                  <ArrowRight className="size-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedId ? "Questão " + position + " de " + total : "Selecione uma questão"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void copyQuestion()} disabled={!question} className="gap-2">
                  {copied ? <ClipboardCheck className="size-4" /> : <Copy className="size-4" />}
                  Copiar para o ChatGPT
                </Button>
                <Button type="button" onClick={openEditor} disabled={!question} className="gap-2">
                  <Pencil className="size-4" /> Editar questão
                </Button>
              </div>
            </div>

            {loadingQuestion ? (
              <div className="flex min-h-[300px] items-center justify-center rounded-xl border bg-card">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Carregando questão completa...</span>
              </div>
            ) : question ? (
              <>
                <QuestionPreviewContent
                  question={question}
                  itemIndex={Math.max(0, position - 1)}
                  itemCount={total}
                  referenceText={getReferenceContent(question).text}
                  referenceImages={getReferenceContent(question).images}
                  referenceSource={question.referencia_fonte}
                  questionNumberPosition="top"
                />
                <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2" aria-label="Dados de classificação e origem">
                  <MetadataGroup title="Origem">
                    <Metadata label="Prova" value={question.prova} />
                    <Metadata label="Instituição" value={question.instituicao} />
                    <Metadata label="Ano" value={question.ano} />
                    <Metadata label="Número" value={question.numero} />
                    <Metadata label="Fonte" value={question.fonte} />
                    <Metadata label="Dificuldade" value={question.dificuldade} />
                  </MetadataGroup>
                  <MetadataGroup title="Classificação">
                    <Metadata label="Área geral" value={question.area_geral} />
                    <Metadata label="Conteúdo principal" value={question.conteudo_principal} />
                    <Metadata label="Subconteúdo principal" value={question.subconteudo_principal} />
                    <Metadata label="Conteúdos relacionados" value={question.conteudos_relacionados.join(", ")} />
                    <Metadata label="Tags" value={question.tags_livres.join(", ")} />
                    <Metadata label="Tem equação" value={question.tem_equacao ? "Sim" : "Não"} />
                  </MetadataGroup>
                  <div className="sm:col-span-2">
                    <MetadataGroup title="Observações">
                      <p className="min-h-10 whitespace-pre-wrap text-sm text-muted-foreground">{question.observacoes?.trim() || "—"}</p>
                    </MetadataGroup>
                  </div>
                </section>

                <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Checklist de revisão">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">Checklist da questão</h2>
                      <p className="text-xs text-muted-foreground">
                        Marque cada critério. Questões com itens incompletos continuam na fila de pendentes.
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {reviewChecks.filter((check) => check.status === "conferido_ok" || check.status === "nao_se_aplica").length}/8 concluídos
                    </span>
                  </div>
                  {reviewMetadataLoading ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Carregando checklist e histórico...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {REVIEW_CRITERIA.map(({ id, label }) => {
                        const check = reviewChecks.find((item) => item.criterio === id);
                        const status = check?.status ?? "pendente";
                        return (
                          <div key={id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(130px,0.7fr)_minmax(210px,1fr)_minmax(180px,1fr)] md:items-center">
                            <div>
                              <p className="text-sm font-medium">{label}</p>
                              {check?.updated_at && <p className="text-[10px] text-muted-foreground">Atualizado {formatReviewDate(check.updated_at)}</p>}
                            </div>
                            <Select
                              value={status}
                              onValueChange={(value) => void updateReviewCheck(id, value as ReviewStatus)}
                              disabled={!check}
                            >
                              <SelectTrigger aria-label={"Estado de revisão: " + label}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {REVIEW_STATUSES.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              value={noteDrafts[id] ?? check?.observacao ?? ""}
                              placeholder={status === "duvida" ? "Descreva a dúvida..." : "Anotação interna (opcional)"}
                              aria-label={"Anotação interna: " + label}
                              disabled={!check}
                              onChange={(event) => setNoteDrafts((currentNotes) => ({ ...currentNotes, [id]: event.target.value }))}
                              onBlur={() => {
                                const note = noteDrafts[id] ?? check?.observacao ?? "";
                                if (check && note !== check.observacao) void updateReviewCheck(id, undefined, note);
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <details className="rounded-xl border bg-card p-4">
                  <summary className="cursor-pointer font-semibold">
                    Histórico desta questão ({reviewHistory.length}{reviewHistory.length === 60 ? "+" : ""})
                  </summary>
                  {reviewHistory.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Ainda não há alterações de checklist registradas.</p>
                  ) : (
                    <ol className="mt-3 space-y-2">
                      {reviewHistory.map((event) => (
                        <li key={event.id} className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-medium">
                              {REVIEW_CRITERIA.find((item) => item.id === event.criterio)?.label ?? event.criterio}
                              {event.status_anterior ? " · " + REVIEW_STATUS_LABELS[event.status_anterior] : ""}
                              {" → " + REVIEW_STATUS_LABELS[event.status_novo]}
                            </span>
                            <time className="text-xs text-muted-foreground">{formatReviewDate(event.changed_at)}</time>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {event.motivo === "questao_editada" ? "Edição da questão" : "Atualização do checklist"}
                            {event.observacao ? " · " + event.observacao : ""}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </details>
              </>
            ) : (
              <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
                Escolha uma questão na fila para ver texto-base, enunciado, alternativas, gabarito e classificação completos.
              </div>
            )}
          </main>

          <QuestionReviewPdfPanel
            questionId={question?.id ?? selectedId}
            year={question?.ano ?? items.find((item) => item.id === selectedId)?.ano ?? null}
            number={question?.numero ?? items.find((item) => item.id === selectedId)?.numero ?? null}
          />
        </div>
      </div>
    </AppLayout>
  );
}

function MetadataGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-muted/20 p-3">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Metadata({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <p className="break-words text-sm">
      <span className="font-medium">{label}: </span>
      <span className="text-muted-foreground">{value?.trim() || "—"}</span>
    </p>
  );
}

function getReferenceContent(question: ReviewQuestion) {
  return legacyReferenceToContent({
    text: question.referencia_texto ?? "",
    textAfter: question.referencia_texto_apos,
    mainImage: question.referencia_imagem,
    mainPos: question.referencia_imagem_pos,
    mainLayout: question.referencia_imagem_layout,
    extras: question.referencia_imagens_extra,
  });
}

function normalizeListItem(row: Partial<ReviewListItem>): ReviewListItem {
  return {
    id: String(row.id ?? ""),
    numero: row.numero ?? null,
    ano: row.ano ?? null,
    prova: row.prova ?? null,
    instituicao: row.instituicao ?? null,
    enunciado: row.enunciado ?? "",
    area_geral: row.area_geral ?? null,
    conteudo_principal: row.conteudo_principal ?? null,
    subconteudo_principal: row.subconteudo_principal ?? null,
    grupo_id: row.grupo_id ?? null,
  };
}

function normalizeQuestion(row: Record<string, unknown>): ReviewQuestion {
  const alternatives = Array.isArray(row.alternativas)
    ? row.alternativas.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      return [{
        letra: typeof item.letra === "string" ? item.letra : "",
        texto: typeof item.texto === "string" ? item.texto : "",
        imagem: typeof item.imagem === "string" ? item.imagem : null,
      }];
    })
    : [];
  const stringList = (value: unknown) => Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" ? [item] : [])
    : [];
  const layout = (value: unknown): ImagePlacementLayout | null =>
    value && typeof value === "object" && !Array.isArray(value) ? value as ImagePlacementLayout : null;
  const nullable = (value: unknown): string | null => typeof value === "string" ? value : null;

  return {
    id: typeof row.id === "string" ? row.id : "",
    numero: nullable(row.numero),
    tipo: typeof row.tipo === "string" ? row.tipo : "multipla_escolha",
    enunciado: typeof row.enunciado === "string" ? row.enunciado : "",
    alternativas,
    resposta: nullable(row.resposta),
    fonte: nullable(row.fonte),
    enunciado_imagem: nullable(row.enunciado_imagem),
    enunciado_imagem_pos: nullable(row.enunciado_imagem_pos),
    enunciado_imagem_layout: layout(row.enunciado_imagem_layout),
    enunciado_imagens_extra: normalizeExtraImages(row.enunciado_imagens_extra),
    ano: nullable(row.ano),
    prova: nullable(row.prova),
    instituicao: nullable(row.instituicao),
    area_geral: nullable(row.area_geral) ?? nullable(row.disciplina),
    conteudo_principal: nullable(row.conteudo_principal) ?? nullable(row.conteudo),
    subconteudo_principal: nullable(row.subconteudo_principal),
    conteudos_relacionados: stringList(row.conteudos_relacionados),
    tags_livres: stringList(row.tags_livres).length
      ? stringList(row.tags_livres)
      : stringList(row.tags),
    dificuldade: nullable(row.dificuldade),
    observacoes: nullable(row.observacoes),
    referencia_texto: nullable(row.referencia_texto),
    referencia_texto_apos: nullable(row.referencia_texto_apos),
    referencia_fonte: nullable(row.referencia_fonte),
    referencia_imagem: nullable(row.referencia_imagem),
    referencia_imagem_pos: nullable(row.referencia_imagem_pos),
    referencia_imagem_layout: layout(row.referencia_imagem_layout),
    referencia_imagens_extra: normalizeExtraImages(row.referencia_imagens_extra),
    imagem_original_url: nullable(row.imagem_original_url),
    grupo_id: nullable(row.grupo_id),
    tem_equacao: Boolean(row.tem_equacao),
    tem_imagem: Boolean(row.tem_imagem),
    created_at: nullable(row.created_at),
    updated_at: nullable(row.updated_at),
  };
}

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
