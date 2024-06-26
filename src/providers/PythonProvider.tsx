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
    const registerServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const url = new URL('../workers/service-worker', import.meta.url)
          const registration = await navigator.serviceWorker.register(url)
          if (registration.active) {
            console.debug('Service worker active')
            swRef.current = registration.active
          }

          registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing
            if (installingWorker) {
              console.debug('Installing new service worker')
              installingWorker.addEventListener('statechange', () => {
                if (installingWorker.state === 'installed') {
                  console.debug('New service worker installed')
                  swRef.current = installingWorker
                }
              })
            }
          })
        } catch (error) {
          console.error(`Registration failed with ${error}`)
        }

        const messageHandler = (event: MessageEvent) => {
          if (event.data.type === 'REACT_PY_AWAITING_INPUT') {
            setWorkerAwaitingInputIds((prev) => new Set(prev).add(event.data.id));
            setWorkerAwaitingInputPrompt((prev) => {
              const next = new Map(prev);
              next.set(event.data.id, event.data.prompt);
              return next;
            });
            setIsAwaitingInput(true);
          } else if (event.data.type === 'GET_INPUT') {
            const { id, prompt } = event.data;
            setWorkerAwaitingInputIds((prev) => new Set(prev).add(id));
            setWorkerAwaitingInputPrompt((prev) => {
              const next = new Map(prev);
              next.set(id, prompt);
              return next;
            });
            setIsAwaitingInput(true);
          }
        };

        navigator.serviceWorker.addEventListener('message', messageHandler);
        return () => {
          navigator.serviceWorker.removeEventListener('message', messageHandler);
        };
      } else {
        console.error('Service workers not supported')
      }
    }
    registerServiceWorker()
  }, [])

  const sendInput = useCallback((id: string, value: string): void => {
    if (!workerAwaitingInputIds.has(id)) {
      console.error('Worker not awaiting input')
      return
    }

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'REACT_PY_INPUT',
        id,
        value
      });
    } else {
      console.error('No active service worker');
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