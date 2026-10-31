import { PDF_QUEUE_KEY, type PdfQueueJob, type PdfQueueStatus } from "./types";

const PDF_FILE_META_KEY = "digitalizador.pdfMeta";
const PDF_QUEUE_DB_NAME = "digitalizador-local";
const PDF_QUEUE_STORE_NAME = "queues";
const PDF_QUEUE_RECORD_KEY = "pdfQueue";

export type PdfFileMeta = {
  fileName: string;
  fileSize: number;
  pageCount: number;
};

export type PdfQueuePersistenceResult =
  | { ok: true; storage: "indexeddb" | "localStorage"; compacted: boolean }
  | { ok: false; storage: "none"; compacted: false };

let databasePromise: Promise<IDBDatabase | null> | null = null;

function safeStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function persistPdfQueue(queue: PdfQueueJob[]): Promise<PdfQueuePersistenceResult> {
  const normalizedQueue = normalizePdfQueue(queue);
  const database = await openPdfQueueDatabase();
  if (database) {
    try {
      await writePdfQueue(database, normalizedQueue);
      safeStorage()?.removeItem(PDF_QUEUE_KEY);
      return { ok: true, storage: "indexeddb", compacted: false };
    } catch (error) {
      console.warn(
        "Não foi possível guardar a fila do PDF no armazenamento local do navegador:",
        error,
      );
    }
  }

  const store = safeStorage();
  if (!store) return { ok: false, storage: "none", compacted: false };

  try {
    store.setItem(PDF_QUEUE_KEY, JSON.stringify(normalizedQueue));
    return { ok: true, storage: "localStorage", compacted: false };
  } catch (error) {
    try {
      store.setItem(PDF_QUEUE_KEY, JSON.stringify(compactPdfQueue(normalizedQueue)));
      return { ok: true, storage: "localStorage", compacted: true };
    } catch (compactError) {
      console.warn("Não foi possível guardar a fila do PDF:", compactError || error);
      return { ok: false, storage: "none", compacted: false };
    }
  }
}

export async function loadPdfQueue(): Promise<PdfQueueJob[]> {
  const database = await openPdfQueueDatabase();
  if (database) {
    try {
      const queue = await readPdfQueue(database);
      if (Array.isArray(queue)) return normalizePdfQueue(queue);
    } catch (error) {
      console.warn("Não foi possível recuperar a fila do PDF do armazenamento local:", error);
    }
  }

  const store = safeStorage();
  if (!store) return [];
  try {
    const raw = store.getItem(PDF_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return normalizePdfQueue(parsed);
  } catch {
    return [];
  }
}

export function clearPdfQueueStorage() {
  const store = safeStorage();
  try {
    store?.removeItem(PDF_QUEUE_KEY);
    store?.removeItem(PDF_FILE_META_KEY);
  } catch {
    // The queue may already be unavailable because browser storage is blocked.
  }

  void openPdfQueueDatabase().then(async (database) => {
    if (!database) return;
    try {
      await writePdfQueue(database, []);
    } catch (error) {
      console.warn("Não foi possível limpar a fila de PDF do armazenamento local:", error);
    }
  });
}

export function persistPdfFileMeta(meta: PdfFileMeta) {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(PDF_FILE_META_KEY, JSON.stringify(meta));
  } catch {
    // Metadata is optional; the result queue remains stored independently.
  }
}

export function loadPdfFileMeta(): PdfFileMeta | null {
  const store = safeStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(PDF_FILE_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PdfFileMeta>;
    if (
      typeof parsed.fileName !== "string" ||
      typeof parsed.fileSize !== "number" ||
      typeof parsed.pageCount !== "number"
    )
      return null;
    return { fileName: parsed.fileName, fileSize: parsed.fileSize, pageCount: parsed.pageCount };
  } catch {
    return null;
  }
}

export function isSamePdfFile(a: PdfFileMeta | null, b: PdfFileMeta | null) {
  if (!a || !b) return false;
  return a.fileName === b.fileName && a.fileSize === b.fileSize && a.pageCount === b.pageCount;
}

function openPdfQueueDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    let settled = false;
    const finish = (database: IDBDatabase | null) => {
      if (settled) {
        database?.close();
        return;
      }
      settled = true;
      resolve(database);
    };

    try {
      request = indexedDB.open(PDF_QUEUE_DB_NAME, 1);
    } catch {
      finish(null);
      return;
    }

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PDF_QUEUE_STORE_NAME)) {
        request.result.createObjectStore(PDF_QUEUE_STORE_NAME);
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        databasePromise = null;
      };
      finish(request.result);
    };
    request.onerror = () => {
      databasePromise = null;
      finish(null);
    };
    request.onblocked = () => {
      databasePromise = null;
      finish(null);
    };
  });

  return databasePromise;
}

function writePdfQueue(database: IDBDatabase, queue: PdfQueueJob[]) {
  return new Promise<void>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(PDF_QUEUE_STORE_NAME, "readwrite");
      const store = transaction.objectStore(PDF_QUEUE_STORE_NAME);
      if (queue.length === 0) store.delete(PDF_QUEUE_RECORD_KEY);
      else store.put(queue, PDF_QUEUE_RECORD_KEY);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Falha ao salvar a fila de PDF."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Salvamento da fila de PDF cancelado."));
  });
}

function readPdfQueue(database: IDBDatabase): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let request: IDBRequest;
    try {
      request = database
        .transaction(PDF_QUEUE_STORE_NAME, "readonly")
        .objectStore(PDF_QUEUE_STORE_NAME)
        .get(PDF_QUEUE_RECORD_KEY);
    } catch (error) {
      reject(error);
      return;
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao ler a fila de PDF."));
  });
}

function normalizePdfQueue(value: unknown): PdfQueueJob[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): PdfQueueJob[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const job = candidate as Partial<PdfQueueJob>;
    const status = job.status;
    const pages = Array.isArray(job.pages)
      ? job.pages.filter((page): page is number => Number.isInteger(page) && page > 0)
      : [];
    if (typeof job.id !== "string" || pages.length === 0 || !isPdfQueueStatus(status)) return [];

    const result = isPdfQueueResult(job.result) ? { ...job.result } : undefined;
    if (result) {
      delete (result as typeof result & { imageDataUrl?: string }).imageDataUrl;
      result.draft = { ...result.draft, imageDataUrls: undefined };
    }
    const restoredStatus =
      status === "processing" ? "pending" : status === "done" && !result ? "error" : status;
    return [
      {
        ...job,
        id: job.id,
        pages,
        status: restoredStatus,
        error:
          status === "done" && !result
            ? "O resultado salvo está incompleto. Tente processar este lote novamente."
            : job.error,
        result,
      } as PdfQueueJob,
    ];
  });
}

function isPdfQueueStatus(value: unknown): value is PdfQueueStatus {
  return value === "pending" || value === "processing" || value === "done" || value === "error";
}

function isPdfQueueResult(value: unknown): value is NonNullable<PdfQueueJob["result"]> {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<NonNullable<PdfQueueJob["result"]>>;
  return Boolean(result.draft && Array.isArray(result.draft.questoes));
}

function compactPdfQueue(queue: PdfQueueJob[]): PdfQueueJob[] {
  return queue.map((job) => {
    if (!job.result) return job;
    return {
      ...job,
      result: {
        ...job.result,
        draft: {
          ...job.result.draft,
          imageDataUrl: undefined,
          imageDataUrls: undefined,
          referencia_imagem: compactImage(job.result.draft.referencia_imagem),
          referencia_imagens_extra: compactExtras(job.result.draft.referencia_imagens_extra),
          questoes: job.result.draft.questoes.map((question) => ({
            ...question,
            enunciado_imagem: compactImage(question.enunciado_imagem),
            enunciado_imagens_extra: compactExtras(question.enunciado_imagens_extra),
            alternativas: question.alternativas.map((alternativa) => ({
              ...alternativa,
              imagem: compactImage(alternativa.imagem),
            })),
          })),
        },
      },
    };
  });
}

function compactExtras(
  extras?: NonNullable<PdfQueueJob["result"]>["draft"]["referencia_imagens_extra"],
) {
  const list = (extras ?? []).filter((item) => !item.url.startsWith("data:image"));
  return list.length > 0 ? list : undefined;
}

function compactImage(value?: string | null) {
  if (!value || value.startsWith("data:image")) return undefined;
  return value;
}
