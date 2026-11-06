import { useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Subscript,
  Superscript,
  Table2,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RichText } from "@/components/RichText";
import { RichTextTableDialog } from "@/components/RichTextTableDialog";
import { createEmptyRichTable, parseRichTableDraft, serializeRichTable, type RichTableDraft } from "@/lib/rich-table-format";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onCursorChange?: (target: HTMLTextAreaElement) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  containerClassName?: string;
  showPreview?: boolean;
};

type ToolbarButtonProps = {
  title: string;
  onClick: () => void;
  children: ReactNode;
};

export function RichTextEditor({ value, onChange, onCursorChange, rows = 4, placeholder, className, containerClassName, showPreview = true }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const tableRangeRef = useRef<{ start: number; end: number } | null>(null);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [tableDialogMode, setTableDialogMode] = useState<"insert" | "edit">("insert");
  const [tableDraft, setTableDraft] = useState<RichTableDraft>(() => createEmptyRichTable());

  const rememberCursor = () => {
    if (textareaRef.current) onCursorChange?.(textareaRef.current);
  };

  const updateValue = (next: string) => {
    onChange(next);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      rememberCursor();
    });
  };

  const replaceSelection = (format: (selected: string) => string) => {
    const target = textareaRef.current;
    if (!target) return;
    const start = target.selectionStart ?? value.length;
    const end = target.selectionEnd ?? start;
    const selected = value.slice(start, end);
    const replacement = format(selected || "texto");
    const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(start, start + replacement.length);
      rememberCursor();
    });
  };

  const wrapSelection = (before: string, after = before) => replaceSelection((selected) => `${before}${selected}${after}`);

  const wrapBlock = (tag: "left" | "center" | "right" | "justify") => {
    replaceSelection((selected) => `[${tag}]${selected}[/${tag}]`);
  };

  const prefixLines = (prefixForIndex: (index: number) => string) => {
    replaceSelection((selected) => selected
      .split("\n")
      .map((line, index) => `${prefixForIndex(index)}${line || "item"}`)
      .join("\n"));
  };

  const insertTable = () => {
    const target = textareaRef.current;
    if (!target) return;
    const selectionStart = target.selectionStart ?? value.length;
    const selectionEnd = target.selectionEnd ?? selectionStart;
    const selectedText = value.slice(selectionStart, selectionEnd);
    const selectedTable = parseRichTableDraft(selectedText);

    if (selectedTable) {
      tableRangeRef.current = { start: selectionStart, end: selectionEnd };
      setTableDraft(selectedTable);
      setTableDialogMode("edit");
    } else {
      const detected = findTableAtCursor(value, selectionStart);
      const detectedTable = detected ? parseRichTableDraft(detected.text) : null;
      if (detected && detectedTable) {
        tableRangeRef.current = { start: detected.start, end: detected.end };
        setTableDraft(detectedTable);
        setTableDialogMode("edit");
      } else {
        tableRangeRef.current = { start: selectionStart, end: selectionEnd };
        setTableDraft(createEmptyRichTable());
        setTableDialogMode("insert");
      }
    }
    setTableDialogOpen(true);
  };

  const saveTable = (draft: RichTableDraft) => {
    const target = textareaRef.current;
    const range = tableRangeRef.current;
    if (!target || !range) return;
    const table = serializeRichTable(draft);
    const before = value.slice(0, range.start);
    const after = value.slice(range.end);
    const prefix = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const suffix = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
    const next = before + prefix + table + suffix + after;
    const cursor = before.length + prefix.length + table.length;
    onChange(next);
    setTableDialogOpen(false);
    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(cursor, cursor);
      rememberCursor();
    });
  };

  const hasPreview = value.trim().length > 0;

  return (
    <div className={cn("overflow-hidden rounded-md border bg-background", containerClassName)}>
      <div className="flex flex-wrap gap-1 border-b bg-muted/30 p-1.5">
        <ToolbarButton title="Negrito" onClick={() => wrapSelection("**")}><Bold className="size-3.5" /></ToolbarButton>
        <ToolbarButton title="Itálico" onClick={() => wrapSelection("*")}><Italic className="size-3.5" /></ToolbarButton>
        <ToolbarButton title="Sublinhado" onClick={() => wrapSelection("<u>", "</u>")}><Underline className="size-3.5" /></ToolbarButton>
        <ToolbarButton title="Sombreamento" onClick={() => wrapSelection("<mark>", "</mark>")}><Highlighter className="size-3.5" /></ToolbarButton>
        <ToolbarButton title="Sobrescrito" onClick={() => wrapSelection("<sup>", "</sup>")}><Superscript className="size-3.5" /></ToolbarButton>
        <ToolbarButton title="Subscrito" onClick={() => wrapSelection("<sub>", "</sub>")}><Subscript className="size-3.5" /></ToolbarButton>
        <span className="mx-1 h-7 w-px bg-border" />
        <ToolbarButton title="Alinhar à esquerda" onClick={() => wrapBlock("left")}><AlignLeft className="size-3.5" /></ToolbarButton>
        <ToolbarButton title="Centralizar" onClick={() => wrapBlock("center")}><AlignCenter className="size-3.5" /></ToolbarButton>
        <ToolbarButton title="Alinhar à direita" onClick={() => wrapBlock("right")}><AlignRight className="size-3.5" /></ToolbarButton>
        <ToolbarButton title="Justificar" onClick={() => wrapBlock("justify")}><AlignJustify className="size-3.5" /></ToolbarButton>
        <span className="mx-1 h-7 w-px bg-border" />
        <ToolbarButton title="Lista com marcadores" onClick={() => prefixLines(() => "- ")}><List className="size-3.5" /></ToolbarButton>
        <ToolbarButton title="Lista numerada" onClick={() => prefixLines((index) => `${index + 1}. `)}><ListOrdered className="size-3.5" /></ToolbarButton>
        <ToolbarButton title="Lista com letras" onClick={() => prefixLines((index) => `${String.fromCharCode(65 + index)}. `)}><Pilcrow className="size-3.5" /></ToolbarButton>
        <span className="mx-1 h-7 w-px bg-border" />
        <ToolbarButton title="Inserir ou editar tabela" onClick={insertTable}><Table2 className="size-3.5" /></ToolbarButton>
      </div>

      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => updateValue(event.target.value)}
        onSelect={rememberCursor}
        onClick={rememberCursor}
        onKeyUp={rememberCursor}
        rows={rows}
        placeholder={placeholder}
        className={cn("min-h-0 resize-y rounded-none border-0 shadow-none focus-visible:ring-0", className)}
      />

      {showPreview && hasPreview && (
        <div className="border-t bg-muted/20 p-2 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Prévia formatada</p>
          <RichText text={value} className="leading-relaxed" />
        </div>
      )}
      <RichTextTableDialog
        open={tableDialogOpen}
        mode={tableDialogMode}
        initialDraft={tableDraft}
        onOpenChange={setTableDialogOpen}
        onSave={saveTable}
      />
    </div>
  );
}

