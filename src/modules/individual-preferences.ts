import { validAgendaDate } from './individual-domain.ts'

export type AgendaScreen = 'agenda' | 'geral' | 'quadro'
export type AgendaUiContext = 'standalone' | 'admin'
export type PersonalView = 'upcoming' | 'month'
export type PersonalPanel = 'calendar' | 'sharing'
export type BoardPanel = 'meetings' | 'moduleDocuments' | 'adminDocuments'

export interface AgendaUiPreferences {
  screen: AgendaScreen
  personal: {
    month: string
    view: PersonalView
    openPanels: PersonalPanel[]
  }
  general: {
    month: string
    selectedDate: string
  }
  board: {
    meetingDate: string
    documentPeriod: string
    openPanels: BoardPanel[]
  }
  updatedAt: number
}

const SCREENS: AgendaScreen[] = ['agenda', 'geral', 'quadro']
const PERSONAL_VIEWS: PersonalView[] = ['upcoming', 'month']
const PERSONAL_PANELS: PersonalPanel[] = ['calendar', 'sharing']
const BOARD_PANELS: BoardPanel[] = ['meetings', 'moduleDocuments', 'adminDocuments']

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback
const monthValue = (value: unknown, fallback: string): string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : fallback
const dateValue = (value: unknown): string => typeof value === 'string' && validAgendaDate(value) ? value : ''
const stringList = <T extends string>(value: unknown, allowed: readonly T[]): T[] => Array.isArray(value) ? [...new Set(value.filter((item): item is T => typeof item === 'string' && allowed.includes(item as T)))] : []

export function defaultAgendaUiPreferences(currentMonth: string): AgendaUiPreferences {
  const safeMonth = monthValue(currentMonth, new Date().toISOString().slice(0, 7))
  return {
    screen:'agenda',
    personal:{ month:safeMonth, view:'upcoming', openPanels:[] },
    general:{ month:safeMonth, selectedDate:'' },
    board:{ meetingDate:'', documentPeriod:safeMonth, openPanels:['meetings'] },
    updatedAt:0,
  }
}

export function parseAgendaUiPreferences(raw: string | null, currentMonth: string): AgendaUiPreferences {
  const fallback = defaultAgendaUiPreferences(currentMonth)
  if (!raw || raw.length > 20_000) return fallback
  try {
    const value = record(JSON.parse(raw)), personal = record(value['personal']), general = record(value['general']), board = record(value['board'])
    return {
      screen:oneOf(value['screen'], SCREENS, fallback.screen),
      personal:{
        month:monthValue(personal['month'], fallback.personal.month),
        view:oneOf(personal['view'], PERSONAL_VIEWS, fallback.personal.view),
        openPanels:stringList(personal['openPanels'], PERSONAL_PANELS),
      },
      general:{
        month:monthValue(general['month'], fallback.general.month),
        selectedDate:dateValue(general['selectedDate']),
      },
      board:{
        meetingDate:dateValue(board['meetingDate']),
        documentPeriod:monthValue(board['documentPeriod'], fallback.board.documentPeriod),
        openPanels:stringList(board['openPanels'], BOARD_PANELS),
      },
      updatedAt:Number.isFinite(Number(value['updatedAt'])) ? Math.max(0, Number(value['updatedAt'])) : 0,
    }
  } catch { return fallback }
}

export function agendaUiStorageKey(masterId: string, context: AgendaUiContext): string {
  return `noroeste_agenda_ui_v1:${masterId}:${context}`
}

export function agendaCacheNeedsSync(savedAt: unknown, currentTime: number, intervalMs = 24 * 60 * 60 * 1000): boolean {
  const timestamp = Number(savedAt)
  return !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > currentTime || currentTime - timestamp >= intervalMs
}
