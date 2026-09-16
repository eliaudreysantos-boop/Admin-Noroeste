import test from 'node:test'
import assert from 'node:assert/strict'
import {
  completeMeetingRoles, assistantNeedsSameSex, candidates, filterPrograms, isOfficialJwUrl,
  assignmentConflicts, htmlToText, mergeImportedProgram, parseOfficialProgram, permissionForPart, programPendings, programReminderEntries, reminderMessage, suggestAssignments, validProgramDate,
} from '../src/modules/programacao-domain.ts'

const page = `
17-23 de agosto de 2026
JEREMIAS 26-28
TESOUROS DA PALAVRA DE DEUS
1. Não seja enganado
(10 min)
2. Joias espirituais
(10 min)
3. Leitura da Bíblia
(4 min) Jer. 28:5-17
FAÇA SEU MELHOR NO MINISTÉRIO
4. Iniciando conversas
(3 min) TESTEMUNHO PÚBLICO.
5. O que você diria?
(4 min)
NOSSA VIDA CRISTÃ
6. Necessidades locais
(15 min)
7. Estudo bíblico de congregação
(30 min)
`

test('designacoes fixas preservam partes e nao duplicam na reimportacao', () => {
  const original = parseOfficialProgram('https://www.jw.org/pt/x/', page)
  const result = completeMeetingRoles(original)
  assert.equal(original.parts.length, 7)
  assert.equal(result.parts.length, 10)
  assert.equal(permissionForPart(result.parts[0]), 'presidente')
  assert.equal(permissionForPart(result.parts[1]), 'oracao-inicial')
  assert.equal(permissionForPart(result.parts.at(-1)), 'oracao-final')
  result.parts[0].assignedPersonId = 'p1'
  assert.equal(completeMeetingRoles(result), result)
  const merged = mergeImportedProgram(result, original, '2026-09-15')
  assert.equal(merged.parts.find(part => permissionForPart(part) === 'presidente').assignedPersonId, 'p1')
  assert.equal(completeMeetingRoles({ ...original, type: 'assembleia' }).parts.length, 7)
})

test('oracao e presidencia usam candidatos da permissao correspondente', () => {
  const people = [{ id: 'p1', active: true, sex: 'masculino', role: 'publicador', permissions: ['oracao-inicial'], name: 'A' }]
  const result = completeMeetingRoles(parseOfficialProgram('https://www.jw.org/pt/x/', page))
  assert.equal(candidates(result.parts[0], people).length, 0)
  assert.equal(candidates(result.parts[1], people).length, 1)
})

test('reimportacao preserva presidencia, oracoes e leitor com IDs do Android', () => {
  const incoming = parseOfficialProgram('https://www.jw.org/pt/x/', page)
  const roles = ['Presidente', 'Oracao inicial', 'Oracao final', 'Leitor do Estudo Biblico']
    .map((title, i) => ({ id: `legacy-1-${i}`, title, section: 'vida-crista', durationMinutes: 1, assignedPersonId: 'p1', realizedPersonId: 'p2', status: 'realizado' }))
  const result = mergeImportedProgram({ ...incoming, parts: [...incoming.parts, ...roles] }, incoming, '2026-09-15')
  for (const role of roles) assert.deepEqual(result.parts.find(part => part.id === role.id), role)
  assert.equal(result.parts.length, incoming.parts.length + roles.length)
})

test('reimportacao aborta quando perderia designacoes com IDs legados', () => {
  const incoming = parseOfficialProgram('https://www.jw.org/pt/x/', page)
  const existing = structuredClone(incoming)
  existing.parts[0] = { ...existing.parts[0], id: 'legacy-1-tesouros', assignedPersonId: 'p1' }
  const before = structuredClone(existing)
  assert.throws(() => mergeImportedProgram(existing, incoming, '2026-09-15'), /sem correspondência/)
  assert.deepEqual(existing, before)
})

