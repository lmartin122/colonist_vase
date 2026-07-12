import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Application } from 'pixi.js';
import type { Board } from '../engine/types';
import { BoardRenderer } from '../render/BoardRenderer';
import { setTileLocator } from '../render/boardAnchors';
import { loadBoardTextures } from '../render/textures';
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
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);

  const game = useGame((s) => s.game);
  const build = useGame((s) => s.build);
  const humanId = useGame((s) => s.humanId);
  const dispatch = useGame((s) => s.dispatch);

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
        backgroundAlpha: 0,
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
      rendererRef.current = renderer;
      setTileLocator((id) => renderer.tileClientPosition(id));
      app.renderer.on('resize', () => {
        renderer.fit();
        setPanned(false);
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
    renderer.setInteraction(deriveInteraction(game, build, humanId, dispatch));
  }, [game, build, humanId, dispatch, ready]);

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
  };

  // Leave room for the right sidebar on md+ so the board centers in the play area.
  return (
    <div className="absolute inset-y-0 left-0 right-0 md:right-[300px] lg:right-[330px]">
      <div
        ref={hostRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      />
      {panned && (
        <button
          type="button"
          onClick={recenter}
          aria-label="Recenter board"
          title="Recenter board"
          className="pointer-events-auto absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-card text-ink shadow-panel ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-card-alt dark:ring-white/15"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="1.5" className="fill-current stroke-none" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </button>
      )}
    </div>
  );
}
