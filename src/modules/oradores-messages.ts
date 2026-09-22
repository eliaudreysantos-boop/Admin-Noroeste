import { cleanAddress } from './agenda-location.ts'
import { scheduleCongregationId, scheduleCongregationName, type SpeakersRoot, type TalkSchedule } from './oradores-domain.ts'

export function messageAddress(value=''):string {
  const address=cleanAddress(value)
  // Legacy location values are not street addresses. Never substitute the mapa field.
  if(/(?:https?:\/\/|www\.)/i.test(address)||/^[a-z][a-z0-9+.-]*:/i.test(address)||/^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3}(?:\s|$)/i.test(address)||/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(address))return ''
  return address
}

export function speakerAssignmentMessage(item:TalkSchedule,root:SpeakersRoot):string {
  const congregations=root.congregacoes??{},theme=root.temas?.[item.temaId??'']
  const local=congregations[item.localCongregacaoId??'']??Object.values(congregations).find(c=>c.tipo==='local'&&c.secao!=='s1')
  const destination=item.tipo==='saida_orador'?congregations[scheduleCongregationId(item)]:local
  const name=destination?.nome || (item.tipo==='saida_orador'?scheduleCongregationName(item):item.localCongregacaoNome) || 'A definir'
  const date=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(`${item.data}T12:00:00Z`))
  const number=theme?.numero??item.temaNumero,title=theme?.titulo||item.temaTitulo||'A definir'
  const time=item.tipo==='saida_orador'?destination?.horario:item.horarioLocal||destination?.horario
  const meeting=[destination?.diaReuniao,time].filter(Boolean).join(', ')
  return [`📅 *${date}*`,item.tipo==='saida_orador'?'🚗 *Saída para discurso*':'🎙️ *Discurso local*',
    `📖 *Tema${number?' '+number:''}:* ${title}`,`🏛️ Congregação: ${name}`,
    destination?.cidade?`📍 Cidade: ${destination.cidade}`:'',`🕒 Reunião: ${meeting||'Horário a confirmar'}`,
    destination?.contato?`👤 Contato: ${destination.contato}`:'',destination?.telefone?`📞 Telefone da congregação: ${destination.telefone}`:'',
    `📍 Endereço: ${messageAddress(destination?.localizacao)||'Não informado'}`].filter(Boolean).join('\n')
}
