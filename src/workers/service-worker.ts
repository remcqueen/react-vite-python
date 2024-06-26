// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

const REACT_PY_AWAITING_INPUT = 'REACT_PY_AWAITING_INPUT'
const REACT_PY_INPUT = 'REACT_PY_INPUT'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

const resolvers = new Map()

self.addEventListener('message', (event) => {
  if (event.data.type === REACT_PY_INPUT) {
    const resolver = resolvers.get(event.data.id)
    if (resolver) {
      resolver(new Response(event.data.value, { status: 200 }))
      resolvers.delete(event.data.id)
    } else {
      console.error('No resolver found for input:', event.data.id)
    }
  }
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (url.pathname === '/react-py-get-input/') {
    const id = url.searchParams.get('id')
    const prompt = url.searchParams.get('prompt')

    event.respondWith(
      new Promise((resolve) => {
        resolvers.set(id, resolve)

        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            if (client.type === 'window') {
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

self.addEventListener('error', (event) => {
  console.error('ServiceWorker error:', event.error)
})
