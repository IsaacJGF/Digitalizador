import { buildAISummaryInput } from "@/lib/prova-ai-summary";
import { hasAlternatives, hasImage, hasReference, type CrossAnalysisSummary, type FrequencyRow, type ProvaAnalysisQuestion, type ProvaAnalysisSummary, type ReferenceAnalysisSummary, type TermFrequencyRow } from "@/lib/prova-analysis";

export type DeepAnalysisFilters = {
  prova: string;
  instituicao: string;
  anoInicial: string;
  anoFinal: string;
  areaGeral: string;
  conteudoPrincipal: string;
  subconteudoPrincipal: string;
  tipo: string;
};

export type DeepQuestionPayload = {
  id: string;
  numero_item: string;
  prova: string;
  instituicao: string;
  ano: string;
  tipo: string;
  referencia_texto_base: string;
  enunciado: string;
  alternativas: Array<{ letra: string; texto: string }>;
  gabarito_resposta: string;
  area_geral: string;
  conteudo_principal: string;
  subconteudo_principal: string;
  conteudos_relacionados: string[];
  tags: string[];
  possui_imagem: boolean;
  possui_equacao: boolean;
};

export type DeepAnalysisPayload = {
  filtros_aplicados: DeepAnalysisFilters;
  total_questoes: number;
  anos_analisados: string[];
  distribuicao_por_conteudo: Array<FrequencyPayload>;
  distribuicao_por_subconteudo: Array<FrequencyPayload>;
  distribuicao_por_tipo: Array<FrequencyPayload>;
  termos_frequentes: Array<TermPayload>;
  comandos_frequentes: Array<TermPayload>;
  analise_referencias_textos_base: ReferenceAnalysisSummary;
  cruzamentos_estatisticos: Pick<CrossAnalysisSummary, "insights"> & {
    conteudo_por_tipo: Array<CrossPayload>;
    conteudo_por_termos: Array<CrossPayload>;
    conteudo_por_comandos: Array<CrossPayload>;
  };
  qualidade_dados: {
    total_questoes: number;
    sem_area: number;
    sem_conteudo: number;
    sem_subconteudo: number;
    sem_ano: number;
    sem_tipo: number;
    com_imagem: number;
    com_equacao: number;
    com_referencia: number;
    com_alternativas: number;
  };
  amostra: {
    limite_questoes_enviadas: number;
    quantidade_enviada: number;
    usou_amostra_representativa: boolean;
    criterio: string;
    aviso: string;
  };
  lista_questoes_analisadas: DeepQuestionPayload[];
};

export type DeepPattern = {
  titulo: string;
  explicacao: string;
  evidencia: string;
  nivel_confianca: "baixo" | "médio" | "alto";
};

export type DeepAnalysisReport = {
  aviso_amostra: string;
  visao_geral: string;
  padroes_conteudo: DeepPattern[];
  padroes_linguagem: DeepPattern[];
  padroes_construcao_itens: DeepPattern[];
  uso_texto_base: string;
  padroes_sutis: DeepPattern[];
  recomendacoes_simulado: DeepPattern[];
  limitacoes: string[];
  evidencias_usadas: string[];
};

type FrequencyPayload = {
  item: string;
  quantidade: number;
  percentual: number;
  anos: string[];
};

type TermPayload = {
  termo: string;
  ocorrencias: number;
  questoes: number;
  percentual_questoes: number;
  anos: string[];
  exemplos: Array<{ id: string; numero: string; prova: string; ano: string; trecho: string }>;
};

type CrossPayload = {
  linha: string;
  total: number;
  principais_colunas: Array<{ coluna: string; quantidade: number; percentual: number }>;
};

const MAX_QUESTIONS_FOR_AI = 50;

export function buildDeepAnalysisPayload(summary: ProvaAnalysisSummary, filters: DeepAnalysisFilters): DeepAnalysisPayload {
  const selectedQuestions = selectQuestionsForAI(summary);
  const structuredSummary = buildAISummaryInput(summary);
  const sampled = summary.total > MAX_QUESTIONS_FOR_AI;

  return {
    filtros_aplicados: filters,
    total_questoes: summary.total,
    anos_analisados: summary.years,
    distribuicao_por_conteudo: summary.contentFrequency.slice(0, 20).map(toFrequencyPayload),
    distribuicao_por_subconteudo: summary.subcontentFrequency.slice(0, 20).map(toFrequencyPayload),
    distribuicao_por_tipo: summary.typeCounts.slice(0, 12).map(toFrequencyPayload),
    termos_frequentes: [
      ...summary.generalTermFrequency.slice(0, 12),
      ...summary.physicsTermFrequency.slice(0, 12),
    ].map(toTermPayload),
    comandos_frequentes: summary.commandFrequency.slice(0, 12).map(toTermPayload),
    analise_referencias_textos_base: {
      ...summary.referenceAnalysis,
      topReferences: summary.referenceAnalysis.topReferences.slice(0, 10),
    },
    cruzamentos_estatisticos: {
      insights: summary.crossAnalysis.insights.slice(0, 10),
      conteudo_por_tipo: toCrossPayload(summary.crossAnalysis.contentByType),
      conteudo_por_termos: toCrossPayload(summary.crossAnalysis.contentByTerms),
      conteudo_por_comandos: toCrossPayload(summary.crossAnalysis.contentByCommands),
    },
    qualidade_dados: {
      total_questoes: structuredSummary.totalQuestions,
      sem_area: structuredSummary.dataQuality.missingArea,
      sem_conteudo: structuredSummary.dataQuality.missingContent,
      sem_subconteudo: structuredSummary.dataQuality.missingSubcontent,
      sem_ano: structuredSummary.dataQuality.missingYear,
      sem_tipo: structuredSummary.dataQuality.missingType,
      com_imagem: structuredSummary.imageUse.count,
      com_equacao: structuredSummary.equationUse.count,
      com_referencia: structuredSummary.referenceUse.count,
      com_alternativas: structuredSummary.alternativeUse.count,
    },
    amostra: {
      limite_questoes_enviadas: MAX_QUESTIONS_FOR_AI,
      quantidade_enviada: selectedQuestions.length,
      usou_amostra_representativa: sampled,
      criterio: sampled
        ? "Amostra prioriza conteúdos frequentes, questões com texto-base, comandos recorrentes, variedade de tipos e maior preenchimento de metadados."
        : "Todas as questões analisadas foram enviadas para a IA.",
      aviso: sampled
        ? "A análise possui muitas questões. Para reduzir custo e tempo, a IA analisará uma amostra representativa junto com os dados estatísticos completos."
        : "",
    },
    lista_questoes_analisadas: selectedQuestions.map(toQuestionPayload),
  };
}

