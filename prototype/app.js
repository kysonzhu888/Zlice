// Reviewable UI prototype only. Pointer movement simulates a fingertip;
// this file never requests a camera or claims to run a hand-tracking model.
const $ = (id) => document.getElementById(id);
const canvas = $('playfield');
const ctx = canvas.getContext('2d');
const stages = [
  { title: '让电脑找到小手', hint: '移动鼠标，看看指尖在哪里。', line: '“第一步，先找到手在哪里。”', label: '看见位置' },
  { title: '小手有魔法啦', hint: '慢慢划一划，画出彩色轨迹。', line: '“把经过的位置连起来，就有了魔法轨迹。”', label: '画出轨迹' },
  { title: '切开一个大西瓜', hint: '轻轻划过西瓜，就能切开。', line: '“加一个水果。小手碰到它，会发生什么？”', label: '加入互动' },
  { title: '水果派对，开始！', hint: '慢慢来，每一颗都等着你。', line: '“我们一起数一数，收集了几个水果？”', label: '一起玩耍' },
];
const colors = ['#F15B64', '#FFD46A', '#62C4AE', '#9285D6'];
let stage = 0, started = false, paused = false, state = 'ready', collected = 0;
let width = 1000, height = 460, elapsed = 0, previousTime = 0;
let pointer = null, trail = [], fruits = [], particles = [], halves = [];
let sound = false, audioContext, messageUntil = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function resize() {
  const bounds = canvas.getBoundingClientRect();
  const scale = Math.min(devicePixelRatio || 1, 2);
  width = bounds.width; height = bounds.height;
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  pointer = null; trail = [];
}
new ResizeObserver(resize).observe(canvas);

function resetStage() {
  collected = 0; pointer = null; trail = []; particles = []; halves = [];
  fruits = stage < 2 ? [] : stage === 2
    ? [{ type: 0, x: .5, y: .59, phase: 0, availableAt: 0 }]
    : [0, 1, 2].map((type) => ({ type, x: .25 + type * .25, y: .58, phase: type * 2, availableAt: 0 }));
  $('harvestCount').textContent = '0';
  $('celebration').textContent = '';
}

function selectStage(next) {
  stage = Math.max(0, Math.min(3, next)); paused = false;
  $('stageEyebrow').textContent = stages[stage].label;
  $('stageTitle').textContent = stages[stage].title;
  $('stageHint').textContent = stages[stage].hint;
  $('teacherPrompt').textContent = stages[stage].line;
  $('harvest').hidden = stage < 2;
  $('prevButton').disabled = stage === 0;
  $('nextButton').textContent = stage === 3 ? '再玩一轮' : '下一步';
  document.querySelectorAll('[data-stage]').forEach((button) => {
    const current = Number(button.dataset.stage) === stage;
    button.setAttribute('aria-current', current ? 'step' : 'false');
    button.classList.toggle('active', current);
  });
  resetStage(); setState('ready'); updatePause();
}

function setState(next) {
  state = next;
  $('stateSelect').value = next;
  pointer = null; trail = [];
  const scenarios = {
    loading: ['正在准备小手魔法', '状态示意：真实版本会在这里加载模型，也可以先用鼠标玩。'],
    denied: ['摄像头还没有打开', '状态示意：允许摄像头后重试，或先用鼠标继续。'],
    unavailable: ['没有找到摄像头', '状态示意：检查摄像头连接，也可以用鼠标玩完整流程。'],
    network: ['小手魔法还没准备好', '状态示意：模型加载失败。可以重试，或先用鼠标继续。'],
    resume: ['轮到下一位小朋友', '准备好后继续，不计时，也不扣分。'],
  };
  const scenario = scenarios[next];
  $('introOverlay').hidden = started && !scenario;
  $('startButton').hidden = Boolean(scenario && next !== 'resume');
  $('retryButton').hidden = !['denied', 'unavailable', 'network'].includes(next);
  $('fallbackButton').hidden = !scenario || next === 'resume';
  $('overlayTitle').textContent = scenario?.[0] || '挥挥手，水果开派对！';
  $('overlayText').textContent = scenario?.[1] || '先用鼠标体验四个步骤。真正的摄像头游戏可从老师工具打开。';
  $('startButton').textContent = next === 'resume' ? '准备好了，继续' : '用鼠标试一试';
  $('modeBadge').textContent = next === 'ready' ? '鼠标预览 · 并非 AI 识别' : '状态示意 · 并未开启摄像头';
  $('statusBanner').hidden = next !== 'nohand';
  $('statusTitle').textContent = '把小手举到这里';
  $('statusText').textContent = '状态示意：暂时没有找到手，水果会停下来等你。';
}

