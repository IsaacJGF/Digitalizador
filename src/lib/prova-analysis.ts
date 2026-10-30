export type ProvaAnalysisQuestion = {
  id: string;
  numero?: string | null;
  enunciado?: string | null;
  resposta?: string | null;
  tipo?: string | null;
  ano?: string | null;
  prova?: string | null;
  instituicao?: string | null;
  area_geral?: string | null;
  conteudo_principal?: string | null;
  subconteudo_principal?: string | null;
  conteudos_relacionados?: string[] | null;
  tags_livres?: string[] | null;
  tags?: string[] | null;
  grupo_id?: string | null;
  referencia_texto?: string | null;
  referencia_texto_apos?: string | null;
  referencia_imagem?: string | null;
  enunciado_imagem?: string | null;
  tem_imagem?: boolean | null;
  tem_equacao?: boolean | null;
  alternativas?: Array<{ letra?: string; texto?: string; imagem?: string | null }> | null;
};

export type FrequencyRow = {
  value: string;
  count: number;
  percent: number;
  years: string[];
};

export type YearCountRow = {
  year: string;
  count: number;
};

export type TermExample = {
  questionId: string;
  numero?: string | null;
  prova?: string | null;
  ano?: string | null;
  preview: string;
};

export type TermFrequencyRow = {
  term: string;
  count: number;
  questionCount: number;
  percent: number;
  years: string[];
  examples: TermExample[];
};

export type ReferenceAnalysisRow = {
  key: string;
  grupoId?: string | null;
  itemCount: number;
  questionIds: string[];
  years: string[];
  hasImage: boolean;
  textLength: number;
  preview: string;
  areas: string[];
  contents: string[];
  subcontents: string[];
  mixedContent: boolean;
};

export type ReferenceAnalysisSummary = {
  totalReferences: number;
  totalItemsWithReference: number;
  averageItemsPerReference: number;
  averageTextLength: number;
  referencesWithImage: number;
  referencesWithMixedContent: number;
  topReferences: ReferenceAnalysisRow[];
};

export type CrossCell = {
  column: string;
  count: number;
  percent: number;
};

export type CrossMatrixRow = {
  row: string;
  total: number;
  cells: CrossCell[];
};

export type CrossMatrix = {
  columns: string[];
  rows: CrossMatrixRow[];
};

export type CrossInsight = {
  title: string;
  description: string;
  evidence: string;
};

export type CrossAnalysisSummary = {
  contentByYear: CrossMatrix;
  contentByType: CrossMatrix;
  provaByContent: CrossMatrix;
  contentByTerms: CrossMatrix;
  contentByCommands: CrossMatrix;
  insights: CrossInsight[];
};

export type ProvaAnalysisSummary = {
  questions: ProvaAnalysisQuestion[];
  total: number;
  years: string[];
  questionsByYear: YearCountRow[];
  areaFrequency: FrequencyRow[];
  contentFrequency: FrequencyRow[];
  subcontentFrequency: FrequencyRow[];
  relatedContentFrequency: FrequencyRow[];
  tagFrequency: FrequencyRow[];
  typeCounts: FrequencyRow[];
  generalTermFrequency: TermFrequencyRow[];
  physicsTermFrequency: TermFrequencyRow[];
  commandFrequency: TermFrequencyRow[];
  referenceAnalysis: ReferenceAnalysisSummary;
  crossAnalysis: CrossAnalysisSummary;
  withReference: number;
  withImage: number;
  withEquation: number;
  withAlternatives: number;
  missingMetadata: {
    area: number;
    content: number;
    subcontent: number;
    year: number;
    type: number;
  };
};

const EMPTY_LABELS = {
  area: "Sem área geral",
  content: "Sem conteúdo principal",
  subcontent: "Sem subconteúdo principal",
  type: "Sem tipo",
  year: "Sem ano",
  prova: "Sem prova",
} as const;

const GENERAL_TERMS = [
  "considere",
  "julgue",
  "assinale",
  "correto",
  "incorreto",
  "de acordo com",
  "com base no texto",
  "sabendo que",
  "despreze",
  "determine",
  "calcule",
  "conclui-se",
];

const PHYSICS_TERMS = [
  "velocidade",
  "força",
  "energia",
  "aceleração",
  "campo",
  "pressão",
  "corrente",
  "calor",
  "onda",
  "frequência",
  "massa",
  "equilíbrio",
  "deslocamento",
  "potência",
  "resistência",
  "temperatura",
];

