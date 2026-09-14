# Pendencias finais do Admin SPA

Atualizado em 14/09/2026.

Este documento concentra somente o que ainda falta para encerrar o Admin SPA e
a Minha Agenda. Os demais documentos continuam servindo como historico e
especificacao detalhada, mas este arquivo e a referencia para a ordem de
execucao final.

## Leituras agrupadas - 14/09/2026

- [x] Agrupar leituras simultaneas na camada compartilhada em lotes de ate 24
  chamadas, deduplicando caminhos dentro do lote e sem cache entre cargas.
- [x] Validar caminhos e permissoes individualmente na Function e preservar
  erros por leitura, sem converter falha em dado vazio.
- [x] Limpeza passou a ler pessoas e configuracao separadamente, permitindo
  acesso com permissao exclusiva de Limpeza. Sao cinco caminhos em uma chamada.
- [x] Suite completa aprovada com 163 testes, build de producao aprovado e
  verificacao de whitespace sem erros depois da implementacao.
- [ ] Repetir cargas no servidor local e em producao para confirmar o efeito
  sobre o pico de conexoes. O agrupamento reduz invocacoes, mas nao garante por
  si so a eliminacao de conexoes persistentes de outras Functions.

Esta atualizacao substitui a pendencia de implementar o agrupamento abaixo;
permanece pendente a comprovacao operacional da ausencia de timeout.

## Estado confirmado

- Os nove modulos abrem e os motores principais estao implementados.
- Minha Agenda possui as telas Pessoal, Geral, Relatorio e Quadro.
- O Quadro possui Dados das reunioes, cinco downloads separados de PDF,
  Documentos do Admin e assinatura ICS.
- O PWA de Minha Agenda usa shell proprio em `/agenda/`, cache-first e ciclo
  semanal silencioso para atualizar a versao da Netlify.
- O snapshot da Minha Agenda respeita o ciclo automatico de 24 horas do
  Firebase, salvo comandos explicitos que exigem dados atuais.
- A suite completa possui 160 testes aprovados.
- O build de producao foi concluido sem erros.
- O JSON final para importacao na raiz foi gerado e validado.
- Commits intermediarios devem ser evitados. Em 14/09/2026, o Admin autorizou
  expressamente o commit de consolidacao deste conjunto de correcoes e
  auditorias; essa autorizacao nao inclui `push` nem deploy.

## Andamento consolidado das fases

| Fase | Estado em 14/09/2026 |
| --- | --- |
| 1 - Login administrativo | Concluida no codigo e nos testes |
| 2 - Previa obrigatoria de PDF | Concluida nos cinco modulos publicos |
| 3 - Contrato Firebase e PDFs | Codigo concluido e incluido no commit autorizado; push e deploy pendentes |
| 4 - Migracao de dados | Estrutura validada; vinculos incertos ficam para a revisao dos dados reais |
| 5 - Importacao e auditoria | Concluida sem alterar os historicos pendentes |
| 6 - Homologacao dos modulos | Admin, Tarefas e Limpeza concluidos; seis modulos e Minha Agenda ainda precisam da passagem manual |
| 7 - PDFs publicos | Homologacao com periodos representativos pendente |
| 8 - Aparelhos e ICS | Pendente e mantida obrigatoriamente por ultimo |
| 9 - Documentacao e publicacao | MDs atualizados e commit autorizado; push e deploy ainda pendentes |

## Auditoria de encerramento - 13/09/2026

### Criticos antes do uso real

- [x] Substituir a autorizacao apenas no navegador por sessao validada em
  Netlify Function. O cliente nao usa mais `noroeste_uid` nem confia no
  `sessionStorage`; a sessao usa cookie `HttpOnly`, `Secure`, `SameSite=Lax`,
  token aleatorio e CSRF para escritas.
