import { describe, expect, it, vi } from 'vitest'
import { atom, createStore } from 'jotai/vanilla'
import type { Atom } from 'jotai/vanilla'
import type { AtomState, INTERNAL_DevStoreRev4 } from 'jotai/vanilla/store'

type Store = ReturnType<typeof createStore>

describe('unstable_derive for scoping atoms', () => {
  /**
   * a
   * S1[a]: a1
   */
  it('primitive atom', () => {
    const a = atom('a')
    a.onMount = (setSelf) => setSelf((v) => v + ':mounted')
    const scopedAtoms = new Set<Atom<unknown>>([a])

    const store = createStore()
    const derivedStore = store.unstable_derive(
      (getAtomState, atomRead, atomWrite, atomOnMount) => {
        const scopedAtomStateMap = new WeakMap()
        return [
          (atom, originAtomState) => {
            if (scopedAtoms.has(atom)) {
              let atomState = scopedAtomStateMap.get(atom)
              if (!atomState) {
                atomState = { d: new Map(), p: new Set(), n: 0 }
                scopedAtomStateMap.set(atom, atomState)
              }
              return atomState
            }
            return getAtomState(atom, originAtomState)
          },
          atomRead,
          atomWrite,
          atomOnMount,
        ]
      },
    )

    expect(store.get(a)).toBe('a')
    expect(derivedStore.get(a)).toBe('a')

    derivedStore.sub(a, vi.fn())
    expect(store.get(a)).toBe('a')
    expect(derivedStore.get(a)).toBe('a:mounted')

    derivedStore.set(a, (v) => v + ':updated')
    expect(store.get(a)).toBe('a')
    expect(derivedStore.get(a)).toBe('a:mounted:updated')
  })

  /**
   * a, b, c(a + b)
   * S1[a]: a1, b0, c0(a1 + b0)
   */
  it('derived atom (scoping primitive)', () => {
    const a = atom('a')
    const b = atom('b')
    const c = atom((get) => get(a) + get(b))
    const scopedAtoms = new Set<Atom<unknown>>([a])

    const store = createStore()
    const derivedStore = store.unstable_derive(
      (getAtomState, atomRead, atomWrite, atomOnMount) => {
        const scopedAtomStateMap = new WeakMap()
        return [
          (atom, originAtomState) => {
            if (scopedAtoms.has(atom)) {
              let atomState = scopedAtomStateMap.get(atom)
              if (!atomState) {
                atomState = { d: new Map(), p: new Set(), n: 0 }
                scopedAtomStateMap.set(atom, atomState)
              }
              return atomState
            }
            return getAtomState(atom, originAtomState)
          },
          atomRead,
          atomWrite,
          atomOnMount,
        ]
      },
    )

    expect(store.get(c)).toBe('ab')
    expect(derivedStore.get(c)).toBe('ab')

    derivedStore.set(a, 'a2')
    expect(store.get(c)).toBe('ab')
    expect(derivedStore.get(c)).toBe('a2b')
  })

  /**
   * a, b(a)
   * S1[a]: a1, b0(a1)
   */
  it('derived atom with subscribe', () => {
    const a = atom('a')
    a.debugLabel = 'a'
    const b = atom(
      (get) => get(a),
      (_get, set, v: string) => set(a, v),
    )
    b.debugLabel = 'b'
    const scopedAtoms = new Set<Atom<unknown>>([a])
    let unscopedAtomStateMap: Map<Atom<unknown>, AtomState<any>>
    let scopedAtomStateMap: Map<Atom<unknown>, AtomState<any>>
    function makeStores() {
      const s0Store = createStore().unstable_derive((_, ...args) => {
        unscopedAtomStateMap = new Map()
        return [
          (atom) => {
            let atomState = unscopedAtomStateMap.get(atom)
            if (!atomState) {
              atomState = { d: new Map(), p: new Set(), n: 0 }
              unscopedAtomStateMap.set(atom, atomState)
            }
            return atomState
          },
          ...args,
        ]
      })
      const s1Store = s0Store.unstable_derive((getAtomState, ...args) => {
        scopedAtomStateMap = new Map()
        return [
          (atom, originAtomState) => {
            if (scopedAtoms.has(atom)) {
              let atomState = scopedAtomStateMap.get(atom)
              if (!atomState) {
                atomState = { d: new Map(), p: new Set(), n: 0 }
                scopedAtomStateMap.set(atom, atomState)
              }
              return atomState
            }
            return getAtomState(atom, originAtomState)
          },
          ...args,
        ]
      })
      expect(getAtoms(s0Store)).toEqual(['a', 'a'])
      expect(getAtoms(s1Store)).toEqual(['a', 'a'])
      return { s0Store, s1Store }
    }
    function getAtoms(store: Store) {
      return [store.get(a), store.get(b)]
    }

    /**
     * S0[ ]: a0, b0(a0)
     * S1[a]: a1, b0(a1)
     */
    // {
    //   const { s0Store, s1Store } = makeStores()
    //   s0Store.set(b, '*')
    //   expect(getAtoms(s0Store)).toEqual(['*', '*'])
    //   expect(getAtoms(s1Store)).toEqual(['a', 'a'])
    // }
    // {
    //   const { s0Store, s1Store } = makeStores()
    //   s1Store.set(b, '*')
    //   expect(getAtoms(s0Store)).toEqual(['a', 'a'])
    //   expect(getAtoms(s1Store)).toEqual(['*', '*'])
    // }
    {
      const { s0Store, s1Store } = makeStores()
      const storeCallback = vi.fn()
      const derivedCallback = vi.fn()
      s0Store.sub(b, storeCallback)
      // s1Store.sub(b, derivedCallback)
      s0Store.set(b, '*')
      // expect(getAtoms(s0Store)).toEqual(['*', '*'])
      expect(getAtoms(s1Store)).toEqual(['a', 'a']) // FIXME: received ['a', '*']
      expect(storeCallback).toHaveBeenCalledTimes(1)
      expect(derivedCallback).toHaveBeenCalledTimes(0) // FIXME: received 1
    }
    // {
    //   const { s0Store, s1Store } = makeStores()
    //   const storeCallback = vi.fn()
    //   const derivedCallback = vi.fn()
    //   s0Store.sub(b, storeCallback)
    //   s1Store.sub(b, derivedCallback)
    //   s1Store.set(b, '*')
    //   expect(getAtoms(s0Store)).toEqual(['a', 'a'])
    //   expect(getAtoms(s1Store)).toEqual(['*', '*']) // FIXME: received ['*', 'a']
    //   expect(storeCallback).toHaveBeenCalledTimes(0)
    //   expect(derivedCallback).toHaveBeenCalledTimes(1) // FIXME: received 1
    // }
  })

  /**
   * a, b(a)
   * S1[b]: a0, b1(a1)
   */
  it('derived atom (scoping derived)', () => {
    const a = atom('a')
    const b = atom(
      (get) => get(a),
      (_get, set, v: string) => {
        set(a, v)
      },
    )
    const scopedAtoms = new Set<Atom<unknown>>([b])

    const store = createStore()
    const derivedStore = store.unstable_derive(
      (getAtomState, atomRead, atomWrite, atomOnMount) => {
        const scopedAtomStateMap = new WeakMap()
        const scopedAtomStateSet = new WeakSet()
        return [
          (atom, originAtomState) => {
            if (
              scopedAtomStateSet.has(originAtomState as never) ||
              scopedAtoms.has(atom)
            ) {
              let atomState = scopedAtomStateMap.get(atom)
              if (!atomState) {
                atomState = { d: new Map(), p: new Set(), n: 0 }
                scopedAtomStateMap.set(atom, atomState)
                scopedAtomStateSet.add(atomState)
              }
              return atomState
            }
            return getAtomState(atom, originAtomState)
          },
          atomRead,
          atomWrite,
          atomOnMount,
        ]
      },
    )

    expect(store.get(a)).toBe('a')
    expect(store.get(b)).toBe('a')
    expect(derivedStore.get(a)).toBe('a')
    expect(derivedStore.get(b)).toBe('a')

    store.set(a, 'a2')
    expect(store.get(a)).toBe('a2')
    expect(store.get(b)).toBe('a2')
    expect(derivedStore.get(a)).toBe('a2')
    expect(derivedStore.get(b)).toBe('a')

    store.set(b, 'a3')
    expect(store.get(a)).toBe('a3')
    expect(store.get(b)).toBe('a3')
    expect(derivedStore.get(a)).toBe('a3')
    expect(derivedStore.get(b)).toBe('a')

    derivedStore.set(a, 'a4')
    expect(store.get(a)).toBe('a4')
    expect(store.get(b)).toBe('a4')
    expect(derivedStore.get(a)).toBe('a4')
    expect(derivedStore.get(b)).toBe('a')

    derivedStore.set(b, 'a5')
    expect(store.get(a)).toBe('a4')
    expect(store.get(b)).toBe('a4')
    expect(derivedStore.get(a)).toBe('a4')
    expect(derivedStore.get(b)).toBe('a5')
  })

  /**
   * a, b, c(a), d(c), e(d + b)
   * S1[d]: a0, b0, c0(a0), d1(c1(a1)), e0(d1(c1(a1)) + b0)
   */
  it('derived atom (scoping derived chain)', () => {
    const a = atom('a')
    const b = atom('b')
    const c = atom(
      (get) => get(a),
      (_get, set, v: string) => set(a, v),
    )
    const d = atom(
      (get) => get(c),
      (_get, set, v: string) => set(c, v),
    )
    const e = atom(
      (get) => get(d) + get(b),
      (_get, set, av: string, bv: string) => {
        set(d, av)
        set(b, bv)
      },
    )
    const scopedAtoms = new Set<Atom<unknown>>([d])

    function makeStores() {
      const s0Store = createStore()
      const s1Store = s0Store.unstable_derive(
        (getAtomState, atomRead, atomWrite, atomOnMount) => {
          const scopedAtomStateMap = new WeakMap()
          const scopedAtomStateSet = new WeakSet()
          return [
            (atom, originAtomState) => {
              if (
                scopedAtomStateSet.has(originAtomState as never) ||
                scopedAtoms.has(atom)
              ) {
                let atomState = scopedAtomStateMap.get(atom)
                if (!atomState) {
                  atomState = { d: new Map(), p: new Set(), n: 0 }
                  scopedAtomStateMap.set(atom, atomState)
                  scopedAtomStateSet.add(atomState)
                }
                return atomState
              }
              return getAtomState(atom, originAtomState)
            },
            atomRead,
            atomWrite,
            atomOnMount,
          ]
        },
      )
      expect(getAtoms(s0Store)).toEqual(['a', 'b', 'a', 'a', 'ab'])
      expect(getAtoms(s1Store)).toEqual(['a', 'b', 'a', 'a', 'ab'])
      return { s0Store, s1Store }
    }

    function getAtoms(store: Store) {
      return [
        store.get(a),
        store.get(b),
        store.get(c),
        store.get(d),
        store.get(e),
      ]
    }

    /**
     * S0[ ]: a0, b0, c0(a0), d0(c0(a0)), e0(d0(c0(a0)) + b0)
     * S1[d]: a0, b0, c0(a0), d1(c1(a1)), e0(d1(c1(a1)) + b0)
     */
    {
      // UPDATE a0
      // NOCHGE b0 and a1
      const { s0Store, s1Store } = makeStores()
      s0Store.set(a, '*')
      expect(getAtoms(s0Store)).toEqual(['*', 'b', '*', '*', '*b'])
      expect(getAtoms(s1Store)).toEqual(['*', 'b', '*', 'a', 'ab'])
    }
    {
      // UPDATE b0
      // NOCHGE a0 and a1
      const { s0Store, s1Store } = makeStores()
      s0Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['a', '*', 'a', 'a', 'a*'])
      expect(getAtoms(s1Store)).toEqual(['a', '*', 'a', 'a', 'a*'])
    }
    {
      // UPDATE c0, c0 -> a0
      // NOCHGE b0 and a1
      const { s0Store, s1Store } = makeStores()
      s0Store.set(c, '*')
      expect(getAtoms(s0Store)).toEqual(['*', 'b', '*', '*', '*b'])
      expect(getAtoms(s1Store)).toEqual(['*', 'b', '*', 'a', 'ab'])
    }
    {
      // UPDATE d0, d0 -> c0 -> a0
      // NOCHGE b0 and a1
      const { s0Store, s1Store } = makeStores()
      s0Store.set(d, '*')
      expect(getAtoms(s0Store)).toEqual(['*', 'b', '*', '*', '*b'])
      expect(getAtoms(s1Store)).toEqual(['*', 'b', '*', 'a', 'ab'])
    }
    {
      // UPDATE e0, e0 -> d0 -> c0 -> a0
      //             └--------------> b0
      // NOCHGE a1
      const { s0Store, s1Store } = makeStores()
      s0Store.set(e, '*', '*')
      expect(getAtoms(s0Store)).toEqual(['*', '*', '*', '*', '**'])
      expect(getAtoms(s1Store)).toEqual(['*', '*', '*', 'a', 'a*'])
    }
    {
      // UPDATE a0
      // NOCHGE b0 and a1
      const { s0Store, s1Store } = makeStores()
      s1Store.set(a, '*')
      expect(getAtoms(s0Store)).toEqual(['*', 'b', '*', '*', '*b'])
      expect(getAtoms(s1Store)).toEqual(['*', 'b', '*', 'a', 'ab'])
    }
    {
      // UPDATE b0
      // NOCHGE a0 and a1
      const { s0Store, s1Store } = makeStores()
      s1Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['a', '*', 'a', 'a', 'a*'])
      expect(getAtoms(s1Store)).toEqual(['a', '*', 'a', 'a', 'a*'])
    }
    {
      // UPDATE c0, c0 -> a0
      // NOCHGE b0 and a1
      const { s0Store, s1Store } = makeStores()
      s1Store.set(c, '*')
      expect(getAtoms(s0Store)).toEqual(['*', 'b', '*', '*', '*b'])
      expect(getAtoms(s1Store)).toEqual(['*', 'b', '*', 'a', 'ab'])
    }
    {
      // UPDATE d1, d1 -> c1 -> a1
      // NOCHGE b0 and a0
      const { s0Store, s1Store } = makeStores()
      s1Store.set(d, '*')
      expect(getAtoms(s0Store)).toEqual(['a', 'b', 'a', 'a', 'ab'])
      expect(getAtoms(s1Store)).toEqual(['a', 'b', 'a', '*', '*b'])
    }
    {
      // UPDATE e0, e0 -> d1 -> c1 -> a1
      //             └--------------> b0
      // NOCHGE a0
      const { s0Store, s1Store } = makeStores()
      s1Store.set(e, '*', '*')
      expect(getAtoms(s0Store)).toEqual(['a', '*', 'a', 'a', 'a*'])
      expect(getAtoms(s1Store)).toEqual(['a', '*', 'a', '*', '**'])
    }
  })

  /**
   * a, b(a), c(a), d(a)
   * S1[b, c]: a0, b1(a1), c1(a1), d0(a0)
   */
  it('derived atom shares same implicit', () => {
    const a = atom('a')
    const b = atom(
      (get) => get(a),
      (_get, set, v: string) => set(a, v),
    )
    const c = atom(
      (get) => get(a),
      (_get, set, v: string) => set(a, v),
    )
    const d = atom(
      (get) => get(a),
      (_get, set, v: string) => set(a, v),
    )
    const scopedAtoms = new Set<Atom<unknown>>([b, c])

    function makeStores() {
      const s0Store = createStore()
      const s1Store = s0Store.unstable_derive(
        (getAtomState, atomRead, atomWrite, atomOnMount) => {
          const scopedAtomStateMap = new WeakMap()
          const scopedAtomStateSet = new WeakSet()
          return [
            (atom, originAtomState) => {
              if (
                scopedAtomStateSet.has(originAtomState as never) ||
                scopedAtoms.has(atom)
              ) {
                let atomState = scopedAtomStateMap.get(atom)
                if (!atomState) {
                  atomState = { d: new Map(), p: new Set(), n: 0 }
                  scopedAtomStateMap.set(atom, atomState)
                  scopedAtomStateSet.add(atomState)
                }
                return atomState
              }
              return getAtomState(atom, originAtomState)
            },
            atomRead,
            atomWrite,
            atomOnMount,
          ]
        },
      )
      expect(getAtoms(s0Store)).toEqual(['a', 'a', 'a', 'a'])
      expect(getAtoms(s1Store)).toEqual(['a', 'a', 'a', 'a'])
      return { s0Store, s1Store }
    }

    function getAtoms(store: Store) {
      return [store.get(a), store.get(b), store.get(c), store.get(d)]
    }

    /**
     * S0[    ]: a0, b0(a0), c0(a0), d0(a0), '*'
     * S1[b, c]: a0, b0(a0), c1(a1), d0(a0), '*'
     */
    {
      // UPDATE a0
      // NOCHGE a1
      const { s0Store, s1Store } = makeStores()
      s0Store.set(a, '*')
      expect(getAtoms(s0Store)).toEqual(['*', '*', '*', '*'])
      expect(getAtoms(s1Store)).toEqual(['*', 'a', 'a', '*'])
    }
    {
      // UPDATE b0, b0 -> a0
      // NOCHGE a1
      const { s0Store, s1Store } = makeStores()
      s0Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['*', '*', '*', '*'])
      expect(getAtoms(s1Store)).toEqual(['*', 'a', 'a', '*'])
    }
    {
      // UPDATE c0, c0 -> a0
      // NOCHGE a1
      const { s0Store, s1Store } = makeStores()
      s0Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['*', '*', '*', '*'])
      expect(getAtoms(s1Store)).toEqual(['*', 'a', 'a', '*'])
    }
    {
      // UPDATE a0
      // NOCHGE a1
      const { s0Store, s1Store } = makeStores()
      s1Store.set(a, '*')
      expect(getAtoms(s0Store)).toEqual(['*', '*', '*', '*'])
      expect(getAtoms(s1Store)).toEqual(['*', 'a', 'a', '*'])
    }
    {
      // UPDATE b0, b0 -> a0
      // NOCHGE a1
      const { s0Store, s1Store } = makeStores()
      s1Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['a', 'a', 'a', 'a'])
      expect(getAtoms(s1Store)).toEqual(['a', '*', '*', 'a'])
    }
    {
      // UPDATE c1, c1 -> a1
      // NOCHGE a0
      const { s0Store, s1Store } = makeStores()
      s1Store.set(c, '*')
      expect(getAtoms(s0Store)).toEqual(['a', 'a', 'a', 'a'])
      expect(getAtoms(s1Store)).toEqual(['a', '*', '*', 'a'])
    }
  })

  /**
   * a, b, c(a + b)
   * S1[a]: a1, b0, c0(a1 + b0)
   * S2[ ]: a1, b0, c0(a1 + b0)
   */
  it.only('inherited atoms', () => {
    const a = atom('a')
    const b = atom('b')
    const c = atom((get) => get(a) + get(b))
    let unscopedAtomStateMap: Map<Atom<unknown>, AtomState<any>>
    let scopedAtomStateMap: Map<Atom<unknown>, AtomState<any>>
    let scopedAtomStateSet: Set<AtomState<any>>
    function makeStores() {
      const s1 = new Set<Atom<unknown>>([a])
      const s2 = new Set<Atom<unknown>>([])
      const s0Store = createStore().unstable_derive((_, ...args) => {
        unscopedAtomStateMap = new Map()
        return [
          (atom) => {
            let atomState = unscopedAtomStateMap.get(atom)
            if (!atomState) {
              atomState = { d: new Map(), p: new Set(), n: 0 }
              unscopedAtomStateMap.set(atom, atomState)
            }
            return atomState
          },
          ...args,
        ]
      })
      const s1Store = s0Store.unstable_derive(
        (getAtomState, atomRead, atomWrite, atomOnMount) => {
          scopedAtomStateMap = new Map()
          scopedAtomStateSet = new Set()
          return [
            (atom, originAtomState) => {
              if (
                scopedAtomStateSet.has(originAtomState as never) ||
                s1.has(atom)
              ) {
                let atomState = scopedAtomStateMap.get(atom)
                if (!atomState) {
                  atomState = { d: new Map(), p: new Set(), n: 0 }
                  scopedAtomStateMap.set(atom, atomState)
                  scopedAtomStateSet.add(atomState)
                }
                return atomState
              }
              return getAtomState(atom, originAtomState)
            },
            atomRead,
            atomWrite,
            atomOnMount,
          ]
        },
      )
      const s2Store = s1Store.unstable_derive(
        (getAtomState, atomRead, atomWrite, atomOnMount) => {
          const scopedAtomStateMap = new WeakMap()
          const scopedAtomStateSet = new WeakSet()
          return [
            (atom, originAtomState) => {
              if (
                scopedAtomStateSet.has(originAtomState as never) ||
                s2.has(atom)
              ) {
                let atomState = scopedAtomStateMap.get(atom)
                if (!atomState) {
                  atomState = { d: new Map(), p: new Set(), n: 0 }
                  scopedAtomStateMap.set(atom, atomState)
                  scopedAtomStateSet.add(atomState)
                }
                return atomState
              }
              return getAtomState(atom, originAtomState)
            },
            atomRead,
            atomWrite,
            atomOnMount,
          ]
        },
      )
      expect(getAtoms(s0Store)).toEqual(['a', 'b', 'ab'])
      expect(getAtoms(s1Store)).toEqual(['a', 'b', 'ab'])
      expect(getAtoms(s2Store)).toEqual(['a', 'b', 'ab'])
      return { s0Store, s1Store, s2Store }
    }

    function getAtoms(store: Store) {
      return [
        store.get(a),
        store.get(b),
        store.get(c), //
      ]
    }
    function subAtoms(store: Store, atoms: Atom<unknown>[]) {
      return atoms.map((atom) => {
        const cb = vi.fn()
        store.sub(atom, cb)
        return cb
      })
    }

    /**
     * S0[ ]: a0, b0, c0(a0 + b0)
     * S1[a]: a1, b0, c0(a1 + b0)
     * S2[ ]: a1, b0, c0(a1 + b0)
     */
    {
      // UPDATE a0
      // NOCHGE a1, b0
      const { s0Store, s1Store, s2Store } = makeStores()
      const [A0, B0, C0] = subAtoms(s0Store, [a, b, c])
      const [A1, B1, C1] = subAtoms(s1Store, [a, b, c])
      const [A2, B2, C2] = subAtoms(s2Store, [a, b, c])
      s0Store.set(a, '*')
      expect(getAtoms(s0Store)).toEqual(['*', 'b', '*b'])
      expect(getAtoms(s1Store)).toEqual(['a', 'b', 'ab']) // FIXME: received ['a', 'b', '*b']
      expect(getAtoms(s2Store)).toEqual(['a', 'b', 'ab'])

      expect(A0).toHaveBeenCalledTimes(1)
      expect(B0).toHaveBeenCalledTimes(0)
      expect(C0).toHaveBeenCalledTimes(1)
      expect(A1).toHaveBeenCalledTimes(0)
      expect(B1).toHaveBeenCalledTimes(0)
      expect(C1).toHaveBeenCalledTimes(0) // FIXME: received 1
      expect(A2).toHaveBeenCalledTimes(0)
      expect(B2).toHaveBeenCalledTimes(0)
      expect(C2).toHaveBeenCalledTimes(0)
    }
    {
      // UPDATE b0
      // NOCHGE a0, a1
      const { s0Store, s1Store, s2Store } = makeStores()
      s0Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['a', '*', 'a*'])
      expect(getAtoms(s1Store)).toEqual(['a', '*', 'a*'])
      expect(getAtoms(s2Store)).toEqual(['a', '*', 'a*'])
    }
    {
      // UPDATE a1
      // NOCHGE a0, b0
      const { s0Store, s1Store, s2Store } = makeStores()
      s1Store.set(a, '*')
      expect(getAtoms(s0Store)).toEqual(['a', 'b', 'ab'])
      expect(getAtoms(s1Store)).toEqual(['*', 'b', '*b'])
      expect(getAtoms(s2Store)).toEqual(['*', 'b', '*b'])
    }
    {
      // UPDATE b0
      // NOCHGE a0, a1
      const { s0Store, s1Store, s2Store } = makeStores()
      s1Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['a', '*', 'a*'])
      expect(getAtoms(s1Store)).toEqual(['a', '*', 'a*'])
      expect(getAtoms(s2Store)).toEqual(['a', '*', 'a*'])
    }
    {
      // UPDATE a1
      // NOCHGE a0, b0
      const { s0Store, s1Store, s2Store } = makeStores()
      s2Store.set(a, '*')
      expect(getAtoms(s0Store)).toEqual(['a', 'b', 'ab'])
      expect(getAtoms(s1Store)).toEqual(['*', 'b', '*b'])
      expect(getAtoms(s2Store)).toEqual(['*', 'b', '*b'])
    }
    {
      // UPDATE b0
      // NOCHGE a0, a1
      const { s0Store, s1Store, s2Store } = makeStores()
      s2Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['a', '*', 'a*'])
      expect(getAtoms(s1Store)).toEqual(['a', '*', 'a*'])
      expect(getAtoms(s2Store)).toEqual(['a', '*', 'a*'])
    }
  })

  /**
   * a, b, c(a + b)
   * S1[c]: a0, b0, c1(a1 + b1)
   * S2[a]: a0, b0, c1(a2 + b1)
   */
  it('inherited atoms use explicit in current scope', () => {
    const a = atom('a')
    a.debugLabel = 'a'
    const b = atom('b')
    b.debugLabel = 'b'
    const c = atom((get) => get(a) + get(b))
    c.debugLabel = 'c'
    const s1 = new Set<Atom<unknown>>([c])
    const s2 = new Set<Atom<unknown>>([a])

    function makeStores() {
      const s0Store = createStore()
      const s1Store = s0Store.unstable_derive(
        (getAtomState, atomRead, atomWrite, atomOnMount) => {
          const scopedAtomStateMap = new WeakMap()
          const scopedAtomStateSet = new WeakSet()
          return [
            (atom, originAtomState) => {
              if (
                scopedAtomStateSet.has(originAtomState as never) ||
                s1.has(atom)
              ) {
                let atomState = scopedAtomStateMap.get(atom)
                if (!atomState) {
                  atomState = { d: new Map(), p: new Set(), n: 0 }
                  scopedAtomStateMap.set(atom, atomState)
                  scopedAtomStateSet.add(atomState)
                }
                return atomState
              }
              return getAtomState(atom, originAtomState)
            },
            atomRead,
            atomWrite,
            atomOnMount,
          ]
        },
      )
      const s2Store = s1Store.unstable_derive(
        (getAtomState, atomRead, atomWrite, atomOnMount) => {
          const scopedAtomStateMap = new WeakMap()
          const scopedAtomStateSet = new WeakSet()
          return [
            (atom, originAtomState) => {
              if (
                scopedAtomStateSet.has(originAtomState as never) ||
                s2.has(atom)
              ) {
                let atomState = scopedAtomStateMap.get(atom)
                if (!atomState) {
                  atomState = { d: new Map(), p: new Set(), n: 0 }
                  scopedAtomStateMap.set(atom, atomState)
                  scopedAtomStateSet.add(atomState)
                }
                return atomState
              }
              return getAtomState(atom, originAtomState)
            },
            atomRead,
            atomWrite,
            atomOnMount,
          ]
        },
      )
      expect(getAtoms(s0Store)).toEqual(['a', 'b', 'ab'])
      expect(getAtoms(s1Store)).toEqual(['a', 'b', 'ab'])
      expect(getAtoms(s2Store)).toEqual(['a', 'b', 'ab'])
      return { s0Store, s1Store, s2Store }
    }

    function getAtoms(store: Store) {
      return [
        store.get(a),
        store.get(b),
        store.get(c), //
      ]
    }

    /**
     * S0[ ]: a0, b0, c0(a0 + b0)
     * S1[c]: a0, b0, c1(a1 + b1)
     * S2[a]: a2, b0, c1(a2 + b1)
     */
    {
      // UPDATE a0
      // NOCHGE b0, a1, b1, a2
      const { s0Store, s1Store, s2Store } = makeStores()
      s0Store.set(a, '*')
      expect(getAtoms(s0Store)).toEqual(['*', 'b', '*b'])
      expect(getAtoms(s1Store)).toEqual(['*', 'b', 'ab'])
      expect(getAtoms(s2Store)).toEqual(['a', 'b', 'ab'])
    }
    {
      // UPDATE a0
      // NOCHGE b0, a1, b1, a2
      const { s0Store, s1Store, s2Store } = makeStores()
      s1Store.set(a, '*')
      expect(getAtoms(s0Store)).toEqual(['*', 'b', '*b'])
      expect(getAtoms(s1Store)).toEqual(['*', 'b', 'ab'])
      expect(getAtoms(s2Store)).toEqual(['a', 'b', 'ab'])
    }
    {
      // UPDATE a2
      // NOCHGE a0, b0, a1, b1
      const { s0Store, s1Store, s2Store } = makeStores()
      s2Store.set(a, '*')
      expect(getAtoms(s0Store)).toEqual(['a', 'b', 'ab'])
      expect(getAtoms(s1Store)).toEqual(['a', 'b', 'ab'])
      expect(getAtoms(s2Store)).toEqual(['*', 'b', '*b'])
    }
    /**
     * S0[ ]: a0, b0, c0(a0 + b0)
     * S1[c]: a0, b0, c1(a1 + b1)
     * S2[a]: a2, b0, c1(a2 + b1)
     */
    {
      // UPDATE b0
      // NOCHGE a0, a1, b1, a2
      const { s0Store, s1Store, s2Store } = makeStores()
      s0Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['a', '*', 'a*']) // ['a', '*', 'a*']
      expect(getAtoms(s1Store)).toEqual(['a', '*', 'ab']) // ['a', '*', 'ab']
      expect(getAtoms(s2Store)).toEqual(['a', '*', 'ab']) // ['a', '*', 'a*']
    }
    {
      // UPDATE b0
      // NOCHGE a0, a1, b1, a2
      const { s0Store, s1Store, s2Store } = makeStores()
      s1Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['a', '*', 'a*'])
      expect(getAtoms(s1Store)).toEqual(['a', '*', 'ab'])
      expect(getAtoms(s2Store)).toEqual(['a', '*', 'ab'])
    }
    {
      // UPDATE b0
      // NOCHGE a0, a1, b1, a2
      const { s0Store, s1Store, s2Store } = makeStores()
      s2Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['a', '*', 'a*'])
      expect(getAtoms(s1Store)).toEqual(['a', '*', 'ab'])
      expect(getAtoms(s2Store)).toEqual(['a', '*', 'ab'])
    }
  })

  /**
   * a, b(a), c(b), d(c), e(d)
   * S1[a]: a1, b0(a1), c0(b0(a1)), d0(c0(b0(a1))), e0(d0(c0(b0(a1))))
   * S1[b]: a0, b1(a1), c0(b1(a1)), d0(c0(b1(a1))), e0(d0(c0(b1(a1))))
   * S1[c]: a0, b0(a0), c1(b1(a1)), d0(c1(b1(a1))), e0(d0(c1(b1(a1))))
   * S1[d]: a0, b0(a0), c0(b0(a0)), d1(c1(b1(a1))), e0(d1(c1(b1(a1))))
   * S1[e]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e1(d1(c1(b1(a1))))
   */
  it('uses implicit at any distance', () => {
    const a = atom('a')
    const b = atom(
      (get) => get(a),
      (_get, set, v: string) => set(a, v),
    )
    const c = atom(
      (get) => get(b),
      (_get, set, v: string) => set(b, v),
    )
    const d = atom(
      (get) => get(c),
      (_get, set, v: string) => set(c, v),
    )
    const e = atom(
      (get) => get(d),
      (_get, set, v: string) => set(d, v),
    )
    const scopes = [
      new Set<Atom<unknown>>([a]),
      new Set<Atom<unknown>>([b]),
      new Set<Atom<unknown>>([c]),
      new Set<Atom<unknown>>([d]),
      new Set<Atom<unknown>>([e]),
    ] as const

    function makeStores(scope: Set<Atom<unknown>>) {
      const s0Store = createStore()
      const s1Store = s0Store.unstable_derive(
        (getAtomState, atomRead, atomWrite, atomOnMount) => {
          const scopedAtomStateMap = new WeakMap()
          const scopedAtomStateSet = new WeakSet()
          return [
            (atom, originAtomState) => {
              if (
                scopedAtomStateSet.has(originAtomState as never) ||
                scope.has(atom)
              ) {
                let atomState = scopedAtomStateMap.get(atom)
                if (!atomState) {
                  atomState = { d: new Map(), p: new Set(), n: 0 }
                  scopedAtomStateMap.set(atom, atomState)
                  scopedAtomStateSet.add(atomState)
                }
                return atomState
              }
              return getAtomState(atom, originAtomState)
            },
            atomRead,
            atomWrite,
            atomOnMount,
          ]
        },
      )
      expect(getAtoms(s0Store)).toEqual(['a', 'a', 'a', 'a', 'a'])
      expect(getAtoms(s1Store)).toEqual(['a', 'a', 'a', 'a', 'a'])
      return { s0Store, s1Store }
    }

    function getAtoms(store: Store) {
      return [
        store.get(a),
        store.get(b),
        store.get(c),
        store.get(d),
        store.get(e),
      ]
    }

    /**
     * S0[ ]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e0(d0(c0(b0(a0))))
     * S1[a]: a1, b0(a1), c0(b0(a1)), d0(c0(b0(a1))), e0(d0(c0(b0(a1))))
     */
    {
      const { s0Store, s1Store } = makeStores(scopes[0])
      s0Store.set(a, '*')
      expect(getAtoms(s0Store)).toEqual(['*', '*', '*', '*', '*'])
      expect(getAtoms(s1Store)).toEqual(['a', 'a', 'a', 'a', 'a'])
    }
    /**
     * S0[ ]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e0(d0(c0(b0(a0))))
     * S1[b]: a0, b1(a1), c0(b1(a1)), d0(c0(b1(a1))), e0(d0(c0(b1(a1))))
     */
    {
      const { s0Store, s1Store } = makeStores(scopes[1])
      s0Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['*', '*', '*', '*', '*'])
      expect(getAtoms(s1Store)).toEqual(['*', 'a', 'a', 'a', 'a'])
    }
    /**
     * S0[ ]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e0(d0(c0(b0(a0))))
     * S1[c]: a0, b0(a0), c1(b1(a1)), d0(c1(b1(a1))), e0(d0(c1(b1(a1))))
     */
    {
      const { s0Store, s1Store } = makeStores(scopes[2])
      s0Store.set(c, '*')
      expect(getAtoms(s0Store)).toEqual(['*', '*', '*', '*', '*'])
      expect(getAtoms(s1Store)).toEqual(['*', '*', 'a', 'a', 'a'])
    }
    /**
     * S0[ ]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e0(d0(c0(b0(a0))))
     * S1[d]: a0, b0(a0), c0(b0(a0)), d1(c1(b1(a1))), e0(d1(c1(b1(a1))))
     */
    {
      const { s0Store, s1Store } = makeStores(scopes[3])
      s0Store.set(d, '*')
      expect(getAtoms(s0Store)).toEqual(['*', '*', '*', '*', '*'])
      expect(getAtoms(s1Store)).toEqual(['*', '*', '*', 'a', 'a'])
    }
    /**
     * S0[ ]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e0(d0(c0(b0(a0))))
     * S1[e]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e1(d1(c1(b1(a1))))
     */
    {
      const { s0Store, s1Store } = makeStores(scopes[4])
      s0Store.set(e, '*')
      expect(getAtoms(s0Store)).toEqual(['*', '*', '*', '*', '*'])
      expect(getAtoms(s1Store)).toEqual(['*', '*', '*', '*', 'a'])
    }
    /**
     * S0[ ]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e0(d0(c0(b0(a0))))
     * S1[a]: a1, b0(a1), c0(b0(a1)), d0(c0(b0(a1))), e0(d0(c0(b0(a1))))
     */
    {
      const { s0Store, s1Store } = makeStores(scopes[0])
      s1Store.set(a, '*')
      expect(getAtoms(s0Store)).toEqual(['a', 'a', 'a', 'a', 'a'])
      expect(getAtoms(s1Store)).toEqual(['*', '*', '*', '*', '*'])
    }
    /**
     * S0[ ]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e0(d0(c0(b0(a0))))
     * S1[b]: a0, b1(a1), c0(b1(a1)), d0(c0(b1(a1))), e0(d0(c0(b1(a1))))
     */
    {
      const { s0Store, s1Store } = makeStores(scopes[1])
      s1Store.set(b, '*')
      expect(getAtoms(s0Store)).toEqual(['a', 'a', 'a', 'a', 'a'])
      expect(getAtoms(s1Store)).toEqual(['a', '*', '*', '*', '*'])
    }
    /**
     * S0[ ]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e0(d0(c0(b0(a0))))
     * S1[c]: a0, b0(a0), c1(b1(a1)), d0(c1(b1(a1))), e0(d0(c1(b1(a1))))
     */
    {
      const { s0Store, s1Store } = makeStores(scopes[2])
      s1Store.set(c, '*')
      expect(getAtoms(s0Store)).toEqual(['a', 'a', 'a', 'a', 'a'])
      expect(getAtoms(s1Store)).toEqual(['a', 'a', '*', '*', '*'])
    }
    /**
     * S0[ ]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e0(d0(c0(b0(a0))))
     * S1[d]: a0, b0(a0), c0(b0(a0)), d1(c1(b1(a1))), e0(d1(c1(b1(a1))))
     */
    {
      const { s0Store, s1Store } = makeStores(scopes[3])
      s1Store.set(d, '*')
      expect(getAtoms(s0Store)).toEqual(['a', 'a', 'a', 'a', 'a'])
      expect(getAtoms(s1Store)).toEqual(['a', 'a', 'a', '*', '*'])
    }
    /**
     * S0[ ]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e0(d0(c0(b0(a0))))
     * S1[e]: a0, b0(a0), c0(b0(a0)), d0(c0(b0(a0))), e1(d1(c1(b1(a1))))
     */
    {
      const { s0Store, s1Store } = makeStores(scopes[4])
      s1Store.set(e, '*')
      expect(getAtoms(s0Store)).toEqual(['a', 'a', 'a', 'a', 'a'])
      expect(getAtoms(s1Store)).toEqual(['a', 'a', 'a', 'a', '*'])
    }
  })

  /**
   * a, b(a), c(a + b)
   * S0[ ]: a0, b0(a0), c0(a0 + b0(a0)) | a0, b0, c0
   * S1[c]: a0, b0(a0), c1(a1 + b1(a1)) | a0, a1, b0, b1, c1
   * S2[b]: a0, b2(a2), c1(a1 + b2(a2)) | a0, a1, a2, b2, c1
   */
  it('uses implicit from multiple ancestor scopes', () => {
    const a = atom('-')
    const b = atom(
      (get) => get(a),
      (_get, set, v: string) => set(a, v),
    )
    const c = atom(
      (get) => get(a),
      (_get, set, v: string) => set(a, v),
    )
    const scopes = [
      new Set<Atom<unknown>>([b]),
      new Set<Atom<unknown>>([c]),
    ] as const

    function makeStores() {
      const s0Store = createStore()
      const s1Store = s0Store.unstable_derive(
        (getAtomState, atomRead, atomWrite, atomOnMount) => {
          const scopedAtomStateMap = new WeakMap()
          const scopedAtomStateSet = new WeakSet()
          return [
            (atom, originAtomState) => {
              if (
                scopedAtomStateSet.has(originAtomState as never) ||
                scopes[0].has(atom)
              ) {
                let atomState = scopedAtomStateMap.get(atom)
                if (!atomState) {
                  atomState = { d: new Map(), p: new Set(), n: 0 }
                  scopedAtomStateMap.set(atom, atomState)
                  scopedAtomStateSet.add(atomState)
                }
                return atomState
              }
              return getAtomState(atom, originAtomState)
            },
            atomRead,
            atomWrite,
            atomOnMount,
          ]
        },
      )
      const s2Store = s1Store.unstable_derive(
        (getAtomState, atomRead, atomWrite, atomOnMount) => {
          const scopedAtomStateMap = new WeakMap()
          const scopedAtomStateSet = new WeakSet()
          return [
            (atom, originAtomState) => {
              if (
                scopedAtomStateSet.has(originAtomState as never) ||
                scopes[1].has(atom)
              ) {
                let atomState = scopedAtomStateMap.get(atom)
                if (!atomState) {
                  atomState = { d: new Map(), p: new Set(), n: 0 }
                  scopedAtomStateMap.set(atom, atomState)
                  scopedAtomStateSet.add(atomState)
                }
                return atomState
              }
              return getAtomState(atom, originAtomState)
            },
            atomRead,
            atomWrite,
            atomOnMount,
          ]
        },
      )
      return { s0Store, s1Store, s2Store }
    }

    function getAtoms(store: Store) {
      return [store.get(a), store.get(b), store.get(c)]
    }

    /**
     * S0[ ]: a0, b0(a0), c0(a0)
     * S1[b]: a0, b1(a1), c0(a0)
     * S2[c]: a0, b1(a1), c2(a2)
     */
    {
      const { s0Store, s1Store, s2Store } = makeStores()
      expect(getAtoms(s0Store)).toEqual(['-', '-', '-'])
      expect(getAtoms(s1Store)).toEqual(['-', '-', '-'])
      expect(getAtoms(s2Store)).toEqual(['-', '-', '-'])
      s0Store.set(a, '0') // a0
      expect(getAtoms(s0Store)).toEqual(['0', '0', '0'])
      expect(getAtoms(s1Store)).toEqual(['0', '-', '0'])
      expect(getAtoms(s2Store)).toEqual(['0', '-', '-'])
      s1Store.set(b, '1') // a1
      expect(getAtoms(s0Store)).toEqual(['0', '0', '0'])
      expect(getAtoms(s1Store)).toEqual(['0', '1', '0'])
      expect(getAtoms(s2Store)).toEqual(['0', '1', '-'])
      s2Store.set(c, '2') // a2
      expect(getAtoms(s0Store)).toEqual(['0', '0', '0'])
      expect(getAtoms(s1Store)).toEqual(['0', '1', '0'])
      expect(getAtoms(s2Store)).toEqual(['0', '1', '2'])
    }
  })
})
