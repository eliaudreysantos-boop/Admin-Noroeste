# Integracao Minha Agenda

Este documento guia a finalizacao do app Minha Agenda. Ele deve ser lido junto
com `PADROES-REAPROVEITAVEIS.md`, `INTEGRACAO-SECRETARIO.md` e os documentos
dos modulos que alimentam compromissos pessoais.

Decisao base: Minha Agenda e o app publico de cada publicador. Ele nao cria
escala, nao recalcula designacoes e nao altera dados administrativos dos
modulos. Ele apenas consome eventos, permite envio do relatorio pessoal ao
Secretario e centraliza compartilhamentos pessoais.

Decisao arquitetural de 11/09/2026: Minha Agenda deixou de ser um modulo do
painel administrativo e passou a ter app, manifesto, service worker e link
proprios em `/agenda/`. Sua politica e offline-first; os demais modulos
permanecem online-first. Os detalhes estao em
`ARQUITETURA-PWA-E-SINCRONIZACAO.md`.

## Escopo final

Minha Agenda tera tres telas:

- Agenda pessoal: compromissos da pessoa, por mes, com lista e calendario.
- Relatorio: envio mensal do relatorio de servico e acompanhamento do ano de
  servico.
- Quadro de Anuncios: designacoes publicas de todas as reunioes/modulos, com
  filtros e compartilhamento.

O formato pode ser abas, menu compacto ou navegacao estilo modulo. A escolha
deve seguir o layout padrao do app e funcionar bem no celular.

## Contratos de dados

### Identidade

- Todo acesso pessoal depende do `masterId` escolhido no select do app.
- O Admin e o unico que cria pessoa, ID e telefone.
- Minha Agenda seleciona a pessoa e usa os dados recebidos do cadastro central;
  nao cria usuario nem permissao administrativa.
- Nome e telefone nao devem ser editados em Minha Agenda.
- Se a pessoa salva nao existir mais ou estiver inativa, voltar ao select.

### Eventos pessoais

Cada modulo deve expor dados suficientes para a agenda por:

- `masterId`;
- data;
- horario, quando existir;
- titulo;
- detalhe publico;
- local;
- origem/modulo;
- status.

Minha Agenda nao deve recalcular escalas. Ela deve usar adapters de leitura,
como `collectAgendaEvents`, e mostrar exatamente o que os modulos donos
registraram.

### Quadro de Anuncios

O Quadro usa dados publicos agregados, como `collectAnnouncementEvents`.

- Pode mostrar pessoas envolvidas, datas, locais, origem e status.
- Nao deve mostrar telefone.
- Nao deve mostrar observacao administrativa.
- Nao deve mostrar contato privado de congregacao.
- Nao deve confirmar nem alterar designacoes.

### Relatorio para Secretario

- Minha Agenda envia para `secretario/relatorios`.
- `masterId` e obrigatorio.
- Competencia usa `YYYY-MM`.
- Origem deve ser `minha_agenda`.
- Pessoa pode enviar/editar enquanto a competencia estiver aberta.
- Pessoa nao pode editar meses fechados pelo Secretario.
- Se o Secretario lancou o relatorio manualmente, Minha Agenda nao deve
  sobrescrever esse registro.
- O Secretario revisa, ajusta se necessario, fecha e reabre a competencia.

## Assinatura ICS e calendario

### Estado atual

O app ja gera arquivos `.ics` pontuais:

- baixar agenda do mes;
- baixar proximos compromissos.

Isso e util, mas nao e assinatura. O usuario precisa baixar de novo quando a
agenda mudar.

### Objetivo da assinatura

Permitir que a pessoa assine um calendario no celular, Google Calendar, Apple
Calendar ou Outlook e receba atualizacoes automaticamente quando os modulos
mudarem.

### Limitacao importante

Assinatura ICS exige uma URL estavel que retorne o calendario atualizado. Um
download local de `.ics` nao atualiza sozinho depois de importado.

Para uma assinatura real, precisamos de uma destas opcoes:

- endpoint publico/privado no Firebase Hosting/Cloud Functions;
- arquivo `.ics` publicado em Storage com URL estavel e atualizado pelo app;
- feed gerado por uma rota do app, se a hospedagem permitir servir conteudo
  dinamico por pessoa.

### Recomendacao

Implementar em duas etapas:

1. Agora: manter download ICS e adicionar painel explicando a diferenca entre
   baixar e assinar, com botoes claros.
2. Depois: criar assinatura por token publico aleatorio por `masterId`, sem
   expor ID interno na URL.

### Modelo recomendado de assinatura

Havera dois tipos de assinatura:

