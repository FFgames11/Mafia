import dialogueBank from '../data/dialogues.json'
import detectiveHintBank from '../data/detective-hint-dialogues.json'
import mafiaDialogueBank from '../data/mafia-suspicious-dialogues.json'
import storyCycles from '../data/story-cycles.json'
import type { GameState, Player, WinningTeam } from './types'

export function getAlivePlayers(gameState: GameState) {
  return gameState.players.filter((player) => player.status === 'alive')
}

export function getPlayerName(gameState: GameState, playerId: number | null) {
  return gameState.players.find((player) => player.id === playerId)?.name ?? 'Nobody'
}

export function getVoteTargets(gameState: GameState, voterId: number) {
  const voter = gameState.players.find((player) => player.id === voterId)

  if (!voter || voter.status !== 'alive') {
    return []
  }

  return getAlivePlayers(gameState).filter((player) => {
    if (player.id === voterId) {
      return false
    }

    if (gameState.tiedPlayerIds.length > 0 && !gameState.tiedPlayerIds.includes(player.id)) {
      return false
    }

    return !(voter?.kind === 'human' && player.kind === 'human')
  })
}

export function getDetectiveTargets(gameState: GameState, detectiveId: number) {
  const detective = gameState.players.find((player) => player.id === detectiveId)

  if (!detective || detective.status !== 'alive' || detective.role !== 'detective') {
    return []
  }

  return getAlivePlayers(gameState).filter((player) => {
    if (player.id === detectiveId) {
      return false
    }

    return !(detective.kind === 'human' && player.kind === 'human')
  })
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
    sleepAcknowledgedIds: [],
    mafiaVotes: [],
    lastEliminatedId: null,
    detectiveVotes: [],
    voteChoices: [],
    tiedPlayerIds: [],
    investigationTargetId: null,
    investigationResult: null,
    dayStory: null,
  }
}

export function advanceToIntroPhase(gameState: GameState): GameState {
  return {
    ...gameState,
    phase: 'intro',
    sleepAcknowledgedIds: [],
  }
}

export function advanceToSleepPhase(gameState: GameState): GameState {
  return {
    ...gameState,
    phase: 'sleep',
    sleepAcknowledgedIds: [],
  }
}

export function advanceToMafiaSleepPhase(gameState: GameState): GameState {
  return {
    ...gameState,
    phase: 'mafia-sleep',
  }
}

export function advanceToDetectivePhase(gameState: GameState): GameState {
  return {
    ...gameState,
    phase: 'detective',
  }
}

export function advanceToSunrisePhase(gameState: GameState): GameState {
  const players = eliminatePlayer(gameState.players, gameState.pendingEliminationId)
  const eliminatedName = getPlayerName(gameState, gameState.pendingEliminationId)
  const nextState = {
    ...gameState,
    players,
    lastEliminatedId: gameState.pendingEliminationId,
    pendingEliminationId: null,
    dayStory: createDayStory(gameState.round, eliminatedName),
    phase: 'sunrise' as const,
  }
  const winner = getWinner(nextState)

  return winner ? endGame(nextState, winner) : nextState
}

export function advanceToDiscussionPhase(gameState: GameState): GameState {
  return prepareDiscussionTurn({
    ...gameState,
    phase: 'discussion',
    discussionSpeakerIndex: 0,
    discussionPromptSpeakerId: null,
    discussionPromptOptions: [],
    discussionLog: [],
  })
}

export function advanceToVotingPhase(gameState: GameState): GameState {
  return {
    ...gameState,
    phase: 'voting',
    voteChoices: [],
    tiedPlayerIds: [],
    discussionSpeakerIndex: 0,
    discussionPromptSpeakerId: null,
    discussionPromptOptions: [],
  }
}

