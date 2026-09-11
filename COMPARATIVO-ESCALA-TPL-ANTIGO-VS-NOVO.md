# Comparativo Escala TPL antigo vs novo

Este documento guia o fechamento da Escala TPL antes de Minha Agenda. Diferente
de Tarefas e Oradores, a pasta antiga completa da Escala TPL nao esta presente
neste worktree nem na pasta antiga localizada em Downloads. A evidencia
disponivel vem de:

- `src/modules/escala.ts`
- `src/modules/escala-domain.ts`
- `src/modules/escala-documents.ts`
- `src/modules/escala-output.ts`
- `src/modules/escala-migration.ts`
- `tests/escala-domain.test.mjs`
- `tests/escala-migration.test.mjs`

Os testes citam uma referencia antiga chamada
`NAO FAZER COMMIT DESSA PASTA/escala - TPL`, mas essa pasta nao esta mais nesta
copia. Portanto, este comparativo nao afirma ter lido o app antigo completo; ele
registra o que a migracao/testes mostram que veio do legado e o que falta no
modulo atual para ficar consistente com os padroes finais.

## Decisoes ja tomadas

- Nome, ID e telefone continuam vindo apenas do Admin por `masterId`.
- Avisos comuns para pessoas devem ir para Minha Agenda/Quadro.
- WhatsApp administrativo pode ficar na Escala TPL apenas para confirmar
  disponibilidade ou contato operacional com responsavel.
- O link de grupo deve migrar para configuracao central do Quadro/Admin, com
  fallback temporario para `escala/settings/groupWhatsAppLink`.
- Todo PDF precisa ter previa obrigatoria antes de imprimir/baixar.
- Minha Agenda e Quadro consomem a escala pronta; nao recalculam pares.
- Lembrete ICS default da Escala TPL: `P1D`.

## O que ja existe no novo e parece herdado do antigo

### Locais, dias e horarios

O modulo atual ja permite cadastrar locais com dias ativos, inicio, fim,
intervalo e ordem de exibicao. Tambem mostra previa dos horarios ao editar o
local.

Manter:

- cadastro de locais por ponto;
- dias ativos por local;
- horarios derivados por intervalo;
- ordem de exibicao;
- previa de horarios no modal.

### Disponibilidade

O modulo atual permite marcar disponibilidade por pessoa, local, dia e horario.
Tambem registra `availabilityUpdatedAt`, que sustenta confirmacao periodica.

Manter:

- matriz de disponibilidade por local/pessoa/horario;
- botao de confirmar revisao de disponibilidade;
- pendencia para disponibilidade sem revisao recente;
- mensagem administrativa de confirmacao.

### Geracao por regras

O dominio atual cobre as regras principais:

- pessoa inativa;
- teto mensal;
- inicio futuro;
- folga alternada;
- sem disponibilidade;
- ja escalado no dia;
- horario vizinho;
- outro local no mesmo horario ou vizinho;
- dupla com a mesma pessoa;
- duas pessoas acompanhando crianca;
- mesmo sexo quando exigido;
- participa somente com uma pessoa especifica.

Manter:

- geracao por local ou todos os locais;
- preservacao de edicoes ja feitas;
- equilibrio por contagem mensal;
- prioridade para pioneiro quando possivel;
- validacao antes de salvar dupla manual.

### Publicacao e historico

O novo ja tem `publishedMonth` e `publishedSnapshots`, bloqueia edicao do mes
publicado e permite despublicar. Tambem usa snapshot para resolver nomes antigos
quando o cadastro atual mudou.

Manter:

- publicar mes como bloqueio simples;
- despublicar/reabrir mes;
- snapshot do mes publicado;
- historico de nomes para registros antigos.

### Bloqueios e excecoes

O modulo atual tem bloqueios persistentes ou mensais por horario/local e datas
excluidas por mes.

Manter:

- bloqueio persistente para todos os meses;
- bloqueio somente do mes;
- bloqueio por local ou todos os locais;
- datas excluidas do mes.

## O que falta ou voltou mais fraco

### 1. Previa obrigatoria de PDF

Hoje `printScaleSchedule` cria o documento e chama `window.print()` direto. Isso
fere o padrao obrigatorio de previa.

Aplicar:

- criar previa antes de imprimir/baixar;
- mostrar a folha por local em modal/painel;
- permitir imprimir somente depois da previa;
- preservar ajuste automatico de fonte;
- manter a previa como mesma origem da saida final.

### 2. Separar aviso comum de mensagem administrativa

A tela atual de Mensagens tem tres fluxos:

- mensagem para pessoa;
- mensagem do dia;
- confirmar disponibilidade.

Pelo padrao final, os dois primeiros sao avisos comuns e devem migrar para
Minha Agenda/Quadro. O terceiro e administrativo e pode permanecer.

Aplicar:

- remover/ocultar mensagem para pessoa dentro da Escala TPL;
- remover/ocultar mensagem do dia dentro da Escala TPL;
- manter confirmacao de disponibilidade;
- manter texto editavel e WhatsApp para confirmacao;
- enviar dados publicos para Quadro montar mensagem coletiva.

### 3. Link de grupo centralizado

O link de grupo hoje mora em `escala/settings/groupWhatsAppLink`. Minha Agenda
foi planejada para usar `agenda/config/quadroWhatsAppLink`.

Aplicar:

