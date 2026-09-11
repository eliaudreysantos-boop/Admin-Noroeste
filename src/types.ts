// ─── Enums / Unions ────────────────────────────────────────────────────────

export type Role =
  | 'anciao'
  | 'servo-ministerial'
  | 'pioneiro'
  | 'batizado'
  | 'publicador'

export type SecretarioPapel =
  | 'secretario'
  | 'publicador'
  | 'assistencia'

export type Sex = 'M' | 'F'

export type ModuleName =
  | 'mestre'
  | 'tarefas'
  | 'limpeza'
  | 'oradores'
  | 'escala'
  | 'programacao'
  | 'secretario'
  | 'individual'

export type TipoDesignacao =
  | 'presidente'
  | 'leitor'
  | 'microfone'
  | 'operador'
  | 'auditorio'
  | 'entrada'
  | 'limpeza-super'
  | 'limpeza-ajudante'
  | 'limpeza-grupo'
  | 'escala-campo'
  | 'discurso-local'
  | 'discurso-saida'
  | 'programacao-parte'

// ─── Master ────────────────────────────────────────────────────────────────

export interface MasterLimpeza {
  grupo: number | null
}

export interface MasterPessoa {
  name:     string
  whatsapp: string          // 13 dígitos: 55 + DDD + número
  sex:      Sex | null
  role:     Role | null
  active:   boolean
  limpeza:  MasterLimpeza
}

export interface MasterMeta {
  schemaVersion: number
  createdAt:     string
  description:   string
}

// ─── Config ────────────────────────────────────────────────────────────────

export interface ConfigCongregacao {
  nome:     string
  cidade:   string
  circuito: string
  idioma:   string
}

export interface ConfigReuniao {
  diaSemana: number   // 0-6: 0=domingo
  horario:   string   // 'HH:MM'
}

export interface ConfigReunioes {
  meiaDeSemana:  ConfigReuniao
  fimDeSemana:   ConfigReuniao
}

export interface ConfigLimpezaGrupo {
  nome?:              string
  superintendenteMid: string
  ajudantesMid:       string[]
}

export interface LimpezaSemanaGerada {
  referencia:          string
  dataMeioSemana:      string
  dataFimSemana:       string
  grupo:               number
  grupoNome:           string
  superintendenteMid:  string
  ajudantesMid:        string[]
  membrosMid:          string[]
}

export interface LimpezaPeriodoGerado {
  id:          string
  modo:        'month' | 'bimester'
  inicio:      string
  fim:         string
  geradoEm:    string
  congregacao: string
  semanas:     LimpezaSemanaGerada[]
}

export interface ConfigLimpeza {
  ativa:                 boolean
  aproveitarGruposServicoCampo?: boolean
  grupos:                number       // qtd de grupos
  inicioRotacao:         string       // 'YYYY-MM-DD'
  gruposConfig:          Record<string, ConfigLimpezaGrupo>
  gruposServicoConfig?:  Record<string, ConfigLimpezaGrupo>
}

export interface ConfigDesignacao {
  textoIcs:   string
  ativo:      boolean
  aprovadoEm: string   // 'YYYY-MM-DD' | ''
}

export interface MasterConfig {
  congregacao?:  ConfigCongregacao
  reunioes?:     ConfigReunioes
  limpeza?:      ConfigLimpeza
  designacoes?:  Partial<Record<TipoDesignacao, ConfigDesignacao>>
}

export type AgendaReminderModule =
  | 'tarefas'
  | 'limpeza'
  | 'escala'
  | 'oradores'
  | 'programacao'
  | 'quadro'

export interface AgendaConfig {
  quadroWhatsAppLink?: string
  icsReminders?: Partial<Record<AgendaReminderModule, string[]>>
}

// ─── Usuários ──────────────────────────────────────────────────────────────

export interface AppPermissions {
  mestre:      boolean
  tarefas:     boolean
  limpeza?:    boolean
  oradores?:   boolean
  escala:      boolean
  programacao: boolean
  secretario:  boolean
  individual?: boolean
}

export interface Usuario {
  nome:             string
  senha:            string       // plain text por enquanto
  ativo:            boolean
  apps:             AppPermissions
  secretarioPapel?: SecretarioPapel
  masterId?:        string       // obrigatório quando houver acesso à Minha Agenda
}

// ─── Firebase raw snapshots ────────────────────────────────────────────────

export type RawPessoas   = Record<string, MasterPessoa>
export type RawUsuarios  = Record<string, Usuario>

export interface RawMaster {
  meta?:   MasterMeta
  config?: MasterConfig
  pessoas: RawPessoas
}

export interface RawRoot {
  master?:      RawMaster
  usuarios?:    RawUsuarios
  tarefas?:     Record<string, unknown>
  limpeza?:     Record<string, unknown>
  oradores?:    Record<string, unknown>
  escala?:      Record<string, unknown>
  programacao?: Record<string, unknown>
  secretario?:  Record<string, unknown>
  agenda?:      Record<string, unknown>
}

// ─── App context ───────────────────────────────────────────────────────────

export interface AppContext {
  uid:     string
  usuario: Usuario
}
