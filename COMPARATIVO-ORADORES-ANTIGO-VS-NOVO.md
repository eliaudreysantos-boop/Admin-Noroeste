# Comparativo Oradores antigo vs novo

Este documento lista apenas o que existia no Oradores antigo funcional e nao
esta presente, ou esta mais fraco, no Oradores atual do Admin SPA.

Decisao base: nao voltar com duas secoes. A antiga S1 fica fora; tudo que for
reaproveitado deve ser adaptado para uma unica programacao.

## Plano de implementacao para finalizar Oradores

Este plano organiza o comparativo em fases executaveis. A ordem abaixo deve ser
seguida para evitar retrabalho: primeiro entram os padroes transversais
obrigatorios, depois a camada operacional da programacao, e por fim os ajustes
de telas auxiliares.

### Fase 1 - PDFs com previa obrigatoria

Objetivo: nenhum PDF de Oradores deve baixar ou imprimir direto.

- Reaproveitar o padrao obrigatorio registrado em
  `PADROES-REAPROVEITAVEIS.md`: `standard PDF template + preview`.
- Criar um helper de previa para PDFs de Oradores, equivalente ao padrao ja
  consolidado no Secretario.
- Alterar `downloadSchedulePdf` e `downloadThemeCatalogPdf` para retornar bytes
  ou URL de previa, sem acionar download automatico internamente.
- Na tela, abrir modal de previa com:
  - botao `Baixar PDF`;
  - botao `Imprimir`;
  - botao `Fechar`.
- Aplicar a previa em:
  - PDF da programacao;
  - PDF/catalogo de temas.
- Manter a programacao separada em blocos de locais/visitantes e saidas.
- Garantir que o PDF de temas respeite o filtro visivel quando a Fase 5 for
  aplicada.

Verificacao da fase:

- Gerar programacao e confirmar que abre previa antes de baixar.
- Gerar catalogo de temas e confirmar que abre previa antes de baixar.
- Rodar testes de documentos/dominio de Oradores e build.

### Fase 2 - WhatsApp administrativo e mensagens operacionais

Objetivo: recuperar a utilidade pratica do antigo sem afirmar que a mensagem foi
enviada, respeitando a decisao de centralizar avisos pessoais no Quadro de
Anuncios/Minha Agenda.

- Reaproveitar o padrao `editable share modal`, mas somente para rascunhos
  administrativos dentro de Oradores.
- Permanecem validos dentro de Oradores:
  - confirmacao de compromisso;
  - datas livres da congregacao;
  - intercambios futuros da congregacao.
- Nao volta para Oradores:
  - aviso comum por reuniao para publicador/orador;
  - lembrete pessoal que deve aparecer na Minha Agenda;
  - compartilhamento geral de designacoes, que deve partir do Quadro de
    Anuncios.
- Criar builders de mensagens para os fluxos administrativos permitidos:
  - confirmacao de compromisso;
  - datas livres da congregacao;
  - intercambios futuros da congregacao.
- Criar modal de rascunho com texto editavel, seguindo o padrao do Secretario:
  - `Abrir WhatsApp`;
  - `Copiar`;
  - `Fechar`.
- Implementar feedback claro:
  - telefone ausente;
  - pop-up bloqueado;
  - WhatsApp aberto para revisao;
  - erro inesperado.
- Registrar somente abertura do WhatsApp, por exemplo:
  - `confirmacao.whatsappAbertoEm`;
  - `datasLivresAvisadasEm`;
  - `intercambioAvisadoEm`.
- Nao declarar envio automatico.

Verificacao da fase:

- Testar contato com telefone cadastrado.
- Testar contato sem telefone.
- Confirmar que o registro salvo e apenas de abertura.
- Confirmar que nenhum aviso pessoal por reuniao foi reintroduzido no modulo.

### Fase 3 - Programacao operacional

Objetivo: deixar a tela principal tao funcional quanto o antigo, mantendo a
arquitetura atual de uma unica programacao.