- [x] Retirar do cliente Firebase a leitura de `usuarios`, telefones do cadastro
  mestre e relatorios completos do Secretario. A Minha Agenda recebe uma
  projecao sanitizada vinculada a identidade do aparelho.
- [x] Retirar do codigo a escrita anonima de `master`, `usuarios`, `tarefas`, `limpeza`,
  `oradores`, `escala`, `programacao`, `secretario`, `servicoCampo` e
  configuracoes da Agenda. `database.rules.json` agora nega todo acesso direto;
  falta publicar a regra depois do deploy da nova versao.
- [x] Sem Firebase Authentication, implementar sessao propria para usuarios dos
  modulos e pareamento da Minha Agenda confirmado por senha Admin. O
  `masterId` continua sendo identidade de dominio, nunca credencial.
- [x] Manter no cliente da Minha Agenda somente pessoas sanitizadas, dados
  publicos de programacao, documentos e os registros do proprio publicador.
- [x] Exigir sessao ou aparelho pareado para criar, alterar e revogar
  assinaturas ICS; assinatura pessoal fica presa ao `masterId` autorizado.
- [x] Impedir o service worker de guardar respostas de Functions, sessoes ou
  dados privados. O cache do Admin agora aceita somente arquivos estaticos.
- [x] Limitar tentativas repetidas de senha e comparar credenciais sem retorno
  antecipado por caractere.
- [x] Fazer a Minha Agenda receber eventos ja montados pelo servidor, somente a
  pessoa vinculada e metadados sanitizados. O payload real nao contem raiz
  administrativa, senha, telefone nem caminho interno de armazenamento.
- [x] Restringir a conta de Oradores aos discursos, eventos, leitura da escala e
  publicacoes proprias dentro de Tarefas; regras e escalas de Tarefas nao podem
  ser alteradas por essa permissao.
- [x] Impedir que uma edicao do Secretario use o identificador anterior de um
  relatorio pertencente a outra pessoa ou competencia.

### Infraestrutura e publicacao

- [x] Confirmar que o Firebase Storage exigiria upgrade do plano e nao autorizar
  cobranca apenas para armazenar os PDFs.
- [x] Migrar os bytes dos PDFs para Netlify Blobs, mantendo os metadados no
  Realtime Database e os mesmos fluxos nos modulos.
- [x] Transferir upload, substituicao e remocao de PDFs para uma Function com
  sessao, CSRF, limite de 4 MB, validacao de PDF, caminho e permissao do modulo.
- [x] Fazer a mesma Function servir previa e download dos PDFs publicos por URL
  propria, sem depender de bucket do Firebase.
- [x] As Functions publicadas de calendario responderam corretamente: uma
  assinatura revogada retornou `410` e o endpoint de manutencao rejeitou `GET`
  com `405`, comprovando acesso ao armazenamento privado.
- [x] Publicar o site e as dez Functions pelo GitHub e, depois da validacao,
  publicar `database.rules.json` no projeto `oradoress2`.
- [x] Incluir a migracao para Netlify Blobs no commit de consolidacao autorizado
  em 14/09/2026.
- [ ] Enviar o commit ao GitHub e aguardar o deploy pelo GitHub.
- [ ] Repetir em producao o ciclo de enviar, baixar, substituir e remover um PDF
  temporario.

### Qualidade confirmada

- [x] Auditoria ao vivo preservou 160 pessoas, uma conta Admin, 4.208
  relatorios, 274 assistencias, 90 programas e os mesmos vinculos incertos ja
  documentados.
- [x] Os 160 testes passaram na auditoria final.
- [x] `npm run build` passou e o pacote `dist` abriu Admin e Minha Agenda em
  viewport de celular, sem erros de execucao ou rolagem horizontal.
- [x] `npm audit --omit=dev` retornou zero vulnerabilidades conhecidas.
- [x] `git diff --check` nao encontrou erro de whitespace; exibiu apenas os
  avisos esperados de conversao LF/CRLF no Windows.
