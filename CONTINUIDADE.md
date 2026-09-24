# Continuidade - Noroeste Admin SPA

Atualizado em 23/09/2026. Use este arquivo como o
ponto de partida para novas ideias ou alteracoes.

## Estado atual

- Ultimo commit de implementacao: `1e88f62` (pendencias, ajuda nos campos e celular).
- Branch de trabalho: `codex/ajustar-pdfs-a4`.
- Em 23/09, o usuario autorizou explicitamente push no Git principal. Executado
  `git push origin HEAD:main`: `origin/main` avancou de `c93758d` para `1e88f62`,
  com 19 commits, sem force. O deploy de producao NAO foi verificado.
- Antes disso, o usuario suspendeu pushes em testes por limite de creditos
  Netlify. Ultimo push conhecido em testes: `73de347`; commits posteriores
  foram apenas locais ate a autorizacao acima. Nao presumir testes atualizado.
- A autorizacao de push no principal foi atendida; nao a tratar como permissao
  permanente para novos deploys. Para novas tarefas, commit local e aguardar
  autorizacao de push/destino. Esta atualizacao documental nao foi commitada.
- `origin` (Admin-Noroeste) e `teste` (Noroeste-testes) sao dois remotos do mesmo
  repositorio; nao sao dois commits independentes. Nao mover a main local antiga.
- Testes: https://noroeste-testes.netlify.app/
- Producao: https://admin-noroeste.netlify.app/ (nao publicar sem autorizacao
  explicita do usuario).
- Pasta de trabalho correta: `C:/Users/eliau/.codex/worktrees/pdf-a4/admin-spa`.
  `C:/Users/eliau/Downloads/admin-spa` e um checkout antigo: preservar e nao usar
  como fonte da versao atual.
- Preview usado: http://127.0.0.1:5191/ a partir do worktree correto. Se parado,
  executar `npm run dev -- --host 127.0.0.1 --port 5191` nessa pasta. Nao presumir
  que o processo permanece ativo depois de reiniciar o ambiente.

## Entregas recentes

- Cadastro de oradores locais vinculado ao Admin por masterId; identidade central
  prevalece. Repertorio editavel por numeros separados por virgulas (`1, 25, 38`).
  Card mostra os numeros, nunca a quantidade; contato/habilitacoes em detalhes.
- Temas inicia com Livres; filtros Livres/Ja usados/Programados/Todos e PDF da
  lista filtrada com ultima/proxima data. Programacao futura ocupa o tema.
- Substituicoes tem PDF e nao tem seletor "Data do discurso". Abertura geral
  lista repertorios; atalho da programacao conserva a data para verificar conflitos.
- Entrada de Oradores: Pendencias dos proximos 90 dias, um item por programacao,
  levando diretamente a acao/campo. Apoio passou a Mais opcoes.
- Mensagens do app antigo sao o padrao (codigo em
  `C:/Users/eliau/Downloads/tarefas-e-oradores s1 s2/src/shared/messaging/builders.ts`).
  Emojis, saudacao, rodape, segundo orador e Sentinela restaurados; confirmacao
  pergunta "Pode confirmar?"; intercambios separam Convites e Saidas.
- Sentinela: um dirigente e um substituto locais ativos distintos, S2/sem secao;
  discurso LOCAL do dirigente (inclusive segundo orador) gera substituicao na
  mensagem do substituto. Mensagem so de Sentinela nao recebe rodape de discurso.
- Congregacoes: enviar datas livres com horizonte 90/180/365 dias e selecao;
  respeita programacao local, eventos e exclusoes. Saidas nao ocupam a reuniao.
- Tarefas: mensagens por pessoa e dia, previa editavel/copiar/abrir WhatsApp.
  Limpeza inclui grupo da escala gerada quando disponivel e permitido.
- WhatsApp usa endereco escrito (`localizacao`), nunca `mapa`, Plus Code ou
  coordenadas. Localizacao de mapa fica apenas no ICS. Telefone com DDD aceita
  10/11 digitos, adicionando 55 na abertura; nao modifica cadastro automaticamente.
- Texto padrao anterior exato migra em memoria; templates personalizados sao
  preservados. Abrir WhatsApp nao significa mensagem enviada nem confirmada.
- Melhorias aprovadas 1/7/8: pendencias com destino preciso, ajuda curta e celular.
  Tarefas abre funcao; TPL abre participante/horario; Admin abre telefone por ID;
  Campo destaca impedimentos reais de publicacao; Limpeza revela configuracao.
  Escala bloqueada leva a Reabrir para edicao sem desbloquear automaticamente.
