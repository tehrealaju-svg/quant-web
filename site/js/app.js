// Quant website: wallet + meme coin trading. Hash routes, no build step.
import * as Q from "./quant.js";
import { Wallet, hasWallet, saveNew, forget, history, record } from "./wallet.js";
import { NETWORK, SUPABASE, LOCAL_NODE, DOWNLOADS } from "./config.js";
import { GIFTS, giftArt, giftBurst } from "./gifts.js";

const HRP = Q.HRP[NETWORK];
const QK = Q.hex(Q.ZERO32);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const view = $("#view");
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

let api = null, wallet = null, nodeOk = false;
const tokenCache = new Map(); // id -> token json

// ---------------------------------------------------------------- helpers
function toast(msg, ms = 3200) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function modal(html) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  return bg;
}
const busy = (btn, on, label) => { btn.disabled = on; if (on) { btn.dataset.l = btn.innerHTML; btn.innerHTML = `<span class="spinner"></span>${label || ""}`; } else if (btn.dataset.l) btn.innerHTML = btn.dataset.l; };
const short = (s, n = 10) => (s.length > 2 * n + 3 ? s.slice(0, n) + "…" + s.slice(-n) : s);
function fmtNum(x, max = 6) {
  if (!isFinite(x)) return "–";
  if (x === 0) return "0";
  if (Math.abs(x) < 1) return x.toFixed(Math.min(10, 3 - Math.floor(Math.log10(Math.abs(x))))).replace(/0+$/, "");
  if (Math.abs(x) >= 1e6) return (x / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "M";
  return x.toLocaleString(undefined, { maximumFractionDigits: Math.abs(x) < 1 ? max : 2 });
}
function tokenIcon(t) {
  const uri = t?.uri || "";
  if (/^https:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(uri)) return `<span class="token-icon"><img src="${esc(uri)}" alt="" referrerpolicy="no-referrer" loading="lazy"></span>`;
  const t2 = (t?.ticker || "?").slice(0, 3);
  let h = 0; for (const c of t?.id || t2) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="token-icon" style="background:hsl(${h % 360} 70% 45%)">${esc(t2)}</span>`;
}
const qntIcon = `<span class="token-icon" style="background:none"><img src="img/icon.svg" alt=""></span>`;
const needNode = () => { if (!api || !nodeOk) throw new Error("Not connected to the Quant network yet"); };

// ---------------------------------------------------------------- node connection
async function findNode() {
  const custom = ls.get("quant.node");
  const candidates = [];
  if (custom) candidates.push(custom);
  if (SUPABASE.url && SUPABASE.anonKey) {
    try {
      const r = await fetch(`${SUPABASE.url}/rest/v1/quant_node?network=eq.${NETWORK}&select=url,updated_at`, {
        headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}` },
      });
      const rows = await r.json();
      if (rows[0]?.url) candidates.push(rows[0].url);
    } catch {}
  }
  candidates.push(LOCAL_NODE);
  for (const url of candidates) {
    try {
      const a = new Q.NodeApi(url);
      await a.call("getblockcount");
      return a;
    } catch {}
  }
  return null;
}
async function connect() {
  api = await findNode();
  nodeOk = !!api;
  const n = $("#net");
  if (nodeOk) {
    const info = await api.call("getblockchaininfo").catch(() => null);
    n.innerHTML = `<span class="net-dot ok"></span><span class="net-label">${info ? "Block " + info.height.toLocaleString() : "Online"}</span>`;
  } else {
    n.innerHTML = `<span class="net-dot bad"></span><span class="net-label">Offline</span>`;
  }
}

async function getToken(id) {
  if (!id) return null;
  if (tokenCache.has(id)) return tokenCache.get(id);
  try { const t = await api.call("gettoken", [id]); tokenCache.set(id, t); return t; } catch { return null; }
}

