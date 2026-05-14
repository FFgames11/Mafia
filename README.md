# Mafia Nightfall

Vue + TypeScript base for a mafia game with the minimum setup:

- 2 human players
- 6 bot players
- 1 computer Game Master
- 2 Mafia
- 2 Detectives
- 4 Villagers
- Both human players are always assigned to the same team

## Run Locally

```bash
npm install
npm run dev
```

The Vue client runs on:

```text
http://127.0.0.1:5173
```

The Next.js backend is in `backend/`.

```bash
cd backend
npm install
npm run dev
```

The backend runs on:

```text
http://127.0.0.1:3000
```

Create `backend/.env.local`:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

The Vue client defaults to `http://127.0.0.1:3000` for backend API calls. Override it in root `.env.local` if needed:

```env
VITE_API_BASE_URL=http://127.0.0.1:3000
```

## Current Base

- Vite + Vue 3 + TypeScript
- Next.js backend API in `backend/`
- Typed game state in `src/game/types.ts`
- Initial setup and role assignment in `src/game/setup.ts`
- Mafia-themed starting board in `src/App.vue`
- Two setup modes: 2P VS Bots and lobby code
- Shared human team assignment: both humans are Mafia, Detectives, or Villagers
- Host-only start rule
- Supabase-backed online lobby creation, joining, ready state, and game state sync

## Next Gameplay Steps

- Add player name entry before role assignment
- Hide bot and opponent information during setup and lobby waiting
- Tighten Supabase RLS once backend service role is configured
