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
  TableLayoutType,
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
    enemSubtitulo: z.string().optional(),
    enemCaderno: z.string().optional(),
    incluirGabarito: z.boolean().default(false),
  }),
});

type EnemQuestion = z.infer<typeof QInput>;
type EnemInput = z.infer<typeof Input>;
type MathComponent = ConstructorParameters<typeof DocxMath>[0]["children"][number];
type DocxChild = Paragraph | Table;
type ImgInfo = { buffer: Buffer; type: "png" | "jpg" | "gif" | "bmp"; width: number; height: number };

const A4_WIDTH_TWIP = 11906;
const A4_HEIGHT_TWIP = 16838;
const TWIP_PER_CM = 567;
const ENEM_BODY_SIZE = 10;
const ENEM_REFERENCE_SIZE = 7;
const ENEM_COLUMN_WIDTH_PX = 350;
const ENEM_TEXT_LINE = 240;
const ENEM_YELLOW = "EEECA3";
const ENEM_BLACK = "111111";
const ENEM_BLUE = "123B66";
const ENEM_GRAY = "666666";
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

const ENEM_COLUMN_OPTIONS = {
  count: 2,
  space: Math.round(0.4 * TWIP_PER_CM),
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

export const generateEnemDocx = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    validateEnemQuestions(data.questions);

    const children = buildEnemChildren(data);
    const doc = new Document({
      creator: "Digitalizador de Questões",
      styles: {
        default: { document: { run: { font: "Calibri", size: ENEM_BODY_SIZE * 2 } } },
      },
      sections: [{
        properties: {
          page: {
            size: { width: A4_WIDTH_TWIP, height: A4_HEIGHT_TWIP },
            margin: {
              top: Math.round(1.1 * TWIP_PER_CM),
              bottom: Math.round(0.9 * TWIP_PER_CM),
              left: Math.round(1 * TWIP_PER_CM),
              right: Math.round(1 * TWIP_PER_CM),
              header: Math.round(0.3 * TWIP_PER_CM),
              footer: Math.round(0.3 * TWIP_PER_CM),
            },
          },
          column: ENEM_COLUMN_OPTIONS,
          columns: ENEM_COLUMN_OPTIONS,
        } as any,
        headers: { default: buildEnemHeader(data.config) },
        footers: { default: buildEnemFooter(buildFooterLabel(data.config)) },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    return { docxBase64: Buffer.from(buffer).toString("base64"), gabaritoBase64: null };
  });

function buildEnemChildren(data: EnemInput): DocxChild[] {
  const { questions, config } = data;
  const children: DocxChild[] = [];
  let previousReferenceKey: string | null = null;

  questions.forEach((question, index) => {
    const referenceKey = getReferenceKey(question);
    const shouldRenderReference = referenceKey && referenceKey !== previousReferenceKey;

    if (index > 0) children.push(spacerParagraph(100));
    children.push(questionHeading(index + 1));

    if (shouldRenderReference) children.push(...referenceChildren(question));
    previousReferenceKey = referenceKey;

    children.push(...richChildrenFromText(question.enunciado, {
      spacingAfter: 70,
      firstLine: Math.round(0.55 * TWIP_PER_CM),
    }));

    if (question.enunciado_imagem) {
      const image = imageParagraph(question.enunciado_imagem, ENEM_COLUMN_WIDTH_PX);
      if (image) children.push(image);
    }

    question.alternativas.slice(0, 5).forEach((alternative) => {
      children.push(alternativeParagraph(alternative.letra, alternative.texto));
      if (alternative.imagem) {
        const image = imageParagraph(alternative.imagem, ENEM_COLUMN_WIDTH_PX - 30, AlignmentType.LEFT);
        if (image) children.push(image);
      }
    });
  });

  if (config.incluirGabarito) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(enemParagraph("GABARITO", { size: 12, bold: true, align: AlignmentType.CENTER, spacingAfter: 160 }));
    questions.forEach((question, index) => {
      children.push(enemParagraph(`${index + 1}. ${question.resposta || "—"}`, { align: AlignmentType.LEFT, spacingAfter: 40 }));
    });
  }

  return children;
}

function buildEnemHeader(config: EnemInput["config"]) {
  const title = config.titulo?.trim() || "SIMULADO";
  const subtitle = config.enemSubtitulo?.trim() || "Simulado de Ciências da Natureza";
  const caderno = config.enemCaderno?.trim() || "CADERNO 1";

  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 10 },
        children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 16 * 2, font: "Calibri", color: ENEM_BLUE })],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 20 },
        children: [new TextRun({ text: `${subtitle} | ${caderno}`, size: 9 * 2, font: "Calibri", color: ENEM_GRAY })],
      }),
      horizontalLine(8, "404040", 10, 40),
    ],
  });
}

function buildEnemFooter(label: string) {
  return new Footer({
    children: [
      horizontalLine(5, "777777", 20, 20),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `${label}  |  Página `, size: 8 * 2, font: "Calibri", color: ENEM_GRAY }),
          new TextRun({ children: [PageNumber.CURRENT], size: 8 * 2, font: "Calibri", color: ENEM_GRAY }),
        ],
      }),
    ],
  });
}