// ---------------------------------------------------------------- router
const routes = {
  "": home, wallet: walletView, trade, messages: messagesView, faucet, token: tokenView, create, download, settings,
};
async function route() {
  document.body.classList.remove("wide");
  const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
  $$("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === (name || "home")));
  const fn = routes[name] || home;
  view.innerHTML = `<div class="row muted"><span class="spinner"></span>Loading…</div>`;
  try { await fn(arg ? decodeURIComponent(arg) : undefined); }
  catch (e) { view.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

// ---------------------------------------------------------------- home
async function home() {
  let info = null, toks = null;
  if (nodeOk) {
    [info, toks] = await Promise.all([api.call("getblockchaininfo").catch(() => null), api.call("listtokens", [0, 6, "liquidity"]).catch(() => null)]);
  }
  view.innerHTML = `
  <section class="hero">
    <div>
      <span class="pill brand">Quantum-safe · no premine · no developer fee</span>
      <h1 style="margin-top:14px">Money that stays safe when quantum computers arrive.</h1>
      <p>Quant uses Falcon-512 post-quantum signatures, tiny fees and a small chain. Hold QNT, launch a meme coin for free and trade it, all from your browser.</p>
      <div class="row wrap" style="margin-top:22px">
        <a class="btn" href="#/wallet">${hasWallet() ? "Open wallet" : "Create a wallet"}</a>
        <a class="btn ghost" href="#/trade">Explore coins</a>
      </div>
    </div>
    <div class="card">
      <h2>Network</h2>
      ${info ? `<div class="stats" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat"><span class="muted">Block height</span><b>${info.height.toLocaleString()}</b></div>
        <div class="stat"><span class="muted">Block reward</span><b>${fmtNum(+info.block_reward)} QNT</b></div>
        <div class="stat"><span class="muted">Coins mined</span><b>${fmtNum(+info.supply)}</b></div>
        <div class="stat"><span class="muted">Waiting txs</span><b>${info.mempool_txs}</b></div>
      </div>` : `<div class="notice warn">Can't reach a Quant node right now. You can still create a wallet; balances load once the network is back.</div>`}
    </div>
  </section>
  ${toks?.tokens?.length ? `<section class="card" style="margin-top:8px"><div class="row between"><h2>Top coins</h2><a href="#/trade">See all</a></div>${tokenTable(toks.tokens)}</section>` : ""}
  <section class="feature">
    <div class="card"><h3>Post-quantum</h3><p class="muted">Signatures use Falcon-512, chosen by NIST for exactly this. Your keys are made and used only on your device.</p></div>
    <div class="card"><h3>Free coin creation</h3><p class="muted">Launch a meme coin with one transaction, no creation fee. Open a pool and anyone can buy and sell it.</p></div>
    <div class="card"><h3>Fair by design</h3><p class="muted">No premine, no developer cut. The 0.3% trading fee goes to the people who put up liquidity.</p></div>
  </section>`;
  bindTableClicks();
}

function tokenTable(tokens) {
  return `<div class="table-scroll"><table class="t">
    <thead><tr><th>Coin</th><th class="num">Price (QNT)</th><th class="num">Liquidity</th><th class="num">Supply</th></tr></thead>
    <tbody>${tokens.map((t) => `<tr class="click" data-id="${t.id}">
      <td><div class="row">${tokenIcon(t)}<div><b>${esc(t.ticker)}</b><div class="faint" style="font-size:12px">${esc(t.name)}</div></div></div></td>
      <td class="num">${t.pool ? fmtNum(t.pool.price_qnt, 8) : `<span class="faint">no pool</span>`}</td>
      <td class="num">${t.pool ? fmtNum(t.pool.liquidity_qnt) + " QNT" : "–"}</td>
      <td class="num">${fmtNum(+t.supply)}</td></tr>`).join("")}</tbody></table></div>`;
}
function bindTableClicks() { $$("tr.click").forEach((r) => r.addEventListener("click", () => (location.hash = "#/token/" + r.dataset.id))); }

// ---------------------------------------------------------------- wallet
async function walletView() {
  if (!hasWallet()) return onboarding();
  if (!wallet) wallet = Wallet.fromSession(HRP);
  if (!wallet) return unlockView();
  if (nodeOk) await wallet.refresh(api).catch((e) => toast(e.message));
  const bal = wallet.balances();
  const q = bal.get("") || { units: 0n, pending: 0n, immature: 0n };
  const tokens = [...bal.entries()].filter(([k]) => k);
  for (const [k] of tokens) await getToken(k);
  const hist = history();
  view.innerHTML = `
  <div class="page-head"><div><span class="muted">Your balance</span>
    <div class="balance-big">${Q.formatUnits(q.units)} <small>QNT</small></div>
    ${q.pending ? `<div class="muted">+ ${Q.formatUnits(q.pending)} QNT arriving</div>` : ""}
    ${q.immature ? `<div class="muted">${Q.formatUnits(q.immature)} QNT mined, spendable after 100 blocks</div>` : ""}
  </div>
  <div class="row"><button class="btn" id="b-send">Send</button><button class="btn ghost" id="b-recv">Receive</button></div></div>
  ${nodeOk ? "" : `<div class="notice warn" style="margin-bottom:16px">Offline: balances can't be loaded right now.</div>`}
  <div class="grid cols-2">
    <div class="card"><h2>Assets</h2><ul class="list">
      <li>${qntIcon}<div class="grow"><b>Quant</b><div class="faint">QNT</div></div><div class="r"><b>${Q.formatUnits(q.units)}</b></div></li>
      ${tokens.map(([k, v]) => {
        const t = tokenCache.get(k);
        const isShare = !t;
        return `<li>${isShare ? `<span class="token-icon" style="background:var(--surface);color:var(--muted)">LP</span>` : tokenIcon(t)}
          <div class="grow"><b>${esc(t ? t.name : v.label)}</b><div class="faint">${esc(t ? t.ticker : "Pool shares")}</div></div>
          <div class="r"><b>${t ? Q.formatUnits(v.units, t.decimals) : v.units.toString()}</b>${v.pending ? `<div class="faint">+${t ? Q.formatUnits(v.pending, t.decimals) : v.pending} pending</div>` : ""}</div>
          ${t ? `<a class="btn ghost sm" href="#/token/${k}">Trade</a>` : ""}</li>`;
      }).join("")}
    </ul></div>
    <div class="card"><h2>Activity on this device</h2>
      ${hist.length ? `<ul class="list">${hist.slice(0, 15).map((h) => `<li><div class="grow"><b>${esc(h.label)}</b><div class="faint mono">${short(h.txid, 8)}</div></div>
        <div class="r faint" style="font-size:13px">${new Date(h.time).toLocaleString()}</div></li>`).join("")}</ul>`
        : `<p class="muted">Nothing sent from this browser yet.</p>`}
    </div>
  </div>
  <div class="row wrap" style="margin-top:16px"><button class="btn line sm" id="b-lock">Lock wallet</button><button class="btn line sm" id="b-words">Show seed words</button></div>`;
  $("#b-send").onclick = () => sendModal();
  $("#b-recv").onclick = () => receiveModal();
  $("#b-lock").onclick = () => { wallet.lock(); wallet = null; route(); };
  $("#b-words").onclick = () => revealWordsModal();
}

function onboarding() {
  view.innerHTML = `
  <div style="max-width:520px;margin:24px auto" class="card stack">
    <h1>Your Quant wallet</h1>
    <p class="muted">Your wallet lives in this browser and is locked with a password. It's backed up by 24 seed words; with them you can open the same wallet in the Windows app or another browser.</p>
    <button class="btn block" id="b-new">Create a new wallet</button>
    <button class="btn ghost block" id="b-restore">I have seed words</button>
  </div>`;
  $("#b-new").onclick = async () => newWalletFlow(await Q.generateWords());
  $("#b-restore").onclick = restoreFlow;
}

function passwordFields() {
  return `<div><label class="f">Password for this browser</label><input class="in" type="password" id="pw1" autocomplete="new-password" minlength="8"></div>
  <div><label class="f">Repeat password</label><input class="in" type="password" id="pw2" autocomplete="new-password"></div>`;
}
function readPassword() {
  const a = $("#pw1").value, b = $("#pw2").value;
  if (a.length < 8) throw new Error("Use at least 8 characters");
  if (a !== b) throw new Error("Passwords don't match");
  return a;
}

function newWalletFlow(words) {
  view.innerHTML = `
  <div style="max-width:560px;margin:24px auto" class="card stack">
    <h1>Write these words down</h1>
    <p class="muted">These 24 words <b>are</b> your money. Anyone who sees them can take it, and if you lose them and this browser, nobody can get it back. Write them on paper and keep it safe.</p>
    <div class="words">${words.split(" ").map((w) => `<span>${w}</span>`).join("")}</div>
    <label class="row"><input type="checkbox" id="ok"> I wrote them down in order</label>
    ${passwordFields()}
    <button class="btn block" id="b-go" disabled>Create wallet</button>
  </div>`;
  $("#ok").onchange = (e) => ($("#b-go").disabled = !e.target.checked);
  $("#b-go").onclick = async (e) => {
    try {
      const pw = readPassword();
      busy(e.target, true, "Creating…");
      await saveNew(words, pw);
      wallet = await Wallet.unlock(pw, HRP, true);
      toast("Wallet created");
      route();
    } catch (err) { busy(e.target, false); toast(err.message); }
  };
}

function restoreFlow() {
  view.innerHTML = `
  <div style="max-width:560px;margin:24px auto" class="card stack">
    <h1>Restore from seed words</h1>
    <div><label class="f">Your 24 words, in order</label><textarea class="in" id="words" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></div>
    ${passwordFields()}
    <button class="btn block" id="b-go">Restore wallet</button>
  </div>`;
  $("#b-go").onclick = async (e) => {
    try {
      const words = $("#words").value;
      if (!(await Q.validWords(words))) throw new Error("Those words aren't valid. Check spelling, order and that there are 24.");
      const pw = readPassword();
      busy(e.target, true, "Restoring…");
      await saveNew(words, pw);
      wallet = await Wallet.unlock(pw, HRP, true);
      toast("Wallet restored");
      route();
    } catch (err) { busy(e.target, false); toast(err.message); }
  };
}

function unlockView() {
  view.innerHTML = `
  <div style="max-width:420px;margin:40px auto" class="card stack">
    <h1>Unlock wallet</h1>
    <div><label class="f">Password</label><input class="in" type="password" id="pw" autocomplete="current-password"></div>
    <label class="row"><input type="checkbox" id="rem" checked> Stay unlocked until I close this tab</label>
    <button class="btn block" id="b-go">Unlock</button>
    <button class="btn line block sm" id="b-forget">Remove wallet from this browser</button>
  </div>`;
  const go = async () => {
    const b = $("#b-go");
    try { busy(b, true, "Unlocking…"); wallet = await Wallet.unlock($("#pw").value, HRP, $("#rem").checked); route(); }
    catch (err) { busy(b, false); toast(err.message); }
  };
  $("#b-go").onclick = go;
  $("#pw").onkeydown = (e) => { if (e.key === "Enter") go(); };
  $("#b-forget").onclick = () => {
    const m = modal(`<h2>Remove wallet?</h2><p class="muted">This deletes the wallet from this browser. Your coins are safe only if you have your 24 seed words.</p>
      <div class="row"><button class="btn danger" id="y">Remove</button><button class="btn ghost" id="n">Cancel</button></div>`);
    $("#n", m).onclick = () => m.remove();
    $("#y", m).onclick = () => { forget(); m.remove(); route(); };
  };
}

async function revealWordsModal() {
  const m = modal(`<h2>Seed words</h2><p class="muted">Enter your password to show them. Make sure nobody is watching.</p>
    <input class="in" type="password" id="pw"><div class="row" style="margin-top:12px"><button class="btn" id="go">Show</button></div><div id="out"></div>`);
  $("#go", m).onclick = async () => {
    try {
      const w = await Wallet.revealWords($("#pw", m).value);
      $("#out", m).innerHTML = `<div class="words" style="margin-top:14px">${w.split(" ").map((x) => `<span>${x}</span>`).join("")}</div>`;
    } catch (e) { toast(e.message); }
  };
}

function receiveModal() {
  const a = wallet.receive.str;
  const m = modal(`<h2>Receive QNT or coins</h2><div class="qr-wrap"><button class="present" id="pres" title="Free test QNT"><svg viewBox="0 0 64 64"><rect x="8" y="26" width="48" height="32" rx="3" fill="#ff5a4e"/><rect x="4" y="18" width="56" height="12" rx="3" fill="#ff7b6e"/><rect x="28" y="18" width="8" height="40" fill="#ffd43b"/><path d="M32 18c-6-12-20-10-14-2 3 3 14 2 14 2zM32 18c6-12 20-10 14-2-3 3-14 2-14 2z" fill="#ffd43b"/></svg></button><div class="qr" id="qr"></div></div>
    <p class="mono" style="margin:14px 0">${a}</p><button class="btn block" id="cp">Copy address</button>`);
  if (window.qrcode) { const qr = window.qrcode(0, "M"); qr.addData(a); qr.make(); $("#qr", m).innerHTML = qr.createSvgTag({ cellSize: 5, margin: 0 }); }
  $("#cp", m).onclick = async () => { try { await navigator.clipboard.writeText(a); toast("Copied"); } catch { toast("Copy failed"); } };
  $("#pres", m).onclick = async (e) => {
    try { const r = await api.call("faucet", [a]); e.currentTarget?.remove(); giftBurst(3); toast(`You got ${r.amount} test QNT 🎁`, 5000); }
    catch (err) { toast(/already/.test(err.message) ? "Come back tomorrow for another present" : err.message, 5000); }
  };
}

function sendModal(presetAsset = "") {
  const bal = wallet.balances();
  const opts = [["", "QNT", 10, (bal.get("") || {}).units || 0n],
    ...[...bal.entries()].filter(([k]) => k && tokenCache.get(k)).map(([k, v]) => [k, tokenCache.get(k).ticker, tokenCache.get(k).decimals, v.units])];
  const m = modal(`<h2>Send</h2><div class="stack">
    <div><label class="f">Asset</label><select class="in" id="as">${opts.map(([k, t, d, u]) => `<option value="${k}" ${k === presetAsset ? "selected" : ""}>${esc(t)} (${Q.formatUnits(u, d)} available)</option>`).join("")}</select></div>
    <div><label class="f">To address</label><input class="in mono" id="to" placeholder="${HRP}1…" autocomplete="off" spellcheck="false"></div>
    <div><label class="f">Amount</label><div class="in-wrap"><input class="in" id="amt" inputmode="decimal" placeholder="0.0"><span class="suffix" id="sfx"></span></div>
      <button class="btn ghost sm" id="max" style="margin-top:6px">Max</button></div>
    <div id="sum" class="muted" style="font-size:14px"></div>
    <button class="btn block" id="go">Review</button></div>`);
  const cur = () => opts.find((o) => o[0] === $("#as", m).value);
  const upd = () => ($("#sfx", m).textContent = cur()[1]);
  $("#as", m).onchange = upd; upd();
  $("#max", m).onclick = () => { const [k, , d, u] = cur(); $("#amt", m).value = k ? Q.formatUnits(u, d) : Q.formatUnits(u > 100000n ? u - 100000n : 0n); };
  $("#go", m).onclick = async () => {
    try {
      needNode();
      const [k, tick, d, avail] = cur();
      const to = Q.decodeAddress(HRP, $("#to", m).value);
      if (!to) throw new Error("That isn't a valid Quant address");
      const v = Q.parseUnits($("#amt", m).value, d);
      if (!v) throw new Error("Enter an amount");
      const subtract = !k && v === avail;
      const b = wallet.build({ outs: [{ value: v, asset: k ? Q.unhex(k) : null, addr: to }], ops: [], subtractFee: subtract });
      confirmSend(m, `Send ${Q.formatUnits(subtract ? v - b.fee : v, d)} ${tick} to ${short($("#to", m).value.trim(), 12)}`, b, `Sent ${Q.formatUnits(v, d)} ${tick}`);
    } catch (e) { toast(e.message); }
  };
}

function confirmSend(m, what, built, label, after) {
  m.querySelector(".modal").innerHTML = `<h2>Confirm</h2><p>${esc(what)}</p>
    <dl class="kv"><dt>Network fee</dt><dd>${Q.formatUnits(built.fee)} QNT</dd></dl>
    <div class="row" style="margin-top:16px"><button class="btn" id="ok">Confirm</button><button class="btn ghost" id="no">Cancel</button></div>`;
  $("#no", m).onclick = () => m.remove();
  $("#ok", m).onclick = async (e) => {
    try {
      busy(e.target, true, "Sending…");
      const id = await api.call("sendrawtransaction", [built.hex]);
      record({ txid: id, label });
      m.remove();
      toast(label + " ✓");
      if (after) after(id); else route();
    } catch (err) { busy(e.target, false); toast(err.message, 5000); }
  };
}

async function requireWallet() {
  if (!hasWallet() || !(wallet || (wallet = Wallet.fromSession(HRP)))) { location.hash = "#/wallet"; throw new Error("Unlock your wallet first"); }
  needNode();
  await wallet.refresh(api);
}

// ---------------------------------------------------------------- messages (on-chain chat + gifts)
const names = () => { try { return JSON.parse(ls.get("quant.names") || "{}"); } catch { return {}; } };
const nameOf = (a) => names()[a] || short(a, 8);
function avatar(a) {
  let h = 0; for (const c of a) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="av" style="background:hsl(${h % 360} 65% 48%)">${esc((names()[a] || a.slice(HRP.length + 1)).slice(0, 1).toUpperCase())}</span>`;
}
let chatTimer = null;
async function loadMessages() {
  const mine = new Set(wallet.addrs.map((a) => a.str));
  const lists = await Promise.all(wallet.addrs.map((a) => api.call("getmessages", [a.str, 500]).catch(() => [])));
  const seen = new Map();
  // The node lists newest first; walk oldest first so same-block messages keep their order.
  for (const l of lists) for (const m of [...l].reverse()) if (!seen.has(m.txid)) seen.set(m.txid, { ...m, me: mine.has(m.from), other: mine.has(m.from) ? m.to : m.from });
  const convos = new Map();
  for (const m of seen.values()) {
    if (!convos.has(m.other)) convos.set(m.other, []);
    convos.get(m.other).push(m);
  }
  const t = (m) => (m.pending ? Infinity : m.time);
  for (const v of convos.values()) v.sort((a, b) => t(a) - t(b));
  return [...convos.entries()].sort((a, b) => t(b[1][b[1].length - 1]) - t(a[1][a[1].length - 1]));
}
async function messagesView(peer) {
  await requireWallet();
  clearInterval(chatTimer);
  let convos = await loadMessages();
  if (peer && !convos.some(([a]) => a === peer)) convos.unshift([peer, []]);
  const seenGifts = new Set(JSON.parse(ls.get("quant.seenGifts") || "[]"));
  const paint = () => {
    const cur = convos.find(([a]) => a === peer);
    const preview = (m) => (m.gift ? `${m.me ? "You sent" : "Sent you"} a ${GIFTS[m.gift].label.toLowerCase()}` : (m.me ? "You: " : "") + m.text);
    view.innerHTML = `<div class="page-head"><div><h1>Messages</h1><span class="muted">Messages are stored on the Quant chain and anyone can read them. Gifts pay the price to the person you send them to.</span></div>
      <button class="btn" id="newc">New chat</button></div>
      <div class="chat card ${peer ? "open" : ""}">
        <div class="chat-list">${convos.length ? convos.map(([a, ms]) => `<a class="chat-item ${a === peer ? "on" : ""}" href="#/messages/${encodeURIComponent(a)}">${avatar(a)}
          <div class="meta"><div class="nm">${esc(nameOf(a))}</div><div class="last">${ms.length ? esc(preview(ms[ms.length - 1])) : "New chat"}</div></div></a>`).join("")
          : `<p class="muted" style="padding:12px">No messages yet. Start a chat with any Quant address.</p>`}</div>
        <div class="thread">${cur ? `
          <div class="thread-head"><a class="btn ghost sm" href="#/messages" aria-label="Back">←</a>${avatar(peer)}<div style="min-width:0"><div style="font-weight:700">${esc(nameOf(peer))}</div><div class="mono muted" style="font-size:12px">${esc(short(peer, 14))}</div></div>
            <div class="grow"></div><button class="btn ghost sm" id="nick">Rename</button></div>
          <div class="bubbles" id="bub">${cur[1].map((m) => m.gift ? `<div class="bubble giftb ${m.me ? "me" : ""}" data-g="${m.gift}">${giftArt(m.gift, true)}<span class="gname">${GIFTS[m.gift].label} · ${GIFTS[m.gift].price} QNT</span>${m.text ? `<span>${esc(m.text)}</span>` : ""}<span class="when ${m.pending ? "pend" : ""}">${m.pending ? "" : new Date(m.time * 1000).toLocaleString()}</span></div>`
            : `<div class="bubble ${m.me ? "me" : ""}">${esc(m.text)}<span class="when ${m.pending ? "pend" : ""}">${m.pending ? "" : new Date(m.time * 1000).toLocaleString()}</span></div>`).join("") || `<p class="muted" style="text-align:center">Say hi — or send a gift.</p>`}</div>
          <div id="gsel"></div>
          <div class="composer"><button class="btn ghost" id="gbtn" title="Send a gift">🎁</button><textarea class="in" id="txt" maxlength="280" rows="1" placeholder="Message"></textarea><button class="btn" id="snd">Send</button></div>`
          : `<div class="muted" style="margin:auto;text-align:center">Pick a chat</div>`}</div>
      </div>`;
    $("#newc").onclick = () => {
      const m = modal(`<h2>New chat</h2><label class="f">Their Quant address</label><input class="in mono" id="a" placeholder="${HRP}1…" spellcheck="false"><button class="btn block" id="go" style="margin-top:12px">Open chat</button>`);
      $("#go", m).onclick = () => { const a = $("#a", m).value.trim(); if (!Q.decodeAddress(HRP, a)) return toast("That isn't a valid Quant address"); m.remove(); location.hash = "#/messages/" + encodeURIComponent(a); };
    };
    if (!cur) return;
    const bub = $("#bub"); bub.scrollTop = bub.scrollHeight;
    $$(".bubble.giftb", bub).forEach((b) => (b.onclick = () => giftBurst(+b.dataset.g)));
    // A gift you haven't seen yet opens with a burst.
    const fresh = cur[1].filter((m) => m.gift && !m.me && !m.pending && !seenGifts.has(m.txid));
    if (fresh.length) { giftBurst(fresh[fresh.length - 1].gift); fresh.forEach((m) => seenGifts.add(m.txid)); ls.set("quant.seenGifts", JSON.stringify([...seenGifts].slice(-500))); }
    $("#nick").onclick = () => {
      const n = prompt("Name for this address", names()[peer] || "");
      if (n === null) return;
      const all = names(); if (n.trim()) all[peer] = n.trim().slice(0, 40); else delete all[peer];
      ls.set("quant.names", JSON.stringify(all)); paint();
    };
    let gift = 0;
    const showGift = () => ($("#gsel").innerHTML = gift ? `<div class="row" style="padding-top:10px"><span class="gift-chip">${giftArt(gift)}${GIFTS[gift].label} · ${GIFTS[gift].price} QNT</span><button class="btn ghost sm" id="gx">Remove</button></div>` : "",
      gift && ($("#gx").onclick = () => { gift = 0; showGift(); }));
    $("#gbtn").onclick = () => {
      const m = modal(`<h2>Send a gift</h2><p class="muted" style="margin:0">The price goes to ${esc(nameOf(peer))}.</p>
        <div class="gift-pick">${GIFTS.filter(Boolean).map((g) => `<button class="gift-opt" data-id="${g.id}">${giftArt(g.id)}<b>${g.label}</b><span class="p">${g.price} QNT</span></button>`).join("")}</div>`);
      $$(".gift-opt", m).forEach((b) => (b.onclick = () => { gift = +b.dataset.id; m.remove(); showGift(); $("#txt").focus(); }));
    };
    const txt = $("#txt");
    txt.oninput = () => { txt.style.height = "auto"; txt.style.height = Math.min(txt.scrollHeight, 140) + "px"; };
    txt.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#snd").click(); } };
    $("#snd").onclick = async (e) => {
      const text = txt.value.trim();
      try {
        if (!text && !gift) return;
        if (new TextEncoder().encode(text).length > 280) throw new Error("Messages are at most 280 bytes");
        const to = Q.decodeAddress(HRP, peer);
        busy(e.target, true);
        await wallet.refresh(api);
        const pay = gift ? GIFTS[gift].units : Q.DUST;
        const op = { type: "message", from: Q.ZERO32, to, gift, text };
        const built = wallet.build({ outs: [{ value: pay, asset: null, addr: to }], ops: [op], extraOuts: Math.ceil(text.length / 74) + 1,
          finish: (tx) => { const c = wallet.coins.find((c) => Q.hex(c.txid) === Q.hex(tx.ins[0].txid) && c.n === tx.ins[0].n); op.from = c.addr; } });
        const id = await api.call("sendrawtransaction", [built.hex]);
        record({ txid: id, label: gift ? `Sent a ${GIFTS[gift].label.toLowerCase()} to ${nameOf(peer)}` : `Message to ${nameOf(peer)}` });
        if (gift) giftBurst(gift);
        txt.value = ""; gift = 0;
        convos = await loadMessages();
        if (!convos.some(([a]) => a === peer)) convos.unshift([peer, []]);
        paint();
      } catch (err) { busy(e.target, false); toast(err.message, 5000); }
    };
  };
  paint();
  // New messages show up without reloading (while this page is open and the box is empty).
  chatTimer = setInterval(async () => {
    if (!location.hash.startsWith("#/messages")) return clearInterval(chatTimer);
    if (document.activeElement?.id === "txt" && $("#txt").value) return;
    const next = await loadMessages().catch(() => null);
    if (!next || JSON.stringify(next) === JSON.stringify(convos.filter(([, m]) => m.length))) return;
    convos = next;
    if (peer && !convos.some(([a]) => a === peer)) convos.unshift([peer, []]);
    paint();
  }, 12000);
}

// ---------------------------------------------------------------- testnet faucet
async function faucet() {
  needNode();
  view.innerHTML = `<div class="card stack" style="max-width:520px;margin:auto"><h1>Testnet faucet</h1>
    <p class="muted" style="margin:0">Free test QNT (1-10) once a day per address. Testnet coins have no value.</p>
    <input class="in mono" id="fa" placeholder="${HRP}1…" spellcheck="false" value="${esc(wallet?.receive?.str || "")}">
    <button class="btn block" id="fg">Get test QNT</button><div id="fo"></div></div>`;
  $("#fg").onclick = async (e) => {
    try { busy(e.target, true); const r = await api.call("faucet", [$("#fa").value.trim()]); $("#fo").innerHTML = `<div class="notice">Sent ${esc(r.amount)} QNT ✓</div>`; }
    catch (err) { toast(err.message, 5000); } finally { busy(e.target, false); }
  };
}

// ---------------------------------------------------------------- trade list
async function trade() {
  needNode();
  document.body.classList.add("wide");
  view.innerHTML = `<div class="term-host"></div>`;
  const unlocked = () => wallet || (hasWallet() && (wallet = Wallet.fromSession(HRP)));
  QTerminal.mount($(".term-host"), {
    markets: (sort) => api.call("listmarkets", [sort, 300]),
    history: (id) => api.call("getpoolhistory", [id, 2000]),
    trades: (id) => api.call("getpooltrades", [id, 200]),
    async portfolio() {
      if (!unlocked()) return { qnt: 0, tokens: [], locked: `<a href="#/wallet">Unlock or create your wallet</a> to trade.` };
      await wallet.refresh(api);
      const tokens = [];
      for (const [k, v] of wallet.balances()) {
        if (!k) continue;
        const t = await getToken(k);
        if (t) tokens.push({ id: k, ticker: t.ticker, uri: t.uri, amount: Number(v.units) / 10 ** t.decimals });
      }
      return { qnt: Number((wallet.balances().get("") || { units: 0n }).units) / 1e10, tokens };
    },
    quote: (id, side, amt) => api.call("quote", [id, side, amt]),
    async swap(id, side, amt, slip) {
      if (!unlocked()) { location.hash = "#/wallet"; throw new Error("Unlock your wallet first"); }
      const t = await getToken(id), dec = t.decimals, TU = Q.unhex(id), sell = side === "sell";
      const v = Q.parseUnits(amt, sell ? dec : 10);
      if (!v) throw new Error("Enter an amount");
      await wallet.refresh(api);
      const p = await api.call("getpool", [id]);
      const rq = Q.parseUnits(p.qnt_reserve), rt = Q.parseUnits(p.token_reserve, dec);
      const out = sell ? Q.ammQuote(v, rt, rq) : Q.ammQuote(v, rq, rt);
      const minOut = (out * BigInt(Math.round((100 - slip) * 100))) / 10000n;
      if (minOut <= 0n) throw new Error("Amount too small");
      const b = wallet.build({ outs: [], ops: [{ type: "swap", token: TU, sell, in: v, out: minOut }],
        opIn: new Map([[sell ? id : QK, v]]), opOut: new Map([[sell ? QK : id, minOut]]) });
      const txid = await api.call("sendrawtransaction", [b.hex]);
      record({ txid, label: (sell ? "Sold " : "Bought ") + t.ticker });
      return { out: sell ? Q.formatUnits(minOut) + " QNT" : Q.formatUnits(minOut, dec) + " " + t.ticker };
    },
    prefGet: (k) => ls.get(k), prefSet: (k, v) => ls.set(k, String(v)), toast,
  }, { createHref: "#/create", refreshMs: 20000 });
}

// ---------------------------------------------------------------- token page
function chartSvg(points) {
  if (points.length < 2) return `<div class="muted" style="height:220px;display:grid;place-items:center">Not enough trades yet for a chart</div>`;
  const W = 600, H = 220, P = 6;
  const xs = points.map((p) => p.time), ys = points.map((p) => p.price_qnt);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) * 0.98, y1 = Math.max(...ys) * 1.02 || 1;
  const X = (x) => P + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * P), Y = (y) => H - P - ((y - y0) / (y1 - y0 || 1)) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(p.time).toFixed(1)},${Y(p.price_qnt).toFixed(1)}`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path class="area" d="${d}L${X(x1)},${H}L${X(x0)},${H}Z"/><path class="line" d="${d}" vector-effect="non-scaling-stroke"/></svg>`;
}

