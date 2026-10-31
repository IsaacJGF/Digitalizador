export type ImagePlacementAlign = "left" | "center" | "right";
export type ImagePlacementMode = "floating" | "block";

export type ImagePlacementLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  align?: ImagePlacementAlign;
  mode?: ImagePlacementMode;
};

export const DEFAULT_IMAGE_PLACEMENT_LAYOUT: ImagePlacementLayout = {
  x: 8,
  y: 12,
  width: 42,
  height: 28,
  rotation: 0,
  align: "center",
  mode: "floating",
};

export const DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT: ImagePlacementLayout = {
  x: 0,
  y: 0,
  width: 70,
  height: 30,
  rotation: 0,
  align: "center",
  mode: "block",
};

export type ExtraImagePosition = "antes" | "entre" | "depois";

export type ExtraImage = {
  url: string;
  layout: ImagePlacementLayout;
  pos: ExtraImagePosition;
  /** Slot sem arquivo, criado quando a imagem será adicionada durante a revisão. */
  pending?: boolean;
};

export function normalizeExtraImage(value: unknown): ExtraImage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<ExtraImage> & { layout?: Partial<ImagePlacementLayout> | null };
  const url = typeof raw.url === "string" ? raw.url : "";
  const pending = raw.pending === true && !url;
  if (!url && !pending) return null;
  return {
    url,
    layout: normalizeImagePlacementLayout({
      ...DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT,
      ...(raw.layout ?? {}),
      mode: "block",
    }),
    pos: raw.pos === "antes" || raw.pos === "entre" ? raw.pos : "depois",
    ...(pending ? { pending: true } : {}),
  };
}

export function normalizeExtraImages(value: unknown): ExtraImage[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeExtraImage).filter((item): item is ExtraImage => Boolean(item));
}


export function normalizeImagePlacementLayout(value?: Partial<ImagePlacementLayout> | null): ImagePlacementLayout {
  const base = { ...DEFAULT_IMAGE_PLACEMENT_LAYOUT, ...(value ?? {}) };
  const width = clampNumber(base.width, 8, 95);
  const height = clampNumber(base.height, 8, 90);
  return {
    x: clampNumber(base.x, 0, 100 - width),
    y: clampNumber(base.y, 0, 100 - height),
    width,
    height,
    rotation: normalizeRotation(base.rotation),
    align: normalizeAlign(base.align),
    mode: normalizeMode(base.mode),
  };
}

export function clampNumber(value: unknown, min: number, max: number) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, n));
}

function normalizeRotation(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const normalized = ((n % 360) + 360) % 360;
  return Math.round(normalized * 10) / 10;
}

function normalizeAlign(value: unknown): ImagePlacementAlign {
  return value === "left" || value === "right" || value === "center" ? value : "center";
}

function normalizeMode(value: unknown): ImagePlacementMode {
  return value === "block" ? "block" : "floating";
}
