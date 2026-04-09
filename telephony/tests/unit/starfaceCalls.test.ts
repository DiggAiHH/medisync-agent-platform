/**
 * Unit tests for Starface Call Services.
 * Tests detectChanges() logic with mocked data.
 */
import * as assert from 'assert';
import { StarfaceCallEntry } from '../../src/starface/types';

// We test detectChanges logic directly since it's synchronous
// Import the class but we'll use a minimal mock
import { StarfaceCalls } from '../../src/starface/calls';

describe('StarfaceCalls.detectChanges()', () => {
  // Create a minimal mock client that satisfies the constructor
  const mockClient = {} as any;
  let calls: StarfaceCalls;

  beforeEach(() => {
    calls = new StarfaceCalls(mockClient);
  });

  function makeCall(id: string, state: string = 'ACTIVE'): StarfaceCallEntry {
    return {
      id,
      callerId: '0171-1234567',
      callerName: 'Test Caller',
      calledId: '030-9876543',
      state,
      direction: 'INBOUND',
      startTime: new Date().toISOString(),
    };
  }

  it('should detect new calls', () => {
    const previous = new Map<string, StarfaceCallEntry>();
    const current = [makeCall('c1'), makeCall('c2')];

    const changes = calls.detectChanges(previous, current);

    assert.strictEqual(changes.newCalls.length, 2);
    assert.strictEqual(changes.endedCalls.length, 0);
    assert.strictEqual(changes.changedCalls.length, 0);
  });

  it('should detect ended calls', () => {
    const previous = new Map<string, StarfaceCallEntry>([
      ['c1', makeCall('c1')],
      ['c2', makeCall('c2')],
    ]);
    const current = [makeCall('c1')]; // c2 is gone

    const changes = calls.detectChanges(previous, current);

    assert.strictEqual(changes.newCalls.length, 0);
    assert.strictEqual(changes.endedCalls.length, 1);
    assert.strictEqual(changes.endedCalls[0].id, 'c2');
  });

  it('should detect changed calls (state change)', () => {
    const previous = new Map<string, StarfaceCallEntry>([
      ['c1', makeCall('c1', 'RINGING')],
    ]);
    const current = [makeCall('c1', 'ACTIVE')];

    const changes = calls.detectChanges(previous, current);

    assert.strictEqual(changes.changedCalls.length, 1);
    assert.strictEqual(changes.changedCalls[0].state, 'ACTIVE');
  });

  it('should handle empty previous and current', () => {
    const changes = calls.detectChanges(new Map(), []);

    assert.strictEqual(changes.newCalls.length, 0);
    assert.strictEqual(changes.endedCalls.length, 0);
    assert.strictEqual(changes.changedCalls.length, 0);
  });

  it('should handle mixed new, ended, and changed', () => {
    const previous = new Map<string, StarfaceCallEntry>([
      ['c1', makeCall('c1', 'RINGING')],
      ['c2', makeCall('c2', 'ACTIVE')],
    ]);
    const current = [
      makeCall('c1', 'ACTIVE'), // changed
      makeCall('c3'),           // new
      // c2 is gone (ended)
    ];

    const changes = calls.detectChanges(previous, current);

    assert.strictEqual(changes.newCalls.length, 1);
    assert.strictEqual(changes.newCalls[0].id, 'c3');
    assert.strictEqual(changes.endedCalls.length, 1);
    assert.strictEqual(changes.endedCalls[0].id, 'c2');
    assert.strictEqual(changes.changedCalls.length, 1);
    assert.strictEqual(changes.changedCalls[0].id, 'c1');
  });
});
