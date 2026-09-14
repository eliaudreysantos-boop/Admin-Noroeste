# O que falta para encerrar o Admin SPA

Atualizado em 14/09/2026.

Este arquivo e o checklist curto de encerramento. A especificacao e as
evidencias detalhadas permanecem em `PENDENCIAS-FINAIS-ADMIN-SPA.md`.

## Diretriz permanente de escopo

- A seguranca e a politica de acesso aos dados sao responsabilidade do Admin.
- As auditorias e implementacoes deste projeto devem priorizar a confiabilidade
  dos dados: integridade, coerencia, vinculos corretos por `masterId`, ausencia
  de duplicacoes, isolamento entre pessoas, sincronizacao previsivel,
  idempotencia, preservacao de historicos e recuperacao em caso de falha.
- Questoes exclusivamente de seguranca nao devem impedir o encerramento do app,
  criar novas fases nem provocar mudancas de arquitetura sem uma ordem expressa
  do Admin.
- Ainda devem ser relatados erros tecnicos que possam causar perda, mistura,
  sobrescrita ou exposicao acidental de dados, pois esses casos tambem afetam a
  confiabilidade. A decisao sobre a politica de acesso permanece com o Admin.

## Estado local concluido

- [x] Os nove modulos e as quatro telas da Minha Agenda estao implementados.
- [x] Login e acesso aos dados usam sessoes proprias em Netlify Functions, sem
  Firebase Authentication.
- [x] A Minha Agenda recebe somente a identidade pareada, eventos publicos,
  documentos sanitizados e dados do proprio publicador.
- [x] O Realtime Database usa as regras finais e os PDFs sao persistidos pela
  Function `storage-file` no Netlify Blobs.
- [x] PDFs publicos possuem previa obrigatoria e publicacao separada por modulo.
- [x] Os 160 testes automatizados passaram.
- [x] O build de producao e o empacotamento das dez Netlify Functions passaram.
- [x] `npm audit --omit=dev` retornou zero vulnerabilidades conhecidas.
- [x] Nenhum backup, telefone, senha operacional ou chave privada foi incluido no
  conjunto preparado para o Git.

## Ordem obrigatoria de publicacao

1. Enviar o commit ao GitHub e integrar as alteracoes na branch usada pela
   producao da Netlify.
2. Aguardar o deploy do site e das dez Functions.
3. Na versao publicada, validar login, leitura dos modulos, Minha Agenda, envio
   de relatorio e endpoints ICS.
4. Somente depois dessa validacao, publicar `database.rules.json` no Firebase.
   Publicar a regra antes do site novo bloquearia a versao atualmente online.
5. Incluir a migracao dos PDFs para Netlify Blobs no unico commit final.
6. Aguardar o deploy dessa Function e validar upload, substituicao, download e
   remocao de um PDF de teste em producao.

### Estado da fase 1 em 13/09/2026

- [x] O commit `9674176` foi enviado ao GitHub e `origin/main` aponta para ele.
- [x] O deploy automatico da Netlify publicou o site e as dez Functions.
- [x] As entradas `/` e `/agenda/` responderam com HTTP 200 em producao.
- [x] Login do Admin, restauracao da sessao e encerramento da sessao responderam
  corretamente em producao.
- [x] A leitura dos caminhos dos modulos respondeu corretamente pela Function.
- [x] A Minha Agenda reconheceu o `masterId` do Admin e separou os compromissos
  pessoais dos itens publicos do Quadro.
- [x] Os contratos publicados de relatorio e ICS responderam corretamente a
  requisicoes de verificacao que nao alteram dados.
- [ ] O envio real de um relatorio permanece na homologacao funcional para nao
  criar um registro artificial no historico.
- [ ] A criacao de uma assinatura ICS valida permanece na homologacao final em
  aparelhos reais.
- [x] As regras finais do Realtime Database foram publicadas depois da
  verificacao da versao nova.
- [x] A versao de Netlify Blobs foi incluida no commit local autorizado em
  14/09/2026.
- [ ] Enviar esse commit ao GitHub e repetir o teste real depois do deploy.

### Estado da fase 2 em 13/09/2026

- [x] O arquivo `database.rules.json` foi validado pelo Firebase CLI.
- [x] Somente as regras do Realtime Database foram publicadas no projeto
  `oradoress2`; Storage, Hosting e dados nao fizeram parte do comando.
- [x] Depois da publicacao, login, sessao, Minha Agenda e leituras de `master`,
  Tarefas, Escala TPL, Vida e Ministerio e Secretario continuaram respondendo.
- [x] Os tamanhos das respostas dos cinco conjuntos conferidos permaneceram
  iguais aos observados antes da troca das regras.
- [x] A Minha Agenda permaneceu com 14 compromissos pessoais, 493 itens publicos
  e o mesmo `masterId` pareado no teste do Admin.
- [x] Uma gravacao temporaria em `master/config/auditoriaConfiabilidade` foi
  lida de volta pela Function e removida imediatamente.
- [x] O valor anterior do caminho de teste foi restaurado; nenhum historico ou
  dado operacional foi alterado.

### Estado da fase 3 em 13/09/2026

- [x] O Console confirmou que ativar o Firebase Storage exigiria upgrade do
  plano; nenhum upgrade ou cobranca foi autorizado.
- [x] O armazenamento de PDFs foi migrado localmente para Netlify Blobs, que ja
  faz parte da infraestrutura usada pelo app.
- [x] Metadados e historicos continuam no Realtime Database; somente os bytes
  dos PDFs mudam de armazenamento.
- [x] A Function preserva o limite de 4 MB e os mesmos caminhos usados pelos
  modulos, alem de servir previa e download por URL propria.
