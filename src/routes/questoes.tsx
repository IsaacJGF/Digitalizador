import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Search,
  Trash2,
  Copy,
  FileText,
  Image as ImageIcon,
  Sigma,
  Loader2,
  ScanLine,
  Pencil,
  ChevronDown,
  ListChecks,
  Layers,
  Filter,
  Save,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppLayout } from "@/components/AppLayout";
import { RichText } from "@/components/RichText";
import { ContentBlocksEditor } from "@/components/ContentBlocksEditor";
import { QuestionReferenceContent } from "@/components/QuestionReferenceContent";
import { CatalogMultiSelect } from "@/components/CatalogSelect";
import { supabase } from "@/integrations/supabase/client";
import { insertQuestionsWithCompatibility } from "@/lib/question-compat";
import { loadSelectedQuestionIds, saveSelectedQuestionIds } from "@/lib/selection-store";
import { normalizeExtraImages, type ExtraImage, type ImagePlacementLayout } from "@/lib/image-layout";
import { legacyReferenceToContent } from "@/lib/content-blocks";
import { toast } from "sonner";

export const Route = createFileRoute("/questoes")({
  head: () => ({ meta: [{ title: "Questões salvas" }] }),
  component: Page,
});

type Q = {
  id: string;
  numero: string | null;
  enunciado: string;
  alternativas: { letra: string; texto: string; imagem?: string | null }[];
  tipo: string;
  resposta: string | null;
  fonte: string | null;
  disciplina: string | null;
  conteudo: string | null;
  area_geral?: string | null;
  conteudo_principal?: string | null;
  subconteudo_principal?: string | null;
  conteudos_relacionados?: string[] | null;
  tags_livres?: string[] | null;
  tags?: string[] | null;
  ano?: string | null;
  prova?: string | null;
  instituicao?: string | null;
  observacoes?: string | null;
  referencia_texto?: string | null;
  referencia_fonte?: string | null;
  grupo_id?: string | null;
  referencia_imagem?: string | null;
  referencia_imagem_pos?: string | null;
  referencia_imagem_layout?: ImagePlacementLayout | null;
  referencia_imagens_extra?: ExtraImage[] | null;
  referencia_texto_apos?: string | null;
  enunciado_imagem?: string | null;
  enunciado_imagem_pos?: string | null;
  enunciado_imagem_layout?: ImagePlacementLayout | null;
  imagem_original_url?: string | null;
  tem_equacao: boolean;
  tem_imagem: boolean;
  created_at: string;
};

type CatalogItem = { id: string; nome: string; ativo: boolean; area_id?: string | null; conteudo_id?: string | null };
type AdvancedFilters = {
  area_geral: string;
  conteudo_principal: string;
  subconteudo_principal: string;
  conteudos_relacionados: string[];
  prova: string;
  instituicao: string;
  ano: string;
};
type EditDraft = {
  numero: string;
  enunciado: string;
  alternativas: { letra: string; texto: string; imagem?: string | null }[];
  tipo: string;
  resposta: string;
  fonte: string;
  area_geral: string;
  conteudo_principal: string;
  subconteudo_principal: string;
  conteudos_relacionados: string[];
  tags_livres: string[];
  ano: string;
  prova: string;
  instituicao: string;
  observacoes: string;
};
type ReferenceDraft = {
  referencia_texto: string;
  referencia_imagens_extra: ExtraImage[];
  referencia_fonte: string;
};
type ReferenceDialogState = {
  question: Q;
  draft: ReferenceDraft;
  editing: boolean;
  saving: boolean;
};
type ReferenceGroupState = { items: Q[]; selected: Set<string> };

const PAGE_SIZE = 18;
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  area_geral: "",
  conteudo_principal: "",
  subconteudo_principal: "",
  conteudos_relacionados: [],
  prova: "",
  instituicao: "",
  ano: "",
};
const LIST_COLUMNS = [
  "id",
  "numero",
  "enunciado",
  "tipo",
  "resposta",
  "fonte",
  "disciplina",
  "conteudo",
  "area_geral",
  "conteudo_principal",
  "subconteudo_principal",
  "conteudos_relacionados",
  "tags_livres",
  "tags",
  "ano",
  "prova",
  "instituicao",
  "grupo_id",
  "referencia_texto",
  "referencia_texto_apos",
  "tem_equacao",
  "tem_imagem",
  "created_at",
].join(",");
const DETAIL_COLUMNS = [
  LIST_COLUMNS,
  "alternativas",
  "observacoes",
  "referencia_fonte",
  "referencia_imagem",
  "referencia_imagem_pos",
  "referencia_imagem_layout",
  "referencia_imagens_extra",
  "enunciado_imagem",
  "enunciado_imagem_pos",
  "enunciado_imagem_layout",
  "imagem_original_url",
].join(",");

