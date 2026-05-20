const roleDeck = [
  'mafia',
  'mafia',
  'detective',
  'detective',
  'villager',
  'villager',
  'villager',
  'villager',
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

const aiNames = ['Ada Bot', 'Cipher Bot', 'Echo Bot', 'Grim Bot', 'Ivy Bot', 'Knox Bot']

export function createLobbyCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export function createLobbyState(lobbyCode, hostClientId) {
  const humanTeamRole = 'detective'
  const hostName = pickRandom(humanNames)
  const host = createPlayer(1, hostName, 'human', humanTeamRole, true, true)
  const botRoles = createBotRoleDeck(humanTeamRole)
  const bots = aiNames.map((name, index) =>
    createPlayer(index + 3, name, 'ai', botRoles[index], false, true),
  )
  const players = [host, ...bots]

  return {
    lobby: {
      code: lobbyCode,
      host_client_id: hostClientId,
      status: 'waiting',
    },
    playerRows: players.map((player) => ({
      lobby_code: lobbyCode,
      client_id: player.isHost ? hostClientId : `ai-${lobbyCode}-${player.id}`,
      slot_number: player.id,
      display_name: player.name,
      kind: player.kind,
      is_host: player.isHost,
      is_ready: player.isReady,
    })),
    gameState: createBaseGameState(lobbyCode, humanTeamRole, players),
  }
}

export function createPlayerTwo(lobbyCode, clientId, existingNames) {
  return {
    lobby_code: lobbyCode,
    client_id: clientId,
    slot_number: 2,
    display_name: pickAvailableName(existingNames),
    kind: 'human',
    is_host: false,
    is_ready: false,
  }
}

function createBaseGameState(lobbyCode, humanTeamRole, players) {
  return {
    gameMaster: {
      name: 'The Computer',
      description: 'Runs the lobby, assigns roles, and manages the game flow.',
    },
    mode: 'lobby',
    lobbyCode,
    localPlayerId: 1,
    hostPlayerId: 1,
    humanTeamRole,
    phase: 'setup',
    round: 1,
    nextAcknowledgedIds: [],
    nextAcknowledgements: {},
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
    seatOrder: players.map((player) => player.id),
    players,
  }
}

function createPlayer(id, name, kind, role, isHost, isReady) {
  return {
    id,
    seat: `Seat ${id}`,
    name,
    role,
    status: 'alive',
    kind,
    isHost,
    isReady,
  }
}

function createBotRoleDeck(humanTeamRole) {
  let assignedHumanRoles = 0
  const remainingRoles = roleDeck.filter((role) => {
    if (role !== humanTeamRole || assignedHumanRoles >= 2) {
      return true
    }

    assignedHumanRoles += 1
    return false
  })

  return shuffleItems(remainingRoles)
}

function pickAvailableName(existingNames) {
  return shuffleItems(humanNames).find((name) => !existingNames.includes(name)) ?? 'Mystery Guest'
}

function pickRandom(items) {
  return shuffleItems(items)[0]
}

function shuffleItems(items) {
  return [...items].sort(() => Math.random() - 0.5)
}
