import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Math as DocxMath,
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSuperScript,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from "docx";
import { DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT, normalizeExtraImages, normalizeImagePlacementLayout, type ImagePlacementLayout } from "@/lib/image-layout";
import { legacyReferenceToContent, splitContent } from "@/lib/content-blocks";
import { parseRichInlines, parseRichText, type RichAlign, type RichBlock, type RichInline } from "@/lib/rich-text";

const Alt = z.object({ letra: z.string(), texto: z.string(), imagem: z.string().nullable().optional() });
const ImagePlacement = z.any().nullable().optional();
const QInput = z.object({
  id: z.string(),
  numero: z.string().nullable().optional(),
  enunciado: z.string(),
  alternativas: z.array(Alt),
  resposta: z.string().nullable().optional(),
  fonte: z.string().nullable().optional(),
  referencia_texto: z.string().nullable().optional(),
  referencia_fonte: z.string().nullable().optional(),
  referencia_imagem: z.string().nullable().optional(),
  referencia_imagem_pos: z.string().nullable().optional(),
  referencia_imagem_layout: ImagePlacement,
  referencia_texto_apos: z.string().nullable().optional(),
  referencia_imagens_extra: z.any().nullable().optional(),
  grupo_id: z.string().nullable().optional(),
  enunciado_imagem: z.string().nullable().optional(),
  enunciado_imagem_pos: z.string().nullable().optional(),
  enunciado_imagem_layout: ImagePlacement,
  prova: z.string().nullable().optional(),
  instituicao: z.string().nullable().optional(),
  ano: z.string().nullable().optional(),
});

const Input = z.object({
  questions: z.array(QInput),
  config: z.object({
    titulo: z.string().optional(),
    incluirGabarito: z.boolean().default(false),
    gabaritoSeparado: z.boolean().default(false),
  }),
});

type PasQuestion = z.infer<typeof QInput>;
type PasInput = z.infer<typeof Input>;
type MathComponent = ConstructorParameters<typeof DocxMath>[0]["children"][number];
type DocxChild = Paragraph | Table;

type ImgInfo = { buffer: Buffer; type: "png" | "jpg" | "gif" | "bmp"; width: number; height: number };

const A4_WIDTH_TWIP = 11906;
const A4_HEIGHT_TWIP = 16838;
const TWIP_PER_CM = 567;
const PAS_BODY_SIZE = 10;
const PAS_REFERENCE_SIZE = 6;
const PAS_HEADER_SIZE = 9;
const PAS_COLUMN_WIDTH_PX = 355;
const PAS_COLUMN_OPTIONS = {
  count: 2,
  space: Math.round(0.3 * TWIP_PER_CM),
  separator: true,
  sep: true,
  equalWidth: true,
};

const MATH_SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  Delta: "Δ",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  varphi: "φ",
  phi: "φ",
  sigma: "σ",
  Omega: "Ω",
  omega: "ω",
  times: "×",
  cdot: "·",
  pm: "±",
  leq: "≤",
  geq: "≥",
  neq: "≠",
  approx: "≈",
  infty: "∞",
  rightarrow: "→",
  leftarrow: "←",
  to: "→",
  circ: "°",
};

export const generatePasDocx = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    validatePasQuestions(data.questions);

    const children = buildPasChildren(data);
    const doc = new Document({
      creator: "Digitalizador de Questões",
      styles: {
        default: { document: { run: { font: "Times New Roman", size: PAS_BODY_SIZE * 2 } } },
      },
      sections: [{
        properties: {
          page: {
            size: { width: A4_WIDTH_TWIP, height: A4_HEIGHT_TWIP },
            margin: {
              top: Math.round(0.8 * TWIP_PER_CM),
              bottom: Math.round(0.9 * TWIP_PER_CM),
              left: Math.round(1 * TWIP_PER_CM),
              right: Math.round(1 * TWIP_PER_CM),
              header: Math.round(0.25 * TWIP_PER_CM),
              footer: Math.round(0.25 * TWIP_PER_CM),
            },
          },
          column: PAS_COLUMN_OPTIONS,
          columns: PAS_COLUMN_OPTIONS,
        } as any,
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 20 },
                children: [new TextRun({ text: data.config.titulo || "SIMULADO", bold: true, italics: true, size: PAS_HEADER_SIZE * 2, font: "Arial" })],
              }),
              horizontalLine(12, "404040"),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              horizontalLine(8, "000000"),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 20 },
                children: [new TextRun({ children: [PageNumber.CURRENT], size: 8 * 2, font: "Arial" })],
              }),
            ],
          }),
        },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    return { docxBase64: Buffer.from(buffer).toString("base64"), gabaritoBase64: null };
  });

