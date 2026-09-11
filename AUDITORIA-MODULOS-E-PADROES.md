# Auditoria de modulos e padroes reaproveitaveis

Este documento organiza a avaliacao modulo a modulo antes do fechamento final
dos apps. Ele complementa `PADROES-REAPROVEITAVEIS.md` e os MDs de integracao
especificos.

Objetivo: para cada modulo, registrar o que pode ser reaproveitado nos outros,
o que ele deve importar dos outros modulos, e quais lacunas ainda precisam ser
resolvidas. A auditoria documental e as fases de fechamento foram aplicadas em
11/09/2026. As listas historicas de lacunas abaixo permanecem como justificativa
das mudancas; a matriz registra o estado final.

## Processo padrao de auditoria

Para cada modulo, seguir esta ordem:

1. Ler o MD atual do modulo, se existir.
2. Ler o codigo atual do modulo e dos arquivos `*-domain`/`*-documents`.
3. Comparar com o app antigo quando houver pasta/referencia antiga.
4. Registrar padroes exportaveis.
5. Registrar padroes importaveis.
6. Registrar lacunas para fechamento.
7. Implementar por fases pequenas.
8. Rodar testes do modulo e build.
9. Atualizar `PADROES-REAPROVEITAVEIS.md`.

## Matriz geral

| Modulo | Estado da auditoria | MD especifico | Prioridade |
|---|---|---|---|
| Secretario | Funcional e fechado com dados de exemplo | `INTEGRACAO-SECRETARIO.md` | Concluido |
| Minha Agenda | Tres telas, relatorio, quadro, PDFs e assinaturas ICS implementados | `INTEGRACAO-MINHA-AGENDA.md` | Concluido |
| Oradores | Nove fases aplicadas contra o app antigo | `COMPARATIVO-ORADORES-ANTIGO-VS-NOVO.md` | Concluido |
| Vida e Ministerio | Nove fases aplicadas | `INTEGRACAO-VIDA-E-MINISTERIO.md` | Concluido |
| Limpeza | Fluxo enxuto, PDF com previa e adapter publico | `INTEGRACAO-LIMPEZA-E-AVISOS.md` | Concluido |
| Tarefas | Seis fases aplicadas contra o app antigo | `COMPARATIVO-TAREFAS-ANTIGO-VS-NOVO.md` | Concluido |
| Escala TPL | Seis fases aplicadas e testes independentes do legado | `COMPARATIVO-ESCALA-TPL-ANTIGO-VS-NOVO.md` | Concluido |
| Admin/Mestre | Base central, integridade, backup e configuracao global | `AUDITORIA-ADMIN-MESTRE.md` | Concluido |
| Servico de Campo | Rodizio, publicacao, PDF e adapters implementados | `INTEGRACAO-SERVICO-DE-CAMPO.md` | Concluido |
| Coordenador | Removido da navegacao, Admin, tipos e testes | Registrado em `INTEGRACAO-VIDA-E-MINISTERIO.md` | Concluido |

## Resultado do fechamento

- Todos os PDFs ativos passam pela previa compartilhada antes de baixar ou imprimir.
- Tarefas e Escala TPL so aparecem publicamente depois da publicacao do periodo.
- Servico de Campo publica varias saidas por dia, com lembrete apenas na agenda
  pessoal do dirigente.
- Os avisos comuns sairam dos modulos donos e foram consolidados no Quadro.
- O Quadro usa o link de WhatsApp configurado no Admin e publica arquivos por periodo.
- Assinaturas pessoais e do Quadro usam token revogavel, sem `masterId` na URL.
- A funcao `calendar` gera ICS com UID estavel, timezone e lembretes configuraveis.
- A suite automatizada nao depende da pasta antiga que sera apagada.
- Dados reais, regras remotas e impressao fisica ficam para a rodada operacional
  solicitada pelo responsavel e nao sao lacunas de implementacao.

## Padroes transversais obrigatorios

- Identidade central por `masterId`.
- Nome, ID e telefone criados/editados apenas no Admin.
- Modulos operacionais consomem pessoas pelo cadastro central.
- Minha Agenda e Quadro nao recalculam escalas/designacoes.
- WhatsApp pessoal por reuniao deve partir da Minha Agenda/Quadro, nao dos
  modulos operacionais.
- WhatsApp administrativo pode permanecer no modulo dono quando for confirmacao,
  datas livres, relatorio ou fluxo de responsavel.
- Todo PDF deve ter previa antes de baixar/imprimir.
- Periodos devem ser persistentes por tela quando isso reduz retrabalho.
- Pendencias devem ter severidade, contagem e acao direta.
- ICS deve usar UID estavel, timezone `America/Fortaleza` e lembretes
  configuraveis por modulo.

