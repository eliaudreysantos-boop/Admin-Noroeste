# Integracao Limpeza, Lembretes e Quadro de Anuncios

## Decisao de produto

Os modulos operacionais deixam de ser canais de envio de mensagens por reuniao. Eles continuam sendo donos do cadastro, da escala, da programacao e dos documentos, mas nao abrem WhatsApp para avisar cada reuniao.

O app Minha Agenda passa a concentrar:

- agenda pessoal da pessoa selecionada;
- relatorio pessoal e ano de servico;
- quadro de anuncios com todas as designacoes e avisos das reunioes.

Essa decisao vale para Limpeza, Tarefas e Oradores. Vida e Ministerio ja foi conduzido nessa direcao e deve servir como referencia.

## Fontes confirmadas

- Pessoas, ID canonico e telefone continuam vindo somente do Admin em `master/pessoas`.
- Limpeza continua lendo configuracao em `master/config/limpeza`.
- Escalas geradas de Limpeza continuam em `limpeza/periodos`.
- Minha Agenda agrega os dados prontos; ela nao recalcula escala de Limpeza.
- PDF antigo de referencia visual: `C:\Users\eliau\Downloads\admin-spa\fazer commit, projeto base antigo\LIMPEZA SALAO SETEMBRO E OUTUBRO.pdf`.

## Limpeza: nova regra

### Manter

- Rotacao ativa.
- Inicio da rotacao.
- Escala mensal ou bimestral.
- Geracao por data da reuniao do meio de semana e fechamento na reuniao do fim de semana.
- Opcao de aproveitar grupos de servico de campo.
- Quando usar grupos de servico, nomes e membros vem do Secretario e ficam somente leitura na Limpeza.
- Quando nao usar grupos de servico, a Limpeza ainda pode manter grupos proprios.
- PDF separado da escala.

### Remover

- Campo `coordenadorMid`.
- Tela/fluxo de texto para publicar em Tarefas.
- Texto padrao.
- Texto de instrucao por grupo.
- Datas de aprovacao de texto.
- Botoes e logicas de aprovacao.
- Regra que exige texto aprovado para aparecer em publicacao.

### Ajustar nomes

- Trocar "Coordenador" por nada no app de Limpeza.
- Se for necessario um responsavel administrativo no futuro, criar como campo novo e neutro: `responsavelMid`.
- Por agora, a decisao e remover o campo.

## Tarefas: nova regra

### Manter

- Cadastro/geracao/edicao das designacoes.
- PDF/documentos da escala.
- Confirmacoes internas quando forem parte da propria escala.
- Leitura de telefone somente do Admin quando precisar exibir dado pessoal.

### Remover

- Tela de "Mensagens" por reuniao.
- Rascunho individual para WhatsApp dentro de Tarefas.
- Rascunho da reuniao para grupo de WhatsApp dentro de Tarefas.
- `whatsappGroupLink` das configuracoes de Tarefas, se ele existir apenas para esse envio.
- Prefixos de mensagem em `settings.messages`, se servirem apenas para WhatsApp.
- Marcas de "avisado/aberto" usadas exclusivamente pelo envio antigo.

### Migrar para Minha Agenda

- Cada designacao de Tarefas deve virar evento pessoal na agenda da pessoa.
- Cada reuniao/designacao deve aparecer no Quadro de anuncios quando a pessoa abrir a tela publica.
- O quadro deve mostrar o necessario para a congregacao visualizar: data, tipo de reuniao, funcoes e nomes.

## Oradores: nova regra

### Manter

- Cadastro de oradores.
- Congregacoes.
- Temas.
- Programacao.
- Confirmacao/reconfirmacao como status administrativo.
- PDFs/ICS que nao dependam de envio por WhatsApp, se ainda fizerem sentido.

### Remover

- Botao WhatsApp em programacao.
- Mensagem de designacao do orador.
- Mensagem de intercambio.
- Envio de datas livres por WhatsApp.
- Registro `avisadoEm` quando existir apenas para controlar mensagem enviada.

### Migrar para Minha Agenda

- Discursos locais, visitantes e saidas entram como eventos pessoais.
- O Quadro de anuncios mostra programacao de discursos, confirmados e a confirmar, sem expor telefone.
- Dados de contato de congregacao ficam no Oradores para administracao, nao no quadro publico, salvo decisao posterior.

