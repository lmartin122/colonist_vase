import { Application, Circle, Container, FillGradient, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import type { Board, GameState, PlayerColor, PortType, TileType } from '../engine/types';
import { NUMBER_PIPS } from '../engine/constants';
import { HEX_ASSET, cityAsset, roadAsset, settlementAsset } from '../assets';
import { HEX_SIZE, distance } from '../engine/coords';
import type { TextureMap } from './textures';
import {
  HIGHLIGHT,
  OCEAN,
  OCEAN_DEEP,
  OCEAN_WAVE,
  PLAYER_HEX,
  ROBBER_COLOR,
  TILE_COLORS,
  TILE_COLORS_LIGHT,
  TILE_MOTIF,
  TILE_STROKE,
  TOKEN_BG,
  TOKEN_HOT,
  TOKEN_INK,
} from './palette';

export interface InteractionMode {
  vertices?: number[];
  /** Upgrade targets receive a larger ring so they remain visible around settlements. */
  cityVertices?: number[];
  edges?: number[];
  tiles?: number[];
  onVertex?: (id: number) => boolean | void;
  onEdge?: (id: number) => boolean | void;
  onTile?: (id: number) => boolean | void;
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
  private bottomInset = 0;
  private rightInset = 0;
  private fittedScale = 1;
  private interactionLocked = false;

  constructor(
    private readonly app: Application,
    private readonly tex: TextureMap = {},
  ) {
    this.view.addChild(this.water, this.tiles, this.ports, this.overlay, this.pieces);
    app.stage.addChild(this.view);
    app.ticker.add((t) => this.tick(t.deltaMS));
  }

  /** Build a sprite from a preloaded texture URL, or null if it isn't loaded. */
  private sprite(url: string | null): Sprite | null {
    if (!url) return null;
    const texture = this.tex[url];
    return texture ? new Sprite(texture) : null;
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
    // Calm layered ocean.
    g.circle(0, 0, maxR + 140).fill(OCEAN_DEEP);
    g.circle(0, 0, maxR + 78).fill(OCEAN);
    // Subtle concentric wave accents around the island.
    for (let i = 0; i < 3; i++) {
      const r = maxR + 44 + i * 26;
      g.circle(0, 0, r).stroke({ width: 2, color: OCEAN_WAVE, alpha: 0.18 - i * 0.04 });
    }
    // Soft light rim just inside the coastline.
    g.circle(0, 0, maxR + 30).stroke({ width: 6, color: OCEAN_WAVE, alpha: 0.14 });
    this.water.addChild(g);
  }

  private drawTile(board: Board, tileId: number): void {
    const tile = board.tiles[tileId];
    const { x: cx, y: cy } = tile.center;
    const pts = tile.vertexIds.flatMap((v) => [board.vertices[v].point.x, board.vertices[v].point.y]);

    // Soft drop shadow beneath the tile for gentle depth.
    const shadow = new Graphics();
    shadow.poly(pts).fill({ color: 0x0a1a24, alpha: 0.28 });
    shadow.position.set(0, 7);
    this.tiles.addChild(shadow);

    const hexSprite = this.sprite(HEX_ASSET[tile.type]);
    if (hexSprite) {
      // SVG terrain art (includes the resource motif) scaled to the tile height.
      hexSprite.anchor.set(0.5);
      hexSprite.scale.set((HEX_SIZE * 2) / hexSprite.texture.height);
      hexSprite.position.set(cx, cy);
      this.tiles.addChild(hexSprite);
    } else {
      // Fallback for tiles without art (ore, desert): gradient + drawn motif.
      const grad = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: TILE_COLORS_LIGHT[tile.type] },
          { offset: 1, color: TILE_COLORS[tile.type] },
        ],
        textureSpace: 'local',
      });
      const g = new Graphics();
      g.poly(pts).fill(grad).stroke({ width: 3, color: TILE_STROKE, alpha: 0.35 });
      this.tiles.addChild(g);
      this.drawTerrainMotif(tile.type, cx, cy - 20);
    }

    if (tile.number !== null) this.drawToken(cx, cy + 26, tile.number);
  }

  /** Flat, stylized terrain motif drawn with primitives (no emoji). */
  private drawTerrainMotif(type: TileType, cx: number, cy: number): void {
    const g = new Graphics();
    const dark = TILE_MOTIF[type];
    switch (type) {
      case 'wood': {
        g.roundRect(cx - 4, cy + 6, 8, 14, 2).fill(0x6b4a2f);
        for (let i = 0; i < 3; i++) {
          const w = 26 - i * 6;
          const y = cy - 14 + i * 12;
          g.poly([cx - w / 2, y + 14, cx + w / 2, y + 14, cx, y]).fill(dark);
        }
        break;
      }
      case 'brick': {
        const bw = 15, bh = 8, gap = 2;
        for (let row = 0; row < 2; row++) {
          const off = row % 2 ? bw / 2 : 0;
          for (let col = -1; col <= 1; col++) {
            g.roundRect(cx + col * (bw + gap) - bw / 2 + off - 4, cy - 8 + row * (bh + gap), bw, bh, 2).fill(dark);
          }
        }
        break;
      }
      case 'sheep': {
        g.ellipse(cx, cy + 4, 18, 12).fill(0xf3ecdd); // wool
        g.ellipse(cx + 12, cy - 1, 7, 6).fill(dark); // head
        g.roundRect(cx - 10, cy + 12, 3.5, 8, 1).fill(dark);
        g.roundRect(cx + 5, cy + 12, 3.5, 8, 1).fill(dark);
        break;
      }
      case 'wheat': {
        for (let i = -1; i <= 1; i++) {
          const x = cx + i * 10;
          g.roundRect(x - 1.5, cy - 4, 3, 22, 1.5).fill(dark);
          for (let k = 0; k < 3; k++) {
            g.ellipse(x - 4, cy - 2 + k * 6, 3.5, 5).fill(dark);
            g.ellipse(x + 4, cy - 2 + k * 6, 3.5, 5).fill(dark);
          }
        }
        break;
      }
      case 'ore': {
        g.poly([cx - 22, cy + 16, cx - 4, cy - 14, cx + 8, cy + 16]).fill(dark);
        g.poly([cx - 4, cy + 16, cx + 10, cy - 6, cx + 22, cy + 16]).fill(0x707d8c);
        g.poly([cx - 10, cy - 2, cx - 4, cy - 14, cx + 2, cy - 2]).fill(0xe8edf2); // snow cap
        break;
      }
      case 'desert': {
        g.circle(cx, cy - 4, 9).fill(0xf0d67e); // sun
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI / 4) * i;
          g.moveTo(cx + Math.cos(a) * 12, cy - 4 + Math.sin(a) * 12)
            .lineTo(cx + Math.cos(a) * 16, cy - 4 + Math.sin(a) * 16)
            .stroke({ width: 2.5, color: 0xf0d67e, alpha: 0.8 });
        }
        break;
      }
    }
    this.tiles.addChild(g);
  }

  private drawToken(x: number, y: number, value: number): void {
    const hot = value === 6 || value === 8;
    const group = new Container();
    const disc = new Graphics();
    disc.circle(0, 3, 22).fill({ color: 0x0a1a24, alpha: 0.25 }); // soft shadow
    disc.circle(0, 0, 22).fill(TOKEN_BG).stroke({ width: 1.5, color: 0x000000, alpha: 0.06 });
    const label = new Text({
      text: String(value),
      style: new TextStyle({
        fontFamily: 'Baloo 2, Nunito, sans-serif',
        fontSize: hot ? 26 : 23,
        fontWeight: '800',
        fill: hot ? TOKEN_HOT : TOKEN_INK,
      }),
    });
    label.anchor.set(0.5);
    label.position.set(0, -3);

    // Probability pips under the number.
    const pips = NUMBER_PIPS[value] ?? 0;
    const pipGfx = new Graphics();
    const spread = (pips - 1) * 4;
    for (let i = 0; i < pips; i++) {
      pipGfx.circle(-spread / 2 + i * 4, 12, 1.6).fill(hot ? TOKEN_HOT : 0x8a8172);
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
    const nx = mid.x / len;
    const ny = mid.y / len;
    const px = mid.x + nx * 48;
    const py = mid.y + ny * 48;
    const g = new Graphics();
    // Dotted connector from the coast to the badge.
    g.moveTo(mid.x + nx * 10, mid.y + ny * 10).lineTo(px, py).stroke({ width: 3, color: 0xf3ecdd, alpha: 0.4 });
    // Warm rounded badge with a soft shadow.
    g.roundRect(px - 24, py - 12 + 3, 48, 24, 9).fill({ color: 0x0a1a24, alpha: 0.25 });
    g.roundRect(px - 24, py - 12, 48, 24, 9).fill(TOKEN_BG).stroke({ width: 1.5, color: 0x000000, alpha: 0.06 });
    if (port !== '3:1') g.circle(px - 13, py, 6).fill(TILE_COLORS[port]);
    const label = new Text({
      text: port === '3:1' ? '3:1' : '2:1',
      style: new TextStyle({ fontFamily: 'Baloo 2, Nunito, sans-serif', fontSize: 13, fontWeight: '800', fill: TOKEN_INK }),
    });
    label.anchor.set(0.5);
    label.position.set(port === '3:1' ? px : px + 6, py);
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
      const road = this.buildRoad(a, b, state.players[owner].color);
      this.pieces.addChild(road);
      this.animateIfNew(this.seenRoads, Number(edgeStr), road);
    }

    // Buildings
    for (const [vStr, building] of Object.entries(state.buildings)) {
      const p = board.vertices[Number(vStr)].point;
      const color = state.players[building.owner].color;
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

  private buildRoad(a: { x: number; y: number }, b: { x: number; y: number }, color: PlayerColor): Container {
    const c = new Container();
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const edgeLen = distance(a, b);

    const sprite = this.sprite(roadAsset(color));
    if (sprite) {
      sprite.anchor.set(0.5);
      // Road art is a vertical bar; align its long axis with the edge.
      sprite.scale.set((edgeLen * 0.92) / sprite.texture.height);
      sprite.rotation = angle - Math.PI / 2;
      c.addChild(sprite);
    } else {
      const hex = PLAYER_HEX[color];
      const g = new Graphics();
      const ax = a.x + (b.x - a.x) * 0.18, ay = a.y + (b.y - a.y) * 0.18;
      const bx = b.x + (a.x - b.x) * 0.18, by = b.y + (a.y - b.y) * 0.18;
      g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 13, color: darken(hex, 0.65), cap: 'round' });
      g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 9, color: hex, cap: 'round' });
      g.pivot.set(mid.x, mid.y);
      c.addChild(g);
    }
    c.position.set(mid.x, mid.y);
    return c;
  }

  private buildSettlement(p: { x: number; y: number }, color: PlayerColor): Container {
    return this.buildPiece(p, this.sprite(settlementAsset(color)), color, 'settlement');
  }

  private buildCity(p: { x: number; y: number }, color: PlayerColor): Container {
    return this.buildPiece(p, this.sprite(cityAsset(color)), color, 'city');
  }

  private buildPiece(
    p: { x: number; y: number },
    sprite: Sprite | null,
    color: PlayerColor,
    kind: 'settlement' | 'city',
  ): Container {
    const c = new Container();
    if (sprite) {
      const target = kind === 'city' ? 81 : 69; // +50% for stronger board presence
      sprite.anchor.set(0.5, 0.58); // base sits near the vertex
      sprite.scale.set(target / sprite.texture.height);
      c.addChild(sprite);
    } else {
      const hex = PLAYER_HEX[color];
      const g = new Graphics();
      const s = kind === 'city' ? 30 : 23;
      g.ellipse(0, s + 3, s, 5).fill({ color: 0x0a1a24, alpha: 0.25 });
      const shape = [-s, s, -s, -s * 0.2, 0, -s, s, -s * 0.2, s, s];
      g.poly(shape).fill(hex).stroke({ width: 2, color: darken(hex, 0.55) });
      c.addChild(g);
    }
    c.position.set(p.x, p.y);
    return c;
  }

  private buildRobber(): Container {
    const c = new Container();
    const g = new Graphics();
    g.ellipse(0, 20, 12, 4).fill({ color: 0x0a1a24, alpha: 0.3 });
    g.ellipse(0, 6, 12, 16).fill(ROBBER_COLOR).stroke({ width: 1.5, color: 0x000000, alpha: 0.35 });
    g.circle(0, -12, 9).fill(ROBBER_COLOR).stroke({ width: 1.5, color: 0x000000, alpha: 0.35 });
    g.ellipse(-3, -14, 3, 4).fill({ color: 0xffffff, alpha: 0.18 }); // subtle highlight
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
    this.interactionLocked = false;
    this.overlay.removeChildren();
    if (!mode || !this.board) return;
    const board = this.board;

    const vertexTargets = [
      ...(mode.vertices ?? []).map((id) => ({ id, city: false })),
      ...(mode.cityVertices ?? []).map((id) => ({ id, city: true })),
    ];
    for (const { id: vId, city } of vertexTargets) {
      const p = board.vertices[vId].point;
      const dot = new Graphics();
      if (city) {
        dot.circle(0, 0, 30).fill({ color: HIGHLIGHT, alpha: 0.16 }).stroke({ width: 5, color: HIGHLIGHT, alpha: 0.95 });
        dot.circle(0, 0, 22).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      } else {
        dot.circle(0, 0, 16).fill({ color: HIGHLIGHT, alpha: 0.35 }).stroke({ width: 3, color: HIGHLIGHT });
      }
      dot.position.set(p.x, p.y);
      dot.eventMode = 'static';
      dot.cursor = 'pointer';
      dot.hitArea = new Circle(0, 0, city ? 34 : 20);
      (dot as Container & { __pulse?: boolean }).__pulse = true;
      dot.on('pointertap', () => this.invokeInteraction(mode.onVertex, vId));
      this.overlay.addChild(dot);
    }

    for (const eId of mode.edges ?? []) {
      const edge = board.edges[eId];
      const [a, b] = edge.vertexIds.map((v) => board.vertices[v].point);
      const g = new Graphics();
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 24, color: HIGHLIGHT, alpha: 0.32, cap: 'round' });
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 14, color: HIGHLIGHT, alpha: 0.9, cap: 'round' });
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointertap', () => this.invokeInteraction(mode.onEdge, eId));
      this.overlay.addChild(g);
    }

    for (const tId of mode.tiles ?? []) {
      const tile = board.tiles[tId];
      const pts = tile.vertexIds.flatMap((v) => [board.vertices[v].point.x, board.vertices[v].point.y]);
      const g = new Graphics();
      g.poly(pts).fill({ color: HIGHLIGHT, alpha: 0.22 }).stroke({ width: 4, color: HIGHLIGHT, alpha: 0.8 });
      g.circle(tile.center.x, tile.center.y, 22).fill({ color: HIGHLIGHT, alpha: 0.32 }).stroke({ width: 4, color: 0xffffff, alpha: 0.9 });
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointertap', () => this.invokeInteraction(mode.onTile, tId));
      this.overlay.addChild(g);
    }
  }

  /** Ignore duplicate taps until React refreshes the legal placement targets. */
  private invokeInteraction(handler: ((id: number) => boolean | void) | undefined, id: number): void {
    if (!handler || this.interactionLocked) return;
    this.interactionLocked = true;
    if (handler(id) === false) this.interactionLocked = false;
  }

  /** Where a tile's center currently sits in viewport (client) pixels. */
  tileClientPosition(tileId: number): { x: number; y: number } | null {
    if (!this.board) return null;
    const t = this.board.tiles[tileId];
    const s = this.view.scale.x;
    const localX = t.center.x * s + this.view.position.x;
    const localY = t.center.y * s + this.view.position.y;
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = this.app.screen.width ? rect.width / this.app.screen.width : 1;
    const sy = this.app.screen.height ? rect.height / this.app.screen.height : 1;
    return { x: rect.left + localX * sx, y: rect.top + localY * sy };
  }

  /** Scale/translate the board container to fit the current screen. */
  fit(): void {
    if (!this.board) return;
    const maxR = Math.max(...this.board.vertices.map((v) => Math.hypot(v.point.x, v.point.y))) + 130;
    const { width, height } = this.app.screen;
    const usableWidth = Math.max(1, width - this.rightInset);
    const usableHeight = Math.max(1, height - this.bottomInset);
    const scale = Math.min(usableWidth, usableHeight) / (maxR * 2);
    this.fittedScale = scale;
    this.view.scale.set(scale);
    this.view.position.set(usableWidth / 2, usableHeight / 2);
  }

  /** Reserve screen space occupied by HTML controls below the board. */
  setBottomInset(pixels: number): void {
    this.bottomInset = Math.max(0, pixels);
    this.fit();
  }

  /** Reserve screen space occupied by the floating right sidebar while keeping the canvas full-width. */
  setRightInset(pixels: number): void {
    this.rightInset = Math.max(0, pixels);
    this.fit();
  }

  /** Zoom around the center of the playable area without disturbing the board's pan offset. */
  zoomBy(factor: number): void {
    const current = this.view.scale.x;
    const next = Math.min(this.fittedScale * 2.5, Math.max(this.fittedScale * 0.55, current * factor));
    if (next === current) return;
    const anchorX = (this.app.screen.width - this.rightInset) / 2;
    const anchorY = (this.app.screen.height - this.bottomInset) / 2;
    const ratio = next / current;
    this.view.position.set(
      anchorX + (this.view.position.x - anchorX) * ratio,
      anchorY + (this.view.position.y - anchorY) * ratio,
    );
    this.view.scale.set(next);
  }

  /** Move the fitted board by a client-pixel drag delta. */
  panByClient(dx: number, dy: number): void {
    const rect = this.app.canvas.getBoundingClientRect();
    const scaleX = rect.width ? this.app.screen.width / rect.width : 1;
    const scaleY = rect.height ? this.app.screen.height / rect.height : 1;
    this.view.position.x += dx * scaleX;
    this.view.position.y += dy * scaleY;
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

/** Mix a color toward black by `amount` (0..1 keeps more of the original). */
function darken(hex: number, amount: number): number {
  return scale(hex, amount);
}

function scale(hex: number, factor: number): number {
  const r = Math.round(((hex >> 16) & 0xff) * factor);
  const g = Math.round(((hex >> 8) & 0xff) * factor);
  const b = Math.round((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
