# Integração Vida e Ministério

## Decisão

Vamos usar o app antigo de `Vida e Ministerio` como referência principal de experiência e regras, mas não vamos importar a casca antiga inteira.

O caminho recomendado é transplantar as melhores partes do antigo para o módulo atual `programacao`, mantendo a arquitetura central do `admin-spa`: Firebase já configurado no app atual, autenticação existente, `pessoasRef`, `programacaoRef`, configurações centrais e integração com `Minha agenda`.

Em outras palavras: descartar a experiência nova quando ela for inferior, mas preservar os dados, contratos e módulos compartilhados do app atual.

## Fonte Única De Pessoas

O Admin é a única fonte de cadastro de pessoas. Somente ele cria e altera nome, ID, telefone/WhatsApp, sexo, privilégios e status central.

Vida e Ministério, Tarefas, Oradores, Escala TPL, Limpeza, Minha agenda e os demais módulos apenas selecionam uma pessoa existente no Admin e guardam o seu `masterId` quando precisarem de vínculo próprio. Eles leem os dados pessoais a partir de `pessoas`, sem duplicá-los e sem oferecer cadastro paralelo.

No caso de Vida e Ministério, `programacao/pessoas` guarda exclusivamente participação no módulo e permissões de designação. Nunca deve armazenar nem alterar nome, ID, telefone/WhatsApp, sexo ou privilégios.

## Fontes analisadas

- App atual:
  - `src/modules/programacao.ts`
  - `src/modules/programacao-domain.ts`
  - `src/modules/programacao-documents.ts`
  - `src/modules/individual-domain.ts`
  - `tests/programacao-domain.test.mjs`
  - `tests/programacao-documents.test.mjs`
- App antigo:
  - `Vida e Ministerio/src/App.tsx`
  - `Vida e Ministerio/src/features/program/ProgramPage.tsx`
  - `Vida e Ministerio/src/features/program/ProgramWeekEditor.tsx`
  - `Vida e Ministerio/src/features/program/importJwBimonthly.ts`
  - `Vida e Ministerio/src/features/program/jwProgramParser.ts`
  - `Vida e Ministerio/src/features/program/assignmentCandidates.ts`
  - `Vida e Ministerio/src/features/reminders/RemindersPage.tsx`
  - `Vida e Ministerio/src/features/s89/*`
  - `Vida e Ministerio/src/features/s140/*`
  - `Vida e Ministerio/public/templates/S-89_T.pdf`

## O Que O Antigo Tem De Melhor

- Tela principal mais adequada para uso real: cartões compactos por semana, contadores de partes, designadas e pendentes.
- Editor por seção: `Tesouros`, `Faça Seu Melhor no Ministério` e `Nossa Vida Cristã` aparecem como blocos compactos, abrindo modal para edição detalhada.
- Navegação de período mais natural: semana, mês e bimestre com avançar/voltar.
- Importação bimestral mais clara e com resumo de semanas importadas, existentes e falhas.
- Candidatos com histórico recente e recomendação visual.
- Lembretes separados por tipo: S-89 para partes do ministério e lembretes gerais para as demais partes.
- Ações de S-89 individual: baixar ou compartilhar cartão da designação.
- Geração S-89 usando template oficial em PDF.
- Geração S-140 PDF/DOCX com paginação própria.
- Testes antigos cobrindo parser JW, candidatos, S-89, S-140, importação e shell do app.

## O Que O Atual Tem De Melhor

- Já está integrado ao app central, sem app paralelo.
- Usa os caminhos atuais de dados:
  - `programacao/programs`
  - `programacao/pessoas`
  - `programacao/settings`
  - `pessoas`
  - `configuracao/congregacao`
  - `configuracao/reunioes`
- Já conversa com `Minha agenda` via `individual-domain.ts`.
- Já tem pendências no padrão dos outros módulos.
- Já tem permissões centralizadas em `programacao-domain.ts`.
- Já tem documentos no padrão ESM/Vite atual.
- Já está no padrão de testes com `node --test`.
- Tem menor custo de manutenção por seguir a arquitetura de `escala-tpl`, `tarefas` e `oradores`.

## O Que Não Deve Ser Trazido Do Antigo

