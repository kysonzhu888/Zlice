const FRAME_INTERVAL_MS = 1000 / 25;
const STARTUP_TIMEOUT_MS = 30000;
const STALE_FRAME_MS = 300;
const MODEL_URL = new URL('./models/hand_landmarker.task', import.meta.url).href;
const WASM_URL = new URL('./vendor/mediapipe/wasm', import.meta.url).href;
const cancelled = () => Object.assign(new Error('Camera start cancelled'), { name: 'AbortError' });

// All inference code and weights are local. No network service receives video.
export async function loadHandModel({
  importVision = () => import('./vendor/mediapipe/vision_bundle.mjs'),
  isActive = () => true,
} = {}) {
  const { HandLandmarker, FilesetResolver } = await importVision();
  if (!isActive()) throw cancelled();
  const files = await FilesetResolver.forVisionTasks(WASM_URL);
  if (!isActive()) throw cancelled();
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO', numHands: 1,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    return await HandLandmarker.createFromOptions(files, options);
  } catch (error) {
    if (!isActive()) throw cancelled();
    return HandLandmarker.createFromOptions(files, {
      ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' },
    });
  }
}

function statusFor(error) {
  if (['NotAllowedError', 'SecurityError'].includes(error.name)) {
    return { state: 'denied', detail: '摄像头权限未开启。可以允许摄像头后重试，或用鼠标体验。' };
  }
  if (['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(error.name)) {
    return { state: 'unavailable', detail: '摄像头不可用或正被其他程序使用。可以关闭其他视频程序后重试。' };
  }
  if (error.name === 'TimeoutError') {
    return { state: 'error', detail: '摄像头启动超时。请检查权限后重试，也可以用鼠标体验。' };
  }
  return { state: 'error', detail: '手部识别暂时不可用。请重新开启摄像头，或用鼠标体验。' };
}

/**
 * onStatus: {state: loading|ready|denied|unavailable|error, detail?}.
 * onFrame: {landmarks: mirrored normalized [{x,y,z?}] | null}.
 * start resolves after ready/failure/cancellation; stop invalidates starts immediately.
 * Dependencies are injectable for deterministic lifecycle tests, never fake hands.
 */
export function createCamera({ video, onStatus = () => {}, onFrame = () => {} }, dependencies = {}) {
  const deps = {
    mediaDevices: globalThis.navigator?.mediaDevices,
    loadModel: loadHandModel,
    requestFrame: callback => globalThis.requestAnimationFrame(callback),
    cancelFrame: id => globalThis.cancelAnimationFrame(id),
    now: () => performance.now(), startupTimeoutMs: STARTUP_TIMEOUT_MS,
    ...dependencies,
  };
  let current = null;
  const active = run => current === run;
  const clearHand = () => onFrame({ landmarks: null });
  const stopStream = stream => stream.getTracks().forEach(track => track.stop());

  function release(run) {
    clearTimeout(run.timer);
    if (run.frame !== null) deps.cancelFrame(run.frame);
    run.frame = null;
    for (const track of run.stream?.getTracks() ?? []) {
      track.removeEventListener('ended', run.onEnded);
    }
    if (run.stream) stopStream(run.stream);
    if (video.srcObject === run.stream && run.stream) {
      video.pause(); video.srcObject = null;
    }
    run.stream = null;
    run.model?.close(); run.model = null;
  }

  function stop() {
    const run = current;
    current = null;
    if (run) { run.cancel(cancelled()); release(run); }
    clearHand();
  }

  function fail(run, error) {
    if (!active(run)) return;
    current = null;
    run.cancel(error);
    release(run);
    clearHand();
    onStatus(statusFor(error));
  }

  // getUserMedia and MediaPipe creation cannot be aborted. Dispose late results,
  // while cancellation itself resolves start immediately instead of waiting on them.
  function acquire(run, promise, assign, dispose) {
    const observed = Promise.resolve(promise).then(value => {
      if (!active(run)) { dispose(value); throw cancelled(); }
      assign(value); return value;
    });
    return Promise.race([observed, run.cancellation]);
  }

  function infer(run) {
    if (!active(run)) return;
    run.frame = null;
    const now = deps.now();
    try {
      if (video.readyState < 2) {
        clearHand();
      } else if (video.currentTime === run.videoTime) {
        if (now - run.freshAt > STALE_FRAME_MS) clearHand();
      } else if (now - run.inferredAt >= FRAME_INTERVAL_MS) {
        run.videoTime = video.currentTime; run.freshAt = now; run.inferredAt = now;
        const result = run.model.detectForVideo(video, now);
        const hand = result.landmarks?.[0];
        onFrame({ landmarks: hand?.length ? hand.map(({ x, y, z }) => ({
          x: Math.max(0, Math.min(1, 1 - x)), y: Math.max(0, Math.min(1, y)),
          ...(z === undefined ? {} : { z }),
        })) : null });
      }
    } catch (error) {
      fail(run, error); return;
    }
    if (active(run)) run.frame = deps.requestFrame(() => infer(run));
  }

  async function initialize(run) {
    try {
      await acquire(run, deps.loadModel({ isActive: () => active(run) }),
        model => { run.model = model; }, model => model.close());
      if (!active(run)) return;
      await acquire(run, deps.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 } },
      }), stream => { run.stream = stream; }, stopStream);
      if (!active(run)) return;
      run.onEnded = () => fail(run, new Error('Camera track ended'));
      run.stream.getTracks().forEach(track => track.addEventListener('ended', run.onEnded));
      video.srcObject = run.stream;
      await Promise.race([video.play(), run.cancellation]);
      if (!active(run)) return;
      clearTimeout(run.timer);
      onStatus({ state: 'ready' });
      if (active(run)) run.frame = deps.requestFrame(() => infer(run));
    } catch (error) {
      if (active(run)) fail(run, error);
    }
  }

  function start() {
    if (current) return current.promise;
    if (!deps.mediaDevices?.getUserMedia) {
      clearHand();
      onStatus({ state: 'unavailable', detail: '此浏览器无法使用摄像头。请打开本机课堂地址，或使用鼠标体验。' });
      return Promise.resolve();
    }
    const run = { model: null, stream: null, frame: null, videoTime: -1,
      inferredAt: -Infinity, freshAt: deps.now() };
    run.cancellation = new Promise((resolve, reject) => { run.cancel = reject; });
    // After ready, cancellation has no pending race. Keep rejection observed.
    run.cancellation.catch(() => {});
    current = run;
    clearHand();
    onStatus({ state: 'loading' });
    run.timer = setTimeout(() => fail(run, Object.assign(new Error('Startup deadline'), {
      name: 'TimeoutError',
    })), deps.startupTimeoutMs);
    run.promise = initialize(run);
    return run.promise;
  }

  return { start, stop };
}
