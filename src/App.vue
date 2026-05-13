<script setup lang="ts">
import type { RealtimeChannel } from '@supabase/supabase-js'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  advanceToMafiaPhase,
  announceDay,
  beginDiscussion,
  beginVoting,
  chooseDetectiveTarget,
  chooseMafiaTarget,
  getAlivePlayers,
  getPlayerName,
  pickBotTarget,
  voteOutPlayer,
} from './game/flow'
import {
  createVsAiGameState,
  roleLabels,
  startGame,
} from './game/setup'
import type { PlayerRole } from './game/types'
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
const isLobbyBusy = ref(false)

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

const localRoleLabel = computed(() => {
  return localPlayer.value ? roleLabels[localPlayer.value.role] : 'Unknown'
})

const lastEliminatedName = computed(() => {
  return getPlayerName(gameState.value, gameState.value.lastEliminatedId)
})

const investigationTargetName = computed(() => {
  return getPlayerName(gameState.value, gameState.value.investigationTargetId)
})

const canHumansActAsMafia = computed(() => gameState.value.humanTeamRole === 'mafia')

const canHumansActAsDetectives = computed(() => gameState.value.humanTeamRole === 'detective')

const mafiaTargets = computed(() => {
  return alivePlayers.value.filter((player) => player.role !== 'mafia')
})

const detectiveTargets = computed(() => alivePlayers.value)

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
    return
  }

  await runLobbyAction(async () => {
    if (!gameState.value.lobbyCode || !canStartGame.value) {
      return
    }

    const startedState = startGame(gameState.value, gameState.value.localPlayerId)
    await startOnlineLobby(gameState.value.lobbyCode, startedState)
    gameState.value = await refreshOnlineLobby(gameState.value)
  })
}

async function continueToNight() {
  gameState.value = advanceToMafiaPhase(gameState.value)
  await persistCurrentGameState()
}

async function selectMafiaTarget(playerId: number) {
  gameState.value = chooseMafiaTarget(gameState.value, playerId)
  await persistCurrentGameState()
}

async function letMafiaAct() {
  const targetId = pickBotTarget(gameState.value, true)

  if (!targetId) {
    return
  }

  gameState.value = chooseMafiaTarget(gameState.value, targetId)
  await persistCurrentGameState()
}

async function selectDetectiveTarget(playerId: number) {
  gameState.value = chooseDetectiveTarget(gameState.value, playerId)
  await persistCurrentGameState()
}

async function letDetectivesAct() {
  const targetId = pickBotTarget(gameState.value, false)

  if (!targetId) {
    return
  }

  gameState.value = chooseDetectiveTarget(gameState.value, targetId)
  await persistCurrentGameState()
}

async function continueToDay() {
  gameState.value = announceDay(gameState.value)
  await persistCurrentGameState()
}

async function continueToDiscussion() {
  gameState.value = beginDiscussion(gameState.value)
  await persistCurrentGameState()
}

async function continueToVoting() {
  gameState.value = beginVoting(gameState.value)
  await persistCurrentGameState()
}

async function voteForPlayer(playerId: number) {
  gameState.value = voteOutPlayer(gameState.value, playerId)
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
    return
  }

  lobbyChannel.value.unsubscribe()
  lobbyChannel.value = null
}

function subscribeCurrentLobby() {
  unsubscribeCurrentLobby()

  if (!gameState.value.lobbyCode) {
    return
  }

  lobbyChannel.value = subscribeToLobby(gameState.value.lobbyCode, async () => {
    gameState.value = await refreshOnlineLobby(gameState.value)
  })
}

onMounted(() => {})

