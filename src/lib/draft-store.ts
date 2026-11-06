import { Alternativa as AlternativaBase, DigitalizacaoExtraida, QuestaoExtraida } from "@/lib/digitize.functions";
import type { ExtraImage, ImagePlacementLayout } from "@/lib/image-layout";
import { normalizeExtraImages } from "@/lib/image-layout";

export type Alternativa = AlternativaBase & { imagem?: string };
export type ReferenceImagePosition = "antes" | "entre" | "depois" | "livre";

export type DraftQuestion = Omit<QuestaoExtraida, "alternativas"> & {
  id?: string;
  disciplina?: string;
  conteudo?: string;
  dificuldade?: string;
  area_geral?: string;
  conteudo_principal?: string;
  subconteudo_principal?: string;
  conteudos_relacionados?: string[];
  tags_livres?: string[];
  ano?: string;
  prova?: string;
  instituicao?: string;
  observacoes?: string;
  alternativas: Alternativa[];
  enunciado_imagem?: string;
  enunciado_imagem_pos?: "antes" | "depois" | "livre";
  enunciado_imagem_layout?: ImagePlacementLayout;
  enunciado_imagens_extra?: ExtraImage[];
};
export type DraftDigitization = {
  referencia_texto: string;
  referencia_fonte: string;
  referencia_imagem?: string;
  referencia_imagem_pos?: ReferenceImagePosition;
  referencia_imagem_layout?: ImagePlacementLayout;
  referencia_imagens_extra?: ExtraImage[];
  referencia_texto_apos?: string;
  imageDataUrl?: string;
  imageDataUrls?: string[];
  questoes: DraftQuestion[];
};

export function createEmptyDraftQuestion(overrides: Partial<DraftQuestion> = {}): DraftQuestion {
  return {
    numero: "",
    enunciado: "",
    alternativas: [],
    tipo: "multipla_escolha",
    resposta: "",
    fonte: "",
    tem_equacao: false,
    tem_imagem: false,
    baixa_confianca: [],
    ...overrides,
  };
}


const KEY = "digitalizador.draft";

export function saveDraft(q: DraftDigitization | DraftQuestion) {
  if (trySaveDraft(q)) return true;

  const compact = compactDraftForStorage(q);
  if (compact && trySaveDraft(compact)) {
    console.warn("Rascunho salvo em modo compacto porque as imagens originais ficaram grandes demais para o armazenamento temporário.");
    return true;
  }

  console.warn("Não foi possível salvar o rascunho temporário da revisão.");
  return false;
}
export function loadDraft(): DraftDigitization | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v ? normalizeDraft(JSON.parse(v) as DraftDigitization | DraftQuestion) : null;
  } catch { return null; }
}
export function clearDraft() {
  try { sessionStorage.removeItem(KEY); } catch {}
}

function trySaveDraft(q: DraftDigitization | DraftQuestion) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(q));
    return true;
  } catch {
    return false;
  }
}

function compactDraftForStorage(q: DraftDigitization | DraftQuestion): DraftDigitization | null {
  const draft = normalizeDraft(q);
  const compact: DraftDigitization = {
    ...draft,
    imageDataUrl: undefined,
    imageDataUrls: undefined,
  };

  if (compact.referencia_imagem && isLargeDataUrl(compact.referencia_imagem)) {
    compact.referencia_imagem = undefined;
    compact.referencia_imagem_pos = undefined;
    compact.referencia_imagem_layout = undefined;
  }

  compact.referencia_imagens_extra = dropLargeExtras(compact.referencia_imagens_extra);

  compact.questoes = compact.questoes.map((question) => ({
    ...question,
    enunciado_imagem: isLargeDataUrl(question.enunciado_imagem) ? undefined : question.enunciado_imagem,
    enunciado_imagens_extra: dropLargeExtras(question.enunciado_imagens_extra),
    alternativas: question.alternativas.map((alternativa) => ({
      ...alternativa,
      imagem: isLargeDataUrl(alternativa.imagem) ? undefined : alternativa.imagem,
    })),
  }));


  return compact;
}

function isLargeDataUrl(value?: string | null) {
  return Boolean(value?.startsWith("data:image") && value.length > 1_500_000);
}

function dropLargeExtras(extras?: ExtraImage[]) {
  const list = (extras ?? []).filter((item) => !isLargeDataUrl(item.url));
  return list.length > 0 ? list : undefined;
}


function normalizeDraft(draft: DraftDigitization | DraftQuestion): DraftDigitization {
  if ("questoes" in draft && Array.isArray(draft.questoes)) {
    return {
      referencia_texto: draft.referencia_texto ?? "",
      referencia_fonte: draft.referencia_fonte ?? "",
      referencia_imagem: draft.referencia_imagem,
      referencia_imagem_pos: draft.referencia_imagem_pos,
      referencia_imagem_layout: draft.referencia_imagem_layout,
      referencia_imagens_extra: normalizeExtraImages(draft.referencia_imagens_extra),
      referencia_texto_apos: draft.referencia_texto_apos ?? "",
      imageDataUrl: draft.imageDataUrl,
      imageDataUrls: Array.isArray(draft.imageDataUrls) ? draft.imageDataUrls.filter(Boolean) : undefined,
      questoes: draft.questoes.length > 0
        ? draft.questoes.map((q) => ({ ...q, enunciado_imagens_extra: normalizeExtraImages(q.enunciado_imagens_extra) }))
        : [{
          numero: "",
          enunciado: "",
          alternativas: [],
          tipo: "discursiva",
          resposta: "",
          fonte: "",
          tem_equacao: false,
          tem_imagem: false,
          baixa_confianca: [],
        }],

    };
  }

  return {
    referencia_texto: "",
    referencia_fonte: "",
    referencia_imagem: undefined,
    referencia_imagem_pos: undefined,
    referencia_imagem_layout: undefined,
    referencia_texto_apos: "",
    imageDataUrl: undefined,
    imageDataUrls: undefined,
    questoes: [draft as DraftQuestion],
  };
}

export const LETRAS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export function reletter(alts: Alternativa[]): Alternativa[] {
  return alts.map((a, i) => ({ ...a, letra: LETRAS[i] ?? a.letra }));
}
