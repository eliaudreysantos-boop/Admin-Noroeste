import type { AgendaConfig, AgendaReminderModule } from '../types'
import { agendaConfigRef, child, get, set } from '../firebase'

export type MessageSettingsModule = Exclude<AgendaReminderModule, 'quadro'>

export interface ModuleMessageSettings {
  groupLink?: string
  meetingText?: string
  documentText?: string
}

const MODULE_LABELS: Record<MessageSettingsModule, string> = {
  tarefas:'Tarefas',
  oradores:'Oradores',
  limpeza:'Limpeza',
  escala:'Escala TPL',
  servicoCampo:'Serviço de Campo',
}

const MEETING_DEFAULTS: Record<MessageSettingsModule, string> = {
  tarefas:'Olá. Seguem as designações de tarefas da reunião:\n\n{dados_da_reuniao}\n\nAgradecemos pela atenção.',
  oradores:'Olá. Segue a programação de oradores:\n\n{dados_da_reuniao}\n\nAgradecemos pela atenção.',
  limpeza:'Olá. Segue a programação de limpeza:\n\n{dados_da_reuniao}\n\nAgradecemos pela colaboração.',
  escala:'Olá. Segue a programação da Escala TPL:\n\n{dados_da_reuniao}\n\nAgradecemos pela atenção.',
  servicoCampo:'Olá. Segue a programação do serviço de campo:\n\n{programacao_servico_campo}\n\nSua participação será muito bem recebida. Agradecemos pela atenção.',
}

const DOCUMENT_DEFAULT = 'Olá. O arquivo de {modulo} referente a {periodo} está disponível para consulta:\n\n{link_ou_orientacao}\n\nAgradecemos pela atenção.'

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[char] ?? char)
}

export function defaultModuleMessageSettings(module: MessageSettingsModule): Required<ModuleMessageSettings> {
  return { groupLink:'', meetingText:MEETING_DEFAULTS[module], documentText:DOCUMENT_DEFAULT }
}

export async function mountModuleMessageSettings(
  containerId: string,
  module: MessageSettingsModule,
  notify: (message: string) => void,
  onSaved?: (settings: Required<ModuleMessageSettings>) => void,
): Promise<void> {
  const container = document.getElementById(containerId)
  if (!container) return
  container.innerHTML = '<p class="empty-state">Carregando mensagens...</p>'

  const defaults = defaultModuleMessageSettings(module)
  let current: ModuleMessageSettings = {}
  try {
    const snapshot = await get<ModuleMessageSettings>(child(agendaConfigRef, `moduleWhatsApp/${module}`))
    current = snapshot.exists() ? snapshot.val() ?? {} : {}
  } catch {
    container.innerHTML = '<div class="notice warning">Não foi possível carregar as mensagens deste módulo.</div>'
    return
  }

  if (!document.getElementById(containerId)) return
  const prefix = `moduleMessage_${module}`
  container.innerHTML = `
    <details class="form-panel">
      <summary><strong>WhatsApp e mensagens de ${esc(MODULE_LABELS[module])}</strong></summary>
      <p class="form-help" style="margin-top:12px">Estas preferências pertencem somente a este módulo. Os textos são sugestões educadas e podem ser editados.</p>
      <div class="form-group">
        <label class="form-label" for="${prefix}_link">Link do grupo</label>
        <input id="${prefix}_link" class="form-input" type="url" value="${esc(current.groupLink ?? defaults.groupLink)}" placeholder="https://chat.whatsapp.com/...">
      </div>
      <div class="form-group">
        <label class="form-label" for="${prefix}_meeting">Mensagem de reunião ou programação</label>
        <textarea id="${prefix}_meeting" class="form-input" rows="5" maxlength="2000">${esc(current.meetingText?.trim() || defaults.meetingText)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label" for="${prefix}_document">Mensagem de PDF publicado</label>
        <textarea id="${prefix}_document" class="form-input" rows="4" maxlength="2000">${esc(current.documentText?.trim() || defaults.documentText)}</textarea>
      </div>
      <button id="${prefix}_save" class="btn btn-primary" type="button">Salvar mensagens</button>
    </details>`

  document.getElementById(`${prefix}_save`)?.addEventListener('click', async () => {
    const groupLink = (document.getElementById(`${prefix}_link`) as HTMLInputElement).value.trim()
    if (groupLink && !/^https:\/\/(chat\.)?whatsapp\.com\//i.test(groupLink)) {
      notify('Use um link válido do WhatsApp')
      return
    }
    const next: NonNullable<AgendaConfig['moduleWhatsApp']>[MessageSettingsModule] = {
      groupLink,
      meetingText:(document.getElementById(`${prefix}_meeting`) as HTMLTextAreaElement).value.trim() || defaults.meetingText,
      documentText:(document.getElementById(`${prefix}_document`) as HTMLTextAreaElement).value.trim() || defaults.documentText,
    }
    const button = document.getElementById(`${prefix}_save`) as HTMLButtonElement
    button.disabled = true
    button.textContent = 'Salvando...'
    try {
      await set(child(agendaConfigRef, `moduleWhatsApp/${module}`), next)
      onSaved?.({ ...defaults, ...next })
      notify('Mensagens do módulo salvas')
    } catch {
      notify('Não foi possível salvar as mensagens')
    } finally {
      button.disabled = false
      button.textContent = 'Salvar mensagens'
    }
  })
}