- [x] O build completo da Netlify empacotou as dez Functions sem erro.
- [x] O sandbox real do Netlify Blobs confirmou upload, hash identico no
  download, substituicao, novo hash identico, remocao e HTTP 404 depois dela.
- [x] O fluxo local real confirmou lista de usuarios sem senha, login por cookie
  `HttpOnly`, CSRF, bloqueio das raizes privadas, agenda sem telefones, somente
  relatorios da pessoa e logout com invalidacao da sessao.
- [x] O segundo smoke test real confirmou o contrato sanitizado da Minha Agenda:
  resposta `200`, identidade correta, janela util de eventos e ausencia de
  `root`, senha, telefone e `storagePath`.
- [x] Smoke test em 390 x 844 confirmou login, menu, sair e modal de pareamento
  da Minha Agenda sem erro de console.
- [x] O ambiente local foi reiniciado de forma limpa depois que processos
  duplicados de Netlify/Vite e recargas sucessivas coincidiram com o limite de
  conexoes do Realtime Database. Depois da reinicializacao, `/`, `/agenda/` e
  `auth-users` voltaram a responder com HTTP 200.
- [x] A recorrencia do pico de conexoes foi confirmada durante a auditoria de
  Limpeza, com apenas um servidor local e cargas repetidas de modulos.
- [ ] Agrupar as leituras de cada modulo em uma requisicao de Function ou
  implementar um ciclo seguro de reutilizacao e encerramento das conexoes do
  Realtime Database. Depois, comprovar que o aviso e o timeout nao reaparecem no
  ambiente local nem na versao publicada.
- [ ] O bundle de exportacao S-21 possui cerca de 1 MB minificado. Como ele e
  carregado por importacao dinamica apenas ao exportar, nao bloqueia o uso, mas
  pode ser otimizado depois da homologacao funcional.

## Fase 1 - Corrigir o login administrativo

### Cache de usuarios

O seletor pode exibir nomes guardados localmente enquanto o Firebase carrega,
mas o cache nunca pode autenticar uma pessoa.

- [x] Tratar o cache como uma lista de exibicao contendo apenas `nome` e
  `ativo`.
- [x] Eliminar do `localStorage` senhas, permissoes, papeis e outros campos que
  possam ter sido salvos por versoes antigas.
- [x] Nao aceitar senha enquanto a lista atual do Firebase nao tiver sido
  carregada.
- [x] Impedir que uma conta removida ou desativada entre usando um cache antigo.
- [x] Ao receber o Firebase, substituir integralmente a lista apresentada.
- [x] Adicionar testes para cache legado com senha e para conta removida.

### Cadastro de usuarios

- [x] Remover o campo editavel de nome da tela de adicionar e editar usuario.
- [x] Exigir a selecao de uma pessoa do cadastro mestre.
- [x] Derivar `usuario.nome` de `master/pessoas/{masterId}/name` ao salvar.
- [x] Atualizar o nome exibido quando o nome da pessoa mudar no cadastro mestre.
- [x] Manter no maximo uma conta ativa por `masterId`.
- [x] Decidir se toda nova chave de usuario tambem sera o proprio `masterId` ou
  se a chave interna podera continuar independente. Em ambos os casos, o campo
  `masterId` e obrigatorio.

## Fase 2 - Tornar a previa de PDF obrigatoria

A previa obrigatoria deve valer para todo PDF gerado ou enviado pelo app.

- [x] Criar um estado reutilizavel que identifique a versao exata visualizada.
- [x] Invalidar a previa quando periodo, fonte, escala, filtros ou dados forem
  alterados.
- [x] Bloquear `Publicar` ate que a versao atual tenha sido aberta na previa.
- [x] Aplicar a regra em Tarefas.
- [x] Aplicar a regra em Limpeza.
- [x] Aplicar a regra em Oradores.
- [x] Aplicar a regra em Escala TPL.
- [x] Aplicar a regra em Servico de Campo.
- [x] Preservar a regra ja existente para documentos do Admin e templates do
  Secretario.
