# Plano final de conclusao do Admin SPA

Atualizado em 11/09/2026.

Este documento substitui, para as etapas que ainda faltam, os planos espalhados
na antiga pasta de arquivos Markdown. Ele deve continuar utilizavel mesmo depois
que essa pasta de referencias for apagada.

## Estado confirmado do projeto

- Repositorio principal: `admin-spa`.
- Baseline auditada: commit `662a4fd`.
- Build de producao concluido sem erros.
- Suite completa com 126 testes aprovados.
- Admin/Mestre, Tarefas, Limpeza, Oradores, Escala TPL, Vida e Ministerio,
  Secretario, Servico de Campo e Minha Agenda ja possuem seus fluxos principais.
- Os dados atuais sao exemplos para validar o aplicativo. A revisao e o
  saneamento dos dados reais ocorrerao depois do fechamento funcional.
- Nao sera adotado Firebase Authentication. O acesso administrativo continua
  sendo concedido e controlado pelo Admin do aplicativo.

## Decisoes permanentes

### Identidade central

- O Admin e a unica origem de pessoa, `masterId`, nome e telefone.
- `masterId` e permanente e nao pode ser derivado de nome ou telefone.
- Telefones compartilhados entre pais, filhos ou familiares sao permitidos.
- Os outros modulos selecionam pessoas existentes e guardam somente o
  `masterId`; nao criam cadastros paralelos.
- Todo usuario administrativo deve ser vinculado a uma pessoa existente.
- Senhas e permissoes de modulos continuam no cadastro administrativo atual.

### Minha Agenda

- Continua no mesmo repositorio e dominio, como PWA propria em `/agenda/`.
- A primeira utilizacao apresenta um select de pessoas ativas.
- Depois da escolha, o `masterId` fica travado no aparelho.
- Nao deve existir botao visivel `Trocar pessoa`.
- O desbloqueio ocorre com sete toques no nome da pessoa e confirmacao da senha
  Admin. Depois disso o app volta ao select inicial.
- Quem possui acesso administrativo entra pelo login normal e ve Minha Agenda
  como um card junto dos modulos autorizados.
- Quem nao possui modulos administrativos usa diretamente Minha Agenda, sem
  conta administrativa adicional.
- Consulta da agenda de outras pessoas pertence ao Admin. O usuario comum nunca
  troca livremente de identidade.

### Sincronizacao

- Minha Agenda e offline-first: abre o ultimo snapshot sanitizado da pessoa.
- Ao abrir ou retomar, verifica o Firebase quando o snapshot tiver 24 horas ou
  mais. A implementacao pode atualizar antes quando uma operacao exigir dados
  atuais, como o envio de relatorio.
- Os modulos administrativos sao online-first e usam o Firebase como fonte
  principal.
- A verificacao semanal da Netlify significa atualizacao da casca publicada e
  do service worker; a Netlify nao e um segundo banco de dados.
- Rascunhos de relatorio nunca sao enviados pela sincronizacao automatica.

## Auditoria modulo a modulo

Auditoria de codigo atualizada em 11/09/2026. A suite possui 126 testes e o
build de producao esta aprovado. `Concluido no codigo` significa que nao foi
encontrada lacuna funcional conhecida no dominio; ainda exige a homologacao de
interface descrita ao final deste documento.

### Admin/Mestre - concluido no codigo

Confirmado:

- cadastro central de pessoas, nome, telefone e `masterId` permanente;
- telefone compartilhado permitido sem fundir pessoas;
- criacao e edicao de usuarios e permissoes por modulo;
- backup completo, validacao antes de restaurar e relatorio sanitizado de
  falhas de vinculo;
- configuracao de congregacao, reunioes, lembretes ICS e WhatsApp do Quadro;
- upload de PDF para o Quadro com previa obrigatoria;
- select de pessoa obrigatorio no cadastro de usuario e preservacao de
  `usuario.masterId`;
