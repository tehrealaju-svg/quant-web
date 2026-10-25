// Gifts for on-chain messages. Ids and prices mirror consensus (GIFT_PRICE in limits.h);
// the price is paid to the recipient. Each gift is a small animated SVG (css/gifts.css).
export const GIFTS = [
  null,
  { id: 1, name: "rose", label: "Rose", price: "0.1", units: 1_000_000_000n },
  { id: 2, name: "pizza", label: "Pizza", price: "0.5", units: 5_000_000_000n },
  { id: 3, name: "diamond", label: "Diamond", price: "5", units: 50_000_000_000n },
  { id: 4, name: "rocket", label: "Rocket", price: "25", units: 250_000_000_000n },
];

const ART = {
  rose: `<svg viewBox="0 0 100 100" class="g-rose">
    <g class="g-sway">
      <path d="M50 52 C48 70 52 82 50 96" stroke="#2f9e44" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path class="g-leaf" d="M50 74 C38 66 30 70 26 76 C36 80 44 80 50 74Z" fill="#40c057"/>
      <path class="g-leaf r" d="M51 82 C62 74 70 77 74 83 C64 87 57 87 51 82Z" fill="#37b24d"/>
      <g class="g-bloom">
        <path d="M30 34 C30 18 42 12 50 20 C58 12 70 18 70 34 C70 50 58 56 50 56 C42 56 30 50 30 34Z" fill="#e03131"/>
        <path d="M38 34 C38 24 46 20 50 27 C54 20 62 24 62 34 C62 44 56 48 50 48 C44 48 38 44 38 34Z" fill="#fa5252"/>
        <path d="M44 33 C44 27 48 26 50 30 C52 26 56 27 56 33 C56 38 53 41 50 41 C47 41 44 38 44 33Z" fill="#c92a2a"/>
        <path d="M30 34 C34 44 40 50 50 56 C40 56 30 50 30 34Z" fill="#c92a2a" opacity=".7"/>
      </g>
    </g>
    <g class="g-petals"><ellipse cx="22" cy="20" rx="3" ry="5" fill="#ff8787"/><ellipse cx="80" cy="30" rx="3" ry="5" fill="#ff6b6b"/><ellipse cx="74" cy="10" rx="2.5" ry="4" fill="#ffa8a8"/></g>
  </svg>`,
  pizza: `<svg viewBox="0 0 100 100" class="g-pizza">
    <g class="g-steam"><path d="M38 22 c-4 -6 4 -10 0 -16" /><path d="M50 18 c-4 -6 4 -10 0 -16" /><path d="M62 22 c-4 -6 4 -10 0 -16" /></g>
    <g class="g-bob">
      <path d="M16 34 Q50 20 84 34 L50 94 Z" fill="#f59f00"/>
      <path d="M21 38 Q50 26 79 38 L50 88 Z" fill="#ffd43b"/>
      <path class="g-drip" d="M40 66 q2 8 0 12 q-2 -4 0 -12Z" fill="#ffd43b"/>
      <path d="M14 32 Q50 16 86 32 L84 38 Q50 24 16 38 Z" fill="#e8590c"/>
      <circle cx="40" cy="44" r="6" fill="#e03131"/><circle cx="60" cy="46" r="6" fill="#e03131"/><circle cx="50" cy="62" r="5" fill="#e03131"/>
      <circle cx="47" cy="78" r="3.5" fill="#e03131"/>
      <circle cx="38" cy="43" r="1.6" fill="#ff8787"/><circle cx="58" cy="45" r="1.6" fill="#ff8787"/>
      <path d="M58 58 l5 3 -5 3Z" fill="#2f9e44"/><path d="M35 54 l4 4 -5 1Z" fill="#2f9e44"/>
    </g>
  </svg>`,
  diamond: `<svg viewBox="0 0 100 100" class="g-diamond">
    <defs>
      <linearGradient id="gd1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a5d8ff"/><stop offset=".5" stop-color="#4dabf7"/><stop offset="1" stop-color="#1864ab"/></linearGradient>
      <linearGradient id="gdshine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="gdclip"><path d="M24 36 L36 22 H64 L76 36 L50 84 Z"/></clipPath>
    </defs>
    <g class="g-float">
      <path d="M24 36 L36 22 H64 L76 36 L50 84 Z" fill="url(#gd1)"/>
      <path d="M24 36 H76 M36 22 L44 36 L50 22 L56 36 L64 22 M44 36 L50 84 L56 36" stroke="#d0ebff" stroke-width="1.5" fill="none" opacity=".8"/>
      <path d="M36 22 L44 36 L24 36Z" fill="#d0ebff" opacity=".55"/>
      <g clip-path="url(#gdclip)"><rect class="g-shine" x="-40" y="10" width="26" height="90" fill="url(#gdshine)" transform="skewX(-20)"/></g>
    </g>
    <g class="g-sparkle"><path d="M80 18 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2Z" fill="#fff"/><path d="M18 60 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5Z" fill="#d0ebff"/><path d="M84 66 l1 3 3 1 -3 1 -1 3 -1 -3 -3 -1 3 -1Z" fill="#a5d8ff"/></g>
  </svg>`,
  rocket: `<svg viewBox="0 0 100 100" class="g-rocket">
    <g class="g-stars"><circle cx="14" cy="20" r="1.6" fill="#fff"/><circle cx="84" cy="14" r="1.2" fill="#fff"/><circle cx="78" cy="56" r="1.4" fill="#fff"/><circle cx="20" cy="70" r="1" fill="#fff"/><circle cx="60" cy="8" r="1" fill="#fff"/></g>
    <g class="g-lift">
      <g class="g-flame"><path d="M42 74 Q50 100 58 74 Z" fill="#ff922b"/><path d="M45 74 Q50 92 55 74 Z" fill="#ffe066"/></g>
      <path d="M38 62 L26 76 L38 72 Z" fill="#e8590c"/><path d="M62 62 L74 76 L62 72 Z" fill="#e8590c"/>
      <path d="M50 10 C64 22 66 46 62 74 H38 C34 46 36 22 50 10Z" fill="#f1f3f5"/>
      <path d="M50 10 C57 16 61 24 63 32 H37 C39 24 43 16 50 10Z" fill="#1c7ed6"/>
      <circle cx="50" cy="44" r="7" fill="#1c7ed6" stroke="#adb5bd" stroke-width="2.5"/><circle cx="48" cy="42" r="2" fill="#a5d8ff"/>
      <path d="M44 74 H56 V78 H44Z" fill="#868e96"/>
    </g>
  </svg>`,
};

