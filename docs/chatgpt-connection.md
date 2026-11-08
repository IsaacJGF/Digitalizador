# Conexão do ChatGPT ao Digitalizador

## Política configurada
Servidor MCP público, sem autenticação: qualquer pessoa na internet poderá consultar e usar as ferramentas de gravação em questões e catálogos quando esta revisão for publicada. Não é uma conexão SQL direta nem acesso administrativo ao banco.

As ferramentas usam somente a chave pública e as permissões anônimas existentes. Não expõem tabelas/views de revisão interna, senhas ou chaves privadas. Editar uma questão pode reiniciar critérios de revisão pelos gatilhos já existentes.

## Ferramentas
- `listar_questoes`: busca paginada.
- `obter_questao`: textos, alternativas e metadados, sem imagens grandes.
- `criar_questao`: cadastro manual.
- `atualizar_questao`: edição com verificação da versão lida.
- `listar_catalogo`: consulta dos sete catálogos.
- `criar_item_catalogo`: criação com hierarquia pai.
- `definir_catalogo_ativo`: ativação/desativação.

Não há exclusão, SQL arbitrário, OCR ou renomeação/mesclagem em lote. A instrução de pedir confirmação antes de gravar orienta o assistente; não é uma barreira de autorização do servidor público.

## Estado e próxima etapa
O catálogo foi extraído com sucesso e as consultas foram verificadas na prévia sem login. Os testes de validação passaram. Nenhuma gravação foi executada na validação; criação/edição ainda não foram verificadas de ponta a ponta. Nenhuma migração, publicação ou novo serviço de autenticação foi realizado. Lovable Cloud já estava habilitado.

Depois da aprovação e republicação, usar `https://paper-to-word-wiz.lovable.app/mcp` como URL MCP no ChatGPT, com autenticação “nenhuma”. A disponibilidade de conectores personalizados e ferramentas de gravação depende do plano e das configurações do ChatGPT. A revisão publicada anterior não contém necessariamente estas ferramentas.