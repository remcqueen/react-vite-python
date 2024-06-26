// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const REACT_PY_AWAITING_INPUT = 'REACT_PY_AWAITING_INPUT'
const REACT_PY_INPUT = 'REACT_PY_INPUT'

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim())
})

const resolvers = new Map()

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)

  if (url.pathname === '/react-vite-python-get-input/') {
    console.log('Intercepting input request in service worker')
    const id = url.searchParams.get('id')
    const prompt = url.searchParams.get('prompt')

    event.respondWith(
      new Promise((resolve) => {
        resolvers.set(id, resolve)

        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            if (client.type === 'window') {
              console.log('Sending REACT_PY_AWAITING_INPUT message to client')
              client.postMessage({
                type: REACT_PY_AWAITING_INPUT,
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

self.addEventListener('message', (event: MessageEvent) => {
  console.log('Received message in service worker:', event.data)
  if (event.data.type === REACT_PY_INPUT) {
    const resolver = resolvers.get(event.data.id)
    if (resolver) {
      console.log('Resolving input request with:', event.data.value)
      resolver(new Response(event.data.value, { status: 200 }))
      resolvers.delete(event.data.id)
    } else {
      console.error('No resolver found for input:', event.data.id)
    }
  }
})

self.addEventListener('error', (event: ErrorEvent) => {
  console.error('ServiceWorker error:', event.error)
})
