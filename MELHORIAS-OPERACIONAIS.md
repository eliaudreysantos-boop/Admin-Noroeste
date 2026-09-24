# Resumo, substituições, histórico e distribuição

Implementação dos itens 1, 3, 5 e 6 aprovados em 24/09/2026, na worktree
`pdf-a4/admin-spa`. Base: commit `596fccd`. Sem publicação em produção.

## Uso

- A tela de módulos apresenta **O que precisa de atenção**, com seleção de mês.
  O resumo só consulta módulos permitidos e distingue falha de carregamento de
  ausência de pendências. Os atalhos abrem o módulo no contexto do mês;
  Tarefas/TPL entram em Pendências. Oradores mantém sua janela de 90 dias.
- **Resumo e histórico** também permite acessar a tela a partir de cada módulo
  administrativo, inclusive para quem tem acesso a um único módulo.
- **Distribuição de tarefas no mês** tem filtro por módulo e busca por pessoa/ID.
  Conta funções (Tarefas), discursos (Oradores), horários (TPL), saídas (Campo)
  e semanas (Limpeza), incluindo participantes ativos sem designação. Não soma
  essas unidades diferentes nem as apresenta como horas ou avaliação pessoal.
- **Buscar substituto** em Tarefas e Campo abre busca, contagens e motivos de
  impedimento, com prévia da troca e confirmação explícita. Candidatos impedidos
  não são selecionáveis nesse assistente. Campos manuais existentes mantêm suas
  regras próprias. Falha ao salvar mantém a escolha; concorrência é recusada.
- Em TPL, o assistente troca uma pessoa no editor da dupla; é necessário salvar
  a dupla depois. A validação considera também o parceiro que permanece.
- Em Limpeza, **Substituir grupo** troca somente a semana, com as duas reuniões,
  usando integrantes/responsáveis do grupo escolhido. Não muda a rotação ou os
  cadastros. O ajuste é preservado ao gerar novamente o mesmo período.
- Oradores conserva seu fluxo já existente de busca por repertório/disponibilidade
  e abertura da programação para concluir a substituição.
- Períodos publicados precisam ser reabertos pelo fluxo existente antes das
  substituições. As trocas não publicam PDFs nem enviam mensagens automaticamente.

## Histórico central

- Registra alterações/exclusões feitas pela API de dados, mudanças de grupos,
  remoção de participantes TPL e publicação/reabertura dos cinco módulos.
- Dados e evento são gravados na mesma transação. O ator vem da sessão validada
  no servidor, não de um campo enviado pelo navegador. Falhas e alterações sem
  efeito não criam eventos de sucesso.
- Guarda data/hora, responsável, módulo, ação e referências dos registros.
  Não guarda valores anteriores/novos, senhas, telefones ou códigos de pareamento;
  não é uma função de desfazer ou um backup.
- Consulta somente módulos autorizados. Armazenamento privado, inacessível pela
  API genérica, excluído de backups exportados e preservado na restauração.
- Retenção de até 500 eventos recentes por módulo, com filtro e exibição gradual.
  Começa quando esta versão for ativada no servidor; não reconstrói o passado e
  não acompanha alterações diretas no Firebase, login ou pareamento de aparelhos.

## Verificação

- Testes de domínio/API: permissões, vínculo central, datas, contagem sem
  duplicação de Limpeza, candidatos impedidos, bloqueio publicado, conflitos,
  transação com histórico, retenção, proteção de credenciais e identidade do ator.
- Teste de navegador em 390/1280 px usa os handlers reais de dados/histórico
  sobre banco em memória: quatro substituições, falha e repetição, indicadores,
  histórico após salvar e sessão limitada a um módulo.
- A suíte de regressão cobre os demais fluxos existentes, PDFs e layout nas seis
  larguras. Testes não gravam dados reais. Uso em aparelhos físicos e implantação
  do endpoint `activity` ainda dependem da publicação desta versão.
