import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, Loader2, GripVertical, X, Download, Link2, Move } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AppLayout } from "@/components/AppLayout";
import { generateDocx } from "@/lib/docx.functions";
import { generateEnemDocx } from "@/lib/enem-docx.functions";
import { generatePasDocx } from "@/lib/pas-docx.functions";
import { RichText } from "@/components/RichText";
import { fetchDocumentQuestions, type DocumentQuestion } from "@/lib/question-compat";
import { loadSelectedQuestionIds, saveSelectedQuestionIds } from "@/lib/selection-store";
import { toast } from "sonner";

export const Route = createFileRoute("/documento")({
  head: () => ({ meta: [{ title: "Criar documento" }] }),
  component: Page,
});

const REFERENCE_GROUP_COLORS = [
  { bar: "bg-sky-500", border: "border-sky-300", banner: "border-sky-300 bg-sky-50 text-sky-800", badge: "bg-sky-100 text-sky-800" },
  { bar: "bg-emerald-500", border: "border-emerald-300", banner: "border-emerald-300 bg-emerald-50 text-emerald-800", badge: "bg-emerald-100 text-emerald-800" },
  { bar: "bg-amber-500", border: "border-amber-300", banner: "border-amber-300 bg-amber-50 text-amber-800", badge: "bg-amber-100 text-amber-800" },
  { bar: "bg-rose-500", border: "border-rose-300", banner: "border-rose-300 bg-rose-50 text-rose-800", badge: "bg-rose-100 text-rose-800" },
  { bar: "bg-violet-500", border: "border-violet-300", banner: "border-violet-300 bg-violet-50 text-violet-800", badge: "bg-violet-100 text-violet-800" },
  { bar: "bg-cyan-500", border: "border-cyan-300", banner: "border-cyan-300 bg-cyan-50 text-cyan-800", badge: "bg-cyan-100 text-cyan-800" },
] as const;

type ReferenceGroupColor = typeof REFERENCE_GROUP_COLORS[number];
type ReferenceGroupVisual = { label: string; color: ReferenceGroupColor; totalItems: number; blockCount: number };
type DragState =
  | { type: "item"; id: string }
  | { type: "block"; referenceKey: string; startIndex: number };

