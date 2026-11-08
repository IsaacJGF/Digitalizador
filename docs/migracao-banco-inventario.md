# Migração do Digitalizador: conferência inicial

## Escopo

Somente planejamento e consultas de leitura na origem. Nenhuma restauração, alteração de permissões, migração ou publicação executada.

## Origem conferida em 8 de novembro de 2026

O banco conectado contém a estrutura do Digitalizador e os seguintes totais no momento da consulta:

| Objeto | Registros |
| --- | ---: |
| questions | 387 |
| catalog_areas | 6 |
| catalog_conteudos | 29 |
| catalog_subconteudos | 111 |
| catalog_relacionados | 267 |
| catalog_tags | 7 |
| catalog_provas | 2 |
| catalog_instituicoes | 2 |
| question_review_checks | 3.096 |
| question_review_history | 1.379 |

As visões `question_review_summary` e `question_review_queue` também apareceram no inventário acessível. O papel de consulta possui visibilidade limitada sobre funções e gatilhos; a listagem disponível não comprova o inventário completo nem ausência de objetos. Conferir definições completas na exportação antes da restauração.

Esses números não são uma fotografia imutável: a origem continua em uso. Comparar a data da exportação com o estado atual e repetir a conferência na janela final sem gravações.

## Destino e cópias

O usuário informou que criou um projeto Supabase vazio e baixou a exportação do banco e os arquivos. O destino ainda não foi identificado nem inspecionado; os arquivos não estão disponíveis nesta sessão. Não presumir que o destino esteja vazio sem uma conferência posterior.

## Viabilidade documentada

A documentação oficial permite manter a hospedagem no Lovable e mover o banco para um Supabase gerenciado próprio. Não há troca automática de toda a integração. Será necessário validar a configuração específica deste projeto e todos os caminhos de conexão, inclusive servidor e ChatGPT.

- https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership
- https://docs.lovable.dev/tips-tricks/external-deployment-hosting#host-backend-and-data-on-a-managed-provider-supabase-example
- https://docs.lovable.dev/features/database-backups#export-your-database

Não modificar arquivos de integração gerados automaticamente. Não repetir os históricos de migração: há scripts com alterações de dados e dois históricos no repositório. Definir a restauração a partir do formato real da exportação.

## Próxima etapa e bloqueios

1. Receber a exportação e o inventário dos arquivos por um meio privado apropriado; não inserir chaves ou credenciais em documentos ou mensagens.
2. Identificar o destino por informações não secretas e estabelecer acesso por configuração segura quando necessário.
3. Conferir formato, conteúdo e compatibilidade da exportação; concluir inventário de permissões, gatilhos, funções e imagens.
4. Apresentar o procedimento de restauração no destino e obter aprovação explícita antes de qualquer gravação.

O Cloud permanece intacto. Nenhuma autorização para publicar ou remover o Cloud foi dada.