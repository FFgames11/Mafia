import type { RealtimeChannel } from '@supabase/supabase-js'
import type { GameState, Player, PlayerKind } from '../game/types'
import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from './supabase'

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const apiBaseUrl = configuredApiBaseUrl ?? (import.meta.env.PROD ? '' : 'http://127.0.0.1:3000')

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

  const clientId = createClientId()
  sessionStorage.setItem(storageKey, clientId)
  return clientId
}

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-')
  }

  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
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
    const gamePlayersById = new Map(lobby.game_state.players.map((player) => [player.id, player]))
    const syncedPlayers = players
      .map((player) => {
        const gamePlayer = gamePlayersById.get(player.slot_number)

        return {
          ...mapPlayer(player, gamePlayer?.role ?? 'villager'),
          status: gamePlayer?.status ?? 'alive',
          role: gamePlayer?.role ?? 'villager',
        }
      })
      .sort((first, second) => first.id - second.id)

    return {
      ...lobby.game_state,
      players: syncedPlayers,
      seatOrder: lobby.game_state.seatOrder ?? syncedPlayers.map((player) => player.id),
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
  return apiRequest<{ lobby: LobbyRow, players: LobbyPlayerRow[] }>(`/api/lobbies/${lobbyCode}`)
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
  const { gameState: updatedGameState } = await apiRequest<{ gameState?: GameState }>(`/api/lobbies/${lobbyCode}/state`, {
    method: 'PATCH',
    body: JSON.stringify({ gameState }),
  })

  return updatedGameState ?? gameState
}

export function subscribeToLobby(
  lobbyCode: string,
  onChange: () => void,
): RealtimeChannel | null {
  if (!supabase) {
    return null
  }

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
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured on this deployment. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy.',
    )
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Supabase-Url': supabaseUrl,
      'X-Supabase-Anon-Key': supabaseAnonKey,
      ...init?.headers,
    },
  })
  const body = (await response.json().catch(() => ({}))) as T & { error?: string }

  if (!response.ok) {
    throw new Error(body.error ?? `API request failed with ${response.status}.`)
  }

  return body
}
