import { expect, it, vi } from 'vitest'
import type { Atom, Getter, Setter } from 'jotai/vanilla'
import { atom, createStore } from 'jotai/vanilla'

type AnyAtom = Atom<unknown>
type GetterWithPeak = Getter & { peak: Getter }
type SetterWithRecurse = Setter & { recurse: Setter }
type Cleanup = () => void
type Effect = (get: GetterWithPeak, set: SetterWithRecurse) => void | Cleanup
type Ref = {
  get: GetterWithPeak
  set?: SetterWithRecurse
  cleanup?: Cleanup | null
  fromCleanup: boolean
  inProgress: number
  isPending: boolean
  deps: Set<AnyAtom>
}

function atomSyncEffect(effect: Effect) {
  const refAtom = atom(
    () => ({ deps: new Set(), inProgress: 0 }) as Ref,
    (get, set) => {
      const ref = get(refAtom)
      if (!ref.get.peak) {
        ref.get.peak = get
      }
      const setter: Setter = (a, ...args) => {
        try {
          ++ref.inProgress
          return set(a, ...args)
        } finally {
          --ref.inProgress
        }
      }
      const recurse: Setter = (a, ...args) => {
        if (ref.fromCleanup) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('cannot recurse inside cleanup')
          }
          return undefined as any
        }
        return set(a, ...args)
      }
      if (!ref.set) {
        ref.set = Object.assign(setter, { recurse })
      }
      ref.isPending = ref.inProgress === 0
      return () => {
        ref.cleanup?.()
        ref.cleanup = null
        ref.isPending = false
        ref.deps.clear()
      }
    },
  )
  refAtom.onMount = (mount) => mount()
  const internalAtom = atom((get) => {
    const ref = get(refAtom)
    if (!ref.get) {
      ref.get = ((a) => {
        ref.deps.add(a)
        return get(a)
      }) as Getter & { peak: Getter }
    }
    ref.deps.forEach(get)
    ref.isPending = true
  })
  internalAtom.unstable_onInit = (store) => {
    store.unstable_onChange(() => {
      const ref = store.get(refAtom)
      if (!ref.isPending || ref.inProgress > 0) {
        return
      }
      ref.isPending = false
      ref.cleanup?.()
      const cleanup = effectAtom.effect(ref.get!, ref.set!)
      ref.cleanup =
        typeof cleanup === 'function'
          ? () => {
              try {
                ref.fromCleanup = true
                cleanup()
              } finally {
                ref.fromCleanup = false
              }
            }
          : null
    })
  }
  if (process.env.NODE_ENV !== 'production') {
    refAtom.debugPrivate = true
    internalAtom.debugPrivate = true
  }
  const effectAtom = Object.assign(
    atom((get) => void get(internalAtom)),
    { effect },
  )
  return effectAtom
}

it('responds to changes to atoms when subscribed', () => {
  const store = createStore()
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
  const effect = vi.fn((get: Getter) => {
    results.push(get(a) * 10 + get(b))
    return cleanup
  })
  const e = atomSyncEffect(effect)
  e.debugLabel = 'e'
  const unsub = store.sub(e, () => {}) // mount syncEffect
  expect(effect).toBeCalledTimes(1)
  expect(results).toStrictEqual([11]) // initial values at time of effect mount
  store.set(a, 2)
  expect(results).toStrictEqual([11, 21])
  store.set(b, 2)
  expect(results).toStrictEqual([11, 21, 22])
  store.set(w, 3)
  // intermediate state of '32' should not be recorded since the effect runs _after_ graph has been computed
  expect(results).toStrictEqual([11, 21, 22, 33])
  expect(cleanup).toBeCalledTimes(3)
  expect(effect).toBeCalledTimes(4)
  unsub()
  expect(cleanup).toBeCalledTimes(4)
  expect(effect).toBeCalledTimes(4)
  store.set(a, 4)
  // the effect is unmounted so no more updates
  expect(results).toStrictEqual([11, 21, 22, 33])
  expect(effect).toBeCalledTimes(4)
})

it('responds to changes to atoms when mounted with get', () => {
  const store = createStore()
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
  const effect = vi.fn((get: Getter) => {
    results.push(get(a) * 10 + get(b))
    return cleanup
  })
  const e = atomSyncEffect(effect)
  e.debugLabel = 'e'
  const d = atom((get) => get(e))
  d.debugLabel = 'd'
  const unsub = store.sub(d, () => {}) // mount syncEffect
  expect(effect).toBeCalledTimes(1)
  expect(results).toStrictEqual([11]) // initial values at time of effect mount
  store.set(a, 2)
  expect(results).toStrictEqual([11, 21])
  store.set(b, 2)
  expect(results).toStrictEqual([11, 21, 22])
  store.set(w, 3)
  // intermediate state of '32' should not be recorded since the effect runs _after_ graph has been computed
  expect(results).toStrictEqual([11, 21, 22, 33])
  expect(cleanup).toBeCalledTimes(3)
  expect(effect).toBeCalledTimes(4)
  unsub()
  expect(cleanup).toBeCalledTimes(4)
  expect(effect).toBeCalledTimes(4)
})

it('sets values to atoms without causing infinite loop', () => {
  const store = createStore()
  const a = atom(1)
  a.debugLabel = 'a'
  const effect = vi.fn((get: Getter, set: Setter) => {
    set(a, get(a) + 1)
  })
  const e = atomSyncEffect(effect)
  e.debugLabel = 'e'
  const unsub = store.sub(e, () => {}) // mount syncEffect
  expect(effect).toBeCalledTimes(1)
  expect(store.get(a)).toBe(2) // initial values at time of effect mount
  store.set(a, (v) => ++v)
  expect(store.get(a)).toBe(4)
  expect(effect).toBeCalledTimes(2)
  unsub()
  expect(effect).toBeCalledTimes(2)
})

it('reads the value with peak without subscribing to updates', () => {
  const store = createStore()
  const a = atom(1)
  a.debugLabel = 'a'
  let result = 0
  const effect = vi.fn((get: GetterWithPeak) => {
    result = get.peak(a)
  })
  const e = atomSyncEffect(effect)
  e.debugLabel = 'e'
  store.sub(e, () => {}) // mount syncEffect
  expect(effect).toBeCalledTimes(1)
  expect(result).toBe(1) // initial values at time of effect mount
  store.set(a, 2)
  expect(effect).toBeCalledTimes(1)
})

it('supports recursion', () => {
  const store = createStore()
  const a = atom(1)
  a.debugLabel = 'a'
  const effect = vi.fn((get: Getter, set: SetterWithRecurse) => {
    if (get(a) < 3) {
      set.recurse(a, (v) => ++v)
    }
  })
  const e = atomSyncEffect(effect)
  e.debugLabel = 'e'
  const unsub = store.sub(e, () => {}) // mount syncEffect
  expect(effect).toBeCalledTimes(3)
  expect(store.get(a)).toBe(3)
})
