import { mkdir, writeFile } from 'node:fs/promises'
import { createSpeakersSchedulePdf } from '../src/modules/oradores-documents.ts'

const month = '2026-09'
const speakers = {
  local1:{ nome:'André Almeida', tipo:'local', funcao:'anciao', telefone:'', ativo:true, temaIds:[] },
  local2:{ nome:'Bruno Nascimento', tipo:'local', funcao:'anciao', telefone:'', ativo:true, temaIds:[] },
  visitor:{ nome:'Carlos Oliveira', tipo:'visitante', funcao:'anciao', telefone:'', ativo:true, temaIds:[] },
}
const themes = {
  tema_001:{ numero:1, titulo:'Como encontrar verdadeira paz em tempos difíceis', ativo:true },
  tema_042:{ numero:42, titulo:'O Reino de Deus - a esperança segura para toda a humanidade', ativo:true },
}
const congregations = {
  local:{ nome:'Noroeste', cidade:'Fortaleza', tipo:'local', ativa:true, contato:'', telefone:'', diaReuniao:'Domingo', horario:'18:00', localizacao:'', observacoes:'' },
  centro:{ nome:'Centro - Congregação com nome comprido para conferir a quebra de linha', cidade:'Fortaleza', tipo:'visitante', ativa:true, contato:'', telefone:'', diaReuniao:'Sábado', horario:'19:00', localizacao:'', observacoes:'' },
}
const schedule = [
  { data:'2026-09-06', tipo:'discurso_local', status:'confirmado', secao:'s1', oradorId:'local1', oradorNome:'André Almeida', temaId:'tema_001', temaNumero:1, temaTitulo:themes.tema_001.titulo, localCongregacaoId:'local', localCongregacaoNome:'Noroeste', confirmacao:{status:true,confirmadoEm:'2026-08-20'}, reconfirmacao:{status:true,confirmadoEm:'2026-09-01'} },
  { data:'2026-09-06', tipo:'discurso_visitante', status:'por_confirmar', secao:'s2', oradorId:'visitor', oradorNome:'Carlos Oliveira', temaId:'tema_042', temaNumero:42, temaTitulo:themes.tema_042.titulo, congregacaoOrigemId:'centro', congregacaoOrigemNome:congregations.centro.nome },
  { data:'2026-09-13', tipo:'discurso_local', status:'por_definir', secao:'s2', localCongregacaoId:'local', localCongregacaoNome:'Noroeste' },
  { data:'2026-09-20', tipo:'saida_orador', status:'confirmado', oradorId:'local2', oradorNome:'Bruno Nascimento', temaId:'tema_042', temaNumero:42, temaTitulo:themes.tema_042.titulo, congregacaoDestinoId:'centro', congregacaoDestinoNome:congregations.centro.nome, confirmacao:{status:true,confirmadoEm:'2026-08-10'} },
  { data:'2026-11-08', tipo:'saida_orador', status:'por_confirmar', oradorId:'local1', oradorNome:'André Almeida', temaId:'tema_001', temaNumero:1, temaTitulo:themes.tema_001.titulo, congregacaoDestinoId:'centro', congregacaoDestinoNome:congregations.centro.nome },
]

await mkdir(new URL('../output/pdf/', import.meta.url), { recursive:true })
const bytes = await createSpeakersSchedulePdf({ month, schedule, speakers, themes, congregations })
await writeFile(new URL('../output/pdf/programacao-oradores-preview.pdf', import.meta.url), bytes)
