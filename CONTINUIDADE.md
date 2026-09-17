# Continuidade - Noroeste Admin SPA

Atualizado em 17/09/2026. Este documento substitui os sete planos/auditorias
antigos da raiz. Historico anterior permanece recuperavel pelo Git.

## Repaginacao autorizada e implementada localmente

- Usuario autorizou commit e deploy desta repaginacao e retirada das assinaturas
  em 17/09/2026. Destino exclusivo: teste/main e noroeste-testes.netlify.app.
  Build e suite completa aprovados antes do envio. Conferir hash com git log;
  referencias abaixo a "sem commit/deploy" descrevem a etapa anterior ao envio.

- Decisao mais recente: usuario desistiu das assinaturas; manter apenas ICS avulso.
  Controles e chamadas de assinatura removidos da Minha Agenda (Pessoal/Quadro).
  Downloads de mes, proximos compromissos e Geral preservados. Nao prometer
  atualizacao/exclusao automatica de compromissos importados.
  Backend e links existentes NAO foram revogados ou apagados. Homologacao de
  assinaturas Google/Apple deixa de ser criterio para finalizar o aplicativo.
- Usuario pediu uma unica barra: topbar removida, bottombar azul original mantida.

- Usuario aprovou "Implementar a repaginacao" apos o deploy ad93734 em teste/main.
- Nova rodada SEM commit/deploy: Admin abre Pessoas, Tarefas abre Escala e TPL
  abre Escala do mes. Abas compartilhadas em `src/ui/workspace-nav.ts`.
- Admin agrupa configuracoes, vinculos e backup em Administracao; TPL agrupa
  sete destinos em tres areas. Servico de Campo tem Programacao/Configuracoes.
- Voltar das abas retorna a principal sem remontar o modulo; da principal retorna
  aos modulos. Guardas impedem respostas de abas antigas de substituir a atual.
- Cabecalho comum, superficies mais simples, formularios secundarios recolhidos,
  tres abas iguais na Agenda e PDFs primeiro no Quadro. Motores/PDFs inalterados.
- Testes: suite test:all, build, navegacao desktop/mobile nos seis modulos,
  publication-download-browser e individual-browser. Capturas em tmp/layout.
- Testes antigos que dependem dos menus intermediarios devem ser adaptados ao
  novo fluxo quando executados; nao reintroduzir os menus para satisfazer seletores.
- Testar a versao em http://127.0.0.1:5190/ antes de nova publicacao.
- As instrucoes antigas de nao implementar abaixo foram substituidas pelo aceite.

## Atualizacao: Voltar e publicacao autorizados

- Pedido posterior do usuario: corrigir Voltar, fazer commit e deploy no site de testes.
- Corrigido: Limpeza e a programacao principal de Servico de Campo tinham marcador
  de tela interna e Voltar remontava o mesmo modulo. Marcador removido dessas
  raizes, preservado nas configuracoes de Servico de Campo.
- Regressao reproduzida antes da correcao; teste `tests/back-navigation-browser.mjs`
  aprovado nos seis modulos, dois ciclos sem reload, em 1280 e 390 pixels.
- `npm run test:all` e `npm run build` aprovados nesta rodada.
- Replanejamento de layouts continua pendente, sem autorizacao de implementacao.
- Commit/deploy desta rodada devem ser conferidos no Git e no site de testes;
  referencias a "sem commit" abaixo descrevem o estado anterior a esta publicacao.

## Pedido de replanejamento e limite de autorizacao

- Replanejar o layout de TODOS os modulos ativos, nao apenas Admin e Minha Agenda.
- Usuario relata: botao Voltar nao funciona ate atualizar a pagina.
- NAO implementar o novo layout nem corrigir a navegacao ainda. Primeiro avaliar,
  reproduzir o problema e apresentar um plano detalhado para aprovacao.
- Nesta etapa foi autorizada somente a consolidacao e limpeza dos Markdown.
- Nao fazer commit, push, deploy ou alteracoes no Firebase por iniciativa propria.
- Proximo chat: ler este documento e inspecionar o codigo atual antes de propor.

## Pasta correta e Git

- Trabalhar em `C:/Users/eliau/.codex/worktrees/pdf-a4/admin-spa`.
- Branch: `codex/ajustar-pdfs-a4`; base: `e91c99bc081b37862baa967b0b3f478b7585e4af`.
- `C:/Users/eliau/Downloads/admin-spa` e um checkout antigo com alteracoes do
  usuario. Nao reverter, limpar ou usar como fonte da versao atual.
