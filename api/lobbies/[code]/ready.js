import { getBody, handleOptions, methodNotAllowed, sendError, sendJson } from '../../_lib/http.js'
import { getSupabase } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(req, res)
  }

  if (req.method !== 'PATCH') {
    return methodNotAllowed(req, res)
  }

  try {
    const supabase = getSupabase(req)
    const lobbyCode = String(req.query.code ?? '').toUpperCase()
    const { clientId, isReady } = getBody(req)

    if (!clientId || typeof isReady !== 'boolean') {
      return sendJson(req, res, 400, { error: 'Missing ready payload.' })
    }

    const { data: playerRow, error: playerError } = await supabase
      .from('lobby_players')
      .select('slot_number')
      .eq('lobby_code', lobbyCode)
      .eq('client_id', clientId)
      .eq('is_host', false)
      .maybeSingle()

    if (playerError) {
      throw playerError
    }

    if (!playerRow) {
      return sendJson(req, res, 404, { error: 'Player not found.' })
    }

    const { error } = await supabase
      .from('lobby_players')
      .update({ is_ready: isReady })
      .eq('lobby_code', lobbyCode)
      .eq('client_id', clientId)

    if (error) {
      throw error
    }

    const { data: lobby, error: lobbyError } = await supabase
      .from('lobbies')
      .select('game_state')
      .eq('code', lobbyCode)
      .maybeSingle()

    if (lobbyError) {
      throw lobbyError
    }

    if (lobby?.game_state) {
      const gameState = lobby.game_state
      const updatedGameState = {
        ...gameState,
        players: gameState.players.map((player) =>
          player.id === playerRow.slot_number ? { ...player, isReady } : player,
        ),
      }
      const { error: updateError } = await supabase
        .from('lobbies')
        .update({ game_state: updatedGameState })
        .eq('code', lobbyCode)

      if (updateError) {
        throw updateError
      }
    }

    return sendJson(req, res, 200, { ok: true })
  } catch (error) {
    return sendError(req, res, error)
  }
}