- usuarios ativos sem vinculo incluidos no relatorio de falhas;
- Minha Agenda exibida no indice de modulos;
- backup e auditoria leem apenas as raizes publicas, sem enumerar tokens ICS;
- dez testes de dominio, backup e regras aprovados.

Falta:

- vincular manualmente as contas administrativas antigas as pessoas corretas
  quando os dados reais forem revisados;
- publicar as regras e as funcoes privadas da assinatura na Fase 6.

### Tarefas - concluido no codigo

Confirmado:

- geracao mensal ou bimestral, por todas as funcoes ou por funcao;
- regras de reuniao, elegibilidade, duplas, conflitos e excecoes;
- preservacao de edicoes manuais e geracao apenas de datas pendentes;
- publicacao como fronteira: rascunho nao aparece em Minha Agenda;
- reabertura, limpeza controlada, pendencias e vinculo por `masterId`;
- previa de impressao com ajuste de fonte e paginacao;
- mensagens comuns de reuniao nao sao enviadas por este modulo;
- quinze testes aprovados.

Falta apenas na homologacao:

- conferir a previa e a impressao em A4 no navegador usado em producao;
- testar publicar, reabrir e editar manualmente em tela pequena.

### Limpeza - concluido no codigo

Confirmado:

- escala mensal ou bimestral e rodizio estavel;
- grupos proprios ou aproveitamento opcional dos grupos do Secretario;
- configuracao de superintendente, ajudantes e dias de reuniao;
- PDF A4 com reducao de fonte, previa obrigatoria e publicacao no Quadro;
- ausencia de textos, aprovacoes e mensagens por reuniao;
- descricao do menu corrigida para `Grupos, rodizio e PDF`;
- cinco testes aprovados.

Falta apenas na homologacao:

- homologar a previa com grupos reais e semanas na virada de mes.

### Oradores - concluido com reforco de teste documental

Confirmado:

- lista unica de oradores locais e visitantes;
- cadastro de orador sem campo proprio de observacao;
- edicao e exclusao nao sao bloqueadas porque um tema ja foi usado;
- programacao local, visitante e saida, congregacoes, eventos e conflitos;
- confirmacao, reconfirmacao, pendencias e acoes operacionais de WhatsApp;
- card `Aprovados para saida` com nome e numeros do repertorio, sem telefone;
- card `Emergencia` com texto e botao de copiar, sem PDF;
- filtros de programacao sem campo de busca;
- catalogo de temas e programacao com previa PDF;
- publicacao da programacao para o Quadro;
- testes reais de assinatura `%PDF`, paginacao, lista vazia, programacao e
  catalogo;
- quatorze testes aprovados.

Falta apenas na homologacao:

- homologar copiar texto, WhatsApp, previa e impressao em celular e desktop.

### Escala TPL - concluido no codigo

Confirmado:

- locais, dias, horarios, indisponibilidades e excecoes;
- varias escalas no mesmo dia e validacao de duplas;
- rodizio deterministico, edicao manual e preservacao de historico;
- publicacao por mes, snapshot dos nomes e bloqueio do mes publicado;
- reabertura sem expor rascunho em Minha Agenda ou no Quadro;
- previa de impressao com fonte ajustada;
- compromissos identificados como carrinho de testemunho publico, sem usar o
  rotulo `Servico de Campo`;
- separacao explicita do modulo Servico de Campo: pontos e horarios de carrinho
  nao podem ser importados como saidas de campo;
- mensagens comuns nao sao enviadas por este modulo;
- dezesseis testes aprovados.

Falta apenas na homologacao:

- conferir impressao com o maior numero esperado de horarios;
- conferir publicacao, despublicacao e snapshot de participante removido.

### Vida e Ministerio - concluido no codigo

Confirmado:

- importacao da programacao oficial e reimportacao sem apagar edicoes locais;
- designacoes, ajudantes, substitutos, elegibilidade e sugestoes;
- funcionamento somente com sala principal, sem exigir salas B ou C;
- pendencias, realizacao, confirmacao e lembretes operacionais editaveis;
- S-89 e S-140 PDF com previa; S-140 DOCX por download;
- adapter para Minha Agenda e Quadro sem recalcular designacoes;
- dezenove testes aprovados.

Falta apenas na homologacao:

- testar uma importacao real da URL oficial;
- conferir S-89 individual, lote semanal e S-140 com dados representativos.

### Secretario - contrato de relatorios concluido no codigo

Confirmado:

- cadastro de grupos e publicadores por `masterId`;
- categorias, relatorios, atrasos, pendentes e lembretes por pessoa ou grupo;
- painel S-1, ano de servico, assistencia de meio e fim de semana;
- fechamento e reabertura simples da competencia;
- painel anual e documentos S-21, S-88 e S-3;
- PDF dos grupos em A4 retrato e lote S-21 em planilhas ZIP;
- previa dos PDFs gerados;
- chave canonica unica por `masterId + competencia`, gravacao transacional e
  migracao segura de IDs legados durante a edicao;
- origem, ultimo editor, revisao e estado do relatorio preservados;
- correcao pelo Secretario mantida depois do envio da pessoa;
- duplicidades legadas exibidas na tela e incluidas no relatorio de falhas;
- fechamento e reabertura atualizam o estado dos relatorios;
- o mesmo PDF selecionado precisa ser visualizado antes de poder virar template
  oficial;
- quinze testes aprovados.

Falta:

- homologar concorrencia real entre Minha Agenda e Secretario em dois clientes;
- sanear as duplicidades legadas somente na etapa futura de dados reais;
- manter `xlsx` restrito aos templates internos confiaveis.

### Servico de Campo - concluido no codigo

Confirmado:

- cadastro de modelos com local, dia, horario e rotulo;
- cadastro manual das saidas recorrentes, sem confundir pontos de carrinho da
  Escala TPL com horarios de servico de campo;
- qualquer quantidade de dirigentes no rodizio;
- mais de uma saida no mesmo dia;
- edicao manual preservada ao completar o mes;
- publicacao e reabertura por mes;
- PDF A4 retrato com previa e publicacao no Quadro;
- evento pessoal somente para o dirigente, com lembrete;
- evento coletivo no Quadro sem lembrete;
- quatro testes aprovados.

Falta apenas depois do fechamento funcional:

- preencher locais, horarios e dirigentes reais;
- comparar visualmente o PDF com o modelo atual fornecido pelo usuario.

### Minha Agenda - concluida no codigo, exceto publicacao ICS

Confirmado:

- PWA propria em `/agenda/` e snapshot pessoal sanitizado offline;
- quatro telas: Pessoal, Geral, Relatorio e Quadro;
- Pessoal usa somente o `masterId` selecionado e nunca procura por nome;
- Geral mostra calendario coletivo e somente a lista do dia selecionado;
- Relatorio inclui envio mensal e resumo do ano de servico/S-21;
- Quadro concentra texto copiavel, WhatsApp, arquivos e assinatura, sem repetir
  a lista mensal completa;
- arquivos publicados por periodo;
- download pontual ICS pessoal e do Quadro;
- leitura dos adapters sem recalcular os modulos;
- orador local com vinculo orfao nao aparece no Quadro apenas pelo nome; a
  excecao sem cadastro central continua restrita a orador visitante;
- rascunho mensal permanece apenas no aparelho ate o envio explicito;
- envio possui contagem cancelavel de 10 segundos, consulta atual ao Firebase e
  transacao que nunca sobrescreve relatorio oficial concorrente;
- depois do envio da pessoa ou de uma edicao do Secretario, o card fica travado
  para a pessoa e mostra origem e correcao;
- identidade local travada, sem botao visivel de troca, com desbloqueio por sete
  toques, senha Admin online e limite de tentativas;
