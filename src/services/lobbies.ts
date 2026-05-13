import type { RealtimeChannel } from '@supabase/supabase-js'
import { createLobbyGameState } from '../game/setup'
import type { GameState, Player, PlayerKind } from '../game/types'
import { supabase } from './supabase'

interface LobbyRow {
  code: string
  status: string
  host_client_id: string
  game_state: GameState | null
}

interface LobbyPlayerRow {
  lobby_code: string
  client_id: string
  slot_number: number
  display_name: string
  kind: PlayerKind
  is_host: boolean
  is_ready: boolean
}

function getClientId() {
  const storageKey = 'mafia:client-id'
  const existingClientId = sessionStorage.getItem(storageKey)

  if (existingClientId) {
    return existingClientId
  }

  const clientId = crypto.randomUUID()
  sessionStorage.setItem(storageKey, clientId)
  return clientId
}

function mapPlayer(row: LobbyPlayerRow, fallbackRole: Player['role']): Player {
  return {
    id: row.slot_number,
    seat: `Seat ${row.slot_number}`,
    name: row.display_name,
    role: fallbackRole,
    status: 'alive',
    kind: row.kind,
    isHost: row.is_host,
    isReady: row.is_ready,
  }
}

function mapLobbyState(
  lobby: LobbyRow,
  players: LobbyPlayerRow[],
  localPlayerId: number,
  fallbackState: GameState,
): GameState {
  if (lobby.game_state) {
    return {
      ...lobby.game_state,
      localPlayerId,
    }
  }

  const fallbackPlayersById = new Map(fallbackState.players.map((player) => [player.id, player]))

  return {
    ...fallbackState,
    mode: 'lobby',
    lobbyCode: lobby.code,
    localPlayerId,
    hostPlayerId: 1,
    phase: lobby.status === 'started' ? 'role-reveal' : 'setup',
    players: players
      .map((player) => mapPlayer(player, fallbackPlayersById.get(player.slot_number)?.role ?? 'villager'))
      .sort((first, second) => first.id - second.id),
  }
}

async function fetchLobbyRows(lobbyCode: string) {
  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('code,status,host_client_id,game_state')
    .eq('code', lobbyCode)
    .maybeSingle<LobbyRow>()

  if (lobbyError) {
    throw lobbyError
  }

  if (!lobby) {
    return null
  }

  const { data: players, error: playersError } = await supabase
    .from('lobby_players')
    .select('lobby_code,client_id,slot_number,display_name,kind,is_host,is_ready')
    .eq('lobby_code', lobbyCode)
    .order('slot_number')
    .returns<LobbyPlayerRow[]>()

  if (playersError) {
    throw playersError
  }

  return {
    lobby,
    players: players ?? [],
  }
}

export async function createOnlineLobby() {
  const fallbackState = createLobbyGameState()
  const lobbyCode = fallbackState.lobbyCode
  const clientId = getClientId()

  if (!lobbyCode) {
    throw new Error('Failed to create lobby code.')
  }

  const { error: lobbyError } = await supabase.from('lobbies').insert({
    code: lobbyCode,
    host_client_id: clientId,
  })

  if (lobbyError) {
    throw lobbyError
  }

  const { error: playersError } = await supabase.from('lobby_players').insert(
    fallbackState.players.map((player) => ({
      lobby_code: lobbyCode,
      client_id: player.isHost ? clientId : `ai-${lobbyCode}-${player.id}`,
      slot_number: player.id,
      display_name: player.name,
      kind: player.kind,
      is_host: player.isHost,
      is_ready: player.isReady,
    })),
  )

  if (playersError) {
    throw playersError
  }

  return mapLobbyState(
    { code: lobbyCode, status: 'waiting', host_client_id: clientId, game_state: null },
    fallbackState.players.map((player) => ({
      lobby_code: lobbyCode,
      client_id: player.isHost ? clientId : `ai-${lobbyCode}-${player.id}`,
      slot_number: player.id,
      display_name: player.name,
      kind: player.kind,
      is_host: player.isHost,
      is_ready: player.isReady,
    })),
    1,
    fallbackState,
  )
}

export async function joinOnlineLobby(lobbyCode: string) {
  const existingLobby = await fetchLobbyRows(lobbyCode)

  if (!existingLobby) {
    throw new Error('Lobby not found.')
  }

  const hasSecondHuman = existingLobby.players.some((player) => player.slot_number === 2)

  if (hasSecondHuman) {
    throw new Error('Lobby is already full.')
  }

  const fallbackState = createLobbyGameState()
  const playerTwo = fallbackState.players.find((player) => player.kind === 'human' && !player.isHost)
  const clientId = getClientId()

  const { error } = await supabase.from('lobby_players').insert({
    lobby_code: lobbyCode,
    client_id: clientId,
    slot_number: 2,
    display_name: playerTwo?.name ?? 'Mystery Guest',
    kind: 'human',
    is_host: false,
    is_ready: false,
  })

  if (error) {
    throw error
  }

  const joinedLobby = await fetchLobbyRows(lobbyCode)

  if (!joinedLobby) {
    throw new Error('Lobby disappeared after joining.')
  }

  return mapLobbyState(joinedLobby.lobby, joinedLobby.players, 2, fallbackState)
}

export async function setOnlinePlayerReady(lobbyCode: string, isReady: boolean) {
  const clientId = getClientId()
  const { error } = await supabase
    .from('lobby_players')
    .update({ is_ready: isReady })
    .eq('lobby_code', lobbyCode)
    .eq('client_id', clientId)

  if (error) {
    throw error
  }
}

export async function startOnlineLobby(lobbyCode: string, gameState: GameState) {
  const { error } = await supabase
    .from('lobbies')
    .update({ status: 'started', game_state: gameState })
    .eq('code', lobbyCode)

  if (error) {
    throw error
  }
}

export async function updateOnlineGameState(lobbyCode: string, gameState: GameState) {
  const { error } = await supabase
    .from('lobbies')
    .update({ game_state: gameState })
    .eq('code', lobbyCode)

  if (error) {
    throw error
  }
}

export function subscribeToLobby(
  lobbyCode: string,
  onChange: () => void,
): RealtimeChannel {
  return supabase
    .channel(`lobby:${lobbyCode}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'lobbies', filter: `code=eq.${lobbyCode}` },
      onChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'lobby_players',
        filter: `lobby_code=eq.${lobbyCode}`,
      },
      onChange,
    )
    .subscribe()
}

export async function refreshOnlineLobby(gameState: GameState) {
  if (!gameState.lobbyCode) {
    return gameState
  }

  const lobbyRows = await fetchLobbyRows(gameState.lobbyCode)

  if (!lobbyRows) {
    return gameState
  }

  return mapLobbyState(lobbyRows.lobby, lobbyRows.players, gameState.localPlayerId, gameState)
}
