# Auditoria Admin/Mestre

Este documento fecha a auditoria do modulo Admin/Mestre dentro do plano geral de
fechamento dos apps.

Arquivos analisados:

- `src/modules/mestre.ts`
- `src/types.ts`
- `src/firebase.ts`
- `src/auth.ts`
- `AUDITORIA-MODULOS-E-PADROES.md`
- `PADROES-REAPROVEITAVEIS.md`

## Papel do Admin

O Admin e a fonte unica para:

- pessoa;
- `masterId`;
- nome;
- telefone/WhatsApp;
- sexo;
- privilegio/categoria central;
- status ativo;
- usuarios e permissoes de acesso;
- configuracao de congregacao;
- dias e horarios das reunioes;
- textos base de designacoes/ICS quando aplicavel;
- auditoria de vinculos entre modulos;
- backup e restauracao do banco.

Os outros modulos podem guardar regras locais por pessoa, mas nao devem criar
cadastro paralelo nem editar dados pessoais.

## O que ja esta bom

### Pessoas

- Cadastro central em `master/pessoas`.
- `masterId` aleatorio e permanente, independente do WhatsApp.
- Nome, WhatsApp, sexo, privilegio e status centralizados.
- Filtros de pessoa por nome, status, privilegio e sexo.
- Verificacao de uso da pessoa em outros modulos antes de remover.
- WhatsApp pode ser compartilhado por familiares sem criar colisao de identidade.

### Usuarios

- Cadastro de usuarios em `usuarios`.
- Permissoes por app.
- Protecao para manter ao menos um Admin ativo.
- Senha local simples, coerente com o app atual de teste.
- Campo `individual` para Minha Agenda.

### Configuracoes

- Configuracao de congregacao.
- Configuracao de reunioes com meio de semana e fim de semana.
- Configuracao de textos de designacoes para ICS.
- Controle de aprovacao quando texto muda.
- Link global do grupo do Quadro em `agenda/config/quadroWhatsAppLink`.
- Zero, um ou dois lembretes ICS configuraveis por modulo.

### Vinculos

- Aba `Vínculos` le raiz completa e procura:
  - item sem `masterId`;
  - `masterId` inexistente;
  - duplicidade de vinculo no mesmo modulo;
  - usuario publicador sem `masterId`;
  - Oradores local ligado indiretamente por Tarefas.
- Mostra contadores e lista acionavel para revisao manual.

### Dados

- Backup completo em JSON.
- Validacao estrutural antes de restaurar.
- Protecao contra restauracao sem Admin ativo.
- Protecao contra pessoa malformada, conta pessoal orfa e duas contas pessoais
  ligadas ao mesmo `masterId`.
- Validacao de chaves incompatíveis com Firebase.

## Decisoes de fechamento

### 1. Configuracoes globais do Quadro

O Admin e a tela principal do link do grupo do Quadro em
`agenda/config/quadroWhatsAppLink`. O fallback temporario de
`escala/settings/groupWhatsAppLink` pertence a integracao da Minha Agenda.

Estado:

- [x] Admin definido como tela principal.
- [x] Campo e persistencia implementados.
- [ ] Preencher o link real na configuracao.
- [ ] Consumir o link no Quadro durante o fechamento da Minha Agenda.

### 2. Lembretes ICS por modulo

O plano de Minha Agenda define `agenda/config/icsReminders/{modulo}`. O Admin e
o lugar mais coerente para editar essa configuracao.

Estado:

- [x] Tela simples criada com zero, um ou dois lembretes por modulo.
- [x] Defaults:
  - Tarefas: `P7D`, `P1D`;
  - Oradores: `P7D`, `P1D`;
  - Vida e Ministerio: `P7D`, `P1D`;
  - Limpeza: `P1D`;
  - Escala TPL: `P1D`;
  - Quadro: desligado por padrao;
- [x] O Admin nao altera os eventos originais.
- [ ] Salvar a configuracao real no Firebase; a tela ainda exibe os defaults.
- [ ] Consumir os valores como `VALARM` durante o fechamento da Minha Agenda.

### 3. Vinculos com acao direta

A auditoria de vinculos ja lista problemas, mas ainda nao leva direto para o
registro do modulo.

Estado:

- [x] Painel mantido como ferramenta de integridade.
- [x] Botoes abrem o modulo ou a configuracao relacionados.
- [x] Relatorio `.md` inclui caminho real e registro sanitizado.
- [x] Nenhuma correcao automatica e realizada.

### 4. Diferenciar usuario e pessoa

O Admin cria pessoa e usuario, mas o usuario publicador precisa estar ligado a
um `masterId` quando Minha Agenda depender de acesso pessoal.

Estado:

- [x] Campo de pessoa vinculada exposto quando Minha Agenda esta habilitada.
- [x] Usuario Admin de teste mantido como padrao operacional.
- [x] Novo usuario com Minha Agenda nao pode ser salvo sem `masterId` valido.
- [x] O painel detecta contas legadas sem vinculo.

### 5. Configuracoes que nao devem voltar aos modulos

Algumas configuracoes antigas ficaram espalhadas: links de grupo, textos de
mensagem, aprovacao de texto e lembretes.

Aplicar:

- link de grupo publico: Admin/Quadro;
- lembretes ICS: Admin;
- textos de mensagens por reuniao: nao voltar aos modulos operacionais;
- textos administrativos especificos: ficam no modulo dono quando nao forem
  compartilhamento comum.

### 6. Modelo de acesso

O modelo adotado e operacional, sem Firebase Authentication. O responsavel pelo
app cria contas, concede modulos e controla quem recebe acesso. A decisao e os
cuidados correspondentes estao documentados em `FIREBASE-SECURITY.md`.