- [x] O teste local real enviou um PDF de 871.504 bytes, conferiu o hash,
  substituiu por outro de 24.587 bytes, conferiu o novo hash, removeu o arquivo
  e recebeu HTTP 404 na tentativa posterior de download.
- [x] Os 160 testes, o build do Vite e o empacotamento das dez Functions
  passaram depois da migracao.
- [x] Incluir essa alteracao no commit autorizado pelo Admin em 14/09/2026.
- [ ] Repetir o ciclo completo com um PDF temporario na versao publicada.

### Estado da fase 4 em 13/09/2026

- [x] Admin/Mestre auditado em desktop e em 390 x 844, sem rolagem horizontal.
- [x] Conta Admin existente ficou presa ao `masterId` valido; vinculo legado
  quebrado ainda pode ser reparado.
- [x] Exclusao de pessoa passou a bloquear referencias aninhadas em historicos
  e configuracoes, alem das colecoes atuais.
- [x] Relatorio de vinculos conferido: 30 itens, sendo 25 sem vinculo, cinco IDs
  orfaos e nenhum duplicado. Nenhum dado foi corrigido nesta fase.
- [x] Tela central de textos de designacoes removida do Admin. Cada modulo agora
  possui sua configuracao de link e mensagens; o Admin conserva somente o
  Quadro, os lembretes ICS e os PDFs administrativos.
- [x] Fluxo `Voltar`, `Voltar`, `Sair`, cadastro de pessoas, usuarios, Agenda,
  backup e entrada protegida de restauracao conferidos.
- [x] Suite completa com 160 testes e build aprovados depois das correcoes.
- [x] Servidor local reiniciado sem processos duplicados; Admin, Minha Agenda e
  `auth-users` voltaram a responder com HTTP 200 depois da saturacao transitoria
  de conexoes observada durante varias recargas de desenvolvimento.
- [ ] Restaurar um backup descartavel apenas em ambiente separado; nao usar os
  dados atuais para esse teste.
- [x] A recorrencia do pico de conexoes foi confirmada com um unico servidor
  limpo durante a auditoria de Limpeza.
- [ ] Agrupar as leituras de cada modulo em uma requisicao de Function ou tratar
  com seguranca o ciclo de reutilizacao e encerramento das conexoes do Realtime
  Database; depois repetir os testes locais e publicados.

## Leituras agrupadas em 14/09/2026

Implementado agrupamento automatico das leituras simultaneas, com deduplicacao
por lote, erros independentes e sem cache adicional. Limpeza agora usa cinco
caminhos permitidos em uma chamada, inclusive para conta exclusiva do modulo.
A implementacao do agrupamento esta concluida; permanece necessario repetir
cargas locais e publicadas para confirmar a reducao do pico de conexoes.

## Homologacao funcional

- [ ] Conferir manualmente os seis modulos restantes e a Minha Agenda em celular
  e computador; Admin/Mestre, Tarefas e Limpeza ja tiveram a auditoria de
  interface concluida.
- [ ] Conferir `Voltar`, `Voltar`, `Sair` e a area inferior protegida da marca da
  Netlify nos modulos restantes; Admin/Mestre, Tarefas e Limpeza ja foram
  confirmados.
- [ ] Publicar um periodo de Tarefas, Limpeza, Oradores, Escala TPL e Servico de
  Campo.
- [ ] Confirmar os cinco botoes independentes `Baixar PDF` na Minha Agenda.
- [ ] Enviar mais de um documento pelo Admin e conferir a area `Documentos do
  Admin`.
- [ ] Conferir previa, A4 retrato, linhas, nomes, datas e quebras de pagina dos
  PDFs publicos restantes; os documentos reais de Tarefas e Limpeza ja foram
  validados.
- [ ] Testar concorrencia real entre o envio de relatorio da Minha Agenda e a
  correcao pelo Secretario.
- [ ] Instalar a PWA, abrir offline e confirmar que rascunhos e identidade nao se
  misturam entre pessoas.

## Homologacao ICS por ultimo

- [ ] Assinar um calendario pessoal e um calendario do Quadro.
- [ ] Testar Google Calendar no computador e Android sincronizado.
- [ ] Testar Apple Calendar em pelo menos um aparelho Apple.
- [ ] Confirmar datas e horarios em `America/Fortaleza`.
- [ ] Confirmar os lembretes configurados por modulo e a ausencia de lembrete de
  Servico de Campo no Quadro.
- [ ] Testar duas instalacoes independentes, alteracao no mesmo link e revogacao
  separada.
- [ ] Revogar os links temporarios usados na homologacao.

## Dados reais a revisar depois

Estas pendencias foram preservadas sem vinculo automatico para evitar mistura de
pessoas:

- cinco participantes incertos da Escala TPL;
- 27 perfis e 184 referencias de Vida e Ministerio;
- 20 relatorios de Valeria ainda dependentes de decisao;
- Taina sem relatorios na fonte analisada;
- superintendentes dos quatro grupos;
- links reais de WhatsApp de cada modulo;
- locais, horarios e dirigentes reais do Servico de Campo.

## Melhoria nao bloqueante

- O pacote de exportacao S-21 possui aproximadamente 1 MB minificado. Ele ja e
  carregado somente quando a exportacao e aberta, portanto pode ser otimizado
  depois da homologacao sem impedir a publicacao atual.

## Criterio de encerramento

O projeto pode ser declarado encerrado quando o deploy final estiver ativo, os
PDFs e modulos tiverem sido homologados e os testes de aparelhos e calendarios
estiverem registrados.
