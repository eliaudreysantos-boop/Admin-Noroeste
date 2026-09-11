import type { RawUsuarios } from '../types'

export interface UnlockTapState {
  count: number
  lastTapAt: number
}

export function advanceUnlockTap(
  current: UnlockTapState,
  now: number,
  maxGapMs = 2500,
  requiredTaps = 7,
): { state: UnlockTapState; unlocked: boolean } {
  const count = now - current.lastTapAt <= maxGapMs ? current.count + 1 : 1
  return {
    state: { count: count >= requiredTaps ? 0 : count, lastTapAt: now },
    unlocked: count >= requiredTaps,
  }
}

export function validAdminPassword(users: RawUsuarios, password: string): boolean {
  return Boolean(password) && Object.values(users).some(user => (
    user.ativo && user.apps.mestre === true && user.senha === password
  ))
}
