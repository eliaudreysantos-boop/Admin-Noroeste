import type {
  ConfigLimpeza,
  ConfigReunioes,
  LimpezaPeriodoGerado,
  LimpezaSemanaGerada,
  RawPessoas,
} from '../types'

export type CleaningPeriodMode = 'month' | 'bimester'


const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function isoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

function toIso(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function periodBounds(anchor: string, mode: CleaningPeriodMode): { id: string; inicio: string; fim: string } {
  const date = isoDate(anchor)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const firstMonth = mode === 'bimester' ? month - (month % 2) : month
  const start = new Date(Date.UTC(year, firstMonth, 1, 12))
  const end = new Date(Date.UTC(year, firstMonth + (mode === 'bimester' ? 2 : 1), 0, 12))
  return {
    id: `${year}-${String(firstMonth + 1).padStart(2, '0')}${mode === 'bimester' ? '-bimester' : ''}`,
    inicio: toIso(start),
    fim: toIso(end),
  }
}

export function cleaningGroupFor(date: string, start: string, totalGroups: number): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || totalGroups < 1) return null
  const weeks = Math.floor((isoDate(date).getTime() - isoDate(start).getTime()) / 604_800_000)
  return ((weeks % totalGroups) + totalGroups) % totalGroups + 1
}

export function monthLabel(value: string): string {
  const date = isoDate(value)
  return MONTHS[date.getUTCMonth()] ?? value
}

export function assertCleaningPeriodEditable(period: LimpezaPeriodoGerado | undefined): void {
  if (period?.publicado) throw new Error('Reabra o período publicado antes de gerar outra escala.')
}

function memberIds(group: number, people: RawPessoas): string[] {
  return Object.entries(people)
    .filter(([, person]) => person.active && person.limpeza?.grupo === group)
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR'))
    .map(([id]) => id)
}

export function replaceCleaningGroup(period:LimpezaPeriodoGerado,index:number,group:number,config:ConfigLimpeza,people:RawPessoas):LimpezaPeriodoGerado {
  assertCleaningPeriodEditable(period)
  const week=period.semanas[index],profile=config.gruposConfig?.[String(group)]
  if(!week||!Number.isInteger(group)||group<1||group>config.grupos)throw new Error('Grupo inválido.')
  const members=memberIds(group,people),helpers=Object.values(profile?.ajudantesMid??{})
  if(!members.length)throw new Error('Este grupo não possui integrantes ativos.')
  if(!profile?.superintendenteMid||!people[profile.superintendenteMid]?.active||helpers.some(id=>!people[id]?.active))throw new Error('Confira o responsável e os ajudantes do grupo.')
  return {...period,semanas:period.semanas.map((item,i)=>i===index?{...item,grupo:group,grupoNome:profile.nome?.trim()||`Grupo ${group}`,superintendenteMid:profile.superintendenteMid,ajudantesMid:helpers,membrosMid:members,manualGroup:true}:item)}
}

export function generateCleaningPeriod(
  anchor: string,
  mode: CleaningPeriodMode,
  config: ConfigLimpeza,
  meetings: ConfigReunioes,
  people: RawPessoas,
  congregation: string,
  generatedAt: string,
): LimpezaPeriodoGerado {
  if (!config.ativa) throw new Error('Ative a rotacao antes de gerar a escala.')
  if (!config.inicioRotacao) throw new Error('Defina o inicio da rotacao antes de gerar a escala.')
  if (!Number.isInteger(meetings.meiaDeSemana?.diaSemana) || !Number.isInteger(meetings.fimDeSemana?.diaSemana)) {
    throw new Error('Defina os dias das reunioes nas configuracoes do Admin.')
  }
  const bounds = periodBounds(anchor, mode)
  const start = isoDate(bounds.inicio)
  const end = isoDate(bounds.fim)
  const midweekDow = meetings.meiaDeSemana.diaSemana
  const weekendDow = meetings.fimDeSemana.diaSemana
  const offset = (weekendDow - midweekDow + 7) % 7
  const first = addDays(start, (midweekDow - start.getUTCDay() + 7) % 7)
  const semanas: LimpezaSemanaGerada[] = []

  for (let current = first; current <= end; current = addDays(current, 7)) {
    const reference = toIso(current)
    const group = cleaningGroupFor(reference, config.inicioRotacao, Math.max(1, config.grupos))
    if (!group) continue
    const groupConfig = config.gruposConfig?.[String(group)]
    const members = memberIds(group, people)
    semanas.push({
      referencia: reference,
      dataMeioSemana: reference,
      dataFimSemana: toIso(addDays(current, offset || 7)),
      grupo: group,
      grupoNome: groupConfig?.nome?.trim() || `Grupo ${group}`,
      superintendenteMid: groupConfig?.superintendenteMid ?? '',
      ajudantesMid: Array.isArray(groupConfig?.ajudantesMid) ? groupConfig.ajudantesMid : Object.values(groupConfig?.ajudantesMid ?? {}),
      membrosMid: members,
    })
  }

  return { ...bounds, modo: mode, geradoEm: generatedAt, congregacao: congregation, semanas }
}
