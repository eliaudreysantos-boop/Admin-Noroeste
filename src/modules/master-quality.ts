import type { RawPessoas, RawUsuarios } from '../types.ts'

export interface QualityIssue { kind:'telefone'|'duplicado'|'cadastro'|'acesso'; id:string; detail:string }

/** Read-only checks. No personal contact number is returned to the report. */
export function auditMasterQuality(people:RawPessoas, users:RawUsuarios):QualityIssue[] {
  const issues:QualityIssue[]=[]
  const phones=new Map<string,string[]>()
  for(const [id,person] of Object.entries(people)) {
    if (!person.active) continue
    if (!person.name?.trim()) issues.push({kind:'cadastro',id,detail:'Pessoa ativa sem nome.'})
    const digits=(person.whatsapp??'').replace(/\D/g,'')
    if (digits && !/^55\d{10,11}$/.test(digits)) issues.push({kind:'telefone',id,detail:'WhatsApp fora do formato brasileiro com DDI e DDD.'})
    if (digits) phones.set(digits,[...(phones.get(digits)??[]),id])
  }
  for(const ids of phones.values()) if(ids.length>1) for(const id of ids) issues.push({kind:'duplicado',id,detail:`WhatsApp compartilhado por ${ids.length} pessoas ativas (${ids.join(', ')}).`})
  for(const [id,user] of Object.entries(users)) {
    if(!user.ativo) continue
    if(!user.masterId) issues.push({kind:'acesso',id,detail:'Usuário ativo sem vínculo com pessoa.'})
    else if(!people[user.masterId]) issues.push({kind:'acesso',id,detail:'Usuário ativo vinculado a pessoa inexistente.'})
    else if(!people[user.masterId]?.active) issues.push({kind:'acesso',id,detail:'Usuário ativo vinculado a pessoa inativa.'})
  }
  return issues.sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id))
}
