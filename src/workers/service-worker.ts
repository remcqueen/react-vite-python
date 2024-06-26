// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const REACT_VITE_PYTHON_AWAITING_INPUT = 'REACT_VITE_PYTHON_AWAITING_INPUT'
const REACT_VITE_PYTHON_INPUT = 'REACT_VITE_PYTHON_INPUT'

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim())
})

const resolvers = new Map()

self.addEventListener('message', (event: MessageEvent) => {
  if (event.data.type === REACT_VITE_PYTHON_INPUT) {
    const resolver = resolvers.get(event.data.id)
    if (resolver) {
      resolver(new Response(event.data.value, { status: 200 }))
      resolvers.delete(event.data.id)
    } else {
      console.error('No resolver found for input:', event.data.id)
    }
  }
})

async function handleInputRequest(request: Request) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const prompt = url.searchParams.get('prompt')

  if (!id || !prompt) {
    return new Response('Invalid request', { status: 400 })
  }

  return new Promise((resolve) => {
    resolvers.set(id, resolve)

    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        if (client.type === 'window') {
          client.postMessage({
            type: REACT_VITE_PYTHON_AWAITING_INPUT,
            id,
            prompt
          })
        }
      })
    })
  })
}

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)

  if (url.pathname === '/react-vite-python-get-input/') {
    event.respondWith(handleInputRequest(event.request))
  }
})

self.addEventListener('error', (event: ErrorEvent) => {
  console.error('ServiceWorker error:', event.error)
})