import type { Usuario } from '../types'

export type CoordinatorModule = 'tarefas' | 'escala' | 'limpeza' | 'oradores' | 'programacao' | 'secretario'
export type CoordinatorDocument = 'limpeza-pdf' | 's89-semana' | 's140-pdf' | 's140-docx'

export interface CoordinatorExportDefinition {
  id: CoordinatorDocument
  module: CoordinatorModule
  label: string
}

export const COORDINATOR_EXPORTS: CoordinatorExportDefinition[] = [
  { id: 'limpeza-pdf', module: 'limpeza', label: 'PDF da limpeza' },
  { id: 's89-semana', module: 'programacao', label: 'S-89 da semana' },
  { id: 's140-pdf', module: 'programacao', label: 'S-140 PDF' },
  { id: 's140-docx', module: 'programacao', label: 'S-140 DOCX' },
]

export function isCoordinator(usuario: Usuario): boolean {
  return usuario.ativo && usuario.secretarioPapel === 'coordenador'
}

export function canViewCoordinatorCard(usuario: Usuario, module: CoordinatorModule): boolean {
  return isCoordinator(usuario) && usuario.apps[module] === true
}

export function canExportDocument(usuario: Usuario, documentId: CoordinatorDocument): boolean {
  const definition = COORDINATOR_EXPORTS.find(item => item.id === documentId)
  return Boolean(definition && canViewCoordinatorCard(usuario, definition.module))
}
