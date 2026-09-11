import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { agendaDocumentsRef, storage, update } from '../firebase.ts'
import type { AgendaPublicDocument } from '../types.ts'

const safe = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')

export async function archiveAgendaPdf(
  bytes: Uint8Array,
  metadata: Pick<AgendaPublicDocument, 'modulo' | 'periodo' | 'nome'>,
): Promise<AgendaPublicDocument> {
  const id = `${metadata.modulo}-${safe(metadata.periodo)}-${Date.now().toString(36)}`
  const target = storageRef(storage, `agenda/documentos/${id}-${safe(metadata.nome)}`)
  await uploadBytes(target, Uint8Array.from(bytes), { contentType:'application/pdf' })
  const item: AgendaPublicDocument = { id, ...metadata, url:await getDownloadURL(target), criadoEm:new Date().toISOString() }
  await update(agendaDocumentsRef, { [id]:item })
  return item
}
