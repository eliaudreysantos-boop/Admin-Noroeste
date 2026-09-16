# Auditoria de correcoes - 15/09/2026

Este documento registra as falhas citadas e confirmadas para a proxima rodada
de correcoes do Admin SPA. Ele nao substitui `PENDENCIAS-FINAIS-ADMIN-SPA.md`;
serve como resumo operacional da auditoria manual atual.

Ultimo estado tecnico conhecido:

- Commit publicado: `cfe3a60 feat: concluir auditorias e padronizar modulos`.
- Producao: `https://admin-noroeste.netlify.app`.
- Deploy confirmado como `ready` na Netlify para o commit `cfe3a60`.
- Testes automatizados e build passaram antes do deploy.
- A pasta antiga de arquivos auxiliares da worktree deve ser removida do
  checkout.

## Falhas confirmadas para correcao

### 1. Desempenho e sincronizacao

- [ ] Investigar lentidao global no carregamento dos modulos.
- [ ] Conferir se as Netlify Functions estao abrindo leituras/conexoes demais no
  Realtime Database.
- [x] Exibir o indice estatico de cada modulo antes de aguardar os dados
  operacionais e compartilhar uma unica requisicao em andamento com a primeira
  tela aberta.
- [x] Garantir que o salvamento envie somente os caminhos alterados, sem
  reenviar blocos inteiros nem sobrescrever alteracoes concorrentes.
- [x] Evitar a leitura da colecao completa de documentos ao publicar ou retirar
  um PDF oficial; agora somente o registro do modulo e periodo e consultado.
- [x] Evitar que Limpeza carregue grupos e publicadores do Secretario quando o
  reaproveitamento de grupos estiver desligado; ao ligar a opcao, os dados sao
  buscados antes de exibir a configuracao integrada.
- [x] Aplicar a abertura imediata com carga compartilhada em Tarefas, Oradores,
  Escala TPL, Secretario, Servico de Campo, Admin e Vida e Ministerio.

Situacao em 15/09/2026: os salvamentos auditados usam `PATCH` nos caminhos
alterados. Todos os indices principais agora aparecem sem depender da resposta
do Firebase, e a tela escolhida reutiliza a carga ja iniciada. A percepcao de
velocidade operacional ainda precisa ser medida na producao para separar
latencia da Function, volume do Firebase e custo de renderizacao.

Resultado esperado: modulos abrindo sem espera excessiva, salvamentos mais
rapidos e menor risco de mistura ou perda de dados por concorrencia.

### 2. Limpeza

- [x] Corrigir no codigo a falha em que a previa do PDF da escala de Limpeza nao abre e,
  por consequencia, a publicacao fica bloqueada.
- [ ] Revalidar previa obrigatoria, publicacao, retirada e reabertura em
  producao.

Situacao em 15/09/2026: o gerador foi revalidado por teste automatizado em A4
retrato, a previa e invalidada quando o periodo muda e o modulo agora mostra a
causa real de uma falha. A confirmacao visual na Netlify continua pendente.
Em navegador local com respostas controladas, a previa abriu em um `iframe`
PDF sem erro. Publicacao, bloqueio, retirada do Quadro e reabertura do periodo
tambem completaram o ciclo usando armazenamento e Firebase simulados.

Resultado esperado: previa abre antes de publicar, PDF permanece em A4 retrato
com linhas, publicacao e retirada funcionam na versao publicada.

### 3. Servico de Campo

- [x] Manter salvamentos parciais por caminho e reduzir a leitura feita durante
  a publicacao do PDF.
- [x] Corrigir no codigo a previa do PDF depois de `Completar mes`, invalidando
  qualquer previa anterior e permitindo gerar uma nova para o estado atual.
- [x] Reformular o rodizio para ser independente por programacao/arranjo.
- [x] Permitir dois ou mais dirigentes por arranjo, usando somente pessoas
  aprovadas para dirigir.
- [x] Permitir multiplas saidas no mesmo dia e horario quando forem arranjos
  distintos.
