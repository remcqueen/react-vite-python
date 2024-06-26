importScripts('https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js')

interface Pyodide {
  loadPackage: (packages: string[]) => Promise<void>
  pyimport: (pkg: string) => micropip
  runPythonAsync: (code: string, namespace?: any) => Promise<void>
  version: string
  FS: {
    readFile: (name: string, options: unknown) => void
    writeFile: (name: string, data: string, options: unknown) => void
    mkdir: (name: string) => void
    rmdir: (name: string) => void
  }
  globals: any
  isPyProxy: (value: unknown) => boolean
  registerJsModule: any
}

interface micropip {
  install: (packages: string[]) => Promise<void>
}

declare global {
  interface Window {
    loadPyodide: ({
      stdout
    }: {
      stdout?: (msg: string) => void
    }) => Promise<Pyodide>
    pyodide: Pyodide
  }
}

// Monkey patch console.log to prevent the script from outputting logs
if (self.location.hostname !== 'localhost') {
  console.log = () => {}
  console.error = () => {}
}

import { expose } from 'comlink'

const reactPyModule = {
  getInput: (id: string, prompt: string) => {
    return new Promise((resolve) => {
      self.postMessage({ type: 'REACT_PY_AWAITING_INPUT', id, prompt })
      self.addEventListener('message', function inputHandler(event) {
        if (event.data.type === 'REACT_PY_INPUT' && event.data.id === id) {
          self.removeEventListener('message', inputHandler)
          resolve(event.data.value)
        }
      })
    })
  }
}

const python = {
  async init(
    stdout: (msg: string) => void,
    onLoad: ({
      id,
      version,
      banner
    }: {
      id: string
      version: string
      banner?: string
    }) => void,
    packages: string[][]
  ) {
    self.pyodide = await self.loadPyodide({
      stdout: (msg: string) => {
        console.debug('Python stdout:', msg)
        stdout(msg) // This will update the output in the React component
      }
    })
    await self.pyodide.loadPackage(['pyodide-http'])

    // Load micropip separately
    await self.pyodide.loadPackage(['micropip'])

    if (packages[0].length > 0) {
      await self.pyodide.loadPackage(packages[0])
    }
    if (packages[1].length > 0) {
      const micropip = self.pyodide.pyimport('micropip')
      await micropip.install(packages[1])
    }

    const id = self.crypto.randomUUID()
    const version = self.pyodide.version

    self.pyodide.registerJsModule('react_py', reactPyModule)
    const initCode = `
import pyodide_http
pyodide_http.patch_all()
`
    await self.pyodide.runPythonAsync(initCode)
    const patchInputCode = `
import sys, builtins
import react_py
import asyncio

__prompt_str__ = ""

async def get_input(prompt=""):
    global __prompt_str__
    __prompt_str__ = prompt
    print(prompt, end="", flush=True)
    s = await react_py.getInput("${id}", prompt)
    print(s)
    return s

builtins.input = lambda prompt="": asyncio.get_event_loop().run_until_complete(get_input(prompt))
sys.stdin.readline = lambda: asyncio.get_event_loop().run_until_complete(get_input(__prompt_str__))
`
    await self.pyodide.runPythonAsync(patchInputCode)

    onLoad({ id, version })
  },
  async run(code: string) {
    console.debug('Running Python code:', code)
    try {
      const result = await self.pyodide.runPythonAsync(code)
      console.debug('Python code execution completed')
      return result
    } catch (error) {
      console.error('Error running Python code:', error)
      throw error
    }
  },
  readFile(name: string) {
    return self.pyodide.FS.readFile(name, { encoding: 'utf8' })
  },
  writeFile(name: string, data: string) {
    return self.pyodide.FS.writeFile(name, data, { encoding: 'utf8' })
  },
  mkdir(name: string) {
    self.pyodide.FS.mkdir(name)
  },
  rmdir(name: string) {
    self.pyodide.FS.rmdir(name)
  }
}

expose(python)
