# Revisão de questões pelo ChatGPT

Este fluxo permite que uma Action privada do ChatGPT consulte questões salvas e grave correções na tabela \`questions\`. Não adiciona uma página nem um recurso para usuários do sistema.

A IA pode revisar e corrigir, quando houver base suficiente, o texto-base/referência, enunciado, alternativas, gabarito, formatação textual, classificação, dificuldade, ano, prova, instituição, observações e o indicador de equação. A API devolve também os dados de imagens e seus posicionamentos para contexto, mas preserva arquivos, recortes e posições sem alterá-los.

## Configuração

1. Integre e publique a alteração.
2. O endpoint usa o segredo de servidor \`QUESTION_INGEST_TOKEN\` que já protege a ingestão pelo GitHub. O mesmo valor precisa estar configurado no ambiente do Lovable e ter pelo menos 32 caracteres. Não o coloque no repositório, em Issues ou em mensagens.
3. Abra a configuração do GPT que você usa para revisar questões, crie uma Action e importe \`docs/chatgpt-question-review-openapi.yaml\`.
4. Troque \`https://SEU-APP.lovable.app/api\` pela URL HTTPS publicada do app, mantendo o caminho \`/api\`.
5. Configure a autenticação da Action como **API Key**, no cabeçalho **Authorization**, com o tipo **Bearer** e o mesmo valor de \`QUESTION_INGEST_TOKEN\`.

A URL da Action será semelhante a \`https://seu-app.lovable.app/api/question-review\`. O segredo fica na configuração da Action, nunca no prompt ou nos dados enviados à IA.

## Como a IA deve revisar

Adicione estas instruções ao GPT que já contém o fluxo de cadastro:

- Quando o usuário pedir uma revisão, localize a questão com os filtros conhecidos (ano, prova, instituição e número) ou pelo ID. Se o resultado não identificar uma questão com segurança, peça o dado que falta antes de alterar.
- Consulte \`?incluir_catalogos=true\` para obter as opções ativas de área geral, conteúdo principal, subconteúdo, conteúdos relacionados, tags, provas e instituições. Use os nomes do catálogo. Não crie opções novas.
- Leia a questão inteira: referência/texto-base e continuação, enunciado, alternativas, gabarito, classificação e metadados. Compare com o PDF, link ou imagem de origem disponível na conversa quando a revisão depender de fidelidade ao original.
- Corrija apenas o que for confirmado. Preserve o conteúdo e a formatação dos campos que não precisarem de mudança. Não invente gabarito nem complete informação de prova, ano, fonte ou instituição sem evidência.
- Envie em \`PATCH /question-review\` somente os campos que realmente precisam mudar. Para cada questão, inclua o \`id\` e o \`updated_at\` mais recente recebido no GET como \`expected_updated_at\`.
- Se a questão pertence a um grupo com texto-base compartilhado, inclua todos os itens do grupo no mesmo PATCH e envie os mesmos valores dos campos de referência para cada item. A API rejeita atualizações incompletas ou divergentes desse texto compartilhado.
- Se a resposta indicar \`conflict\`, consulte a questão novamente antes de tentar aplicar qualquer correção. Se algum campo for \`invalid\`, mostre o motivo e corrija a solicitação.
- Ao terminar, informe quais questões foram atualizadas e liste os campos alterados. Não diga que uma correção foi salva quando o status não for \`updated\`.

## Campos consultados e editáveis

O GET devolve o registro completo, incluindo textos, alternativas com suas imagens, imagens da referência e do enunciado, posicionamentos, classificação, metadados e \`updated_at\`. Pode consultar por IDs, ano, prova, instituição, número ou \`grupo_id\`. Os filtros de ano, prova e instituição aceitam mais de um valor; a paginação retorna até 25 questões por chamada.

O PATCH permite mudar:

- número, tipo e enunciado;
- texto das alternativas e gabarito;
- fonte e texto-base, incluindo o trecho depois da imagem e a fonte da referência;
- área geral, conteúdo principal, subconteúdo, conteúdos relacionados e tags;
- dificuldade, ano, prova, instituição, observações e \`tem_equacao\`.

Ao substituir alternativas, a API conserva a imagem já associada a cada letra que continuar existindo. A API não recebe novas imagens nem altera imagem, recorte ou posição. Se a revisão exigir mover ou substituir uma imagem, a IA deve apontar isso para ajuste manual no editor do sistema.

## Segurança e concorrência

O endpoint é somente de servidor. Ele carrega o cliente Supabase com chave de serviço dentro do handler e nunca envia essa chave ao navegador. Todas as chamadas exigem HTTPS e o cabeçalho \`Authorization: Bearer <token>\`.

O PATCH confere \`expected_updated_at\` antes de gravar. Isso impede que a IA sobrescreva uma versão alterada depois da consulta. Uma chamada pode atualizar até 25 questões e retorna um resultado por ID.

Para cadastrar questões novas via Issue e GitHub Actions, continue usando o fluxo descrito em [chatgpt-question-ingestion.md](chatgpt-question-ingestion.md).