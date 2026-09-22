# Revisão de Oradores — 21/09/2026

## Alterações

- Repertório em um campo de números separados por vírgulas: valida o catálogo,
  elimina duplicados, ordena e mostra a prévia dos títulos. O cartão mostra os
  números dos temas. Esvaziar um repertório existente exige confirmação.
- Pessoas locais são selecionadas do Admin, sem criação de pessoas no módulo.
  Nome, telefone e função vêm do master. A edição da configuração exige Admin.
  A situação é identificada como “Ativo em Oradores”.
- Vínculos antigos `pessoaId` continuam legíveis por ID; `masterId` tem prioridade.
  IDs de oradores existentes e histórico são preservados. Não há migração automática
  do banco. Pessoas sem vínculo precisam ser vinculadas para nova programação.
- Agenda e conflitos de Tarefas reconhecem `masterId` direto.
- Busca de oradores por nome ou número exato de tema. Programação com busca,
  resumo clicável de pendências e filtro de datas futuras.
- Programação aceita número de tema, mostra título, repertório e atalhos por número;
  preenche origem de visitante cadastrado e horário local, e exibe contato e destino.
- Conflitos de discursos, segundo orador e indisponibilidade aparecem no formulário.
  Designações de Tarefas só são consultadas com a permissão já existente; a tela
  informa quando não foram verificadas. Nenhuma permissão de backend foi ampliada.
- Emergência consulta data, temas disponíveis e conflitos, e abre a programação.
- Navegação avisa sobre alterações pendentes. Falhas de gravação de orador e
  programação preservam o formulário. Gravações condicionais protegem concorrência.
- Temas usa busca/filtros em vez de abrir o catálogo completo; temas já usados
  preservam número/título. Exclusão verifica repertórios, programação e histórico.
- Editor de congregação inclui o campo de mapa já suportado pelo banco, evitando
  apagar o mapa existente ao salvar o cadastro.

## Verificação

- Suíte completa: 186 testes passaram.
- Navegador com APIs simuladas em 1280px e 390px: seleção master, duplicidade,
  repertório, validação, falha de escrita, saída com alterações, programação,
  PDF, navegação e sessão sem Admin.
- Revisão visual do formulário móvel; nenhuma gravação em dados reais nos testes.
- Build e `git diff --check` executados antes do commit.

## Publicação

Um commit local serve aos remotos `origin` e `teste`. O push deste trabalho é
somente para `teste/main` e `teste/codex/ajustar-pdfs-a4`. A main local antiga,
o checkout Downloads e as alterações prévias de CONTINUIDADE.md são preservados.
Push não equivale à confirmação de término do deploy Netlify.