- [x] Adicionar testes que comprovem que uma versao alterada exige nova previa.

## Fase 3 - Fechar o contrato do Firebase

### Realtime Database

As regras publicadas ainda permitem leitura e escrita anonimas ate a migracao
ser publicada. O codigo local ja removeu o SDK Firebase do navegador e usa
Functions com Firebase Admin. A regra versionada nega todo acesso direto.

- [x] Preservar a decisao de nao adotar Firebase Authentication.
- [x] Separar dados publicos da Minha Agenda dos dados administrativos e
  pessoais por respostas montadas no servidor.
- [x] Nunca devolver senhas em endpoint publico nem no cache do navegador.
- [x] Manter os tokens privados de calendario sem enumeracao publica.
- [x] Passar leituras e escritas dos modulos por Netlify Functions com matriz de
  permissao por modulo.
- [x] Impedir no arquivo versionado escrita publica em usuarios, dados mestres, relatorios do
  Secretario e documentos administrativos.
- [x] Criar testes para a nova matriz de permissoes e para o cache do service
  worker.
- [x] Publicar as regras somente depois de validar Admin, Minha Agenda,
  relatorios e assinaturas em ambiente publicado.

### Armazenamento de PDFs com Netlify Blobs

O Console do Firebase confirmou em 13/09/2026 que a ativacao do Storage no
projeto `oradoress2` exigiria upgrade do plano. Nenhum upgrade foi feito. Para
evitar essa dependencia, os bytes dos PDFs passam a usar Netlify Blobs; os
metadados publicos continuam em `agenda/documentos` no Realtime Database.

- [x] Remover `storage.rules` e a configuracao de Storage de `firebase.json`,
  pois nao fazem mais parte da arquitetura.
- [x] Adicionar `@netlify/blobs` e usar um armazenamento persistente do proprio
  site.
- [x] Garantir leitura dos PDFs publicos pela Minha Agenda por URL da Function.
- [x] Garantir no codigo que somente o fluxo administrativo autorizado publique,
  substitua ou remova documentos.
- [x] Tratar falha entre upload e gravacao dos metadados para nao deixar arquivo
  orfao ou registro apontando para arquivo removido.
- [x] Validar localmente um ciclo completo com dois PDFs reais e comparacao de
  hash dos downloads.
- [ ] Repetir o ciclo na versao publicada depois do commit final.

## Fase 4 - Ajustar a migracao antes da importacao

Arquivo preparado:

```text
C:\Users\eliau\Downloads\firebase-importacao-raiz-2026-09-12-141134\FIREBASE-IMPORTAR-NA-RAIZ.json
```

- [x] Manter os historicos importados como registros do Secretario, seguindo o
  badge binario solicitado: pessoa ou Secretario. Nao criar um terceiro badge
  de importacao.
- [ ] Revisar os cinco participantes ainda incertos da Escala TPL.
- [ ] Revisar os 27 perfis incertos e as 184 referencias de designacao de Vida e
  Ministerio.
- [ ] Revisar Valeria, que possui 20 relatorios pendentes de decisao.
- [ ] Revisar Taina, que nao possui relatorios na fonte analisada.
- [ ] Definir os superintendentes dos quatro grupos.
- [x] Nao apagar historico apenas porque um vinculo ainda esta pendente.
- [x] Manter o arquivo importado, pois a decisao sobre a origem nao exige nova
  geracao dos dados.
- [x] Validar estrutura, valores Firebase, contagens e hashes do resultado.

Pendencias identificadas sem alteracao automatica:

- Escala TPL: `m_0367ee81`, `m_30985d99`, `m_4081972f`, `m_7c3902d5` e
  `m_b6bca401`; os registros nao guardam nome suficiente para uma ligacao
  segura. O ultimo aparece como `Elenildes` em Vida e Ministerio, mas isso nao
  comprova a identidade na Escala.
