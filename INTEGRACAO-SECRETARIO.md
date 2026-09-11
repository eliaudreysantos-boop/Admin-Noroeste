# Integracao do Secretario

## Objetivo

Fechar o modulo Secretario antes de finalizar Minha Agenda, porque Minha Agenda
vai enviar relatorios pessoais para conferencia do Secretario.

O Secretario e o dono de:

- publicadores vinculados ao cadastro central;
- grupos de servico;
- relatorios mensais;
- assistencia;
- conferencia JW.org;
- documentos oficiais;
- arquivo da congregacao.

Minha Agenda nao deve duplicar cadastro nem calcular resumo congregacional. Ela
envia o relatorio pessoal permitido e o Secretario confere, ajusta e fecha.

## Fontes analisadas

- `Secretario.md` da pasta antiga.
- `Minha-agenda.md` da pasta antiga.
- `AUDITORIA-OUTROS-APPS-E-INSTRUCOES.md` da pasta antiga.
- Prints antigos do app Secretario da Congregacao.
- Codigo atual:
  - `src/modules/secretario.ts`;
  - `src/modules/secretario-domain.ts`;
  - `src/modules/secretario-documents.ts`;
  - `tests/secretario-domain.test.mjs`.

## O que o app antigo mostra nos prints

### Navegacao e rotina mensal

- Menu lateral com a competencia ativa.
- Acoes mensais diretas:
  - Enviar lembrete;
  - Fechar o mes;
  - Ajustes;
  - painel mensal S-1;
  - Peticoes de pioneiro auxiliar;
  - Analise de atividade de pioneiros regulares;
  - Relatorio de analise da congregacao;
  - Arquivo da congregacao;
  - Grupos de servico;
  - Configuracoes.

### Publicadores

- Lista agrupada por grupo de servico.
- Busca, filtro e menu de ordenacao/agrupamento.
- Filtros visiveis:
  - Todos;
  - Favoritos;
  - Feminino;
  - Masculino;
  - Surdos;
  - Nao batizados;
  - Recem batizados;
  - Publicadores batizados;
  - Irmaos batizados;
  - Servos ministeriais;
  - Anciaos;
  - Anciaos e servos;
  - Pioneiro auxiliar continuo;
  - Pioneiros regulares e especiais;
  - Inativos;
  - Removidos.
- Cada linha mostra estado do relatorio do mes, categoria ou ausencia de
  relatorio.
- Algumas linhas mostram idade, tempo de batismo e favorito.
- Ha acoes de download e compartilhamento por pessoa/categoria.

### Relatorios

- Tela mensal com fila `Por entregar`.
- Filtros:
  - Todos;
  - Sem relatorios;
  - Irregulares;
  - Somente publicadores;
  - Pioneiros auxiliares;
  - Pioneiros regulares;
  - Pioneiros especiais;
  - Missionarios;
  - Publicadores com estudos;
  - Publicadores sem estudo;
  - Pioneiros com estudos;
  - Pioneiros sem estudo;
  - Em outra congregacao.

Este filtro fica registrado apenas como referencia do app antigo. Ele nao entra
no Noroeste.

### Assistencia

- Registro por reuniao.
- Separacao entre reuniao da semana e reuniao de fim de semana.
- Tela Total com:
  - numero de reunioes;
  - assistencia total;
  - media;
  - grafico mensal.
- Alguns registros antigos exibem primeira e segunda sessao. Para o Noroeste
  atual, isso fica como legado/opcional ate haver necessidade concreta.

### Resumos e analise

- Cartoes por categoria:
  - Publicadores;
  - Pioneiros auxiliares;
  - Pioneiros regulares.
- Cada cartao mostra total e media de relatorios, estudos e horas quando
  aplicavel.
- Tela Total mostra:
  - publicadores ativos;
  - relatorios;
  - irregulares;
  - estudos biblicos;
  - pioneiros auxiliares;
  - pioneiros regulares;
  - atividades;
  - analise anual da congregacao;
  - grafico.

## O que o modulo atual ja tem

### Ja implementado

- Publicadores vinculados por `masterId`.
- Grupos de servico com superintendente e situacao.
- Relatorios mensais com:
  - competencia;
  - participou no ministerio;
  - estudos;
  - horas no campo;
  - atividade aprovada;
  - credito de horas;
  - pioneiro auxiliar;
  - recebido em;
  - atrasado;
  - observacoes.
- Atrasado conta no mes seguinte sem mudar a competencia original.
- Pioneiro especial e missionario ficam fora do resumo congregacional.
- Assistencia por data e tipo de reuniao.
- Conferencia JW.org com totais principais.
- Documentos S-21, S-88 e S-3 usando template PDF escolhido na hora.
- Arquivo da congregacao em JSON.
- Protecao para nao apagar o unico S-21 registrado.

