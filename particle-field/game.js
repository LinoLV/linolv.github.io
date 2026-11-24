(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const HINT_IDLE_MS = 3000;

  const stage = document.getElementById('stage');
  const trailCanvas = document.getElementById('trail-canvas');
  const uiCanvas = document.getElementById('ui-canvas');
  const tctx = trailCanvas.getContext('2d');
  const uctx = uiCanvas.getContext('2d');

  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const modeLabel = document.getElementById('mode-label');
  const modeValue = document.getElementById('mode-value');
  const hintEl = document.getElementById('hint');
  const hintLead = document.getElementById('hintLead');
  const hintDetail = document.getElementById('hintDetail');
  const overlay = document.getElementById('overlay');
  const overlayKicker = document.getElementById('overlay-kicker');
  const overlayTitle = document.getElementById('overlay-title');
  const finalScore = document.getElementById('final-score');
  const nextBtn = document.getElementById('next-btn');
  const completeSound = document.getElementById('completeSound');

  const PALETTE = [
    '#9CFF2E', // lime
    '#22D3EE', // cyan
    '#4D8DFF', // blue
    '#FF5B5B', // red
    '#FFC93D', // amber
    '#35F0B0', // mint
    '#FF6BD6', // magenta
    '#B78CFF', // violet
    '#FF944D', // orange
    '#C6FF00'  // lime-yellow
  ];

  const DASHES = [[], [6, 5], [2, 5], [10, 4, 2, 4], [3, 3]];

  const CFG = {
    particleRadius: 7,
    targetRadius: 24,
    fieldRadius: 95,
    attractForce: 1750,
    repelForce: 2600,
    pulseForce: 3200,
    repelPulseForce: 5600,
    maxSpeed: 360,
    drag: 0.999,
    idleForce: 55,
    captureDwell: 0.2,
    trailFade: 0.15
  };

  let W = 0;
  let H = 0;
  let dpr = 1;
  let particles = [];
  let targets = [];
  let bursts = [];
  let level = 1;
  let score = 0;
  let captured = 0;
  let total = 0;
  let running = false;
  let won = false;
  let levelMode = 'attract';
  let field = null;
  let pulse = null;
  let activePointerId = null;
  let lastTime = 0;
  let forceApplied = false;
  let idleHintTimer = null;
  let audioCtx = null;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * Math.max(0, hi - lo);
  const tx = t => t.rx * W;
  const ty = t => t.ry * H;

  function fieldRadius() {
    return CFG.fieldRadius * (W <= 600 ? 0.8 : 1);
  }

  function ensureAudio() {
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        audioCtx = new AudioCtor();
      } catch (_) {
        return null;
      }
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function tone(ctx, freq, start, duration, volume, type) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function playCaptureSound() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, 720, t, 0.16, 0.16, 'sine');
    tone(ctx, 1080, t + 0.02, 0.12, 0.07, 'triangle');
  }

  function playFallbackWinSound() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      tone(ctx, freq, t + i * 0.11, 0.22, 0.14, 'sine');
    });
    [523.25, 783.99, 1046.5].forEach(freq => {
      tone(ctx, freq, t + 0.46, 0.35, 0.09, 'triangle');
    });
  }

  function playWinSound() {
    try {
      completeSound.pause();
      completeSound.currentTime = 0;
      const playing = completeSound.play();
      if (playing && typeof playing.catch === 'function') {
        playing.catch(() => playFallbackWinSound());
      }
    } catch (_) {
      playFallbackWinSound();
    }
  }

  function pickLevelMode() {
    const earlyModes = ['attract', 'repel', 'repel', 'attract', 'repel'];
    if (level <= earlyModes.length) return earlyModes[level - 1];
    const repelChance = Math.min(0.55, 0.28 + (level - 5) * 0.06);
    return Math.random() < repelChance ? 'repel' : 'attract';
  }

  function setLevelMode(next) {
    levelMode = next;
    modeValue.textContent = next.toUpperCase();
    modeLabel.dataset.mode = next;
    modeLabel.setAttribute('aria-label', `Current level mode: ${next}`);

    const repel = next === 'repel';
    hintLead.textContent = repel
      ? 'Tap/Hold to push the particles away'
      : 'Tap/Hold to control the particles';
    hintDetail.textContent = repel
      ? 'Drag to push particles away, then guide them into their matching colors'
      : 'Drag the particles toward their matching colors';
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    for (const [canvas, ctx] of [[trailCanvas, tctx], [uiCanvas, uctx]]) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    tctx.fillStyle = '#000';
    tctx.fillRect(0, 0, W, H);

    for (const p of particles) {
      p.x = clamp(p.x, p.r, Math.max(p.r, W - p.r));
      p.y = clamp(p.y, p.r, Math.max(p.r, H - p.r));
    }
  }

  function makeLevel() {
    const count = Math.min(4 + (level - 1), 10);
    targets = [];
    particles = [];
    bursts = [];
    captured = 0;
    total = count;
    won = false;
    running = true;
    field = null;
    pulse = null;
    activePointerId = null;
    forceApplied = false;

    clearTimeout(idleHintTimer);
    idleHintTimer = null;
    if (level <= 1) {
      hintEl.classList.remove('faded');
    } else {
      scheduleHintReturn();
    }

    setLevelMode(pickLevelMode());

    const minGap = CFG.targetRadius * 3.1;

    for (let i = 0; i < count; i++) {
      let rx = 0.5;
      let ry = 0.5;
      let tries = 0;
      do {
        rx = rand(0.12, 0.88);
        ry = rand(0.18, 0.86);
        tries++;
      } while (
        tries < 60 &&
        targets.some(t => Math.hypot((t.rx - rx) * W, (t.ry - ry) * H) < minGap)
      );

      targets.push({
        index: i,
        rx,
        ry,
        radius: CFG.targetRadius,
        color: PALETTE[i % PALETTE.length],
        dash: DASHES[i % DASHES.length],
        phase: Math.random() * TAU,
        glow: 0
      });
    }

    for (let i = 0; i < count; i++) {
      const target = targets[i];
      const gx = tx(target);
      const gy = ty(target);
      let x = gx;
      let y = gy;
      let tries = 0;
      do {
        x = rand(Math.min(30, W / 2), Math.max(W - 30, W / 2));
        y = rand(Math.min(30, H / 2), Math.max(H - 30, H / 2));
        tries++;
      } while (tries < 80 && Math.hypot(x - gx, y - gy) < 120);

      particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        r: CFG.particleRadius,
        color: target.color,
        target: i,
        dwell: 0,
        captured: false,
        wanderPhase: Math.random() * TAU,
        wanderSpeed: rand(0.7, 1.5),
        wanderOffset: Math.random() * TAU
      });
    }

    tctx.fillStyle = '#000';
    tctx.fillRect(0, 0, W, H);
    updateHud();
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    levelEl.textContent = String(level);
  }

  function addBurst(x, y, color) {
    bursts.push({ x, y, color, t: 0 });
  }

  function finishLevel() {
    won = true;
    running = false;
    clearTimeout(idleHintTimer);
    idleHintTimer = null;
    field = null;
    pulse = null;
    activePointerId = null;

    score += 400 + level * 100;
    updateHud();
    playWinSound();

    overlayKicker.textContent = `LEVEL ${level} COMPLETE`;
    overlayTitle.textContent = 'Field cleared.';
    finalScore.textContent = String(score);
    overlay.classList.remove('hidden');
    try {
      nextBtn.focus({ preventScroll: true });
    } catch (_) {
      nextBtn.focus();
    }
  }

  function nextLevel() {
    level++;
    overlay.classList.add('hidden');
    makeLevel();
    ensureAudio();
  }

  function restartGame() {
    level = 1;
    score = 0;
    overlay.classList.add('hidden');
    makeLevel();
    ensureAudio();
  }

  function updateGame(dt) {
    const sources = [];

    if (field) {
      const strength = field.mode === 'repel' ? CFG.repelForce : CFG.attractForce;
      sources.push({ x: field.x, y: field.y, mode: field.mode, strength });
    }

    if (pulse) {
      const k = clamp(pulse.life / pulse.maxLife, 0, 1);
      const base = pulse.mode === 'repel' ? CFG.repelPulseForce : CFG.pulseForce;
      sources.push({ x: pulse.x, y: pulse.y, mode: pulse.mode, strength: base * k });
      pulse.life -= dt;
      if (pulse.life <= 0) pulse = null;
    }

    for (const p of particles) {
      if (p.captured) continue;

      const target = targets[p.target];
      const gx = tx(target);
      const gy = ty(target);

      let ax = 0;
      let ay = 0;
      if (forceApplied) {
        ax = Math.cos(p.wanderPhase) * CFG.idleForce;
        ay = Math.sin(p.wanderPhase * 0.83 + p.wanderOffset) * CFG.idleForce;
        p.wanderPhase += p.wanderSpeed * dt;
      }

      for (const s of sources) {
        const dx = s.x - p.x;
        const dy = s.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const radius = fieldRadius();
        const fall = 1 - dist / radius;
        if (fall <= 0) continue;

        const mag = s.strength * fall * fall;
        const sign = s.mode === 'attract' ? 1 : -1;
        ax += (dx / dist) * mag * sign;
        ay += (dy / dist) * mag * sign;
      }

      p.vx = (p.vx + ax * dt) * CFG.drag;
      p.vy = (p.vy + ay * dt) * CFG.drag;

      const speed = Math.hypot(p.vx, p.vy);
      if (speed > CFG.maxSpeed) {
        p.vx = (p.vx / speed) * CFG.maxSpeed;
        p.vy = (p.vy / speed) * CFG.maxSpeed;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < p.r) {
        p.x = p.r;
        p.vx = Math.abs(p.vx);
      } else if (p.x > W - p.r) {
        p.x = W - p.r;
        p.vx = -Math.abs(p.vx);
      }

      if (p.y < p.r) {
        p.y = p.r;
        p.vy = Math.abs(p.vy);
      } else if (p.y > H - p.r) {
        p.y = H - p.r;
        p.vy = -Math.abs(p.vy);
      }

      const distance = Math.hypot(p.x - gx, p.y - gy);

      if (distance < target.radius) {
        p.vx *= 0.86;
        p.vy *= 0.86;
        p.dwell += dt;

        if (p.dwell >= CFG.captureDwell) {
          p.captured = true;
          p.x = gx;
          p.y = gy;
          p.vx = 0;
          p.vy = 0;
          captured++;
          score += 100;
          target.glow = 1;
          addBurst(gx, gy, p.color);
          playCaptureSound();
          updateHud();
          if (captured === total) finishLevel();
        }
      } else {
        p.dwell = Math.max(0, p.dwell - dt * 2);
      }
    }
  }

  function updateEffects(dt) {
    for (const t of targets) {
      t.phase += dt * 2.4;
      if (t.glow > 0) t.glow = Math.max(0, t.glow - dt);
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      bursts[i].t += dt * 2.1;
      if (bursts[i].t >= 1) bursts.splice(i, 1);
    }
  }

  function drawField(f, alpha) {
    const rgb = f.mode === 'attract' ? '77,141,255' : '255,107,107';
    const radius = fieldRadius();
    uctx.save();
    uctx.globalAlpha = alpha;

    const g = uctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, radius);
    g.addColorStop(0, `rgba(${rgb},0.16)`);
    g.addColorStop(0.7, `rgba(${rgb},0.05)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    uctx.fillStyle = g;
    uctx.beginPath();
    uctx.arc(f.x, f.y, radius, 0, TAU);
    uctx.fill();

    uctx.strokeStyle = `rgba(${rgb},0.65)`;
    uctx.lineWidth = 1.5;
    uctx.setLineDash([7, 7]);
    uctx.beginPath();
    uctx.arc(f.x, f.y, radius, 0, TAU);
    uctx.stroke();
    uctx.setLineDash([]);

    uctx.fillStyle = `rgba(${rgb},0.95)`;
    uctx.beginPath();
    uctx.arc(f.x, f.y, 3.5, 0, TAU);
    uctx.fill();
    uctx.restore();
  }

  function render() {
    tctx.fillStyle = `rgba(0,0,0,${CFG.trailFade})`;
    tctx.fillRect(0, 0, W, H);

    tctx.save();
    tctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      if (p.captured) continue;
      tctx.shadowColor = p.color;
      tctx.shadowBlur = 12;
      tctx.fillStyle = p.color;
      tctx.beginPath();
      tctx.arc(p.x, p.y, p.r, 0, TAU);
      tctx.fill();
      tctx.shadowBlur = 0;
      tctx.fillStyle = 'rgba(255,255,255,0.8)';
      tctx.beginPath();
      tctx.arc(p.x - p.r * 0.28, p.y - p.r * 0.28, p.r * 0.32, 0, TAU);
      tctx.fill();
    }
    tctx.restore();

    uctx.clearRect(0, 0, W, H);

    for (const t of targets) {
      const x = tx(t);
      const y = ty(t);
      const done = particles[t.index].captured;
      const r = t.radius + (done ? 0 : Math.sin(t.phase) * 1.5);

      if (t.glow > 0) {
        uctx.save();
        uctx.globalAlpha = t.glow;
        uctx.strokeStyle = t.color;
        uctx.shadowColor = t.color;
        uctx.shadowBlur = 30 * t.glow;
        uctx.lineWidth = 3 + 3 * t.glow;
        uctx.beginPath();
        uctx.arc(x, y, r + (1 - t.glow) * 12, 0, TAU);
        uctx.stroke();
        uctx.restore();
      }

      uctx.save();
      uctx.globalAlpha = done ? 0.95 : 0.5;
      uctx.strokeStyle = t.color;
      uctx.lineWidth = done ? 2.5 : 1.5;
      uctx.setLineDash(t.dash);
      uctx.beginPath();
      uctx.arc(x, y, r, 0, TAU);
      uctx.stroke();
      uctx.setLineDash([]);

      if (done) {
        uctx.globalAlpha = 0.18;
        uctx.fillStyle = t.color;
        uctx.beginPath();
        uctx.arc(x, y, r, 0, TAU);
        uctx.fill();

        uctx.globalAlpha = 1;
        uctx.shadowColor = t.color;
        uctx.shadowBlur = 10;
        uctx.fillStyle = t.color;
        uctx.beginPath();
        uctx.arc(x, y, 3.2, 0, TAU);
        uctx.fill();
      } else {
        uctx.globalAlpha = 0.28;
        uctx.fillStyle = t.color;
        uctx.beginPath();
        uctx.arc(x, y, 3, 0, TAU);
        uctx.fill();
      }
      uctx.restore();
    }

    if (field) drawField(field, 1);
    if (pulse) drawField(pulse, clamp(pulse.life / pulse.maxLife, 0, 1) * 0.85);

    for (const b of bursts) {
      uctx.save();
      uctx.globalAlpha = 1 - b.t;
      uctx.strokeStyle = b.color;
      uctx.lineWidth = 2;
      uctx.beginPath();
      uctx.arc(b.x, b.y, 8 + b.t * 38, 0, TAU);
      uctx.stroke();
      uctx.restore();
    }
  }

  function tick(now) {
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.033);
    lastTime = now;

    if (running && !won) updateGame(dt);
    updateEffects(dt);
    render();

    requestAnimationFrame(tick);
  }

  function localPoint(e) {
    const rect = stage.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function scheduleHintReturn() {
    clearTimeout(idleHintTimer);
    if (level <= 1) return;
    idleHintTimer = setTimeout(() => {
      idleHintTimer = null;
      hintEl.classList.remove('faded');
    }, HINT_IDLE_MS);
  }

  function noteActivity() {
    hintEl.classList.add('faded');
    scheduleHintReturn();
  }

  stage.addEventListener('pointerdown', e => {
    if (won || activePointerId !== null) return;
    if (e.target instanceof Element && e.target.closest('button, a, .overlay, .panel')) return;
    if (e.button !== 0 && e.button !== 2) return;

    ensureAudio();
    e.preventDefault();
    noteActivity();
    forceApplied = true;

    const p = localPoint(e);
    activePointerId = e.pointerId;
    field = {
      x: p.x,
      y: p.y,
      startX: p.x,
      startY: p.y,
      downAt: performance.now(),
      moved: false,
      mode: levelMode
    };

    try {
      stage.setPointerCapture(e.pointerId);
    } catch (_) {}
  });

  stage.addEventListener('pointermove', e => {
    if (e.pointerId !== activePointerId || !field) return;
    e.preventDefault();
    noteActivity();
    const p = localPoint(e);
    field.x = p.x;
    field.y = p.y;
    if (Math.hypot(p.x - field.startX, p.y - field.startY) > 8) field.moved = true;
  });

  function endPointer(e, cancelled) {
    if (e.pointerId !== activePointerId) return;
    e.preventDefault();

    const held = field ? performance.now() - field.downAt : 0;
    if (!cancelled && field && !field.moved && held < 260) {
      pulse = { x: field.x, y: field.y, mode: field.mode, life: 0.16, maxLife: 0.16 };
    }

    field = null;
    activePointerId = null;

    try {
      stage.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }

  stage.addEventListener('pointerup', e => endPointer(e, false));
  stage.addEventListener('pointercancel', e => endPointer(e, true));
  stage.addEventListener('contextmenu', e => e.preventDefault());

  nextBtn.addEventListener('click', () => {
    ensureAudio();
    nextLevel();
  });

  overlay.addEventListener('pointerdown', e => {
    if (e.target === overlay) {
      ensureAudio();
      nextLevel();
    }
  });

  window.addEventListener('keydown', e => {
    ensureAudio();
    const k = e.key.toLowerCase();
    if ((k === 'n' || k === 'enter') && won) {
      if (k === 'enter' && document.activeElement === nextBtn) return;
      nextLevel();
    } else if (k === 'escape') {
      restartGame();
    }
  });

  window.addEventListener('resize', resize);

  resize();
  makeLevel();
  requestAnimationFrame(tick);
})();
