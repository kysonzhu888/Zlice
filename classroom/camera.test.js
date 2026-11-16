import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCamera, loadHandModel } from './camera.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };

function setup(overrides = {}) {
  const track = new EventTarget();
  track.stop = vi.fn();
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const model = { close: vi.fn(), detectForVideo: vi.fn(() => ({ landmarks: [] })) };
  const video = { srcObject: null, readyState: 2, currentTime: 0,
    play: vi.fn(async () => {}), pause: vi.fn() };
  const statuses = [], frames = [], callbacks = new Map();
  let nextId = 0, clock = 100;
  const deps = {
    mediaDevices: { getUserMedia: vi.fn(async () => stream) },
    loadModel: vi.fn(async () => model), now: () => clock,
    requestFrame: vi.fn(callback => { callbacks.set(++nextId, callback); return nextId; }),
    cancelFrame: vi.fn(id => callbacks.delete(id)), startupTimeoutMs: 1000,
    ...overrides,
  };
  const camera = createCamera({ video, onStatus: value => statuses.push(value),
    onFrame: value => frames.push(value) }, deps);
  const tick = (elapsed = 50, advanceVideo = true) => {
    clock += elapsed;
    if (advanceVideo) video.currentTime += elapsed / 1000;
    const queued = [...callbacks.values()]; callbacks.clear();
    queued.forEach(callback => callback(clock));
  };
  return { camera, video, track, stream, model, deps, statuses, frames, tick, callbacks };
}

afterEach(() => vi.useRealTimers());

