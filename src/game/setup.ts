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

function shuffleRoles(roles: PlayerRole[]) {
  return [...roles].sort(() => Math.random() - 0.5)
}

function createLobbyCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function assignRoles(players: Omit<Player, 'role' | 'status'>[]): Player[] {
  const roles = shuffleRoles(roleDeck)

  return players.map((player, index) => ({
    ...player,
    role: roles[index],
    status: 'alive',
  }))
}

function createBaseState(mode: GameMode, players: Omit<Player, 'role' | 'status'>[]): GameState {
  return {
    gameMaster: {
      name: 'The Computer',
      description:
        'Handles role assignment now. Later it can resolve night actions, announce results, and manage voting.',
    },
    mode,
    lobbyCode: mode === 'lobby' ? createLobbyCode() : null,
    localPlayerId: 1,
    hostPlayerId: 1,
    phase: 'setup',
    players: assignRoles(players),
  }
}

export function createVsAiGameState(): GameState {
  const players = playerNames.map((_, index) => ({
    id: index + 1,
    seat: `Seat ${index + 1}`,
    name: index === 0 ? 'You' : aiNames[index - 1],
    kind: index === 0 ? 'human' as const : 'ai' as const,
    isHost: index === 0,
  }))

  return createBaseState('vs-ai', players)
}

export function createLobbyGameState(): GameState {
  return createBaseState('lobby', [
    {
      id: 1,
      seat: 'Seat 1',
      name: 'You',
      kind: 'human',
      isHost: true,
    },
  ])
}

export function addAiPlayer(gameState: GameState): GameState {
  if (gameState.players.length >= roleDeck.length) {
    return gameState
  }

  const nextId = Math.max(...gameState.players.map((player) => player.id)) + 1
  const aiIndex = gameState.players.filter((player) => player.kind === 'ai').length

  return {
    ...gameState,
    players: assignRoles([
      ...gameState.players.map(({ role: _role, status: _status, ...player }) => player),
      {
        id: nextId,
        seat: `Seat ${gameState.players.length + 1}`,
        name: aiNames[aiIndex] ?? `AI Player ${aiIndex + 1}`,
        kind: 'ai',
        isHost: false,
      },
    ]),
  }
}

export function fillLobbyWithAi(gameState: GameState): GameState {
  let nextState = gameState

  while (nextState.players.length < roleDeck.length) {
    nextState = addAiPlayer(nextState)
  }

  return nextState
}

export function startGame(gameState: GameState, requestedByPlayerId: number): GameState {
  const canStart = gameState.hostPlayerId === requestedByPlayerId && gameState.players.length === roleDeck.length

  if (!canStart) {
    return gameState
  }

  return {
    ...gameState,
    phase: 'night',
  }
}
