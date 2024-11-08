import { createStore, atom, type Getter, type Setter } from 'jotai/vanilla'
import { vi, expect, it } from 'vitest'

type Cleanup = () => void
type Effect = (get: Getter, set: Setter) => void | Cleanup

function atomSyncEffect(effect: Effect) {
  const refAtom = atom<{
    cleanup?: Cleanup | void
  }>(() => ({}))
  return Object.assign(
    atom(() => {}),
    {
      effect: (get: Getter, set: Setter) => {
        const ref = get(refAtom)
        ref.cleanup?.()
        ref.cleanup = effect(get, set)
      },
    },
  )
}

it('responds to changes to atoms', () => {
  const atomState = new Map()
  const store = createStore().unstable_derive(() => {
    return [
      (atom) => {
        if (!atomState.has(atom)) {
          atomState.set(atom, {
            name: atom.debugLabel,
            d: new Map(),
            p: new Set(),
            n: 0,
          })
        }
        return atomState.get(atom)
      },
    ]
  })
  const a = atom(1)
  a.debugLabel = 'a'
  const b = atom(1)
  b.debugLabel = 'b'
  const w = atom(null, (_get, set, value: number) => {
    set(a, value)
    set(b, value)
  })
  w.debugLabel = 'w'
  const results: number[] = []
  const cleanup = vi.fn()
  const effectFn = vi.fn((get: Getter) => {
    results.push(get(a) * 10 + get(b))
    return cleanup
  })
  const e = atomSyncEffect(effectFn)
  e.debugLabel = 'e'
  expect(results).toStrictEqual([])
  const subscriber = vi.fn()
  store.sub(e, subscriber) // mount syncEffect
  expect(results).toStrictEqual([11]) // initial values at time of effect mount
  store.set(a, 2)
  expect(results).toStrictEqual([11, 21]) // store.set(a, 2)
  store.set(b, 2)
  expect(results).toStrictEqual([11, 21, 22]) // store.set(b, 2)
  store.set(w, 3)
  // intermediate state of '32' should not be recorded as effect runs _after_ graph has been computed
  expect(results).toStrictEqual([11, 21, 22, 33]) // store.set(w, 3)
  expect(subscriber).toBeCalledTimes(0)
  expect(effectFn).toBeCalledTimes(4)
  expect(cleanup).toBeCalledTimes(3)
})