async function tokenView(id) {
  needNode();
  tokenCache.delete(id);
  const t = await getToken(id);
  if (!t) throw new Error("Coin not found");
  const pool = t.pool;
  const hist = pool ? await api.call("getpoolhistory", [id, 300]).catch(() => []) : [];
  const first = hist[0]?.price_qnt, change = first && pool ? ((pool.price_qnt - first) / first) * 100 : null;
  view.innerHTML = `
  <div class="page-head"><div class="row">${tokenIcon(t)}<div><h1 style="margin:0">${esc(t.name)}</h1><span class="muted">${esc(t.ticker)}</span></div></div>
    ${pool ? `<div style="text-align:right"><div class="balance-big" style="font-size:30px">${fmtNum(pool.price_qnt, 10)} <small>QNT</small></div>
      ${change !== null ? `<span class="${change >= 0 ? "up" : "down"}">${change >= 0 ? "+" : ""}${change.toFixed(2)}%</span>` : ""}</div>` : ""}</div>
  <div class="grid cols-2">
    <div class="stack">
      <div class="card">${pool ? chartSvg(hist) : `<div class="notice">This coin has no pool yet, so it can't be traded. Anyone holding it can open one under <b>Liquidity</b>.</div>`}</div>
      <div class="card"><h2>About</h2><dl class="kv">
        <dt>Total supply</dt><dd>${fmtNum(+t.supply)} ${esc(t.ticker)}</dd>
        ${pool ? `<dt>Liquidity</dt><dd>${fmtNum(pool.liquidity_qnt)} QNT</dd><dt>Pool</dt><dd>${fmtNum(+pool.qnt_reserve)} QNT + ${fmtNum(+pool.token_reserve)} ${esc(t.ticker)}</dd>` : ""}
        <dt>Decimals</dt><dd>${t.decimals}</dd><dt>Created at block</dt><dd>${t.created_height.toLocaleString()}</dd>
        ${t.uri ? `<dt>Link</dt><dd><a href="${esc(t.uri)}" rel="noopener nofollow" target="_blank">${esc(short(t.uri, 18))}</a></dd>` : ""}
        <dt>Coin ID</dt><dd class="mono" style="font-size:11px">${t.id}</dd></dl>
        <p class="faint" style="font-size:13px;margin:12px 0 0">Anyone can create a coin with any name. Check the coin ID before buying.</p></div>
    </div>
    <div class="stack">
      ${pool ? `<div class="card" id="swap"><div class="row between"><h2 style="margin:0">Trade</h2>
        <div class="seg buy-sell"><button class="buy on" data-side="buy">Buy</button><button class="sell" data-side="sell">Sell</button></div></div>
        <div class="stack" style="margin-top:14px">
          <div><label class="f" id="lbl">You pay</label><div class="in-wrap"><input class="in" id="amt" inputmode="decimal" placeholder="0.0"><span class="suffix" id="sfx">QNT</span></div></div>
          <div class="muted" id="quote" style="min-height:44px;font-size:14px"></div>
          <div class="row between"><span class="muted" style="font-size:13px">Max price slippage</span>
            <div class="seg" id="slip"><button data-v="0.5">0.5%</button><button data-v="1" class="on">1%</button><button data-v="3">3%</button></div></div>
          <button class="btn block" id="go">Buy ${esc(t.ticker)}</button></div></div>` : ""}
      <div class="card"><h2>Liquidity</h2><p class="muted" style="font-size:14px;margin-top:0">${pool ? "Add QNT and " + esc(t.ticker) + " to the pool and earn the 0.3% fee on every trade." : "Open the pool with the first deposit. The ratio you deposit sets the starting price."}</p>
        <div class="stack"><div class="in-wrap"><input class="in" id="lq" inputmode="decimal" placeholder="0.0"><span class="suffix">QNT</span></div>
        <div class="in-wrap"><input class="in" id="lt" inputmode="decimal" placeholder="0.0"><span class="suffix">${esc(t.ticker)}</span></div>
        <div class="row"><button class="btn ghost" id="add">${pool ? "Add liquidity" : "Open pool"}</button>${pool ? `<button class="btn line" id="rem">Withdraw mine</button>` : ""}</div></div></div>
    </div>
  </div>`;

  const T = t.id, TU = Q.unhex(T), dec = t.decimals;
  let side = "buy", slip = 1;
  const reserves = async () => {
    const p = await api.call("getpool", [T]);
    return { qnt: Q.parseUnits(p.qnt_reserve), tok: Q.parseUnits(p.token_reserve, dec), shares: BigInt(p.shares) };
  };
  if (pool) {
    const quote = async () => {
      const v = Q.parseUnits($("#amt").value, side === "buy" ? 10 : dec);
      if (!v) { $("#quote").textContent = ""; return null; }
      const r = await reserves();
      const out = side === "buy" ? Q.ammQuote(v, r.qnt, r.tok) : Q.ammQuote(v, r.tok, r.qnt);
      const spot = side === "buy" ? Number(r.tok) / Number(r.qnt) : Number(r.qnt) / Number(r.tok);
      const impact = spot ? (1 - Number(out) / Number(v) / spot) * 100 : 0;
      $("#quote").innerHTML = `You get about <b>${Q.formatUnits(out, side === "buy" ? dec : 10)} ${side === "buy" ? esc(t.ticker) : "QNT"}</b><br>
        <span class="${impact > 5 ? "down" : "faint"}">Price impact ${impact.toFixed(2)}%</span>`;
      return { v, out };
    };
    $$("#swap [data-side]").forEach((b) => (b.onclick = () => {
      side = b.dataset.side;
      $$("#swap [data-side]").forEach((x) => x.classList.toggle("on", x === b));
      $("#sfx").textContent = side === "buy" ? "QNT" : t.ticker;
      $("#go").textContent = (side === "buy" ? "Buy " : "Sell ") + t.ticker;
      $("#go").className = "btn block" + (side === "sell" ? " danger" : "");
      quote();
    }));
    $$("#slip button").forEach((b) => (b.onclick = () => { slip = +b.dataset.v; $$("#slip button").forEach((x) => x.classList.toggle("on", x === b)); }));
    let qt; $("#amt").oninput = () => { clearTimeout(qt); qt = setTimeout(quote, 250); };
    $("#go").onclick = async () => {
      try {
        await requireWallet();
        const q = await quote();
        if (!q || !q.out) throw new Error("Enter an amount");
        const minOut = (q.out * BigInt(Math.round((100 - slip) * 100))) / 10000n;
        if (minOut <= 0n) throw new Error("Amount too small");
        const sell = side === "sell";
        const b = wallet.build({ outs: [], ops: [{ type: "swap", token: TU, sell, in: q.v, out: minOut }],
          opIn: new Map([[sell ? T : QK, q.v]]), opOut: new Map([[sell ? QK : T, minOut]]) });
        const what = sell ? `Sell ${Q.formatUnits(q.v, dec)} ${t.ticker} for at least ${Q.formatUnits(minOut)} QNT`
                          : `Buy at least ${Q.formatUnits(minOut, dec)} ${t.ticker} for ${Q.formatUnits(q.v)} QNT`;
        confirmSend(modal(""), what, b, (sell ? "Sold " : "Bought ") + t.ticker, () => setTimeout(route, 400));
      } catch (e) { toast(e.message); }
    };
  }
  $("#add").onclick = async () => {
    try {
      await requireWallet();
      const q = Q.parseUnits($("#lq").value), tk = Q.parseUnits($("#lt").value, dec);
      if (!q || !tk) throw new Error("Enter both amounts");
      const shareId = Q.hex(Q.poolShareId(TU));
      let op, shares;
      if (!pool) {
        shares = Q.ammInitialShares(q, tk) - Q.MIN_LIQUIDITY;
        if (shares <= 0n) throw new Error("First deposit is too small");
        op = { type: "poolCreate", token: TU, qnt: q, tok: tk, shares };
      } else {
        shares = Q.ammAddShares(await reserves(), q, tk);
        if (!shares) throw new Error("Deposit too small");
        op = { type: "add", token: TU, qnt: q, tok: tk, shares };
      }
      const b = wallet.build({ outs: [], ops: [op], opIn: new Map([[QK, q], [T, tk]]), opOut: new Map([[shareId, shares]]) });
      confirmSend(modal(""), `Deposit ${Q.formatUnits(q)} QNT + ${Q.formatUnits(tk, dec)} ${t.ticker}`, b, `Added liquidity to ${t.ticker}`, () => setTimeout(route, 400));
    } catch (e) { toast(e.message); }
  };
  if ($("#rem")) $("#rem").onclick = async () => {
    try {
      await requireWallet();
      const shareId = Q.hex(Q.poolShareId(TU));
      const mine = wallet.balances().get(shareId)?.units || 0n;
      if (!mine) throw new Error("You have no shares in this pool");
      const r = await reserves();
      const qo = (mine * r.qnt) / r.shares, to = (mine * r.tok) / r.shares;
      const b = wallet.build({ outs: [], ops: [{ type: "remove", token: TU, shares: mine, qnt: qo, tok: to }],
        opIn: new Map([[shareId, mine]]), opOut: new Map([[QK, qo], [T, to]]) });
      confirmSend(modal(""), `Withdraw ${Q.formatUnits(qo)} QNT + ${Q.formatUnits(to, dec)} ${t.ticker}`, b, `Withdrew from ${t.ticker} pool`, () => setTimeout(route, 400));
    } catch (e) { toast(e.message); }
  };
}

// ---------------------------------------------------------------- create coin
async function create() {
  view.innerHTML = `
  <div class="grid cols-2">
    <div class="card stack"><h1>Create a coin</h1>
      <p class="muted" style="margin-top:0">Free: you only pay the normal network fee (a tiny fraction of a QNT). The whole supply goes to your wallet.</p>
      <div><label class="f">Ticker</label><input class="in" id="tk" maxlength="10" placeholder="DOGE2" style="text-transform:uppercase" autocomplete="off"></div>
      <div><label class="f">Name</label><input class="in" id="nm" maxlength="32" placeholder="Doge Two"></div>
      <div><label class="f">Total supply</label><input class="in" id="sp" inputmode="decimal" placeholder="1000000000"></div>
      <div><label class="f">Decimals</label><select class="in" id="dc">${[0, 2, 4, 6, 8, 10].map((d) => `<option ${d === 8 ? "selected" : ""}>${d}</option>`).join("")}</select></div>
      <div><label class="f">Logo or website (optional, https)</label><input class="in" id="ur" maxlength="120" placeholder="https://…/logo.png"></div>
      <button class="btn block" id="go">Create coin</button>
    </div>
    <div class="card"><h2>Preview</h2><div class="row" id="pv"></div>
      <h3 style="margin-top:24px">What happens next</h3>
      <ol class="muted" style="padding-left:18px;margin:0;line-height:1.7"><li>Your coin is created in the next block (about 2 minutes).</li>
      <li>Open its page and deposit QNT plus some of your coin to start a pool. That sets the price.</li>
      <li>Anyone can then buy and sell it here or from the Windows app.</li></ol></div>
  </div>`;
  const pv = () => { const t = { ticker: $("#tk").value.toUpperCase() || "NEW", name: $("#nm").value || "My coin", uri: $("#ur").value, id: $("#tk").value };
    $("#pv").innerHTML = `${tokenIcon(t)}<div><b>${esc(t.name)}</b><div class="faint">${esc(t.ticker)} · ${fmtNum(+$("#sp").value || 0)} supply</div></div>`; };
  $$("#tk,#nm,#sp,#ur").forEach((i) => (i.oninput = pv)); pv();
  $("#go").onclick = async () => {
    try {
      await requireWallet();
      const ticker = $("#tk").value.trim().toUpperCase(), name = $("#nm").value.trim(), dec = +$("#dc").value, uri = $("#ur").value.trim();
      if (!/^[A-Z0-9]{1,10}$/.test(ticker)) throw new Error("Ticker: 1-10 letters or numbers");
      if (!name || !/^[\x20-\x7e]{1,32}$/.test(name)) throw new Error("Name: 1-32 normal characters");
      if (uri && !/^https:\/\/[\x21-\x7e]{1,112}$/.test(uri)) throw new Error("Link must start with https://");
      const supply = Q.parseUnits($("#sp").value, dec);
      if (!supply || supply > 10n ** 19n) throw new Error("Enter a supply");
      let id;
      const b = wallet.build({ outs: [], ops: [{ type: "create", ticker, name, decimals: dec, supply, uri }], extraOuts: 1,
        finish: (tx) => { id = Q.tokenId(tx.ins[0], 0); tx.outs.push({ value: supply, asset: id, addr: wallet.receive.hash }); } });
      confirmSend(modal(""), `Create ${ticker} with a supply of ${Q.formatUnits(supply, dec)}`, b, `Created ${ticker}`,
        () => { toast("Created! It appears after the next block."); location.hash = "#/token/" + Q.hex(id); });
    } catch (e) { toast(e.message); }
  };
}

// ---------------------------------------------------------------- download
async function download() {
  view.innerHTML = `
  <h1>Get Quant</h1><p class="muted">Run your own full node, mine QNT, and trade from your desktop.</p>
  <div class="feature">
    <div class="card stack"><h2>Windows app</h2><p class="muted">Wallet, miner, coin trading and a full node in one app.</p>
      <a class="btn block" href="${DOWNLOADS.windowsApp}" rel="noopener">Download for Windows</a></div>
    <div class="card stack"><h2>Node (command line)</h2><p class="muted">quantd + quant-cli for Windows, Linux and Raspberry Pi.</p>
      <a class="btn ghost block" href="${DOWNLOADS.node}" rel="noopener">Download quantd</a></div>
    <div class="card stack"><h2>Source code</h2><p class="muted">Everything is open source. Build it yourself and check every line.</p>
      <a class="btn line block" href="${DOWNLOADS.source}" rel="noopener">View on GitHub</a></div>
  </div>`;
}

// ---------------------------------------------------------------- settings
async function settings() {
  const theme = ls.get("quant.theme") || "system";
  const adv = ls.get("quant.adv") === "1" || theme === "amoled";
  view.innerHTML = `
  <div style="max-width:560px" class="stack">
    <h1>Settings</h1>
    <div class="card stack"><h2>Appearance</h2>
      <div class="seg" id="th"><button data-t="system">System</button><button data-t="light">Light</button><button data-t="dark">Dark</button>${adv ? `<button data-t="amoled">AMOLED</button>` : ""}</div></div>
    <div class="card stack"><h2>Network</h2>
      <div><label class="f">Node address (leave empty for automatic)</label><input class="in mono" id="nd" value="${esc(ls.get("quant.node") || "")}" placeholder="https://…"></div>
      <div class="row"><button class="btn sm" id="sv">Save</button><span class="muted" style="font-size:13px">Connected to ${esc(api?.url || "nothing")}</span></div></div>
    <p class="faint" id="ver" style="font-size:12px;user-select:none">Quant web · ${NETWORK}net</p>
  </div>`;
  $$("#th button").forEach((b) => {
    b.classList.toggle("on", b.dataset.t === theme);
    b.onclick = () => { ls.set("quant.theme", b.dataset.t); if (b.dataset.t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = b.dataset.t; settings(); };
  });
  $("#sv").onclick = async () => { ls.set("quant.node", $("#nd").value.trim()); await connect(); toast(nodeOk ? "Connected" : "Can't reach that node"); settings(); };
  // AMOLED black is tucked away: tap the version line five times.
  let taps = 0;
  $("#ver").onclick = () => { if (++taps === 5) { ls.set("quant.adv", "1"); toast("AMOLED theme unlocked"); settings(); } };
}

// ---------------------------------------------------------------- start
(async () => {
  view.innerHTML = `<div class="row muted"><span class="spinner"></span>Connecting to the Quant network…</div>`;
  await Q.loadCrypto();
  await connect();
  route();
  setInterval(connect, 60000);
})();
