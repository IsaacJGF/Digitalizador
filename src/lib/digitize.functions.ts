import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callGeminiVision } from "./ai-gateway.server";
import { MAX_DIGITIZE_IMAGE_DATA_URL_LENGTH } from "@/lib/image-limits";

const Input = z.object({
  imageDataUrl: z.string()
    .min(40)
    .max(MAX_DIGITIZE_IMAGE_DATA_URL_LENGTH)
    .regex(/^data:image\/(?:jpe?g|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/i),
});

export type Alternativa = { letra: string; texto: string };
export type QuestaoExtraida = {
  numero: string;
  enunciado: string;
  alternativas: Alternativa[];
  tipo: "multipla_escolha" | "certo_errado" | "numerica" | "discursiva";
  resposta: string;
  fonte: string;
  tem_equacao: boolean;
  tem_imagem: boolean;
  baixa_confianca: string[];
  area_geral?: string;
  conteudo_principal?: string;
  subconteudo_principal?: string;
  conteudos_relacionados?: string[];
  tags_livres?: string[];
  ano?: string;
  prova?: string;
  instituicao?: string;
  observacoes?: string;
};
export type DigitalizacaoExtraida = {
  referencia_texto: string;
  referencia_fonte: string;
  questoes: QuestaoExtraida[];
};
export type DigitizeErrorCode =
  | "missing_api_key"
  | "invalid_api_key"
  | "rate_limit"
  | "credits"
  | "invalid_response"
  | "truncated_response"
  | "gateway_error";
export type DigitizeResult =
  | { ok: true; data: DigitalizacaoExtraida }
  | { ok: false; errorCode: DigitizeErrorCode; message: string };

const SYSTEM = `Você é um OCR especializado em digitalização de questões de prova em português brasileiro.

Analise a imagem fornecida e extraia a digitalização de forma estruturada. A imagem pode conter uma questão única, um texto-base/referência seguido por vários itens numerados, OU uma montagem vertical com partes sequenciais da mesma questão.

Além de transcrever a questão, sugira automaticamente a classificação pedagógica do item quando houver evidência suficiente. Essa classificação será editável depois pelo usuário, então ela pode ser uma sugestão, mas não deve ser inventada sem base.

Retorne APENAS um objeto JSON válido com este formato exato:

{
  "referencia_texto": "texto-base, comando geral, tabela, descrição de imagem ou contexto comum aos itens; use "" se não houver",
  "referencia_fonte": "fonte da referência, por exemplo Internet, ENEM, banca/ano; use "" se não houver",
  "questoes": [
    {
      "numero": "string (ex: "1", "86" ou "" se não houver)",
      "enunciado": "texto específico do item/questão, sem repetir a referência comum",
      "alternativas": [{"letra": "A", "texto": "..."}, ...],
      "tipo": "multipla_escolha" | "certo_errado" | "numerica" | "discursiva",
      "resposta": "string (gabarito se visível, senão "")",
      "fonte": "string (instituição/prova/ano se visível, senão "")",
      "tem_equacao": boolean,
      "tem_imagem": boolean,
      "baixa_confianca": ["trechos com baixa confiança de leitura"],
      "area_geral": "sugestão de área geral; use "" se não houver segurança",
      "conteudo_principal": "sugestão de conteúdo principal; use "" se não houver segurança",
      "subconteudo_principal": "sugestão de subconteúdo principal; use "" se não houver segurança",
      "conteudos_relacionados": ["assuntos relacionados observados na questão"],
      "tags_livres": ["tags de abordagem, recurso, tipo ou contexto"],
      "ano": "ano da prova se visível ou inferível pela fonte; senão """,
      "prova": "nome da prova se visível, por exemplo ENEM, PAS, PAS 1, Vestibular UnB; senão """,
      "instituicao": "instituição/banca se visível, por exemplo INEP, UnB, CEBRASPE; senão """,
      "observacoes": "comentário curto sobre a sugestão de classificação, principalmente se houver incerteza; senão """
    }
  ]
}

REGRAS CRÍTICAS DE SEGMENTAÇÃO DE QUESTÕES (LEIA COM ATENÇÃO):
- Sua tarefa mais importante é IDENTIFICAR CORRETAMENTE onde termina uma questão e começa outra. Uma página de PDF pode conter 1, 2, 3 ou mais questões independentes.
- Considere uma NOVA questão sempre que aparecer: um novo número/identificador (ex: "1.", "2)", "Questão 15", "QUESTÃO 86", "86.", "(ENEM 2020)", "(UnB/2019)"), uma nova fonte/banca, um novo enunciado que não depende do texto anterior, ou uma nova imagem/gráfico independente.
- Cada questão identificada DEVE virar um objeto próprio dentro de "questoes". NUNCA junte duas questões numeradas diferentes em um só objeto.
- Se a página tem 2 questões, o array "questoes" deve ter 2 objetos. Se tem 5 questões, 5 objetos. Não resuma nem combine.
- Em provas de "julgue os itens" (certo/errado), cada item numerado (86, 87, 88…) é uma questão separada — crie um objeto por item, todos com tipo "certo_errado" e alternativas [].
- Se um texto-base, gráfico, tabela ou comando é COMUM a várias questões da página, coloque em "referencia_texto" UMA vez e NÃO repita em cada enunciado. Cada questão fica só com seu enunciado próprio + alternativas próprias.
- Se as questões da página NÃO compartilham texto-base, deixe "referencia_texto" = "" e coloque o contexto específico de cada uma dentro do próprio "enunciado".
- Se a imagem tiver marcadores como "Parte 1 de 3", "Parte 2 de 3", etc., leia essas partes como sequência contínua da MESMA questão. Não trate cada parte como nova questão só por causa do marcador.
- Se houver quebra entre partes sequenciais, junte o texto na ordem visual de cima para baixo.

REGRAS CRÍTICAS DE TRANSCRIÇÃO:
- NÃO invente texto, números ou símbolos que não estejam legíveis. Se um trecho estiver ilegível, escreva "[ilegível]" no local e adicione à lista "baixa_confianca".
- Preserve equações usando notação LaTeX entre cifrões: $x^2 + 2x$ inline, ou $$\\frac{a}{b}$$ em linha separada.
- Use letras gregas em LaTeX: $\\alpha$, $\\pi$, $\\Delta$.
- Frações: $\\frac{numerador}{denominador}$. Potências: $x^{2}$. Índices: $H_{2}O$. Raízes: $\\sqrt{x}$.
- Preserve a organização visual fiel ao impresso usando as marcações leves abaixo, em todos os campos de texto (referencia_texto, enunciado, alternativas).
- Alinhamento: envolva blocos claramente alinhados com [left]...[/left], [center]...[/center], [right]...[/right] ou [justify]...[/justify]. Se não houver segurança sobre o alinhamento, use justificado ou deixe sem marcação, pois o sistema usará justificado como padrão.
- Negrito: **texto**. NUNCA use \\textbf{}. Itálico: *texto*. NUNCA use \\textit{} nem \\emph{}. Sublinhado: __texto__ ou <u>texto</u>. NUNCA use \\underline{} fora de equações.
- Sombreamento ou destaque visual: use <mark>texto</mark> ou ==texto==.
- Sobrescrito em texto comum: ^{2} ou <sup>2</sup>. Subscrito em texto comum: _{2} ou <sub>2</sub>. Para fórmulas, prefira LaTeX entre cifrões.
- Matemática SEMPRE entre cifrões: $x^2 + 2x$ inline, ou $$\\frac{a}{b}$$ em linha separada. Use \\frac, \\sqrt, \\alpha, \\pi, \\Delta etc. APENAS dentro de $...$. Fora dos cifrões, NÃO use comandos LaTeX crus — se vir o resultado bruto (\\textbf, \\frac sem cifrão, etc.) na saída, está errado.
- Preserve quebras de linha e parágrafos com \\n. Preserve espaçamento entre blocos com linha em branco quando isso existir visualmente.
- Preserve listas com linhas iniciadas por "- ", "1. " ou "A. ". Preserve tabelas em formato Markdown com pipes, por exemplo "| Coluna A | Coluna B |" e uma linha separadora "|---|---|".
- Para títulos ou trechos destacados, use **negrito**, <mark>destaque</mark> quando houver sombreamento, e, se visivelmente centralizados, [center]...[/center].
- Separe corretamente o enunciado das alternativas. Cada alternativa em um objeto próprio com letra (A, B, C, D, E) e texto.
- Se a questão for de certo/errado, use alternativas vazias [] e tipo "certo_errado".
- Se a questão for discursiva ou numérica, alternativas = [].
- tem_imagem = true se a questão contém gráfico, figura, tabela ou diagrama.
- tem_equacao = true se contém qualquer notação matemática/química.

REGRAS PARA A CLASSIFICAÇÃO PEDAGÓGICA:
- A classificação pedagógica é uma sugestão automática, não uma transcrição literal.
- Preencha área_geral, conteudo_principal e subconteudo_principal apenas quando a questão oferecer evidência clara.
- Use nomes curtos e padronizados de Física do Ensino Médio.
- Exemplos de área_geral: Fundamentos da Física, Mecânica, Fluidos, Termologia e Termodinâmica, Ondulatória, Óptica, Eletricidade, Magnetismo e Eletromagnetismo, Física Moderna, Física Nuclear e Radiações, Astronomia e Cosmologia, Física Experimental, Interdisciplinar e Aplicações Tecnológicas.
- Exemplos de conteudo_principal: Cinemática, Dinâmica, Estática, Trabalho, Energia e Potência, Impulso e Quantidade de Movimento, Gravitação, Hidrostática, Hidrodinâmica, Calorimetria, Propagação de calor, Termodinâmica, Ondas, Acústica, Óptica geométrica, Eletrostática, Eletrodinâmica, Circuitos elétricos, Magnetismo, Indução eletromagnética, Física quântica, Radioatividade, Medidas e experimentação.
- Exemplos de subconteudo_principal: Movimento uniforme, Movimento uniformemente variado, Queda livre, Lançamento horizontal, Leis de Newton, Plano inclinado, Força de atrito, Energia cinética, Conservação da energia mecânica, Pressão hidrostática, Empuxo, Calor específico, Ondas sonoras, Efeito Doppler, Lei de Ohm, Associação de resistores, Campo elétrico, Lei de Faraday, Efeito fotoelétrico.
- Conteúdos relacionados devem listar assuntos secundários realmente usados na questão, como Força peso, Força normal, Velocidade média, Energia cinética, Corrente elétrica, Temperatura, Frequência, Pressão, Campo elétrico.
- Tags devem indicar formato e abordagem, como Cálculo direto, Questão conceitual, Questão contextualizada, Com gráfico, Com tabela, Com imagem, Com dados numéricos, Certo ou errado, Múltipla escolha, Resposta numérica, Questão de interpretação textual.
- Se a classificação for incerta, deixe o campo principal vazio e explique rapidamente em observacoes.
- Não force classificações genéricas como "Mecânica" se o conteúdo específico não estiver claro.
- Retorne SOMENTE o JSON, sem markdown fora do JSON, sem explicações.`;

export const digitizeQuestion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<DigitizeResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return digitizeFailure(
        "missing_api_key",
        "Digitalização por IA não configurada. Configure a chave LOVABLE_API_KEY no ambiente do projeto e tente novamente.",
      );
    }

    try {
      const raw = await callGeminiVision({
        apiKey,
        model: "google/gemini-2.5-flash",
        systemPrompt: SYSTEM,
        userText: "Digitalize esta imagem seguindo as regras do sistema. ATENÇÃO: a imagem pode conter MÚLTIPLAS questões independentes — identifique cada uma pelo número/identificador e crie um objeto separado em 'questoes' para cada uma. Não combine questões diferentes em um só objeto. Preserve a formatação visual quando clara. Se houver partes sequenciais da mesma questão, leia de cima para baixo e una o conteúdo. Sugira também a classificação pedagógica quando houver evidência suficiente.",
        imageDataUrl: data.imageDataUrl,
      });

      try {
        const parsed = extractJSON(raw) as DigitalizacaoExtraida | QuestaoExtraida;
        return { ok: true, data: normalizeDigitization(parsed) };
      } catch (e) {
        console.error("Falha ao parsear resposta da IA:", e, { responseLength: raw.length });
        return digitizeFailure("invalid_response", "A IA retornou um formato inválido. Tente novamente com uma imagem mais nítida.");
      }
    } catch (error) {
      console.error("Falha ao digitalizar questão:", error);
      return digitizeFailureFromError(error);
    }
  });