export function acknowledgeSleepPhase(gameState: GameState, playerId: number): GameState {
  if (gameState.phase !== 'sleep') {
    return gameState
  }

  const player = gameState.players.find((currentPlayer) => currentPlayer.id === playerId)

  if (!player || player.kind !== 'human' || player.status !== 'alive') {
    return gameState
  }

  const sleepAcknowledgedIds = Array.from(
    new Set([...gameState.sleepAcknowledgedIds, playerId]),
  )
  const requiredSleepCount = getAlivePlayers(gameState).filter((currentPlayer) => currentPlayer.kind === 'human').length
  const acknowledgedAliveCount = getAlivePlayers(gameState).filter(
    (currentPlayer) =>
      currentPlayer.kind === 'human' && sleepAcknowledgedIds.includes(currentPlayer.id),
  ).length

  if (acknowledgedAliveCount < requiredSleepCount) {
    return {
      ...gameState,
      sleepAcknowledgedIds,
    }
  }

  return advanceToMafiaPhase({
    ...gameState,
    sleepAcknowledgedIds,
  })
}

export function submitDiscussionLine(
  gameState: GameState,
  speakerId: number,
  line: string,
): GameState {
  const currentSpeaker = getDiscussionOrder(gameState)[gameState.discussionSpeakerIndex]

  if (!currentSpeaker || currentSpeaker.id !== speakerId || gameState.phase !== 'discussion') {
    return gameState
  }

  return prepareDiscussionTurn({
    ...gameState,
    discussionLog: [...gameState.discussionLog, { speakerId, text: line }],
    discussionSpeakerIndex: gameState.discussionSpeakerIndex + 1,
    discussionPromptSpeakerId: null,
    discussionPromptOptions: [],
  })
}

export function progressBotDiscussionTurn(gameState: GameState): GameState {
  if (gameState.phase !== 'discussion') {
    return gameState
  }

  const currentSpeaker = getDiscussionOrder(gameState)[gameState.discussionSpeakerIndex]

  if (!currentSpeaker || currentSpeaker.kind !== 'ai') {
    return prepareDiscussionTurn(gameState)
  }

  return prepareDiscussionTurn({
    ...gameState,
    discussionLog: [
      ...gameState.discussionLog,
      {
        speakerId: currentSpeaker.id,
        text: pickDiscussionLine(gameState, currentSpeaker.role, currentSpeaker.kind),
      },
    ],
    discussionSpeakerIndex: gameState.discussionSpeakerIndex + 1,
  })
}

export function chooseMafiaTarget(
  gameState: GameState,
  mafiaId: number,
  targetId: number,
): GameState {
  const mafiaVotes = [
    ...gameState.mafiaVotes.filter((vote) => vote.mafiaId !== mafiaId),
    { mafiaId, targetId },
  ]
  const aliveMafiaCount = getAlivePlayers(gameState).filter((player) => player.role === 'mafia').length

  if (mafiaVotes.length < aliveMafiaCount) {
    return {
      ...gameState,
      mafiaVotes,
    }
  }

  const pendingEliminationId = resolveMafiaKill(mafiaVotes)

  return {
    ...gameState,
    mafiaVotes,
    pendingEliminationId,
    phase: 'mafia-sleep',
  }
}

export function chooseDetectiveTarget(
  gameState: GameState,
  detectiveId: number,
  targetId: number,
): GameState {
  const isValidTarget = getDetectiveTargets(gameState, detectiveId).some(
    (player) => player.id === targetId,
  )

  if (!isValidTarget) {
    return gameState
  }

  const detectiveVotes = [
    ...gameState.detectiveVotes.filter((vote) => vote.detectiveId !== detectiveId),
    { detectiveId, targetId },
  ]
  const aliveDetectiveCount = getAlivePlayers(gameState).filter(
    (player) => player.role === 'detective',
  ).length

  if (detectiveVotes.length < aliveDetectiveCount) {
    return {
      ...gameState,
      detectiveVotes,
    }
  }

  const investigationTargetId = resolveDetectiveInvestigation(detectiveVotes)
  const target = gameState.players.find((player) => player.id === investigationTargetId)
  return {
    ...gameState,
    detectiveVotes,
    investigationTargetId,
    investigationResult: target?.role === 'mafia',
  }
}

