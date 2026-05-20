import { createLobbyState, createPlayerTwo } from '../_lib/game.js'
import { getBody, handleOptions, methodNotAllowed, sendError, sendJson } from '../_lib/http.js'
import { getSupabase } from '../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(req, res)
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(req, res)
  }

  try {
    const supabase = getSupabase(req)
    const { code, clientId } = getBody(req)
    const lobbyCode = code?.trim().toUpperCase()

    if (!lobbyCode || !/^[A-Z0-9]{6}$/.test(lobbyCode)) {
      return sendJson(req, res, 400, { error: 'Invalid lobby code.' })
    }

    if (!clientId) {
      return sendJson(req, res, 400, { error: 'Missing clientId.' })
    }

    const { data: lobby, error: lobbyError } = await supabase
      .from('lobbies')
      .select('code,status,host_client_id,game_state')
      .eq('code', lobbyCode)
      .maybeSingle()

    if (lobbyError) {
      throw lobbyError
    }

    if (!lobby) {
      return sendJson(req, res, 404, { error: 'Lobby not found.' })
    }

    if (lobby.status !== 'waiting') {
      return sendJson(req, res, 409, { error: 'Game has already started.' })
    }

    const { data: players, error: playersError } = await supabase
      .from('lobby_players')
      .select('display_name,slot_number')
      .eq('lobby_code', lobbyCode)

    if (playersError) {
      throw playersError
    }

    if (players?.some((player) => player.slot_number === 2)) {
      return sendJson(req, res, 409, { error: 'Lobby is already full.' })
    }

    const playerTwoRow = createPlayerTwo(
      lobbyCode,
      clientId,
      players?.map((player) => player.display_name) ?? [],
    )
    const { error: insertError } = await supabase.from('lobby_players').insert(playerTwoRow)

    if (insertError) {
      throw insertError
    }

    const fallback = createLobbyState(lobbyCode, lobby.host_client_id).gameState
    const currentGameState = lobby.game_state ?? fallback
    const playerTwo = {
      id: 2,
      seat: 'Seat 2',
      name: playerTwoRow.display_name,
      role: currentGameState.humanTeamRole,
      status: 'alive',
      kind: 'human',
      isHost: false,
      isReady: false,
    }
    const updatedGameState = {
      ...currentGameState,
      players: [...currentGameState.players, playerTwo].sort((first, second) => first.id - second.id),
      seatOrder: [...new Set([...currentGameState.seatOrder, playerTwo.id])],
    }

    const { error: updateError } = await supabase
      .from('lobbies')
      .update({ game_state: updatedGameState })
      .eq('code', lobbyCode)

    if (updateError) {
      throw updateError
    }

    return sendJson(req, res, 200, {
      lobby: {
        ...updatedGameState,
        localPlayerId: 2,
      },
    })
  } catch (error) {
    return sendError(req, res, error)
  }
}