- card Minha Agenda incluido para usuarios administrativos;
- assinatura pessoal e do Quadro isolada por instalacao no cliente e na API;
- vinte e oito testes aprovados, incluindo feed e assinatura de calendario.

Falta:

- homologar o envio concorrente e a falha de conexao em dois clientes reais;
- publicar e homologar as funcoes e regras da assinatura na ultima fase.

Dados de exemplo identificados durante a auditoria:

- Gabriel Augusto existe no Admin como `m_1d6d07f9`, mas os registros antigos de
  Tarefas e Oradores apontam para o `masterId` inexistente `m_46a6065b`;
- por seguranca, Minha Agenda nao deve tentar reparar isso por nome. O relatorio
  de falhas do Admin deve orientar a correcao do vinculo quando chegar a etapa de
  saneamento dos dados;
- esse vinculo orfao explica o discurso aparecer antes no Quadro pelo nome e nao
  aparecer na agenda pessoal de Gabriel. O adapter foi corrigido para nao
  publicar mais essa combinacao incoerente.

## Fase 1 - Contrato final dos relatorios

Concluida no codigo em 11/09/2026. Os cenarios de corrida em dois clientes e de
falha real de conexao permanecem na homologacao da Fase 5.

### Implementacao entregue

- Rascunho local, contagem cancelavel de 10 segundos e envio somente por acao
  explicita.
- Leitura atual do Firebase antes do envio e nova verificacao dentro de uma
  transacao sobre a raiz do Secretario.
- Chave canonica compartilhada por Minha Agenda e Secretario.
- Recusa atomica quando a competencia fecha ou outro relatorio surge durante a
  contagem, sem sobrescrever o registro oficial.
- Metadados de origem, ultimo editor, revisao, estado e identificador do envio.
- Edicao do Secretario preserva o criador e migra o ID legado para a chave
  canonica sem descartar registros concorrentes.
- Fechamento e reabertura atualizam os estados dos relatorios.
- Duplicidades legadas aparecem no Secretario e no relatorio de falhas do Admin.

### Regra funcional

- O relatorio comeca como rascunho local e permanece editavel no aparelho.
- `Enviar relatorio` e o comando explicito de gravacao oficial no Firebase.
- Ao clicar, o aplicativo consulta a versao atual do servidor.
- O botao entra no estado `Enviando em 10 segundos` e oferece `Cancelar envio`.
- Os 10 segundos sao uma janela para desfazer, nao uma espera tecnica de rede.
- Depois que o Firebase confirmar a gravacao, o card daquele mes fica
  definitivamente travado para a pessoa.
- Se o Secretario ja criou ou editou o relatorio daquele mes, o card tambem fica
  travado para a pessoa.
- O Secretario pode criar e corrigir o relatorio enquanto a competencia estiver
  aberta.
- O Secretario pode reabrir uma competencia fechada e continuar os ajustes.
- Nao existe fluxo de `devolver para correcao` ao publicador.
- Sem conexao, o rascunho permanece local e o aplicativo informa que precisa de
  internet para concluir o envio. Nao deve fingir que o relatorio foi entregue.

### Chave unica e concorrencia

- Deve existir exatamente um relatorio oficial para cada combinacao de
  `masterId` e competencia `AAAA-MM`.
- Minha Agenda e Secretario devem usar a mesma funcao para construir a chave
  canonica.
- Antes da mudanca, migrar ou sinalizar duplicidades criadas pelos IDs aleatorios
  antigos. Nenhum registro pode ser descartado silenciosamente.
- A gravacao da pessoa deve usar transacao do Firebase no registro canonico.
- A transacao da pessoa so cria o registro quando ainda nao existe relatorio
  oficial para aquela pessoa e competencia.
- Se surgir um registro durante a contagem de 10 segundos, a transacao deve
  recusar o envio, carregar a versao oficial e travar o card.
- Repetir a mesma requisicao nao pode criar uma duplicidade.

### Metadados recomendados

Cada relatorio oficial deve preservar:

```text
id
masterId
competencia
createdBy: pessoa | secretario
lastEditedBy: pessoa | secretario
status: enviado | revisado | fechado
revision
submissionId
recebidoEm
atualizadoEm
```

- `createdBy` nunca muda e alimenta o badge de origem.
- `lastEditedBy` informa se o Secretario corrigiu um envio da pessoa.
- Toda alteracao do Secretario incrementa `revision`.
- Fechar uma competencia impede alteracoes normais ate a reabertura.

### Apresentacao

Estados esperados na Minha Agenda:

- `Rascunho local`;
- `Enviando em 10s`;
- `Enviado por voce`;
- `Enviado por voce - ajustado pelo Secretario`;
- `Registrado pelo Secretario`;
- `Mes fechado`;
- `Falha no envio`.

O modulo Secretario deve continuar permitindo editar os registros recebidos e
mostrar quem criou o relatorio e quem fez a ultima alteracao.

### Homologacao obrigatoria

- Criar e enviar um relatorio novo.
- Cancelar durante os 10 segundos.
- Tentar reenviar o mesmo mes.
- Secretário criar antes da pessoa enviar.
- Secretário editar durante os 10 segundos.
- Aparelho usar cache antigo enquanto existe uma versao mais nova no Firebase.
- Falha de conexao durante o envio.
- Secretário corrigir relatorio enviado pela pessoa sem alterar `createdBy`.
- Fechar e reabrir a competencia.
- Detectar e relatar duplicidades legadas.

## Fase 2 - Identidade e acesso

Concluida no codigo em 11/09/2026. A escolha dos vinculos das contas antigas foi
deliberadamente deixada para a revisao dos dados reais, sem associacao por nome.

### Implementacao

- Remover `Trocar pessoa` da barra inferior de `/agenda/`.
- Manter o nome em uma area segura, fora da regiao reservada pela interface do
  aparelho e pela marca da Netlify.
- Contar sete toques consecutivos no nome e abrir confirmacao da senha Admin.
- Limitar tentativas e limpar a contagem depois de um intervalo curto.
- Ao confirmar, remover apenas a identidade local e retornar ao select.
- Adicionar `masterId` ao formulario de usuario administrativo.
- Impedir usuario administrativo sem pessoa vinculada.
- Parar de apagar `usuario.masterId` ao salvar o usuario.
- Mostrar Minha Agenda no indice de modulos do usuario autenticado.
- O Admin continua consultando terceiros por uma visao administrativa; nao usa
  a troca de identidade do aparelho para isso.

### Migracao

- Usuarios administrativos antigos sem `masterId` devem aparecer no relatorio
  de falhas do Admin.
- A migracao deve apenas sugerir ou solicitar vinculo. Nao associar por nome ou
  telefone automaticamente quando houver ambiguidade.
- Contas antigas continuam acessiveis durante a regularizacao, mas o fechamento
  para producao exige que as contas ativas estejam vinculadas.

### Testes obrigatorios

- Primeiro acesso e escolha da pessoa.
- Reabertura direta na Minha Agenda com identidade travada.
- Sete toques incompletos nao desbloqueiam.
- Sete toques mais senha incorreta nao desbloqueiam.
- Senha Admin correta retorna ao select.
- Usuario com modulos ve os cards autorizados e Minha Agenda.
- Usuario sem modulos abre somente Minha Agenda.
- Admin consulta outra pessoa sem assumir sua identidade.

## Fase 3 - Ajustes finais dos modulos auditados

Concluida no codigo em 11/09/2026.

- Corrigir a descricao do card de Limpeza.
- Exigir previa antes de salvar template PDF no Secretario.
- Adicionar testes reais dos PDFs de Oradores.
- Confirmar nos adapters que `Escala TPL` significa carrinho e `Servico de Campo`
  significa somente as saidas cadastradas no modulo proprio.
