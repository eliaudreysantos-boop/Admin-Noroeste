# Padroes reaproveitaveis entre modulos

Registro de comportamentos que ja apareceram em mais de um modulo e podem ser
extraidos ou replicados com criterio. Este arquivo nao obriga aplicar tudo em
todos os lugares; ele serve para decidir o que vale levar para os proximos apps.

## Decisao atual sobre avisos

Mensagens por reuniao foram aposentadas dos modulos operacionais. Tarefas,
Limpeza e Oradores nao devem abrir WhatsApp para avisar cada reuniao. O padrao
novo e:

- o modulo dono grava escala, programacao, status e documentos;
- Minha Agenda agrega os compromissos pessoais;
- Quadro de Anuncios mostra as designacoes de todos os modulos;
- compartilhamento por WhatsApp acontece a partir do Quadro ou da agenda
  pessoal, com texto editavel e sem escolher telefone automaticamente.

## Padroes ja reaproveitados

| Padrao | Onde ja aparece | Proxima aplicacao provavel |
|---|---|---|
| Identidade central por `masterId` | Tarefas, Limpeza, Oradores, Vida e Ministerio, Servico de Campo, Minha Agenda | Secretario e qualquer modulo que precise receber dados do publicador |
| Nome/telefone vindos somente do Admin | Tarefas, Oradores, Vida e Ministerio, Secretaria parcial | Secretario precisa preservar isso ao receber relatorios da Minha Agenda |
| Seletor de pessoa vinculada ao cadastro central | Tarefas, Limpeza, Oradores, Vida e Ministerio | Publicadores, grupos e conferencia no Secretario |
| Preferencias locais de tela | Oradores, Limpeza, Minha Agenda, Vida e Ministerio | Secretario: filtros de grupo, mes, ano de servico e status |
| Periodo persistente | Limpeza, Oradores, Vida e Ministerio, Minha Agenda | Secretario: competencia mensal e ano de servico |
| Geração/edicao preservando escolha manual | Tarefas, Limpeza, Oradores, Vida e Ministerio | Secretario: fechamento/reabertura sem apagar conferencia manual |
| Pendencias acionaveis | Tarefas, Oradores, Vida e Ministerio, Mestre | Secretario: relatorios faltantes, atraso, assistencia incompleta, documento bloqueado |
| PDFs por dados operacionais reais | Tarefas, Limpeza, Oradores, Vida e Ministerio, Secretario | Padronizar controles de periodo, fonte e preview quando possivel |
| Quadro derivado sem tabela nova | Minha Agenda | Apps publicos e visoes de consulta que nao devem recalcular escalas |
| Texto editavel antes do WhatsApp | Minha Agenda | Compartilhamento de Quadro e rascunhos pessoais; nao voltar aos modulos operacionais |
| Publicacao como fronteira do adapter | Tarefas, Escala TPL, Servico de Campo | Rascunhos administrativos nao aparecem em Minha Agenda, Quadro ou ICS |
| Registro de PDFs publicos | Limpeza, Oradores, Vida e Ministerio, Servico de Campo, Admin | Qualquer PDF destinado ao Quadro grava metadados e URL por periodo depois de abrir a previa |
| Assinatura ICS por token revogavel | Minha Agenda, Quadro | Calendarios externos recebem atualizacoes sem expor `masterId` na URL |
| Configuracao central de lembretes | Admin, Minha Agenda | Cada origem aplica zero, um ou dois `VALARM` sem alterar o evento original |
| Inativacao preservando historico | Escala TPL, Oradores | Cadastros referenciados deixam de participar de novas geracoes sem quebrar periodos antigos |

## Vida e Ministerio

### O que pode reaproveitar

- Importacao oficial transformada em dados estruturados antes de salvar.
- `mergeImportedProgram`: importar sem destruir edicoes ja feitas.
- Sugestao de designados baseada em permissao, historico e conflitos.
- Seletor com pessoa recomendada e ultima designacao visivel.
- Registro separado de designado, ajudante, substituto, realizado, ausente e
  confirmado.
- Pendencias por parte, com alvo claro para edicao.
- Geracao de documentos a partir da semana ou periodo selecionado.

### Onde usar depois

