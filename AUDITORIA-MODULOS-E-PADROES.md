# Auditoria de modulos e padroes reaproveitaveis

Este documento organiza a avaliacao modulo a modulo antes do fechamento final
dos apps. Ele complementa `PADROES-REAPROVEITAVEIS.md` e os MDs de integracao
especificos.

Objetivo: para cada modulo, registrar o que pode ser reaproveitado nos outros,
o que ele deve importar dos outros modulos, e quais lacunas ainda precisam ser
resolvidas. A auditoria documental dos modulos esta fechada neste ciclo; o
proximo trabalho deve ser aplicar as fases de fechamento, sem abrir novo escopo
antes de resolver as lacunas registradas.

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
| Secretario | Auditado e funcional, faltam validacoes operacionais | `INTEGRACAO-SECRETARIO.md` | Alta |
| Minha Agenda | Auditado/planejado, falta implementacao final de assinatura/cartoes | `INTEGRACAO-MINHA-AGENDA.md` | Alta |
| Oradores | Auditado contra antigo, faltam fases finais | `COMPARATIVO-ORADORES-ANTIGO-VS-NOVO.md` | Alta |
| Vida e Ministerio | Fases 4 a 9 auditadas; faltam tres validacoes operacionais | `INTEGRACAO-VIDA-E-MINISTERIO.md` | Media |
| Limpeza | Auditado e parcialmente aplicado, faltam validacoes finais | `INTEGRACAO-LIMPEZA-E-AVISOS.md` | Media |
| Tarefas | Auditado contra app antigo, fase 1 aplicada | `COMPARATIVO-TAREFAS-ANTIGO-VS-NOVO.md` | Alta |
| Escala TPL | Auditado contra legado/testes, faltam fases finais | `COMPARATIVO-ESCALA-TPL-ANTIGO-VS-NOVO.md` | Alta |
| Admin/Mestre | Auditado como base central | `AUDITORIA-ADMIN-MESTRE.md` | Alta |
| Coordenador | Removido da navegacao, Admin, tipos e testes | Registrado em `INTEGRACAO-VIDA-E-MINISTERIO.md` | Concluido |

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

### Lacunas percebidas

- Assinatura ICS real ainda depende de URL estavel.
- Download ICS precisa suportar `VALARM`.
- Quadro precisa virar tela final com cards expansíveis.
- Card de PDFs precisa mapear permissao e periodo de cada modulo.
- Link do grupo deve migrar para `agenda/config/quadroWhatsAppLink`, com
  fallback temporario para `escala/settings/groupWhatsAppLink`.
- Testar relatorio enviado pela pessoa e bloqueio de mes fechado.

### Estado da auditoria

Auditoria fechada. Minha Agenda depende de fechar primeiro os adapters e regras
dos modulos donos, especialmente Secretario, Tarefas, Escala TPL, Oradores e
Vida e Ministerio.

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

### Lacunas percebidas

- Falta previa obrigatoria antes dos PDFs.
- Falta WhatsApp administrativo para confirmacao, datas livres e intercambios.
- Filtros por tipo/status ainda faltam na programacao.
- Cards de programacao/intercambios ainda precisam ficar mais ricos.
- Falta visitante manual.
- Temas precisam de filtro e PDF seguindo filtro.
- Pendencias precisam de contagem, severidade textual e filtro agrupado.

### Estado da auditoria

Auditoria fechada contra o app antigo. O proximo passo de Oradores e aplicar as
fases registradas no comparativo, com foco em recuperar o que o antigo fazia
melhor sem voltar para duas secoes nem mensagens por reuniao.

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

### Lacunas percebidas

- Comparativo antigo vs novo criado em
  `COMPARATIVO-TAREFAS-ANTIGO-VS-NOVO.md`.
- Falta aplicar fases finais do comparativo.
- Conferir se campos de busca atuais ainda fazem sentido ou se devem ser
  reduzidos conforme padrao dos modulos finalizados.
- Confirmar previa obrigatoria em PDF.
- Garantir adapter para Minha Agenda/Quadro com status, data, horario e funcao.
- Conferir se mensagens internas antigas devem sair de vez para o Quadro.

### Estado da auditoria

Auditoria fechada contra o app antigo. A Fase 1 foi aplicada; faltam fases 2 a
6 do comparativo.

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

### Lacunas percebidas

- Comparativo legado/testes vs novo criado em
  `COMPARATIVO-ESCALA-TPL-ANTIGO-VS-NOVO.md`.
- Falta aplicar fases finais do comparativo.
- Separar mensagem administrativa de aviso comum; aviso comum deve ir para
  Minha Agenda/Quadro.
- Decidir se `settings.groupWhatsAppLink` fica como fonte final ou migra para
  `agenda/config/quadroWhatsAppLink`.
- Confirmar previa obrigatoria em PDF.
- Garantir adapter para Minha Agenda/Quadro com local, horario, dupla e status.
- Confirmar se publicar/despublicar mes deve seguir o padrao de lifecycle do
  Secretario.

### Estado da auditoria

Auditoria fechada com base no codigo atual, migracao e testes de legado. A
pasta antiga completa nao esta presente nesta copia, entao a implementacao deve
seguir o comparativo criado e preservar os testes atuais.

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
