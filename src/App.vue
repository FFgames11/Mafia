<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  addAiPlayer,
  createLobbyGameState,
  createVsAiGameState,
  fillLobbyWithAi,
  roleLabels,
  startGame,
} from './game/setup'
import type { PlayerRole } from './game/types'

const gameState = ref(createVsAiGameState())

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

const openSeats = computed(() => 8 - gameState.value.players.length)

const canStartGame = computed(() => isHost.value && gameState.value.players.length === 8)

function chooseVsAiMode() {
  gameState.value = createVsAiGameState()
}

function createLobbyMode() {
  gameState.value = createLobbyGameState()
}

function addAiToLobby() {
  gameState.value = addAiPlayer(gameState.value)
}

function fillLobby() {
  gameState.value = fillLobbyWithAi(gameState.value)
}

function handleStartGame() {
  gameState.value = startGame(gameState.value, gameState.value.localPlayerId)
}

function resetSetup() {
  gameState.value =
    gameState.value.mode === 'lobby' ? createLobbyGameState() : createVsAiGameState()
}
</script>

<template>
  <main class="game-shell">
    <section class="hero-panel">
      <p class="eyebrow">Computer controlled Game Master</p>
      <h1>Mafia Nightfall</h1>
      <p class="intro">
        Choose a solo table against AI or create a lobby code for other players.
        The computer stays as Game Master, and the host controls when the game starts.
      </p>

      <div class="hero-actions" aria-label="Game setup actions">
        <button type="button" @click="chooseVsAiMode">VS AI</button>
        <button type="button" class="secondary-button" @click="createLobbyMode">
          Create Lobby
        </button>
        <button type="button" @click="resetSetup">Reset Setup</button>
        <span>{{ gameState.phase.toUpperCase() }} PHASE</span>
      </div>
    </section>

    <section class="dashboard" aria-label="Game setup overview">
      <article class="card game-master">
        <span class="card-kicker">Game Master</span>
        <h2>{{ gameState.gameMaster.name }}</h2>
        <p>{{ gameState.gameMaster.description }}</p>
      </article>

      <article class="card">
        <span class="card-kicker">Current Mode</span>
        <h2>{{ gameState.mode === 'vs-ai' ? 'VS AI' : 'Lobby Code' }}</h2>
        <p v-if="gameState.lobbyCode" class="lobby-code">{{ gameState.lobbyCode }}</p>
        <p v-else>Solo table with AI filling every opponent seat.</p>
      </article>

      <article class="card lobby-controls">
        <span class="card-kicker">Host Controls</span>
        <h2>{{ gameState.players.length }} / 8 Seats Filled</h2>
        <p v-if="gameState.mode === 'lobby'">
          {{ openSeats }} open seat{{ openSeats === 1 ? '' : 's' }}. Add AI if there are not
          enough human players.
        </p>
        <p v-else>VS AI mode is ready immediately with one human and seven AI players.</p>

        <div class="control-row">
          <button
            type="button"
            class="secondary-button"
            :disabled="gameState.mode !== 'lobby' || openSeats === 0"
            @click="addAiToLobby"
          >
            Add AI
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="gameState.mode !== 'lobby' || openSeats === 0"
            @click="fillLobby"
          >
            Fill With AI
          </button>
          <button type="button" :disabled="!canStartGame" @click="handleStartGame">
            Start Game
          </button>
        </div>

        <p v-if="!isHost" class="warning-text">Only the lobby host can start the game.</p>
        <p v-else-if="!canStartGame" class="warning-text">
          Host can start after all 8 seats are filled.
        </p>
      </article>

      <article class="card">
        <span class="card-kicker">Role Setup</span>
        <h2>8 Player Rules</h2>
        <ul class="role-list" aria-label="Role distribution">
          <li v-for="(count, role) in roleCounts" :key="role">
            <span>{{ roleLabels[role] }}</span>
            <strong>{{ count }}</strong>
          </li>
        </ul>
      </article>
    </section>

    <section class="players-section" aria-labelledby="players-heading">
      <div class="section-heading">
        <p class="eyebrow">Assigned Seats</p>
        <h2 id="players-heading">Starting Player Board</h2>
      </div>

      <div class="player-grid">
        <article
          v-for="player in gameState.players"
          :key="player.id"
          class="player-card"
          :class="`role-${player.role}`"
        >
          <span class="seat">{{ player.seat }}</span>
          <div>
            <h3>{{ player.name }}</h3>
            <p>{{ roleLabels[player.role] }} · {{ player.kind }}</p>
          </div>
          <strong>{{ player.isHost ? 'host' : player.status }}</strong>
        </article>

        <article v-for="seat in openSeats" :key="`empty-${seat}`" class="player-card empty-seat">
          <span class="seat">Open</span>
          <div>
            <h3>Waiting for player</h3>
            <p>Human or AI can join</p>
          </div>
          <strong>empty</strong>
        </article>
      </div>
    </section>
  </main>
</template>
