// iOS-style wallpapers as layered mesh gradients — crisp at any resolution,
// tiny, and legally clean (we don't bundle Apple's copyrighted image files).
// `css` is a CSS background-image value applied to the fixed wallpaper layer.
// To add a real photo later, just add an entry with css: `url("/wallpapers/x.jpg")`.
export type Wallpaper = { id: string; name: string; css: string };

const mesh = (a: string, b: string, c: string, base: string) =>
  `radial-gradient(at 18% 18%, ${a} 0, transparent 55%), radial-gradient(at 82% 8%, ${b} 0, transparent 50%), radial-gradient(at 50% 100%, ${c} 0, transparent 60%), ${base}`;

export const WALLPAPERS: Wallpaper[] = [
  { id: "sunset", name: "Sunset", css: mesh("#ff8a5c", "#ff5e8a", "#ffd16b", "linear-gradient(135deg,#ff6a88,#ff99ac)") },
  { id: "ocean", name: "Ocean", css: mesh("#2af0ea", "#1f6fff", "#0b3d91", "linear-gradient(135deg,#1fa2ff,#12d8fa)") },
  { id: "aurora", name: "Aurora", css: mesh("#43e97b", "#38f9d7", "#9b5cff", "linear-gradient(135deg,#0fd850,#7b4dff)") },
  { id: "twilight", name: "Twilight", css: mesh("#7028e4", "#4364f7", "#e94aff", "linear-gradient(135deg,#3a1c71,#5b3df5)") },
  { id: "mango", name: "Mango", css: mesh("#ffd200", "#ff7e00", "#ff4e50", "linear-gradient(135deg,#f7971e,#ffd200)") },
  { id: "grape", name: "Grape", css: mesh("#a445b2", "#d41872", "#6a11cb", "linear-gradient(135deg,#6a11cb,#b621fe)") },
  { id: "mint", name: "Mint", css: mesh("#00f5a0", "#00d9f5", "#7dffb3", "linear-gradient(135deg,#43e97b,#38f9d7)") },
  { id: "rose", name: "Rose", css: mesh("#ff5f9e", "#ff9a8b", "#ff6a88", "linear-gradient(135deg,#ff5f6d,#ffc371)") },
  { id: "midnight", name: "Midnight", css: mesh("#1c2b5a", "#2a3f7a", "#0a0f24", "linear-gradient(135deg,#0f1535,#1b2a6b)") },
  { id: "flamingo", name: "Flamingo", css: mesh("#ff61a6", "#ff8c69", "#ffd1dc", "linear-gradient(135deg,#fc5c7d,#ff8177)") },
  { id: "glacier", name: "Glacier", css: mesh("#a1c4fd", "#c2e9fb", "#e0f7ff", "linear-gradient(135deg,#a1c4fd,#c2e9fb)") },
  { id: "ember", name: "Ember", css: mesh("#ff512f", "#dd2476", "#7a1f1f", "linear-gradient(135deg,#420516,#dd2476)") },
  { id: "lagoon", name: "Lagoon", css: mesh("#00c6ff", "#0072ff", "#33ffd6", "linear-gradient(135deg,#0083b0,#00b4db)") },
  { id: "dusk", name: "Dusk", css: mesh("#ff7e5f", "#feb47b", "#6a3093", "linear-gradient(135deg,#cc2b5e,#753a88)") },
  { id: "coral", name: "Coral", css: mesh("#ff9966", "#ff5e62", "#ffd194", "linear-gradient(135deg,#ff5e62,#ff9966)") },
  { id: "indigo", name: "Indigo", css: mesh("#4e54c8", "#8f94fb", "#2b32b2", "linear-gradient(135deg,#1488cc,#2b32b2)") },
  { id: "forest", name: "Forest", css: mesh("#11998e", "#38ef7d", "#0b6e4f", "linear-gradient(135deg,#0f3d2e,#11998e)") },
  { id: "peach", name: "Peach", css: mesh("#ffecd2", "#fcb69f", "#ff9a9e", "linear-gradient(135deg,#ffdde1,#ffc3a0)") },
  { id: "steel", name: "Steel", css: mesh("#647dee", "#7f53ac", "#3a4a6b", "linear-gradient(135deg,#283e51,#4b79a1)") },
  { id: "berry", name: "Berry", css: mesh("#c94b4b", "#4b134f", "#e23e57", "linear-gradient(135deg,#4b134f,#c94b4b)") },
  { id: "sky", name: "Sky", css: mesh("#56ccf2", "#2f80ed", "#a8edea", "linear-gradient(135deg,#2f80ed,#56ccf2)") },
  { id: "lava", name: "Lava", css: mesh("#f83600", "#fe8c00", "#3a0a0a", "linear-gradient(135deg,#200122,#f83600)") },
  { id: "tide", name: "Tide", css: mesh("#1d976c", "#2193b0", "#093637", "linear-gradient(135deg,#093637,#1d976c)") },
  { id: "bloom", name: "Bloom", css: mesh("#f6d365", "#fda085", "#a18cd1", "linear-gradient(135deg,#fbc2eb,#a6c1ee)") },
  { id: "graphite", name: "Graphite", css: mesh("#3a3a40", "#26262b", "#18181b", "linear-gradient(135deg,#202024,#0e0e10)") },
];
