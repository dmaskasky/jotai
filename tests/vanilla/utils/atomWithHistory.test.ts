import { createStore, atom, PrimitiveAtom, Atom } from 'jotai'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  atomWithHistory,
  atomWithUndo,
} from '../../../src/vanilla/utils/atomWithHistory'

describe('atomWithHistory', () => {
  let store: ReturnType<typeof createStore>
  let baseAtom: PrimitiveAtom<number>
  let historyAtom: Atom<number[]>
  let unsub: () => void

  beforeEach(() => {
    store = createStore()
    baseAtom = atom(0) // Initial value is 0
    historyAtom = atomWithHistory(baseAtom, 3) // Limit history to 3 entries
    unsub = store.sub(historyAtom, () => {}) // Subscribe to trigger onMount
  })

  it('tracks history of changes', () => {
    store.set(baseAtom, 1)
    store.set(baseAtom, 2)
    expect(store.get(historyAtom)).toEqual([2, 1, 0]) // History should track changes
  })

  it('enforces history limit', () => {
    store.set(baseAtom, 1)
    store.set(baseAtom, 2)
    store.set(baseAtom, 3)
    store.set(baseAtom, 4)
    expect(store.get(historyAtom).length).toBe(3) // Length should not exceed limit
    expect(store.get(historyAtom)).toEqual([4, 3, 2]) // Only the most recent 3 states are kept
  })

  it('cleans up history on unmount', () => {
    store.set(baseAtom, 1)
    expect(store.get(historyAtom)).toEqual([1, 0]) // History before unmount
    unsub() // Unsubscribe to unmount
    unsub = store.sub(historyAtom, () => {}) // Subscribe to mount
    expect(store.get(historyAtom)).toEqual([]) // History should be cleared
  })
})

describe('atomWithUndo', () => {
  let store: ReturnType<typeof createStore>
  let baseAtom: PrimitiveAtom<number>
  let undoableAtom: ReturnType<typeof atomWithUndo<number>>
  let unsub: () => void

  beforeEach(() => {
    store = createStore()
    baseAtom = atom(0)
    undoableAtom = atomWithUndo(baseAtom, 3) // Limit history to 3 entries
    unsub = store.sub(undoableAtom, () => {}) // Subscribe to trigger onMount
  })

  it('supports undo operation', () => {
    store.set(baseAtom, 1)
    store.set(baseAtom, 2)
    store.get(undoableAtom).undo()
    expect(store.get(baseAtom)).toBe(1) // Should undo to the previous value
  })

  it('supports redo operation', () => {
    store.set(baseAtom, 1)
    store.set(baseAtom, 2)
    store.get(undoableAtom).undo()
    store.get(undoableAtom).redo()
    expect(store.get(baseAtom)).toBe(2) // Should redo to the value before undo
  })

  it('respects history limit', () => {
    // Limit is 3, so max undos is 2, and max redos is 2
    store.set(baseAtom, 1)
    store.set(baseAtom, 2)
    store.set(baseAtom, 3)
    store.set(baseAtom, 4)

    expect(store.get(undoableAtom).canUndo).toBe(true)
    expect(store.get(undoableAtom).canRedo).toBe(false)
    store.get(undoableAtom).undo()
    expect(store.get(undoableAtom).canUndo).toBe(true)
    store.get(undoableAtom).undo()

    expect(store.get(undoableAtom).canUndo).toBe(false) // Cannot undo beyond limit
    expect(store.get(undoableAtom).canRedo).toBe(true)
    store.get(undoableAtom).redo()
    expect(store.get(undoableAtom).canUndo).toBe(true)
    store.get(undoableAtom).redo()

    expect(store.get(undoableAtom).canUndo).toBe(true)
    expect(store.get(undoableAtom).canRedo).toBe(false) // Cannot redo beyond limit
  })

  it('checks undo and redo availability', () => {
    expect(store.get(undoableAtom).canUndo).toBe(false) // No undo initially
    expect(store.get(undoableAtom).canRedo).toBe(false) // No redo initially
    store.set(baseAtom, 1)
    expect(store.get(undoableAtom).canUndo).toBe(true) // Undo becomes available
    store.get(undoableAtom).undo()
    expect(store.get(undoableAtom).canRedo).toBe(true) // Redo becomes available after undo
  })

  it('cleans up history on unmount', () => {
    store.set(baseAtom, 1)
    expect(store.get(undoableAtom).canUndo).toBe(true) // Can undo before unmount
    unsub() // Unsubscribe to unmount
    unsub = store.sub(undoableAtom, () => {}) // Subscribe to mount
    expect(store.get(undoableAtom).canUndo).toBe(false) // Cannot undo after unmount
  })
})
