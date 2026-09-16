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
- [ ] Commit e deploy, somente apos autorizacao do Admin.

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
- Link real consultado sem login: HTTP 200, 13 eventos, 13 UIDs distintos.
  Versao publicada ainda sem VTIMEZONE, com dez linhas longas e sem VALARM.
  Causa exata da falha no aparelho nao comprovada. Homologacao depende de
  publicar as correcoes autorizadamente e testar nos calendarios reais.
- test:all, testes focados e build aprovados. PDFs renderizados e inspecionados.
  Browser desktop/celular com APIs simuladas; sem alterar Firebase real.
- Detalhes em C:/Users/eliau/Downloads/AUDITORIA-TRANSVERSAL-AJUSTES.md.
  Permanecem auditoria mobile global, latencia e reproducao da falha de
  publicacao em producao. Sem commit, push ou deploy nesta rodada.
