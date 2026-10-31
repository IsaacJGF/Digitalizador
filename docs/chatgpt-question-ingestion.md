# Envio de questões do ChatGPT

Este fluxo recebe questões em um GitHub Issue e grava os campos textuais na tabela questions do Supabase do app. O GitHub Actions funciona como ponte; a chave de serviço do Supabase permanece no servidor do Lovable.

## Configuração única

Faça estes passos depois de integrar a alteração na branch padrão:

1. Gere um segredo aleatório com pelo menos 32 caracteres (por exemplo, openssl rand -hex 32). Use exatamente o mesmo valor nos passos 2 e 3.
2. No projeto do Lovable, adicione a variável de ambiente de servidor QUESTION_INGEST_TOKEN com esse valor e publique/republique o app para que o endpoint receba a configuração.
3. No GitHub, abra **Settings → Secrets and variables → Actions**. Crie:
   - um **secret** chamado QUESTION_INGEST_TOKEN, com o mesmo valor;
   - uma **variable** chamada QUESTION_INGEST_URL, com a URL HTTPS publicada do app seguida de /api/question-ingest (por exemplo, https://seu-app.lovable.app/api/question-ingest).

Não coloque o token no código, em Issues ou em mensagens. O endpoint exige HTTPS, autenticação Bearer e autoriza apenas Issues abertos pelo login configurado no fluxo.

## Como enviar uma questão

Quando você mandar uma questão no ChatGPT e pedir para registrá-la, o ChatGPT cria um Issue com:

- título começando por [DIGITALIZADOR];
- um comentário oculto <!-- digitalizador-question:v1 -->;
- um bloco JSON logo após o comentário.

Exemplo de bloco:

~~~json
{
  "numero": "101",
  "enunciado": "A corrente elétrica mencionada é induzida por",
  "alternativas": [
    { "letra": "A", "texto": "radiação." },
    { "letra": "B", "texto": "condução." },
    { "letra": "C", "texto": "campo elétrico variável." },
    { "letra": "D", "texto": "campo magnético variável." },
    { "letra": "E", "texto": "ressonância eletromagnética." }
  ],
  "resposta": "D",
  "area_geral": "Magnetismo e Eletromagnetismo",
  "conteudo_principal": "Indução eletromagnética",
  "subconteudo_principal": "Variação do fluxo magnético",
  "conteudos_relacionados": ["Corrente elétrica", "Efeito Joule"],
  "tags_livres": ["Questão conceitual", "Sem cálculo"],
  "ano": "2023",
  "prova": "ENEM",
  "instituicao": "INEP",
  "referencia_texto": "O fogão por indução funciona a partir do surgimento de uma corrente elétrica induzida no fundo da panela, com consequente transformação de energia elétrica em calor por efeito Joule. A principal vantagem desses fogões é a eficiência energética, que é substancialmente maior que a dos fogões convencionais.",
  "tem_equacao": false
}
~~~

O fluxo aceita somente questões de múltipla escolha. O campo source não deve aparecer no Issue; o workflow acrescenta os metadados do GitHub automaticamente. A resposta correta é opcional, mas, quando enviada, deve corresponder a uma letra existente nas alternativas.

## O que é gravado

O endpoint mapeia os campos para o modelo atual da tabela questions:

- area_geral também preenche disciplina;
- conteudo_principal também preenche conteudo;
- tags_livres também preenche tags;
- os demais campos de classificação são gravados com os nomes correspondentes da tabela;
- created_at e updated_at ficam a cargo do banco.

O ID da questão é derivado do ID do Issue. Repetir o envio do mesmo Issue não cria outra linha. A automação deixa um comentário no Issue com o resultado e o ID gravado.

## Limites desta primeira versão

- O repositório é público; Issues e seus textos também ficam públicos.
- Esta primeira versão transporta texto e metadados. Ela não envia arquivos de imagem ao Supabase Storage. Questões com imagens devem ser completadas no app ou aguardam a etapa de upload de imagens.
- O fluxo apenas insere. Editar um Issue depois de gravado não altera a linha existente; correções devem ser feitas no app.
- O workflow só processa Issues novos com título iniciado por [DIGITALIZADOR], abertos pelo login autorizado definido no workflow e neste endpoint.

A migração/exportação de dados para Firebase é um trabalho separado e não faz parte deste fluxo.
