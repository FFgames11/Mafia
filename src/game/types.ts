export type PlayerRole = 'mafia' | 'detective' | 'villager'

export type GamePhase = 'setup' | 'night' | 'day' | 'voting' | 'ended'

export type PlayerStatus = 'alive' | 'eliminated'

export type GameMode = 'vs-ai' | 'lobby'

export type PlayerKind = 'human' | 'ai'

export interface Player {
  id: number
  seat: string
  name: string
  role: PlayerRole
  status: PlayerStatus
  kind: PlayerKind
  isHost: boolean
}

export interface GameMaster {
  name: string
  description: string
}

export interface GameState {
  gameMaster: GameMaster
  mode: GameMode
  lobbyCode: string | null
  localPlayerId: number
  hostPlayerId: number
  phase: GamePhase
  players: Player[]
}
