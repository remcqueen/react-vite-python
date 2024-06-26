// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

addEventListener('install', () => {
  self.skipWaiting()
})

addEventListener('activate', () => {
  self.clients.claim()
})

const resolvers = new Map<string, Promise<any>[]>()

addEventListener('message', (event) => {
  if (event.data.type === 'REACT_PY_INPUT') {
    const resolverArray = resolvers.get(event.data.id)
    if (!resolverArray || resolverArray.length === 0) {
      console.error('Error handling input: No resolver')
      return
    }

    const resolver = resolverArray.shift()
    resolver(new Response(event.data.value, { status: 200 }))
  }
})

addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (url.pathname === '/react-py-get-input/') {
    const id = url.searchParams.get('id')
    const prompt = url.searchParams.get('prompt')

    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll()
        clients.forEach((client) => {
          if (client.type === 'window') {
            client.postMessage({
              type: 'REACT_PY_AWAITING_INPUT',
              id,
              prompt
            })
          }
        })
      })()
    )

    const promise = new Promise((r) =>
      resolvers.set(id, [...(resolvers.get(id) || []), r])
    )
    event.respondWith(promise)
  }
})

self.addEventListener('error', function (event) {
  console.error('ServiceWorker error:', event.error)
})
