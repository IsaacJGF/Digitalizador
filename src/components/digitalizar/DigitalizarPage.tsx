import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, ImageIcon, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/AppLayout";
import { digitizeQuestion } from "@/lib/digitize.functions";
import { saveDraft, type DraftDigitization, type DraftQuestion } from "@/lib/draft-store";
import { formatFileSize, isPdfFile, pageRange, readPdfDocumentSummary, renderPdfPagesToImageDataUrl, type PdfDocumentSummary, type PdfRenderedImage } from "@/lib/pdf-reader";
import { assertImageCanvasSize, MAX_DIGITIZE_IMAGE_DATA_URL_LENGTH, MAX_IMAGE_CANVAS_PIXELS } from "@/lib/image-limits";
import { toast } from "sonner";
import { ImageUploadPanel } from "./ImageUploadPanel";
import { PdfUploadPanel } from "./PdfUploadPanel";
import { PdfQueuePanel } from "./PdfQueuePanel";
import { clearPdfQueueStorage, isSamePdfFile, loadPdfFileMeta, loadPdfQueue, persistPdfFileMeta, persistPdfQueue, type PdfFileMeta } from "./storage";
import {
  MAX_FILES,
  MAX_PDF_PAGES,
  MAX_PDF_RENDER_PAGES,
  MAX_PDF_SIZE,
  MAX_SIZE,
  PDF_RENDER_MAX_WIDTH,
  PDF_RENDER_SCALE,
  type PdfQueueJob,
  type PdfQueueResult,
  type SelectedImage,
  type UploadMode,
} from "./types";
import {
  chunkPages,
  errorMessage,
  estimateDataUrlBytes,
  fileToDataURL,
  formatPages,
  isPreparedImageWithinLimit,
  loadImage,
  mergeQueueJobsIntoDraft,
  pageInputToNumber,
  samePages,
  sortedPages,
} from "./utils";

