import { getBody, handleOptions, methodNotAllowed, sendError, sendJson } from '../../_lib/http.js'
import { getSupabase } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(req, res)
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(req, res)
  }

  try {
    const supabase = getSupabase()
    const lobbyCode = String(req.query.code ?? '').toUpperCase()
    const { clientId, gameState } = getBody(req)

    if (!clientId || !gameState) {
      return sendJson(req, res, 400, { error: 'Missing start payload.' })
    }

    const { data: lobby, error: lobbyError } = await supabase
      .from('lobbies')
      .select('host_client_id')
      .eq('code', lobbyCode)
      .maybeSingle()

    if (lobbyError) {
      throw lobbyError
    }

    if (!lobby || lobby.host_client_id !== clientId) {
      return sendJson(req, res, 403, { error: 'Only the host can start the game.' })
    }

    const { error } = await supabase
      .from('lobbies')
      .update({ status: 'started', game_state: gameState })
      .eq('code', lobbyCode)

    if (error) {
      throw error
    }

    return sendJson(req, res, 200, { ok: true })
  } catch (error) {
    return sendError(req, res, error)
  }
}
