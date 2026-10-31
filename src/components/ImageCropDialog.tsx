import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };
type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type CropInteraction =
  | { type: "select"; start: Point }
  | { type: "move"; start: Point; rect: Rect }
  | { type: "resize"; handle: ResizeHandle; start: Point; rect: Rect };

export type ImageCropSource = {
  id: string;
  label: string;
  url: string;
};

type Props = {
  open: boolean;
  imageUrl: string | undefined;
  imageSources?: ImageCropSource[];
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
  title?: string;
};

const MIN_CROP = 8;

export function ImageCropDialog({ open, imageUrl, imageSources = [], onCancel, onConfirm, title }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadedSources, setUploadedSources] = useState<ImageCropSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);
  const [interaction, setInteraction] = useState<CropInteraction | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  const baseSources = useMemo(() => {
    const list: ImageCropSource[] = [];
    const add = (source: ImageCropSource | null | undefined) => {
      if (!source?.url) return;
      if (list.some((item) => item.url === source.url || item.id === source.id)) return;
      list.push(source);
    };
    for (const source of imageSources) add(source);
    if (imageUrl) add({ id: "original", label: "Imagem da digitalização", url: imageUrl });
    return list;
  }, [imageSources, imageUrl]);

  const sources = useMemo(() => {
    const list: ImageCropSource[] = [];
    for (const source of [...uploadedSources, ...baseSources]) {
      if (list.some((item) => item.url === source.url || item.id === source.id)) continue;
      list.push(source);
    }
    return list;
  }, [baseSources, uploadedSources]);
  const sourceSignature = baseSources.map((source) => `${source.id}:${source.url.length}`).join("|");
  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? sources[0];
  const selectedUrl = selectedSource?.url;

  useEffect(() => {
    if (!open) return;
    setRect(null);
    setInteraction(null);
    setImgSize(null);
    setSelectedSourceId((current) => {
      const stillAvailable =
        uploadedSources.some((source) => source.id === current) ||
        baseSources.some((source) => source.id === current);
      return stillAvailable ? current : uploadedSources[0]?.id ?? baseSources[0]?.id ?? "";
    });
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [open, sourceSignature, uploadedSources]);

  useEffect(() => {
    if (!open || sources.length === 0) return;
    if (!sources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(sources[0].id);
    }
  }, [open, selectedSourceId, sources]);

  useEffect(() => {
    setRect(null);
    setInteraction(null);
    setImgSize(null);
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [selectedUrl]);

  useEffect(() => {
    if (!interaction) return;

    const move = (event: PointerEvent) => {
      const point = getPoint(event);
      if (!point) return;

      if (interaction.type === "select") {
        setRect(normalizeRect(interaction.start, point));
        return;
      }

      if (interaction.type === "move") {
        const dx = point.x - interaction.start.x;
        const dy = point.y - interaction.start.y;
        setRect(moveRect(interaction.rect, dx, dy));
        return;
      }

      setRect(resizeRect(interaction.rect, interaction.handle, point));
    };

    const up = () => setInteraction(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [interaction]);

  const getPoint = (event: Pick<PointerEvent, "clientX" | "clientY">): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const bounds = stage.getBoundingClientRect();
    return {
      x: clamp(event.clientX - bounds.left, 0, bounds.width),
      y: clamp(event.clientY - bounds.top, 0, bounds.height),
    };
  };

  const getStageSize = () => {
    const bounds = stageRef.current?.getBoundingClientRect();
    return { w: bounds?.width ?? 0, h: bounds?.height ?? 0 };
  };

  const normalizeRect = (start: Point, end: Point): Rect => {
    const size = getStageSize();
    const left = clamp(Math.min(start.x, end.x), 0, size.w);
    const top = clamp(Math.min(start.y, end.y), 0, size.h);
    const right = clamp(Math.max(start.x, end.x), 0, size.w);
    const bottom = clamp(Math.max(start.y, end.y), 0, size.h);
    return { x: left, y: top, w: right - left, h: bottom - top };
  };

  const moveRect = (start: Rect, dx: number, dy: number): Rect => {
    const size = getStageSize();
    return {
      ...start,
      x: clamp(start.x + dx, 0, Math.max(0, size.w - start.w)),
      y: clamp(start.y + dy, 0, Math.max(0, size.h - start.h)),
    };
  };

  const resizeRect = (start: Rect, handle: ResizeHandle, point: Point): Rect => {
    const size = getStageSize();
    let left = start.x;
    let top = start.y;
    let right = start.x + start.w;
    let bottom = start.y + start.h;

    if (handle.includes("w")) left = clamp(point.x, 0, right - MIN_CROP);
    if (handle.includes("e")) right = clamp(point.x, left + MIN_CROP, size.w);
    if (handle.includes("n")) top = clamp(point.y, 0, bottom - MIN_CROP);
    if (handle.includes("s")) bottom = clamp(point.y, top + MIN_CROP, size.h);

    return { x: left, y: top, w: right - left, h: bottom - top };
  };

  const beginSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!selectedUrl || event.button !== 0) return;
    event.preventDefault();
    const point = getPoint(event.nativeEvent);
    if (!point) return;
    setRect({ x: point.x, y: point.y, w: 0, h: 0 });
    setInteraction({ type: "select", start: point });
  };

  const beginMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!rect || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPoint(event.nativeEvent);
    if (!point) return;
    setInteraction({ type: "move", start: point, rect });
  };

  const beginResize = (handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!rect || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPoint(event.nativeEvent);
    if (!point) return;
    setInteraction({ type: "resize", handle, start: point, rect });
  };

  const confirmCrop = () => {
    if (!rect || !imgRef.current || !imgSize || rect.w < MIN_CROP || rect.h < MIN_CROP) return;
    const img = imgRef.current;
    const displayed = img.getBoundingClientRect();
    const scaleX = imgSize.w / displayed.width;
    const scaleY = imgSize.h / displayed.height;
    const sx = Math.round(rect.x * scaleX);
    const sy = Math.round(rect.y * scaleY);
    const sw = Math.round(rect.w * scaleX);
    const sh = Math.round(rect.h * scaleY);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, sw);
    canvas.height = Math.max(1, sh);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    onConfirm(canvas.toDataURL("image/png"));
  };

  const confirmWholeImage = () => {
    if (!selectedUrl) return;
    onConfirm(selectedUrl);
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) return;
    const dataUrl = await readFileAsDataUrl(file);
    const source = {
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: file.name ? "Imagem original · " + file.name : "Imagem original enviada",
      url: dataUrl,
    };
    setUploadedSources((current) => [source, ...current.filter((item) => item.url !== dataUrl)]);
    setSelectedSourceId(source.id);
    setRect(null);
  };

  const canCrop = Boolean(rect && rect.w >= MIN_CROP && rect.h >= MIN_CROP);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onCancel()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title ?? "Inserir imagem"}</DialogTitle>
          <DialogDescription>
            Envie a imagem uma vez e reutilize o original para criar vários recortes enquanto esta edição estiver aberta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <div>
              <p className="text-sm font-medium">Fontes para recorte</p>
              <p className="text-xs text-muted-foreground">As imagens originais enviadas ficam disponíveis nesta edição.</p>
            </div>

            <input
              ref={uploadRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={(event) => onUpload(event.target.files?.[0])}
            />
            <Button type="button" variant="outline" className="w-full justify-start" onClick={() => uploadRef.current?.click()}>
              Fazer upload do computador
            </Button>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Imagens existentes</p>
              {sources.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Nenhuma imagem disponível para recortar.</p>
              ) : (
                <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
                  {sources.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      className={`w-full rounded-md border px-2 py-2 text-left text-xs transition-colors ${selectedSource?.id === source.id ? "border-primary bg-primary/10" : "bg-background hover:bg-muted"}`}
                      onClick={() => setSelectedSourceId(source.id)}
                    >
                      <span className="line-clamp-2">{source.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <p className="text-sm text-muted-foreground">
              Para recortar, arraste sobre a imagem. Depois ajuste a seleção pelas bordas ou mova o retângulo antes de confirmar.
            </p>
            <div
              ref={viewportRef}
              className="max-h-[64vh] overflow-auto rounded-md border bg-muted/30 p-3"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) setRect(null);
              }}
            >
              {selectedUrl ? (
                <div
                  ref={stageRef}
                  className="relative inline-block min-w-0 cursor-crosshair select-none touch-none bg-background"
                  onPointerDown={beginSelection}
                >
                  <img
                    ref={imgRef}
                    src={selectedUrl}
                    alt="Imagem selecionada para recorte"
                    draggable={false}
                    className="block max-w-full pointer-events-none"
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
                    }}
                  />
                  {rect && (
                    <div
                      className="absolute border-2 border-primary bg-primary/20 cursor-move"
                      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
                      onPointerDown={beginMove}
                    >
                      {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as ResizeHandle[]).map((handle) => (
                        <button
                          key={handle}
                          type="button"
                          aria-label="Ajustar recorte"
                          className={`absolute size-3 rounded-sm border border-primary bg-background shadow ${handleClass(handle)}`}
                          onPointerDown={(event) => beginResize(handle, event)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">Selecione ou envie uma imagem.</div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button variant="secondary" onClick={confirmWholeImage} disabled={!selectedUrl}>Usar imagem inteira</Button>
          <Button onClick={confirmCrop} disabled={!canCrop}>Recortar e inserir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function handleClass(handle: ResizeHandle) {
  const vertical = handle.includes("n") ? "top-[-6px]" : handle.includes("s") ? "bottom-[-6px]" : "top-1/2 -translate-y-1/2";
  const horizontal = handle.includes("w") ? "left-[-6px]" : handle.includes("e") ? "right-[-6px]" : "left-1/2 -translate-x-1/2";
  const cursor = handle === "n" || handle === "s"
    ? "cursor-ns-resize"
    : handle === "e" || handle === "w"
      ? "cursor-ew-resize"
      : handle === "nw" || handle === "se"
        ? "cursor-nwse-resize"
        : "cursor-nesw-resize";
  return `${vertical} ${horizontal} ${cursor}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
