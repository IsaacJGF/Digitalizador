import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, FileUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const DATABASE_NAME = "digitalizador-review-pdf";
const STORE_NAME = "files";
const PDF_KEY = "original";
const PAGE_MAP_KEY = "digitalizador.review-pdf-pages";

type StoredPdf = { blob: Blob; name: string };

function openPdfDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir o armazenamento local."));
  });
}

async function readStoredPdf(): Promise<StoredPdf | null> {
  const database = await openPdfDatabase();
  return new Promise<StoredPdf | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(PDF_KEY);
    request.onsuccess = () => resolve((request.result as StoredPdf | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Falha ao ler o PDF salvo."));
  }).finally(() => database.close());
}

async function saveStoredPdf(pdf: StoredPdf | null): Promise<void> {
  const database = await openPdfDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    if (pdf) store.put(pdf, PDF_KEY);
    else store.delete(PDF_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao salvar o PDF."));
    transaction.onabort = () => reject(transaction.error ?? new Error("O armazenamento local recusou o PDF."));
  }).finally(() => database.close());
}

function readPageMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PAGE_MAP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function QuestionReviewPdfPanel({
  questionId,
  year,
  number,
  open,
  onOpenChange,
}: {
  questionId: string;
  year: string | null;
  number: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pdfUrl, setPdfUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const objectUrlRef = useRef("");

  const replaceObjectUrl = (blob: Blob | null) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = blob ? URL.createObjectURL(blob) : "";
    setPdfUrl(objectUrlRef.current);
  };

  useEffect(() => {
    let active = true;
    void readStoredPdf()
      .then((pdf) => {
        if (!active || !pdf) return;
        replaceObjectUrl(pdf.blob);
        setFileName(pdf.name);
      })
      .catch((error) => {
        console.warn("Não foi possível recuperar o PDF de referência:", error);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    };
  }, []);

  useEffect(() => {
    setPage(readPageMap()[questionId] ?? 1);
  }, [questionId]);

  const savePage = (nextPage: number) => {
    const normalized = Math.max(1, Math.floor(nextPage || 1));
    setPage(normalized);
    try {
      const map = readPageMap();
      map[questionId] = normalized;
      localStorage.setItem(PAGE_MAP_KEY, JSON.stringify(map));
    } catch (error) {
      console.warn("Não foi possível salvar a página associada:", error);
    }
  };

  const uploadPdf = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Selecione um arquivo PDF.");
      return;
    }
    setSaving(true);
    try {
      await saveStoredPdf({ blob: file, name: file.name });
      replaceObjectUrl(file);
      setFileName(file.name);
      localStorage.removeItem(PAGE_MAP_KEY);
      savePage(1);
      toast.success("PDF salvo neste navegador.");
    } catch (error) {
      console.error("Falha ao salvar PDF de referência:", error);
      toast.error("Não foi possível guardar o PDF neste navegador.");
    } finally {
      setSaving(false);
    }
  };

  const removePdf = async () => {
    try {
      await saveStoredPdf(null);
      replaceObjectUrl(null);
      setFileName("");
      localStorage.removeItem(PAGE_MAP_KEY);
      toast.success("PDF removido deste navegador.");
    } catch (error) {
      console.error("Falha ao remover PDF de referência:", error);
      toast.error("Não foi possível remover o PDF.");
    }
  };

  const pdfPageUrl = pdfUrl ? pdfUrl + "#page=" + page + "&zoom=page-width" : "";
  const questionSearch = [year, number ? "questão " + number : ""].filter(Boolean).join(" ");

  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="PDF original da questão">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileUp className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">PDF original</span>
            <span className="block truncate text-xs text-muted-foreground">
              {fileName || (loading ? "Verificando PDF salvo..." : "Clique para abrir e selecionar o PDF.")}
            </span>
          </span>
        </span>
        <ChevronDown className={"size-4 shrink-0 text-muted-foreground transition-transform " + (open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div className="border-t">
          <div className="space-y-3 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {fileName
                  ? "PDF salvo somente neste navegador."
                  : "Envie o PDF da prova para comparar a questão cadastrada com a página original."}
              </p>
              {pdfUrl && (
                <div className="flex items-center gap-3">
                  <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={pdfPageUrl} target="_blank" rel="noreferrer">
                    Abrir em nova aba <ExternalLink className="size-3" />
                  </a>
                  <Button type="button" variant="ghost" size="icon" title="Remover PDF salvo" aria-label="Remover PDF salvo" onClick={() => void removePdf()}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </div>
            {!pdfUrl && (
              <Label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm hover:bg-muted/50">
                {saving || loading ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                {saving ? "Salvando PDF..." : loading ? "Carregando PDF..." : "Selecionar PDF de referência"}
                <Input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  disabled={saving || loading}
                  onChange={(event) => {
                    void uploadPdf(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </Label>
            )}
            {pdfUrl && (
              <>
                <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="review-pdf-page" className="text-xs">Página original</Label>
                    <Input
                      id="review-pdf-page"
                      type="number"
                      min={1}
                      step={1}
                      value={page}
                      onChange={(event) => savePage(Number(event.target.value))}
                    />
                  </div>
                  <Label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs hover:bg-muted/50">
                    <FileUp className="size-4" />
                    Trocar PDF
                    <Input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="sr-only"
                      disabled={saving}
                      onChange={(event) => {
                        void uploadPdf(event.currentTarget.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {questionSearch ? "Localize " + questionSearch + " e associe a página." : "Associe a página desta questão."}
                </p>
              </>
            )}
          </div>
          {pdfUrl ? (
            <iframe
              key={pdfUrl + "-" + page}
              title={fileName ? "PDF original: " + fileName : "PDF original"}
              src={pdfPageUrl}
              className="h-[55vh] min-h-[320px] max-h-[560px] w-full border-t bg-muted"
            />
          ) : (
            <div className="flex min-h-[180px] items-center justify-center border-t p-6 text-center text-sm text-muted-foreground">
              Envie o PDF ou selecione um arquivo acima.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
