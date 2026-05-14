import { createLobbyCode, createLobbyState } from '@/lib/game'
import { errorResponse, jsonResponse, optionsResponse } from '@/lib/http'
import { supabase } from '@/lib/supabase'

export function OPTIONS(request: Request) {
  return optionsResponse(request)
}

export async function POST(request: Request) {
  try {
    const { clientId } = (await request.json()) as { clientId?: string }

    if (!clientId) {
      return jsonResponse(request, { error: 'Missing clientId.' }, { status: 400 })
    }

    const lobbyCode = createLobbyCode()
    const lobbyState = createLobbyState(lobbyCode, clientId)

    const { error: lobbyError } = await supabase.from('lobbies').insert({
      ...lobbyState.lobby,
      game_state: lobbyState.gameState,
    })

    if (lobbyError) {
      throw lobbyError
    }

    const { error: playersError } = await supabase
      .from('lobby_players')
      .insert(lobbyState.playerRows)

    if (playersError) {
      throw playersError
    }

    return jsonResponse(request, {
      lobby: {
        ...lobbyState.gameState,
        localPlayerId: 1,
      },
    })
  } catch (error) {
    return errorResponse(request, error)
  }
}