const person = (overrides = {}) => ({ id: 'p1', masterId: 'm1', name: 'Ana', whatsapp: '5585999999999', sex: 'feminino', role: 'publicador', active: true, permissions: ['iniciando-conversas', 'ajudante'], ...overrides })

test('aceita somente URL HTTPS oficial em português', () => {
  assert.equal(isOfficialJwUrl('https://www.jw.org/pt/biblioteca/pagina/'), true)
  assert.equal(isOfficialJwUrl('http://www.jw.org/pt/biblioteca/pagina/'), false)
  assert.equal(isOfficialJwUrl('https://jw.org/pt/biblioteca/pagina/'), false)
})

test('parser encontra quarta-feira, seções, referência e O que você diria', () => {
  const program = parseOfficialProgram('https://www.jw.org/pt/biblioteca/pagina/', page)
  assert.equal(program.meetingDate, '2026-08-19')
  assert.equal(program.parts.length, 7)
  assert.equal(program.parts[2].reference, 'Jer. 28:5-17')
  assert.equal(permissionForPart(program.parts[4]), 'o-que-voce-diria')
})

test('parser reconhece semana entre dois meses com ordinal', () => {
  const cross = page.replace('17-23 de agosto de 2026', '26 de outubro–1.º de novembro de 2026')
  assert.equal(parseOfficialProgram('https://www.jw.org/pt/x/', cross).meetingDate, '2026-10-28')
})

test('parser aceita duração na mesma linha e entidades HTML em português', () => {
  const inline = page.replace('1. Não seja enganado\n(10 min)', '1. Não seja enganado (10 min) Prov. 1:1')
  const program = parseOfficialProgram('https://www.jw.org/pt/x/', inline)
  assert.equal(program.parts[0].durationMinutes, 10)
  assert.equal(program.parts[0].reference, 'Prov. 1:1')
  assert.equal(htmlToText('&Aacute;gua &ccedil; &atilde;').trim(), 'Água ç ã')
})

test('nova importação preserva designações, estado, observações e dados locais', () => {
  const incoming = parseOfficialProgram('https://www.jw.org/pt/x/', page)
  const old = structuredClone(incoming)
  old.parts[0].assignedPersonId = 'p1'
  old.parts[0].status = 'realizado'
  old.parts[0].confirmedAt = '2026-08-01T10:00:00.000Z'
  old.notes = 'Revisado'
  old.counselorPersonId = 'p2'
  old.parts.push({ id: `${old.id}-manual-1`, section: 'vida-crista', title: 'Anúncios locais', durationMinutes: 5 })
  incoming.parts[0].title = 'Título oficial atualizado'
  const merged = mergeImportedProgram(old, incoming, '2026-09-06T10:00:00.000Z')
  assert.equal(merged.parts[0].assignedPersonId, 'p1')
  assert.equal(merged.parts[0].status, 'realizado')
  assert.equal(merged.parts[0].confirmedAt, '2026-08-01T10:00:00.000Z')
  assert.equal(merged.parts[0].title, 'Título oficial atualizado')
  assert.equal(merged.notes, 'Revisado')
  assert.equal(merged.counselorPersonId, 'p2')
  assert.equal(merged.parts.at(-1).title, 'Anúncios locais')
})

test('reimportação idêntica mantém o registro sem nova gravação lógica', () => {
  const incoming = parseOfficialProgram('https://www.jw.org/pt/x/', page)
  const old = { ...structuredClone(incoming), importedAt: '2026-08-01T10:00:00.000Z', updatedAt: '2026-08-01T10:00:00.000Z' }
  const merged = mergeImportedProgram(old, incoming, '2026-09-06T10:00:00.000Z')
  assert.equal(merged, old)
  assert.equal(merged.updatedAt, '2026-08-01T10:00:00.000Z')
})