const COMMAND_PATTERNS = [
  "Considerando o texto acima",
  "Julgue os itens",
  "É correto afirmar que",
  "Com base na figura",
  "De acordo com o texto",
  "Desprezando a resistência do ar",
  "Sabendo que",
  "Assinale a alternativa correta",
  "Conclui-se que",
];

const CROSS_MIN_ROW_TOTAL = 3;
const CROSS_MIN_TOP_COUNT = 2;
const CROSS_STRONG_PERCENT = 50;

export function analyzeProvaQuestions(questions: ProvaAnalysisQuestion[]): ProvaAnalysisSummary {
  const normalized = questions.map(normalizeQuestionForAnalysis);
  const total = normalized.length;

  return {
    questions: normalized,
    total,
    years: uniqueYears(normalized),
    questionsByYear: countYears(normalized),
    areaFrequency: frequencyFromSingleField(normalized, (q) => q.area_geral, EMPTY_LABELS.area),
    contentFrequency: frequencyFromSingleField(normalized, (q) => q.conteudo_principal, EMPTY_LABELS.content),
    subcontentFrequency: frequencyFromSingleField(normalized, (q) => q.subconteudo_principal, EMPTY_LABELS.subcontent),
    relatedContentFrequency: frequencyFromArrayField(normalized, (q) => q.conteudos_relacionados ?? []),
    tagFrequency: frequencyFromArrayField(normalized, (q) => q.tags_livres?.length ? q.tags_livres : q.tags ?? []),
    typeCounts: frequencyFromSingleField(normalized, (q) => q.tipo, EMPTY_LABELS.type),
    generalTermFrequency: analyzeTerms(normalized, GENERAL_TERMS),
    physicsTermFrequency: analyzeTerms(normalized, PHYSICS_TERMS),
    commandFrequency: analyzeTerms(normalized, COMMAND_PATTERNS),
    referenceAnalysis: analyzeReferences(normalized),
    crossAnalysis: analyzeCrossData(normalized),
    withReference: normalized.filter(hasReference).length,
    withImage: normalized.filter(hasImage).length,
    withEquation: normalized.filter((q) => Boolean(q.tem_equacao)).length,
    withAlternatives: normalized.filter(hasAlternatives).length,
    missingMetadata: {
      area: normalized.filter((q) => !q.area_geral).length,
      content: normalized.filter((q) => !q.conteudo_principal).length,
      subcontent: normalized.filter((q) => !q.subconteudo_principal).length,
      year: normalized.filter((q) => !q.ano).length,
      type: normalized.filter((q) => !q.tipo).length,
    },
  };
}

export function hasReference(question: ProvaAnalysisQuestion) {
  return Boolean(question.grupo_id || question.referencia_texto?.trim() || question.referencia_texto_apos?.trim() || question.referencia_imagem);
}

export function hasImage(question: ProvaAnalysisQuestion) {
  return Boolean(
    question.tem_imagem ||
    question.referencia_imagem ||
    question.enunciado_imagem ||
    question.alternativas?.some((alt) => alt.imagem),
  );
}

export function hasAlternatives(question: ProvaAnalysisQuestion) {
  return Array.isArray(question.alternativas) && question.alternativas.length > 0;
}

function normalizeQuestionForAnalysis(question: ProvaAnalysisQuestion): ProvaAnalysisQuestion {
  return {
    ...question,
    numero: normalizeNullableText(question.numero),
    enunciado: question.enunciado ?? "",
    resposta: normalizeNullableText(question.resposta),
    tipo: normalizeNullableText(question.tipo),
    ano: normalizeNullableText(question.ano),
    prova: normalizeNullableText(question.prova),
    instituicao: normalizeNullableText(question.instituicao),
    area_geral: normalizeNullableText(question.area_geral),
    conteudo_principal: normalizeNullableText(question.conteudo_principal),
    subconteudo_principal: normalizeNullableText(question.subconteudo_principal),
    conteudos_relacionados: normalizeTextArray(question.conteudos_relacionados),
    tags_livres: normalizeTextArray(question.tags_livres),
    tags: normalizeTextArray(question.tags),
    grupo_id: normalizeNullableText(question.grupo_id),
    referencia_texto: normalizeNullableText(question.referencia_texto),
    referencia_texto_apos: normalizeNullableText(question.referencia_texto_apos),
    referencia_imagem: normalizeNullableText(question.referencia_imagem),
    enunciado_imagem: normalizeNullableText(question.enunciado_imagem),
    tem_imagem: Boolean(question.tem_imagem),
    tem_equacao: Boolean(question.tem_equacao),
    alternativas: Array.isArray(question.alternativas) ? question.alternativas : [],
  };
}

