# Homologacao de ICS, aparelhos e dados reais

Atualizado em 12/09/2026.

Este roteiro valida o que nao pode ser comprovado apenas pelos testes
automatizados: assinatura em calendarios externos, comportamento em aparelhos
reais, atualizacao do feed, isolamento por pessoa e concorrencia dos relatorios.

## Estado antes da homologacao

- Aplicacao publicada em `https://admin-noroeste.netlify.app/`.
- Minha Agenda publicada em `https://admin-noroeste.netlify.app/agenda/`.
- Criacao, leitura e revogacao de assinatura ja validadas no servidor.
- Regras do Firebase publicadas; tokens nao podem ser enumerados pelo navegador.
- Suite automatizada com 160 testes e build aprovados.
- Cada instalacao possui identificador proprio e controla apenas seus tokens.

## Cuidados com os links

- Tratar todo link de assinatura como dado privado. Quem possuir o link consegue
  consultar aquele calendario.
- Nao colocar o link completo em prints, planilhas, mensagens ou neste documento.
- Registrar somente os seis primeiros caracteres do token quando for necessario
  distinguir assinaturas durante o teste.
- Revogar imediatamente uma assinatura cujo link tenha sido exposto.
- Usar `Copiar link` para obter a URL HTTPS. O botao `Assinar calendario` usa o
  protocolo `webcal` para abrir aplicativos compativeis.
- Uma assinatura e somente leitura. Alteracoes devem ser feitas nos modulos do
  aplicativo, nunca no calendario externo.

## Preparacao

1. Fazer backup completo pelo Admin e guardar o arquivo com data e hora.
2. Escolher uma pessoa de teste vinculada por `masterId`, com nome facil de
   reconhecer e pelo menos duas designacoes futuras.
3. Preparar eventos futuros identificaveis em Tarefas, Limpeza, Escala TPL,
   Oradores, Vida e Ministerio e Servico de Campo.
4. Incluir um discurso local e uma saida de orador em datas futuras.
5. Travar ou publicar os periodos exigidos por cada modulo. Rascunhos nao devem
   aparecer em Minha Agenda nem no Quadro.
6. Conferir no Admin os lembretes ICS configurados para cada modulo e para o
   Quadro. O resultado esperado deve ser o que estiver salvo nessa tela.
7. Separar dois aparelhos ou dois perfis de navegador, chamados A e B.
8. Anotar sistema operacional, versao, navegador, aplicativo de calendario e
   conta usada em cada aparelho.

## Criar as assinaturas de teste

### Assinatura pessoal

1. No aparelho A, abrir Minha Agenda e confirmar a pessoa selecionada.
2. Em `Pessoal`, expandir `Assinatura atualizavel do calendario`.
3. Selecionar `Gerar link de assinatura`.
4. Usar `Copiar link` e guardar a URL apenas durante o teste.
5. Repetir no aparelho B para a mesma pessoa.
6. Confirmar que A e B receberam tokens diferentes.

### Assinatura do Quadro

1. Em `Quadro`, expandir `Assinar o quadro`.
2. No aparelho A, selecionar apenas Tarefas, Oradores e Vida e Ministerio.
3. Gerar a assinatura e guardar temporariamente o link.
4. No aparelho B, selecionar um conjunto diferente de modulos.
5. Confirmar que alterar a selecao em A nao altera a assinatura de B.

## Google Calendar e Android

O Google informa que uma nova assinatura por URL deve ser adicionada em um
navegador de computador; essa operacao nao existe nos aplicativos Google
Calendar para Android, iPhone ou iPad. Depois de adicionada na mesma Conta
Google, ela deve aparecer no aplicativo Android.

1. Em um computador, abrir `https://calendar.google.com` com a Conta Google que
   sera usada no Android.
2. Ao lado de `Outros calendarios`, selecionar `Adicionar outros calendarios`.
3. Escolher `Do URL`.
4. Colar a URL HTTPS obtida em `Copiar link` e confirmar `Adicionar calendario`.
5. Confirmar que `Minha agenda Noroeste` ou `Quadro de anuncios Noroeste`
   aparece em `Outros calendarios`.
6. No Android, abrir Google Calendar, abrir o menu e marcar o novo calendario.
7. Se ele nao aparecer, conferir se a mesma Conta Google esta ativa e se a
   sincronizacao desse calendario esta habilitada.