- Secretario pode usar o mesmo padrao de conferencia: dado recebido, revisado,
  confirmado e fechado.
- Minha Agenda deve consumir `programacao/programs` apenas como leitura e nunca
  recalcular sugestao.
- Outros modulos com importacao externa devem seguir o mesmo modelo: importar,
  comparar, mesclar e preservar edicoes.

### Nao levar para fora automaticamente

- Regras especificas de partes, secoes e permissoes do ministerio.
- Sala B/C. Para Noroeste ficam inativas ou fora da interface enquanto nao
  houver uso real.
- Lembretes por WhatsApp dentro do modulo, se o fluxo for apenas aviso.

## Limpeza

### O que pode reaproveitar

- Motor mensal/bimestral com periodo persistido em `limpeza/periodos`.
- Opcao de usar grupos do Secretario sem copiar nomes e membros.
- Modo somente leitura para estrutura herdada de outro modulo.
- PDF separado da geracao da escala.
- Configuracao enxuta: apenas aquilo que altera a escala de limpeza.
- Leitura pela Minha Agenda sem recalcular.

### Onde usar depois

- Secretario deve ser o dono dos grupos de servico; Limpeza e outros modulos
  apenas consomem quando fizer sentido.
- Apps que reaproveitam dados de outro modulo devem bloquear edicao estrutural
  local e mostrar claramente a origem.
- Relatorios do Secretario podem reaproveitar a ideia de periodo fechado: gerar,
  revisar, fechar, reabrir com permissao.

### Nao levar para fora automaticamente

- Rotacao de grupos como regra geral.
- Configuracao propria de limpeza dentro de Tarefas.
- Textos/aprovacoes antigos de limpeza.

## Avisos e Quadro de Anuncios

### O que pode reaproveitar

- `collectAnnouncementEvents`: agregar eventos prontos de varias fontes.
- Separacao entre dado publico e dado administrativo.
- Agrupamento de pessoas no mesmo evento.
- Filtros por mes, modulo/origem e status.
- Compartilhamento por WhatsApp sem telefone automatico.
- Mensagem derivada apenas dos itens filtrados.

### Onde usar depois

- Minha Agenda final deve manter o Quadro como tela propria.
- Secretario pode receber relatorios da Minha Agenda sem depender do Quadro.
- Qualquer modulo novo deve expor dados suficientes para agenda/quadro por
  `masterId`, data, horario, titulo, detalhe publico, local e status.

### Nao levar para fora automaticamente

- Criar tabela nova de anuncios antes de existir necessidade de mural congelado.
- Expor telefone, observacao administrativa ou contato de congregacao no Quadro.
- Fazer o Quadro alterar escalas ou confirmar designacoes.

## Secretario antes de Minha Agenda final

Minha Agenda precisa enviar relatorio pessoal para o Secretario. Por isso, antes
de fechar Minha Agenda, o Secretario precisa validar este contrato:

- `masterId` e obrigatorio para todo relatorio recebido.
- Competencia mensal usa `YYYY-MM`.
- Envio entre dias 1 e 10 e normal; depois disso entra como atrasado, mas nao
  torna o publicador irregular sozinho.
- Publicador informa participacao no ministerio e estudos biblicos.
- Horas ficam separadas por categoria quando aplicavel: campo, atividade
  aprovada e credito.
- Observacao do publicador e limitada e vai para conferencia, nao direto para
  documento final.
- Secretario revisa, ajusta quando necessario, fecha o mes e registra envio.
- Relatorio atrasado entra no consolidado do mes seguinte conforme regra ja
  registrada.

## Secretario

### O que pode reaproveitar

- Ciclo de competencia `em conferencia -> fechada -> reaberta`, com registro
  de data e bloqueio da edicao no app que enviou o dado. Serve para qualquer
  rotina mensal que precise de uma revisao final sem apagar historico.
- Dado recebido com origem explicita (`minha_agenda` ou `secretario`). A tela
  mostra quem enviou e o administrador pode ajustar o registro sem perder a
  rastreabilidade da origem.
- Fila de pendencias derivada do cadastro ativo e do periodo, em vez de uma
  lista manual. Cada item tem uma acao direta e a cobranca de grupo produz um
  rascunho de WhatsApp com todos os nomes pendentes.
