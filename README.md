# Mafia Nightfall

Vue + TypeScript base for a mafia game with the minimum setup:

- 8 human players
- 1 computer Game Master
- 2 Mafia
- 2 Detectives
- 4 Villagers

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
- Two setup modes: VS AI and lobby code
- Host-only start rule
- AI fill controls for incomplete lobbies

## Next Gameplay Steps

- Add player name entry before role assignment
- Add real multiplayer networking behind lobby codes
- Hide roles from other players during setup and lobby waiting
- Add night phase actions for Mafia and Detectives
- Add day discussion and voting flow
- Add win-condition checks