function ToolbarButton({ title, onClick, children }: ToolbarButtonProps) {
  return (
    <Button type="button" size="icon" variant="ghost" className="size-7" title={title} onClick={onClick}>
      {children}
    </Button>
  );
}


function findTableAtCursor(value: string, cursor: number): { start: number; end: number; text: string } | null {
  const htmlStart = value.lastIndexOf("<table", cursor);
  const htmlEndMarker = value.indexOf("</table>", cursor);
  if (htmlStart >= 0 && htmlEndMarker >= cursor) {
    const end = htmlEndMarker + "</table>".length;
    return { start: htmlStart, end, text: value.slice(htmlStart, end) };
  }

  const lines = value.split("\n");
  const starts: number[] = [];
  let offset = 0;
  lines.forEach((line) => {
    starts.push(offset);
    offset += line.length + 1;
  });
  let lineIndex = starts.findIndex((start, index) => cursor >= start && cursor <= start + lines[index].length);
  if (lineIndex < 0) lineIndex = lines.length - 1;
  if (!lines[lineIndex]?.includes("|")) return null;

  let first = lineIndex;
  let last = lineIndex;
  while (first > 0 && lines[first - 1].trim() && lines[first - 1].includes("|")) first--;
  while (last + 1 < lines.length && lines[last + 1].trim() && lines[last + 1].includes("|")) last++;
  const text = lines.slice(first, last + 1).join("\n");
  if (!parseRichTableDraft(text)) return null;
  return {
    start: starts[first],
    end: starts[last] + lines[last].length,
    text,
  };
}
