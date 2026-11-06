import { parseRichTableDraft } from "@/lib/rich-table-format";

export type RichAlign = "left" | "center" | "right" | "justify";
export type RichListStyle = "bullet" | "decimal" | "upper-alpha";

export type RichInline =
  | { type: "text"; text: string; bold?: boolean; italic?: boolean; underline?: boolean; superscript?: boolean; subscript?: boolean; highlight?: boolean }
  | { type: "math"; latex: string; display: boolean }
  | { type: "break" };

export type RichTableCell = { inlines: RichInline[]; background: string | null };

export type RichBlock =
  | { type: "paragraph"; align: RichAlign; inlines: RichInline[] }
  | { type: "list"; align: RichAlign; ordered: boolean; listStyle: RichListStyle; items: RichInline[][] }
  | { type: "table"; align: RichAlign; headerRow: boolean; rows: RichTableCell[][] };

type InlineStyle = Omit<Extract<RichInline, { type: "text" }>, "type" | "text">;

type StyleToken = {
  start: number;
  end: number;
  innerStart: number;
  innerEnd: number;
  style: InlineStyle;
};

const BARE_LATEX_COMMANDS = new Set([
  "alpha", "beta", "gamma", "delta", "Delta", "epsilon", "varepsilon", "theta", "lambda", "mu", "pi",
  "rho", "sigma", "phi", "varphi", "omega", "Omega", "nabla", "times", "cdot", "pm", "mp", "le",
  "leq", "ge", "geq", "neq", "approx", "sim", "propto", "infty", "rightarrow", "to", "leftarrow",
  "leftrightarrow", "degree", "circ", "ohm", "partial", "sum", "int", "div", "frac", "dfrac", "tfrac",
  "sqrt", "vec", "bar", "overline", "hat", "sin", "cos", "tan", "sen", "log", "ln", "lim",
]);

export function parseRichText(text: string | null | undefined): RichBlock[] {
  const normalized = normalizeInput(text ?? "");
  if (!normalized.trim()) return [];

  const rawBlocks = splitBlocks(normalized);
  return rawBlocks.flatMap<RichBlock>((rawBlock) => {
    const { align, text: blockText } = extractAlignment(rawBlock);
    const lines = blockText.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) return [];

    const table = parseRichTableDraft(blockText);
    if (table) {
      return [{
        type: "table",
        align,
        headerRow: table.headerRow,
        rows: table.rows.map((row) => row.map((cell) => ({
          inlines: parseRichInlines(cell.text),
          background: cell.background,
        }))),
      } satisfies RichBlock];
    }

    const list = parseList(lines);
    if (list) return [{ type: "list", align, ...list } satisfies RichBlock];

    return [{ type: "paragraph", align, inlines: parseRichInlines(blockText) } satisfies RichBlock];
  });
}

export function parseRichInlines(text: string | null | undefined): RichInline[] {
  const value = normalizeInput(text ?? "");
  if (!value) return [];

  const segments = splitMathSegments(value);
  return segments.flatMap((segment) => {
    if (segment.type === "math") return [{ type: "math", latex: segment.value, display: segment.display } satisfies RichInline];
    return parseStyledText(segment.value, {});
  });
}

function normalizeInput(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitBlocks(text: string) {
  return text
    .split(/\n{2,}/g)
    .map((block) => block.trim())
    .filter(Boolean);
}

function extractAlignment(block: string): { align: RichAlign; text: string } {
  const trimmed = block.trim();
  const wrapped = trimmed.match(/^\[(left|center|right|justify)\]\s*([\s\S]*?)\s*\[\/\1\]$/i)
    ?? trimmed.match(/^<(left|center|right|justify)>\s*([\s\S]*?)\s*<\/\1>$/i);
  if (wrapped) return { align: normalizeAlign(wrapped[1]), text: wrapped[2].trim() };

  const lines = trimmed.split("\n");
  const first = lines[0]?.trim().match(/^\[(left|center|right|justify)\]$/i);
  const last = lines[lines.length - 1]?.trim().match(/^\[\/(left|center|right|justify)\]$/i);
  if (first && last && first[1].toLowerCase() === last[1].toLowerCase()) {
    return { align: normalizeAlign(first[1]), text: lines.slice(1, -1).join("\n").trim() };
  }

  const prefixed = trimmed.match(/^::(left|center|right|justify)::\s*([\s\S]*)$/i);
  if (prefixed) return { align: normalizeAlign(prefixed[1]), text: prefixed[2].trim() };

  return { align: "justify", text: trimmed };
}

function normalizeAlign(value: string): RichAlign {
  const lower = value.toLowerCase();
  if (lower === "left" || lower === "center" || lower === "right" || lower === "justify") return lower;
  return "justify";
}

function parseList(lines: string[]): { ordered: boolean; listStyle: RichListStyle; items: RichInline[][] } | null {
  const numbered = lines.every((line) => /^\s*\d+[.)]\s+/.test(line));
  const lettered = lines.every((line) => /^\s*[A-Za-z][.)]\s+/.test(line));
  const unordered = lines.every((line) => /^\s*[-*•]\s+/.test(line));
  if (!numbered && !lettered && !unordered) return null;
  const markerRegex = numbered
    ? /^\s*\d+[.)]\s+/
    : lettered
      ? /^\s*[A-Za-z][.)]\s+/
      : /^\s*[-*•]\s+/;
  return {
    ordered: numbered || lettered,
    listStyle: numbered ? "decimal" : lettered ? "upper-alpha" : "bullet",
    items: lines.map((line) => parseRichInlines(line.replace(markerRegex, ""))),
  };
}

