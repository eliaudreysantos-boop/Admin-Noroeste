# Plano de melhorias e conclusao da Minha Agenda

Atualizado em 12/09/2026.

Este documento concentra as melhorias de interface, persistencia local,
sincronizacao e homologacao que ainda faltam na Minha Agenda. As regras aqui
descritas devem orientar a implementacao sem alterar os contratos de identidade,
`masterId`, relatorios oficiais ou assinaturas ICS ja concluidos.

## Estado atual confirmado

- Minha Agenda esta publicada em `https://admin-noroeste.netlify.app/agenda/`.
- A divisao em quatro telas esta correta: Pessoal, Geral, Relatorio e Quadro.
- A identidade fica travada no aparelho e o desbloqueio exige sete toques e
  senha Admin online.
- O snapshot pessoal e sanitizado e permite abertura offline.
- Rascunhos de relatorio permanecem locais ate o envio explicito.
- Assinaturas pessoais e do Quadro usam tokens independentes por instalacao.
- O Quadro possui texto por data, PDFs por periodo e assinatura atualizavel.
- Suite completa com 127 testes e build aprovados.

## Regra obrigatoria de persistencia da interface

Todo item clicavel que representa uma escolha ou estado duradouro da interface
deve continuar no mesmo estado depois de atualizar a pagina, fechar o PWA ou
reiniciar o aparelho. Essa persistencia deve usar `localStorage` e ser local ao
aparelho.

### Estados que devem ser persistidos

- tela ativa: Pessoal, Geral, Relatorio ou Quadro;
- mes selecionado em cada tela;
- filtros de origem e status;
- data selecionada no calendario Geral;
- data selecionada em `Dados das reunioes`;
- periodo selecionado em `Arquivos publicados`;
- paineis expansivos abertos ou fechados;
- selecao ainda nao publicada dos modulos da assinatura do Quadro;
- pessoa que o Admin escolheu para consultar;
- preferencia de exibir ou recolher o calendario da tela Pessoal;
- ultima visualizacao escolhida em Pessoal: proximos compromissos ou mes;
- rascunho do relatorio, como ja ocorre atualmente.

### Estados que nao devem ser persistidos

- modais de confirmacao abertos;
- contagem de dez segundos de um envio;
- estado visual de botoes `Copiar`, `Baixar`, `WhatsApp` ou `Enviar`;
- mensagens temporarias, erros e indicadores de carregamento;
- posicao de rolagem ao trocar de tela;
- senha Admin;
- dados oficiais de relatorio como se fossem preferencias locais.

### Contrato tecnico sugerido

Usar uma chave versionada e isolada por pessoa e contexto:

```text
noroeste_agenda_ui_v1:<masterId>:standalone
noroeste_agenda_ui_v1:<masterId>:admin
```

O valor deve ser um unico objeto JSON:

```json
{
  "screen": "agenda",
  "personal": {
    "month": "2026-09",
    "source": "todas",
    "status": "todos",
    "view": "upcoming",
    "calendarOpen": false
  },
  "general": {
    "month": "2026-09",
    "source": "todas",
    "status": "todos",
    "selectedDate": "2026-09-12"
  },
  "report": {
    "month": "2026-09"
  },
  "board": {
    "meetingDate": "2026-09-12",
    "documentPeriod": "2026-09",
    "openPanels": ["meetings"],
    "subscriptionModules": ["tarefas", "oradores", "programacao"]
  },
  "updatedAt": 1789200000000
}
```

Regras de restauracao:

- validar todo valor lido antes de usar;
- ignorar JSON corrompido e voltar aos padroes seguros;
- descartar datas ou periodos que nao existem mais;
- abrir hoje ou a proxima data com evento quando a data salva for invalida;
- nunca compartilhar preferencias entre duas pessoas no mesmo aparelho;
- limitar o tamanho do objeto e nunca copiar para ele o snapshot do Firebase;
- manter tokens ICS na chave propria ja existente, sem duplica-los neste objeto;
- atualizar o estado local imediatamente depois de cada clique que muda uma
  preferencia;
- restaurar o estado antes da primeira renderizacao para evitar saltos visuais.

## Auditoria das requisicoes

### Firebase: conforme na frequencia automatica

O aplicativo usa o cache local imediatamente e inicia uma nova sincronizacao
automatica quando o snapshot possui 24 horas ou mais. O horario da ultima
sincronizacao de pessoas e o `savedAt` do snapshot controlam essa janela.

Importante: `uma vez ao dia` significa um ciclo automatico de sincronizacao por
aparelho, nao uma unica requisicao HTTP. Durante o ciclo, o aplicativo consulta
em paralelo os caminhos publicos necessarios de cada modulo.

Operacoes abaixo devem continuar fora do limite diario porque sao comandos
explicitos ou precisam de consistencia atual:

- primeiro acesso sem cache;
- envio definitivo de relatorio;
- verificacao transacional antes de oficializar o relatorio;
- desbloqueio da pessoa com senha Admin;
- criacao, alteracao e revogacao de assinatura ICS;
- recuperacao manual solicitada pelo usuario, caso seja adicionada no futuro.