- [x] Permitir programacao por data especifica e por recorrencia semanal.
- [x] Garantir que o PDF mostre as datas geradas e o dirigente efetivo de cada
  saida, sem listar todo o grupo de rodizio.
- [x] Garantir por teste automatizado que o ICS individual gere lembrete para o dirigente e que o
  Quadro mostre a programacao sem lembrete individual.

Situacao em 15/09/2026: motor, PDF e adaptador da Minha Agenda passaram em dez
testes do modulo e nos testes de ICS. Ainda falta repetir o fluxo completo na
versao publicada e medir o tempo real de salvamento.
Em navegador local com latencia simulada de 2,5 segundos, o indice apareceu
antes dos dados e a previa PDF abriu sem erro. Publicacao, bloqueio, retirada
do Quadro e reabertura do mes completaram o ciclo simulado.

Resultado esperado: Servico de Campo funciona como modulo proprio, separado da
Escala TPL, com rodizio flexivel, publicacao confiavel e PDF claro.

### 4. Secretario

- [x] Ajustar a competencia principal para abrir na primeira competencia ainda
  aberta, e nao necessariamente no mes civil atual.
- [x] Remover o bloqueio inicial do indice enquanto os dados do modulo carregam.
- [ ] Corrigir lentidao restante ao trocar telas, abrir modais e editar
  pessoa.
- [ ] Homologar concorrencia real entre envio da Minha Agenda e correcao pelo
  Secretario em dois aparelhos.

Resultado esperado: o Secretario abre direto no mes que ainda exige trabalho e
continua sendo a autoridade final para corrigir relatorios fechados ou enviados.

Situacao em 15/09/2026: a selecao da primeira competencia aberta ganhou teste
unitario. Lentidao percebida e concorrencia em dois aparelhos continuam
pendentes de medicao e homologacao.
O navegador confirmou `2026-11` como primeira competencia aberta quando
setembro e outubro estavam fechados, inclusive com resposta atrasada em 2,5
segundos.

### 5. Integracao de grupos reaproveitados

- [x] Quando Limpeza ativar `Aproveitar grupos do Servico de Campo`, os cards
  devem refletir os grupos do Servico de Campo, sem listar todas as pessoas de
  forma indistinta.
- [x] Selecionar automaticamente os integrantes do grupo reaproveitado.
- [x] Limitar responsavel e ajudantes as pessoas ativas dentro daquele grupo.
- [x] Manter integracao somente leitura: o modulo consumidor nao altera os
  grupos originais do Servico de Campo.
- [x] Ao desativar o reaproveitamento, voltar aos grupos proprios do modulo.

Situacao em 15/09/2026: o cadastro de grupos e publicadores continua sendo
administrado pelo Secretario; Limpeza apenas consome essa organizacao como a
fonte dos grupos de Servico de Campo.

Resultado esperado: grupos reaproveitados ajudam no preenchimento, mas nao
criam vinculos ocultos nem alteram a fonte original.

### 6. PDFs publicos dos modulos

- [ ] Publicar periodos representativos de Tarefas, Oradores, Escala TPL,
  Limpeza e Servico de Campo em producao.
- [ ] Confirmar na Minha Agenda um seletor unico de periodo.
- [ ] Confirmar cinco botoes independentes de download: Tarefas, Oradores,
  Escala TPL, Limpeza e Servico de Campo.
- [ ] Confirmar que Secretario e Vida e Ministerio nao entram nos PDFs publicos
  dos modulos.
- [ ] Testar documentos manuais adicionados pelo Admin em area separada.

Resultado esperado: os publicadores baixam PDFs por modulo, enquanto documentos
manuais do Admin continuam separados.

### 7. Minha Agenda

- [x] Corrigir a assinatura do Quadro para permitir selecionar tambem Limpeza;
  a selecao inicial agora inclui os seis modulos de agenda.
- [ ] Homologar em dados e aparelhos reais as telas Pessoal, Geral, Relatorio e
  Quadro.