- A antiga worktree `cb2a/admin-spa` nao e mais a pasta de trabalho desta rodada.
- Remoto `teste`: https://github.com/ubsjosafamota-blip/Noroeste-testes.git
- Site de testes: https://noroeste-testes.netlify.app/
- Remoto `origin`: https://github.com/eliaudreysantos-boop/Admin-Noroeste.git
- Site original: https://admin-noroeste.netlify.app/ (nao publicar nele).
- Ultimo deploy de testes conhecido: e91c99b. Conferir remoto antes de publicar.
- Ha alteracoes locais de PDFs, testes, proxy Vite e scripts SEM commit/deploy.
  Conferir `git status` e o diff; preservar todo o trabalho existente.
- `output/` e `tmp/` contem artefatos e dados pessoais: nao incluir no commit.

## Aplicativo e principios a preservar

- Ativos: Admin/Mestre, Tarefas, Escala TPL, Limpeza, Servico de Campo e Minha Agenda.
- Secretario, Oradores e Vida e Ministerio foram retirados do aplicativo ativo.
  Nao reintroduzir requisitos historicos desses modulos ou a aba Relatorio.
- Minha Agenda conserva Pessoal, Geral e Quadro.
- Cadastro central em `master/pessoas`; vinculos por masterId, sem inventar nomes.
- Manter permissoes, disponibilidade, habilitacoes, bloqueios de periodos
  publicados, isolamento entre pessoas e preservacao de edicoes manuais.
- Baixar PDF e Publicar no Quadro sao acoes SEPARADAS por decisao do usuario.
  Download nao publica. Publicacao precisa tratar falhas/rollback e duplicidade.
- Documentos manuais do Admin permanecem separados dos PDFs dos quatro modulos.
- Limpeza usa grupos proprios, sem dependencia de Secretario.
- Servico de Campo tem rodizio por arranjo; varias saidas no mesmo dia sao validas.
- Mensagens e links WhatsApp pertencem a cada modulo; preservar personalizacoes.
- Minha Agenda: preservar preferencias por pessoa, identidade, cache/offline e
  assinaturas. Reavaliar UX sem enfraquecer essas garantias.

## Replanejamento proposto, ainda NAO aprovado para implementacao

1. Inventariar telas, acoes, navegacao e estados de cada modulo ativo em desktop
   e celular. Mostrar o fluxo atual e quais telas podem ser reunidas/eliminadas.
2. Diagnosticar primeiro Voltar: reproduzir apos login, entrada/troca de modulo,
   telas internas, retorno repetido e reload. Registrar sequencia e erros.
   Inspecionar `src/main.ts`, `src/router.ts`, eventos app-route-change,
   data-module-index-marker e renderizacoes assincronas. Causa ainda desconhecida.
3. Definir navegacao comum: retorno previsivel de um nivel, sem exigir reload,
   com Sair distinto; estado e periodo preservados quando apropriado.
4. Propor layout operacional simples para cada modulo: acao principal evidente,
   menos telas intermediarias, configuracoes secundarias em secoes expansiveis.
   Limpeza foi a maior queixa de complexidade; usuario prefere listas longas
   recolhiveis tambem nas configuracoes de Servico de Campo.
5. Apresentar proposta detalhada por modulo, o que fica/muda/sai, interacoes,
   estados vazio/carregando/erro, riscos e ordem de implementacao. Aguardar aceite.
6. Depois de autorizado: implementar por etapas e testar retorno, preservacao
   de estado, acessibilidade, celular/desktop, PDFs e regras dos motores.

## PDFs: alteracoes locais concluidas e verificadas

- Tarefas: 1 A4 retrato, inclusive bimestre com 19 linhas; dois blocos com datas
  nas linhas. Colunas: Operador 1/2 e Microfone 1/2; Presidente, Leitor, Entrada,
  Auditorio. Fonte adaptativa, nomes com quebra, sem cortar dados.
- TPL: 1 A4 paisagem por local; quatro locais = quatro folhas, antes eram 13.
  Remove colunas de horarios inteiramente vazias, preserva datas/designacoes.