## Padroes exportaveis

- Fonte unica de pessoa por `masterId`.
- Painel de integridade de vinculos.
- Protecao contra apagar ultimo Admin.
- Backup/restauracao com validacao.
- Configuracoes globais compartilhadas.
- Texto ICS com aprovacao quando alterado.

## Padroes que o Admin deve importar

- `period lifecycle` do Secretario quando alguma configuracao precisar de
  publicacao/fechamento.
- `published snapshot` da Escala TPL para historico de configuracoes publicas,
  se futuramente necessario.
- `pending list item` padronizado para a aba de vinculos.
- Previa obrigatoria de PDF para qualquer documento administrativo futuro.

## Fases de fechamento

### Fase 1 - Configuracoes globais da Agenda

- [x] Adicionado link do grupo do Quadro em `agenda/config/quadroWhatsAppLink`.
- [x] Adicionados lembretes ICS por modulo em `agenda/config/icsReminders`.
- [x] Mantidos os defaults planejados em `INTEGRACAO-MINHA-AGENDA.md`.
- [ ] Consumir os lembretes na exportacao ICS quando a Minha Agenda for fechada.

### Fase 2 - Usuario vinculado a pessoa

- [x] Permitir vincular usuario com Minha Agenda a uma pessoa do Admin.
- [x] Garantir que Minha Agenda use `masterId` do usuario quando existir.
- [x] Manter select por ID/nome como fallback controlado.
- [x] Impedir duas contas pessoais para a mesma pessoa.

### Fase 3 - Integridade acionavel

- [x] Melhorada a aba `Vínculos` com alvo de correcao por modulo.
- [x] Incluídos alertas para link de grupo ausente e lembretes ICS incompletos.
- [x] Mantida a correcao manual, sem alterar vinculos automaticamente.

### Fase 4 - Seguranca e backup

- [x] Documentadas as regras esperadas do RTDB/Storage em
  `FIREBASE-SECURITY.md`.
- [x] Conferida a validacao de restauracao com arquivo de teste automatizado.
- [x] Mantida a restauracao como fluxo excepcional, com frase de confirmacao e
  backup anterior automatico.
- [x] Mantido o controle operacional de acesso pelo Admin. Firebase
  Authentication foi descartado por decisao do responsavel pelo app.

## Criterios de pronto

- Admin continua sendo unica fonte de nome, ID e telefone.
- Usuario publicador pode ser vinculado a `masterId`.
- Link do grupo do Quadro fica centralizado.
- Lembretes ICS por modulo ficam configuraveis.
- Aba de vinculos aponta problemas reais sem alterar dados sozinha.
- Build passa.

## Validacao operacional final

Validacao automatizada concluida em 10/09/2026:

- [x] `masterId` novo e aleatorio, sem derivacao do telefone.
- [x] Duas ou mais pessoas podem compartilhar o mesmo WhatsApp.
- [x] Editar uma pessoa nao a acusa como contato duplicado de si mesma.
- [x] Uma pessoa nao pode ter duas contas com acesso pessoal a Minha Agenda.
- [x] O relatorio de falhas remove senha, telefone e WhatsApp, inclusive em
  estruturas aninhadas.
- [x] Backup valido preserva ao menos um Admin ativo.
- [x] Backup recusa estrutura incompleta e chaves invalidas para o Firebase.
- [x] `npm run test:mestre`: 9 testes aprovados.
- [x] `npm run build`: aprovado.
- [x] Regressao aprovada em Tarefas, Oradores, Coordenador, Vida e Ministerio,
  Limpeza, Secretario e Minha Agenda.
- [ ] A suite da Escala TPL nao executa fora da pasta-base antiga porque ainda
  importa `banco-real.json`, `legado.ts` e um backup por caminhos locais. Esta
  dependencia deve ser removida na auditoria da Escala; nao indica falha de
  execucao do Admin/Mestre.

Validacao manual com a conta Admin e dados reais:

- [x] Pessoas, Usuarios, Configuracao, Vinculos e Dados abriram corretamente.
- [x] Navegacao corrigida: seta interna volta ao indice do Admin e o botao
  `Modulos` volta ao menu geral.
- [x] Painel de Vinculos encontrou 79 itens reais: 63 sem vinculo e 16 orfaos.
- [x] Previa do relatorio corresponde ao painel e usa os caminhos Firebase
  atuais ou legados corretos.
- [x] Interface conferida em desktop e 375 px, sem rolagem horizontal.
- [x] Console do navegador sem erros ou avisos durante a auditoria.
- [ ] Fazer uma restauracao controlada apenas quando houver necessidade real;
  a restauracao substitui a raiz do banco e nao deve ser usada como teste comum.

A restauracao real nao bloqueia o fechamento do modulo: o validador, a frase de
confirmacao e o backup automatico anterior estao cobertos no fluxo. A operacao
destrutiva fica reservada para recuperacao efetiva.

## Dados de exemplo encontrados

Os dados atuais sao exemplos usados para validar o comportamento do app. As
ocorrencias abaixo confirmam que o painel e o relatorio detectam inconsistencias,
mas nao devem ser corrigidas nesta fase:

- 63 registros sem `masterId`, principalmente perfis temporarios de Programacao.
- 16 registros com `masterId` que nao existe mais no cadastro central.
- Conta `u_mestre` com Minha Agenda habilitada e sem pessoa vinculada.
- Link real do grupo do Quadro ainda nao preenchido.
- Lembretes ICS ainda nao persistidos; a interface mostra os defaults.

O relatorio da aba Vinculos foi feito para exportar esses registros e permitir
uma revisao assistida. A edicao dos dados reais sera uma etapa propria, depois
do fechamento funcional dos modulos.