- Confirmar que nenhuma mensagem comum de reuniao voltou para Tarefas, Limpeza,
  Escala TPL ou Oradores; acoes de confirmacao e intercambio continuam no modulo
  dono.
- Rodar novamente os 126 testes e o build.

## Fase 4 - Dependencias e documentacao

Concluida no codigo em 11/09/2026:

- Firebase atualizado de 10.14.1 para 12.19.0;
- Vite atualizado de 5.4.21 para 8.3.0;
- Firebase Admin 14.4.0 adicionado apenas nas funcoes de servidor;
- vulnerabilidades corrigiveis removidas sem `--force`;
- permanecem somente os alertas conhecidos do `xlsx`, sem correcao publicada;
- build e os 126 testes aprovados depois da atualizacao.

- Atualizar os documentos mantidos no repositorio para remover a regra antiga
  que permitia ao publicador editar relatorio ja enviado.
- Manter neste documento o contrato canonico de relatorio e as decisoes que
  antes estavam espalhadas pelos MDs removidos.
- Manter a regra obrigatoria de previa para todo PDF gerado pelo aplicativo.
- Atualizar Firebase de forma controlada, sem `npm audit fix --force`, e executar
  novamente build e todos os testes.
- O pacote `xlsx` possui alertas sem correcao disponivel. Enquanto ele for
  mantido, deve processar apenas modelos internos e confiaveis; nao aceitar
  planilhas arbitrarias enviadas por usuarios.
- Avaliar substituicao futura de `xlsx` sem bloquear a geracao atual do lote
  S-21, desde que a restricao de entrada confiavel seja preservada.
- O aviso de bundle acima de 500 KB e uma melhoria de desempenho, nao um
  bloqueio funcional. Aplicar divisao adicional somente se a medicao em celular
  mostrar necessidade.

## Fase 5 - Homologacao funcional

Passagem de leitura em desktop concluida em 11/09/2026: todos os nove modulos
abriram com a conta Admin, o card Minha Agenda apareceu, o bloqueio por sete
toques abriu a confirmacao esperada e o console permaneceu sem erros. Nenhuma
gravacao nos dados de exemplo foi feita nessa passagem.

A concorrencia do envio de relatorio foi simulada localmente: o primeiro envio
e aceito, enquanto repeticao, registro legado existente e competencia fechada
sao recusados pela mesma decisao usada dentro da transacao do Firebase.

O empacotamento local das duas Netlify Functions tambem foi validado. Os testes
que ainda exigem publicacao, celular, calendario externo ou alteracao dos dados
foram mantidos abaixo para a homologacao final.

Executar com a conta Admin e dados de exemplo antes dos dados reais:

- login, restauracao de sessao, sair e voltar aos modulos;
- vinculacao entre usuario administrativo e pessoa;
- instalacao da PWA Minha Agenda em celular;
- abertura offline e atualizacao ao reconectar;
- envio definitivo de relatorio e bloqueio imediato do card;
- correcao pelo Secretario, badge de origem e ultima edicao;
- fechamento e reabertura de competencia;
- Pessoal, Geral, Relatorio e Quadro em telas pequenas;
- download pontual ICS pessoal e do Quadro;
- upload de PDF pelo Admin e exibicao no Quadro;
- previa obrigatoria dos PDFs dos modulos;
- console do navegador sem erros durante os fluxos principais;
- build e suite completa aprovados novamente.

## Fase 6 - Assinatura ICS, sempre por ultimo

O codigo da assinatura foi concluido em 11/09/2026. A publicacao das regras e
funcoes e o teste em calendarios reais continuam obrigatoriamente por ultimo.

### Implementacao entregue

- Cada instalacao recebe um identificador local aleatorio, diferente de
  `masterId`.
- Assinaturas pessoais e do Quadro sao independentes por instalacao.
- O navegador guarda somente os proprios tokens e nao carrega mais nenhuma
  colecao de assinaturas do Firebase.
