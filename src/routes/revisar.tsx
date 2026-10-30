import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  GripVertical,
  AlertTriangle,
  ImagePlus,
  X,
  Sparkles,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppLayout } from "@/components/AppLayout";
import { ImageCropDialog, type ImageCropSource } from "@/components/ImageCropDialog";
import { ContentBlocksEditor, type ContentImageRequest } from "@/components/ContentBlocksEditor";
import { ImageLayoutEditor } from "@/components/ImageLayoutEditor";
import { RichTextEditor } from "@/components/RichTextEditor";
import { CatalogSelect, CatalogMultiSelect } from "@/components/CatalogSelect";
import { ExtraImagesEditor } from "@/components/ExtraImagesEditor";
import { legacyReferenceToContent, newContentImage, parseBlocks, serializeBlocks, stripImageMarkers, type ContentBlock } from "@/lib/content-blocks";
import { loadDraft, clearDraft, LETRAS, reletter, DraftDigitization, DraftQuestion } from "@/lib/draft-store";
import {
  DEFAULT_IMAGE_PLACEMENT_LAYOUT,
  normalizeExtraImage,
  normalizeImagePlacementLayout,
  normalizeExtraImages,
  type ExtraImage,
  type ImagePlacementLayout,
} from "@/lib/image-layout";
import { formatMetadataSuggestion, hasMetadataSuggestion, suggestQuestionMetadata } from "@/lib/metadata-suggestions";
import { insertQuestionsWithCompatibility } from "@/lib/question-compat";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type CatalogItem = { id: string; nome: string; ativo: boolean; area_id?: string; conteudo_id?: string };
type SharedMetadataKey = "ano" | "prova" | "instituicao";
type CropTarget =
  | ({ kind: "referencia" } & ContentImageRequest)
  | { kind: "enunciado"; currentImage?: string }
  | { kind: "enun-extra"; index?: number; currentImage?: string }
  | { kind: "alt"; index: number; currentImage?: string };

