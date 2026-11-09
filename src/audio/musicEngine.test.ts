import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { MusicEngine } from './musicEngine';

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  loop = false;
  paused = false;
  readonly attempt = deferred();

  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }

  play() {
    this.paused = false;
    return this.attempt.promise;
  }

  pause() {
    this.paused = true;
  }
}

function fakeAudioContext(): AudioContext {
  const gain = {
    value: 1,
    cancelScheduledValues() {},
    setValueAtTime() {},
    linearRampToValueAtTime() {},
  };
  return {
    destination: {},
    currentTime: 0,
    createGain: () => ({ gain, connect() {} }),
    createMediaElementSource: () => ({ connect() {}, disconnect() {} }),
  } as unknown as AudioContext;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('MusicEngine Android interruption recovery', () => {
  const originalAudio = globalThis.Audio;

  beforeEach(() => {
    FakeAudio.instances = [];
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
  });

  afterEach(() => {
    globalThis.Audio = originalAudio;
  });

  it('retains the requested track when a pending start rejects after backgrounding', async () => {
    const engine = new MusicEngine();
    engine.init(fakeAudioContext());

    const initialStart = engine.play('title_main', { fadeMs: 0 });
    await flushMicrotasks();
    expect(FakeAudio.instances).toHaveLength(1);

    engine.pause();
    FakeAudio.instances[0].attempt.reject(new DOMException('Interrupted', 'AbortError'));
    await initialStart;

    expect(engine.getCurrentTrack()).toBe('title_main');

    engine.resume();
    await flushMicrotasks();
    expect(FakeAudio.instances).toHaveLength(2);

    FakeAudio.instances[1].attempt.resolve();
    await flushMicrotasks();
    expect(engine.getCurrentTrack()).toBe('title_main');
  });

  it('invalidates a pending element that resolves late and starts a fresh element', async () => {
    const engine = new MusicEngine();
    engine.init(fakeAudioContext());

    const initialStart = engine.play('title_main', { fadeMs: 0 });
    await flushMicrotasks();
    const interrupted = FakeAudio.instances[0];

    engine.pause();
    engine.resume();
    await flushMicrotasks();
    expect(FakeAudio.instances).toHaveLength(2);
    const replacement = FakeAudio.instances[1];

    interrupted.attempt.resolve();
    await initialStart;
    await flushMicrotasks();
    expect(interrupted.paused).toBe(true);

    replacement.attempt.resolve();
    await flushMicrotasks();
    expect(engine.getCurrentTrack()).toBe('title_main');
  });
});