- Limpeza: 1 A4 retrato; altura e padding corrigidos, linhas nao cruzam texto.
- Servico de Campo: 1 A4 retrato, tabela legivel.
- Arquivos alterados: `src/modules/{tarefas,escala,limpeza}-documents.ts`,
  `src/ui/public-pdf-layout.ts` e os tres testes correspondentes em `tests/`.
- Build aprovado; 47 testes focados aprovados; teste de navegador
  `tests/publication-download-browser.mjs` aprovado em 1280 e 390 pixels.
- Usuario gerou os quatro PDFs em Downloads em 17/09, cerca de 16:03. Todas as
  sete paginas foram renderizadas e inspecionadas: 1/4/1/1, sem sobreposicoes.
- Limpeza ainda repete numero na coluna N e no nome do grupo; detalhe cosmetico.
- Nao confundir validacao de downloads locais com homologacao de publicacao online.

## Servidor local e acesso

- URL usada: http://127.0.0.1:5190/ (verificar se o processo ainda esta ativo).
- Reiniciar se necessario: `npm run dev -- --host 127.0.0.1 --port 5190`.
- `vite.config.ts` tem proxy de `/.netlify/functions/` para o site de TESTES.
  Sem isso Vite retorna HTML e a lista de login fica sem usuarios.
- Lista de usuarios verificada no Edge automatizado: um usuario selecionavel.
- Login usa senha habitual; nao colocar credenciais no documento ou codigo.
- ATENCAO: nao e sandbox de dados. Salvar/publicar usa o backend online.
- Melhorias anteriores: importacao lazy de PDF, restauracao de sessao paralela
  a lista de usuarios, timeout de 15s em leituras. Ainda medir lentidao real.

## Firebase e arquivos locais

- Export recebido: `C:/Users/eliau/Downloads/oradoress2-default-rtdb-export.json`.
- Copia preparada: `C:/Users/eliau/Downloads/oradoress2-export-ajustado.json`.
- Original preservado. A copia remove `secretario`, `programacao` (Vida e
  Ministerio) e o documento de Oradores em `agenda/documentos`. Nao havia raiz
  `oradores` no export. Demais cadastros, usuarios e dados foram preservados.
- Usuario identificou TPL `m_30985d99` como Eliaudrey Conceicao Santos.
  Na copia, masterId vinculado a `m_3fa99d9d` e snapshots correspondentes ajustados.
- Ultimo PDF baixado ja mostra Eliaudrey. Nao assumir por isso que toda a copia
  foi importada: o agente NAO fez importacao nem escrita no Firebase online.
- TPL `m_b6bca401` ainda sem identidade (Joao Alves, 08h, repetido na dupla).
  Nao adivinhar. Usuario considera os dados de teste, nao bloquear o layout nisso.
- Tarefas tem dois registros em 26/09/2026, weekend e weekend_merged.
  Usuario declarou irrelevante por ser teste; foram mantidos.
- Scripts novos: `scripts/prepare-firebase-export.mjs` cria copia sem sobrescrever;
  `scripts/validate-firebase-pdfs.mjs` audita export e gera PDFs localmente.
- Exemplo: `node scripts/validate-firebase-pdfs.mjs caminho.json 2026-09`.
- Artefatos: `output/firebase-pdfs/`; auditoria visual Downloads: `tmp/pdfs/download-review/`.
- Exports contem sessoes/dados privados: nao versionar, servir publicamente ou
  enviar a terceiros. Importacao futura exige backup fresco, escopo e aprovacao;
  mesclar nao remove ramos ausentes, substituir raiz pode perder dados recentes.

## Validacao futura e encerramento

- Depois de autorizar codigo: `npm run test:all`, `npm run build`, testes de
  navegador pertinentes e `git diff --check`; nao presumir aprovacao da suite
  completa atual apenas com base nas rodadas antigas.
- Revalidar Voltar sem reload em todos os modulos e em celular/desktop.
- Validar publicacao, retirada/reabertura, download e documentos manuais do Admin.
- Medir latencia real de Functions/Firebase e verificar concorrencia de edicoes.
- Por ultimo, homologar PWA offline/reconexao e ICS Google/Android/Apple:
  America/Fortaleza, identidade isolada, somente publicados, atualizacao no mesmo
  link, duas instalacoes, revogacao independente e remocao de links temporarios.
- Servico de Campo: ICS pessoal apenas para dirigente; Quadro sem alarme coletivo.
- Commit/deploy dos ajustes locais segue pendente e aguarda nova autorizacao.
