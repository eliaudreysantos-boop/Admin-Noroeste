# Simplificação do aplicativo — 22/09/2026

## Complemento: repertório, Temas e entrada de Oradores

- Card identifica explicitamente “Números dos temas no repertório” e mostra os
  números separados por vírgulas, nunca a contagem. Teste verifica o texto exato.
- Apoio passa a Mais opções. Temas mantém Baixar PDF dos temas, com a busca e
  o filtro aplicados, e filtros Livres, Já usados, Programados/ocupados e Todos.
- Pendências é a entrada do módulo Oradores. Mostra somente programações de
  hoje até 90 dias à frente, sem registros S1 nem alertas gerais de cadastro.
- Uma linha por programação reúne os campos faltantes; resolvidos esses campos,
  a próxima ação é confirmar, ou reconfirmar na semana do discurso.
- Ao tocar, o mês correto é selecionado e os filtros são limpos. A pendência
  abre o campo exato ou focaliza o botão de confirmação/reconfirmação. Nenhuma
  confirmação é efetuada automaticamente ao navegar.
- Build, 18 testes de Oradores e navegador desktop/celular aprovados, incluindo
  troca de mês por pendência, foco da ação e limite dos 90 dias.
- Diagnóstico somente leitura do site de testes: a publicação consultada ainda
  apontava para c340675 (21/09/2026), anterior aos commits recentes. O bundle
  público continha a contagem antiga e não possuía o botão de PDF dos temas.
  Commit/push não comprovam que o Netlify tenha publicado a nova versão.
- Causa confirmada pela API do Netlify: os quatro deploys posteriores falharam
  com “Skipped due to account credit usage exceeded”. Não foi alterado plano,
  limite, configuração de deploy nem efetuada compra de créditos.

## Alterações aprovadas

1. Oradores informa data de publicação e compara o conteúdo imprimível carregado
   com a referência SHA-256 armazenada junto ao PDF. Edições administrativas que
   não aparecem no PDF não geram falso aviso. Saídas futuras, nomes, temas e
   endereços impressos participam da comparação. PDFs antigos sem referência
   pedem republicação para habilitar a comparação; falha de leitura não afirma
   que o arquivo esteja atualizado. Não é uma garantia de sincronização em tempo real.
2. Tarefas, Limpeza, Escala TPL e Serviço de Campo usam “Reabrir para edição”.
   A confirmação explica que o PDF sai do Quadro até publicar novamente.
   Download permanece separado de publicação.
3. Seletores de pessoas de Oradores, Tarefas e TPL têm busca por nome, com
   tolerância a acentos e diferenciação de homônimos pelo ID. O valor salvo
   continua sendo o ID selecionado; texto livre não cria nem vincula pessoas.
4. Proteção compartilhada dos cadastros/modais e configurações explícitas de
   Admin, Tarefas, TPL, Limpeza, Campo e mensagens: aviso de descarte, bloqueio de
   saída durante salvamento, campos preservados em falhas e mensagem no editor.
   Trocas de período também respeitam a proteção. Campos de gravação imediata
   mantêm seu fluxo próprio; não foram convertidos em rascunhos.
5. Emergência passa a se chamar Substituições. Discursos na congregação têm
   “Buscar substituto”, levando a data; saídas para outra congregação não usam
   esse atalho para evitar substituir a reunião local por engano.
6. Atalhos de repertório na programação mostram disponibilidade, último uso ou
   próxima data. Não houve mudança na regra de escolha manual do tema.
7. Segundo orador, horário e observações ficam em Mais opções; a seção abre
   automaticamente quando já existem valores no registro ou no rascunho.
8. Busca/filtro sem resultado não informa mais que o mês inteiro está vazio.
   A ação Limpar filtros restaura a listagem.
9. Limpar escala/Apagar mês ficam em Mais opções. Cadastros e regras de Limpeza
   ficam em Configurações, deixando programação, geração e PDF em primeiro plano.

## Verificação

- Build TypeScript/Vite e suíte automatizada completa.
- Navegador com APIs simuladas em 1280px/390px: Oradores, publicação/download
  dos quatro módulos de escalas, falhas de salvamento, busca/homônimos,
  proteção de formulário e navegação entre seis módulos.
- Revisão visual da programação móvel e da tela simplificada de Limpeza.
- Nenhuma gravação em banco real nos testes. Nenhuma alteração nas permissões,
  regras de geração, vínculos master ou conteúdo dos PDFs existentes.
- Novas referências de publicação só são gravadas quando o usuário publica.
- Commit local e push somente no remoto teste; produção não é atualizada.