- Assinatura pessoal por ID/select: a pessoa seleciona seu nome/ID e assina
  somente sua propria agenda.
- Assinatura do Quadro por modulos: a pessoa assina um calendario publico com
  tudo que vier dos modulos escolhidos.

#### Assinatura pessoal por ID/select

- Criar um token por pessoa:
  - caminho sugerido: `agenda/assinaturas/{masterId}`;
  - campos: `token`, `tipo: pessoal`, `masterId`, `ativo`, `criadoEm`,
    `revogadoEm`.
- URL da assinatura:
  - `/agenda/ics/{token}.ics`, se houver endpoint dinamico;
  - ou URL de Storage para `agenda/ics/{token}.ics`, se o app gerar arquivo.
- O token deve ser longo e aleatorio.
- Deve existir botao para revogar e gerar novo link.
- O feed deve conter apenas eventos publicos/pessoais daquela pessoa.
- Nao incluir telefone, observacoes administrativas nem dados do relatorio.
- Usar timezone `America/Fortaleza`.
- Preservar UID estavel por evento, para calendarios atualizarem sem duplicar.
- Aplicar lembretes conforme a configuracao do modulo de origem.

#### Assinatura do Quadro por modulos

- Criar token separado para o Quadro:
  - caminho sugerido: `agenda/assinaturasQuadro/{token}`;
  - campos: `tipo: quadro`, `modulos`, `ativo`, `criadoEm`, `revogadoEm`.
- Modulos assinaveis:
  - Escala TPL;
  - Tarefas;
  - Oradores;
  - Vida e Ministerio.
  - Servico de Campo.
- O usuario pode assinar:
  - todos os modulos;
  - apenas alguns modulos marcados em checkboxes.
- O feed do Quadro e publico, mas deve continuar sem telefone, observacoes
  administrativas, contatos privados e dados de relatorio.
- A assinatura do Quadro nao filtra por pessoa. Ela mostra a programacao publica
  das reunioes e designacoes agregadas.
- Cada evento precisa manter UID estavel por origem/id para evitar duplicacao no
  calendario externo.
- Alarmes do Quadro ficam desligados por padrao, com opcao de ativar por modulo
  se isso for desejado.

### Conteudo do ICS

Cada evento deve preencher:

- `UID`: origem + id do evento + token/namespace estavel;
- `DTSTAMP`: momento da geracao;
- `DTSTART`: data e horario quando houver;
- `DTEND` ou duracao padrao quando houver horario;
- `SUMMARY`: titulo curto;
- `DESCRIPTION`: origem, detalhe e status;
- `LOCATION`: local publico.

Quando nao houver horario, usar evento de dia inteiro.

### Lembretes do ICS por modulo

Os lembretes devem ser configuraveis por modulo. A regra recomendada e: o modulo
dono escolhe a politica de lembretes, e Minha Agenda aplica essa politica ao
gerar o ICS com `VALARM`.

Modelo aplicado no Admin:

- Configuracao global: `agenda/config/icsReminders`.
- Configuracao por modulo:
  - `agenda/config/icsReminders/tarefas`;
  - `agenda/config/icsReminders/limpeza`;
  - `agenda/config/icsReminders/escala`;
  - `agenda/config/icsReminders/oradores`;
  - `agenda/config/icsReminders/programacao`.
  - `agenda/config/icsReminders/servicoCampo`;
  - `agenda/config/icsReminders/quadro`.
- Campos por modulo:
  - lista com zero, um ou dois offsets;
  - lista vazia significa nenhum lembrete naquele modulo;
  - a mensagem do alarme sera definida pela Minha Agenda a partir do evento.
- Formato dos offsets:
  - `P7D` para 1 semana antes;
  - `P1D` para 1 dia antes;
- `PT2H` para 2 horas antes.

O Admin ja permite selecionar `P1D`, `P2D`, `P3D`, `P7D` e `P14D` para cada
um dos dois lembretes. O suporte a offsets em horas fica reservado para quando
houver uma necessidade real.

Defaults recomendados:

- Minha Agenda pessoal: `P7D` e `P1D`.
- Vida e Ministerio: `P7D` e `P1D`.
- Oradores: `P7D` e `P1D`.
- Tarefas: `P7D` e `P1D`.
- Limpeza: `P1D`.
- Escala TPL: `P1D`.
- Servico de Campo: `P1D` na agenda pessoal do dirigente.
- Quadro de Anuncios: sem alarme por padrao, ou `P1D` apenas se o usuario
  ativar.

Exemplo de saida no `.ics`:

```ics
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Lembrete: compromisso da Minha Agenda
TRIGGER:-P1D
END:VALARM
```

Regras importantes:

- Lembrete so deve entrar em evento com data valida.
- Para evento sem horario, tratar como evento de dia inteiro.
- O publicador pode desligar alarmes do feed pessoal se o app oferecer essa
  preferencia.
- O Quadro deve ter alarmes desligados por padrao para evitar excesso de
  notificacoes.
- A configuracao do modulo nao deve alterar o compromisso original, apenas a
  forma como ele sai no ICS.

### Periodo do feed

Para evitar calendario gigante:

- incluir eventos de 2 meses anteriores;
- incluir eventos de 12 meses futuros;
- ordenar por data/hora.

## Quadro de Anuncios - cards expansíveis

O Quadro deve funcionar como uma central de consulta e compartilhamento, sem
editar os modulos donos.

### Card expansivel: calendario

- Mostrar calendario mensal com os dados ja preenchidos pelos modulos.
- Permitir filtro por modulo:
  - Escala TPL;
  - Tarefas;
  - Oradores;
  - Vida e Ministerio.
  - Servico de Campo.
- Ao expandir um dia, listar eventos daquele dia com origem, horario, local,
  pessoas envolvidas e status publico.
- Nao mostrar telefone nem observacoes administrativas.

### Card expansivel: dados das reunioes

- Gerar texto do periodo filtrado para copiar.
- Botao `Copiar texto`.
- Botao `WhatsApp`.
- O WhatsApp deve abrir o link do grupo quando existir link configurado.
- Link configuravel recomendado:
  - caminho novo: `agenda/config/quadroWhatsAppLink`;
  - fallback temporario: `escala/settings/groupWhatsAppLink`, que ja existe no
    app Escala TPL.
- O texto deve ser editavel antes de abrir WhatsApp quando a acao for
  compartilhamento livre.
- O app nao deve escolher telefone de pessoa automaticamente.

### Card expansivel: PDFs gerados

- Listar documentos dos modulos com select de periodo.
- Nao gerar nem alterar dados dos modulos donos; apenas chamar documentos ja
  existentes quando houver permissao.
- PDFs disponiveis previstos:
  - Tarefas: PDF do periodo;
  - Limpeza: PDF do periodo;
  - Oradores: PDF da programacao;
  - Vida e Ministerio: S-89/S-140 quando aplicavel.
  - Servico de Campo: programacao mensal A4 retrato;
  - Admin: PDFs avulsos publicados deliberadamente para consulta.
- Todo PDF deve seguir o padrao obrigatorio de previa antes de baixar/imprimir.
- Se um PDF ainda depender de permissao administrativa, mostrar estado
  indisponivel em vez de expor acao ao publicador.

## Padroes reaproveitaveis nos dois sentidos

### Da Minha Agenda para outros apps

- `public event adapter`: cada modulo entrega eventos prontos para agenda e
  quadro, sem recalculo fora do modulo dono.
- Assinatura ICS por token: pode virar padrao para qualquer feed publico ou
  pessoal futuro.
- Calendario mensal com lista do dia: pode ser usado em Oradores, Escala TPL e
  Vida e Ministerio para conferir programacoes.
- Compartilhamento editavel sem telefone automatico: deve substituir mensagens
  antigas por reuniao nos modulos operacionais.
- Quadro derivado sem tabela nova: permite criar visoes publicas sem duplicar
  dados.
- Separacao entre dado publico e dado administrativo: deve orientar todos os
  adapters que alimentam a agenda.
- Card expansivel de documentos por periodo: pode padronizar consulta/preview
  de PDFs em modulos com muitos documentos.

### De outros apps para Minha Agenda

- Do Secretario:
  - ciclo de competencia fechada/reaberta para bloquear edicao de relatorio;
  - origem `minha_agenda` vs `secretario`;
  - ano de servico setembro-agosto;
  - badge de origem/revisao;
  - previa obrigatoria em PDFs.
- De Oradores:
  - status de confirmacao/reconfirmacao;
  - tipos visualmente distintos: local, visitante e saida;
  - datas e locais de intercambio;
  - eventos prontos para agenda pessoal e quadro.
- De Vida e Ministerio:
  - adapters com sala, horario, ajudante/substituto e status;
  - preservacao de edicoes manuais do modulo dono;
  - documentos por semana/periodo.
- De Limpeza:
  - consumo de grupos do Secretario sem copiar estrutura;
  - periodo persistente;
  - leitura pela Minha Agenda sem recalcular escala.
- De Tarefas:
  - periodo persistente;
  - pendencias acionaveis;
  - conflitos/status publico por designacao;
  - PDF por periodo com ajuste de fonte.