- [ ] Confirmar persistencia local dos itens clicaveis.
- [ ] Confirmar que a PWA abre offline sem misturar identidades.
- [ ] Confirmar que o rascunho de relatorio fica somente no aparelho.
- [ ] Confirmar que a marca da Netlify nao atrapalha cliques.

Resultado esperado: Minha Agenda fica simples para uso em celular, sem troca
acidental de pessoa e sem alongar demais o Quadro.

### 8. Assinaturas ICS

- [ ] Manter esta homologacao por ultimo.
- [ ] Testar Google Calendar, Android e Apple Calendar.
- [ ] Confirmar timezone `America/Fortaleza`.
- [ ] Confirmar isolamento entre duas pessoas.
- [ ] Confirmar alteracao chegando ao mesmo link ICS.
- [ ] Confirmar revogacao independente.

Resultado esperado: assinaturas estaveis em aparelhos reais, sem expor dados de
outra pessoa.

### 9. Aprendizados cruzados entre modulos

| Padrao aprendido | Verificacao em outros modulos | Situacao |
| --- | --- | --- |
| Alteracao deve invalidar a previa anterior | Tarefas rejeitou publicacao depois de editar uma designacao e aceitou somente depois de nova previa | Confirmado em navegador |
| Publicacao precisa de rollback se uma etapa falhar | Oradores e Escala TPL preservaram/restauraram o estado nos testes de falha simulada | Confirmado em desktop e celular |
| PDF deve abrir antes de publicar | Tarefas, Oradores, Escala TPL, Limpeza e Servico de Campo usam `PublicationPreviewGate` | Confirmado no codigo e em testes |
| Salvamento deve alterar apenas os caminhos afetados | Tarefas, Oradores, Escala TPL e Vida e Ministerio usam `PATCH` por registro/campo nos fluxos auditados | Confirmado no codigo |
| O indice nao precisa esperar dados operacionais | Tarefas, Oradores, Escala TPL, Secretario, Servico de Campo, Vida e Ministerio e Admin abrem imediatamente e compartilham a carga em andamento | Aplicado; falta apenas medir a experiencia na producao |
| Falhas devem mostrar a causa util | Limpeza e Servico de Campo agora preservam a mensagem real | Tarefas, Oradores, Escala TPL e Vida e Ministerio ainda usam mensagens genericas em varios fluxos |
| Testes de navegador precisam fazer parte da rotina | Oradores e Escala TPL possuem testes de desktop/celular; a rodada atual adicionou Tarefas ao teste cruzado | Falta criar um comando unico para executa-los junto da auditoria final |

Conclusao: os motores de Tarefas, Oradores e Escala TPL nao apresentaram a
falha de previa obsoleta. O indice imediato e a reutilizacao de uma unica
requisicao em andamento foram propagados aos modulos principais. A proxima
melhoria reaproveitavel de codigo e tornar as mensagens genericas capazes de
revelar a etapa que falhou; as demais validacoes dependem de producao, dados ou
aparelhos reais.

## Criterio para encerrar esta rodada

1. Corrigir os itens de previa/publicacao que bloqueiam Limpeza e Servico de
   Campo.
2. Corrigir as lentidoes confirmadas em Secretario e Servico de Campo.
3. Revalidar PDFs publicos e downloads na Minha Agenda.
4. Atualizar `PENDENCIAS-FINAIS-ADMIN-SPA.md` marcando o que foi corrigido.
5. Rodar `npm run test:all`, `npm run build` e `git diff --check`.
6. Fazer commit somente quando o Admin autorizar.

## Verificacao automatizada desta rodada

- [x] `npm run test:all`: 191 testes aprovados.
- [x] `npm run build`.
- [x] `git diff --check`.
- [x] Testes dos documentos do Secretario deixaram de depender da pasta
  auxiliar removida e usam os modelos permanentes de `public/templates`.
- [x] `tests/corrections-browser.mjs`: indice imediato, competencia aberta,
  previas, publicacao e reabertura de Limpeza e Servico de Campo confirmados
  com servicos simulados e sem escrita externa; Tarefas tambem rejeitou uma
  previa obsoleta depois de edicao.
