# Digitalizador: cadastro automatizado de questões

## Dois caminhos que compartilham o endpoint

O cadastro antigo por GitHub Issue continua disponível para questões individuais. Para referências com vários itens, use um manifesto JSON em um PR. O PR é a etapa de revisão e aprovação; depois que ele é mesclado na branch main, o GitHub Actions envia o manifesto ao mesmo endpoint do aplicativo, que valida e grava o lote no Supabase.

O fluxo não usa automação do navegador, não cria uma segunda API e não exige novo token. O endpoint usa a chave de serviço somente no servidor. O texto é cadastrado; figuras ainda não são carregadas: blocos do tipo imagem criam espaços reservados nativos para preencher depois no editor.

## Configuração única

O caminho pelo PR reaproveita QUESTION_INGEST_URL e QUESTION_INGEST_TOKEN já usados no fluxo de Issues. Se ainda não estiverem configurados:

1. Gere um token aleatório de pelo menos 32 caracteres.
2. Cadastre QUESTION_INGEST_TOKEN como segredo de servidor no Lovable e publique o app.
3. No GitHub, em Settings → Secrets and variables → Actions, cadastre o mesmo QUESTION_INGEST_TOKEN como secret e QUESTION_INGEST_URL como variable, com a URL HTTPS publicada terminada em /api/question-ingest.

Não coloque credenciais em manifestos, PRs ou Issues.

## Manifesto do lote

Crie uma pasta com um nome curto em question-imports/, por exemplo question-imports/pas1-2015-fisica/manifest.json. Use schema_version 1, um batch_key estável e de 1 a 35 itens. O exemplo sintético está em docs/examples/question-import-manifest.json. Ele mostra os quatro tipos de item e espaços de imagem; seus textos não são questões reais e os nomes de prova/instituição precisam coincidir com os catálogos ativos para serem importáveis.

Campos por item:

- Obrigatórios: numero, tipo, enunciado ou enunciado_blocos, ano, prova, instituicao, area_geral, conteudo_principal e subconteudo_principal.
- Tipo: certo_errado, numerica, multipla_escolha ou discursiva. Itens C/E recebem C ou E; numéricos recebem o valor; múltipla escolha exige alternativas e gabarito; o gabarito discursivo pode ficar vazio quando não estiver disponível. Para os itens objetivos, envie o gabarito oficial conferido no PDF.
- Classificação: conteudos_relacionados e tags_livres são listas de nomes, não IDs. Todos os nomes devem existir e estar ativos. O endpoint confere também a relação área → conteúdo principal → subconteúdo. Nenhuma opção faltante é criada ou substituída automaticamente; o lote inteiro é recusado com os caminhos pendentes.
- Identidade: modalidade e caderno são opcionais e servem para distinguir aplicações ou cadernos quando existirem. Se a prova usar variantes, preencha esses campos com o identificador original. O sistema usa instituição + prova + ano + modalidade + caderno + número para detectar duplicatas.
- Fonte e observações são opcionais.

### Referências compartilhadas e imagens

Declare cada texto-base compartilhado uma vez em references com id, e escreva referencia_id nos itens selecionados. Cada item ainda será uma linha individual; itens ligados recebem o mesmo grupo_id. O texto-base completo é preservado nos itens selecionados e a interface os exibe como uma referência agrupada.

Para uma figura intercalada, use blocos ordenados texto/imagem:

~~~json
"references": [
  {
    "id": "texto-1",
    "blocos": [
      { "tipo": "texto", "texto": "Trecho antes da figura." },
      { "tipo": "imagem" },
      { "tipo": "texto", "texto": "Trecho depois da figura." }
    ],
    "fonte": "Fonte do texto-base"
  }
]
~~~

O mesmo formato pode ser usado em enunciado_blocos. Cada bloco imagem vira um espaço reservado nativo no ponto correspondente. Para uma alternativa com imagem, use {"letra":"C","texto":"","imagem_pendente":true}; isso também permite alternativas só com imagem. Não escreva marcadores como [imagem aqui] ou [[img:1]] no texto. Tabelas e equações devem ficar em conteúdo editável quando o editor conseguir representá-las fielmente; use espaço de imagem só quando necessário.

### Revisão, validação e resultado

- Antes do merge, a Action valida o JSON, os tipos, o limite de 35 itens, campos obrigatórios, referências, gabaritos e duplicatas internas do lote.
- Depois do merge, uma Action confiável lê somente o manifesto mesclado (não executa código vindo do PR) e chama o endpoint existente.
- O endpoint confere os catálogos ativos do Supabase e rejeita qualquer nome ausente/inativo. Só depois da validação ele grava todas as linhas em uma única inserção. Uma falha crítica não deixa parte do lote inserida.
- Reenvios do mesmo lote retornam os IDs existentes. Uma colisão parcial ou uma possível duplicata já cadastrada manualmente interrompe o lote para conferência.
- A Action comenta no PR os números, IDs e resultados de cada item. As marcações da Revisão Interna ficam pendentes pela automação existente do banco.
- A alteração de esquema precisa estar aplicada antes do primeiro lote: a migração adiciona modalidade, caderno e import_key, além de um índice único de identidade importada. Este PR não aplica a migração no banco de produção.

Se o endpoint recusar o lote porque uma prova, instituição ou classificação não existe no catálogo ativo, corrija o catálogo em um fluxo aprovado e envie um novo PR do manifesto. O importador nunca altera os catálogos globais.

## Revisão na própria aba

O botão Editar questão dentro da Revisão Interna abre o editor sobre a mesma página. Ao salvar, a fila e o checklist atualizam sem navegar para Questões salvas. A tela de Questões salvas continua usando o mesmo editor compartilhado.