- Da Escala TPL:
  - calendario por dia/horario/local;
  - link de grupo do WhatsApp ja configuravel em `settings.groupWhatsAppLink`;
  - exportacao ICS/agenda para compromissos de campo quando aplicavel.

## Fases de implementacao

**Status em 11/09/2026:** fases 1 a 10 concluidas no codigo. A assinatura usa uma
Netlify Function, tokens aleatorios revogaveis e janela de dois meses anteriores
ate doze meses futuros. A validacao posterior com dados reais nao bloqueia o
fechamento funcional com os dados de exemplo.

### Fase 10 - App proprio e offline-first

- [x] Criar entrada, manifesto e service worker em `/agenda/`.
- [x] Remover Minha Agenda do menu e das permissoes do painel administrativo.
- [x] Abrir o ultimo snapshot sanitizado antes da rede.
- [x] Atualizar dados pelo Firebase em ciclo de 24 horas ao abrir/retomar.
- [x] Verificar nova versao hospedada em ciclo de sete dias.
- [x] Manter os modulos administrativos online-first.

### Fase 1 - Auditoria do app atual

Objetivo: confirmar o que ja esta pronto e separar lacunas reais.

- Revisar `src/modules/individual.ts`.
- Revisar `src/modules/individual-domain.ts`.
- Revisar `tests/individual-domain.test.mjs`.
- Conferir se as tres telas ja aparecem corretamente:
  - Agenda;
  - Relatorio;
  - Quadro.
- Listar divergencias entre o app atual e este MD.

Verificacao:

- Rodar testes de Minha Agenda.
- Rodar build geral.

### Fase 2 - Contrato de eventos pessoais

Objetivo: garantir que todos os modulos alimentem Minha Agenda de forma
consistente.

- Conferir adapters de:
  - Tarefas;
  - Limpeza;
  - Escala TPL;
  - Oradores;
  - Vida e Ministerio.
  - Servico de Campo.
- Garantir que eventos tenham `masterId`, data, horario, local e status quando
  aplicavel.
- Remover qualquer dado administrativo do detalhe publico.
- Garantir que Oradores inclua local, visitante e saida.
- Garantir que Vida e Ministerio inclua sala principal e nao dependa de sala
  B/C para Noroeste.

Verificacao:

- Testes cobrindo ao menos um evento de cada origem.
- Quadro deve agrupar eventos por origem e pessoas envolvidas.

### Fase 3 - Tela Agenda

Objetivo: transformar a agenda pessoal em tela final de uso diario.

- Manter seletor de mes.
- Manter calendario mensal e lista.
- Melhorar estados vazios.
- Adicionar filtro por origem/status se a lista ficar grande.
- Mostrar badges consistentes por origem e status.
- Mostrar horario/local quando existir.
- Adicionar compartilhamento por WhatsApp com texto editavel, sem telefone
  automatico.
- Manter download ICS do mes e proximos compromissos.

Verificacao:

- Pessoa com varios compromissos ve calendario e lista sem sobreposicao.
- Pessoa sem compromisso ve estado vazio claro.
- Compartilhamento usa apenas dados publicos.

### Fase 4 - Relatorio e ano de servico

Objetivo: fechar o fluxo com o Secretario.

- Exibir categoria do publicador conforme Secretário.
- Publicador comum informa:
  - participou no ministerio;
  - estudos biblicos.
- Pioneiro auxiliar informa horas do mes quando aplicavel.
- Pioneiro regular acompanha horas do mes e meta anual de 600.
- Mostrar ano de servico de setembro a agosto.
- Mostrar historico de relatorios enviados no ano.
- Bloquear edicao quando a competencia estiver fechada.
- Mostrar quando o relatorio foi revisado/lancado pelo Secretario.
- Nao sobrescrever relatorio com origem `secretario`.

Verificacao:

- Enviar relatorio novo.
- Editar relatorio aberto enviado pela pessoa.
- Tentar editar mes fechado e confirmar bloqueio.
- Confirmar que o Secretario ve badge `Enviado pela pessoa`.

### Fase 5 - Quadro de Anuncios

Objetivo: substituir os avisos por reuniao dos modulos operacionais.

- Usar `collectAnnouncementEvents`.
- Manter filtros por:
  - mes;
  - origem/modulo;
  - status.
- Permitir assinatura ICS do Quadro por modulos:
  - todos;
  - Escala TPL;
  - Tarefas;
  - Oradores;
  - Vida e Ministerio.
