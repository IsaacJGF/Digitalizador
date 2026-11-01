# Importação em lote de imagens de questões

Este fluxo é reutilizável para questões de qualquer ano. O assistente prepara uma PR com os recortes PNG e um manifesto que identifica cada questão; depois que a PR é mesclada em `main`, o GitHub Actions envia o lote ao Digitalizador e o banco grava tudo em uma transação.

## Preparação única

Depois de integrar esta alteração:

1. Aplique a migração `supabase/migrations/20261101160000_question_image_batch_import.sql` no projeto Supabase/Lovable e publique a aplicação com a rota `/api/question-image-ingest`.
2. Configure no servidor do app `QUESTION_INGEST_TOKEN` com um segredo aleatório de pelo menos 32 caracteres.
3. Em **GitHub → Settings → Secrets and variables → Actions**, configure o mesmo secret `QUESTION_INGEST_TOKEN` e a variable `QUESTION_INGEST_URL` já usada pelo fluxo de texto. Ela deve apontar para a URL HTTPS publicada que termina em `/api/question-ingest`; a automação troca essa rota pela rota de imagens.

Não coloque o token em arquivos, manifestos ou Issues.

## Para cada lote

Quando você enviar as imagens aqui e pedir a inclusão, o assistente pode preparar uma PR com esta estrutura:

```text
question-image-imports/
  2010-enem-regular-lote-01/
    manifest.json
    imagens/
      q101-referencia-1.png
      q101-alternativa-a.png
```

Os caminhos em `arquivo` são relativos à pasta do lote. Os PNGs devem conter o recorte final que será mostrado no app. A PR também permite revisar os arquivos e o mapeamento antes de mesclar.

Exemplo de `manifest.json`:

```json
{
  "versao": 1,
  "questoes": [
    {
      "identificacao": {
        "ano": "2010",
        "prova": "ENEM",
        "numero": "101",
        "instituicao": "INEP"
      },
      "referencia_imagens": [
        {
          "inserir_depois": "A figura apresenta os dados do experimento.",
          "arquivo": "imagens/q101-referencia-1.png",
          "layout": { "width": 70, "align": "center" }
        }
      ],
      "enunciado_imagens": [],
      "alternativas_imagens": [
        { "letra": "A", "arquivo": "imagens/q101-alternativa-a.png" }
      ]
    }
  ]
}
```

A identificação usa ano, prova e número exatamente como estão cadastrados. `instituicao` pode ser incluída para diferenciar provas. Se ainda houver mais de uma correspondência, o lote exige o `id` da questão e falha sem alterar o banco.

## Posição da imagem

Para `referencia_imagens` e `enunciado_imagens`, use uma destas opções:

- `slot`: preenche um espaço reservado já existente; a contagem começa em 1.
- `inserir_depois`: insere a imagem depois do trecho de texto indicado, que deve aparecer exatamente uma vez. Use texto vazio (`""`) para colocar a imagem no final.

Para `alternativas_imagens`, informe a letra da alternativa. Uma imagem já existente só é substituída quando `substituir: true` está explícito.

## Limites e comportamento

- Até 25 questões, 40 imagens e 18 MiB por manifesto; cada PNG pode ter até 6 MiB.
- A ação valida os arquivos na PR. Após a mesclagem, envia um único pedido por manifesto. O banco aplica o lote inteiro ou rejeita o lote inteiro.
- Questões sem correspondência, seletores ambíguos, slots inexistentes e âncoras ausentes ou repetidas são rejeitados; a automação não escolhe uma questão por aproximação.
- As imagens permanecem no GitHub público e são gravadas como data URLs PNG nos campos já usados pelo app e pela exportação.
- A ação não faz o recorte visual. O assistente prepara e revisa os recortes antes de abrir a PR; lotes maiores que os limites devem ser divididos em mais de uma PR.

O fluxo depende da migração e da rota de servidor estarem publicadas e de o secret/variable do GitHub estar configurado. Uma falha na execução do Actions aparece no próprio commit mesclado e pode ser corrigida com uma nova PR de importação.
