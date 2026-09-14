# Plano de Firebase, dados reais e vinculos

Atualizado em 14/09/2026.

Este documento registra a revisao dos dados reais, o saneamento de vinculos por
`masterId`, a preparacao de historicos e o eventual ajuste das regras do
Firebase. A preparacao local foi autorizada; a escrita no Firebase continua
dependendo de ordem explicita.

## Ordem aplicada em 12/09/2026: preparar localmente, sem publicar

- Os arquivos recebidos devem permanecer inalterados.
- Correcoes seguras podem ser feitas somente em uma copia proposta.
- Casos incertos devem permanecer em `pendenciasMigracao` e em relatorio.
- Nao escrever no Firebase.
- Nao publicar regras pelo Firebase CLI.
- Nao fazer commit nessa etapa sem nova autorizacao do Admin. A autorizacao
  expressa para o commit de consolidacao foi recebida em 14/09/2026.
- Toda proposta deve ser gerada em arquivo novo, preservando as fontes
  originais e seus hashes.

Esta ordem foi aplicada em 12/09/2026. Foram gerados relatorios e um pacote
local de migracao. Nenhum arquivo-fonte foi editado, nenhuma escrita foi feita
no Firebase e nenhum commit foi criado.

## Fontes recebidas em Downloads

Foram localizados cinco arquivos de dados relevantes em
`C:\Users\eliau\Downloads`:

| Arquivo | Formato | Papel identificado |
| --- | --- | --- |
| `oradoress2-default-rtdb-export.json` | Exportacao JSON do Realtime Database | Backup principal do banco usado pelo app atual |
| `tpl-novo-2-default-rtdb-export.json` | Exportacao JSON do Realtime Database | Fonte anterior/complementar da Escala TPL |
| `oradores-tarefas-default-rtdb-export.json` | Exportacao JSON do Realtime Database | Fonte anterior/complementar de Tarefas e Oradores |
| `dataMeeting.bks` | Banco SQLite valido | Backup antigo de Vida e Ministerio, discursos e tarefas |
| `ServiceSecretary.bss` | Banco SQLite valido | Backup antigo do Secretario |

Os arquivos `.bks` e `.bss` nao estao corrompidos: ambos comecam com a
assinatura `SQLite format 3` e puderam ser abertos em modo somente leitura.

## Diagnostico do backup principal

O arquivo `oradoress2-default-rtdb-export.json` contem atualmente estes caminhos
na raiz:

- `agendaAssinaturasPrivadas`;
- `escala`;
- `master`;
- `programacao`;
- `tarefas`;
- `usuarios`.

Ainda nao aparecem no backup principal os caminhos independentes `secretario`,
`limpeza`, `servicoCampo` e `agenda`. Isso nao prova perda de dados; indica que
esses caminhos ainda nao existiam ou estavam vazios no momento da exportacao.

### Cadastro central

- `master/pessoas`: 160 pessoas.
- `usuarios`: 1 usuario.
- O unico usuario ainda nao possui `masterId` no backup analisado.
- O cadastro central ja e grande o suficiente para reconciliar boa parte dos
  dados do Secretario antigo sem criar pessoas automaticamente.

### Vinculos atuais encontrados

| Colecao atual | Registros | `masterId` valido | Ausente ou invalido |
| --- | ---: | ---: | ---: |
| `tarefas/people` | 35 | 32 | 3 |
| `escala/participants` | 54 | 45 | 9 |
| `programacao/pessoas` | 124 | 59 | 65 |
| `usuarios` | 1 | 0 | 1 |

Esses numeros sao um retrato preliminar. Um registro sem `masterId` valido nao
deve ser apagado: ele precisa de sugestao de vinculo e revisao antes da
correcao.

### Oradores no backup principal

O modulo de Oradores atual esta armazenado em `tarefas/discursos`, e nao no
caminho independente `oradores`:

- 22 oradores;
- 196 registros de programacao, entre 07/08/2024 e 29/05/2027;
- 193 temas;
- 16 congregacoes;
- 56 registros em `historicoTemas`, entre 12/09/2024 e 20/06/2026.

