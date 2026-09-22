import { monthBounds, scheduleCongregationId, scheduleCongregationName, type SpeakersRoot } from './oradores-domain.ts'

/** Only printable data: confirmation and administrative notes do not change the PDF. */
export function publicationSource(root: SpeakersRoot, month: string): string {
  const bounds = monthBounds(month), congregations = root.congregacoes ?? {}
  const locals = Object.values(congregations).filter(item => item.tipo === 'local' && item.secao !== 's1')
  const localName = locals.find(item => item.secao === 's2')?.nome?.trim() || locals[0]?.nome?.trim() || 'Congregação Noroeste'
  const rows = Object.values(root.programacao ?? {}).filter(item => item.secao !== 's1' && item.data >= bounds.start && (item.tipo === 'saida_orador' || item.data <= bounds.end))
    .sort((a,b) => a.data.localeCompare(b.data) || a.tipo.localeCompare(b.tipo))
    .map(item => {
      const theme = root.temas?.[item.temaId ?? ''], destination = congregations[scheduleCongregationId(item)]
      return [item.data, item.tipo, root.oradores?.[item.oradorId ?? '']?.nome?.trim() || item.oradorNome?.trim() || 'A definir',
        theme?.numero ?? item.temaNumero ?? '-', item.tipo === 'saida_orador' ? '' : theme?.titulo ?? item.temaTitulo ?? '-',
        item.tipo === 'discurso_local' ? localName : destination?.nome ?? scheduleCongregationName(item) ?? '-',
        item.tipo === 'saida_orador' ? destination?.localizacao ?? '-' : '']
    })
  return JSON.stringify([month, localName, rows])
}
export async function publicationHash(source: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