function frequencyFromSingleField(
  questions: ProvaAnalysisQuestion[],
  getter: (question: ProvaAnalysisQuestion) => string | null | undefined,
  emptyLabel: string,
) {
  const map = new Map<string, { count: number; years: Set<string> }>();
  for (const question of questions) {
    const value = normalizeNullableText(getter(question)) || emptyLabel;
    addFrequency(map, value, question.ano);
  }
  return toFrequencyRows(map, questions.length);
}

function frequencyFromArrayField(
  questions: ProvaAnalysisQuestion[],
  getter: (question: ProvaAnalysisQuestion) => string[],
) {
  const map = new Map<string, { count: number; years: Set<string> }>();
  for (const question of questions) {
    const values = uniqueText(getter(question));
    for (const value of values) addFrequency(map, value, question.ano);
  }
  return toFrequencyRows(map, questions.length);
}

function analyzeTerms(questions: ProvaAnalysisQuestion[], terms: string[]): TermFrequencyRow[] {
  const total = questions.length;
  return terms
    .map((term) => {
      let count = 0;
      const years = new Set<string>();
      const examples: TermExample[] = [];
      const normalizedTerm = normalizeForSearch(term);
      let questionCount = 0;

      for (const question of questions) {
        const text = getSearchableQuestionText(question);
        const occurrences = countOccurrences(text, normalizedTerm);
        if (occurrences === 0) continue;

        count += occurrences;
        questionCount += 1;
        if (question.ano) years.add(question.ano);
        if (examples.length < 3) examples.push(buildTermExample(question));
      }

      return {
        term,
        count,
        questionCount,
        percent: total > 0 ? Math.round((questionCount / total) * 1000) / 10 : 0,
        years: Array.from(years).sort(compareNumericText),
        examples,
      };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, "pt-BR"));
}

function analyzeReferences(questions: ProvaAnalysisQuestion[]): ReferenceAnalysisSummary {
  const groups = new Map<string, ProvaAnalysisQuestion[]>();

  for (const question of questions) {
    const key = getReferenceKey(question);
    if (!key) continue;
    const current = groups.get(key) ?? [];
    current.push(question);
    groups.set(key, current);
  }

  const rows = Array.from(groups.entries()).map(([key, group]) => buildReferenceRow(key, group));
  const totalReferences = rows.length;
  const totalItemsWithReference = rows.reduce((sum, row) => sum + row.itemCount, 0);
  const totalTextLength = rows.reduce((sum, row) => sum + row.textLength, 0);

  return {
    totalReferences,
    totalItemsWithReference,
    averageItemsPerReference: totalReferences > 0 ? roundOne(totalItemsWithReference / totalReferences) : 0,
    averageTextLength: totalReferences > 0 ? Math.round(totalTextLength / totalReferences) : 0,
    referencesWithImage: rows.filter((row) => row.hasImage).length,
    referencesWithMixedContent: rows.filter((row) => row.mixedContent).length,
    topReferences: rows.sort((a, b) => b.itemCount - a.itemCount || b.textLength - a.textLength).slice(0, 12),
  };
}

function getReferenceKey(question: ProvaAnalysisQuestion) {
  if (question.grupo_id) return `grupo:${question.grupo_id}`;
  if (!hasReference(question)) return null;
  const signature = normalizeForSearch([
    question.referencia_texto,
    question.referencia_texto_apos,
    question.referencia_imagem,
  ].filter(Boolean).join("|"));
  return signature ? `referencia:${signature}` : null;
}

