import { Application, Circle, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Board, GameState, PortType } from '../engine/types';
import { NUMBER_PIPS } from '../engine/constants';
import {
  HIGHLIGHT,
  OCEAN,
  OCEAN_DEEP,
  PLAYER_HEX,
  ROBBER_COLOR,
  TILE_COLORS,
  TILE_GLYPH,
  TILE_STROKE,
  TOKEN_BG,
  TOKEN_HOT,
} from './palette';

export interface InteractionMode {
  vertices?: number[];
  edges?: number[];
  tiles?: number[];
  onVertex?: (id: number) => void;
  onEdge?: (id: number) => void;
  onTile?: (id: number) => void;
}

interface Anim {
  target: Container;
  elapsed: number;
  duration: number;
}

/**
 * Draws the board and pieces from GameState onto a PixiJS stage. The renderer is
 * a pure *view*: it never mutates game state, only reflects it and emits click
 * intents for vertices/edges when a placement mode is active.
 */
export class BoardRenderer {
  readonly view = new Container();
  private readonly water = new Container();
  private readonly tiles = new Container();
  private readonly ports = new Container();
  private readonly pieces = new Container();
  private readonly overlay = new Container();

  private board: Board | null = null;
  private seenBuildings = new Set<number>();
  private seenRoads = new Set<number>();
  private anims: Anim[] = [];
  private robberSprite: Container | null = null;

  constructor(private readonly app: Application) {
    this.view.addChild(this.water, this.tiles, this.ports, this.pieces, this.overlay);
    app.stage.addChild(this.view);
    app.ticker.add((t) => this.tick(t.deltaMS));
  }

  /** Build the static board (tiles, tokens, ports, water) once per game. */
  buildBoard(board: Board): void {
    this.board = board;
    this.tiles.removeChildren();
    this.ports.removeChildren();
    this.water.removeChildren();
    this.pieces.removeChildren();
    this.seenBuildings.clear();
    this.seenRoads.clear();
    this.robberSprite = null;

    this.drawWater(board);
    for (const tile of board.tiles) this.drawTile(board, tile.id);
    this.drawPorts(board);
    this.fit();
  }

  private drawWater(board: Board): void {
    const maxR = Math.max(...board.vertices.map((v) => Math.hypot(v.point.x, v.point.y)));
    const g = new Graphics();
    g.circle(0, 0, maxR + 90).fill(OCEAN_DEEP);
    g.circle(0, 0, maxR + 60).fill(OCEAN);
    this.water.addChild(g);
  }

  private drawTile(board: Board, tileId: number): void {
    const tile = board.tiles[tileId];
    const pts = tile.vertexIds.flatMap((v) => [board.vertices[v].point.x, board.vertices[v].point.y]);
    const g = new Graphics();
    g.poly(pts).fill(TILE_COLORS[tile.type]).stroke({ width: 5, color: TILE_STROKE, alpha: 0.55 });
    // Soft top highlight for a subtle 3D feel.
    g.poly(pts).fill({ color: 0xffffff, alpha: 0.06 });
    this.tiles.addChild(g);

    const glyph = new Text({
      text: TILE_GLYPH[tile.type],
      style: new TextStyle({ fontSize: 40 }),
    });
    glyph.anchor.set(0.5);
    glyph.position.set(tile.center.x, tile.center.y - 30);
    this.tiles.addChild(glyph);

    if (tile.number !== null) this.drawToken(tile.center.x, tile.center.y + 24, tile.number);
  }

  private drawToken(x: number, y: number, value: number): void {
    const hot = value === 6 || value === 8;
    const group = new Container();
    const disc = new Graphics();
    disc.circle(0, 0, 26).fill(TOKEN_BG).stroke({ width: 2, color: 0x9a8c6a });
    const label = new Text({
      text: String(value),
      style: new TextStyle({
        fontFamily: 'Baloo 2, sans-serif',
        fontSize: hot ? 28 : 24,
        fontWeight: '800',
        fill: hot ? TOKEN_HOT : 0x33302a,
      }),
    });
    label.anchor.set(0.5);
    label.position.set(0, -4);

    // Probability pips under the number.
    const pips = NUMBER_PIPS[value] ?? 0;
    const pipGfx = new Graphics();
    const spread = (pips - 1) * 4;
    for (let i = 0; i < pips; i++) {
      pipGfx.circle(-spread / 2 + i * 4, 12, 1.6).fill(hot ? TOKEN_HOT : 0x6b6353);
    }
    group.addChild(disc, label, pipGfx);
    group.position.set(x, y);
    this.tiles.addChild(group);
  }

