import type { GameMode, GameState, Player, PlayerRole } from './types'

export const roleLabels: Record<PlayerRole, string> = {
  mafia: 'Mafia',
  detective: 'Detective',
  villager: 'Villager',
}

const roleDeck: PlayerRole[] = [
  'mafia',
  'mafia',
  'detective',
  'detective',
  'villager',
  'villager',
  'villager',
  'villager',
]

const playerNames = [
  'Player 1',
  'Player 2',
  'Player 3',
  'Player 4',
  'Player 5',
  'Player 6',
  'Player 7',
  'Player 8',
]

const aiNames = [
  'Ada Bot',
  'Cipher Bot',
  'Echo Bot',
  'Grim Bot',
  'Ivy Bot',
  'Knox Bot',
  'Mara Bot',
]

const humanNames = [
  'Raven Cross',
  'Silas Vane',
  'Mira Vale',
  'Nico Ash',
  'Iris Black',
  'Victor Hale',
  'June Marlow',
  'Ezra Stone',
  'Clara Night',
  'Rowan Graves',
]

function shuffleItems<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5)
}

function createLobbyCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function chooseHumanTeamRole(): PlayerRole {
  return 'detective'
}

function createBotRoleDeck(humanTeamRole: PlayerRole) {
  let assignedHumanRoles = 0

  return roleDeck.filter((role) => {
    if (role !== humanTeamRole || assignedHumanRoles >= 2) {
      return true
    }

    assignedHumanRoles += 1
    return false
  })
}

function pickHumanNames() {
  return shuffleItems(humanNames).slice(0, 2)
}

function pickAvailableHumanName(existingNames: string[]) {
  return shuffleItems(humanNames).find((name) => !existingNames.includes(name)) ?? 'Mystery Guest'
}

function assignRoles(
  players: Omit<Player, 'role' | 'status'>[],
  humanTeamRole: PlayerRole,
): Player[] {
  const botRoles = shuffleItems(createBotRoleDeck(humanTeamRole))
  let nextBotRole = 0

  return players.map((player) => ({
    ...player,
    role: player.kind === 'human' ? humanTeamRole : botRoles[nextBotRole++],
    status: 'alive',
  }))
}

function createBaseState(
  mode: GameMode,
  players: Omit<Player, 'role' | 'status'>[],
  humanTeamRole = chooseHumanTeamRole(),
): GameState {
  const assignedPlayers = assignRoles(players, humanTeamRole)

  return {
    gameMaster: {
      name: 'The Computer',
      description:
        'Keeps the two human players on the same team, assigns bot roles, and will later resolve night actions, announcements, and voting.',
    },
    mode,
    lobbyCode: mode === 'lobby' ? createLobbyCode() : null,
    localPlayerId: 1,
    hostPlayerId: 1,
    humanTeamRole,
    phase: 'setup',
    round: 1,
    seatOrder: assignedPlayers.map((player) => player.id),
    pendingEliminationId: null,
    sleepAcknowledgedIds: [],
    mafiaVotes: [],
    lastEliminatedId: null,
    detectiveVotes: [],
    voteChoices: [],
    tiedPlayerIds: [],
    discussionSpeakerIndex: 0,
    discussionPromptSpeakerId: null,
    discussionPromptOptions: [],
    discussionLog: [],
    investigationTargetId: null,
    investigationResult: null,
    dayStory: null,
    winner: null,
    players: assignedPlayers,
  }
}

function createHumanPlayer(index: number, name: string) {
  return {
    id: index + 1,
    seat: `Seat ${index + 1}`,
    name,
    kind: 'human' as const,
    isHost: index === 0,
    isReady: index === 0,
  }
}

function createAiSeat(index: number, aiIndex: number) {
  return {
    id: index + 1,
    seat: `Seat ${index + 1}`,
    name: aiNames[aiIndex] ?? `AI Player ${aiIndex + 1}`,
    kind: 'ai' as const,
    isHost: false,
    isReady: true,
  }
}

export function createVsAiGameState(): GameState {
  const humanPlayerNames = pickHumanNames()
  const humans = [
    createHumanPlayer(0, humanPlayerNames[0]),
    { ...createHumanPlayer(1, humanPlayerNames[1]), isReady: true },
  ]
  const bots = playerNames.slice(2).map((_, index) => createAiSeat(index + 2, index))

  return createBaseState('vs-ai', [...humans, ...bots])
}

export function addHumanPlayer(gameState: GameState): GameState {
  const humanCount = gameState.players.filter((player) => player.kind === 'human').length

  if (humanCount >= 2 || gameState.players.length >= roleDeck.length) {
    return gameState
  }

  return {
    ...gameState,
    players: assignRoles(
      [
        ...gameState.players.map(({ role: _role, status: _status, ...player }) => player),
        createHumanPlayer(
          humanCount,
          pickAvailableHumanName(gameState.players.map((player) => player.name)),
        ),
      ],
      gameState.humanTeamRole,
    ).sort((first, second) => first.id - second.id),
  }
}

export function createLobbyGameState(): GameState {
  const humanPlayerNames = pickHumanNames()
  const host = createHumanPlayer(0, humanPlayerNames[0])
  const bots = playerNames.slice(2).map((_, index) => createAiSeat(index + 2, index))

  return createBaseState('lobby', [host, ...bots])
}

export function setPlayerReady(
  gameState: GameState,
  playerId: number,
  isReady: boolean,
): GameState {
  return {
    ...gameState,
    players: gameState.players.map((player) =>
      player.id === playerId ? { ...player, isReady } : player,
    ),
  }
}

export function startGame(gameState: GameState, requestedByPlayerId: number): GameState {
  const humanCount = gameState.players.filter((player) => player.kind === 'human').length
  const secondHuman = gameState.players.find((player) => player.kind === 'human' && !player.isHost)
  const canStart =
    gameState.hostPlayerId === requestedByPlayerId &&
    gameState.players.length === roleDeck.length &&
    humanCount === 2 &&
    secondHuman?.isReady === true

  if (!canStart) {
    return gameState
  }

  return randomizeSeating({
    ...gameState,
    phase: 'role-reveal',
  })
}

function randomizeSeating(gameState: GameState): GameState {
  const shuffledPlayerIds = shuffleItems(gameState.players.map((player) => player.id))
  const seatByPlayerId = new Map(
    shuffledPlayerIds.map((playerId, index) => [playerId, `Seat ${index + 1}`]),
  )

  return {
    ...gameState,
    seatOrder: shuffledPlayerIds,
    players: gameState.players.map((player) => ({
      ...player,
      seat: seatByPlayerId.get(player.id) ?? player.seat,
    })),
  }
}
