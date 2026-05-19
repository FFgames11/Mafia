import { errorResponse, jsonResponse, optionsResponse } from '@/lib/http'
import { supabase } from '@/lib/supabase'

interface RouteContext {
  params: Promise<{ code: string }>
}

export function OPTIONS(request: Request) {
  return optionsResponse(request)
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { code } = await context.params
    const lobbyCode = code.toUpperCase()

    const { data: lobby, error: lobbyError } = await supabase
      .from('lobbies')
      .select('code,status,host_client_id,game_state')
      .eq('code', lobbyCode)
      .maybeSingle()

    if (lobbyError) {
      throw lobbyError
    }

    if (!lobby) {
      return jsonResponse(request, { error: 'Lobby not found.' }, { status: 404 })
    }

    const { data: players, error: playersError } = await supabase
      .from('lobby_players')
      .select('lobby_code,client_id,slot_number,display_name,kind,is_host,is_ready')
      .eq('lobby_code', lobbyCode)
      .order('slot_number')

    if (playersError) {
      throw playersError
    }

    return jsonResponse(request, { lobby, players: players ?? [] })
  } catch (error) {
    return errorResponse(request, error)
  }
}