- Competencia de origem separada da competencia contabil. Um registro atrasado
  preserva o mes ao qual pertence, mas entra no consolidado do mes seguinte.
- Utilitarios de ano de servico de setembro a agosto, series mensais e totais
  por categoria. Sao uma base segura para paines anuais e acompanhamentos de
  metas em outros modulos.
- Painel mensal de conferencia: metricas da rotina em dados consultaveis, sem
  obrigar que todo resumo administrativo vire PDF. O S-1 e o exemplo atual.
- Templates oficiais incluidos no app, com substituicao opcional no Firebase
  Storage. Evita escolher o mesmo arquivo a cada emissao e ainda permite uma
  revisao oficial futura.
- Previa modal de PDF com baixar, imprimir e fechar. A geracao nao muda os
  dados que originaram o documento.
- Exportacao anual em lote para ZIP de planilhas, organizada por grupos,
  categorias, fichas individuais, contatos e totais. O formato e adequado a
  processos administrativos que precisam ser impressos ou arquivados em massa.

### Onde usar depois

- Tarefas, Limpeza, Oradores e Vida e Ministerio podem reutilizar o fechamento
  de periodo quando houver uma etapa de conferencia que deva bloquear ajustes.
- Minha Agenda pode manter a origem de qualquer dado enviado para outro modulo
  e mostrar ao usuario quando ele ja foi revisado pelo responsavel.
- Os demais documentos PDF devem adotar o seletor de template padrao e a mesma
  previa do Secretario, sem download direto.
- Exportacoes recorrentes de Oradores, Tarefas ou Limpeza podem usar o padrao
  de ZIP/Excel quando uma colecao de fichas individuais for mais util que um
  unico PDF.

### Nao levar para fora automaticamente

- Regra de atraso ate o dia 10 e deslocamento contabil para o mes seguinte.
  Ela pertence aos relatorios de servico.
- Categorias de pioneiro, meta anual de 600 horas e os campos administrativos
  de reativado, surdo, cego e preso.
- Cobranca de relatorios pelo superintendente de grupo em modulos que nao tem
  essa estrutura de responsabilidade.

## Candidatos a componente/util compartilhado