- Vida e Ministerio: `Wendson Silva` tem como candidato provavel `Wendson`
  (`m_abecd2f2`) e `Elenildes` tem como candidato provavel `Elenilde Conceicao
  Messias` (`m_7a9cc669`). Nao aplicar sem confirmacao. Os demais perfis
  pendentes sao nomes abreviados ou pessoas sem correspondencia no cadastro
  central.
- Secretario: `Valeria Oliveira Silva` tem como candidata provavel `Valeria`
  (`m_ee88d4e1`), mas sem telefone comum ou nome completo suficiente para
  confirmar; `Taina Santos De Oliveira` nao existe no cadastro central e estava
  inativa na fonte antiga.
- Grupos sem superintendente: `1- Mutirao`, `2 - Taicoca`, `3 - M. Do Carmo` e
  `4 - Amelia`.

## Fase 5 - Importar e auditar os dados

Esta fase exige operacao manual do Admin no Console do Firebase.

- [x] Baixar um backup fresco imediatamente antes da importacao.
- [x] Confirmar que ele nao divergiu da base usada para montar o arquivo final.
- [x] Selecionar a raiz `/` no Realtime Database.
- [x] Importar somente `FIREBASE-IMPORTAR-NA-RAIZ.json`.
- [x] Confirmar que `usuarios/u_mestre` foi removido.
- [x] Confirmar a conta em `usuarios/m_3fa99d9d`, com o mesmo `masterId` e acesso
  ao Servico de Campo.
- [x] Baixar imediatamente um backup pos-importacao.
- [x] Rodar a auditoria de vinculos e estrutura nos caminhos publicos.
- [x] Nao editar dados reais antes de concluir a auditoria pos-importacao.
- [x] Confirmar 4.208 relatorios, 274 assistencias e 90 programas historicos.
- [x] Confirmar que Tarefas nao possui `masterId` invalido e que a Escala ainda
  possui exatamente os cinco casos pendentes conhecidos.

## Fase 6 - Homologar modulo por modulo

Verificacao automatizada concluida em 12/09/2026:

- [x] Os 160 testes automatizados passaram depois das correcoes finais.
- [x] O build de producao foi gerado sem erro.
- [x] O smoke test mobile abriu os nove modulos com a conta Admin real, sem
  erro de execucao e sem rolagem horizontal da pagina.
- [x] O fluxo inferior mostrou `Voltar` dentro do modulo, ocultou `Sair` nesse
  nivel e voltou a mostrar `Sair` ao retornar ao menu de modulos.
- [x] A Minha Agenda independente abriu em celular, mostrou as telas `Pessoal`,
  `Geral`, `Relatorio` e `Quadro`, e exibiu separadamente reunioes, PDFs dos
  modulos, documentos do Admin e assinatura do Quadro.
- [x] Substituir a biblioteca `xlsx`, sem correcao para vulnerabilidades altas,
  por `exceljs` e confirmar o lote S-21 com estilos, linhas e pagina retrato.
- [x] Executar `npm audit --omit=dev` sem vulnerabilidades conhecidas.

Os itens abaixo permanecem como homologacao humana das operacoes destrutivas,
dos dados de exemplo e da aparencia detalhada de cada documento.

- [x] Admin: login, sessao, sair, voltar, pessoas, usuarios, vinculos, tela de
  backup e fluxo protegido de restauracao.
- [x] Remover a tela central de textos de designacoes do Admin e colocar link e
  mensagens na configuracao de Tarefas, Limpeza, Escala TPL, Oradores, Vida e
  Ministerio e Servico de Campo. O Admin conserva somente o Quadro.
- [x] Salvar Quadro e lembretes por atualizacao parcial, preservando mensagens
  gravadas por outros modulos em outra aba.