- App React separado.
- `App.tsx`, roteamento próprio e bottom nav antigo como casca independente.
- Firebase/auth antigos.
- `useAuth`, `LoginModal` e sessão própria.
- `PeoplePage` como cadastro paralelo.
- Stores antigas (`usePeopleStore`, `useProgramStore`, `useSettingsStore`) como fonte de verdade.
- Repositórios antigos que escrevem fora dos caminhos atuais.
- Configuração duplicada de congregação, salas e horário quando já houver configuração central.
- Dependência futura do módulo/perfil `coordenador`, pois ele foi descartado.

## Modelo De Dados Alvo

Manter `programacao/programs` como fonte oficial das semanas.

Cada semana deve continuar neste formato base:

```ts
type MeetingProgram = {
  id: string
  meetingDate: string
  bibleReading: string
  sourceUrl?: string
  notes?: string
  type?: 'normal' | 'visita' | 'assembleia' | 'celebracao'
  counselorPersonId?: string
  parts: ProgramPart[]
  importedAt?: string
  updatedAt?: string
}
```

Cada parte deve preservar e consolidar estes campos:

```ts
type ProgramPart = {
  id: string
  section: 'tesouros' | 'ministerio' | 'vida-crista'
  title: string
  durationMinutes: number
  reference?: string
  teachingType?: 'conteudo' | 'cenas' | 'videos'
  assignedPersonId?: string
  assistantPersonId?: string
  substitutePersonId?: string
  realizedPersonId?: string
  status?: 'programado' | 'substituido' | 'realizado'
  absent?: boolean
  roomId?: string
  remindedAt?: string
  assistantRemindedAt?: string
  confirmedAt?: string
  updatedAt?: string
}
```

Manter `programacao/pessoas` como vínculo entre Admin e Vida e Ministério:

```ts
type ProgramProfile = {
  masterId: string
  active?: boolean
  permissions?: AssignmentPermission[]
}
```

Nomes, sexo, privilégio, WhatsApp e status central continuam vindo do Admin.

## Minha Agenda

Como o módulo/perfil `coordenador` será descartado, `Minha agenda` passa a ser o centro do publicador.

A estrutura recomendada é uma área única com três telas internas:

- Agenda pessoal: lista as designações do publicador, com filtro/select por fonte, status e período.
- Relatório: permite enviar relatório mensal e ver o ano de serviço.
- Quadro de anúncios: exibe todas as designações das reuniões, incluindo Vida e Ministério, Tarefas, Oradores e Limpeza quando fizer sentido.

Para Vida e Ministério, `Minha agenda` deve ler:

- principal da parte;
- ajudante;
- substituto, quando houver;
- quem realizou, para histórico;
- status de confirmação;
- sala;
- data e horário da reunião.

O quadro de anúncios deve mostrar a reunião inteira, não apenas o que pertence ao publicador.

## Estratégia De Implementação

### Fase 1 - Preparar Base Do Módulo

- [x] Renomear o módulo atual de `Programação` para `Vida e Ministério` na UI.
- [x] Manter o nome técnico `programacao` por compatibilidade.
- [x] Fixar o Admin como fonte única de pessoas; este módulo só cria vínculos por `masterId` e permissões locais.
- [x] Auditar a dependência: `coordenador.ts` importa somente tipos de `programacao-domain.ts`; a remoção do coordenador será feita como mudança isolada depois de Minha agenda absorver os fluxos necessários.
- [x] Confirmar que `programacao-domain.ts` continua sem dependência de DOM/Firebase.

### Fase 2 - Trazer A Experiência Do Antigo

- [x] Substituir a lista simples de semanas por cartões compactos com contadores.
- [x] Implementar navegação por semana, mês e bimestre com anterior/próximo.
- [x] Trocar o editor longo por blocos compactos e expansíveis por seção.
- [x] Abrir modal por seção para editar principal, ajudante, sala e ausência; observações continuam na semana inteira.
- [x] Mostrar recomendação e histórico diretamente no select.
- [x] Exibir conflitos no próprio modal e recalculá-los ao trocar uma pessoa.
- [x] Manter botão de salvar explícito, sem gravar sugestão automaticamente.

### Fase 3 - Pessoas E Permissões

- [x] Manter vínculo com pessoas do Admin.
- [x] Preservar permissões específicas do Vida e Ministério.
- [x] Não criar cadastro paralelo de pessoas.
- [x] Ajustar elegibilidade para papéis masculinos, ajudantes, leitores e privilégios.
- [x] Usar histórico por permissão para ordenar candidatos.
- [x] Preservar pessoas usadas no histórico mesmo se hoje estiverem inativas.

