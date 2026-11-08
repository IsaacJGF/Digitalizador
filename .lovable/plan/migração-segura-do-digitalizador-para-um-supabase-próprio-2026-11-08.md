# Migração segura do Digitalizador para um Supabase próprio

## Objetivo e limites

Transferir os dados para um projeto Supabase sob seu controle, preservando questões, catálogos, imagens, marcações e histórico de revisão, identificadores, vínculos e datas.

**Este plano não executa a transferência.** Não remover o Lovable Cloud, alterar dados, aplicar migrações, mesclar branches nem publicar nesta etapa. Trabalhar na branch ativa. Cada etapa que grave dados ou troque o ambiente em uso terá aprovação explícita.

Não é possível garantir perda zero sem conferir as cópias e impedir gravações durante a transferência final. A troca só será autorizada depois dessas verificações.

## 1. Confirmar origem, destino e viabilidade

- Confirmar o banco conectado ao Digitalizador e identificar o projeto Supabase de destino, preferencialmente novo e vazio. Não sobrescrever um projeto com dados existentes.
- Levantar o estado atual: tabelas, contagens, vínculos, funções, gatilhos, permissões, extensões, arquivos e eventuais contas de usuários. Os números mencionados anteriormente não serão tratados como contagens atuais.
- Verificar a possibilidade de usar o banco externo com a hospedagem atual, tanto na prévia quanto na versão publicada, sem depender de configurações que o Lovable reescreva automaticamente.
- Preservar inicialmente a hospedagem e os endereços atuais, **somente se essa configuração for confirmada como suportada**. Se não for, parar e apresentar uma alternativa de hospedagem compatível antes de modificar o aplicativo.
- Confirmar custos e capacidade do destino: banco, armazenamento, tráfego e cópias de segurança.

**Resultado:** inventário e destino confirmados, com bloqueios resolvidos antes de copiar qualquer dado.

## 2. Guardar cópias independentes

### Banco completo

Você faz a exportação oficial em **More → Database → Manage → Settings → Export data → Database → Export → Start export** e guarda o arquivo baixado em local seguro.

Essa exportação inclui estrutura, dados e contas de usuários com hashes de senha, caso existam. Não inclui arquivos de armazenamento, código de funções, segredos ou configurações de provedores de login.

Limites atuais: banco de até 15 GB, arquivo de até 5 GB e uma exportação a cada 24 horas; o backend precisa estar em execução. Planejar os ensaios e a exportação final considerando esse intervalo. Se exceder os limites, parar e definir um caminho suportado antes da transferência.

### Imagens e outros arquivos

- Levantar todas as imagens: arquivos no armazenamento, imagens embutidas nas questões e referências a endereços externos.
- Baixar os arquivos do Cloud em **More → Storage**; manter uma cópia independente, preservando caminhos e nomes. Arquivos de armazenamento não estão cobertos pela exportação nem pelas cópias diárias do banco.
- Registrar quantidade, tamanho e resumo de integridade de cada arquivo para conferir a cópia no destino.
- Identificar filas de PDF e rascunhos existentes apenas no navegador. Eles não fazem parte da exportação do banco; concluir ou preservar esses trabalhos antes da troca. Uma mudança de domínio pode impedir o acesso ao armazenamento local antigo.

### Código e configurações

- Guardar a versão do código usada na transferência e um inventário das configurações necessárias, sem incluir valores de segredos no código ou no chat.
- Manter o Cloud e suas cópias intactos durante todo o processo.

## 3. Ensaiar a restauração em ambiente isolado

- Restaurar a exportação no Supabase de destino usando um procedimento compatível com o formato real do arquivo, validado antes de executar. Não prometer uma importação automática por Connectors.
- Conferir a compatibilidade das estruturas gerenciadas de autenticação e armazenamento com o destino. Não sobrescrever essas estruturas cegamente.
- Preservar UUIDs, vínculos, datas, JSON de alternativas e imagens, textos, formatação, catálogos ativos/inativos, marcações e histórico.
- Não recriar marcações iniciais nem reiniciar critérios de revisão durante a cópia. Verificar como os gatilhos serão tratados na restauração para preservar os registros existentes sem gerar alterações extras.
- Copiar os arquivos separadamente para os compartimentos correspondentes, reproduzindo as regras de acesso e mapeando os endereços antigos para os novos.
- Fazer substituições de endereços de imagem somente na cópia de destino, quando necessárias, sem alterar textos ou conteúdo pedagógico.
- Reconfigurar autenticação e provedores apenas se usados. Contas podem manter suas senhas por meio dos hashes exportados; sessões em andamento podem exigir novo acesso.

**Importante:** não reaplicar indiscriminadamente as migrações antigas. O projeto possui históricos em duas pastas e scripts que atualizam dados; repeti-los pode duplicar registros, modificar catálogos ou reiniciar revisões. Restaurar o estado atual e reconciliar o histórico sem executar novamente alterações já incorporadas.

