import { createLobbyState, createPlayerTwo, type GameState, type Player } from '@/lib/game'
import { errorResponse, jsonResponse, optionsResponse } from '@/lib/http'
import { supabase } from '@/lib/supabase'

export function OPTIONS(request: Request) {
  return optionsResponse(request)
}

export async function POST(request: Request) {
  try {
    const { code, clientId } = (await request.json()) as {
      code?: string
      clientId?: string
    }
    const lobbyCode = code?.trim().toUpperCase()

    if (!lobbyCode || !/^[A-Z0-9]{6}$/.test(lobbyCode)) {
      return jsonResponse(request, { error: 'Invalid lobby code.' }, { status: 400 })
    }

    if (!clientId) {
      return jsonResponse(request, { error: 'Missing clientId.' }, { status: 400 })
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
      return jsonResponse(request, { error: 'Lobby not found.' }, { status: 404 })
    }

    if (lobby.status !== 'waiting') {
      return jsonResponse(request, { error: 'Game has already started.' }, { status: 409 })
    }

    const { data: players, error: playersError } = await supabase
      .from('lobby_players')
      .select('display_name,slot_number')
      .eq('lobby_code', lobbyCode)

    if (playersError) {
      throw playersError
    }

    if (players?.some((player) => player.slot_number === 2)) {
      return jsonResponse(request, { error: 'Lobby is already full.' }, { status: 409 })
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
    const currentGameState = (lobby.game_state ?? fallback) as GameState
    const playerTwo: Player = {
      id: 2,
      seat: 'Seat 2',
      name: playerTwoRow.display_name,
      role: currentGameState.humanTeamRole,
      status: 'alive',
      kind: 'human',
      isHost: false,
      isReady: false,
    }
    const updatedGameState: GameState = {
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

    return jsonResponse(request, {
      lobby: {
        ...updatedGameState,
        localPlayerId: 2,
      },
    })
  } catch (error) {
    return errorResponse(request, error)
  }
}