### Lacunas identificadas antes da implementação

Os itens desta lista histórica foram resolvidos nas fases 1 a 6 documentadas
mais abaixo.

- Relatorios ainda funcionam como CRUD; falta fila operacional `Por entregar`.
- Falta filtro de relatorios por status/categoria/estudos.
- Publicadores ainda nao aparecem agrupados por grupo com estado do relatorio do
  mes.
- Falta busca/filtro em Publicadores.
- Falta diferenciar irregularidade de "sem relatorio este mes".
- Falta tela de fechamento mensal real, com bloqueio/reabertura simples.
- Falta painel mensal mais parecido com a rotina do Secretario antigo.
- Falta previa obrigatoria para PDFs antes de baixar/imprimir.
- Falta usar templates oficiais versionados ou caminho padronizado; hoje o
  usuario escolhe arquivos manualmente.
- Falta grafico/serie de assistencia e relatorios.
- Falta S-10/Relatorio de analise da congregacao.
- Falta definir o que entra no Arquivo da Congregacao final.

## Microdecisoes provaveis

## O que reaproveitar dos outros apps

### Do Vida e Ministerio

- Select de pessoa com contexto: mostrar nome, categoria/status e sinais uteis
  no proprio select, como recomendacao, ultimo uso ou pendencia.
- Fluxo de importacao/conferencia: dado recebido entra estruturado, depois o
  responsavel revisa, ajusta e confirma.
- Pendencias por item com destino claro para correcao. No Secretario isso vira
  pendencia de relatorio, grupo sem superintendente, publicador sem grupo,
  assistencia faltando e documento sem previa.
- Leitura pela Minha Agenda sem recalcular regras internas. O Secretario fecha
  relatorios; Minha Agenda apenas envia e acompanha o estado pessoal.

### Da Limpeza

- Periodo persistente e fechado: escolher competencia, gerar/conferir, fechar e
  reabrir quando necessario.
- Uso de grupos do Secretario como fonte unica. Aqui o Secretario e a fonte; os
  outros apps apenas leem grupos quando precisarem.
- Separar dado operacional de PDF. O relatorio mensal deve existir mesmo antes
  de gerar documento, e a geracao de PDF nao deve alterar os dados.
- Estado somente leitura quando um dado vem de outro lugar. No Secretario, dados
  pessoais vindos do Admin nao devem ser editados localmente.

### De Tarefas

- Lista de pendencias acionaveis, com botao levando direto para o ponto a
  corrigir.
- Validacao antes de finalizar/publicar. Para o Secretario: nao fechar mes se
  ainda houver relatorios sem conferencia ou documentos obrigatorios sem previa.
- Diferenciar "incompleto" de "erro". Um publicador sem relatorio e uma
  irregularidade real nao devem aparecer como a mesma coisa.

### De Oradores

- Cards compactos com status visivel, acoes pequenas e texto direto.
- Acoes de copiar texto quando PDF seria exagero. Isso serve para lembretes,
  lista de pendentes por grupo e resumo rapido da competencia.
- Confirmacao/desfazer confirmacao em card, adaptado para relatorios recebidos,
  conferidos e mes fechado.
- Filtros simples que mudam tambem a saida do documento/resumo. Se o Secretario
  filtrar por grupo ou competencia, o texto copiado e a previa devem refletir
  exatamente aquilo.

### Da Escala TPL

- Publicar/bloquear periodo depois de revisado, com reabertura simples.
- Snapshot do periodo publicado para proteger a versao conferida.
- Grade ou painel mensal denso para revisar muitos registros sem abrir uma tela
  separada para cada pessoa.
- Botao de PDF somente depois de existir dado suficiente.

### Da Minha Agenda e Quadro de Anuncios

- Texto editavel antes de abrir WhatsApp.
- WhatsApp individual pode usar o telefone do Admin quando o destino e uma
  pessoa especifica.
- WhatsApp de grupo deve abrir com texto pronto e editavel, sem afirmar que foi
  enviado.
- Badges de origem: relatorio enviado pela pessoa, lancado pelo Secretario,
  ajustado pelo Secretario e fechado.

### Candidatos praticos para extrair ou padronizar

- Controle de competencia/ano de servico.
- Select de pessoa por `masterId`.
- Card de pendencia acionavel.
- Badge de origem/status.
- Painel de documento com previa obrigatoria.
- Gerador de texto copiavel/WhatsApp editavel.
- Helper de bloqueio por periodo fechado.
- Agrupamento por grupo de servico.
- Snapshot de fechamento mensal.

### Navegacao

