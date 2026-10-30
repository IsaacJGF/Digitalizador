import { useRef, type ReactNode } from "react";
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
    const rowsInput = Number(prompt("Quantidade de linhas", "3"));
    const colsInput = Number(prompt("Quantidade de colunas", "3"));
    const rowCount = Number.isFinite(rowsInput) ? Math.max(1, Math.min(10, rowsInput)) : 3;
    const colCount = Number.isFinite(colsInput) ? Math.max(1, Math.min(8, colsInput)) : 3;
    const header = `| ${Array.from({ length: colCount }, (_, i) => `Coluna ${i + 1}`).join(" | ")} |`;
    const separator = `| ${Array.from({ length: colCount }, () => "---").join(" | ")} |`;
    const body = Array.from({ length: Math.max(1, rowCount - 1) }, () => `| ${Array.from({ length: colCount }, () => " ").join(" | ")} |`);
    replaceSelection(() => [header, separator, ...body].join("\n"));
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
        <ToolbarButton title="Inserir tabela" onClick={insertTable}><Table2 className="size-3.5" /></ToolbarButton>
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