Consequencia: uma migracao nao pode criar uma segunda lista paralela em
`oradores`. Deve preservar e complementar `tarefas/discursos`, eliminando
duplicidade apenas depois de comparar IDs, nomes, datas, temas e congregacoes.

### Vida e Ministerio no backup principal

`programacao/pessoas` possui 124 perfis. Destes:

- 59 apontam para um `masterId` existente;
- 65 estao sem `masterId` ou apontam para um ID que nao existe em
  `master/pessoas`;
- 125 dos 136 alunos do backup antigo encontram um perfil atual pelo campo
  legado `_nome_debug`;
- 11 alunos nao encontram perfil atual por esse campo.

Somente 38 dos 136 nomes abreviados do backup antigo batem diretamente com um
nome completo do cadastro central. Isso ocorre porque o app antigo guardava
nomes curtos, como primeiro e ultimo nome. Portanto, os outros 98 casos nao
podem ser tratados automaticamente como pessoas ausentes.

## Diagnostico do Secretario antigo

O arquivo `ServiceSecretary.bss` contem:

- 155 publicadores;
- 4 grupos;
- 4.230 relatorios mensais;
- 275 registros de assistencia;
- 17 competencias fechadas;
- 2 ajustes mensais;
- relatorios entre 2023 e 2026.

Dos 4.230 relatorios, 1.638 possuem pelo menos um valor numerico de atividade.
Os demais registros zerados ainda podem representar um relatorio valido de nao
participacao e nao devem ser descartados automaticamente.

### Correspondencia preliminar com o cadastro central

- 151 dos 155 publicadores antigos encontram exatamente uma pessoa em
  `master/pessoas` pelo nome completo normalizado.
- Nao houve empate entre duas pessoas para essas 151 correspondencias.
- Quatro nomes nao tiveram correspondencia exata e devem ir para revisao:
  - Massicleide Feitosa Santos;
  - Valeria Oliveira Silva;
  - Taina Santos De Oliveira, marcada como inativa no backup antigo;
  - Elbetty Lucas Lima Dos Santos Carvalho.
- Entre os publicadores ativos, 123 tiveram correspondencia exata e 3 ficaram
  sem correspondencia exata.

Esses quatro casos podem ser diferenca de grafia, nome abreviado ou pessoa ainda
nao cadastrada. Nenhuma pessoa deve ser criada e nenhum vinculo deve ser
escolhido apenas por semelhanca sem revisao.

### Categorias e relatorios legados

O campo legado `Pioneer` dos publicadores possui os valores:

- `0`: 120 pessoas;
- `1`: 6 pessoas;
- `2`: 29 pessoas.

O campo `PioneerReport` dos relatorios possui:

- `-1`: 103 relatorios;
- `0`: 3.016 relatorios;
- `1`: 414 relatorios;
- `2`: 697 relatorios.

A comparacao entre categoria atual, horas e historico confirmou a conversao:

- `PioneerReport=-1`: nao participacao;
- `PioneerReport=0`: publicador;
- `PioneerReport=1`: pioneiro auxiliar;
- `PioneerReport=2`: pioneiro regular.

As horas de campo entram no modelo novo somente para os codigos `1` e `2`, de
acordo com a regra atual do app. `HoursLDC + TSHours` alimenta o campo de horas
de atividades aprovadas. `BibleStudies` alimenta estudos; `BibleStudies2` ficou
sempre nulo ou zero nas 4.230 linhas. Os valores numericos originais foram
preservados nos metadados privados do pacote.

### Assistencia

- 134 registros usam o codigo de reuniao `0`.
- 141 registros usam o codigo de reuniao `1`.
- Existe pelo menos uma data com ano `8030`, claramente fora da faixa esperada.

O registro com ano `8030` foi retido em pendencias e nao entrou nos 274 registros
validos propostos.

## Diagnostico de Vida e Ministerio antigo

O arquivo `dataMeeting.bks` contem:

- 136 alunos/pessoas;
- 431 designacoes de estudantes, entre 2024 e 2026;
- 106 programas de reuniao de meio de semana, entre 2024 e 2026;
- 51 designacoes de discursos publicos, entre 2024 e 2025;
- 194 temas de discursos publicos;
- 35 relacoes entre oradores e temas;
- 71 relacoes familiares;
- 12 semanas especiais.

