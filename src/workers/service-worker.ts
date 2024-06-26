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

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)

  if (url.pathname === '/react-vite-python-get-input/') {
    const id = url.searchParams.get('id')
    const prompt = url.searchParams.get('prompt')

    event.respondWith(
      new Promise((resolve) => {
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
    )
  }
})

self.addEventListener('error', (event: ErrorEvent) => {
  console.error('ServiceWorker error:', event.error)
})