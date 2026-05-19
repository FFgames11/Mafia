<script setup lang="ts">
import type { RealtimeChannel } from '@supabase/supabase-js'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import storyCycles from './data/story-cycles.json'
import {
  advanceToIntroPhase,
  advanceToMafiaPhase,
  advanceToSleepPhase,
  advanceToSleepStoryPhase,
  advanceToDetectivePhase,
  advanceToDiscussionPhase,
  advanceToSunrisePhase,
  advanceToVotingPhase,
  acknowledgeSleepPhase,
  castVote,
  chooseDetectiveTarget,
  chooseMafiaTarget,
  getDetectiveTargets,
  getAlivePlayers,
  getPlayerName,
  getVoteTargets,
  pickBotTarget,
  pickDetectiveTarget,
  pickVoteTarget,
  progressBotDiscussionTurn,
  finalizeElimination,
  restartVoteAfterTie,
  submitDiscussionLine,
} from './game/flow'
import {
  createVsAiGameState,
  roleLabels,
  startGame,
} from './game/setup'
import type { Player, PlayerRole } from './game/types'
import {
  createOnlineLobby,
  joinOnlineLobby,
  refreshOnlineLobby,
  setOnlinePlayerReady,
  startOnlineLobby,
  subscribeToLobby,
  updateOnlineGameState,
} from './services/lobbies'

type AppScreen = 'landing' | 'options' | 'mode-select' | 'join-lobby' | 'game'

const screen = ref<AppScreen>('landing')
const gameState = ref(createVsAiGameState())
const musicVolume = ref(65)
const sfxVolume = ref(80)
const lobbyCodeInput = ref('')
const isHelpOpen = ref(false)
const lobbyError = ref('')
const lobbyChannel = ref<RealtimeChannel | null>(null)
const lobbyRefreshIntervalId = ref<number | null>(null)
const isRefreshingLobby = ref(false)
const isLobbyBusy = ref(false)
const roleRevealTimeoutId = ref<number | null>(null)
const introAdvanceTimeoutId = ref<number | null>(null)
const nightAutomationTimeoutId = ref<number | null>(null)
const botDiscussionTimeoutId = ref<number | null>(null)
const voteAutomationTimeoutId = ref<number | null>(null)
const eliminationAutomationTimeoutId = ref<number | null>(null)
const hasSeenRoleReveal = ref(false)
const isVoteModalMinimized = ref(true)
const discussionLogElement = ref<HTMLElement | null>(null)
const isLocalNextVisible = ref(false)
const dismissedLocalModalKeys = ref<Set<string>>(new Set())
const isNextGateAdvanceBusy = ref(false)
const isSleepGateAdvanceBusy = ref(false)
const gameMasterTypedText = ref('')
const isGameMasterTypingComplete = ref(false)
const gameMasterTypingIntervalId = ref<number | null>(null)
const currentGameMasterSceneKey = ref('')

const roleCounts = computed(() => {
  return gameState.value.players.reduce<Record<PlayerRole, number>>(
    (counts, player) => {
      counts[player.role] += 1
      return counts
    },
    {
      mafia: 0,
      detective: 0,
      villager: 0,
    },
  )
})

const isHost = computed(() => gameState.value.localPlayerId === gameState.value.hostPlayerId)

const isLobbyWaiting = computed(() => {
  return gameState.value.mode === 'lobby' && gameState.value.phase === 'setup'
})

const isGameStarted = computed(() => {
  return gameState.value.phase !== 'setup'
})

const localPlayer = computed(() => {
  return gameState.value.players.find((player) => player.id === gameState.value.localPlayerId)
})

const humanCount = computed(() => {
  return gameState.value.players.filter((player) => player.kind === 'human').length
})

const aliveHumanCount = computed(() => {
  return alivePlayers.value.filter((player) => player.kind === 'human').length
})

const secondHuman = computed(() => {
  return gameState.value.players.find((player) => player.kind === 'human' && !player.isHost)
})

const canStartGame = computed(() => {
  return (
    isHost.value &&
    gameState.value.players.length === 8 &&
    humanCount.value === 2 &&
    secondHuman.value?.isReady === true
  )
})

const alivePlayers = computed(() => getAlivePlayers(gameState.value))

const currentStoryPack = computed(() => {
  return storyCycles[(gameState.value.round - 1) % storyCycles.length]
})

const phaseTitle = computed(() => {
  switch (gameState.value.phase) {
    case 'role-reveal':
      return 'Your Role'
    case 'intro':
      return 'Intro Story'
    case 'sleep':
      return 'Everyone Falls Asleep'
    case 'sleep-story':
      return 'Everyone Is Sleeping'
    case 'mafia':
      return 'Night: Killer'
    case 'mafia-sleep':
      return 'Killer Falls Asleep'
    case 'detective':
      return 'Night: Detective'
    case 'sunrise':
      return 'Sunrise'
    case 'discussion':
      return 'Discussion'
    case 'voting':
      return 'Vote'
    case 'tie-dialogue':
      return 'Tie Break'
    case 'elimination':
      return 'Elimination'
    case 'ended':
      return 'Game Over'
    default:
      return 'Mafia Nightfall'
  }
})

const narrationText = computed(() => {
  const pack = currentStoryPack.value

  switch (gameState.value.phase) {
    case 'intro':
      return pack.intro
    case 'sleep':
      return pack.sleep
    case 'sleep-story':
      return 'The Game Master looks around the quiet table. Everyone is sleeping now, eyes closed, waiting for the night to reveal its secrets.'
    case 'mafia':
      return pack.mafia
    case 'mafia-sleep':
      return pack.mafia_sleep
    case 'detective':
      return pack.detective
    case 'sunrise':
      return gameState.value.dayStory ?? pack.sunrise
    case 'discussion':
      return pack.discussion
    case 'voting':
      return pack.voting
    case 'tie-dialogue':
      return pack.tie
    case 'elimination':
      return pack.elimination
    default:
      return ''
  }
})

const localRoleLabel = computed(() => {
  return localPlayer.value ? roleLabels[localPlayer.value.role] : 'Unknown'
})

const lastEliminatedName = computed(() => {
  return getDisplayPlayerName(gameState.value.lastEliminatedId)
})

const investigationTargetName = computed(() => {
  return getDisplayPlayerName(gameState.value.investigationTargetId)
})

const canHumansActAsMafia = computed(() => gameState.value.humanTeamRole === 'mafia')

const canHumansActAsDetectives = computed(() => gameState.value.humanTeamRole === 'detective')

const canSeeDetectiveInfo = computed(() => localPlayer.value?.role === 'detective')
const canSeeMafiaInfo = computed(() => localPlayer.value?.role === 'mafia')

const canRunAutomatedGameAction = computed(() => gameState.value.mode !== 'lobby' || isHost.value)

const sleepAcknowledgedCount = computed(() => {
  return alivePlayers.value.filter(
    (player) =>
      player.kind === 'human' && gameState.value.sleepAcknowledgedIds.includes(player.id),
  ).length
})

const hasLocalSleepAcknowledged = computed(() => {
  return Boolean(
    localPlayer.value &&
      gameState.value.sleepAcknowledgedIds.includes(localPlayer.value.id) &&
      localPlayer.value.status === 'alive',
  )
})

const isLocalMafiaTurn = computed(() => nextMafiaVoter.value?.id === localPlayer.value?.id)

const canLocalPlayerVote = computed(() => {
  return Boolean(
    localPlayer.value &&
      gameState.value.phase === 'voting' &&
      localPlayer.value.status === 'alive' &&
      !gameState.value.voteChoices.some((vote) => vote.voterId === localPlayer.value?.id) &&
      getVoteTargets(gameState.value, localPlayer.value.id).length > 0,
  )
})

const mafiaTargets = computed(() => {
  return alivePlayers.value.filter((player) => player.role !== 'mafia')
})

