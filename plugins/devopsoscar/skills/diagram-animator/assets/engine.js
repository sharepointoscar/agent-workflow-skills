/* diagram-animator engine
 * ---------------------------------------------------------------------------
 * Timeline-as-pure-function design: every visual state is derived from a single
 * scalar `t` (milliseconds). Playback just advances `t` via rAF. That is what
 * makes deterministic frame export possible — the exporter calls seek(t) and
 * screenshots, with no dependence on wall-clock or CSS animation phase.
 *
 * Expects a global DIAGRAM_CONFIG (injected by scripts/build.py):
 *   {
 *     steps: [ { n, path, flow, color, tag, focus:[ids], title, html,
 *                halo?:[{x,y}], dash?:true } ],
 *     timing: { draw, hold, pulseCycle, outro },
 *     overview: { title, html },
 *     complete: { title, html },
 *     trailOpacity: 0.16,
 *     dimOpacity: 0.10
 *   }
 * ------------------------------------------------------------------------- */
(function () {
  "use strict";

  var CFG = window.DIAGRAM_CONFIG || {};
  var STEPS = CFG.steps || [];
  var T = Object.assign(
    { draw: 950, hold: 2150, pulseCycle: 1250, outro: 900 },
    CFG.timing || {}
  );
  var TRAIL = CFG.trailOpacity != null ? CFG.trailOpacity : 0.16;

  var svg = document.getElementById("diagram");
  var overlays = document.getElementById("overlays");
  var NS = "http://www.w3.org/2000/svg";
  if (!svg || !STEPS.length) return;

  var LAYERS = Array.prototype.slice.call(svg.querySelectorAll(".layer"));
  var STEP_MS = T.draw + T.hold;
  var STEPS_END = STEPS.length * STEP_MS;
  var TOTAL = STEPS_END + T.outro;

  /* ---------------------------------------------------------------- geometry
   * Flow geometry is rebuilt as a <path> clone so getPointAtLength and
   * stroke-dashoffset behave identically for line / polyline / path sources.
   * The clone is drawn into #overlays (last child) so it always sits on top,
   * and carries no marker — during a partial draw a marker would render at the
   * final vertex regardless of the dash, which reads as a bug. */
  function toPathData(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === "path") return el.getAttribute("d");
    if (tag === "line") {
      return (
        "M" + el.getAttribute("x1") + "," + el.getAttribute("y1") +
        " L" + el.getAttribute("x2") + "," + el.getAttribute("y2")
      );
    }
    if (tag === "polyline" || tag === "polygon") {
      var pts = el.getAttribute("points").trim().split(/\s+/);
      var d = "M" + pts[0] + " L" + pts.slice(1).join(" L");
      return tag === "polygon" ? d + " Z" : d;
    }
    console.warn("[diagram-animator] unsupported flow geometry:", tag);
    return null;
  }

  var geo = {};
  STEPS.forEach(function (s) {
    var src = document.getElementById(s.path);
    if (!src) { console.warn("[diagram-animator] missing path #" + s.path); return; }
    var d = toPathData(src);
    if (!d) return;

    var draw = document.createElementNS(NS, "path");
    draw.setAttribute("d", d);
    draw.setAttribute("class", "draw");
    draw.setAttribute("stroke", s.color);
    draw.setAttribute("stroke-width", s.width || 3.2);
    draw.style.filter = "drop-shadow(0 0 5px " + s.color + ")";
    overlays.appendChild(draw);
    var len = draw.getTotalLength();
    draw.style.strokeDasharray = len;
    draw.style.strokeDashoffset = len;
    draw.style.opacity = 0;

    var dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", s.dotR || 5);
    dot.setAttribute("fill", s.dotFill || "#fff");
    dot.setAttribute("class", "pulse");
    dot.style.filter = "drop-shadow(0 0 7px " + s.color + ")";
    dot.style.opacity = 0;
    overlays.appendChild(dot);

    geo[s.n] = { src: src, draw: draw, dot: dot, len: len };
  });

  /* halo rings — optional per-step attention pulses on a coordinate */
  var halos = [];
  for (var h = 0; h < 3; h++) {
    var c = document.createElementNS(NS, "circle");
    c.setAttribute("fill", "none");
    c.setAttribute("stroke-width", "2");
    c.style.opacity = 0;
    overlays.appendChild(c);
    halos.push(c);
  }

  /* ------------------------------------------------------------------- DOM */
  var el = {
    cap: document.getElementById("caption"),
    num: document.getElementById("capNum"),
    title: document.getElementById("capTitle"),
    text: document.getElementById("capText"),
    play: document.getElementById("btnPlay"),
    speed: document.getElementById("btnSpeed"),
    chips: document.getElementById("chips"),
    scrub: document.getElementById("scrub")
  };

  var chips = [];
  if (el.chips) {
    STEPS.forEach(function (s) {
      var c = document.createElement("div");
      c.className = "chip";
      c.textContent = s.n;
      c.dataset.n = s.n;
      c.title = s.title || "";
      c.addEventListener("click", function () { pause(); goTo(s.n, true); });
      el.chips.appendChild(c);
      chips.push(c);
    });
  }

  /* ----------------------------------------------------------------- render */
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function resetOverlays() {
    STEPS.forEach(function (s) {
      var g = geo[s.n]; if (!g) return;
      g.draw.style.opacity = 0;
      g.draw.style.strokeDashoffset = g.len;
      g.dot.style.opacity = 0;
    });
    halos.forEach(function (c) { c.style.opacity = 0; });
    setBadgeScale(null, 1);
  }

  function setBadgeScale(flowId, k) {
    Array.prototype.forEach.call(svg.querySelectorAll(".badge"), function (b) {
      b.style.transform = "";
      b.style.opacity = "";
    });
    if (!flowId) return;
    var b = svg.querySelector("#" + flowId + " .badge");
    if (!b) return;
    b.style.transform = "scale(" + k + ")";
    b.style.opacity = k < 0.35 ? 0 : 1;
  }

  function clearLayerState() {
    LAYERS.forEach(function (l) {
      l.classList.remove("dim", "trail", "hot", "hot-glow");
    });
  }

  function setCaption(color, num, title, html) {
    document.documentElement.style.setProperty("--glow", color);
    if (el.cap) el.cap.style.borderLeftColor = color;
    if (el.num) {
      el.num.textContent = num;
      el.num.style.background = color;
      el.num.style.boxShadow = "0 0 18px -2px " + color;
    }
    if (el.title) el.title.innerHTML = title;
    if (el.text) el.text.innerHTML = html;
  }

  function paintChips(activeN, allDone) {
    chips.forEach(function (c) {
      var n = parseInt(c.dataset.n, 10);
      var col = STEPS[n - 1].color;
      c.classList.toggle("active", !allDone && n === activeN);
      c.classList.toggle("done", allDone || n < activeN);
      if (allDone || n <= activeN) { c.style.background = col; c.style.borderColor = col; }
      else { c.style.background = ""; c.style.borderColor = ""; }
    });
  }

  function renderOverview() {
    clearLayerState();
    resetOverlays();
    svg.classList.add("ambient");
    paintChips(0, false);
    chips.forEach(function (c) { c.classList.remove("done", "active"); c.style.background = ""; c.style.borderColor = ""; });
    var ov = CFG.overview || {};
    setCaption(CFG.baseColor || "#3b82f6", "—",
      ov.title || "Overview",
      ov.html || "Press <b>Play</b> to walk through the flow.");
  }

  function renderComplete() {
    clearLayerState();
    svg.classList.add("ambient");
    STEPS.forEach(function (s) {
      var g = geo[s.n]; if (!g) return;
      g.draw.style.opacity = 0.35;
      g.draw.style.strokeDashoffset = 0;
      g.dot.style.opacity = 0;
    });
    halos.forEach(function (c) { c.style.opacity = 0; });
    setBadgeScale(null, 1);
    paintChips(STEPS.length, true);
    var cp = CFG.complete || {};
    setCaption(cp.color || "#22c55e", "✓",
      cp.title || "Complete",
      cp.html || "End-to-end path shown.");
  }

  function renderStep(idx, local) {
    var s = STEPS[idx];
    var g = geo[s.n];
    svg.classList.remove("ambient");

    // layers: focused hot+glow, prior flows trail, everything else dim
    var focus = {};
    (s.focus || []).forEach(function (id) { focus[id] = 1; });
    LAYERS.forEach(function (l) {
      l.classList.remove("dim", "trail", "hot", "hot-glow");
      var id = l.id;
      if (focus[id]) { l.classList.add("hot", "hot-glow"); return; }
      var m = /^f(\d+)$/.exec(id);
      if (m) {
        var fi = parseInt(m[1], 10);
        if (fi === s.n) l.classList.add("hot");
        else if (fi < s.n) l.classList.add("trail");
        else l.classList.add("dim");
        return;
      }
      if (CFG.alwaysVisible && CFG.alwaysVisible.indexOf(id) !== -1) { l.classList.add("trail"); return; }
      l.classList.add("dim");
    });

    setCaption(s.color, s.n,
      s.title + (s.tag ? '<span class="cap-tag">' + s.tag + "</span>" : ""),
      s.html);
    paintChips(s.n, false);

    // prior flows keep a faint drawn trail so the path accumulates visibly
    STEPS.forEach(function (o) {
      var og = geo[o.n]; if (!og) return;
      if (o.n < s.n) { og.draw.style.opacity = TRAIL; og.draw.style.strokeDashoffset = 0; og.dot.style.opacity = 0; }
      else if (o.n > s.n) { og.draw.style.opacity = 0; og.draw.style.strokeDashoffset = og.len; og.dot.style.opacity = 0; }
    });

    if (!g) return;

    // badge pop, derived from local time (no CSS keyframes → seekable)
    var bp = clamp01(local / 500);
    var k = bp < 1 ? 0.2 + 1.08 * ease(bp) * (1 + 0.16 * Math.sin(Math.PI * bp)) : 1;
    setBadgeScale(s.flow, Math.min(k, 1.3));

    if (local < T.draw) {
      var p = ease(local / T.draw);
      g.draw.style.opacity = 1;
      g.draw.style.strokeDashoffset = g.len * (1 - p);
      g.dot.style.opacity = 1;
      placeDot(g, p);
    } else {
      g.draw.style.opacity = 1;
      g.draw.style.strokeDashoffset = 0;
      g.dot.style.opacity = 0.95;
      placeDot(g, ((local - T.draw) % T.pulseCycle) / T.pulseCycle);
    }

    // halos
    halos.forEach(function (c, i) {
      var spec = (s.halo || [])[i];
      if (!spec) { c.style.opacity = 0; return; }
      var phase = ((local + i * 600) % 1900) / 1900;
      c.setAttribute("cx", spec.x);
      c.setAttribute("cy", spec.y);
      c.setAttribute("r", 14 + 22 * phase);
      c.setAttribute("stroke", s.color);
      c.style.opacity = 0.75 * (1 - phase);
    });
  }

  function placeDot(g, frac) {
    var pt = g.draw.getPointAtLength(g.len * clamp01(frac));
    g.dot.setAttribute("cx", pt.x);
    g.dot.setAttribute("cy", pt.y);
  }

  /* -------------------------------------------------------------- timeline */
  var t = -1;          // -1 => overview
  var playing = false;
  var speed = 1;
  var anchor = 0;
  var raf = null;

  function seek(ms) {
    t = ms;
    if (el.scrub) el.scrub.value = Math.max(0, Math.min(TOTAL, ms));
    if (ms < 0) { renderOverview(); return; }
    if (ms >= STEPS_END) { renderComplete(); return; }
    var idx = Math.min(STEPS.length - 1, Math.floor(ms / STEP_MS));
    renderStep(idx, ms - idx * STEP_MS);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!playing) return;
    var ms = (now - anchor) * speed;
    if (ms >= TOTAL) { seek(TOTAL); pause(); if (el.play) el.play.innerHTML = "▶ Replay"; return; }
    seek(ms);
  }

  function play() {
    if (t >= STEPS_END || t < 0) t = 0;
    anchor = performance.now() - t / speed;
    playing = true;
    if (el.play) el.play.innerHTML = "❚❚ Pause";
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false;
    if (el.play) el.play.innerHTML = "▶ Play";
  }
  function stepStart(n) { return (n - 1) * STEP_MS; }
  function goTo(n, instant) {
    if (n < 1) { seek(-1); return; }
    if (n > STEPS.length) { seek(STEPS_END); return; }
    seek(stepStart(n) + (instant ? T.draw : 0));
  }
  function currentStep() {
    if (t < 0) return 0;
    if (t >= STEPS_END) return STEPS.length + 1;
    return Math.min(STEPS.length, Math.floor(t / STEP_MS) + 1);
  }

  /* -------------------------------------------------------------- controls */
  if (el.play) el.play.addEventListener("click", function () { playing ? pause() : play(); });
  var byId = function (id) { return document.getElementById(id); };
  if (byId("btnNext")) byId("btnNext").addEventListener("click", function () {
    pause(); goTo(Math.min(STEPS.length, currentStep() + 1), true);
  });
  if (byId("btnPrev")) byId("btnPrev").addEventListener("click", function () {
    pause(); var c = currentStep(); c <= 1 ? seek(-1) : goTo(Math.min(STEPS.length, c) - 1, true);
  });
  if (byId("btnRestart")) byId("btnRestart").addEventListener("click", function () {
    pause(); seek(-1); if (el.play) el.play.innerHTML = "▶ Play";
  });
  var SPEEDS = [0.5, 1, 1.5, 2], si = 1;
  if (el.speed) el.speed.addEventListener("click", function () {
    si = (si + 1) % SPEEDS.length;
    var was = playing;
    speed = SPEEDS[si];
    el.speed.textContent = speed + "×";
    if (was) { anchor = performance.now() - t / speed; }
  });
  if (el.scrub) {
    el.scrub.max = TOTAL;
    el.scrub.addEventListener("input", function () { pause(); seek(parseFloat(el.scrub.value)); });
  }

  document.addEventListener("keydown", function (e) {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.code === "Space") { e.preventDefault(); playing ? pause() : play(); }
    else if (e.key === "ArrowRight") { pause(); goTo(Math.min(STEPS.length, currentStep() + 1), true); }
    else if (e.key === "ArrowLeft") { pause(); var c = currentStep(); c <= 1 ? seek(-1) : goTo(Math.min(STEPS.length, c) - 1, true); }
    else if (e.key === "0") { pause(); seek(-1); }
    else if (/^[1-9]$/.test(e.key)) { pause(); goTo(parseInt(e.key, 10), true); }
  });

  /* ------------------------------------------------------------- public API
   * scripts/export_frames.js drives these. Keep the names stable. */
  window.DiagramAnim = {
    steps: STEPS,
    timing: T,
    total: TOTAL,
    stepsEnd: STEPS_END,
    stepMs: STEP_MS,
    seek: seek,
    goTo: goTo,
    play: play,
    pause: pause,
    stepStart: stepStart,
    currentStep: currentStep,
    ready: true
  };

  seek(-1);
  raf = requestAnimationFrame(tick);
})();
