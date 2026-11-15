// The interaction-net view: draws the graphs of `mimic net show --json`
// and plays the rounds of `mimic net trace --json`.
// Nodes are triangles whose top corner is the principal port (nullary nodes
// are circles); a wire between two principal ports is an active pair.
(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const svgNS = "http://www.w3.org/2000/svg";
  const COLORS = { con: "#4FC1FF", dup: "#E8A33D", era: "#8A8A8A", num: "#89D185", ref: "#C586C0", opr: "#DCDCAA", swi: "#F48771", root: "#FFFFFF" };
  const ABOUT = {
    con: "constructor: a function (argument, result) or a pair",
    dup: "duplicator: shares a value between two uses",
    era: "eraser: a value nobody uses",
    num: "number",
    ref: "reference to a definition, expanded when something meets it",
    opr: "operator: waits for numbers on its principal port and port 1",
    swi: "switch: picks a branch when a number arrives",
    root: "where the result comes out",
  };
  const R = 20;

  /** What goes inside a node (short), and beside it (long). */
  function labels(nd) {
    const l = nd.label;
    if (nd.kind === "opr") {
      const op = l.slice(1);
      if (op.startsWith("check")) return ["✓", "type check"];
      return op.length <= 3 ? [op, ""] : ["$", op];
    }
    if (nd.kind === "ref") return ["@", l];
    if (nd.kind === "num") return l.length <= 4 ? [l.slice(1) || l, ""] : ["#", l];
    if (nd.kind === "dup") return [l === "{ }" ? "δ" : l, ""];
    if (nd.kind === "con") return ["λ", ""];
    if (nd.kind === "era") return ["ε", ""];
    if (nd.kind === "swi") return ["?", ""];
    return [l, ""];
  }

  let data = null; // show --json
  let fnIndex = 0;
  let defIndex = 0;
  let trace = null; // trace --json
  let frame = 0;
  let playing = null;
  let positions = new Map(); // key → {x, y}
  let view = { x: 0, y: 0, w: 800, h: 600 };
  let userView = false; // zoomed or moved by hand: frames keep that view

  // ---- the list of nets ---------------------------------------------------------

  function functions() {
    if (!data) return [];
    if (data.functions) return data.functions;
    // a .mnet file: one entry with every definition
    return [{ function: data.file.split(/[\\/]/).pop(), defs: data.defs, nodes: data.defs.reduce((a, d) => a + d.nodes, 0) }];
  }

  function current() {
    const f = functions()[fnIndex];
    return f && f.defs[defIndex];
  }

  function renderPicker() {
    const fs = functions();
    const sel = $("fn");
    sel.innerHTML = "";
    fs.forEach((f, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = f.function + (f.entered === false ? "  (leaf)" : "");
      sel.appendChild(o);
    });
    sel.value = fnIndex;
    const f = fs[fnIndex];
    const tabs = $("defs");
    tabs.innerHTML = "";
    if (!f) {
      $("info").textContent = data && data.functions ? "No function of this program is compiled to an interaction net: only pure functions on numbers are." : "";
      return;
    }
    f.defs.forEach((d, i) => {
      const b = document.createElement("button");
      b.className = "tab" + (i === defIndex ? " on" : "");
      b.textContent = "@" + d.def + " (" + d.nodes + ")";
      b.title = d.text;
      b.onclick = () => {
        defIndex = i;
        stopTrace();
        renderPicker();
        drawGraph(current().graph, true);
      };
      tabs.appendChild(b);
    });
    const before = f.nodes_before != null && f.nodes_before !== f.nodes ? `, ${f.nodes_before} before compile-time reduction` : "";
    const where = f.location ? `${f.location.file}:${f.location.line}` : "";
    const entered = f.entered === true ? "Native code enters it through the net: independent calls inside run in parallel." : f.entered === false ? "Called from native code it runs natively (nothing to run side by side); from nets it is a reference." : "";
    $("info").innerHTML = "";
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = where;
    a.onclick = (e) => {
      e.preventDefault();
      vscode.postMessage({ type: "open", location: f.location });
    };
    $("info").append(`${f.nodes} nodes${before}. ${entered} `, a);
    $("text").textContent = current() ? current().text : "";
    $("traceFn").textContent = data.functions ? f.function + "(" : "@main";
    $("args").style.display = data.functions ? "" : "none";
    $("close").style.display = data.functions ? "" : "none";
  }

  // ---- layout ----------------------------------------------------------------------

  function layout(g, keep) {
    const n = g.nodes.length;
    const adj = g.nodes.map(() => []);
    for (const w of g.wires) {
      adj[w.a[0]].push(w.b[0]);
      adj[w.b[0]].push(w.a[0]);
    }
    const pos = new Array(n);
    // start: what is known from the last frame, else by depth from the root
    const depth = new Array(n).fill(-1);
    const start = g.root != null ? g.root : 0;
    const queue = [start];
    if (n) depth[start] = 0;
    const order = [];
    while (queue.length) {
      const i = queue.shift();
      order.push(i);
      for (const j of adj[i]) if (depth[j] < 0) {
        depth[j] = depth[i] + 1;
        queue.push(j);
      }
    }
    for (let i = 0; i < n; i++) if (depth[i] < 0) { depth[i] = 0; order.push(i); }
    const perRow = new Map();
    for (const i of order) {
      const known = keep && positions.get(g.nodes[i].key);
      if (known) { pos[i] = { x: known.x, y: known.y, fixed: true }; continue; }
      const nb = adj[i].map((j) => keep && positions.get(g.nodes[j].key)).find(Boolean);
      const k = perRow.get(depth[i]) || 0;
      perRow.set(depth[i], k + 1);
      pos[i] = nb ? { x: nb.x + (Math.random() - 0.5) * 40, y: nb.y + 50 } : { x: k * 60 - (order.length > 12 ? 160 : 0), y: depth[i] * 64 };
    }
    // forces: wires pull, nodes push apart, children sit below
    const iters = keep ? 60 : 300;
    for (let it = 0; it < iters; it++) {
      const t = 1 - it / iters;
      const f = pos.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = Math.random(); dy = Math.random(); d2 = 1; }
          if (d2 > 40000) continue;
          const k = 500 / d2;
          f[i].x += dx * k; f[i].y += dy * k; f[j].x -= dx * k; f[j].y -= dy * k;
        }
      for (const w of g.wires) {
        const i = w.a[0], j = w.b[0];
        const dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const k = (d - 56) * 0.12;
        f[i].x += (dx / d) * k; f[i].y += (dy / d) * k; f[j].x -= (dx / d) * k; f[j].y -= (dy / d) * k;
        // an aux port's node sits below the principal port's node
        if (w.a[1] === 0 && w.b[1] !== 0) f[i].y += 1.5;
        if (w.b[1] === 0 && w.a[1] !== 0) f[j].y += 1.5;
      }
      for (let i = 0; i < n; i++) {
        const damp = pos[i].fixed ? 0.15 : 1;
        pos[i].x += Math.max(-20, Math.min(20, f[i].x)) * t * damp;
        pos[i].y += Math.max(-20, Math.min(20, f[i].y)) * t * damp;
      }
    }
    for (let i = 0; i < n; i++) positions.set(g.nodes[i].key, pos[i]);
    return pos;
  }

  function portXY(p, node, port) {
    if (node.kind === "con" || node.kind === "dup" || node.kind === "opr" || node.kind === "swi") {
      if (port === 0) return { x: p.x, y: p.y - R, dx: 0, dy: -1 };
      if (port === 1) return { x: p.x - R * 0.87, y: p.y + R * 0.5, dx: -0.3, dy: 1 };
      return { x: p.x + R * 0.87, y: p.y + R * 0.5, dx: 0.3, dy: 1 };
    }
    return { x: p.x, y: p.y - R * 0.6, dx: 0, dy: -1 };
  }

  // ---- drawing -----------------------------------------------------------------------

  function el(name, attrs, parent) {
    const e = document.createElementNS(svgNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function drawGraph(g, fresh) {
    const svg = $("graph");
    svg.innerHTML = "";
    if (!g) return;
    if (fresh) positions = new Map();
    const pos = layout(g, !fresh);
    const wires = el("g", {}, svg);
    const nodes = el("g", {}, svg);
    g.wires.forEach((w) => {
      const a = g.nodes[w.a[0]], b = g.nodes[w.b[0]];
      const pa = portXY(pos[w.a[0]], a, w.a[1]), pb = portXY(pos[w.b[0]], b, w.b[1]);
      const c = 30;
      const d = `M${pa.x},${pa.y} C${pa.x + pa.dx * c},${pa.y + pa.dy * c} ${pb.x + pb.dx * c},${pb.y + pb.dy * c} ${pb.x},${pb.y}`;
      el("path", { d, class: w.active ? "wire active" : "wire" }, wires);
    });
    g.nodes.forEach((nd, i) => {
      const p = pos[i];
      const grp = el("g", { class: "node", transform: `translate(${p.x},${p.y})` }, nodes);
      const color = COLORS[nd.kind] || "#ccc";
      if (["con", "dup", "opr", "swi"].includes(nd.kind)) {
        el("polygon", { points: `0,${-R} ${-R * 0.87},${R * 0.5} ${R * 0.87},${R * 0.5}`, fill: color, class: "shape" }, grp);
        el("circle", { cx: 0, cy: -R, r: 3, class: "principal" }, grp);
      } else if (nd.kind === "root") {
        el("rect", { x: -26, y: -11, width: 52, height: 22, rx: 4, fill: "none", stroke: color, class: "shape" }, grp);
      } else {
        el("circle", { cx: 0, cy: 0, r: R * 0.6, fill: color, class: "shape" }, grp);
      }
      const [inside, beside] = labels(nd);
      const t = el("text", { x: 0, y: nd.kind === "root" ? 4 : ["con", "dup", "opr", "swi"].includes(nd.kind) ? 7 : 4, "text-anchor": "middle", class: "label" + (nd.kind === "root" ? " light" : "") }, grp);
      t.textContent = inside;
      if (beside) {
        const b = el("text", { x: R * 0.9 + 3, y: 4, class: "side" }, grp);
        b.textContent = beside.length > 22 ? beside.slice(0, 21) + "…" : beside;
      }
      const tip = el("title", {}, grp);
      tip.textContent = `${nd.label}: ${ABOUT[nd.kind] || nd.kind}\nfrom @${nd.def}${nd.kind === "ref" ? "\n(click: show this definition)" : "\n(click: the code)"}`;
      grp.addEventListener("click", () => clickNode(nd));
    });
    if (fresh || !userView) fit(pos);
    applyView();
    $("count").textContent = `${g.nodes.length} nodes, ${g.wires.filter((w) => w.active).length} active pair(s)`;
  }

  function clickNode(nd) {
    if (nd.kind === "ref") {
      const name = nd.label.slice(1);
      const fs = functions();
      for (let i = 0; i < fs.length; i++) {
        const k = fs[i].defs.findIndex((d) => d.def === name);
        if (k >= 0) {
          fnIndex = i;
          defIndex = k;
          stopTrace();
          renderPicker();
          drawGraph(current().graph, true);
          return;
        }
      }
    }
    // the function the node came from
    const f = functions().find((x) => x.def && (nd.def === x.def || nd.def.startsWith(x.def + ".")));
    if (f && f.location) vscode.postMessage({ type: "open", location: f.location });
  }

  function fit(pos) {
    if (!pos.length) return;
    const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y);
    const minX = Math.min(...xs) - 50, maxX = Math.max(...xs) + 50, minY = Math.min(...ys) - 50, maxY = Math.max(...ys) + 50;
    view = { x: minX, y: minY, w: Math.max(200, maxX - minX), h: Math.max(150, maxY - minY) };
  }

  function applyView() {
    $("graph").setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  }

  // zoom and pan
  const svg = () => $("graph");
  window.addEventListener("load", () => {
    svg().addEventListener("wheel", (e) => {
      e.preventDefault();
      const k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const r = svg().getBoundingClientRect();
      const mx = view.x + ((e.clientX - r.left) / r.width) * view.w, my = view.y + ((e.clientY - r.top) / r.height) * view.h;
      view = { x: mx - (mx - view.x) * k, y: my - (my - view.y) * k, w: view.w * k, h: view.h * k };
      userView = true;
      applyView();
    }, { passive: false });
    let drag = null;
    svg().addEventListener("mousedown", (e) => (drag = { x: e.clientX, y: e.clientY, v: { ...view } }));
    window.addEventListener("mouseup", () => (drag = null));
    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      const r = svg().getBoundingClientRect();
      view = { ...drag.v, x: drag.v.x - ((e.clientX - drag.x) / r.width) * drag.v.w, y: drag.v.y - ((e.clientY - drag.y) / r.height) * drag.v.h };
      userView = true;
      applyView();
    });
  });

  // ---- tracing ------------------------------------------------------------------------

  function stopTrace() {
    if (playing) clearInterval(playing);
    playing = null;
    trace = null;
    $("traceOut").style.display = "none";
  }

  function showTrace(t) {
    trace = t;
    frame = 0;
    $("traceOut").style.display = "";
    const stopped = t.stopped ? ` (${t.stopped})` : "";
    $("summary").textContent = `${t.call} = ${t.result != null ? t.result : "(not a number)"}${stopped}: ${t.interactions} interactions in ${t.rounds} rounds, ${t.average.toFixed(1)} at once on average, ${t.widest} at the widest.`;
    $("rules").textContent = Object.entries(t.rules).map(([k, v]) => `${k} ${v}`).join(" · ");
    drawChart(t);
    const nf = t.frames.length;
    $("slider").max = Math.max(0, nf - 1);
    $("slider").value = 0;
    $("player").style.display = nf ? "" : "none";
    $("frameNote").textContent = nf ? (nf < t.rounds + 1 ? `The net is drawn for the first ${nf} rounds (while it is small); the chart covers all of them.` : "") : "The net grew too large to draw every round; the chart covers all of them. Trace a smaller call to watch it.";
    if (nf) showFrame(0, true);
  }

  function drawChart(t) {
    const c = $("chart");
    c.innerHTML = "";
    const steps = t.steps;
    const w = 600, h = 120;
    c.setAttribute("viewBox", `0 0 ${w} ${h + 18}`);
    const max = Math.max(1, ...steps.map((s) => s.redexes));
    const bw = w / Math.max(1, steps.length);
    steps.forEach((s, i) => {
      const bh = (s.redexes / max) * h;
      const r = el("rect", { x: i * bw, y: h - bh, width: Math.max(0.5, bw - (bw > 3 ? 1 : 0)), height: Math.max(0.5, bh), class: "bar", "data-i": i }, c);
      const tip = el("title", {}, r);
      const round = i * t.steps_per_point;
      tip.textContent = `round ${round}${t.steps_per_point > 1 ? `–${round + t.steps_per_point - 1}` : ""}: ${s.redexes} redexes at once, ${s.nodes} nodes`;
      r.addEventListener("click", () => {
        if (trace && trace.frames.length) showFrame(Math.min(trace.frames.length - 1, round));
      });
    });
    const lbl = el("text", { x: 0, y: h + 14, class: "axis" }, c);
    lbl.textContent = `redexes per round (max ${max})${t.steps_per_point > 1 ? `, each bar the widest of ${t.steps_per_point} rounds` : ""}`;
    el("rect", { id: "cursor", x: 0, y: 0, width: Math.max(1, bw), height: h, class: "cursor" }, c);
  }

  function showFrame(i, fresh) {
    if (!trace || !trace.frames.length) return;
    frame = Math.max(0, Math.min(trace.frames.length - 1, i));
    $("slider").value = frame;
    $("roundNo").textContent = `round ${frame} of ${trace.rounds}`;
    drawGraph(trace.frames[frame], !!fresh);
    const cur = $("cursor");
    if (cur) {
      const bw = 600 / Math.max(1, trace.steps.length);
      cur.setAttribute("x", Math.floor(frame / trace.steps_per_point) * bw);
    }
  }

  function play() {
    if (playing) {
      clearInterval(playing);
      playing = null;
      $("play").textContent = "▶";
      return;
    }
    $("play").textContent = "⏸";
    playing = setInterval(() => {
      if (!trace || frame >= trace.frames.length - 1) {
        clearInterval(playing);
        playing = null;
        $("play").textContent = "▶";
        return;
      }
      showFrame(frame + 1);
    }, 700);
  }

  // ---- export -------------------------------------------------------------------------

  function exportSvg() {
    const g = $("graph").cloneNode(true);
    g.setAttribute("xmlns", svgNS);
    const style = document.createElementNS(svgNS, "style");
    style.textContent = ".wire{fill:none;stroke:#888;stroke-width:1.5}.wire.active{stroke:#E24B04;stroke-width:3}.label{font:11px sans-serif;fill:#111}.label.light{fill:#ddd}.principal{fill:#111}";
    g.insertBefore(style, g.firstChild);
    vscode.postMessage({ type: "export", svg: new XMLSerializer().serializeToString(g), name: (current() ? current().def : "net") + (trace ? `-round${frame}` : "") });
  }

  /** The rounds drawn so far as one SVG that plays them (0.7 s each). */
  function exportAnimation() {
    if (!trace || !trace.frames.length) return;
    const keep = frame;
    const groups = [];
    let box = null;
    const step = 0.7;
    for (let i = 0; i < trace.frames.length; i++) {
      showFrame(i, i === 0);
      const v = { ...view };
      box = box ? { x: Math.min(box.x, v.x), y: Math.min(box.y, v.y), r: Math.max(box.r, v.x + v.w), b: Math.max(box.b, v.y + v.h) } : { x: v.x, y: v.y, r: v.x + v.w, b: v.y + v.h };
      const last = i === trace.frames.length - 1;
      const anim = `<set attributeName="visibility" to="visible" begin="${(i * step).toFixed(2)}s"${last ? ' fill="freeze"' : ` dur="${step}s"`}/>`;
      groups.push(`<g visibility="hidden">${anim}${$("graph").innerHTML}<text x="${v.x + 8}" y="${v.y + 16}" class="round">round ${i} of ${trace.rounds}</text></g>`);
    }
    showFrame(keep);
    const style = ".wire{fill:none;stroke:#888;stroke-width:1.5}.wire.active{stroke:#E24B04;stroke-width:3}.label{font:600 12px sans-serif;fill:#111}.label.light{fill:#ddd}.side{font:11px monospace;fill:#ccc}.principal{fill:#111}.round{font:12px sans-serif;fill:#aaa}";
    const svgText = `<svg xmlns="${svgNS}" viewBox="${box.x} ${box.y} ${box.r - box.x} ${box.b - box.y}" style="background:#1e1e1e"><style>${style}</style>${groups.join("")}</svg>`;
    vscode.postMessage({ type: "export", svg: svgText, name: `${current() ? current().def : "net"}-trace` });
  }

  // ---- wiring up -----------------------------------------------------------------------

  window.addEventListener("load", () => {
    $("fn").onchange = () => {
      fnIndex = Number($("fn").value);
      defIndex = 0;
      stopTrace();
      renderPicker();
      drawGraph(current() && current().graph, true);
    };
    $("before").onchange = () => vscode.postMessage({ type: "before", value: $("before").checked });
    $("trace").onclick = () => {
      const f = functions()[fnIndex];
      vscode.postMessage({ type: "trace", fn: data.functions ? f.function : null, args: $("args").value, before: $("before").checked });
      $("summary").textContent = "tracing…";
      $("traceOut").style.display = "";
    };
    $("args").addEventListener("keydown", (e) => e.key === "Enter" && $("trace").click());
    $("play").onclick = play;
    $("prev").onclick = () => showFrame(frame - 1);
    $("next").onclick = () => showFrame(frame + 1);
    $("first").onclick = () => showFrame(0);
    $("last").onclick = () => showFrame(trace ? trace.frames.length - 1 : 0);
    $("slider").oninput = () => showFrame(Number($("slider").value));
    $("export").onclick = exportSvg;
    $("exportAnim").onclick = exportAnimation;
    $("fitBtn").onclick = () => {
      userView = false;
      const g = trace && trace.frames.length ? trace.frames[frame] : current() && current().graph;
      if (g) drawGraph(g, true);
    };
    vscode.postMessage({ type: "ready" });
  });

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (m.type === "show") {
      data = m.data;
      const fs = functions();
      fnIndex = 0;
      if (m.focus) {
        const i = fs.findIndex((f) => f.function === m.focus || f.function.endsWith("::" + m.focus));
        if (i >= 0) fnIndex = i;
      }
      defIndex = 0;
      $("before").checked = !!data.before;
      stopTrace();
      renderPicker();
      drawGraph(current() && current().graph, true);
    } else if (m.type === "trace") {
      showTrace(m.data);
    } else if (m.type === "error") {
      $("summary").textContent = m.message;
      $("traceOut").style.display = "";
    }
  });
})();