function start() { started = true; paused = false; setState('ready'); updatePause(); }
function updatePause() {
  $('pauseButton').textContent = paused ? '继续' : '暂停';
  $('pauseButton').setAttribute('aria-pressed', String(paused));
  if (paused) {
    $('statusBanner').hidden = false;
    $('statusTitle').textContent = '休息一下，水果会等你';
    $('statusText').textContent = '点击“继续”，回到刚才的游戏。';
  } else if (state === 'ready') $('statusBanner').hidden = true;
}
function active() { return started && !paused && state === 'ready' && !document.hidden; }
function radius() { return Math.min(86, Math.max(48, width * .069), height * .18); }
function fruitPosition(fruit) {
  return { x: width * fruit.x, y: height * fruit.y + (reducedMotion ? 0 : Math.sin(elapsed * .6 + fruit.phase) * 12) };
}
function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - a.x - fraction * dx, point.y - a.y - fraction * dy);
}
function chime() {
  if (!sound) return;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  audioContext.resume().catch(() => {});
  [523, 659, 784].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator(), volume = audioContext.createGain();
    const at = audioContext.currentTime + index * .07;
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(.0001, at); volume.gain.exponentialRampToValueAtTime(.055, at + .015);
    volume.gain.exponentialRampToValueAtTime(.0001, at + .22);
    oscillator.connect(volume).connect(audioContext.destination);
    oscillator.start(at); oscillator.stop(at + .24);
  });
}
function slice(fruit, position) {
  fruit.availableAt = elapsed + 1.6;
  collected += 1;
  $('harvestCount').textContent = String(collected);
  const words = ['切开啦！', '真棒！', '再来一个！'];
  $('celebration').textContent = words[(collected - 1) % words.length];
  messageUntil = elapsed + 1.3;
  const count = reducedMotion ? 6 : 18;
  for (let index = 0; index < count; index++) {
    const angle = Math.PI * 2 * index / count;
    particles.push({ x: position.x, y: position.y, vx: Math.cos(angle) * 110, vy: Math.sin(angle) * 110 - 35, life: .85, color: colors[index % 4] });
  }
  [-1, 1].forEach((direction) => halves.push({ ...position, direction, type: fruit.type, radius: radius(), age: 0 }));
  chime();
}

canvas.addEventListener('pointermove', (event) => {
  if (!active()) return;
  const box = canvas.getBoundingClientRect();
  const next = { x: event.clientX - box.left, y: event.clientY - box.top, time: elapsed };
  const previous = pointer;
  pointer = next;
  trail.push(next); if (trail.length > 36) trail.shift();
  if (!previous || Math.hypot(next.x - previous.x, next.y - previous.y) < 2) return;
  fruits.forEach((fruit) => {
    if (fruit.availableAt > elapsed) return;
    const position = fruitPosition(fruit);
    if (segmentDistance(position, previous, next) <= radius() + 12) slice(fruit, position);
  });
});
canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'mouse') canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointerleave', () => { pointer = null; trail = []; });
canvas.addEventListener('pointercancel', () => { pointer = null; trail = []; });

