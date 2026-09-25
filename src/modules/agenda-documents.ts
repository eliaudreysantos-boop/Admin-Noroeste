import { agendaDocumentsRef, update } from '../firebase.ts'
import { deleteStoredFile, uploadPdf } from '../secure-api.ts'
import type { AgendaPublicDocument } from '../types.ts'
import { safeDocumentKey } from './agenda-documents-domain.ts'

async function archiveAgendaPdf(
  bytes: Uint8Array,
  metadata: Pick<AgendaPublicDocument, 'modulo' | 'periodo' | 'nome'>,
): Promise<AgendaPublicDocument> {
  const id = `${metadata.modulo}-${safeDocumentKey(metadata.periodo)}-${Date.now().toString(36)}`
  const storagePath = `agenda/documentos/admin/${id}-${safeDocumentKey(metadata.nome)}`
  const url = await uploadPdf(storagePath, bytes)
  try {
    const item: AgendaPublicDocument = { id, ...metadata, tipo:metadata.modulo === 'admin' ? 'admin' : 'modulo', url, storagePath, criadoEm:new Date().toISOString() }
    await update(agendaDocumentsRef, { [id]:item })
    return item
  } catch (error) {
    // Preserve uploaded files after an uncertain response: metadata may have committed.
    throw error
  }
}

export async function uploadAgendaPdf(
  file: File,
  metadata: Pick<AgendaPublicDocument, 'modulo' | 'periodo' | 'nome'>,
): Promise<AgendaPublicDocument> {
  return archiveAgendaPdf(new Uint8Array(await file.arrayBuffer()), metadata)
}

export async function removeAgendaDocument(item: AgendaPublicDocument): Promise<void> {
  await update(agendaDocumentsRef, { [item.id]:null })
  if (item.storagePath) {
    try { await deleteStoredFile(item.storagePath) }
    catch (error) { console.warn('Metadado removido; arquivo antigo permaneceu no armazenamento', error) }
  }
}
