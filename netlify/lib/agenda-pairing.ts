import { createHash } from 'node:crypto'
export const pairingKey = (code:string):string => createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex')
export interface PairingCode { masterId:string; expiresAt:number; createdBy:string }
export function validPairing(value:PairingCode|null, now:number):value is PairingCode {
  return Boolean(value && value.expiresAt > now && /^[A-Za-z0-9_-]+$/.test(value.masterId))
}
export function consumePairing(current:Record<string,any>,key:string,token:string,installationId:string,now:number):Record<string,any>|undefined {
  const pairing=current?.agendaPareamentosPrivados?.[key] as PairingCode|null
  if(!validPairing(pairing,now))return undefined
  const person=current?.master?.pessoas?.[pairing.masterId]
  if(!person||person.active===false)return undefined
  const next=structuredClone(current)
  next.agendaDispositivosPrivados??={}
  next.agendaDispositivosPrivados[token]={token,masterId:pairing.masterId,installationId,expiresAt:now+90*86400000}
  delete next.agendaPareamentosPrivados[key]
  return next
}
