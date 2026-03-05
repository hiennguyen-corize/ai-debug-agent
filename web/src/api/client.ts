import ky from 'ky'

export const api = ky.create({
  prefixUrl: '/api',
  hooks: {
    beforeRequest: [
      (request) => {
        const apiKey = localStorage.getItem('ai-debug-api-key')
        if (apiKey) {
          request.headers.set('X-API-Key', apiKey)
        }
      },
    ],
  },
})
