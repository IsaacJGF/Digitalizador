import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuestionReferenceContent } from "@/components/QuestionReferenceContent";
import { RichText } from "@/components/RichText";
import {
  DEFAULT_IMAGE_PLACEMENT_LAYOUT,
  DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT,
  normalizeExtraImages,
  normalizeImagePlacementLayout,
  type ExtraImage,
  type ImagePlacementLayout,
} from "@/lib/image-layout";
import type { DraftQuestion } from "@/lib/draft-store";

export type PreviewQuestion = {
  numero?: string | null;
  tipo: string;
  enunciado: string;
  enunciado_imagem?: string | null;
  enunciado_imagem_pos?: string | null;
  enunciado_imagem_layout?: Partial<ImagePlacementLayout> | null;
  enunciado_imagens_extra?: unknown;
  alternativas: { letra: string; texto: string; imagem?: string | null }[];
  resposta?: string | null;
  fonte?: string | null;
};

type PreviewContentProps = {
  question: PreviewQuestion;
  itemIndex: number;
  itemCount: number;
  referenceText: string;
  referenceImages: ExtraImage[];
  referenceSource?: string | null;
  questionNumberPosition?: "top" | "section";
};

type Props = Omit<PreviewContentProps, "question" | "questionNumberPosition"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: DraftQuestion;
};

export function QuestionPreviewDialog({
  open,
  onOpenChange,
  question,
  itemIndex,
  itemCount,
  referenceText,
  referenceImages,
  referenceSource,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pré-visualização da questão</DialogTitle>
          <DialogDescription>
            Confira o texto-base, o enunciado, as imagens e as alternativas na ordem atual.
          </DialogDescription>
        </DialogHeader>
        <QuestionPreviewContent
          question={question}
          itemIndex={itemIndex}
          itemCount={itemCount}
          referenceText={referenceText}
          referenceImages={referenceImages}
          referenceSource={referenceSource}
        />
      </DialogContent>
    </Dialog>
  );
}