function ellipse(x, y, rx, ry, color) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}
function drawOrchard() {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#E7F7FA'; ctx.fillRect(0, 0, width, height);
  [[.14, .22], [.75, .21], [.91, .35]].forEach(([x, y]) => {
    ellipse(width * x, height * y, 44, 15, '#FFFFFF');
    ellipse(width * x - 17, height * y - 8, 22, 16, '#FFFFFF');
  });
  ellipse(width * .5, height * 1.19, width * .8, height * .35, '#C6E9C5');
  ellipse(width * .02, height * 1.05, width * .32, height * .2, '#ACD9AB');
  ellipse(width * .92, height * 1.1, width * .35, height * .22, '#A7D7B6');
  ctx.strokeStyle = '#83BB89'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  [.07, .13, .85, .91].forEach((x) => {
    ctx.beginPath(); ctx.moveTo(width * x - 7, height - 24); ctx.lineTo(width * x, height - 13); ctx.lineTo(width * x + 5, height - 29); ctx.stroke();
  });
}
function drawFruit(type, x, y, size, angle = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  if (type === 0) {
    ellipse(0, 0, size, size * .93, '#2C9564');
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, size, size * .93, 0, 0, Math.PI * 2); ctx.clip();
    ctx.lineWidth = size * .12; ctx.strokeStyle = '#176648';
    [-.62, -.2, .2, .62].forEach((offset) => { ctx.beginPath(); ctx.moveTo(size * offset, -size); ctx.quadraticCurveTo(size * offset + 20, 0, size * offset, size); ctx.stroke(); });
    ctx.restore();
  } else {
    ellipse(0, 0, size * (type === 1 ? .94 : .86), size * .94, type === 1 ? '#F3A83B' : '#F15B64');
    ellipse(-size * .28, -size * .31, size * .14, size * .22, type === 1 ? '#FFD675' : '#FF9397');
    ctx.strokeStyle = '#715132'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, -size * .88); ctx.lineTo(4, -size * 1.07); ctx.stroke();
    ctx.save(); ctx.translate(size * .19, -size * .98); ctx.rotate(-.4); ellipse(0, 0, size * .25, size * .11, '#357D4A'); ctx.restore();
  }
  ctx.fillStyle = '#173D38';
  [-.25, .25].forEach((offset) => ellipse(size * offset, size * .12, 4.5, 6, '#173D38'));
  ctx.lineWidth = 3; ctx.strokeStyle = '#173D38'; ctx.beginPath(); ctx.arc(0, size * .22, size * .14, .15, Math.PI - .15); ctx.stroke();
  ctx.restore();
}
function drawHand(point, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha;
  const size = Math.min(1, height / 430);
  const joints = [[0, 0], [-8, 21], [-13, 43], [-22, 68], [-34, 91], [-58, 71], [-70, 46], [12, 27], [16, 55], [7, 81], [33, 43], [39, 66], [29, 87], [51, 62], [56, 83], [44, 102], [-2, 128]];
  const lines = [[0,1,2,3,4,16], [6,5,4], [7,8,9,16], [10,11,12,16], [13,14,15,16]];
  ctx.translate(point.x, point.y); ctx.scale(size, size);
  ctx.strokeStyle = '#F4AF79'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  lines.forEach((line) => { ctx.beginPath(); line.forEach((index, order) => { const [x, y] = joints[index]; order ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }); ctx.stroke(); });
  if ($('showGuide').checked || stage === 0) {
    ctx.strokeStyle = '#24654B'; ctx.lineWidth = 2;
    lines.forEach((line) => { ctx.beginPath(); line.forEach((index, order) => { const [x,y] = joints[index]; order ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }); ctx.stroke(); });
    joints.forEach(([x,y]) => ellipse(x,y,3,3,'#FFFFFF'));
  }
  ellipse(0,0,11,11,'#FFD46A'); ellipse(0,0,5,5,'#173D38');
  ctx.restore();
}
function drawTrail() {
  if (stage < 1) return;
  const points = trail.filter((point) => elapsed - point.time < .6);
  points.forEach((point, index) => {
    if (!index) return;
    ctx.strokeStyle = colors[Math.floor(index / 4) % colors.length]; ctx.globalAlpha = index / points.length;
    ctx.lineWidth = 8 + index / points.length * 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(points[index-1].x,points[index-1].y); ctx.lineTo(point.x,point.y); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}
function drawEffects(dt) {
  particles = particles.filter((particle) => particle.life > 0);
  particles.forEach((particle) => {
    particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 140 * dt; particle.life -= dt;
    ctx.globalAlpha = Math.max(0, particle.life); ellipse(particle.x, particle.y, 5, 7, particle.color);
  });
  ctx.globalAlpha = 1;
  halves = halves.filter((half) => half.age < .75);
  halves.forEach((half) => {
    half.age += dt;
    const x = half.x + half.direction * half.age * 95, y = half.y + half.age * half.age * 80;
    ctx.save(); ctx.globalAlpha = Math.max(0, 1-half.age / .75); ctx.translate(x,y); ctx.rotate(half.direction * half.age);
    ctx.beginPath(); ctx.rect(half.direction < 0 ? -half.radius * 1.2 : 0, -half.radius * 1.2, half.radius * 1.2, half.radius * 2.4); ctx.clip();
    drawFruit(half.type,0,0,half.radius); ctx.restore();
  });
}
function frame(now) {
  const dt = active() ? Math.min((now - (previousTime || now)) / 1000, .05) : 0;
  previousTime = now; elapsed += dt;
  drawOrchard();
  fruits.forEach((fruit) => {
    if (elapsed < fruit.availableAt) return;
    const position = fruitPosition(fruit);
    ellipse(position.x, height * .85, radius() * .7, 10, '#B9DACC');
    drawFruit(fruit.type, position.x, position.y, radius());
  });
  drawEffects(dt); drawTrail();
  if (pointer && state === 'ready') drawHand(pointer);
  else if (started && stage < 2 || state === 'nohand') {
    drawHand({x:width * .5,y:height * .48}, .65);
    ctx.fillStyle = '#24654B'; ctx.font = '600 18px "PingFang SC", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(state === 'nohand' ? '等待小手 · 状态示意' : '把鼠标移到这里', width * .5, height * .87);
  }
  if (elapsed > messageUntil) $('celebration').textContent = '';
  requestAnimationFrame(frame);
}

$('startButton').addEventListener('click', start);
$('fallbackButton').addEventListener('click', start);
$('retryButton').addEventListener('click', () => { setState('ready'); started = false; $('introOverlay').hidden = false; });
$('stateSelect').addEventListener('change', (event) => setState(event.target.value));
document.querySelectorAll('[data-stage]').forEach((button) => button.addEventListener('click', () => selectStage(Number(button.dataset.stage))));
$('prevButton').addEventListener('click', () => selectStage(stage - 1));
$('nextButton').addEventListener('click', () => selectStage(stage === 3 ? 3 : stage + 1));
$('restartButton').addEventListener('click', () => { resetStage(); start(); });
$('pauseButton').addEventListener('click', () => { paused = !paused; pointer = null; trail = []; updatePause(); });
$('soundButton').addEventListener('click', () => {
  sound = !sound; $('soundButton').textContent = sound ? '音效开' : '音效关';
  $('soundButton').setAttribute('aria-pressed', String(sound)); if (sound) chime();
});
$('fullscreenButton').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { $('celebration').textContent = '也可以使用浏览器全屏'; messageUntil = elapsed + 3; }
});
document.addEventListener('fullscreenchange', () => { $('fullscreenButton').textContent = document.fullscreenElement ? '退出全屏' : '全屏'; });
document.addEventListener('visibilitychange', () => {
  previousTime = 0; pointer = null; trail = [];
  if (document.hidden && started) { paused = true; updatePause(); }
});
selectStage(0); requestAnimationFrame(frame);