- Celular: alvos de toque maiores, campos legiveis, acoes quebram linha e modais
  rolam. Nao foram implementadas as demais sugestoes 2 a 6 como novo escopo.
- Referencias detalhadas: `COMPARACAO-MENSAGENS.md`, `REVISAO-USABILIDADE.md`
  e `REVISAO-ORADORES.md`. As secoes historicas podem descrever estados anteriores.

## Produto consolidado

- Modulos ativos: Admin, Tarefas, Oradores, Limpeza, Escala TPL, Servico de Campo
  e Minha Agenda. Secretario e Vida e Ministerio continuam fora do aplicativo.
- Oradores usa `tarefas/discursos`. Ha apenas uma secao: a antiga S2. Registros
  sem secao sao aceitos; S1 e apenas legado ignorado. Nao recriar seletores S1/S2.
- Tarefas possui regra opcional para evitar conflitos com Oradores por vinculo
  cadastral (pessoaId/masterId), incluindo segundo orador e registros sem secao.
- Navegacao: sem topbar; manter a bottombar azul com Voltar e Sair. As abas dos
  modulos retornam de forma previsivel sem recarregar a pagina.
- PDFs: baixar e publicar no Quadro sao acoes separadas. Os documentos
  usam formato A4. Oradores usa paisagem, datas DD/MM e saidas do mes em diante.
  NUNCA imprimir informacoes administrativas: status, regras, conflitos e
  historico ficam no app, preferencialmente como badges, ocultos na impressao.
  O endereco de Oradores usa `localizacao`, nao `observacoes`.
- Minha Agenda: mantem Pessoal, Geral e Quadro; ICS avulso continua disponivel.
  Assinaturas foram retiradas da interface e da logica. Endpoints `calendar` e
  `calendar-subscriptions` retornam HTTP 410, sem consultar o banco. Registros
  antigos privados foram preservados; nao reintroduzir assinaturas.
- Minha Agenda simplificada: filtros de origem/status e datas passadas foram
  removidos. Botoes WhatsApp foram removidos somente da Minha Agenda.
  Sugestao de instalacao aparece no navegador e fica oculta no modo instalado.
  Pareamento e desbloqueio de pessoa permanecem.
- Controles Anterior/Proximo padronizados nos seletores mensais.
- Oradores alimenta Agenda pessoal, Quadro e ICS com programacoes confirmadas.
  Visitantes aparecem no Quadro; agenda pessoal exige vinculo, nao nome parecido.
- Historico de inclusoes, alteracoes e retiradas: localStorage por pessoa/aparelho,
  ate 100 registros, desde a primeira sincronizacao bem-sucedida. Nao e auditoria
  central nem altera eventos ja importados. Retirada pode ser reatribuicao.
- Nao adicionar botao "Atualizar agora": usuario recusou. Cache de ate 24h
  permanece; ainda pode atrasar deteccao de mudancas. Nao prometer tempo real.
- Congregacoes: `localizacao` = endereco de impressao; `mapa` = campo opcional
  com HTTPS, Plus Code com cidade ou latitude, longitude. `agenda-location.ts`
  limpa entidades HTML como &#x20; e gera link. ICS usa LOCATION, URL, link na
  descricao e GEO quando coordenadas validas foram informadas. Nao geocodifica
  automaticamente nem garante qual aplicativo de mapas o aparelho abrira.
- Importacao ICS nao e sincronizacao: reimportar pode duplicar ou nao atualizar.
  Orientacao: calendario separado Noroeste e substituir manualmente o periodo.
- PWA: cache offline, reconexao, isolamento por instalacao e service worker
  bloqueado foram cobertos por testes automatizados.
- Desempenho: o motor de PDF e carregado somente quando um PDF e solicitado.

## Validacao concluida

- Ultima implementacao: `npm run test:all`, `npm run build` e
  `git diff --check` passaram.
- Testes de navegador 1280px/390px: `pending-guidance-browser.mjs`,
  `oradores-browser.mjs`, `messages-browser.mjs` e `usability-browser.mjs`.
  Incluem foco no campo correto, escala bloqueada, Admin/telefone, configuracoes
  recolhidas, mensagens, repertorio e permissoes sem Admin. APIs simuladas;
  nenhum envio real de WhatsApp nem escrita no banco real nesses testes.
- Navegador: Agenda, PWA, navegacao, falhas de salvamento, publicacao/download
  e PDFs foram validados em desktop e celular com APIs simuladas.
- Testes de navegador anteriores usaram APIs simuladas; nao equivalem a teste
  de importacao em calendario real. Conferencia visual final dos PDFs pendente.

