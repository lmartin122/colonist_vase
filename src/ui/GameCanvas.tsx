import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { Application } from 'pixi.js';
import type { Action } from '../engine/actions';
import type { Board } from '../engine/types';
import { BoardRenderer } from '../render/BoardRenderer';
import { setTileLocator } from '../render/boardAnchors';
import { loadBoardTextures } from '../render/textures';
import { PLAYER_CSS } from '../render/palette';
import { deriveInteraction } from '../state/interaction';
import { useGame } from '../state/store';

/**
 * Hosts the PixiJS board. Owns the Application + BoardRenderer and keeps them in
 * sync with the store: rebuild on a new board, re-sync pieces on any state
 * change, and refresh click highlights when the interaction context changes.
 */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const lastBoard = useRef<Board | null>(null);
  const [ready, setReady] = useState(false);
  const [panned, setPanned] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [robberChoice, setRobberChoice] = useState<{ tile: number; action: Extract<Action, { type: 'moveRobber' | 'playKnight' }>['type']; victims: number[] } | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);

  const game = useGame((s) => s.game);
  const build = useGame((s) => s.build);
  const humanId = useGame((s) => s.humanId);
  const dispatch = useGame((s) => s.dispatch);
  const requestRobberVictim = useCallback((tile: number, action: 'moveRobber' | 'playKnight', victims: number[]) => {
    setRobberChoice({ tile, action, victims });
  }, []);

  const sidebarInset = (width: number) => width >= 1024 ? 330 : width >= 768 ? 300 : 0;

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
        setPanned(false);
        setZoomed(false);
      });
      setReady(true);
    })();

    return () => {
      disposed = true;
      rendererRef.current = null;
      lastBoard.current = null;
      setTileLocator(null);
      if (app) app.destroy(true, { children: true });
    };
  }, []);

  // Rebuild board + reflect pieces.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !game) return;
    if (lastBoard.current !== game.board) {
      renderer.buildBoard(game.board);
      lastBoard.current = game.board;
    }
    renderer.sync(game);
  }, [game, ready]);

  // Placement highlights + click handlers.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setInteraction(robberChoice ? null : deriveInteraction(game, build, humanId, dispatch, requestRobberVictim));
  }, [game, build, humanId, dispatch, ready, requestRobberVictim, robberChoice]);

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
    setPanned(true);
  };
  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const recenter = () => {
    rendererRef.current?.fit();
    setPanned(false);
    setZoomed(false);
  };
  const zoom = (factor: number) => {
    rendererRef.current?.zoomBy(factor);
    setZoomed(true);
  };
  const zoomWithWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

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
      <div className="pointer-events-auto absolute left-[6.5rem] top-3 z-10 flex gap-1.5 sm:left-28 sm:top-4">
        <MapControl label="Zoom in" onClick={() => zoom(1.2)}>+</MapControl>
        <MapControl label="Zoom out" onClick={() => zoom(1 / 1.2)}>−</MapControl>
        {(panned || zoomed) && (
          <MapControl label="Recenter board" onClick={recenter}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="1.5" className="fill-current stroke-none" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          </MapControl>
        )}
      </div>
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
                    {game.players[playerId].isBot ? '🤖' : '🎩'}
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

function MapControl({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="flex h-9 w-9 items-center justify-center rounded-xl bg-card text-lg font-extrabold text-ink shadow-panel ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-card-alt dark:ring-white/15">
      {children}
    </button>
  );
}
