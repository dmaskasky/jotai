import { Atom, atom } from '../atom'

export const previousAtom = <T>(targetAtom: Atom<T>) => {
  const baseAtom = atom(() => ({
    prev: undefined as T | undefined,
    curr: undefined as T | undefined,
  }))
  return atom((get) => {
    const base = get(baseAtom)
    const value = get(targetAtom)
    if (base.curr !== value) {
      base.prev = base.curr
      base.curr = value
    }
    return base.prev
  })
}
