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
    const { clientId, isReady } = (await request.json()) as {
      clientId?: string
      isReady?: boolean
    }

    if (!clientId || typeof isReady !== 'boolean') {
      return jsonResponse(request, { error: 'Missing ready payload.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('lobby_players')
      .update({ is_ready: isReady })
      .eq('lobby_code', code.toUpperCase())
      .eq('client_id', clientId)
      .eq('is_host', false)

    if (error) {
      throw error
    }

    const { data: lobby, error: lobbyError } = await supabase
      .from('lobbies')
      .select('game_state')
      .eq('code', code.toUpperCase())
      .maybeSingle()

    if (lobbyError) {
      throw lobbyError
    }

    if (lobby?.game_state) {
      const gameState = lobby.game_state as { players: Array<{ id: number; isReady: boolean }> }
      const updatedGameState = {
        ...gameState,
        players: gameState.players.map((player) =>
          player.id === 2 ? { ...player, isReady } : player,
        ),
      }
      const { error: updateError } = await supabase
        .from('lobbies')
        .update({ game_state: updatedGameState })
        .eq('code', code.toUpperCase())

      if (updateError) {
        throw updateError
      }
    }

    return jsonResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error)
  }
}