function buildReferenceRow(key: string, group: ProvaAnalysisQuestion[]): ReferenceAnalysisRow {
  const first = group[0];
  const text = [first.referencia_texto, first.referencia_texto_apos].filter(Boolean).join(" ");
  const areas = uniqueText(group.map((q) => q.area_geral).filter((value): value is string => Boolean(value))).sort(compareNumericText);
  const contents = uniqueText(group.map((q) => q.conteudo_principal).filter((value): value is string => Boolean(value))).sort(compareNumericText);
  const subcontents = uniqueText(group.map((q) => q.subconteudo_principal).filter((value): value is string => Boolean(value))).sort(compareNumericText);
  const years = uniqueText(group.map((q) => q.ano).filter((value): value is string => Boolean(value))).sort(compareNumericText);

  return {
    key,
    grupoId: first.grupo_id ?? null,
    itemCount: group.length,
    questionIds: group.map((q) => q.id),
    years,
    hasImage: group.some((q) => Boolean(q.referencia_imagem || /\[\[img:\d+\]\]/.test(q.referencia_texto ?? ""))),
    textLength: plainText(text).length,
    preview: buildReferencePreview(first),
    areas,
    contents,
    subcontents,
    mixedContent: contents.length > 1 || areas.length > 1,
  };
}

function buildReferencePreview(question: ProvaAnalysisQuestion) {
  const text = [question.referencia_texto, question.referencia_texto_apos]
    .filter(Boolean)
    .join(" ") || "Referência sem texto cadastrado.";
  const clean = plainText(text);
  return clean.length > 220 ? `${clean.slice(0, 217)}...` : clean;
}

function analyzeCrossData(questions: ProvaAnalysisQuestion[]): CrossAnalysisSummary {
  const contentByYear = buildCrossMatrix(
    questions,
    (q) => q.conteudo_principal || EMPTY_LABELS.content,
    (q) => [q.ano || EMPTY_LABELS.year],
    { rowLimit: 10, columnLimit: 12 },
  );
  const contentByType = buildCrossMatrix(
    questions,
    (q) => q.conteudo_principal || EMPTY_LABELS.content,
    (q) => [q.tipo || EMPTY_LABELS.type],
    { rowLimit: 10, columnLimit: 8 },
  );
  const provaByContent = buildCrossMatrix(
    questions,
    (q) => q.prova || EMPTY_LABELS.prova,
    (q) => [q.conteudo_principal || EMPTY_LABELS.content],
    { rowLimit: 8, columnLimit: 10 },
  );
  const contentByTerms = buildCrossMatrix(
    questions,
    (q) => q.conteudo_principal || EMPTY_LABELS.content,
    (q) => getMatchedTerms(q, [...GENERAL_TERMS, ...PHYSICS_TERMS]),
    { rowLimit: 10, columnLimit: 12 },
  );
  const contentByCommands = buildCrossMatrix(
    questions,
    (q) => q.conteudo_principal || EMPTY_LABELS.content,
    (q) => getMatchedTerms(q, COMMAND_PATTERNS),
    { rowLimit: 10, columnLimit: 10 },
  );

  return {
    contentByYear,
    contentByType,
    provaByContent,
    contentByTerms,
    contentByCommands,
    insights: buildCrossInsights(contentByType, contentByTerms, contentByCommands),
  };
}

