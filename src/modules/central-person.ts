export interface CentralIdentity { name?:string; whatsapp?:string; active?:boolean; sex?:string|null }
export function resolveCentralPerson(id:string, masterId:string|undefined, people:Record<string,CentralIdentity>) {
  const resolved = masterId || (people[id] ? id : '')
  const person = people[resolved]
  return { masterId:resolved, person, active:Boolean(person && person.active !== false), name:person?.name ?? '', phone:person?.whatsapp ?? '' }
}
export function canonicalTaskPerson<T extends {masterId?:string;active?:boolean;ativo?:boolean;name?:string;phone?:string}>(id:string, profile:T, people:Record<string,CentralIdentity>):T {
  const central = resolveCentralPerson(id, profile.masterId, people)
  return { ...profile, ...(central.masterId ? {masterId:central.masterId}:{}), active:central.active && profile.active !== false && profile.ativo !== false,
    ...(central.person ? {name:central.name,phone:central.phone}:{}) }
}