onBeforeUnmount(() => {
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
          <p>Everyone closes their eyes. The Mafia wake up together and choose one player to eliminate.</p>
        </article>

        <article>
          <h3>Night: Detectives</h3>
          <p>The Mafia close their eyes. The Detectives wake up together, pick one player, and the Game Master tells them if that player is Mafia.</p>
        </article>

        <article>
          <h3>Day</h3>
          <p>Everyone wakes up. The Game Master announces who was eliminated. Then players discuss who seems suspicious.</p>
        </article>

        <article>
          <h3>Voting</h3>
          <p>After discussion, everyone votes to eliminate one player. Then the game repeats with another night.</p>
        </article>

        <article>
          <h3>Winning</h3>
          <p>Civilians and Detectives win if both Mafia are eliminated. Mafia wins if Mafia are equal to or outnumber non-Mafia players.</p>
        </article>
      </div>
    </section>
  </div>

  <main v-if="screen === 'landing'" class="menu-shell">
    <section class="menu-panel" aria-labelledby="landing-title">
      <p class="eyebrow">A social deduction game</p>
      <h1 id="landing-title">Mafia Nightfall</h1>

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

        <button type="button" class="mode-card-button" @click="chooseVsAiMode">
          <span>Play VS AI</span>
          <small>Start with two humans and six bot-controlled seats.</small>
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

  <main v-else class="game-shell" :class="{ 'lobby-only-shell': isLobbyWaiting }">
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

    <section v-if="isGameStarted" class="players-section game-flow-section" aria-labelledby="game-flow-heading">
      <div class="section-heading">
        <p class="eyebrow">Round {{ gameState.round }}</p>
        <h2 id="game-flow-heading">
          {{
            gameState.phase === 'role-reveal'
              ? 'Your Role'
              : gameState.phase === 'mafia'
                ? 'Night: Mafia'
                : gameState.phase === 'detective'
                  ? 'Night: Detectives'
                  : gameState.phase === 'day'
                    ? 'Morning'
                    : gameState.phase === 'discussion'
                      ? 'Discussion'
                      : gameState.phase === 'voting'
                        ? 'Vote'
                        : 'Game Over'
          }}
        </h2>
      </div>

      <article class="game-flow-card">
        <template v-if="gameState.phase === 'role-reveal'">
          <p class="eyebrow">Secret Team</p>
          <h3>You are {{ localRoleLabel }}</h3>
          <p>Both human players share this role. Keep it secret and play together.</p>
          <button type="button" @click="continueToNight">Start Night</button>
        </template>

        <template v-else-if="gameState.phase === 'mafia'">
          <p class="eyebrow">Everyone closes their eyes</p>
          <h3>The Mafia choose someone to eliminate.</h3>
          <div v-if="canHumansActAsMafia" class="target-grid">
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
          <button v-else type="button" @click="letMafiaAct">Let the Mafia choose</button>
        </template>

        <template v-else-if="gameState.phase === 'detective'">
          <p class="eyebrow">Mafia close their eyes</p>
          <h3>The Detectives choose one player to investigate.</h3>
          <div
            v-if="canHumansActAsDetectives && gameState.investigationTargetId === null"
            class="target-grid"
          >
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
          <button
            v-else-if="gameState.investigationTargetId === null"
            type="button"
            @click="letDetectivesAct"
          >
            Let the Detectives investigate
          </button>
          <p v-if="gameState.investigationTargetId !== null" class="result-text">
            {{ investigationTargetName }}
            {{ gameState.investigationResult ? 'is Mafia.' : 'is not Mafia.' }}
          </p>
          <button
            v-if="gameState.investigationTargetId !== null"
            type="button"
            @click="continueToDay"
          >
            Wake Everyone
          </button>
        </template>

        <template v-else-if="gameState.phase === 'day'">
          <p class="eyebrow">Everyone wakes up</p>
          <h3>{{ lastEliminatedName }} was eliminated during the night.</h3>
          <p v-if="gameState.dayStory" class="story-text">{{ gameState.dayStory }}</p>
          <button type="button" @click="continueToDiscussion">Start Discussion</button>
        </template>

        <template v-else-if="gameState.phase === 'discussion'">
          <p class="eyebrow">Talk it out</p>
          <h3>Discuss who seems suspicious.</h3>
          <p>Share theories, defend yourself, and listen for strange stories.</p>
          <button type="button" @click="continueToVoting">Start Vote</button>
        </template>

        <template v-else-if="gameState.phase === 'voting'">
          <p class="eyebrow">Town vote</p>
          <h3>Choose one player to eliminate.</h3>
          <div class="target-grid">
            <button
              v-for="player in alivePlayers"
              :key="player.id"
              type="button"
              class="target-button"
              @click="voteForPlayer(player.id)"
            >
              {{ player.name }}
            </button>
          </div>
        </template>

        <template v-else>
          <p class="eyebrow">Winner</p>
          <h3>{{ gameState.winner === 'mafia' ? 'Mafia wins.' : 'Civilians and Detectives win.' }}</h3>
          <button type="button" @click="openGame">Back to Play Menu</button>
        </template>
      </article>

      <div class="player-grid game-player-grid">
        <article
          v-for="player in gameState.players"
          :key="player.id"
          class="player-card"
          :class="[`role-${player.role}`, { eliminated: player.status === 'eliminated' }]"
        >
          <div>
            <h3>{{ player.name }}</h3>
            <p>{{ player.kind === 'human' ? 'Human' : 'AI' }}</p>
          </div>
          <strong>{{ player.status }}</strong>
        </article>
      </div>
    </section>

    <section v-else class="players-section" aria-labelledby="players-heading">
      <div v-if="gameState.mode === 'lobby'" class="sticky-code-note">
        <span>Lobby Code</span>
        <strong>{{ gameState.lobbyCode }}</strong>
      </div>

      <div v-if="gameState.mode !== 'lobby'" class="section-heading">
        <p class="eyebrow">Assigned Seats</p>
        <h2 id="players-heading">Starting Player Board</h2>
      </div>

      <div class="player-grid">
        <article
          v-for="slot in lobbySlots"
          :key="slot.id"
          class="player-card"
          :class="slot.player ? `role-${slot.player.role}` : 'empty-seat'"
        >
          <div>
            <h3>{{ slot.player?.name ?? 'Waiting for other player' }}</h3>
            <p v-if="slot.player">{{ slot.player.kind === 'human' ? 'Human' : 'AI' }}</p>
          </div>
          <strong>
            {{
              !slot.player
                ? 'empty'
                : slot.player.isHost
                  ? 'host'
                  : slot.player.isReady
                    ? 'ready'
                    : 'not ready'
            }}
          </strong>
        </article>
      </div>
    </section>
  </main>
</template>