## 4. Adaptar e testar o aplicativo com a cópia

### Conexões e segredos

- Apontar todas as conexões de questões, catálogos, importação, revisão e ChatGPT para o mesmo destino de teste.
- Usar no navegador somente a chave pública do projeto próprio. Manter chaves administrativas e demais segredos exclusivamente no servidor, fornecidos por campos seguros, nunca pelo chat.
- Não editar arquivos de integração gerados automaticamente para forçar uma troca que não seja suportada; definir uma conexão externa própria e explícita, se necessária e viável.
- Verificar funcionamento das páginas e ações executadas no servidor na hospedagem escolhida. Migrar o banco não migra essas funções para o Supabase automaticamente.
- Conferir a continuidade da digitalização e análise por IA. O serviço de IA do Lovable é uma dependência separada do banco; não substituir nem presumir seu funcionamento em outra hospedagem sem validar.

### Permissões preservadas

- Preservar as permissões atuais de questões e catálogos, sem ampliá-las.
- Preservar o bloqueio de acesso direto anônimo às tabelas e visões de revisão e a separação das chaves administrativas.
- A página de revisão atualmente não exige senha, por sua decisão anterior. Migrar não torna essa página privada: quem conseguir acessá-la poderá usar as ações disponíveis pelo servidor. Qualquer mudança nessa regra será um pedido separado.
- Manter a conexão ChatGPT limitada a questões e catálogos, sem dados de revisão ou segredos, e com a proteção contra sobrescrever edições concorrentes.

### Critérios de aceitação

- Mesmas contagens e conjuntos de IDs em todas as tabelas transferidas; nenhum vínculo quebrado ou registro duplicado.
- Comparação integral dos dados em lotes, não apenas amostras, com diferenças permitidas restritas ao mapeamento de endereços de arquivos. Conferir especialmente timestamps e histórico de revisão.
- Mesmos arquivos, tamanhos e resumos de integridade; todas as imagens referenciadas localizadas.
- Testar leitura e edição de questões, catálogos, fila de revisão, totais, checklist, histórico e reinício de critérios usando **somente registros temporários no destino de teste**, removidos ao terminar.
- Testar digitalização de imagem/PDF, geração de Word com imagens e ferramentas do ChatGPT. Não usar questões reais para testes de gravação.
- Conferir negação de acesso direto às tabelas de revisão e ausência de segredos no conteúdo enviado ao navegador.
- Confirmar que a prévia compila e os fluxos funcionam antes de propor a troca definitiva.

## 5. Transferência final com janela sem gravações

Somente depois do ensaio aprovado e de uma autorização específica para a troca:

1. Combinar um período de manutenção, incluindo o intervalo necessário para uma nova exportação oficial.
2. Impedir gravações na origem por todos os caminhos: aplicativo, ações no servidor, ChatGPT, importações e acesso público direto ao banco. Um aviso na página, sozinho, não protege contra alterações anônimas. Qualquer bloqueio temporário de permissões exige aprovação e um procedimento de restauração documentado.
3. Fazer nova exportação do banco e nova cópia dos arquivos após o bloqueio, mantendo a origem sem gravações até concluir.
4. Restaurar essa versão final no destino, sem misturar dados do ensaio, e repetir as comparações de integridade.
5. Trocar as configurações do aplicativo somente após a conferência; publicar apenas com aprovação separada.
6. Validar os fluxos com o destino definitivo e liberar gravações apenas quando todos os critérios passarem.
7. Manter o Cloud preservado e sem gravações por um período acordado, acompanhando erros e imagens ausentes. Não removê-lo como parte da migração.

## 6. Retorno seguro se houver falha

- **Antes de liberar gravações no destino:** voltar à versão/configuração anterior, conferir a origem e restaurar as permissões temporariamente suspensas.
- **Depois de liberar gravações no destino:** bloquear novamente as gravações e preservar os dados novos antes de qualquer retorno. Voltar simplesmente ao Cloud descartaria alterações feitas no destino. Planejar e validar a reconciliação por IDs e datas, com aprovação, ou corrigir o destino sem retornar.
- Não operar os dois bancos simultaneamente como origens de escrita. Não apagar o Cloud nem as cópias de segurança durante a estabilização.

## Entregas e aprovações

1. Inventário atualizado e confirmação de viabilidade da conexão externa.
2. Cópias seguras do banco, arquivos e código, com relatório de integridade.
3. Destino de teste restaurado e aplicativo validado.
4. Relatório de diferenças, testes, riscos e instruções de retorno.
5. Pedido de aprovação para manutenção e transferência final; publicação autorizada separadamente.

**Dependências para executar:** projeto Supabase próprio identificado, exportação oficial e arquivos disponíveis, configuração segura dos segredos e aprovação das etapas de gravação. Nenhum desses valores privados deve ser enviado pelo chat.