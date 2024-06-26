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
    const request = new XMLHttpRequest()
    request.open(
      'GET',
      `/react-vite-python-get-input/?id=${id}&prompt=${prompt}`,
      false
    )
    request.send(null)
    console.debug('Received input response:', request.responseText)
    return request.responseText
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

    self.pyodide.registerJsModule('react_vite_python', reactPyModule)
    const initCode = `
import pyodide_http
pyodide_http.patch_all()
`
    await self.pyodide.runPythonAsync(initCode)
    const patchInputCode = `
import sys, builtins
import react_vite_python
__prompt_str__ = ""
def get_input(prompt=""):
    global __prompt_str__
    __prompt_str__ = prompt
    print(prompt, end="", flush=True)
    s = react_vite_python.getInput("${id}", prompt)
    print(s)
    return s
builtins.input = get_input
sys.stdin.readline = lambda: react_vite_python.getInput("${id}", __prompt_str__)
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