function questionHeading(number: number) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: tableNoBorders(),
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 32, type: WidthType.PERCENTAGE },
          borders: tableNoBorders(),
          children: [new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({ text: `QUESTÃO ${number}`, bold: true, size: 11 * 2, font: "Calibri" })],
          })],
        }),
        lineCell(ENEM_YELLOW),
        lineCell(ENEM_BLACK),
      ],
    })],
  });
}

function lineCell(color: string) {
  return new TableCell({
    borders: { ...tableNoBorders(), bottom: { style: BorderStyle.SINGLE, size: 8, color } },
    children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: "" })] })],
  });
}

function referenceChildren(question: EnemQuestion): DocxChild[] {
  const children: DocxChild[] = [];
  const content = legacyReferenceToContent({
    text: question.referencia_texto ?? "",
    textAfter: question.referencia_texto_apos,
    mainImage: question.referencia_imagem,
    mainPos: question.referencia_imagem_pos,
    mainLayout: question.referencia_imagem_layout,
    extras: question.referencia_imagens_extra,
  });

  for (const block of splitContent(content.text, content.images)) {
    if (block.type === "text") {
      children.push(...richChildrenFromText(block.value, {
        firstLine: Math.round(0.55 * TWIP_PER_CM),
        spacingAfter: 70,
      }));
    } else {
      const image = imageParagraph(block.image.url, ENEM_COLUMN_WIDTH_PX, undefined, block.image.layout);
      if (image) children.push(image);
    }
  }
  if (question.referencia_fonte) {
    children.push(enemParagraph(question.referencia_fonte, {
      size: ENEM_REFERENCE_SIZE,
      align: AlignmentType.RIGHT,
      spacingAfter: 90,
    }));
  }

  return children;
}

function richChildrenFromText(text: string, opts: { firstLine?: number; spacingAfter?: number } = {}): DocxChild[] {
  return parseRichText(text).flatMap((block) => richBlockToDocx(block, opts));
}

function richBlockToDocx(block: RichBlock, opts: { firstLine?: number; spacingAfter?: number }): DocxChild[] {
  if (block.type === "table") return [tableFromRichBlock(block)];
  if (block.type === "list") {
    return block.items.map((item, index) => new Paragraph({
      alignment: alignmentFromRichAlign(block.align),
      spacing: { after: opts.spacingAfter ?? 50, line: ENEM_TEXT_LINE, lineRule: "exact" as any },
      indent: { left: 340, hanging: 220 },
      children: [
        new TextRun({ text: block.ordered ? `${index + 1}. ` : "• ", size: ENEM_BODY_SIZE * 2, font: "Calibri" }),
        ...runsFromRichInlines(item, { size: ENEM_BODY_SIZE }),
      ],
    }));
  }

  return [new Paragraph({
    alignment: alignmentFromRichAlign(block.align),
    spacing: { after: opts.spacingAfter ?? 60, line: ENEM_TEXT_LINE, lineRule: "exact" as any },
    indent: opts.firstLine ? { firstLine: opts.firstLine } : undefined,
    children: runsFromRichInlines(block.inlines, { size: ENEM_BODY_SIZE }),
  })];
}

function tableFromRichBlock(block: Extract<RichBlock, { type: "table" }>) {
  const columnCount = Math.max(1, ...block.rows.map((row) => row.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: thinTableBorders(),
    rows: block.rows.map((row) => new TableRow({
      children: Array.from({ length: columnCount }).map((_, index) => new TableCell({
        children: [new Paragraph({
          alignment: alignmentFromRichAlign(block.align),
          spacing: { after: 20, line: 220, lineRule: "exact" as any },
          children: runsFromRichInlines(row[index] ?? [], { size: 9 }),
        })],
      })),
    })),
  });
}

function alternativeParagraph(letter: string, text: string) {
  const normalized = (letter || "").trim().toUpperCase();
  const circle = { A: "Ⓐ", B: "Ⓑ", C: "Ⓒ", D: "Ⓓ", E: "Ⓔ" }[normalized] ?? `${normalized})`;
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 35, line: ENEM_TEXT_LINE, lineRule: "exact" as any },
    indent: { left: 300, hanging: 230 },
    children: [
      new TextRun({ text: `${circle} `, bold: true, size: ENEM_BODY_SIZE * 2, font: "Calibri" }),
      ...runsFromRichInlines(parseRichInlines(text), { size: ENEM_BODY_SIZE }),
    ],
  });
}

function enemParagraph(text: string, opts: { size?: number; bold?: boolean; align?: typeof AlignmentType[keyof typeof AlignmentType]; spacingAfter?: number } = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    spacing: { after: opts.spacingAfter ?? 60, line: ENEM_TEXT_LINE, lineRule: "exact" as any },
    children: [new TextRun({ text, size: (opts.size ?? ENEM_BODY_SIZE) * 2, bold: opts.bold, font: "Calibri" })],
  });
}

