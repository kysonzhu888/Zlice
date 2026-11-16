import { createCamera } from './camera.js';
import { ClassroomGame } from './game.js';
import { createScene } from './scene.js';

const $ = id => document.getElementById(id);
const canvas = $('playfield');
const game = new ClassroomGame({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
const scene = createScene(canvas, game);
const stages = [
  { title: '让电脑找到小手', hint: '伸出食指，看看小圆点跟着谁。', line: '“AI 能找到你的小手在哪里。”', label: '看见位置' },
  { title: '小手有魔法啦', hint: '慢慢划一划，画出彩色轨迹。', line: '“连起刚才的位置，就有了魔法轨迹。”', label: '画出轨迹' },
  { title: '切开一个大西瓜', hint: '轻轻划过西瓜，就能切开。', line: '“加一个水果。小手碰到它，会发生什么？”', label: '加入互动' },
  { title: '水果派对，开始！', hint: '慢慢来，每一颗都等着你。', line: '“我们一起数一数，收集了几个水果？”', label: '一起玩耍' },
];
const errors = {
  denied: ['摄像头还没有打开', '请允许此页面使用摄像头，再点重试。也可以用鼠标继续。'],
  unavailable: ['没有找到可用摄像头', '检查摄像头连接，关闭占用相机的应用，再点重试。'],
  error: ['小手魔法还没准备好', '请重试。若仍未成功，先用鼠标玩完整流程。'],
};
let mode = 'none', state = 'idle', started = false, paused = false;
let landmarks = null, lastTip = null, frames = 0, handFrames = 0;
let previousTime = 0, messageUntil = 0, diagnosticAt = 0;
let sound = false, audioContext;

function active() {
  return started && !paused && !document.hidden && state === 'ready' && (mode === 'mouse' || Boolean(landmarks));
}
function clearInput() { landmarks = null; lastTip = null; game.clearPointer(); }
function renderStatus() {
  const error = errors[state];
  const overlay = !started || Boolean(error) || ['loading', 'resume'].includes(state);
  $('introOverlay').hidden = !overlay;
  $('overlayTitle').textContent = error?.[0] || (state === 'loading' ? '正在准备小手魔法' : state === 'resume' ? '准备好了，再挥挥手' : '挥挥手，水果开派对！');
  $('overlayText').textContent = error?.[1] || (state === 'loading' ? '正在打开摄像头和本地 AI 模型。也可以先用鼠标玩。' : state === 'resume' ? '刚才已关闭摄像头。点击下面的按钮继续，水果还在等你。' : '伸出食指，轻轻划一划。我们一起把游戏一步一步做出来。');
  $('startButton').hidden = Boolean(error) || state === 'loading';
  $('startButton').textContent = state === 'resume' ? '重新打开摄像头' : '打开摄像头';
  $('retryButton').hidden = !error;
  $('fallbackButton').hidden = false;
  $('pauseButton').disabled = !started || overlay;
  $('pauseButton').textContent = paused ? '继续' : '暂停';
  $('pauseButton').setAttribute('aria-pressed', String(paused));
  $('inputButton').textContent = mode === 'camera' && state !== 'resume' ? '改用鼠标' : '用摄像头玩';
  $('modeBadge').textContent = mode === 'mouse' ? '鼠标模式 · 非 AI 识别' : state === 'ready' ? 'AI 找小手 · 本机处理' : state === 'loading' ? '正在准备摄像头' : '摄像头未开启';
  const noHand = mode === 'camera' && state === 'ready' && !landmarks;
  $('statusBanner').hidden = overlay || (!paused && !noHand);
  $('statusTitle').textContent = paused ? '休息一下，水果会等你' : '把小手举到这里';
  $('statusText').textContent = paused ? '点击“继续”，回到刚才的游戏。' : '伸出食指，让整只手出现在摄像头前。';
  $('webcam').hidden = !($('showCamera').checked && mode === 'camera' && state === 'ready');
}
function updateDiagnostics() {
  $('cameraStatus').textContent = mode === 'mouse' ? '鼠标模式：不使用 AI，摄像头已关闭。' :
    state === 'ready' ? `摄像头已开启 · AI 已处理 ${frames} 帧，其中 ${handFrames} 帧找到手。画面不保存、不上传。` :
    state === 'loading' ? '正在加载本地模型并打开摄像头……' : '摄像头未开启；允许访问后可重试，或使用鼠标。';
}
const camera = createCamera({
  video: $('webcam'),
  onStatus(status) {
    if (mode !== 'camera') return;
    state = status.state;
    if (state === 'ready') { started = true; paused = false; }
    else clearInput();
    renderStatus(); updateDiagnostics();
  },
  onFrame(result) {
    if (mode !== 'camera' || state !== 'ready') return;
    frames++;
    const hadHand = Boolean(landmarks);
    landmarks = result.landmarks;
    if (!landmarks) { lastTip = null; game.clearPointer(); }
    else {
      handFrames++;
      const tip = landmarks[8];
      if (!tip || !Number.isFinite(tip.x) || !Number.isFinite(tip.y)) { clearInput(); }
      else {
        const next = { x: Math.max(0, Math.min(1, tip.x)) * game.width, y: Math.max(0, Math.min(1, tip.y)) * game.height };
        // A discontinuous detection starts a new stroke, never a diagonal slice.
        if (lastTip && Math.hypot(next.x - lastTip.x, next.y - lastTip.y) > Math.hypot(game.width, game.height) * .35) game.clearPointer();
        lastTip = next;
        handleHits(game.move(next, active()));
      }
    }
    if (hadHand !== Boolean(landmarks)) renderStatus();
  },
});

async function startCamera() {
  if (mode === 'camera' && state === 'loading') return;
  mode = 'camera'; state = 'loading'; paused = false; frames = 0; handFrames = 0;
  clearInput(); renderStatus(); updateDiagnostics();
  try { await camera.start(); }
  catch { if (mode === 'camera' && state === 'loading') { state = 'error'; renderStatus(); updateDiagnostics(); } }
}
function startMouse() {
  mode = 'mouse'; camera.stop(); state = 'ready'; started = true; paused = false;
  clearInput(); renderStatus(); updateDiagnostics();
}
function resetStage() {
  game.reset(); scene.clear(); clearInput();
  $('harvestCount').textContent = '0'; $('celebration').textContent = ''; messageUntil = 0;
  renderStatus();
}
function selectStage(next) {
  game.setStage(next); resetStage();
  const stage = stages[game.stage];
  $('stageEyebrow').textContent = stage.label;
  $('stageTitle').textContent = stage.title;
  $('stageHint').textContent = game.stage === 0 && mode === 'mouse' ? '移动鼠标，看看小圆点跟着谁。' : stage.hint;
  $('teacherPrompt').textContent = game.stage === 0 && mode === 'mouse' ? '“这里先用鼠标代替手指的位置。”' : stage.line;
  $('harvest').hidden = game.stage < 2;
  $('prevButton').disabled = game.stage === 0;
  $('nextButton').textContent = game.stage === 3 ? '下一位小朋友' : '下一步';
  document.querySelectorAll('[data-stage]').forEach(button => {
    button.setAttribute('aria-current', Number(button.dataset.stage) === game.stage ? 'step' : 'false');
  });
}
function chime() {
  if (!sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume().catch(() => {});
    [523, 659, 784].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator(), volume = audioContext.createGain();
      const at = audioContext.currentTime + index * .07;
      oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(.0001, at); volume.gain.exponentialRampToValueAtTime(.045, at + .015);
      volume.gain.exponentialRampToValueAtTime(.0001, at + .22);
      oscillator.connect(volume).connect(audioContext.destination); oscillator.start(at); oscillator.stop(at + .24);
    });
  } catch { sound = false; $('soundButton').textContent = '音效不可用'; }
}
function handleHits(hits) {
  if (!hits.length) return;
  hits.forEach(scene.burst); chime();
  $('harvestCount').textContent = String(game.collected);
  $('celebration').textContent = ['切开啦！', '真棒！', '再来一个！'][(game.collected - 1) % 3];
  messageUntil = game.time + 1.3;
}
canvas.addEventListener('pointermove', event => {
  if (mode !== 'mouse') return;
  const box = canvas.getBoundingClientRect();
  handleHits(game.move({ x: event.clientX - box.left, y: event.clientY - box.top }, active()));
});
canvas.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse') canvas.setPointerCapture(event.pointerId);
});
['pointerleave', 'pointercancel', 'lostpointercapture'].forEach(name => canvas.addEventListener(name, () => {
  if (mode === 'mouse') game.clearPointer();
}));
$('startButton').addEventListener('click', startCamera);
$('retryButton').addEventListener('click', startCamera);
$('fallbackButton').addEventListener('click', () => { startMouse(); refreshStageCopy(); });
$('inputButton').addEventListener('click', () => {
  if (mode === 'camera' && state !== 'resume') startMouse(); else startCamera();
  refreshStageCopy();
});
function refreshStageCopy() {
  if (game.stage !== 0) return;
  $('stageHint').textContent = mode === 'mouse' ? '移动鼠标，看看小圆点跟着谁。' : stages[0].hint;
  $('teacherPrompt').textContent = mode === 'mouse' ? '“这里先用鼠标代替手指的位置。”' : stages[0].line;
}
document.querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', () => selectStage(Number(button.dataset.stage))));
$('prevButton').addEventListener('click', () => selectStage(game.stage - 1));
$('nextButton').addEventListener('click', () => {
  if (game.stage === 3) { resetStage(); paused = true; renderStatus(); }
  else selectStage(game.stage + 1);
});
$('restartButton').addEventListener('click', resetStage);
$('pauseButton').addEventListener('click', () => { paused = !paused; game.clearPointer(); lastTip = null; renderStatus(); });
$('showCamera').addEventListener('change', renderStatus);
$('soundButton').addEventListener('click', () => {
  sound = !sound; $('soundButton').textContent = sound ? '音效开' : '音效关';
  $('soundButton').setAttribute('aria-pressed', String(sound)); if (sound) chime();
});
$('fullscreenButton').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { $('celebration').textContent = '也可以使用浏览器全屏'; messageUntil = game.time + 3; }
});
document.addEventListener('fullscreenchange', () => { $('fullscreenButton').textContent = document.fullscreenElement ? '退出全屏' : '全屏'; });
function suspend() {
  if (!started && state !== 'loading') return;
  paused = true; clearInput(); previousTime = 0;
  if (mode === 'camera') { state = 'resume'; camera.stop(); }
  renderStatus(); updateDiagnostics();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
window.addEventListener('pagehide', () => { camera.stop(); clearInput(); });
window.addEventListener('resize', () => { clearInput(); });
function frame(now) {
  const dt = game.tick((now - (previousTime || now)) / 1000, active());
  previousTime = now;
  scene.draw(dt, { landmarks, showGuide: $('showGuide').checked,
    hint: started ? mode === 'camera' ? '举起小手，伸出食指' : '把鼠标移到这里' : '' });
  if (game.time > messageUntil) $('celebration').textContent = '';
  if (now - diagnosticAt > 1000) { updateDiagnostics(); diagnosticAt = now; }
  requestAnimationFrame(frame);
}
selectStage(0); renderStatus(); requestAnimationFrame(frame);
