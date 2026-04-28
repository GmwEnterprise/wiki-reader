const INITIAL_OPEN_PATH_ARG = '--initial-open-path'

export function getInitialOpenPathFromArgv(argv: string[]): string | null {
  const argIndex = argv.indexOf(INITIAL_OPEN_PATH_ARG)
  if (argIndex === -1 || argIndex >= argv.length - 1) return null

  return argv[argIndex + 1] || null
}

export function getInitialOpenPathArg(path: string): string[] {
  return [INITIAL_OPEN_PATH_ARG, path]
}