function buildPasChildren(data: PasInput): DocxChild[] {
  const { questions, config } = data;
  const children: DocxChild[] = [];
  let previousReferenceKey: string | null = null;
  let renderedAnyReference = false;

  questions.forEach((q, idx) => {
    const referenceKey = getReferenceKey(q);
    const hasReference = Boolean(referenceKey);
    const shouldRenderReference = hasReference && referenceKey !== previousReferenceKey;

    if (shouldRenderReference) {
      if (renderedAnyReference) children.push(horizontalLine(4, "666666"));
      children.push(...referenceChildren(q));
      renderedAnyReference = true;
    }
    previousReferenceKey = hasReference ? referenceKey : null;

    children.push(itemParagraph(idx + 1, q.enunciado));

    if (q.enunciado_imagem) {
      const img = imageParagraph(q.enunciado_imagem, PAS_COLUMN_WIDTH_PX);
      if (img) children.push(img);
    }

    q.alternativas.forEach((alt) => {
      children.push(alternativeParagraph(alt.letra, alt.texto));
      if (alt.imagem) {
        const img = imageParagraph(alt.imagem, PAS_COLUMN_WIDTH_PX - 40, AlignmentType.LEFT);
        if (img) children.push(img);
      }
    });
  });

  if (config.incluirGabarito) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(pasParagraph("GABARITO", { size: 12, bold: true, align: AlignmentType.CENTER, spacingAfter: 160 }));
    questions.forEach((q, idx) => {
      children.push(pasParagraph(`${idx + 1}. ${q.resposta || "—"}`, { align: AlignmentType.LEFT, spacingAfter: 40 }));
    });
  }

  return children;
}

function referenceChildren(q: PasQuestion): DocxChild[] {
  const children: DocxChild[] = [];
  const content = legacyReferenceToContent({
    text: q.referencia_texto ?? "",
    textAfter: q.referencia_texto_apos,
    mainImage: q.referencia_imagem,
    mainPos: q.referencia_imagem_pos,
    mainLayout: q.referencia_imagem_layout,
    extras: q.referencia_imagens_extra,
  });

  for (const block of splitContent(content.text, content.images)) {
    if (block.type === "text") {
      children.push(...richChildrenFromText(block.value, { firstLine: Math.round(1 * TWIP_PER_CM), spacingAfter: 90 }));
    } else {
      const image = imageParagraph(block.image.url, PAS_COLUMN_WIDTH_PX, undefined, block.image.layout);
      if (image) children.push(image);
    }
  }
  if (q.referencia_fonte) children.push(pasParagraph(q.referencia_fonte, { size: PAS_REFERENCE_SIZE, align: AlignmentType.RIGHT, spacingAfter: 120 }));

  return children;
}

function itemParagraph(number: number, text: string) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 80, after: 70, line: 240, lineRule: "exact" as any },
    indent: { left: 320, hanging: 320 },
    children: [
      new TextRun({ text: `${number} `, bold: true, size: PAS_BODY_SIZE * 2, font: "Times New Roman" }),
      ...runsFromRichInlines(parseRichInlines(text), { size: PAS_BODY_SIZE }),
    ],
  });
}

function alternativeParagraph(letter: string, text: string) {
  const normalized = (letter || "").trim().toUpperCase();
  const circle = { A: "Ⓐ", B: "Ⓑ", C: "Ⓒ", D: "Ⓓ", E: "Ⓔ" }[normalized] ?? `${normalized})`;
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 50, line: 240, lineRule: "exact" as any },
    indent: { left: 360, hanging: 280 },
    children: [
      new TextRun({ text: `${circle} `, bold: true, size: PAS_BODY_SIZE * 2, font: "Times New Roman" }),
      ...runsFromRichInlines(parseRichInlines(text), { size: PAS_BODY_SIZE }),
    ],
  });
}

function richChildrenFromText(text: string, opts: { firstLine?: number; spacingAfter?: number } = {}): DocxChild[] {
  return parseRichText(text).flatMap((block) => richBlockToDocx(block, opts));
}