  private drawPorts(board: Board): void {
    for (const edge of board.edges) {
      if (!edge.coastal) continue;
      const [a, b] = edge.vertexIds;
      const pa = board.vertices[a].port;
      const pb = board.vertices[b].port;
      if (!pa || pa !== pb) continue; // a port occupies both vertices of one edge
      this.drawPortBadge(board, edge.point, pa);
    }
  }

  private drawPortBadge(_board: Board, mid: { x: number; y: number }, port: PortType): void {
    const len = Math.hypot(mid.x, mid.y) || 1;
    const px = mid.x + (mid.x / len) * 46;
    const py = mid.y + (mid.y / len) * 46;
    const g = new Graphics();
    g.roundRect(px - 26, py - 15, 52, 30, 10).fill({ color: 0x0c2334, alpha: 0.85 }).stroke({ width: 2, color: 0x7fb3d5 });
    // connector
    g.moveTo(px, py).lineTo(mid.x, mid.y).stroke({ width: 3, color: 0x7fb3d5, alpha: 0.5 });
    const label = new Text({
      text: port === '3:1' ? '3:1' : `2:1 ${TILE_GLYPH[port]}`,
      style: new TextStyle({ fontFamily: 'Baloo 2, sans-serif', fontSize: 14, fontWeight: '700', fill: 0xe8f4ff }),
    });
    label.anchor.set(0.5);
    label.position.set(px, py);
    this.ports.addChild(g, label);
  }

  /** Reflect the dynamic parts of state: robber, roads, buildings. */
  sync(state: GameState): void {
    const board = state.board;
    this.pieces.removeChildren();

    // Roads
    for (const [edgeStr, owner] of Object.entries(state.roads)) {
      const edge = board.edges[Number(edgeStr)];
      const [a, b] = edge.vertexIds.map((v) => board.vertices[v].point);
      const road = this.buildRoad(a, b, PLAYER_HEX[state.players[owner].color]);
      this.pieces.addChild(road);
      this.animateIfNew(this.seenRoads, Number(edgeStr), road);
    }

    // Buildings
    for (const [vStr, building] of Object.entries(state.buildings)) {
      const p = board.vertices[Number(vStr)].point;
      const color = PLAYER_HEX[state.players[building.owner].color];
      const piece = building.type === 'city' ? this.buildCity(p, color) : this.buildSettlement(p, color);
      this.pieces.addChild(piece);
      this.animateIfNew(this.seenBuildings, Number(vStr), piece);
    }

    // Robber
    const robberTile = board.tiles[board.robberTileId];
    this.robberSprite = this.buildRobber();
    this.robberSprite.position.set(robberTile.center.x + 34, robberTile.center.y - 6);
    this.pieces.addChild(this.robberSprite);
  }

