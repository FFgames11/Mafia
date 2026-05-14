import { NextResponse } from 'next/server'

const allowedOrigins = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
])

export function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  const allowedOrigin = allowedOrigins.has(origin) ? origin : 'http://127.0.0.1:5173'

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export function jsonResponse(request: Request, body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...getCorsHeaders(request),
      ...init?.headers,
    },
  })
}

export function optionsResponse(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

export function errorResponse(request: Request, error: unknown, status = 500) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'Request failed.'

  return jsonResponse(request, { error: message }, { status })
}