function buildCrossMatrix(
  questions: ProvaAnalysisQuestion[],
  rowGetter: (question: ProvaAnalysisQuestion) => string,
  columnGetter: (question: ProvaAnalysisQuestion) => string[],
  options: { rowLimit: number; columnLimit: number },
): CrossMatrix {
  const matrix = new Map<string, Map<string, number>>();
  const rowTotals = new Map<string, number>();
  const columnTotals = new Map<string, number>();

  for (const question of questions) {
    const row = rowGetter(question);
    const columns = uniqueText(columnGetter(question).map((value) => normalizeNullableText(value)).filter((value): value is string => Boolean(value)));
    if (columns.length === 0) continue;

    rowTotals.set(row, (rowTotals.get(row) ?? 0) + 1);
    const rowMap = matrix.get(row) ?? new Map<string, number>();
    for (const column of columns) {
      rowMap.set(column, (rowMap.get(column) ?? 0) + 1);
      columnTotals.set(column, (columnTotals.get(column) ?? 0) + 1);
    }
    matrix.set(row, rowMap);
  }

  const rowsByTotal = Array.from(rowTotals.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  const selectedRows = new Set(rowsByTotal.slice(0, options.rowLimit).map(([row]) => row));
  const selectedColumns = Array.from(columnTotals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR", { numeric: true }))
    .slice(0, options.columnLimit)
    .map(([column]) => column);

  const rows: CrossMatrixRow[] = Array.from(selectedRows).map((row) => {
    const rowMap = matrix.get(row) ?? new Map<string, number>();
    const total = rowTotals.get(row) ?? 0;
    return {
      row,
      total,
      cells: selectedColumns.map((column) => {
        const count = rowMap.get(column) ?? 0;
        return {
          column,
          count,
          percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        };
      }),
    };
  });

  return { columns: selectedColumns, rows };
}

function buildCrossInsights(...matrices: CrossMatrix[]): CrossInsight[] {
  const insights: CrossInsight[] = [];

  for (const matrix of matrices) {
    for (const row of matrix.rows) {
      const top = row.cells.slice().sort((a, b) => b.count - a.count)[0];
      if (!top) continue;
      if (row.total < CROSS_MIN_ROW_TOTAL || top.count < CROSS_MIN_TOP_COUNT || top.percent < CROSS_STRONG_PERCENT) continue;

      insights.push({
        title: row.row,
        description: `${row.row} aparece principalmente associado a “${top.column}”.`,
        evidence: `${top.count} de ${row.total} questões (${top.percent}%).`,
      });
    }
  }

  return dedupeInsights(insights).slice(0, 8);
}

function dedupeInsights(insights: CrossInsight[]) {
  const seen = new Set<string>();
  return insights.filter((insight) => {
    const key = `${insight.title}|${insight.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getMatchedTerms(question: ProvaAnalysisQuestion, terms: string[]) {
  const text = getSearchableQuestionText(question);
  return terms.filter((term) => countOccurrences(text, normalizeForSearch(term)) > 0);
}

function countYears(questions: ProvaAnalysisQuestion[]): YearCountRow[] {
  const map = new Map<string, number>();
  for (const question of questions) {
    const year = question.ano || EMPTY_LABELS.year;
    map.set(year, (map.get(year) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => compareNumericText(a.year, b.year));
}

function uniqueYears(questions: ProvaAnalysisQuestion[]) {
  return uniqueText(questions.map((q) => q.ano).filter((year): year is string => Boolean(year)))
    .sort(compareNumericText);
}

function addFrequency(map: Map<string, { count: number; years: Set<string> }>, value: string, year?: string | null) {
  const current = map.get(value) ?? { count: 0, years: new Set<string>() };
  current.count += 1;
  if (year) current.years.add(year);
  map.set(value, current);
}

function toFrequencyRows(map: Map<string, { count: number; years: Set<string> }>, total: number): FrequencyRow[] {
  return Array.from(map.entries())
    .map(([value, data]) => ({
      value,
      count: data.count,
      percent: total > 0 ? Math.round((data.count / total) * 1000) / 10 : 0,
      years: Array.from(data.years).sort(compareNumericText),
    }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "pt-BR"));
}

function getSearchableQuestionText(question: ProvaAnalysisQuestion) {
  return normalizeForSearch([
    question.referencia_texto,
    question.referencia_texto_apos,
    question.enunciado,
    ...(question.alternativas ?? []).map((alt) => alt.texto),
  ].filter(Boolean).join("\n"));
}

function countOccurrences(text: string, normalizedTerm: string) {
  if (!text || !normalizedTerm) return 0;
  const pattern = new RegExp(`(^|\\W)${escapeRegExp(normalizedTerm)}(?=\\W|$)`, "g");
  return text.match(pattern)?.length ?? 0;
}

function buildTermExample(question: ProvaAnalysisQuestion): TermExample {
  return {
    questionId: question.id,
    numero: question.numero,
    prova: question.prova,
    ano: question.ano,
    preview: buildPreview(question),
  };
}

function buildPreview(question: ProvaAnalysisQuestion) {
  const text = [question.enunciado, question.referencia_texto, question.referencia_texto_apos]
    .map((value) => value ?? "")
    .find((value) => value.trim().length > 0) ?? "Sem texto cadastrado.";
  const clean = plainText(text);
  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
}

function normalizeForSearch(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\[\[img:\d+\]\]/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function plainText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\[\[img:\d+\]\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\$+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeNullableText(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTextArray(values: string[] | null | undefined) {
  return uniqueText((values ?? []).map((value) => normalizeNullableText(value)).filter((value): value is string => Boolean(value)));
}

function uniqueText(values: string[]) {
  return Array.from(new Set(values));
}

function compareNumericText(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { numeric: true });
}