function richBlockToDocx(block: RichBlock, opts: { firstLine?: number; spacingAfter?: number }): DocxChild[] {
  if (block.type === "table") return [tableFromRichBlock(block)];
  if (block.type === "list") {
    return block.items.map((item, index) => new Paragraph({
      alignment: alignmentFromRichAlign(block.align),
      spacing: { after: opts.spacingAfter ?? 70, line: 240, lineRule: "exact" as any },
      indent: { left: 360, hanging: 240 },
      children: [
        new TextRun({ text: block.ordered ? `${index + 1}. ` : "• ", size: PAS_BODY_SIZE * 2, font: "Times New Roman" }),
        ...runsFromRichInlines(item, { size: PAS_BODY_SIZE }),
      ],
    }));
  }

  return [new Paragraph({
    alignment: alignmentFromRichAlign(block.align),
    spacing: { after: opts.spacingAfter ?? 80, line: 240, lineRule: "exact" as any },
    indent: opts.firstLine ? { firstLine: opts.firstLine } : undefined,
    children: runsFromRichInlines(block.inlines, { size: PAS_BODY_SIZE }),
  })];
}

function tableFromRichBlock(block: Extract<RichBlock, { type: "table" }>) {
  const columnCount = Math.max(1, ...block.rows.map((row) => row.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: block.rows.map((row) => new TableRow({
      children: Array.from({ length: columnCount }).map((_, index) => new TableCell({
        children: [new Paragraph({
          alignment: alignmentFromRichAlign(block.align),
          spacing: { after: 20, line: 220, lineRule: "exact" as any },
          children: runsFromRichInlines(row[index] ?? [], { size: PAS_BODY_SIZE }),
        })],
      })),
    })),
  });
}

function pasParagraph(text: string, opts: { size?: number; bold?: boolean; align?: typeof AlignmentType[keyof typeof AlignmentType]; spacingAfter?: number } = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    spacing: { after: opts.spacingAfter ?? 80, line: 240, lineRule: "exact" as any },
    children: [new TextRun({ text, size: (opts.size ?? PAS_BODY_SIZE) * 2, bold: opts.bold, font: "Times New Roman" })],
  });
}

function runsFromRichInlines(inlines: RichInline[], opts: { size: number }) {
  return inlines.map((inline) => {
    if (inline.type === "break") return new TextRun({ break: 1, font: "Times New Roman" });
    if (inline.type === "math") return latexMathRun(inline.latex);
    return new TextRun({
      text: inline.text,
      size: opts.size * 2,
      bold: inline.bold,
      italics: inline.italic,
      underline: inline.underline ? { type: UnderlineType.SINGLE } : undefined,
      superScript: inline.superscript,
      subScript: inline.subscript,
      font: "Times New Roman",
    });
  });
}

function latexMathRun(latex: string) {
  return new DocxMath({ children: latexToMathComponents(latex.trim()) });
}

function latexToMathComponents(latex: string): MathComponent[] {
  const components: MathComponent[] = [];
  let text = "";
  const flushText = () => {
    if (text) {
      components.push(new MathRun(text));
      text = "";
    }
  };

  for (let i = 0; i < latex.length;) {
    const char = latex[i];
    if (char === "\\" && latex[i + 1] === "\\") {
      text += " ";
      i += 2;
      continue;
    }
    if (char === "\\") {
      const commandMatch = latex.slice(i + 1).match(/^[A-Za-z]+/);
      const command = commandMatch?.[0] ?? "";
      if (command === "frac") {
        flushText();
        const numerator = readLatexGroup(latex, i + 1 + command.length);
        const denominator = numerator ? readLatexGroup(latex, numerator.end) : null;
        if (numerator && denominator) {
          components.push(new MathFraction({ numerator: latexToMathComponents(numerator.value), denominator: latexToMathComponents(denominator.value) }));
          i = denominator.end;
          continue;
        }
      }
      if (command === "sqrt") {
        flushText();
        const radicand = readLatexGroup(latex, i + 1 + command.length);
        if (radicand) {
          components.push(new MathRadical({ children: latexToMathComponents(radicand.value) }));
          i = radicand.end;
          continue;
        }
      }
      text += MATH_SYMBOLS[command] ?? command;
      i += command ? command.length + 1 : 1;
      continue;
    }
    if ((char === "^" || char === "_") && i + 1 < latex.length) {
      flushText();
      const base = components.pop() ?? new MathRun("");
      const script = readLatexScript(latex, i + 1);
      const scriptComponents = latexToMathComponents(script.value);
      components.push(char === "^"
        ? new MathSuperScript({ children: [base], superScript: scriptComponents })
        : new MathSubScript({ children: [base], subScript: scriptComponents }));
      i = script.end;
      continue;
    }
    if (char === "{" || char === "}") {
      i++;
      continue;
    }
    text += char;
    i++;
  }

  flushText();
  return components.length > 0 ? components : [new MathRun(latex)];
}

