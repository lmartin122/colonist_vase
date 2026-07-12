import { useEffect, useRef, useState } from 'react';
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
      rendererRef.current = renderer;
      setTileLocator((id) => renderer.tileClientPosition(id));
      app.renderer.on('resize', () => renderer.fit());
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

  // Leave room for the right sidebar on md+ so the board centers in the play area.
  return <div ref={hostRef} className="absolute inset-y-0 left-0 right-0 md:right-[300px] lg:right-[330px]" />;
}
