import * as pdfjs from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { assertImageCanvasSize, MAX_IMAGE_CANVAS_PIXELS } from "@/lib/image-limits";

export type PdfPageSize = {
  width: number;
  height: number;
};

export type PdfDocumentSummary = {
  fileName: string;
  fileSize: number;
  pageCount: number;
  readablePageCount: number;
  isOverPageLimit: boolean;
  firstPageSize?: PdfPageSize;
};

export type PdfRenderedImage = {
  imageDataUrl: string;
  pages: number[];
  width: number;
  height: number;
};

export type ReadPdfOptions = {
  maxPages: number;
};

export type RenderPdfPagesOptions = {
  scale?: number;
  maxPageWidth?: number;
  imageQuality?: number;
};

const PAGE_GAP = 36;
const LABEL_HEIGHT = 34;

let workerConfigured = false;

function configurePdfWorker() {
  if (workerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerConfigured = true;
}

export async function readPdfDocumentSummary(
  file: File,
  options: ReadPdfOptions,
): Promise<PdfDocumentSummary> {
  if (!isPdfFile(file)) {
    throw new Error("Envie um arquivo PDF válido.");
  }

  const pdf = await openPdfDocument(file);
  try {
    let firstPageSize: PdfPageSize | undefined;
    try {
      const firstPage = await pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1 });
      firstPageSize = {
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
      };
      firstPage.cleanup();
    } catch (error) {
      console.warn("Não foi possível ler o tamanho da primeira página do PDF:", error);
    }

    return {
      fileName: file.name,
      fileSize: file.size,
      pageCount: pdf.numPages,
      readablePageCount: Math.min(pdf.numPages, options.maxPages),
      isOverPageLimit: pdf.numPages > options.maxPages,
      firstPageSize,
    };
  } finally {
    await pdf.destroy();
  }
}

export async function renderPdfPagesToImageDataUrl(
  file: File,
  pageNumbers: number[],
  options: RenderPdfPagesOptions = {},
): Promise<PdfRenderedImage> {
  if (!isPdfFile(file)) {
    throw new Error("Envie um arquivo PDF válido.");
  }

  const requestedScale =
    Number.isFinite(options.scale) && (options.scale ?? 0) > 0 ? options.scale! : 2;
  const maxPageWidth =
    Number.isFinite(options.maxPageWidth) && (options.maxPageWidth ?? 0) > 0
      ? options.maxPageWidth!
      : 1800;
  const imageQuality = Number.isFinite(options.imageQuality)
    ? Math.max(0.1, Math.min(1, options.imageQuality!))
    : 0.9;
  const pdf = await openPdfDocument(file);
  const openedPages: PDFPageProxy[] = [];

  try {
    const pages = normalizePageNumbers(pageNumbers, pdf.numPages);
    if (pages.length === 0) {
      throw new Error("Selecione ao menos uma página do PDF.");
    }

    const pageInputs: Array<{ pageNumber: number; page: PDFPageProxy; widthAtScaleOne: number }> =
      [];
    for (const pageNumber of pages) {
      const page = await pdf.getPage(pageNumber);
      openedPages.push(page);
      const baseViewport = page.getViewport({ scale: 1 });
      pageInputs.push({ pageNumber, page, widthAtScaleOne: baseViewport.width });
    }

    let scaleFactor = 1;
    let layouts = buildPageLayouts(pageInputs, requestedScale, maxPageWidth, scaleFactor);
    let canvasSize = measureCombinedCanvas(layouts);
    for (let attempt = 0; canvasSize.pixels > MAX_IMAGE_CANVAS_PIXELS && attempt < 4; attempt++) {
      scaleFactor *= Math.sqrt(MAX_IMAGE_CANVAS_PIXELS / canvasSize.pixels);
      layouts = buildPageLayouts(pageInputs, requestedScale, maxPageWidth, scaleFactor);
      canvasSize = measureCombinedCanvas(layouts);
    }
    if (scaleFactor < 0.4 || canvasSize.pixels > MAX_IMAGE_CANVAS_PIXELS) {
      throw new Error(
        "A seleção exige muita memória para renderizar. Reduza a quantidade de páginas e tente novamente.",
      );
    }
    assertImageCanvasSize(canvasSize.width, canvasSize.height);

    const { width: canvasWidth, height: canvasHeight, labelHeight } = canvasSize;
    const combinedCanvas = document.createElement("canvas");
    combinedCanvas.width = canvasWidth;
    combinedCanvas.height = canvasHeight;
    try {
      const combinedCtx = combinedCanvas.getContext("2d");
      if (!combinedCtx) throw new Error("Não foi possível combinar as páginas renderizadas.");

      combinedCtx.fillStyle = "#ffffff";
      combinedCtx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);

      let y = 0;
      for (const layout of layouts) {
        if (labelHeight) {
          combinedCtx.fillStyle = "#111827";
          combinedCtx.font = "22px Arial";
          combinedCtx.fillText(`Página ${layout.pageNumber} de ${pdf.numPages}`, 12, y + 24);
          y += labelHeight;
        }

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = layout.width;
        pageCanvas.height = layout.height;
        try {
          const pageCtx = pageCanvas.getContext("2d");
          if (!pageCtx)
            throw new Error("Não foi possível preparar o canvas para renderizar o PDF.");
          pageCtx.fillStyle = "#ffffff";
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          await layout.page.render({ canvasContext: pageCtx, viewport: layout.viewport }).promise;
          const x = Math.round((canvasWidth - layout.width) / 2);
          combinedCtx.drawImage(pageCanvas, x, y, layout.width, layout.height);
        } finally {
          pageCanvas.width = 0;
          pageCanvas.height = 0;
        }
        y += layout.height + PAGE_GAP;
      }

      return {
        imageDataUrl: combinedCanvas.toDataURL("image/jpeg", imageQuality),
        pages,
        width: canvasWidth,
        height: canvasHeight,
      };
    } finally {
      combinedCanvas.width = 0;
      combinedCanvas.height = 0;
    }
  } finally {
    openedPages.forEach((page) => {
      try {
        page.cleanup();
      } catch {
        // Continue releasing the remaining pages and document resources.
      }
    });
    await pdf.destroy();
  }
}