| Candidato | Origem | Por que vale extrair |
|---|---|---|
| `month/period controls` | Limpeza, Oradores, Vida e Ministerio, Minha Agenda | Evita cada modulo criar sua propria navegacao de periodo |
| `master person select` | Tarefas, Limpeza, Oradores, Vida e Ministerio | Garante cadastro central e bloqueia duplicacao de pessoa |
| `pending list item` | Tarefas, Oradores, Vida e Ministerio, Mestre | Padroniza severidade, alvo e acao de correcao |
| `editable share modal` | Minha Agenda | Serve para Quadro e futuras mensagens pessoais sem voltar ao envio por modulo |
| `document action panel` | Limpeza, Oradores, Vida e Ministerio, Secretario | Padroniza gerar PDF/DOCX sem alterar dados operacionais |
| `public event adapter` | Minha Agenda | Cada modulo entrega eventos publicos com o mesmo contrato |
| `secretary report intake` | Minha Agenda/Secretario | Deve ser o contrato estavel para envio do relatorio pessoal |
| `period lifecycle` | Secretario | Fecha, bloqueia e reabre uma competencia sem apagar o historico |
| `record origin badge` | Secretario/Minha Agenda | Mostra se o dado veio da pessoa ou foi lancado pelo administrador |
| `derived pending queue` | Secretario | Produz pendencias a partir de cadastro, periodo e registros existentes |
| `standard PDF template + preview` | Secretario | Usa modelo padrao, permite substituicao controlada e exige conferencia antes da saida |
| `shared PDF preview modal` | Secretario, Vida e Ministerio | Centraliza previa, download e impressao sem alterar os dados operacionais |
| `batch spreadsheet export` | Secretario | Gera ZIP anual organizado para processos que precisam de muitos arquivos |
| `desktop table + mobile cards` | Tarefas antigo | Mantem leitura comparativa em tela grande sem perder usabilidade no celular |
| `manual picker with warnings` | Tarefas antigo | Permite escolha manual consciente, avisando conflitos sem bloquear o responsavel |
| `preserved stale records` | Tarefas antigo | Mostra registros fora do planejamento atual sem apagar historico nem misturar na nova geracao |
| `print font preference` | Tarefas antigo | Permite ajustar cabimento do documento antes da previa/impressao |
| `published snapshot` | Escala TPL | Congela nomes/locais publicados para leitura historica mesmo se o cadastro atual mudar |
| `availability matrix` | Escala TPL | Registra disponibilidade por pessoa, local, dia e horario com revisao periodica |
| `persistent/monthly slot blocks` | Escala TPL | Permite bloquear horarios recorrentes ou excecoes apenas de um mes sem apagar disponibilidade |
| `link integrity dashboard` | Admin/Mestre | Mostra vinculos sem `masterId`, orfaos e duplicados antes que virem erro nos modulos |
| `global agenda settings` | Admin/Mestre | Centraliza link do Quadro e lembretes ICS por modulo em vez de espalhar configuracao |
| `validated destructive import` | Admin/Mestre | So libera restauracao depois de validar estrutura, vinculos e invariantes administrativas |
| `sanitized integrity report` | Admin/Mestre | Exporta falhas com severidade, acao e caminho exato sem expor senha ou contato pessoal |
| `two-level module navigation` | Admin/Mestre | Separa voltar dentro do modulo de retornar ao indice global de aplicativos |
| `published public document registry` | Minha Agenda | Lista PDFs por modulo e periodo sem acoplar o Quadro aos geradores |
| `revocable calendar feed` | Minha Agenda | Separa download pontual de assinatura atualizavel e permite invalidar links antigos |
| `offline-first sanitized snapshot` | Minha Agenda | Apps publicos podem abrir o ultimo estado sem guardar senhas, telefones ou dados de terceiros |
| `weekly shell refresh` | Admin, Minha Agenda | PWAs verificam uma nova versao hospedada sem transformar Netlify em banco de dados |
| `publication gate` | Tarefas/Escala TPL/Servico de Campo | Impede que rascunhos vazem para adapters publicos sem duplicar dados |
| `variable-pool rotation` | Servico de Campo | Distribui designacoes para qualquer quantidade de pessoas e evita repeticao no mesmo dia quando possivel |
| `source-assisted configuration` | Servico de Campo/Escala TPL | Reaproveita horario e local como sugestao sem criar dependencia ou gravacao automatica |

## Contratos consolidados no fechamento

### Documento publico

O modulo gera bytes, abre a previa obrigatoria e, quando o documento e proprio
para o Quadro, grava em `agenda/documentos` apenas `id`, modulo, periodo, nome,
URL, caminho no Storage e data de criacao. Documentos administrativos do
Secretario nao entram nesse registro. O Admin pode publicar PDFs avulsos de
consulta quando escolher explicitamente um arquivo, conferir a previa e definir
nome e periodo.

### Feed de calendario

`agenda/assinaturas/{token}` define assinatura pessoal ou do Quadro. O token e
aleatorio, pode ser revogado e substitui qualquer identificador pessoal na URL.
O endpoint aplica janela de dois meses anteriores e doze meses futuros, filtra
somente dados publicados e usa os lembretes de `agenda/config/icsReminders`.

### Publicacao

Quando um modulo possui rascunho, seu adapter publico precisa de uma marca
explicita de publicacao. Tarefas usa o periodo bloqueado/publicado; Escala TPL
usa `publishedMonths` e snapshots. Reabrir ou despublicar remove o periodo das
visoes publicas sem apagar o trabalho administrativo.

## Servico de Campo

### O que pode reaproveitar

- Rodizio com conjunto variavel de pessoas e equilibrio pelo historico.
- Varias ocorrencias independentes na mesma data, sem chave unica por dia.
- Preservacao de escolhas manuais ao completar uma geracao.
- Sugestoes de configuracao vindas de outro modulo sem gravacao automatica.
- Publicacao mensal como fronteira para Agenda, Quadro e ICS.
- Inativacao de modelos recorrentes que ja possuem historico.

### Onde usar depois

- Limpeza e Escala TPL podem reutilizar o rodizio de conjunto variavel quando a
  unidade distribuida for pessoa, e nao grupo ou dupla.
