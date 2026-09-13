import { agendaDocumentsRef, get, update } from '../firebase.ts'
import { deleteStoredFile, uploadPdf } from '../secure-api.ts'
import type { AgendaPublicDocument } from '../types.ts'
import { officialDocumentId, safeDocumentKey, type PublicPdfModule } from './agenda-documents-domain.ts'

export interface ModulePdfMetadata {
  modulo: PublicPdfModule
  periodo: string
  nome: string
  inicio: string
  fim: string
  origemPeriodoId: string
}

export async function archiveAgendaPdf(
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
    try { await deleteStoredFile(storagePath) } catch { /* O registro nao foi publicado; a limpeza e melhor esforco. */ }
    throw error
  }
}

export async function publishAgendaModulePdf(bytes: Uint8Array, metadata: ModulePdfMetadata): Promise<AgendaPublicDocument> {
  const id = officialDocumentId(metadata.modulo, metadata.origemPeriodoId)
  const snapshot = await get(agendaDocumentsRef)
  const previous = snapshot.exists() ? (snapshot.val() as Record<string, AgendaPublicDocument>)[id] : undefined
  const version = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const storagePath = `agenda/documentos/modulos/${metadata.modulo}/${safeDocumentKey(metadata.origemPeriodoId)}-${version}.pdf`
  const url = await uploadPdf(storagePath, bytes)
  try {
    const item: AgendaPublicDocument = {
      id,
      ...metadata,
      tipo:'modulo',
      url,
      storagePath,
      criadoEm:new Date().toISOString(),
    }
    await update(agendaDocumentsRef, { [id]:item })
    if (previous?.storagePath && previous.storagePath !== storagePath) {
      try { await deleteStoredFile(previous.storagePath) }
      catch (error) { console.warn('PDF anterior preservado no Storage', error) }
    }
    return item
  } catch (error) {
    try { await deleteStoredFile(storagePath) } catch { /* Evita mascarar a falha original. */ }
    throw error
  }
}

export async function unpublishAgendaModulePdf(module: PublicPdfModule, originPeriodId: string): Promise<void> {
  const id = officialDocumentId(module, originPeriodId)
  const snapshot = await get(agendaDocumentsRef)
  const item = snapshot.exists() ? (snapshot.val() as Record<string, AgendaPublicDocument>)[id] : undefined
  await update(agendaDocumentsRef, { [id]:null })
  if (item?.storagePath) {
    try { await deleteStoredFile(item.storagePath) }
    catch (error) { console.warn('Metadado removido; arquivo antigo permaneceu no Storage', error) }
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
    catch (error) { console.warn('Metadado removido; arquivo antigo permaneceu no Storage', error) }
  }
}
