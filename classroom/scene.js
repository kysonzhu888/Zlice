const colors = ['#F15B64', '#FFD46A', '#62C4AE', '#9285D6'];
const connections = [[0,1,2,3,4], [0,5,6,7,8], [5,9,10,11,12], [9,13,14,15,16], [13,17,18,19,20], [0,17]];

export function createScene(canvas, game) {
const ctx = canvas.getContext('2d');
let width = game.width, height = game.height;
let particles = [], halves = [];
function resize() {
  const bounds = canvas.getBoundingClientRect();
  width = bounds.width; height = bounds.height;
  const scale = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  game.resize(width, height);
}
new ResizeObserver(resize).observe(canvas);
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

function burst(hit) {
  const count = game.reducedMotion ? 6 : 18;
  for (let index = 0; index < count; index++) {
    const angle = Math.PI * 2 * index / count;
    particles.push({ x: hit.x, y: hit.y, vx: Math.cos(angle) * 110, vy: Math.sin(angle) * 110 - 35, life: .85, color: colors[index % 4] });
  }
  [-1, 1].forEach(direction => halves.push({ ...hit, direction, age: 0 }));
}
function drawEffects(dt) {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt; p.life -= dt;
    ctx.globalAlpha = Math.max(0, p.life); ellipse(p.x, p.y, 5, 7, p.color);
  });
  ctx.globalAlpha = 1;
  halves = halves.filter(h => h.age < .75);
  halves.forEach(h => {
    h.age += dt;
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - h.age / .75);
    ctx.translate(h.x + h.direction * h.age * 95, h.y + h.age * h.age * 80);
    ctx.rotate(h.direction * h.age);
    ctx.beginPath(); ctx.rect(h.direction < 0 ? -h.radius * 1.2 : 0, -h.radius * 1.2, h.radius * 1.2, h.radius * 2.4); ctx.clip();
    drawFruit(h.type, 0, 0, h.radius); ctx.restore();
  });
}
function drawTrail() {
  if (game.stage < 1) return;
  const points = game.trail;
  points.forEach((point, index) => {
    if (!index) return;
    ctx.strokeStyle = colors[Math.floor(index / 4) % colors.length]; ctx.globalAlpha = index / points.length;
    ctx.lineWidth = 8 + index / points.length * 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(points[index - 1].x, points[index - 1].y); ctx.lineTo(point.x, point.y); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}
function drawLandmarks(landmarks) {
  ctx.strokeStyle = '#24654B'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  connections.forEach(line => {
    ctx.beginPath();
    line.forEach((index, order) => {
      const p = landmarks[index];
      if (p) order ? ctx.lineTo(p.x * width, p.y * height) : ctx.moveTo(p.x * width, p.y * height);
    });
    ctx.stroke();
  });
  landmarks.forEach(p => ellipse(p.x * width, p.y * height, 5, 5, '#FFF'));
}
function draw(dt, { landmarks = null, showGuide = true, hint = '' } = {}) {
  drawOrchard();
  game.fruits.forEach(fruit => {
    if (game.time < fruit.availableAt) return;
    const p = game.position(fruit);
    ellipse(p.x, height * .85, game.radius() * .7, 10, '#B9DACC');
    drawFruit(fruit.type, p.x, p.y, game.radius());
  });
  drawEffects(dt); drawTrail();
  if (landmarks && (showGuide || game.stage === 0)) drawLandmarks(landmarks);
  if (game.pointer) {
    ellipse(game.pointer.x, game.pointer.y, 15, 15, '#FFD46A');
    ellipse(game.pointer.x, game.pointer.y, 6, 6, '#173D38');
  } else if (hint && game.stage < 2) {
    ctx.fillStyle = '#24654B'; ctx.textAlign = 'center';
    ctx.font = '64px sans-serif'; ctx.fillText('✋', width * .5, height * .59);
    ctx.font = '600 18px "PingFang SC", sans-serif'; ctx.fillText(hint, width * .5, height * .78);
  }
}
return { draw, burst, clear() { particles = []; halves = []; } };
}