- Adicionar filtros sem campo de busca:
  - tipo: todos, discurso local, visitante, saida;
  - status: todos, confirmado, a confirmar, por definir.
- Melhorar card de compromisso com:
  - barra lateral/cor por tipo;
  - badge visual de status;
  - congregacao envolvida;
  - tema com numero formatado;
  - horario quando houver;
  - linha de confirmacao/reconfirmacao mais explicativa;
  - registro visual de WhatsApp aberto quando existir.
- Adicionar acoes por card:
  - `Pedir confirmacao`;
  - `Confirmar`;
  - `Desfazer confirmacao`;
  - `Reconfirmar`, quando aplicavel;
  - `Editar`;
  - `Excluir`.
- Adicionar `updatedAt` nos salvamentos da programacao para dar base futura a
  tratamento de edicao concorrente.
- Permitir visitante manual quando nao houver cadastro, sem criar pessoa no
  Admin automaticamente.
- Manter fora:
  - campo de observacoes;
  - qualquer logica de duas secoes;
  - segundo orador como simulacao de secao.

Verificacao da fase:

- Criar local, visitante e saida.
- Filtrar por tipo/status.
- Confirmar/desfazer/reconfirmar.
- Criar visitante manual.

### Fase 4 - Cadastro de oradores

Objetivo: resolver a tela estranha de cadastro e recuperar leitura detalhada sem
voltar com duas listas confusas.

- Manter uma lista unica de oradores.
- Transformar o cadastro em fluxo com leitura antes da edicao:
  - card/lista resumida;
  - painel/modal de detalhe;
  - botao editar dentro do detalhe.
- Exibir telefone vindo do Admin, apenas para consulta.
- Permitir tipo do orador:
  - local;
  - visitante.
- Para visitante, permitir congregacao de origem.
- Manter repertorio de temas em controle dedicado, mais confortavel que uma
  lista longa simples.
- Mostrar avisos:
  - pessoa ja vinculada a outro orador;
  - pessoa inativa no Admin;
  - orador sem repertorio.
- Preservar controles de A Sentinela:
  - exatamente um dirigente local;
  - exatamente um substituto local;
  - dirigente e substituto nao podem ser a mesma pessoa.
- Manter o card `Aprovados para saida` como texto copiavel:
  - somente nome;
  - numeros dos discursos do repertorio;
  - sem telefone.
- Nao bloquear edicao, exclusao ou alteracao de tema apenas porque ja foi usado.

Verificacao da fase:

- Cadastrar local e visitante.
- Vincular pessoa do Admin.
- Confirmar card de aprovados sem telefone.
- Validar dirigente/substituto da Sentinela.

### Fase 5 - Temas

Objetivo: tornar a tela de temas operacional sem campo de busca.

- Adicionar filtro:
  - disponiveis;
  - usados;
  - todos.
- Exibir etiquetas:
  - ultimo uso;
  - programado;
  - inativo, apenas se dado antigo existir.
- Permitir inativar/reativar tema somente se isso for necessario para dados
  antigos; se nao houver uso real, manter simples.
- Fazer o PDF/catalogo usar exatamente o filtro visivel.
- Nao bloquear edicao/exclusao por historico de uso, conforme decisao do usuario.

Verificacao da fase:

- Conferir tema usado, programado e disponivel.
- Gerar previa do PDF com o filtro atual.

### Fase 6 - Congregacoes e datas livres

Objetivo: recuperar a comunicacao e deixar claro o papel de cada congregacao.

- Manter cadastro distinguindo:
  - local;
  - visitante.
- Validar que exista uma congregacao local e avisar quando faltar.
- Separar visualmente:
  - endereco;
  - link do Maps.
- Formatar telefone para leitura.
- Ajustar alcance de datas livres para:
  - proximos 3 meses;
  - proximos 6 meses;
  - proximo ano.
- Adicionar `Enviar datas livres` por WhatsApp com rascunho editavel:
  - contato;
  - congregacao local;
  - datas;
  - horario;
  - endereco.