function readLatexGroup(input: string, start: number): { value: string; end: number } | null {
  if (input[start] !== "{") return null;
  return readLatexScript(input, start);
}

function readLatexScript(input: string, start: number): { value: string; end: number } {
  if (input[start] === "{") {
    let depth = 1;
    let i = start + 1;
    while (i < input.length && depth > 0) {
      if (input[i] === "{") depth++;
      if (input[i] === "}") depth--;
      i++;
    }
    return { value: input.slice(start + 1, Math.max(start + 1, i - 1)), end: i };
  }
  if (input[start] === "\\") {
    const command = input.slice(start).match(/^\\[A-Za-z]+/);
    if (command) return { value: command[0], end: start + command[0].length };
  }
  return { value: input[start] ?? "", end: start + 1 };
}

function imageParagraph(dataUrl: string, maxWidthPx: number, align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.CENTER, placementInput?: unknown): Paragraph | null {
  const img = decodeDataUrl(dataUrl);
  if (!img) return null;
  const ratio = img.height / img.width;
  const placement = placementInput
    ? normalizeImagePlacementLayout({ ...DEFAULT_REFERENCE_IMAGE_BLOCK_LAYOUT, ...(placementInput as Partial<ImagePlacementLayout>), mode: "block" })
    : null;
  const width = Math.max(40, Math.min(maxWidthPx, img.width, placement ? (maxWidthPx * placement.width) / 100 : maxWidthPx));
  const height = width * ratio;
  return new Paragraph({
    alignment: placement?.align === "left" ? AlignmentType.LEFT : placement?.align === "right" ? AlignmentType.RIGHT : align,
    spacing: { after: 80 },
    children: [new ImageRun({
      type: img.type,
      data: img.buffer,
      transformation: { width: Math.round(width), height: Math.round(height), ...(placement ? { rotation: placement.rotation } : {}) },
    })],
  });
}

function decodeDataUrl(dataUrl: string): ImgInfo | null {
  const m = dataUrl.match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  const type: ImgInfo["type"] = ext === "jpeg" || ext === "jpg" ? "jpg" : (ext as ImgInfo["type"]);
  const buffer = Buffer.from(m[2], "base64");
  const dims = readImageSize(buffer, type);
  return { buffer, type, width: dims.w, height: dims.h };
}

function readImageSize(buf: Buffer, type: ImgInfo["type"]): { w: number; h: number } {
  try {
    if (type === "png" && buf.length >= 24) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (type === "jpg") {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (type === "gif" && buf.length >= 10) return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  } catch {}
  return { w: 400, h: 300 };
}

function horizontalLine(size: number, color: string) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    border: { bottom: { color, size, style: BorderStyle.SINGLE, space: 1 } },
    children: [new TextRun({ text: "" })],
  });
}

function alignmentFromRichAlign(align: RichAlign) {
  if (align === "left") return AlignmentType.LEFT;
  if (align === "center") return AlignmentType.CENTER;
  if (align === "right") return AlignmentType.RIGHT;
  return AlignmentType.JUSTIFIED;
}

function getReferenceKey(q: PasQuestion) {
  const extraImages = normalizeExtraImages(q.referencia_imagens_extra);
  const hasReference = Boolean(q.referencia_texto?.trim() || q.referencia_texto_apos?.trim() || q.referencia_imagem || extraImages.length > 0);
  if (!hasReference) return null;
  if (q.grupo_id?.trim()) return `grupo:${q.grupo_id.trim()}`;
  const extraImageSignature = extraImages.map((image) => `${image.url.length}:${image.url.slice(0, 64)}:${image.url.slice(-64)}:${JSON.stringify(image.layout)}`).join(",");
  return [q.referencia_texto?.trim() ?? "", q.referencia_texto_apos?.trim() ?? "", q.referencia_imagem ?? "", extraImageSignature].join("|");
}

function validatePasQuestions(questions: PasQuestion[]) {
  const invalid = questions.filter((q) => !isPasProof(q.prova));
  if (invalid.length > 0) {
    throw new Error("Este modelo é exclusivo para questões do PAS. Remova as questões que não pertencem ao PAS ou escolha outro modelo de formatação.");
  }
}

function isPasProof(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  return normalized === "PAS" || normalized === "PAS 1" || normalized === "PAS 2" || normalized === "PAS 3" || normalized === "PAS1" || normalized === "PAS2" || normalized === "PAS3";
}