- Criacao, alteracao e revogacao usam a Netlify Function
  `calendar-subscriptions`.
- O feed `calendar` consulta o token pelo Firebase Admin em
  `agendaAssinaturasPrivadas`.
- `database.rules.json` nega leitura e escrita publica dos caminhos de tokens e
  deixa explicitas as raizes publicas usadas pelo aplicativo.
- Backup, restauracao e auditoria foram adaptados para as raizes publicas e nao
  incluem segredos de assinatura.
- A URL do banco e a conta de servico sairam da funcao e usam
  `FIREBASE_DATABASE_URL` e `FIREBASE_SERVICE_ACCOUNT_JSON`.
- Tokens continuam opacos com 48 caracteres; revogados retornam `410`.
- O limite de dois `VALARM` por modulo foi preservado.
- Servico de Campo continua sem alarme no Quadro.
- Testes automatizados cobrem instalacoes independentes, propriedade, alteracao,
  revogacao, validacao, isolamento pessoal e filtros do Quadro.

### Publicacao obrigatoria

1. Configurar na Netlify `FIREBASE_DATABASE_URL` e
   `FIREBASE_SERVICE_ACCOUNT_JSON` conforme `.env.example`.
2. Publicar `database.rules.json` no projeto Firebase e confirmar que a leitura
   da raiz e de ambos os caminhos de assinatura retorna permissao negada.
3. Publicar o site e as duas Netlify Functions.
4. Gerar tokens novos; assinaturas antigas de `agenda/assinaturas` nao sao
   migradas nem reutilizadas.
5. Confirmar no endereco publicado os retornos `400`, `404`, `410` e `200` do
   feed sem registrar tokens em logs.

### Testes obrigatorios

- Duas instalacoes criarem assinaturas do Quadro com modulos diferentes.
- Alterar uma assinatura sem modificar a outra.
- Duas instalacoes da mesma pessoa possuirem revogacao independente.
- Cliente comum nao conseguir listar tokens.
- Token invalido, inexistente e revogado retornarem `400`, `404` e `410`.
- Feed pessoal retornar somente o `masterId` vinculado.
- Feed do Quadro retornar somente os modulos escolhidos.
- Mudanca publicada aparecer no mesmo link sem criar nova assinatura.
- Testar o link publicado em Google Calendar, Android e Apple Calendar; Outlook
  entra quando fizer parte do uso real.
- Avaliar inclusao de `VTIMEZONE` somente se algum calendario real nao
  interpretar corretamente `America/Fortaleza`.
- Registrar que o calendario externo escolhe seu proprio intervalo de
  atualizacao; o app nao promete sincronizacao instantanea.

### Criterio de conclusao da assinatura

- endpoint Netlify publicado e variaveis configuradas;
- regras Firebase publicadas e tokens nao enumeraveis pelo navegador;
- assinaturas independentes por instalacao e revogacao validadas;
- feed atualizado validado em calendario real;
- testes e build aprovados depois da publicacao.

## Itens posteriores ao fechamento funcional

Estes itens nao bloqueiam a conclusao do codigo:

- revisar e corrigir os dados reais;
- tratar registros sem `masterId`, orfaos e duplicados usando o relatorio de
  falhas do Admin;
- preencher link real do grupo de WhatsApp;
- configurar locais, dias, horarios e dirigentes reais do Servico de Campo;
- conferir documentos oficiais com dados reais;
- executar restauracao de backup somente quando houver necessidade real.

## Criterio para declarar o projeto finalizado

O projeto pode ser considerado funcionalmente finalizado quando:

1. As seis fases deste documento estiverem concluidas.
2. Minha Agenda nunca sobrescrever um relatorio oficial existente.
3. A pessoa nao conseguir trocar acidentalmente sua identidade local.
4. O Secretario continuar com poder de correcao e o historico de origem for
   preservado.
5. Todos os testes e o build estiverem aprovados.
6. A homologacao em celular e na publicacao Netlify estiver concluida.