Rascunho de relatorio nunca deve ser enviado por sincronizacao automatica.

### Netlify: parcialmente conforme e precisa de correcao

A verificacao explicita do service worker ja possui intervalo de sete dias em
`refreshServiceWorkerWeekly`. Entretanto, a navegacao do service worker ainda e
`network-first`: sempre que Minha Agenda abre online, ele consulta `/agenda/` na
Netlify antes de usar o cache. Portanto, a regra semanal ainda nao esta cumprida
de forma estrita para o shell instalado.

Correcao obrigatoria:

1. Navegacoes do PWA instalado devem usar `cache-first` para `/agenda/`.
2. Se o shell nao existir no cache, usar a rede como fallback de primeiro acesso.
3. Consultar e atualizar o shell da Netlify somente quando o marcador local
   completar sete dias.
4. Depois da atualizacao, guardar o novo HTML e seus assets com hash.
5. Remover assets antigos que nao pertencem mais ao shell atual.
6. Guardar silenciosamente o shell novo para a proxima abertura.
7. Nao recarregar automaticamente enquanto existir modal, rascunho ou envio em
   andamento.
8. Nao mostrar aviso, botao ou data de atualizacao. O Admin avisara as pessoas
   quando uma nova versao precisar ser usada.

Excecoes legitimas ao limite semanal da Netlify:

- primeiro acesso ou reinstalacao sem cache;
- comandos de criar, alterar ou revogar assinatura;
- consulta do feed ICS feita pelo Google, Apple ou outro calendario externo;
- download iniciado pelo usuario;
- recuperacao de emergencia quando o cache local estiver ausente ou corrompido.

O calendario externo escolhe quando consultar o feed. Essa frequencia nao pode
ser limitada pelo PWA e nao deve ser confundida com a atualizacao semanal do
shell da Minha Agenda.

## Melhorias gerais de interface

### 1. Hierarquia e proximo compromisso

- Tornar `Proximo compromisso` o primeiro conteudo util da tela Pessoal.
- Mostrar data, horario, designacao, local e origem sem exigir abertura de card.
- Exibir em seguida uma lista curta dos proximos compromissos agrupada por data.
- Deixar o calendario mensal como area secundaria e expansivel.
- Reunir download, compartilhamento e assinatura em `Calendario e
  compartilhamento`.
- Recolher os filtros inicialmente e mostrar quando algum filtro estiver ativo.

Motivo: a pessoa normalmente abre o app para responder `o que tenho agora?`, e
nao para administrar o calendario.

### 2. Navegacao entre as quatro telas

- Manter as quatro telas em uma barra de abas sticky.
- Preservar uma unica linha em celular quando os rotulos couberem.
- Usar `Pessoal`, `Geral`, `Relatorio` e `Quadro` sem textos explicativos extras.
- Levar a rolagem ao topo do conteudo quando a tela mudar.
- Manter o estado da tela anterior no `localStorage`.
- Destacar a tela ativa com cor, contraste e `aria-selected`.

### 3. Atualizacao silenciosa

- Preservar preferencias e rascunhos durante a troca de versao.
- Nao interromper o envio de relatorio.
- Nao exibir ultima sincronizacao, aviso de versao ou botao para atualizar.
- Deixar a comunicacao de novas versoes sob responsabilidade do Admin.

## Melhorias por tela

### Pessoal

- Proximo compromisso em destaque.
- Lista futura como visualizacao inicial.
- Calendario mensal expansivel.
- Estado vazio com mensagem direta, sem grande grade vazia como foco principal.
- Filtros em painel compacto.
- Download pontual e assinatura dentro de uma unica area secundaria.

### Geral

- Selecionar hoje ou a proxima data com eventos automaticamente.
- Mostrar por padrao apenas hoje em diante, com opcao de consultar o passado.
- Substituir a repeticao de pontos verdes por marcadores de cor por modulo.
- Exibir no maximo tres marcadores e `+N` para os demais eventos do dia.
- Adicionar legenda curta das cores.
- Manter a lista detalhada somente para o dia selecionado.
- Tornar cada dia acessivel com data, quantidade e origens no nome do botao.

### Relatorio

- Remover mensagens duplicadas quando a pessoa ainda nao e publicadora.
- Dar maior destaque ao botao `Enviar relatorio` quando a competencia estiver
  disponivel.
- Exibir claramente `Rascunho local`, `Enviado`, `Ajustado pelo Secretario` ou
  `Fechado`.
- Manter o resumo do ano de servico, mas reduzir o peso dos cards quando todos
  estiverem zerados.
- Mostrar progresso de horas apenas para categorias que registram horas.
- Preservar o mes selecionado localmente.

### Quadro