- [ ] Restaurar um backup descartavel em ambiente separado. A operacao nao foi
  executada sobre os dados atuais para evitar uma alteracao desnecessaria.
- [x] Tarefas: motor, regras opcionais, vinculos, mensagens, previa A4 retrato,
  desktop, tela pequena e navegacao.
- [ ] Tarefas: publicar um periodo representativo e reabri-lo na versao com
  Netlify Blobs; a operacao nao foi executada sobre os dados atuais.
- [x] Limpeza: motor, periodo mensal ou bimestral, virada de mes, vinculos exatos,
  grupos proprios ou do Secretario, mensagens, previa A4 retrato, desktop, tela
  pequena e navegacao.
- [ ] Limpeza: publicar um periodo representativo e reabri-lo depois do deploy
  final; a operacao nao foi executada sobre os dados atuais.
- [ ] Oradores: lista unica, programacao, saida, copiar texto, WhatsApp, previa
  A4 retrato e publicacao.
- [ ] Escala TPL: maior quantidade esperada de horarios, snapshot, publicacao e
  despublicacao.
- [ ] Vida e Ministerio: importacao de URL oficial, S-89, lote semanal, S-140 PDF
  e DOCX.
- [ ] Secretario: grupos, S-1, S-21, S-88, S-3, fechamento, reabertura e
  concorrencia com Minha Agenda.
- [ ] Servico de Campo: locais, horarios, dirigentes, recorrencia, rodizio,
  lembrete individual e PDF A4 retrato.
- [ ] Minha Agenda: Pessoal, Geral, Relatorio e Quadro em celular e desktop.
- [ ] Conferir o fluxo `Voltar`, `Voltar`, `Sair` em todos os niveis.
- [ ] Confirmar que a marca da Netlify nao impede nenhum clique.
- [ ] Preencher os links reais de WhatsApp de cada modulo.

### Auditoria Admin/Mestre em 13/09/2026

- [x] Cadastro exibiu 160 pessoas, 129 ativas, e permitiu telefone compartilhado
  sem fundir identidades.
- [x] Conta Eliaudrey permaneceu vinculada ao `masterId` `m_3fa99d9d`; o select
  da pessoa fica bloqueado depois de um vinculo valido.
- [x] O salvamento tambem preserva o `masterId` atual, mesmo se a interface for
  manipulada; contas legadas com vinculo quebrado continuam reparaveis.
- [x] A exclusao de pessoa passou a procurar o `masterId` em colecoes,
  historicos e configuracoes aninhadas antes de permitir a remocao.
- [x] O relatorio mostrou 30 itens: 25 sem vinculo, cinco IDs orfaos e zero
  duplicados, alem de duas configuracoes ainda nao salvas.
- [x] O relatorio abriu completo, com caminho e registro sanitizado, e oferece
  `Copiar` e `Baixar .md` sem senha, telefone ou WhatsApp.
- [x] Congregacao, Agenda, PDFs do Quadro, backup e entrada de restauracao foram
  revisados sem salvar, baixar ou restaurar dados reais.
- [x] Desktop e 390 x 844 ficaram sem rolagem horizontal ou sobreposicao de
  controles; a navegacao inferior retornou ao indice e depois aos modulos.
- [x] Suite completa com 160 testes e build de producao aprovados depois das
  correcoes.

### Auditoria de Tarefas em 13/09/2026

- [x] A carga inicial passou a usar um unico snapshot de `tarefas`, junto com
  configuracao da congregacao e cadastro mestre: tres leituras coerentes em vez
  de varias leituras independentes do mesmo modulo.
- [x] O cadastro impede dois participantes de Tarefas com o mesmo `masterId`,
  sem tentar aproximar pessoas pelo nome.
- [x] A publicacao desfaz o documento do Quadro se o bloqueio do periodo falhar,
  evitando uma publicacao incompleta.
