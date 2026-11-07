import { useState, type ReactNode } from "react";
import {
  Eye,
  ImagePlus,
  Loader2,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentBlocksEditor, type ContentImageRequest } from "@/components/ContentBlocksEditor";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExtraImagesEditor } from "@/components/ExtraImagesEditor";
import { ImageCropDialog, type ImageCropSource } from "@/components/ImageCropDialog";
import { ImageLayoutEditor } from "@/components/ImageLayoutEditor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CatalogMultiSelect } from "@/components/CatalogSelect";
import { QuestionPreviewContent, type PreviewQuestion } from "@/components/QuestionPreviewDialog";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { hasImageMarkers, legacyReferenceToContent, newContentImage, parseBlocks, serializeBlocks, type ContentBlock } from "@/lib/content-blocks";
import {
  DEFAULT_IMAGE_PLACEMENT_LAYOUT,
  normalizeExtraImage,
  normalizeExtraImages,
  normalizeImagePlacementLayout,
  type ExtraImage,
  type ImagePlacementLayout,
} from "@/lib/image-layout";

export type CatalogItem = { id: string; nome: string; ativo: boolean; area_id?: string | null; conteudo_id?: string | null };
export type EditableQuestion = {
  id: string;
  numero: string | null;
  enunciado: string;
  alternativas: { letra: string; texto: string; imagem?: string | null; imagem_pendente?: boolean }[];
  tipo: string;
  resposta: string | null;
  fonte: string | null;
  disciplina?: string | null;
  conteudo?: string | null;
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
  enunciado_imagens_extra?: ExtraImage[] | null;
  imagem_original_url?: string | null;
  tem_equacao: boolean;
  tem_imagem: boolean;
  created_at?: string | null;
};
export type EditDraft = {
  numero: string;
  enunciado: string;
  alternativas: EditableQuestion["alternativas"];
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
  referencia_texto: string;
  referencia_imagens_extra: ExtraImage[];
  referencia_fonte: string;
  enunciado_imagem: string;
  enunciado_imagem_pos: string;
  enunciado_imagem_layout: ImagePlacementLayout | null;
  enunciado_imagens_extra: ExtraImage[];
  imagem_original_url: string;
};
type EditCropTarget =
  | ({ kind: "referencia" | "enunciado-blocos" } & ContentImageRequest)
  | { kind: "enunciado"; currentImage?: string }
  | { kind: "enun-extra"; index?: number; currentImage?: string }
  | { kind: "alt"; index: number; currentImage?: string };

