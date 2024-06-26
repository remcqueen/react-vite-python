import React, { createContext, useState } from 'react'
import { Packages } from '../types/Packages'

const PythonContext = createContext({
  packages: {} as Packages,
  timeout: 0,
  lazy: false,
  terminateOnCompletion: false,
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

  const contextValue = {
    packages,
    timeout,
    lazy,
    terminateOnCompletion,
  }

  return (
    <PythonContext.Provider value={contextValue}>
      {children}
    </PythonContext.Provider>
  )
}

export { PythonContext, PythonProvider }