export function castVote(gameState: GameState, voterId: number, targetId: number): GameState {
  const isValidTarget = getVoteTargets(gameState, voterId).some((player) => player.id === targetId)

  if (!isValidTarget) {
    return gameState
  }

  const voteChoices = [
    ...gameState.voteChoices.filter((vote) => vote.voterId !== voterId),
    { voterId, targetId },
  ]
  const requiredVoteCount = getAlivePlayers(gameState).filter((player) => {
    return getVoteTargets({ ...gameState, voteChoices }, player.id).length > 0
  }).length

  if (voteChoices.length < requiredVoteCount) {
    return {
      ...gameState,
      voteChoices,
    }
  }

  const result = resolveVotes(voteChoices)

  if (result.type === 'tie') {
    return {
      ...gameState,
      voteChoices,
      tiedPlayerIds: result.tiedPlayerIds,
      phase: 'tie-dialogue',
    }
  }

  return {
    ...gameState,
    voteChoices,
    tiedPlayerIds: [],
    pendingEliminationId: result.winnerId,
    phase: 'elimination',
  }
}

export function restartVoteAfterTie(gameState: GameState): GameState {
  return {
    ...gameState,
    voteChoices: [],
    phase: 'voting',
  }
}

export function finalizeElimination(gameState: GameState): GameState {
  const players = eliminatePlayer(gameState.players, gameState.pendingEliminationId)
  const nextState = {
    ...gameState,
    players,
    lastEliminatedId: gameState.pendingEliminationId,
    pendingEliminationId: null,
  }
  const winner = getWinner(nextState)

  if (winner) {
    return endGame(nextState, winner)
  }

  return {
    ...nextState,
    round: gameState.round + 1,
    sleepAcknowledgedIds: [],
    mafiaVotes: [],
    detectiveVotes: [],
    voteChoices: [],
    tiedPlayerIds: [],
    investigationTargetId: null,
    investigationResult: null,
    dayStory: null,
    discussionSpeakerIndex: 0,
    discussionPromptSpeakerId: null,
    discussionPromptOptions: [],
    discussionLog: [],
    phase: 'intro',
  }
}

export function pickBotTarget(gameState: GameState, avoidMafia: boolean) {
  const choices = getAlivePlayers(gameState).filter((player) => {
    return avoidMafia ? player.role !== 'mafia' : true
  })

  return choices[Math.floor(Math.random() * choices.length)]?.id ?? null
}

export function pickDetectiveTarget(gameState: GameState, detectiveId: number) {
  const choices = getDetectiveTargets(gameState, detectiveId)

  return choices[Math.floor(Math.random() * choices.length)]?.id ?? null
}

