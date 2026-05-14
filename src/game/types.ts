export type PlayerRole = 'mafia' | 'detective' | 'villager'

export type GamePhase =
  | 'setup'
  | 'role-reveal'
  | 'intro'
  | 'sleep'
  | 'sleep-story'
  | 'mafia'
  | 'mafia-sleep'
  | 'detective'
  | 'sunrise'
  | 'day'
  | 'discussion'
  | 'voting'
  | 'tie-dialogue'
  | 'elimination'
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
  nextAcknowledgedIds: number[]
  nextAcknowledgements: Record<string, number[]>
  pendingEliminationId: number | null
  sleepAcknowledgedIds: number[]
  mafiaVotes: Array<{
    mafiaId: number
    targetId: number
  }>
  lastEliminatedId: number | null
  detectiveVotes: Array<{
    detectiveId: number
    targetId: number
  }>
  voteChoices: Array<{
    voterId: number
    targetId: number
  }>
  tiedPlayerIds: number[]
  discussionSpeakerIndex: number
  discussionPromptSpeakerId: number | null
  discussionPromptOptions: string[]
  discussionLog: Array<{
    speakerId: number
    text: string
  }>
  investigationTargetId: number | null
  investigationResult: boolean | null
  dayStory: string | null
  winner: WinningTeam | null
  seatOrder: number[]
  players: Player[]
}
