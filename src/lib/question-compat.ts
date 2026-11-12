import { supabase } from "@/lib/external-database";
import { normalizeExtraImages, type ExtraImage, type ImagePlacementLayout } from "@/lib/image-layout";


export type QuestionInsertRow = Record<string, unknown>;

type CatalogItem = { id: string; nome: string; ativo: boolean; area_id?: string; conteudo_id?: string };

type CatalogSnapshot = {
  areas: CatalogItem[];
  conteudos: CatalogItem[];
  subconteudos: CatalogItem[];
  relacionados: CatalogItem[];
  tags: CatalogItem[];
  provas: CatalogItem[];
  instituicoes: CatalogItem[];
};

export type DocumentQuestion = {
  id: string;
  numero: string | null;
  enunciado: string;
  alternativas: { letra: string; texto: string; imagem?: string | null }[];
  resposta: string | null;
  fonte: string | null;
  referencia_texto: string | null;
  referencia_fonte: string | null;
  grupo_id: string | null;
  referencia_imagem: string | null;
  referencia_imagem_pos: string | null;
  referencia_imagem_layout: ImagePlacementLayout | null;
  referencia_imagens_extra: ExtraImage[];
  referencia_texto_apos: string | null;
  enunciado_imagem: string | null;
  enunciado_imagem_pos: string | null;
  enunciado_imagem_layout: ImagePlacementLayout | null;
  enunciado_imagens_extra: ExtraImage[];

  prova: string | null;
  instituicao: string | null;
  ano: string | null;
};

const OPTIONAL_INSERT_COLUMNS = [
  "referencia_imagem",
  "referencia_imagem_pos",
  "referencia_imagem_layout",
  "referencia_imagens_extra",
  "referencia_texto_apos",
  "enunciado_imagem",
  "enunciado_imagem_pos",
  "enunciado_imagem_layout",
  "enunciado_imagens_extra",
  "area_geral",
  "conteudo_principal",
  "subconteudo_principal",
  "conteudos_relacionados",
  "tags_livres",
  "referencia_texto",
  "referencia_fonte",
  "grupo_id",
  "imagem_original_url",
  "ano",
  "prova",
  "instituicao",
  "observacoes",
  "disciplina",
  "conteudo",
  "dificuldade",
  "tags",
] as const;

const DOCUMENT_SELECT_COLUMNS = [
  "id",
  "numero",
  "enunciado",
  "alternativas",
  "resposta",
  "fonte",
  "referencia_texto",
  "referencia_fonte",
  "grupo_id",
  "referencia_imagem",
  "referencia_imagem_pos",
  "referencia_imagem_layout",
  "referencia_imagens_extra",
  "referencia_texto_apos",
  "enunciado_imagem",
  "enunciado_imagem_pos",
  "enunciado_imagem_layout",
  "enunciado_imagens_extra",
  "prova",
  "instituicao",
  "ano",
] as const;

const REQUIRED_DOCUMENT_COLUMNS = [
  "id",
  "numero",
  "enunciado",
  "alternativas",
  "resposta",
  "fonte",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function insertQuestionsWithCompatibility(rows: QuestionInsertRow[]) {
  const sanitizedRows = await sanitizeRowsByCatalogs(rows);
  let currentRows = sanitizedRows;
  const removedColumns: string[] = [];
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= OPTIONAL_INSERT_COLUMNS.length; attempt++) {
    const { error } = await db.from("questions").insert(currentRows);
    if (!error) return { removedColumns };

    lastError = error;
    const missingColumn = findMissingColumn(error, currentRows[0]);
    if (!missingColumn || removedColumns.includes(missingColumn)) break;

    removedColumns.push(missingColumn);
    currentRows = currentRows.map((row) => omitColumn(row, missingColumn));
  }

  throw lastError;
}

export async function fetchDocumentQuestions(ids: string[]): Promise<DocumentQuestion[]> {
  let columns = [...DOCUMENT_SELECT_COLUMNS];
  const removedColumns = new Set<string>();
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= DOCUMENT_SELECT_COLUMNS.length; attempt++) {
    const { data, error } = await db
      .from("questions")
      .select(columns.join(", "))
      .in("id", ids);

    if (!error) return normalizeDocumentRows(data ?? []);
    lastError = error;

    const missingColumn = findMissingColumn(error, columnRecord(columns));
    if (
      !missingColumn ||
      isRequiredDocumentColumn(missingColumn) ||
      removedColumns.has(missingColumn)
    ) {
      break;
    }

    removedColumns.add(missingColumn);
    columns = columns.filter((column) => column !== missingColumn);
  }

  throw lastError;
}

async function sanitizeRowsByCatalogs(rows: QuestionInsertRow[]) {
  try {
    const catalogs = await fetchCatalogSnapshot();
    return rows.map((row) => sanitizeRowByCatalogs(row, catalogs));
  } catch (error) {
    console.warn("Não foi possível validar a classificação pelos catálogos. Salvando sem filtro extra.", error);
    return rows;
  }
}

async function fetchCatalogSnapshot(): Promise<CatalogSnapshot> {
  const [areas, conteudos, subconteudos, relacionados, tags, provas, instituicoes] = await Promise.all([
    fetchCatalog("catalog_areas"),
    fetchCatalog("catalog_conteudos"),
    fetchCatalog("catalog_subconteudos"),
    fetchCatalog("catalog_relacionados"),
    fetchCatalog("catalog_tags"),
    fetchCatalog("catalog_provas"),
    fetchCatalog("catalog_instituicoes"),
  ]);

  return { areas, conteudos, subconteudos, relacionados, tags, provas, instituicoes };
}

