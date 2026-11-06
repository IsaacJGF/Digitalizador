export type RichTableCellDraft = {
  text: string;
  background: string | null;
};

export type RichTableDraft = {
  headerRow: boolean;
  rows: RichTableCellDraft[][];
};

export function createEmptyRichTable(rows = 3, columns = 3): RichTableDraft {
  const safeRows = clamp(rows, 1, 12);
  const safeColumns = clamp(columns, 1, 10);
  return {
    headerRow: true,
    rows: Array.from({ length: safeRows }, (_, rowIndex) =>
      Array.from({ length: safeColumns }, (_, columnIndex) => ({
        text: rowIndex === 0 ? `Coluna ${columnIndex + 1}` : "",
        background: null,
      })),
    ),
  };
}

/** Reads tables created by this editor and the previous Markdown table format. */
export function parseRichTableDraft(source: string): RichTableDraft | null {
  const input = source.trim();
  if (!input) return null;

  const html = input.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i);
  if (html) {
    const rows: RichTableCellDraft[][] = [];
    let headerRow = false;
    const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    for (const rowMatch of html[1].matchAll(rowPattern)) {
      const cells: RichTableCellDraft[] = [];
      const cellPattern = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
      for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
        const tag = cellMatch[1].toLowerCase();
        if (rows.length === 0 && cells.length === 0 && tag === "th") headerRow = true;
        cells.push({
          text: htmlToEditableText(cellMatch[3]),
          background: findBackground(cellMatch[2]),
        });
      }
      if (cells.length > 0) rows.push(cells);
    }
    return normalizeDraft(rows, headerRow);
  }

  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const separatorIndex = lines.findIndex(isMarkdownSeparator);
  if (separatorIndex < 0 || lines.some((line) => !line.includes("|"))) return null;
  const headerRow = separatorIndex === 1;
  const rows = lines
    .filter((_, index) => index !== separatorIndex)
    .map((line) => splitMarkdownRow(line).map((text) => ({ text, background: null })));
  return normalizeDraft(rows, headerRow);
}

export function serializeRichTable(draft: RichTableDraft): string {
  const normalized = normalizeDraft(draft.rows, draft.headerRow) ?? createEmptyRichTable();
  const rows = normalized.rows.map((row, rowIndex) => {
    const tag = normalized.headerRow && rowIndex === 0 ? "th" : "td";
    const cells = row.map((cell) => {
      const background = normalizeColor(cell.background);
      const style = background ? ` style="background-color: ${background}"` : "";
      return `<${tag}${style}>${escapeCellText(cell.text)}</${tag}>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  });
  return `<table>\n<tbody>\n${rows.join("\n")}\n</tbody>\n</table>`;
}

function normalizeDraft(rows: RichTableCellDraft[][], headerRow: boolean): RichTableDraft | null {
  if (rows.length === 0) return null;
  const columns = clamp(Math.max(1, ...rows.map((row) => row.length)), 1, 10);
  const limitedRows = rows.slice(0, 12).map((row) =>
    Array.from({ length: columns }, (_, index) => ({
      text: row[index]?.text ?? "",
      background: normalizeColor(row[index]?.background),
    })),
  );
  return { rows: limitedRows, headerRow: Boolean(headerRow) };
}

function findBackground(attributes: string): string | null {
  const style = attributes.match(/\bstyle\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
  const background = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*(#[0-9a-f]{6})\s*(?:;|$)/i)?.[1];
  return normalizeColor(background);
}

function htmlToEditableText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(strong|b)\b[^>]*>/gi, "**")
    .replace(/<\/(strong|b)>/gi, "**")
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, "^{$1}")
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, "_{$1}")
    .replace(/<u\b[^>]*>([\s\S]*?)<\/u>/gi, "__$1__")
    .replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, "==$1==")
    .replace(/<i\b[^>]*>([\s\S]*?)<\/i>/gi, "*$1*")
    .replace(/<em\b[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function escapeCellText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");
}

function normalizeColor(value?: string | null): string | null {
  if (!value) return null;
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;
}

function splitMarkdownRow(line: string): string[] {
  const withoutEdges = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return withoutEdges.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function isMarkdownSeparator(line: string): boolean {
  return /^\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?$/.test(line);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number.isFinite(value) ? value : min)));
}

export function richTableTextColor(background?: string | null): string | undefined {
  const color = normalizeColor(background);
  if (!color) return undefined;
  const red = parseInt(color.slice(1, 3), 16) / 255;
  const green = parseInt(color.slice(3, 5), 16) / 255;
  const blue = parseInt(color.slice(5, 7), 16) / 255;
  const linear = (channel: number) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  return luminance > 0.52 ? "#172033" : "#FFFFFF";
}
