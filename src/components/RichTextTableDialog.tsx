import { useEffect, useRef, useState } from "react";
import { Bold, Eraser, Palette, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RichTableCellDraft, RichTableDraft } from "@/lib/rich-table-format";

type Props = {
  open: boolean;
  mode: "insert" | "edit";
  initialDraft: RichTableDraft;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: RichTableDraft) => void;
};

export function RichTextTableDialog({ open, mode, initialDraft, onOpenChange, onSave }: Props) {
  const [draft, setDraft] = useState<RichTableDraft>(initialDraft);

  useEffect(() => {
    if (open) setDraft(cloneDraft(initialDraft));
  }, [initialDraft, open]);

  const resize = (rowCount: number, columnCount: number) => {
    const rows = clamp(rowCount, 1, 12);
    const columns = clamp(columnCount, 1, 10);
    setDraft((current) => ({
      ...current,
      rows: Array.from({ length: rows }, (_, rowIndex) =>
        Array.from({ length: columns }, (_, columnIndex) =>
          current.rows[rowIndex]?.[columnIndex] ?? {
            text: current.headerRow && rowIndex === 0 ? `Coluna ${columnIndex + 1}` : "",
            background: null,
          },
        ),
      ),
    }));
  };

  const updateCell = (rowIndex: number, columnIndex: number, cell: RichTableCellDraft) => {
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row, index) =>
        index === rowIndex ? row.map((value, cellIndex) => cellIndex === columnIndex ? cell : value) : row,
      ),
    }));
  };

  const addRow = () => resize(draft.rows.length + 1, draft.rows[0]?.length ?? 1);
  const removeRow = () => resize(draft.rows.length - 1, draft.rows[0]?.length ?? 1);
  const addColumn = () => resize(draft.rows.length, (draft.rows[0]?.length ?? 1) + 1);
  const removeColumn = () => resize(draft.rows.length, (draft.rows[0]?.length ?? 1) - 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Editar tabela" : "Inserir tabela"}</DialogTitle>
          <DialogDescription>
            Monte a tabela, destaque células e aplique negrito ao texto selecionado dentro de cada célula.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-24 space-y-1">
            <Label htmlFor="rich-table-rows">Linhas</Label>
            <Input
              id="rich-table-rows"
              type="number"
              min={1}
              max={12}
              value={draft.rows.length}
              onChange={(event) => resize(Number(event.target.value), draft.rows[0]?.length ?? 1)}
            />
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor="rich-table-columns">Colunas</Label>
            <Input
              id="rich-table-columns"
              type="number"
              min={1}
              max={10}
              value={draft.rows[0]?.length ?? 1}
              onChange={(event) => resize(draft.rows.length, Number(event.target.value))}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox
              checked={draft.headerRow}
              onCheckedChange={(checked) => setDraft((current) => ({ ...current, headerRow: Boolean(checked) }))}
            />
            Primeira linha como cabeçalho
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addRow} disabled={draft.rows.length >= 12}>
              <Plus className="size-3.5" /> Linha
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={removeRow} disabled={draft.rows.length <= 1}>
              <Trash2 className="size-3.5" /> Linha
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addColumn} disabled={(draft.rows[0]?.length ?? 1) >= 10}>
              <Plus className="size-3.5" /> Coluna
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={removeColumn} disabled={(draft.rows[0]?.length ?? 1) <= 1}>
              <Trash2 className="size-3.5" /> Coluna
            </Button>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-lg border">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
            <tbody>
              {draft.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, columnIndex) => (
                    <td key={columnIndex} className="w-64 border p-1.5 align-top">
                      <TableCellEditor
                        cell={cell}
                        isHeader={draft.headerRow && rowIndex === 0}
                        label={`linha ${rowIndex + 1}, coluna ${columnIndex + 1}`}
                        onChange={(next) => updateCell(rowIndex, columnIndex, next)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={() => onSave(cloneDraft(draft))}>
            {mode === "edit" ? "Salvar tabela" : "Inserir tabela"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TableCellEditor({
  cell,
  isHeader,
  label,
  onChange,
}: {
  cell: RichTableCellDraft;
  isHeader: boolean;
  label: string;
  onChange: (cell: RichTableCellDraft) => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const toggleBold = () => {
    const target = inputRef.current;
    if (!target || !cell.text) return;
    let start = target.selectionStart ?? 0;
    let end = target.selectionEnd ?? start;
    if (start === end) {
      start = 0;
      end = cell.text.length;
    }
    if (start === end) return;
    const selected = cell.text.slice(start, end);
    const alreadyBold = selected.startsWith("**") && selected.endsWith("**") && selected.length >= 4;
    const replacement = alreadyBold ? selected.slice(2, -2) : `**${selected}**`;
    const nextText = cell.text.slice(0, start) + replacement + cell.text.slice(end);
    onChange({ ...cell, text: nextText });
    requestAnimationFrame(() => {
      target.focus();
      const selectionStart = start + (alreadyBold ? 0 : 2);
      target.setSelectionRange(selectionStart, selectionStart + (alreadyBold ? replacement.length : selected.length));
    });
  };

  return (
    <div
      className="space-y-2 rounded-md border p-2"
      style={{ backgroundColor: cell.background ?? (isHeader ? "var(--color-muted)" : "var(--color-background)") }}
    >
      <Textarea
        ref={inputRef}
        rows={3}
        value={cell.text}
        aria-label={`Conteúdo da ${label}`}
        onChange={(event) => onChange({ ...cell, text: event.target.value })}
        className="min-h-20 resize-y bg-background/80 text-xs"
        placeholder={isHeader ? "Cabeçalho" : "Texto da célula"}
      />
      <div className="flex items-center gap-1.5">
        <Button type="button" size="icon" variant="outline" className="size-7" onClick={toggleBold} title="Aplicar ou remover negrito">
          <Bold className="size-3.5" />
        </Button>
        <label className="relative flex size-7 cursor-pointer items-center justify-center rounded-md border bg-background" title={`Cor de fundo da ${label}`}>
          <Palette className="size-3.5 text-muted-foreground" />
          <input
            type="color"
            value={cell.background ?? "#FFFFFF"}
            aria-label={`Cor de fundo da ${label}`}
            onChange={(event) => onChange({ ...cell, background: event.target.value })}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        {cell.background && (
          <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => onChange({ ...cell, background: null })} title="Remover cor da célula">
            <Eraser className="size-3.5" />
          </Button>
        )}
        <span className="ml-auto truncate text-[10px] text-muted-foreground">
          {isHeader ? "Cabeçalho" : label}
        </span>
      </div>
    </div>
  );
}

function cloneDraft(draft: RichTableDraft): RichTableDraft {
  return { headerRow: draft.headerRow, rows: draft.rows.map((row) => row.map((cell) => ({ ...cell }))) };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
