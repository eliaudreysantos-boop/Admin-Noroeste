# Comparativo Tarefas antigo vs novo

Este documento lista o que existia no Tarefas antigo e ainda nao voltou, ou
voltou mais fraco, no modulo atual. Ele serve como guia de fechamento do
Tarefas antes de passar para Escala TPL e Minha Agenda.

Referencia antiga estudada:
`C:\Users\eliau\Downloads\admin-spa\fazer commit, projeto base antigo\tarefas-e-oradores Nao quero mais duas seçoes\src\modules\tarefas`

Referencia nova estudada:

- `src/modules/tarefas.ts`
- `src/modules/tarefas-domain.ts`
- `src/modules/tarefas-documents.ts`

## Decisoes ja tomadas

- Nao voltar com duas secoes. Noroeste nao usa sala/secoes B/C nesse fluxo.
- Nao voltar com WhatsApp individual dentro de Tarefas. Avisos pessoais vao
  para Minha Agenda; mensagem coletiva vai para Quadro de Anuncios.
- Nao voltar com configuracao de limpeza dentro de Tarefas. Limpeza ja e modulo
  proprio e Tarefas deve apenas expor/consumir dados quando necessario.
- Nome, ID e telefone continuam vindo apenas do Admin por `masterId`.
- Todo PDF precisa ter previa obrigatoria antes de imprimir/baixar.

## O que o antigo tinha e o novo ainda nao tem

### 1. Tela de configuracoes de planejamento

No antigo havia uma tela dedicada para planejamento do Tarefas:

- modo mensal/bimestral;
- dias de reuniao;
- datas excluidas;
- horario por tipo de reuniao;
- preferencia de fonte da impressao;
- previa do efeito das configuracoes antes de salvar.

No novo, o periodo mensal/bimestral existe na tela de escala e a fonte existe em
`localStorage`, mas falta uma area de configuracao clara para revisar
planejamento, datas excluidas e preferencia de impressao em um lugar so.

Aplicar:

- criar ou reaproveitar uma area de configuracoes enxuta dentro de Tarefas;
- manter horarios principais vindos da configuracao global da congregacao;
- permitir datas excluidas do periodo;
- manter fonte preferida da impressao com controle visual;
- nao incluir configuracao de limpeza nem secoes.

### 2. Previa obrigatoria do PDF/impressao

O antigo usava documento de impressao com portal e ajuste de fonte pensado para
cabimento. O novo chama `printTaskSchedule` e dispara `window.print()` direto.

Aplicar:

- gerar previa antes da impressao;
- mostrar o documento em modal/painel;
- manter botoes de imprimir/baixar apenas depois da previa;
- usar o mesmo conteudo da previa na saida final;
- preservar ajuste de fonte preferida.

### 3. Layout de impressao mais forte

O antigo tinha uma tabela unica em retrato, separada por blocos de reuniao, com
cabecalho por parte e colunas fixas das funcoes. O novo imprime cards por
reuniao, com uma tabela vertical por data.

Aplicar:

- avaliar trocar a saida do Tarefas para tabela por periodo;
- separar visualmente Meio de semana e Fim de semana;
- manter colunas das funcoes mecanicas quando couber;
- reduzir repeticao de textos na folha;
- preservar leitura em uma pagina quando possivel.

### 4. Visual desktop da escala

O antigo tinha cards no mobile e tabela no desktop. O novo esta mais baseado em
cards, o que e bom no celular, mas piora leitura e comparacao em tela grande.

Aplicar:

- manter cards no mobile;
- adicionar tabela responsiva no desktop;
- manter os mesmos editores de pessoa nas duas formas;
- destacar travado, pendente e conflito sem aumentar altura da linha.

### 5. Editor de escolha manual mais completo

O antigo usava seletor com detalhe e aviso de conflito, preservando a decisao
manual. O novo ja avisa conflito e pede confirmacao, mas o seletor ainda e mais
simples.

Aplicar:

- mostrar no seletor informacoes uteis: elegivel, motivo de conflito, ultima
  designacao e total recente quando disponivel;
- manter a possibilidade de salvar escolha manual mesmo com alerta;
- nao bloquear edicao/apagar porque a pessoa ja foi usada, apenas avisar.

### 6. Registros preservados fora do planejamento atual

O antigo calculava reunioes antigas ou fora do planejamento atual como
`staleMeetings` e mostrava que estavam preservadas, sem mistura-las na geracao.
No novo, a tela foca no periodo canonico e pode esconder registros que ainda
existem no banco.

Aplicar:

- detectar registros do periodo que nao pertencem mais ao planejamento atual;
- mostrar bloco "Registros preservados";
- nao apagar automaticamente;
- nao incluir esses registros na geracao nem no PDF principal.

### 7. Pendencias com horizonte e severidade

O antigo tinha pendencias mais ricas:

- horizonte futuro configurado;
- pendencia de planejamento ausente;
- escala nao gerada agregada por periodo;
- reunioes incompletas com lista de funcoes faltantes;
- pessoa inativa ainda escalada;
- pessoa sem telefone;
- alvo direto para a tela correta.

O novo ja mostra pendencias acionaveis, mas ainda falta severidade, contagem e
agrupamento mais util.

Aplicar:

- padronizar severidade `alta`, `media`, `baixa`;
- mostrar contadores por severidade;
- agregar escala nao gerada por periodo, nao repetir uma linha por data;
- incluir planejamento ausente/datas sem reuniao quando aplicavel;
- manter "pessoa sem telefone" como aviso de integridade do Admin, nao como
  bloqueio de Tarefas;
- incluir "pessoa inativa ainda escalada";
- manter acao direta para escala ou participante.

### 8. Participantes com resumo operacional

O antigo mostrava contagem de designacoes recentes, status ativo, regra de
reuniao e papeis de forma mais visivel. O novo ja vincula ao Admin e permite
configurar funcoes, regra, folga e indisponibilidades, mas pode ficar mais claro.

Aplicar:

- mostrar total dos ultimos 180 dias por participante;
- mostrar ultima designacao por funcao principal quando viavel;
- destacar `ativo=false` diferente de `regra=none`;
- manter indisponibilidades, que sao melhoria do novo;
- avaliar botao de inativar/reactivar mais direto;
- evitar duplicar cadastro local de nome/telefone.

### 9. Validacao de exclusao/inativacao

O antigo bloqueava exclusao quando a pessoa ainda era referenciada em escala ou
Oradores e sugeria inativar. No novo, o cadastro central mudou a regra, mas a
logica de integridade ainda e util.

Aplicar:

- se houver remocao de participante local do Tarefas, validar referencias antes;
- preferir inativar/desvincular do modulo a apagar historico;
- deixar exclusao real de pessoa apenas no Admin.

### 10. Configuracao de mensagens que deve migrar

O antigo tinha:

- mensagem individual por pessoa;
- mensagem do dia para grupo;
- link configuravel de WhatsApp;
- textos/prefixos editaveis;
- previa do texto antes de enviar;
- registro de avisado.

Isto nao deve voltar para Tarefas como envio por reuniao. Deve virar insumo para
Minha Agenda/Quadro:

- Tarefas expõe eventos com data, horario, funcao, pessoa e status;
- Quadro monta texto coletivo filtrado;
- Minha Agenda monta texto individual;
- link de grupo fica em configuracao central do Quadro/Admin;
- registro de aviso individual, se existir, pertence a Minha Agenda/Quadro.

## Padroes do novo que devem permanecer

- `masterId` como vinculo central de pessoa.
- Nome/telefone somente do Admin.
- Indisponibilidades por pessoa.
- Geração preservando edicoes manuais.
- Confirmacao antes de salvar conflito manual.
- Geracao por funcao ou escala completa.
- Trava/destrava do periodo.
- Filtro "apenas datas pendentes".

## Fases de aplicacao

### Fase 1 - Documento e pendencias

- [x] Criar previa obrigatoria para impressao/PDF de Tarefas.
- [x] Padronizar severidade/contagem das pendencias.
- [x] Adicionar pendencia de pessoa inativa ainda escalada.
- [x] Agregar periodo sem escala gerada.

Aplicado em:

- `src/modules/tarefas.ts`
- `src/modules/tarefas-documents.ts`
- `src/style.css`

### Fase 2 - Escala em tela

- Adicionar visual de tabela para desktop.
- Manter cards no mobile.
- Melhorar seletor manual com detalhe de elegibilidade/conflito.
- Mostrar bloco de registros preservados fora do planejamento.

### Fase 3 - Configuracoes enxutas

- Criar area de configuracao do Tarefas sem limpeza e sem secoes.
- Expor periodo, datas excluidas e fonte preferida.
- Confirmar que horarios continuam vindo da configuracao global.

### Fase 4 - Participantes

- Melhorar resumo de participante com total recente e ultima designacao.
- Tornar inativar/reactivar mais evidente.
- Validar remocao/desvinculo sem apagar historico.

### Fase 5 - Adapter para Minha Agenda/Quadro

- Exportar eventos publicos de Tarefas por `masterId`.
- Incluir data, horario, tipo de reuniao, funcao, status e origem.
- Preparar campos para ICS com lembretes default `P7D` e `P1D`.
- Nao expor observacoes administrativas.

### Fase 6 - Testes e fechamento

- Testar geracao preservando manual.
- Testar conflitos de escolha manual.
- Testar pendencias por severidade.
- Testar previa antes da impressao.
- Atualizar `PADROES-REAPROVEITAVEIS.md` com componentes realmente extraiveis.