function splitMathSegments(text: string): Array<{ type: "text"; value: string } | { type: "math"; value: string; display: boolean }> {
  const segments: Array<{ type: "text"; value: string } | { type: "math"; value: string; display: boolean }> = [];
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) {
      segments.push({ type: "text", value: plain });
      plain = "";
    }
  };

  while (i < text.length) {
    if (text.startsWith("$$", i)) {
      const end = text.indexOf("$$", i + 2);
      if (end !== -1) {
        flush();
        segments.push({ type: "math", value: text.slice(i + 2, end), display: true });
        i = end + 2;
        continue;
      }
    }
    if (text.startsWith("\\[", i)) {
      const end = text.indexOf("\\]", i + 2);
      if (end !== -1) {
        flush();
        segments.push({ type: "math", value: text.slice(i + 2, end), display: true });
        i = end + 2;
        continue;
      }
    }
    if (text.startsWith("\\(", i)) {
      const end = text.indexOf("\\)", i + 2);
      if (end !== -1) {
        flush();
        segments.push({ type: "math", value: text.slice(i + 2, end), display: false });
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "$" && text[i + 1] !== "$") {
      const end = text.indexOf("$", i + 1);
      if (end !== -1) {
        flush();
        segments.push({ type: "math", value: text.slice(i + 1, end), display: false });
        i = end + 1;
        continue;
      }
    }

    const bareLatex = readBareLatex(text, i);
    if (bareLatex) {
      flush();
      segments.push({ type: "math", value: bareLatex.value, display: false });
      i = bareLatex.end;
      continue;
    }

    plain += text[i];
    i++;
  }

  flush();
  return segments;
}

function readBareLatex(input: string, start: number): { value: string; end: number } | null {
  if (input[start] === "\\") return readBareLatexCommand(input, start);
  return readBareScriptExpression(input, start);
}

function readBareLatexCommand(input: string, start: number): { value: string; end: number } | null {
  const match = input.slice(start + 1).match(/^[A-Za-z]+/);
  const command = match?.[0] ?? "";
  if (!command || !BARE_LATEX_COMMANDS.has(command)) return null;

  let end = start + 1 + command.length;
  const requiredGroups = command === "frac" || command === "dfrac" || command === "tfrac" ? 2
    : command === "sqrt" || command === "vec" || command === "bar" || command === "overline" || command === "hat" ? 1
      : 0;

  for (let i = 0; i < requiredGroups; i++) {
    const group = readBalancedGroupAt(input, end);
    if (!group) return null;
    end = group.end;
  }

  while (input[end] === "^" || input[end] === "_") {
    const script = readScriptAt(input, end);
    if (!script) break;
    end = script.end;
  }

  return { value: input.slice(start, end), end };
}

function readBareScriptExpression(input: string, start: number): { value: string; end: number } | null {
  const base = input[start];
  if (!base || !/[A-Za-z0-9)]/.test(base)) return null;
  let end = start + 1;
  let foundScript = false;
  while (input[end] === "^" || input[end] === "_") {
    const script = readScriptAt(input, end);
    if (!script) break;
    foundScript = true;
    end = script.end;
  }
  return foundScript ? { value: input.slice(start, end), end } : null;
}

function readScriptAt(input: string, start: number): { end: number } | null {
  if (input[start] !== "^" && input[start] !== "_") return null;
  const valueStart = start + 1;
  const group = readBalancedGroupAt(input, valueStart);
  if (group) return { end: group.end };
  if (input[valueStart] === "\\") {
    const command = input.slice(valueStart + 1).match(/^[A-Za-z]+/);
    if (command) return { end: valueStart + 1 + command[0].length };
  }
  return valueStart < input.length ? { end: valueStart + 1 } : null;
}

function readBalancedGroupAt(input: string, start: number): { end: number } | null {
  let i = start;
  while (input[i] === " ") i++;
  if (input[i] !== "{") return null;
  let depth = 1;
  i++;
  while (i < input.length && depth > 0) {
    if (input[i] === "{") depth++;
    if (input[i] === "}") depth--;
    i++;
  }
  return depth === 0 ? { end: i } : null;
}