### Fase 4 - Importação JW

- [x] Comparar `parseOfficialProgram` atual com `jwProgramParser` antigo.
- [x] Trazer a tabela ampliada de entidades HTML e suporte a duração na mesma linha.
- [x] Manter validação de URL oficial `https://www.jw.org/pt/`.
- [x] Manter importação semanal.
- [x] Melhorar importação bimestral com resumo de novas, atualizadas e falhas.
- [x] Preservar designações, status, observações, confirmações, conselheiro e partes manuais ao reimportar.
- [x] Evitar sobrescrever semanas já existentes sem necessidade e informar as semanas inalteradas no resumo.

Auditoria da fase: validação de URL, parser semanal, importação bimestral e
mesclagem possuem testes de domínio. Uma reimportação idêntica mantém o registro
original e não produz escrita no lote enviado ao Firebase.

### Fase 5 - Lembretes

- [x] Separar lembretes S-89 e lembretes gerais.
- [x] Incluir principal, substituto e ajudante nos lembretes quando houver WhatsApp.
- [x] Gerar texto editável antes de abrir WhatsApp.
- [x] Marcar `remindedAt` para principal ou substituto.
- [x] Marcar `assistantRemindedAt` para ajudante.
- [x] Marcar `confirmedAt` quando a designação for confirmada.
- [x] Usar a política já adotada nos outros módulos: abrir WhatsApp apenas após ação explícita do usuário.

Auditoria da fase: a lista exclui contatos sem WhatsApp, prioriza o substituto
quando houver e evita duplicar a mesma pessoa como principal e ajudante. O texto
fica em campo editavel e nenhuma janela externa abre antes do clique do usuario.

### Fase 6 - Arquivos

- [x] Trazer template `S-89_T.pdf` para `public/templates/`.
- [x] Gerar S-89 individual.
- [x] Gerar S-89 da semana.
- [x] Gerar S-140 PDF.
- [x] Gerar S-140 DOCX.
- [x] Garantir que os documentos usem `realizedPersonId`, depois `substitutePersonId`, depois `assignedPersonId`.
- [x] Aplicar previa obrigatoria aos PDFs S-89 e S-140, com baixar e imprimir somente dentro da previa.

O S-89 desta congregação marca somente `Salão principal`. As caixas Sala B e Sala C fazem parte do template oficial, mas não são usadas.
- [x] Testar visualmente PDFs gerados em uma e varias paginas.
- [x] Manter documentos sem alterar dados da programação.

Auditoria da fase: S-89 de duas paginas e S-140 foram renderizados em PNG e
conferidos sem cortes ou sobreposicoes. A geracao usa dados imutaveis e os PDFs
abrem primeiro no modal compartilhado de previa.

### Fase 7 - Pendências

- [x] Semana sem partes.
- [x] Parte sem principal.
- [x] Principal inexistente ou inativo.
- [x] Ajudante sem mesmo sexo quando aplicável.
- [x] Principal e ajudante iguais.
- [x] Pessoa repetida na mesma reunião.
- [x] Lembrete ainda não aberto.
- [x] Confirmação pendente.
- [x] Parte marcada como realizada sem `realizedPersonId`.
- [x] Link direto da pendência para a semana/modal correto.
- [x] Não permitir ignorar pendências obrigatórias; corrigir o dado na semana mantém o painel confiável.

Auditoria da fase: partes realizadas deixam de cobrar lembrete e confirmacao,
mas continuam apontando a falta de `realizedPersonId`. Cada item conserva link
direto para a semana e a parte que precisam de correcao.

### Fase 8 - Minha Agenda E Quadro De Anúncios

- [x] Atualizar `collectAgendaEvents` para refletir os campos finais de Vida e Ministério.
- [x] Garantir que ajudante aparece como designação própria.
- [x] Garantir que substituto aparece como responsável quando houver.
- [x] Criar visão de quadro de anúncios com todas as partes de todas as reuniões.
- [x] Incluir filtros por mês, fonte e status.
- [x] Usar tabs segmentadas para as três telas internas em desktop e mobile.
- [x] Integrar envio de relatório mensal na segunda tela.
- [x] Integrar visão do ano de serviço na segunda tela.

