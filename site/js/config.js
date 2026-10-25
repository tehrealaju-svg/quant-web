// Site configuration. The node address changes whenever the tunnel restarts, so the node's
// computer publishes the current one to Supabase (table quant_node) and the site reads it there.
// Mainnet has not launched yet. Developers can set localStorage "quant.net" = "regtest".
export const NETWORK = (() => { try { return localStorage.getItem("quant.net") || "test"; } catch { return "test"; } })();

export const SUPABASE = {
  url: "",      // e.g. https://tizxmikbkrubyeuktxxg.supabase.co  (filled in by setup)
  anonKey: "",  // publishable key (read-only by row-level security)
};

// Used when nothing else is configured: a node on this computer running
//   quantd -publicapi=17340
export const LOCAL_NODE = "http://127.0.0.1:17340/";

export const DOWNLOADS = {
  windowsApp: "https://github.com/tehrealaju-svg/quant-app/releases/latest",
  node: "https://github.com/tehrealaju-svg/quant-core/releases/latest",
  source: "https://github.com/tehrealaju-svg/quant-core",
};
