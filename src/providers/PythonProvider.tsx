import React, { createContext, useEffect, useState, useCallback } from 'react'
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

  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      console.log("Received message in PythonProvider:", event.data);
      if (event.data.type === 'REACT_PY_AWAITING_INPUT') {
        console.log("Setting isAwaitingInput to true");
        setIsAwaitingInput(true);
        setWorkerAwaitingInputIds((prev) => new Set(prev).add(event.data.id))
        setWorkerAwaitingInputPrompt((prev) => {
          const next = new Map(prev)
          next.set(event.data.id, event.data.prompt)
          return next
        })
      }
    };

    const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register(
        new URL('../workers/service-worker.ts', import.meta.url),
        { type: 'module' }
      );
      console.debug('ServiceWorker registration successful with scope: ', registration.scope);
      
      navigator.serviceWorker.addEventListener('message', messageHandler);
    } catch (error) {
      console.error('ServiceWorker registration failed: ', error);
    }
  } else {
    console.error('Service workers are not supported in this browser');
  }
};

    if (!lazy) {
      registerServiceWorker()
    }

    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('message', messageHandler);
      }
    }
  }, [lazy])

  const sendInput = useCallback((id: string, value: string): void => {
    console.debug('Sending input:', id, value);
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'REACT_PY_INPUT',
        id,
        value
      });
    } else {
      console.error('No active service worker');
    }
    setIsAwaitingInput(false);
  }, []);

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