export const Route = createFileRoute("/revisar")({
  head: () => ({ meta: [{ title: "Revisar questão" }] }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<DraftDigitization | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [classificationDialogOpen, setClassificationDialogOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);

  const [areas, setAreas] = useState<CatalogItem[]>([]);
  const [conteudos, setConteudos] = useState<CatalogItem[]>([]);
  const [subconteudos, setSubconteudos] = useState<CatalogItem[]>([]);
  const [relacionados, setRelacionados] = useState<CatalogItem[]>([]);
  const [tagsCat, setTagsCat] = useState<CatalogItem[]>([]);
  const [provas, setProvas] = useState<CatalogItem[]>([]);
  const [instituicoes, setInstituicoes] = useState<CatalogItem[]>([]);

  useEffect(() => {
    const d = loadDraft();
    if (!d) {
      navigate({ to: "/" });
      return;
    }
    setDraft(d);
  }, [navigate]);

  useEffect(() => {
    (async () => {
      const tables = [
        ["catalog_areas", setAreas],
        ["catalog_conteudos", setConteudos],
        ["catalog_subconteudos", setSubconteudos],
        ["catalog_relacionados", setRelacionados],
        ["catalog_tags", setTagsCat],
        ["catalog_provas", setProvas],
        ["catalog_instituicoes", setInstituicoes],
      ] as const;
      for (const [t, set] of tables) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).from(t).select("*").order("nome");
        if (!error) set((data ?? []) as CatalogItem[]);
      }
    })();
  }, []);

  if (!draft) return null;
  const active = draft.questoes[Math.min(activeIndex, draft.questoes.length - 1)];
  const referenceContent = legacyReferenceToContent({
    text: draft.referencia_texto,
    textAfter: draft.referencia_texto_apos,
    mainImage: draft.referencia_imagem,
    mainPos: draft.referencia_imagem_pos,
    mainLayout: draft.referencia_imagem_layout,
    extras: draft.referencia_imagens_extra,
  });
  const cropImageSources = cropTarget ? getCropImageSources(draft, active, cropTarget) : [];

  const areaItem = areas.find((a) => a.nome === active.area_geral);
  const conteudoOptions = areaItem
    ? conteudos.filter((c) => c.area_id === areaItem.id)
    : [];
  const conteudoItem = conteudoOptions.find((c) => c.nome === active.conteudo_principal);
  const subOptions = conteudoItem
    ? subconteudos.filter((s) => s.conteudo_id === conteudoItem.id)
    : [];

  const relatedSelection = active.conteudos_relacionados ?? [];
  const tagSelection = active.tags_livres ?? [];

  const updateQuestion = (idx: number, updater: (q: DraftQuestion) => DraftQuestion) => {
    const questoes = draft.questoes.map((q, i) => i === idx ? updater(q) : q);
    setDraft({ ...draft, questoes });
  };
  const update = <K extends keyof DraftQuestion>(k: K, v: DraftQuestion[K]) => {
    updateQuestion(activeIndex, (q) => ({ ...q, [k]: v }));
  };

  const updateReferenceContent = (content: { text: string; images: ExtraImage[] }) => {
    setDraft((current) => current ? {
      ...current,
      referencia_texto: content.text,
      referencia_texto_apos: "",
      referencia_imagem: undefined,
      referencia_imagem_pos: undefined,
      referencia_imagem_layout: undefined,
      referencia_imagens_extra: content.images,
    } : current);
  };

  const updateSharedMetadata = <K extends SharedMetadataKey>(key: K, value: DraftQuestion[K]) => {
    setDraft((current) => current
      ? { ...current, questoes: current.questoes.map((q) => ({ ...q, [key]: value })) }
      : current);
  };

  const updateArea = (area: string) => {
    updateQuestion(activeIndex, (q) => ({
      ...q,
      area_geral: area,
      conteudo_principal: undefined,
      subconteudo_principal: undefined,
      conteudos_relacionados: [],
    }));
  };

  const updateMainContent = (content: string) => {
    updateQuestion(activeIndex, (q) => ({
      ...q,
      conteudo_principal: content,
      subconteudo_principal: undefined,
    }));
  };

  const setQuestionImageLayout = (layout: ImagePlacementLayout) => updateQuestion(activeIndex, (q) => ({ ...q, enunciado_imagem_layout: layout, enunciado_imagem_pos: "livre" }));
  const rotateQuestionImage = (delta: number) => {
    setQuestionImageLayout(normalizeImagePlacementLayout({
      ...active.enunciado_imagem_layout,
      rotation: (active.enunciado_imagem_layout?.rotation ?? 0) + delta,
    }));
  };
  const setRelacionadosSel = (next: string[]) => update("conteudos_relacionados", next);
  const setTagsSel = (next: string[]) => update("tags_livres", next);

  const statementExtras = normalizeExtraImages(active.enunciado_imagens_extra);

  const setStatementExtras = (images: ExtraImage[]) => {
    updateQuestion(activeIndex, (q) => ({ ...q, enunciado_imagens_extra: images }));
  };

  const createCatalogItem = async (
    table: "catalog_relacionados" | "catalog_tags",
    nome: string,
    setter: Dispatch<SetStateAction<CatalogItem[]>>,
    current: CatalogItem[],
  ): Promise<string | null> => {
    const clean = nome.trim();
    if (!clean) return null;
    const existing = current.find((i) => i.nome.trim().toLowerCase() === clean.toLowerCase());
    if (existing) return existing.nome;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from(table)
      .insert({ nome: clean, ativo: true })
      .select("*")
      .single();
    if (error || !data) {
      toast.error("Não foi possível criar o item no catálogo.");
      return null;
    }
    setter((prev) => [...prev, data as CatalogItem].sort((a, b) => a.nome.localeCompare(b.nome)));
    toast.success(`"${clean}" adicionado ao catálogo.`);
    return (data as CatalogItem).nome;
  };

  const suggestMetadata = () => {
    if (areas.length === 0 && conteudos.length === 0 && subconteudos.length === 0) {
      toast.info("Cadastre itens em Catálogos para gerar sugestões.");
      return;
    }

    const suggestion = suggestQuestionMetadata({
      question: active,
      referenceText: stripImageMarkers(referenceContent.text),
      areas,
      conteudos,
      subconteudos,
      relacionados,
      tags: tagsCat,
    });

    if (!hasMetadataSuggestion(suggestion)) {
      toast.info("Não encontrei uma sugestão segura para esta questão.");
      return;
    }

    const hasManualMetadata = Boolean(
      active.area_geral ||
      active.conteudo_principal ||
      active.subconteudo_principal ||
      relatedSelection.length > 0 ||
      tagSelection.length > 0,
    );

    const accepted = confirm(
      `${hasManualMetadata ? "Esta questão já possui classificação preenchida. Revise as sugestões antes de aplicar." : "Sugestões encontradas para esta questão."}\n\n${formatMetadataSuggestion(suggestion)}\n\nDeseja aplicar estas sugestões agora? Você ainda poderá editar tudo antes de salvar.`,
    );
    if (!accepted) return;

    updateQuestion(activeIndex, (q) => ({
      ...q,
      area_geral: suggestion.area_geral ?? q.area_geral,
      conteudo_principal: suggestion.conteudo_principal ?? q.conteudo_principal,
      subconteudo_principal: suggestion.subconteudo_principal ?? q.subconteudo_principal,
      conteudos_relacionados: mergeUnique(q.conteudos_relacionados ?? [], suggestion.conteudos_relacionados),
      tags_livres: mergeUnique(q.tags_livres ?? [], suggestion.tags_livres),
    }));
    toast.success("Sugestões aplicadas. Revise a classificação antes de salvar.");
  };

  const updateAlt = (i: number, key: "letra" | "texto", v: string) => {
    const copy = [...active.alternativas];
    copy[i] = { ...copy[i], [key]: v };
    update("alternativas", copy);
  };
  const addAlt = () => {
    const next = [...active.alternativas, { letra: LETRAS[active.alternativas.length] ?? "X", texto: "" }];
    update("alternativas", reletter(next));
  };
  const removeAlt = (i: number) => {
    const next = active.alternativas.filter((_, idx) => idx !== i);
    update("alternativas", reletter(next));
  };
  const removeCurrentQuestion = () => {
    if (draft.questoes.length <= 1) return;
    const label = active.numero ? `item ${active.numero}` : `item ${activeIndex + 1}`;
    if (!confirm(`Excluir ${label} desta digitalização?`)) return;
    const questoes = draft.questoes.filter((_, index) => index !== activeIndex);
    setDraft({ ...draft, questoes });
    setActiveIndex(Math.min(activeIndex, questoes.length - 1));
  };

  const hasIncompleteClassification = draft.questoes.some((q) =>
    !q.area_geral?.trim() || !q.conteudo_principal?.trim() || !q.subconteudo_principal?.trim(),
  );

  const requestSave = () => {
    if (hasIncompleteClassification) {
      setClassificationDialogOpen(true);
      return;
    }
    onSave();
  };

  const onSave = async () => {
    setClassificationDialogOpen(false);
    setSaving(true);
    try {
      const referenceImages = referenceContent.images;
      const hasReference = Boolean(stripImageMarkers(referenceContent.text).trim() || referenceImages.length > 0);
      const grupoId = hasReference || draft.questoes.length > 1 ? crypto.randomUUID() : null;
      const rows = draft.questoes.map((q) => ({
        numero: q.numero || null,
        enunciado: q.enunciado,
        alternativas: q.alternativas,
        tipo: q.tipo,
        resposta: q.resposta || null,
        fonte: q.fonte || draft.referencia_fonte || null,
        disciplina: q.area_geral || q.disciplina || null,
        conteudo: q.conteudo_principal || q.conteudo || null,
        dificuldade: q.dificuldade || null,
        area_geral: q.area_geral || null,
        conteudo_principal: q.conteudo_principal || null,
        subconteudo_principal: q.subconteudo_principal || null,
        conteudos_relacionados: q.conteudos_relacionados ?? [],
        tags_livres: q.tags_livres ?? [],
        tags: q.tags_livres ?? null,
        ano: q.ano || null,
        prova: q.prova || null,
        instituicao: q.instituicao || null,
        observacoes: q.observacoes || null,
        referencia_texto: referenceContent.text || null,
        referencia_fonte: draft.referencia_fonte || null,
        referencia_imagem: null,
        referencia_imagem_pos: null,
        referencia_imagem_layout: null,
        referencia_texto_apos: null,
        referencia_imagens_extra: referenceImages,
        grupo_id: grupoId,
        tem_equacao: q.tem_equacao,
        tem_imagem: q.tem_imagem
          || referenceImages.length > 0
          || !!q.enunciado_imagem
          || normalizeExtraImages(q.enunciado_imagens_extra).length > 0
          || q.alternativas.some((a) => !!a.imagem),
        imagem_original_url: draft.imageDataUrl ?? null,
        enunciado_imagem: q.enunciado_imagem ?? null,
        enunciado_imagem_pos: q.enunciado_imagem ? "livre" : q.enunciado_imagem_pos ?? null,
        enunciado_imagem_layout: q.enunciado_imagem ? normalizeImagePlacementLayout(q.enunciado_imagem_layout) : null,
        enunciado_imagens_extra: normalizeExtraImages(q.enunciado_imagens_extra),
      }));
      const { removedColumns } = await insertQuestionsWithCompatibility(rows);
      clearDraft();
      const successMessage = draft.questoes.length > 1 ? "Itens salvos com sucesso!" : "Questão salva com sucesso!";
      if (removedColumns.length > 0) {
        toast.warning(`${successMessage} Alguns campos novos não foram gravados porque o banco ainda precisa da atualização.`);
      } else {
        toast.success(successMessage);
      }
      navigate({ to: "/questoes" });
    } catch (e) {
      console.error(e);
      toast.error("Falha ao salvar a questão.");
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    if (confirm("Descartar esta digitalização?")) {
      clearDraft();
      navigate({ to: "/" });
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/"><ArrowLeft className="size-4" /> Voltar</Link>
            </Button>
            <h1 className="text-xl sm:text-2xl font-bold">Revisar digitalização</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>Cancelar</Button>
            <Button onClick={requestSave} disabled={saving} className="gap-2">
              <Save className="size-4" /> {saving ? "Salvando..." : `Salvar ${draft.questoes.length} item${draft.questoes.length > 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>

        {active.baixa_confianca && active.baixa_confianca.length > 0 && (
          <div className="mb-4 rounded-lg border border-accent bg-accent/30 p-3 flex gap-2 text-sm">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <div>
              <strong>Trechos com baixa confiança no item atual - revise:</strong>
              <ul className="list-disc pl-5 mt-1">
                {active.baixa_confianca.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          </div>
        )}

        <div className={draft.imageDataUrl ? "grid lg:grid-cols-2 gap-4" : "grid gap-4 max-w-4xl mx-auto"}>
          {draft.imageDataUrl && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-3 border-b text-sm font-medium">Imagem original</div>
            <div className="p-4 bg-muted/30 flex items-center justify-center min-h-[300px] max-h-[80vh] overflow-auto">
              <img src={draft.imageDataUrl} alt="Original" className="max-w-full object-contain" />
            </div>
          </div>
          )}


          <div className="rounded-xl border bg-card p-4 space-y-4">
            <ContentBlocksEditor
              label={`Referência / texto-base comum · ${draft.questoes.length} item${draft.questoes.length > 1 ? "s" : ""}`}
              text={referenceContent.text}
              images={referenceContent.images}
              rows={7}
              placeholder="Texto, tabela ou comando geral que vale para todos os itens."
              onChange={updateReferenceContent}
              onRequestImage={(request) => setCropTarget({ kind: "referencia", ...request })}
            />


            {draft.questoes.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {draft.questoes.map((q, i) => (
                  <Button
                    key={i}
                    type="button"
                    size="sm"
                    variant={i === activeIndex ? "default" : "outline"}
                    onClick={() => setActiveIndex(i)}
                  >
                    {q.numero ? `Item ${q.numero}` : `Item ${i + 1}`}
                  </Button>
                ))}
                <Button type="button" size="sm" variant="outline" className="gap-1 text-destructive" onClick={removeCurrentQuestion}>
                  <Trash2 className="size-3.5" /> Excluir item
                </Button>
              </div>
            )}

            <div>
              <Label>Tipo</Label>
              <Select value={active.tipo} onValueChange={(v) => update("tipo", v as DraftQuestion["tipo"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="multipla_escolha">Múltipla escolha</SelectItem>
                  <SelectItem value="certo_errado">Certo ou errado</SelectItem>
                  <SelectItem value="numerica">Numérica</SelectItem>
                  <SelectItem value="discursiva">Discursiva</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1 gap-2">
                <Label>Enunciado</Label>
                <div className="flex gap-1">
                  {!active.enunciado_imagem ? (
                    <Button type="button" size="sm" variant="outline" className="gap-1 h-7" onClick={() => setCropTarget({ kind: "enunciado" })}>
                      <ImagePlus className="size-3" /> Adicionar imagem
                    </Button>
                  ) : (
                    <>
                      <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setCropTarget({ kind: "enunciado", currentImage: active.enunciado_imagem })}>Recortar de novo</Button>
                      <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => rotateQuestionImage(-15)} aria-label="Girar imagem para a esquerda"><RotateCcw className="size-3" /></Button>
                      <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => rotateQuestionImage(15)} aria-label="Girar imagem para a direita"><RotateCw className="size-3" /></Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 text-destructive gap-1"
                        onClick={() => { update("enunciado_imagem", undefined); update("enunciado_imagem_pos", undefined); update("enunciado_imagem_layout", undefined); }}>
                        <X className="size-3" /> Remover
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {active.enunciado_imagem && (
                <div className="mb-2">
                  <ImageLayoutEditor
                    imageUrl={active.enunciado_imagem}
                    layout={active.enunciado_imagem_layout}
                    text={active.enunciado}
                    placeholder="Enunciado"
                    onLayoutChange={setQuestionImageLayout}
                  />
                </div>
              )}
              <RichTextEditor
                value={active.enunciado}
                onChange={(value) => update("enunciado", value)}
                rows={8}
                placeholder="Enunciado"
                className="font-mono text-sm"
              />
              <div className="mt-3">
                <ExtraImagesEditor
                  images={statementExtras}
                  onChange={setStatementExtras}
                  onAdd={() => setCropTarget({ kind: "enun-extra" })}
                  onReplace={(index) => setCropTarget({ kind: "enun-extra", index, currentImage: statementExtras[index]?.url })}
                  allowBetween={false}
                  label="Imagens adicionais do enunciado"
                  addLabel="Adicionar imagem"
                />
              </div>
            </div>

            {active.tipo === "multipla_escolha" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Alternativas</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addAlt} className="gap-1"><Plus className="size-3" /> Adicionar</Button>
                </div>
                <p className="text-xs text-muted-foreground mb-2">Imagens das alternativas são normalizadas para o mesmo tamanho no documento final.</p>
                <div className="space-y-2">
                  {active.alternativas.map((a, i) => (
                    <div key={i} className="flex gap-2 items-start rounded-md border bg-background p-2">
                      <GripVertical className="size-4 mt-3 text-muted-foreground" />
                      <Input className="w-14 text-center font-bold" value={a.letra} onChange={(e) => updateAlt(i, "letra", e.target.value)} />
                      <div className="flex-1 space-y-2">
                        <RichTextEditor
                          value={a.texto}
                          onChange={(value) => updateAlt(i, "texto", value)}
                          rows={2}
                          placeholder={`Texto da alternativa ${a.letra}`}
                          className="text-sm"
                        />
                        {a.imagem ? (
                          <div className="flex items-center gap-2 rounded-md border p-1.5 bg-muted/30">
                            <img src={a.imagem} alt={`Imagem ${a.letra}`} className="h-16 object-contain rounded" />
                            <div className="flex gap-1 ml-auto">
                              <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setCropTarget({ kind: "alt", index: i, currentImage: a.imagem })}>Recortar de novo</Button>
                              <Button type="button" size="sm" variant="ghost" className="h-7 text-destructive gap-1" onClick={() => {
                                const copy = [...active.alternativas];
                                copy[i] = { ...copy[i], imagem: undefined };
                                update("alternativas", copy);
                              }}><X className="size-3" /> Remover</Button>
                            </div>
                          </div>
                        ) : (
                          <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={() => setCropTarget({ kind: "alt", index: i })}>
                            <ImagePlus className="size-3" /> Adicionar imagem
                          </Button>
                        )}
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeAlt(i)}><Trash2 className="size-4" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Resposta / Gabarito</Label>
              <Input value={active.resposta ?? ""} onChange={(e) => update("resposta", e.target.value)} placeholder="A" />
            </div>

            <details className="rounded-lg border p-3" open>
              <summary className="cursor-pointer text-sm font-medium">Classificação pedagógica da questão</summary>
              <div className="mt-3 flex justify-end">
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={suggestMetadata}>
                  <Sparkles className="size-3.5" /> Sugerir classificação
                </Button>
              </div>
              <div className="grid gap-4 mt-3">
                <div className="grid sm:grid-cols-3 gap-2">
                  <div>
                    <Label>Área geral *</Label>
                    <CatalogSelect
                      value={active.area_geral ?? ""}
                      onChange={updateArea}
                      options={areas}
                    />
                  </div>
                  <div>
                    <Label>Conteúdo principal *</Label>
                    <CatalogSelect
                      value={active.conteudo_principal ?? ""}
                      onChange={updateMainContent}
                      options={conteudoOptions}
                      disabled={!active.area_geral}
                      emptyHint={active.area_geral ? "Nenhum conteúdo cadastrado para esta área." : "Selecione uma área primeiro."}
                    />
                  </div>
                  <div>
                    <Label>Subconteúdo principal *</Label>
                    <CatalogSelect
                      value={active.subconteudo_principal ?? ""}
                      onChange={(v) => update("subconteudo_principal", v)}
                      options={subOptions}
                      disabled={!active.conteudo_principal}
                      emptyHint={active.conteudo_principal ? "Nenhum subconteúdo cadastrado para este conteúdo." : "Selecione um conteúdo principal primeiro."}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Conteúdos relacionados</Label>
                  <CatalogMultiSelect
                    values={relatedSelection}
                    onChange={setRelacionadosSel}
                    options={relacionados}
                    onCreate={(nome) => createCatalogItem("catalog_relacionados", nome, setRelacionados, relacionados)}
                    createLabel="Criar conteúdo relacionado"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tags</Label>
                  <CatalogMultiSelect
                    values={tagSelection}
                    onChange={setTagsSel}
                    options={tagsCat}
                    onCreate={(nome) => createCatalogItem("catalog_tags", nome, setTagsCat, tagsCat)}
                    createLabel="Criar tag"
                  />
                </div>

                <div className="grid sm:grid-cols-3 gap-2">
                  <div>
                    <Label>Ano</Label>
                    <Input value={active.ano ?? ""} onChange={(e) => updateSharedMetadata("ano", e.target.value)} placeholder="2023" />
                  </div>
                  <div>
                    <Label>Prova</Label>
                    <CatalogSelect
                      value={active.prova ?? ""}
                      onChange={(v) => updateSharedMetadata("prova", v)}
                      options={provas}
                    />
                  </div>
                  <div>
                    <Label>Instituição</Label>
                    <CatalogSelect
                      value={active.instituicao ?? ""}
                      onChange={(v) => updateSharedMetadata("instituicao", v)}
                      options={instituicoes}
                    />
                  </div>
                </div>

                <div>
                  <Label>Observações</Label>
                  <RichTextEditor
                    value={active.observacoes ?? ""}
                    onChange={(value) => update("observacoes", value)}
                    rows={2}
                    placeholder="Observações, resolução ou comentário"
                  />
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
      <AlertDialog open={classificationDialogOpen} onOpenChange={setClassificationDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atenção: esta questão ainda não possui classificação pedagógica completa.</AlertDialogTitle>
            <AlertDialogDescription>
              Área geral, Conteúdo principal e Subconteúdo principal ajudam a organizar o banco de questões. Deseja salvar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar e completar</AlertDialogCancel>
            <AlertDialogAction onClick={onSave}>Salvar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ImageCropDialog
        open={!!cropTarget}
        imageUrl={cropImageSources[0]?.url ?? draft.imageDataUrl}
        imageSources={cropImageSources}
        title={cropTarget?.kind === "referencia"
          ? typeof cropTarget.replaceImage === "number" ? "Recortar ou trocar imagem da referência" : "Inserir imagem na referência"
          : cropTarget?.kind === "alt"
            ? `Inserir imagem na alternativa ${active.alternativas[cropTarget.index]?.letra ?? ""}`
            : "Inserir imagem no enunciado"}
        onCancel={() => setCropTarget(null)}
        onConfirm={(dataUrl) => {
          if (!cropTarget) return;
          if (cropTarget.kind === "referencia") {
            setDraft((current) => current
              ? applyReferenceImageToDraft(current, dataUrl, cropTarget)
              : current);
          } else if (cropTarget.kind === "enun-extra") {
            setStatementExtras(upsertExtraImage(statementExtras, dataUrl, cropTarget.index));
          } else if (cropTarget.kind === "enunciado") {
            updateQuestion(activeIndex, (q) => ({
              ...q,
              enunciado_imagem: dataUrl,
              enunciado_imagem_pos: "livre",
              enunciado_imagem_layout: q.enunciado_imagem_layout ?? DEFAULT_IMAGE_PLACEMENT_LAYOUT,
            }));
          } else {
            const copy = [...active.alternativas];
            copy[cropTarget.index] = { ...copy[cropTarget.index], imagem: dataUrl };
            updateQuestion(activeIndex, (q) => ({ ...q, alternativas: copy }));
          }
          setCropTarget(null);
        }}
      />
    </AppLayout>
  );
}

function getCropImageSources(draft: DraftDigitization, active: DraftQuestion, target: CropTarget): ImageCropSource[] {
  const sources: ImageCropSource[] = [];
  const add = (id: string, label: string, url: string | null | undefined) => {
    if (!url) return;
    if (sources.some((source) => source.url === url || source.id === id)) return;
    sources.push({ id, label, url });
  };

  add("current", "Imagem atual deste campo", target.currentImage);
  (draft.imageDataUrls ?? []).forEach((url, index) => {
    add(`scan-part-${index}`, `Parte ${index + 1} da digitalização`, url);
  });
  add("scan-full", "Imagem completa da digitalização", draft.imageDataUrl);
  add("reference-current", "Imagem atual da referência", draft.referencia_imagem);
  add("statement-current", "Imagem atual do enunciado", active.enunciado_imagem);
  normalizeExtraImages(draft.referencia_imagens_extra).forEach((image, index) => {
    add(`reference-extra-${index}`, `Imagem extra da referência ${index + 1}`, image.url);
  });
  normalizeExtraImages(active.enunciado_imagens_extra).forEach((image, index) => {
    add(`statement-extra-${index}`, `Imagem extra do enunciado ${index + 1}`, image.url);
  });
  active.alternativas.forEach((alt, index) => {
    add(`alternative-${index}`, `Imagem da alternativa ${alt.letra || index + 1}`, alt.imagem);
  });
  return sources;
}

function upsertExtraImage(images: ExtraImage[], url: string, index?: number): ExtraImage[] {
  const created = normalizeExtraImage({ url, pos: "depois" });
  if (!created) return images;
  if (typeof index === "number" && images[index]) {
    return images.map((image, i) => (i === index ? { ...image, url } : image));
  }
  return [...images, created];
}

function applyReferenceImageToDraft(current: DraftDigitization, dataUrl: string, request: ContentImageRequest): DraftDigitization {
  const content = legacyReferenceToContent({
    text: current.referencia_texto,
    textAfter: current.referencia_texto_apos,
    mainImage: current.referencia_imagem,
    mainPos: current.referencia_imagem_pos,
    mainLayout: current.referencia_imagem_layout,
    extras: current.referencia_imagens_extra,
  });
  const blocks = parseBlocks(content.text, content.images);

  if (typeof request.replaceImage === "number") {
    let imageIndex = 0;
    const targetIndex = blocks.findIndex((block) => {
      if (block.type !== "image") return false;
      return imageIndex++ === request.replaceImage;
    });
    if (targetIndex >= 0 && blocks[targetIndex].type === "image") {
      blocks[targetIndex] = {
        type: "image",
        image: { ...blocks[targetIndex].image, url: dataUrl },
      };
    }
  } else {
    const imageBlock = { type: "image", image: newContentImage(dataUrl) } satisfies ContentBlock;
    const textBlock = request.textBlock ? blocks[request.textBlock.index] : null;

    if (request.textBlock && textBlock?.type === "text") {
      const start = Math.max(0, Math.min(request.textBlock.start, textBlock.value.length));
      const end = Math.max(start, Math.min(request.textBlock.end, textBlock.value.length));
      blocks.splice(
        request.textBlock.index,
        1,
        { type: "text", value: textBlock.value.slice(0, start) },
        imageBlock,
        { type: "text", value: textBlock.value.slice(end) },
      );
    } else {
      const insertAt = Math.max(0, Math.min(request.insertAt ?? blocks.length, blocks.length));
      blocks.splice(insertAt, 0, imageBlock);
    }
  }

  const serialized = serializeBlocks(blocks);
  return {
    ...current,
    referencia_texto: serialized.text,
    referencia_texto_apos: "",
    referencia_imagem: undefined,
    referencia_imagem_pos: undefined,
    referencia_imagem_layout: undefined,
    referencia_imagens_extra: serialized.images,
  };
}

function mergeUnique(current: string[], next: string[]) {
  return Array.from(new Set([...current, ...next].map((item) => item.trim()).filter(Boolean)));
}