- [x] O menu deixa claro que a configuracao reune periodo, regras, datas e
  mensagens do proprio modulo.
- [x] Em 1440 x 900, a tabela coube na largura disponivel sem rolagem horizontal.
  Em 390 x 844, os cartoes da escala voltaram a aparecer e a pagina permaneceu
  sem sobreposicao ou rolagem horizontal.
- [x] A navegacao inferior mostrou `Voltar` no indice de Tarefas e `Sair` ao
  retornar ao painel de modulos.
- [x] O PDF real abriu na previa, foi renderizado externamente em A4 retrato
  (595,28 x 841,89 pontos), manteve linhas visiveis e nao apresentou cortes ou
  sobreposicoes nas duas paginas verificadas.
- [x] Os 17 testes de Tarefas e o build de producao passaram depois das
  correcoes. Nenhum cadastro, escala, publicacao ou reabertura foi salvo nos
  dados atuais durante a auditoria.

### Auditoria de Limpeza em 13/09/2026

- [x] A preferencia mensal ou bimestral passou a pertencer ao proprio modulo de
  Limpeza, sem depender da configuracao ou do planejamento de Tarefas.
- [x] A carga inicial caiu de oito leituras para quatro snapshots coerentes e
  deixou de carregar a raiz de relatorios do Secretario.
- [x] Periodos publicados nao podem ser gerados novamente ate serem reabertos.
  Publicacao e reabertura possuem compensacao para desfazer o documento quando
  a atualizacao do estado do periodo falhar, e vice-versa.
- [x] Grupos proprios e grupos do Secretario usam somente `masterId` exato; a
  integracao com os grupos do Secretario e somente de leitura.
- [x] Alterar a opcao de reutilizar grupos sem salvar nao modifica a configuracao
  efetiva em memoria.
- [x] A selecao de ajudantes mostra nomes completos em duas colunas no desktop e
  uma coluna em celular.
- [x] O PDF real foi renderizado em uma unica folha A4 retrato, com linhas
  visiveis, acentos corretos e sem cortes. Nomes longos reduzem somente a sua
  propria linha, sem encolher todo o documento.
- [x] As larguras 390 x 844 e 1440 x 900 ficaram sem rolagem horizontal ou
  sobreposicao de controles.
- [x] Os cinco testes de Limpeza e o build de producao passaram depois das
  correcoes. Nenhuma configuracao, escala, publicacao ou reabertura foi salva nos
  dados atuais durante a auditoria.
- [x] A recorrencia do pico de conexoes do Realtime Database observada durante
  esta auditoria foi promovida para a pendencia global de confiabilidade.

## Fase 7 - Homologar PDFs publicos

- [ ] Publicar um periodo representativo de Tarefas.
- [ ] Publicar um periodo representativo de Oradores.
- [ ] Publicar um periodo representativo de Escala TPL.
- [ ] Publicar um periodo representativo de Limpeza.
- [ ] Publicar um periodo representativo de Servico de Campo.
- [ ] Confirmar na Minha Agenda um seletor unico de periodo.
- [ ] Confirmar os cinco botoes independentes `Baixar PDF`.
- [ ] Confirmar que Secretario e Vida e Ministerio nao aparecem como PDFs
  publicos dos modulos.
- [ ] Enviar pelo Admin mais de um documento manual e conferir a area separada
  `Documentos do Admin`.
- [ ] Conferir orientacao A4 retrato, linhas, quebra de paginas, nomes e datas.

## Fase 8 - Homologacao externa final

Executar integralmente `HOMOLOGACAO-ICS-DADOS-E-APARELHOS.md` por ultimo.

