import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { Application } from 'pixi.js';
import type { Action, GameState } from '@colonist/shared';
import { BoardRenderer } from '../render/BoardRenderer';
import { setTileLocator } from '../render/boardAnchors';
import { loadBoardTextures } from '../render/textures';
import { PLAYER_CSS } from '../render/palette';
import { deriveInteraction } from '../state/interaction';
import { subscribeRoadPathHover } from '../state/roadPathHover';
import { subscribeBoardPreview } from '../state/boardPreview';
import { subscribeBoardControl } from '../state/boardControls';
import { useGame } from '../state/store';
import { useReducedMotionPreference } from '../state/useMotionPreference';
import { PlayerIcon } from './PlayerDecorations';

export function boardLayoutKey(board: GameState['board']): string {
  return board.tiles.map((tile) => `${tile.id}:${tile.type}:${tile.number ?? 'x'}`).join('|')
    + `#${board.vertices.map((vertex) => vertex.port ?? '-').join('|')}`;
}

/**
 * Hosts the PixiJS board. Owns the Application + BoardRenderer and keeps them in
 * sync with the store: rebuild on a new board, re-sync pieces on any state
 * change, and refresh click highlights when the interaction context changes.
 */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const lastBoardLayout = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [robberChoice, setRobberChoice] = useState<{ tile: number; action: Extract<Action, { type: 'moveRobber' | 'playKnight' }>['type']; victims: number[] } | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);

  const game = useGame((s) => s.game);
  const build = useGame((s) => s.build);
  const humanId = useGame((s) => s.humanId);
  const spectator = useGame((s) => s.spectator);
  const dispatch = useGame((s) => s.dispatch);
  const reducedMotion = useReducedMotionPreference();
  const requestRobberVictim = useCallback((tile: number, action: 'moveRobber' | 'playKnight', victims: number[]) => {
    setRobberChoice({ tile, action, victims });
  }, []);
  const interaction = spectator
    ? null
    : deriveInteraction(game, build, humanId, dispatch, requestRobberVictim);

  const sidebarInset = (width: number) => width >= 1280 ? 320 : width >= 1024 ? 280 : width >= 768 ? 260 : 0;

  // Initialise Pixi once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let app: Application | null = null;
    let disposed = false;

    (async () => {
      const instance = new Application();
      await instance.init({
        resizeTo: host,
        antialias: true,
        backgroundColor: 0x0966a5,
        backgroundAlpha: 1,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (disposed) {
        instance.destroy(true);
        return;
      }
      app = instance;
      host.appendChild(app.canvas);
      const textures = await loadBoardTextures();
      if (disposed) {
        instance.destroy(true);
        return;
      }
      const renderer = new BoardRenderer(app, textures);
      renderer.setBottomInset(112);
      renderer.setRightInset(sidebarInset(instance.screen.width));
      rendererRef.current = renderer;
      setTileLocator((id) => renderer.tileClientPosition(id));
      app.renderer.on('resize', () => {
        renderer.setRightInset(sidebarInset(instance.screen.width));
        renderer.fit();
      });
      setReady(true);
    })();

    return () => {
      disposed = true;
      rendererRef.current = null;
      lastBoardLayout.current = null;
      setTileLocator(null);
      if (app) app.destroy(true, { children: true });
    };
  }, []);

  // Rebuild board + reflect pieces.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !game) return;
    // Socket snapshots deserialize fresh array/object identities on every
    // action. Compare the immutable board layout itself so online updates do
    // not rebuild the renderer and erase piece/robber animation history.
    const layoutKey = boardLayoutKey(game.board);
    const boardChanged = lastBoardLayout.current !== layoutKey;
    if (boardChanged) {
      renderer.buildBoard(game.board);
    }
    lastBoardLayout.current = layoutKey;
    renderer.sync(game);
  }, [game, ready]);

  // Placement highlights + click handlers.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const activeInteraction = robberChoice ? null : interaction;
    renderer.setInteraction(activeInteraction);
  }, [interaction, ready, robberChoice]);

  useEffect(() => subscribeRoadPathHover((playerId) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (playerId === null || !game) renderer.clearRoadPathHighlight();
    else renderer.showPlayerLongestRoad(game, playerId);
  }), [game, ready]);

  useEffect(() => subscribeBoardPreview((preview) => {
    const renderer = rendererRef.current;
    if (renderer && game) renderer.setBoardPreview(game, preview);
  }), [game, ready]);

  useEffect(() => {
    rendererRef.current?.setReducedMotion(reducedMotion);
  }, [ready, reducedMotion]);

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  };
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < 6) return;
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (Math.abs(dx) + Math.abs(dy) === 0) return;
    rendererRef.current?.panByClient(dx, dy);
  };
  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const recenter = () => {
    rendererRef.current?.fit();
  };
  const zoom = (factor: number) => {
    rendererRef.current?.zoomBy(factor);
  };
  const zoomWithWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  useEffect(() => subscribeBoardControl((action) => {
    if (action === 'zoomIn') zoom(1.2);
    else if (action === 'zoomOut') zoom(1 / 1.2);
    else recenter();
  }));

  // The canvas spans the full viewport so panned board content can travel behind HUD panels.
  // BoardRenderer still reserves the sidebar while fitting the initial board position.
  return (
    <div className="absolute inset-0">
      <div
        ref={hostRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onWheel={zoomWithWheel}
      />
      {interaction && <KeyboardPlacementTargets interaction={interaction} renderer={rendererRef.current} />}
      {robberChoice && game && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-card p-4 text-ink shadow-pop ring-1 ring-black/10 dark:ring-white/15">
            <h2 className="font-display text-lg font-extrabold">Choose a player to rob</h2>
            <p className="mt-1 text-sm text-ink-soft">Select one opponent next to the robber.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {robberChoice.victims.map((playerId) => (
                <button
                  key={playerId}
                  type="button"
                  onClick={() => {
                    dispatch(robberChoice.action === 'playKnight'
                      ? { type: 'playKnight', tile: robberChoice.tile, stealFrom: playerId, player: humanId }
                      : { type: 'moveRobber', tile: robberChoice.tile, stealFrom: playerId, player: humanId });
                    setRobberChoice(null);
                  }}
                  className="flex min-w-24 flex-1 flex-col items-center gap-1 rounded-xl bg-card-alt px-3 py-3 text-center text-sm font-extrabold transition hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg ring-2 ring-white" style={{ background: PLAYER_CSS[game.players[playerId].color] }}>
                    <PlayerIcon isBot={game.players[playerId].isBot} className="h-7 w-7" />
                  </span>
                  <span>{game.players[playerId].name}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setRobberChoice(null)} className="mt-3 w-full text-center text-xs font-bold text-ink-faint underline">Choose another hex</button>
          </div>
        </div>
      )}
    </div>
  );
}

function KeyboardPlacementTargets({ interaction, renderer }: { interaction: NonNullable<ReturnType<typeof deriveInteraction>>; renderer: BoardRenderer | null }) {
  if (!renderer) return null;
  const targets = [
    ...(interaction.vertices ?? []).map((id) => ({ key: `v-${id}`, label: `Place town at location ${id}`, position: renderer.vertexClientPosition(id), action: () => interaction.onVertex?.(id) })),
    ...(interaction.cityVertices ?? []).map((id) => ({ key: `c-${id}`, label: `Upgrade town at location ${id}`, position: renderer.vertexClientPosition(id), action: () => interaction.onVertex?.(id) })),
    ...(interaction.edges ?? []).map((id) => ({ key: `e-${id}`, label: `Place road at edge ${id}`, position: renderer.edgeClientPosition(id), action: () => interaction.onEdge?.(id) })),
    ...(interaction.tiles ?? []).map((id) => ({ key: `t-${id}`, label: `Choose tile ${id}`, position: renderer.tileClientPosition(id), action: () => interaction.onTile?.(id) })),
  ];
  return <div className="pointer-events-none fixed inset-0 z-[19]">{targets.map((target) => target.position && <button key={target.key} type="button" aria-label={target.label} onClick={target.action} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); target.action(); } }} style={{ left: target.position.x - 22, top: target.position.y - 22 }} className="pointer-events-auto absolute h-11 w-11 rounded-full bg-transparent text-transparent focus-visible:bg-amber-300/70 focus-visible:outline focus-visible:outline-4 focus-visible:outline-black"><span className="sr-only">{target.label}</span></button>)}</div>;
}