  private buildRoad(a: { x: number; y: number }, b: { x: number; y: number }, color: number): Container {
    const c = new Container();
    const g = new Graphics();
    // Inset from the vertices so roads read as segments, not full spans.
    const ax = a.x + (b.x - a.x) * 0.18;
    const ay = a.y + (b.y - a.y) * 0.18;
    const bx = b.x + (a.x - b.x) * 0.18;
    const by = b.y + (a.y - b.y) * 0.18;
    g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 14, color: TILE_STROKE, cap: 'round' });
    g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 9, color, cap: 'round' });
    c.addChild(g);
    c.pivot.set((ax + bx) / 2, (ay + by) / 2);
    c.position.set((ax + bx) / 2, (ay + by) / 2);
    return c;
  }

  private buildSettlement(p: { x: number; y: number }, color: number): Container {
    const c = new Container();
    const g = new Graphics();
    const s = 15;
    g.poly([-s, s, -s, -s * 0.2, 0, -s, s, -s * 0.2, s, s])
      .fill(color)
      .stroke({ width: 3, color: TILE_STROKE });
    c.addChild(g);
    c.position.set(p.x, p.y);
    return c;
  }

  private buildCity(p: { x: number; y: number }, color: number): Container {
    const c = new Container();
    const g = new Graphics();
    const s = 20;
    g.roundRect(-s, -2, s * 2, s, 3).fill(color).stroke({ width: 3, color: TILE_STROKE });
    g.poly([-s, -2, -s, -s * 0.6, -s * 0.2, -s, s * 0.4, -s * 0.6, s * 0.4, -2])
      .fill(color)
      .stroke({ width: 3, color: TILE_STROKE });
    c.addChild(g);
    c.position.set(p.x, p.y);
    return c;
  }

  private buildRobber(): Container {
    const c = new Container();
    const g = new Graphics();
    g.ellipse(0, 6, 12, 16).fill(ROBBER_COLOR).stroke({ width: 2, color: 0x000000, alpha: 0.4 });
    g.circle(0, -12, 9).fill(ROBBER_COLOR).stroke({ width: 2, color: 0x000000, alpha: 0.4 });
    c.addChild(g);
    return c;
  }

  private animateIfNew(seen: Set<number>, id: number, target: Container): void {
    if (seen.has(id)) return;
    seen.add(id);
    target.scale.set(0.1);
    this.anims.push({ target, elapsed: 0, duration: 260 });
  }

  /** Highlight legal placement spots and wire click callbacks. */
  setInteraction(mode: InteractionMode | null): void {
    this.overlay.removeChildren();
    if (!mode || !this.board) return;
    const board = this.board;

    for (const vId of mode.vertices ?? []) {
      const p = board.vertices[vId].point;
      const dot = new Graphics();
      dot.circle(0, 0, 16).fill({ color: HIGHLIGHT, alpha: 0.35 }).stroke({ width: 3, color: HIGHLIGHT });
      dot.position.set(p.x, p.y);
      dot.eventMode = 'static';
      dot.cursor = 'pointer';
      dot.hitArea = new Circle(0, 0, 20);
      (dot as Container & { __pulse?: boolean }).__pulse = true;
      dot.on('pointertap', () => mode.onVertex?.(vId));
      this.overlay.addChild(dot);
    }

    for (const eId of mode.edges ?? []) {
      const edge = board.edges[eId];
      const [a, b] = edge.vertexIds.map((v) => board.vertices[v].point);
      const g = new Graphics();
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 16, color: HIGHLIGHT, alpha: 0.55, cap: 'round' });
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointertap', () => mode.onEdge?.(eId));
      this.overlay.addChild(g);
    }

    for (const tId of mode.tiles ?? []) {
      const tile = board.tiles[tId];
      const pts = tile.vertexIds.flatMap((v) => [board.vertices[v].point.x, board.vertices[v].point.y]);
      const g = new Graphics();
      g.poly(pts).fill({ color: HIGHLIGHT, alpha: 0.22 }).stroke({ width: 4, color: HIGHLIGHT, alpha: 0.8 });
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointertap', () => mode.onTile?.(tId));
      this.overlay.addChild(g);
    }
  }

  /** Scale/translate the board container to fit the current screen. */
  fit(): void {
    if (!this.board) return;
    const maxR = Math.max(...this.board.vertices.map((v) => Math.hypot(v.point.x, v.point.y))) + 130;
    const { width, height } = this.app.screen;
    const scale = Math.min(width, height) / (maxR * 2);
    this.view.scale.set(scale);
    this.view.position.set(width / 2, height / 2);
  }

  private tick(deltaMS: number): void {
    // Pop-in animations for freshly placed pieces.
    this.anims = this.anims.filter((a) => {
      if (a.duration <= 1) return false;
      a.elapsed += deltaMS;
      const t = Math.min(1, a.elapsed / a.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      a.target.scale.set(0.1 + eased * 0.9);
      return t < 1;
    });
    // Gentle pulse on placement highlight dots (positioned around their own origin).
    const pulse = 1 + Math.sin(this.app.ticker.lastTime / 300) * 0.12;
    for (const child of this.overlay.children) {
      if ((child as Container & { __pulse?: boolean }).__pulse) child.scale.set(pulse);
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
