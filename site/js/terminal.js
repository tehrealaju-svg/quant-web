// Quant trading terminal — shared by the website and the Windows app (plain script, no imports).
//   QTerminal.mount(el, backend, opts)
// backend: { markets(sort), history(id), trades(id), portfolio(), quote(id, side, amount),
//            swap(id, side, amount, slippagePct), prefGet(k), prefSet(k, v), toast(msg) }
// Layout: explore (top-left) · candles (bottom-left) · trades (bottom-middle) · portfolio (right).
// Splitters are draggable; sizes are remembered.
(function () {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function fmt(x, max = 2) {
    x = +x; if (!isFinite(x)) return "–"; if (x === 0) return "0";
    const a = Math.abs(x);
    if (a < 1) return x.toFixed(Math.min(10, 3 - Math.floor(Math.log10(a)))).replace(/0+$/, "");
    if (a >= 1e9) return (x / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return (x / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return (x / 1e3).toFixed(2) + "K";
    return x.toLocaleString(undefined, { maximumFractionDigits: max });
  }
  const age = (t) => { if (!t) return "–"; const s = Date.now() / 1000 - t; return s < 3600 ? Math.max(1, Math.round(s / 60)) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : s < 86400 * 30 ? Math.round(s / 86400) + "d" : Math.round(s / 86400 / 30) + "mo"; };
  const pct = (v) => `<span class="${v >= 0 ? "up" : "down"}">${v >= 0 ? "↑" : "↓"} ${fmt(Math.abs(v), 1)}%</span>`;
  function icon(t) {
    if (/^https:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(t.uri || "")) return `<span class="token-icon sm"><img src="${esc(t.uri)}" alt="" referrerpolicy="no-referrer"></span>`;
    let h = 0; for (const c of t.id || t.ticker) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return `<span class="token-icon sm" style="background:hsl(${h % 360} 70% 45%)">${esc((t.ticker || "?").slice(0, 3))}</span>`;
  }
  function spark(v) {
    if (!v || v.length < 2) return `<svg class="spark" viewBox="0 0 60 20"></svg>`;
    const lo = Math.min(...v), hi = Math.max(...v), up = v[v.length - 1] >= v[0];
    const d = v.map((p, i) => `${i ? "L" : "M"}${(i / (v.length - 1)) * 60},${18 - ((p - lo) / (hi - lo || 1)) * 16}`).join("");
    return `<svg class="spark" viewBox="0 0 60 20"><path d="${d}" fill="none" stroke="${up ? "var(--up)" : "var(--down)"}" stroke-width="1.5"/></svg>`;
  }

  // ---------------------------------------------------------------- candles
  const FRAMES = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "D": 86400 };
  // Pool history is one price per block that touched the pool; trades give the volume.
  function buildCandles(points, trades, frame) {
    const sec = FRAMES[frame], out = [];
    let prev = null;
    for (const p of points) {
      const t = Math.floor(p.time / sec) * sec, price = p.price_qnt;
      let c = out[out.length - 1];
      if (!c || c.t !== t) {
        c = { t, o: prev ?? price, h: Math.max(prev ?? price, price), l: Math.min(prev ?? price, price), c: price, v: 0 };
        out.push(c);
      } else { c.h = Math.max(c.h, price); c.l = Math.min(c.l, price); c.c = price; }
      prev = price;
    }
    const byT = new Map(out.map((c) => [c.t, c]));
    for (const tr of trades) { const c = byT.get(Math.floor(tr.time / sec) * sec); if (c) c.v += +tr.qnt; }
    return out;
  }
  function drawCandles(canvas, candles, hover) {
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext("2d"); g.scale(dpr, dpr);
    const css = getComputedStyle(canvas);
    const col = (n) => css.getPropertyValue(n).trim();
    g.clearRect(0, 0, W, H);
    if (!candles.length) { g.fillStyle = col("--faint"); g.font = "13px Inter, sans-serif"; g.fillText("No trades yet", 16, 24); return null; }
    const axisW = 78, volH = Math.max(30, H * 0.16), padT = 26, chartH = H - volH - padT - 18;
    const n = Math.max(20, Math.min(candles.length, Math.floor((W - axisW) / 7)));
    const vis = candles.slice(-n), cw = (W - axisW) / n;
    let lo = Math.min(...vis.map((c) => c.l)), hi = Math.max(...vis.map((c) => c.h));
    if (hi === lo) { hi *= 1.01; lo *= 0.99; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const Y = (p) => padT + (1 - (p - lo) / (hi - lo)) * chartH;
    const vmax = Math.max(...vis.map((c) => c.v), 1e-12);
    // grid + price axis
    g.strokeStyle = col("--line"); g.fillStyle = col("--faint"); g.font = "11px Inter, sans-serif"; g.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const p = lo + ((hi - lo) * i) / 5, y = Y(p);
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W - axisW, y + 0.5); g.stroke();
      g.fillText(fmt(p, 8), W - axisW + 6, y + 4);
    }
    const up = col("--up"), down = col("--down");
    vis.forEach((c, i) => {
      const x = i * cw + cw / 2, isUp = c.c >= c.o;
      g.strokeStyle = g.fillStyle = isUp ? up : down;
      g.beginPath(); g.moveTo(Math.round(x) + 0.5, Y(c.h)); g.lineTo(Math.round(x) + 0.5, Y(c.l)); g.stroke();
      const top = Y(Math.max(c.o, c.c)), bh = Math.max(1, Math.abs(Y(c.o) - Y(c.c)));
      g.fillRect(x - cw * 0.35, top, Math.max(1, cw * 0.7), bh);
      g.globalAlpha = 0.35;
      const vh = (c.v / vmax) * volH;
      g.fillRect(x - cw * 0.35, H - 18 - vh, Math.max(1, cw * 0.7), vh);
      g.globalAlpha = 1;
    });
    // last price line + tag
    const last = vis[vis.length - 1], ly = Y(last.c);
    g.setLineDash([3, 3]); g.strokeStyle = last.c >= last.o ? up : down;
    g.beginPath(); g.moveTo(0, ly); g.lineTo(W - axisW, ly); g.stroke(); g.setLineDash([]);
    g.fillStyle = last.c >= last.o ? up : down; g.fillRect(W - axisW, ly - 9, axisW, 18);
    g.fillStyle = "#fff"; g.fillText(fmt(last.c, 8), W - axisW + 6, ly + 4);
    // time axis
    g.fillStyle = col("--faint");
    const step = Math.max(1, Math.floor(n / 6));
    vis.forEach((c, i) => {
      if (i % step) return;
      const d = new Date(c.t * 1000);
      g.fillText(c.t % 86400 === 0 && cw * step > 40 ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : d.toTimeString().slice(0, 5), i * cw + 2, H - 4);
    });
    // crosshair + OHLC readout
    const idx = hover ? Math.min(vis.length - 1, Math.max(0, Math.floor(hover.x / cw))) : vis.length - 1;
    const h = vis[idx];
    if (hover && hover.x < W - axisW) {
      g.strokeStyle = col("--faint"); g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(idx * cw + cw / 2, padT); g.lineTo(idx * cw + cw / 2, H - 18); g.moveTo(0, hover.y); g.lineTo(W - axisW, hover.y); g.stroke(); g.setLineDash([]);
    }
    g.font = "12px Inter, sans-serif";
    const chg = h.o ? ((h.c - h.o) / h.o) * 100 : 0;
    const txt = [["O", h.o], ["H", h.h], ["L", h.l], ["C", h.c]];
    let tx = 8;
    for (const [k, v] of txt) { g.fillStyle = col("--faint"); g.fillText(k, tx, 16); tx += 10; g.fillStyle = h.c >= h.o ? up : down; const s = fmt(v, 8); g.fillText(s, tx, 16); tx += g.measureText(s).width + 10; }
    g.fillText(`${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`, tx, 16); tx += 64;
    g.fillStyle = col("--faint"); g.fillText(`Vol ${fmt(h.v)} QNT`, tx, 16);
    return { cw, n };
  }

  // ---------------------------------------------------------------- mount
  function mount(root, be, opts = {}) {
    const P = (k, d) => be.prefGet("term." + k) ?? d;
    const st = { sort: P("sort", "movers"), frame: P("frame", "5m"), sel: P("sel", null), side: "buy", q: "", markets: [], hover: null, candles: [] };
    root.innerHTML = `
    <div class="term" style="--col-right:${P("colRight", 340)}px;--row-top:${P("rowTop", 42)}%;--col-trades:${P("colTrades", 300)}px">
      <section class="t-explore panel">
        <div class="t-head"><b>Explore coins</b>
          <div class="seg t-sort">${[["movers", "Movers"], ["new", "New"], ["mcap", "Market cap"], ["oldest", "Oldest"], ["lasttrade", "Last trade"]].map(([k, l]) => `<button data-s="${k}">${l}</button>`).join("")}</div>
          <input class="in t-search" placeholder="Search coins">
          ${opts.createHref ? `<a class="btn sm" href="${opts.createHref}">+ Create</a>` : ""}</div>
        <div class="t-table"></div>
      </section>
      <div class="t-split h" data-split="rowTop"></div>
      <section class="t-chart panel">
        <div class="t-head"><span class="t-title"></span><div class="seg t-frames">${Object.keys(FRAMES).map((f) => `<button data-f="${f}">${f}</button>`).join("")}</div></div>
        <canvas class="t-canvas"></canvas>
      </section>
      <div class="t-split v" data-split="colTrades"></div>
      <section class="t-trades panel"><div class="t-head"><b>Trades</b></div><div class="t-list"></div></section>
      <div class="t-split v2" data-split="colRight"></div>
      <aside class="t-side panel">
        <div class="t-trade-box"></div>
        <div class="t-head"><b>Portfolio</b></div><div class="t-port"></div>
      </aside>
    </div>`;
    const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)];
    const term = $(".term"), canvas = $(".t-canvas");

    // splitters
    $$(".t-split").forEach((sp) => sp.addEventListener("pointerdown", (e) => {
      sp.setPointerCapture(e.pointerId);
      const key = sp.dataset.split, r = term.getBoundingClientRect();
      const move = (ev) => {
        if (key === "rowTop") term.style.setProperty("--row-top", Math.min(80, Math.max(15, ((ev.clientY - r.top) / r.height) * 100)) + "%");
        if (key === "colRight") term.style.setProperty("--col-right", Math.min(560, Math.max(240, r.right - ev.clientX)) + "px");
        if (key === "colTrades") {
          const right = parseFloat(getComputedStyle(term).getPropertyValue("--col-right"));
          term.style.setProperty("--col-trades", Math.min(520, Math.max(200, r.right - right - 6 - ev.clientX)) + "px");
        }
        redraw();
      };
      const up = () => {
        sp.removeEventListener("pointermove", move); sp.removeEventListener("pointerup", up);
        const v = getComputedStyle(term).getPropertyValue("--" + key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())).trim();
        be.prefSet("term." + key, parseFloat(v));
      };
      sp.addEventListener("pointermove", move); sp.addEventListener("pointerup", up);
    }));

    // explore table
    function drawTable() {
      const q = st.q.toLowerCase();
      const rows = st.markets.filter((m) => !q || m.ticker.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
      $(".t-table").innerHTML = `<table class="t"><thead><tr><th>#</th><th>Coin</th><th>Graph</th><th class="num">MCap</th><th class="num">ATH</th><th class="num">Age</th>
        <th class="num">Txns</th><th class="num">24h vol</th><th class="num">Traders</th><th class="num">1h</th><th class="num">6h</th><th class="num">24h</th></tr></thead><tbody>
        ${rows.map((m, i) => `<tr class="click ${m.id === st.sel ? "sel" : ""}" data-id="${m.id}"><td class="faint">${i + 1}</td>
          <td><div class="row">${icon(m)}<div><b>${esc(m.name)}</b><div class="faint" style="font-size:12px">$${esc(m.ticker)}</div></div></div></td>
          <td>${spark(m.spark)}</td><td class="num">${fmt(m.mcap_qnt)}</td>
          <td class="num"><span class="ath"><i style="width:${m.ath_qnt ? Math.min(100, (m.price_qnt / m.ath_qnt) * 100) : 0}%"></i></span>${fmt(m.ath_qnt * (m.mcap_qnt / (m.price_qnt || 1)))}</td>
          <td class="num">${age(m.created_time)}</td><td class="num">${m.txns.toLocaleString()}</td><td class="num">${fmt(m.vol_24h_qnt)}</td>
          <td class="num">${m.traders_24h}</td><td class="num">${pct(m.change_1h)}</td><td class="num">${pct(m.change_6h)}</td><td class="num">${pct(m.change_24h)}</td></tr>`).join("")
        || `<tr><td colspan="12" class="muted" style="padding:24px">No coins yet.${opts.createHref ? ` <a href="${opts.createHref}">Create the first one</a>` : ""}</td></tr>`}</tbody></table>`;
      $$(".t-table tr.click").forEach((tr) => (tr.onclick = () => select(tr.dataset.id)));
    }
    async function loadMarkets() {
      try { st.markets = await be.markets(st.sort); } catch (e) { st.markets = []; }
      if (!st.sel && st.markets[0]) st.sel = st.markets[0].id;
      drawTable();
    }
    $$(".t-sort button").forEach((b) => { b.classList.toggle("on", b.dataset.s === st.sort); b.onclick = () => { st.sort = b.dataset.s; be.prefSet("term.sort", st.sort); $$(".t-sort button").forEach((x) => x.classList.toggle("on", x === b)); loadMarkets(); }; });
    $(".t-search").oninput = (e) => { st.q = e.target.value; drawTable(); };

    // chart + trades
    function redraw() { drawCandles(canvas, st.candles, st.hover); }
    canvas.addEventListener("mousemove", (e) => { const r = canvas.getBoundingClientRect(); st.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; redraw(); });
    canvas.addEventListener("mouseleave", () => { st.hover = null; redraw(); });
    $$(".t-frames button").forEach((b) => { b.classList.toggle("on", b.dataset.f === st.frame); b.onclick = () => { st.frame = b.dataset.f; be.prefSet("term.frame", st.frame); $$(".t-frames button").forEach((x) => x.classList.toggle("on", x === b)); loadCoin(); }; });
    new ResizeObserver(redraw).observe(canvas);

    async function loadCoin() {
      const m = st.markets.find((x) => x.id === st.sel);
      if (!m) { $(".t-title").innerHTML = `<span class="muted">Pick a coin</span>`; st.candles = []; redraw(); $(".t-list").innerHTML = ""; drawTradeBox(null); return; }
      $(".t-title").innerHTML = `${icon(m)}<b>${esc(m.ticker)}</b><span class="faint">/QNT</span><b class="t-price">${fmt(m.price_qnt, 10)}</b>${pct(m.change_24h)}
        <span class="faint t-stat">MCap ${fmt(m.mcap_qnt)} · Liq ${fmt(m.liquidity_qnt)} · Vol ${fmt(m.vol_24h_qnt)}</span>`;
      const [hist, trades] = await Promise.all([be.history(m.id).catch(() => []), be.trades(m.id).catch(() => [])]);
      st.candles = buildCandles(hist, trades, st.frame);
      redraw();
      $(".t-list").innerHTML = `<table class="t compact"><thead><tr><th>Price</th><th class="num">QNT</th><th class="num">Age</th></tr></thead><tbody>
        ${trades.map((t) => `<tr><td class="${t.side === "buy" ? "up" : "down"}">${fmt(t.price_qnt, 10)}</td><td class="num">${fmt(t.qnt, 4)}</td><td class="num faint">${age(t.time)}</td></tr>`).join("")
        || `<tr><td colspan="3" class="muted">No trades yet</td></tr>`}</tbody></table>`;
      drawTradeBox(m);
    }
    function select(id) { st.sel = id; be.prefSet("term.sel", id); drawTable(); loadCoin(); }

    // buy / sell box + portfolio
    function drawTradeBox(m) {
      const box = $(".t-trade-box");
      if (!m) { box.innerHTML = ""; return; }
      box.innerHTML = `<div class="t-head"><b>Trade ${esc(m.ticker)}</b><div class="seg buy-sell"><button class="buy ${st.side === "buy" ? "on" : ""}" data-sd="buy">Buy</button><button class="sell ${st.side === "sell" ? "on" : ""}" data-sd="sell">Sell</button></div></div>
        <div class="stack" style="padding:0 14px 14px">
          <div class="in-wrap"><input class="in t-amt" inputmode="decimal" placeholder="0.0"><span class="suffix">${st.side === "buy" ? "QNT" : esc(m.ticker)}</span></div>
          <div class="row wrap t-quick">${(st.side === "buy" ? ["1", "5", "10", "50"] : ["25%", "50%", "100%"]).map((v) => `<button class="btn ghost sm" data-q="${v}">${v}</button>`).join("")}</div>
          <div class="muted t-quote" style="min-height:36px;font-size:13px"></div>
          <button class="btn block ${st.side === "sell" ? "danger" : ""} t-go" ${m.liquidity_qnt ? "" : "disabled"}>${m.liquidity_qnt ? (st.side === "buy" ? "Buy " : "Sell ") + esc(m.ticker) : "No pool yet"}</button></div>`;
      const amt = box.querySelector(".t-amt");
      let tm;
      const quote = async () => {
        const a = amt.value.trim(), qEl = box.querySelector(".t-quote");
        if (!(+a > 0)) { qEl.textContent = ""; return; }
        try { const q = await be.quote(m.id, st.side, a); qEl.innerHTML = `≈ <b>${esc(q.out)} ${st.side === "buy" ? esc(m.ticker) : "QNT"}</b> · impact ${(+q.price_impact_percent).toFixed(2)}%`; }
        catch (e) { qEl.textContent = e.message; }
      };
      amt.oninput = () => { clearTimeout(tm); tm = setTimeout(quote, 250); };
      box.querySelectorAll("[data-sd]").forEach((b) => (b.onclick = () => { st.side = b.dataset.sd; drawTradeBox(m); }));
      box.querySelectorAll("[data-q]").forEach((b) => (b.onclick = async () => {
        const v = b.dataset.q;
        if (v.endsWith("%")) { const pf = await be.portfolio(); const h = pf.tokens.find((t) => t.id === m.id); amt.value = h ? String(+(h.amount * parseFloat(v) / 100).toFixed(m.decimals)) : "0"; }
        else amt.value = v;
        quote();
      }));
      box.querySelector(".t-go").onclick = async (e) => {
        const b = e.target;
        try { b.disabled = true; const r = await be.swap(m.id, st.side, amt.value.trim(), +P("slippage", 1)); be.toast(`${st.side === "buy" ? "Bought" : "Sold"} ✓ ${r?.out ?? ""}`); amt.value = ""; refreshAll(); }
        catch (err) { be.toast(err.message || String(err)); }
        finally { b.disabled = false; }
      };
    }
    async function drawPortfolio() {
      try {
        const pf = await be.portfolio();
        const total = pf.qnt + pf.tokens.reduce((a, t) => a + t.amount * (st.markets.find((m) => m.id === t.id)?.price_qnt || 0), 0);
        $(".t-port").innerHTML = pf.locked ? `<div style="padding:14px" class="muted">${pf.locked}</div>` : `
          <div style="padding:0 14px 8px"><span class="muted">Total value</span><div class="big-total">${fmt(total, 4)} <small class="faint">QNT</small></div></div>
          <ul class="list" style="padding:0 14px">
            <li><span class="token-icon sm q">Q</span><div class="grow"><b>QNT</b></div><div class="r"><b>${fmt(pf.qnt, 4)}</b></div></li>
            ${pf.tokens.map((t) => { const m = st.markets.find((x) => x.id === t.id); return `<li class="click" data-id="${t.id}">${icon(m || t)}<div class="grow"><b>${esc(t.ticker)}</b>
              ${m ? `<div class="faint" style="font-size:12px">${fmt(t.amount * m.price_qnt, 4)} QNT ${pct(m.change_24h)}</div>` : ""}</div><div class="r"><b>${fmt(t.amount)}</b></div></li>`; }).join("")}
          </ul>`;
        $$(".t-port li.click").forEach((li) => (li.onclick = () => select(li.dataset.id)));
      } catch (e) { $(".t-port").innerHTML = `<div style="padding:14px" class="muted">${esc(e.message)}</div>`; }
    }
    async function refreshAll() { await loadMarkets(); await loadCoin(); drawPortfolio(); }
    refreshAll();
    const timer = setInterval(() => { if (!document.body.contains(root)) return clearInterval(timer); refreshAll(); }, opts.refreshMs || 20000);
    return { refresh: refreshAll };
  }
  window.QTerminal = { mount, buildCandles };
})();