- [x] `tests/oradores-browser.mjs`: desktop e celular sem erro, sem estouro
  horizontal e com rollback de publicacao.
- [x] `tests/escala-browser.mjs`: desktop e celular sem erro, com rollback,
  bloqueio historico e layout responsivo.
- [x] Commit e deploy autorizados e concluidos em 16/09/2026: `5d762d3`.

## Atualizacao de 16/09: layouts e calendario

- S-3 retirado da interface do Secretario; modelos S-21/S-88 preservados.
- Tarefas: previa ao lado de Publicar; PDF A4 retrato em dois blocos por
  tipo de reuniao, nomes completos com quebra de linha e paginacao de excessos.
- Oradores: Arranjo Local/Externo, tabela externa continua e datas DD/MM.
  Arranjos externos continuam incluindo o mes selecionado em diante.
  Acoes recolhiveis no celular, com preferencia local por registro.
- ICS: definicao de fuso e dobra UTF-8; carregamento dos horarios centrais
  e locais TPL alinhado entre feed, agenda-data e Minha Agenda administrativa.
- Comandos de assinatura passaram a usar apiJson, enviando validacao da sessao
  que estava faltando no acesso pelos modulos. Google e Apple tem links separados.
- Link real antes do deploy: HTTP 200, 13 eventos, 13 UIDs distintos,
  sem VTIMEZONE, com dez linhas longas e sem VALARM.
- Apos o deploy: HTTP 200, text/calendar, 13 eventos, um VTIMEZONE,
  nenhuma linha acima de 75 octetos e nenhum LF sem CR. Formato corrigido
  confirmado em producao; falta homologar assinatura e alertas nos aparelhos.
- test:all, testes focados e build aprovados. PDFs renderizados e inspecionados.
  Browser desktop/celular com APIs simuladas; sem alterar Firebase real.
- Detalhes em C:/Users/eliau/Downloads/AUDITORIA-TRANSVERSAL-AJUSTES.md.
  Permanecem auditoria mobile global, latencia e reproducao da falha de
  publicacao de PDFs em producao. Nenhuma escrita nos dados do Firebase.

### Publicacao confirmada

- Commit: `5d762d3ef33ba5232325ceb6baee2cadde71b11d`.
- Push para `main` no GitHub; deploy automatico conectado do Netlify.
- Deploy: `6aaab443e28bf30008d434bc`, estado `ready`, publicado em
  16/09/2026 as 12:23:12 (America/Fortaleza).
- https://admin-noroeste.netlify.app/agenda/ respondeu HTTP 200.
- Proximo passo: repetir assinatura no Google Agenda e Apple Calendar,
  conferir horarios, atualizacao, remocao de eventos e lembretes. A ausencia
  de VALARM foi constatada antes do deploy; a contagem de alarmes nao foi
  repetida na verificacao posterior e continua pendente de conferencia.
- Esta atualizacao documental e posterior ao commit; nao esta incluida nele.

## Ambiente de testes separado - 16/09/2026

- O GitHub original permanece como remoto `origin`:
  `https://github.com/eliaudreysantos-boop/Admin-Noroeste.git`.
  Ele representa a versao estavel e nao deve receber atualizacoes rotineiras
  durante os testes finais.
- Foi criado o remoto `teste`:
  `https://github.com/ubsjosafamota-blip/Noroeste-testes.git`.
  A conta `eliaudreysantos-boop` foi adicionada como colaboradora para permitir
  os envios sem trocar as credenciais locais do Git.
- O repositorio de testes estava vazio. Recebeu o historico atual na branch
  `main`, incluindo o commit `ff1bf8a` que registra o deploy e a verificacao
  do calendario. A branch local acompanha `teste/main`.
- Novos commits e deploys de homologacao seguem para `teste`. Antes de encerrar
  o projeto, revisar a diferenca entre `origin/main` e `teste/main`, executar
  a auditoria final e enviar somente o conjunto aprovado ao GitHub original.