const aliveMafiaPlayers = computed(() => {
  return alivePlayers.value.filter((player) => player.role === 'mafia')
})

const aliveDetectivePlayers = computed(() => {
  return alivePlayers.value.filter((player) => player.role === 'detective')
})

const nextMafiaVoter = computed(() => {
  return aliveMafiaPlayers.value.find((mafia) => {
    return !gameState.value.mafiaVotes.some((vote) => vote.mafiaId === mafia.id)
  })
})

const mafiaVoteSummary = computed(() => {
  return gameState.value.mafiaVotes
    .map((vote) => {
      return `${getDisplayPlayerName(vote.mafiaId)} chose ${getDisplayPlayerName(vote.targetId)}`
    })
    .join('. ')
})

const detectiveTargets = computed(() => {
  if (!localPlayer.value) {
    return []
  }

  return getDetectiveTargets(gameState.value, localPlayer.value.id)
})

const detectiveVoteSummary = computed(() => {
  return gameState.value.detectiveVotes
    .map((vote) => {
      return `${getDisplayPlayerName(vote.detectiveId)} chose ${getDisplayPlayerName(vote.targetId)}`
    })
    .join('. ')
})

const investigationRead = computed(() => {
  if (gameState.value.investigationResult === null) {
    return ''
  }

  return gameState.value.investigationResult ? 'a bad person' : 'a good person'
})

const nextVoteVoter = computed(() => {
  return alivePlayers.value.find((player) => {
    return (
      !gameState.value.voteChoices.some((vote) => vote.voterId === player.id) &&
      getVoteTargets(gameState.value, player.id).length > 0
    )
  })
})

const nextAiVoteVoter = computed(() => {
  return alivePlayers.value.find((player) => {
    return (
      player.kind === 'ai' &&
      !gameState.value.voteChoices.some((vote) => vote.voterId === player.id) &&
      getVoteTargets(gameState.value, player.id).length > 0
    )
  })
})

const voteTargets = computed(() => {
  if (!localPlayer.value) {
    return []
  }

  return getVoteTargets(gameState.value, localPlayer.value.id)
})

const hasLocalDetectiveVoted = computed(() => {
  return Boolean(
    localPlayer.value &&
      gameState.value.detectiveVotes.some((vote) => vote.detectiveId === localPlayer.value?.id),
  )
})

const canLocalInvestigate = computed(() => {
  return Boolean(
    localPlayer.value &&
      gameState.value.phase === 'detective' &&
      gameState.value.investigationTargetId === null &&
      localPlayer.value.status === 'alive' &&
      localPlayer.value.role === 'detective' &&
      !hasLocalDetectiveVoted.value,
  )
})

const hasLocalVoted = computed(() => {
  return Boolean(
    localPlayer.value &&
      gameState.value.voteChoices.some((vote) => vote.voterId === localPlayer.value?.id),
  )
})

const nextRequiredCount = computed(() => {
  return gameState.value.players.filter((player) => player.kind === 'human').length
})

const nextAcknowledgedCount = computed(() => {
  const acknowledgedIds = getCurrentNextAcknowledgedIds()

  return gameState.value.players.filter((player) => {
    return player.kind === 'human' && acknowledgedIds.includes(player.id)
  }).length
})

const hasLocalNextAcknowledged = computed(() => {
  return Boolean(
    localPlayer.value && getCurrentNextAcknowledgedIds().includes(localPlayer.value.id),
  )
})

const nextButtonLabel = computed(() => {
  return `Next ${nextAcknowledgedCount.value}/${nextRequiredCount.value}`
})

const canShowDiscussionVoteButton = computed(() => {
  return gameState.value.phase === 'voting' && localPlayer.value?.status === 'alive' && !hasLocalVoted.value
})

const canOpenVotingFromDiscussion = computed(() => {
  return isDiscussionComplete.value && localPlayer.value?.status === 'alive'
})

const discussionOrder = computed(() => {
  const playersById = new Map(gameState.value.players.map((player) => [player.id, player]))

  return gameState.value.seatOrder
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is Player => Boolean(player && player.status === 'alive'))
})

const currentDiscussionSpeaker = computed(() => {
  return discussionOrder.value[gameState.value.discussionSpeakerIndex] ?? null
})

const discussionChoiceOptions = computed(() => {
  if (gameState.value.discussionPromptSpeakerId !== localPlayer.value?.id) {
    return []
  }

  return gameState.value.discussionPromptOptions
})

const discussionEntries = computed(() => {
  return gameState.value.discussionLog.map((entry) => ({
    speaker: getDisplayPlayerName(entry.speakerId),
    text: entry.text,
  }))
})

const voteEntries = computed(() => {
  return gameState.value.voteChoices.map((vote) => ({
    voter: getDisplayPlayerName(vote.voterId),
    target: getDisplayPlayerName(vote.targetId),
  }))
})

