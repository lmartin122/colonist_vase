# CLAUDE.md

Guidance for working in this repository. Read this before making changes.

## What this is

**Colonist Vase** — an original 2D web implementation of the *settle / build / trade*
board game (Catan-style, colonist.io-inspired). Single human **vs heuristic AI bots**,
built so that **online multiplayer can be added later without rewriting the game logic**.

> IP note: this is an original implementation of the *mechanics* with its own art and
> naming. Do not add official Catan® assets, names, or trademarks.

## Monorepo layout (online update)

The repo is an **npm workspaces monorepo**. The pure engine was extracted so the client
and the authoritative server share it verbatim:

```
packages/
  shared/   @colonist/shared — the pure engine + AI + net protocol (redaction). No UI.
  client/   React + Vite + Pixi front-end (local vs-bots AND online play).
  server/   Node + Socket.IO + Prisma authoritative server (rooms, auth, bots, history).
```

- `shared` is imported by both `client` and `server` (as `@colonist/shared`). Engine
  purity still applies — nothing UI/network-specific in `packages/shared/src/engine`.
- Redaction + the client↔server wire types live in `packages/shared/src/net/protocol.ts`
  (`redactState`, `handSize`/`unplayedDevCount`/`devDeckSize` accessors that work on both
  raw local state and redacted online state).
- Online is server-authoritative: the client sends `Action`s, the server runs `reduce`,
  and broadcasts a per-seat **redacted** state. Bots run on the server. See the roadmap
  section at the bottom (now largely implemented) and the plan file for details.

## Commands

```bash
npm run dev      # client Vite dev server → http://localhost:5173
npm run build    # build the client (tsc --noEmit + vite build)
npm run server   # run the authoritative server (packages/server, tsx watch)
npm run test     # shared engine + client tests
npm run lint     # eslint

# Per-workspace, e.g.:
npm run test  --workspace @colonist/server     # server runtime/anti-cheat tests
npm run prisma:migrate --workspace @colonist/server   # create/apply DB migrations
```

Copy `packages/server/.env.example` → `.env` and `packages/client/.env.example` → `.env`.
Local (vs-bots) play needs no env; **online** needs Auth0 vars + a Postgres `DATABASE_URL`.
For local online testing without Auth0, set `DEV_NO_AUTH=true` on the server (tokens are
then `"userId:name"`, never use in production).

- Node 22, npm 10.
- After editing **`tailwind.config.js`**, restart the dev server. Tailwind's JIT in a
  long-running dev process can go stale on config changes and silently stop emitting
  utilities (we hit exactly this: `bg-card` rendered transparent until a restart +
  `rm -rf node_modules/.vite`).

## Architecture — the one rule that matters

The **game logic is a pure, deterministic core with zero UI dependencies.** Everything
else is a view or a driver around it. This is what makes bots, tests, and future online
multiplayer all reuse the same code.

```
UI intent (click / button)
      │  dispatch(action)
      ▼
engine.reduce(state, action)  ──►  new immutable GameState   (pure, seeded RNG)
      │
      ├──► Zustand store updates ──► React HUD re-renders
      └──► BoardRenderer.sync(state) ──► PixiJS reflects/animates pieces
```

- `reduce(state, action)` is the **single entry point** for every state change. It
  validates the action and returns either a new `GameState` or a rejection reason. It
  never mutates its input.
- All randomness (dice, board shuffle, dev-card deck, robber steal) flows through a
  **seeded RNG stored inside `GameState`** (`src/engine/rng.ts`). Same seed + same
  actions ⇒ identical game. This is why games are replayable and testable.
- The renderer is a **pure view**: it reads `GameState` and emits click intents; it never
  mutates game state.

## Directory map

