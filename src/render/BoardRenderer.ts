import { Application, Circle, Container, FillGradient, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import type { Board, GameState, PlayerColor, PortType, TileType } from '../engine/types';
import { NUMBER_PIPS } from '../engine/constants';
import { HEX_FRAME, HEX_SIDE_FRAME, HIGHLIGHT_CIRCLE_FRAME, PORT_PIER_FRAME, PORT_SHIP_FRAME, ROBBER_FRAME, SHORE_TILES, cityFrame, probabilityFrame, roadFrame, settlementFrame } from '../assets';
import { HEX_SIZE, axialToPixel, distance } from '../engine/coords';
import { longestRoadPath, longestRoadPathThroughEdge } from '../engine/longestRoad';
import type { TextureMap } from './textures';
import type { BoardPreview } from '../state/boardPreview';
import {
  HIGHLIGHT,
  LAND_SAND,
  PLAYER_HEX,
  TILE_COLORS,
  TILE_COLORS_LIGHT,
  TILE_MOTIF,
  TOKEN_BG,
  TOKEN_HOT,
  TOKEN_INK,
} from './palette';

/** Axial offset toward each hex side, indexed by side (0 = upper-right, clockwise). */
const SHORE_SIDE_DIRS = [
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
];
/** Grow the shore sprite slightly past its hex so the sand meets the land. */
const SHORE_OVERSCALE = 1.08;
/** Terrain tiles sit slightly inset so the flat sand base shows as clean joints.
 * Kept close to 1 so the joints stay thin and placed roads overlap the tile edge. */
const TILE_INSET = 0.992;
/** Shared presentation controls for every `tile_*_side` overlay. */
const TILE_SIDE_WIDTH = HEX_SIZE * 1.1;
const TILE_SIDE_OFFSET_Y = -40;

/** Find the shore composite + rotation whose beach sides match the given sides. */
function matchShore(mask: number[]): { frame: string; rot: number } | null {
  const target = [...mask].sort((a, b) => a - b).join(',');
  for (const tile of SHORE_TILES) {
    for (let rot = 0; rot < 6; rot++) {
      const rotated = tile.sides
        .map((s) => (s + rot) % 6)
        .sort((a, b) => a - b)
        .join(',');
      if (rotated === target) return { frame: tile.frame, rot };
    }
  }
  return null;
}

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

interface RobberMoveAnim extends Anim {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/**
 * Draws the board and pieces from GameState onto a PixiJS stage. The renderer is
 * a pure *view*: it never mutates game state, only reflects it and emits click
 * intents for vertices/edges when a placement mode is active.
 */
export class BoardRenderer {
  readonly view = new Container();
  private readonly shore = new Container();
  private readonly land = new Container();
  private readonly tiles = new Container();
  private readonly ports = new Container();
  private readonly roadHover = new Container();
  private readonly preview = new Container();
  private readonly pieces = new Container();
  private readonly overlay = new Container();

  private board: Board | null = null;
  private seenBuildings = new Set<number>();
  private seenRoads = new Set<number>();
  private anims: Anim[] = [];
  private robberSprite: Container | null = null;
  private robberTileId: number | null = null;
  private robberMove: RobberMoveAnim | null = null;
  private bottomInset = 0;
  private rightInset = 0;
  private fittedScale = 1;
  private interactionLocked = false;
  private reducedMotion = false;

  constructor(
    private readonly app: Application,
    private readonly tex: TextureMap = {},
  ) {
    this.view.addChild(this.land, this.shore, this.tiles, this.ports, this.preview, this.overlay, this.roadHover, this.pieces);
    app.stage.addChild(this.view);
    app.ticker.add((t) => this.tick(t.deltaMS));
  }

  /** Build a sprite from a preloaded URL/frame key, or null if it isn't loaded. */
  private sprite(key: string | null): Sprite | null {
    if (!key) return null;
    const texture = this.tex[key];
    return texture ? new Sprite(texture) : null;
  }

  /** Build the static board (tiles, tokens, ports, water) once per game. */
  buildBoard(board: Board): void {
    this.board = board;
    this.tiles.removeChildren();
    this.ports.removeChildren();
    this.land.removeChildren();
    this.shore.removeChildren();
    this.pieces.removeChildren();
    this.seenBuildings.clear();
    this.seenRoads.clear();
    this.robberSprite = null;
    this.robberTileId = null;
    this.robberMove = null;

    this.drawShore(board);
    this.drawLand(board);
    for (const tile of board.tiles) this.drawTile(board, tile.id);
    this.drawPorts(board);
    this.fit();
  }

  /**
   * Flat sand the tiles rest on. Filling the whole island footprint in one solid
   * colour makes every joint between tiles read as clean sand (the tiles sit
   * slightly inset on top), with no borders or shadows. The open ocean is just
   * the canvas background, so there is nothing else to draw for the water.
   */
  private drawLand(board: Board): void {
    const g = new Graphics();
    for (const tile of board.tiles) {
      const { x: cx, y: cy } = tile.center;
      const pts: number[] = [];
      for (const v of tile.vertexIds) {
        const p = board.vertices[v].point;
        pts.push(cx + (p.x - cx) * 1.03, cy + (p.y - cy) * 1.03);
      }
      g.poly(pts).fill(LAND_SAND);
    }
    this.land.addChild(g);
  }

  /**
   * Sandy shoreline. For every sea position adjacent to the island we pick the
   * shore composite whose beach sides match the sides facing land, rotate it into
   * place, and draw it centred on that sea hex. The sprites carry sand on the
   * land-facing side and foam toward the ocean, and — being whole-hex composites
   * — join cleanly at the corners instead of overlapping like per-edge segments.
   */
  private drawShore(board: Board): void {
    const land = new Set(board.tiles.map((t) => `${t.axial.q},${t.axial.r}`));
    const sea = new Map<string, { q: number; r: number }>();
    for (const t of board.tiles) {
      for (const d of SHORE_SIDE_DIRS) {
        const q = t.axial.q + d.q;
        const r = t.axial.r + d.r;
        const key = `${q},${r}`;
        if (!land.has(key)) sea.set(key, { q, r });
      }
    }
    for (const { q, r } of sea.values()) {
      const mask: number[] = [];
      for (let i = 0; i < 6; i++) {
        if (land.has(`${q + SHORE_SIDE_DIRS[i].q},${r + SHORE_SIDE_DIRS[i].r}`)) mask.push(i);
      }
      if (mask.length === 0) continue;
      const match = matchShore(mask);
      if (!match) continue;
      const sprite = this.sprite(match.frame);
      if (!sprite) continue;
      const center = axialToPixel({ q, r });
      sprite.anchor.set(0.5);
      sprite.scale.set((HEX_SIZE * 2 * SHORE_OVERSCALE) / sprite.texture.height);
      sprite.rotation = (match.rot * Math.PI) / 3;
      sprite.position.set(center.x, center.y);
      this.shore.addChild(sprite);
    }
  }

  private drawTile(board: Board, tileId: number): void {
    const tile = board.tiles[tileId];
    const { x: cx, y: cy } = tile.center;
    const pts = tile.vertexIds.flatMap((v) => {
      const p = board.vertices[v].point;
      return [cx + (p.x - cx) * TILE_INSET, cy + (p.y - cy) * TILE_INSET];
    });

    const hexSprite = this.sprite(HEX_FRAME[tile.type]);
    if (hexSprite) {
      // Packed `tile_*_empty` art supplies the terrain base.
      hexSprite.anchor.set(0.5);
      hexSprite.scale.set((HEX_SIZE * 2 * TILE_INSET) / hexSprite.texture.height);
      hexSprite.position.set(cx, cy);
      this.tiles.addChild(hexSprite);
    } else {
      // Network/load fallback: retain a usable procedural tile.
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
      g.poly(pts).fill(grad);
      this.tiles.addChild(g);
    }

    const sideSprite = this.sprite(HEX_SIDE_FRAME[tile.type]);
    if (sideSprite) {
      sideSprite.anchor.set(0.5);
      // Atlas frames have different source widths (for example, desert is
      // wider than lumber). Scale from each frame's own width so all terrain
      // illustrations have the same apparent width and retain their aspect.
      sideSprite.scale.set(TILE_SIDE_WIDTH / sideSprite.texture.width);
      sideSprite.position.set(cx, cy + TILE_SIDE_OFFSET_Y);
      this.tiles.addChild(sideSprite);
    } else {
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
    const token = this.sprite(probabilityFrame(value));
    if (token) {
      token.anchor.set(0.5);
      token.scale.set(72 / token.texture.width);
      token.position.set(x, y);
      this.tiles.addChild(token);
      return;
    }

    // Procedural fallback if the packed token art could not be loaded.
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
    group.scale.set(1.61); // larger number tokens (40% + a further 15%)
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
      this.drawPort(edge.point, board.vertices[a].point, board.vertices[b].point, pa);
    }
  }

  /**
   * A port is a trade ship sitting just off the coast with a wooden pier running
   * to each of its two buildable vertices. The ship sail already carries the
   * ratio + resource art, so no text overlay is needed.
   */
  private drawPort(
    mid: { x: number; y: number },
    va: { x: number; y: number },
    vb: { x: number; y: number },
    port: PortType,
  ): void {
    // Offset the ship along the edge's outward perpendicular bisector so both
    // piers come out the same length (rather than the radial direction, which
    // leaves one pier long and one short on tilted edges).
    let px = -(vb.y - va.y);
    let py = vb.x - va.x;
    const plen = Math.hypot(px, py) || 1;
    px /= plen;
    py /= plen;
    if (px * mid.x + py * mid.y < 0) { px = -px; py = -py; } // point outward, away from center
    const ship = { x: mid.x + px * 58, y: mid.y + py * 58 };

    // Piers first so the ship hull overlaps their seaward end.
    this.addPier(ship, va);
    this.addPier(ship, vb);

    const sprite = this.sprite(PORT_SHIP_FRAME[port]);
    if (sprite) {
      sprite.anchor.set(0.5, 0.7); // waterline near the ship point, sail above
      sprite.scale.set(84 / sprite.texture.height);
      sprite.position.set(ship.x, ship.y);
      this.ports.addChild(sprite);
      return;
    }

    // Fallback badge if the atlas frame failed to load.
    const g = new Graphics();
    g.roundRect(ship.x - 24, ship.y - 12, 48, 24, 9).fill(TOKEN_BG).stroke({ width: 1.5, color: 0x000000, alpha: 0.06 });
    if (port !== '3:1') g.circle(ship.x - 13, ship.y, 6).fill(TILE_COLORS[port]);
    const label = new Text({
      text: port === '3:1' ? '3:1' : '2:1',
      style: new TextStyle({ fontFamily: 'Baloo 2, Nunito, sans-serif', fontSize: 13, fontWeight: '800', fill: TOKEN_INK }),
    });
    label.anchor.set(0.5);
    label.position.set(port === '3:1' ? ship.x : ship.x + 6, ship.y);
    this.ports.addChild(g, label);
  }

  private addPier(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const pier = this.sprite(PORT_PIER_FRAME);
    if (!pier) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    pier.anchor.set(0.5, 0.5);
    pier.rotation = Math.atan2(dy, dx) - Math.PI / 2; // art runs along its height
    pier.scale.set(15 / pier.texture.width, dist / pier.texture.height);
    pier.position.set((from.x + to.x) / 2, (from.y + to.y) / 2);
    this.ports.addChild(pier);
  }

  /** Reflect the dynamic parts of state: robber, roads, buildings. */
  sync(state: GameState): void {
    const board = state.board;
    // Keep the same robber display object so an in-progress move survives
    // unrelated state syncs while roads and buildings are reconstructed.
    const robber = this.robberSprite ?? this.buildRobber();
    this.roadHover.removeChildren();
    this.pieces.removeChildren();

    // Roads
    for (const [edgeStr, owner] of Object.entries(state.roads)) {
      const edgeId = Number(edgeStr);
      const edge = board.edges[edgeId];
      const [a, b] = edge.vertexIds.map((v) => board.vertices[v].point);
      const road = this.buildRoad(a, b, state.players[owner].color);
      road.eventMode = 'static';
      road.cursor = 'pointer';
      road.on('pointerenter', () => this.showRoadPath(state, owner, edgeId));
      road.on('pointerleave', () => this.roadHover.removeChildren());
      this.pieces.addChild(road);
      this.animateIfNew(this.seenRoads, edgeId, road);
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
    const targetX = robberTile.center.x + 34;
    const targetY = robberTile.center.y - 6;
    if (!this.reducedMotion && this.robberTileId !== null && this.robberTileId !== board.robberTileId) {
      this.robberMove = {
        target: robber,
        fromX: robber.position.x,
        fromY: robber.position.y,
        toX: targetX,
        toY: targetY,
        elapsed: 0,
        duration: 520,
      };
    } else if (!this.robberMove) {
      robber.position.set(targetX, targetY);
    }
    this.robberSprite = robber;
    this.robberTileId = board.robberTileId;
    this.pieces.addChild(robber);
  }

  private buildRoad(a: { x: number; y: number }, b: { x: number; y: number }, color: PlayerColor): Container {
    const c = new Container();
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const edgeLen = distance(a, b);

    const sprite = this.sprite(roadFrame(color));
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
    // A visible sprite can have a heavily trimmed atlas bound. Give every road
    // an explicit full-length hover target so pointer detection is dependable.
    const hitTarget = new Graphics();
    hitTarget
      .moveTo(a.x - mid.x, a.y - mid.y)
      .lineTo(b.x - mid.x, b.y - mid.y)
      .stroke({ width: 30, color: 0x000000, alpha: 0.001, cap: 'round' });
    c.addChild(hitTarget);
    c.position.set(mid.x, mid.y);
    return c;
  }

  private showRoadPath(state: GameState, owner: number, hoveredEdge: number): void {
    const path = longestRoadPathThroughEdge(state, owner, hoveredEdge);
    this.renderRoadPath(state, owner, path);
  }

  showPlayerLongestRoad(state: GameState, playerId: number): void {
    this.renderRoadPath(state, playerId, longestRoadPath(state, playerId));
  }

  clearRoadPathHighlight(): void {
    this.roadHover.removeChildren();
  }

  setBoardPreview(state: GameState, preview: BoardPreview | null): void {
    this.preview.removeChildren();
    if (!preview) return;
    const graphics = new Graphics();
    for (const tileId of preview.tiles ?? []) {
      const tile = state.board.tiles[tileId];
      if (!tile) continue;
      const points = tile.vertexIds.flatMap((vertexId) => { const p = state.board.vertices[vertexId].point; return [p.x, p.y]; });
      graphics.poly(points).fill({ color: HIGHLIGHT, alpha: 0.18 }).stroke({ width: 6, color: HIGHLIGHT, alpha: 0.95 });
    }
    for (const vertexId of preview.vertices ?? []) {
      const point = state.board.vertices[vertexId]?.point;
      if (point) graphics.circle(point.x, point.y, 28).fill({ color: HIGHLIGHT, alpha: 0.2 }).stroke({ width: 5, color: HIGHLIGHT });
    }
    for (const edgeId of preview.edges ?? []) {
      const edge = state.board.edges[edgeId];
      if (!edge) continue;
      const [a, b] = edge.vertexIds.map((vertexId) => state.board.vertices[vertexId].point);
      graphics.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 22, color: 0x000000, alpha: 0.9, cap: 'round' });
    }
    this.preview.addChild(graphics);
  }

  private renderRoadPath(state: GameState, owner: number, path: number[]): void {
    this.roadHover.removeChildren();
    if (path.length === 0) return;

    const outlines = new Container();
    const color = state.players[owner].color;
    for (const edgeId of path) {
      const edge = state.board.edges[edgeId];
      const [a, b] = edge.vertexIds.map((vertexId) => state.board.vertices[vertexId].point);
      const edgeLen = distance(a, b);
      const borderSprite = this.sprite(roadFrame(color));
      if (borderSprite) {
        const baseScale = (edgeLen * 0.92) / borderSprite.texture.height;
        borderSprite.anchor.set(0.5);
        borderSprite.rotation = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
        // The road art runs vertically: enlarge its width more than its length
        // so the black duplicate reads as a strong outline around the sprite.
        borderSprite.scale.set(baseScale * 1.38, baseScale * 1.08);
        borderSprite.tint = 0x000000;
        borderSprite.position.set((a.x + b.x) / 2, (a.y + b.y) / 2);
        outlines.addChild(borderSprite);
      } else {
        const fallback = new Graphics();
        const from = { x: a.x + (b.x - a.x) * 0.18, y: a.y + (b.y - a.y) * 0.18 };
        const to = { x: b.x + (a.x - b.x) * 0.18, y: b.y + (a.y - b.y) * 0.18 };
        fallback.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width: 26, color: 0x000000, alpha: 1, cap: 'round' });
        outlines.addChild(fallback);
      }
    }
    this.roadHover.addChild(outlines);
  }

  private buildSettlement(p: { x: number; y: number }, color: PlayerColor): Container {
    return this.buildPiece(p, this.sprite(settlementFrame(color)), color, 'settlement');
  }

  private buildCity(p: { x: number; y: number }, color: PlayerColor): Container {
    return this.buildPiece(p, this.sprite(cityFrame(color)), color, 'city');
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
    const sprite = this.sprite(ROBBER_FRAME);
    if (sprite) {
      sprite.anchor.set(0.5);
      sprite.scale.set(60 / sprite.texture.height);
      c.addChild(sprite);
      return c;
    }

    // Keep a simple marker if the packed texture could not be loaded.
    const g = new Graphics();
    g.ellipse(0, 20, 12, 4).fill({ color: 0x0a1a24, alpha: 0.3 });
    g.ellipse(0, 6, 12, 16).fill(0x2b2a28).stroke({ width: 1.5, color: 0x000000, alpha: 0.35 });
    g.circle(0, -12, 9).fill(0x2b2a28).stroke({ width: 1.5, color: 0x000000, alpha: 0.35 });
    g.ellipse(-3, -14, 3, 4).fill({ color: 0xffffff, alpha: 0.18 }); // subtle highlight
    c.addChild(g);
    return c;
  }

  private animateIfNew(seen: Set<number>, id: number, target: Container): void {
    if (seen.has(id)) return;
    seen.add(id);
    if (this.reducedMotion) return;
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
      const radius = city ? 34 : 20;
      const highlightSprite = this.sprite(HIGHLIGHT_CIRCLE_FRAME);
      let dot: Container;
      if (highlightSprite) {
        highlightSprite.anchor.set(0.5);
        highlightSprite.scale.set((radius * 2) / highlightSprite.texture.width);
        dot = new Container();
        dot.addChild(highlightSprite);
      } else {
        const fallback = new Graphics();
        fallback.circle(0, 0, radius).fill({ color: HIGHLIGHT, alpha: 0.28 }).stroke({ width: 3, color: HIGHLIGHT });
        dot = fallback;
      }
      dot.position.set(p.x, p.y);
      dot.eventMode = 'static';
      dot.cursor = 'pointer';
      dot.hitArea = new Circle(0, 0, radius);
      (dot as Container & { __pulseScale?: number }).__pulseScale = dot.scale.x;
      dot.on('pointertap', () => this.invokeInteraction(mode.onVertex, vId));
      this.overlay.addChild(dot);
    }

    for (const eId of mode.edges ?? []) {
      const edge = board.edges[eId];
      const [a, b] = edge.vertexIds.map((v) => board.vertices[v].point);
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const radius = 20;
      const highlightSprite = this.sprite(HIGHLIGHT_CIRCLE_FRAME);
      let marker: Container;
      if (highlightSprite) {
        highlightSprite.anchor.set(0.5);
        highlightSprite.scale.set((radius * 2) / highlightSprite.texture.width);
        marker = new Container();
        marker.addChild(highlightSprite);
      } else {
        const fallback = new Graphics();
        fallback.circle(0, 0, radius).fill({ color: HIGHLIGHT, alpha: 0.28 }).stroke({ width: 3, color: HIGHLIGHT });
        marker = fallback;
      }
      marker.position.set(midpoint.x, midpoint.y);
      marker.eventMode = 'static';
      marker.cursor = 'pointer';
      marker.hitArea = new Circle(0, 0, radius);
      (marker as Container & { __pulseScale?: number }).__pulseScale = marker.scale.x;
      marker.on('pointertap', () => this.invokeInteraction(mode.onEdge, eId));
      this.overlay.addChild(marker);
    }

    for (const tId of mode.tiles ?? []) {
      const tile = board.tiles[tId];
      const radius = 28;
      const highlightSprite = this.sprite(HIGHLIGHT_CIRCLE_FRAME);
      let marker: Container;
      if (highlightSprite) {
        highlightSprite.anchor.set(0.5);
        highlightSprite.scale.set((radius * 2) / highlightSprite.texture.width);
        marker = new Container();
        marker.addChild(highlightSprite);
      } else {
        const fallback = new Graphics();
        fallback.circle(0, 0, radius).fill({ color: HIGHLIGHT, alpha: 0.28 }).stroke({ width: 3, color: HIGHLIGHT });
        marker = fallback;
      }
      marker.position.set(tile.center.x, tile.center.y);
      marker.eventMode = 'static';
      marker.cursor = 'pointer';
      marker.hitArea = new Circle(0, 0, radius);
      (marker as Container & { __pulseScale?: number }).__pulseScale = marker.scale.x;
      marker.on('pointertap', () => this.invokeInteraction(mode.onTile, tId));
      this.overlay.addChild(marker);
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
    return this.worldClientPosition(this.board.tiles[tileId].center);
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (!reduced) return;
    for (const animation of this.anims) animation.target.scale.set(1);
    this.anims = [];
    if (this.robberMove) {
      this.robberMove.target.position.set(this.robberMove.toX, this.robberMove.toY);
      this.robberMove = null;
    }
    for (const child of this.overlay.children) {
      const baseScale = (child as Container & { __pulseScale?: number }).__pulseScale;
      if (baseScale !== undefined) child.scale.set(baseScale);
    }
  }

  vertexClientPosition(vertexId: number): { x: number; y: number } | null {
    if (!this.board) return null;
    return this.worldClientPosition(this.board.vertices[vertexId].point);
  }

  edgeClientPosition(edgeId: number): { x: number; y: number } | null {
    if (!this.board) return null;
    const [a, b] = this.board.edges[edgeId].vertexIds.map((vertexId) => this.board!.vertices[vertexId].point);
    return this.worldClientPosition({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }

  private worldClientPosition(point: { x: number; y: number }): { x: number; y: number } {
    const s = this.view.scale.x;
    const localX = point.x * s + this.view.position.x;
    const localY = point.y * s + this.view.position.y;
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
    if (this.robberMove) {
      const move = this.robberMove;
      move.elapsed += deltaMS;
      const t = Math.min(1, move.elapsed / move.duration);
      // Smooth horizontal travel with a small hop so the move reads clearly
      // even between neighbouring hexes.
      const eased = t * t * (3 - 2 * t);
      const hop = Math.sin(Math.PI * t) * 18;
      move.target.position.set(
        move.fromX + (move.toX - move.fromX) * eased,
        move.fromY + (move.toY - move.fromY) * eased - hop,
      );
      if (t >= 1) this.robberMove = null;
    }
    // Gentle pulse on placement highlights while preserving each sprite's fitted size.
    if (this.reducedMotion) return;
    const pulse = 1 + Math.sin(this.app.ticker.lastTime / 300) * 0.12;
    for (const child of this.overlay.children) {
      const baseScale = (child as Container & { __pulseScale?: number }).__pulseScale;
      if (baseScale !== undefined) child.scale.set(baseScale * pulse);
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
