// End-to-end: a regtest quantd with the public API; the browser library builds and signs
// payments, a token, a pool and swaps, and the node accepts them.
//   node test/e2e.mjs [path/to/quant-core/build]
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Q from "../site/js/quant.js";

const BUILD = process.argv[2] || new URL("../../quant-core/build", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const dir = mkdtempSync(join(tmpdir(), "quant-e2e-"));
const PORT = 27399;
const node = spawn(join(BUILD, "quantd"), ["-regtest", `-datadir=${dir}`, `-publicapi=${PORT}`, "-nolisten", "-nodht", "-nolan", "-noupnp"], { stdio: "ignore" });
const cli = (...a) => execFileSync(join(BUILD, "quant-cli"), ["-regtest", `-datadir=${dir}`, ...a]).toString().trim();
const api = new Q.NodeApi(`http://127.0.0.1:${PORT}/`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const check = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };

try {
  for (let i = 0; i < 50; i++) { try { await api.call("getblockcount"); break; } catch { await sleep(200); } }
  await Q.loadCrypto(readFileSync(new URL("../site/qcrypto.wasm", import.meta.url)));
  const m = Q.masterKey(await Q.generateWords());
  const k0 = Q.keypair(m, 0), k1 = Q.keypair(m, 1);
  const a0 = Q.addressHash(k0.pk), a1 = Q.addressHash(k1.pk);
  const keys = new Map([[Q.hex(a0), k0], [Q.hex(a1), k1]]);
  const addr0 = Q.encodeAddress("rqnt", a0);
  cli("generate", "110", addr0);

  const state = async () => {
    const r = await api.call("getaddresscoins", [addr0]);
    const r1 = await api.call("getaddresscoins", [Q.encodeAddress("rqnt", a1)]);
    return { genesis: Q.unhex(r.genesis), coins: [...Q.coinsFromApi(r.coins, a0), ...Q.coinsFromApi(r1.coins, a1)] };
  };
  const send = async (plan, label) => {
    const s = await state();
    const b = Q.buildTx({ plan, coins: s.coins, keys, changeAddr: a1, genesis: s.genesis });
    const id = await api.call("sendrawtransaction", [b.hex]);
    check(id === b.txid, `${label} accepted (fee ${Q.formatUnits(b.fee)} QNT)`);
    cli("generate", "1", addr0);
    return b;
  };

  // 1. Plain payment to someone else.
  const other = Q.addressHash(Q.keypair(Q.masterKey(await Q.generateWords()), 0).pk);
  await send({ outs: [{ value: 2n * Q.COIN, asset: null, addr: other }], ops: [] }, "QNT payment");
  const oi = await api.call("getaddressinfo", [Q.encodeAddress("rqnt", other)]);
  check(oi.balance === "2.0", "recipient sees 2 QNT");

  // 2. Create a meme coin.
  let tid;
  await send({
    outs: [], ops: [{ type: "create", ticker: "WEB", name: "Web Coin", decimals: 4, supply: 1_000_000_0000n, uri: "" }], extraOuts: 1,
    finish: (tx) => { tid = Q.tokenId(tx.ins[0], 0); tx.outs.push({ value: 1_000_000_0000n, asset: tid, addr: a1 }); },
  }, "token create");
  const tok = await api.call("gettoken", [Q.hex(tid)]);
  check(tok.ticker === "WEB" && tok.supply === "1000000", "token visible on node");

  // 3. Open a pool: 50 QNT + 200,000 WEB.
  const q = 50n * Q.COIN, t = 200_000_0000n;
  const shares = Q.ammInitialShares(q, t) - Q.MIN_LIQUIDITY;
  const T = Q.hex(tid), QK = Q.hex(Q.ZERO32);
  await send({ outs: [], ops: [{ type: "poolCreate", token: tid, qnt: q, tok: t, shares }],
    opIn: new Map([[QK, q], [T, t]]), opOut: new Map([[Q.hex(Q.poolShareId(tid)), shares]]) }, "pool create");
  let pool = await api.call("getpool", [T]);
  check(pool.qnt_reserve === "50.0", "pool reserves");

  // 4. Buy with 5 QNT at the quoted price (1% slippage).
  const raw = (p) => ({ qnt: Q.parseUnits(p.qnt_reserve), tok: Q.parseUnits(p.token_reserve, 4) });
  let r = raw(pool);
  const out = (Q.ammQuote(5n * Q.COIN, r.qnt, r.tok) * 99n) / 100n;
  await send({ outs: [], ops: [{ type: "swap", token: tid, sell: false, in: 5n * Q.COIN, out }],
    opIn: new Map([[QK, 5n * Q.COIN]]), opOut: new Map([[T, out]]) }, "buy swap");

  // 5. Sell 10,000 WEB.
  pool = await api.call("getpool", [T]); r = raw(pool);
  const sin = 10_000_0000n, qout = (Q.ammQuote(sin, r.tok, r.qnt) * 99n) / 100n;
  await send({ outs: [], ops: [{ type: "swap", token: tid, sell: true, in: sin, out: qout }],
    opIn: new Map([[T, sin]]), opOut: new Map([[QK, qout]]) }, "sell swap");
  const hist = await api.call("getpoolhistory", [T]);
  check(hist.length === 3, "pool history has 3 points");

  // 6. The public API refuses wallet commands.
  let refused = false;
  try { await api.call("dumpseed", ["confirm"]); } catch { refused = true; }
  check(refused, "public API refuses private commands");
} catch (e) {
  fail++; console.log("FAIL", e.message);
} finally {
  node.kill();
  await sleep(500);
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
process.exit(fail ? 1 : 0);