function FilterBlock({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      {children}
      {hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  );
}

const FILTER_EMPTY_VALUE = "__digitalizador_filter_empty__";
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function FilterSelect({ id, value, onChange, options, placeholder, disabled }: { id: string; value: string; onChange: (value: string) => void; options: CatalogItem[]; placeholder: string; disabled?: boolean }) {
  const visibleOptions = options.filter((item) => item.ativo || item.nome === value);
  return (
    <Select value={value || FILTER_EMPTY_VALUE} onValueChange={(nextValue) => onChange(nextValue === FILTER_EMPTY_VALUE ? "" : nextValue)} disabled={disabled}>
      <SelectTrigger id={id} aria-label={placeholder} className="h-11 w-full rounded-xl border-border/70 bg-background shadow-sm transition-colors hover:border-primary/40">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72 rounded-xl border-border shadow-lg">
        <SelectItem value={FILTER_EMPTY_VALUE}>{placeholder}</SelectItem>
        {visibleOptions.map((item) => (
          <SelectItem key={item.id} value={item.nome}>
            {item.nome}{item.ativo ? "" : " (inativo)"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EditQuestionActionBar({ saving, deleting, onCancel, onPreview, onDelete, onSave }: {
  saving: boolean;
  deleting: boolean;
  onCancel: () => void;
  onPreview: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  const busy = saving || deleting;
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3">
      <Button type="button" variant="destructive" onClick={onDelete} disabled={busy} className="gap-2">
        {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        {deleting ? "Excluindo..." : "Excluir questão"}
      </Button>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onPreview} disabled={busy} className="gap-2">
          <Eye className="size-4" /> Pré-visualizar
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button type="button" onClick={onSave} disabled={busy} className="gap-2">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? "Salvando..." : "Salvar edição"}
        </Button>
      </div>
    </div>
  );
}

export function EditQuestionDialog({ question, draft, saving, areas, conteudos, subconteudos, relacionados, tags, provas, instituicoes, onDraftChange, onClose, onSave, onDelete }: {
  question: EditableQuestion | null;
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
  onDelete: (id: string) => Promise<void>;
}) {
  const [cropTarget, setCropTarget] = useState<EditCropTarget | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!question || !draft) return null;

  const area = areas.find((item) => item.nome === draft.area_geral);
  const conteudoOptions = area ? conteudos.filter((item) => item.area_id === area.id) : [];
  const conteudo = conteudoOptions.find((item) => item.nome === draft.conteudo_principal);
  const subOptions = conteudo ? subconteudos.filter((item) => item.conteudo_id === conteudo.id) : [];
  const statementExtras = normalizeExtraImages(draft.enunciado_imagens_extra);
  const referenceImages = normalizeExtraImages(draft.referencia_imagens_extra);
  const previewQuestion: PreviewQuestion = {
    numero: draft.numero,
    tipo: draft.tipo,
    enunciado: draft.enunciado,
    enunciado_imagem: draft.enunciado_imagem || null,
    enunciado_imagem_pos: draft.enunciado_imagem_pos || null,
    enunciado_imagem_layout: draft.enunciado_imagem_layout,
    enunciado_imagens_extra: statementExtras,
    alternativas: draft.alternativas,
    resposta: draft.resposta,
    fonte: draft.fonte,
  };
  const cropSources = getEditImageSources(question, draft, cropTarget);
  const patch = (partial: Partial<EditDraft>) => onDraftChange({ ...draft, ...partial });
  const closeDialog = () => {
    setCropTarget(null);
    setPreviewOpen(false);
    onClose();
  };
  const deleteQuestion = async () => {
    setDeleting(true);
    try {
      await onDelete(question.id);
    } finally {
      setDeleting(false);
    }
  };
  const updateAlt = (index: number, partial: Partial<EditDraft["alternativas"][number]>) => {
    const next = [...draft.alternativas];
    next[index] = { ...next[index], ...partial };
    patch({ alternativas: next });
  };
  const addAlt = () => patch({ alternativas: reletterAlternatives([...draft.alternativas, { letra: LETTERS[draft.alternativas.length] ?? "X", texto: "" }]) });
  const removeAlt = (index: number) => patch({ alternativas: reletterAlternatives(draft.alternativas.filter((_, i) => i !== index)) });
  const updateStatementLayout = (layout: ImagePlacementLayout) =>
    patch({ enunciado_imagem_layout: layout, enunciado_imagem_pos: "livre" });
  const rotateStatementImage = (delta: number) =>
    updateStatementLayout(normalizeImagePlacementLayout({
      ...draft.enunciado_imagem_layout,
      rotation: (draft.enunciado_imagem_layout?.rotation ?? 0) + delta,
    }));

  const confirmCrop = (dataUrl: string) => {
    if (!cropTarget) return;
    if (cropTarget.kind === "referencia") {
      patch(applyReferenceCropToEditDraft(draft, dataUrl, cropTarget));
    } else if (cropTarget.kind === "enunciado-blocos") {
      const content = applyContentCropToDraft(draft.enunciado, draft.enunciado_imagens_extra, dataUrl, cropTarget);
      patch({ enunciado: content.text, enunciado_imagens_extra: content.images });
    } else if (cropTarget.kind === "enunciado") {
      patch({
        enunciado_imagem: dataUrl,
        enunciado_imagem_pos: "livre",
        enunciado_imagem_layout: draft.enunciado_imagem_layout ?? DEFAULT_IMAGE_PLACEMENT_LAYOUT,
      });
    } else if (cropTarget.kind === "enun-extra") {
      patch({
        enunciado_imagens_extra: upsertEditExtraImage(draft.enunciado_imagens_extra, dataUrl, cropTarget.index),
      });
    } else {
      updateAlt(cropTarget.index, { imagem: dataUrl, imagem_pendente: false });
    }
    setCropTarget(null);
  };

  return (
    <Dialog open={!!question} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar questão</DialogTitle>
          <DialogDescription>Edite o texto-base, enunciado, alternativas, gabarito, classificação e imagens nesta mesma tela. Use a prévia geral para conferir o resultado.</DialogDescription>
        </DialogHeader>

        <EditQuestionActionBar saving={saving} deleting={deleting} onCancel={closeDialog} onPreview={() => setPreviewOpen(true)} onDelete={() => void deleteQuestion()} onSave={onSave} />

        <section className="space-y-3 rounded-lg border bg-card p-4">
          <ContentBlocksEditor
            label="Referência / texto-base"
            text={draft.referencia_texto}
            images={draft.referencia_imagens_extra}
            rows={7}
            placeholder="Texto, tabela ou comando geral que vale para esta questão."
            onChange={(content) => patch({ referencia_texto: content.text, referencia_imagens_extra: content.images })}
            onRequestImage={(request) => setCropTarget({ kind: "referencia", ...request })}
          />
          <FilterBlock label="Fonte da referência">
            <Input
              value={draft.referencia_fonte}
              onChange={(event) => patch({ referencia_fonte: event.target.value })}
              placeholder="Fonte do texto-base, se houver"
            />
          </FilterBlock>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <FilterBlock label="Tipo">
            <select value={draft.tipo} onChange={(event) => patch({ tipo: event.target.value })} className="h-10 w-full rounded-md border bg-card px-3 text-sm">
              <option value="multipla_escolha">Múltipla escolha</option>
              <option value="certo_errado">Certo ou errado</option>
              <option value="numerica">Numérica</option>
              <option value="discursiva">Discursiva</option>
            </select>
          </FilterBlock>
          <FilterBlock label="Número do item">
            <Input value={draft.numero} onChange={(event) => patch({ numero: event.target.value })} placeholder="Ex.: 68" />
          </FilterBlock>
        </div>

        <section className="space-y-4 rounded-lg border bg-card p-4">
          {hasImageMarkers(draft.enunciado) ? (
            <ContentBlocksEditor
              label="Enunciado"
              text={draft.enunciado}
              images={statementExtras}
              rows={8}
              placeholder="Texto, tabela ou comando do item."
              onChange={(content) => patch({ enunciado: content.text, enunciado_imagens_extra: content.images })}
              onRequestImage={(request) => setCropTarget({ kind: "enunciado-blocos", ...request })}
            />
          ) : (
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <Label>Enunciado</Label>
              {!draft.enunciado_imagem ? (
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={() => setCropTarget({ kind: "enunciado" })}>
                  <ImagePlus className="size-3" /> Adicionar imagem
                </Button>
              ) : (
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setCropTarget({ kind: "enunciado", currentImage: draft.enunciado_imagem })}>Recortar / substituir</Button>
                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => rotateStatementImage(-15)} aria-label="Girar imagem para a esquerda"><RotateCcw className="size-3" /></Button>
                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => rotateStatementImage(15)} aria-label="Girar imagem para a direita"><RotateCw className="size-3" /></Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-destructive" onClick={() => patch({ enunciado_imagem: "", enunciado_imagem_pos: "", enunciado_imagem_layout: null })}>
                    <X className="size-3" /> Remover
                  </Button>
                </div>
              )}
            </div>
            {draft.enunciado_imagem && (
              <div className="mb-3">
                <ImageLayoutEditor
                  imageUrl={draft.enunciado_imagem}
                  layout={draft.enunciado_imagem_layout}
                  text={draft.enunciado}
                  placeholder="Enunciado"
                  onLayoutChange={updateStatementLayout}
                />
              </div>
            )}
            <RichTextEditor
              value={draft.enunciado}
              onChange={(value) => patch({ enunciado: value })}
              rows={8}
              placeholder="Enunciado da questão"
              className="text-sm"
              showPreview={false}
            />
            <div className="mt-3">
              <ExtraImagesEditor
                images={statementExtras}
                onChange={(images) => patch({ enunciado_imagens_extra: images })}
                onAdd={() => setCropTarget({ kind: "enun-extra" })}
                onReplace={(index) => setCropTarget({ kind: "enun-extra", index, currentImage: statementExtras[index]?.url })}
                allowBetween={false}
                label="Imagens adicionais do enunciado"
                addLabel="Adicionar imagem"
              />
            </div>
          </div>
          )}


          {draft.tipo === "multipla_escolha" && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label>Alternativas</Label>
                <Button type="button" size="sm" variant="outline" onClick={addAlt} className="gap-1">
                  <Plus className="size-3" /> Adicionar alternativa
                </Button>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">Imagens das alternativas são normalizadas para o mesmo tamanho no documento final.</p>
              <div className="space-y-2">
                {draft.alternativas.map((alt, index) => (
                  <div key={index} className="flex items-start gap-2 rounded-md border bg-background p-2">
                    <Input value={alt.letra} onChange={(event) => updateAlt(index, { letra: event.target.value })} className="mt-1 w-14 text-center font-bold" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <RichTextEditor value={alt.texto} onChange={(value) => updateAlt(index, { texto: value })} rows={2} placeholder={"Texto da alternativa " + alt.letra} className="text-sm" showPreview={false} />
                      {alt.imagem ? (
                        <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-1.5">
                          <img src={alt.imagem} alt={"Imagem da alternativa " + alt.letra} className="h-16 max-w-40 rounded object-contain" />
                          <div className="ml-auto flex gap-1">
                            <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setCropTarget({ kind: "alt", index, currentImage: alt.imagem ?? undefined })}>Recortar / substituir</Button>
                            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-destructive" onClick={() => updateAlt(index, { imagem: undefined, imagem_pendente: false })}><X className="size-3" /> Remover</Button>
                          </div>
                        </div>
                      ) : alt.imagem_pendente ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
                          <span className="text-sm text-muted-foreground">Espaço reservado para imagem da alternativa {alt.letra}</span>
                          <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => setCropTarget({ kind: "alt", index })}>
                            <ImagePlus className="size-3" /> Enviar e recortar
                          </Button>
                        </div>
                      ) : (
                        <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={() => setCropTarget({ kind: "alt", index })}>
                          <ImagePlus className="size-3" /> Adicionar imagem
                        </Button>
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeAlt(index)} aria-label={"Remover alternativa " + alt.letra}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <FilterBlock label="Gabarito"><Input value={draft.resposta} onChange={(event) => patch({ resposta: event.target.value })} placeholder="Ex.: C" /></FilterBlock>
          <FilterBlock label="Fonte específica do item"><Input value={draft.fonte} onChange={(event) => patch({ fonte: event.target.value })} placeholder="Ex.: ENEM 2025" /></FilterBlock>
          <FilterBlock label="Ano"><Input value={draft.ano} onChange={(event) => patch({ ano: event.target.value })} placeholder="Ex.: 2025" /></FilterBlock>
        </div>

        <section className="space-y-4 rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">Classificação pedagógica</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <FilterBlock label="Área geral">
              <FilterSelect id="edit-area" value={draft.area_geral} onChange={(value) => patch({ area_geral: value, conteudo_principal: "", subconteudo_principal: "" })} options={areas} placeholder="Selecione" />
            </FilterBlock>
            <FilterBlock label="Conteúdo principal">
              <FilterSelect id="edit-conteudo" value={draft.conteudo_principal} onChange={(value) => patch({ conteudo_principal: value, subconteudo_principal: "" })} options={conteudoOptions} placeholder={draft.area_geral ? "Selecione" : "Escolha área"} disabled={!draft.area_geral} />
            </FilterBlock>
            <FilterBlock label="Subconteúdo principal">
              <FilterSelect id="edit-sub" value={draft.subconteudo_principal} onChange={(value) => patch({ subconteudo_principal: value })} options={subOptions} placeholder={draft.conteudo_principal ? "Selecione" : "Escolha conteúdo"} disabled={!draft.conteudo_principal} />
            </FilterBlock>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FilterBlock label="Conteúdos relacionados">
              <CatalogMultiSelect values={draft.conteudos_relacionados} onChange={(values) => patch({ conteudos_relacionados: values })} options={relacionados} placeholder="Buscar conteúdos relacionados" />
            </FilterBlock>
            <FilterBlock label="Tags">
              <CatalogMultiSelect values={draft.tags_livres} onChange={(values) => patch({ tags_livres: values })} options={tags} placeholder="Buscar tags" />
            </FilterBlock>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <FilterBlock label="Prova"><FilterSelect id="edit-prova" value={draft.prova} onChange={(value) => patch({ prova: value })} options={provas} placeholder="Selecione" /></FilterBlock>
          <FilterBlock label="Instituição"><FilterSelect id="edit-instituicao" value={draft.instituicao} onChange={(value) => patch({ instituicao: value })} options={instituicoes} placeholder="Selecione" /></FilterBlock>
        </div>
        <FilterBlock label="Observações"><Textarea value={draft.observacoes} onChange={(event) => patch({ observacoes: event.target.value })} rows={3} /></FilterBlock>

        <DialogFooter className="mt-2 sm:justify-start">
          <EditQuestionActionBar saving={saving} deleting={deleting} onCancel={closeDialog} onPreview={() => setPreviewOpen(true)} onDelete={() => void deleteQuestion()} onSave={onSave} />
        </DialogFooter>
      </DialogContent>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pré-visualização da questão</DialogTitle>
            <DialogDescription>Confira texto-base, enunciado, imagens, alternativas e gabarito antes de salvar.</DialogDescription>
          </DialogHeader>
          <QuestionPreviewContent
            question={previewQuestion}
            itemIndex={0}
            itemCount={1}
            referenceText={draft.referencia_texto}
            referenceImages={referenceImages}
            referenceSource={draft.referencia_fonte}
          />
        </DialogContent>
      </Dialog>
      <ImageCropDialog
        open={!!cropTarget}
        imageUrl={cropTarget?.currentImage ?? draft.imagem_original_url ?? question.imagem_original_url ?? undefined}
        imageSources={cropSources}
        title={cropTarget?.kind === "referencia"
          ? typeof cropTarget.replaceImage === "number" ? "Recortar ou substituir imagem da referência" : "Inserir imagem na referência"
          : cropTarget?.kind === "enunciado-blocos"
            ? typeof cropTarget.replaceImage === "number" ? "Recortar ou substituir imagem do enunciado" : "Inserir imagem no enunciado"
            : cropTarget?.kind === "alt"
              ? "Imagem da alternativa " + (draft.alternativas[cropTarget.index]?.letra ?? "")
            : cropTarget?.kind === "enun-extra"
              ? "Imagem adicional do enunciado"
              : "Imagem do enunciado"}
        onCancel={() => setCropTarget(null)}
        onConfirm={confirmCrop}
      />
    </Dialog>
  );
}

export function toEditDraft(q: EditableQuestion): EditDraft {
  const reference = legacyReferenceToContent({
    text: q.referencia_texto ?? "",
    textAfter: q.referencia_texto_apos,
    mainImage: q.referencia_imagem,
    mainPos: q.referencia_imagem_pos,
    mainLayout: q.referencia_imagem_layout,
    extras: q.referencia_imagens_extra,
  });
  return {
    numero: q.numero ?? "",
    enunciado: q.enunciado ?? "",
    alternativas: q.alternativas ?? [],
    tipo: q.tipo ?? "discursiva",
    resposta: q.resposta ?? "",
    fonte: q.fonte ?? "",
    area_geral: q.area_geral ?? "",
    conteudo_principal: q.conteudo_principal ?? "",
    subconteudo_principal: q.subconteudo_principal ?? "",
    conteudos_relacionados: q.conteudos_relacionados ?? [],
    tags_livres: q.tags_livres?.length ? q.tags_livres : q.tags ?? [],
    ano: q.ano ?? "",
    prova: q.prova ?? "",
    instituicao: q.instituicao ?? "",
    observacoes: q.observacoes ?? "",
    referencia_texto: reference.text,
    referencia_imagens_extra: reference.images,
    referencia_fonte: q.referencia_fonte ?? "",
    enunciado_imagem: q.enunciado_imagem ?? "",
    enunciado_imagem_pos: q.enunciado_imagem_pos ?? "livre",
    enunciado_imagem_layout: q.enunciado_imagem_layout ?? null,
    enunciado_imagens_extra: normalizeExtraImages(q.enunciado_imagens_extra),
    imagem_original_url: q.imagem_original_url ?? "",
  };
}

export function editDraftToPayload(draft: EditDraft) {
  const alternatives = draft.alternativas.map((alt) => ({ ...alt, imagem: alt.imagem || null }));
  return {
    numero: draft.numero || null,
    enunciado: draft.enunciado,
    alternativas: alternatives,
    tipo: draft.tipo,
    resposta: draft.resposta || null,
    fonte: draft.fonte || null,
    disciplina: draft.area_geral || null,
    conteudo: draft.conteudo_principal || null,
    area_geral: draft.area_geral || null,
    conteudo_principal: draft.conteudo_principal || null,
    subconteudo_principal: draft.subconteudo_principal || null,
    conteudos_relacionados: draft.conteudos_relacionados,
    tags_livres: draft.tags_livres,
    tags: draft.tags_livres,
    ano: draft.ano || null,
    prova: draft.prova || null,
    instituicao: draft.instituicao || null,
    observacoes: draft.observacoes || null,
    tem_equacao: detectEquation(draft.referencia_texto + " " + draft.enunciado, alternatives),
    tem_imagem: Boolean(
      draft.referencia_imagens_extra.length > 0 ||
      draft.enunciado_imagem ||
      draft.enunciado_imagens_extra.length > 0 ||
      alternatives.some((alt) => !!alt.imagem || alt.imagem_pendente),
    ),
    enunciado_imagem: draft.enunciado_imagem || null,
    enunciado_imagem_pos: draft.enunciado_imagem ? draft.enunciado_imagem_pos || "livre" : null,
    enunciado_imagem_layout: draft.enunciado_imagem ? normalizeImagePlacementLayout(draft.enunciado_imagem_layout) : null,
    enunciado_imagens_extra: normalizeExtraImages(draft.enunciado_imagens_extra),
  };
}

export function editReferenceToPayload(draft: EditDraft) {
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

function getEditImageSources(question: EditableQuestion, draft: EditDraft, target: EditCropTarget | null): ImageCropSource[] {
  const sources: ImageCropSource[] = [];
  const add = (id: string, label: string, url?: string | null) => {
    if (!url || sources.some((source) => source.url === url || source.id === id)) return;
    sources.push({ id, label, url });
  };

  add("current", "Imagem atual deste campo", target?.currentImage);
  add("original", "Imagem original da questão", draft.imagem_original_url || question.imagem_original_url);
  draft.referencia_imagens_extra.forEach((image, index) => add("reference-" + index, "Imagem da referência " + (index + 1), image.url));
  add("statement-main", "Imagem principal do enunciado", draft.enunciado_imagem);
  draft.enunciado_imagens_extra.forEach((image, index) => add("statement-extra-" + index, "Imagem adicional do enunciado " + (index + 1), image.url));
  draft.alternativas.forEach((alt, index) => add("alternative-" + index, "Imagem da alternativa " + alt.letra, alt.imagem));
  return sources;
}

function applyContentCropToDraft(text: string, images: ExtraImage[], dataUrl: string, request: ContentImageRequest) {
  const blocks = parseBlocks(text, images);
  if (typeof request.replaceImage === "number") {
    let imageIndex = 0;
    const targetIndex = blocks.findIndex((block) => {
      if (block.type !== "image") return false;
      return imageIndex++ === request.replaceImage;
    });
    if (targetIndex >= 0 && blocks[targetIndex].type === "image") {
      blocks[targetIndex] = { type: "image", image: { ...blocks[targetIndex].image, url: dataUrl, pending: undefined } };
    }
  } else {
    const imageBlock: ContentBlock = { type: "image", image: newContentImage(dataUrl) };
    const textBlock = request.textBlock ? blocks[request.textBlock.index] : null;
    if (request.textBlock && textBlock?.type === "text") {
      const start = Math.max(0, Math.min(request.textBlock.start, textBlock.value.length));
      const end = Math.max(start, Math.min(request.textBlock.end, textBlock.value.length));
      blocks.splice(request.textBlock.index, 1,
        { type: "text", value: textBlock.value.slice(0, start) },
        imageBlock,
        { type: "text", value: textBlock.value.slice(end) },
      );
    } else {
      const insertAt = Math.max(0, Math.min(request.insertAt ?? blocks.length, blocks.length));
      blocks.splice(insertAt, 0, imageBlock);
    }
  }
  return serializeBlocks(blocks);
}

function applyReferenceCropToEditDraft(draft: EditDraft, dataUrl: string, request: ContentImageRequest): Partial<EditDraft> {
  const content = applyContentCropToDraft(draft.referencia_texto, draft.referencia_imagens_extra, dataUrl, request);
  return { referencia_texto: content.text, referencia_imagens_extra: content.images };
}

function upsertEditExtraImage(images: ExtraImage[], url: string, index?: number) {
  const created = normalizeExtraImage({ url, pos: "depois" });
  if (!created) return images;
  if (typeof index === "number" && images[index]) {
    return images.map((image, currentIndex) => currentIndex === index ? { ...image, url } : image);
  }
  return [...images, created];
}

function reletterAlternatives(alternatives: EditDraft["alternativas"]) { return alternatives.map((alt, index) => ({ ...alt, letra: LETTERS[index] ?? alt.letra ?? String(index + 1) })); }

function detectEquation(text: string, alternatives: EditDraft["alternativas"]) { return /\$[^$]+\$|\\frac|\\sqrt|[=<>≤≥]/.test([text, ...alternatives.map((alt) => alt.texto)].join(" ")); }