async function fetchCatalog(table: string): Promise<CatalogItem[]> {
  const { data, error } = await db.from(table).select("*");
  if (error) {
    console.warn(`Falha ao carregar ${table} para validar classificação:`, error);
    return [];
  }
  return (data ?? []) as CatalogItem[];
}

function sanitizeRowByCatalogs(row: QuestionInsertRow, catalogs: CatalogSnapshot): QuestionInsertRow {
  const area = canonicalCatalogName(catalogs.areas, row.area_geral);
  const content = canonicalCatalogName(catalogs.conteudos, row.conteudo_principal);
  const subcontent = canonicalCatalogName(catalogs.subconteudos, row.subconteudo_principal);
  const related = canonicalCatalogArray(catalogs.relacionados, row.conteudos_relacionados);
  const tagNames = canonicalCatalogArray(catalogs.tags, row.tags_livres ?? row.tags);
  const prova = canonicalCatalogName(catalogs.provas, row.prova);
  const instituicao = canonicalCatalogName(catalogs.instituicoes, row.instituicao);

  return {
    ...row,
    disciplina: area ?? normalizeNullable(row.disciplina),
    conteudo: content ?? normalizeNullable(row.conteudo),
    area_geral: area,
    conteudo_principal: content,
    subconteudo_principal: subcontent,
    conteudos_relacionados: related,
    tags_livres: tagNames,
    tags: tagNames.length > 0 ? tagNames : null,
    prova,
    instituicao,
  };
}

function canonicalCatalogName(items: CatalogItem[], value: unknown): string | null {
  if (items.length === 0) return normalizeNullable(value);
  const normalized = normalizeCatalogValue(value);
  if (!normalized) return null;
  return items.find((item) => item.ativo && normalizeCatalogValue(item.nome) === normalized)?.nome ?? null;
}

function canonicalCatalogArray(items: CatalogItem[], value: unknown): string[] {
  const values = normalizeStringArray(value);
  if (items.length === 0) return values;
  const activeByName = new Map(items.filter((item) => item.ativo).map((item) => [normalizeCatalogValue(item.nome), item.nome]));
  return Array.from(new Set(values.map((item) => activeByName.get(normalizeCatalogValue(item))).filter((item): item is string => Boolean(item))));
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeCatalogValue(value: unknown) {
  return normalizeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeDocumentRows(rows: unknown[]): DocumentQuestion[] {
  return (rows as Partial<DocumentQuestion>[]).map((row) => ({
    id: String(row.id),
    numero: normalizeNullableString(row.numero),
    enunciado: normalizeString(row.enunciado),
    alternativas: Array.isArray(row.alternativas) ? normalizeAlternatives(row.alternativas) : [],
    resposta: normalizeNullableString(row.resposta),
    fonte: normalizeNullableString(row.fonte),
    referencia_texto: normalizeNullableString(row.referencia_texto),
    referencia_fonte: normalizeNullableString(row.referencia_fonte),
    grupo_id: normalizeNullableString(row.grupo_id),
    referencia_imagem: normalizeNullableString(row.referencia_imagem),
    referencia_imagem_pos: normalizeNullableString(row.referencia_imagem_pos),
    referencia_imagem_layout: normalizeLayout(row.referencia_imagem_layout),
    referencia_imagens_extra: normalizeExtraImages(row.referencia_imagens_extra),
    referencia_texto_apos: normalizeNullableString(row.referencia_texto_apos),
    enunciado_imagem: normalizeNullableString(row.enunciado_imagem),
    enunciado_imagem_pos: normalizeNullableString(row.enunciado_imagem_pos),
    enunciado_imagem_layout: normalizeLayout(row.enunciado_imagem_layout),
    enunciado_imagens_extra: normalizeExtraImages(row.enunciado_imagens_extra),
    prova: normalizeNullableString(row.prova),
    instituicao: normalizeNullableString(row.instituicao),
    ano: normalizeNullableString(row.ano),
  }));
}

function normalizeAlternatives(value: unknown[]) {
  return value.map((item) => {
    const alt = item as { letra?: unknown; texto?: unknown; imagem?: unknown };
    return {
      letra: normalizeString(alt.letra),
      texto: normalizeString(alt.texto),
      imagem: normalizeNullableString(alt.imagem),
    };
  });
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeNullable(value: unknown): string | null {
  const text = normalizeString(value).trim();
  return text || null;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value == null) return null;
  return String(value);
}

function normalizeLayout(value: unknown): ImagePlacementLayout | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ImagePlacementLayout : null;
}

function omitColumn(row: QuestionInsertRow, column: string): QuestionInsertRow {
  const { [column]: _removed, ...rest } = row;
  return rest;
}

function findMissingColumn(error: unknown, sampleRow?: QuestionInsertRow) {
  const text = errorText(error);
  const candidates = [
    ...Object.keys(sampleRow ?? {}),
    ...OPTIONAL_INSERT_COLUMNS,
  ];
  // Longest names first so 'enunciado_imagem_layout' wins over 'enunciado_imagem'.
  const sorted = Array.from(new Set(candidates)).sort((a, b) => b.length - a.length);
  for (const column of sorted) {
    const re = new RegExp(`(^|[^a-z0-9_])${column.toLowerCase()}([^a-z0-9_]|$)`);
    if (re.test(text)) return column;
  }
  return null;
}

function columnRecord(columns: readonly string[]) {
  return Object.fromEntries(columns.map((column) => [column, true]));
}

function isRequiredDocumentColumn(column: string) {
  return (REQUIRED_DOCUMENT_COLUMNS as readonly string[]).includes(column);
}

function errorText(error: unknown) {
  const err = error as { code?: string; message?: string; details?: string; hint?: string };
  return [err.code, err.message, err.details, err.hint].filter(Boolean).join(" ").toLowerCase();
}
