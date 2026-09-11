import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { createS21BatchZip } from '../src/modules/secretario-spreadsheets.ts'

test('exportação anual S-21 cria ZIP organizado com fichas e resumos', async () => {
  const publishers = {
    p1:{ id:'p1', masterId:'m1', categoria:'publicador', grupoId:'g1', ativo:true },
    p2:{ id:'p2', masterId:'m2', categoria:'pioneiro_regular', grupoId:'g1', ativo:true },
    p3:{ id:'p3', masterId:'m3', categoria:'publicador', grupoId:'', ativo:false },
  }
  const people = {
    m1:{ name:'Ana', whatsapp:'5581000000001', sex:'F', role:'publicador', active:true, limpeza:{ grupo:null } },
    m2:{ name:'Bruno', whatsapp:'5581000000002', sex:'M', role:'anciao', active:true, limpeza:{ grupo:null } },
    m3:{ name:'Carla', whatsapp:'5581000000003', sex:'F', role:'publicador', active:false, limpeza:{ grupo:null } },
  }
  const groups = { g1:{ id:'g1', nome:'Grupo 1', superintendenteMasterId:'m2', ativo:true } }
  const reports = { r1:{ id:'r1', masterId:'m1', competencia:'2026-09', categoria:'publicador', participou:true, estudos:2, horasCampo:0, horasAtividadeAprovada:3, creditoHoras:0, pioneiroAuxiliar:false, observacoes:'Teste', atrasado:false, recebidoEm:'2026-10-01', atualizadoEm:'', origem:'secretario' } }
  const zip = await JSZip.loadAsync(await createS21BatchZip(publishers, people, groups, reports, 2026))
  assert.ok(zip.file('Publicadores ativos/Outros publicadores/Grupo 1/Ana.xlsx'))
  assert.ok(zip.file('Publicadores ativos/Pioneiros regulares e especiais/Bruno.xlsx'))
  assert.ok(zip.file('Publicadores inativos/Carla.xlsx'))
  assert.ok(zip.file('Registros totais da congregação/Publicadores.xlsx'))
  assert.ok(zip.file('Contatos.xlsx')); assert.ok(zip.file('Grupos de serviço.xlsx'))
  const bytes = await zip.file('Publicadores ativos/Outros publicadores/Grupo 1/Ana.xlsx').async('uint8array')
  const sheet = XLSX.read(bytes, { type:'array' }).Sheets['S-21']
  assert.equal(sheet['F5'].v, 'Atividades aprovadas'); assert.equal(sheet['F6'].v, 3)
})
