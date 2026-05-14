import type { GameState } from '@/lib/game'
import { errorResponse, jsonResponse, optionsResponse } from '@/lib/http'
import { supabase } from '@/lib/supabase'

interface RouteContext {
  params: Promise<{ code: string }>
}

export function OPTIONS(request: Request) {
  return optionsResponse(request)
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { code } = await context.params
    const { clientId, gameState } = (await request.json()) as {
      clientId?: string
      gameState?: GameState
    }
    const lobbyCode = code.toUpperCase()

    if (!clientId || !gameState) {
      return jsonResponse(request, { error: 'Missing start payload.' }, { status: 400 })
    }

    const { data: lobby, error: lobbyError } = await supabase
      .from('lobbies')
      .select('host_client_id')
      .eq('code', lobbyCode)
      .maybeSingle()

    if (lobbyError) {
      throw lobbyError
    }

    if (!lobby || lobby.host_client_id !== clientId) {
      return jsonResponse(request, { error: 'Only the host can start the game.' }, { status: 403 })
    }

    const { error } = await supabase
      .from('lobbies')
      .update({ status: 'started', game_state: gameState })
      .eq('code', lobbyCode)

    if (error) {
      throw error
    }

    return jsonResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error)
  }
}