- Nao remover congregacao usada em programacao sem alerta. Pode manter bloqueio
  ou exigir confirmacao forte, desde que nao apague vinculos sem o usuario
  perceber.

Verificacao da fase:

- Selecionar congregacao com contato e telefone.
- Gerar datas livres.
- Abrir rascunho de WhatsApp.

### Fase 7 - Intercambios

Objetivo: deixar entradas e saidas praticas para acompanhamento semanal.

- Adicionar botao `Enviar por WhatsApp` para a congregacao selecionada.
- Montar mensagem unica com entradas e saidas futuras daquela congregacao.
- Mostrar status visual:
  - confirmado;
  - a confirmar;
  - por definir, quando aplicavel.
- Permitir confirmar/desfazer confirmacao direto no card.
- Manter destaque para compromissos a menos de 21 dias nao confirmados.
- Adicionar aviso no topo quando houver compromisso proximo sem confirmacao.
- Usar horario correto:
  - entrada usa horario local;
  - saida usa horario da congregacao de destino.
- Registrar abertura do WhatsApp nos compromissos cobertos pela mensagem.

Verificacao da fase:

- Filtrar uma congregacao.
- Confirmar/desfazer no card.
- Abrir WhatsApp consolidado.

### Fase 8 - Pendencias e acabamento UX

Objetivo: deixar o modulo facil de corrigir antes de fechar.

- Adicionar seletor unico de pendencias por tipo, com contagem:
  - todas;
  - programacao;
  - cadastro;
  - congregacoes;
  - confirmacoes.
- Permitir alternar pendencias ativas/ignoradas.
- Mostrar severidade com labels:
  - Urgente;
  - Atencao;
  - Quando puder.
- Ao resolver, ajustar contexto antes de abrir:
  - periodo correto da programacao;
  - orador selecionado;
  - congregacao selecionada.
- Abrir modal/folha automaticamente quando houver registro especifico.
- Melhorar `EmptyState` das telas principais.
- Padronizar badges e botoes compactos por card.
- Reaproveitar o padrao `pending list item` de `PADROES-REAPROVEITAVEIS.md`
  para severidade, alvo e acao de correcao.

Verificacao da fase:

- Ignorar e reativar pendencia.
- Resolver pendencia de programacao, cadastro e congregacao.
- Conferir mobile visualmente se possivel.

### Fase 9 - Auditoria final

Objetivo: confirmar que Oradores pode ser considerado finalizado.

- Rodar:
  - testes de Oradores;
  - build geral.
- Conferir manualmente:
  - Programacao;
  - Designacoes por orador;
  - Cadastro;
  - Emergencia;
  - Temas;
  - Congregacoes;
  - Intercambios;
  - Pendencias.
- Atualizar `PADROES-REAPROVEITAVEIS.md` com qualquer componente/logica de
  Oradores que possa ser usado em outros modulos.
- Registrar no resumo final o que ficou deliberadamente fora.

## Estado atual da auditoria

Ja esta ok ou parcialmente recuperado:

- Programacao unica, sem duas secoes.
- Periodo, preencher datas, futuro, confirmacao, reconfirmacao, conflitos e CRUD.
- Emergencia como card de texto com botao copiar.
- Card de texto de aprovados para saida, sem telefone.
- Exclusao/edicao sem bloqueio por tema ja usado.
- Sem campos de busca.
- Sem campo de observacoes na programacao.
- Pendencias com resolver/ignorar/reativar e abertura basica do contexto.
- PDF da programacao separado em locais/visitantes e saidas.

Principais lacunas para fechar:

- Previa obrigatoria antes de qualquer PDF.
- WhatsApp administrativo e registros de abertura, sem voltar com avisos
  pessoais por reuniao dentro de Oradores.
- Filtros por tipo/status na programacao.
- Cards de programacao/intercambios mais ricos.
- Visitante manual.
- Temas filtraveis e PDF seguindo filtro.
- Pendencias agrupadas com contagem e severidade textual.

## Programacao

### Faltando no novo

