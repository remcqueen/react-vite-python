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
    console.debug('Requesting input:', id, prompt)
    return new Promise((resolve) => {
      self.postMessage({ type: 'INPUT_REQUEST', id, prompt })
      self.addEventListener('message', function inputListener(event) {
        if (event.data.type === 'INPUT_RESPONSE' && event.data.id === id) {
          self.removeEventListener('message', inputListener)
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
      stdout
    })

    // Load required packages
    await self.pyodide.loadPackage(['pyodide-http', 'micropip'])

    // Initialize pyodide-http
    await self.pyodide.runPythonAsync(`
    import pyodide_http
    pyodide_http.patch_all()
  `)

    // Initialize micropip
    const micropip = self.pyodide.pyimport('micropip')

    // Load official packages
    if (packages[0].length > 0) {
      await self.pyodide.loadPackage(packages[0])
    }

    // Load micropip packages
    if (packages[1].length > 0) {
      await micropip.install(packages[1])
    }

    const id = self.crypto.randomUUID()
    const version = self.pyodide.version

    self.pyodide.registerJsModule('react_vite_python', reactPyModule)

    const patchInputCode = `
import sys, builtins
import react_vite_python
import asyncio

__prompt_str__ = ""

async def get_input(prompt=""):
    global __prompt_str__
    __prompt_str__ = prompt
    print(prompt, end="", flush=True)
    s = await react_vite_python.getInput("${id}", prompt)
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
      await self.pyodide.runPythonAsync(code)
      console.debug('Python code execution completed')
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
