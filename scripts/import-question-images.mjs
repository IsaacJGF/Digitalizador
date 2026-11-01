import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPOSITORY = "IsaacJGF/Digitalizador";
const MAX_QUESTIONS = 35;
const MAX_IMAGES = 40;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024 - 64;
const MAX_BATCH_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_BODY_BYTES = 18 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function fail(message) {
  throw new Error(message);
}

function object(value, label, allowedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + " precisa ser um objeto.");
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) fail(label + " contém campo(s) desconhecido(s): " + unexpected.join(", "));
}

function text(value, label, maxLength, required = true) {
  if (typeof value !== "string") {
    if (!required && value === undefined) return undefined;
    fail(label + " precisa ser texto.");
  }
  const normalized = value.trim();
  if ((required && normalized.length === 0) || normalized.length > maxLength) {
    fail(label + " está vazio ou excede o limite permitido.");
  }
  return normalized;
}

function changedManifestPaths(mode) {
  const base = mode === "validate" ? process.env.BASE_SHA : process.env.BEFORE_SHA;
  const head = process.env.HEAD_SHA;
  if (!/^[0-9a-f]{40}$/.test(head ?? "")) fail("HEAD_SHA não contém um commit válido.");
  if (!/^[0-9a-f]{40}$/.test(base ?? "")) fail("O commit anterior/base não está disponível.");

  let output;
  if (/^0+$/.test(base)) {
    output = execFileSync(
      "git",
      ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-z", head, "--", "question-image-imports"],
      { encoding: "utf8" },
    );
  } else {
    output = execFileSync(
      "git",
      ["diff", "--name-only", "-z", base, head, "--", "question-image-imports"],
      { encoding: "utf8" },
    );
  }

  const paths = output.split("\0").filter((item) => item.endsWith("/manifest.json"));
  const unique = [...new Set(paths)];
  if (unique.length === 0) fail("Não encontrei manifest.json novo ou alterado no lote.");
  return unique;
}

function readPng(batchDirectory, relativeFile, budget) {
  if (typeof relativeFile !== "string" || relativeFile.length > 240 || path.isAbsolute(relativeFile)) {
    fail("O campo arquivo precisa ser um caminho relativo curto.");
  }
  const resolved = path.resolve(batchDirectory, relativeFile);
  const relative = path.relative(batchDirectory, resolved);
  if (!relative || relative === "." || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail("O arquivo precisa permanecer dentro da pasta do lote.");
  }
  if (path.extname(resolved).toLowerCase() !== ".png") fail("Os arquivos de imagem precisam usar PNG.");
  const bytes = readFileSync(resolved);
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) fail("Cada recorte deve ter até 6 MiB.");
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.length < 24) fail("O arquivo informado não é um PNG válido.");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0 || width > 16_384 || height > 16_384 || width * height > 18_000_000) {
    fail("O recorte excede os limites de dimensão ou de pixels aceitos pelo app.");
  }
  budget.bytes += bytes.length;
  budget.count += 1;
  if (budget.bytes > MAX_BATCH_IMAGE_BYTES) fail("Um lote pode conter até 12 MiB de imagens.");
  if (budget.count > MAX_IMAGES) fail("Um lote pode conter no máximo 40 imagens.");
  return "data:image/png;base64," + bytes.toString("base64");
}

function validateLayout(layout, label) {
  if (layout === undefined) return;
  object(layout, label, ["x", "y", "width", "height", "rotation", "align", "mode"]);
  const limits = { x: [0, 100], y: [0, 100], width: [8, 95], height: [8, 90], rotation: [-3600, 3600] };
  for (const [key, [minimum, maximum]] of Object.entries(limits)) {
    if (layout[key] !== undefined &&
      (typeof layout[key] !== "number" || !Number.isFinite(layout[key]) ||
        layout[key] < minimum || layout[key] > maximum)) {
      fail(label + "." + key + " está fora do limite permitido.");
    }
  }
  if (layout.align !== undefined && !["left", "center", "right"].includes(layout.align)) {
    fail(label + ".align precisa ser left, center ou right.");
  }
  if (layout.mode !== undefined && layout.mode !== "block") fail(label + ".mode precisa ser block.");
}