- Abrir `Dados das reunioes` por padrao na primeira utilizacao.
- Mostrar no cabecalho a data e o tipo da reuniao selecionada.
- Persistir data e paineis abertos.
- Remover o seletor mensal superior; `Dados das reunioes` ja usa data e
  `Arquivos publicados` ja usa periodo.
- Manter Copiar e WhatsApp junto ao texto da reuniao.
- Mostrar quantidade de PDFs e estado da assinatura nos cabecalhos recolhidos.
- Manter meio de semana com Tarefas, Vida e Ministerio e Limpeza.
- Manter fim de semana com Tarefas, Oradores e Limpeza, incluindo saidas.

## Acessibilidade e celular

- Dar nome acessivel aos campos de mes.
- Nao depender apenas de cor, ponto ou texto de hover.
- Informar por leitor de tela a quantidade de eventos em cada data.
- Usar `role="tab"` e `aria-selected` nas quatro abas.
- Manter foco visivel em todos os controles.
- Preservar contraste dos estados pendente, alterado, realizado e futuro.
- Garantir alvos de toque com pelo menos 44 por 44 pixels.
- Aplicar `safe-area-inset-bottom` no iPhone.
- Reservar a regiao inferior direita para a marca da Netlify.
- Confirmar que nenhum controle fica coberto pela barra inferior ou pela marca.

## Fases de implementacao

Situacao em 12/09/2026:

- Fase 1 implementada e coberta por testes automatizados.
- Fase 2 implementada com atualizacao semanal silenciosa.
- Fases 3 e 4 implementadas e verificadas na interface local.
- Fase 5 depende da homologacao manual em calendarios, aparelhos e dados reais.

### Fase 1 - Persistencia local

- Criar helper unico para ler, validar, migrar e salvar o estado da interface.
- Aplicar a todas as escolhas persistentes listadas neste documento.
- Isolar por `masterId` e contexto.
- Corrigir rolagem ao trocar de tela.
- Adicionar testes de restauracao, JSON corrompido e troca de pessoa.

### Fase 2 - Contrato offline e Netlify semanal

- Tornar a navegacao do PWA `cache-first`.
- Manter primeiro acesso e recuperacao como `network fallback`.
- Atualizar o shell somente no ciclo semanal.
- Remover assets antigos sem apresentar aviso de versao.
- Testar abertura online, offline, cache vazio e atualizacao apos sete dias.

### Fase 3 - Pessoal e navegacao

- Implementar proximo compromisso e lista futura.
- Recolher calendario, filtros e acoes tecnicas.
- Tornar abas sticky e acessiveis.
- Validar layout em celular pequeno e desktop.

### Fase 4 - Geral, Relatorio e Quadro

- Simplificar marcadores do calendario Geral.
- Remover redundancias do Relatorio.
- Abrir e resumir corretamente os paineis do Quadro.
- Remover o mes superior redundante do Quadro.
- Persistir todas as escolhas dessas telas.

### Fase 5 - Homologacao real

- Executar `HOMOLOGACAO-ICS-DADOS-E-APARELHOS.md`.
- Testar Google Calendar, Android e Apple Calendar.
- Testar duas instalacoes e revogacao independente.
- Testar PWA offline, reconexao e nova versao.
- Testar concorrencia entre Minha Agenda e Secretario.
- Conferir dados reais somente depois do fechamento funcional.

## Testes automatizados obrigatorios

- estado da interface sobrevive a remount e reload;
- preferencias de duas pessoas nao se misturam;
- valores invalidos voltam ao padrao seguro;
- data removida volta para hoje ou proxima data valida;
- painel aberto e tela ativa sao restaurados;
- rascunho continua separado do estado visual;
- snapshot com menos de 24 horas nao consulta Firebase automaticamente;
- snapshot vencido inicia um unico ciclo automatico;
- envio de relatorio consulta o Firebase mesmo com cache recente;
- navegacao usa cache sem consultar Netlify antes de sete dias;
- cache vazio usa a rede;
- ciclo semanal baixa silenciosamente o shell novo;
- atualizacao nao interrompe rascunho ou envio;
- calendario Geral possui nome acessivel com quantidade de eventos;
- Quadro restaura data, periodo e paineis sem misturar pessoas.

## Criterio de conclusao

Minha Agenda pode ser considerada encerrada quando:

1. Todos os estados duradouros de itens clicaveis forem persistidos por pessoa
   no `localStorage`.
2. O PWA abrir pelo cache e consultar a Netlify automaticamente apenas no ciclo
   semanal, salvo as excecoes documentadas.
3. O Firebase mantiver um ciclo automatico por 24 horas, salvo comandos
   explicitos que exigem dados atuais.
4. Pessoal priorizar o proximo compromisso.
5. Geral, Relatorio e Quadro nao apresentarem controles ou mensagens redundantes.
6. Estado offline e falhas obrigatorias forem compreensiveis sem oferecer
   atualizacao manual de rotina.
7. Acessibilidade e layout forem homologados em celular e desktop.
8. O roteiro de ICS, aparelhos e concorrencia estiver integralmente aprovado.
