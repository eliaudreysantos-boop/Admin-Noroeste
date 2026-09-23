# Revisão e melhorias das integrações

Implementadas na worktree `pdf-a4/admin-spa`, sem deploy e sem alterações no banco real.

## Entregas

- Publicação/PDF compartilhada para Tarefas, Oradores, Limpeza, TPL e Serviço de Campo. Cada módulo conserva seu layout. O servidor confere a versão de origem; o PDF oficial e o bloqueio do período mudam na mesma transação. Uploads usam caminhos únicos, sem sobrescrever a versão anterior.
- Edições pelas rotas dos módulos conferem o bloqueio dentro de uma transação, inclusive quando outro usuário publica durante a edição. A restauração administrativa de backup continua sendo uma operação separada.
- Estados de publicação uniformes: sem publicação, versão antiga, atualizada, desatualizada ou falha de consulta. A comparação considera o conteúdo impresso; mudanças de telefone não exigem republicação.
- Identidade central e datas civis compartilhadas. Tarefas não habilita pessoas inativas no Admin nem cadastros sem vínculo. Datas impossíveis são recusadas e “hoje” segue America/Fortaleza.
- Oradores consulta o caminho correto de Tarefas para conflitos. O perfil de Oradores pode ler os períodos para essa verificação, mas não editá-los nem ler toda a raiz de Tarefas. A Agenda usa endereço e horário da reunião local ou do destino, sem confundir a origem do visitante.
- TPL reconhece vínculos antigos pela chave do cadastro. Reabrir o mês retira seus eventos da Agenda mesmo quando existe snapshot histórico; novas publicações preservam um snapshot.
- Agenda com falhas parciais identificadas por módulo: mantém os últimos dados disponíveis, não registra falsas retiradas no histórico e permite repetir somente as fontes com erro. Não foi adicionado o botão geral “Atualizar agora”.
- Pareamento não expõe mais uma lista pública de pessoas. O Admin gera, no cadastro da pessoa, um código de uso único com validade de dez minutos. O servidor consome o código e cria o vínculo atomicamente, com limite de tentativas. Sessões novas duram 90 dias e são renovadas na consulta de identidade. Cookies do Admin e da Agenda são tratados separadamente.
- Admin > Vínculos: auditoria de vínculos ausentes/duplicados, pessoas inativas e inconsistências entre período e PDF. A mesma análise pode ser executada sobre um backup local.
- Playwright declarado no projeto e comando de navegador com preview isolado, porta temporária e encerramento automático.

## Validação

- `npm run test:all`: 218 testes de domínio, segurança, PDF e integração.
- `npm run build`: TypeScript e build de produção.
- `npm run test:browser`: usabilidade, pendências, mensagens, Oradores e novos fluxos de integração em 1280 px e 390 px, com APIs simuladas. Inclui geração real dos cinco PDFs, conflito de publicação, código e recuperação parcial.
- `git diff --check`: verificação de whitespace.
- `npm run validate`: reúne testes, build e navegador. Os testes de navegador usam Microsoft Edge instalado no Windows.
- `npm run audit:integrations -- "caminho-do-backup.json"`: somente leitura; saída JSON, código 0 sem ocorrências, 1 com ocorrências e 2 quando falta o caminho. Execute apenas sobre backups autorizados.

## Operação e limites

- Implantar frontend e Netlify Functions juntos quando houver autorização. Não houve push, deploy, migração automática nem importação dos backups pessoais.
- PDFs anteriores e candidatos de uploads interrompidos permanecem armazenados para evitar apagar um arquivo cujo commit teve resposta incerta. Reabrir remove a referência do Quadro; não é revogação de cópias baixadas nem dos links diretos antigos. Limpeza física do armazenamento requer política de retenção e confirmação de que nenhum documento ainda referencia o arquivo.
- A transação é atômica para metadados e bloqueios no Firebase, não para o armazenamento de blobs e Firebase como um único sistema.
- Publicações legadas sem hash precisam ser conferidas/republicadas para permitir a verificação de versão.
- Testes simulados não substituem validação de ponta a ponta com Firebase/Netlify em ambiente de homologação. Instalação PWA em aparelho físico, abertura de mapas em Android/iPhone e importação ICS em calendário real continuam exigindo validação humana. Não foi feita nova revisão visual página a página dos PDFs.
- O `CONTINUIDADE.md` previamente alterado pelo usuário, os diretórios `output/` e `tmp/` e o script local de exportação foram preservados, sem inclusão em commit.