- Outros modulos podem usar sugestoes vindas de uma fonte vizinha desde que o
  responsavel ainda confirme e salve o dado no modulo dono.
- Minha Agenda consome a designacao do dirigente com lembrete; o Quadro consome
  a mesma saida publicada sem alarme.

### Nao levar para fora automaticamente

- Tratar toda agenda recorrente como rodizio de dirigentes.
- Copiar horarios da Escala TPL de forma automatica e permanente.
- Aplicar o bloqueio de uma saida por dia; o contrato admite varias.
- Colocar lembrete no feed publico do Quadro.

## Tarefas

### O que pode reaproveitar

- Geracao deterministica que preserva edicoes manuais e aborta quando nao
  consegue fechar uma reuniao sem violar regras importantes.
- Seletor manual com aviso de conflito: o responsavel ve o problema, mas ainda
  pode salvar uma excecao consciente.
- Layout duplo: tabela em desktop para comparar o periodo inteiro e cards no
  mobile para edicao confortavel.
- Bloco de registros preservados fora do planejamento atual, evitando que
  mudancas de calendario parecam perda de dados.
- Pendencias agregadas por periodo/reuniao/funcao, com severidade, contagem e
  acao direta.
- Preferencia de fonte de impressao combinada com previa obrigatoria.

### Onde usar depois

- Oradores pode reaproveitar o seletor manual com avisos para visitante,
  intercambio, confirmacao e conflito de data.
- Escala TPL deve reaproveitar tabela desktop + cards mobile, porque trabalha
  com comparacao de dias/horarios.
- Vida e Ministerio pode reaproveitar registros preservados quando uma
  importacao oficial muda a estrutura de uma semana.
- Minha Agenda deve consumir apenas o adapter publico de Tarefas, sem recalcular
  escala nem gerar avisos dentro do modulo.

### Nao levar para fora automaticamente

- Regras de elegibilidade das funcoes mecanicas.
- Limpeza embutida em Tarefas; Limpeza agora e modulo proprio.
- Mensagens antigas por reuniao dentro de Tarefas; avisos comuns pertencem a
  Minha Agenda/Quadro.
- Duas secoes do app antigo, porque Noroeste nao usa esse fluxo.

## Escala TPL

### O que pode reaproveitar

- Matriz de disponibilidade por pessoa/local/dia/horario, com data de revisao.
- Bloqueios em duas camadas: persistentes e somente do mes.
- Publicacao simples de mes com bloqueio de edicao e snapshot historico de
  nomes/locais.
- Geracao que preserva duplas ja preenchidas e respeita conflitos entre locais.
- Regras locais de participante sem duplicar dados pessoais do Admin.
- Ajuste de fonte para impressao, que deve ser combinado com previa obrigatoria.

### Onde usar depois

- Minha Agenda/Quadro devem consumir apenas meses publicados da Escala TPL por
  adapter publico.
- Tarefas pode reaproveitar a ideia de snapshot publicado se algum periodo
  precisar ficar congelado para publicadores.
- Limpeza pode reaproveitar bloqueios mensais/persistentes se futuramente houver
  semanas sem grupo ou excecoes recorrentes.
- Oradores pode reaproveitar snapshot historico para manter nomes de
  programacoes antigas depois de mudancas no cadastro.

### Nao levar para fora automaticamente

- Mensagem para pessoa e mensagem do dia dentro da Escala TPL; avisos comuns
  pertencem a Minha Agenda/Quadro.
- Regras de dupla do carrinho como regra geral de outros modulos.
- Exclusao direta de local com apagamento de escala; preferir inativacao quando
  houver historico.
- Expor rascunho de mes ainda nao publicado para Minha Agenda/Quadro.

## Admin/Mestre

### O que pode reaproveitar

- Fonte unica de pessoa por `masterId`, com nome e WhatsApp sem cadastro
  paralelo nos modulos.
- Painel de integridade de vinculos para detectar registros sem `masterId`,
  orfaos e duplicados.
- Protecao contra remover o ultimo Admin ativo.
- Backup/restauracao com validacao de contrato antes de gravar, incluindo pessoa
  mestre existente, um unico usuario pessoal por `masterId` e preservacao de ao
  menos um Admin ativo.