export function deepAnalysisPayloadToText(payload: DeepAnalysisPayload) {
  return JSON.stringify(payload, null, 2);
}

function selectQuestionsForAI(summary: ProvaAnalysisSummary) {
  if (summary.questions.length <= MAX_QUESTIONS_FOR_AI) return summary.questions;

  const selected = new Map<string, ProvaAnalysisQuestion>();
  const sorted = summary.questions.slice().sort((a, b) => scoreQuestion(b, summary) - scoreQuestion(a, summary));

  for (const type of summary.typeCounts.map((row) => row.value)) {
    const question = sorted.find((item) => item.tipo === type);
    if (question) selected.set(question.id, question);
  }

  for (const question of sorted) {
    if (selected.size >= MAX_QUESTIONS_FOR_AI) break;
    selected.set(question.id, question);
  }

  return Array.from(selected.values());
}

function scoreQuestion(question: ProvaAnalysisQuestion, summary: ProvaAnalysisSummary) {
  const topContents = new Set(summary.contentFrequency.slice(0, 6).map((row) => row.value));
  const commandTerms = summary.commandFrequency.slice(0, 8).map((row) => row.term.toLowerCase());
  const searchable = [
    question.referencia_texto,
    question.referencia_texto_apos,
    question.enunciado,
    ...(question.alternativas ?? []).map((alt) => alt.texto),
  ].filter(Boolean).join(" ").toLowerCase();

  let score = 0;
  if (question.conteudo_principal && topContents.has(question.conteudo_principal)) score += 30;
  if (hasReference(question)) score += 25;
  if (commandTerms.some((term) => searchable.includes(term))) score += 18;
  if (hasAlternatives(question)) score += 8;
  if (question.tem_equacao) score += 6;
  if (hasImage(question)) score += 6;
  score += metadataScore(question);
  return score;
}

function metadataScore(question: ProvaAnalysisQuestion) {
  return [
    question.prova,
    question.instituicao,
    question.ano,
    question.area_geral,
    question.conteudo_principal,
    question.subconteudo_principal,
    question.conteudos_relacionados?.length ? "conteudos" : "",
    question.tags_livres?.length || question.tags?.length ? "tags" : "",
  ].filter(Boolean).length;
}

function toQuestionPayload(question: ProvaAnalysisQuestion): DeepQuestionPayload {
  return {
    id: question.id,
    numero_item: question.numero ?? "",
    prova: question.prova ?? "",
    instituicao: question.instituicao ?? "",
    ano: question.ano ?? "",
    tipo: question.tipo ?? "",
    referencia_texto_base: cleanText([question.referencia_texto, question.referencia_texto_apos].filter(Boolean).join("\n\n")),
    enunciado: cleanText(question.enunciado ?? ""),
    alternativas: (question.alternativas ?? []).map((alt) => ({ letra: alt.letra ?? "", texto: cleanText(alt.texto ?? "") })),
    gabarito_resposta: question.resposta ?? "",
    area_geral: question.area_geral ?? "",
    conteudo_principal: question.conteudo_principal ?? "",
    subconteudo_principal: question.subconteudo_principal ?? "",
    conteudos_relacionados: question.conteudos_relacionados ?? [],
    tags: question.tags_livres?.length ? question.tags_livres : question.tags ?? [],
    possui_imagem: hasImage(question),
    possui_equacao: Boolean(question.tem_equacao),
  };
}

function toFrequencyPayload(row: FrequencyRow): FrequencyPayload {
  return {
    item: row.value,
    quantidade: row.count,
    percentual: row.percent,
    anos: row.years,
  };
}

function toTermPayload(row: TermFrequencyRow): TermPayload {
  return {
    termo: row.term,
    ocorrencias: row.count,
    questoes: row.questionCount,
    percentual_questoes: row.percent,
    anos: row.years,
    exemplos: row.examples.map((example) => ({
      id: example.questionId,
      numero: example.numero ?? "",
      prova: example.prova ?? "",
      ano: example.ano ?? "",
      trecho: example.preview,
    })),
  };
}

function toCrossPayload(matrix: CrossAnalysisSummary["contentByType"]): CrossPayload[] {
  return matrix.rows.slice(0, 10).map((row) => ({
    linha: row.row,
    total: row.total,
    principais_colunas: row.cells
      .filter((cell) => cell.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((cell) => ({ coluna: cell.column, quantidade: cell.count, percentual: cell.percent })),
  }));
}

function cleanText(value: string) {
  return value
    .replace(/\[\[img:\d+\]\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3500);
}
