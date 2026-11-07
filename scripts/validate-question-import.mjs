import { readFileSync, statSync } from "node:fs";

const args = process.argv.slice(2);
const errors = [];
const fail = (path, message) => errors.push(path + ": " + message);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string";
const normalize = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .trim()
  .toLocaleLowerCase("pt-BR")
  .replace(/\s+/g, " ");

function checkKeys(value, allowed, path) {
  if (!isObject(value)) {
    fail(path, "deve ser um objeto JSON.");
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(path + "." + key, "campo desconhecido.");
  }
  return true;
}

function checkBlocks(blocks, path, maxTextLength) {
  if (!Array.isArray(blocks)) {
    fail(path, "deve ser uma lista de blocos.");
    return;
  }
  if (blocks.length > 41) fail(path, "aceita no máximo 41 blocos.");
  let imageCount = 0;
  let textLength = 0;
  blocks.forEach((block, index) => {
    const blockPath = path + "[" + index + "]";
    if (!isObject(block)) {
      fail(blockPath, "deve ser um bloco JSON.");
      return;
    }
    if (block.tipo === "texto") {
      checkKeys(block, ["tipo", "texto"], blockPath);
      if (!isText(block.texto) || block.texto.length > 40_000) {
        fail(blockPath + ".texto", "deve ser texto com até 40.000 caracteres.");
        return;
      }
      if (/\[\[img:\d+\]\]/.test(block.texto)) {
        fail(blockPath + ".texto", "use um bloco tipo imagem no ponto original, não um marcador digitado.");
      }
      textLength += block.texto.length;
    } else if (block.tipo === "imagem") {
      checkKeys(block, ["tipo"], blockPath);
      imageCount += 1;
    } else {
      fail(blockPath + ".tipo", "deve ser texto ou imagem.");
    }
  });
  if (imageCount > 20) fail(path, "aceita até 20 espaços reservados para imagem.");
  if (textLength > maxTextLength) fail(path, "o texto excede " + maxTextLength + " caracteres.");
}

function checkOptionalString(value, path, max) {
  if (value !== undefined && value !== null && (!isText(value) || value.length > max)) {
    fail(path, "deve ser texto com até " + max + " caracteres.");
  }
}

function checkReference(reference, index, ids) {
  const path = "references[" + index + "]";
  if (!checkKeys(reference, ["id", "texto", "blocos", "fonte"], path)) return;
  if (!isText(reference.id) || !/^[A-Za-z0-9._-]{1,80}$/.test(reference.id)) {
    fail(path + ".id", "use um identificador de até 80 caracteres com letras, números, ponto, hífen ou sublinhado.");
  } else if (ids.has(reference.id)) {
    fail(path + ".id", "identificador repetido.");
  } else {
    ids.add(reference.id);
  }
  checkOptionalString(reference.texto, path + ".texto", 40_000);
  checkOptionalString(reference.fonte, path + ".fonte", 1_000);
  if (reference.texto !== undefined && reference.blocos !== undefined) {
    fail(path, "use texto ou blocos, não os dois.");
  }
  if (!String(reference.texto ?? "").trim() && !Array.isArray(reference.blocos)) {
    fail(path, "informe texto ou blocos.");
  }
  if (reference.blocos !== undefined) checkBlocks(reference.blocos, path + ".blocos", 40_000);
  if (/\[\[img:\d+\]\]/.test(reference.texto ?? "")) {
    fail(path + ".texto", "use um bloco tipo imagem no ponto original.");
  }
}

