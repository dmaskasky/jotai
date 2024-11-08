import type { Getter, Setter, Atom } from 'jotai/vanilla'
import { createStore, atom } from 'jotai/vanilla'
import { vi, expect, it } from 'vitest'

type AnyAtom = Atom<unknown>
type Store = ReturnType<typeof createStore>
type PrdStore = Exclude<Store, { dev4_get_internal_weak_map: any }>
type DevStoreRev4 = Omit<
  Extract<Store, { dev4_get_internal_weak_map: any }>,
  keyof PrdStore
>

function isDevStoreRev4(store: Store): store is PrdStore & DevStoreRev4 {
  return (
    typeof (store as DevStoreRev4).dev4_get_internal_weak_map === 'function' &&
    typeof (store as DevStoreRev4).dev4_get_mounted_atoms === 'function' &&
    typeof (store as DevStoreRev4).dev4_restore_atoms === 'function'
  )
}

function assertIsDevStore(
  store: Store,
): asserts store is PrdStore & DevStoreRev4 {
  if (!isDevStoreRev4(store)) {
    throw new Error('Store is not a dev store')
  }
}

type Cleanup = () => void
type Effect = (get: Getter, set: Setter) => void | Cleanup
type Ref = {
  getter?: Getter
  setter?: Setter
  cleanup?: Cleanup | void
  isPending: boolean
  deps: Set<AnyAtom>
}

function atomSyncEffect(effect: Effect) {
  const refAtom = atom(
    () => ({ deps: new Set() }) as Ref,
    (get, set) => {
      const ref = get(refAtom)
      ref.setter = set
      ref.isPending = true
      return () => {
        ref.cleanup?.()
        ref.cleanup = undefined
        ref.isPending = false
        ref.deps.clear()
      }
    },
  )
  refAtom.onMount = (setSelf) => setSelf()
  refAtom.debugPrivate = true
  function onAfterFlushPending(get: Getter) {
    const ref = get(refAtom)
    if (!ref.isPending) {
      return
    }
    ref.isPending = false
    ref.cleanup?.()
    ref.cleanup = effectAtom.effect(ref.getter!, ref.setter!)
  }
  const effectAtom = Object.assign(
    atom((get) => {
      const ref = get(refAtom)
      ref.getter = <Value>(a: Atom<Value>): Value => {
        ref.deps.add(a)
        return get(a)
      }
      ref.deps.forEach(get)
      ref.isPending = true
      return
    }),
    { effect },
  )
  effectAtom.onAfterFlushPending = onAfterFlushPending
  return effectAtom
}

it('responds to changes to atoms when subscribed', () => {
  const store = createStore()
  assertIsDevStore(store)
  const weakMap = store.dev4_get_internal_weak_map()
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
  expect(results).toStrictEqual([])
  const unsub = store.sub(e, () => {}) // mount syncEffect
  expect(effect).toBeCalledTimes(1)
  expect(results).toStrictEqual([11]) // initial values at time of effect mount
  store.set(a, 2)
  expect(results).toStrictEqual([11, 21]) // store.set(a, 2)
  store.set(b, 2)
  expect(results).toStrictEqual([11, 21, 22]) // store.set(b, 2)
  store.set(w, 3)
  // intermediate state of '32' should not be recorded since the effect runs _after_ graph has been computed
  expect(results).toStrictEqual([11, 21, 22, 33]) // store.set(w, 3)
  expect(cleanup).toBeCalledTimes(3)
  expect(effect).toBeCalledTimes(4)
  expect(Array.from(weakMap.get(e)!.d.keys())).toEqual(
    expect.arrayContaining([a, b]),
  )
  unsub()
  expect(cleanup).toBeCalledTimes(4)
  expect(effect).toBeCalledTimes(4)
})

it('responds to changes to atoms when mounted with get', () => {
  const store = createStore()
  assertIsDevStore(store)
  const weakMap = store.dev4_get_internal_weak_map()
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
  expect(results).toStrictEqual([])
  const unsub = store.sub(d, () => {}) // mount syncEffect
  expect(effect).toBeCalledTimes(1)
  expect(results).toStrictEqual([11]) // initial values at time of effect mount
  store.set(a, 2)
  expect(results).toStrictEqual([11, 21]) // store.set(a, 2)
  store.set(b, 2)
  expect(results).toStrictEqual([11, 21, 22]) // store.set(b, 2)
  store.set(w, 3)
  // intermediate state of '32' should not be recorded since the effect runs _after_ graph has been computed
  expect(results).toStrictEqual([11, 21, 22, 33]) // store.set(w, 3)
  expect(cleanup).toBeCalledTimes(3)
  expect(effect).toBeCalledTimes(4)
  expect(Array.from(weakMap.get(e)!.d.keys())).toEqual(
    expect.arrayContaining([a, b]),
  )
  unsub()
  expect(cleanup).toBeCalledTimes(4)
  expect(effect).toBeCalledTimes(4)
})