const voteResultEntries = computed(() => {
  const counts = new Map<number, number>()

  for (const vote of gameState.value.voteChoices) {
    counts.set(vote.targetId, (counts.get(vote.targetId) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([playerId, count]) => ({
      playerId,
      name: getDisplayPlayerName(playerId),
      count,
    }))
    .sort((first, second) => second.count - first.count)
})

const isDiscussionComplete = computed(() => {
  return (
    gameState.value.phase === 'discussion' &&
    discussionOrder.value.length > 0 &&
    gameState.value.discussionLog.length >= discussionOrder.value.length &&
    !currentDiscussionSpeaker.value
  )
})

const isStoryModalOpen = computed(() => {
  if (gameState.value.phase === 'sunrise' && gameState.value.lastEliminatedId !== null) {
    return false
  }

  return (
    ['intro', 'sleep', 'sleep-story', 'mafia', 'mafia-sleep', 'detective', 'sunrise'].includes(
      gameState.value.phase,
    ) && !isLocalModalDismissed(`story:${gameState.value.phase}:${gameState.value.round}`)
  )
})

const isDiscussionModalOpen = computed(() => {
  return gameState.value.phase === 'discussion' || gameState.value.phase === 'voting'
})

const isVoteModalOpen = computed(() => {
  return gameState.value.phase === 'voting' && !isVoteModalMinimized.value
})

const isVoteResultModalOpen = computed(() => {
  const key = `vote-result:${gameState.value.phase}:${gameState.value.round}:${gameState.value.voteChoices.length}`

  return (
    (gameState.value.phase === 'tie-dialogue' || gameState.value.phase === 'elimination') &&
    (gameState.value.phase !== 'elimination' || !isVoteResultAcknowledged.value) &&
    !isLocalModalDismissed(key)
  )
})

const isVoteResultAcknowledged = computed(() => {
  const key = `vote-result:${gameState.value.phase}:${gameState.value.round}:${gameState.value.voteChoices.length}`
  const acknowledgedIds = gameState.value.nextAcknowledgements?.[key] ?? []

  return nextRequiredCount.value > 0 && acknowledgedIds.length >= nextRequiredCount.value
})

const isVoteEliminationModalOpen = computed(() => {
  const key = `vote-elimination:${gameState.value.round}:${gameState.value.pendingEliminationId}`

  return (
    gameState.value.phase === 'elimination' &&
    gameState.value.pendingEliminationId !== null &&
    isVoteResultAcknowledged.value &&
    !isLocalModalDismissed(key)
  )
})

const isKillerTargetModalOpen = computed(() => {
  return (
    gameState.value.phase === 'mafia' &&
    gameState.value.pendingEliminationId === null &&
    canSeeMafiaInfo.value
  )
})

const isDetectiveResultModalOpen = computed(() => {
  const key = `detective-result:${gameState.value.round}:${gameState.value.investigationTargetId}`

  return (
    gameState.value.phase === 'detective' &&
    gameState.value.investigationTargetId !== null &&
    canSeeDetectiveInfo.value &&
    !isLocalModalDismissed(key)
  )
})

const isNightDeathModalOpen = computed(() => {
  const key = `night-death:${gameState.value.round}:${gameState.value.lastEliminatedId}`

  return (
    gameState.value.phase === 'sunrise' &&
    gameState.value.lastEliminatedId !== null &&
    isNightDeathIntroAcknowledged.value &&
    !isLocalModalDismissed(key)
  )
})

const isNightDeathIntroModalOpen = computed(() => {
  const key = `night-death-intro:${gameState.value.round}:${gameState.value.lastEliminatedId}`

  return (
    gameState.value.phase === 'sunrise' &&
    gameState.value.lastEliminatedId !== null &&
    !isNightDeathIntroAcknowledged.value &&
    !isLocalModalDismissed(key)
  )
})

const isNightDeathIntroAcknowledged = computed(() => {
  const key = `night-death-intro:${gameState.value.round}:${gameState.value.lastEliminatedId}`
  const acknowledgedIds = gameState.value.nextAcknowledgements?.[key] ?? []

  return nextRequiredCount.value > 0 && acknowledgedIds.length >= nextRequiredCount.value
})

const localNextModalKey = computed(() => {
  if (gameState.value.phase === 'role-reveal' && !hasSeenRoleReveal.value) {
    return `role-reveal:${gameState.value.round}`
  }

  if (
    ['intro', 'sleep-story', 'mafia', 'mafia-sleep', 'detective'].includes(gameState.value.phase) &&
    isStoryModalOpen.value
  ) {
    return `story:${gameState.value.phase}:${gameState.value.round}`
  }

  if (isNightDeathIntroModalOpen.value) {
    return `night-death-intro:${gameState.value.round}:${gameState.value.lastEliminatedId}`
  }

  if (isNightDeathModalOpen.value) {
    return `night-death:${gameState.value.round}:${gameState.value.lastEliminatedId}`
  }

  if (isDetectiveResultModalOpen.value) {
    return `detective-result:${gameState.value.round}:${gameState.value.investigationTargetId}`
  }

  if (isVoteResultModalOpen.value && gameState.value.phase === 'elimination') {
    return `vote-result:${gameState.value.phase}:${gameState.value.round}:${gameState.value.voteChoices.length}`
  }

  if (isVoteEliminationModalOpen.value) {
    return `vote-elimination:${gameState.value.round}:${gameState.value.pendingEliminationId}`
  }

  return null
})

const isRoleRevealModalOpen = computed(() => {
  const key = `role-reveal:${gameState.value.round}`

  return (
    gameState.value.phase === 'role-reveal' &&
    !isLocalModalDismissed(key)
  )
})

const gameMasterScreen = computed(() => {
  if (isRoleRevealModalOpen.value) {
    return {
      key: `role-reveal:${gameState.value.round}:${localPlayer.value?.id ?? 'unknown'}`,
      eyebrow: `Round ${gameState.value.round}`,
      title: 'Your Role',
      speech: `Your role is ${localRoleLabel.value}. Your partner has the same fate. Keep it secret.`,
      variant: 'role',
    }
  }

  if (isDetectiveResultModalOpen.value) {
    return {
      key: `detective-result:${gameState.value.round}:${gameState.value.investigationTargetId}`,
      eyebrow: 'Game Master Result',
      title: investigationTargetName.value,
      speech: `The Game Master quietly says this person looks like ${investigationRead.value}.`,
      variant: 'detective',
    }
  }

  if (isNightDeathIntroModalOpen.value) {
    return {
      key: `night-death-intro:${gameState.value.round}:${gameState.value.lastEliminatedId}`,
      eyebrow: 'Morning News',
      title: 'After morning arose',
      speech: 'After morning arose, one member did not survive and was found lying on the ground.',
      variant: 'death',
    }
  }

  if (isNightDeathModalOpen.value) {
    return {
      key: `night-death:${gameState.value.round}:${gameState.value.lastEliminatedId}`,
      eyebrow: 'Morning News',
      title: 'A member is gone',
      speech: `${lastEliminatedName.value} did not survive the night.`,
      variant: 'death',
    }
  }

  if (isStoryModalOpen.value) {
    return {
      key: `story:${gameState.value.phase}:${gameState.value.round}`,
      eyebrow: `Round ${gameState.value.round}`,
      title: phaseTitle.value,
      speech: narrationText.value,
      variant: gameState.value.phase,
    }
  }

  if (isVoteEliminationModalOpen.value) {
    return {
      key: `vote-elimination:${gameState.value.round}:${gameState.value.pendingEliminationId}`,
      eyebrow: 'Voting Elimination',
      title: 'Town Verdict',
      speech: `${getDisplayPlayerName(gameState.value.pendingEliminationId)} was eliminated by the town's vote.`,
      variant: 'elimination',
    }
  }

  return null
})

const isGameMasterScreenOpen = computed(() => Boolean(gameMasterScreen.value))

const lobbySlots = computed(() => {
  return Array.from({ length: 8 }, (_, index) => {
    const id = index + 1
    const player = gameState.value.players.find((currentPlayer) => currentPlayer.id === id)

    return {
      id,
      seat: `Slot ${id}`,
      player,
      label: id === 1 ? 'Host' : id === 2 ? 'Player 2' : 'AI',
    }
  })
})

function chooseVsAiMode() {
  gameState.value = createVsAiGameState()
  screen.value = 'game'
}

async function createLobbyMode() {
  await runLobbyAction(async () => {
    gameState.value = await createOnlineLobby()
    subscribeCurrentLobby()
    screen.value = 'game'
  })
}

function openJoinLobby() {
  lobbyCodeInput.value = ''
  lobbyError.value = ''
  screen.value = 'join-lobby'
}

function updateLobbyCodeInput(event: Event) {
  const input = event.target as HTMLInputElement
  lobbyCodeInput.value = input.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6)
}

function getDisplayPlayerName(playerId: number | null) {
  const name = getPlayerName(gameState.value, playerId)

  if (playerId === localPlayer.value?.id) {
    return `You (${name})`
  }

  return name
}

function isLocalModalDismissed(key: string) {
  return dismissedLocalModalKeys.value.has(key)
}

function getCurrentNextAcknowledgedIds() {
  if (!localNextModalKey.value) {
    return []
  }

  const acknowledgements = gameState.value.nextAcknowledgements ?? {}

  if (gameState.value.phase === 'role-reveal') {
    return acknowledgements[`role-reveal:${gameState.value.round}`] ?? []
  }

  return acknowledgements[localNextModalKey.value] ?? []
}

function dismissLocalModal() {
  if (!localNextModalKey.value) {
    return
  }

  void acknowledgeNext()
}

async function acknowledgeNext() {
  if (!localPlayer.value || gameState.value.phase === 'sleep') {
    return
  }

  const modalKey = localNextModalKey.value

  if (!modalKey) {
    return
  }

  const nextAcknowledgements = {
    ...(gameState.value.nextAcknowledgements ?? {}),
    [modalKey]: Array.from(
      new Set([...(gameState.value.nextAcknowledgements?.[modalKey] ?? []), localPlayer.value.id]),
    ),
  }
  let nextState = {
    ...gameState.value,
    nextAcknowledgements,
    nextAcknowledgedIds: nextAcknowledgements[modalKey],
  }
  const requiredHumans = nextState.players.filter((player) => player.kind === 'human')
  const acknowledgedCount = requiredHumans.filter((player) =>
    nextState.nextAcknowledgements[modalKey].includes(player.id),
  ).length

  if (
    requiredHumans.length > 0 &&
    (acknowledgedCount < requiredHumans.length || !canRunAutomatedGameAction.value)
  ) {
    gameState.value = nextState
    await persistCurrentGameState()
    return
  }

  await continueAfterNextGate(modalKey, nextState)
}

async function continueAfterNextGate(modalKey: string, currentState = gameState.value) {
  let nextState = currentState

  switch (nextState.phase) {
    case 'role-reveal':
      hasSeenRoleReveal.value = true
      nextState = advanceToIntroPhase(nextState)
      break
    case 'intro':
      nextState = advanceToSleepPhase(nextState)
      break
    case 'sleep-story':
      nextState = advanceToMafiaPhase(nextState)
      break
    case 'mafia':
      await letMafiaAct()
      return
    case 'mafia-sleep':
      nextState = advanceToDetectivePhase(nextState)
      break
    case 'detective':
      if (nextState.investigationTargetId !== null) {
        nextState = advanceToSunrisePhase(nextState)
      }
      break
    case 'sunrise':
      if (modalKey.startsWith('night-death-intro:')) {
        gameState.value = nextState
        await persistCurrentGameState()
        return
      }

      if (nextState.lastEliminatedId !== null && !modalKey.startsWith('night-death:')) {
        break
      }

      nextState = advanceToDiscussionPhase(nextState)
      break
    case 'elimination':
      if (modalKey.startsWith('vote-result:')) {
        gameState.value = nextState
        await persistCurrentGameState()
        return
      }

      nextState = finalizeElimination(nextState)
      break
    default:
      return
  }

  gameState.value = nextState
  await persistCurrentGameState()
}

async function advanceWhenNextGateIsComplete() {
  if (
    isNextGateAdvanceBusy.value ||
    !canRunAutomatedGameAction.value ||
    gameState.value.phase === 'sleep'
  ) {
    return
  }

  const modalKey = localNextModalKey.value

  if (!modalKey) {
    return
  }

  const requiredHumans = gameState.value.players.filter((player) => player.kind === 'human')

  if (requiredHumans.length === 0) {
    return
  }

  const acknowledgedIds = gameState.value.nextAcknowledgements?.[modalKey] ?? []
  const acknowledgedCount = requiredHumans.filter((player) => acknowledgedIds.includes(player.id)).length

  if (acknowledgedCount < requiredHumans.length) {
    return
  }

  isNextGateAdvanceBusy.value = true

  try {
    await continueAfterNextGate(modalKey)
  } finally {
    isNextGateAdvanceBusy.value = false
  }
}

async function joinLobbyMode() {
  const lobbyCode = lobbyCodeInput.value.trim().toUpperCase()

  if (!/^[A-Z0-9]{6}$/.test(lobbyCode)) {
    lobbyError.value = 'Enter a valid 6-character lobby code.'
    return
  }

  await runLobbyAction(async () => {
    gameState.value = await joinOnlineLobby(lobbyCode)
    lobbyError.value = ''
    subscribeCurrentLobby()
    screen.value = 'game'
  })
}

async function toggleReady() {
  if (!localPlayer.value || localPlayer.value.isHost) {
    return
  }

  await runLobbyAction(async () => {
    if (!gameState.value.lobbyCode || !localPlayer.value) {
      return
    }

    await setOnlinePlayerReady(gameState.value.lobbyCode, !localPlayer.value.isReady)
    gameState.value = await refreshOnlineLobby(gameState.value)
  })
}

async function handleStartGame() {
  if (gameState.value.mode !== 'lobby') {
    gameState.value = startGame(gameState.value, gameState.value.localPlayerId)
    scheduleRoleRevealDismissal()
    return
  }

  await runLobbyAction(async () => {
    if (!gameState.value.lobbyCode || !canStartGame.value) {
      return
    }

    const startedState = startGame(gameState.value, gameState.value.localPlayerId)
    await startOnlineLobby(gameState.value.lobbyCode, startedState)
    gameState.value = await refreshOnlineLobby(gameState.value)
    scheduleRoleRevealDismissal()
  })
}

async function acknowledgeSleep() {
  if (!localPlayer.value) {
    return
  }

  gameState.value = acknowledgeSleepPhase(gameState.value, localPlayer.value.id)
  await persistCurrentGameState()
}

async function advanceWhenSleepGateIsComplete() {
  if (
    isSleepGateAdvanceBusy.value ||
    !canRunAutomatedGameAction.value ||
    gameState.value.phase !== 'sleep'
  ) {
    return
  }

  const requiredHumans = getAlivePlayers(gameState.value).filter((player) => player.kind === 'human')

  if (requiredHumans.length === 0) {
    return
  }

  const acknowledgedCount = requiredHumans.filter((player) =>
    gameState.value.sleepAcknowledgedIds.includes(player.id),
  ).length

  if (acknowledgedCount < requiredHumans.length) {
    return
  }

  isSleepGateAdvanceBusy.value = true

  try {
    gameState.value = advanceToSleepStoryPhase(gameState.value)
    await persistCurrentGameState()
  } finally {
    isSleepGateAdvanceBusy.value = false
  }
}

async function selectMafiaTarget(targetId: number) {
  if (!nextMafiaVoter.value) {
    return
  }

  gameState.value = chooseMafiaTarget(gameState.value, nextMafiaVoter.value.id, targetId)

  if (canRunAutomatedGameAction.value && gameState.value.phase === 'mafia') {
    await letMafiaAct()
    return
  }

  await persistCurrentGameState()
}

async function letMafiaAct() {
  let nextState = gameState.value

  for (const mafia of aliveMafiaPlayers.value) {
    if (nextState.mafiaVotes.some((vote) => vote.mafiaId === mafia.id)) {
      continue
    }

    const targetId = pickBotTarget(nextState, true)

    if (!targetId) {
      continue
    }

    nextState = chooseMafiaTarget(nextState, mafia.id, targetId)
  }

  gameState.value = nextState
  await persistCurrentGameState()
}

async function selectDetectiveTarget(targetId: number) {
  if (!localPlayer.value || !canLocalInvestigate.value) {
    return
  }

  gameState.value = chooseDetectiveTarget(gameState.value, localPlayer.value.id, targetId)

  if (canRunAutomatedGameAction.value && gameState.value.phase === 'detective') {
    await letDetectivesAct()
    return
  }

  await persistCurrentGameState()
}

async function letDetectivesAct() {
  let nextState = gameState.value

  for (const detective of aliveDetectivePlayers.value) {
    if (nextState.detectiveVotes.some((vote) => vote.detectiveId === detective.id)) {
      continue
    }

    const targetId = pickDetectiveTarget(nextState, detective.id)

    if (!targetId) {
      continue
    }

    nextState = chooseDetectiveTarget(nextState, detective.id, targetId)
  }

  gameState.value = nextState
  await persistCurrentGameState()
}

async function chooseDiscussionLine(line: string) {
  if (!localPlayer.value) {
    return
  }

  gameState.value = submitDiscussionLine(gameState.value, localPlayer.value.id, line)
  await persistCurrentGameState()
}

async function advanceBotDiscussion() {
  gameState.value = progressBotDiscussionTurn(gameState.value)
  await persistCurrentGameState()
}

async function proceedToVoting() {
  if (!isDiscussionComplete.value) {
    return
  }

  gameState.value = advanceToVotingPhase(gameState.value)
  isVoteModalMinimized.value = false
  await persistCurrentGameState()
}

function openVoteModal() {
  if (gameState.value.phase !== 'voting' || localPlayer.value?.status !== 'alive') {
    return
  }

  isVoteModalMinimized.value = false
}

function minimizeVoteModal() {
  isVoteModalMinimized.value = true
}

async function selectVoteTarget(targetId: number) {
  if (!localPlayer.value || !canLocalPlayerVote.value) {
    return
  }

  gameState.value = castVote(gameState.value, localPlayer.value.id, targetId)
  isVoteModalMinimized.value = true
  await persistCurrentGameState()
}

async function continueAfterTie() {
  gameState.value = restartVoteAfterTie(gameState.value)
  isVoteModalMinimized.value = false
  await persistCurrentGameState()
}

async function advanceAiVote() {
  const voter = nextAiVoteVoter.value

  if (!voter || voter.kind !== 'ai') {
    return
  }

  const targetId = pickVoteTarget(gameState.value, voter.id)

  if (!targetId) {
    return
  }

  gameState.value = castVote(gameState.value, voter.id, targetId)
  await persistCurrentGameState()
}

function resetSetup() {
  gameState.value = createVsAiGameState()
}

function openGame() {
  screen.value = 'mode-select'
}

function openOptions() {
  screen.value = 'options'
}

function returnToLanding() {
  screen.value = 'landing'
}

function openHelp() {
  isHelpOpen.value = true
}

function closeHelp() {
  isHelpOpen.value = false
}

async function runLobbyAction(action: () => Promise<void>) {
  try {
    isLobbyBusy.value = true
    lobbyError.value = ''
    await action()
  } catch (error) {
    console.error('Lobby action failed:', error)
    lobbyError.value = getErrorMessage(error)
  } finally {
    isLobbyBusy.value = false
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }

  return 'Lobby action failed. Check the browser console for details.'
}

async function persistCurrentGameState() {
  if (gameState.value.mode !== 'lobby' || !gameState.value.lobbyCode || gameState.value.phase === 'setup') {
    return
  }

  await updateOnlineGameState(gameState.value.lobbyCode, gameState.value)
}

function unsubscribeCurrentLobby() {
  if (!lobbyChannel.value) {
    if (lobbyRefreshIntervalId.value !== null) {
      window.clearInterval(lobbyRefreshIntervalId.value)
      lobbyRefreshIntervalId.value = null
    }

    return
  }

  lobbyChannel.value.unsubscribe()
  lobbyChannel.value = null

  if (lobbyRefreshIntervalId.value !== null) {
    window.clearInterval(lobbyRefreshIntervalId.value)
    lobbyRefreshIntervalId.value = null
  }
}

function subscribeCurrentLobby() {
  unsubscribeCurrentLobby()

  if (!gameState.value.lobbyCode) {
    return
  }

  lobbyChannel.value = subscribeToLobby(gameState.value.lobbyCode, async () => {
    await refreshCurrentLobby()
  })
  lobbyRefreshIntervalId.value = window.setInterval(() => {
    void refreshCurrentLobby()
  }, 2000)
  void refreshCurrentLobby()
}

async function refreshCurrentLobby() {
  if (isRefreshingLobby.value || !gameState.value.lobbyCode) {
    return
  }

  isRefreshingLobby.value = true

  try {
    gameState.value = await refreshOnlineLobby(gameState.value)
    scheduleRoleRevealDismissal()
  } catch (error) {
    console.error('Lobby refresh failed:', error)
  } finally {
    isRefreshingLobby.value = false
  }
}

function scheduleRoleRevealDismissal() {
  if (roleRevealTimeoutId.value !== null) {
    window.clearTimeout(roleRevealTimeoutId.value)
    roleRevealTimeoutId.value = null
  }
}

function scheduleIntroAdvance() {
  if (introAdvanceTimeoutId.value !== null) {
    window.clearTimeout(introAdvanceTimeoutId.value)
    introAdvanceTimeoutId.value = null
  }

}

function scheduleNightAutomation() {
  if (nightAutomationTimeoutId.value !== null) {
    window.clearTimeout(nightAutomationTimeoutId.value)
    nightAutomationTimeoutId.value = null
  }

  if (!canRunAutomatedGameAction.value) {
    return
  }

  if (gameState.value.phase === 'detective' && !canHumansActAsDetectives.value) {
    nightAutomationTimeoutId.value = window.setTimeout(() => {
      void letDetectivesAct()
      nightAutomationTimeoutId.value = null
    }, 0)
    return
  }

}

function scheduleBotDiscussion() {
  if (botDiscussionTimeoutId.value !== null) {
    window.clearTimeout(botDiscussionTimeoutId.value)
    botDiscussionTimeoutId.value = null
  }

  if (
    !canRunAutomatedGameAction.value ||
    gameState.value.phase !== 'discussion' ||
    currentDiscussionSpeaker.value?.kind !== 'ai'
  ) {
    return
  }

  botDiscussionTimeoutId.value = window.setTimeout(() => {
    void advanceBotDiscussion()
    botDiscussionTimeoutId.value = null
  }, 3000)
}

function scheduleVoteAutomation() {
  if (voteAutomationTimeoutId.value !== null) {
    window.clearTimeout(voteAutomationTimeoutId.value)
    voteAutomationTimeoutId.value = null
  }

  if (
    !canRunAutomatedGameAction.value ||
    gameState.value.phase !== 'voting' ||
    !nextAiVoteVoter.value
  ) {
    return
  }

  voteAutomationTimeoutId.value = window.setTimeout(() => {
    void advanceAiVote()
    voteAutomationTimeoutId.value = null
  }, 2000)
}

function scheduleEliminationAutomation() {
  if (eliminationAutomationTimeoutId.value !== null) {
    window.clearTimeout(eliminationAutomationTimeoutId.value)
    eliminationAutomationTimeoutId.value = null
  }

}

function scheduleLocalNextButton() {
  isLocalNextVisible.value = Boolean(localNextModalKey.value)
}

function clearGameMasterTyping() {
  if (gameMasterTypingIntervalId.value !== null) {
    window.clearInterval(gameMasterTypingIntervalId.value)
    gameMasterTypingIntervalId.value = null
  }
}

function startGameMasterTyping(force = false) {
  const scene = gameMasterScreen.value

  if (!scene) {
    currentGameMasterSceneKey.value = ''
    gameMasterTypedText.value = ''
    isGameMasterTypingComplete.value = true
    clearGameMasterTyping()
    return
  }

  if (!force && currentGameMasterSceneKey.value === scene.key) {
    return
  }

  currentGameMasterSceneKey.value = scene.key
  clearGameMasterTyping()

  const speech = scene.speech

  gameMasterTypedText.value = ''
  isGameMasterTypingComplete.value = false

  if (!speech) {
    isGameMasterTypingComplete.value = true
    return
  }

  let index = 0

  gameMasterTypingIntervalId.value = window.setInterval(() => {
    index += 1
    gameMasterTypedText.value = speech.slice(0, index)

    if (index >= speech.length) {
      clearGameMasterTyping()
      isGameMasterTypingComplete.value = true
    }
  }, 24)
}

onMounted(() => {
  scheduleRoleRevealDismissal()
  scheduleIntroAdvance()
  scheduleNightAutomation()
  scheduleBotDiscussion()
  scheduleVoteAutomation()
  scheduleEliminationAutomation()
  scheduleLocalNextButton()
  startGameMasterTyping(true)
})

watch(
  () => [
    gameState.value.phase,
    gameState.value.discussionSpeakerIndex,
    gameState.value.discussionPromptSpeakerId,
    gameState.value.discussionLog.length,
    gameState.value.detectiveVotes.length,
    gameState.value.investigationTargetId,
    gameState.value.voteChoices.length,
    gameState.value.sleepAcknowledgedIds.length,
    gameState.value.nextAcknowledgedIds.length,
    JSON.stringify(gameState.value.nextAcknowledgements ?? {}),
    nextVoteVoter.value?.id,
    nextAiVoteVoter.value?.id,
    localNextModalKey.value,
    gameMasterScreen.value?.key,
  ],
  () => {
    scheduleIntroAdvance()
    scheduleNightAutomation()
    scheduleBotDiscussion()
    scheduleVoteAutomation()
    scheduleEliminationAutomation()
    scheduleLocalNextButton()
    void advanceWhenSleepGateIsComplete()
    void advanceWhenNextGateIsComplete()
  },
)

watch(
  () => [
    isGameMasterScreenOpen.value,
    gameMasterScreen.value?.key,
    localNextModalKey.value,
  ],
  () => {
    startGameMasterTyping()
  },
)

watch(
  () => gameState.value.discussionLog.length,
  async () => {
    await nextTick()

    if (!discussionLogElement.value) {
      return
    }

    discussionLogElement.value.scrollTo({
      top: discussionLogElement.value.scrollHeight,
      behavior: 'smooth',
    })
  },
)

onBeforeUnmount(() => {
  if (roleRevealTimeoutId.value !== null) {
    window.clearTimeout(roleRevealTimeoutId.value)
  }

  if (introAdvanceTimeoutId.value !== null) {
    window.clearTimeout(introAdvanceTimeoutId.value)
  }

  if (nightAutomationTimeoutId.value !== null) {
    window.clearTimeout(nightAutomationTimeoutId.value)
  }

  if (botDiscussionTimeoutId.value !== null) {
    window.clearTimeout(botDiscussionTimeoutId.value)
  }

  if (voteAutomationTimeoutId.value !== null) {
    window.clearTimeout(voteAutomationTimeoutId.value)
  }

  if (eliminationAutomationTimeoutId.value !== null) {
    window.clearTimeout(eliminationAutomationTimeoutId.value)
  }

  clearGameMasterTyping()

  unsubscribeCurrentLobby()
})
</script>

<template>
  <button type="button" class="help-button" aria-label="Open game information" @click="openHelp">
    ?
  </button>

  <div v-if="isHelpOpen" class="modal-backdrop" role="presentation" @click.self="closeHelp">
    <section
      class="help-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <div class="modal-header">
        <p class="eyebrow">Game Information</p>
        <button type="button" class="icon-button" aria-label="Close help" @click="closeHelp">
          X
        </button>
      </div>

      <h2 id="help-title">How Mafia Nightfall Works</h2>

      <div class="help-content">
        <article>
          <h3>Setup</h3>
          <p>The Game Master secretly gives every player a role. In this version, both human players always share the same team.</p>
        </article>

        <article>
          <h3>Night: Mafia</h3>
          <p>Everyone closes their eyes. The Mafia wake up together and each choose one villager. If they agree, that villager is eliminated. If they disagree, the Game Master randomly picks one of their choices.</p>
        </article>

        <article>
          <h3>Night: Detectives</h3>
          <p>The Mafia close their eyes. The Detectives wake up together and each choose one player to investigate. If they disagree, the Game Master randomly picks one of their choices, then privately says whether that person looks good or bad.</p>
        </article>

        <article>
          <h3>Day</h3>
          <p>Everyone wakes up. The Game Master announces who was eliminated. Then players discuss who seems suspicious.</p>
        </article>

        <article>
          <h3>Voting</h3>
          <p>After discussion, everyone votes to eliminate one player. The two human partners cannot vote each other out in this mode.</p>
        </article>

        <article>
          <h3>Winning</h3>
          <p>Civilians and Detectives win if both Mafia are eliminated. Mafia wins if Mafia are equal to or outnumber non-Mafia players.</p>
        </article>
      </div>
    </section>
  </div>

  <div
    v-if="isDiscussionModalOpen"
    class="modal-backdrop discussion-modal-backdrop"
    role="presentation"
  >
    <section class="help-modal discussion-modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Discussion</p>
          <h2>Everyone speaks</h2>
        </div>
        <strong class="discussion-count">{{ discussionEntries.length }}/{{ discussionOrder.length }}</strong>
      </div>

      <p class="story-text">{{ narrationText }}</p>

      <div v-if="discussionEntries.length" ref="discussionLogElement" class="discussion-log">
        <article
          v-for="(entry, index) in discussionEntries"
          :key="`${index}-${entry.speaker}`"
          class="discussion-line"
        >
          <span>{{ entry.speaker }}</span>
          <p>{{ entry.text }}</p>
        </article>
      </div>

      <p v-if="currentDiscussionSpeaker" class="warning-text">
        Next speaker: {{ getDisplayPlayerName(currentDiscussionSpeaker.id) }}
      </p>

      <div
        v-if="currentDiscussionSpeaker?.id === localPlayer?.id && discussionChoiceOptions.length"
        class="target-grid"
      >
        <button
          v-for="option in discussionChoiceOptions"
          :key="option"
          type="button"
          class="target-button"
          @click="chooseDiscussionLine(option)"
        >
          {{ option }}
        </button>
      </div>

      <p
        v-else-if="gameState.phase === 'discussion' && currentDiscussionSpeaker?.kind === 'human'"
        class="warning-text"
      >
        Waiting for {{ getDisplayPlayerName(currentDiscussionSpeaker.id) }} to speak.
      </p>

      <div v-if="voteEntries.length" class="vote-log">
        <p class="eyebrow">Vote Log</p>
        <article
          v-for="(entry, index) in voteEntries"
          :key="`${index}-${entry.voter}-${entry.target}`"
          class="vote-line"
        >
          <span>{{ entry.voter }}</span>
          <strong>{{ entry.target }}</strong>
        </article>
      </div>

      <button
        v-if="canOpenVotingFromDiscussion"
        type="button"
        @click="proceedToVoting"
      >
        Vote
      </button>
      <p
        v-else-if="isDiscussionComplete && localPlayer?.status !== 'alive'"
        class="warning-text"
      >
        You were eliminated. You can only spectate voting.
      </p>
      <button
        v-else-if="canShowDiscussionVoteButton"
        type="button"
        @click="openVoteModal"
      >
        Vote
      </button>
      <p v-else-if="gameState.phase === 'voting' && hasLocalVoted" class="warning-text">
        Your vote is locked in.
      </p>
      <p v-else-if="gameState.phase === 'voting'" class="warning-text">
        You were eliminated. You can only spectate voting.
      </p>
    </section>
  </div>

  <div
    v-if="isVoteModalOpen"
    class="modal-backdrop vote-modal-backdrop"
    role="presentation"
  >
    <section class="help-modal vote-modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Town Vote</p>
          <h2>Choose a player</h2>
        </div>
        <button type="button" class="icon-button" aria-label="Minimize vote" @click="minimizeVoteModal">
          -
        </button>
      </div>

      <p v-if="nextAiVoteVoter" class="warning-text">
        Waiting for {{ getDisplayPlayerName(nextAiVoteVoter.id) }} to vote.
      </p>
      <p v-else-if="nextVoteVoter" class="warning-text">
        Waiting for the remaining human vote.
      </p>

      <div v-if="canLocalPlayerVote" class="target-grid">
        <button
          v-for="player in voteTargets"
          :key="player.id"
          type="button"
          class="target-button"
          @click="selectVoteTarget(player.id)"
        >
          {{ player.name }}
        </button>
      </div>

      <p v-else-if="localPlayer?.status === 'alive' && hasLocalVoted" class="warning-text">
        Your vote is locked in. Waiting for the remaining votes.
      </p>
      <p v-else-if="localPlayer?.status === 'alive'" class="warning-text">
        Waiting for AI votes to come in.
      </p>
      <p v-else class="warning-text">You were eliminated. You can only spectate voting.</p>
    </section>
  </div>

  <div
    v-if="isVoteResultModalOpen"
    class="modal-backdrop vote-modal-backdrop"
    role="presentation"
  >
    <section class="help-modal vote-modal" role="dialog" aria-modal="true">
      <p class="eyebrow">{{ gameState.phase === 'tie-dialogue' ? 'Vote tie' : 'Vote result' }}</p>

      <template v-if="gameState.phase === 'tie-dialogue'">
        <h2>The vote is tied.</h2>
        <p class="story-text">
          Vote again, but this time only the tied players can be selected.
        </p>
        <p v-if="gameState.tiedPlayerIds.length" class="result-text">
          Tied players:
          {{ gameState.tiedPlayerIds.map((playerId) => getDisplayPlayerName(playerId)).join(' and ') }}.
        </p>
      </template>

      <template v-else>
        <h2>{{ getDisplayPlayerName(gameState.pendingEliminationId) }} has the highest vote.</h2>
        <p class="story-text">The town has made its decision. This player will be eliminated automatically.</p>
      </template>

      <div v-if="voteResultEntries.length" class="vote-log">
        <p class="eyebrow">Vote Count</p>
        <article
          v-for="entry in voteResultEntries"
          :key="entry.playerId"
          class="vote-line"
        >
          <span>{{ entry.name }}</span>
          <strong>{{ entry.count }}</strong>
        </article>
      </div>

      <button
        v-if="gameState.phase === 'tie-dialogue' && localPlayer?.status === 'alive'"
        type="button"
        @click="continueAfterTie"
      >
        Vote Again
      </button>
      <p
        v-else-if="gameState.phase === 'tie-dialogue'"
        class="warning-text"
      >
        You were eliminated. You can only spectate the vote.
      </p>
      <p v-else class="warning-text">Elimination will continue automatically.</p>
      <button
        v-if="gameState.phase === 'elimination' && isLocalNextVisible && localNextModalKey"
        type="button"
        class="secondary-button"
        :disabled="hasLocalNextAcknowledged"
        @click="dismissLocalModal"
      >
        {{ nextButtonLabel }}
      </button>
    </section>
  </div>

  <main v-if="screen === 'landing'" class="menu-shell landing-menu-shell">
    <section class="menu-panel landing-menu-panel" aria-labelledby="landing-title">
      <p class="landing-kicker">Nightfall Table</p>
      <h1 id="landing-title">Mafia</h1>
      <p class="landing-subtitle">A quiet town. Hidden roles. One vote at a time.</p>

      <div class="menu-actions" aria-label="Main menu">
        <button type="button" @click="openGame">Play</button>
        <button type="button" class="secondary-button" @click="openOptions">Options</button>
      </div>
    </section>
  </main>

  <main v-else-if="screen === 'options'" class="menu-shell">
    <section class="menu-panel options-panel" aria-labelledby="options-title">
      <p class="eyebrow">Settings</p>
      <h1 id="options-title">Options</h1>

      <div class="settings-list">
        <label class="slider-control">
          <span>Music</span>
          <input v-model="musicVolume" type="range" min="0" max="100" />
          <strong>{{ musicVolume }}%</strong>
        </label>

        <label class="slider-control">
          <span>SFX</span>
          <input v-model="sfxVolume" type="range" min="0" max="100" />
          <strong>{{ sfxVolume }}%</strong>
        </label>
      </div>

      <div class="menu-actions">
        <button type="button" class="secondary-button" @click="returnToLanding">Back</button>
      </div>
    </section>
  </main>

  <main v-else-if="screen === 'mode-select'" class="menu-shell">
    <section class="menu-panel mode-panel" aria-labelledby="mode-title">
      <p class="eyebrow">Choose table</p>
      <h1 id="mode-title">Play</h1>

      <div class="mode-card-list">
        <button type="button" class="mode-card-button" @click="createLobbyMode">
          <span>Create Lobby</span>
          <small>Generate a lobby code. The host starts after Player 2 joins.</small>
        </button>

        <button type="button" class="mode-card-button" @click="openJoinLobby">
          <span>Join Lobby</span>
          <small>Enter a lobby code from another host and join as Player 2.</small>
        </button>
      </div>

      <div class="menu-actions">
        <button type="button" class="secondary-button" @click="returnToLanding">Back</button>
      </div>
    </section>
  </main>

  <main v-else-if="screen === 'join-lobby'" class="menu-shell">
    <section class="menu-panel options-panel" aria-labelledby="join-title">
      <p class="eyebrow">Lobby code</p>
      <h1 id="join-title">Join Lobby</h1>

      <form class="join-form" @submit.prevent="joinLobbyMode">
        <label class="code-control">
          <span>Code</span>
          <input
            :value="lobbyCodeInput"
            type="text"
            maxlength="6"
            placeholder="ABC123"
            autocomplete="off"
            @input="updateLobbyCodeInput"
          />
        </label>

        <div class="menu-actions">
          <button type="submit" :disabled="!lobbyCodeInput.trim() || isLobbyBusy">
            {{ isLobbyBusy ? 'Joining...' : 'Join' }}
          </button>
          <button type="button" class="secondary-button" @click="openGame">Back</button>
        </div>

        <p v-if="lobbyError" class="warning-text">{{ lobbyError }}</p>
      </form>
    </section>
  </main>

  <main v-else class="game-shell" :class="{ 'lobby-only-shell landing-menu-shell': isLobbyWaiting }">
    <section v-if="gameState.mode !== 'lobby' && !isGameStarted" class="hero-panel">
      <p class="eyebrow">Computer controlled Game Master</p>
      <h1>Mafia Nightfall</h1>

      <div class="hero-actions" aria-label="Game setup actions">
        <button type="button" @click="chooseVsAiMode">2P VS Bots</button>
        <button type="button" class="secondary-button" @click="createLobbyMode">
          Create Lobby
        </button>
        <button type="button" @click="resetSetup">Reset Setup</button>
        <span>{{ gameState.phase.toUpperCase() }} PHASE</span>
      </div>
    </section>

    <section v-if="gameState.mode !== 'lobby' && !isGameStarted" class="dashboard" aria-label="Game setup overview">
      <article class="card game-master">
        <span class="card-kicker">Game Master</span>
        <h2>{{ gameState.gameMaster.name }}</h2>
        <p>{{ gameState.gameMaster.description }}</p>
      </article>

      <article class="card">
        <span class="card-kicker">Current Mode</span>
        <h2>{{ gameState.mode === 'vs-ai' ? '2P VS Bots' : 'Lobby Code' }}</h2>
        <p v-if="gameState.lobbyCode" class="lobby-code">{{ gameState.lobbyCode }}</p>
        <p v-else>Two human players share one team. The other six seats are bots.</p>
      </article>

      <article class="card lobby-controls">
        <span class="card-kicker">Host Controls</span>
        <h2>{{ gameState.players.length }} / 8 Seats Filled</h2>
        <p>2P VS Bots is ready with two humans and six AI players.</p>

        <div class="control-row">
          <button type="button" :disabled="!canStartGame" @click="handleStartGame">
            Start Game
          </button>
        </div>

        <p v-if="!canStartGame" class="warning-text">Host can start after all 8 seats are filled.</p>
      </article>

      <article class="card">
        <span class="card-kicker">Hidden Team</span>
        <h2>Human fate is unknown</h2>
        <ul class="role-list" aria-label="Role distribution">
          <li v-for="(count, role) in roleCounts" :key="role">
            <span>{{ roleLabels[role] }}</span>
            <strong>{{ count }}</strong>
          </li>
        </ul>
      </article>
    </section>

    <section v-if="isLobbyWaiting" class="lobby-topbar" aria-label="Lobby controls">
      <button
        type="button"
        class="back-arrow-button"
        aria-label="Back to play menu"
        @click="openGame"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2Z" />
        </svg>
      </button>

      <div class="control-row">
        <button
          v-if="!isHost"
          type="button"
          :class="{ 'secondary-button': localPlayer?.isReady }"
          :disabled="isLobbyBusy"
          @click="toggleReady"
        >
          {{ localPlayer?.isReady ? 'Unready' : 'Ready' }}
        </button>
        <button v-else type="button" :disabled="!canStartGame || isLobbyBusy" @click="handleStartGame">
          {{ isLobbyBusy ? 'Starting...' : 'Start Game' }}
        </button>
      </div>
    </section>

    <section
      v-if="isGameMasterScreenOpen && gameMasterScreen"
      class="game-master-screen"
      :class="`game-master-screen-${gameMasterScreen.variant}`"
      aria-live="polite"
    >
      <div class="game-master-stage">
        <p class="eyebrow">{{ gameMasterScreen.eyebrow }}</p>
        <h2>{{ gameMasterScreen.title }}</h2>

        <div class="game-master-dialogue">
          <div class="game-master-avatar" aria-hidden="true">🎭</div>
          <div class="speech-bubble">
            <p>{{ gameMasterTypedText }}<span v-if="!isGameMasterTypingComplete" class="typing-caret"></span></p>
          </div>
        </div>

        <template v-if="isGameMasterTypingComplete && canLocalInvestigate">
          <div class="target-grid detective-target-grid">
            <button
              v-for="player in detectiveTargets"
              :key="player.id"
              type="button"
              class="target-button"
              @click="selectDetectiveTarget(player.id)"
            >
              {{ player.name }}
            </button>
          </div>
        </template>

        <template v-else-if="isGameMasterTypingComplete && isKillerTargetModalOpen">
          <p v-if="nextMafiaVoter && !isLocalMafiaTurn" class="warning-text">
            Waiting for {{ getDisplayPlayerName(nextMafiaVoter.id) }} to choose.
          </p>
          <div v-else-if="canHumansActAsMafia && isLocalMafiaTurn" class="target-grid">
            <button
              v-for="player in mafiaTargets"
              :key="player.id"
              type="button"
              class="target-button"
              @click="selectMafiaTarget(player.id)"
            >
              {{ player.name }}
            </button>
          </div>
        </template>

        <p
          v-else-if="isGameMasterTypingComplete && canSeeDetectiveInfo && detectiveVoteSummary"
          class="result-text"
        >
          {{ detectiveVoteSummary }}.
        </p>

        <p
          v-else-if="isGameMasterTypingComplete && canSeeDetectiveInfo && hasLocalDetectiveVoted && gameState.investigationTargetId === null"
          class="warning-text"
        >
          Investigation submitted. Waiting for your partner.
        </p>

        <p
          v-else-if="isGameMasterTypingComplete && canSeeMafiaInfo && mafiaVoteSummary"
          class="result-text"
        >
          {{ mafiaVoteSummary }}.
        </p>

        <template v-else-if="gameState.phase === 'sleep'">
          <button
            v-if="isGameMasterTypingComplete"
            type="button"
            :disabled="hasLocalSleepAcknowledged"
            @click="acknowledgeSleep"
          >
            Sleep {{ sleepAcknowledgedCount }}/{{ aliveHumanCount }}
          </button>
        </template>

        <button
          v-else-if="isGameMasterTypingComplete && isLocalNextVisible && localNextModalKey"
          type="button"
          class="secondary-button"
          :disabled="hasLocalNextAcknowledged"
          @click="dismissLocalModal"
        >
          {{ nextButtonLabel }}
        </button>

        <p
          v-if="gameState.phase === 'sleep' && hasLocalSleepAcknowledged && sleepAcknowledgedCount < aliveHumanCount"
          class="warning-text"
        >
          Waiting for the other human player.
        </p>
      </div>
    </section>

    <section v-if="isGameStarted && !isGameMasterScreenOpen" class="players-section game-flow-section" aria-labelledby="game-flow-heading">
      <div class="section-heading">
        <p class="eyebrow">Round {{ gameState.round }}</p>
        <h2 id="game-flow-heading">{{ phaseTitle }}</h2>
      </div>

      <article class="game-flow-card">
        <template v-if="gameState.phase === 'role-reveal'">
          <p class="eyebrow">Secret Team</p>
          <h3>You are {{ localRoleLabel }}</h3>
          <p>The night will begin automatically.</p>
        </template>

        <template v-else-if="gameState.phase === 'intro'">
          <p class="eyebrow">Narration</p>
          <h3>The first story begins.</h3>
        </template>

        <template v-else-if="gameState.phase === 'sleep'">
          <p class="eyebrow">Night falls</p>
          <h3>Everyone closes their eyes.</h3>
        </template>

        <template v-else-if="gameState.phase === 'sleep-story'">
          <p class="eyebrow">The room is quiet</p>
          <h3>The Game Master confirms that everyone is sleeping.</h3>
        </template>

        <template v-else-if="gameState.phase === 'mafia'">
          <p class="eyebrow">Everyone closes their eyes</p>
          <h3>The killer chooses one player to eliminate.</h3>
        </template>

        <template v-else-if="gameState.phase === 'detective'">
          <p class="eyebrow">Mafia close their eyes</p>
          <h3>The detective is investigating a person.</h3>
        </template>

        <template v-else-if="gameState.phase === 'mafia-sleep'">
          <p class="eyebrow">Quiet again</p>
          <h3>The killer closes their eyes.</h3>
        </template>

        <template v-else-if="gameState.phase === 'sunrise'">
          <p class="eyebrow">Morning arrives</p>
          <h3>Morning reveals the result of the night.</h3>
        </template>

        <template v-else-if="gameState.phase === 'discussion'">
          <p class="eyebrow">Talk it out</p>
          <h3>Discussion is open.</h3>
          <p class="story-text">{{ narrationText }}</p>
          <p class="warning-text">Dialogue is shown in the discussion modal.</p>
        </template>

        <template v-else-if="gameState.phase === 'voting'">
          <p class="eyebrow">Town vote</p>
          <h3>Voting is open.</h3>
          <p class="story-text">{{ narrationText }}</p>
          <p class="warning-text">Vote from the vote modal. The discussion modal stays open for review.</p>
        </template>

        <template v-else-if="gameState.phase === 'tie-dialogue'">
          <p class="eyebrow">Vote tie</p>
          <h3>The tied players need a runoff vote.</h3>
          <p class="story-text">{{ narrationText }}</p>
          <p v-if="gameState.tiedPlayerIds.length" class="result-text">
            {{ gameState.tiedPlayerIds.map((playerId) => getDisplayPlayerName(playerId)).join(' and ') }} are tied.
          </p>
          <p class="warning-text">Resolve this from the vote result modal.</p>
        </template>

        <template v-else-if="gameState.phase === 'elimination'">
          <p class="eyebrow">Final choice</p>
          <h3>{{ getDisplayPlayerName(gameState.pendingEliminationId) }} is the most voted player.</h3>
          <p class="story-text">{{ narrationText }}</p>
          <p class="warning-text">Elimination will continue automatically.</p>
        </template>

        <template v-else>
          <p class="eyebrow">Winner</p>
          <h3>{{ gameState.winner === 'mafia' ? 'Mafia wins.' : 'Civilians and Detectives win.' }}</h3>
          <button type="button" @click="openGame">Back to Play Menu</button>
        </template>
      </article>

    </section>

    <section v-if="!isGameStarted" class="players-section" aria-labelledby="players-heading">
      <div v-if="gameState.mode === 'lobby'" class="sticky-code-note">
        <span>Lobby Code</span>
        <strong>{{ gameState.lobbyCode }}</strong>
      </div>

      <div v-if="gameState.mode !== 'lobby'" class="section-heading">
        <p class="eyebrow">Assigned Seats</p>
        <h2 id="players-heading">Starting Player Board</h2>
      </div>

      <div :class="gameState.mode === 'lobby' ? 'lobby-player-list' : 'player-grid'">
        <article
          v-for="slot in lobbySlots"
          :key="slot.id"
          :class="[
            gameState.mode === 'lobby' ? 'lobby-player-row' : 'player-card',
            slot.player ? `role-${slot.player.role}` : 'empty-seat',
          ]"
        >
          <span>{{ slot.player?.name ?? 'Waiting for other player' }}</span>
          <span>{{ slot.player ? (slot.player.kind === 'human' ? 'Player' : 'AI') : '-' }}</span>
          <strong>
            {{
              !slot.player
                ? 'Not Ready'
                : slot.player.isHost
                  ? 'Host'
                  : slot.player.isReady
                    ? 'Ready'
                    : 'Not Ready'
            }}
          </strong>
        </article>
      </div>
    </section>
  </main>
</template>
