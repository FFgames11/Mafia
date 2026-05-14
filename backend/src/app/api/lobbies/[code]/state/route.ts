import type { GameState } from '@/lib/game'
import { errorResponse, jsonResponse, optionsResponse } from '@/lib/http'
import { supabase } from '@/lib/supabase'

interface RouteContext {
  params: Promise<{ code: string }>
}

export function OPTIONS(request: Request) {
  return optionsResponse(request)
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { code } = await context.params
    const { gameState } = (await request.json()) as { gameState?: GameState }

    if (!gameState) {
      return jsonResponse(request, { error: 'Missing gameState.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('lobbies')
      .update({ game_state: gameState })
      .eq('code', code.toUpperCase())

    if (error) {
      throw error
    }

    return jsonResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error)
  }
}