As tabelas de arranjos e designacoes de servico de campo estao vazias nesse
backup. Portanto, `dataMeeting.bks` nao deve ser usado como fonte de programacao
real do novo modulo Servico de Campo.

Os codigos positivos usados nas designacoes foram traduzidos de forma
conservadora: `10` leitura da Biblia, `20` iniciando conversas, `30` cultivando o
interesse, `60` fazendo discipulos, `65` explicando crencas, `66` o que voce
diria e `70` discurso. Foram preparados apenas programas com data ate a data da
migracao; semanas futuras, codigos especiais e participantes sem vinculo seguro
ficaram nas pendencias.

## Comparacao dos JSON complementares

Os dois JSON complementares nao sao copias identicas dos caminhos contidos no
backup principal:

- A Escala complementar possui 55 participantes; o backup principal possui 54.
- Os dados de disponibilidade, exclusoes, escalas, tabelas e publicacoes da
  Escala apresentam diferencas entre as duas fontes.
- Tarefas possui 35 pessoas em ambas as fontes, mas existem diferencas nos
  dados das pessoas, planejamento, escala, configuracoes e discursos.
- O backup principal contem alteracoes que nao aparecem necessariamente nos
  arquivos complementares.

Regra de precedencia proposta para a futura auditoria:

1. Considerar o backup principal como estado atual.
2. Usar os JSON complementares como fonte de comparacao e recuperacao pontual.
3. Nunca substituir um caminho inteiro do backup principal pelo complementar.
4. Comparar registro por registro e registrar toda divergencia relevante.

## O que pode ser automatizado com seguranca

Quando houver nova ordem explicita, a ferramenta de migracao podera propor, sem
aplicar diretamente:

- vinculo por `masterId` ja valido;
- vinculo por nome completo normalizado quando houver uma unica correspondencia;
- preservacao de relatorios por ID antigo e competencia;
- conversao de datas validas para `YYYY-MM-DD` ou `YYYY-MM`;
- deteccao de duplicidade de pessoa/competencia;
- deteccao de IDs orfaos, datas impossiveis e referencias inexistentes;
- comparacao dos JSON atuais com as fontes complementares.

Devem continuar manuais:

- nomes abreviados com mais de uma possibilidade;
- nomes apenas parecidos;
- telefones compartilhados por pais e filhos;
- escolha de superintendentes dos grupos;
- interpretacao de codigos legados ainda nao confirmados;
- decisao sobre cadastros realmente inativos ou que devem ser removidos.

## Estado atual informado

- O app ainda esta usando dados de exemplo para guiar e validar a interface.
- O uso real esta previsto para outubro.
- A revisao fina das pessoas ocorrera mais a frente, com enxugamento da base.
- O Admin continua sendo a origem oficial de pessoas, telefones, ids e acessos.
- Nao sera adotado Firebase Authentication.
- O controle de acesso administrativo e uma regra local: o Admin concede o
  acesso e sabe quem pode entrar.
- Historicos mais importantes para preservar e atualizar:
  - Secretario;
  - Vida e Ministerio;
  - Oradores.
- Historicos menos importantes:
  - Escala TPL;
  - Tarefas.

## Regras finais do Firebase

A auditoria de encerramento rejeitou a regra permissiva usada durante o
desenvolvimento. O arquivo versionado agora bloqueia todo acesso direto do
navegador:

```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

## Avaliacao das regras

A decisao de nao usar Firebase Authentication foi preservada sem tratar o
`masterId` como segredo. A autorizacao passou para Netlify Functions com conta
de servico, sessao em cookie `HttpOnly`, CSRF, permissoes por modulo e pareamento
da Minha Agenda. O navegador nao contem mais a configuracao do Firebase nem usa
o SDK cliente.

A regra fechada ainda nao pode ser publicada: a versao atualmente ativa na
Netlify e anterior a essa migracao. A ordem obrigatoria e publicar primeiro o
novo site e as Functions, validar o login e somente entao executar o deploy das
regras do banco. Inverter a ordem interrompe o aplicativo publicado.

## Objetivo da etapa futura

Quando o Admin fornecer os dados atuais, a etapa deve:

- comparar dados atuais do Firebase com a estrutura esperada pelo app novo;
- resolver vinculos quebrados por `masterId`;
- eliminar cadastros paralelos de pessoas dentro dos modulos;
- preparar relatorio de falhas para revisao por IA ou pelo Admin;
- preservar historicos relevantes;
- subir dados saneados para o Firebase somente depois de revisao;
- manter backup antes e depois da migracao;
- evitar commit durante a auditoria operacional, salvo ordem explicita.

## Contrato de identidade

- Pessoa oficial nasce em `master`.
- `masterId` e o identificador permanente.
- Nome, telefone, genero, qualificacoes, grupo e situacao vem do cadastro
  central.
- Outros modulos devem guardar somente `masterId` e dados especificos do
  modulo.
- Nomes locais em historicos antigos podem existir apenas como legado de
  migracao.
- Quando houver nome local sem `masterId`, o processo deve tentar reconciliar.
- Quando houver `masterId` inexistente, o processo deve registrar falha.
- Telefones repetidos sao permitidos, especialmente em filhos ou familiares.
- O telefone nao pode ser usado como chave unica de pessoa.

## Relatorio de falhas de vinculos

O app/Admin deve conseguir gerar um relatorio exportavel para analise externa.
Esse relatorio deve ser claro o suficiente para ser enviado a uma IA com um
prompt criado na hora pelo Admin.

Conteudo minimo por falha:

- modulo de origem;
- caminho do dado no Firebase;
- tipo de falha;
- `masterId` encontrado, quando existir;
- nome local encontrado, quando existir;
- telefone local encontrado, quando existir;
- sugestao automatica de vinculo, quando houver;
- grau de confianca da sugestao;
- acao recomendada.

Tipos de falha:

- `masterId` ausente;
- `masterId` inexistente no cadastro central;
- nome local diferente do nome central;
- telefone local diferente do telefone central;
- pessoa duplicada;
- possivel pessoa inativa ainda usada em escala futura;
- historico com nome legado sem vinculo;
- usuario administrativo sem pessoa vinculada;
- participante de modulo que ainda permite nome manual.

## Estrategia de reconciliacao

Ordem de tentativa automatica:

1. Bater `masterId` existente com cadastro central.
2. Se nao houver `masterId`, buscar por nome normalizado.
3. Se houver empate por nome, usar telefone como pista auxiliar.
4. Se telefone for compartilhado, nao escolher automaticamente.
5. Se houver nomes parecidos, gerar sugestao com baixa ou media confianca.
6. Se o dado estiver em historico antigo, preservar nome original e adicionar
   `masterId` quando a confianca for alta.
7. Se o dado estiver em programacao futura, exigir vinculo certo antes de subir.

Regras de seguranca da reconciliacao:

- Nunca criar pessoa automaticamente a partir de dados de modulo.
- Nunca substituir `masterId` valido por nome parecido sem relatorio.
- Nunca apagar historico por falta de vinculo.
- Historico antigo pode manter texto legado para preservar memoria do que
  ocorreu.
- Programacao futura deve apontar para pessoa oficial sempre que possivel.

## Historicos por modulo

### Secretario

Prioridade alta.

- Preservar relatorios mensais ja enviados.
- Preservar origem do envio: publicador, secretario ou importacao.
- Preservar status de mes fechado.
- Respeitar regra: publicador nao edita mes fechado.
- Secretario pode corrigir dados oficiais.
- Manter dados anuais necessarios para S-1, S-21, grupos e paineis.

### Vida e Ministerio

Prioridade alta.

- Preservar historico de designacoes quando existir.
- Vincular participantes por `masterId`.
- Manter dados suficientes para Minha Agenda, Quadro, reunioes e possiveis
  impressos.
- Nao recriar autenticacao antiga.

### Oradores

Prioridade alta.

- Preservar repertorio de discursos.
- Preservar historico de saida e recebimento quando existir.
- Vincular oradores locais a pessoas do cadastro central quando forem da
  congregacao.
- Oradores externos podem continuar como contatos proprios do modulo, se nao
  forem pessoas da congregacao.
- Manter card de texto para emergencia e saida, com botao copiar.

### Escala TPL

Prioridade media.

- Historico antigo nao e essencial.
- Priorizar programacao futura e dados necessarios para Minha Agenda.
- Dados de servico de campo que existiam dentro da Escala TPL devem ser usados
  apenas como referencia inicial, pois Servico de Campo agora e modulo proprio.

### Tarefas

Prioridade media.

- Historico antigo nao e essencial.
- Priorizar regras do motor, programacao futura, PDF publico e Minha Agenda.

### Limpeza

Prioridade media.

- Preservar periodos publicados quando forem uteis ao Quadro e Minha Agenda.
- Evitar mensagens por reuniao no modulo; comunicacao geral fica no Quadro.

### Servico de Campo

Prioridade alta para dados futuros.

- Configurar dirigentes homens por arranjo.
- Permitir mais de uma saida no mesmo dia.
- Permitir programacao por data ou recorrente.
- PDF publico mostra programacao para a congregacao.
- ICS individual gera lembrete para o dirigente.
- Quadro mostra programacao sem lembrete individual.

## Backup e subida de dados

Antes de qualquer alteracao real:

1. Baixar backup completo do Firebase atual.
2. Guardar backup com data e hora.
3. Gerar relatorio de falhas.
4. Gerar arquivo de proposta de correcao.
5. Revisar com dados reais.
6. Subir dados corrigidos para ambiente correto.
7. Baixar novo backup pos-migracao.
8. Rodar auditoria de vinculos novamente.

O backup baixado do Firebase e suficiente para esta fase. Exportacoes extras so
devem ser criadas se ajudarem a revisar dados ou comparar antes/depois.

## JSON de regras em Downloads

O arquivo de regras preparado durante a migracao foi usado como referencia. A
versao final agora esta no proprio repositorio e deve ser publicada pelo Firebase
CLI somente depois que a nova arquitetura estiver ativa na Netlify.

Arquivo versionado:

```text
database.rules.json
```

Ele nega toda leitura e escrita direta. O navegador acessa os dados por Netlify
Functions com sessao propria, sem Firebase Authentication, conforme a decisao do
Admin.

## Checklist de execucao

- [x] Receber backup/dados atuais do Firebase.
- [x] Identificar a estrutura inicial das fontes recebidas.
- [x] Comparar preliminarmente as colecoes com o cadastro central.
- [x] Calcular os hashes SHA-256 das cinco fontes analisadas.
- [x] Criar uma copia imutavel das fontes no pacote local.
- [x] Gerar relatorio de falhas de vinculo.
- [x] Separar sugestoes de confianca alta, media e baixa.
- [x] Revisar as sugestoes que possuem evidencia suficiente.
- [x] Corrigir vinculos seguros somente na proposta.
- [x] Preservar historicos importantes no pacote proposto.
- [x] Montar pacote local de dados saneados.
- [x] Validar estrutura com o mesmo validador usado pelo app.
- [ ] Revisar os vinculos e designacoes que permaneceram pendentes.
- [x] Baixar e comparar um backup fresco imediatamente antes da subida.
- [x] Subir dados atualizados somente apos aprovacao.
- [x] Baixar backup pos-subida.
- [x] Rodar nova auditoria dos caminhos publicos apos a importacao.
- [x] Implementar a camada de servidor para credenciais, leituras e escritas
  administrativas sem adotar Firebase Authentication.
- [x] Preparar `database.rules.json` para negar todo acesso direto do navegador.
- [ ] Publicar primeiro a nova versao na Netlify, validar os fluxos e somente
  depois publicar as regras finais do Realtime Database.

## Proxima acao

Os dados ja foram importados e auditados. Manter os casos incertos sem vinculo
ate a revisao dos dados reais: 27 perfis de Vida e Ministerio, cinco
participantes da Escala, Valeria Oliveira Silva, Taina Santos de Oliveira e os
superintendentes dos quatro grupos. Nenhuma dessas pendencias bloqueia a
homologacao funcional do aplicativo com dados de exemplo.

## Auditoria executada em 12/09/2026

Foi usado o `dataMeeting.bks` atualizado em 12/09/2026 as 13:32. O hash
SHA-256 dessa versao e:

```text
f066b012065b0cd5b64d1a97f177b96d26593735398f07f446fc64cab81caaf4
```

Os relatorios finais estao em:

```text
C:\Users\eliau\Downloads\firebase-auditoria-2026-09-12-final
```

Arquivos gerados:

- `RELATORIO-FALHAS-VINCULOS.md`;
- `RELATORIO-COMPARACAO-FONTES.md`.

### Resultado dos vinculos

- 96 itens ficaram para revisao.
- Escala TPL: 9.
- Oradores: 3.
- Secretario legado: 5, sendo quatro pessoas sem correspondencia exata e uma
  data de assistencia invalida.
- Tarefas: 3.
- Usuarios: 1.
- Vida e Ministerio atual: 65.
- Vida e Ministerio legado: 10.
- O cadastro central nao possui nomes normalizados duplicados.
- Existem quatro telefones compartilhados no cadastro central; isso e permitido
  e nao foi tratado como falha.

### Integridade dos historicos antigos

- Secretario: 4.230 relatorios.
- Nao havia duplicidade por ID legado e competencia. Ao consolidar os dois
  cadastros de Idalia na mesma pessoa central, apareceram dois meses repetidos
  com valores identicos; ambos foram mesclados e registrados na auditoria.
- Nao foram encontradas referencias de relatorio para publicador inexistente.
- Nao foram encontradas datas invalidas nos relatorios.
- Foi encontrada uma data invalida entre os 275 registros de assistencia.
- Vida e Ministerio: nenhuma referencia de pessoa orfa nas designacoes
  analisadas.
- Vida e Ministerio: nenhuma data estruturalmente invalida nas designacoes
  analisadas.
- 125 dos 136 alunos antigos encontram exatamente um perfil atual por
  `_nome_debug`.

### Comparacao entre fontes Firebase

- 28 caminhos foram comparados.
- 500 registros sao iguais.
- 78 registros possuem diferencas internas.
- 61 registros existem somente no backup principal.
- 68 registros existem somente nos JSON complementares.
- `escala/participants` usa familias de IDs diferentes nas duas fontes; nao
  pode ser unido pela chave sem reconciliacao de pessoa.
- Em `tarefas/discursos/programacao`, quatro registros existem somente no
  principal e nove somente no complementar.
- `tarefas/discursos/historicoTemas` e os 193 temas coincidem entre as fontes.

### Ferramenta reproduzivel

Foi adicionado ao projeto o script somente leitura:

```text
scripts/audit-firebase-data.py
```

O script abre os SQLite com `mode=ro`, calcula hashes, mascara telefones, omite
senhas e nao contem operacao de escrita no Firebase. Ele escreve apenas os
relatorios em uma nova pasta de saida.

## Pacote local preparado em 12/09/2026

O pacote valido esta em:

```text
C:\Users\eliau\Downloads\firebase-migracao-2026-09-12-140050
```

Arquivos principais:

- `firebase-import-proposto.json`: visao completa para validacao local;
- `firebase-atualizacoes-por-caminho.json`: 4.795 atualizacoes aditivas, sem
  exclusoes e sem o no privado de pendencias;
- `PENDENCIAS-MIGRACAO.json`: casos nao aplicados automaticamente;
- `RELATORIO-PACOTE-MIGRACAO.md`: resumo legivel;
- `manifesto-fontes.json`: hashes, tamanhos e nomes das copias;
- `fontes-originais`: copias imutaveis das cinco fontes.

Resultados da proposta:

- Tarefas: tres vinculos corrigidos; nenhum `masterId` invalido restante.
- Oradores: os mesmos tres oradores locais corrigidos.
- Os vinculos de Tarefas e Oradores corrigidos foram Wendson, Eduardo Lima e
  Gabriel Augusto.
- Escala TPL: quatro vinculos comprovados corrigidos sem trocar as chaves
  locais; cinco ainda pendentes.
- Os quatro vinculos corrigidos da Escala foram Orlando, Elbetty, Janderson e
  Luciano.
- Usuarios: Admin vinculado a `m_3fa99d9d`.
- Secretario: 152 publicadores oficiais, 4.208 relatorios, 274 assistencias e
  17 fechamentos preparados.
- Secretario: Valeria permanece pendente com 20 relatorios; Taina permanece
  pendente sem relatorios.
- Secretario: os dois cadastros antigos de Idalia foram consolidados; dois
  relatorios mensais identicos foram mesclados e nenhum conflito de valores foi
  encontrado.
- Vida e Ministerio: 91 alunos ligados ao cadastro central, 38 perfis atuais
  reparados e 90 programas historicos preparados ate 09/09/2026.
- Vida e Ministerio: 16 semanas futuras nao foram ativadas e 184 referencias de
  designacao ficaram para revisao por dependerem de perfis ainda incertos.

Validacoes executadas:

- o JSON foi aceito por `validateBackup`;
- `validateFirebaseValue` nao encontrou chaves ou valores invalidos;
- os 4.208 relatorios usam IDs canonicos e nao possuem duplicidade;
- nenhum participante inserido nos 90 programas aponta para perfil quebrado;
- o no publico `secretario` nao recebeu endereco, telefone privado, contato de
  emergencia, nascimento, batismo ou dado pastoral;
- os cinco hashes permaneceram iguais antes e depois da geracao;
- a ferramenta passou por compilacao Python.
- os 160 testes automatizados dos modulos passaram;
- `npm run build` concluiu sem erros.
- a dependencia vulneravel `xlsx` foi substituida por `exceljs`, preservando a
  exportacao S-21 em lote com formatacao, linhas e orientacao retrato;
- `npm audit --omit=dev` concluiu com zero vulnerabilidades conhecidas.

As pastas terminadas em `INVALIDO-NAO-USAR` e `SUPERADO` sao tentativas
anteriores mantidas apenas para rastreabilidade e nao devem ser importadas.

### Ferramenta de preparacao

Foi adicionado:

```text
scripts/prepare-firebase-migration.py
```

O script abre os SQLite em modo somente leitura, interrompe quando um hash muda,
nao chama Firebase e cria sempre uma nova pasta de saida. O JSON completo nao
deve ser restaurado sobre um banco que recebeu dados depois das fontes. Antes da
subida, deve ser baixado um backup fresco e usado o mapa por caminho somente
depois da comparacao.

## JSON final para importacao na raiz

O Admin forneceu o backup fresco `Admin noroeste fresco.json`. O arquivo possui
o mesmo hash do backup auditado, por isso as 4.795 atualizacoes preparadas foram
aplicadas sem divergencia.

Pasta final:

```text
C:\Users\eliau\Downloads\firebase-importacao-raiz-2026-09-12-141134
```

Arquivo que deve ser selecionado ao importar na raiz `/` do Realtime Database:

```text
FIREBASE-IMPORTAR-NA-RAIZ.json
```

Alteracao da conta Admin solicitada:

- `usuarios/u_mestre` foi removido do resultado;
- a conta passou a usar a chave `usuarios/m_3fa99d9d`;
- o campo `masterId` tambem ficou como `m_3fa99d9d`;
- nome, senha e permissoes existentes foram preservados;
- acesso ao modulo Servico de Campo foi habilitado;
- existe somente um usuario no JSON final.

Validacoes do arquivo final:

- as seis raizes do backup fresco foram preservadas;
- `secretario` foi acrescentado como setima raiz;
- 4.208 relatorios do Secretario e 90 programas historicos estao presentes;
- nenhuma atualizacao proposta ficou sem aplicacao;
- nenhuma exclusao do mapa de migracao foi aceita;
- `pendenciasMigracao` nao foi incluido no arquivo de importacao;
- `validateBackup` aceitou o arquivo;
- `validateFirebaseValue` retornou sem erro;
- o hash do backup fresco permaneceu inalterado.

A pasta contem ainda:

- `BACKUP-FRESCO-ORIGINAL-NAO-IMPORTAR.json`, copia anterior a migracao;
- `MANIFESTO-IMPORTACAO.json`, com hashes e contagens;
- `LEIA-ANTES-DE-IMPORTAR.md`, com a orientacao curta de importacao.

Depois da importacao, baixar imediatamente um novo backup e rodar a auditoria
pos-importacao antes de editar dados reais.

## Auditoria pos-importacao em 12/09/2026

Backup completo baixado pelo Firebase CLI:

```text
C:\Users\eliau\Downloads\firebase-backup-pos-importacao-2026-09-12.json
```

O arquivo possui SHA-256
`4A76428DCD6D5DF1F431E616C552657F0D22F484B2F3AE77AFBCAB72BCDE2CC5`.

Resultados confirmados:

- o backup exportado e estruturalmente equivalente ao JSON importado;
- seis listas `parts` vazias foram omitidas pelo Realtime Database, sem perda
  de conteudo;
- 160 pessoas e uma conta Admin estao presentes;
- `usuarios/u_mestre` nao existe mais;
- `usuarios/m_3fa99d9d` esta vinculado ao proprio `masterId` e possui acesso ao
  Servico de Campo;
- 4.208 relatorios, 274 assistencias e 90 programas historicos estao presentes;
- Tarefas nao possui vinculo invalido;
- permanecem os cinco participantes incertos da Escala e os 27 perfis incertos
  de Vida e Ministerio, exatamente como registrado no pacote de migracao.

Revisao adicional dos casos incertos:

- a Escala nao preserva nomes nos cinco registros, portanto nao ha evidencia
  suficiente para corrigi-los automaticamente;
- `Wendson Silva` pode corresponder a `Wendson` (`m_abecd2f2`);
- `Elenildes` pode corresponder a `Elenilde Conceicao Messias`
  (`m_7a9cc669`);
- `Valeria Oliveira Silva` pode corresponder a `Valeria` (`m_ee88d4e1`), mas a
  fonte antiga nao fornece telefone para confirmar;
- `Taina Santos De Oliveira` estava inativa e nao possui correspondente no
  cadastro central;
- os grupos ainda sem superintendente sao `1- Mutirao`, `2 - Taicoca`,
  `3 - M. Do Carmo` e `4 - Amelia`.

Nenhum candidato provavel foi gravado: nomes abreviados ou parecidos nao sao
prova suficiente para modificar historico real.

## Regras do Firebase apos a importacao

O codigo local de 12/09/2026 eliminou o SDK Firebase do navegador. Usuarios dos
modulos agora recebem uma sessao propria da Netlify em cookie `HttpOnly` e cada
operacao passa por uma matriz de permissao no servidor. A Minha Agenda usa um
cookie de aparelho pareado pelo Admin; o endpoint devolve pessoas sanitizadas,
programacao publica e somente os relatorios do `masterId` autorizado.

`database.rules.json` nega o acesso direto do cliente. A conta de servico da
Netlify usa Firebase Admin depois que a Function valida sessao, CSRF, modulo e
caminho. A regra do banco foi publicada somente depois que o novo site entrou
em producao e passou pelo teste de continuidade.

O Console confirmou em 13/09/2026 que o Firebase Storage exigiria upgrade do
plano de `oradoress2`; nenhum upgrade foi feito. Os bytes dos PDFs foram
migrados localmente para Netlify Blobs, enquanto os metadados permanecem em
`agenda/documentos` no Realtime Database.

Uploads, downloads e exclusoes passam por `storage-file`: a Function preserva
o limite de 4 MB, valida PDF e caminho e devolve uma URL propria para previa e
download. O teste local enviou, comparou por hash, substituiu e removeu dois
PDFs reais. A publicacao e o mesmo teste em producao aguardam o envio do commit
autorizado em 14/09/2026.

### Ferramenta de montagem da raiz

Foi adicionado:

```text
scripts/build-firebase-root-import.py
```

A ferramenta aplica um mapa sem exclusoes sobre um export fresco, migra a chave
da conta Admin, valida todas as atualizacoes e gera um arquivo novo. Ela nao se
conecta ao Firebase e nao altera o backup recebido.

## Decisoes em aberto

- [x] O commit de consolidacao da migracao de PDFs para Netlify Blobs e das
  melhorias posteriores foi autorizado em 14/09/2026.
- Se historicos antigos de Tarefas e Escala TPL serao importados integralmente
  ou descartados apos confirmar que nao sao necessarios.
- Se contatos externos de Oradores terao cadastro proprio definitivo ou uma
  estrutura separada de contatos por congregacao.
