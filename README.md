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

## Current Base

- Vite + Vue 3 + TypeScript
- Typed game state in `src/game/types.ts`
- Initial setup and role assignment in `src/game/setup.ts`
- Mafia-themed starting board in `src/App.vue`
- Two setup modes: 2P VS Bots and lobby code
- Shared human team assignment: both humans are Mafia, Detectives, or Villagers
- Host-only start rule
- AI fill controls for incomplete lobbies

## Next Gameplay Steps

- Add player name entry before role assignment
- Add real multiplayer networking behind lobby codes
- Hide bot and opponent information during setup and lobby waiting
- Add night phase actions for Mafia and Detectives
- Add day discussion and voting flow
- Add win-condition checks
