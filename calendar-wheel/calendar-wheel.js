
/* calendar-wheel.js — a paper-volvelle date picker as a Web Component. No dependencies.
   <calendar-wheel value="2026-11-09" sound></calendar-wheel>
   Events: "input" on every stop, "change" when the wheel settles. e.detail.date = "YYYY-MM-DD"
   Restyle with the CSS custom properties listed under :host. */
(() => {
  const SVGNS = "http://www.w3.org/2000/svg";
  const W = 720, H = 420;
  const CX = -70, CY = 210;            // the pivot sits off the card's left edge
  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  // inner → outer. The month ring repeats its labels so neighbours are always in view.
  const RINGS = [
    { key: "date",  n: 31, slots: 31, rIn: 175, rOut: 258, size: 26, pitch: 2600, label: s => String(s + 1) },
    { key: "month", n: 12, slots: 24, rIn: 258, rOut: 352, size: 26, pitch: 1800, label: s => MONTHS[s % 12] },
    { key: "year",  n: 0,  slots: 24, rIn: 352, rOut: 462, size: 26, pitch: 900,  label: () => "" },
  ];
  const DATE = 0, MONTH = 1, YEAR = 2;
  const R_HUB = RINGS[0].rIn, R_EDGE = 462;   // the card's curved edge sits over the outer rim
  const BAND = 46;
  const mod = (a, n) => ((a % n) + n) % n;
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  const rad = d => d * Math.PI / 180;
  const pol = (r, a) => [CX + r * Math.cos(rad(a)), CY + r * Math.sin(rad(a))];
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  let uid = 0;

  const CSS = `
    :host{
      --cw-card:#0e0f22; --cw-card-2:#5b4bd6; --cw-rim:#b4a7ff; --cw-card-ink:#eef0ff; --cw-card-muted:#8e93c4; --cw-edge:#2c2f5c;
      --cw-grad-a:#a78bfa; --cw-grad-b:#6366f1; --cw-grad-c:#22d3ee; --cw-shade:#000;
      --cw-ink:#ffffff; --cw-tick:#ffffff; --cw-glow:#c4b5fd; --cw-gloss:.16;
      --cw-band:#ffffff; --cw-band-fill:rgba(255,255,255,.14); --cw-alert:#ff6b8b;
      --cw-font:"Barlow Condensed","Oswald","Arial Narrow",sans-serif;
      --cw-display:"Instrument Serif",Georgia,serif;
      --cw-grain:.08; --cw-shadow:.7;
      display:block; position:relative; touch-action:none; user-select:none; -webkit-user-select:none;
    }
    svg{display:block;width:100%;height:auto}
    .lbl{font-family:var(--cw-font);font-weight:700;fill:var(--cw-ink);letter-spacing:.5px}
    .band{fill:var(--cw-band-fill);stroke:var(--cw-band);stroke-opacity:.75;stroke-width:1.5;transition:stroke .25s}
    .band.bad{stroke:var(--cw-alert);stroke-opacity:1}
    .notch{fill:var(--cw-band);transition:fill .25s}
    .notch.bad{fill:var(--cw-alert)}
    .grab{cursor:grab}.grabbing{cursor:grabbing}
    .spin{position:absolute;border-radius:8px;outline:none;pointer-events:none}
    .spin:focus-visible{box-shadow:0 0 0 2px var(--cw-band)}
    .wd{font-family:var(--cw-display);font-size:52px;fill:var(--cw-card-ink)}
    .full{font-family:Inter,system-ui,sans-serif;font-size:15px;fill:var(--cw-card-ink);opacity:.85}
  `;

  class CalendarWheel extends HTMLElement {
    static get observedAttributes() { return ["value"]; }
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._id = "cw" + (++uid);
      this._audio = null; this._lastTick = 0; this._drag = null; this._raf = 0;
      this._reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      this._build();
    }
    connectedCallback() {
      if (!this._init) this._setDate(this.getAttribute("value"), true);
      this._init = true; this._loop();
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); this._raf = 0; }
    attributeChangedCallback(n, o, v) { if (this._init && v && v !== this.value) this._setDate(v, false); }
    get value() { return this._iso(); }
    set value(v) { this.setAttribute("value", v); }

    /* ---------- drawing ---------- */
    _build() {
      const id = this._id, root = this.shadowRoot;
      root.innerHTML = `<style>${CSS}</style>`;
      const svg = this._svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Calendar wheel date picker" }, root);
      const defs = el("defs", {}, svg);
      const bx = CX + R_HUB + 4, bw = R_EDGE - R_HUB - 14, by = CY - BAND / 2;

      const clip = el("clipPath", { id: id + "c" }, defs); el("rect", { width: W, height: H, rx: 28 }, clip);
      const cardMask = el("mask", { id: id + "m" }, defs);
      el("rect", { width: W, height: H, fill: "#fff" }, cardMask);
      el("circle", { cx: CX, cy: CY, r: R_EDGE - 8, fill: "#000" }, cardMask);
      const dimMask = el("mask", { id: id + "d" }, defs);
      el("circle", { cx: CX, cy: CY, r: R_EDGE, fill: "#fff" }, dimMask);
      el("rect", { x: bx, y: by, width: bw, height: BAND, rx: 10, fill: "#000" }, dimMask);
      const sh = el("filter", { id: id + "s", x: "-10%", y: "-10%", width: "120%", height: "120%" }, defs);
      el("feDropShadow", { dx: -2, dy: 3, stdDeviation: 8, "flood-color": "#000", style: "flood-opacity:var(--cw-shadow)" }, sh);
      const blur = el("filter", { id: id + "b", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
      el("feGaussianBlur", { stdDeviation: 5 }, blur);
      const grain = el("filter", { id: id + "g" }, defs);
      el("feTurbulence", { type: "fractalNoise", baseFrequency: ".85", numOctaves: 2, seed: 7 }, grain);
      el("feColorMatrix", { values: "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" }, grain);
      const glow = el("radialGradient", { id: id + "l" }, defs);
      [0, 1].forEach(o => { const st = el("stop", { offset: o, "stop-opacity": 1 - o }, glow); st.style.stopColor = "var(--cw-glow)"; });
      const fade = el("linearGradient", { id: id + "f", x1: 0, y1: 0, x2: 0, y2: H, gradientUnits: "userSpaceOnUse" }, defs);
      [[0, .8], [.36, .4], [.5, .3], [.64, .4], [1, .8]].forEach(([o, a]) => {
        const st = el("stop", { offset: o, "stop-opacity": a }, fade); st.style.stopColor = "var(--cw-card)";
      });
      // one gradient for the whole wheel. Discs look the same at any angle, so only the labels rotate.
      const rg = el("linearGradient", { id: id + "r", x1: 0, y1: 0, x2: CX + R_EDGE, y2: H, gradientUnits: "userSpaceOnUse" }, defs);
      [["0", "a"], [".55", "b"], ["1", "c"]].forEach(([o, v]) => { const st = el("stop", { offset: o }, rg); st.style.stopColor = `var(--cw-grad-${v})`; });
      // the card glows from its bottom-right corner, with a lit rim
      const kg = el("radialGradient", { id: id + "k", cx: 1, cy: 1, r: 1 }, defs);
      [[0, .95], [.45, .35], [1, 0]].forEach(([o, a]) => { const st = el("stop", { offset: o, "stop-opacity": a }, kg); st.style.stopColor = "var(--cw-card-2)"; });
      const eg = el("linearGradient", { id: id + "e", x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
      [[0, 0], [.5, .12], [.8, .45], [1, 1]].forEach(([o, a]) => { const st = el("stop", { offset: o, "stop-opacity": a }, eg); st.style.stopColor = "var(--cw-rim)"; });
      const gl = el("filter", { id: id + "h", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
      el("feGaussianBlur", { stdDeviation: 30 }, gl);

      const g = el("g", { "clip-path": `url(#${id}c)` }, svg);
      el("rect", { width: W, height: H, style: "fill:var(--cw-card)" }, g);

      this._rings = [];
      for (let i = RINGS.length - 1; i >= 0; i--) {
        const R = RINGS[i], step = 360 / R.slots, rl = (R.rIn + R.rOut) / 2;
        const rDisc = i === RINGS.length - 1 ? R_EDGE + 20 : R.rOut;   // the outer disc runs on under the card
        if (i < RINGS.length - 1) el("circle", { cx: CX, cy: CY + 3, r: rDisc, fill: "#000", opacity: .45, filter: `url(#${id}b)` }, g);
        el("circle", { cx: CX, cy: CY, r: rDisc, fill: `url(#${id}r)` }, g);
        el("circle", { cx: CX, cy: CY, r: rDisc, style: "fill:var(--cw-shade)", opacity: [.16, .08, 0][i] }, g);
        el("circle", { cx: CX, cy: CY, r: rDisc - 1, fill: "none", stroke: "#fff", "stroke-opacity": .18, "stroke-width": 1.5 }, g);
        const grp = el("g", {}, g);
        const texts = [];
        for (let s = 0; s < R.slots; s++) {
          const a = s * step, [x, y] = pol(rl, a);
          const t = el("text", { x: x.toFixed(2), y: y.toFixed(2), class: "lbl", "font-size": R.size, "text-anchor": "middle",
            "dominant-baseline": "central", transform: `rotate(${a.toFixed(3)} ${x.toFixed(2)} ${y.toFixed(2)})`,
            style: "paint-order:stroke;stroke:rgba(0,0,0,.12);stroke-width:3px" }, grp);
          t.textContent = R.label(s); texts.push(t);
          const [x1, y1] = pol(R.rIn + 3, a + step / 2), [x2, y2] = pol(R.rIn + 10, a + step / 2);
          el("line", { x1, y1, x2, y2, style: "stroke:var(--cw-tick)", "stroke-width": 1.5, "stroke-linecap": "round", opacity: .4 }, grp);
        }
        this._rings[i] = { grp, texts, step, n: R.n, slots: R.slots, angle: 0, vel: 0, mode: "spring", target: 0, k: 0, user: false, settled: true };
      }
      // the hub: the centre of the wheel, engraved, so the whole left side is wheel
      el("circle", { cx: CX + 2, cy: CY + 4, r: R_HUB, fill: "#000", opacity: .5, filter: `url(#${id}b)` }, g);
      el("circle", { cx: CX, cy: CY, r: R_HUB, fill: `url(#${id}r)` }, g);
      el("circle", { cx: CX, cy: CY, r: R_HUB, style: "fill:var(--cw-shade)", opacity: .34 }, g);
      [R_HUB - 1, R_HUB - 22, R_HUB - 60, R_HUB - 100].forEach((r, j) =>
        el("circle", { cx: CX, cy: CY, r, fill: "none", stroke: "#fff", "stroke-opacity": j ? .07 : .2, "stroke-width": j ? 1 : 1.5 }, g));
      // light leaking into the band while a ring moves
      this._glows = RINGS.map(R => {
        const rl = (R.rIn + R.rOut) / 2;
        return el("ellipse", { cx: CX + rl, cy: CY, rx: (R.rOut - R.rIn) * .7, ry: 42, fill: `url(#${id}l)`, opacity: .1,
          style: "mix-blend-mode:screen", "pointer-events": "none" }, g);
      });
      el("ellipse", { cx: 150, cy: 20, rx: 260, ry: 130, fill: "#fff", filter: `url(#${id}h)`, style: "opacity:var(--cw-gloss);mix-blend-mode:soft-light", "pointer-events": "none" }, g);
      el("rect", { width: W, height: H, fill: `url(#${id}f)`, mask: `url(#${id}d)`, "pointer-events": "none" }, g);

      // the card, with a curved edge over the wheel's rim
      const card = el("g", { filter: `url(#${id}s)` }, g);
      el("rect", { width: W, height: H, style: "fill:var(--cw-card)", mask: `url(#${id}m)` }, card);
      el("rect", { width: W, height: H, fill: `url(#${id}k)`, mask: `url(#${id}m)` }, card);
      el("rect", { width: W, height: H, mask: `url(#${id}m)`, filter: `url(#${id}g)`, style: "opacity:var(--cw-grain);mix-blend-mode:overlay", "pointer-events": "none" }, g);
      el("circle", { cx: CX, cy: CY, r: R_EDGE - 8, fill: "none", style: "stroke:var(--cw-edge)", "stroke-width": 2 }, g);

      // the selection band, with a notch at each end
      this._band = el("rect", { x: bx, y: by, width: bw, height: BAND, rx: 10, class: "band" }, g);
      const lx = bx - 5, rx = bx + bw + 5;
      this._notches = [
        el("path", { d: `M${lx - 10} ${CY - 8}L${lx} ${CY}L${lx - 10} ${CY + 8}Z`, class: "notch" }, g),
        el("path", { d: `M${rx + 10} ${CY - 8}L${rx} ${CY}L${rx + 10} ${CY + 8}Z`, class: "notch" }, g),
      ];
      // readout: the weekday is worked out for you
      this._wd = el("text", { x: 676, y: 214, class: "wd", "text-anchor": "end" }, g);
      this._full = el("text", { x: 676, y: 248, class: "full", "text-anchor": "end" }, g);
      el("rect", { x: .75, y: .75, width: W - 1.5, height: H - 1.5, rx: 27.5, fill: "none", stroke: "#fff", "stroke-opacity": .05, "stroke-width": 1.5 }, svg);
      el("rect", { x: .75, y: .75, width: W - 1.5, height: H - 1.5, rx: 27.5, fill: "none", stroke: `url(#${id}e)`, "stroke-width": 1.5 }, svg);

      // keyboard / screen-reader control over each ring's part of the band
      this._spins = RINGS.map((R, i) => {
        const b = document.createElement("div");
        b.className = "spin"; b.tabIndex = 0; b.setAttribute("role", "spinbutton"); b.setAttribute("aria-label", R.key);
        const x0 = CX + R.rIn, x1 = Math.min(CX + R.rOut, bx + bw);
        Object.assign(b.style, { left: (x0 / W * 100) + "%", width: ((x1 - x0) / W * 100) + "%", top: (by / H * 100) + "%", height: (BAND / H * 100) + "%" });
        b.addEventListener("keydown", e => {
          const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: 5, PageUp: -5 }[e.key];
          if (!d) return; e.preventDefault(); this._nudge(i, d);
        });
        root.appendChild(b); return b;
      });

      svg.addEventListener("pointerdown", e => this._down(e));
      svg.addEventListener("pointermove", e => this._move(e));
      svg.addEventListener("pointerup", e => this._up(e));
      svg.addEventListener("pointercancel", e => this._up(e));
      svg.addEventListener("wheel", e => {
        const i = this._hit(this._pt(e)); if (i < 0) return;
        e.preventDefault();
        const now = performance.now(); if (now - (this._lastWheel || 0) < 60) return; this._lastWheel = now;
        this._nudge(i, (e.deltaY || e.deltaX) > 0 ? 1 : -1);
      }, { passive: false });
    }
    _yearLabels() {
      const r = this._rings[YEAR], k = r.k, n = r.slots;
      r.texts.forEach((t, s) => { const ks = k + (mod(s - k + n / 2, n) - n / 2); const v = String(this._yBase + ks); if (t.textContent !== v) t.textContent = v; });
    }

    /* ---------- model ---------- */
    // a ring under the finger (or coasting) is read from where it is; otherwise from where it is going
    _kOf(i) { const r = this._rings[i]; return r.mode === "drag" || r.mode === "free" ? r.k : r.target; }
    _ymd() {
      const y = this._yBase + this._kOf(YEAR), m = mod(this._kOf(MONTH), 12), d = mod(this._kOf(DATE), 31) + 1;
      return { y, m, d, ok: d <= dim(y, m) };
    }
    _iso() { const { y, m, d } = this._ymd(); return `${y}-${String(m + 1).padStart(2, "0")}-${String(Math.min(d, dim(y, m))).padStart(2, "0")}`; }
    _setDate(iso, instant) {
      let d = iso ? new Date(iso + "T00:00:00") : new Date();
      if (isNaN(d)) d = new Date();
      if (instant) this._yBase = d.getFullYear();
      const near = (r, v) => r.n ? r.target + (mod(v - mod(r.target, r.n) + Math.floor(r.n / 2), r.n) - Math.floor(r.n / 2)) : v;
      const set = (i, v) => {
        const r = this._rings[i], k = instant ? v : near(r, v);
        r.target = k; r.mode = "spring"; r.user = false; r.settled = false;
        if (instant) { r.k = k; r.angle = -k * r.step; r.vel = 0; }
      };
      set(YEAR, d.getFullYear() - this._yBase); set(MONTH, d.getMonth()); set(DATE, d.getDate() - 1);
      this._yearLabels(); this._dirty = !instant; this._render();   // no "change" for the initial value
    }
    _render() {
      const { y, m, d, ok } = this._ymd();
      const dd = Math.min(d, dim(y, m)), wd = new Date(y, m, dd).getDay();
      this._wd.textContent = ok ? DAY_NAMES[wd] : "No such day";
      this._full.textContent = ok ? `${d} ${MONTH_NAMES[m]} ${y}` : `${MONTH_NAMES[m]} ${y} has ${dim(y, m)} days`;
      [this._band, ...this._notches].forEach(n => n.classList.toggle("bad", !ok));
      const vals = [String(d), MONTH_NAMES[m], String(y)];
      this._spins.forEach((s, i) => s.setAttribute("aria-valuetext", vals[i]));
    }
    _emit(type) { this.dispatchEvent(new CustomEvent(type, { detail: { date: this._iso() }, bubbles: true })); }
    _drive(i, delta) {                     // move a ring the user isn't holding
      const r = this._rings[i]; if (!delta) return;
      const before = r.target; r.target += delta;
      if (!(this._drag && this._drag.i === i)) { r.mode = "spring"; r.settled = false; }
      if (i === MONTH) this._drive(YEAR, Math.floor(r.target / 12) - Math.floor(before / 12));
    }
    _roll(i, from, to) {                   // carry over into the next ring
      if (i === DATE) this._drive(MONTH, Math.floor(to / 31) - Math.floor(from / 31));
      if (i === MONTH) this._drive(YEAR, Math.floor(to / 12) - Math.floor(from / 12));
    }
    _nudge(i, d) {
      this._ensureAudio();
      const r = this._rings[i], from = this._kOf(i);         // stack quick presses on the pending target
      r.user = true; r.target = from + d; r.mode = "spring"; r.settled = false;
      this._roll(i, from, from + d);
      this._dirty = true; this._render(); this._emit("input");
    }
    _onDetent(i, from, to) {
      const r = this._rings[i], held = this._drag && this._drag.i === i;
      this._tick(i, r.user || held);
      if (i === YEAR) this._yearLabels();
      if (held || r.mode === "free") { this._roll(i, from, to); this._dirty = true; this._render(); this._emit("input"); }
    }

    /* ---------- input ---------- */
    _pt(e) { const p = this._svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(this._svg.getScreenCTM().inverse()); }
    _hit(p) {
      const d = Math.hypot(p.x - CX, p.y - CY);
      if (d < R_HUB - 4 || d > R_EDGE - 4) return -1;
      return RINGS.findIndex((R, i) => d < R.rOut || i === RINGS.length - 1);
    }
    _ang(p) { return Math.atan2(p.y - CY, p.x - CX) * 180 / Math.PI; }
    _down(e) {
      if (this._drag) return;
      const p = this._pt(e), i = this._hit(p); if (i < 0) return;
      e.preventDefault(); this._ensureAudio();
      this._svg.setPointerCapture(e.pointerId);
      const r = this._rings[i];
      r.user = true; r.target = r.k; r.mode = "drag"; r.vel = 0; r.settled = false;
      this._drag = { i, id: e.pointerId, last: this._ang(p), t: performance.now() };
      this._svg.classList.add("grabbing");
    }
    _move(e) {
      const p = this._pt(e);
      if (!this._drag) { this._svg.classList.toggle("grab", this._hit(p) >= 0); return; }
      if (e.pointerId !== this._drag.id) return;
      const D = this._drag, r = this._rings[D.i], a = this._ang(p), now = performance.now();
      let da = a - D.last; if (da > 180) da -= 360; if (da < -180) da += 360;
      D.last = a; const dt = Math.max(8, now - D.t); D.t = now;
      r.angle += da; r.vel = r.vel * .6 + (da / dt * 1000) * .4;
    }
    _up(e) {
      const D = this._drag; if (!D || e.pointerId !== D.id) return;
      const r = this._rings[D.i];
      this._drag = null; this._svg.classList.remove("grabbing");
      if (Math.abs(r.vel) > 90 && !this._reduced) r.mode = "free";
      else { r.mode = "spring"; r.target = Math.round(-r.angle / r.step); }
    }

    /* ---------- physics ---------- */
    _loop() {
      let last = performance.now();
      const frame = now => {
        const dt = Math.min(.033, (now - last) / 1000); last = now;
        const K = this._reduced ? 900 : 320, C = this._reduced ? 60 : 22;
        this._rings.forEach((r, i) => {
          if (r.mode === "free") {
            r.angle += r.vel * dt; r.vel *= Math.exp(-3.2 * dt);
            if (Math.abs(r.vel) < 70) { r.mode = "spring"; r.target = Math.round(-r.angle / r.step - Math.sign(r.vel) * .3); }
          } else if (r.mode === "spring") {
            const goal = -r.target * r.step;
            r.vel += (-K * (r.angle - goal) - C * r.vel) * dt; r.angle += r.vel * dt;
            if (!r.settled && Math.abs(r.angle - goal) < .02 && Math.abs(r.vel) < .5) {
              r.angle = goal; r.vel = 0; r.settled = true; r.user = false; this._afterSettle();
            }
          }
          const k = Math.round(-r.angle / r.step);
          if (k !== r.k) { const from = r.k; r.k = k; this._onDetent(i, from, k); }
          r.grp.setAttribute("transform", `rotate(${r.angle.toFixed(3)} ${CX} ${CY})`);
          this._glows[i].setAttribute("opacity", (.1 + Math.min(.75, Math.abs(r.vel) / 160)).toFixed(3));
        });
        this._raf = requestAnimationFrame(frame);
      };
      if (!this._raf) this._raf = requestAnimationFrame(frame);
    }
    _afterSettle() {
      if (this._drag) return;
      if (!this._rings.every(r => r.settled)) return;
      const { y, m, d, ok } = this._ymd();
      this._render();
      if (!ok) { this._drive(DATE, -(d - dim(y, m))); this._dirty = true; return; }   // no 31 June: it slides back
      if (this._dirty) { this._dirty = false; this._emit("change"); }
    }

    /* ---------- sound ---------- */
    _ensureAudio() {
      if (this._audio || !this.hasAttribute("sound")) return;
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try {
        const ctx = new AC(), len = Math.floor(ctx.sampleRate * .03), buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
        this._audio = { ctx, buf };
      } catch (_) {}
    }
    _tick(i, loud) {
      const now = performance.now();
      if (loud && navigator.vibrate) try { navigator.vibrate(4); } catch (_) {}
      if (!this._audio || !this.hasAttribute("sound") || now - this._lastTick < 22) return;
      this._lastTick = now;
      const { ctx, buf } = this._audio; if (ctx.state === "suspended") ctx.resume();
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = buf; f.type = "bandpass"; f.frequency.value = RINGS[i].pitch; f.Q.value = 4;
      g.gain.value = loud ? .5 : .16;
      s.connect(f).connect(g).connect(ctx.destination); s.start();
    }
  }
  if (!customElements.get("calendar-wheel")) customElements.define("calendar-wheel", CalendarWheel);
})();