function Page() {
  const [questions, setQuestions] = useState<DocumentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [config, setConfig] = useState({
    titulo: "Avaliação",
    instituicao: "",
    disciplina: "",
    professor: "",
    turma: "",
    data: new Date().toLocaleDateString("pt-BR"),
    instrucoes: "Leia com atenção todas as questões. Marque uma única alternativa por questão.",
    fontSize: 12,
    incluirGabarito: false,
    gabaritoSeparado: false,
    espacamentoQuestoes: 240,
    modeloPas: false,
    modeloEnem: false,
    enemSubtitulo: "Simulado de Ciências da Natureza",
    enemCaderno: "2º DIA | CADERNO 1",
  });

  useEffect(() => {
    (async () => {
      const ids = loadSelectedQuestionIds();
      if (ids.length === 0) { setLoading(false); return; }
      try {
        const data = await fetchDocumentQuestions(ids);
        const map = new Map(data.map((d) => [d.id, d]));
        const ordered = ids.map((i) => map.get(i)).filter((x): x is DocumentQuestion => !!x);
        setQuestions(ordered);
        saveSelectedQuestionIds(ordered.map((x) => x.id));
      } catch (e) {
        console.error(e);
        toast.error("Falha ao carregar as questões selecionadas.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const referenceGroupVisuals = useMemo(() => buildReferenceGroupVisuals(questions), [questions]);
  const splitReferenceGroups = useMemo(
    () => Array.from(referenceGroupVisuals.values()).filter((group) => group.totalItems > 1 && group.blockCount > 1),
    [referenceGroupVisuals],
  );

  const updateOrder = (next: DocumentQuestion[], showSplitAlert = true) => {
    setQuestions(next);
    saveSelectedQuestionIds(next.map((x) => x.id));
    if (showSplitAlert) warnAboutSplitReferences(next);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    updateOrder(next);
  };

  const handleDropAt = (targetIndex: number) => {
    if (!dragState) return;
    const next = dragState.type === "item"
      ? moveQuestionToIndex(questions, dragState.id, targetIndex)
      : moveReferenceBlockToIndex(questions, dragState.referenceKey, dragState.startIndex, targetIndex);
    if (next && next !== questions) updateOrder(next);
    setDragState(null);
    setDragOverIndex(null);
  };

  const remove = (id: string) => {
    const next = questions.filter((q) => q.id !== id);
    updateOrder(next, false);
  };

  const onGenerate = async () => {
    if (questions.length === 0) { toast.error("Selecione ao menos uma questão."); return; }

    if (config.modeloPas) {
      const invalid = questions.filter((q) => !isPasProof(q.prova));
      if (invalid.length > 0) {
        toast.error(`Modelo PAS é exclusivo para questões PAS. Remova ${invalid.length} questão(ões) de outra prova.`);
        console.warn("Questões incompatíveis com Modelo PAS:", invalid.map((q) => ({ id: q.id, prova: q.prova, ano: q.ano, instituicao: q.instituicao })));
        return;
      }
    }

    if (config.modeloEnem) {
      const invalid = questions.filter((q) => !isEnemQuestion(q));
      if (invalid.length > 0) {
        toast.error(`Modelo ENEM é exclusivo para questões ENEM. Remova ${invalid.length} questão(ões) de outra prova.`);
        console.warn("Questões incompatíveis com Modelo ENEM:", invalid.map((q) => ({ id: q.id, prova: q.prova, ano: q.ano, instituicao: q.instituicao })));
        return;
      }
    }

    if (config.incluirGabarito) {
      const semResp = questions.filter((q) => !q.resposta).length;
      if (semResp > 0 && !confirm(`${semResp} questão(ões) não têm resposta cadastrada. Gerar gabarito assim mesmo?`)) return;
    }

    setGenerating(true);
    try {
      const result = config.modeloPas
        ? await generatePasDocx({ data: { questions, config } })
        : config.modeloEnem
          ? await generateEnemDocx({ data: { questions, config } })
          : await generateDocx({ data: { questions, config } });
      const suffix = config.modeloPas ? "-modelo-pas" : config.modeloEnem ? "-modelo-enem" : "";
      downloadDocx(result.docxBase64, `${config.titulo || "documento"}${suffix}.docx`);
      if (result.gabaritoBase64) downloadDocx(result.gabaritoBase64, `${config.titulo || "documento"}-gabarito.docx`);
      toast.success("Documento gerado!");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o documento.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <AppLayout><div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin" /></div></AppLayout>;

  if (questions.length === 0) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <FileText className="size-12 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-xl font-bold">Nenhuma questão selecionada</h1>
          <p className="text-muted-foreground mt-1">Vá para "Questões salvas" e marque as questões que quer incluir no documento.</p>
          <Button asChild className="mt-4"><Link to="/questoes">Ver questões salvas</Link></Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/questoes"><ArrowLeft className="size-4" /> Voltar</Link></Button>
            <h1 className="text-2xl font-bold">Criar documento</h1>
          </div>
          <Button onClick={onGenerate} disabled={generating} className="gap-2" size="lg">
            {generating ? <><Loader2 className="size-4 animate-spin" /> Gerando…</> : <><Download className="size-4" /> Gerar Word (.docx)</>}
          </Button>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-4">
          <div className="space-y-3">
            <div className="rounded-xl border bg-card p-4">
              <h2 className="font-semibold mb-2">Questões ({questions.length})</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Arraste o ícone da questão para reordenar itens individuais. Arraste a faixa da referência para mover o bloco inteiro. Solte sobre um card para posicionar antes dele, ou no fim da lista para mandar para o final.
              </p>

              {splitReferenceGroups.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <strong>Atenção:</strong> há {splitReferenceGroups.length} grupo{splitReferenceGroups.length > 1 ? "s" : ""} de mesma referência separado{splitReferenceGroups.length > 1 ? "s" : ""}. Na exportação, o texto-base será repetido quando a referência aparecer novamente.
                </div>
              )}

              <DropMarker active={dragOverIndex === 0} onDrop={() => handleDropAt(0)} onDragOver={() => setDragOverIndex(0)} onDragLeave={() => setDragOverIndex(null)} />
              <div className="space-y-2">
                {questions.map((q, i) => {
                  const referenceKey = getDocumentReferenceKey(q);
                  const previousReferenceKey = i > 0 ? getDocumentReferenceKey(questions[i - 1]) : null;
                  const nextReferenceKey = i + 1 < questions.length ? getDocumentReferenceKey(questions[i + 1]) : null;
                  const startsReferenceBlock = Boolean(referenceKey && referenceKey !== previousReferenceKey);
                  const endsReferenceBlock = Boolean(referenceKey && referenceKey !== nextReferenceKey);
                  const referenceBlockSize = referenceKey ? countReferenceBlockSize(questions, i) : 0;
                  const groupVisual = referenceKey ? referenceGroupVisuals.get(referenceKey) : undefined;
                  const showGroupVisual = Boolean(groupVisual && groupVisual.totalItems > 1);
                  const splitGroup = Boolean(groupVisual && groupVisual.blockCount > 1);
                  const groupTitle = groupVisual
                    ? `${groupVisual.label}: este item pertence à mesma referência de ${groupVisual.totalItems} itens.${splitGroup ? " A referência aparece em blocos separados nesta ordem." : " Itens juntos usarão a referência uma única vez no Word."}`
                    : undefined;
                  return (
                    <div key={q.id} className="space-y-2">
                      {startsReferenceBlock && groupVisual && (
                        <div
                          draggable
                          onDragStart={(event) => {
                            if (!referenceKey) return;
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", referenceKey);
                            setDragState({ type: "block", referenceKey, startIndex: i });
                          }}
                          onDragEnd={() => { setDragState(null); setDragOverIndex(null); }}
                          className={`cursor-grab rounded-lg border px-3 py-2 text-xs font-medium active:cursor-grabbing ${showGroupVisual ? groupVisual.color.banner : "border-primary/30 bg-primary/5 text-primary"}`}
                          title="Arraste esta faixa para mover o bloco inteiro da referência"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-2">
                              <Move className="size-3.5" />
                              {showGroupVisual && <span className={`size-2.5 rounded-full ${groupVisual.color.bar}`} />}
                              {showGroupVisual ? groupVisual.label : "Referência"}: {referenceBlockSize} item{referenceBlockSize === 1 ? "" : "s"} neste bloco
                            </span>
                            <span className="inline-flex items-center gap-2">
                              <span>arraste para mover o bloco</span>
                              {splitGroup && <span className="inline-flex items-center gap-1"><Link2 className="size-3" /> também aparece em outro bloco</span>}
                            </span>
                          </div>
                        </div>
                      )}
                      <div
                        onDragOver={(event) => { event.preventDefault(); setDragOverIndex(i); }}
                        onDrop={(event) => { event.preventDefault(); handleDropAt(i); }}
                        onDragLeave={() => setDragOverIndex(null)}
                        className={`relative flex gap-2 items-start overflow-hidden rounded-lg border bg-background p-3 transition-all ${dragOverIndex === i ? "ring-2 ring-primary/60" : ""} ${showGroupVisual && groupVisual ? groupVisual.color.border : referenceKey ? "border-primary/30" : ""}`}
                        title={groupTitle}
                      >
                        {showGroupVisual && groupVisual && (
                          <div className="absolute inset-y-0 left-0 flex w-4 justify-center">
                            <div className={`w-1.5 ${groupVisual.color.bar} ${startsReferenceBlock ? "rounded-t-full" : ""} ${endsReferenceBlock ? "rounded-b-full" : ""}`} />
                          </div>
                        )}
                        <div className={`flex flex-col ${showGroupVisual ? "ml-3" : ""}`}>
                          <button onClick={() => move(i, -1)} disabled={i === 0} className="text-xs px-1 disabled:opacity-30">▲</button>
                          <div
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", q.id);
                              setDragState({ type: "item", id: q.id });
                            }}
                            onDragEnd={() => { setDragState(null); setDragOverIndex(null); }}
                            className="rounded p-1 text-muted-foreground cursor-grab active:cursor-grabbing hover:bg-muted"
                            title="Arraste para mover este item individual"
                          >
                            <GripVertical className="size-4" />
                          </div>
                          <button onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="text-xs px-1 disabled:opacity-30">▼</button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-bold text-sm">Questão {i + 1}.</span>
                            {q.fonte && <span className="text-xs text-muted-foreground italic">({q.fonte})</span>}
                            {config.modeloPas && !isPasProof(q.prova) && <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">fora do PAS</span>}
                            {config.modeloEnem && !isEnemQuestion(q) && <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">fora do ENEM</span>}
                            {q.prova && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{q.prova}</span>}
                            {showGroupVisual && groupVisual ? (
                              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${groupVisual.color.badge}`}>
                                <Link2 className="size-3" /> {groupVisual.label}{splitGroup ? " separado" : ""}
                              </span>
                            ) : referenceKey ? (
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">com referência</span>
                            ) : null}
                            {referenceKey && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{referenceBlockSize > 1 ? `bloco de ${referenceBlockSize}` : "bloco único"}</span>}
                          </div>
                          <div className="text-sm line-clamp-2 [&_p]:m-0 [&_p]:inline"><RichText text={q.enunciado ?? ""} /></div>
                          {(q.alternativas ?? []).length > 0 && <p className="text-xs text-muted-foreground mt-1">{(q.alternativas ?? []).length} alternativas{q.resposta ? ` · gabarito: ${q.resposta}` : ""}</p>}
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => remove(q.id)}><X className="size-4" /></Button>
                      </div>
                      <DropMarker active={dragOverIndex === i + 1} onDrop={() => handleDropAt(i + 1)} onDragOver={() => setDragOverIndex(i + 1)} onDragLeave={() => setDragOverIndex(null)} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="rounded-xl border bg-card p-4 space-y-3 h-fit lg:sticky lg:top-20">
            <h2 className="font-semibold">Configuração</h2>
            <div><Label>Título</Label><Input value={config.titulo} onChange={(e) => setConfig({ ...config, titulo: e.target.value })} /></div>
            <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={config.modeloPas} onCheckedChange={(v) => setConfig({ ...config, modeloPas: !!v, modeloEnem: false, fontSize: !!v ? 10 : config.fontSize })} />
                <span className="text-sm leading-snug">
                  <strong>Modelo PAS</strong><br />
                  <span className="text-xs text-muted-foreground">Formatação oficial em duas colunas. Aceita apenas PAS, PAS 1, PAS 2 ou PAS 3.</span>
                </span>
              </label>
            </div>
            <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={config.modeloEnem} onCheckedChange={(v) => setConfig({ ...config, modeloEnem: !!v, modeloPas: false, fontSize: !!v ? 10 : config.fontSize })} />
                <span className="text-sm leading-snug">
                  <strong>Modelo ENEM</strong><br />
                  <span className="text-xs text-muted-foreground">Formatação interna inspirada no ENEM, em duas colunas. Aceita apenas questões com prova ENEM.</span>
                </span>
              </label>
              {config.modeloEnem && (
                <div className="grid gap-2 pt-2">
                  <div>
                    <Label>Identificação menor</Label>
                    <Input value={config.enemSubtitulo} onChange={(e) => setConfig({ ...config, enemSubtitulo: e.target.value })} />
                  </div>
                  <div>
                    <Label>Caderno / área</Label>
                    <Input value={config.enemCaderno} onChange={(e) => setConfig({ ...config, enemCaderno: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
            <div><Label>Instituição</Label><Input value={config.instituicao} onChange={(e) => setConfig({ ...config, instituicao: e.target.value })} disabled={config.modeloPas || config.modeloEnem} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Disciplina</Label><Input value={config.disciplina} onChange={(e) => setConfig({ ...config, disciplina: e.target.value })} disabled={config.modeloPas || config.modeloEnem} /></div>
              <div><Label>Professor</Label><Input value={config.professor} onChange={(e) => setConfig({ ...config, professor: e.target.value })} disabled={config.modeloPas || config.modeloEnem} /></div>
              <div><Label>Turma</Label><Input value={config.turma} onChange={(e) => setConfig({ ...config, turma: e.target.value })} disabled={config.modeloPas || config.modeloEnem} /></div>
              <div><Label>Data</Label><Input value={config.data} onChange={(e) => setConfig({ ...config, data: e.target.value })} disabled={config.modeloPas || config.modeloEnem} /></div>
            </div>
            <div><Label>Instruções</Label><Textarea rows={3} value={config.instrucoes} onChange={(e) => setConfig({ ...config, instrucoes: e.target.value })} disabled={config.modeloPas || config.modeloEnem} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Fonte (pt)</Label>
                <Input type="number" min={9} max={18} value={config.fontSize} onChange={(e) => setConfig({ ...config, fontSize: +e.target.value || 12 })} disabled={config.modeloPas || config.modeloEnem} />
              </div>
              <div>
                <Label>Espaço entre questões</Label>
                <Input type="number" min={120} max={600} step={40} value={config.espacamentoQuestoes} onChange={(e) => setConfig({ ...config, espacamentoQuestoes: +e.target.value || 240 })} disabled={config.modeloPas || config.modeloEnem} />
              </div>
            </div>
            <div className="space-y-2 border-t pt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={config.incluirGabarito} onCheckedChange={(v) => setConfig({ ...config, incluirGabarito: !!v })} />
                <span className="text-sm">Incluir gabarito</span>
              </label>
              {config.incluirGabarito && !config.modeloPas && !config.modeloEnem && (
                <label className="flex items-center gap-2 cursor-pointer pl-6">
                  <Checkbox checked={config.gabaritoSeparado} onCheckedChange={(v) => setConfig({ ...config, gabaritoSeparado: !!v })} />
                  <span className="text-sm">Em arquivo separado</span>
                </label>
              )}
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}

function DropMarker({ active, onDrop, onDragOver, onDragLeave }: { active: boolean; onDrop: () => void; onDragOver: () => void; onDragLeave: () => void }) {
  return (
    <div
      onDragOver={(event) => { event.preventDefault(); onDragOver(); }}
      onDrop={(event) => { event.preventDefault(); onDrop(); }}
      onDragLeave={onDragLeave}
      className={`h-3 rounded-md transition-colors ${active ? "bg-primary/30 ring-2 ring-primary/40" : "bg-transparent"}`}
      aria-hidden="true"
    />
  );
}

function downloadDocx(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

type DocumentReferenceLike = Pick<DocumentQuestion, "grupo_id" | "referencia_texto" | "referencia_texto_apos" | "referencia_fonte" | "referencia_imagem" | "referencia_imagem_layout" | "referencia_imagens_extra">;

function hasDocumentReference(question: DocumentReferenceLike) {
  return Boolean(question.referencia_texto?.trim() || question.referencia_texto_apos?.trim() || question.referencia_imagem || question.referencia_imagens_extra.length > 0);
}

function getDocumentReferenceKey(question: DocumentReferenceLike) {
  if (!hasDocumentReference(question)) return null;
  const groupId = question.grupo_id?.trim();
  if (groupId) return `grupo:${groupId}`;
  return `ref:${documentReferenceFingerprint(question)}`;
}

function documentReferenceFingerprint(question: DocumentReferenceLike) {
  const image = question.referencia_imagem
    ? `${question.referencia_imagem.length}:${question.referencia_imagem.slice(0, 64)}:${question.referencia_imagem.slice(-64)}`
    : "";
  const extraImages = question.referencia_imagens_extra
    .map((item) => `${item.url.length}:${item.url.slice(0, 64)}:${item.url.slice(-64)}:${JSON.stringify(item.layout)}`)
    .join(",");
  return [question.referencia_texto?.trim() ?? "", question.referencia_texto_apos?.trim() ?? "", question.referencia_fonte?.trim() ?? "", image, extraImages].join("|");
}

function countReferenceBlockSize(questions: DocumentQuestion[], index: number) {
  const key = getDocumentReferenceKey(questions[index]);
  if (!key) return 0;
  let start = index;
  while (start > 0 && getDocumentReferenceKey(questions[start - 1]) === key) start--;
  let end = index;
  while (end + 1 < questions.length && getDocumentReferenceKey(questions[end + 1]) === key) end++;
  return end - start + 1;
}

function getReferenceBlockRange(questions: DocumentQuestion[], referenceKey: string, startIndex: number) {
  if (getDocumentReferenceKey(questions[startIndex]) !== referenceKey) {
    const fallbackIndex = questions.findIndex((question) => getDocumentReferenceKey(question) === referenceKey);
    startIndex = fallbackIndex === -1 ? startIndex : fallbackIndex;
  }
  let start = startIndex;
  while (start > 0 && getDocumentReferenceKey(questions[start - 1]) === referenceKey) start--;
  let end = startIndex;
  while (end + 1 < questions.length && getDocumentReferenceKey(questions[end + 1]) === referenceKey) end++;
  return { start, end };
}

function moveQuestionToIndex(questions: DocumentQuestion[], questionId: string, targetIndex: number) {
  const fromIndex = questions.findIndex((question) => question.id === questionId);
  if (fromIndex === -1) return null;
  const next = [...questions];
  const [moved] = next.splice(fromIndex, 1);
  let insertIndex = Math.max(0, Math.min(targetIndex, questions.length));
  if (fromIndex < insertIndex) insertIndex -= 1;
  if (fromIndex === insertIndex) return null;
  next.splice(insertIndex, 0, moved);
  return next;
}

function moveReferenceBlockToIndex(questions: DocumentQuestion[], referenceKey: string, startIndex: number, targetIndex: number) {
  const { start, end } = getReferenceBlockRange(questions, referenceKey, startIndex);
  if (start < 0 || end < start) return null;
  if (targetIndex >= start && targetIndex <= end + 1) return null;

  const next = [...questions];
  const block = next.splice(start, end - start + 1);
  let insertIndex = Math.max(0, Math.min(targetIndex, questions.length));
  if (start < insertIndex) insertIndex -= block.length;
  next.splice(insertIndex, 0, ...block);
  return next;
}

function warnAboutSplitReferences(questions: DocumentQuestion[]) {
  const split = Array.from(buildReferenceGroupVisuals(questions).values()).filter((group) => group.totalItems > 1 && group.blockCount > 1);
  if (split.length === 0) return;
  toast.warning("Há itens da mesma referência separados. No Word, a referência será repetida quando esse grupo aparecer novamente.");
}

function buildReferenceGroupVisuals(questions: DocumentQuestion[]) {
  const map = new Map<string, ReferenceGroupVisual>();
  let previousKey: string | null = null;

  questions.forEach((question) => {
    const key = getDocumentReferenceKey(question);
    if (!key) { previousKey = null; return; }
    let visual = map.get(key);
    if (!visual) {
      const index = map.size;
      visual = { label: `Ref ${referenceLabel(index)}`, color: REFERENCE_GROUP_COLORS[index % REFERENCE_GROUP_COLORS.length], totalItems: 0, blockCount: 0 };
      map.set(key, visual);
    }
    visual.totalItems += 1;
    if (key !== previousKey) visual.blockCount += 1;
    previousKey = key;
  });

  return map;
}

function referenceLabel(index: number) {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

function isPasProof(value: string | null | undefined) {
  const normalized = normalizeProofText(value);
  return normalized === "PAS" || normalized === "PAS 1" || normalized === "PAS 2" || normalized === "PAS 3" || normalized === "PAS1" || normalized === "PAS2" || normalized === "PAS3";
}

function isEnemQuestion(question: Pick<DocumentQuestion, "prova" | "instituicao" | "fonte" | "referencia_fonte">) {
  return [question.prova, question.instituicao, question.fonte, question.referencia_fonte].some(isEnemProof);
}

function isEnemProof(value: string | null | undefined) {
  const normalized = normalizeProofText(value);
  return normalized.includes("ENEM") || normalized.includes("EXAME NACIONAL DO ENSINO MEDIO");
}

function normalizeProofText(value: unknown) {
  return (typeof value === "string" ? value : value == null ? "" : String(value))
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}