function Page() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const debouncedQuery = useDebouncedValue(q, 450);
  const [sel, setSel] = useState<Set<string>>(() => new Set(loadSelectedQuestionIds()));
  const [editing, setEditing] = useState<Q | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [expanded, setExpanded] = useState<Q | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [referenceDialog, setReferenceDialog] = useState<ReferenceDialogState | null>(null);
  const [referenceGroup, setReferenceGroup] = useState<ReferenceGroupState | null>(null);
  const [referenceLoading, setReferenceLoading] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const [draftFilters, setDraftFilters] = useState<AdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const [areas, setAreas] = useState<CatalogItem[]>([]);
  const [catalogConteudos, setCatalogConteudos] = useState<CatalogItem[]>([]);
  const [subconteudos, setSubconteudos] = useState<CatalogItem[]>([]);
  const [relacionados, setRelacionados] = useState<CatalogItem[]>([]);
  const [tagsCat, setTagsCat] = useState<CatalogItem[]>([]);
  const [provas, setProvas] = useState<CatalogItem[]>([]);
  const [instituicoes, setInstituicoes] = useState<CatalogItem[]>([]);
  const [anos, setAnos] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const commitSelection = (next: Set<string>) => {
    setSel(next);
    saveSelectedQuestionIds([...next]);
  };

  const load = async () => {
    setLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      let query = db.from("questions").select(LIST_COLUMNS, { count: "exact" });
      query = applySupabaseFilters(query, debouncedQuery, advancedFilters);
      query = query.order("created_at", { ascending: false }).range(from, to);
      const { data, count, error } = await query;
      if (error) {
        console.error(error);
        toast.error("Falha ao carregar questões.");
        return;
      }
      setItems(normalizeRows((data ?? []) as Partial<Q>[]));
      setTotalCount(count ?? 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(0); }, [debouncedQuery, advancedFilters]);
  useEffect(() => { load(); }, [page, debouncedQuery, advancedFilters]);

  useEffect(() => {
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const tables = [
        ["catalog_areas", setAreas],
        ["catalog_conteudos", setCatalogConteudos],
        ["catalog_subconteudos", setSubconteudos],
        ["catalog_relacionados", setRelacionados],
        ["catalog_tags", setTagsCat],
        ["catalog_provas", setProvas],
        ["catalog_instituicoes", setInstituicoes],
      ] as const;
      for (const [table, setter] of tables) {
        const { data, error } = await db.from(table).select("*").order("nome");
        if (!error) setter((data ?? []) as CatalogItem[]);
      }
      const { data: yearRows } = await db.from("questions").select("ano").not("ano", "is", null).limit(3000);
      setAnos(uniqueYears((yearRows ?? []) as Array<{ ano?: string | null }>));
    })();
  }, []);

  const activeFilterCount = useMemo(() => countActiveFilters(advancedFilters), [advancedFilters]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    commitSelection(next);
  };

  const fetchFullQuestion = async (id: string): Promise<Q | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("questions")
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .single();
    if (error) {
      console.error(error);
      toast.error("Não foi possível carregar a questão completa.");
      return null;
    }
    return normalizeRow(data as Partial<Q>);
  };

  const openQuestionDetails = async (question: Q) => {
    setExpandedLoading(true);
    setExpanded(question);
    try {
      const full = await fetchFullQuestion(question.id);
      if (full) setExpanded(full);
    } finally {
      setExpandedLoading(false);
    }
  };

  const openQuestionEditor = async (question: Q) => {
    const full = question.alternativas?.length || question.enunciado_imagem || question.referencia_imagem || normalizeExtraImages(question.referencia_imagens_extra).length > 0
      ? question
      : await fetchFullQuestion(question.id);
    if (!full) return;
    setEditing(full);
    setEditDraft(toEditDraft(full));
  };

  const openReferenceDialog = async (question: Q) => {
    setReferenceLoading(question.id);
    try {
      const full = await fetchFullQuestion(question.id);
      if (!full) return;
      setReferenceDialog({ question: full, draft: toReferenceDraft(full), editing: false, saving: false });
    } finally {
      setReferenceLoading(null);
    }
  };

  const fetchReferenceItems = async (question: Q) => {
    if (!question.grupo_id?.trim()) return [await fetchFullQuestion(question.id)].filter(Boolean) as Q[];
    setReferenceLoading(question.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("questions")
        .select(DETAIL_COLUMNS)
        .eq("grupo_id", question.grupo_id)
        .order("numero", { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) return normalizeRows(data as Partial<Q>[]).sort(compareReferenceItems);
      const full = await fetchFullQuestion(question.id);
      return full ? [full] : [];
    } finally {
      setReferenceLoading(null);
    }
  };

  const openReferenceGroup = async (question: Q) => {
    const group = await fetchReferenceItems(question);
    if (group.length === 0) return;
    const selectedIds = group.filter((item) => sel.has(item.id)).map((item) => item.id);
    setReferenceGroup({ items: group, selected: new Set(selectedIds.length > 0 ? selectedIds : [question.id]) });
  };

  const selectWholeReferenceGroup = async (question: Q) => {
    const group = await fetchReferenceItems(question);
    if (group.length === 0) return;
    const next = new Set(sel);
    group.forEach((item) => next.add(item.id));
    commitSelection(next);
    toast.success(`${group.length} item${group.length > 1 ? "s" : ""} da mesma referência selecionado${group.length > 1 ? "s" : ""}.`);
  };

  const toggleReferenceGroupItem = (id: string, checked: boolean) => {
    setReferenceGroup((current) => {
      if (!current) return current;
      const selected = new Set(current.selected);
      if (checked) selected.add(id); else selected.delete(id);
      return { ...current, selected };
    });
  };
  const selectAllReferenceGroupItems = () => setReferenceGroup((current) => current ? { ...current, selected: new Set(current.items.map((item) => item.id)) } : current);
  const clearReferenceGroupItems = () => setReferenceGroup((current) => current ? { ...current, selected: new Set() } : current);
  const addReferenceGroupSelection = () => {
    if (!referenceGroup) return;
    if (referenceGroup.selected.size === 0) {
      toast.info("Selecione ao menos um item da referência.");
      return;
    }
    const next = new Set(sel);
    referenceGroup.selected.forEach((id) => next.add(id));
    commitSelection(next);
    toast.success("Itens selecionados adicionados à avaliação.");
    setReferenceGroup(null);
  };

  const openDocument = () => {
    saveSelectedQuestionIds([...sel]);
    navigate({ to: "/documento" });
  };
  const openAdvancedFilters = () => {
    setDraftFilters(cloneAdvancedFilters(advancedFilters));
    setAdvancedOpen(true);
  };
  const applyAdvancedFilters = () => {
    setAdvancedFilters(cloneAdvancedFilters(draftFilters));
    setAdvancedOpen(false);
  };
  const clearAdvancedFilters = () => {
    const clean = cloneAdvancedFilters(EMPTY_ADVANCED_FILTERS);
    setDraftFilters(clean);
    setAdvancedFilters(clean);
  };

  const onDelete = async (id: string) => {
    if (!confirm("Excluir esta questão? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) toast.error("Falha ao excluir");
    else {
      toast.success("Questão excluída");
      setItems((current) => current.filter((x) => x.id !== id));
      setTotalCount((current) => Math.max(0, current - 1));
      const ns = new Set(sel);
      ns.delete(id);
      commitSelection(ns);
    }
  };

  const onDuplicate = async (question: Q) => {
    const full = await fetchFullQuestion(question.id);
    if (!full) return;
    try {
      const { removedColumns } = await insertQuestionsWithCompatibility([buildDuplicatePayload(full)]);
      if (removedColumns.length > 0) toast.warning("Questão duplicada. Alguns campos novos não foram gravados porque o banco ainda precisa da atualização.");
      else toast.success("Questão duplicada");
      load();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao duplicar");
    }
  };

  const saveQuestionEdit = async () => {
    if (!editing || !editDraft) return;
    setSavingEdit(true);
    try {
      const payload = editDraftToPayload(editDraft, editing);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("questions")
        .update(payload)
        .eq("id", editing.id)
        .select(DETAIL_COLUMNS)
        .single();
      if (error) {
        console.error(error);
        toast.error("Falha ao salvar edição.");
        return;
      }
      const updated = normalizeRow(data as Partial<Q>);
      setItems((current) => current.map((item) => item.id === editing.id ? listProjection(updated) : item));
      setExpanded((current) => current?.id === editing.id ? updated : current);
      setReferenceGroup((current) => current ? { ...current, items: current.items.map((item) => item.id === updated.id ? updated : item) } : current);
      setEditing(null);
      setEditDraft(null);
      toast.success("Questão atualizada.");
    } finally {
      setSavingEdit(false);
    }
  };

  const saveReferenceEdit = async () => {
    if (!referenceDialog) return;
    const { question, draft } = referenceDialog;
    const payload = referenceDraftToPayload(draft);
    const hasGroup = Boolean(question.grupo_id?.trim());
    setReferenceDialog((current) => current ? { ...current, saving: true } : current);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const query = db.from("questions").update(payload);
      const { error } = hasGroup
        ? await query.eq("grupo_id", question.grupo_id)
        : await query.eq("id", question.id);
      if (error) {
        console.error(error);
        toast.error("Falha ao salvar referência.");
        return;
      }

      const updatedQuestion = normalizeRow({ ...question, ...payload });
      setItems((current) => current.map((item) => {
        if (item.id === question.id || (hasGroup && item.grupo_id === question.grupo_id)) return { ...item, ...payload };
        return item;
      }));
      setExpanded((current) => {
        if (!current) return current;
        if (current.id === question.id || (hasGroup && current.grupo_id === question.grupo_id)) return normalizeRow({ ...current, ...payload });
        return current;
      });
      setReferenceGroup((current) => current ? {
        ...current,
        items: current.items.map((item) => item.id === question.id || (hasGroup && item.grupo_id === question.grupo_id) ? normalizeRow({ ...item, ...payload }) : item),
      } : current);
      setReferenceDialog({ question: updatedQuestion, draft: toReferenceDraft(updatedQuestion), editing: false, saving: false });
      toast.success(hasGroup ? "Referência atualizada em todos os itens vinculados." : "Referência atualizada.");
    } finally {
      setReferenceDialog((current) => current ? { ...current, saving: false } : current);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Questões salvas</h1>
            <p className="text-sm text-muted-foreground">
              {totalCount} questão{totalCount === 1 ? "" : "ões"} encontrada{totalCount === 1 ? "" : "s"}
              {sel.size > 0 ? ` · ${sel.size} selecionada${sel.size > 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <Button asChild className="gap-2"><Link to="/"><ScanLine className="size-4" /> Nova questão</Link></Button>
        </div>

        <div className="mb-3 rounded-xl border bg-card p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Pesquisar por palavra ou trecho da questão..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button type="button" variant={activeFilterCount > 0 ? "default" : "outline"} onClick={openAdvancedFilters} className="gap-2 sm:w-auto">
              <Filter className="size-4" />
              {activeFilterCount > 0 ? `Filtro avançado • ${activeFilterCount}` : "Filtro avançado"}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Lista otimizada: imagens, alternativas e referências completas são carregadas apenas ao abrir detalhes, editar ou ver itens da mesma referência.</span>
            <span>Página {Math.min(page + 1, totalPages)} de {totalPages}</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed py-20 text-center">
            <FileText className="mx-auto mb-2 size-10 text-muted-foreground" />
            <p className="font-medium">Nenhuma questão {totalCount > 0 ? "nesta página" : "encontrada"}</p>
            <p className="text-sm text-muted-foreground">Ajuste a pesquisa, limpe os filtros ou digitalize uma nova questão.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {items.map((it) => {
              const isSel = sel.has(it.id);
              const source = formatQuestionSource(it) || "Fonte não informada";
              const hasImagem = Boolean(it.tem_imagem || it.enunciado_imagem || it.referencia_imagem || normalizeExtraImages(it.referencia_imagens_extra).length > 0);
              const hasAlternativas = it.tipo === "multipla_escolha" || (it.alternativas?.length ?? 0) > 0;
              const chips = getCardChips(it).slice(0, 4);
              const hasReferenceGroup = Boolean(it.grupo_id || it.referencia_texto || it.referencia_texto_apos);
              return (
                <div key={it.id} className={`group relative flex flex-col rounded-xl border bg-card p-3 transition-all hover:shadow-md ${isSel ? "ring-2 ring-primary" : ""} ${hasReferenceGroup ? "border-primary/30" : ""}`}>
                  <div className="flex items-start gap-2">
                    <Checkbox checked={isSel} onCheckedChange={() => toggle(it.id)} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-mono">#{it.id.slice(0, 6)}</span>
                        {it.numero && <span>· Q{it.numero}</span>}
                      </div>
                      <p className="mt-0.5 truncate text-xs font-semibold text-foreground">{source}</p>
                    </div>
                    <div className="flex shrink-0 -mr-1 -mt-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openQuestionEditor(it)} title="Editar questão"><Pencil className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDuplicate(it)} title="Duplicar"><Copy className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(it.id)} title="Excluir"><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>

                  {chips.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {chips.map((chip) => <Badge key={chip} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">{chip}</Badge>)}
                    </div>
                  )}

                  <p className="mt-2 line-clamp-3 min-h-[3.75rem] text-sm text-foreground/90">{plainText(it.enunciado) || "Sem enunciado cadastrado."}</p>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {hasImagem && <span title="Possui imagem" className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"><ImageIcon className="size-3" />Imagem</span>}
                    {it.tem_equacao && <span title="Possui fórmula" className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"><Sigma className="size-3" />Fórmula</span>}
                    {hasAlternativas && <span title="Possui alternativas" className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"><ListChecks className="size-3" />Alternativas</span>}
                    {hasReferenceGroup && <span title="Possui referência ou grupo" className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"><Layers className="size-3" />Referência</span>}
                  </div>

                  {hasReferenceGroup && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={referenceLoading === it.id} onClick={() => openReferenceDialog(it)}>
                        {referenceLoading === it.id ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />} Ver referência
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={referenceLoading === it.id} onClick={() => openReferenceGroup(it)}>
                        {referenceLoading === it.id ? <Loader2 className="size-3.5 animate-spin" /> : <Layers className="size-3.5" />} Ver itens
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={referenceLoading === it.id} onClick={() => selectWholeReferenceGroup(it)}>
                        Selecionar grupo
                      </Button>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
                    <span>{formatTipo(it.tipo)} · {safeDate(it.created_at)}</span>
                    <button type="button" onClick={() => openQuestionDetails(it)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                      Detalhes <ChevronDown className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <Button variant="outline" disabled={loading || page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Página anterior</Button>
          <span className="text-sm text-muted-foreground">{totalCount === 0 ? "0" : `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, totalCount)}`} de {totalCount}</span>
          <Button variant="outline" disabled={loading || page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima página</Button>
        </div>

        <AdvancedFiltersDialog open={advancedOpen} onOpenChange={setAdvancedOpen} filters={draftFilters} onFiltersChange={setDraftFilters} activeCount={activeFilterCount} areas={areas} conteudos={catalogConteudos} subconteudos={subconteudos} relacionados={relacionados} provas={provas} instituicoes={instituicoes} anos={anos} onApply={applyAdvancedFilters} onClear={clearAdvancedFilters} />
        <QuestionDetailsDialog question={expanded} loading={expandedLoading} onClose={() => setExpanded(null)} onEdit={openQuestionEditor} />
        <ReferenceViewDialog state={referenceDialog} onClose={() => setReferenceDialog(null)} onDraftChange={(patch) => setReferenceDialog((current) => current ? { ...current, draft: { ...current.draft, ...patch } } : current)} onStartEdit={() => setReferenceDialog((current) => current ? { ...current, editing: true } : current)} onCancelEdit={() => setReferenceDialog((current) => current ? { ...current, draft: toReferenceDraft(current.question), editing: false } : current)} onSave={saveReferenceEdit} />
        <ReferenceGroupDialog group={referenceGroup?.items ?? []} selectedIds={referenceGroup?.selected ?? new Set()} assessmentIds={sel} onToggle={toggleReferenceGroupItem} onSelectAll={selectAllReferenceGroupItems} onClear={clearReferenceGroupItems} onAdd={addReferenceGroupSelection} onClose={() => setReferenceGroup(null)} />
        <EditQuestionDialog question={editing} draft={editDraft} saving={savingEdit} areas={areas} conteudos={catalogConteudos} subconteudos={subconteudos} relacionados={relacionados} tags={tagsCat} provas={provas} instituicoes={instituicoes} onDraftChange={setEditDraft} onClose={() => { setEditing(null); setEditDraft(null); }} onSave={saveQuestionEdit} />

        {sel.size > 0 && (
          <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-lg">
            <span className="text-sm font-medium">{sel.size} questão{sel.size > 1 ? "s" : ""} selecionada{sel.size > 1 ? "s" : ""}</span>
            <Button size="sm" variant="secondary" onClick={openDocument} className="gap-2"><FileText className="size-4" /> Criar documento</Button>
            <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary/80" onClick={() => commitSelection(new Set())}>Limpar</Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function AdvancedFiltersDialog({ open, onOpenChange, filters, onFiltersChange, activeCount, areas, conteudos, subconteudos, relacionados, provas, instituicoes, anos, onApply, onClear }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: AdvancedFilters;
  onFiltersChange: (filters: AdvancedFilters) => void;
  activeCount: number;
  areas: CatalogItem[];
  conteudos: CatalogItem[];
  subconteudos: CatalogItem[];
  relacionados: CatalogItem[];
  provas: CatalogItem[];
  instituicoes: CatalogItem[];
  anos: string[];
  onApply: () => void;
  onClear: () => void;
}) {
  const area = areas.find((item) => item.nome === filters.area_geral);
  const conteudoOptions = area ? conteudos.filter((item) => item.area_id === area.id) : [];
  const conteudo = conteudoOptions.find((item) => item.nome === filters.conteudo_principal);
  const subconteudoOptions = conteudo ? subconteudos.filter((item) => item.conteudo_id === conteudo.id) : [];
  const update = (patch: Partial<AdvancedFilters>) => onFiltersChange({ ...filters, ...patch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 h-screen max-h-screen w-full max-w-md translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none p-0 sm:rounded-none">
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle>Filtro avançado</DialogTitle>
          <DialogDescription>{activeCount > 0 ? `${activeCount} filtro${activeCount > 1 ? "s" : ""} ativo${activeCount > 1 ? "s" : ""}.` : "Combine filtros do catálogo com a busca principal."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto p-4">
          <FilterBlock label="Área geral"><FilterSelect id="filtro-area" value={filters.area_geral} onChange={(value) => update({ area_geral: value, conteudo_principal: "", subconteudo_principal: "" })} options={areas} placeholder="Todas as áreas" /></FilterBlock>
          <FilterBlock label="Conteúdo principal"><FilterSelect id="filtro-conteudo" value={filters.conteudo_principal} onChange={(value) => update({ conteudo_principal: value, subconteudo_principal: "" })} options={conteudoOptions} placeholder={filters.area_geral ? "Todos os conteúdos" : "Selecione uma área primeiro"} disabled={!filters.area_geral} /></FilterBlock>
          <FilterBlock label="Subconteúdo principal"><FilterSelect id="filtro-subconteudo" value={filters.subconteudo_principal} onChange={(value) => update({ subconteudo_principal: value })} options={subconteudoOptions} placeholder={filters.conteudo_principal ? "Todos os subconteúdos" : "Selecione um conteúdo primeiro"} disabled={!filters.conteudo_principal} /></FilterBlock>
          <FilterBlock label="Conteúdos relacionados"><CatalogMultiSelect values={filters.conteudos_relacionados} onChange={(values) => update({ conteudos_relacionados: values })} options={relacionados} placeholder="Buscar e adicionar conteúdos" /></FilterBlock>
          <FilterBlock label="Prova"><FilterSelect id="filtro-prova" value={filters.prova} onChange={(value) => update({ prova: value })} options={provas} placeholder="Todas as provas" /></FilterBlock>
          <FilterBlock label="Instituição"><FilterSelect id="filtro-instituicao" value={filters.instituicao} onChange={(value) => update({ instituicao: value })} options={instituicoes} placeholder="Todas as instituições" /></FilterBlock>
          <div className="space-y-2"><Label htmlFor="filtro-ano">Ano</Label><Input id="filtro-ano" list="anos-questoes" value={filters.ano} onChange={(event) => update({ ano: event.target.value })} placeholder="Digite ou selecione o ano" /><datalist id="anos-questoes">{anos.map((ano) => <option key={ano} value={ano} />)}</datalist></div>
        </div>
        <DialogFooter className="gap-2 border-t p-4 sm:justify-between sm:space-x-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClear}>Limpar filtros</Button><Button type="button" onClick={onApply}>Aplicar filtros</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterBlock({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function FilterSelect({ id, value, onChange, options, placeholder, disabled }: { id: string; value: string; onChange: (value: string) => void; options: CatalogItem[]; placeholder: string; disabled?: boolean }) {
  const visibleOptions = options.filter((item) => item.ativo || item.nome === value);
  return (
    <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60">
      <option value="">{placeholder}</option>
      {visibleOptions.map((item) => <option key={item.id} value={item.nome}>{item.nome}{item.ativo ? "" : " (inativo)"}</option>)}
    </select>
  );
}

function ReferenceViewDialog({ state, onClose, onDraftChange, onStartEdit, onCancelEdit, onSave }: {
  state: ReferenceDialogState | null;
  onClose: () => void;
  onDraftChange: (patch: Partial<ReferenceDraft>) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
}) {
  if (!state) return null;
  const { question, draft, editing, saving } = state;
  const hasReference = Boolean(question.referencia_texto || question.referencia_texto_apos || question.referencia_imagem || normalizeExtraImages(question.referencia_imagens_extra).length > 0 || question.referencia_fonte);
  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Referência/texto-base</DialogTitle>
          <DialogDescription>
            {question.grupo_id ? "Esta referência pertence a um grupo. Ao editar, a alteração será aplicada a todos os itens vinculados." : "Esta referência pertence apenas a este item."}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <div className="space-y-4">
            <ContentBlocksEditor
              label="Texto e imagens da referência"
              text={draft.referencia_texto}
              images={draft.referencia_imagens_extra}
              rows={7}
              placeholder="Texto, tabela ou comando geral que vale para todos os itens."
              onChange={(content) => onDraftChange({ referencia_texto: content.text, referencia_imagens_extra: content.images })}
            />
            <FilterBlock label="Fonte da referência"><Input value={draft.referencia_fonte} onChange={(event) => onDraftChange({ referencia_fonte: event.target.value })} placeholder="Fonte do texto-base, se houver" /></FilterBlock>
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Prévia da referência</p>
              <QuestionReferenceContent text={draft.referencia_texto} extraImages={draft.referencia_imagens_extra} />
              {draft.referencia_fonte && <p className="mt-2 text-right text-xs text-muted-foreground">{draft.referencia_fonte}</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {hasReference ? (
              <section className="rounded-lg border bg-muted/20 p-3">
                <QuestionReferenceContent
                  text={question.referencia_texto}
                  textAfter={question.referencia_texto_apos}
                  mainImage={question.referencia_imagem}
                  mainImagePosition={question.referencia_imagem_pos}
                  mainImageLayout={question.referencia_imagem_layout}
                  extraImages={question.referencia_imagens_extra}
                  textClassName="text-sm"
                />
                {question.referencia_fonte && <p className="mt-2 text-right text-xs text-muted-foreground">{question.referencia_fonte}</p>}
              </section>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Esta questão ainda não possui referência cadastrada.</div>
            )}
          </div>
        )}

        <DialogFooter>
          {editing ? (
            <>
              <Button type="button" variant="outline" onClick={onCancelEdit} disabled={saving}>Cancelar edição</Button>
              <Button type="button" onClick={onSave} disabled={saving} className="gap-2">{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar referência</Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
              <Button type="button" onClick={onStartEdit} className="gap-2"><Pencil className="size-4" /> Editar referência</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditQuestionDialog({ question, draft, saving, areas, conteudos, subconteudos, relacionados, tags, provas, instituicoes, onDraftChange, onClose, onSave }: {
  question: Q | null;
  draft: EditDraft | null;
  saving: boolean;
  areas: CatalogItem[];
  conteudos: CatalogItem[];
  subconteudos: CatalogItem[];
  relacionados: CatalogItem[];
  tags: CatalogItem[];
  provas: CatalogItem[];
  instituicoes: CatalogItem[];
  onDraftChange: (draft: EditDraft | null) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!question || !draft) return null;
  const area = areas.find((item) => item.nome === draft.area_geral);
  const conteudoOptions = area ? conteudos.filter((item) => item.area_id === area.id) : [];
  const conteudo = conteudoOptions.find((item) => item.nome === draft.conteudo_principal);
  const subOptions = conteudo ? subconteudos.filter((item) => item.conteudo_id === conteudo.id) : [];
  const patch = (partial: Partial<EditDraft>) => onDraftChange({ ...draft, ...partial });
  const updateAlt = (index: number, partial: Partial<EditDraft["alternativas"][number]>) => {
    const next = [...draft.alternativas];
    next[index] = { ...next[index], ...partial };
    patch({ alternativas: next });
  };
  const addAlt = () => patch({ alternativas: reletterAlternatives([...draft.alternativas, { letra: LETTERS[draft.alternativas.length] ?? "X", texto: "" }]) });
  const removeAlt = (index: number) => patch({ alternativas: reletterAlternatives(draft.alternativas.filter((_, i) => i !== index)) });

  return (
    <Dialog open={!!question} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>Editar questão</DialogTitle><DialogDescription>Edite enunciado, alternativas, gabarito e classificação. A referência é editada pelo botão “Ver referência” no card.</DialogDescription></DialogHeader>
        {(question.referencia_texto || question.referencia_imagem || question.grupo_id) && <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">Esta questão possui referência vinculada. Para editar o texto-base, feche esta janela e use o botão “Ver referência” no card da questão.</div>}
        <div className="grid gap-4 md:grid-cols-2"><FilterBlock label="Tipo"><select value={draft.tipo} onChange={(event) => patch({ tipo: event.target.value })} className="h-10 w-full rounded-md border bg-card px-3 text-sm"><option value="multipla_escolha">Múltipla escolha</option><option value="certo_errado">Certo ou errado</option><option value="numerica">Numérica</option><option value="discursiva">Discursiva</option></select></FilterBlock><FilterBlock label="Número do item"><Input value={draft.numero} onChange={(event) => patch({ numero: event.target.value })} placeholder="Ex.: 68" /></FilterBlock></div>
        <FilterBlock label="Enunciado"><Textarea value={draft.enunciado} onChange={(event) => patch({ enunciado: event.target.value })} rows={8} className="font-mono text-sm" /><div className="rounded-md border bg-muted/20 p-3 text-sm"><RichText text={draft.enunciado} /></div></FilterBlock>
        {draft.tipo === "multipla_escolha" && <FilterBlock label="Alternativas"><div className="mb-2 flex justify-end"><Button type="button" size="sm" variant="outline" onClick={addAlt} className="gap-1"><Plus className="size-3" /> Adicionar</Button></div><div className="space-y-2">{draft.alternativas.map((alt, index) => <div key={index} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[60px_1fr_auto]"><Input value={alt.letra} onChange={(event) => updateAlt(index, { letra: event.target.value })} className="text-center font-bold" /><Textarea value={alt.texto} onChange={(event) => updateAlt(index, { texto: event.target.value })} rows={2} /><Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => removeAlt(index)}><X className="size-4" /></Button></div>)}</div></FilterBlock>}
        <div className="grid gap-4 md:grid-cols-3"><FilterBlock label="Gabarito"><Input value={draft.resposta} onChange={(event) => patch({ resposta: event.target.value })} /></FilterBlock><div className="space-y-2 md:col-span-2"><Label>Fonte específica do item</Label><Input value={draft.fonte} onChange={(event) => patch({ fonte: event.target.value })} placeholder="Ex.: banca/ano" /></div></div>
        <div className="grid gap-4 md:grid-cols-3"><FilterBlock label="Área geral"><FilterSelect id="edit-area" value={draft.area_geral} onChange={(value) => patch({ area_geral: value, conteudo_principal: "", subconteudo_principal: "" })} options={areas} placeholder="Selecione" /></FilterBlock><FilterBlock label="Conteúdo principal"><FilterSelect id="edit-conteudo" value={draft.conteudo_principal} onChange={(value) => patch({ conteudo_principal: value, subconteudo_principal: "" })} options={conteudoOptions} placeholder={draft.area_geral ? "Selecione" : "Escolha área"} disabled={!draft.area_geral} /></FilterBlock><FilterBlock label="Subconteúdo principal"><FilterSelect id="edit-sub" value={draft.subconteudo_principal} onChange={(value) => patch({ subconteudo_principal: value })} options={subOptions} placeholder={draft.conteudo_principal ? "Selecione" : "Escolha conteúdo"} disabled={!draft.conteudo_principal} /></FilterBlock></div>
        <div className="grid gap-4 md:grid-cols-2"><FilterBlock label="Conteúdos relacionados"><CatalogMultiSelect values={draft.conteudos_relacionados} onChange={(values) => patch({ conteudos_relacionados: values })} options={relacionados} placeholder="Buscar conteúdos relacionados" /></FilterBlock><FilterBlock label="Tags"><CatalogMultiSelect values={draft.tags_livres} onChange={(values) => patch({ tags_livres: values })} options={tags} placeholder="Buscar tags" /></FilterBlock></div>
        <div className="grid gap-4 md:grid-cols-3"><FilterBlock label="Prova"><FilterSelect id="edit-prova" value={draft.prova} onChange={(value) => patch({ prova: value })} options={provas} placeholder="Selecione" /></FilterBlock><FilterBlock label="Instituição"><FilterSelect id="edit-instituicao" value={draft.instituicao} onChange={(value) => patch({ instituicao: value })} options={instituicoes} placeholder="Selecione" /></FilterBlock><FilterBlock label="Ano"><Input value={draft.ano} onChange={(event) => patch({ ano: event.target.value })} placeholder="Ex.: 2024" /></FilterBlock></div>
        <FilterBlock label="Observações"><Textarea value={draft.observacoes} onChange={(event) => patch({ observacoes: event.target.value })} rows={3} /></FilterBlock>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="button" onClick={onSave} disabled={saving} className="gap-2">{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar edição</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionDetailsDialog({ question, loading, onClose, onEdit }: { question: Q | null; loading: boolean; onClose: () => void; onEdit: (question: Q) => void }) {
  if (!question) return null;
  const hasReference = Boolean(question.referencia_texto || question.referencia_texto_apos || question.referencia_imagem || normalizeExtraImages(question.referencia_imagens_extra).length > 0);
  return (
    <Dialog open={!!question} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>{formatQuestionSource(question) || "Questão"}</DialogTitle><DialogDescription>{loading ? "Carregando dados completos..." : `${formatTipo(question.tipo)}${question.numero ? ` · Item ${question.numero}` : ""}`}</DialogDescription></DialogHeader>
        {loading ? <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" /> Carregando questão completa...</div> : <div className="space-y-4">
          {hasReference && <section className="rounded-lg border bg-muted/20 p-3"><h3 className="mb-2 text-sm font-semibold">Referência</h3><QuestionReferenceContent text={question.referencia_texto} textAfter={question.referencia_texto_apos} mainImage={question.referencia_imagem} mainImagePosition={question.referencia_imagem_pos} mainImageLayout={question.referencia_imagem_layout} extraImages={question.referencia_imagens_extra} textClassName="text-sm" />{question.referencia_fonte && <p className="mt-2 text-right text-xs text-muted-foreground">{question.referencia_fonte}</p>}</section>}
          <section><h3 className="mb-2 text-sm font-semibold">Enunciado</h3><RichText text={question.enunciado} className="text-sm" />{question.enunciado_imagem && <img src={question.enunciado_imagem} alt="Enunciado" className="my-2 max-h-96 max-w-full rounded border object-contain" />}</section>
          {question.alternativas?.length > 0 && <section><h3 className="mb-2 text-sm font-semibold">Alternativas</h3><div className="space-y-2">{question.alternativas.map((alt) => <div key={alt.letra} className="rounded-md border p-2 text-sm"><strong>{alt.letra}) </strong><RichText text={alt.texto} className="inline" />{alt.imagem && <img src={alt.imagem} alt={`Alternativa ${alt.letra}`} className="mt-2 max-h-60 max-w-full rounded border object-contain" />}</div>)}</div></section>}
          <section className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-xs sm:grid-cols-2"><p><strong>Área:</strong> {question.area_geral || "—"}</p><p><strong>Conteúdo:</strong> {question.conteudo_principal || "—"}</p><p><strong>Subconteúdo:</strong> {question.subconteudo_principal || "—"}</p><p><strong>Gabarito:</strong> {question.resposta || "—"}</p><p><strong>Prova:</strong> {question.prova || "—"}</p><p><strong>Instituição:</strong> {question.instituicao || "—"}</p><p><strong>Ano:</strong> {question.ano || "—"}</p><p><strong>Tags:</strong> {(question.tags_livres ?? question.tags ?? []).join(", ") || "—"}</p></section>
        </div>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button><Button onClick={() => { onClose(); onEdit(question); }} disabled={loading} className="gap-2"><Pencil className="size-4" /> Editar questão</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReferenceGroupDialog({ group, selectedIds, assessmentIds, onToggle, onSelectAll, onClear, onAdd, onClose }: { group: Q[]; selectedIds: Set<string>; assessmentIds: Set<string>; onToggle: (id: string, checked: boolean) => void; onSelectAll: () => void; onClear: () => void; onAdd: () => void; onClose: () => void }) {
  const first = group[0];
  return (
    <Dialog open={group.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>Itens da mesma referência</DialogTitle><DialogDescription>Selecione itens individuais ou adicione todo o grupo à avaliação.</DialogDescription></DialogHeader>
        {first && <div className="rounded-lg border bg-muted/20 p-3"><QuestionReferenceContent text={first.referencia_texto} textAfter={first.referencia_texto_apos} mainImage={first.referencia_imagem} mainImagePosition={first.referencia_imagem_pos} mainImageLayout={first.referencia_imagem_layout} extraImages={first.referencia_imagens_extra} textClassName="text-sm" />{first.referencia_fonte && <p className="mt-2 text-right text-xs text-muted-foreground">{first.referencia_fonte}</p>}</div>}
        <div className="space-y-3">{group.map((item) => <div key={item.id} className="rounded-lg border p-3" title={metadataTooltip(item)}><div className="mb-2 flex items-start gap-2"><Checkbox checked={selectedIds.has(item.id)} onCheckedChange={(value) => onToggle(item.id, Boolean(value))} className="mt-1" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{item.numero ? `Item ${item.numero}` : "Item"}</strong>{assessmentIds.has(item.id) && <Badge variant="secondary">já selecionado</Badge>}<CompactPedagogicalInfo question={item} /></div><RichText text={item.enunciado} className="mt-2 text-sm" />{item.enunciado_imagem && <img src={item.enunciado_imagem} alt="Imagem do item" className="mt-2 max-h-80 max-w-full rounded border object-contain" />}{item.alternativas?.length > 0 && <div className="mt-2 space-y-1 text-sm">{item.alternativas.map((alt) => <div key={alt.letra}><strong>{alt.letra}) </strong><RichText text={alt.texto} className="inline" /></div>)}</div>}</div></div></div>)}</div>
        <DialogFooter className="gap-2 sm:justify-between sm:space-x-0"><div className="flex gap-2"><Button type="button" variant="outline" onClick={onSelectAll}>Selecionar todos</Button><Button type="button" variant="ghost" onClick={onClear}>Limpar</Button></div><div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Fechar</Button><Button type="button" onClick={onAdd}>Adicionar selecionados</Button></div></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompactPedagogicalInfo({ question }: { question: Q }) {
  const entries = getPedagogicalEntries(question).slice(0, 2);
  if (entries.length === 0 && !question.resposta) return <Badge variant="destructive" className="px-1.5 py-0 text-[10px] font-normal">Sem conteúdo vinculado</Badge>;
  return <div className="flex flex-wrap gap-1" title={metadataTooltip(question)}>{entries.map((entry) => <Badge key={`${entry.label}-${entry.value}`} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">{entry.value}</Badge>)}</div>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySupabaseFilters(query: any, search: string, filters: AdvancedFilters) {
  const term = search.trim();
  if (term) {
    const escaped = term.replace(/[%_]/g, "");
    query = query.or(`enunciado.ilike.%${escaped}%,fonte.ilike.%${escaped}%,prova.ilike.%${escaped}%,instituicao.ilike.%${escaped}%,conteudo_principal.ilike.%${escaped}%,subconteudo_principal.ilike.%${escaped}%`);
  }
  if (filters.area_geral) query = query.eq("area_geral", filters.area_geral);
  if (filters.conteudo_principal) query = query.eq("conteudo_principal", filters.conteudo_principal);
  if (filters.subconteudo_principal) query = query.eq("subconteudo_principal", filters.subconteudo_principal);
  if (filters.conteudos_relacionados.length > 0) query = query.contains("conteudos_relacionados", filters.conteudos_relacionados);
  if (filters.prova) query = query.eq("prova", filters.prova);
  if (filters.instituicao) query = query.eq("instituicao", filters.instituicao);
  if (filters.ano) query = query.eq("ano", filters.ano);
  return query;
}

function normalizeRows(rows: Partial<Q>[]) { return rows.map(normalizeRow); }
function normalizeRow(row: Partial<Q>): Q {
  return {
    id: String(row.id),
    numero: row.numero ?? null,
    enunciado: row.enunciado ?? "",
    alternativas: Array.isArray(row.alternativas) ? row.alternativas : [],
    tipo: row.tipo ?? "discursiva",
    resposta: row.resposta ?? null,
    fonte: row.fonte ?? null,
    disciplina: row.disciplina ?? null,
    conteudo: row.conteudo ?? null,
    area_geral: row.area_geral ?? null,
    conteudo_principal: row.conteudo_principal ?? null,
    subconteudo_principal: row.subconteudo_principal ?? null,
    conteudos_relacionados: Array.isArray(row.conteudos_relacionados) ? row.conteudos_relacionados : [],
    tags_livres: Array.isArray(row.tags_livres) ? row.tags_livres : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    ano: row.ano ?? null,
    prova: row.prova ?? null,
    instituicao: row.instituicao ?? null,
    observacoes: row.observacoes ?? null,
    referencia_texto: row.referencia_texto ?? null,
    referencia_fonte: row.referencia_fonte ?? null,
    grupo_id: row.grupo_id ?? null,
    referencia_imagem: row.referencia_imagem ?? null,
    referencia_imagem_pos: row.referencia_imagem_pos ?? null,
    referencia_imagem_layout: row.referencia_imagem_layout ?? null,
    referencia_imagens_extra: normalizeExtraImages(row.referencia_imagens_extra),
    referencia_texto_apos: row.referencia_texto_apos ?? null,
    enunciado_imagem: row.enunciado_imagem ?? null,
    enunciado_imagem_pos: row.enunciado_imagem_pos ?? null,
    enunciado_imagem_layout: row.enunciado_imagem_layout ?? null,
    imagem_original_url: row.imagem_original_url ?? null,
    tem_equacao: Boolean(row.tem_equacao),
    tem_imagem: Boolean(row.tem_imagem),
    created_at: row.created_at ?? new Date().toISOString(),
  };
}
function listProjection(q: Q): Q { return { ...q, alternativas: [], referencia_imagem: null, enunciado_imagem: null, imagem_original_url: null }; }
function cloneAdvancedFilters(filters: AdvancedFilters): AdvancedFilters { return { ...filters, conteudos_relacionados: [...filters.conteudos_relacionados] }; }
function countActiveFilters(filters: AdvancedFilters) { return Object.entries(filters).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value)).length; }
function uniqueYears(rows: Array<{ ano?: string | null }>) { return Array.from(new Set(rows.map((row) => row.ano).filter((ano): ano is string => Boolean(ano)))).sort((a, b) => b.localeCompare(a, "pt-BR")); }
function safeDate(value: string) { try { return new Date(value).toLocaleDateString("pt-BR"); } catch { return "sem data"; } }
function formatQuestionSource(q: Pick<Q, "prova" | "instituicao" | "ano" | "fonte">) { return [q.prova, q.instituicao, q.ano].filter(Boolean).join(" - ") || q.fonte || ""; }
function formatTipo(tipo: string | null | undefined) { const labels: Record<string, string> = { multipla_escolha: "Múltipla escolha", certo_errado: "Certo ou errado", numerica: "Numérica", discursiva: "Discursiva" }; return labels[tipo ?? ""] ?? (tipo || "Sem tipo"); }
function getCardChips(q: Q) { return [q.area_geral, q.conteudo_principal, q.subconteudo_principal, ...(q.tags_livres ?? q.tags ?? [])].filter((value): value is string => Boolean(value)); }
function getPedagogicalEntries(q: Q) { return [["Área", q.area_geral], ["Conteúdo", q.conteudo_principal], ["Subconteúdo", q.subconteudo_principal], ...(q.conteudos_relacionados ?? []).map((value) => ["Relacionado", value]), ...(q.tags_livres ?? q.tags ?? []).map((value) => ["Tag", value])].filter(([, value]) => Boolean(value)).map(([label, value]) => ({ label: label as string, value: value as string })); }
function metadataTooltip(q: Q) { const lines = getPedagogicalEntries(q).map((entry) => `${entry.label}: ${entry.value}`); if (q.resposta) lines.push(`Gabarito: ${q.resposta}`); return lines.join("\n"); }
function compareReferenceItems(a: Q, b: Q) { return String(a.numero ?? "").localeCompare(String(b.numero ?? ""), "pt-BR", { numeric: true }); }
function toEditDraft(q: Q): EditDraft { return { numero: q.numero ?? "", enunciado: q.enunciado ?? "", alternativas: q.alternativas ?? [], tipo: q.tipo ?? "discursiva", resposta: q.resposta ?? "", fonte: q.fonte ?? "", area_geral: q.area_geral ?? "", conteudo_principal: q.conteudo_principal ?? "", subconteudo_principal: q.subconteudo_principal ?? "", conteudos_relacionados: q.conteudos_relacionados ?? [], tags_livres: q.tags_livres?.length ? q.tags_livres : q.tags ?? [], ano: q.ano ?? "", prova: q.prova ?? "", instituicao: q.instituicao ?? "", observacoes: q.observacoes ?? "" }; }
function toReferenceDraft(q: Q): ReferenceDraft {
  const content = legacyReferenceToContent({
    text: q.referencia_texto ?? "",
    textAfter: q.referencia_texto_apos,
    mainImage: q.referencia_imagem,
    mainPos: q.referencia_imagem_pos,
    mainLayout: q.referencia_imagem_layout,
    extras: q.referencia_imagens_extra,
  });
  return { referencia_texto: content.text, referencia_imagens_extra: content.images, referencia_fonte: q.referencia_fonte ?? "" };
}
function editDraftToPayload(draft: EditDraft, original: Q) { return { numero: draft.numero || null, enunciado: draft.enunciado, alternativas: draft.alternativas, tipo: draft.tipo, resposta: draft.resposta || null, fonte: draft.fonte || null, disciplina: draft.area_geral || original.disciplina || null, conteudo: draft.conteudo_principal || original.conteudo || null, area_geral: draft.area_geral || null, conteudo_principal: draft.conteudo_principal || null, subconteudo_principal: draft.subconteudo_principal || null, conteudos_relacionados: draft.conteudos_relacionados, tags_livres: draft.tags_livres, tags: draft.tags_livres, ano: draft.ano || null, prova: draft.prova || null, instituicao: draft.instituicao || null, observacoes: draft.observacoes || null, tem_equacao: detectEquation(draft.enunciado, draft.alternativas), tem_imagem: Boolean(original.tem_imagem || original.referencia_imagem || original.enunciado_imagem || draft.alternativas.some((alt) => alt.imagem)) }; }
function referenceDraftToPayload(draft: ReferenceDraft) {
  return {
    referencia_texto: draft.referencia_texto || null,
    referencia_texto_apos: null,
    referencia_fonte: draft.referencia_fonte || null,
    referencia_imagem: null,
    referencia_imagem_pos: null,
    referencia_imagem_layout: null,
    referencia_imagens_extra: normalizeExtraImages(draft.referencia_imagens_extra),
  };
}
function buildDuplicatePayload(q: Q) { const { id: _id, created_at: _createdAt, ...rest } = q; return { ...rest, numero: q.numero ? `${q.numero} cópia` : null }; }
function reletterAlternatives(alternatives: EditDraft["alternativas"]) { return alternatives.map((alt, index) => ({ ...alt, letra: LETTERS[index] ?? alt.letra ?? String(index + 1) })); }
function detectEquation(text: string, alternatives: EditDraft["alternativas"]) { return /\$[^$]+\$|\\frac|\\sqrt|[=<>≤≥]/.test([text, ...alternatives.map((alt) => alt.texto)].join(" ")); }
function plainText(value: string | null | undefined) { return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\$+/g, "").replace(/\s+/g, " ").trim(); }
function useDebouncedValue<T>(value: T, delay: number) { const [debounced, setDebounced] = useState(value); useEffect(() => { const id = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(id); }, [value, delay]); return debounced; }
