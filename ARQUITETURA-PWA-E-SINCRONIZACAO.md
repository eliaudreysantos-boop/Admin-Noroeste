# Arquitetura PWA e sincronizacao

## Decisao final

Minha Agenda deixou de ser um modulo do painel administrativo. Ela possui
entrada, manifesto, service worker e link proprios em `/agenda/`. O painel
principal continua online-first e exibe apenas os modulos administrativos.

## Minha Agenda: offline-first

- A pessoa e a agenda salvas abrem primeiro a partir do dispositivo.
- O cache guarda somente dados necessarios para a propria pessoa, eventos
  publicos do Quadro e configuracoes publicas.
- Senhas e telefones nao entram no snapshot offline.
- Relatorios de outras pessoas nao entram no snapshot offline.
- A atualizacao do Firebase acontece quando nao existe cache ou quando o ultimo
  snapshot tem 24 horas ou mais.
- Voltar ao app ou recuperar a conexao dispara a verificacao do ciclo diario.
- O app continua utilizavel com o ultimo snapshot se o Firebase estiver
  indisponivel.

## Modulos administrativos: online-first

Admin, Secretario, Oradores, Vida e Ministerio, Tarefas, Limpeza e Escala TPL
continuam lendo e gravando diretamente no Firebase. O cache do service worker e
apenas contingencia para o shell; ele nao substitui dados administrativos nem
cria uma segunda fonte de verdade.

## Papel do Netlify

Netlify hospeda os arquivos do app e a funcao do feed ICS; ele nao e banco de
dados. Por isso, a sincronizacao semanal com Netlify significa conferir e
atualizar o shell instalado uma vez a cada sete dias. O Firebase permanece a
fonte dos dados e o endpoint ICS consulta os dados publicados quando o cliente
de calendario atualiza a assinatura.

## Ciclos

| Aplicacao | Dados | Shell hospedado |
|---|---|---|
| Minha Agenda | cache local primeiro; Firebase a cada 24 h | verificacao Netlify a cada 7 dias |
| Modulos administrativos | Firebase primeiro em cada uso | verificacao Netlify a cada 7 dias |

Os ciclos sao verificados ao abrir/retomar o app. Navegadores podem suspender
aplicativos fechados; portanto o sistema nao promete execucao exata em segundo
plano quando o sistema operacional nao permitir.