test('elegibilidade respeita privilégio, sexo e permissão', () => {
  const reading = { id: '3', section: 'tesouros', title: 'Leitura da Bíblia', durationMinutes: 4 }
  const people = [
    person(),
    person({ id: 'p2', name: 'Bruno', sex: 'masculino', role: 'batizado', permissions: ['leitura-biblia'] }),
    person({ id: 'p3', name: 'Carlos', sex: 'masculino', role: 'anciao', permissions: [] }),
  ]
  assert.deepEqual(candidates(reading, people).map(item => item.id), ['p2'])
  const talk = { ...reading, title: 'Discurso' }
  assert.deepEqual(candidates(talk, people).map(item => item.id), ['p3'])
})

test('ajudante é usado nas partes de ministério e exige mesmo sexo', () => {
  const part = { id: '4', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3 }
  assert.equal(assistantNeedsSameSex(part), true)
  assert.deepEqual(candidates(part, [person()], true).map(item => item.id), ['p1'])
})

test('filtros distinguem semana, mês e bimestre', () => {
  const programs = ['2026-08-05', '2026-08-26', '2026-09-02'].map(date => ({ id: date, meetingDate: date, bibleReading: '', parts: [] }))
  assert.deepEqual(filterPrograms(programs, 'week', '2026-08-05').map(item => item.id), ['2026-08-05'])
  assert.deepEqual(filterPrograms(programs, 'month', '2026-08-05').map(item => item.id), ['2026-08-05', '2026-08-26'])
  assert.deepEqual(filterPrograms(programs, 'bimester', '2026-08-05').map(item => item.id), ['2026-08-05', '2026-08-26'])
})

test('pendências cobrem principal, sexo, conflito, entrega e confirmação', () => {
  const program = { id: 'w', meetingDate: '2026-09-09', bibleReading: '', parts: [
    { id: 'a', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3, assignedPersonId: 'p1', assistantPersonId: 'p2' },
    { id: 'b', section: 'vida-crista', title: 'Consideração', durationMinutes: 10, assignedPersonId: 'p1' },
    { id: 'c', section: 'vida-crista', title: 'Outra', durationMinutes: 10 },
  ] }
  const pending = programPendings([program], [person(), person({ id: 'p2', sex: 'masculino', name: 'Bruno' })]).map(item => item.message).join(' ')
  assert.match(pending, /mesmo sexo/)
  assert.match(pending, /outra parte/)
  assert.match(pending, /principal não definido/)
  assert.match(pending, /lembrete do principal ainda não aberto/)
  assert.match(pending, /confirmação pendente/)
})

test('datas civis inválidas não entram nos filtros', () => {
  assert.equal(validProgramDate('2026-02-28'), true)
  assert.equal(validProgramDate('2026-02-31'), false)
  assert.deepEqual(filterPrograms([{ id: 'x', meetingDate: '2026-02-31', bibleReading: '', parts: [] }], 'month', '2026-02-01'), [])
  assert.deepEqual(filterPrograms([], 'month', '2026-02-31'), [])
})

test('pendências indicam a parte para correção e cobrem ausência sem substituto', () => {
  const program = { id: 'week-1', meetingDate: '2026-09-09', bibleReading: '', parts: [
    { id: 'part-1', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3, assignedPersonId: 'p1', absent: true },
  ] }
  const pending = programPendings([program], [person()])
  assert.equal(pending.find(item => /ausente sem substituto/.test(item.message))?.programId, 'week-1')
  assert.equal(pending.find(item => /ausente sem substituto/.test(item.message))?.partId, 'part-1')
})

test('parte realizada não mantém cobranças antigas de lembrete e confirmação', () => {
  const complete = { id: 'w', meetingDate: '2026-09-09', bibleReading: '', parts: [
    { id: 'p1', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3, assignedPersonId: 'p1', status: 'realizado', realizedPersonId: 'p1' },
    { id: 'p2', section: 'vida-crista', title: 'Consideração', durationMinutes: 10, assignedPersonId: 'p1', status: 'realizado' },
  ] }
  const pending = programPendings([complete], [person()])
  assert.equal(pending.some(item => /lembrete|confirmação/.test(item.message)), false)
  assert.equal(pending.filter(item => /informe quem realizou/.test(item.message)).length, 1)
})