- [ ] Google Calendar no computador.
- [ ] Android sincronizado.
- [ ] Apple Calendar em pelo menos um aparelho Apple.
- [ ] Datas e horarios em `America/Fortaleza`.
- [ ] Isolamento de dados entre duas pessoas.
- [ ] Duas instalacoes com assinaturas independentes.
- [ ] Alteracao chegando ao mesmo link ICS.
- [ ] Revogacao independente.
- [ ] PWA instalada abrindo offline sem misturar identidades.
- [ ] Rascunho de relatorio persistindo somente no aparelho.
- [ ] Concorrencia real entre Minha Agenda e Secretario em dois clientes.
- [ ] Remocao e revogacao dos links temporarios usados nos testes.

## Fase 9 - Documentacao e commit final

- [x] Atualizar os documentos antigos que ainda mencionam contagens anteriores.
- [x] Remover a afirmacao antiga de que o PWA de Minha Agenda ainda e
  `network-first`.
- [x] Remover a afirmacao antiga de que a separacao dos PDFs ainda nao foi
  implementada.
- [x] Registrar o resultado real da importacao e da auditoria pos-importacao.
- [x] Substituir `xlsx` por `exceljs` e executar `npm audit --omit=dev` com zero
  vulnerabilidades conhecidas.
- [x] Executar novamente `npm run test:all` com 160 testes.
- [x] Executar novamente `npm run build`.
- [x] Revisar `git diff` e confirmar que nenhum backup, telefone, chave privada
  ou senha operacional entrou nos arquivos preparados para o Git. As senhas de
  exemplo dos testes foram substituidas por `senha-teste`.
- [x] Receber autorizacao expressa do Admin para o commit em 14/09/2026.
- [x] Preparar e registrar o commit de consolidacao autorizado.
- [ ] Enviar ao GitHub e aguardar o deploy via Netlify.
- [ ] Conferir a versao publicada e os endpoints de calendario.

O Netlify CLI confirmou em 12/09/2026 que este repositorio esta vinculado ao
projeto `admin-noroeste` (`https://admin-noroeste.netlify.app`) e autenticado na
conta correta. A autorizacao para o commit foi recebida em 14/09/2026; o deploy
via GitHub ainda aguarda o `push`.

### Como usar o Netlify CLI neste projeto

Em 14/09/2026, o CLI ficou resolvido no Windows com instalacao global:

```powershell
npm install -g netlify-cli
netlify --version
netlify status
netlify dev --port 5174
```

O binario confirmado ficou em
`C:\Users\eliau\AppData\Roaming\npm\netlify.cmd`. O repositorio ja esta
autenticado e vinculado ao site `admin-noroeste`, entao `netlify status` deve
mostrar a conta conectada e o projeto correto antes de qualquer teste local.

Para desenvolvimento local, usar preferencialmente:

```powershell
netlify dev --port 5174
```

Quando o servidor subir, abrir `http://localhost:5174/` para os modulos e
`http://localhost:5174/agenda/` para a Minha Agenda. Neste ambiente, `localhost`
respondeu corretamente; `127.0.0.1` pode falhar dependendo de como o proxy do
Netlify foi iniciado. A Function de usuarios tambem deve responder em
`http://localhost:5174/.netlify/functions/auth-users`.

Se aparecer `deno.lock` apos rodar o CLI, tratar como artefato local do runtime
da Netlify neste projeto e nao incluir no commit, a menos que o app passe a usar
Edge Functions de forma intencional.

## Criterio de encerramento

O projeto somente pode ser declarado finalizado quando:

1. As correcoes de login, identidade, previa e Firebase estiverem concluidas.
2. O backup importado passar na auditoria pos-importacao.
3. Os vinculos relevantes estiverem corrigidos ou conscientemente registrados
   para tratamento posterior sem risco de mistura de pessoas.
4. Os nove modulos e os cinco PDFs publicos forem homologados.
5. PWA, concorrencia de relatorio e assinaturas ICS forem aprovadas em aparelhos
   reais.
6. Os 160 testes e o build continuarem aprovados.
7. O commit final tiver sido autorizado, enviado ao GitHub e publicado pela
   Netlify.