## Convencoes importantes

- Cadastro central em `master/pessoas`; vinculos usam `masterId`.
- Preservar permissoes, disponibilidade, habilitacoes, bloqueios de periodos
  publicados, edicoes manuais e isolamento entre pessoas.
- Limpeza usa grupos proprios. Servico de Campo permite varias saidas no mesmo
  dia. Mensagens e links WhatsApp pertencem a cada modulo.
- O backend/Firebase de testes nao e sandbox: salvar e publicar pode gravar dados
  online. Nao importar exportacoes nem alterar dados reais sem autorizacao.
- Antes de novo commit/deploy, executar testes proporcionais a mudanca, build e
  `git diff --check`. Publicar somente no destino autorizado.

## Arquivos locais fora do Git

- `output/` e `tmp/`: artefatos e possiveis dados pessoais; nao versionar.
- `scripts/prepare-firebase-export.mjs`: script local com referencias pessoais;
  manter fora do Git, salvo pedido explicito para revisa-lo e versiona-lo.

## Ideias futuras

- Revisao dos motores de Escala TPL e Tarefas concluida: TPL tem duas
  preferencias liga/desliga (prioridade de pioneiro e equilibrio); Tarefas tem
  quatro (conflito com Oradores, segunda tarefa do presidente, equilibrio e
  repeticao de funcao). Os responsaveis com acesso ao respectivo modulo podem
  configurá-las. Cada tela lista as restricoes fixas sem liga/desliga:
  disponibilidade, vinculos/identidade, bloqueios e incompatibilidades reais.
  Elas foram mantidas para nao gerar escalas invalidas; restricoes individuais
  opcionais continuam configuradas no cadastro da pessoa.
- Esclarecimento operacional: escala parcial e valida. Tarefas gera com as
  pessoas disponiveis e deixa funcoes sem candidato vazias; horario vago nao
  e pendencia. As pendencias de Tarefas e TPL priorizam revisar a
  disponibilidade e preparar a escala do proximo mes antes do dia 1. Conflitos
  reais de designacao continuam sendo apontados.

### Commits recentes e pontos para continuidade

- `1e88f62`: pendencias direcionadas, ajuda nos campos e ajustes de celular.
- `aeb48ec`: padrao antigo de mensagens em Oradores e Tarefas.
- `935fb87`: mensagem detalhada com emojis e endereco.
- `a39fa1f`: retirada do seletor de data de Substituicoes.
- `73de347`: Pendencias 90 dias, Mais opcoes, repertorio e filtros/PDF de temas.
- `25db9cf`: usabilidade, protecao de edicao e estados de publicacao.
- `65cd773`: disponibilidade de temas e relatorios de Oradores.
- `05bcc06`: identidade master e repertorio numerico.

- `b07d139`: Oradores na Agenda e padronizacao visual.
- `60dbae6`: retirada de assinaturas; compatibilidade com secao unica.
- `21b0918`: historico local de alteracoes da Agenda.
- `c340675`: conflitos da secao unica, validacao de historico, gravacoes
  condicionais em Oradores/Campo e publicacao de Limpeza/TPL; badges no app.
- `81d94b7`: endereco separado de mapa e exportacao ICS com localizacao.
- Revisar ainda publicacao concorrente: PDF e banco sao operacoes separadas;
  gravacao condicional nao torna upload/rollback uma transacao unica.
- Conferir baseline bruto de Oradores depois de confirmar/reconfirmar no mesmo
  carregamento; edicao condicional pode exigir recarregar apos essas operacoes.
- Localizacao ICS de Oradores depende do ID da congregacao destino/local.
  Revisar fallback de programacoes locais sem ID, sem usar origem visitante.
- Validar mapa em Android/iPhone e PDF visualmente. Nao alegar validacao fisica.
- Padronizacao completa de acoes e estados de publicacao ainda nao foi concluida.

### Dados de referencia preservados

- Downloads: `banco do app velho.json` e `Banco do app novo.json`.
- Arquivo reconciliado: `C:/Users/eliau/Downloads/Banco do app novo - Oradores S2 validado.json`.
  Antigo prevalece; 55 programacoes S2. Nao importar automaticamente no Firebase.

O projeto esta pronto para receber novas ideias em outro chat. Comece por este
arquivo, leia o modulo relacionado e proponha uma mudanca pequena e verificavel.
Pendencias que exigem validacao humana, mas nao bloqueiam novas ideias: uso com
dados reais no celular, instalacao PWA em aparelho fisico e importacao de ICS em
um calendario real com fuso `America/Fortaleza`.