function spacerParagraph(after: number) {
  return new Paragraph({ spacing: { after }, children: [new TextRun({ text: "" })] });
}

function horizontalLine(size: number, color: string, before = 50, after = 50) {
  return new Paragraph({
    spacing: { before, after },
    border: { bottom: { color, size, style: BorderStyle.SINGLE, space: 1 } },
    children: [new TextRun({ text: "" })],
  });
}

function runsFromRichInlines(inlines: RichInline[], opts: { size: number }) {
  return inlines.map((inline) => {
    if (inline.type === "break") return new TextRun({ break: 1, font: "Calibri" });
    if (inline.type === "math") return latexMathRun(inline.latex);
    return new TextRun({
      text: inline.text,
      size: opts.size * 2,
      bold: inline.bold,
      italics: inline.italic,
      underline: inline.underline ? { type: UnderlineType.SINGLE } : undefined,
      superScript: inline.superscript,
      subScript: inline.subscript,
      font: "Calibri",
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
    spacing: { after: 70 },
    children: [new ImageRun({
      type: img.type,
      data: img.buffer,
      transformation: { width: Math.round(width), height: Math.round(height), ...(placement ? { rotation: placement.rotation } : {}) },
    })],
  });
}

function decodeDataUrl(dataUrl: string): ImgInfo | null {
  const match = dataUrl.match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i);
  if (!match) return null;
  const ext = match[1].toLowerCase();
  const type: ImgInfo["type"] = ext === "jpeg" || ext === "jpg" ? "jpg" : (ext as ImgInfo["type"]);
  const buffer = Buffer.from(match[2], "base64");
  const dims = readImageSize(buffer, type);
  return { buffer, type, width: dims.w, height: dims.h };
}

function readImageSize(buffer: Buffer, type: ImgInfo["type"]): { w: number; h: number } {
  try {
    if (type === "png" && buffer.length >= 24) return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
    if (type === "jpg") {
      let i = 2;
      while (i < buffer.length) {
        if (buffer[i] !== 0xff) { i++; continue; }
        const marker = buffer[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { w: buffer.readUInt16BE(i + 7), h: buffer.readUInt16BE(i + 5) };
        }
        i += 2 + buffer.readUInt16BE(i + 2);
      }
    }
    if (type === "gif" && buffer.length >= 10) return { w: buffer.readUInt16LE(6), h: buffer.readUInt16LE(8) };
  } catch {}
  return { w: 400, h: 300 };
}

function alignmentFromRichAlign(align: RichAlign) {
  if (align === "left") return AlignmentType.LEFT;
  if (align === "center") return AlignmentType.CENTER;
  if (align === "right") return AlignmentType.RIGHT;
  return AlignmentType.JUSTIFIED;
}

function getReferenceKey(question: EnemQuestion) {
  const extraImages = normalizeExtraImages(question.referencia_imagens_extra);
  const hasReference = Boolean(question.referencia_texto?.trim() || question.referencia_texto_apos?.trim() || question.referencia_imagem || extraImages.length > 0);
  if (!hasReference) return null;
  if (question.grupo_id?.trim()) return `grupo:${question.grupo_id.trim()}`;
  const extraImageSignature = extraImages.map((image) => `${image.url.length}:${image.url.slice(0, 64)}:${image.url.slice(-64)}:${JSON.stringify(image.layout)}`).join(",");
  return [question.referencia_texto?.trim() ?? "", question.referencia_texto_apos?.trim() ?? "", question.referencia_imagem ?? "", extraImageSignature].join("|");
}

function buildFooterLabel(config: EnemInput["config"]) {
  const subtitle = config.enemSubtitulo?.trim() || "SIMULADO";
  const caderno = config.enemCaderno?.trim() || "CADERNO 1";
  return `${subtitle.toUpperCase()} | ${caderno.toUpperCase()}`;
}

function validateEnemQuestions(questions: EnemQuestion[]) {
  const invalid = questions.filter((question) => !isEnemQuestion(question));
  if (invalid.length > 0) {
    throw new Error("Este modelo é exclusivo para questões do ENEM. Remova as questões que não pertencem ao ENEM ou escolha outro modelo de formatação.");
  }
}

function isEnemQuestion(question: Pick<EnemQuestion, "prova" | "instituicao" | "fonte" | "referencia_fonte">) {
  return [question.prova, question.instituicao, question.fonte, question.referencia_fonte].some(isEnemProof);
}

function isEnemProof(value: unknown) {
  const normalized = normalizeProofName(value);
  return normalized.includes("ENEM") || normalized.includes("EXAME NACIONAL DO ENSINO MEDIO");
}

function normalizeProofName(value: unknown) {
  return (typeof value === "string" ? value : value == null ? "" : String(value))
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function tableNoBorders() {
  return { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
}

function thinTableBorders() {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "777777" };
  return { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
}