// <div class="gift gift-NAME"> with the animated art. big = the size used inside a chat bubble.
export function giftArt(id, big = false) {
  const g = GIFTS[id];
  if (!g) return "";
  return `<div class="gift gift-${g.name}${big ? " big" : ""}" title="${g.label} · ${g.price} QNT">${ART[g.name]}</div>`;
}

// One-off burst when a gift is sent or opened: the art pops in the middle of the screen with confetti.
export function giftBurst(id) {
  const g = GIFTS[id];
  if (!g) return;
  const el = document.createElement("div");
  el.className = "gift-burst";
  const colors = { rose: ["#ff6b6b", "#ffa8a8", "#40c057"], pizza: ["#ffd43b", "#e03131", "#f59f00"], diamond: ["#a5d8ff", "#4dabf7", "#fff"], rocket: ["#ff922b", "#ffe066", "#1c7ed6"] }[g.name];
  let bits = "";
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, d = 120 + Math.random() * 120;
    bits += `<i style="--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px;--r:${Math.random() * 720 - 360}deg;background:${colors[i % 3]};animation-delay:${Math.random() * 0.08}s"></i>`;
  }
  el.innerHTML = `<div class="gift-burst-in">${giftArt(id, true)}<div class="gift-burst-label">${g.label} · ${g.price} QNT</div></div>${bits}`;
  document.body.appendChild(el);
  el.addEventListener("click", () => el.remove());
  setTimeout(() => el.remove(), 2600);
}