- Relatorio de falhas pronto para revisao externa, com contagens, severidade,
  acao sugerida e caminho Firebase exato. O arquivo deve ser sanitizado: senha,
  telefone e outros contatos nao entram no diagnostico exportado.
- Navegacao em dois niveis: voltar dentro do Admin retorna ao indice do proprio
  modulo; o botao global de Modulos retorna a lista geral de aplicativos.
- Separacao entre auditoria funcional e saneamento operacional: inconsistencias
  encontradas nos dados de exemplo comprovam o detector, mas nao sao tratadas
  automaticamente como defeito do codigo nem bloqueiam o fechamento funcional.
- Configuracoes globais compartilhadas, especialmente reunioes, congregacao,
  link do Quadro e lembretes ICS.
- Textos de ICS com aprovacao quando alterados.

### Onde usar depois

- Todos os modulos devem consultar o Admin para nome, ID, telefone, sexo,
  privilegio e status central.
- Minha Agenda e um app proprio em `/agenda/`: usa select por nome/ID e guarda
  apenas o `masterId` escolhido no dispositivo. Nao depende de permissao ou
  conta criada em `usuarios`.
- Quadro deve ler `agenda/config/quadroWhatsAppLink` como fonte principal.
- Os adapters publicos devem ser verificados pela aba de vinculos antes de
  publicar dados para publicadores.
- Importacoes destrutivas de outros modulos podem reutilizar a mesma barreira de
  validacao antes de habilitar a acao final.
- Paineis administrativos podem reutilizar o relatorio sanitizado para revisao
  por IA ou por uma pessoa, mantendo a correcao como uma acao separada e
  consciente.

### Nao levar para fora automaticamente

- Restauracao de backup como mecanismo comum de edicao.
- Textos de ICS como mensagens por WhatsApp.
- Correcao automatica de duplicidades sem revisao humana.
- Inferir identidade pelo numero de telefone. Telefone compartilhado, inclusive
  entre pais e filhos, e contato; identidade e sempre o `masterId`.
- Interpretar toda falha encontrada em dados de exemplo como regressao do app.
- Permissao de interface como seguranca final; regras Firebase/Storage precisam
  existir fora do codigo do app.

## Padroes obrigatorios

### Previa de PDF

Todo modulo que gerar PDF deve oferecer previa antes do download/impressao.

Este passa a ser um padrao obrigatorio para todos os documentos do sistema:

- o usuario gera o documento a partir dos dados operacionais atuais;
- o app mostra a previa do PDF na propria tela ou em modal dedicado;
- a acao de baixar/imprimir fica disponivel depois da previa;
- ajustes de periodo, fonte, filtros ou modelo devem atualizar a previa antes
  da exportacao final;
- documentos oficiais e documentos internos seguem o mesmo fluxo de conferencia;
- a previa nao deve gravar dados nem alterar escalas, programacoes ou relatorios.

Aplicacao obrigatoria: Tarefas, Limpeza, Oradores, Vida e Ministerio, Secretario,
Escala TPL, Servico de Campo, uploads administrativos e futuros documentos da
Minha Agenda quando existirem.

### PWA e sincronizacao

- Minha Agenda e offline-first: abre o snapshot sanitizado da pessoa e verifica
  o Firebase a cada 24 horas ao abrir, retomar ou recuperar conexao.
- Modulos administrativos sao online-first e continuam usando o Firebase como
  fonte imediata.
- Ambos verificam o shell publicado no Netlify a cada sete dias pelo service
  worker. Netlify nao recebe uma copia semanal dos dados do Firebase.
- O navegador pode suspender um app fechado; os ciclos sao garantidos na
  proxima abertura/retomada, nao em horario exato com o app encerrado.

## Ordem recomendada a partir daqui

1. Oradores: aplicar fases finais do comparativo.
2. Tarefas: aplicar fases restantes do comparativo.
3. Escala TPL: aplicar fases do comparativo e recuperar os fixtures locais de teste.
4. Limpeza: validar preview/PDF, documentacao e adapter.
5. Minha Agenda: fechar agenda pessoal, relatorio, Quadro e ICS.