export function QuestionPreviewContent({
  question,
  itemIndex,
  itemCount,
  referenceText,
  referenceImages,
  referenceSource,
  questionNumberPosition = "section",
}: PreviewContentProps) {
  const referenceHasContent = Boolean(referenceText.trim() || referenceImages.length);
  const statementExtras = normalizeExtraImages(question.enunciado_imagens_extra);
  const extraImagesBefore = statementExtras.filter((image) => image.pos === "antes");
  const extraImagesAfter = statementExtras.filter((image) => image.pos !== "antes");
  const statementLayout = question.enunciado_imagem && question.enunciado_imagem_layout
    ? normalizeImagePlacementLayout({
        ...DEFAULT_IMAGE_PLACEMENT_LAYOUT,
        ...question.enunciado_imagem_layout,
      })
    : null;
  const floatingStatementImage = Boolean(
    question.enunciado_imagem && statementLayout && statementLayout.mode !== "block",
  );
  const questionNumber = question.numero?.trim() || String(itemIndex + 1);
  const typeLabel = QUESTION_TYPE_LABELS[question.tipo] ?? question.tipo;

  return (
    <article className="mx-auto w-full max-w-3xl space-y-5 rounded-md border bg-white p-5 text-gray-950 shadow-sm sm:p-8">
      {questionNumberPosition === "top" && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
          <h2 className="font-semibold">Questão {questionNumber}</h2>
          <span className="text-xs text-gray-600">{typeLabel}</span>
        </div>
      )}

      {referenceHasContent && (
        <section className="border-b pb-4">
          <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-gray-600">
            Texto-base{itemCount > 1 ? " comum" : ""}
          </h2>
          <QuestionReferenceContent
            text={referenceText}
            extraImages={referenceImages}
            className="text-sm leading-relaxed"
          />
          {referenceSource?.trim() && (
            <p className="mt-3 text-right text-xs italic text-gray-600">
              Fonte: {referenceSource}
            </p>
          )}
        </section>
      )}

      <section>
        {questionNumberPosition === "top" ? (
          <h2 className="mb-3 border-b pb-2 font-semibold">Enunciado</h2>
        ) : (
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
            <h2 className="font-semibold">Questão {questionNumber}</h2>
            <span className="text-xs text-gray-600">
              {itemCount > 1 ? "Item " + (itemIndex + 1) + " de " + itemCount + " · " : ""}
              {typeLabel}
            </span>
          </div>
        )}

        {extraImagesBefore.map((image, index) => (
          <BlockImage
            key={"statement-before-" + index}
            image={image}
            alt={"Imagem do enunciado " + (index + 1)}
          />
        ))}

        {floatingStatementImage && question.enunciado_imagem && statementLayout ? (
          <FloatingStatement
            imageUrl={question.enunciado_imagem}
            layout={statementLayout}
            text={question.enunciado}
          />
        ) : (
          <>
            {question.enunciado_imagem && question.enunciado_imagem_pos === "antes" && (
              <StandaloneStatementImage
                imageUrl={question.enunciado_imagem}
                layout={statementLayout}
              />
            )}
            <RichText
              text={question.enunciado || "Enunciado não preenchido."}
              className="text-sm leading-relaxed"
            />
            {question.enunciado_imagem && question.enunciado_imagem_pos !== "antes" && (
              <StandaloneStatementImage
                imageUrl={question.enunciado_imagem}
                layout={statementLayout}
              />
            )}
          </>
        )}

        {extraImagesAfter.map((image, index) => (
          <BlockImage
            key={"statement-after-" + index}
            image={image}
            alt={"Imagem adicional do enunciado " + (index + 1)}
          />
        ))}
      </section>

      {question.alternativas.length > 0 && (
        <section className="space-y-3 border-t pt-4">
          <h2 className="font-semibold">Alternativas</h2>
          <ol className="space-y-3">
            {question.alternativas.map((alternative, index) => (
              <li
                key={(alternative.letra || index + 1) + "-" + index}
                className="flex gap-2 text-sm leading-relaxed"
              >
                <span className="shrink-0 font-semibold">
                  {(alternative.letra || index + 1) + ")"}
                </span>
                <div className="min-w-0 flex-1">
                  <RichText text={alternative.texto || "(sem texto)"} />
                  {alternative.imagem && (
                    <img
                      src={alternative.imagem}
                      alt={"Imagem da alternativa " + (alternative.letra || index + 1)}
                      className="mt-2 max-h-40 max-w-full rounded border object-contain"
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {question.resposta?.trim() && (
        <section className="border-t pt-3 text-sm">
          <span className="font-semibold">Gabarito: </span>
          {question.resposta}
        </section>
      )}
      {question.fonte?.trim() && (
        <p className="text-right text-xs italic text-gray-600">
          Fonte da questão: {question.fonte}
        </p>
      )}
    </article>
  );
}

function FloatingStatement({
  imageUrl,
  layout,
  text,
}: {
  imageUrl: string;
  layout: ImagePlacementLayout;
  text: string;
}) {
  return (
    <div className="relative min-h-[300px] overflow-hidden rounded border bg-white p-3">
      <div className="relative z-0 min-h-[276px]">
        <RichText text={text || "Enunciado não preenchido."} className="text-sm leading-relaxed" />
      </div>
      <img
        src={imageUrl}
        alt="Imagem posicionada no enunciado"
        className="absolute z-10 rounded border bg-white object-fill shadow-sm"
        style={{
          left: layout.x + "%",
          top: layout.y + "%",
          width: layout.width + "%",
          height: layout.height + "%",
          transform: "rotate(" + layout.rotation + "deg)",
        }}
      />
    </div>
  );
}

function StandaloneStatementImage({
  imageUrl,
  layout,
}: {
  imageUrl: string;
  layout: ImagePlacementLayout | null;
}) {
  const placement = normalizeImagePlacementLayout({
    ...DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT,
    ...(layout ?? {}),
    width: layout?.width ?? 100,
    mode: "block",
  });
  const alignment =
    placement.align === "left"
      ? "justify-start"
      : placement.align === "right"
        ? "justify-end"
        : "justify-center";
  return (
    <div className={"my-3 flex " + alignment}>
      <img
        src={imageUrl}
        alt="Imagem do enunciado"
        className="max-h-96 max-w-full rounded border object-contain"
        style={{ width: placement.width + "%", transform: "rotate(" + placement.rotation + "deg)" }}
      />
    </div>
  );
}

function BlockImage({ image, alt }: { image: ExtraImage; alt: string }) {
  const layout = normalizeImagePlacementLayout({
    ...DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT,
    ...(image.layout ?? {}),
    mode: "block",
  });
  const alignment =
    layout.align === "left"
      ? "justify-start"
      : layout.align === "right"
        ? "justify-end"
        : "justify-center";
  return (
    <div className={"my-3 flex " + alignment}>
      <img
        src={image.url}
        alt={alt}
        className="max-h-96 max-w-full rounded border object-contain"
        style={{ width: layout.width + "%", transform: "rotate(" + layout.rotation + "deg)" }}
      />
    </div>
  );
}

const QUESTION_TYPE_LABELS: Record<string, string> = {
  multipla_escolha: "Múltipla escolha",
  certo_errado: "Certo ou errado",
  numerica: "Numérica",
  discursiva: "Discursiva",
};
