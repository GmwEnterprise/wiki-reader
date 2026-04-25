export type Workspace = {
  id: string
  rootPath: string
  name: string
}

export type WikiFile = {
  relativePath: string
  name: string
  mtimeMs: number
  size: number
}

export type DocumentState = {
  file: WikiFile | null
  content: string
  originalContent: string
  mode: 'preview' | 'source'
  dirty: boolean
}

export type Heading = {
  id: string
  level: number
  text: string
}
