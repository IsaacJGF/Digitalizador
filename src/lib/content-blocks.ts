import {
  DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT,
  normalizeExtraImage,
  normalizeExtraImages,
  normalizeImagePlacementLayout,
  type ExtraImage,
  type ImagePlacementLayout,
} from "@/lib/image-layout";

/**
 * Texto com imagens intercaladas. As imagens ficam na lista `images` e o texto
 * guarda marcadores `[[img:N]]` (N começa em 1) no ponto exato onde cada imagem aparece.
 */
export const IMAGE_MARKER_RE = /\[\[img:(\d+)\]\]/g;
export const MAX_CONTENT_IMAGES = 20;

export type ContentBlock =
  | { type: "text"; value: string }
  | { type: "image"; image: ExtraImage };

export function hasImageMarkers(text?: string | null) {
  return Boolean(text && /\[\[img:\d+\]\]/.test(text));
}

export function stripImageMarkers(text?: string | null) {
  return (text ?? "").replace(IMAGE_MARKER_RE, " ").replace(/[ \t]{2,}/g, " ").trim();
}

/** Converte texto marcado + imagens em blocos, garantindo um bloco de texto entre imagens. */
export function parseBlocks(text: string, images: ExtraImage[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const used = new Set<number>();
  let last = 0;
  const source = text ?? "";
  for (const match of source.matchAll(IMAGE_MARKER_RE)) {
    const idx = Number(match[1]) - 1;
    const image = images[idx];
    blocks.push({ type: "text", value: trimEdges(source.slice(last, match.index)) });
    if (image && !used.has(idx)) {
      used.add(idx);
      blocks.push({ type: "image", image });
    }
    last = (match.index ?? 0) + match[0].length;
  }
  blocks.push({ type: "text", value: trimEdges(source.slice(last)) });
  // Imagens sem marcador vão para o final.
  images.forEach((image, idx) => {
    if (!used.has(idx)) blocks.push({ type: "image", image }, { type: "text", value: "" });
  });
  return tidyBlocks(blocks);
}

/** Converte blocos de volta para texto marcado + lista de imagens. */
export function serializeBlocks(blocks: ContentBlock[]): { text: string; images: ExtraImage[] } {
  const images: ExtraImage[] = [];
  const parts: string[] = [];
  for (const block of tidyBlocks(blocks)) {
    if (block.type === "image") {
      images.push(block.image);
      parts.push(`[[img:${images.length}]]`);
    } else if (block.value.trim()) {
      parts.push(block.value);
    }
  }
  return { text: parts.join("\n"), images };
}

/** Junta textos adjacentes e garante texto antes/depois/entre imagens (para o editor). */
export function tidyBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    if (block.type === "text") {
      if (prev?.type === "text") {
        prev.value = [prev.value, block.value].filter((v) => v.trim()).join("\n");
      } else out.push({ ...block });
    } else {
      if (!prev || prev.type === "image") out.push({ type: "text", value: "" });
      out.push(block);
    }
  }
  if (out.length === 0 || out[out.length - 1].type === "image") out.push({ type: "text", value: "" });
  return out;
}

export function newContentImage(url: string): ExtraImage {
  return normalizeExtraImage({ url, pos: "depois" }) as ExtraImage;
}

function trimEdges(value: string) {
  return value.replace(/^\s*\n/, "").replace(/\n\s*$/, "");
}

function marker(images: ExtraImage[], image: ExtraImage) {
  images.push(image);
  return `[[img:${images.length}]]`;
}

function blockImage(url: string, layout?: Partial<ImagePlacementLayout> | null): ExtraImage {
  return {
    url,
    pos: "depois",
    layout: normalizeImagePlacementLayout({ ...DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT, ...(layout ?? {}), mode: "block" }),
  };
}

/** Converte o formato antigo do enunciado (imagem principal + extras com posição) para texto marcado. */
export function legacyStatementToContent(input: {
  text: string;
  mainImage?: string | null;
  mainPos?: string | null;
  mainLayout?: Partial<ImagePlacementLayout> | null;
  extras?: unknown;
}): { text: string; images: ExtraImage[] } {
  const extras = normalizeExtraImages(input.extras);
  if (hasImageMarkers(input.text)) return { text: input.text, images: extras };
  const images: ExtraImage[] = [];
  const before: string[] = [];
  const after: string[] = [];
  if (input.mainImage) {
    const target = input.mainPos === "antes" ? before : after;
    target.push(marker(images, blockImage(input.mainImage, input.mainLayout)));
  }
  extras.forEach((image) => (image.pos === "antes" ? before : after).push(marker(images, image)));
  return { text: [...before, input.text ?? "", ...after].filter((p) => p.trim()).join("\n"), images };
}

/** Converte o formato antigo da referência (texto antes/depois + imagem principal + extras) para texto marcado. */
export function legacyReferenceToContent(input: {
  text: string;
  textAfter?: string | null;
  mainImage?: string | null;
  mainPos?: string | null;
  mainLayout?: Partial<ImagePlacementLayout> | null;
  extras?: unknown;
}): { text: string; images: ExtraImage[] } {
  const extras = normalizeExtraImages(input.extras);
  if (hasImageMarkers(input.text) && !input.textAfter?.trim()) return { text: input.text, images: extras };
  const images: ExtraImage[] = [];
  const before: string[] = [];
  const between: string[] = [];
  const after: string[] = [];
  const pick = (pos?: string | null) => (pos === "antes" ? before : pos === "entre" ? between : after);
  if (input.mainImage) pick(input.mainPos).push(marker(images, blockImage(input.mainImage, input.mainLayout)));
  extras.forEach((image) => pick(image.pos).push(marker(images, image)));
  return {
    text: [...before, input.text ?? "", ...between, input.textAfter ?? "", ...after].filter((p) => p.trim()).join("\n"),
    images,
  };
}

/** Divide o texto marcado em segmentos para renderização (preview e Word). */
export function splitContent(text: string, images: ExtraImage[]): ContentBlock[] {
  return parseBlocks(text, images).filter((b) => b.type === "image" || b.value.trim());
}