- O site atual `admin-noroeste.netlify.app` e seu projeto Netlify nao foram
  desvinculados, apagados ou alterados por esta separacao. Vincular uma nova
  conta/projeto Netlify ao repositorio `teste` permanece como proximo passo
  externo, quando o Admin entrar nessa conta.

## Continuidade em novo chat

- Worktree ativa: `C:\Users\eliau\.codex\worktrees\cb2a\admin-spa`.
- Branch ativa: `codex/indexar-projeto-com-graphify`, acompanhando
  `teste/main`. O remoto `origin` continua reservado para a versao estavel.
- Nao fazer commit, push ou deploy sem autorizacao expressa do Admin.
- Ha alteracoes locais ainda sem commit: consolidacao de `Dados das reunioes`
  na Minha Agenda e esta atualizacao documental. Antes de qualquer commit,
  conferir `git status` e validar o diff completo.
- Tarefa implementada e aguardando validacao: no Quadro da Minha Agenda, o
  seletor de reuniao usa as datas futuras; fim de semana consolida Oradores,
  Tarefas e Limpeza; meio de semana consolida Tarefas, Vida e Ministerio e
  Limpeza. `Copiar texto` copia o conjunto, `Copiar limpeza` copia somente a
  parte de Limpeza e o WhatsApp exclui Limpeza.
- Proximo trabalho planejado: configurar um Netlify de testes ligado ao
  remoto `teste`, concluir a auditoria de confiabilidade e somente depois
  iniciar a fase de Relatorios da Minha Agenda. A homologacao real de ICS no
  Google Agenda e Apple Calendar deve ficar por ultimo, apos o ambiente de
  testes estar publicado.
- Ao retomar, ler primeiro este arquivo, `O-QUE-FALTA-ADMIN-SPA.md`,
  `PENDENCIAS-FINAIS-ADMIN-SPA.md` e, para calendario,
  `C:\Users\eliau\Downloads\HOMOLOGACAO-ICS-DADOS-E-APARELHOS.md`.

## Continuidade de Minha Agenda - 16/09/2026

- `Copiar limpeza` passou a usar a mesma formatacao detalhada dos itens do
  quadro, incluindo detalhe/local quando existirem, em vez de copiar apenas
  titulo e nomes.
- Validacao local concluida sem commit, push ou deploy: `npm run test:individual`
  com 44 testes aprovados, `npm run test:all` com 213 testes aprovados e
  `npm run build` aprovado. O build manteve apenas o aviso conhecido de chunks
  acima de 500 kB.

## Fase de Relatorios da Minha Agenda - 16/09/2026

- A tela `Relatorio` ganhou um card explicito para a competencia selecionada,
  exibindo `Disponivel para envio`, `Rascunho local`, `Enviado`, `Ajustado`,
  `Secretario`, `Mes fechado` ou `Falha no envio`, conforme o estado real.
- O rascunho local mostra um resumo antes da abertura do modal e continua
  isolado no aparelho. Falha de envio preserva o rascunho e deixa a situacao
  visivel na tela.
- A Function `secretary-report` passou a ter uma entrada testavel e aceita
  reenvio idempotente da mesma `submissionId`, devolvendo o relatorio oficial ja
  gravado sem criar duplicidade. Envio concorrente com outra `submissionId`
  continua recebendo `409` e nao sobrescreve o registro existente.
- O site de testes `https://noroeste-testes.netlify.app/` respondeu HTTP 200 em
  `/` e `/agenda/`. A Function `auth-users` respondeu 503 neste ambiente, entao
  a homologacao publicada ainda depende de revisar variaveis/acesso do projeto
  Netlify de testes.
- O CLI local da Netlify ainda esta vinculado ao projeto `admin-noroeste`, nao
  ao projeto `noroeste-testes`; por isso nenhum deploy foi executado nesta
  continuidade.