type PdfPageLayout = {
  pageNumber: number;
  page: PDFPageProxy;
  viewport: ReturnType<PDFPageProxy["getViewport"]>;
  width: number;
  height: number;
};

function buildPageLayouts(
  pages: Array<{ pageNumber: number; page: PDFPageProxy; widthAtScaleOne: number }>,
  requestedScale: number,
  maxPageWidth: number,
  scaleFactor: number,
): PdfPageLayout[] {
  return pages.map(({ pageNumber, page, widthAtScaleOne }) => {
    const scale = Math.min(requestedScale, maxPageWidth / widthAtScaleOne) * scaleFactor;
    const viewport = page.getViewport({ scale });
    return {
      pageNumber,
      page,
      viewport,
      width: Math.ceil(viewport.width),
      height: Math.ceil(viewport.height),
    };
  });
}

function measureCombinedCanvas(layouts: PdfPageLayout[]) {
  const labelHeight = layouts.length > 1 ? LABEL_HEIGHT : 0;
  const width = Math.max(...layouts.map((layout) => layout.width));
  const height = layouts.reduce(
    (sum, layout, index) =>
      sum + labelHeight + layout.height + (index < layouts.length - 1 ? PAGE_GAP : 0),
    0,
  );
  return { width, height, labelHeight, pixels: width * height };
}

async function openPdfDocument(file: File) {
  configurePdfWorker();
  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data,
    stopAtErrors: false,
    isEvalSupported: false,
  });
  try {
    return await loadingTask.promise;
  } catch (error) {
    try {
      await loadingTask.destroy();
    } catch {
      // Preserve the original document loading error.
    }
    throw error;
  }
}

function normalizePageNumbers(pageNumbers: number[], maxPages: number) {
  return Array.from(new Set(pageNumbers))
    .filter((page) => Number.isInteger(page) && page >= 1 && page <= maxPages)
    .sort((a, b) => a - b);
}

export function pageRange(start: number, end: number, maxPages: number) {
  const safeStart = Math.max(1, Math.min(maxPages, Math.floor(start)));
  const safeEnd = Math.max(1, Math.min(maxPages, Math.floor(end)));
  const from = Math.min(safeStart, safeEnd);
  const to = Math.max(safeStart, safeEnd);
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

export function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  const kb = bytes / 1024;
  return `${kb.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
}