## Minha Agenda: destino final dos avisos

### Tela 1: Agenda pessoal

- Mostra apenas eventos da pessoa selecionada.
- Usa seletor/trava local de pessoa ativa.
- Eventos devem vir de Tarefas, Limpeza, Escala TPL, Oradores e Vida e Ministerio.
- Pode manter exportacao ICS e compartilhamento da propria agenda, desde que seja da pessoa, nao do modulo administrativo.

### Tela 2: Relatorio e ano de servico

- Mantem envio de relatorio pessoal.
- Mostra progresso do ano de servico.
- Esse fluxo escreve apenas o que for explicitamente permitido para relatorio.

### Tela 3: Quadro de anuncios

- Lista todas as designacoes de todas as reunioes.
- Funciona como mural de consulta, nao como ferramenta de envio.
- Filtros esperados:
  - mes;
  - origem/modulo;
  - status.
- Nao expor telefone no quadro.
- Nao exigir login.
- Usar nomes vindos do Admin, resolvidos por `masterId`.

## Fases de implementacao

## Microdecisoes fechadas

### Identidade e telefone

- O Admin continua sendo a unica fonte de pessoa, ID canonico e telefone.
- Modulos operacionais podem exibir nome e vinculo, mas nao editam telefone.
- Quadro de anuncios nunca mostra telefone.
- WhatsApp individual fica fora dos modulos operacionais.
- Compartilhar a propria agenda ainda pode existir no Minha Agenda, porque e acao da pessoa sobre a propria lista.

### Status apos remover mensagens

- `avisado`, `avisadoEm`, `avisados` e equivalentes deixam de significar confirmacao.
- Confirmacao continua existindo somente quando for status administrativo real:
  - Tarefas: escala completa/incompleta e designacoes preenchidas.
  - Oradores: `confirmacao.status`, `reconfirmacao.status`, `status`.
  - Vida e Ministerio: `confirmedAt`, substituto, realizado, ausencia.
- Evento sem mensagem enviada nao e pendencia.
- Pendencia deve ser falta de dado, conflito, pessoa inativa, designacao vazia ou confirmacao administrativa ausente.

### Publicacao dos avisos

- Nenhum modulo "envia" aviso para reuniao.
- O Quadro de anuncios e uma visualizacao derivada dos dados ja salvos.
- Nao criar uma tabela nova de anuncios neste momento.
- O Quadro consolida em tempo de leitura usando `collectAnnouncementEvents`.
- Se depois precisarmos de mural congelado/publicado, criar uma etapa propria de "publicar quadro", mas nao agora.

### Compatibilidade com dados antigos

- Campos antigos podem continuar no Firebase sem quebrar leitura.
- Ao salvar uma configuracao nova, o modulo nao deve regravar campos removidos.
- Ao renderizar, o app deve ignorar campos antigos.
- Testes devem validar ausencia dos campos novos removidos nos objetos gerados.

### Ordem tecnica recomendada

- Primeiro remover geracao/envio de mensagens em Tarefas.
- Depois remover WhatsApp e avisos em Oradores.
- Por ultimo ajustar o Quadro para cobrir qualquer informacao que sumiu das telas antigas.
- Build completo so depois de cada modulo passar seus testes locais.

### Fase 1 - Limpeza enxuta

- [x] Corrigir listener solto no fim de `src/modules/limpeza.ts`.
- [x] Remover aba `Texto`.
- [x] Remover `cleaningTextForTasks`.
- [x] Remover textos e aprovacoes de `ConfigLimpeza`.
- [x] Remover textos e aprovacoes de `ConfigLimpezaGrupo`.
- [x] Remover `coordenadorMid` de configuracao, tela, tipos e testes.
- [x] Ajustar geracao da escala para gravar apenas datas, grupo, nome e pessoas.
- [x] Garantir que Minha Agenda continue lendo `limpeza/periodos`.
- [x] Atualizar testes de Limpeza.

### Fase 2 - PDF antigo da Limpeza

- [x] Importar o PDF antigo para `public/templates/`.
- [x] Renderizar/inspecionar o PDF para mapear layout.
- [x] Decidir se o app preenche o template antigo ou apenas replica o visual em PDF gerado.
- [x] Atualizar `limpeza-documents.ts`.
- [x] Testar PDF A4 e encaixe dos textos.