```
src/
  engine/       Pure TS game logic. NO react/pixi/DOM imports allowed here.
    types.ts        GameState, Player, Board, Tile/Vertex/Edge, Resource, Phase, etc.
    coords.ts       Hex axial↔pixel geometry (pointy-top).
    board.ts        Board generation: tiles/vertices/edges derived from geometry, ports.
    rng.ts          Seeded RNG (mulberry32) — the source of all randomness.
    constants.ts    Costs, dev-deck composition, player colors, limits.
    game.ts         createGame(config) → initial GameState.
    actions.ts      The Action union type (every possible move).
    reduce.ts       reduce(state, action) — validation + all phase/rule logic.
    placement.ts    Shared legality predicates + legal-move enumerators (UI & AI use these).
    longestRoad.ts  Longest-road DFS + award transitions.
    helpers.ts      Resource math, victory points, port ratios, trade value model.
  ai/
    bot.ts          Heuristic bot: nextBotAction(state, actor) → one legal Action.
                    Also botAcceptsTrade / bestTradePartner for player-trade offers.
  render/
    BoardRenderer.ts  PixiJS scene: tiles, terrain motifs, tokens, ports, pieces, robber,
                      water, placement highlights, pop-in animations.
    palette.ts        Terrain/player/board colors (numeric hex for Pixi).
  state/
    store.ts        Zustand store: game, dispatch(), the bot-turn loop, theme.
    interaction.ts  Maps (GameState + build mode) → board highlights + click handlers.
  ui/
    App.tsx, StartScreen.tsx, GameCanvas.tsx (Pixi host), Hud.tsx (all HUD),
    TradePanel.tsx, ResourceIcon.tsx (flat SVG icons), ThemeToggle.tsx.
tests/
    board.test.ts, engine.test.ts, mechanics.test.ts, fullgame.test.ts
```

## Conventions

- **Engine purity is sacred.** Nothing in `src/engine/` may import React, Pixi, the DOM,
  or anything in `src/ui`, `src/render`, `src/state`. If you need a UI-facing helper, put
  it outside the engine. This is the contract that keeps the engine server-reusable.
- **Immutability.** `reduce` and its helpers return new objects; never mutate `state`.
- **Legality lives once.** `src/engine/placement.ts` holds the placement predicates and
  legal-move enumerators used by *both* the reducer (to validate) and the UI/AI (to
  offer/pick moves). Never duplicate legality checks — the board must never accept a move
  the UI wouldn't offer, and vice-versa.
- **Bots return one action at a time.** `nextBotAction` must make concrete progress each
  call; the store loops it until control returns to a human or the turn ends.
- **Styling / theming.** Semantic colors (`bg-card`, `text-ink`, `bg-card-alt`,
  `ink-soft`, `ink-faint`) are CSS variables flipped by a `.dark` class on `<html>`
  (see `src/index.css` + `tailwind.config.js`). Use these tokens, not raw hex, so both
  themes work. Player accents are `p-blue/p-red/p-green/p-purple`. Use `bg-ink/10` (not
  `bg-black/5`) for interactive tints so they stay visible in dark mode.
- **Don't name a boxShadow the same as a color.** `shadow-<name>` is ambiguous with
  shadow-color utilities. Our panel shadow is `shadow-panel` for this reason.

## How to add a new rule / action (worked example)

1. Add the variant to the `Action` union in `src/engine/actions.ts`.
2. Handle it in `apply()` inside `src/engine/reduce.ts` with full validation (throw via
   `fail(msg)` on illegal input; the wrapper turns it into `{ ok: false, error }`).
3. If it involves placement legality, add/extend a predicate in `placement.ts` and reuse
   it — do not inline a second copy.
4. Teach the bot when to choose it in `src/ai/bot.ts`.
5. Surface it in the UI: a control in `Hud.tsx`/`TradePanel.tsx` and, if it needs board
   selection, a case in `state/interaction.ts`.
6. Add a Vitest case in `tests/` and make sure `fullgame.test.ts` still drives whole
   bot-vs-bot games to a winner.

## Rendering notes (PixiJS v8)

- Board is centered at world origin `(0,0)`; `BoardRenderer.fit()` scales/positions the
  container to the screen (called on resize).
- Vertices/edges are de-duplicated by rounding pixel coordinates to a key — this yields
  the canonical 19 tiles / 54 vertices / 72 edges without a hand-maintained adjacency
  table (`src/engine/board.ts`).
- Use `Graphics` for shapes and a `Container` when grouping shapes + `Text` — **do not
  `addChild` onto a `Graphics`** (deprecated in v8).
- Tile depth uses `FillGradient` (options-object form). Newly placed pieces get a pop-in
  scale animation via the ticker.

## Testing & verification

