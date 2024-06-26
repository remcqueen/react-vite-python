import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { PythonContext, suppressedMessages } from '../providers/PythonProvider'
import { proxy, Remote, wrap } from 'comlink'
import useFilesystem from './useFilesystem'

import { Packages } from '../types/Packages'
import { PythonRunner } from '../types/Runner'

interface UsePythonProps {
  packages?: Packages
}

export default function usePython(props?: UsePythonProps) {
  const { packages = {} } = props ?? {}

  const [runnerId, setRunnerId] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState<string[]>([])
  const [stdout, setStdout] = useState('')
  const [stderr, setStderr] = useState('')
  const [pendingCode, setPendingCode] = useState<string | undefined>()
  const [hasRun, setHasRun] = useState(false)

  const {
    packages: globalPackages,
    timeout,
    lazy,
    terminateOnCompletion,
    sendInput,
    workerAwaitingInputIds,
    getPrompt,
    isAwaitingInput
  } = useContext(PythonContext)

  const workerRef = useRef<Worker>()
  const runnerRef = useRef<Remote<PythonRunner>>()

  const {
    readFile,
    writeFile,
    mkdir,
    rmdir,
    watchModules,
    unwatchModules,
    watchedModules
  } = useFilesystem({ runner: runnerRef?.current })

  const createWorker = useCallback(() => {
    const worker = new Worker(
      new URL('../workers/python-worker', import.meta.url)
    )
    workerRef.current = worker
    console.debug('Worker created')
  }, [])

  useEffect(() => {
    if (!lazy) {
      createWorker()
    }

    return () => {
      cleanup()
    }
  }, [lazy, createWorker])

  const allPackages = useMemo(() => {
    const official = [
      ...new Set([
        ...(globalPackages.official ?? []),
        ...(packages.official ?? [])
      ])
    ]
    const micropip = [
      ...new Set([
        ...(globalPackages.micropip ?? []),
        ...(packages.micropip ?? [])
      ])
    ]
    return [official, micropip]
  }, [globalPackages, packages])

  const isReady = !isLoading && !!runnerId

  useEffect(() => {
    if (workerRef.current && !isReady) {
      const init = async () => {
        try {
          setIsLoading(true)
          const runner: Remote<PythonRunner> = wrap(workerRef.current as Worker)
          runnerRef.current = runner

          await runner.init(
            proxy((msg: string) => {
              if (!suppressedMessages.includes(msg)) {
                setOutput((prev) => [...prev, msg])
              }
            }),
            proxy(({ id, version }) => {
              setRunnerId(id)
              console.debug('Loaded pyodide version:', version)
            }),
            allPackages
          )
        } catch (error) {
          console.error('Error loading Pyodide:', error)
        } finally {
          setIsLoading(false)
        }
      }
      init()
    }
  }, [workerRef.current, isReady, allPackages])

  useEffect(() => {
    if (output.length > 0) {
      setStdout(output.join('\n'))
    }
  }, [output])

  useEffect(() => {
    if (pendingCode && isReady) {
      const delayedRun = async () => {
        await runPython(pendingCode)
        setPendingCode(undefined)
      }
      delayedRun()
    }
  }, [pendingCode, isReady])

  useEffect(() => {
    if (terminateOnCompletion && hasRun && !isRunning) {
      cleanup()
      setIsRunning(false)
      setRunnerId(undefined)
    }
  }, [terminateOnCompletion, hasRun, isRunning])

  const pythonRunnerCode = `
import sys

sys.tracebacklimit = 0

def run(code, preamble=''):
    globals_ = {}
    try:
        exec(preamble, globals_)
        code = compile(code, 'code', 'exec')
        exec(code, globals_)
    except Exception:
        type_, value, tracebac = sys.exc_info()
        tracebac = tracebac.tb_next
        raise value.with_traceback(tracebac)
    finally:
        print()
`

  const moduleReloadCode = (modules: Set<string>) => `
import importlib
import sys
${Array.from(modules)
  .map(
    (name) => `
if """${name}""" in sys.modules:
    importlib.reload(sys.modules["""${name}"""])
`
  )
  .join('')}
del importlib
del sys
`
  const interruptExecution = useCallback(() => {
    cleanup()
    setIsRunning(false)
    setRunnerId(undefined)
    setOutput([])
    createWorker()
  }, [createWorker])

  const runPython = useCallback(
    async (code: string) => {
      setStdout('')
      setStderr('')

      if (lazy && !isReady) {
        createWorker()
        setPendingCode(code)
        return
      }

      if (!isReady) {
        throw new Error('Pyodide is not loaded yet')
      }
      let timeoutTimer
      try {
        setIsRunning(true)
        if (!isReady || !runnerRef.current) {
          throw new Error('Pyodide is not loaded yet')
        }
        if (timeout > 0) {
          timeoutTimer = setTimeout(() => {
            setStderr(`Execution timed out. Reached limit of ${timeout} ms.`)
            interruptExecution()
          }, timeout)
        }
        if (watchedModules.size > 0) {
          await runnerRef.current.run(moduleReloadCode(watchedModules))
        }
        await runnerRef.current.run(code)
        // The output will be captured by the stdout callback set during initialization
      } catch (error: any) {
        setStderr('Traceback (most recent call last):\n' + error.message)
      } finally {
        setIsRunning(false)
        clearTimeout(timeoutTimer)
      }
    },
    [lazy, isReady, timeout, watchedModules, createWorker, interruptExecution]
  )

  const cleanup = useCallback(() => {
    if (!workerRef.current) {
      return
    }
    console.debug('Terminating worker')
    workerRef.current.terminate()
  }, [])

  const sendUserInput = useCallback(
    (value: string) => {
      if (!runnerId) {
        console.error('No runner id')
        return
      }
      sendInput(runnerId, value)
    },
    [runnerId, sendInput]
  )

  return {
    runPython,
    stdout,
    stderr,
    isLoading,
    isReady,
    isRunning,
    interruptExecution,
    readFile,
    writeFile,
    mkdir,
    rmdir,
    watchModules,
    unwatchModules,
    isAwaitingInput,
    sendInput: sendUserInput,
    prompt: runnerId ? getPrompt(runnerId) : ''
  }
}
