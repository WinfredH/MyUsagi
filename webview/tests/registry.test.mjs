import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { PetRegistry, usagi } from './setup.mjs';

describe('PetRegistry', () => {
  it('register, get, and ids', () => {
    PetRegistry.register({ id: 'test-pet', kind: 'image' });
    assert.equal(PetRegistry.get('test-pet').kind, 'image');
    assert.ok(PetRegistry.ids().includes('test-pet'));
  });

  it('usagi registers with expected action config', () => {
    const registered = PetRegistry.get('usagi');
    assert.ok(registered);
    assert.equal(registered.kind, 'image-layered');
    assert.ok(registered.actions.roll);
    assert.ok(registered.actions.dance);
    assert.equal(registered.actions.dance.loopUntil, 'audio');
  });
});
