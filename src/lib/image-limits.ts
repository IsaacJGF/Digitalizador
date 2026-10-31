export const MAX_IMAGE_CANVAS_PIXELS = 18_000_000;
export const MAX_IMAGE_CANVAS_DIMENSION = 16_384;
export const MAX_DIGITIZE_IMAGE_DATA_URL_LENGTH = 20 * 1024 * 1024;

export function assertImageCanvasSize(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_IMAGE_CANVAS_DIMENSION ||
    height > MAX_IMAGE_CANVAS_DIMENSION ||
    width * height > MAX_IMAGE_CANVAS_PIXELS
  ) {
    throw new Error(
      "A imagem combinada exige muita memória. Reduza a quantidade de páginas ou imagens e tente novamente.",
    );
  }
}
