import type { SingleFileState } from './types'

export type WorkspaceShellState = 'workspace' | 'opening' | 'welcome'

export function getWorkspaceShellState(
  hasWorkspace: boolean,
  singleFile: SingleFileState | null,
  initialOpenPath: string | null
): WorkspaceShellState {
  if (hasWorkspace || singleFile) return 'workspace'
  if (initialOpenPath) return 'opening'
  return 'welcome'
}