function normalizeExtraImages(images, batchDirectory, budget, questionIndex, batch, field) {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > 20) fail(field + " precisa ser uma lista de até 20 imagens.");
  return images.map((image, index) => {
    object(image, field + "[" + index + "]", ["slot", "inserir_depois", "inserir_antes", "arquivo", "substituir", "layout"]);
    const hasSlot = Number.isInteger(image.slot) && image.slot >= 1 && image.slot <= 20;
    const hasAfter = typeof image.inserir_depois === "string" && image.inserir_depois.length <= 40_000;
    const hasBefore = typeof image.inserir_antes === "string" && image.inserir_antes.length > 0 && image.inserir_antes.length <= 40_000;
    const placementCount = [image.slot !== undefined, image.inserir_depois !== undefined, image.inserir_antes !== undefined]
      .filter(Boolean).length;
    if (placementCount !== 1) fail(field + "[" + index + "] precisa informar somente uma posição.");
    if (image.slot !== undefined && !hasSlot) fail(field + "[" + index + "].slot precisa ser um inteiro de 1 a 20.");
    if (image.inserir_depois !== undefined && !hasAfter) fail(field + "[" + index + "].inserir_depois precisa ser texto.");
    if (image.inserir_antes !== undefined && !hasBefore) fail(field + "[" + index + "].inserir_antes precisa ser um trecho de texto não vazio.");
    if (image.substituir !== undefined && typeof image.substituir !== "boolean") {
      fail(field + "[" + index + "].substituir precisa ser booleano.");
    }
    validateLayout(image.layout, field + "[" + index + "].layout");
    return {
      ...(image.slot !== undefined ? { slot: image.slot } : {}),
      ...(image.inserir_depois !== undefined ? { inserir_depois: image.inserir_depois } : {}),
      ...(image.inserir_antes !== undefined ? { inserir_antes: image.inserir_antes } : {}),
      ...(image.substituir === undefined ? {} : { substituir: image.substituir }),
      ...(image.layout === undefined ? {} : { layout: image.layout }),
      url: readPng(batchDirectory, image.arquivo, budget),
      import_id: batch + ":q" + questionIndex + ":" + field + ":" + (index + 1),
    };
  });
}

function normalizeAlternativeImages(images, batchDirectory, budget, field) {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > 10) fail(field + " precisa ser uma lista de até 10 imagens.");
  const seen = new Set();
  return images.map((image, index) => {
    object(image, field + "[" + index + "]", ["letra", "arquivo", "substituir"]);
    const letter = text(image.letra, field + "[" + index + "].letra", 1);
    if (!/^[A-Z]$/.test(letter)) fail(field + "[" + index + "].letra precisa ser uma letra maiúscula.");
    if (seen.has(letter)) fail(field + " não pode repetir a mesma letra.");
    seen.add(letter);
    if (image.substituir !== undefined && typeof image.substituir !== "boolean") {
      fail(field + "[" + index + "].substituir precisa ser booleano.");
    }
    return {
      letra: letter,
      ...(image.substituir === undefined ? {} : { substituir: image.substituir }),
      url: readPng(batchDirectory, image.arquivo, budget),
    };
  });
}

