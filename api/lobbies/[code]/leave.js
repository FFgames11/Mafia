import { getBody, handleOptions, methodNotAllowed, sendError, sendJson } from '../../_lib/http.js'
import { getSupabase } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(req, res)
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(req, res)
  }

  try {
    const supabase = getSupabase(req)
    const lobbyCode = String(req.query.code ?? '').toUpperCase()
    const { clientId } = getBody(req)

    if (!clientId) {
      return sendJson(req, res, 400, { error: 'Missing clientId.' })
    }

    const { data: leavingPlayer, error: leavingError } = await supabase
      .from('lobby_players')
      .select('slot_number,kind,is_host')
      .eq('lobby_code', lobbyCode)
      .eq('client_id', clientId)
      .eq('kind', 'human')
      .maybeSingle()

    if (leavingError) {
      throw leavingError
    }

    if (!leavingPlayer) {
      return sendJson(req, res, 200, { ok: true })
    }

    const { error: deleteError } = await supabase
      .from('lobby_players')
      .delete()
      .eq('lobby_code', lobbyCode)
      .eq('client_id', clientId)
      .eq('kind', 'human')

    if (deleteError) {
      throw deleteError
    }

    const { data: remainingHumans, error: remainingError } = await supabase
      .from('lobby_players')
      .select('client_id,slot_number')
      .eq('lobby_code', lobbyCode)
      .eq('kind', 'human')
      .order('slot_number')

    if (remainingError) {
      throw remainingError
    }

    if (!remainingHumans?.length) {
      await supabase.from('lobby_players').delete().eq('lobby_code', lobbyCode)
      await supabase.from('lobbies').delete().eq('code', lobbyCode)
      return sendJson(req, res, 200, { ok: true, deleted: true })
    }

    const nextHost = remainingHumans[0]

    const { data: lobby, error: lobbyError } = await supabase
      .from('lobbies')
      .select('game_state')
      .eq('code', lobbyCode)
      .maybeSingle()

    if (lobbyError) {
      throw lobbyError
    }

    const updatedGameState = lobby?.game_state
      ? transferHost(removePlayerFromGameState(lobby.game_state, leavingPlayer.slot_number), nextHost.slot_number)
      : null

    const { error: clearHostError } = await supabase
      .from('lobby_players')
      .update({ is_host: false })
      .eq('lobby_code', lobbyCode)
      .eq('kind', 'human')

    if (clearHostError) {
      throw clearHostError
    }

    const { error: setHostError } = await supabase
      .from('lobby_players')
      .update({ is_host: true, is_ready: true })
      .eq('lobby_code', lobbyCode)
      .eq('client_id', nextHost.client_id)

    if (setHostError) {
      throw setHostError
    }

    const lobbyUpdate = {
      host_client_id: nextHost.client_id,
      ...(updatedGameState ? { game_state: updatedGameState } : {}),
    }
    const { error: updateLobbyError } = await supabase
      .from('lobbies')
      .update(lobbyUpdate)
      .eq('code', lobbyCode)

    if (updateLobbyError) {
      throw updateLobbyError
    }

    return sendJson(req, res, 200, { ok: true })
  } catch (error) {
    return sendError(req, res, error)
  }
}

function removePlayerFromGameState(gameState, leavingSlotNumber) {
  return {
    ...gameState,
    players: gameState.players.filter((player) => player.id !== leavingSlotNumber),
    seatOrder: gameState.seatOrder.filter((playerId) => playerId !== leavingSlotNumber),
  }
}

function transferHost(gameState, hostPlayerId) {
  return {
    ...gameState,
    hostPlayerId,
    players: gameState.players.map((player) => ({
      ...player,
      isHost: player.id === hostPlayerId,
      isReady: player.id === hostPlayerId ? true : player.isReady,
    })),
  }
}
