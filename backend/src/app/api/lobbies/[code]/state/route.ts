import type { GameState } from '@/lib/game'
import { errorResponse, jsonResponse, optionsResponse } from '@/lib/http'
import { supabase } from '@/lib/supabase'

interface RouteContext {
  params: Promise<{ code: string }>
}

const lobbyUpdateQueues = new Map<string, Promise<void>>()

export function OPTIONS(request: Request) {
  return optionsResponse(request)
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { code } = await context.params
    const { gameState } = (await request.json()) as { gameState?: GameState }
    const lobbyCode = code.toUpperCase()

    if (!gameState) {
      return jsonResponse(request, { error: 'Missing gameState.' }, { status: 400 })
    }

    const mergedGameState = await queueLobbyStateUpdate(lobbyCode, gameState)
    return jsonResponse(request, { ok: true, gameState: mergedGameState })
  } catch (error) {
    return errorResponse(request, error)
  }
}

async function queueLobbyStateUpdate(lobbyCode: string, gameState: GameState) {
  const previousUpdate = lobbyUpdateQueues.get(lobbyCode) ?? Promise.resolve()
  let releaseUpdate: () => void
  const currentUpdate = new Promise<void>((resolve) => {
    releaseUpdate = resolve
  })
  const queuedUpdate = previousUpdate.catch(() => undefined).then(() => currentUpdate)

  lobbyUpdateQueues.set(lobbyCode, queuedUpdate)

  await previousUpdate.catch(() => undefined)

  try {
    return await updateLobbyState(lobbyCode, gameState)
  } finally {
    releaseUpdate!()

    if (lobbyUpdateQueues.get(lobbyCode) === queuedUpdate) {
      lobbyUpdateQueues.delete(lobbyCode)
    }
  }
}

async function updateLobbyState(lobbyCode: string, gameState: GameState) {
  const { data: existingLobby, error: fetchError } = await supabase
    .from('lobbies')
    .select('game_state')
    .eq('code', lobbyCode)
    .maybeSingle<{ game_state: GameState | null }>()

  if (fetchError) {
    throw fetchError
  }

  const mergedGameState = mergeConcurrentGameState(existingLobby?.game_state ?? null, gameState)

  const { error } = await supabase
    .from('lobbies')
    .update({ game_state: mergedGameState })
    .eq('code', lobbyCode)

  if (error) {
    throw error
  }

  return mergedGameState
}

function mergeConcurrentGameState(existingState: GameState | null, incomingState: GameState): GameState {
  if (!existingState) {
    return incomingState
  }

  const isSameNextGate =
    existingState.phase === incomingState.phase &&
    existingState.round === incomingState.round &&
    existingState.pendingEliminationId === incomingState.pendingEliminationId &&
    existingState.lastEliminatedId === incomingState.lastEliminatedId &&
    existingState.investigationTargetId === incomingState.investigationTargetId

  if (!isSameNextGate) {
    return incomingState
  }

  return {
    ...incomingState,
    sleepAcknowledgedIds: mergeNumberArrays(
      existingState.sleepAcknowledgedIds,
      incomingState.sleepAcknowledgedIds,
    ),
    nextAcknowledgedIds: mergeNumberArrays(
      existingState.nextAcknowledgedIds,
      incomingState.nextAcknowledgedIds,
    ),
    nextAcknowledgements: mergeNextAcknowledgements(
      existingState.nextAcknowledgements,
      incomingState.nextAcknowledgements,
    ),
  }
}

function mergeNextAcknowledgements(
  existingAcknowledgements: Record<string, number[]> | undefined,
  incomingAcknowledgements: Record<string, number[]> | undefined,
) {
  const mergedAcknowledgements: Record<string, number[]> = {
    ...(existingAcknowledgements ?? {}),
  }

  for (const [key, playerIds] of Object.entries(incomingAcknowledgements ?? {})) {
    mergedAcknowledgements[key] = mergeNumberArrays(mergedAcknowledgements[key], playerIds)
  }

  return mergedAcknowledgements
}

function mergeNumberArrays(existingIds: number[] | undefined, incomingIds: number[] | undefined) {
  return Array.from(new Set([...(existingIds ?? []), ...(incomingIds ?? [])]))
}