export function DigitalizarPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<UploadMode>("image");
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PdfDocumentSummary | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDragOver, setPdfDragOver] = useState(false);
  const [selectedPdfPages, setSelectedPdfPages] = useState<Set<number>>(new Set());
  const [rangeStart, setRangeStart] = useState("1");
  const [rangeEnd, setRangeEnd] = useState("1");
  const [pdfRendering, setPdfRendering] = useState(false);
  const [pdfDigitizing, setPdfDigitizing] = useState(false);
  const [renderedPdfImage, setRenderedPdfImage] = useState<PdfRenderedImage | null>(null);
  const [pdfQueue, setPdfQueue] = useState<PdfQueueJob[]>([]);
  const [pdfQueueReady, setPdfQueueReady] = useState(false);
  const [savedPdfMeta, setSavedPdfMeta] = useState<PdfFileMeta | null>(null);
  const [activeQueueJobId, setActiveQueueJobId] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const activeQueueJobRef = useRef<string | null>(null);
  const imageObjectUrlsRef = useRef(new Set<string>());
  const pdfFileReadRequestIdRef = useRef(0);
  const queuePersistenceChainRef = useRef(Promise.resolve());
  const queueStorageWarningShownRef = useRef(false);
  const queuePersistenceInitializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setSavedPdfMeta(loadPdfFileMeta());
    void loadPdfQueue().then((savedQueue) => {
      if (cancelled) return;
      setPdfQueue(savedQueue);
      if (savedQueue.length > 0) setMode("pdf");
      setPdfQueueReady(true);
    }).catch((error) => {
      console.warn("Não foi possível recuperar a fila de PDF:", error);
      if (!cancelled) setPdfQueueReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!pdfQueueReady) return;
    if (!queuePersistenceInitializedRef.current) {
      queuePersistenceInitializedRef.current = true;
      return;
    }
    let cancelled = false;
    const queueSnapshot = pdfQueue;
    queuePersistenceChainRef.current = queuePersistenceChainRef.current
      .catch(() => undefined)
      .then(async () => {
        const result = await persistPdfQueue(queueSnapshot);
        if (cancelled) return;
        if (!result.ok) {
          toast.error("Não foi possível guardar a fila do PDF. Mantenha esta página aberta ou reduza a quantidade de páginas.");
        } else if (result.compacted && !queueStorageWarningShownRef.current) {
          queueStorageWarningShownRef.current = true;
          toast.warning("A fila foi mantida, mas as imagens de origem foram removidas para caber no armazenamento. O texto continua disponível; para recuperar a imagem, limpe a fila e processe novamente as mesmas páginas.");
        }
      });
    return () => { cancelled = true; };
  }, [pdfQueue, pdfQueueReady]);

  useEffect(() => () => {
    imageObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    imageObjectUrlsRef.current.clear();
  }, []);

  const setAndStorePdfQueue = (updater: PdfQueueJob[] | ((current: PdfQueueJob[]) => PdfQueueJob[])) => {
    setPdfQueue((current) => {
      return typeof updater === "function" ? updater(current) : updater;
    });
  };

  const revokeImagePreview = useCallback((url: string) => {
    if (!imageObjectUrlsRef.current.delete(url)) return;
    URL.revokeObjectURL(url);
  }, []);

  const saveDraftAndReview = (draft: DraftDigitization | DraftQuestion, successMessage?: string) => {
    const saved = saveDraft(draft);
    if (!saved) {
      toast.error("Não foi possível preparar a revisão. Tente reduzir o lote ou revisar menos páginas por vez.");
      return false;
    }
    if (successMessage) toast.success(successMessage);
    navigate({ to: "/revisar" });
    return true;
  };

  const handleFiles = useCallback((list: FileList | File[] | undefined | null) => {
    const incoming = Array.from(list ?? []);
    if (incoming.length === 0) return;

    const valid: SelectedImage[] = [];
    for (const f of incoming) {
      if (!/^image\/(jpe?g|png|webp)$/i.test(f.type)) {
        toast.error("Use apenas JPG, JPEG, PNG ou WEBP.");
        continue;
      }
      if (f.size > MAX_SIZE) {
        toast.error(`Imagem acima de 10MB: ${f.name}`);
        continue;
      }
      const preview = URL.createObjectURL(f);
      imageObjectUrlsRef.current.add(preview);
      valid.push({ file: f, preview });
    }

    if (valid.length === 0) return;
    setImages((current) => {
      const room = MAX_FILES - current.length;
      if (room <= 0) {
        valid.forEach((img) => revokeImagePreview(img.preview));
        toast.error(`Você pode enviar no máximo ${MAX_FILES} imagens por digitalização.`);
        return current;
      }
      const accepted = valid.slice(0, room);
      valid.slice(room).forEach((img) => revokeImagePreview(img.preview));
      if (valid.length > room) toast.warning(`Adicionei apenas ${room} imagem(ns), respeitando o limite de ${MAX_FILES}.`);
      return [...current, ...accepted];
    });
    setRotation(0);
  }, [revokeImagePreview]);

  const handlePdfFile = useCallback(async (list: FileList | File[] | undefined | null) => {
    const file = Array.from(list ?? [])[0];
    if (!file) return;
    const requestId = ++pdfFileReadRequestIdRef.current;
    if (!pdfQueueReady) {
      toast.info("Aguarde a recuperação da fila anterior antes de enviar um PDF.");
      setPdfLoading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }

    if (!isPdfFile(file)) {
      toast.error("Use apenas arquivo PDF.");
      setPdfLoading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_PDF_SIZE) {
      toast.error(`PDF acima de ${formatFileSize(MAX_PDF_SIZE)}. Para começar, divida o arquivo em partes menores.`);
      setPdfLoading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }

    setPdfLoading(true);
    setPdfInfo(null);
    setPdfFile(null);
    setSelectedPdfPages(new Set());
    setRenderedPdfImage(null);
    try {
      const summary = await readPdfDocumentSummary(file, { maxPages: MAX_PDF_PAGES });
      if (requestId !== pdfFileReadRequestIdRef.current) return;
      const meta: PdfFileMeta = { fileName: summary.fileName, fileSize: summary.fileSize, pageCount: summary.pageCount };
      const matchesSaved = isSamePdfFile(savedPdfMeta, meta);

      // Só apaga a fila se for um PDF diferente. Reenviar o mesmo arquivo continua a fila.
      if (!matchesSaved) {
        setPdfQueue([]);
        clearPdfQueueStorage();
      }
      persistPdfFileMeta(meta);
      setSavedPdfMeta(meta);
      setPdfFile(file);
      setPdfInfo(summary);
      setSelectedPdfPages(new Set([1]));
      setRangeStart("1");
      setRangeEnd("1");
      if (matchesSaved && pdfQueue.length > 0) {
        toast.success(`PDF reconectado. Fila com ${pdfQueue.length} lote(s) mantida.`);
      } else if (summary.isOverPageLimit) {
        toast.warning(`PDF lido com ${summary.pageCount} páginas. Neste fluxo, vamos preparar até ${MAX_PDF_PAGES} páginas para seleção.`);
      } else {
        toast.success(`PDF lido: ${summary.pageCount} página${summary.pageCount > 1 ? "s" : ""}.`);
      }
    } catch (error) {
      if (requestId !== pdfFileReadRequestIdRef.current) return;
      console.error(error);
      toast.error("Não foi possível ler o PDF. Verifique se o arquivo não está corrompido ou protegido.");
    } finally {
      if (requestId === pdfFileReadRequestIdRef.current) {
        setPdfLoading(false);
        if (pdfInputRef.current) pdfInputRef.current.value = "";
      }
    }
  }, [pdfQueue.length, pdfQueueReady, savedPdfMeta]);

  const removeImage = (index: number) => {
    setImages((current) => {
      const next = [...current];
      const [removed] = next.splice(index, 1);
      if (removed) revokeImagePreview(removed.preview);
      return next;
    });
  };

  const resetImages = () => {
    images.forEach((img) => revokeImagePreview(img.preview));
    setImages([]);
    setRotation(0);
  };

  const resetPdf = () => {
    pdfFileReadRequestIdRef.current += 1;
    setPdfLoading(false);
    setPdfFile(null);
    setPdfInfo(null);
    setSelectedPdfPages(new Set());
    setRangeStart("1");
    setRangeEnd("1");
    setRenderedPdfImage(null);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  };

  const togglePdfPage = (page: number) => {
    setRenderedPdfImage(null);
    setSelectedPdfPages((current) => {
      const next = new Set(current);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  };

  const selectPdfRange = () => {
    if (!pdfInfo) return;
    const start = pageInputToNumber(rangeStart, 1);
    const end = pageInputToNumber(rangeEnd, start);
    const pages = pageRange(start, end, pdfInfo.readablePageCount);
    setSelectedPdfPages(new Set(pages));
    setRenderedPdfImage(null);
    toast.success(`${pages.length} página${pages.length > 1 ? "s" : ""} selecionada${pages.length > 1 ? "s" : ""}.`);
  };

  const selectAllPreparedPdfPages = () => {
    if (!pdfInfo) return;
    const pages = pageRange(1, pdfInfo.readablePageCount, pdfInfo.readablePageCount);
    setSelectedPdfPages(new Set(pages));
    setRangeStart("1");
    setRangeEnd(String(pdfInfo.readablePageCount));
    setRenderedPdfImage(null);
    toast.success(`${pages.length} páginas preparadas selecionadas.`);
  };

  const selectFirstPdfPages = () => {
    if (!pdfInfo) return;
    const pages = pageRange(1, Math.min(MAX_PDF_RENDER_PAGES, pdfInfo.readablePageCount), pdfInfo.readablePageCount);
    setSelectedPdfPages(new Set(pages));
    setRangeStart("1");
    setRangeEnd(String(pages[pages.length - 1] ?? 1));
    setRenderedPdfImage(null);
  };

  const clearPdfSelection = () => {
    setSelectedPdfPages(new Set());
    setRenderedPdfImage(null);
  };

  const renderSelectedPdfPages = async (showSuccessToast = true): Promise<PdfRenderedImage | null> => {
    if (!pdfFile || !pdfInfo) return null;
    const pages = sortedPages(selectedPdfPages).filter((page) => page <= pdfInfo.readablePageCount);
    if (pages.length === 0) {
      toast.info("Selecione ao menos uma página do PDF.");
      return null;
    }
    if (pages.length > MAX_PDF_RENDER_PAGES) {
      toast.error(`Use no máximo ${MAX_PDF_RENDER_PAGES} páginas por lote pequeno.`);
      return null;
    }

    setPdfRendering(true);
    setRenderedPdfImage(null);
    try {
      const rendered = await renderPdfPagesToImageDataUrl(pdfFile, pages, {
        scale: PDF_RENDER_SCALE,
        maxPageWidth: PDF_RENDER_MAX_WIDTH,
        imageQuality: 0.9,
      });
      setRenderedPdfImage(rendered);
      if (showSuccessToast) toast.success("Imagem do PDF gerada com sucesso.");
      return rendered;
    } catch (error) {
      console.error(error);
      toast.error(errorMessage(error));
      return null;
    } finally {
      setPdfRendering(false);
    }
  };

  const onDigitize = async () => {
    if (images.length === 0) return;
    setLoading(true);
    try {
      const dataUrl = images.length === 1
        ? await fileToDataURL(images[0].file, rotation)
        : await filesToSequentialDataURL(images, rotation);
      if (!isPreparedImageWithinLimit(dataUrl, MAX_DIGITIZE_IMAGE_DATA_URL_LENGTH)) {
        toast.error("A imagem preparada ficou muito grande para enviar. Reduza o número de páginas ou divida as imagens em partes menores.");
        return;
      }
      const result = await digitizeQuestion({ data: { imageDataUrl: dataUrl } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      saveDraftAndReview({ ...result.data, imageDataUrl: dataUrl }, "Questão digitalizada!");
    } catch (e) {
      console.error(e);
      showDigitizeError(e);
    } finally {
      setLoading(false);
    }
  };

  const onDigitizePdf = async () => {
    if (!pdfFile || !pdfInfo) return;
    const pages = sortedPages(selectedPdfPages).filter((page) => page <= pdfInfo.readablePageCount);
    if (pages.length === 0) {
      toast.info("Selecione ao menos uma página do PDF.");
      return;
    }
    if (pages.length > MAX_PDF_RENDER_PAGES) {
      toast.error(`Digitalize no máximo ${MAX_PDF_RENDER_PAGES} páginas por lote pequeno ou crie uma fila de lotes.`);
      return;
    }

    setPdfDigitizing(true);
    try {
      const rendered = renderedPdfImage && samePages(renderedPdfImage.pages, pages)
        ? renderedPdfImage
        : await renderSelectedPdfPages(false);
      if (!rendered) return;
      if (!isPreparedImageWithinLimit(rendered.imageDataUrl, MAX_DIGITIZE_IMAGE_DATA_URL_LENGTH)) {
        toast.error("A imagem preparada ficou muito grande para enviar. Reduza o número de páginas e tente novamente.");
        return;
      }

      const result = await digitizeQuestion({ data: { imageDataUrl: rendered.imageDataUrl } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      saveDraftAndReview({
        ...result.data,
        imageDataUrl: rendered.imageDataUrl,
      }, `PDF digitalizado: página${pages.length > 1 ? "s" : ""} ${pages.join(", ")}.`);
    } catch (error) {
      console.error(error);
      showDigitizeError(error);
    } finally {
      setPdfDigitizing(false);
    }
  };

  const createPdfQueueFromSelection = () => {
    if (!pdfQueueReady) {
      toast.info("Aguarde a recuperação da fila anterior antes de criar outra.");
      return;
    }
    if (!pdfInfo) return;
    const pages = sortedPages(selectedPdfPages).filter((page) => page <= pdfInfo.readablePageCount);
    if (pages.length === 0) {
      toast.info("Selecione páginas para criar a fila.");
      return;
    }

    const batches = chunkPages(pages, MAX_PDF_RENDER_PAGES);
    const createdAt = Date.now();
    const jobs: PdfQueueJob[] = batches.map((batch, index) => ({ id: `${createdAt}-${index}`, pages: batch, status: "pending" }));
    setAndStorePdfQueue(jobs);
    toast.success(`Fila criada com ${jobs.length} lote${jobs.length > 1 ? "s" : ""}.`);
  };

  const clearPdfQueue = () => {
    setAndStorePdfQueue([]);
    clearPdfQueueStorage();
    setSavedPdfMeta(null);
    toast.success("Fila de PDF limpa.");
  };

  const processNextQueueJob = () => {
    if (!pdfQueueReady || activeQueueJobRef.current) return;
    const nextJob = pdfQueue.find((job) => job.status === "pending");
    if (!nextJob) {
      toast.info("Não há lotes pendentes na fila.");
      return;
    }
    void processQueueJob(nextJob.id);
  };

  const processQueueJob = async (jobId: string) => {
    if (!pdfQueueReady || activeQueueJobRef.current) return;
    if (!pdfFile) {
      toast.error("Envie novamente o PDF para continuar processando a fila.");
      return;
    }
    const job = pdfQueue.find((item) => item.id === jobId);
    if (!job || job.status === "processing") return;

    activeQueueJobRef.current = jobId;
    setActiveQueueJobId(jobId);
    setAndStorePdfQueue((current) => current.map((item) => item.id === jobId ? { ...item, status: "processing", error: undefined } : item));
    try {
      const rendered = await renderPdfPagesToImageDataUrl(pdfFile, job.pages, {
        scale: PDF_RENDER_SCALE,
        maxPageWidth: PDF_RENDER_MAX_WIDTH,
        imageQuality: 0.9,
      });
      setRenderedPdfImage(rendered);

      if (!isPreparedImageWithinLimit(rendered.imageDataUrl, MAX_DIGITIZE_IMAGE_DATA_URL_LENGTH)) {
        toast.error("A imagem preparada ficou muito grande para enviar. Divida o lote em menos páginas e tente novamente.");
        setAndStorePdfQueue((current) => current.map((item) => item.id === jobId
          ? { ...item, status: "error", error: "A imagem preparada excede o limite de envio. Divida o lote e tente novamente." }
          : item));
        return;
      }

      const result = await digitizeQuestion({ data: { imageDataUrl: rendered.imageDataUrl } });
      if (!result.ok) {
        setAndStorePdfQueue((current) => current.map((item) => item.id === jobId ? { ...item, status: "error", error: result.message } : item));
        toast.error(result.message);
        return;
      }

      const draft: DraftDigitization = { ...result.data, imageDataUrl: rendered.imageDataUrl };
      const queueResult: PdfQueueResult = {
        draft,
        imageSize: estimateDataUrlBytes(rendered.imageDataUrl),
        questionCount: draft.questoes.length,
        processedAt: new Date().toISOString(),
      };

      setAndStorePdfQueue((current) => current.map((item) => item.id === jobId ? { ...item, status: "done", error: undefined, result: queueResult } : item));
      toast.success(`Lote ${formatPages(job.pages)} digitalizado e guardado temporariamente.`);
    } catch (error) {
      console.error(error);
      setAndStorePdfQueue((current) => current.map((item) => item.id === jobId ? { ...item, status: "error", error: errorMessage(error) } : item));
      showDigitizeError(error);
    } finally {
      activeQueueJobRef.current = null;
      setActiveQueueJobId(null);
    }
  };

  const openQueueJobReview = (jobId: string) => {
    const job = pdfQueue.find((item) => item.id === jobId);
    if (!job?.result) {
      toast.info("Esse lote ainda não tem resultado para revisar.");
      return;
    }
    if (!saveDraftAndReview(job.result.draft)) return;
    markQueueJobsAsReviewed([jobId]);
  };

  const openMassQueueReview = () => {
    const doneJobs = pdfQueue.filter((job) => job.status === "done" && job.result);
    if (doneJobs.length === 0) {
      toast.info("Processe ao menos um lote antes de abrir a revisão em massa.");
      return;
    }
    const draft = mergeQueueJobsIntoDraft(doneJobs);
    if (!saveDraftAndReview(draft, `${draft.questoes.length} item${draft.questoes.length > 1 ? "s" : ""} enviado${draft.questoes.length > 1 ? "s" : ""} para revisão em massa.`)) return;
    markQueueJobsAsReviewed(doneJobs.map((job) => job.id));
  };

  const markQueueJobsAsReviewed = (ids: string[]) => {
    const now = new Date().toISOString();
    setAndStorePdfQueue((current) => current.map((job) => ids.includes(job.id) ? { ...job, reviewed: true, reviewedAt: now, error: job.error ? job.error : undefined } : job));
  };

  const selectedPageCount = selectedPdfPages.size;
  const pdfDoneCount = pdfQueue.filter((job) => job.status === "done").length;
  const pdfSteps = buildPdfSteps({
    hasFile: Boolean(pdfInfo),
    hasSelection: selectedPageCount > 0,
    hasQueue: pdfQueue.length > 0,
    hasDone: pdfDoneCount > 0,
    isBusy: pdfLoading || pdfRendering || pdfDigitizing || Boolean(activeQueueJobId),
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Digitalizar questão</h1>
          <p className="mt-1 text-muted-foreground">Escolha a origem, envie o arquivo, selecione as partes e mande para revisão.</p>
        </header>

        <section className="mb-5 rounded-xl border bg-card p-4">
          <div className="mb-3">
            <h2 className="font-semibold">Etapa 1 — Escolher origem</h2>
            <p className="text-sm text-muted-foreground">Use imagem para uma questão rápida ou PDF para provas maiores.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <ModeButton active={mode === "image"} icon={<ImageIcon className="size-4" />} title="Imagens" description="JPG, PNG ou WEBP em partes sequenciais." onClick={() => setMode("image")} />
            <ModeButton active={mode === "pdf"} icon={<FileText className="size-4" />} title="PDF" description="Selecione páginas, crie fila e revise em massa." onClick={() => setMode("pdf")} />
            <ModeButton
              active={false}
              icon={<PenLine className="size-4" />}
              title="Manual"
              description="Digite a questão do zero e adicione imagens por fora."
              onClick={() =>
                saveDraftAndReview(
                  {
                    referencia_texto: "",
                    referencia_fonte: "",
                    questoes: [{
                      numero: "",
                      enunciado: "",
                      alternativas: [],
                      tipo: "multipla_escolha",
                      resposta: "",
                      fonte: "",
                      tem_equacao: false,
                      tem_imagem: false,
                      baixa_confianca: [],
                    } as DraftQuestion],
                  },
                  "Questão manual criada. Preencha os campos.",
                )
              }
            />
          </div>
        </section>

        {mode === "image" ? (
          <ImageUploadPanel
            images={images}
            loading={loading}
            rotation={rotation}
            dragOver={dragOver}
            inputRef={imageInputRef}
            onDragOverChange={setDragOver}
            onFiles={handleFiles}
            onRemoveImage={removeImage}
            onReset={resetImages}
            onRotate={() => setRotation((r) => (r + 90) % 360)}
            onDigitize={onDigitize}
          />
        ) : (
          <>
            {!pdfFile && pdfQueue.length > 0 && (
              <div className="mb-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <div>
                    <p className="font-semibold">Fila guardada com {pdfQueue.length} lote(s){savedPdfMeta ? ` do arquivo "${savedPdfMeta.fileName}"` : ""}.</p>
                    <p className="mt-1 text-xs">Você pode abrir as revisões dos lotes já concluídos abaixo. Para processar lotes pendentes ou reprocessar com erro, reenvie o mesmo PDF — a fila será mantida.</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={clearPdfQueue}>Descartar fila</Button>
                </div>
                <PdfQueuePanel
                  queue={pdfQueue}
                  activeQueueJobId={activeQueueJobId}
                  isBusy={false}
                  canProcess={false}
                  onProcessNext={processNextQueueJob}
                  onProcessJob={(id) => { void processQueueJob(id); }}
                  onOpenReview={openQueueJobReview}
                  onOpenMassReview={openMassQueueReview}
                  onClearQueue={clearPdfQueue}
                />
              </div>
            )}
          <PdfUploadPanel
            steps={pdfSteps}
            pdfInfo={pdfInfo}
            loading={pdfLoading}
            rendering={pdfRendering}
            digitizing={pdfDigitizing}
            dragOver={pdfDragOver}
            inputRef={pdfInputRef}
            selectedPages={selectedPdfPages}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            renderedImage={renderedPdfImage}
            queue={pdfQueue}
            activeQueueJobId={activeQueueJobId}
            onDragOverChange={setPdfDragOver}
            onFile={handlePdfFile}
            onReset={resetPdf}
            onTogglePage={togglePdfPage}
            onRangeStartChange={setRangeStart}
            onRangeEndChange={setRangeEnd}
            onSelectRange={selectPdfRange}
            onSelectFirstPages={selectFirstPdfPages}
            onSelectAllPreparedPages={selectAllPreparedPdfPages}
            onClearSelection={clearPdfSelection}
            onRenderPages={() => { void renderSelectedPdfPages(); }}
            onDigitizePdf={() => { void onDigitizePdf(); }}
            onCreateQueue={createPdfQueueFromSelection}
            onProcessNextQueueJob={processNextQueueJob}
            onProcessQueueJob={(id) => { void processQueueJob(id); }}
            onOpenQueueJobReview={openQueueJobReview}
            onOpenMassQueueReview={openMassQueueReview}
            onClearQueue={clearPdfQueue}
          />
          </>
        )}
      </div>
    </AppLayout>
  );
}

function ModeButton({ active, icon, title, description, onClick }: { active: boolean; icon: ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg border px-3 py-3 text-left transition ${active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-background hover:bg-muted"}`}>
      <span className="flex items-center gap-2 font-semibold">{icon} {title}</span>
      <span className={`mt-1 block text-xs ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{description}</span>
    </button>
  );
}

function buildPdfSteps({ hasFile, hasSelection, hasQueue, hasDone, isBusy }: { hasFile: boolean; hasSelection: boolean; hasQueue: boolean; hasDone: boolean; isBusy: boolean }) {
  return [
    { label: "Origem", description: "PDF selecionado", done: true },
    { label: "Arquivo", description: hasFile ? "PDF carregado" : "Envie o PDF", done: hasFile, active: !hasFile },
    { label: "Páginas", description: hasSelection ? "Seleção pronta" : "Escolha páginas", done: hasSelection, active: hasFile && !hasSelection },
    { label: "Processar", description: hasQueue ? "Fila criada" : "Digitalize ou crie fila", done: hasQueue || hasDone, active: hasFile && hasSelection && !hasDone },
    { label: "Revisar", description: hasDone ? "Resultados prontos" : isBusy ? "Processando" : "Abra a revisão", done: hasDone, active: hasDone },
  ];
}

async function filesToSequentialDataURL(images: SelectedImage[], rotateDeg: number): Promise<string> {
  const loaded: Array<{ img: HTMLImageElement; index: number }> = [];
  try {
    for (const [index, { file }] of images.entries()) {
      const dataUrl = await fileToDataURL(file, rotateDeg);
      const img = await loadImage(dataUrl);
      loaded.push({ img, index });
    }

    const targetWidth = Math.min(1800, Math.max(...loaded.map(({ img }) => img.width)));
    const baseParts = loaded.map(({ img, index }) => {
      const scale = Math.min(1, targetWidth / img.width);
      return { img, index, width: Math.round(img.width * scale), height: Math.round(img.height * scale) };
    });
    const labelHeight = images.length > 1 ? 36 : 0;
    const scaleParts = (scaleFactor: number) => baseParts.map((part) => ({
      ...part,
      width: Math.max(1, Math.round(part.width * scaleFactor)),
      height: Math.max(1, Math.round(part.height * scaleFactor)),
    }));
    let scaleFactor = 1;
    let parts = scaleParts(scaleFactor);
    let canvasWidth = Math.max(...parts.map((part) => part.width));
    let canvasHeight = parts.reduce((sum, part, index) => sum + labelHeight + part.height + (index < parts.length - 1 ? 36 : 0), 0);
    for (let attempt = 0; canvasWidth * canvasHeight > MAX_IMAGE_CANVAS_PIXELS && attempt < 4; attempt++) {
      scaleFactor *= Math.sqrt(MAX_IMAGE_CANVAS_PIXELS / (canvasWidth * canvasHeight));
      parts = scaleParts(scaleFactor);
      canvasWidth = Math.max(...parts.map((part) => part.width));
      canvasHeight = parts.reduce((sum, part, index) => sum + labelHeight + part.height + (index < parts.length - 1 ? 36 : 0), 0);
    }
    if (scaleFactor < 0.4) {
      throw new Error("As imagens selecionadas exigem muita memória. Reduza a quantidade de imagens e tente novamente.");
    }
    assertImageCanvasSize(canvasWidth, canvasHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível preparar as imagens para composição.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let y = 0;
      for (const part of parts) {
        if (labelHeight) {
          ctx.fillStyle = "#111827";
          ctx.font = "24px Arial";
          ctx.fillText(`Parte ${part.index + 1} de ${parts.length}`, 12, y + 26);
          y += labelHeight;
        }
        const x = Math.round((canvasWidth - part.width) / 2);
        ctx.drawImage(part.img, x, y, part.width, part.height);
        y += part.height + 36;
      }

      return canvas.toDataURL("image/jpeg", 0.92);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    loaded.forEach(({ img }) => { img.removeAttribute("src"); });
  }
}

function showDigitizeError(error: unknown) {
  const msg = errorMessage(error);
  if (msg.includes("LOVABLE_API_KEY")) toast.error("Digitalização por IA não configurada. Configure a chave LOVABLE_API_KEY no ambiente do projeto.");
  else if (msg.includes("429")) toast.error("Limite de IA atingido. Aguarde alguns instantes.");
  else if (msg.includes("402")) toast.error("Créditos de IA esgotados. Adicione créditos no workspace.");
  else if (msg.includes("muita memória") || msg.includes("limite de envio")) toast.error(msg);
  else toast.error("Falha ao digitalizar. Tente novamente.");
}
