# Padronização de layout e uso mobile

Implementada em 23/09/2026 na worktree `pdf-a4/admin-spa`, sem deploy.

## Padrões compartilhados

- Estado do PDF aparece junto ao seletor de período, antes das ações.
- A ação recomendada é o botão primário: gerar quando o período está vazio e
  publicar depois que existem dados. Download e ajustes permanecem secundários.
- Abas no telefone usam uma linha rolável, preservando rótulos inteiros. Em
  tablet, o conteúdo aproveita até 720 px; a barra inferior original permanece.
- Diálogos recebem semântica, título acessível, associação entre rótulos e campos,
  foco contido, retorno de foco ao fechar e fechamento por Esc quando há Cancelar.
- Campos e botões mantêm área mínima de toque; nenhuma nova barra fixa foi criada.

## Módulos

- **Admin:** busca fica visível; filtros adicionais ficam recolhidos e reabrem
  quando há filtro ativo. O pareamento da Minha Agenda está separado dos dados da
  pessoa e permite copiar o código. A auditoria agrupa ocorrências por módulo.
- **Tarefas:** reuniões no telefone são resumos expansíveis. O estado de
  publicação fica próximo ao período e Publicar vira a ação principal quando a
  escala já existe.
- **Oradores:** o editor da programação ocupa uma tela limpa no telefone e volta
  para a lista ao salvar/cancelar. A lista mantém filtros e ações existentes.
- **Limpeza:** Escala, Grupos e Configurações viraram áreas explícitas. Atalhos de
  pendência ainda revelam e focalizam o campo correto. Sem período, Gerar escala
  já aparece aberto.
- **Escala TPL:** disponibilidade no telefone vira cartões por dia/horário, sem
  rolagem horizontal. O texto diferencia salvamento automático de Confirmar
  revisão. A escala é agrupada por semana e possui “Ir para hoje ou próximo dia”.
- **Serviço de Campo:** os cards mostram a programação para leitura; seletor de
  dirigente e remoção ficam dentro de Editar dirigente. Publicar é a ação
  principal após a programação existir.
- **Minha Agenda:** mostra data e hora da última sincronização. Próximo compromisso
  continua no topo e o histórico local foi movido para depois dos conteúdos de
  agenda e exportação.

## Validação

- Teste dedicado percorre os sete módulos em 320, 360, 390, 430, 768 e 1280 px.
- A rodada cobre tema escuro, ausência de overflow horizontal, leitura/edição,
  foco dos diálogos, navegação entre áreas e rótulos dos controles.
- Capturas simuladas de 390 px ficam em `output/layout-mobile/` e não são
  versionadas por poderem conter dados de teste ou pessoais.
- As APIs são simuladas; nenhum teste grava no Firebase real.

## Validação humana ainda recomendada

- Teclado virtual aberto em Android e iPhone, zoom do navegador e leitor de tela.
- Nomes, endereços e listas maiores que os dados simulados.
- Tema escuro em aparelho físico e comportamento da barra inferior com a área
  segura do sistema.
