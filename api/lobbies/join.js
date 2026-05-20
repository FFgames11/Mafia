import { createHumanPlayerRow, createLobbyState } from '../_lib/game.js'
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
      .select('client_id,display_name,slot_number,kind,is_host')
      .eq('lobby_code', lobbyCode)

    if (playersError) {
      throw playersError
    }

    const existingPlayer = players?.find((player) => player.client_id === clientId && player.kind === 'human')

    if (existingPlayer) {
      const currentGameState = lobby.game_state ?? createLobbyState(lobbyCode, lobby.host_client_id).gameState

      return sendJson(req, res, 200, {
        lobby: {
          ...currentGameState,
          localPlayerId: existingPlayer.slot_number,
        },
      })
    }

    const occupiedHumanSlots = new Set(
      (players ?? [])
        .filter((player) => player.kind === 'human')
        .map((player) => player.slot_number),
    )
    const availableSlot = [1, 2].find((slotNumber) => !occupiedHumanSlots.has(slotNumber))

    if (!availableSlot) {
      return sendJson(req, res, 409, { error: 'Lobby is already full.' })
    }

    const playerRow = createHumanPlayerRow(
      lobbyCode,
      clientId,
      availableSlot,
      players?.map((player) => player.display_name) ?? [],
    )
    const { error: insertError } = await supabase.from('lobby_players').insert(playerRow)

    if (insertError) {
      throw insertError
    }

    const fallback = createLobbyState(lobbyCode, lobby.host_client_id).gameState
    const currentGameState = lobby.game_state ?? fallback
    const joinedPlayer = {
      id: playerRow.slot_number,
      seat: `Seat ${playerRow.slot_number}`,
      name: playerRow.display_name,
      role: currentGameState.humanTeamRole,
      status: 'alive',
      kind: 'human',
      isHost: false,
      isReady: false,
    }
    const existingGamePlayers = currentGameState.players.filter((player) => player.id !== joinedPlayer.id)
    const updatedGameState = {
      ...currentGameState,
      players: [...existingGamePlayers, joinedPlayer].sort((first, second) => first.id - second.id),
      seatOrder: [...new Set([...currentGameState.seatOrder, joinedPlayer.id])].sort((first, second) => first - second),
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
        localPlayerId: joinedPlayer.id,
      },
    })
  } catch (error) {
    return sendError(req, res, error)
  }
}