Referencia oficial: [Adicionar calendario por URL no Google Calendar](https://support.google.com/calendar/answer/37100?hl=pt-BR).

## Apple Calendar no iPhone ou iPad

1. Abrir o aplicativo Calendario.
2. Abrir `Calendarios` e selecionar `Adicionar Calendario`.
3. Escolher `Adicionar Calendario de Assinatura`.
4. Colar a URL HTTPS de `Copiar link` ou abrir diretamente o botao
   `Assinar calendario` em Minha Agenda.
5. No iOS ou iPadOS 26 ou posterior, selecionar `Buscar`; nas versoes ate 18,
   selecionar `Assinar`.
6. Dar um nome reconhecivel e escolher uma cor.
7. Escolher iCloud como conta quando a assinatura precisar aparecer nos outros
   aparelhos Apple da mesma pessoa.
8. Abrir as informacoes do calendario e manter `Alertas de Eventos` ativado para
   testar os lembretes.

Referencias oficiais: [Assinaturas de calendario no iCloud](https://support.apple.com/en-ca/102301) e [configurar calendarios no iPhone](https://support.apple.com/en-ie/guide/iphone/iph3d1110d4/ios).

## Apple Calendar no Mac

1. No Calendario, escolher `Arquivo > Nova Assinatura de Calendario`.
2. Colar a URL HTTPS e selecionar `Assinar`.
3. Definir nome, cor e frequencia de atualizacao.
4. Escolher iCloud em `Localizacao` para compartilhar a assinatura com os demais
   aparelhos Apple da conta.
5. Nao marcar `Ignorar alertas` durante a homologacao.

Referencia oficial: [Assinar calendarios no Mac](https://support.apple.com/en-gb/guide/calendar/icl1022/mac).

## Casos obrigatorios da assinatura pessoal

Marcar cada item em pelo menos um calendario externo:

- [ ] O nome do calendario esta correto.
- [ ] Datas aparecem no dia civil correto em `America/Fortaleza`.
- [ ] Horarios, locais e descricoes estao corretos.
- [ ] Tarefas mostra apenas as funcoes da pessoa vinculada.
- [ ] Limpeza mostra as datas do meio e do fim de semana quando aplicavel.
- [ ] Escala TPL aparece como carrinho, sem ser confundida com Servico de Campo.
- [ ] Oradores inclui discurso local, visitante quando pertinente e saida.
- [ ] Vida e Ministerio inclui parte, ajudante, substituto, sala e horario.
- [ ] Servico de Campo aparece somente para o dirigente designado.
- [ ] Nenhum compromisso de outra pessoa aparece.
- [ ] Periodos nao publicados ou nao travados ficam ausentes.
- [ ] Cada modulo possui no maximo dois alarmes e respeita a configuracao do Admin.

## Casos obrigatorios do Quadro

- [ ] O feed contem somente os modulos marcados naquela assinatura.
- [ ] O feed mostra designacoes coletivas, sem observacoes administrativas.
- [ ] Servico de Campo permanece sem alarme no Quadro.
- [ ] Duas instalacoes podem manter selecoes diferentes ao mesmo tempo.
- [ ] Alterar os modulos em A nao modifica o calendario de B.
- [ ] Em `Dados das reunioes`, o select mostra somente datas de hoje em diante.
- [ ] Meio de semana combina Tarefas, Vida e Ministerio e Limpeza.
- [ ] Fim de semana combina Tarefas, Oradores e Limpeza.
- [ ] Discurso local e saida de orador aparecem na data correta.

## Atualizacao sem gerar outro link

1. Escolher um evento futuro ja visivel na assinatura.
2. No modulo de origem, alterar um dado inocuo e identificavel, como horario ou
   local, e publicar ou travar novamente quando o modulo exigir.
3. Abrir diretamente a URL HTTPS da assinatura no navegador.
4. Aguardar ate cinco minutos por causa do cache do feed e confirmar a alteracao.
5. Aguardar a atualizacao automatica do Google ou da Apple e registrar o tempo.
6. Confirmar que o evento mudou sem gerar nem assinar outro link.
7. Restaurar o dado de teste se ele nao fizer parte dos dados definitivos.

O calendario externo escolhe seu proprio intervalo de consulta. Uma demora no
Google ou na Apple nao significa falha se a URL HTTPS ja devolver o dado novo.

## Revogacao e isolamento

1. Revogar a assinatura pessoal de A em Minha Agenda.
2. Confirmar que a URL de A passa a responder como assinatura revogada.
3. Confirmar que a assinatura de B continua funcionando.
4. Repetir o teste com as assinaturas do Quadro.
5. Remover dos calendarios externos todas as assinaturas usadas na homologacao.
6. Revogar no aplicativo todos os tokens que nao serao mantidos.

Eventos antigos podem continuar visiveis temporariamente no cache do calendario
externo. O criterio principal e a URL revogada deixar de fornecer o calendario e
nao receber novas atualizacoes.

## Homologacao da PWA em aparelhos reais

- [ ] Instalar Minha Agenda pela opcao oferecida pelo navegador.
- [ ] Fechar e abrir pelo icone instalado, entrando direto na pessoa travada.
- [ ] Confirmar que nao existe botao visivel para trocar de pessoa.
- [ ] Confirmar que sete toques no nome pedem a senha Admin antes do desbloqueio.
- [ ] Colocar o aparelho em modo aviao e abrir novamente.
- [ ] Confirmar que o ultimo snapshot pessoal abre sem misturar outra pessoa.
- [ ] Criar um rascunho de relatorio offline, fechar e reabrir o aplicativo.
- [ ] Confirmar que o rascunho continua somente naquele aparelho.
- [ ] Reconectar e confirmar a atualizacao em segundo plano.
- [ ] Verificar que a marca da Netlify nao impede cliques na navegacao inferior.

## Concorrencia do relatorio

Usar uma competencia de teste ainda aberta e dois clientes diferentes.

1. No cliente A, preencher o relatorio pessoal e iniciar o envio.
2. Durante os dez segundos, cancelar e confirmar que nada foi oficializado.
3. Enviar novamente e deixar a contagem terminar.
4. Confirmar que o card fica bloqueado depois da gravacao.
5. No Secretario, confirmar o badge indicando que a pessoa enviou.
6. No cliente B, tentar enviar a mesma pessoa e competencia.
7. Confirmar que o registro oficial existente nao e sobrescrito.
8. Corrigir o relatorio pelo Secretario.
9. Confirmar nos dois clientes o badge de ajuste pelo Secretario e o card travado.
10. Fechar a competencia, confirmar o bloqueio e testar a reabertura simples.
11. Restaurar ou excluir apenas o registro criado especificamente para o teste.

## Entrada gradual dos dados reais

1. Manter o backup anterior intacto.
2. Executar o relatorio de falhas de vinculo no Admin.
3. Corrigir primeiro pessoas e `masterId`; nunca aproximar registros apenas pelo
   nome ou telefone.
4. Telefones compartilhados entre familiares devem continuar permitidos sem
   fundir pessoas.
5. Vincular contas administrativas antigas as pessoas corretas.
6. Revisar um modulo por vez: Admin, Tarefas, Limpeza, Escala TPL, Oradores, Vida
   e Ministerio, Secretario e Servico de Campo.
7. Em cada modulo, conferir um periodo representativo na tela, na previa e no PDF.
8. Publicar somente depois que conflitos, orfaos e duplicidades daquele modulo
   estiverem resolvidos.
9. Repetir a conferencia em Minha Agenda pessoal, Geral e Quadro.
10. Gerar um novo backup ao terminar cada bloco relevante de correcao.

## Registro de evidencias

| Caso | Aparelho/conta | Data e hora | Resultado | Observacao |
| --- | --- | --- | --- | --- |
| Google Calendar no computador |  |  | Pendente |  |
| Android sincronizado |  |  | Pendente |  |
| Apple Calendar no iPhone/iPad |  |  | Pendente |  |
| Apple Calendar no Mac |  |  | Opcional |  |
| Isolamento pessoal A/B |  |  | Pendente |  |
| Modulos diferentes no Quadro A/B |  |  | Pendente |  |
| Atualizacao no mesmo link |  |  | Pendente |  |
| Revogacao independente |  |  | Pendente |  |
| PWA offline e reconexao |  |  | Pendente |  |
| Concorrencia com Secretario |  |  | Pendente |  |

## Criterio de aprovacao final

A homologacao esta concluida quando:

1. Google Calendar, Android e pelo menos um aparelho Apple exibirem o feed sem
   troca de data, horario ou pessoa.
2. Uma alteracao publicada chegar ao mesmo link de assinatura.
3. Revogacao e independencia entre instalacoes forem confirmadas.
4. A PWA abrir offline sem misturar identidades.
5. Minha Agenda nunca sobrescrever um relatorio oficial concorrente.
6. Os dados reais forem corrigidos por `masterId` e conferidos modulo a modulo.
7. Os links temporarios forem removidos dos calendarios e revogados no app.