function normalizeQuestion(q: Partial<QuestaoExtraida>): QuestaoExtraida {
  return {
    numero: q.numero ?? "",
    enunciado: q.enunciado ?? "",
    alternativas: Array.isArray(q.alternativas) ? q.alternativas : [],
    tipo: q.tipo ?? "discursiva",
    resposta: q.resposta ?? "",
    fonte: q.fonte ?? "",
    tem_equacao: !!q.tem_equacao,
    tem_imagem: !!q.tem_imagem,
    baixa_confianca: Array.isArray(q.baixa_confianca) ? q.baixa_confianca : [],
    area_geral: cleanOptionalString(q.area_geral),
    conteudo_principal: cleanOptionalString(q.conteudo_principal),
    subconteudo_principal: cleanOptionalString(q.subconteudo_principal),
    conteudos_relacionados: normalizeStringArray(q.conteudos_relacionados, 8),
    tags_livres: normalizeStringArray(q.tags_livres, 10),
    ano: cleanOptionalString(q.ano),
    prova: cleanOptionalString(q.prova),
    instituicao: cleanOptionalString(q.instituicao),
    observacoes: cleanOptionalString(q.observacoes),
  };
}

function normalizeDigitization(parsed: DigitalizacaoExtraida | QuestaoExtraida): DigitalizacaoExtraida {
  if ("questoes" in parsed && Array.isArray(parsed.questoes)) {
    const questoes = parsed.questoes.map(normalizeQuestion);
    return {
      referencia_texto: parsed.referencia_texto ?? "",
      referencia_fonte: parsed.referencia_fonte ?? "",
      questoes: questoes.length > 0 ? questoes : [normalizeQuestion({})],
    };
  }

  return {
    referencia_texto: "",
    referencia_fonte: "",
    questoes: [normalizeQuestion(parsed as Partial<QuestaoExtraida>)],
  };
}

function cleanOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(cleanOptionalString).filter((item): item is string => Boolean(item)))).slice(0, limit);
}

function digitizeFailure(errorCode: DigitizeErrorCode, message: string): DigitizeResult {
  return { ok: false, errorCode, message };
}

function digitizeFailureFromError(error: unknown): DigitizeResult {
  const text = errorMessage(error);
  const lower = text.toLowerCase();

  if (lower.includes("401") || lower.includes("403")) {
    return digitizeFailure("invalid_api_key", "A chave de IA está inválida ou sem permissão. Verifique a LOVABLE_API_KEY e tente novamente.");
  }
  if (lower.includes("429")) {
    return digitizeFailure("rate_limit", "Limite de IA atingido. Aguarde alguns instantes e tente novamente.");
  }
  if (lower.includes("402")) {
    return digitizeFailure("credits", "Créditos de IA esgotados. Adicione créditos no workspace e tente novamente.");
  }
  if (lower.includes("truncada") || lower.includes("truncated")) {
    return digitizeFailure("truncated_response", "A resposta da IA foi muito longa. Tente uma imagem com menos conteúdo ou divida em partes menores.");
  }

  return digitizeFailure("gateway_error", "Falha ao digitalizar. Verifique a imagem e tente novamente.");
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function extractJSON(raw: string): unknown {
  let cleaned = raw
    .replace(/^\uFEFF/, "")
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();

  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const objStart = cleaned.indexOf("{");
    const arrStart = cleaned.indexOf("[");
    const isArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
    const start = isArray ? arrStart : objStart;
    const end = isArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    } else {
      throw new Error("No JSON found");
    }
  }
  return JSON.parse(cleaned);
}
