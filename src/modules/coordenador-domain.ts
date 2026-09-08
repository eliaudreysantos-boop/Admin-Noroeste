import type { AppPermissions, Usuario } from '../types'

export type CoordinatorModule = 'tarefas' | 'escala' | 'limpeza' | 'oradores' | 'programacao' | 'secretario'
export type CoordinatorDocument = 'tarefas-pdf' | 'escala-pdf' | 'limpeza-pdf' | 's89-semana' | 's140-pdf' | 's140-docx'

export interface CoordinatorExportDefinition {
  id: CoordinatorDocument
  module: CoordinatorModule
  label: string
}

export const COORDINATOR_EXPORTS: CoordinatorExportDefinition[] = [
  { id: 'tarefas-pdf', module: 'tarefas', label: 'PDF de Tarefas' },
  { id: 'escala-pdf', module: 'escala', label: 'PDF da Escala' },
  { id: 'limpeza-pdf', module: 'limpeza', label: 'PDF da limpeza' },
  { id: 's89-semana', module: 'programacao', label: 'S-89 da semana' },
  { id: 's140-pdf', module: 'programacao', label: 'S-140 PDF' },
  { id: 's140-docx', module: 'programacao', label: 'S-140 DOCX' },
]

export function coordinatorDocumentModules(usuario: Usuario): CoordinatorModule[] {
  return [...new Set(COORDINATOR_EXPORTS
    .filter(item => usuario.apps[item.module] === true)
    .map(item => item.module))]
}

export function isCoordinator(usuario: Usuario): boolean {
  return usuario.ativo && usuario.secretarioPapel === 'coordenador'
}

export function canViewCoordinatorCard(usuario: Usuario, module: CoordinatorModule): boolean {
  return isCoordinator(usuario) && coordinatorDocumentModules(usuario).includes(module)
}

export function canExportDocument(usuario: Usuario, documentId: CoordinatorDocument): boolean {
  const definition = COORDINATOR_EXPORTS.find(item => item.id === documentId)
  return Boolean(definition && canViewCoordinatorCard(usuario, definition.module))
}

export function coordinatorPermissions(apps: AppPermissions): AppPermissions {
  return { ...apps, mestre: false, individual: false }
}
