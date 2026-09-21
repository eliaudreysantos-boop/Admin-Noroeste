export function cleanAddress(value:string):string {
  return value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code:string) => {
    const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1),16) : Number(code)
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
  }).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/[\s\u0000-\u001f]+/g,' ').trim()
}
export function agendaLocation(address:string, mapValue=''):{address:string;url:string;geo?:string} {
  const label = cleanAddress(address), query = cleanAddress(mapValue || address)
  if (!query) return { address:label, url:'' }
  if (/^https:\/\//i.test(query)) {
    try { const url = new URL(query); return { address:label, url:url.protocol === 'https:' && !url.username && !url.password ? url.href : '' } } catch { return { address:label, url:'' } }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(query)) return { address:label, url:'' }
  const match = query.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  const geo = match && Math.abs(Number(match[1])) <= 90 && Math.abs(Number(match[2])) <= 180 ? `${Number(match[1])};${Number(match[2])}` : undefined
  return { address:label, url:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, ...(geo ? {geo} : {}) }
}
