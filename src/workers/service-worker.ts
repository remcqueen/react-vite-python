// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

const REACT_PY_AWAITING_INPUT = 'REACT_PY_AWAITING_INPUT'
const REACT_PY_INPUT = 'REACT_PY_INPUT'

let pendingInputRequests = new Map()

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if (event.data.type === REACT_PY_INPUT) {
    const { id, value } = event.data
    const pendingRequest = pendingInputRequests.get(id)
    if (pendingRequest) {
      pendingRequest.resolve(new Response(value, { status: 200 }))
      pendingInputRequests.delete(id)
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
        pendingInputRequests.set(id, { resolve })

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
