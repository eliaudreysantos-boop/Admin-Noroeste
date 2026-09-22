export const SPEAKER_FOOTER = 'Sinta-se à vontade para tomar a iniciativa de pedir sugestões ao conselheiro assistente e usar bem o livro Beneficie-se, a brochura Melhore e o documento Lembretes para Os Que Fazem Discursos Públicos (S-141).'
export const SPEAKER_TEMPLATE = `Olá, segue suas próximas designações:\n\n{dados_da_reuniao}\n\n${SPEAKER_FOOTER}`
export const TASK_TEMPLATE = 'Olá, segue as designações do dia:\n\n{dados_da_reuniao}'
const LEGACY = {
  oradores:'Olá. Segue a programação de oradores:\n\n{dados_da_reuniao}\n\nAgradecemos pela atenção.',
  tarefas:'Olá. Seguem as designações de tarefas da reunião:\n\n{dados_da_reuniao}\n\nAgradecemos pela atenção.',
}
export function resolveMessageTemplate(module:'oradores'|'tarefas', value?:string):string {
  return !value?.trim() || value === LEGACY[module] ? (module==='oradores'?SPEAKER_TEMPLATE:TASK_TEMPLATE) : value
}
// The defaults vary by action; only an actual customization overrides them.
export function contextualMessage(module:'oradores'|'tarefas', template:string|undefined, standard:string, details:string, name='irmãos'):string {
  const resolved=resolveMessageTemplate(module,template)
  if(resolved===(module==='oradores'?SPEAKER_TEMPLATE:TASK_TEMPLATE))return standard
  return resolved.split('{dados_da_reuniao}').join(details).split('{nome}').join(name)
}
export function whatsappPhone(value:string):string|null {
  const digits=value.replace(/\D/g,'')
  if(/^\d{10,11}$/.test(digits))return `55${digits}`
  return /^55\d{10,11}$/.test(digits)?digits:null
}
export function displayPhone(value:string):string {
  const phone=whatsappPhone(value)?.slice(2)
  return phone?`${phone.slice(0,2)} ${phone.slice(2,-4)}-${phone.slice(-4)}`:value
}
export function messageDate(date:string,time=''):string {
  const formatted=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`))
  return `📅 *${formatted}${time?' — '+time:''}*`
}