- **Engine/AI:** `npm run test`. `fullgame.test.ts` plays complete all-bot games to a
  legal winner across several seeds and asserts determinism — the fastest way to catch a
  broken rule or an AI that emits illegal moves.
- **Browser:** Playwright with system Chrome is used for smoke tests. Launch with
  `chromium.launch({ channel: 'chrome' })` (no bundled browser download needed). In dev,
  the store is exposed as `window.__game` for driving/inspecting state from a test.
- Keep temp scripts out of the repo (use the scratchpad dir); the app has no `_smoke.mjs`
  etc. committed.

---

# Roadmap — future work (with implementation guidance)

These are intended as **worked examples** of how to extend the project. The pure,
deterministic engine is the enabler for all of them.

## 1. Online multiplayer

The engine already has the exact shape a server needs (`reduce(state, action)` +
seeded RNG). Plan:

- **Authoritative server** (new `server/` package, Node + `ws` or Colyseus): import
  `src/engine/` **verbatim**. Clients send `Action`s; the server runs `reduce`, and on
  success broadcasts the new state (or the action + a state hash for clients to apply
  locally). Reject illegal actions server-side — never trust the client.
- **Rooms & seating:** room code → `GameState` + player→socket map. Reconnection = resend
  the latest snapshot. Bots run **on the server** (reuse `nextBotAction`), replacing the
  client-side `runBots` loop in `state/store.ts`.
- **Hidden information:** today the client holds full `GameState`. For real multiplayer,
  add a server-side **redaction** step that sends each player a personalized view (hide
  opponents' exact hands and unplayed dev cards — send counts only). `helpers.ts` already
  distinguishes `publicVictoryPoints` vs `victoryPoints`; extend that idea.
- **Client transport:** add `src/net/` with a socket client; the store's `dispatch`
  becomes "send action to server" and state updates arrive as messages. Keep a local
  optimistic path for setup/among-bots feel if desired.

## 2. In-game chat

- Add a chat channel over the same WebSocket connection; keep the last N messages in room
  state (server-authoritative so it persists across reconnects).
- UI: `src/ui/Chat.tsx` — a collapsible panel using the existing card system
  (`bg-card`, `text-ink`, responsive like `TradePanel`). Feed **system messages** from the
  existing action log (`GameState.log`) into the same stream (e.g. "Ada built a city").
- Consider quick-chat presets ("Trade?", "Good game") for mobile, plus optional profanity
  filtering server-side.

## 3. Match history + leaderboard (wins & points over time)

Two things make this easy: every game has a **seed**, and `GameState.log` records events.
A game is fully reproducible from `seed + the ordered list of actions`.

- **Persistence (server-side DB — SQLite/Postgres):**
  - `players(id, name, created_at)`
  - `games(id, seed, layout, player_ids, winner_id, final_scores_json, started_at, ended_at)`
  - `game_events(game_id, seq, action_json)` — optional, enables full replay.
  - `leaderboard` = aggregate view: per player `wins = COUNT(games.winner_id = player)` and
    `total_points = SUM(final_scores[player])`, plus games played, win rate, avg points.
- **When a game ends** (`phase === 'gameOver'`), POST the result: winner, per-player final
  VP (use `victoryPoints(state, id)`), seed, layout, timestamps, and optionally the action
  log for replay.
- **UI:**
  - `src/ui/Leaderboard.tsx` — sortable table (most wins, then total points). Reuse the
    card/typography system; make it responsive.
  - A **history screen** listing past games with scores and date.
  - A **replay viewer**: load a stored `seed + actions`, re-apply them through `reduce`
    step-by-step, and drive `BoardRenderer` — no special replay engine needed thanks to
    determinism.
- **Local-first stepping stone (no server yet):** persist results to `localStorage` /
  IndexedDB and render the leaderboard client-side. Later, swap the storage adapter for
  the server API without changing the UI. Design the persistence access behind a small
  interface (e.g. `src/state/history.ts`) so the backend is pluggable.

## Ordering suggestion

1. Match history + leaderboard **local-first** (no backend) — immediate value, validates
   the data model, and exercises replay via determinism.
2. Online multiplayer server (reuse engine, add redaction + rooms).
3. Chat (rides on the multiplayer transport).
4. Move history/leaderboard persistence from local storage to the server DB.
