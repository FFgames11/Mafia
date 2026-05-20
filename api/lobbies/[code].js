import { handleOptions, methodNotAllowed, sendError, sendJson } from '../_lib/http.js'
import { getSupabase } from '../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(req, res)
  }

  if (req.method !== 'GET') {
    return methodNotAllowed(req, res)
  }

  try {
    const supabase = getSupabase(req)
    const lobbyCode = String(req.query.code ?? '').toUpperCase()

    const { data: lobby, error: lobbyError } = await supabase
      .from('lobbies')
      .select('code,status,host_client_id,game_state')
      .eq('code', lobbyCode)
      .maybeSingle()

    if (lobbyError) {
      throw lobbyError
    }

    if (!lobby) {
      return sendJson(req, res, 404, { error: 'Lobby not found.' })
    }

    const { data: players, error: playersError } = await supabase
      .from('lobby_players')
      .select('lobby_code,client_id,slot_number,display_name,kind,is_host,is_ready')
      .eq('lobby_code', lobbyCode)
      .order('slot_number')

    if (playersError) {
      throw playersError
    }

    return sendJson(req, res, 200, { lobby, players: players ?? [] })
  } catch (error) {
    return sendError(req, res, error)
  }
}
