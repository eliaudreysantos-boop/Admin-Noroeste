import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { agendaDocumentsRef, storage, update } from '../firebase.ts'
import type { AgendaPublicDocument } from '../types.ts'

const safe = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')

export async function archiveAgendaPdf(
  bytes: Uint8Array,
  metadata: Pick<AgendaPublicDocument, 'modulo' | 'periodo' | 'nome'>,
): Promise<AgendaPublicDocument> {
  const id = `${metadata.modulo}-${safe(metadata.periodo)}-${Date.now().toString(36)}`
  const storagePath = `agenda/documentos/${id}-${safe(metadata.nome)}`
  const target = storageRef(storage, storagePath)
  await uploadBytes(target, Uint8Array.from(bytes), { contentType:'application/pdf' })
  const item: AgendaPublicDocument = { id, ...metadata, url:await getDownloadURL(target), storagePath, criadoEm:new Date().toISOString() }
  await update(agendaDocumentsRef, { [id]:item })
  return item
}

export async function uploadAgendaPdf(
  file: File,
  metadata: Pick<AgendaPublicDocument, 'modulo' | 'periodo' | 'nome'>,
): Promise<AgendaPublicDocument> {
  return archiveAgendaPdf(new Uint8Array(await file.arrayBuffer()), metadata)
}

export async function removeAgendaDocument(item: AgendaPublicDocument): Promise<void> {
  if (item.storagePath) {
    try { await deleteObject(storageRef(storage, item.storagePath)) }
    catch (error) {
      if ((error as { code?: string }).code !== 'storage/object-not-found') throw error
    }
  }
  await update(agendaDocumentsRef, { [item.id]:null })
}
