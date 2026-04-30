export function parseOpenArg(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg.startsWith('--open=')) {
      return normalizeOpenPath(arg.slice('--open='.length))
    }

    if (arg === '--open') {
      for (let j = i + 1; j < argv.length; j++) {
        const path = normalizeOpenPath(argv[j])
        if (path) return path
      }
      return null
    }
  }

  return null
}

function normalizeOpenPath(value: string | undefined): string | null {
  if (!value) return null

  let path = value
  if (path.startsWith('"') && path.endsWith('"')) {
    path = path.slice(1, -1)
  }

  if (!path || path.startsWith('--')) return null
  return path
}