- Filtro por tipo:
  - Discurso local;
  - Visitante;
  - Saida.
- Filtro por status:
  - Confirmado;
  - A confirmar;
  - Por definir.
- Cartao mais completo por compromisso, com:
  - barra lateral/cor por tipo;
  - badge textual e visual de status;
  - congregacao envolvida;
  - tema com numero formatado;
  - linha de confirmacao/reconfirmacao mais explicativa.
- Acao `Pedir confirmacao` por WhatsApp em cada compromisso.
- Registro visual de quando a mensagem foi aberta.
- Botao para desfazer confirmacao quando ainda fizer sentido.
- Tratamento de edicao concorrente por `updatedAt`.
- Horario local no compromisso quando aplicavel.
- Picker dedicado para escolher orador, tema e congregacao, com avisos no item.
- Tema escolhido com alerta quando:
  - esta fora do repertorio do orador;
  - ja foi usado;
  - ja esta agendado.
- Para visitante, possibilidade de digitar nome manual quando nao houver
  cadastro.
- Botao `Imprimir` direto da programacao antiga.
- Impressao com bloco de locais e saidas usando a lista do periodo.
- Ajuste de fonte de impressao herdado das configuracoes.

### Observacao

O novo ja tem periodo, preencher datas, futuro, confirmacao, reconfirmacao,
PDF, conflitos e CRUD. O que falta e a camada operacional rica da tela antiga.

## Designacoes por orador

### Faltando no novo

- Listar tambem participacao como segundo orador.
- Listar substituicao de A Sentinela.
- Mostrar tipo do compromisso com identificacao visual clara.
- Mostrar endereco/localizacao quando existir.
- Mostrar horario por compromisso.
- Badge de confirmado/a confirmar em cada card.

### Observacao

O novo lista compromissos futuros do orador, mas sem segundo orador e sem
A Sentinela.

Decisao atual: o WhatsApp de designacoes por orador nao deve voltar para dentro
de Oradores como aviso pessoal. Esse compartilhamento deve ser tratado pela
Minha Agenda/Quadro de Anuncios. Nesta tela, manter apenas consulta operacional
das designacoes futuras.

## Cadastro de oradores

### Faltando no novo

- Tela focada em um orador selecionado, com leitura detalhada antes de editar.
- Tipo do orador:
  - local;
  - visitante.
- Funcao congregacional do orador dentro do modulo antigo.
- Telefone exibido/formatado no cadastro do Oradores antigo.
- Ativo/inativo, com inativar e reativar.
- Repertorio de temas em picker dedicado.
- Aviso de pessoa ja vinculada a outro orador.
- Aviso de pessoa inativa no cadastro central.
- Controles de A Sentinela:
  - marcar dirigente;
  - marcar substituto;
  - validar exatamente um dirigente e um substituto.
- Card de texto dos oradores aprovados para saida, com botao de copiar.
- Texto dos aprovados contendo apenas nome e numeros dos discursos do
  repertorio.
- Bloqueio para excluir orador usado na programacao, recomendando inativar.
- Para visitante, campo de congregacao de origem no cadastro.

### Observacao

O novo manteve parte dos atributos, mas de modo mais simples. Telefone nao deve
entrar no texto dos aprovados para saida.

## Temas

### Faltando no novo

- Filtro:
  - Disponiveis;
  - Usados;
  - Todos.
- Tema ativo/inativo.
- Inativar/reativar tema.
- Etiquetas na lista:
  - ultimo uso;
  - programado;
  - inativo.
- PDF/impressao seguindo exatamente o filtro visivel na tela.

### Observacao

O novo mostra ultimo uso e proximos agendamentos, e gera PDF do catalogo, mas
faltam filtros operacionais.

## Congregacoes

### Faltando no novo

- Tipo ativo/inativo para congregacao.
- Inativar/reativar congregacao.
- Bloqueio para excluir congregacao usada na programacao.
- Cadastro distinguindo claramente congregacao local e visitante.
- Validacao de uma congregacao local.
- Aviso quando nao existe congregacao local, porque isso afeta cabecalho de PDF
  e datas livres.
