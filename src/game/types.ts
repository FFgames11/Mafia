export type PlayerRole = 'mafia' | 'detective' | 'villager'

export type GamePhase =
  | 'setup'
  | 'role-reveal'
  | 'mafia'
  | 'detective'
  | 'day'
  | 'discussion'
  | 'voting'
  | 'ended'

export type PlayerStatus = 'alive' | 'eliminated'

export type GameMode = 'vs-ai' | 'lobby'

export type PlayerKind = 'human' | 'ai'

export type WinningTeam = 'civilians' | 'mafia'

export interface Player {
  id: number
  seat: string
  name: string
  role: PlayerRole
  status: PlayerStatus
  kind: PlayerKind
  isHost: boolean
  isReady: boolean
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
  humanTeamRole: PlayerRole
  phase: GamePhase
  round: number
  pendingEliminationId: number | null
  lastEliminatedId: number | null
  investigationTargetId: number | null
  investigationResult: boolean | null
  dayStory: string | null
  winner: WinningTeam | null
  players: Player[]
}
