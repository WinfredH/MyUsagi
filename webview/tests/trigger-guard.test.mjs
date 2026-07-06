import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { canDispatch } from './setup.mjs';

function engines({
  dragging = false,
  busy = false,
  walking = false,
  overlay = false,
  procedural = false,
  dancing = false,
} = {}) {
  const isOverlay = overlay || (busy && !walking && !procedural);
  const isWalking = walking;
  const isProcedural = procedural;
  return {
    actionEngine: {
      isBusy: () => busy || walking || overlay || procedural,
      isOverlayBusy: () => isOverlay,
      isWalking: () => isWalking,
      isProceduralBusy: () => isProcedural,
      isDancing: () => dancing,
    },
    character: { isDragging: () => dragging },
  };
}

describe('TriggerHub.canDispatch', () => {
  it('allows all intents when idle', () => {
    const { actionEngine, character } = engines();
    assert.equal(
      canDispatch({ kind: 'action.play', name: 'hop' }, actionEngine, character),
      true
    );
    assert.equal(
      canDispatch({ kind: 'character.part', region: 'face' }, actionEngine, character),
      true
    );
  });

  it('blocks overlay actions while busy', () => {
    const { actionEngine, character } = engines({ overlay: true });
    assert.equal(
      canDispatch({ kind: 'action.play', name: 'roll' }, actionEngine, character),
      false
    );
    assert.equal(
      canDispatch({ kind: 'character.part', region: 'hand-l' }, actionEngine, character),
      false
    );
  });

  it('allows look/walk/scale/lang while dragging', () => {
    const { actionEngine, character } = engines({ dragging: true });
    assert.equal(
      canDispatch({ kind: 'character.look', dx: 1, dy: 0 }, actionEngine, character),
      true
    );
    assert.equal(
      canDispatch({ kind: 'character.walk', active: true }, actionEngine, character),
      true
    );
    assert.equal(
      canDispatch({ kind: 'character.scale', height: 200 }, actionEngine, character),
      true
    );
    assert.equal(
      canDispatch({ kind: 'character.lang', code: 'en' }, actionEngine, character),
      true
    );
  });

  it('blocks hop and part clicks while dragging', () => {
    const { actionEngine, character } = engines({ dragging: true });
    assert.equal(
      canDispatch({ kind: 'action.play', name: 'hop' }, actionEngine, character),
      false
    );
    assert.equal(
      canDispatch({ kind: 'character.part', region: 'body' }, actionEngine, character),
      false
    );
    assert.equal(
      canDispatch({ kind: 'character.blink' }, actionEngine, character),
      false
    );
  });

  it('blocks walk while overlay or procedural actions are active', () => {
    const overlay = engines({ overlay: true });
    assert.equal(
      canDispatch({ kind: 'action.play', name: 'walk' }, overlay.actionEngine, overlay.character),
      false
    );

    const procedural = engines({ procedural: true });
    assert.equal(
      canDispatch({ kind: 'action.play', name: 'walk' }, procedural.actionEngine, procedural.character),
      false
    );
  });

  it('blocks speech while dancing', () => {
    const { actionEngine, character } = engines({ dancing: true });
    assert.equal(
      canDispatch({ kind: 'character.speech', source: 'click' }, actionEngine, character),
      false
    );
    assert.equal(
      canDispatch({ kind: 'character.speech', source: 'idle-chatter' }, actionEngine, character),
      false
    );
  });

  it('blocks hop roll dance and clicks while follow is enabled', () => {
    const { actionEngine, character } = engines();
    assert.equal(
      canDispatch({ kind: 'action.play', name: 'hop' }, actionEngine, character, true),
      false
    );
    assert.equal(
      canDispatch({ kind: 'action.play', name: 'roll' }, actionEngine, character, true),
      false
    );
    assert.equal(
      canDispatch({ kind: 'character.part', region: 'body' }, actionEngine, character, true),
      false
    );
    assert.equal(
      canDispatch({ kind: 'character.speech', source: 'click' }, actionEngine, character, true),
      false
    );
  });

  it('allows look and rust walk while follow is enabled', () => {
    const { actionEngine, character } = engines();
    assert.equal(
      canDispatch({ kind: 'character.look', dx: 0.5, dy: -0.2 }, actionEngine, character, true),
      true
    );
    assert.equal(
      canDispatch({ kind: 'action.play', name: 'walk', source: 'rust-walk' }, actionEngine, character, true),
      true
    );
    assert.equal(
      canDispatch({ kind: 'action.stop', name: 'walk', source: 'rust' }, actionEngine, character, true),
      true
    );
  });

  it('allows preempting walk with hop or roll', () => {
    const { actionEngine, character } = engines({ walking: true });
    assert.equal(
      canDispatch({ kind: 'action.play', name: 'hop' }, actionEngine, character),
      true
    );
    assert.equal(
      canDispatch({ kind: 'action.play', name: 'roll' }, actionEngine, character),
      true
    );
    assert.equal(
      canDispatch({ kind: 'character.part', region: 'body' }, actionEngine, character),
      true
    );
  });
});