### Fase 3 - Remover mensagens de Tarefas

#### Microdecisoes de Tarefas

- Remover `mensagens` de `TarefasTab`.
- Remover card "Mensagens" do menu.
- Remover `renderMensagens`.
- Remover `messagePersonSelection`.
- Remover `TarefasSettings.whatsappGroupLink`.
- Remover `TarefasSettings.messages`.
- Remover importacoes de:
  - `buildTaskConfirmationMessage`;
  - `buildTaskDayMessage`;
  - `buildTaskPersonMessage`.
- Remover `buildPersonMessage`.
- Remover `buildDayMessage`.
- Remover `buildConfirmationMessage`.
- Remover `copyMessage`.
- Remover `markAssignmentsOpened`.
- Remover `saveMessageSettings`.
- Manter `formatTaskDate`, porque ainda serve para tela/PDF.
- Manter `avisados` apenas enquanto fizer parte de dados antigos, mas parar de escrever esse campo.
- Ao limpar escala, pode apagar `avisados` junto com `assignments` e `manualEdits`, porque e dado antigo da mesma escala.
- Ao limpar uma funcao, pode apagar `avisados/role` como limpeza de legado.
- `pending` nao deve exigir `avisados`.
- A agenda pessoal deve marcar designacoes de Tarefas como futuras quando estao preenchidas.
- Confirmacao pendente em Tarefas, por enquanto, deve significar "dado incompleto/conflito", nao "WhatsApp nao aberto".

#### Arquivos

- `src/modules/tarefas.ts`
- `src/modules/tarefas-output.ts`
- `src/modules/tarefas-domain.ts`
- `tests/tarefas-domain.test.mjs`

#### Checklist

- [x] Remover aba/tela de mensagens.
- [x] Remover botoes de WhatsApp.
- [x] Remover configuracao de link de grupo e prefixos.
- [x] Remover funcoes de montagem de mensagens.
- [x] Parar de escrever marcas de aviso por WhatsApp.
- [x] Revisar pendencias que dependem de `avisados`.
- [x] Preservar escala, participantes, pendencias e PDF.
- [x] Atualizar testes afetados.
- [x] Rodar `npm run test:tarefas`.
- [x] Rodar `npm run test:individual`.

### Fase 4 - Remover mensagens de Oradores

#### Microdecisoes de Oradores

- Remover listener `[data-programacao-whatsapp]`.
- Remover `sendProgramacaoWhatsApp`.
- Na Programacao, remover botao `WhatsApp`.
- Em "Designacoes por orador", manter a lista por orador, mas remover textarea de mensagem e botao `Abrir WhatsApp`.
- Remover `designationLines` se ficar sem uso.
- Remover `sendDesignationMessage`.
- Em "Intercambios", manter a lista de entradas/saidas e status, mas remover botao/mensagem de intercambio.
- Remover `openIntercambioMessage`.
- Em Congregacoes, manter cadastro de contato/telefone porque e dado administrativo de intercambio.
- Remover botao de "Enviar datas livres".
- Remover `sendAvailableDates`.
- Manter calculo de datas livres como ferramenta visual se ainda ajudar a planejar; se a unica acao era enviar WhatsApp, exibir apenas como lista.
- Remover exibicao "Avisado" em programacoes.
- Parar de escrever `programacao/{id}/avisadoEm`.
- Deixar `avisadoEm` antigo sem leitura ativa.
- Pendencias nao devem cobrar aviso enviado; devem cobrar orador, tema, congregacao, confirmacao/reconfirmacao e cadastro incompleto.

#### Arquivos

- `src/modules/oradores.ts`
- `src/modules/oradores-domain.ts`
- `tests/oradores-domain.test.mjs`
- `src/modules/individual-domain.ts`

#### Checklist

- [x] Remover envio WhatsApp de programacao.
- [x] Remover mensagem de designacao.
- [x] Remover mensagem de intercambio.
- [x] Remover envio de datas livres.
- [x] Remover leitura visual de `avisadoEm`.
- [x] Revisar pendencias/status para nao dependerem de mensagem enviada.
- [x] Garantir que Quadro de anuncios mostre discursos locais, visitantes e saidas.
- [x] Atualizar testes.
- [x] Rodar `npm run test:oradores`.
- [x] Rodar `npm run test:individual`.

