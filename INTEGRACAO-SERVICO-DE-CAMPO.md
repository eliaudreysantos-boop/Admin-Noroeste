# Integracao Servico de Campo

Este documento registra as decisoes e a implementacao do modulo Servico de
Campo. O modelo visual foi comparado com a programacao atual enviada em PDF; os
dados daquele arquivo sao apenas referencia e nao foram importados como dados
oficiais.

## Objetivo

O modulo administra as saidas de campo por data, horario e local, define o
dirigente e publica somente a versao revisada para Minha Agenda e Quadro de
Anuncios.

Regras centrais:

- podem existir varias saidas no mesmo dia e no mesmo horario;
- o rodizio aceita qualquer quantidade de dirigentes;
- o Admin continua sendo a unica fonte de pessoa, `masterId` e telefone;
- editar uma designacao manualmente nao deve ser desfeito ao completar o mes;
- meses publicados ficam bloqueados e podem ser reabertos de forma simples;
- Minha Agenda mostra a designacao pessoal do dirigente com lembrete;
- o Quadro mostra todas as saidas publicadas sem lembrete;
- o PDF e A4 retrato e sempre passa pela previa antes de baixar ou imprimir.

## Dados

Raiz: `servicoCampo`.

- `templates/{templateId}`: saida recorrente com dia da semana, horario, local,
  descricao, ordem e status ativo.
- `leaders/{masterId}`: pessoas habilitadas para o rodizio.
- `periods/{YYYY-MM}`: programacao mensal.
- `periods/{YYYY-MM}/assignments/{assignmentId}`: data, horario, local,
  descricao, `leaderId`, origem recorrente ou manual.
- `periods/{YYYY-MM}/published`: fronteira entre rascunho administrativo e
  dados publicos.

Uma saida recorrente que ja tenha historico e inativada em vez de apagada. Uma
saida manual existe apenas naquele mes. Nenhuma chave usa a data como
identificador unico, portanto o modelo nao limita a uma saida por dia.

## Rodizio

O gerador cria todas as ocorrencias ativas do mes e distribui dirigentes pelo
menor numero historico de designacoes. Em um dia com varias saidas, evita repetir
a mesma pessoa enquanto houver outra disponivel. A ordem e deterministica para
que gerar novamente nao produza trocas arbitrarias.

Ao completar um mes existente:

- designacoes editadas manualmente sao preservadas;
- saidas adicionadas manualmente sao preservadas;
- somente ocorrencias recorrentes ausentes sao acrescentadas;
- publicar exige dirigente em todas as saidas.

## Aproveitamento da Escala TPL

Dia, horario e local ativos da Escala TPL aparecem como sugestoes de
preenchimento na configuracao. Escolher uma sugestao nao grava nada sozinho; o
responsavel ainda revisa e salva a saida recorrente. Assim, os dois modulos nao
ficam acoplados e os horarios podem ser configurados depois.

## Minha Agenda, Quadro e ICS

O adapter le apenas meses publicados.

- agenda pessoal: cria evento somente para o `leaderId`, usando o lembrete
  configurado em `agenda/config/icsReminders/servicoCampo`;
- Quadro: cria um evento publico por saida, com data, horario, local, dirigente
  e origem, mas sem `VALARM`;
- assinatura do Quadro: permite incluir ou retirar Servico de Campo junto aos
  demais modulos;
- reabrir o mes retira os eventos das visoes publicas sem apagar a programacao.

## PDF

O documento segue a organizacao do modelo atual:

- A4 retrato;
- titulo da programacao e competencia;
- colunas Dia, Hora, Local e Dirigente;
- varias paginas quando necessario;
- previa obrigatoria com baixar e imprimir;
- depois da previa, registro publico em `agenda/documentos` para aparecer no
  card de PDFs da Minha Agenda.

## Integridade no Admin

A aba Vinculos inclui dirigentes habilitados e designacoes cujo `leaderId` nao
existe mais. A exclusao de uma pessoa e impedida quando ela ainda esta no rodizio
ou em uma programacao. O relatorio `.md` informa o caminho exato do registro e
continua omitindo senha e contatos.

## Fases aplicadas

### Fase 1 - Contrato e dominio

- [x] Definir dados sem limite de uma saida por dia.
- [x] Criar rodizio para quantidade variavel de dirigentes.
- [x] Preservar edicoes e saidas manuais.
- [x] Criar testes de dominio.

### Fase 2 - Configuracao

- [x] Cadastrar, editar, inativar e remover saidas recorrentes.
- [x] Selecionar dirigentes pelo cadastro central.
- [x] Oferecer sugestoes vindas da Escala TPL sem gravacao automatica.

### Fase 3 - Programacao mensal

- [x] Gerar/completar rodizio.
- [x] Permitir varias saidas no mesmo dia.
- [x] Permitir inclusao manual e troca de dirigente.
- [x] Publicar, bloquear e reabrir o mes.

### Fase 4 - Saidas publicas

- [x] Integrar agenda pessoal com lembrete do modulo.
- [x] Integrar Quadro e assinatura publica sem lembrete.
- [x] Ocultar rascunhos e meses reabertos.

### Fase 5 - Documento e fechamento

- [x] Gerar PDF A4 retrato com previa obrigatoria.
- [x] Publicar o PDF no registro de documentos do Quadro.
- [x] Integrar permissoes, navegacao, backup e auditoria de vinculos.
- [x] Validar dominio, PDF, Minha Agenda, feed ICS e build.

## Pendencias operacionais

Estas tarefas usam dados reais e nao bloqueiam o modulo de exemplo:

- configurar a lista oficial de saidas recorrentes;
- selecionar os dirigentes reais do rodizio;
- revisar e publicar o primeiro mes;
- conferir uma impressao fisica do PDF com a programacao real.