Manter o layout padrao do Admin SPA. Nao precisa copiar menu lateral/gaveta do
app antigo. Dentro das telas longas, usar filtros e secoes compactas.

### Publicadores

Publicadores devem ser a tela central de leitura do mes:

- agrupados por grupo de servico;
- com busca por nome;
- com filtro por categoria/situacao;
- mostrando estado do relatorio da competencia selecionada;
- sem editar dados pessoais que pertencem ao Admin.

### Grupos

Uma pessoa pertence a um unico grupo de servico. A mudanca de grupo acontece no
perfil do publicador dentro do Secretario e passa a valer imediatamente para
Limpeza quando ela usa grupos do Secretario.

### Relatorios

Relatorios devem ter duas camadas:

- entrada/edicao do registro;
- painel de cobranca e conferencia do mes.

O painel precisa listar:

- por entregar;
- recebidos;
- atrasados;
- sem relatorio;
- irregulares;
- categorias de publicador/pioneiro;
- com/sem estudo.

### Minha Agenda para Secretario

Minha Agenda grava direto em `secretario/relatorios`. O registro ja vira oficial,
mas precisa carregar a origem para o Secretario enxergar como ele entrou.

Decisao:

- `origem: 'minha_agenda' | 'secretario'`;
- relatorios criados pela Minha Agenda aparecem com badge proprio;
- relatorios criados ou ajustados no modulo passam a aparecer como lancados pelo Secretario;
- meses fechados nao podem ser editados pela pessoa na Minha Agenda;
- no Secretario, mes fechado bloqueia edicao comum e permite reabertura simples.
- a pessoa comum preenche participacao no ministerio, estudos biblicos e
  observacao;
- pioneiro auxiliar tambem informa horas do mes;
- pioneiro regular informa horas do mes, e Minha Agenda mostra progresso para
  a meta anual de 600 horas.

### Assistencia

Manter somente dois tipos canonicos:

- `meio_semana`;
- `fim_semana`.

Nao implementar primeira/segunda sessao no Noroeste. O grafico pode ser
implementado depois da lista mensal e dos totais estarem corretos.

### Lembretes de relatorio

O Secretario deve ter lembretes para quem esta por entregar. Este fluxo e
diferente dos avisos por reuniao que foram removidos dos modulos operacionais.

Formas desejadas:

- abrir o WhatsApp da pessoa com uma frase pronta de lembrete do relatorio;
- abrir o WhatsApp do superintendente do grupo com uma lista dos pendentes
  daquele grupo.

O app apenas abre o WhatsApp com texto editavel. Ele nao deve afirmar que a
mensagem foi enviada.

A frase padrao deve ser educada e simples, por exemplo lembrando que ainda
falta o relatorio da competencia selecionada. O texto sempre pode ser revisado
antes do envio.

O superintendente do grupo vem de `secretario/grupos/{id}/superintendenteMasterId`.

### Filtros que ficam fora

Nao implementar agora:

- favoritos;
- surdos;
- cegos;
- presos;
- em outra congregacao.

Os filtros do Secretario devem focar no trabalho mensal real: grupo, status do
relatorio, categoria de publicador/pioneiro, ativos/inativos e com/sem estudos.

### Documentos

Todos os PDFs do Secretario entram no padrao obrigatorio de previa:

- gerar bytes;
- abrir previa em modal/painel;
- permitir baixar/imprimir depois da conferencia.

Excel pode ser usado como apoio tecnico para gerar muitos PDFs de uma vez, desde
que a formatacao oficial seja preservada. A entrega final para o usuario continua
sendo PDF com previa obrigatoria antes de baixar/imprimir.

Para o S-21 em lote, o Excel tambem pode ser uma entrega final administrativa.
O Secretario gera um ZIP com fichas anuais por publicador, totais, contatos e
grupos. Esse lote segue a organizacao do `S21.zip` antigo, mas usa
`Atividades aprovadas` no lugar da coluna antiga `Escola`. Quando for preciso
emitir PDF, o Excel pode ser impresso posteriormente; os PDFs gerados dentro do
app continuam obrigados a passar pela previa.

### Peticao de pioneiro auxiliar

Nao gerar peticao no sistema. O Secretario apenas registra a condicao de
pioneiro auxiliar e o modulo lista/contabiliza corretamente.

## Fases recomendadas

### Fase 1 - Contrato de relatorio vindo da Minha Agenda

- [x] Decidir caminho no RTDB: `secretario/relatorios`.
- [x] Criar campo de origem do relatorio: Minha Agenda ou Secretario.
- [x] Criar funcao de normalizacao/validacao.
- [x] Garantir que `masterId` exista no cadastro central e esteja vinculado como
      publicador no Secretario.