### Fase 9 - Limpeza Do Coordenador

- [x] Remover módulo/perfil `coordenador` da navegação.
- [x] Remover testes exclusivos do coordenador.
- [x] Manter documentos úteis nos módulos donos.
- [x] Garantir que nenhuma ação importante dependa mais de `coordenador`.

Auditoria da fase: o roteador nao possui mais entrada especial, o Admin nao cria
nem edita esse perfil e os tipos nao o reconhecem. Contas antigas continuam com
as permissoes comuns gravadas em `apps`; ao serem editadas, o marcador legado e
removido sem alterar os dados operacionais dos modulos.

## Reaproveitáveis Para Outros Módulos

Registrar depois em `PADROES-REAPROVEITAVEIS.md`:

- Navegação de período semana/mês/bimestre com anterior/próximo.
- Cards compactos que abrem modal detalhado por grupo.
- Select com recomendação baseada em histórico.
- Lembretes agrupados por tipo e pessoa.
- Marcação separada de `remindedAt`, `assistantRemindedAt` e `confirmedAt`.
- Geração de documentos sem mutar dados operacionais.
- Reimportação que preserva alterações humanas.
- Pendências com alvo direto no item problemático.
- Quadro de anúncios como leitura pública consolidada.

## Riscos E Cuidados

- O app antigo usa React e stores; copiar tudo criaria uma segunda arquitetura dentro da aplicação.
- O app antigo tem Firebase/auth próprios; isso precisa ser descartado.
- A importação JW depende de endpoint externo/cloud function. No app atual, precisamos manter o fallback local/proxy existente ou decidir outro padrão.
- WhatsApp é ação externa representacional; só deve abrir por clique explícito.
- PDFs S-89 com template oficial exigem conferir coordenadas visualmente.
- Dados antigos podem ter `parts` como array ou objeto; normalização precisa continuar tolerante.
- Pessoas inativas ou removidas no Admin podem existir no histórico; a tela precisa exibir sem quebrar e impedir novas sugestões indevidas.
- O antigo perfil Coordenador foi removido depois que Minha Agenda e os módulos donos assumiram seus documentos e consultas.

## Critérios De Pronto

- [x] `npm run test:programacao` passa.
- [x] `npm run test:individual` passa.
- [x] `npm run build` passa.
- [x] Importação semanal possui validação, parser e teste com conteúdo oficial representativo.
- [x] Importação bimestral preserva semanas já existentes.
- [x] Editor por seção usa blocos expansíveis e modal responsivo em desktop e mobile.
- [x] Sugestões não salvam sem confirmação humana.
- [x] Lembretes abrem WhatsApp com texto correto.
- [x] S-89 individual gera PDF.
- [x] S-89 da semana gera PDF multipágina legível.
- [x] S-140 PDF gera arquivo legível.
- [x] S-140 DOCX gera arquivo Office válido e coberto por teste automatizado.
- [x] Pendências apontam para a semana correta.
- [x] Minha agenda mostra designações pessoais de Vida e Ministério.
- [x] Quadro de anúncios mostra todas as designações das reuniões.

Validação final desta rodada: interface conferida em desktop e em viewport de
375 px sem overflow horizontal, e console sem erros. Permanecem operacionais a
importação contra uma página oficial ao vivo, a abertura de um editor com dados
reais e a conferência visual do DOCX S-140.

## Ordem Recomendada

1. Ajustar o nome e a direção do módulo para `Vida e Ministério`, mantendo `programacao` como chave técnica.
2. Melhorar domínio/testes antes da UI.
3. Transplantar a experiência de cards e modal por seção.
4. Consolidar importação JW.
5. Consolidar lembretes e S-89.
6. Validar S-140.
7. Atualizar `Minha agenda`.
8. Remover dependências do coordenador.
9. Atualizar `PADROES-REAPROVEITAVEIS.md`.
10. Rodar testes, build, validação visual e commit.

## Conclusão

O plano do usuário é bom: o antigo de Vida e Ministério deve guiar o módulo novo. A parte delicada é não transformar isso em uma cópia literal do app antigo. O ganho real vem de trazer a experiência e as regras maduras para dentro da arquitetura atual, usando o Admin como fonte de pessoas e `Minha agenda` como centro do publicador.
