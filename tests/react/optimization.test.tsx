import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { useAtom } from 'jotai/react'
import { atom } from 'jotai/vanilla'

it('only relevant render function called (#156)', async () => {
  const count1Atom = atom(0)
  const count2Atom = atom(0)

  let renderCount1 = 0
  let renderCount2 = 0

  const Counter1 = () => {
    const [count, setCount] = useAtom(count1Atom)
    ++renderCount1
    return (
      <>
        <div>count1: {count}</div>
        <button onClick={() => setCount((c) => c + 1)}>button1</button>
      </>
    )
  }

  const Counter2 = () => {
    const [count, setCount] = useAtom(count2Atom)
    ++renderCount2
    return (
      <>
        <div>count2: {count}</div>
        <button onClick={() => setCount((c) => c + 1)}>button2</button>
      </>
    )
  }

  render(
    <>
      <Counter1 />
      <Counter2 />
    </>,
  )

  await waitFor(() => {
    screen.getByText('count1: 0')
    screen.getByText('count2: 0')
  })
  const renderCount1AfterMount = renderCount1
  const renderCount2AfterMount = renderCount2

  await userEvent.click(screen.getByText('button1'))
  await waitFor(() => {
    screen.getByText('count1: 1')
    screen.getByText('count2: 0')
  })
  expect(renderCount1).toBe(renderCount1AfterMount + 1)
  expect(renderCount2).toBe(renderCount2AfterMount + 0)

  await userEvent.click(screen.getByText('button2'))
  await waitFor(() => {
    screen.getByText('count1: 1')
    screen.getByText('count2: 1')
  })
  expect(renderCount1).toBe(renderCount1AfterMount + 1)
  expect(renderCount2).toBe(renderCount2AfterMount + 1)
})

it('only render once using atoms with write-only atom', async () => {
  const count1Atom = atom(0)
  const count2Atom = atom(0)
  const incrementAtom = atom(null, (_get, set, _arg) => {
    set(count1Atom, (c) => c + 1)
    set(count2Atom, (c) => c + 1)
  })

  let renderCount = 0

  const Counter = () => {
    const [count1] = useAtom(count1Atom)
    const [count2] = useAtom(count2Atom)
    ++renderCount
    return (
      <div>
        count1: {count1}, count2: {count2}
      </div>
    )
  }

  const Control = () => {
    const [, increment] = useAtom(incrementAtom)
    return <button onClick={increment}>button</button>
  }

  render(
    <>
      <Counter />
      <Control />
    </>,
  )

  await screen.findByText('count1: 0, count2: 0')
  const renderCountAfterMount = renderCount

  await userEvent.click(screen.getByText('button'))
  await screen.findByText('count1: 1, count2: 1')
  expect(renderCount).toBe(renderCountAfterMount + 1)

  await userEvent.click(screen.getByText('button'))
  await screen.findByText('count1: 2, count2: 2')
  expect(renderCount).toBe(renderCountAfterMount + 2)
})

it('useless re-renders with static atoms (#355)', async () => {
  // check out https://codesandbox.io/s/m82r5 to see the expected re-renders
  const countAtom = atom(0)
  const unrelatedAtom = atom(0)

  let renderCount = 0

  const Counter = () => {
    const [count, setCount] = useAtom(countAtom)
    useAtom(unrelatedAtom)
    ++renderCount

    return (
      <>
        <div>count: {count}</div>
        <button onClick={() => setCount((c) => c + 1)}>button</button>
      </>
    )
  }

  render(
    <>
      <Counter />
    </>,
  )

  await screen.findByText('count: 0')
  const renderCountAfterMount = renderCount

  await userEvent.click(screen.getByText('button'))
  await screen.findByText('count: 1')
  expect(renderCount).toBe(renderCountAfterMount + 1)

  await userEvent.click(screen.getByText('button'))
  await screen.findByText('count: 2')
  expect(renderCount).toBe(renderCountAfterMount + 2)
})

it('does not re-render if value is the same (#1158)', async () => {
  const countAtom = atom(0)

  let renderCount = 0

  const Counter = () => {
    const [count, setCount] = useAtom(countAtom)
    ++renderCount
    return (
      <>
        <div>count: {count}</div>
        <button onClick={() => setCount((c) => c)}>noop</button>
        <button onClick={() => setCount((c) => c + 1)}>inc</button>
      </>
    )
  }

  render(
    <>
      <Counter />
    </>,
  )

  await screen.findByText('count: 0')
  const renderCountAfterMount = renderCount

  await userEvent.click(screen.getByText('noop'))
  await screen.findByText('count: 0')
  expect(renderCount).toBe(renderCountAfterMount + 0)

  await userEvent.click(screen.getByText('inc'))
  await screen.findByText('count: 1')
  expect(renderCount).toBe(renderCountAfterMount + 1)

  await userEvent.click(screen.getByText('noop'))
  await screen.findByText('count: 1')
  expect(renderCount).toBe(renderCountAfterMount + 1)

  await userEvent.click(screen.getByText('inc'))
  await screen.findByText('count: 2')
  expect(renderCount).toBe(renderCountAfterMount + 2)
})

it('no extra rerenders after commit with derived atoms (#1213)', async () => {
  const baseAtom = atom({ count1: 0, count2: 0 })
  const count1Atom = atom((get) => get(baseAtom).count1)
  const count2Atom = atom((get) => get(baseAtom).count2)

  let renderCount1 = 0
  let renderCount1AfterCommit = 0

  const Counter1 = () => {
    const [count1] = useAtom(count1Atom)
    ++renderCount1
    useEffect(() => {
      renderCount1AfterCommit = renderCount1
    })
    return <div>count1: {count1}</div>
  }

  let renderCount2 = 0
  let renderCount2AfterCommit = 0

  const Counter2 = () => {
    const [count2] = useAtom(count2Atom)
    ++renderCount2
    useEffect(() => {
      renderCount2AfterCommit = renderCount2
    })
    return <div>count2: {count2}</div>
  }

  const Control = () => {
    const [, setValue] = useAtom(baseAtom)
    const inc1 = () => {
      setValue((prev) => ({ ...prev, count1: prev.count1 + 1 }))
    }
    const inc2 = () => {
      setValue((prev) => ({ ...prev, count2: prev.count2 + 1 }))
    }
    return (
      <div>
        <button onClick={inc1}>inc1</button>
        <button onClick={inc2}>inc2</button>
      </div>
    )
  }

  render(
    <>
      <Counter1 />
      <Counter2 />
      <Control />
    </>,
  )

  await waitFor(() => {
    screen.getByText('count1: 0')
    screen.getByText('count2: 0')
  })
  expect(renderCount1 > 0).toBeTruthy()
  expect(renderCount2 > 0).toBeTruthy()

  await userEvent.click(screen.getByText('inc1'))
  await waitFor(() => {
    screen.getByText('count1: 1')
    screen.getByText('count2: 0')
  })
  expect(renderCount1).toBe(renderCount1AfterCommit)

  await userEvent.click(screen.getByText('inc2'))
  await waitFor(() => {
    screen.getByText('count1: 1')
    screen.getByText('count2: 1')
  })
  expect(renderCount2).toBe(renderCount2AfterCommit)

  await userEvent.click(screen.getByText('inc1'))
  await waitFor(() => {
    screen.getByText('count1: 2')
    screen.getByText('count2: 1')
  })
  expect(renderCount1).toBe(renderCount1AfterCommit)
})