## Servico de Campo

### Padroes que pode exportar

- Rodizio equilibrado com qualquer quantidade de pessoas.
- Varias ocorrencias no mesmo dia sem colisao de identificador.
- Geracao que preserva edicao e inclusao manual.
- Sugestao de configuracao a partir de outro modulo sem acoplamento de dados.

### Padroes que deve importar

- Pessoa e `masterId` exclusivamente do Admin.
- Periodo publicado/bloqueado com reabertura simples.
- Previa obrigatoria de PDF.
- Adapter publico e lembrete ICS configuravel da Minha Agenda.

### Estado da auditoria

Implementacao fechada em `INTEGRACAO-SERVICO-DE-CAMPO.md`. Restam somente a
configuracao das saidas e dirigentes reais e a conferencia da primeira
impressao fisica.

## Secretario

### Padroes que pode exportar

- Ciclo de competencia `em conferencia -> fechada -> reaberta`.
- Origem explicita do dado: pessoa/app vs lancamento administrativo.
- Badge de origem/revisao.
- Fila de pendencias derivada do cadastro ativo.
- Rascunho editavel de WhatsApp administrativo.
- Painel mensal sem PDF quando o documento oficial nao for necessario.
- Previa obrigatoria de PDF.
- Templates oficiais com substituicao opcional.
- Exportacao em lote por ZIP/Excel quando existem muitos registros.

### Padroes que deve importar

- `master person select` do Admin/Tarefas/Oradores/Vida e Ministerio.
- Periodo persistente usado em Limpeza/Oradores/Minha Agenda.
- Compartilhamento editavel sem telefone automatico quando for uso publico.
- Card expansivel de documentos por periodo planejado para Minha Agenda.

### Lacunas percebidas

- Validar na interface real o fluxo Admin: publicador, grupo, relatorio, fechar
  e reabrir competencia.
- Conferir com dados reais as previas S-21, S-88 e S-3.
- Confirmar se ZIP S-21 atende a impressao anual.
- Revisar quais documentos administrativos devem aparecer no card de PDFs da
  Minha Agenda/Quadro apenas como consulta, sem expor dados sensiveis.

### Estado da auditoria

Auditoria fechada. O modulo esta funcional no escopo planejado; falta validar
permissoes/regras Firebase, conferencia real com a conta Admin e saida dos
documentos/lotes com dados reais.

## Minha Agenda

### Padroes que pode exportar

- `public event adapter`: eventos prontos para agenda/quadro.
- Quadro derivado sem tabela nova.
- Compartilhamento editavel sem telefone automatico.
- Assinatura ICS por token.
- Lembretes ICS configuraveis por modulo.
- Card expansivel com calendario.
- Card expansivel de dados/reunioes com copiar e WhatsApp de grupo.
- Card expansivel de PDFs gerados por periodo.

### Padroes que deve importar

- Do Secretario: competencia fechada/reaberta, origem do relatorio e ano de
  servico.
- De Oradores: tipos local/visitante/saida, status de confirmacao e locais.
- De Vida e Ministerio: horario, sala principal, ajudante/substituto e status.
- De Limpeza: leitura de periodo gerado sem recalcular.
- De Tarefas: reuniao, funcao, pessoa designada e status.
- Da Escala TPL: local, horario, dupla e link de grupo configuravel.

### Lacunas fechadas

- Assinatura ICS possui URL estavel na Netlify Function e token revogavel.
- Download e feed ICS suportam `VALARM`.
- Quadro final usa cards expansíveis para calendário, texto, PDFs e assinatura.
- PDFs publicos sao listados por periodo sem incluir documentos administrativos.
- Link do grupo vem de `agenda/config/quadroWhatsAppLink`.
- Relatorio pessoal e bloqueio de mes fechado possuem testes de dominio.

### Estado da auditoria

Auditoria e implementacao fechadas com adapters dos cinco modulos, integracao
com o Secretario e configuracao global do Admin.

## Oradores

### Padroes que pode exportar

- Programacao unica com tipos de compromisso.
- Datas livres por congregacao.
- Separacao local/visitante/saida.
- Confirmacao e reconfirmacao.
- Pendencias por contexto com abertura direta do registro.
- Texto de emergencia/aprovados para copiar.
- Agenda de orador a partir de programacao real.

### Padroes que deve importar

- Previa obrigatoria de PDF do Secretario.
- Rascunho editavel de WhatsApp da Minha Agenda/Secretario, apenas para fluxos
  administrativos.
- Pendencias com severidade/contagem do padrao compartilhado.
- ICS com lembretes por modulo da Minha Agenda.
- Cards expansíveis/calendario para visualizar programacao no Quadro.

