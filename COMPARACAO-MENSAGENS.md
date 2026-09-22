# Mensagens: antigo como referência

Comparação em 22/09/2026 com `tarefas-e-oradores s1 s2/src/shared/messaging/builders.ts`, configurações de `src/app/store.ts` e telas que chamam esses geradores.

## Ajuste aplicado neste trabalho

- Designações do orador e mensagem individual da programação incluem nome, data extensa, atividade, número/título do tema e dados da congregação de destino.
- Emojis recuperados do código antigo: 📅, 🚗, 🎙️, 📖, 🏛️, 📍, 🕒, 👤 e 📞.
- Mensagem usa Endereço (campo `localizacao` do cadastro). URLs, coordenadas e Plus Codes não são tratados como endereço; não há fallback para `mapa`.
- Localização/mapa permanece no fluxo ICS, que não foi alterado. Nenhuma programação ou cadastro real foi modificado.
- Templates personalizados existentes são preservados.

## Comparação original (resolvida na implementação abaixo)

| Fluxo | Padrão antigo | Situação no novo |
| --- | --- | --- |
| Designações | Saudação “Segue suas próximas designações” e orientação de preparação completa | Template padrão genérico; falta migrar o padrão sem sobrescrever personalizações |
| Segundo orador | Atividade identificada como Segundo orador | Incluído na seleção, mas texto não distingue a função |
| Sentinela | Substituições agregadas à mensagem; rodapé de preparação apenas quando também há discurso | Não agregadas à lista de designações enviada |
| Confirmação | Saudação nominal, data/hora, tema, endereço e “Pode confirmar?” | Botão usa a mensagem genérica da programação, sem pergunta explícita |
| Intercâmbio | Saudação ao contato; grupos Convites e Saídas; data/hora, orador, número/título do tema | Linhas resumidas de data, vai/vem e nome |
| Datas disponíveis | Ação envia datas/horários livres, congregação local e endereço | Sem ação equivalente no cadastro de congregações |
| Tarefas | Mensagens por pessoa e por dia, funções com emojis e limpeza quando aplicável | Não localizado fluxo equivalente de envio; configurações não equivalem ao envio |
| Telefone | Normaliza DDD brasileiro adicionando 55; formata telefone para leitura | Remove caracteres e exige ao menos 12 dígitos para abrir WhatsApp; não acrescenta 55 |

No antigo, o endereço/localização só aparecia quando preenchido. O ajuste novo mostra “Endereço: Não informado” quando não há endereço utilizável. No antigo, detalhes da congregação são próprios das saídas; o ajuste também os apresenta para discursos locais.

Não comparar listas de datas como prova de perda de dados sem usar o mesmo banco, pessoa e instante de referência. Os exemplos enviados têm programações diferentes; esta revisão não altera essas datas.

## Verificação e publicação

- 19 testes automatizados de Oradores e build TypeScript/Vite.
- Testes de navegador em 1280px e 390px com APIs simuladas, incluindo conteúdo do WhatsApp e consulta sem Admin.
- Não foi enviada mensagem real. Não houve gravação no banco real.
- Somente commit local; sem push por orientação do usuário.

## Implementação do padrão antigo

- Designações usam saudação e rodapé antigos, com emojis, segundo orador e substituições da Sentinela em ordem cronológica. Mensagem só de Sentinela não recebe orientação de preparo de discurso.
- A regra da Sentinela exige exatamente um dirigente e um substituto locais, ativos, distintos e da seção S2/sem seção. O gatilho é discurso local do dirigente, inclusive como segundo orador, como no código antigo; não se inventa substituição por uma saída.
- Confirmação tem saudação nominal, data/hora, tema, endereço e “Pode confirmar?”. Cadastro sem orador/telefone mostra orientação em vez de falhar silenciosamente.
- Intercâmbios separam Convites/Saídas e incluem nome, tema e horário da congregação que recebe.
- Congregações tem “Enviar datas disponíveis”, horizonte de 90/180/365 dias e seleção das datas. O texto usa exatamente a seleção; programação local, datas excluídas e eventos bloqueadores não são oferecidos. Saídas e S1 não ocupam a reunião local.
- Tarefas tem mensagem por participante (todas as designações futuras) e por dia do período exibido, com prévia editável, copiar e abrir WhatsApp. O usuário escolhe o grupo/destinatário no WhatsApp para a mensagem do dia. A limpeza vem da escala gerada, quando disponível e permitida; não são ampliadas permissões.
- Telefones brasileiros com DDD recebem 55 quando necessário. Não há alteração automática nos cadastros.
- Apenas o texto padrão exato anterior é substituído em memória. Personalizações não são sobrescritas. Mensagens específicas usam seu próprio padrão; o template personalizado, quando existente, continua prevalecendo.
- Campos opcionais vazios são omitidos. Nas designações locais, o horário acompanha a data; os detalhes da congregação ficam nas saídas. Confirmação mantém endereço local quando informado. Mapa/Plus Code/coordenadas continuam fora das mensagens.
- Nenhum botão foi acrescentado à Minha Agenda. ICS, regras de geração, publicação e programações salvas permanecem inalterados.
- Testes de mensagens e de navegador cobrem masterId, telefone, datas selecionadas, intercâmbios, personalizações e desktop/celular; sem envio real.
