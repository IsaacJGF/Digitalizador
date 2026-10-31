import type { DraftDigitization } from "@/lib/draft-store";

export const MAX_SIZE = 10 * 1024 * 1024;
export const MAX_FILES = 4;
export const MAX_COMBINED_WIDTH = 1800;
export const IMAGE_GAP = 36;
export const MAX_PDF_SIZE = 30 * 1024 * 1024;
export const MAX_PDF_PAGES = 80;
export const MAX_VISIBLE_PAGE_CARDS = 48;
export const MAX_PDF_RENDER_PAGES = 10;
export const PDF_RENDER_SCALE = 2;
export const PDF_RENDER_MAX_WIDTH = 1800;
export const PDF_QUEUE_KEY = "digitalizador.pdfQueue";

export type UploadMode = "image" | "pdf";
export type PdfQueueStatus = "pending" | "processing" | "done" | "error";

export type SelectedImage = {
  file: File;
  preview: string;
};

export type PdfQueueResult = {
  draft: DraftDigitization;
  imageSize: number;
  questionCount: number;
  processedAt: string;
};

export type PdfQueueJob = {
  id: string;
  pages: number[];
  status: PdfQueueStatus;
  error?: string;
  result?: PdfQueueResult;
  reviewed?: boolean;
  reviewedAt?: string;
};
