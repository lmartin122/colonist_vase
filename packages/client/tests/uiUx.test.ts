import { describe, expect, it } from 'vitest';
import { createGame, type LogEntry } from '@colonist/shared';
import { boardPreviewForLogEntry } from '../src/state/boardPreview';
import { normalizeUiPreferences } from '../src/state/preferences';
import { resolveReducedMotion } from '../src/state/useMotionPreference';
import { currentActionMessage } from '../src/ui/actionGuidance';

function game() {
  return createGame({ players: [{ name: 'You', isBot: false }, { name: 'Ada', isBot: true }], layout: 'classic', seed: 7 });
}

describe('UI action guidance', () => {
  it('describes the required action and active placement mode', () => {
    const state = game();
    expect(currentActionMessage(state, 0, null)).toBe('Roll the dice to determine the starting player');
    expect(currentActionMessage({ ...state, phase: 'main', currentPlayer: 0 }, 0, { kind: 'road' })).toBe('Choose an edge for your road');
    expect(currentActionMessage({ ...state, phase: 'roll', currentPlayer: 1 }, 0, null)).toBe('Waiting for Ada');
  });
});

describe('persisted UI preferences', () => {
  it('migrates missing and invalid fields to safe defaults', () => {
    expect(normalizeUiPreferences({ sound: false, animationMode: 'reduced' })).toEqual({ sound: false, animationMode: 'reduced' });
    expect(normalizeUiPreferences({ sound: 'yes', animationMode: 'fast' })).toEqual({ sound: true, animationMode: 'full' });
  });

  it('resolves System, Full, and Reduced animation modes', () => {
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('system', false)).toBe(false);
    expect(resolveReducedMotion('full', true)).toBe(false);
    expect(resolveReducedMotion('reduced', false)).toBe(true);
  });
});

describe('history board previews', () => {
  it('derives exact piece, robber, and dice locations', () => {
    const state = game();
    const log = (details: LogEntry['details']): LogEntry => ({ turn: 1, player: 0, message: '', details });
    expect(boardPreviewForLogEntry(log({ type: 'piece', piece: 'road', verb: 'built', edge: 4, visibility: 'public' }), state)).toEqual({ edges: [4] });
    expect(boardPreviewForLogEntry(log({ type: 'robber', tile: 3, visibility: 'public' }), state)).toEqual({ tiles: [3] });
    const matching = state.board.tiles.filter((tile) => tile.number === 8).map((tile) => tile.id);
    expect(boardPreviewForLogEntry(log({ type: 'dice', dice: [3, 5], context: 'turn', visibility: 'public' }), state)).toEqual({ tiles: matching });
  });
});