### Lacunas fechadas

- Previa obrigatoria antes dos PDFs ativos.
- WhatsApp administrativo para confirmacao, datas livres e intercambios.
- Filtros, cards operacionais, visitante manual e repertorio filtravel.
- Pendencias com contagem, severidade e filtro agrupado.

### Estado da auditoria

Auditoria fechada contra o app antigo e as nove fases aplicadas sem voltar para
duas secoes ou mensagens pessoais por reuniao.

## Vida e Ministerio

### Padroes que pode exportar

- Importacao oficial para dados estruturados.
- Mescla que preserva edicoes manuais.
- Sugestao baseada em permissao, historico e conflitos.
- Designacao com principal, ajudante, substituto, realizado, ausente e
  confirmado.
- Documentos por semana/periodo.
- Adapter rico para Minha Agenda e Quadro.

### Padroes que deve importar

- Previa obrigatoria de PDF do Secretario.
- Quadro/Minha Agenda como destino dos avisos pessoais.
- Lembretes ICS configuraveis por modulo.
- Period lifecycle se algum periodo precisar ser fechado futuramente.
- Cards expansíveis de documentos por periodo na Minha Agenda.

### Lacunas percebidas

- Conferir se lembretes comuns por WhatsApp dentro do modulo devem ser
  removidos/migrados para Quadro/Minha Agenda, mantendo apenas acao
  administrativa quando for confirmacao real.
- Garantir que sala B/C fique inativa/oculta para Noroeste.
- Validar documentos S-89/S-140 com previa obrigatoria.
- Garantir adapter com sala principal, horario, ajudante e substituto.
- Auditar visualmente o fluxo importacao -> ajustes -> documentos.
- Finalizar validacao de URL oficial JW.org, importacao semanal, preservacao em
  reimportacao e testes visuais dos documentos.

### Estado da auditoria

Auditoria fechada contra o app antigo. A maior lacuna nao e de direcao, e sim
de terminar checklist tecnico das fases 4, 5, 6, 7 e remover dependencias do
Coordenador depois que Minha Agenda cobrir o necessario.

## Limpeza

### Padroes que pode exportar

- Geracao mensal/bimestral por periodo persistido.
- Uso opcional dos grupos do Secretario sem copiar estrutura.
- Modo somente leitura para dados herdados.
- Separacao entre gerar escala e gerar PDF.
- Configuracao enxuta.
- Leitura pela Minha Agenda sem recalcular escala.

### Padroes que deve importar

- Previa obrigatoria de PDF.
- Card de PDFs por periodo na Minha Agenda.
- Lembrete ICS simples de `P1D`.
- Link/compartilhamento pelo Quadro, sem mensagens internas por reuniao.
- Period lifecycle se futuramente precisar travar periodo publicado.

### Lacunas percebidas

- Confirmar se PDFs de Limpeza ja usam previa obrigatoria.
- Garantir que mensagens antigas por reuniao foram removidas.
- Garantir que relacao com grupos do Secretario esta clara e somente leitura
  quando configurada.
- Expor eventos para Minha Agenda/Quadro sem dado administrativo.

### Estado da auditoria

Auditoria fechada. Limpeza ja teve a maior parte aplicada; faltam validacoes
finais de PDF/preview, documentacao antiga e adapter publico.

## Tarefas

### Padroes que pode exportar

- Geracao preservando escolha manual.
- Periodo mensal/bimestral com datas de reuniao.
- Funcoes e elegibilidade por pessoa.
- Conflitos antes de salvar escolha manual.
- Pendencias acionaveis por reuniao/funcao.
- Ajuste de fonte para PDF.
- Pessoa vinculada ao cadastro central.

### Padroes que deve importar

- Previa obrigatoria de PDF.
- Compartilhamento pessoal pelo Quadro/Minha Agenda, nao pelo modulo.
- Lembretes ICS por modulo: default `P7D` e `P1D` para designacoes de reuniao.
- Pendencias com severidade/contagem padronizadas.
- Card de calendario da Minha Agenda para visualizacao publica.
- Period lifecycle se houver publicacao/travamento final de escala.

### Lacunas fechadas

- Comparativo antigo vs novo aplicado nas seis fases.
- Previa, tabela desktop, cards mobile, configuracao enxuta e resumo operacional.
- Adapter publico condicionado a publicacao e sem observacao administrativa.
- Mensagens comuns removidas em favor de Minha Agenda/Quadro.

### Estado da auditoria

Auditoria fechada contra o app antigo e fases 1 a 6 concluidas.

### Fases de fechamento previstas

