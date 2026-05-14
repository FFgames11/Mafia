import type { RealtimeChannel } from '@supabase/supabase-js'
import type { GameState, Player, PlayerKind } from '../game/types'
import { supabase } from './supabase'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000'

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
      seatOrder: lobby.game_state.seatOrder ?? lobby.game_state.players.map((player) => player.id),
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
    seatOrder: players.map((player) => player.slot_number),
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
  const clientId = getClientId()
  const { lobby } = await apiRequest<{ lobby: GameState }>('/api/lobbies', {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  })

  return lobby
}

export async function joinOnlineLobby(lobbyCode: string) {
  const clientId = getClientId()
  const { lobby } = await apiRequest<{ lobby: GameState }>('/api/lobbies/join', {
    method: 'POST',
    body: JSON.stringify({ code: lobbyCode, clientId }),
  })

  return lobby
}

export async function setOnlinePlayerReady(lobbyCode: string, isReady: boolean) {
  const clientId = getClientId()
  await apiRequest(`/api/lobbies/${lobbyCode}/ready`, {
    method: 'PATCH',
    body: JSON.stringify({ clientId, isReady }),
  })
}

export async function startOnlineLobby(lobbyCode: string, gameState: GameState) {
  const clientId = getClientId()
  await apiRequest(`/api/lobbies/${lobbyCode}/start`, {
    method: 'POST',
    body: JSON.stringify({ clientId, gameState }),
  })
}

export async function updateOnlineGameState(lobbyCode: string, gameState: GameState) {
  await apiRequest(`/api/lobbies/${lobbyCode}/state`, {
    method: 'PATCH',
    body: JSON.stringify({ gameState }),
  })
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

async function apiRequest<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const body = (await response.json().catch(() => ({}))) as T & { error?: string }

  if (!response.ok) {
    throw new Error(body.error ?? `API request failed with ${response.status}.`)
  }

  return body
}
