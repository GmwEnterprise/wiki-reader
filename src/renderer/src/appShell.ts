export type WorkspaceShellState = 'workspace' | 'opening' | 'welcome'

export function getWorkspaceShellState(hasWorkspace: boolean, initialOpenPath: string | null): WorkspaceShellState {
  if (hasWorkspace) return 'workspace'
  if (initialOpenPath) return 'opening'
  return 'welcome'
}
