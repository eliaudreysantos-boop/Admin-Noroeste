import { isDeepStrictEqual } from 'node:util'

export function conditionalValue(current: unknown, expected: unknown, proposed: unknown): unknown {
  return isDeepStrictEqual(canonical(current), canonical(expected)) ? proposed : undefined
}

function canonical(value: unknown): unknown {
  if (value == null) return null
  if (typeof value !== 'object') return value
  const entries = Object.entries(value).map(([key, item]) => [key, canonical(item)] as const).filter(([, item]) => item !== null)
  return entries.length ? Object.fromEntries(entries) : null
}

export function validConditionalPatch(expected: unknown, patch: unknown): boolean {
  if (!expected || !patch || typeof expected !== 'object' || typeof patch !== 'object' || Array.isArray(expected) || Array.isArray(patch)) return false
  const paths = Object.keys(patch)
  return paths.length > 0 && paths.length === Object.keys(expected).length && paths.every(path =>
    Object.prototype.hasOwnProperty.call(expected, path) && path.split('/').every(key => key && !/[.#$\[\]]/.test(key) && !['__proto__', 'prototype', 'constructor'].includes(key)) &&
    !paths.some(other => other !== path && other.startsWith(`${path}/`)))
}

export function conditionalPatch(current: unknown, expected: Record<string, unknown>, patch: Record<string, unknown>): unknown {
  if (!validConditionalPatch(expected, patch)) return undefined
  const read = (path: string): unknown => path.split('/').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : null, current)
  if (Object.keys(patch).some(path => !isDeepStrictEqual(canonical(read(path)), canonical(expected[path])))) return undefined
  const next = current && typeof current === 'object' ? structuredClone(current) as Record<string, unknown> : {}
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split('/'), leaf = keys.pop()!
    let parent = next
    for (const key of keys) {
      if (!parent[key] || typeof parent[key] !== 'object') parent[key] = {}
      parent = parent[key] as Record<string, unknown>
    }
    if (value === null) delete parent[leaf]
    else parent[leaf] = value
  }
  return next
}
