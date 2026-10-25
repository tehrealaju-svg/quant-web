# Quant web

Website for [Quant](https://github.com/tehrealaju-svg/quant-core): browser wallet, free meme coin
creation and on-chain trading. Static files in `site/`, deployed to GitHub Pages on every push.

* Keys are made and used only in the browser: Falcon-512 + BLAKE3 compiled from quant-core's own C
  sources to WebAssembly (`wasm/`, `site/qcrypto.wasm`). Same seed words = same wallet as the desktop app.
* Seed words are stored encrypted with the user's password (PBKDF2 + AES-GCM).
* The site talks to a quantd started with `-publicapi=17340` (read-only + `sendrawtransaction`).
  `tools/start-node.ps1` runs it behind a free Cloudflare quick tunnel and publishes the tunnel URL
  to Supabase (`supabase/001_quant_node.sql`), where the site looks it up.

## Develop
```
py -m http.server 8090 -d site        # then open http://127.0.0.1:8090
node test/vectors.mjs                  # browser crypto == quant-core
node test/e2e.mjs ../quant-core/build  # send / create coin / pool / swaps against a regtest node
CLANG="py -m ziglang cc" sh wasm/build.sh   # rebuild qcrypto.wasm (pip install ziglang)
```
For a local regtest node, in the browser console: `localStorage["quant.net"]="regtest"; localStorage["quant.node"]="http://127.0.0.1:27340/"`.
