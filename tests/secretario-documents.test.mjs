import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib/cjs/index.js'
import { createS1, createS3, createS21, createS88 } from '../src/modules/secretario-documents.ts'

const base = 'NAO FAZER COMMIT DESSA PASTA/'
const buffer = async name => { const bytes = await readFile(`${base}${name}`); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
const report = { r1: { id: 'r1', masterId: 'm1', competencia: '2026-09', categoria: 'pioneiro_regular', participou: true, estudos: 2, horasCampo: 50, horasAtividadeAprovada: 3, creditoHoras: 5, pioneiroAuxiliar: false, observacoes: 'Observação', atrasado: false, recebidoEm: '2026-10-02', atualizadoEm: '' } }
const attendance = { a1: { id: 'a1', data: '2026-09-02', tipo: 'meio_semana', quantidade: 80, atualizadoEm: '' }, a2: { id: 'a2', data: '2026-09-06', tipo: 'fim_semana', quantidade: 90, atualizadoEm: '' } }

test('preenche os quatro templates oficiais sem alterar os arquivos fonte', async () => {
  const people = { m1: { name: 'Pessoa Teste', whatsapp: '', sex: 'M', role: 'anciao', active: true, limpeza: { grupo: null } } }
  const publisher = { id: 'p1', masterId: 'm1', categoria: 'pioneiro_regular', grupoId: '', ativo: true }
  const summary = { competencia: '2026-09', publicadores: 1, estudos: 2, auxiliares: 0, horasAuxiliares: 0, regulares: 1, horasRegulares: 50, estudosPublicadores: 0, estudosAuxiliares: 0, estudosRegulares: 2, atrasadosIncluidos: 0, mediaFimSemana: 90, enviadosEm: '' }
  const outputs = [
    await createS21(await buffer('S-21_s-Mlt_T.pdf'), [publisher], people, report, 2026, { m1: { nascimento: '1990-01-02', batismo: '2010-03-04', ungido: false } }),
    await createS1(await buffer('S-1_T.pdf'), { nome: 'Noroeste', cidade: 'Paulista', circuito: '', idioma: 'pt-BR' }, summary, 'Secretário'),
    await createS88(await buffer('S-88_T.pdf'), attendance, 2026),
    await createS3(await buffer('S-3_T.pdf'), 'Noroeste', '2026-09', attendance),
  ]
  for (const bytes of outputs) { assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), '%PDF'); assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1) }
  const s88 = await PDFDocument.load(outputs[2]); assert.equal(s88.getForm().getTextField('Service Year_1').getText(), '2026/2027'); assert.equal(s88.getForm().getTextField('1-Attendance_1').getText(), '80')
})