- ler primeiro `agenda/config/quadroWhatsAppLink`;
- usar `escala/settings/groupWhatsAppLink` apenas como fallback temporario;
- mover a edicao final desse link para Admin/Quadro;
- evitar duplicar o mesmo link em varios modulos.

### 4. Pendencias com contagem e agrupamento padrao

A Escala TPL ja tem pendencias, mas precisa alinhar com o padrao geral:
severidade, contadores e acao direta mais previsivel.

Aplicar:

- mostrar contadores por severidade;
- padronizar textos `alta`, `media`, `baixa`;
- agrupar locais sem escala por mes;
- destacar duplas incompletas;
- manter pessoa sem WhatsApp como integridade do Admin, nao como bloqueio da
  escala;
- indicar disponibilidade vencida por pessoa.

### 5. Adapter publico para Minha Agenda/Quadro

O modulo atual ainda nao tem contrato publico explicito para outros apps.

Aplicar:

- exportar eventos por `masterId`;
- incluir data, horario, local, parceiro, status publicado e origem `escala`;
- incluir `uid` estavel para ICS;
- usar lembrete default `P1D`;
- nao expor observacao interna nem telefone;
- Quadro deve consumir todos os eventos publicados;
- Minha Agenda deve filtrar por pessoa.

### 6. Estado publicado vs em edicao no consumo externo

O modulo bloqueia edicao quando publicado, mas Minha Agenda/Quadro precisam
saber se devem mostrar rascunho ou apenas publicado.

Aplicar:

- por padrao, Minha Agenda/Quadro mostram apenas mes publicado;
- permitir opcao administrativa futura para previsualizar rascunho, se preciso;
- incluir `publishedMonth`/snapshot no adapter;
- evitar expor escala em construcao para publicadores.

### 7. Remocao ou desativacao de local

O novo permite apagar local e avisa que isso apaga escalas, disponibilidade,
bloqueios e edicoes manuais daquele local. E funcional, mas perigoso.

Aplicar:

- preferir `active=false`/ocultar local a apagar;
- se mantiver apagar, exigir confirmacao forte;
- nunca apagar historico publicado sem aviso especifico;
- preservar snapshot publicado mesmo se o local for removido do cadastro atual.

### 8. Participantes e cadastro central

O novo ja vincula participantes ao Admin, mas ainda deve reforcar integridade.

Aplicar:

- destacar participante legado sem `masterId`;
- impedir novo vinculo duplicado ao mesmo `masterId`;
- manter nome/telefone somente leitura no modulo;
- registrar configuracoes locais da Escala TPL sem duplicar dados pessoais;
- considerar acao "desativar da Escala" mais direta que remover.

### 9. Testes quebrados por referencia antiga ausente

`tests/escala-domain.test.mjs` e `tests/escala-migration.test.mjs` importam
arquivos de `NAO FAZER COMMIT DESSA PASTA`, mas essa pasta nao tem os arquivos
citados nesta copia.

Aplicar:

- mover fixtures realmente necessarios para `tests/fixtures/escala`;
- remover dependencia de pasta proibida de commit;
- manter teste de compatibilidade apenas se a fixture puder ser versionada;
- caso contrario, transformar em teste unitario do comportamento atual.

## Padroes do novo que devem permanecer

- Cadastro por `masterId`.
- Participante com regras locais: pioneiro, teto, folga, crianca, mesmo sexo e
  somente com.
- Disponibilidade por local/dia/horario.
- Bloqueio persistente e bloqueio mensal.
- Datas excluidas por mes.
- Geracao por todos os locais respeitando outros locais ja gerados.
- Publicar/despublicar mes.
- Snapshot de nomes/locais publicados.
- Ajuste de fonte da impressao.

## Fases de aplicacao

### Fase 1 - PDF com previa

- Criar previa obrigatoria da escala do carrinho.
- Reutilizar `scalePrintHtml` como fonte da previa.
- Manter ajuste automatico de fonte antes da impressao.
- Testar que gerar previa nao altera tabelas nem publicacao.

### Fase 2 - Mensagens e link central

- Manter apenas confirmacao de disponibilidade dentro da Escala TPL.
- Migrar mensagem para pessoa e mensagem do dia para Minha Agenda/Quadro.
- Ler link do grupo central do Quadro/Admin com fallback legado.
- Atualizar textos do modulo para nao prometer avisos comuns.

### Fase 3 - Pendencias

- Padronizar severidade e contadores.
- Agrupar locais sem escala.
- Destacar duplas incompletas e disponibilidade vencida.
- Direcionar clique para pessoa/local correto.

### Fase 4 - Adapter publico

- Criar coletor de eventos publicados da Escala TPL.
- Expor `masterId`, data, horario, local, parceiro, modulo, status e `uid`.
- Preparar campo de lembrete ICS `P1D`.
- Garantir que Minha Agenda/Quadro nao leem rascunho por padrao.

### Fase 5 - Integridade de cadastro

- Substituir exclusao perigosa de local por inativacao quando possivel.
- Melhorar aviso de participantes legados sem `masterId`.
- Garantir que pessoa removida do Admin nao quebre historico publicado.

### Fase 6 - Testes e fechamento

- Corrigir testes que dependem da pasta ausente.
- Testar geracao, bloqueios, excecoes, publicacao, snapshot e adapter.
- Atualizar `PADROES-REAPROVEITAVEIS.md` com os padroes realmente extraiveis.