function loadManifest(manifestPath, commitSha) {
  const match = manifestPath.match(/^question-image-imports\/([a-z0-9][a-z0-9-]{0,79})\/manifest\.json$/);
  if (!match) fail("Manifesto fora da pasta question-image-imports/<lote>/.");
  const batch = match[1];
  const batchDirectory = path.resolve("question-image-imports", batch);
  const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  object(raw, manifestPath, ["versao", "questoes"]);
  if (raw.versao !== 1) fail(manifestPath + ": versao precisa ser 1.");
  if (!Array.isArray(raw.questoes) || raw.questoes.length < 1 || raw.questoes.length > MAX_QUESTIONS) {
    fail(manifestPath + ": questoes precisa conter de 1 a 35 itens.");
  }

  const budget = { bytes: 0, count: 0 };
  const seenQuestions = new Set();
  const questions = raw.questoes.map((question, index) => {
    object(question, manifestPath + ".questoes[" + index + "]", [
      "identificacao", "referencia_imagens", "enunciado_imagens", "alternativas_imagens",
    ]);
    object(question.identificacao, "identificacao", ["id", "ano", "prova", "numero", "instituicao"]);
    const identification = {
      ano: text(question.identificacao.ano, "identificacao.ano", 20),
      prova: text(question.identificacao.prova, "identificacao.prova", 100),
      numero: text(question.identificacao.numero, "identificacao.numero", 40),
      ...(question.identificacao.instituicao === undefined
        ? {}
        : { instituicao: text(question.identificacao.instituicao, "identificacao.instituicao", 200) }),
      ...(question.identificacao.id === undefined ? {} : { id: text(question.identificacao.id, "identificacao.id", 36) }),
    };
    if (identification.id !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identification.id)) {
      fail("identificacao.id precisa ser um UUID válido.");
    }
    const key = [identification.id ?? "", identification.ano, identification.prova,
      identification.numero, identification.instituicao ?? ""].join("|");
    if (seenQuestions.has(key)) fail("O mesmo seletor de questão aparece mais de uma vez no lote.");
    seenQuestions.add(key);

    const reference = normalizeExtraImages(question.referencia_imagens, batchDirectory, budget, index + 1, batch, "referencia");
    const statement = normalizeExtraImages(question.enunciado_imagens, batchDirectory, budget, index + 1, batch, "enunciado");
    const alternatives = normalizeAlternativeImages(question.alternativas_imagens, batchDirectory, budget, "alternativas");
    if (reference.length + statement.length + alternatives.length === 0) fail("Cada questão precisa conter ao menos uma imagem.");
    return {
      identificacao: identification,
      referencia_imagens: reference,
      enunciado_imagens: statement,
      alternativas_imagens: alternatives,
    };
  });

  const payload = { source: { repository: REPOSITORY, commit_sha: commitSha, batch }, questions };
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_BODY_BYTES) {
    fail(manifestPath + ": o lote excede 18 MiB após codificar as imagens.");
  }
  return { batch, payload, imageCount: budget.count };
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "validate" && mode !== "import") fail("Uso: node scripts/import-question-images.mjs validate|import");
  const manifests = changedManifestPaths(mode);
  const loaded = manifests.map((manifestPath) => loadManifest(manifestPath, process.env.HEAD_SHA));

  if (mode === "validate") {
    for (const item of loaded) {
      console.log("Válido: " + item.batch + " (" + item.payload.questions.length +
        " questões, " + item.imageCount + " imagens).");
    }
    return;
  }

  const token = process.env.QUESTION_INGEST_TOKEN;
  const configuredUrl = process.env.QUESTION_INGEST_URL;
  if (!token || token.length < 32) fail("QUESTION_INGEST_TOKEN não está configurado no GitHub.");
  if (!configuredUrl) fail("QUESTION_INGEST_URL não está configurada no GitHub.");

  const endpoint = new URL(configuredUrl);
  if (endpoint.protocol !== "https:" || !endpoint.pathname.endsWith("/api/question-ingest")) {
    fail("QUESTION_INGEST_URL precisa ser HTTPS e terminar em /api/question-ingest.");
  }
  endpoint.pathname = endpoint.pathname.replace(/\/api\/question-ingest$/, "/api/question-image-ingest");
  endpoint.search = "";
  endpoint.hash = "";

  for (const item of loaded) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify(item.payload),
      signal: AbortSignal.timeout(60_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      const details = Array.isArray(result?.details) ? " " + result.details.join("; ") : "";
      fail("Falha no lote " + item.batch + ": " + (result?.error ?? "o endpoint rejeitou os dados.") + details);
    }
    console.log("Importado: " + item.batch + " (" + item.imageCount + " imagens).");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
