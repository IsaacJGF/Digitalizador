import { supabase } from "@/lib/external-database";

export type SimpleCatalog = {
  id: string;
  nome: string;
  ativo: boolean;
};

export type ConteudoCatalog = SimpleCatalog & { area_id: string };
export type SubconteudoCatalog = SimpleCatalog & { conteudo_id: string };

export type CatalogKind =
  | "area"
  | "conteudo"
  | "subconteudo"
  | "relacionado"
  | "tag"
  | "prova"
  | "instituicao";

export const CATALOG_TABLE: Record<CatalogKind, string> = {
  area: "catalog_areas",
  conteudo: "catalog_conteudos",
  subconteudo: "catalog_subconteudos",
  relacionado: "catalog_relacionados",
  tag: "catalog_tags",
  prova: "catalog_provas",
  instituicao: "catalog_instituicoes",
};

export const CATALOG_LABEL: Record<CatalogKind, string> = {
  area: "Áreas gerais",
  conteudo: "Conteúdos principais",
  subconteudo: "Subconteúdos principais",
  relacionado: "Conteúdos relacionados",
  tag: "Tags",
  prova: "Provas",
  instituicao: "Instituições",
};

// Coluna(s) da tabela questions a atualizar quando o item é renomeado/mesclado.
// Para colunas array, fazemos UPDATE com array_replace.
export const CATALOG_QUESTION_COLUMN: Record<CatalogKind, { col: string; kind: "scalar" | "array" }> = {
  area: { col: "area_geral", kind: "scalar" },
  conteudo: { col: "conteudo_principal", kind: "scalar" },
  subconteudo: { col: "subconteudo_principal", kind: "scalar" },
  relacionado: { col: "conteudos_relacionados", kind: "array" },
  tag: { col: "tags_livres", kind: "array" },
  prova: { col: "prova", kind: "scalar" },
  instituicao: { col: "instituicao", kind: "scalar" },
};

export async function countUsage(kind: CatalogKind, nome: string): Promise<number> {
  const { data, error } = await supabase.rpc("count_catalog_usage", { _kind: kind, _name: nome });
  if (error) {
    console.error(error);
    return 0;
  }
  return Number(data ?? 0);
}

/**
 * Renomeia/mescla: atualiza todas as questões trocando `oldName` por `newName` na coluna correspondente.
 * Funciona para colunas escalares e arrays.
 */
export async function renameInQuestions(kind: CatalogKind, oldName: string, newName: string) {
  const { col, kind: type } = CATALOG_QUESTION_COLUMN[kind];
  if (oldName === newName) return;

  if (type === "scalar") {
    const { error } = await supabase
      .from("questions")
      // @ts-expect-error coluna dinâmica
      .update({ [col]: newName })
      .eq(col, oldName);
    if (error) throw error;
    return;
  }

  // Array: carregar, substituir, salvar
  const { data, error } = await supabase
    .from("questions")
    .select(`id, ${col}`)
    .contains(col, [oldName]);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  for (const row of rows) {
    const id = row.id as string;
    const arr = ((row[col] as string[] | null) ?? []).map((v) => (v === oldName ? newName : v));
    const dedup = Array.from(new Set(arr));
    const { error: upErr } = await supabase
      .from("questions")
      // @ts-expect-error coluna dinâmica
      .update({ [col]: dedup })
      .eq("id", id);
    if (upErr) throw upErr;
  }
}
