# Plano final de conclusao do Admin SPA

Atualizado em 11/09/2026.

Este documento substitui, para as etapas que ainda faltam, os planos espalhados
na antiga pasta de arquivos Markdown. Ele deve continuar utilizavel mesmo depois
que essa pasta de referencias for apagada.

## Estado confirmado do projeto

- Repositorio principal: `admin-spa`.
- Baseline auditada: commit `e1f68a5`.
- Build de producao concluido sem erros.
- Suite completa com 110 testes aprovados.
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

## Contrato final dos relatorios

Esta e a primeira fase obrigatoria restante.

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

### Testes obrigatorios

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

## Fase 3 - Dependencias e documentacao

- Atualizar os documentos mantidos no repositorio para remover a regra antiga
  que permitia ao publicador editar relatorio ja enviado.
- Registrar o contrato canonico de relatorio nos padroes reaproveitaveis.
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

## Fase 4 - Homologacao final

Executar com a conta Admin e dados de exemplo antes dos dados reais:

- login, restauracao de sessao, sair e voltar aos modulos;
- vinculacao entre usuario administrativo e pessoa;
- instalacao da PWA Minha Agenda em celular;
- abertura offline e atualizacao ao reconectar;
- envio definitivo de relatorio e bloqueio imediato do card;
- correcao pelo Secretario, badge de origem e ultima edicao;
- fechamento e reabertura de competencia;
- Agenda, Relatorio e Quadro em telas pequenas;
- download ICS e assinatura pessoal;
- assinatura do Quadro pelos modulos selecionados;
- feed publicado pela Netlify e revogacao de token;
- upload de PDF pelo Admin e exibicao no Quadro;
- previa obrigatoria dos PDFs dos modulos;
- console do navegador sem erros durante os fluxos principais;
- build e suite completa aprovados novamente.

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

1. As quatro fases deste documento estiverem concluidas.
2. Minha Agenda nunca sobrescrever um relatorio oficial existente.
3. A pessoa nao conseguir trocar acidentalmente sua identidade local.
4. O Secretario continuar com poder de correcao e o historico de origem for
   preservado.
5. Todos os testes e o build estiverem aprovados.
6. A homologacao em celular e na publicacao Netlify estiver concluida.
