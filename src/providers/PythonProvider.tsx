import React, { createContext, useEffect, useRef, useState, useCallback } from 'react'
import { Packages } from '../types/Packages'

const PythonContext = createContext({
  packages: {} as Packages,
  timeout: 0,
  lazy: false,
  terminateOnCompletion: false,
  sendInput: (_id: string, _value: string) => {},
  workerAwaitingInputIds: [] as string[],
  getPrompt: (_id: string) => undefined as string | undefined,
  isAwaitingInput: false,
})

export const suppressedMessages = ['Python initialization complete']

interface PythonProviderProps {
  packages?: Packages
  timeout?: number
  lazy?: boolean
  terminateOnCompletion?: boolean
  children: React.ReactNode
}

function PythonProvider(props: PythonProviderProps) {
  const {
    packages = {},
    timeout = 0,
    lazy = false,
    terminateOnCompletion = false,
    children
  } = props

  const [workerAwaitingInputIds, setWorkerAwaitingInputIds] = useState<Set<string>>(new Set())
  const [workerAwaitingInputPrompt, setWorkerAwaitingInputPrompt] = useState<Map<string, string>>(new Map())
  const [isAwaitingInput, setIsAwaitingInput] = useState(false)

  const swRef = useRef<ServiceWorker>()

  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      if (event.data.type === 'REACT_VITE_PYTHON_AWAITING_INPUT') {
        console.debug('Received REACT_VITE_PYTHON_AWAITING_INPUT message:', event.data)
        setWorkerAwaitingInputIds((prev) => new Set(prev).add(event.data.id))
        setWorkerAwaitingInputPrompt((prev) => {
          const next = new Map(prev)
          next.set(event.data.id, event.data.prompt)
          return next
        })
        setIsAwaitingInput(true)
      }
    }

    const registerServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.register(
            '/react-vite-python-service-worker.js',
            { scope: '/' }
          )
          console.debug('ServiceWorker registration successful with scope: ', registration.scope)
          
          navigator.serviceWorker.addEventListener('message', messageHandler)
        } catch (error) {
          console.error('ServiceWorker registration failed: ', error)
        }
      }
    }

    registerServiceWorker()

    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('message', messageHandler)
      }
    }
  }, [])

  const sendInput = useCallback((id: string, value: string): void => {
    console.debug('Sending input:', id, value)
    if (!workerAwaitingInputIds.has(id)) {
      console.error('Worker not awaiting input')
      return
    }

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'REACT_VITE_PYTHON_INPUT',
        id,
        value
      })
    } else {
      console.error('No active service worker')
    }

    setWorkerAwaitingInputIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setWorkerAwaitingInputPrompt((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setIsAwaitingInput(false)
  }, [workerAwaitingInputIds])

  const contextValue = {
    packages,
    timeout,
    lazy,
    terminateOnCompletion,
    sendInput,
    workerAwaitingInputIds: Array.from(workerAwaitingInputIds),
    getPrompt: (id: string) => workerAwaitingInputPrompt.get(id),
    isAwaitingInput,
  }

  return (
    <PythonContext.Provider value={contextValue}>
      {children}
    </PythonContext.Provider>
  )
}

export { PythonContext, PythonProvider }