
(function () {
  var LIMIT = 70;
  var FONTS = [
    { n: "Inter", g: "sans-serif", w: 700 },
    { n: "Pacifico", g: "cursive", w: 400 },
    { n: "Press Start 2P", g: "monospace", w: 400 },
    { n: "Bebas Neue", g: "sans-serif", w: 400 },
    { n: "Playfair Display", g: "serif", w: 700 },
    { n: "Caveat", g: "cursive", w: 700 },
    { n: "Orbitron", g: "sans-serif", w: 700 },
    { n: "Space Mono", g: "monospace", w: 700 },
    { n: "Anton", g: "sans-serif", w: 400 },
    { n: "Lobster", g: "cursive", w: 400 },
    { n: "Bungee", g: "sans-serif", w: 400 },
    { n: "Righteous", g: "sans-serif", w: 400 },
    { n: "Alfa Slab One", g: "serif", w: 400 },
    { n: "Permanent Marker", g: "cursive", w: 400 },
    { n: "Aldo the Apache", g: "cursive", w: 400 },
    { n: "Times New Roman", g: "serif", w: 700 }
  ];
  var BACKGROUNDS = [
    { name: "White", c: "#ffffff", dark: false },
    { name: "Midnight blue", c: "#0e1b2c", dark: true },
    { name: "Dark black", c: "#000000", dark: true }
  ];
  var COLORS_DARK = [
    "#ff453a", "#ff9f0a", "#ffd60a", "#32d74b", "#a3e635", "#30d158",
    "#00c7be", "#2dd4bf", "#64d2ff", "#22d3ee", "#0a84ff", "#5e5ce6",
    "#bf5af2", "#ff375f"
  ];
  var COLORS_LIGHT = [
    "#d70015", "#b25000", "#8a6d00", "#1f7a3f", "#3f7d00", "#0b7a55",
    "#007a70", "#0f766e", "#0060a8", "#0e7490", "#0040dd", "#4638c9",
    "#8e44ad", "#c2185b"
  ];
  var SOUNDS = [
    { id: "blip", name: "Blip" },
    { id: "ping", name: "Ping" },
    { id: "bloop", name: "Bloop" },
    { id: "click", name: "Click" },
    { id: "chime", name: "Chime" },
    { id: "thud", name: "Thud" },
    { id: "laser", name: "Laser" },
    { id: "marimba", name: "Marimba" },
    { id: "pop", name: "Pop" },
    { id: "pluck", name: "Pluck" },
    { id: "coin", name: "Coin" },
    { id: "bell", name: "Bell" },
    { id: "bass", name: "Bass" },
    { id: "boing", name: "Boing" },
    { id: "arp", name: "Arpeggio" },
    { id: "off", name: "Silent" }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("stage"), g = canvas.getContext("2d");
  var items = [], nextId = 1, W = 0, H = 0, paused = false, muted = false, spawnCount = 0, defaultSound = "blip", hits = 0;
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var speedScale = reduced ? 0.5 : 1;

  var AC = window.AudioContext || window.webkitAudioContext, actx = null;
  function audio() {
    try {
      if (!actx && AC) actx = new AC();
      if (actx && actx.state === "suspended") actx.resume();
    } catch (e) { actx = null; }
    updateHint();
    return actx;
  }
  function tone(freq, type, dur, vol, slideTo, delay) {
    var t = actx.currentTime + (delay || 0);
    var o = actx.createOscillator(), gn = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }
  var SOUND_FN = {
    blip: function (m) { tone(660 * m, "square", 0.08, 0.07); },
    ping: function (m) { tone(1200 * m, "sine", 0.28, 0.16); },
    bloop: function (m) { tone(300 * m, "sine", 0.16, 0.2, 640 * m); },
    click: function (m) { tone(1800 * m, "triangle", 0.035, 0.2); },
    chime: function (m) { tone(880 * m, "sine", 0.5, 0.12); tone(1320 * m, "sine", 0.5, 0.08, 0, 0.04); },
    thud: function (m) { tone(150 * m, "sine", 0.2, 0.4, 48 * m); },
    laser: function (m) { tone(1400 * m, "sawtooth", 0.16, 0.06, 200 * m); },
    marimba: function (m) { tone(523 * m, "sine", 0.22, 0.25); tone(1046 * m, "sine", 0.1, 0.06); },
    pop: function (m) { tone(720 * m, "sine", 0.09, 0.22, 360 * m); },
    pluck: function (m) { tone(440 * m, "triangle", 0.18, 0.18, 220 * m); },
    coin: function (m) { tone(988 * m, "square", 0.07, 0.07); tone(1319 * m, "square", 0.22, 0.07, 0, 0.07); },
    bell: function (m) { tone(880 * m, "sine", 0.9, 0.1); tone(1760 * m, "sine", 0.6, 0.05, 0, 0.02); },
    bass: function (m) { tone(110 * m, "sine", 0.35, 0.35, 55 * m); },
    boing: function (m) { tone(220 * m, "sine", 0.3, 0.18, 660 * m); },
    arp: function (m) {
      tone(523 * m, "triangle", 0.16, 0.14);
      tone(659 * m, "triangle", 0.16, 0.12, 0, 0.06);
      tone(784 * m, "triangle", 0.16, 0.1, 0, 0.12);
      tone(1046 * m, "triangle", 0.22, 0.08, 0, 0.18);
    },
    off: function () {}
  };
  function play(soundId, pitch) {
    if (muted || soundId === "off") return;
    if (!audio() || actx.state !== "running") return;
    (SOUND_FN[soundId] || SOUND_FN.blip)(pitch || 1);
  }
  function updateHint() {
    var h = $("soundHint");
    if (!h) return;
    h.textContent = (!actx || actx.state !== "running") ? "Tap the page once to turn sound on." : "";
  }
  function bumpHits(n) {
    hits += n;
    $("hitText").textContent = hits + (hits === 1 ? " hit" : " hits");
  }
  window.addEventListener("pointerdown", audio, { passive: true });
  window.addEventListener("keydown", audio);

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    items.forEach(function (it) {
      it.x = Math.max(0, Math.min(it.x, W - it.w));
      it.y = Math.max(0, Math.min(it.y, H - it.h));
    });
    var composer = $("composer");
    if (composer) {
      document.documentElement.style.setProperty("--composer-h", composer.offsetHeight + "px");
    }
  }
  window.addEventListener("resize", resize);

  function fontDef(name) { return FONTS.filter(function (f) { return f.n === name; })[0] || FONTS[0]; }
  function fontStr(it) { var f = fontDef(it.font); return f.w + " " + it.size + "px \"" + f.n + "\", " + f.g; }
  function measure(it) {
    g.font = fontStr(it);
    it.w = Math.ceil(g.measureText(it.text).width);
    it.h = Math.ceil(it.size * 1.15);
  }
  function colorAt(i) {
    var palette = document.documentElement.getAttribute("data-tone") === "dark" ? COLORS_DARK : COLORS_LIGHT;
    return palette[i % palette.length];
  }

  function spawn(text, fontName, color, colorIndex, size, soundId) {
    if (items.length >= LIMIT) return;
    var it = { id: nextId++, text: text, font: fontName, ci: colorIndex, color: color, size: size, sound: soundId, flash: 0, last: 0 };
    var f = fontDef(fontName);
    var ready = document.fonts && document.fonts.load ? document.fonts.load(f.w + " " + size + "px \"" + f.n + "\"", text).catch(function () {}) : Promise.resolve();
    ready.then(function () {
      if (items.length >= LIMIT) return;
      measure(it);
      if (it.w > W * 0.95) { it.size = Math.max(10, Math.floor(it.size * (W * 0.95) / it.w)); measure(it); }
      it.x = (W - it.w) / 2; it.y = (H - it.h) / 2;
      var sp = (150 + Math.random() * 90) * speedScale;
      var ang = (Math.PI / 4) + (Math.random() - 0.5) * 0.7;
      it.vx = Math.cos(ang) * sp * (Math.random() < 0.5 ? -1 : 1);
      it.vy = Math.sin(ang) * sp * (Math.random() < 0.5 ? -1 : 1);
      items.push(it);
      refreshUI();
    });
    return it;
  }

  var lastT = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    g.clearRect(0, 0, W, H);
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!paused) {
        it.x += it.vx * dt; it.y += it.vy * dt;
        var hx = false, hy = false;
        if (it.x <= 0) { it.x = 0; it.vx = Math.abs(it.vx); hx = true; }
        else if (it.x + it.w >= W) { it.x = Math.max(0, W - it.w); it.vx = -Math.abs(it.vx); hx = true; }
        if (it.y <= 0) { it.y = 0; it.vy = Math.abs(it.vy); hy = true; }
        else if (it.y + it.h >= H) { it.y = Math.max(0, H - it.h); it.vy = -Math.abs(it.vy); hy = true; }
        if ((hx || hy) && now - it.last > 40) {
          it.last = now;
          bumpHits((hx ? 1 : 0) + (hy ? 1 : 0));
          if (hx && hy) {
            play(it.sound, 1);
            setTimeout(function (s) { return function () { play(s, 1.5); }; }(it.sound), 90);
            it.flash = 0.45;
          } else {
            play(it.sound, 1);
            it.flash = 0.2;
          }
        }
        if (it.flash > 0) it.flash = Math.max(0, it.flash - dt);
      }
      g.font = fontStr(it);
      g.textBaseline = "middle"; g.textAlign = "left";
      g.fillStyle = it.color;
      if (it.flash > 0) { g.shadowColor = it.color; g.shadowBlur = 28 * (it.flash / 0.45); }
      g.fillText(it.text, it.x, it.y + it.h / 2);
      g.shadowBlur = 0;
    }
    requestAnimationFrame(frame);
  }

  function refreshUI() {
    var full = items.length >= LIMIT;
    $("add").disabled = full;
    $("add").title = full ? "Limit reached. Remove one to spawn another." : "Add word";
    var rows = $("rows");
    rows.textContent = "";
    if (!items.length) {
      var e = document.createElement("div");
      e.className = "empty"; e.textContent = "Nothing on stage yet. Add a word and it will show up here.";
      rows.appendChild(e);
      return;
    }
    items.forEach(function (it) {
      var r = document.createElement("div"); r.className = "row";
      var d = document.createElement("input");
      d.type = "color"; d.className = "dot"; d.value = it.color;
      d.title = "Change color for " + it.text;
      d.setAttribute("aria-label", "Change color for " + it.text);
      d.addEventListener("input", function () {
        it.color = d.value;
        it.ci = -1;
      });
      var l = document.createElement("span"); l.className = "lbl"; l.textContent = it.text; l.title = it.text;
      var s = document.createElement("select");
      s.setAttribute("aria-label", "Sound for " + it.text);
      SOUNDS.forEach(function (sd) {
        var o = document.createElement("option"); o.value = sd.id; o.textContent = sd.name;
        if (sd.id === it.sound) o.selected = true;
        s.appendChild(o);
      });
      s.addEventListener("change", function () { it.sound = s.value; defaultSound = s.value; play(it.sound, 1); });
      var p = document.createElement("button"); p.type = "button"; p.className = "mini"; p.textContent = "▶";
      p.setAttribute("aria-label", "Preview sound for " + it.text);
      p.addEventListener("click", function () { audio(); play(it.sound, 1); });
      var x = document.createElement("button"); x.type = "button"; x.className = "mini"; x.textContent = "×";
      x.setAttribute("aria-label", "Remove " + it.text);
      x.addEventListener("click", function () { items = items.filter(function (o) { return o !== it; }); refreshUI(); });
      r.appendChild(d); r.appendChild(l); r.appendChild(s); r.appendChild(p); r.appendChild(x);
      rows.appendChild(r);
    });
  }

  var fontSel = $("font");
  FONTS.forEach(function (f) {
    var o = document.createElement("option");
    o.value = f.n; o.textContent = f.n;
    fontSel.appendChild(o);
  });

  var shuffleOn = true;
  function applyShuffle() {
    var label = shuffleOn ? "Random font, color and sound on" : "Random font, color and sound off";
    $("shuffle").setAttribute("aria-pressed", String(shuffleOn));
    $("shuffle").setAttribute("aria-label", label);
    $("shuffle").title = label;
    fontSel.disabled = shuffleOn;
    $("color").disabled = shuffleOn;
  }
  $("shuffle").addEventListener("click", function () { shuffleOn = !shuffleOn; applyShuffle(); });
  applyShuffle();

  $("composer").addEventListener("submit", function (ev) {
    ev.preventDefault();
    audio();
    var text = $("msg").value.trim();
    if (!text || items.length >= LIMIT) return;
    var font, color, ci;
    if (shuffleOn) {
      font = FONTS[Math.floor(Math.random() * FONTS.length)].n;
      ci = Math.floor(Math.random() * COLORS_DARK.length);
      color = colorAt(ci);
      fontSel.value = font;
      $("color").value = color;
    } else {
      font = fontSel.value;
      ci = -1;
      color = $("color").value;
    }
    var snd = shuffleOn ? SOUNDS[spawnCount % (SOUNDS.length - 1)].id : defaultSound;
    if (shuffleOn) spawnCount++;
    spawn(text, font, color, ci, parseInt($("size").value, 10), snd);
    $("msg").value = "";
    $("msg").focus();
  });
  $("size").addEventListener("input", function () { $("sizeOut").textContent = $("size").value; });
  $("pause").addEventListener("click", function () {
    paused = !paused;
    $("pause").setAttribute("aria-pressed", String(paused));
    $("pause").setAttribute("aria-label", paused ? "Play" : "Pause");
    $("pause").title = paused ? "Play" : "Pause";
  });
  $("clear").addEventListener("click", function () { items = []; refreshUI(); });
  $("mute").addEventListener("click", function () {
    muted = !muted;
    $("mute").textContent = muted ? "Sound off" : "Sound on";
    $("mute").setAttribute("aria-pressed", String(muted));
  });
  $("toggleSounds").addEventListener("click", function () {
    var box = $("soundBox"), hide = !box.hidden;
    box.hidden = hide;
    $("toggleSounds").setAttribute("aria-expanded", String(!hide));
  });
  $("closeSounds").addEventListener("click", function () {
    $("soundBox").hidden = true;
    $("toggleSounds").setAttribute("aria-expanded", "false");
  });

  $("minimize").addEventListener("click", function () {
    var hide = !document.body.classList.contains("minimized");
    document.body.classList.toggle("minimized", hide);
    $("minimize").setAttribute("aria-pressed", String(hide));
    $("minimize").setAttribute("aria-label", hide ? "Show UI" : "Minimize UI");
    $("minimize").title = hide ? "Show UI" : "Minimize UI";
  });

  var bgIndex = 2;
  function setBg(i) {
    bgIndex = ((i % BACKGROUNDS.length) + BACKGROUNDS.length) % BACKGROUNDS.length;
    var b = BACKGROUNDS[bgIndex];
    document.documentElement.style.setProperty("--stage", b.c);
    document.documentElement.setAttribute("data-tone", b.dark ? "dark" : "light");
    items.forEach(function (it) { if (it.ci >= 0) it.color = colorAt(it.ci); });
    $("bgBtn").setAttribute("aria-label", "Change background (current: " + b.name + ")");
    $("bgBtn").title = "Background: " + b.name;
  }
  setBg(bgIndex);
  $("bgBtn").addEventListener("click", function () { setBg(bgIndex + 1); });

  resize();
  refreshUI();
  updateHint();
  requestAnimationFrame(frame);
})();