- Diagnostico do ambiente de testes: `netlify sites:list` na conta atual nao
  lista `noroeste-testes` e `netlify api getSite --data
  '{"site_id":"noroeste-testes"}'` retornou `Not Found`. A conta/token atual
  consegue administrar `admin-noroeste`, mas nao o projeto de testes informado
  em `https://app.netlify.com/projects/noroeste-testes/overview`.
- A Function `auth-users` funciona em `admin-noroeste` e falha com 503 em
  `noroeste-testes`. Como `netlify/lib/subscription-store.ts` depende de
  `FIREBASE_DATABASE_URL` e `FIREBASE_SERVICE_ACCOUNT_JSON`, o proximo passo
  externo e conferir/adicionar essas variaveis no projeto Netlify de testes ou
  entrar no CLI com uma conta/equipe que tenha acesso a ele.
- Passo 1 concluido: o CLI foi autorizado com a conta `ubsjosafamota@gmail.com`
  na equipe `Testes`, o projeto `noroeste-testes` ficou visivel e a worktree
  local foi vinculada ao site id `3466dae2-35fb-499d-82c1-21084ec276cd`.
- Apos o vinculo, `netlify status` confirmou `Current project:
  noroeste-testes`. A listagem segura das variaveis de producao nao retornou
  nomes configurados e `auth-users` continuou falhando com 503; o proximo passo
  e configurar as variaveis Firebase no Netlify de testes antes de publicar
  qualquer nova versao.
- Depois da criacao das variaveis em `noroeste-testes`, `netlify env:list`
  passou a listar `FIREBASE_DATABASE_URL` e `FIREBASE_SERVICE_ACCOUNT_JSON`.
  O CLI mascara valores marcados como secretos, entao a URL aparecia como
  `****************.com` nas leituras por contexto/escopo. Com o arquivo local
  de conta de servico baixado do Firebase e a URL real configurada em ambiente,
  a leitura local de `usuarios` funcionou e retornou 2 usuarios ativos. Como
  `auth-users` continuou retornando 503 no site publicado, o proximo passo e
  redeployar somente o projeto de testes para carregar as variaveis novas nas
  Functions.
- Deploy de testes autorizado e concluido: primeiro commit `1de918a` avancou
  Relatorios da Minha Agenda, mas o Netlify bloqueou por secret scan ao
  encontrar a URL do Firebase gravada em arquivos versionados. O commit
  `af89371` removeu a URL literal da auditoria e de scripts auxiliares,
  exigindo `FIREBASE_DATABASE_URL` via ambiente.
- Deploy `6aaaecc32912c9000881d8a4` publicado em `noroeste-testes` as
  16/09/2026 19:24 UTC, com 11 Functions implantadas e secret scan sem
  achados. `https://noroeste-testes.netlify.app/agenda/` respondeu HTTP 200 e
  `/.netlify/functions/auth-users` respondeu HTTP 200 com 2 usuarios ativos.
- Validacao local: `npm run test:secretario` com 26 testes aprovados,
  `npm run test:individual` com 44 testes aprovados, `npm run test:all` com
  216 testes aprovados e `npm run build` aprovado. O build manteve apenas o
  aviso conhecido de chunks acima de 500 kB.

## Concorrencia, identidade e PWA - continuidade de 16/09/2026

- Primeiro vinculo da Minha Agenda usa `Salvar`, sem senha. O desbloqueio
  continua exigindo senha Admin. O servidor rejeita POST que tente trocar a
  pessoa ou a instalacao de uma sessao ja vinculada; repetir o mesmo vinculo
  retorna sucesso sem recriar a sessao nem revogar suas assinaturas.
- Acrescentados testes de envios simultaneos da Agenda e do Secretario com
  repeticao da transacao: ambas as ordens de chegada, reenvio idempotente,
  fechamento durante o envio e reenvio depois de revisao pelo Secretario.
  Nenhum desses testes escreve no Firebase real.
