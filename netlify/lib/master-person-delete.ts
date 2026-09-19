// Executed inside the root transaction so links created concurrently are checked again.
export function deleteUnreferencedMasterPerson(current:unknown,mid:string):unknown|undefined {
  if(!current||typeof current!=='object'||Array.isArray(current)) return undefined
  const root=current as Record<string,any>
  if(!root.master?.pessoas?.[mid]) return undefined
  const references=(value:unknown,path:string[]):boolean=>{
    if(path.length===3&&path[0]==='master'&&path[1]==='pessoas'&&path[2]===mid) return false
    if(value===mid) return true
    if(!value||typeof value!=='object') return false
    return Object.entries(value).some(([key,child])=>(key===mid&&child!==null&&child!==false)||references(child,[...path,key]))
  }
  // The person's own key is not a reference.
  const copy=structuredClone(root)
  delete copy.master.pessoas[mid]
  if(references(copy,[])) return undefined
  return copy
}