- Adicionar card expansivel com calendario do Quadro.
- Adicionar card expansivel com dados das reunioes:
  - botao copiar texto;
  - botao WhatsApp usando link de grupo configuravel.
- Adicionar card expansivel de PDFs gerados, com select de periodo.
- Compartilhar lista filtrada por WhatsApp, com texto editavel.
- Nao escolher telefone automaticamente.
- Nao mostrar dados administrativos.
- Nao permitir editar/confirmar designacoes pelo Quadro.

Verificacao:

- Compartilhar quadro completo.
- Compartilhar quadro filtrado por modulo.
- Conferir que telefone/observacao administrativa nao aparecem.

### Fase 6 - ICS download melhorado

Objetivo: deixar o ICS pontual confiavel antes da assinatura real.

- Garantir `UID` estavel por evento.
- Garantir timezone `America/Fortaleza`.
- Suportar evento com horario e evento de dia inteiro.
- Suportar `VALARM` com lembretes por modulo.
- Escapar virgula, ponto e virgula, barra invertida e quebra de linha.
- Adicionar nomes claros:
  - `minha-agenda-{YYYY-MM}.ics`;
  - `minha-agenda-proximos-compromissos.ics`.
- Adicionar mensagem curta na tela explicando que download nao e assinatura.

Verificacao:

- Teste unitario para evento com horario.
- Teste unitario para evento sem horario.
- Teste unitario para dois lembretes no mesmo evento.
- Teste unitario para Escala TPL com apenas um lembrete de 1 dia.
- Abrir arquivo em calendario externo se possivel.

### Fase 7 - Assinatura ICS real

Objetivo: planejar e implementar URL atualizavel quando a hospedagem permitir.

- Escolher abordagem:
  - Cloud Function/Hosting endpoint;
  - Storage com arquivo atualizado;
  - rota dinamica equivalente.
- Implementar token por pessoa para assinatura pessoal.
- Implementar token por conjunto de modulos para assinatura do Quadro.
- Permitir configuracao de lembretes por modulo no feed assinado.
- Criar botoes:
  - `Copiar link de assinatura`;
  - `Revogar link`;
  - `Gerar novo link`.
- Na assinatura pessoal, gerar a partir do ID/select da pessoa.
- Na assinatura do Quadro, gerar a partir dos modulos marcados.
- Gerar feed com janela de 2 meses anteriores e 12 meses futuros.
- Nao expor `masterId` na URL.
- Nao exigir login no app de calendario, porque clientes ICS normalmente nao
  conseguem autenticar fluxo web comum.

Verificacao:

- Link abre `.ics` atualizado.
- Revogar token invalida link antigo.
- Novo token gera feed novo.

### Fase 8 - Polimento visual e mobile

Objetivo: deixar as tres telas coerentes com o restante do app.

- Usar o layout padrao do app.
- Evitar pagina explicativa/landing page.
- Garantir que tabs/menu funcionem bem no celular.
- Garantir que cards/listas nao tenham texto estourando.
- Padronizar badges de origem/status.
- Reaproveitar estilos de `program-summary`, `agenda-event`, `form-panel` e
  acoes compactas.

Verificacao:

- Conferir desktop e mobile.
- Conferir Admin como conta teste.

### Fase 9 - Auditoria final

Objetivo: fechar Minha Agenda depois do Secretario e antes de publicar.

- Rodar testes de Minha Agenda.
- Rodar testes de Secretario relacionados a relatorios.
- Rodar build.
- Atualizar `PADROES-REAPROVEITAVEIS.md` com novos aprendizados:
  - assinatura ICS;
  - adapters de evento publico;
  - compartilhamento editavel;
  - bloqueio por competencia fechada.

## O que nao entra em Minha Agenda

- Criar ou editar pessoa, ID e telefone.
- Alterar escala/programacao dos modulos donos.
- Confirmar designacoes por outros modulos.
- Mostrar telefone no Quadro.
- Mostrar observacoes administrativas no Quadro.
- Enviar WhatsApp automaticamente para telefone escolhido pelo app.
- Criar tabela propria de anuncios enquanto o quadro derivado atender.

## Decisoes fechadas

- A assinatura ICS entrou antes do fechamento da Minha Agenda.
- O endpoint dinamico e `/.netlify/functions/calendar`.
- O proprio publicador gera sua assinatura; o Admin tambem pode gerar por
  pessoa usando o seletor vinculado por ID.
- O link do grupo pertence ao Admin em `agenda/config/quadroWhatsAppLink`.
- O Quadro possui cards expansivos para calendario, texto das reunioes, PDFs
  publicados por periodo e assinatura dos modulos escolhidos.