- `Enviar datas livres` por WhatsApp.
- Mensagem de datas livres com:
  - contato;
  - nome da congregacao local;
  - datas;
  - horario;
  - endereco.
- Alcance de datas livres com preferencia local:
  - proximos 3 meses;
  - proximos 6 meses;
  - proximo ano.
- Telefone formatado.
- Separacao visual entre link do Maps e endereco.

### Observacao

O novo manteve cadastro, seletor, dados de reuniao, Maps, datas livres e alcance,
mas removeu o envio por WhatsApp e simplificou ativo/inativo/protecoes.

## Intercambios

### Faltando no novo

- Botao `Enviar por WhatsApp` para a congregacao selecionada.
- Mensagem unica com entradas e saidas futuras daquela congregacao.
- Status visual por intercambio:
  - confirmado;
  - a confirmar.
- Confirmar/desfazer confirmacao direto no card de intercambio.
- Destaque para compromissos a menos de 21 dias ainda nao confirmados.
- Aviso no topo quando existe compromisso proximo sem confirmacao.
- Uso do horario correto:
  - entrada usa horario local;
  - saida usa horario da congregacao de destino.
- Registro de aviso nos compromissos cobertos pela mensagem.

### Observacao

O novo ainda separa entradas e saidas e destaca menos de 21 dias, mas nao tem
WhatsApp, confirmacao no card nem mensagem consolidada.

## Pendencias

### Faltando no novo

- Filtro de pendencias por modulo/tipo em um seletor unico.
- Opcao para ver pendencias ignoradas.
- Contagem por tipo no seletor.
- Severidade com labels claros:
  - Urgente;
  - Atencao;
  - Quando puder.
- Resolver ajustando contexto antes de abrir a tela:
  - orador selecionado;
  - periodo correto;
  - congregacao selecionada.
- Abrir a folha/modal do registro automaticamente ao resolver.
- Pendencia ignorada com data em que parou de ser cobrada.
- Botao para trazer pendencia ignorada de volta.

### Observacao

O novo tem pendencias e permite resolver/ignorar/reativar, mas esta mais simples
e sem filtro agrupado com contagem.

## Impressao e PDFs

### Faltando no novo

- Previa obrigatoria antes de baixar/imprimir, conforme padrao novo registrado.
- Impressao direta das telas antigas por `PrintPortal/usePrint`.
- Ajuste de fonte de impressao aplicado a:
  - programacao;
  - temas;
- PDF/impressao da programacao com saidas futuras tratadas de forma especial.
- Impressao do que esta filtrado na tela de Temas.

## WhatsApp e mensagens

### Faltando no novo

- `Pedir confirmacao` no compromisso da programacao.
- `Enviar datas livres` em Congregacoes.
- `Enviar por WhatsApp` em Intercambios.
- Builders de mensagem equivalentes ao antigo:
  - confirmacao de discurso;
  - datas disponiveis;
  - intercambios.
- Resultado de abertura com feedback claro:
  - abriu;
  - telefone ausente;
  - popup bloqueado;
  - outro erro.
- Registrar somente que o WhatsApp foi aberto, sem afirmar envio.

### Reclassificado para Minha Agenda/Quadro

- `Enviar por WhatsApp` em Designacoes por orador.
- Builder de mensagem de designacoes pessoais do orador.
- Registro de aviso pessoal por reuniao/designacao.

## Componentes/UX do antigo que faltam

- `Sheet` lateral/baixo para edicao, mais confortavel no celular.
- `Picker` dedicado com detalhes e avisos por opcao.
- `EmptyState` mais explicativo.
- Cards de detalhe antes da edicao.
- Badges consistentes por status.
- Botoes compactos por card.

## Itens que nao devem voltar

- Duas secoes.
- S1.
- Segundo orador usado para representar duas secoes.
- Qualquer regra que dependa de secao.
- Campos de busca.
- Campo de observacoes na programacao.
- Copiar tema visual antigo.
