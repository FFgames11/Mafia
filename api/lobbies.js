import { createLobbyCode, createLobbyState } from './_lib/game.js'
import { getBody, handleOptions, methodNotAllowed, sendError, sendJson } from './_lib/http.js'
import { getSupabase } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(req, res)
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(req, res)
  }

  try {
    const supabase = getSupabase(req)
    const { clientId } = getBody(req)

    if (!clientId) {
      return sendJson(req, res, 400, { error: 'Missing clientId.' })
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

    const { error: playersError } = await supabase.from('lobby_players').insert(lobbyState.playerRows)

    if (playersError) {
      throw playersError
    }

    return sendJson(req, res, 200, {
      lobby: {
        ...lobbyState.gameState,
        localPlayerId: 1,
      },
    })
  } catch (error) {
    return sendError(req, res, error)
  }
}