1. Documento/previa obrigatoria e pendencias por severidade. Aplicado.
2. Escala em tela com tabela desktop e cards mobile.
3. Configuracoes enxutas sem limpeza e sem secoes.
4. Participantes com resumo operacional e integridade.
5. Adapter para Minha Agenda/Quadro e ICS.
6. Testes e atualizacao dos padroes reaproveitaveis.

## Escala TPL

### Padroes que pode exportar

- Disponibilidade por pessoa/dia/horario.
- Geracao por local e horario.
- Publicar/bloquear mes.
- Despublicar/reabrir mes.
- Excecoes por mes.
- Bloqueios persistentes ou mensais.
- Link de grupo WhatsApp configuravel.
- Ajuste de fonte para PDF.
- Mensagens editaveis e registro de abertura.

### Padroes que deve importar

- Previa obrigatoria de PDF.
- Compartilhamento pessoal pelo Quadro/Minha Agenda quando for aviso comum.
- Lembrete ICS simples `P1D`.
- `masterId` e dados vindos apenas do Admin.
- Card de calendario no Quadro para mostrar dias/horarios preenchidos.
- Card de dados das reunioes usando link de grupo centralizado.

### Lacunas fechadas

- Comparativo legado/testes aplicado nas seis fases.
- Somente confirmacao de disponibilidade permanece no modulo.
- Link do Quadro centralizado no Admin.
- Previa de impressao, adapter publicado e lifecycle publicar/despublicar.
- Historico protegido por snapshot e inativacao segura de locais.

### Estado da auditoria

Auditoria e implementacao fechadas. Os testes equivalentes agora vivem no
projeto e nao dependem da pasta antiga.

### Fases de fechamento previstas

1. PDF com previa obrigatoria.
2. Mensagens e link central.
3. Pendencias padronizadas.
4. Adapter publico para Minha Agenda/Quadro.
5. Integridade de cadastro e locais.
6. Testes e fechamento.

## Admin/Mestre

### Padroes que pode exportar

- Cadastro central de pessoas.
- Usuarios e permissoes por modulo.
- Configuracoes de congregacao/reunioes/designacoes.
- Fonte unica de nome, ID, telefone e status ativo.

### Padroes que deve importar

- Padrões de auditoria e consistencia visual dos outros modulos.
- Talvez um painel de integridade com vinculos faltantes por modulo.
- Gestao central de links/configuracoes globais que hoje estao espalhadas.

### Lacunas percebidas

- [x] Link do grupo do Quadro configurado no Admin em
  `agenda/config/quadroWhatsAppLink`; a Escala TPL ainda usara fallback durante
  a transicao.
- [x] Lembretes ICS por modulo configuraveis no Admin em
  `agenda/config/icsReminders`; falta apenas a Minha Agenda gravar `VALARM` ao
  exportar.
- Usuario publicador precisa poder apontar para `masterId` quando Minha Agenda
  usar acesso pessoal.
- Aba de vinculos ja existe, mas pode ganhar acoes diretas por modulo.
- Regras Firebase/Storage precisam ser conferidas fora deste codigo antes de
  producao.

### Estado da auditoria

Auditoria fechada em `AUDITORIA-ADMIN-MESTRE.md`.

## Coordenador

### Decisao

O modulo/perfil Coordenador foi descartado como produto final. Ele nao deve
guiar nova implementacao.

### O que ainda pode ser reaproveitado

- Qualquer documento ou visao de consulta que ainda estiver util deve migrar
  para o modulo dono.
- A regra de permissao reduzida pode servir como referencia se futuramente
  existir usuario de consulta, mas nao como app separado.

### Aplicacao concluida

- Navegacao, tela, dominio, testes e opcao de cadastro foram removidos.
- Documentos e consultas permanecem nos modulos donos e em Minha Agenda.
- Dados atuais de pessoas, vinculos, programacoes e relatorios podem ser usados
  como exemplos para validar o app. A correcao dos dados reais sera feita em uma
  etapa posterior ao fechamento funcional dos modulos.

### Estado da auditoria

Auditoria fechada e remocao aplicada. Contas legadas usam somente as permissoes
comuns gravadas em `apps`.

## Ordem recomendada de trabalho

1. Oradores: aplicar fases finais do comparativo.
2. Tarefas: aplicar fases 2 a 6.
3. Escala TPL: aplicar fases 1 a 6 e recuperar os fixtures locais da suite comparativa.
4. Limpeza: validar preview/PDF, documentacao e adapter.
5. Minha Agenda: fechar as tres telas, Quadro, download/assinatura ICS e
   relatorio.
6. Rodar testes dos modulos afetados e build completo antes de commit.
