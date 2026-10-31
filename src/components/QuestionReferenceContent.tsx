import { ImagePlus } from "lucide-react";
import { RichText } from "@/components/RichText";
import { legacyReferenceToContent, splitContent } from "@/lib/content-blocks";
import {
  DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT,
  normalizeImagePlacementLayout,
  type ImagePlacementLayout,
} from "@/lib/image-layout";
import { cn } from "@/lib/utils";

type Props = {
  text?: string | null;
  textAfter?: string | null;
  mainImage?: string | null;
  mainImagePosition?: string | null;
  mainImageLayout?: Partial<ImagePlacementLayout> | null;
  extraImages?: unknown;
  className?: string;
  textClassName?: string;
  imageClassName?: string;
};

/** Renderiza referências antigas e referências com imagens intercaladas na mesma ordem. */
export function QuestionReferenceContent({
  text,
  textAfter,
  mainImage,
  mainImagePosition,
  mainImageLayout,
  extraImages,
  className,
  textClassName,
  imageClassName,
}: Props) {
  const content = legacyReferenceToContent({
    text: text ?? "",
    textAfter,
    mainImage,
    mainPos: mainImagePosition,
    mainLayout: mainImageLayout,
    extras: extraImages,
  });
  const blocks = splitContent(content.text, content.images);

  if (blocks.length === 0) return null;

  let imageNumber = 0;

  return (
    <div className={cn("space-y-2", className)}>
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return <RichText key={`text-${index}`} text={block.value} className={textClassName} />;
        }

        imageNumber += 1;
        const layout = normalizeImagePlacementLayout({
          ...DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT,
          ...(block.image.layout ?? {}),
          mode: "block",
        });
        const alignment =
          layout.align === "left"
            ? "justify-start"
            : layout.align === "right"
              ? "justify-end"
              : "justify-center";

        return (
          <div key={`image-${imageNumber}`} className={cn("flex", alignment, imageClassName)}>
            {block.image.url ? (
              <img
                src={block.image.url}
                alt={`Imagem da referência ${imageNumber}`}
                className="max-h-96 max-w-full rounded border object-contain"
                style={{ width: `${layout.width}%`, transform: `rotate(${layout.rotation}deg)` }}
              />
            ) : (
              <div
                role="img"
                aria-label={`Espaço reservado para imagem da referência ${imageNumber}`}
                className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground"
                style={{ width: `${layout.width}%`, maxWidth: "100%" }}
              >
                <ImagePlus className="size-5" />
                <span className="font-medium text-foreground">Espaço reservado para imagem {imageNumber}</span>
                <span className="text-xs">Abra a edição da questão para enviar e recortar.</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
