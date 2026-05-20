import { getBody, handleOptions, methodNotAllowed, sendError, sendJson } from '../../_lib/http.js'
import { getSupabase } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(req, res)
  }

  if (req.method !== 'PATCH') {
    return methodNotAllowed(req, res)
  }

  try {
    const lobbyCode = String(req.query.code ?? '').toUpperCase()
    const { gameState } = getBody(req)

    if (!gameState) {
      return sendJson(req, res, 400, { error: 'Missing gameState.' })
    }

    const mergedGameState = await updateLobbyState(req, lobbyCode, gameState)
    return sendJson(req, res, 200, { ok: true, gameState: mergedGameState })
  } catch (error) {
    return sendError(req, res, error)
  }
}

async function updateLobbyState(req, lobbyCode, gameState) {
  const supabase = getSupabase(req)
  const { data: existingLobby, error: fetchError } = await supabase
    .from('lobbies')
    .select('game_state')
    .eq('code', lobbyCode)
    .maybeSingle()

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

function mergeConcurrentGameState(existingState, incomingState) {
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

function mergeNextAcknowledgements(existingAcknowledgements, incomingAcknowledgements) {
  const mergedAcknowledgements = {
    ...(existingAcknowledgements ?? {}),
  }

  for (const [key, playerIds] of Object.entries(incomingAcknowledgements ?? {})) {
    mergedAcknowledgements[key] = mergeNumberArrays(mergedAcknowledgements[key], playerIds)
  }

  return mergedAcknowledgements
}

function mergeNumberArrays(existingIds, incomingIds) {
  return Array.from(new Set([...(existingIds ?? []), ...(incomingIds ?? [])]))
}
