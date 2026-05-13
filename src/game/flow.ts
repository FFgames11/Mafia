import type { GameState, Player, WinningTeam } from './types'

export function getAlivePlayers(gameState: GameState) {
  return gameState.players.filter((player) => player.status === 'alive')
}

export function getPlayerName(gameState: GameState, playerId: number | null) {
  return gameState.players.find((player) => player.id === playerId)?.name ?? 'Nobody'
}

export function getWinner(gameState: GameState): WinningTeam | null {
  const alivePlayers = getAlivePlayers(gameState)
  const mafiaCount = alivePlayers.filter((player) => player.role === 'mafia').length
  const nonMafiaCount = alivePlayers.length - mafiaCount

  if (mafiaCount === 0) {
    return 'civilians'
  }

  if (mafiaCount >= nonMafiaCount) {
    return 'mafia'
  }

  return null
}

export function advanceToMafiaPhase(gameState: GameState): GameState {
  return {
    ...gameState,
    phase: 'mafia',
    pendingEliminationId: null,
    lastEliminatedId: null,
    investigationTargetId: null,
    investigationResult: null,
    dayStory: null,
  }
}

export function chooseMafiaTarget(gameState: GameState, playerId: number): GameState {
  return {
    ...gameState,
    pendingEliminationId: playerId,
    phase: 'detective',
  }
}

export function chooseDetectiveTarget(gameState: GameState, playerId: number): GameState {
  const target = gameState.players.find((player) => player.id === playerId)

  return {
    ...gameState,
    investigationTargetId: playerId,
    investigationResult: target?.role === 'mafia',
  }
}

export function announceDay(gameState: GameState): GameState {
  const players = eliminatePlayer(gameState.players, gameState.pendingEliminationId)
  const eliminatedName = getPlayerName(gameState, gameState.pendingEliminationId)
  const nextState = {
    ...gameState,
    players,
    lastEliminatedId: gameState.pendingEliminationId,
    pendingEliminationId: null,
    dayStory: createDayStory(gameState.round, eliminatedName),
    phase: 'day' as const,
  }
  const winner = getWinner(nextState)

  return winner ? endGame(nextState, winner) : nextState
}

export function beginDiscussion(gameState: GameState): GameState {
  return {
    ...gameState,
    phase: 'discussion',
  }
}

export function beginVoting(gameState: GameState): GameState {
  return {
    ...gameState,
    phase: 'voting',
  }
}

export function voteOutPlayer(gameState: GameState, playerId: number): GameState {
  const players = eliminatePlayer(gameState.players, playerId)
  const nextState = {
    ...gameState,
    players,
    lastEliminatedId: playerId,
  }
  const winner = getWinner(nextState)

  if (winner) {
    return endGame(nextState, winner)
  }

  return {
    ...nextState,
    phase: 'mafia',
    round: gameState.round + 1,
    pendingEliminationId: null,
    investigationTargetId: null,
    investigationResult: null,
    dayStory: null,
  }
}

export function pickBotTarget(gameState: GameState, avoidMafia: boolean) {
  const choices = getAlivePlayers(gameState).filter((player) => {
    return avoidMafia ? player.role !== 'mafia' : true
  })

  return choices[Math.floor(Math.random() * choices.length)]?.id ?? null
}

function eliminatePlayer(players: Player[], playerId: number | null) {
  if (!playerId) {
    return players
  }

  return players.map((player) =>
    player.id === playerId ? { ...player, status: 'eliminated' as const } : player,
  )
}

function endGame(gameState: GameState, winner: WinningTeam): GameState {
  return {
    ...gameState,
    phase: 'ended',
    winner,
  }
}

function createDayStory(round: number, eliminatedName: string) {
  const stories = [
    `Morning ${round}: The town square is quieter than usual. ${eliminatedName} is missing, and the Game Master reminds everyone that good questions beat loud guesses. Ask who had a reason, who had a chance, and who is changing their story.`,
    `Morning ${round}: A cold trail leads to ${eliminatedName}. The Game Master pauses the panic and gives a lesson: suspicion is not proof. Listen for patterns, compare claims, and do not vote just because someone sounds confident.`,
    `Morning ${round}: The village bell rings twice for ${eliminatedName}. Today’s lesson is teamwork. Civilians need clear thinking, Detectives need careful timing, and the Mafia need confusion. Watch who creates confusion on purpose.`,
    `Morning ${round}: ${eliminatedName}'s chair is empty. The Game Master tells the group that every vote teaches something. Even a wrong vote can reveal who pushed too hard, who stayed silent, and who followed without thinking.`,
  ]

  return stories[(round - 1) % stories.length]
}