describe('classroom camera lifecycle', () => {
  it('publishes mirrored real landmarks, clears an absent hand, and disposes on stop', async () => {
    const s = setup();
    s.model.detectForVideo.mockReturnValueOnce({ landmarks: [[{ x: .2, y: .4, z: -.1 }]] });
    await s.camera.start();
    expect(s.statuses.map(item => item.state)).toEqual(['loading', 'ready']);
    s.tick();
    expect(s.frames.at(-1)).toEqual({ landmarks: [{ x: .8, y: .4, z: -.1 }] });
    s.tick();
    expect(s.frames.at(-1)).toEqual({ landmarks: null });
    s.camera.stop(); s.camera.stop();
    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect(s.model.close).toHaveBeenCalledTimes(1);
    expect(s.video.srcObject).toBeNull();
    expect(s.callbacks.size).toBe(0);
  });

  it('shares duplicate starts without opening another stream', async () => {
    const pending = deferred(); const s = setup({ loadModel: () => pending.promise });
    const first = s.camera.start(); const second = s.camera.start();
    expect(first).toBe(second);
    pending.resolve(s.model); await first;
    await s.camera.start();
    expect(s.deps.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    s.camera.stop();
  });

  it('cancels a pending model immediately and closes its late result', async () => {
    const pending = deferred(); const s = setup({ loadModel: () => pending.promise });
    const starting = s.camera.start(); s.camera.stop(); await starting;
    pending.resolve(s.model); await flush();
    expect(s.model.close).toHaveBeenCalledTimes(1);
    expect(s.deps.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(s.statuses.map(item => item.state)).toEqual(['loading']);
  });

  it('stops a late camera permission result without attaching it', async () => {
    const pending = deferred();
    const s = setup({ mediaDevices: { getUserMedia: () => pending.promise } });
    const starting = s.camera.start(); await flush();
    s.camera.stop(); await starting; pending.resolve(s.stream); await flush();
    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect(s.video.play).not.toHaveBeenCalled();
    expect(s.statuses.some(item => item.state === 'ready')).toBe(false);
  });

  it('times out startup, cleans late resources, and permits retry', async () => {
    vi.useFakeTimers(); const pending = deferred(); const s = setup();
    s.deps.loadModel.mockImplementationOnce(() => pending.promise);
    const starting = s.camera.start(); await vi.advanceTimersByTimeAsync(1001); await starting;
    expect(s.statuses.at(-1).state).toBe('error');
    const late = { close: vi.fn() }; pending.resolve(late); await flush();
    expect(late.close).toHaveBeenCalledOnce();
    await s.camera.start(); expect(s.statuses.at(-1).state).toBe('ready'); s.camera.stop();
  });

  it('reports denial and releases the loaded model', async () => {
    const error = Object.assign(new Error('permission'), { name: 'NotAllowedError' });
    const s = setup({ mediaDevices: { getUserMedia: vi.fn(async () => { throw error; }) } });
    await s.camera.start();
    expect(s.statuses.at(-1).state).toBe('denied');
    expect(s.model.close).toHaveBeenCalledOnce();
  });

  it('reports an unavailable camera before loading model assets', async () => {
    const s = setup({ mediaDevices: null }); await s.camera.start();
    expect(s.statuses.at(-1).state).toBe('unavailable');
    expect(s.deps.loadModel).not.toHaveBeenCalled();
  });

  it('reports disconnected tracks and stops inference', async () => {
    const s = setup(); await s.camera.start(); s.track.dispatchEvent(new Event('ended'));
    expect(s.statuses.at(-1).state).toBe('error');
    expect(s.frames.at(-1)).toEqual({ landmarks: null });
    expect(s.model.close).toHaveBeenCalledOnce(); expect(s.callbacks.size).toBe(0);
  });

  it('limits inference to fresh video frames at 25fps', async () => {
    const s = setup(); await s.camera.start(); s.tick(); s.tick(10); s.tick(10);
    expect(s.model.detectForVideo).toHaveBeenCalledTimes(1);
    s.tick(30); expect(s.model.detectForVideo).toHaveBeenCalledTimes(2);
    s.camera.stop();
  });

  it('cleans up after an inference error and supports restarting', async () => {
    const s = setup(); await s.camera.start();
    s.model.detectForVideo.mockImplementationOnce(() => { throw new Error('GPU lost'); });
    s.tick(); expect(s.statuses.at(-1).state).toBe('error');
    expect(s.track.stop).toHaveBeenCalledOnce(); expect(s.model.close).toHaveBeenCalledOnce();
    await s.camera.start(); expect(s.statuses.at(-1).state).toBe('ready'); s.camera.stop();
  });

  it('cancels pending video playback without publishing ready later', async () => {
    const playback = deferred(); const s = setup(); s.video.play.mockReturnValue(playback.promise);
    const starting = s.camera.start(); await flush(); expect(s.video.srcObject).toBe(s.stream);
    s.camera.stop(); await starting; playback.resolve(); await flush();
    expect(s.statuses.some(item => item.state === 'ready')).toBe(false);
    expect(s.video.srcObject).toBeNull(); expect(s.track.stop).toHaveBeenCalledOnce();
  });

  it('does not let an old permission result interrupt a newer ready session', async () => {
    const permission = deferred(); const s = setup();
    const oldTrack = { stop: vi.fn() }; const oldStream = { getTracks: () => [oldTrack] };
    const oldModel = { close: vi.fn() };
    s.deps.loadModel.mockResolvedValueOnce(oldModel);
    s.deps.mediaDevices.getUserMedia.mockReturnValueOnce(permission.promise);
    const oldStart = s.camera.start(); await flush(); s.camera.stop(); await oldStart;
    await s.camera.start(); permission.resolve(oldStream); await flush();
    expect(oldTrack.stop).toHaveBeenCalledOnce(); expect(oldModel.close).toHaveBeenCalledOnce();
    expect(s.video.srcObject).toBe(s.stream); expect(s.track.stop).not.toHaveBeenCalled();
    expect(s.model.close).not.toHaveBeenCalled(); s.camera.stop();
  });

  it('clears stale landmarks when the video stops providing fresh frames', async () => {
    const s = setup(); s.model.detectForVideo.mockReturnValue({ landmarks: [[{ x: .5, y: .5 }]] });
    await s.camera.start(); s.tick(); s.tick(310, false);
    expect(s.model.detectForVideo).toHaveBeenCalledOnce();
    expect(s.frames.at(-1)).toEqual({ landmarks: null }); s.camera.stop();
  });
});

describe('local model loader', () => {
  it('falls back from GPU to CPU and references only local bundled assets', async () => {
    const model = {}; const create = vi.fn().mockRejectedValueOnce(new Error('no GPU')).mockResolvedValue(model);
    const resolve = vi.fn(async () => ({}));
    const importVision = async () => ({ FilesetResolver: { forVisionTasks: resolve },
      HandLandmarker: { createFromOptions: create } });
    expect(await loadHandModel({ importVision })).toBe(model);
    expect(create.mock.calls.map(call => call[1].baseOptions.delegate)).toEqual(['GPU', 'CPU']);
    expect(resolve.mock.calls[0][0]).toContain('/classroom/vendor/mediapipe/wasm');
    expect(create.mock.calls[0][1].baseOptions.modelAssetPath).toContain('/classroom/models/hand_landmarker.task');
    expect(create.mock.calls[0][1].runningMode).toBe('VIDEO');
  });

  it('does not initialize the CPU fallback after cancellation', async () => {
    const gpu = deferred(); let isActive = true;
    const create = vi.fn(() => gpu.promise);
    const loading = loadHandModel({ isActive: () => isActive,
      importVision: async () => ({ FilesetResolver: { forVisionTasks: async () => ({}) },
        HandLandmarker: { createFromOptions: create } }) });
    await flush(); isActive = false; gpu.reject(new Error('GPU unavailable'));
    await expect(loading).rejects.toHaveProperty('name', 'AbortError');
    expect(create).toHaveBeenCalledOnce();
  });
});