test('mensagem é editável a partir de modelo com marcadores', () => {
  const message = reminderMessage(person(), { id: 'w', meetingDate: '2026-09-09', bibleReading: '', parts: [] }, { id: 'p', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3 }, '19:30', '{nome} | {data} | {horario} | {parte}')
  assert.equal(message, 'Ana | 09/09/2026 | 19:30 | Iniciando conversas')
})

test('lembretes incluem substituto e ajudante com WhatsApp sem duplicar destinatário', () => {
  const program = { id: 'w', meetingDate: '2026-09-09', bibleReading: '', parts: [
    { id: 'p', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3, assignedPersonId: 'p1', substitutePersonId: 'p2', assistantPersonId: 'p3' },
    { id: 'q', section: 'vida-crista', title: 'Consideração', durationMinutes: 10, assignedPersonId: 'p4', assistantPersonId: 'p4' },
  ] }
  const people = [
    person(),
    person({ id: 'p2', name: 'Bruno' }),
    person({ id: 'p3', name: 'Carla' }),
    person({ id: 'p4', name: 'Daniel', whatsapp: '' }),
  ]
  const entries = programReminderEntries([program], people)
  assert.deepEqual(entries.map(entry => [entry.person.id, entry.role, entry.kind]), [
    ['p2', 'principal', 's89'],
    ['p3', 'ajudante', 's89'],
  ])
})

test('lembretes ignoram partes realizadas e semanas sem reunião normal', () => {
  const part = { id: 'p', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3, assignedPersonId: 'p1' }
  const programs = [
    { id: 'done', meetingDate: '2026-09-09', bibleReading: '', parts: [{ ...part, status: 'realizado', realizedPersonId: 'p1' }] },
    { id: 'assembly', meetingDate: '2026-09-16', bibleReading: '', type: 'assembleia', parts: [part] },
  ]
  assert.deepEqual(programReminderEntries(programs, [person()]), [])
  assert.deepEqual(programPendings(programs, [person()]), [])
})

test('conflitos impedem repetir principal, ajudante e substituto na mesma parte', () => {
  const part = { id: 'p', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3, assignedPersonId: 'p1', assistantPersonId: 'p1', substitutePersonId: 'p1' }
  const messages = assignmentConflicts({ id: 'w', meetingDate: '2026-09-09', bibleReading: '', parts: [part] }, part)
  assert.equal(messages.length, 3)
})

test('sugestões equilibram histórico, evitam repetição e aguardam salvamento humano', () => {
  const current = { id: 'now', meetingDate: '2026-09-09', bibleReading: '', parts: [
    { id: 'a', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3 },
    { id: 'b', section: 'ministerio', title: 'Cultivando o interesse', durationMinutes: 4 },
  ] }
  const people = [person({ permissions: ['iniciando-conversas', 'cultivando-interesse', 'ajudante'] }), person({ id: 'p2', name: 'Bia', permissions: ['iniciando-conversas', 'cultivando-interesse', 'ajudante'] }), person({ id: 'p3', name: 'Clara', permissions: ['ajudante'] }), person({ id: 'p4', name: 'Dora', permissions: ['ajudante'] })]
  const history = [{ id: 'old', meetingDate: '2026-09-02', bibleReading: '', parts: [{ id: 'x', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3, assignedPersonId: 'p1' }] }]
  const suggested = suggestAssignments(current, people, history)
  assert.equal(current.parts[0].assignedPersonId, undefined)
  assert.equal(suggested.parts[0].assignedPersonId, 'p2')
  const assigned = suggested.parts.flatMap(part => [part.assignedPersonId, part.assistantPersonId]).filter(Boolean)
  assert.equal(new Set(assigned).size, assigned.length)
})
