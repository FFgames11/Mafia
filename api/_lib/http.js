const allowedOrigins = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://192.168.0.50:5173',
  'https://mafia-ived.vercel.app',
  ...getConfiguredOrigins(),
])

function getConfiguredOrigins() {
  return (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function setCorsHeaders(req, res) {
  const origin = req.headers.origin ?? ''

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
}

export function handleOptions(req, res) {
  setCorsHeaders(req, res)
  res.status(204).end()
}

export function sendJson(req, res, status, body) {
  setCorsHeaders(req, res)
  res.status(status).json(body)
}

export function sendError(req, res, error, status = 500) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : 'Request failed.'

  sendJson(req, res, status, { error: message })
}

export function getBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
}

export function methodNotAllowed(req, res) {
  sendJson(req, res, 405, { error: 'Method not allowed.' })
}