- Teste executando o service worker com cache/rede simulados reproduziu uma
  falha: um asset com HTTP 503 permitia substituir o HTML e apagar a versao
  anterior. Corrigido para baixar todos os arquivos necessarios antes de
  substituir o shell. Cobertos cache offline, primeiro acesso pela rede,
  atualizacao incompleta e atualizacao completa.
- `tests/individual-browser.mjs` aprovado no Edge em 1440x900 e 390x844:
  quatro telas, cinco botoes de PDF, aba/painel restaurados apos reload,
  sem erro de pagina nem estouro horizontal. APIs simuladas e service worker
  bloqueado nesse roteiro; nao equivale a homologacao do PWA instalado.
- `npm run test:all` aprovado, incluindo 31 testes de Secretario e 51 de
  Minha Agenda. `npm run build` aprovado com o aviso conhecido de chunks.
- Alteracoes desta rodada permanecem locais, sem commit, push ou deploy.
- Proxima etapa: validar no ambiente de testes o primeiro Salvar, reabertura
  direta, desbloqueio, rascunho apos fechar/reabrir o PWA, offline/reconexao
  e concorrencia em duas sessoes reais. Depois homologar ICS em Google,
  Android e Apple conforme `HOMOLOGACAO-ICS-DADOS-E-APARELHOS.md`.

## Fluxo completo do PWA em navegador - 16/09/2026

- Novo roteiro `tests/agenda-pwa-browser.mjs` serve o build `dist` com APIs
  ficticias locais e executa o service worker de producao no Edge. Como o app
  desabilita o registro automatico em localhost, o roteiro registra o worker
  explicitamente. Nao acessa o Firebase nem o site publicado.
- Aprovado em 1440x900 e 390x844: primeiro Salvar sem senha, reabertura direta,
  encerramento e reinicio do navegador offline com perfil persistente,
  restauracao da aba Relatorio e dos campos estudos, horas e observacao.
- Nenhum rascunho foi enviado automaticamente. Reconexao, envio explicito,
  resposta perdida depois de gravar e nova tentativa apos reload foram testados.
- O roteiro encontrou e reproduziu um defeito: cada tentativa gerava uma nova
  submissionId. Corrigido para persistir o identificador no rascunho antes da
  requisicao e reaproveita-lo ao tentar novamente, inclusive apos reload.
  Confirmacao de sucesso remove o rascunho e mantem um unico registro oficial.
- Sete toques abrem o desbloqueio; senha incorreta mantem a pessoa; senha de
  teste correta limpa o cache pessoal e permite escolher outra pessoa, sem
  reaproveitar o rascunho anterior.
- Screenshots offline inspecionadas em `.netlify/agenda-pwa-offline-1440.png`
  e `.netlify/agenda-pwa-offline-390.png`; sem estouro horizontal ou erro JS.
- Build e 51 testes de Minha Agenda aprovados apos a correcao. Para repetir o
  roteiro: executar o build, disponibilizar Playwright localmente ou indicar
  seu package.json em PLAYWRIGHT_PACKAGE_JSON, e executar
  `node tests/agenda-pwa-browser.mjs` com Microsoft Edge instalado.
- Pendente: publicar estas alteracoes no ambiente de testes e validar aparelhos
  reais, integracao com Functions/Firebase, concorrencia real e calendarios ICS.
  Esta rodada nao realizou commit, push, deploy nem alterou dados reais.

## Publicacao para homologacao - autorizacao de 16/09/2026

- Admin autorizou seguir com a publicacao do conjunto validado em `teste/main`
  e no projeto Netlify `noroeste-testes`. O remoto `origin` permanece intacto.
- Conjunto: Salvar sem senha, protecao do vinculo existente, atualizacao do
  cache offline, identificador persistente de reenvio e testes de regressao.
- Validacoes anteriores aprovadas: suite completa; apos a ultima correcao,
  build, 51 testes de Minha Agenda e roteiro PWA no Edge desktop/celular.
- A confirmacao do deploy e os testes HTTP posteriores serao registrados no
  resultado da tarefa; aparelhos reais e calendarios externos seguem pendentes.
