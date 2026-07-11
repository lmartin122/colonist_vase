# 🏝️ Colonist Vase

A modern, 2D web version of the classic *settle / build / trade* board game — play
against heuristic AI bots in your browser. Built as an original take on the genre
(colonist.io-style), with its own art direction and naming.

> **Note on IP:** this is an original implementation of the game *mechanics* with
> its own visuals and names. It ships no official Catan® assets or trademarks.

## Stack

- **React + Vite + TypeScript** — SPA, no backend required
- **PixiJS v8** — GPU-accelerated 2D board & animations
- **Zustand** — state bridge between the engine, UI and renderer
- **Tailwind CSS + Framer Motion** — HUD styling and motion
- **Vitest** — engine unit tests

## Architecture

The code is split so the game logic is completely decoupled from the UI — the same
engine could later run authoritatively on a multiplayer server.

```
src/
  engine/   Pure, deterministic game logic. No React/Pixi/DOM. reduce(state, action).
  ai/       Heuristic bot: (GameState) => Action. Depends only on the engine.
  render/   PixiJS board renderer — a pure view of GameState.
  state/    Zustand store + game controller (drives bot turns) + interaction mapping.
  ui/       React HUD overlays (start screen, dock, panels, modals).
tests/      Vitest engine + full-game simulation tests.
```

**Data flow:** UI intent → `dispatch(action)` → `engine.reduce(state, action)` →
new immutable `GameState` → store updates → React HUD re-renders **and** the Pixi
renderer reflects the new state. The engine is the single source of truth; all
randomness flows through a seeded RNG in state, so a game is fully reproducible.

## Getting started

```bash
npm install
npm run dev        # start the dev server (http://localhost:5173)
npm run build      # typecheck + production build
npm run test       # run the engine + full-game test suite
```

## Gameplay covered (base game)

- Snake-draft setup placement with the distance rule
- Dice rolls, resource production, bank limits
- The robber, discard-on-7, and stealing
- Roads, settlements, cities; longest road & largest army
- All five development cards (knight, road building, monopoly, year of plenty, VP)
- Bank/port trades (4:1 / 3:1 / 2:1) and player-to-player trades with bots
- Win at 10 victory points

## Roadmap

- Online multiplayer (a server reusing `src/engine/` verbatim + WebSockets)
- Stronger, search-based AI
- Sound and richer animations
- Expansions