function checkQuestion(question, index, referenceIds, identities) {
  const path = "questions[" + index + "]";
  const allowed = [
    "numero", "enunciado", "enunciado_blocos", "alternativas", "tipo", "resposta", "fonte",
    "area_geral", "conteudo_principal", "subconteudo_principal", "conteudos_relacionados",
    "tags_livres", "dificuldade", "ano", "prova", "instituicao", "modalidade", "caderno",
    "observacoes", "referencia_texto", "referencia_blocos", "referencia_fonte", "tem_equacao",
    "referencia_id",
  ];
  if (!checkKeys(question, allowed, path)) return;

  const requiredLimits = { numero: 40, ano: 20, prova: 100, instituicao: 200, area_geral: 200, conteudo_principal: 200, subconteudo_principal: 200 };
  for (const [field, max] of Object.entries(requiredLimits)) {
    if (!isText(question[field]) || !question[field].trim()) fail(path + "." + field, "campo obrigatório.");
    else if (question[field].length > max) fail(path + "." + field, "texto longo demais (máximo " + max + ").");
  }
  for (const [field, max] of [
    ["enunciado", 30_000], ["fonte", 1_000], ["dificuldade", 50], ["modalidade", 100],
    ["caderno", 100], ["observacoes", 3_000], ["referencia_texto", 40_000], ["referencia_fonte", 1_000],
  ]) checkOptionalString(question[field], path + "." + field, max);

  const statementText = typeof question.enunciado === "string" ? question.enunciado.trim() : "";
  if (!statementText && !Array.isArray(question.enunciado_blocos)) fail(path + ".enunciado", "informe texto ou blocos.");
  if (statementText && question.enunciado_blocos !== undefined) fail(path, "use enunciado ou enunciado_blocos, não os dois.");
  if (question.enunciado_blocos !== undefined) checkBlocks(question.enunciado_blocos, path + ".enunciado_blocos", 30_000);
  if (/\[\[img:\d+\]\]/.test(question.enunciado ?? "")) fail(path + ".enunciado", "use enunciado_blocos para espaços de imagem.");

  const referenceText = question.referencia_texto;
  if (String(referenceText ?? "").trim() && question.referencia_blocos !== undefined) {
    fail(path, "use referencia_texto ou referencia_blocos, não os dois.");
  }
  if (question.referencia_blocos !== undefined) checkBlocks(question.referencia_blocos, path + ".referencia_blocos", 40_000);
  if (/\[\[img:\d+\]\]/.test(referenceText ?? "")) fail(path + ".referencia_texto", "use referencia_blocos para espaços de imagem.");

  if (question.tem_equacao !== undefined && typeof question.tem_equacao !== "boolean") {
    fail(path + ".tem_equacao", "deve ser verdadeiro ou falso.");
  }
  for (const field of ["conteudos_relacionados", "tags_livres"]) {
    if (question[field] !== undefined) {
      if (!Array.isArray(question[field]) || question[field].length > 30 || question[field].some((item) => !isText(item) || !item.trim())) {
        fail(path + "." + field, "deve ser uma lista de textos não vazios (até 30).");
      }
    }
  }

  const type = question.tipo ?? "multipla_escolha";
  const supported = ["certo_errado", "numerica", "multipla_escolha", "discursiva"];
  if (!supported.includes(type)) fail(path + ".tipo", "tipo não suportado.");
  if (question.tipo !== undefined && !isText(question.tipo)) fail(path + ".tipo", "deve ser texto.");
  const alternatives = question.alternativas === undefined ? [] : question.alternativas;
  if (!Array.isArray(alternatives) || alternatives.length > 10) {
    fail(path + ".alternativas", "deve conter até 10 alternativas.");
    return;
  }
  const letters = new Set();
  alternatives.forEach((alternative, altIndex) => {
    const altPath = path + ".alternativas[" + altIndex + "]";
    if (!checkKeys(alternative, ["letra", "texto", "imagem_pendente"], altPath)) return;
    if (!isText(alternative.letra) || !/^[A-Z]$/.test(alternative.letra)) fail(altPath + ".letra", "use uma letra maiúscula.");
    else if (letters.has(alternative.letra)) fail(altPath + ".letra", "letra repetida.");
    else letters.add(alternative.letra);
    if (alternative.texto !== undefined && (!isText(alternative.texto) || alternative.texto.length > 10_000)) {
      fail(altPath + ".texto", "deve ser texto com até 10.000 caracteres.");
    }
    if (alternative.imagem_pendente !== undefined && typeof alternative.imagem_pendente !== "boolean") {
      fail(altPath + ".imagem_pendente", "deve ser verdadeiro ou falso.");
    }
    if (!String(alternative.texto ?? "").trim() && alternative.imagem_pendente !== true) {
      fail(altPath, "informe texto ou imagem_pendente: true.");
    }
  });

  const answer = question.resposta === null || question.resposta === undefined ? "" : String(question.resposta).trim();
  if (question.resposta !== undefined && question.resposta !== null && !isText(question.resposta)) {
    fail(path + ".resposta", "deve ser texto.");
  }
  if (type === "multipla_escolha") {
    if (alternatives.length < 2) fail(path + ".alternativas", "múltipla escolha exige ao menos duas alternativas.");
    if (answer && !letters.has(answer)) fail(path + ".resposta", "o gabarito precisa corresponder a uma alternativa.");
    if (!answer) fail(path + ".resposta", "informe o gabarito oficial.");
  } else {
    if (alternatives.length > 0) fail(path + ".alternativas", "itens que não são de múltipla escolha devem usar lista vazia.");
    if (type !== "discursiva" && !answer) fail(path + ".resposta", "informe o gabarito oficial.");
    if (type === "certo_errado" && answer && !/^(C|E)$/i.test(answer)) fail(path + ".resposta", "use C ou E.");
    if (type === "numerica" && answer && !Number.isFinite(Number(answer.replace(",", ".")))) {
      fail(path + ".resposta", "informe uma resposta numérica.");
    }
  }

  if (question.referencia_id !== undefined && question.referencia_id !== null && question.referencia_id !== "") {
    if (!referenceIds.has(question.referencia_id)) fail(path + ".referencia_id", "a referência não existe no manifesto.");
    if (String(question.referencia_texto ?? "").trim() || question.referencia_blocos !== undefined || String(question.referencia_fonte ?? "").trim()) {
      fail(path + ".referencia_id", "não misture uma referência compartilhada com campos de referência no item.");
    }
  }

  const identity = [
    question.instituicao, question.prova, question.ano, question.modalidade, question.caderno, question.numero,
  ].map(normalize).join("|");
  if (identities.has(identity)) fail(path, "identidade de prova/ano/modalidade/caderno/número repetida no lote.");
  identities.add(identity);
}