export function pickVoteTarget(gameState: GameState, voterId: number) {
  const choices = getVoteTargets(gameState, voterId)

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

function resolveMafiaKill(mafiaVotes: Array<{ mafiaId: number; targetId: number }>) {
  const firstTargetId = mafiaVotes[0]?.targetId ?? null

  if (!firstTargetId) {
    return null
  }

  const allAgree = mafiaVotes.every((vote) => vote.targetId === firstTargetId)

  if (allAgree) {
    return firstTargetId
  }

  const chosenVote = mafiaVotes[Math.floor(Math.random() * mafiaVotes.length)]
  return chosenVote.targetId
}

function resolveDetectiveInvestigation(
  detectiveVotes: Array<{ detectiveId: number; targetId: number }>,
) {
  const firstTargetId = detectiveVotes[0]?.targetId ?? null

  if (!firstTargetId) {
    return null
  }

  const allAgree = detectiveVotes.every((vote) => vote.targetId === firstTargetId)

  if (allAgree) {
    return firstTargetId
  }

  const chosenVote = detectiveVotes[Math.floor(Math.random() * detectiveVotes.length)]
  return chosenVote.targetId
}

function resolveVotes(voteChoices: Array<{ voterId: number; targetId: number }>) {
  const counts = new Map<number, number>()

  for (const vote of voteChoices) {
    counts.set(vote.targetId, (counts.get(vote.targetId) ?? 0) + 1)
  }

  let highestCount = 0
  let winnerId: number | null = null
  const tiedPlayerIds: number[] = []

  for (const [playerId, count] of counts.entries()) {
    if (count > highestCount) {
      highestCount = count
      winnerId = playerId
      tiedPlayerIds.length = 0
      tiedPlayerIds.push(playerId)
      continue
    }

    if (count === highestCount) {
      tiedPlayerIds.push(playerId)
    }
  }

  if (tiedPlayerIds.length > 1) {
    return {
      type: 'tie' as const,
      tiedPlayerIds,
    }
  }

  return {
    type: 'winner' as const,
    winnerId: winnerId ?? null,
  }
}

function endGame(gameState: GameState, winner: WinningTeam): GameState {
  return {
    ...gameState,
    phase: 'ended',
    winner,
  }
}

function createDayStory(round: number, eliminatedName: string) {
  const storyPack = storyCycles[(round - 1) % storyCycles.length]

  return `${storyPack.sunrise} ${eliminatedName} is the player the town found at dawn.`
}

function prepareDiscussionTurn(gameState: GameState): GameState {
  if (gameState.phase !== 'discussion') {
    return gameState
  }

  const currentSpeaker = getDiscussionOrder(gameState)[gameState.discussionSpeakerIndex]

  if (!currentSpeaker) {
    return {
      ...gameState,
      discussionPromptSpeakerId: null,
      discussionPromptOptions: [],
    }
  }

  if (currentSpeaker.kind === 'ai') {
    return {
      ...gameState,
      discussionPromptSpeakerId: null,
      discussionPromptOptions: [],
    }
  }

  if (gameState.discussionPromptSpeakerId === currentSpeaker.id && gameState.discussionPromptOptions.length > 0) {
    return gameState
  }

  return {
    ...gameState,
    discussionPromptSpeakerId: currentSpeaker.id,
    discussionPromptOptions: pickHumanDiscussionOptions(gameState, currentSpeaker.role),
  }
}

function getDiscussionOrder(gameState: GameState) {
  const playersById = new Map(gameState.players.map((player) => [player.id, player]))

  return gameState.seatOrder
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is Player => Boolean(player && player.status === 'alive'))
}

function pickHumanDiscussionOptions(gameState: GameState, role: Player['role']) {
  if (role === 'detective') {
    const detectiveHints = pickDetectiveHintLines(gameState, 3)

    if (detectiveHints.length > 0) {
      return detectiveHints
    }
  }

  const bank = role === 'mafia' ? mafiaDialogueBank.mafia_suspicious_dialogues : dialogueBank.human_choices

  return pickUniqueLines(bank.map((item) => item.text), 3)
}

function pickDiscussionLine(gameState: GameState, role: Player['role'], kind: Player['kind']) {
  if (role === 'detective') {
    const detectiveHint = pickDetectiveHintLines(gameState, 1)[0]

    if (detectiveHint) {
      return detectiveHint
    }
  }

  if (kind === 'ai' && role === 'mafia') {
    return pickUniqueLines(mafiaDialogueBank.mafia_suspicious_dialogues.map((item) => item.text), 1)[0] ?? ''
  }

  if (kind === 'ai') {
    return pickUniqueLines(dialogueBank.ai_dialogues.map((item) => item.text), 1)[0] ?? ''
  }

  return pickUniqueLines(dialogueBank.human_choices.map((item) => item.text), 1)[0] ?? ''
}

function pickDetectiveHintLines(gameState: GameState, count: number) {
  if (gameState.investigationTargetId === null || gameState.investigationResult === null) {
    return []
  }

  const targetName = getPlayerName(gameState, gameState.investigationTargetId)
  const bank = gameState.investigationResult
    ? detectiveHintBank.bad_person_hints
    : detectiveHintBank.good_person_hints

  return pickUniqueLines(
    bank.map((item) => item.text.replaceAll('[player]', targetName)),
    count,
  )
}

function pickUniqueLines(lines: string[], count: number) {
  const pool = [...lines].sort(() => Math.random() - 0.5)
  return pool.slice(0, count)
}
