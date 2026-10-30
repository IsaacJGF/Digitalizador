import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Crop, ImagePlus, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/RichTextEditor";
import { MAX_CONTENT_IMAGES, parseBlocks, serializeBlocks, type ContentBlock } from "@/lib/content-blocks";
import {
  DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT,
  normalizeImagePlacementLayout,
  type ExtraImage,
  type ImagePlacementAlign,
  type ImagePlacementLayout,
} from "@/lib/image-layout";

type Props = {
  label: string;
  text: string;
  images: ExtraImage[];
  placeholder?: string;
  rows?: number;
  onChange: (value: { text: string; images: ExtraImage[] }) => void;
  /** Pede uma imagem ao pai. `insertAt` = índice do bloco onde inserir; `replaceImage` = nº da imagem a substituir. */
  onRequestImage: (request: { insertAt?: number; replaceImage?: number; currentImage?: string }) => void;
};

export function ContentBlocksEditor({ label, text, images, placeholder, rows = 4, onChange, onRequestImage }: Props) {
  const blocks = parseBlocks(text, images);
  const imageCount = blocks.filter((b) => b.type === "image").length;
  const canAdd = imageCount < MAX_CONTENT_IMAGES;

  const commit = (next: ContentBlock[]) => onChange(serializeBlocks(next));

  const setBlock = (index: number, block: ContentBlock) => commit(blocks.map((b, i) => (i === index ? block : b)));

  const patchLayout = (index: number, image: ExtraImage, partial: Partial<ImagePlacementLayout>) =>
    setBlock(index, {
      type: "image",
      image: {
        ...image,
        layout: normalizeImagePlacementLayout({ ...DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT, ...image.layout, ...partial, mode: "block" }),
      },
    });

  // Move a imagem para antes/depois do bloco de texto vizinho.
  const moveImage = (index: number, dir: -1 | 1) => {
    const next = [...blocks];
    const [item] = next.splice(index, 1);
    // pula o texto vizinho para atravessá-lo
    const target = dir === -1 ? Math.max(0, index - 1) : Math.min(next.length, index + 1);
    next.splice(target, 0, item);
    commit(next);
  };

  let imageNumber = 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{imageCount}/{MAX_CONTENT_IMAGES} imagens</span>
      </div>
      <div className="space-y-2 rounded-lg border bg-muted/10 p-2">
        {blocks.map((block, index) => {
          if (block.type === "text") {
            const isOnly = blocks.length === 1;
            return (
              <div key={`t-${index}`} className="space-y-1">
                <RichTextEditor
                  value={block.value}
                  onChange={(value) => setBlock(index, { type: "text", value })}
                  rows={isOnly ? Math.max(rows, 6) : block.value ? rows : 2}
                  placeholder={index === 0 ? placeholder : "Texto (opcional) — continue aqui"}
                  className="text-sm"
                />
                <InsertBar disabled={!canAdd} onClick={() => onRequestImage({ insertAt: index + 1 })} />
              </div>
            );
          }
          imageNumber += 1;
          const number = imageNumber;
          const image = block.image;
          const layout = normalizeImagePlacementLayout({ ...DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT, ...image.layout, mode: "block" });
          const alignClass = layout.align === "left" ? "justify-start" : layout.align === "right" ? "justify-end" : "justify-center";
          const alignBtn = (align: ImagePlacementAlign, icon: React.ReactNode, title: string) => (
            <Button type="button" size="icon" variant={layout.align === align ? "secondary" : "ghost"} className="size-7" title={title} onClick={() => patchLayout(index, image, { align })}>
              {icon}
            </Button>
          );
          return (
            <div key={`i-${index}`} className="space-y-2 rounded-lg border border-primary/30 bg-card p-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">Imagem {number}</span>
                <Button type="button" size="icon" variant="outline" className="size-7" title="Subir" disabled={index <= 1 && blocks[0]?.type === "text" && !blocks[0].value.trim() && index === 1} onClick={() => moveImage(index, -1)}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button type="button" size="icon" variant="outline" className="size-7" title="Descer" disabled={index >= blocks.length - 2 && !blocks[blocks.length - 1].value?.trim()} onClick={() => moveImage(index, 1)}>
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={() => onRequestImage({ replaceImage: number - 1, currentImage: image.url })}>
                  <Crop className="size-3.5" /> Recortar / trocar
                </Button>
                <Button type="button" size="icon" variant="outline" className="size-7" title="Girar à esquerda" onClick={() => patchLayout(index, image, { rotation: layout.rotation - 15 })}>
                  <RotateCcw className="size-3.5" />
                </Button>
                <Button type="button" size="icon" variant="outline" className="size-7" title="Girar à direita" onClick={() => patchLayout(index, image, { rotation: layout.rotation + 15 })}>
                  <RotateCw className="size-3.5" />
                </Button>
                {alignBtn("left", <AlignLeft className="size-3.5" />, "Esquerda")}
                {alignBtn("center", <AlignCenter className="size-3.5" />, "Centro")}
                {alignBtn("right", <AlignRight className="size-3.5" />, "Direita")}
                <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 gap-1 text-destructive" onClick={() => commit(blocks.filter((_, i) => i !== index))}>
                  <Trash2 className="size-3.5" /> Remover
                </Button>
              </div>
              <div className={`flex ${alignClass} rounded-md bg-background p-2`}>
                <div style={{ width: `${layout.width}%`, minWidth: 100, maxWidth: "100%" }}>
                  <img src={image.url} alt={`Imagem ${number}`} className="max-h-72 w-full rounded object-contain" style={{ transform: `rotate(${layout.rotation}deg)` }} />
                </div>
              </div>
              <div className="flex items-center gap-2 px-1">
                <Label className="text-xs text-muted-foreground">Tamanho</Label>
                <input type="range" min={15} max={95} step={1} value={layout.width} onChange={(e) => patchLayout(index, image, { width: Number(e.target.value) })} className="h-2 flex-1 accent-primary" />
                <span className="w-10 text-right text-xs text-muted-foreground">{Math.round(layout.width)}%</span>
              </div>
            </div>
          );
        })}
      </div>
      {blocks.length === 1 && (
        <Button type="button" size="sm" variant="outline" className="gap-1" disabled={!canAdd} onClick={() => onRequestImage({ insertAt: 0 })}>
          <ImagePlus className="size-3.5" /> Imagem antes do texto
        </Button>
      )}
    </div>
  );
}

function InsertBar({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-px flex-1 bg-border" />
      <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 text-xs text-muted-foreground" disabled={disabled} onClick={onClick}>
        <ImagePlus className="size-3" /> Inserir imagem aqui
      </Button>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