### Fase 5 - Quadro de anuncios como fonte unica de consulta

#### Microdecisoes do Quadro

- O Quadro e leitura derivada, com botao para compartilhar no WhatsApp os itens filtrados.
- O compartilhamento nao escolhe telefone nem grupo automaticamente; abre o WhatsApp com o texto editavel e o administrador escolhe o destinatario.
- Usar `master/pessoas` para nome exibido.
- Exibir nomes agrupados por evento quando varias pessoas participam.
- Ordenar por data, horario e origem.
- Filtro de modulo permanece.
- Filtro de status permanece.
- Status visual:
  - `futuro`: designacao pronta;
  - `confirmacao-pendente`: falta confirmacao administrativa real;
  - `alterado`: substituto/troca;
  - `realizado`: registro historico.
- Nao mostrar telefones.
- Nao mostrar observacoes administrativas sensiveis.
- Notas publicas permitidas:
  - referencia/tema;
  - local;
  - grupo de limpeza;
  - sala principal quando aplicavel.

#### Conteudo por modulo

- Tarefas:
  - data;
  - tipo de reuniao;
  - funcao;
  - nome da pessoa.
- Limpeza:
  - data do meio de semana;
  - data do fim de semana se necessario;
  - grupo;
  - membros/responsaveis.
- Escala TPL:
  - data;
  - horario;
  - local;
  - dupla.
- Oradores:
  - data;
  - tipo: local, visitante ou saida;
  - orador;
  - tema;
  - congregacao apenas como origem/destino, sem telefone.
- Vida e Ministerio:
  - data;
  - parte;
  - pessoa;
  - ajudante/substituto/realizado quando aplicavel;
  - sala principal.

#### Checklist

- [x] Consolidar eventos de Tarefas, Limpeza, Escala TPL, Oradores e Vida e Ministerio.
- [x] Separar dados publicos de dados administrativos.
- [x] Ocultar telefone e informacoes privadas.
- [x] Mostrar designacoes por data, reuniao/modulo e status.
- [x] Conferir se Tarefas sem `avisados` nao fica toda como pendente.
- [x] Conferir se Oradores sem `avisadoEm` nao perde status real.
- [x] Validar a regra com dados de Admin de teste.

### Fase 6 - Limpeza final de dados e documentacao

#### Microdecisoes de documentacao

- Atualizar os `.md` da pasta antiga somente depois de cada modulo passar.
- Registrar que mensagens por reuniao foram aposentadas.
- Registrar que Minha Agenda/Quadro e a interface de consulta.
- Registrar padroes reaproveitaveis depois que o fluxo novo estabilizar.

#### Checklist

- [ ] Atualizar `Limpeza.md`.
- [ ] Atualizar `Minha-agenda.md`.
- [ ] Atualizar `Tarefas.md`.
- [ ] Atualizar `Oradores.md`.
- [ ] Registrar padroes reaproveitaveis em `PADROES-REAPROVEITAVEIS.md`.
- [ ] Rodar testes dos modulos afetados.
- [ ] Rodar build completo.

## Riscos

- Remover campos de texto pode afetar dados antigos ja salvos em `master/config/limpeza`; a leitura deve ignorar esses campos sem quebrar.
- Remover mensagens em Tarefas e Oradores pode deixar testes antigos esperando rascunho de WhatsApp.
- O Quadro de anuncios precisa ser publico o bastante para consulta, mas sem expor telefone.
- O PDF antigo pode estar como layout final visual, mas talvez nao seja fillable; se nao for, o melhor caminho e reproduzir o visual com `pdf-lib`.

## Criterio de pronto

- Limpeza gera escala e PDF sem texto/aprovacao/coordenador.
- Tarefas e Oradores nao possuem mais envio por WhatsApp por reuniao.
- Minha Agenda mostra os avisos/designacoes no quadro.
- Agenda pessoal continua correta.
- Nenhum modulo duplica pessoa, telefone ou identidade fora do Admin.
- Testes dos modulos afetados passam.
- Build completo passa.