function parseStyledText(text: string, style: InlineStyle): RichInline[] {
  if (!text) return [];
  const token = findFirstStyleToken(text);
  if (!token) return splitBreaks(text, style);

  return [
    ...parseStyledText(text.slice(0, token.start), style),
    ...parseStyledText(text.slice(token.innerStart, token.innerEnd), { ...style, ...token.style }),
    ...parseStyledText(text.slice(token.end), style),
  ];
}

function splitBreaks(text: string, style: InlineStyle): RichInline[] {
  return text.split("\n").flatMap((part, index) => {
    const nodes: RichInline[] = [];
    if (index > 0) nodes.push({ type: "break" });
    if (part) nodes.push({ type: "text", text: decodeEntities(part), ...style });
    return nodes;
  });
}

function findFirstStyleToken(text: string): StyleToken | null {
  const tokens = [
    spanHighlightToken(text),
    tagToken(text, "mark", { highlight: true }),
    tagToken(text, "strong", { bold: true }),
    tagToken(text, "b", { bold: true }),
    tagToken(text, "em", { italic: true }),
    tagToken(text, "i", { italic: true }),
    tagToken(text, "u", { underline: true }),
    tagToken(text, "sup", { superscript: true }),
    tagToken(text, "sub", { subscript: true }),
    latexCommandToken(text, "textbf", { bold: true }),
    latexCommandToken(text, "textit", { italic: true }),
    latexCommandToken(text, "emph", { italic: true }),
    latexCommandToken(text, "underline", { underline: true }),
    latexCommandToken(text, "uline", { underline: true }),
    latexCommandToken(text, "textsuperscript", { superscript: true }),
    latexCommandToken(text, "textsubscript", { subscript: true }),
    wrappedToken(text, "**", "**", { bold: true }),
    wrappedToken(text, "==", "==", { highlight: true }),
    wrappedToken(text, "__", "__", { underline: true }),
    wrappedToken(text, "*", "*", { italic: true }),
    wrappedToken(text, "_", "_", { italic: true }),
    bracedToken(text, "^{", "}", { superscript: true }),
    bracedToken(text, "_{", "}", { subscript: true }),
  ].filter(Boolean) as StyleToken[];

  tokens.sort((a, b) => a.start - b.start || a.end - b.end);
  return tokens[0] ?? null;
}

function latexCommandToken(text: string, command: string, style: InlineStyle): StyleToken | null {
  const marker = `\\${command}{`;
  const start = text.indexOf(marker);
  if (start === -1) return null;
  const innerStart = start + marker.length;
  let depth = 1;
  let i = innerStart;
  while (i < text.length && depth > 0) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) return null;
  return { start, end: i + 1, innerStart, innerEnd: i, style };
}

function tagToken(text: string, tag: string, style: InlineStyle): StyleToken | null {
  const regex = new RegExp(`<${tag}>([\\s\\S]+?)<\\/${tag}>`, "i");
  const match = regex.exec(text);
  if (!match || match.index === undefined) return null;
  const start = match.index;
  const openLength = match[0].indexOf(">") + 1;
  const innerStart = start + openLength;
  const innerEnd = start + match[0].length - (`</${tag}>`).length;
  return { start, end: start + match[0].length, innerStart, innerEnd, style };
}

function spanHighlightToken(text: string): StyleToken | null {
  const regex = /<span\s+[^>]*style=["'][^"']*(?:background|background-color)[^"']*["'][^>]*>[\s\S]+?<\/span>/i;
  const match = regex.exec(text);
  if (!match || match.index === undefined) return null;
  const start = match.index;
  const openLength = match[0].indexOf(">") + 1;
  const closeStart = match[0].toLowerCase().lastIndexOf("</span>");
  return {
    start,
    end: start + match[0].length,
    innerStart: start + openLength,
    innerEnd: start + closeStart,
    style: { highlight: true },
  };
}

function wrappedToken(text: string, open: string, close: string, style: InlineStyle): StyleToken | null {
  const start = text.indexOf(open);
  if (start === -1) return null;
  const innerStart = start + open.length;
  const end = text.indexOf(close, innerStart);
  if (end === -1 || end === innerStart) return null;
  if ((open === "*" || open === "_") && text[start + 1] === open) return null;
  return { start, end: end + close.length, innerStart, innerEnd: end, style };
}

function bracedToken(text: string, open: string, close: string, style: InlineStyle): StyleToken | null {
  const start = text.indexOf(open);
  if (start === -1) return null;
  const innerStart = start + open.length;
  const end = text.indexOf(close, innerStart);
  if (end === -1 || end === innerStart) return null;
  return { start, end: end + close.length, innerStart, innerEnd: end, style };
}

function decodeEntities(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}
