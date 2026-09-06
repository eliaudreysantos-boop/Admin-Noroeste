import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assistantNeedsSameSex, candidates, filterPrograms, isOfficialJwUrl,
  mergeImportedProgram, parseOfficialProgram, permissionForPart, programPendings, reminderMessage, suggestAssignments,
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

test('nova importação preserva designações, estado e observações', () => {
  const incoming = parseOfficialProgram('https://www.jw.org/pt/x/', page)
  const old = structuredClone(incoming)
  old.parts[0].assignedPersonId = 'p1'
  old.parts[0].status = 'realizado'
  old.notes = 'Revisado'
  incoming.parts[0].title = 'Título oficial atualizado'
  const merged = mergeImportedProgram(old, incoming, '2026-09-06T10:00:00.000Z')
  assert.equal(merged.parts[0].assignedPersonId, 'p1')
  assert.equal(merged.parts[0].status, 'realizado')
  assert.equal(merged.parts[0].title, 'Título oficial atualizado')
  assert.equal(merged.notes, 'Revisado')
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
  assert.match(pending, /lembrete ainda não aberto/)
  assert.match(pending, /confirmação pendente/)
})

test('mensagem é editável a partir de modelo com marcadores', () => {
  const message = reminderMessage(person(), { id: 'w', meetingDate: '2026-09-09', bibleReading: '', parts: [] }, { id: 'p', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3 }, '19:30', '{nome} | {data} | {horario} | {parte}')
  assert.equal(message, 'Ana | 09/09/2026 | 19:30 | Iniciando conversas')
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