- [x] Testar competencia, atraso, estudos, horas e observacao limitada.
- [x] Bloquear edicao pela Minha Agenda quando a competencia estiver fechada.
- [x] Exibir campos conforme categoria:
  - publicador: participou, estudos e observacao;
  - pioneiro auxiliar: participou, estudos, horas do mes e observacao;
  - pioneiro regular: participou, estudos, horas do mes, progresso anual de 600
    horas e observacao.

### Fase 2 - Publicadores como painel mensal

- [x] Adicionar competencia selecionada.
- [x] Mostrar estado do relatorio na lista de publicadores.
- [x] Agrupar por grupo de servico.
- [x] Criar busca.
- [x] Criar filtros principais.
- [x] Destacar sem relatorio, recebido, atrasado e inativo.

### Fase 3 - Relatorios como conferencia

- [x] Criar fila `Por entregar`.
- [x] Criar filtros de relatorio.
- [x] Criar bloco de recebidos/atrasados.
- [x] Mostrar badge de origem: Minha Agenda ou Secretario.
- [x] Permitir ajuste pelo Secretario antes do fechamento.
- [x] Criar lembrete individual por WhatsApp.
- [x] Criar lembrete ao superintendente com pendentes do grupo.

### Fase 4 - Fechamento mensal

- [x] Criar estado de fechamento por competencia.
- [x] Bloquear edicao comum depois de fechado.
- [x] Permitir reabertura simples pelo Secretario.
- [x] Registrar envio JW.org.
- [x] Garantir regra de atrasados no mes seguinte.

### Fase 5 - Assistencia e analise

- [x] Melhorar resumo mensal de assistencia.
- [x] Criar total por tipo de reuniao.
- [x] Criar serie do ano de servico.
- [x] Avaliar grafico depois que os dados estiverem corretos: a série textual
      mensal é suficiente nesta etapa e evita sugerir precisão visual onde
      ainda pode haver pouco histórico.
- [x] Definir S-10/analise congregacional como painel anual: usar a Análise
      anual como fonte única, com competência/ano, relatórios, participações,
      estudos, horas de pioneiros e médias de assistência. Não haverá emissão
      de PDF nem dependência de template oficial para este item.
- [x] Definir S-1 como painel mensal de conferência e fechamento, sem emissão
      de PDF.

### Fase 6 - Documentos com previa

- [x] Implementar previa obrigatoria para S-21.
- [x] Implementar previa obrigatoria para S-88.
- [x] Implementar previa obrigatoria para S-3.
- [x] Remover download direto sem conferencia.
- [x] Padronizar origem dos templates: o Secretário salva uma vez cada PDF
      oficial no Firebase Storage e os documentos seguintes usam esse padrão;
      um arquivo local ainda pode substituí-lo em uma geração isolada.

## Perguntas realmente necessarias

Todas respondidas nesta fase:

- Minha Agenda grava direto em `secretario/relatorios`, com badge de origem.
- Mes fechado nao pode ser editado pela pessoa.
- Assistencia fica somente meio de semana e fim de semana.
- Secretario tera lembrete individual e lembrete ao superintendente do grupo.
- Filtros antigos de favoritos, surdos, cegos, presos e em outra congregacao
  nao entram agora.
- Excel pode ser usado como apoio tecnico para lote de PDFs, desde que preserve
  a formatacao e mantenha PDF com previa como saida final.
- Publicador informa participacao, estudos e observacao; pioneiros tambem
  informam horas conforme categoria.
- Pioneiro regular acompanha progresso para meta anual de 600 horas.
- Superintendente do grupo vem de `superintendenteMasterId`.
- Reabertura de mes fechado pode ser simples.

## Finalizacao e implantacao

O escopo funcional do modulo esta concluido. As atividades abaixo pertencem a
validacao futura com dados reais e nao bloqueiam o app de exemplo:

- [x] Registrar em `FIREBASE-SECURITY.md` o modelo operacional adotado, sem
  Firebase Authentication por decisao do responsavel pelo app.
- [ ] Revisar as regras reais de RTDB/Storage junto com os dados de producao,
  sem introduzir Firebase Authentication.
- [ ] Fazer uma conferencia real com a conta Admin: receber um relatorio da
  Minha Agenda, ajustar se necessario, fechar e reabrir uma competencia.
- [ ] Gerar e conferir a previa dos PDFs S-21, S-88 e S-3 usando dados reais.
- [ ] Gerar um ZIP S-21, abrir uma ficha individual e um resumo no Excel e
  confirmar a impressao.

Resultado da auditoria de codigo: nao foram encontrados outros bloqueios
funcionais nos fluxos de cadastro, relatorios, fechamento, assistencia,
painel S-1, analise anual, documentos e exportacao em lote.
