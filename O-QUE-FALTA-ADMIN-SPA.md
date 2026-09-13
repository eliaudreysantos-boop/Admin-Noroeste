# O que falta para encerrar o Admin SPA

Atualizado em 13/09/2026.

Este arquivo e o checklist curto de encerramento. A especificacao e as
evidencias detalhadas permanecem em `PENDENCIAS-FINAIS-ADMIN-SPA.md`.

## Estado local concluido

- [x] Os nove modulos e as quatro telas da Minha Agenda estao implementados.
- [x] Login e acesso aos dados usam sessoes proprias em Netlify Functions, sem
  Firebase Authentication.
- [x] A Minha Agenda recebe somente a identidade pareada, eventos publicos,
  documentos sanitizados e dados do proprio publicador.
- [x] Realtime Database e Storage possuem regras locais que negam acesso direto.
- [x] PDFs publicos possuem previa obrigatoria e publicacao separada por modulo.
- [x] Os 157 testes automatizados passaram.
- [x] O build de producao e o empacotamento das dez Netlify Functions passaram.
- [x] `npm audit --omit=dev` retornou zero vulnerabilidades conhecidas.
- [x] Nenhum backup, telefone, senha operacional ou chave privada foi incluido no
  conjunto preparado para o Git.

## Ordem obrigatoria de publicacao

1. Enviar o commit ao GitHub e integrar as alteracoes na branch usada pela
   producao da Netlify.
2. Aguardar o deploy do site e das dez Functions.
3. Na versao publicada, validar login, leitura dos modulos, Minha Agenda, envio
   de relatorio e endpoints ICS.
4. Somente depois dessa validacao, publicar `database.rules.json` no Firebase.
   Publicar a regra antes do site novo bloquearia a versao atualmente online.
5. Inicializar o Firebase Storage pelo Console, caso ainda nao esteja ativo.
6. Conceder a conta de servico da Netlify permissao para administrar objetos no
   bucket.
7. Validar upload, substituicao, download e remocao de um PDF de teste.
8. Publicar `storage.rules`.

## Homologacao funcional

- [ ] Conferir manualmente os nove modulos em celular e computador.
- [ ] Conferir `Voltar`, `Voltar`, `Sair` e a area inferior protegida da marca da
  Netlify.
- [ ] Publicar um periodo de Tarefas, Limpeza, Oradores, Escala TPL e Servico de
  Campo.
- [ ] Confirmar os cinco botoes independentes `Baixar PDF` na Minha Agenda.
- [ ] Enviar mais de um documento pelo Admin e conferir a area `Documentos do
  Admin`.
- [ ] Conferir previa, A4 retrato, linhas, nomes, datas e quebras de pagina dos
  PDFs publicos.
- [ ] Testar concorrencia real entre o envio de relatorio da Minha Agenda e a
  correcao pelo Secretario.
- [ ] Instalar a PWA, abrir offline e confirmar que rascunhos e identidade nao se
  misturam entre pessoas.

## Homologacao ICS por ultimo

- [ ] Assinar um calendario pessoal e um calendario do Quadro.
- [ ] Testar Google Calendar no computador e Android sincronizado.
- [ ] Testar Apple Calendar em pelo menos um aparelho Apple.
- [ ] Confirmar datas e horarios em `America/Fortaleza`.
- [ ] Confirmar os lembretes configurados por modulo e a ausencia de lembrete de
  Servico de Campo no Quadro.
- [ ] Testar duas instalacoes independentes, alteracao no mesmo link e revogacao
  separada.
- [ ] Revogar os links temporarios usados na homologacao.

## Dados reais a revisar depois

Estas pendencias foram preservadas sem vinculo automatico para evitar mistura de
pessoas:

- cinco participantes incertos da Escala TPL;
- 27 perfis e 184 referencias de Vida e Ministerio;
- 20 relatorios de Valeria ainda dependentes de decisao;
- Taina sem relatorios na fonte analisada;
- superintendentes dos quatro grupos;
- links reais de WhatsApp de cada modulo;
- locais, horarios e dirigentes reais do Servico de Campo.

## Melhoria nao bloqueante

- O pacote de exportacao S-21 possui aproximadamente 1 MB minificado. Ele ja e
  carregado somente quando a exportacao e aberta, portanto pode ser otimizado
  depois da homologacao sem impedir a publicacao atual.

## Criterio de encerramento

O projeto pode ser declarado encerrado quando o deploy estiver ativo, as regras
finais estiverem publicadas na ordem acima, os PDFs e modulos tiverem sido
homologados e os testes de aparelhos e calendarios estiverem registrados.