if (args.length !== 1) {
  console.error("Uso: node scripts/validate-question-import.mjs caminho/manifest.json");
  process.exit(2);
}

let manifest;
try {
  if (statSync(args[0]).size > 2_000_000) fail("manifest", "o JSON excede o limite de 2 MB.");
  manifest = JSON.parse(readFileSync(args[0], "utf8"));
} catch (error) {
  console.error("Não foi possível ler o JSON: " + (error instanceof Error ? error.message : String(error)));
  process.exit(2);
}

if (checkKeys(manifest, ["schema_version", "batch_key", "references", "questions"], "manifest")) {
  if (manifest.schema_version !== 1) fail("schema_version", "use a versão 1.");
  if (!isText(manifest.batch_key) || !/^[A-Za-z0-9._-]{3,120}$/.test(manifest.batch_key)) {
    fail("batch_key", "use de 3 a 120 caracteres: letras, números, ponto, hífen ou sublinhado.");
  }
  const references = manifest.references === undefined ? [] : manifest.references;
  if (!Array.isArray(references) || references.length > 35) fail("references", "deve conter até 35 referências.");
  const referenceIds = new Set();
  if (Array.isArray(references)) references.forEach((reference, index) => checkReference(reference, index, referenceIds));
  if (!Array.isArray(manifest.questions) || manifest.questions.length < 1 || manifest.questions.length > 35) {
    fail("questions", "o lote deve conter de 1 a 35 itens.");
  } else {
    const identities = new Set();
    manifest.questions.forEach((question, index) => checkQuestion(question, index, referenceIds, identities));
  }
}

if (errors.length) {
  console.error("Manifesto inválido:");
  for (const error of errors) console.error("- " + error);
  process.exit(1);
}
console.log("Manifesto estruturalmente válido. Os catálogos ativos são conferidos pelo endpoint após a aprovação do PR.");
