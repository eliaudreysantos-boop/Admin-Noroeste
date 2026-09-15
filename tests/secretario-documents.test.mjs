import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib/cjs/index.js'
import { createGroupsPdf, createS3, createS21, createS88 } from '../src/modules/secretario-documents.ts'

const base = 'NAO FAZER COMMIT DESSA PASTA/'
const buffer = async name => { const bytes = await readFile(`${base}${name}`); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
const report = { r1: { id: 'r1', masterId: 'm1', competencia: '2026-09', categoria: 'pioneiro_regular', participou: true, estudos: 2, horasCampo: 50, horasAtividadeAprovada: 3, creditoHoras: 5, pioneiroAuxiliar: false, observacoes: 'Observação', atrasado: false, recebidoEm: '2026-10-02', atualizadoEm: '' } }
const attendance = { a1: { id: 'a1', data: '2026-09-02', tipo: 'meio_semana', quantidade: 80, atualizadoEm: '' }, a2: { id: 'a2', data: '2026-09-06', tipo: 'fim_semana', quantidade: 90, atualizadoEm: '' } }

test('preenche os três templates oficiais sem alterar os arquivos fonte', async () => {
  const people = { m1: { name: 'Pessoa Teste', whatsapp: '', sex: 'M', role: 'anciao', active: true, limpeza: { grupo: null } } }
  const publisher = { id: 'p1', masterId: 'm1', categoria: 'pioneiro_regular', grupoId: '', ativo: true }
  const outputs = [
    await createS21(await buffer('S-21_s-Mlt_T.pdf'), [publisher], people, report, 2026, { m1: { nascimento: '1990-01-02', batismo: '2010-03-04', ungido: false } }),
    await createS88(await buffer('S-88_T.pdf'), attendance, 2026),
    await createS3(await buffer('S-3_T.pdf'), 'Noroeste', '2026-09', attendance),
  ]
  for (const bytes of outputs) { assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), '%PDF'); assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1) }
  const s88 = await PDFDocument.load(outputs[1]); assert.equal(s88.getForm().getTextField('Service Year_1').getText(), '2026/2027'); assert.equal(s88.getForm().getTextField('1-Attendance_1').getText(), '80')
})

test('gera grupos de serviço em A4 retrato com quatro colunas por página', async () => {
  const people = Object.fromEntries(Array.from({ length:8 }, (_, index) => [`m${index}`, { name:`Pessoa ${index}`, whatsapp:'', sex:'M', role:index === 0 ? 'anciao' : 'publicador', active:true, limpeza:{ grupo:null } }]))
  const groups = Object.fromEntries(Array.from({ length:5 }, (_, index) => [`g${index}`, { id:`g${index}`, nome:`Grupo ${index + 1}`, superintendenteMasterId:`m${index}`, ativo:true }]))
  const publishers = Object.fromEntries(Array.from({ length:8 }, (_, index) => [`p${index}`, { id:`p${index}`, masterId:`m${index}`, categoria:'publicador', grupoId:`g${index % 5}`, ativo:true }]))
  const pdf = await PDFDocument.load(await createGroupsPdf(groups, publishers, people, 'Noroeste'))
  assert.equal(pdf.getPageCount(), 2)
  assert.ok(Math.abs(pdf.getPage(0).getWidth() - 595.28) < 1)
  assert.ok(pdf.getPage(0).getHeight() > pdf.getPage(0).getWidth())
})

test('PDF de grupos aceita nomes extensos sem mudar os formulários oficiais', async () => {
  const people = Object.fromEntries(Array.from({ length:24 }, (_, index) => [`m${index}`, { name:`Pessoa com nome completo bastante extenso número ${index}`, whatsapp:'', sex:'M', role:'publicador', active:true, limpeza:{ grupo:null } }]))
  const groups = { g1:{ id:'g1', nome:'Grupo de serviço com nome extenso', superintendenteMasterId:'m0', ativo:true } }
  const publishers = Object.fromEntries(Array.from({ length:24 }, (_, index) => [`p${index}`, { id:`p${index}`, masterId:`m${index}`, categoria:'publicador', grupoId:'g1', ativo:true }]))
  const pdf = await PDFDocument.load(await createGroupsPdf(groups, publishers, people, 'Noroeste'))
  assert.equal(pdf.getPageCount(), 1)
  assert.ok(Math.abs(pdf.getPage(0).getWidth() - 595.28) < 1)
})
