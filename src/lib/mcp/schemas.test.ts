import { describe, it as test } from "node:test";
import { strict as assert } from "node:assert";
import { catalogCreateSchema, createQuestionSchema, updateQuestionSchema } from "./schemas";

describe("Public MCP boundaries", () => {
  test("question edits cannot include review status or privileged fields", () => {
    assert.equal(updateQuestionSchema.safeParse({ status: "aprovado" }).success, false);
    assert.equal(updateQuestionSchema.safeParse({ service_role: "value" }).success, false);
    assert.equal(updateQuestionSchema.safeParse({ observacoes: "Revisar pontuação" }).success, true);
  });
  test("question creation requires text and cannot supply a record identity", () => {
    assert.equal(createQuestionSchema.safeParse({}).success, false);
    assert.equal(createQuestionSchema.safeParse({ enunciado: "Quanto é 2 + 2?" }).success, true);
    assert.equal(createQuestionSchema.safeParse({ enunciado: "Questão", id: "override" }).success, false);
  });
  test("catalog creation preserves the existing parent hierarchy", () => {
    assert.equal(catalogCreateSchema.safeParse({ tipo: "conteudo", nome: "Álgebra" }).success, false);
    assert.equal(catalogCreateSchema.safeParse({ tipo: "subconteudo", nome: "Equações" }).success, false);
    assert.equal(catalogCreateSchema.safeParse({ tipo: "tag", nome: "Teste" }).success, true);
  });
});