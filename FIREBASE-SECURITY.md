# Segurança do Firebase

## Modelo adotado

O projeto usa senhas locais em `usuarios/*` e não usará Firebase Authentication.
O Admin é a autoridade operacional: conhece os usuários autorizados, cria ou
desativa contas e define os módulos liberados para cada pessoa.

O Firebase hospeda os dados deste modelo; ele não é a camada que decide quem
recebe acesso. Por isso, o uso do painel Admin e a revisão periódica de usuários
ativos são obrigatórios antes de liberar o app a alguém.

## Política de acesso desejada

| Área | Leitura | Escrita |
| --- | --- | --- |
| `master/*` e `usuarios/*` | Admin | Admin |
| `tarefas/*`, `limpeza/*`, `oradores/*`, `escala/*`, `programacao/*` | Administradores do módulo | Administradores do módulo |
| `secretario/*` | Secretário/Admin; publicador apenas nos próprios dados liberados | Secretário/Admin; publicador apenas no próprio relatório aberto |
| `agenda/config/*` | Usuários autorizados | Admin |
| Dados públicos do Quadro | Usuários autorizados | Módulo de origem/Admin |
| `secretario/templates/*` no Storage | Secretário/Admin | Secretário/Admin |

## Controles operacionais obrigatórios

- Apenas o Admin cria, altera, desativa ou remove usuários.
- Cada conta de Minha Agenda fica vinculada a uma única pessoa por `masterId`.
- Ao remover acesso pessoal, desmarcar Minha Agenda ou desativar o usuário no
  Admin; nunca reaproveitar uma conta sem revisar a pessoa vinculada.
- Rever a aba Vínculos antes de alterações em massa ou restauração de backup.
- Backup e restauração permanecem exclusivos do Admin.

## Backup

O app valida localmente a estrutura antes de oferecer restauração. Os testes
cobrem backup válido, ausência de Admin ativo, estrutura de usuário inválida e
chaves incompatíveis com Firebase. A restauração real continua exigindo a frase
`RESTAURAR` e baixa um backup de segurança antes da troca.
