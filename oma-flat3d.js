/**
 * OMA BUILDING — 3D-модель квартири «Reforma integral · Diseño & confort»
 * Джерело: instagram.com/p/DbdpM2WDPUn
 *
 * Інтерактивний «ляльковий дім» реального обʼєкта: салон-їдальня з відкритою
 * кухнею, хол із вбудованими шафами, дві спальні (одна — з мурал-шпалерами)
 * та ванна кімната. Уся геометрія і текстури згенеровані кодом.
 *
 * Рендер: WebGPU з автоматичним фолбеком на WebGL2 (three r185).
 * Точка входу: initOmaFlat3D(container, opts) → Promise<{ dispose, focus, … }>
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.webgpu.min.js';

/* ═══ ОБМІР КВАРТИРИ (метри) ══════════════════════════════════
   X — захід→схід (0…10.8), Z — північ→південь (0…7.2), Y — вгору (0…2.7) */
const W = 7.8, D = 13.4, WH = 2.70;
const TI = 0.11, TE = 0.20;
const CX = W / 2, CZ = D / 2;

/* Планування за фото: з тераси вглиб — ТВ ліворуч, диван праворуч,
   кухня в глибині праворуч, ліворуч від неї прохід у коридор. */
const R = {
  salon: { x0: 0,   x1: 7.8, z0: 5.9, z1: 13.4 },  // салон + відкрита кухня
  hall:  { x0: 0,   x1: 2.2, z0: 2.3, z1: 5.9  },  // коридор зі шафами
  bano:  { x0: 0,   x1: 2.2, z0: 0,   z1: 2.3  },  // ванна в торці коридору
  dorm2: { x0: 2.2, x1: 7.8, z0: 0,   z1: 3.1  },  // спальня капітоне
  dorm1: { x0: 2.2, x1: 7.8, z0: 3.1, z1: 5.9  },  // спальня з муралом
};

/* ═══ ПАЛІТРА ═════════════════════════════════════════════════ */
const C = {
  wall: 0xEDE6DE, plinth: 0xC3B7AC, skirt: 0xF6F2ED,
  cabinet: 0xF7F4F1, worktop: 0xE9E2D8, stone: 0xDCCFBE,
  sofa: 0xC0752F, sofaDark: 0xA65F22,
  wood: 0xC9A06A, woodDark: 0x8A6A44, walnut: 0x6E4F35,
  brown: 0x6B5545, cream: 0xE8DFD1, linen: 0xF6F2EA,
  rattan: 0xD9B77F, gold: 0xC7A44A, metal: 0xB9BDBE, chrome: 0xD5DADC,
  dark: 0x2A2622, glass: 0xBFD4DA, green: 0x5F7357, greenD: 0x46583F,
  porcelain: 0xF7F5F1,
};

/* ═══ БАЗОВІ ХЕЛПЕРИ ══════════════════════════════════════════ */
const mat = (color, rough = 0.85, metal = 0.0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

function add(mesh, x, y, z, parent, ry) {
  mesh.position.set(x, y, z);
  if (ry) mesh.rotation.y = ry;
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function box(w, h, d, m, x, y, z, parent, ry) {
  return add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z, parent, ry);
}

function cyl(rt, rb, h, m, x, y, z, parent, seg = 40) {
  return add(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m), x, y, z, parent);
}

function sph(r, m, x, y, z, parent, seg = 24) {
  return add(new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg / 2), m), x, y, z, parent);
}

function tor(r, t, m, x, y, z, parent, seg = 40) {
  return add(new THREE.Mesh(new THREE.TorusGeometry(r, t, 12, seg), m), x, y, z, parent);
}

/* прямокутник зі скругленими кутами */
function roundedRect(w, h, r) {
  r = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function centered(g) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -(b.max.z + b.min.z) / 2);
  g.computeVertexNormals();
  return g;
}

/* rbox — вертикальна панель зі скругленими кутами й фаскою
   (w×h у площині XY, товщина d по Z) */
function rbox(w, h, d, r, m, x, y, z, parent, ry, b = 0.012, cs = 6) {
  b = Math.max(0.002, Math.min(b, d / 2 - 0.002));
  const g = centered(new THREE.ExtrudeGeometry(roundedRect(w, h, r), {
    depth: Math.max(0.004, d - 2 * b), bevelEnabled: true,
    bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: cs, steps: 1,
  }));
  return add(new THREE.Mesh(g, m), x, y, z, parent, ry);
}

/* rslab — горизонтальна плита зі скругленим планом (w×d у плані, товщина h) */
function rslab(w, d, h, r, m, x, y, z, parent, ry, b = 0.010, cs = 6) {
  b = Math.max(0.002, Math.min(b, h / 2 - 0.002));
  const g = new THREE.ExtrudeGeometry(roundedRect(w, d, r), {
    depth: Math.max(0.004, h - 2 * b), bevelEnabled: true,
    bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: cs, steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  return add(new THREE.Mesh(centered(g), m), x, y, z, parent, ry);
}

/* каннелюри — вертикальні рифлення */
function fluted(radius, h, m, x, y, z, parent, n = 22, rr = 0.022) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(radius - rr * 0.6, radius - rr * 0.6, h, 40), m);
  core.castShadow = core.receiveShadow = true; g.add(core);
  const rod = new THREE.CylinderGeometry(rr, rr, h, 10);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = new THREE.Mesh(rod, m);
    r.position.set(Math.cos(a) * (radius - rr * 0.5), 0, Math.sin(a) * (radius - rr * 0.5));
    r.castShadow = true; g.add(r);
  }
  g.position.set(x, y, z); parent.add(g);
  return g;
}

/* штора з реальними складками */
function curtain(w, h, m, x, y, z, parent, ry = 0, folds = 9, depth = 0.055) {
  const g = new THREE.Group();
  const seg = new THREE.CylinderGeometry(depth, depth * 0.85, h, 12, 1, false, 0, Math.PI);
  for (let i = 0; i < folds; i++) {
    const f = new THREE.Mesh(seg, m);
    f.position.set(-w / 2 + (i + 0.5) * (w / folds), 0, 0);
    f.rotation.y = Math.PI / 2;
    f.rotation.z = (i % 2 ? 0.035 : -0.035);
    f.scale.set(1 + (i % 3) * 0.14, 1, 1);
    f.castShadow = f.receiveShadow = true;
    g.add(f);
  }
  g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  return g;
}

/* ковдра з мʼяким відворотом */
function duvet(w, d, m, x, y, z, parent) {
  const g = new THREE.Group();
  rslab(w, d, 0.16, 0.09, m, 0, 0, 0, g, 0, 0.05, 8);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, w, 20), m);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 0.055, -d / 2 + 0.05);
  roll.castShadow = roll.receiveShadow = true;
  g.add(roll);
  g.position.set(x, y, z); parent.add(g);
  return g;
}

/* ═══ ПРОЦЕДУРНІ ТЕКСТУРИ ═════════════════════════════════════ */
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(canvas, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function texTravertine() {
  const c = cv(512, 512), g = c.getContext('2d');
  g.fillStyle = '#DCD1C0'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = Math.random() * 26 + 3;
    g.fillStyle = `rgba(${190 + Math.random() * 45 | 0},${176 + Math.random() * 45 | 0},${156 + Math.random() * 45 | 0},${Math.random() * 0.14})`;
    g.beginPath(); g.ellipse(x, y, r, r * 0.55, Math.random() * 3.14, 0, 6.29); g.fill();
  }
  g.strokeStyle = 'rgba(160,146,126,.18)'; g.lineWidth = 1;
  for (let i = 0; i < 22; i++) {
    g.beginPath(); const y = Math.random() * 512; g.moveTo(0, y);
    for (let x = 0; x < 512; x += 32) g.lineTo(x, y + (Math.random() - 0.5) * 12);
    g.stroke();
  }
  g.strokeStyle = 'rgba(150,136,118,.38)'; g.lineWidth = 2; g.strokeRect(1, 1, 510, 510);
  return c;
}

function texMarble() {
  const c = cv(512, 512), g = c.getContext('2d');
  g.fillStyle = '#D6CBBA'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 18; i++) {
    g.strokeStyle = `rgba(${150 + Math.random() * 40 | 0},${138 + Math.random() * 40 | 0},${120 + Math.random() * 40 | 0},${0.10 + Math.random() * 0.24})`;
    g.lineWidth = 1 + Math.random() * 5;
    g.beginPath();
    let x = Math.random() * 512, y = -20; g.moveTo(x, y);
    while (y < 540) { x += (Math.random() - 0.45) * 90; y += 30 + Math.random() * 40; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.10})`;
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, Math.random() * 18, 0, 6.29); g.fill();
  }
  return c;
}

function texWood() {
  const c = cv(512, 512), g = c.getContext('2d');
  const rows = 6, hh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 160;
    for (let p = 0; p < 3; p++) {
      const x0 = (off + p * 190) % 512 - 190, w = 190;
      const tone = 150 + Math.random() * 30;
      g.fillStyle = `rgb(${tone | 0},${tone * 0.80 | 0},${tone * 0.58 | 0})`;
      g.fillRect(x0, r * hh, w, hh);
      g.strokeStyle = 'rgba(105,80,54,.38)'; g.lineWidth = 1.4;
      g.strokeRect(x0, r * hh, w, hh);
      g.strokeStyle = 'rgba(120,94,64,.20)'; g.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const y = r * hh + Math.random() * hh;
        g.beginPath(); g.moveTo(x0, y);
        for (let x = x0; x < x0 + w; x += 20) g.lineTo(x, y + (Math.random() - 0.5) * 3);
        g.stroke();
      }
    }
  }
  return c;
}

function texMural() {
  const c = cv(2048, 1024), g = c.getContext('2d');
  g.fillStyle = '#F0EAE0'; g.fillRect(0, 0, 2048, 1024);
  const ink = (a) => `rgba(92,76,58,${a})`;
  const HOR = 470;
  g.lineWidth = 1; g.strokeStyle = ink(0.16);
  for (let i = 0; i < 26; i++) {
    const y = 60 + Math.random() * 340, len = 200 + Math.random() * 700, x = Math.random() * 1400;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (Math.random() - .5) * 6); g.stroke();
  }
  g.strokeStyle = ink(0.35); g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(0, HOR - 26);
  for (let x = 0; x <= 2048; x += 48) g.lineTo(x, HOR - 26 - Math.sin(x / 190) * 12 - Math.random() * 5);
  g.stroke();
  for (let i = 0; i < 34; i++) {
    const y = HOR + i * 4.6;
    g.strokeStyle = ink(0.30 - i * 0.005); g.lineWidth = 1.2;
    g.beginPath();
    for (let x = 0; x <= 2048; x += 26) {
      const yy = y + Math.sin((x + i * 40) / 55) * (1.6 + i * 0.14);
      x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy);
    }
    g.stroke();
  }
  const dune = (base, amp, alpha, seed) => {
    g.strokeStyle = ink(alpha); g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(0, base);
    for (let x = 0; x <= 2048; x += 34)
      g.lineTo(x, base - Math.sin((x + seed) / 260) * amp - Math.sin((x + seed) / 91) * amp * 0.32);
    g.stroke();
  };
  dune(700, 58, 0.42, 0); dune(790, 44, 0.36, 380); dune(880, 34, 0.30, 900);
  g.strokeStyle = ink(0.45); g.lineWidth = 1.3;
  for (let i = 0; i < 460; i++) {
    const x = Math.random() * 2048, y = 660 + Math.random() * 350;
    for (let b = 0; b < 4; b++) {
      const hgt = 16 + Math.random() * 42, sway = (Math.random() - .5) * 26;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + sway * .4, y - hgt * .6, x + sway, y - hgt); g.stroke();
    }
  }
  const hut = (x, y, s) => {
    g.strokeStyle = ink(0.55); g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - 46 * s, y); g.lineTo(x - 46 * s, y - 44 * s);
    g.lineTo(x, y - 76 * s); g.lineTo(x + 46 * s, y - 44 * s);
    g.lineTo(x + 46 * s, y); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(x - 46 * s, y - 44 * s); g.lineTo(x + 46 * s, y - 44 * s); g.stroke();
    g.lineWidth = 1.4;
    for (let i = -2; i <= 2; i++) {
      g.beginPath(); g.moveTo(x + i * 20 * s, y); g.lineTo(x + i * 20 * s, y + 30 * s); g.stroke();
    }
    g.strokeRect(x - 13 * s, y - 34 * s, 26 * s, 24 * s);
  };
  hut(360, 690, 1.15); hut(560, 706, 0.9); hut(1500, 684, 1.0); hut(1700, 700, 0.8);
  g.strokeStyle = ink(0.4); g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(1020, 600); g.lineTo(1330, 592); g.stroke();
  for (let x = 1030; x < 1330; x += 26) { g.beginPath(); g.moveTo(x, 596); g.lineTo(x, 632); g.stroke(); }
  return c;
}

function texTufted() {
  const c = cv(256, 256), g = c.getContext('2d');
  g.fillStyle = '#E4DACA'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const cx0 = x * 64 + 32 + (y % 2) * 32, cy0 = y * 64 + 32;
    const rg = g.createRadialGradient(cx0, cy0, 2, cx0, cy0, 40);
    rg.addColorStop(0, 'rgba(160,146,124,.55)');
    rg.addColorStop(0.35, 'rgba(255,250,240,.30)');
    rg.addColorStop(1, 'rgba(200,188,168,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(cx0, cy0, 40, 0, 6.29); g.fill();
  }
  return c;
}

function texEnv() {
  const c = cv(512, 256), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0.00, '#FFFDF8'); gr.addColorStop(0.42, '#EDE7DF');
  gr.addColorStop(0.52, '#C9BFB4'); gr.addColorStop(1.00, '#8E8479');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  const sun = g.createRadialGradient(150, 52, 4, 150, 52, 90);
  sun.addColorStop(0, 'rgba(255,250,230,1)'); sun.addColorStop(1, 'rgba(255,244,220,0)');
  g.fillStyle = sun; g.fillRect(0, 0, 512, 160);
  return c;
}

function texRattan() {
  const c = cv(256, 128), g = c.getContext('2d');
  g.fillStyle = '#DCBB86'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(140,102,58,.45)'; g.lineWidth = 1.5;
  for (let x = 0; x < 256; x += 7) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  g.strokeStyle = 'rgba(255,236,200,.40)'; g.lineWidth = 2.5;
  for (let y = 0; y < 128; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  return c;
}

function texRug() {
  const c = cv(512, 512), g = c.getContext('2d');
  g.fillStyle = '#EFEAE0'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(196,182,162,.55)'; g.lineWidth = 5;
  for (let i = 0; i < 16; i++) {
    g.beginPath();
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, 22 + i * 31 + Math.sin(x / 46 + i) * 11);
    g.stroke();
  }
  return c;
}

/* ═══ СТІНИ З ПРОРІЗАМИ ═══════════════════════════════════════ */
function buildWall(parent, { axis, at, from, to, t, m, gaps = [], h = WH }) {
  const seg = (a, b, y0, y1) => {
    if (b - a < 0.005 || y1 - y0 < 0.005) return;
    const len = b - a, cy = (y0 + y1) / 2, hh = y1 - y0, mid = (a + b) / 2;
    axis === 'x' ? box(len, hh, t, m, mid, cy, at, parent)
                 : box(t, hh, len, m, at, cy, mid, parent);
  };
  const sorted = [...gaps].sort((p, q) => p.a - q.a);
  let cur = from;
  for (const gp of sorted) {
    seg(cur, gp.a, 0, h);
    if (gp.y0 > 0.005) seg(gp.a, gp.b, 0, gp.y0);
    if (gp.y1 < h - 0.005) seg(gp.a, gp.b, gp.y1, h);
    cur = gp.b;
  }
  seg(cur, to, 0, h);
}

/* ═══ ГОЛОВНА ЗБІРКА ══════════════════════════════════════════ */
export async function initOmaFlat3D(container, opts = {}) {
  const scene = new THREE.Scene();
  const flat = new THREE.Group();
  scene.add(flat);

  const envTex = new THREE.CanvasTexture(texEnv());
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = envTex;
  scene.environmentIntensity = 0.42;

  /* ── рендерер ─────────────────────────────────────────────── */
  const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  await renderer.init();

  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab';
  container.appendChild(canvas);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

  /* ── світло ───────────────────────────────────────────────── */
  const hemi = new THREE.HemisphereLight(0xE8F1FF, 0xB6A697, 0.26); scene.add(hemi);
  const amb = new THREE.AmbientLight(0xFFF6EC, 0.07); scene.add(amb);

  const sun = new THREE.DirectionalLight(0xFFEFD6, 2.45);
  sun.position.set(CX - 7, 22, CZ + 8);
  sun.target.position.set(CX, 0, CZ);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -13; sun.shadow.camera.right = 13;
  sun.shadow.camera.top = 13; sun.shadow.camera.bottom = -13;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 52;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0xDCE8FF, 0.22);
  fill.position.set(CX + 9, 9, CZ - 9);
  scene.add(fill);

  const lampLights = [];
  function lamp(x, y, z, power = 4, col = 0xFFD9A0) {
    const p = new THREE.PointLight(col, 0, 7.5, 1.8);
    p.position.set(x, y, z); p.userData.power = power;
    flat.add(p); lampLights.push(p);
    return p;
  }

  /* ═══ МАТЕРІАЛИ ═════════════════════════════════════════════ */
  const M = {
    wall:   mat(C.wall, 0.95),
    skirt:  mat(C.skirt, 0.55),
    plinth: mat(C.plinth, 0.95),
    floorS: mat(0xFFFFFF, 0.55, 0.0, { map: tex(texTravertine(), 4, 7) }),
    floorB: mat(0xFFFFFF, 0.32, 0.0, { map: tex(texMarble(), 2, 2.4) }),
    floorW: mat(0xFFFFFF, 0.60, 0.0, { map: tex(texWood(), 4, 3) }),
    tileB:  mat(0xFFFFFF, 0.26, 0.0, { map: tex(texMarble(), 1.6, 1.4) }),
    cab:    mat(C.cabinet, 0.42),
    cabE:   mat(0xF0ECE7, 0.42),
    top:    mat(C.worktop, 0.26),
    stone:  mat(C.stone, 0.55),
    sofa:   mat(C.sofa, 0.94),
    sofaD:  mat(C.sofaDark, 0.94),
    wood:   mat(C.wood, 0.58),
    woodD:  mat(C.woodDark, 0.58),
    walnut: mat(C.walnut, 0.55),
    brown:  mat(C.brown, 0.95),
    cream:  mat(C.cream, 0.90),
    linen:  mat(C.linen, 0.92),
    tuft:   mat(0xFFFFFF, 0.92, 0.0, { map: tex(texTufted(), 3, 2) }),
    rug:    mat(0xFFFFFF, 0.95, 0.0, { map: tex(texRug(), 1, 1) }),
    rattan: mat(0xFFFFFF, 0.80, 0.0, { map: tex(texRattan(), 4, 1), emissive: 0x2A1B08, emissiveIntensity: 0 }),
    gold:   mat(C.gold, 0.26, 0.85),
    metal:  mat(C.metal, 0.22, 0.9),
    chrome: mat(C.chrome, 0.10, 1.0),
    mirror: mat(0xEAF1F3, 0.04, 0.95),
    dark:   mat(C.dark, 0.45),
    screen: mat(0x0E1216, 0.12),
    porc:   mat(C.porcelain, 0.16),
    glass:  new THREE.MeshStandardMaterial({ color: C.glass, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
    green:  mat(C.green, 0.85), greenD: mat(C.greenD, 0.85),
    mural:  mat(0xFFFFFF, 0.92, 0.0, { map: tex(texMural(), 1, 1) }),
    shade:  mat(0xF3ECE0, 0.9, 0.0, { emissive: 0xFFC983, emissiveIntensity: 0 }),
    book1:  mat(0x8C5A4A, 0.8), book2: mat(0x3F4A46, 0.8), book3: mat(0xD8CBB6, 0.8),
  };
  M.mural.map.wrapS = M.mural.map.wrapT = THREE.ClampToEdgeWrapping;
  M.rug.map.wrapS = M.rug.map.wrapT = THREE.ClampToEdgeWrapping;
  const emissives = [M.rattan, M.shade];

  /* ═══ ОСНОВА, ПІДЛОГИ ═══════════════════════════════════════ */
  box(W + 0.9, 0.22, D + 0.9, M.plinth, CX, -0.13, CZ, flat);
  const floor = (r, m) => {
    const f = box(r.x1 - r.x0, 0.04, r.z1 - r.z0, m, (r.x0 + r.x1) / 2, 0.0, (r.z0 + r.z1) / 2, flat);
    f.castShadow = false; return f;
  };
  floor(R.salon, M.floorS); floor(R.hall, M.floorS); floor(R.bano, M.floorB);
  floor(R.dorm1, M.floorW); floor(R.dorm2, M.floorW);

  /* ═══ СТІНИ ═════════════════════════════════════════════════ */
  const fadeItems = [];
  const wallMat = (n, cx, cz) => {
    const m = M.wall.clone();
    m.transparent = true; m.opacity = 1;
    fadeItems.push({ m, n: new THREE.Vector3(...n), c: new THREE.Vector3(cx, WH / 2, cz), cur: 1 });
    return m;
  };
  const mN = wallMat([0, 0, -1], CX, 0);        // північ (торець спалень)
  const mS = wallMat([0, 0, 1], CX, D);         // південь (тераса)
  const mWst = wallMat([-1, 0, 0], 0, CZ);      // захід (ТВ, коридор, ванна)
  const mE = wallMat([1, 0, 0], W, CZ);         // схід (диван, кухня, спальні)
  const mA = wallMat([1, 0, 0], 2.2, 3.0);      // коридор | спальні
  const mB = wallMat([0, 0, 1], 1.10, 2.3);     // ванна | коридор
  const mC2 = wallMat([0, 0, 1], 5.00, 3.10);   // спальня 2 | спальня 1
  const mD2 = wallMat([0, 0, 1], CX, 5.9);      // салон | коридор+спальня 1

  /* північ: вікно спальні 2 + вікно ванної */
  buildWall(flat, { axis: 'x', at: -TE / 2, from: -TE / 2, to: W + TE / 2, t: TE, m: mN, gaps: [
    { a: 0.55, b: 1.30, y0: 1.35, y1: 2.15 },
    { a: 4.60, b: 6.30, y0: 0.95, y1: 2.25 },
  ]});
  /* південь: панорамне вікно салону */
  buildWall(flat, { axis: 'x', at: D + TE / 2, from: -TE / 2, to: W + TE / 2, t: TE, m: mS, gaps: [
    { a: 1.40, b: 5.40, y0: 0.45, y1: 2.30 },
  ]});
  /* захід: вхідні двері в коридор */
  buildWall(flat, { axis: 'z', at: -TE / 2, from: -TE / 2, to: D + TE / 2, t: TE, m: mWst, gaps: [
    { a: 3.40, b: 4.35, y0: 0.00, y1: 2.10 },
  ]});
  /* схід: вікно спальні 1 (у салоні глуха стіна за диваном) */
  buildWall(flat, { axis: 'z', at: W + TE / 2, from: -TE / 2, to: D + TE / 2, t: TE, m: mE, gaps: [
    { a: 4.55, b: 5.70, y0: 0.95, y1: 2.25 },
  ]});
  /* коридор | спальні */
  buildWall(flat, { axis: 'z', at: 2.2, from: 0, to: 5.9, t: TI, m: mA, gaps: [
    { a: 2.40, b: 3.12, y0: 0, y1: 2.10 },   // двері спальні 2
    { a: 4.80, b: 5.52, y0: 0, y1: 2.10 },   // двері спальні 1
  ]});
  /* ванна | коридор */
  buildWall(flat, { axis: 'x', at: 2.3, from: 0, to: 2.2, t: TI, m: mB, gaps: [
    { a: 0.60, b: 1.40, y0: 0, y1: 2.10 },
  ]});
  /* спальня 2 | спальня 1 */
  buildWall(flat, { axis: 'x', at: 3.1, from: 2.2, to: W, t: TI, m: mC2, gaps: [] });
  /* салон | коридор та спальня 1 (глуха стіна кухні + прохід ліворуч) */
  buildWall(flat, { axis: 'x', at: 5.9, from: 0, to: W, t: TI, m: mD2, gaps: [
    { a: 0.40, b: 1.85, y0: 0, y1: 2.20 },   // прохід у коридор
  ]});

  /* ── плінтуси ─────────────────────────────────────────────── */
  const SK_H = 0.085, SK_T = 0.02;
  const skirt = (axis, at, from, to) => {
    const len = to - from, mid = (from + to) / 2;
    if (len <= 0.02) return;
    axis === 'x' ? box(len, SK_H, SK_T, M.skirt, mid, SK_H / 2 + 0.02, at, flat)
                 : box(SK_T, SK_H, len, M.skirt, at, SK_H / 2 + 0.02, mid, flat);
  };
  /* салон */
  skirt('z', 0.06, 5.96, 13.34); skirt('z', 7.74, 5.96, 13.34);
  skirt('x', 13.34, 0.06, 7.74);
  skirt('x', 5.96, 0.06, 0.40); skirt('x', 5.96, 1.85, 7.74);
  /* коридор */
  skirt('z', 0.06, 2.36, 3.40); skirt('z', 0.06, 4.35, 5.845);
  skirt('z', 2.145, 2.36, 2.40); skirt('z', 2.145, 3.12, 4.80); skirt('z', 2.145, 5.52, 5.845);
  skirt('x', 2.36, 0.06, 0.60); skirt('x', 2.36, 1.40, 2.145);
  /* спальня 1 */
  skirt('z', 2.255, 3.155, 4.80); skirt('z', 2.255, 5.52, 5.845);
  skirt('z', 7.74, 3.155, 4.55); skirt('z', 7.74, 5.70, 5.845);
  skirt('x', 3.155, 2.255, 7.74); skirt('x', 5.845, 2.255, 7.74);
  /* спальня 2 */
  skirt('z', 2.255, 0.06, 2.40); skirt('z', 2.255, 3.12, 3.045);
  skirt('z', 7.74, 0.06, 3.045);
  skirt('x', 0.06, 2.255, 4.60); skirt('x', 0.06, 6.30, 7.74);
  skirt('x', 3.045, 2.255, 7.74);

  /* ── віконні рами ─────────────────────────────────────────── */
  function window3(axis, at, a, b, y0 = 0.95, y1 = 2.25) {
    const g = new THREE.Group(); flat.add(g);
    const w = b - a, h = y1 - y0, f = 0.055, t = 0.09;
    const put = (ww, hh, cx, cy) => axis === 'x'
      ? box(ww, hh, t, M.cabE, cx, cy, at, g)
      : box(t, hh, ww, M.cabE, at, cy, cx, g);
    put(w, f, (a + b) / 2, y0 + f / 2);
    put(w, f, (a + b) / 2, y1 - f / 2);
    put(f, h, a + f / 2, (y0 + y1) / 2);
    put(f, h, b - f / 2, (y0 + y1) / 2);
    put(f * 0.7, h, (a + b) / 2, (y0 + y1) / 2);
    const gl = axis === 'x'
      ? box(w - f * 2, h - f * 2, 0.012, M.glass, (a + b) / 2, (y0 + y1) / 2, at, g)
      : box(0.012, h - f * 2, w - f * 2, M.glass, at, (y0 + y1) / 2, (a + b) / 2, g);
    gl.castShadow = false;
    const inw = axis === 'x' ? (at < CZ ? 0.11 : -0.11) : (at < CX ? 0.11 : -0.11);
    axis === 'x' ? box(w + 0.10, 0.035, 0.26, M.top, (a + b) / 2, y0 - 0.02, at + inw, g)
                 : box(0.26, 0.035, w + 0.10, M.top, at + inw, y0 - 0.02, (a + b) / 2, g);
  }
  window3('x', 0, 4.60, 6.30);            // спальня 2
  window3('x', 0, 0.55, 1.30, 1.35, 2.15); // ванна
  window3('z', W, 4.55, 5.70);            // спальня 1
  window3('x', D, 1.40, 5.40, 0.45, 2.30);  // салон

  /* ── дверні полотна ───────────────────────────────────────── */
  function door(hx, hz, width, ry, m = M.cabE) {
    const g = new THREE.Group();
    g.position.set(hx, 0, hz);
    g.rotation.y = ry;
    rbox(width, 2.05, 0.042, 0.012, m, 0, 1.045, 0, g, 0, 0.006, 3).translateX(width / 2);
    const hd = cyl(0.014, 0.014, 0.13, M.chrome, 0, 0, 0, g, 14);
    hd.rotation.z = Math.PI / 2;
    hd.position.set(width - 0.09, 1.05, 0.055);
    const hd2 = hd.clone(); hd2.position.z = -0.055; g.add(hd2);
    flat.add(g);
    return g;
  }
  door(2.2, 2.43, 0.70, -0.62);              // спальня 2 — прочинені
  door(2.2, 4.83, 0.70, -0.55);              // спальня 1 — прочинені
  door(1.38, 2.3, 0.70, Math.PI + 0.75);     // ванна
  door(0, 3.43, 0.90, 0.0, M.walnut);        // вхідні

  /* ═══ САЛОН · КУХНЯ ════════════════════════════════════════
     Глибина салону — з півдня (вікно) на північ (кухня).
     Ліворуч (захід) — стіна з ТБ, праворуч (схід) — диван.      */
  const salon = new THREE.Group(); flat.add(salon);
  const kz = 5.96;                       // внутрішня площина стіни кухні

  /* колона холодильника — лівий край кухонного блоку */
  rbox(0.80, 2.20, 0.66, 0.010, M.cab, 2.95, 1.10, kz + 0.33, salon, 0, 0.008, 3);
  box(0.76, 0.012, 0.02, M.chrome, 2.95, 1.34, kz + 0.665, salon);
  box(0.02, 0.90, 0.03, M.chrome, 3.31, 0.55, kz + 0.675, salon);
  box(0.02, 0.70, 0.03, M.chrome, 3.31, 1.75, kz + 0.675, salon);

  /* нижній ряд — окремі фасади */
  let bx = 3.40;
  for (const w of [0.72, 0.72, 0.86, 0.72, 0.72, 0.58]) {
    rbox(w - 0.014, 0.80, 0.60, 0.008, M.cab, bx + w / 2, 0.46, kz + 0.30, salon, 0, 0.006, 3);
    box(w * 0.55, 0.014, 0.02, M.chrome, bx + w / 2, 0.80, kz + 0.605, salon);
    bx += w;
  }
  rbox(0.62, 0.52, 0.03, 0.02, M.screen, 6.60, 0.50, kz + 0.605, salon, 0, 0.008, 4);
  box(0.54, 0.022, 0.03, M.chrome, 6.60, 0.79, kz + 0.615, salon);
  box(4.32, 0.06, 0.10, M.dark, 5.56, 0.03, kz + 0.30, salon);
  rslab(4.40, 0.66, 0.045, 0.01, M.top, 5.56, 0.885, kz + 0.33, salon);
  box(4.32, 0.55, 0.02, M.stone, 5.56, 1.185, kz + 0.012, salon);

  /* верхній ряд */
  let ux = 4.95;
  for (let i = 0; i < 4; i++) {
    const w = 0.6925;
    rbox(w - 0.014, 0.70, 0.36, 0.008, M.cab, ux + w / 2, 1.82, kz + 0.18, salon, 0, 0.006, 3);
    box(w * 0.5, 0.014, 0.02, M.chrome, ux + w / 2, 1.50, kz + 0.365, salon);
    ux += w;
  }
  rbox(0.70, 0.36, 0.36, 0.008, M.cab, 4.30, 2.00, kz + 0.18, salon, 0, 0.006, 3);

  /* мийка, варильна, витяжка */
  rslab(0.52, 0.40, 0.03, 0.03, M.porc, 4.00, 0.895, kz + 0.31, salon);
  rslab(0.44, 0.32, 0.06, 0.03, M.top, 4.00, 0.855, kz + 0.31, salon);
  cyl(0.016, 0.016, 0.30, M.chrome, 4.00, 1.05, kz + 0.10, salon, 16);
  tor(0.09, 0.015, M.chrome, 4.00, 1.20, kz + 0.19, salon, 24).rotation.set(Math.PI / 2, 0, 0);
  rslab(0.60, 0.50, 0.014, 0.02, M.screen, 5.60, 0.915, kz + 0.31, salon);
  for (const [dx, dz] of [[-0.14, -0.10], [0.14, -0.10], [-0.14, 0.11], [0.14, 0.11]])
    tor(0.075, 0.006, M.dark, 5.60 + dx, 0.925, kz + 0.31 + dz, salon, 28).rotation.x = Math.PI / 2;
  rbox(0.66, 0.13, 0.44, 0.02, M.chrome, 5.60, 1.74, kz + 0.22, salon, 0, 0.01, 4);
  box(0.24, 0.55, 0.22, M.chrome, 5.60, 2.10, kz + 0.13, salon);
  cyl(0.055, 0.06, 0.20, M.dark, 7.15, 0.99, kz + 0.30, salon, 24);
  rslab(0.30, 0.20, 0.02, 0.02, M.wood, 4.55, 0.90, kz + 0.30, salon);
  for (let i = 0; i < 3; i++)
    cyl(0.035, 0.035, 0.14 + i * 0.03, M.stone, 4.45 + i * 0.09, 0.96 + i * 0.015, kz + 0.44, salon, 18);

  /* обідній стіл перед кухнею */
  const dt = new THREE.Group(); dt.position.set(4.80, 0, 8.10); salon.add(dt);
  cyl(0.66, 0.66, 0.055, M.wood, 0, 0.752, 0, dt, 56);
  tor(0.66, 0.028, M.wood, 0, 0.752, 0, dt, 56).rotation.x = Math.PI / 2;
  fluted(0.20, 0.70, M.wood, 0, 0.37, 0, dt, 24, 0.024);
  cyl(0.34, 0.37, 0.05, M.wood, 0, 0.03, 0, dt, 44);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const ch = new THREE.Group();
    ch.position.set(Math.cos(a) * 0.98, 0, Math.sin(a) * 0.98);
    ch.rotation.y = -a + Math.PI / 2;
    rslab(0.46, 0.44, 0.11, 0.09, M.cream, 0, 0.45, 0, ch, 0, 0.03, 8);
    rbox(0.46, 0.52, 0.11, 0.16, M.cream, 0, 0.74, -0.185, ch, 0, 0.03, 8).rotation.x = -0.11;
    for (const [dx, dz] of [[-0.18, -0.16], [0.18, -0.16], [-0.18, 0.16], [0.18, 0.16]])
      cyl(0.020, 0.014, 0.42, M.wood, dx, 0.21, dz, ch, 14);
    dt.add(ch);
    const px = Math.cos(a) * 0.42, pz = Math.sin(a) * 0.42;
    cyl(0.115, 0.115, 0.012, M.porc, px, 0.787, pz, dt, 32);
    cyl(0.032, 0.026, 0.09, M.glass, px + Math.cos(a + 1.1) * 0.14, 0.825, pz + Math.sin(a + 1.1) * 0.14, dt, 20);
  }
  cyl(0.075, 0.055, 0.16, M.stone, 0, 0.86, 0, dt, 28);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * 6.28;
    const l = box(0.03, 0.20, 0.09, M.green, Math.cos(a) * 0.05, 1.02, Math.sin(a) * 0.05, dt);
    l.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
  }

  /* килим перед ТБ */
  rslab(3.80, 3.40, 0.016, 0.03, M.rug, 3.30, 0.030, 10.60, salon, 0, 0.004, 4).castShadow = false;

  /* диван уздовж східної стіни, спинкою до неї */
  const sf = new THREE.Group(); sf.position.set(7.24, 0, 10.70); salon.add(sf);
  rbox(0.98, 0.34, 2.50, 0.04, M.sofaD, 0, 0.23, 0, sf, 0, 0.012, 5);
  for (const z of [-0.82, 0, 0.82])
    rslab(0.86, 0.80, 0.22, 0.06, M.sofa, -0.03, 0.51, z, sf, 0, 0.05, 8);
  for (const z of [-0.82, 0, 0.82])
    rbox(0.80, 0.56, 0.26, 0.08, M.sofa, 0.34, 0.72, z, sf, Math.PI / 2, 0.05, 8);
  rbox(0.40, 0.40, 0.13, 0.05, M.cream, 0.19, 0.85, -0.64, sf, Math.PI / 2, 0.05, 8).rotation.x = -0.22;
  rbox(0.38, 0.38, 0.13, 0.05, M.brown, 0.19, 0.84, 0.64, sf, Math.PI / 2, 0.05, 8).rotation.x = -0.18;
  for (const [x, z] of [[-0.36, -1.14], [0.36, -1.14], [-0.36, 1.14], [0.36, 1.14]])
    cyl(0.024, 0.018, 0.16, M.woodD, x, 0.08, z, sf, 14);

  /* журнальні столики */
  fluted(0.34, 0.40, M.cab, 5.30, 0.20, 10.30, salon, 22, 0.024);
  cyl(0.38, 0.38, 0.05, M.cab, 5.30, 0.425, 10.30, salon, 48);
  fluted(0.27, 0.32, M.cab, 5.48, 0.16, 11.08, salon, 18, 0.022);
  cyl(0.30, 0.30, 0.045, M.cab, 5.48, 0.345, 11.08, salon, 40);
  for (let i = 0; i < 3; i++)
    rslab(0.24, 0.17, 0.028, 0.006, [M.book1, M.book2, M.book3][i], 5.27, 0.47 + i * 0.03, 10.30, salon, i * 0.22, 0.004, 3);
  cyl(0.05, 0.04, 0.11, M.stone, 5.48, 0.42, 11.08, salon, 24);

  /* ТБ і тумба на західній стіні */
  rbox(1.46, 0.82, 0.05, 0.012, M.dark, 0.11, 1.42, 10.50, salon, Math.PI / 2, 0.008, 3);
  rbox(1.38, 0.75, 0.02, 0.008, M.screen, 0.14, 1.42, 10.50, salon, Math.PI / 2, 0.006, 3);
  rbox(1.96, 0.44, 0.42, 0.012, M.woodD, 0.34, 0.32, 10.50, salon, Math.PI / 2, 0.008, 3);
  rslab(0.44, 2.00, 0.03, 0.01, M.top, 0.34, 0.55, 10.50, salon);
  for (const z of [10.03, 10.97]) box(0.02, 0.014, 0.36, M.chrome, 0.56, 0.32, z, salon);
  for (const [x, z] of [[0.18, 9.62], [0.50, 9.62], [0.18, 11.38], [0.50, 11.38]])
    cyl(0.018, 0.014, 0.11, M.woodD, x, 0.055, z, salon, 12);
  cyl(0.10, 0.08, 0.22, M.stone, 0.34, 0.67, 11.16, salon, 28);
  for (let i = 0; i < 4; i++)
    rbox(0.16, 0.23, 0.032, 0.005, [M.book1, M.book2, M.book3, M.book1][i], 0.34, 0.685, 9.94 + i * 0.04, salon, 0, 0.004, 3);

  /* висока плетена підлогова лампа біля їдальні */
  cyl(0.20, 0.20, 0.02, M.chrome, 7.32, 0.02, 8.60, salon, 32);
  cyl(0.022, 0.022, 0.62, M.chrome, 7.32, 0.33, 8.60, salon, 16);
  cyl(0.21, 0.23, 0.74, M.shade, 7.32, 1.02, 8.60, salon, 40);
  lamp(7.32, 1.05, 8.60, 4.4);

  /* ротангова люстра над вітальнею */
  cyl(0.010, 0.010, 0.45, M.dark, 3.40, 2.47, 10.30, salon, 10);
  const disc = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.22, 56, 1, true), M.rattan);
  disc.material.side = THREE.DoubleSide;
  add(disc, 3.40, 2.30, 10.30, salon);
  tor(0.62, 0.016, M.rattan, 3.40, 2.19, 10.30, salon, 48).rotation.x = Math.PI / 2;
  cyl(0.085, 0.085, 0.11, M.shade, 3.40, 2.19, 10.30, salon, 24);
  lamp(3.40, 2.12, 10.30, 11.0);

  /* кругле дзеркало на східній стіні */
  const mir = new THREE.Group(); mir.position.set(7.71, 1.62, 7.90); salon.add(mir);
  tor(0.42, 0.026, M.gold, 0, 0, 0, mir, 56).rotation.y = Math.PI / 2;
  cyl(0.42, 0.42, 0.02, M.mirror, -0.01, 0, 0, mir, 56).rotation.z = Math.PI / 2;

  /* штори біля вікна */
  curtain(0.44, 2.42, M.linen, 1.12, 1.25, 13.14, salon);
  curtain(0.44, 2.42, M.linen, 5.68, 1.25, 13.14, salon);
  box(4.90, 0.03, 0.03, M.chrome, 3.40, 2.47, 13.14, salon);

  /* рослина в кутку */
  cyl(0.21, 0.155, 0.36, M.stone, 7.30, 0.18, 12.80, salon, 32);
  cyl(0.19, 0.19, 0.03, M.woodD, 7.30, 0.35, 12.80, salon, 32);
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * 6.28 + i * 0.7, len = 0.42 + (i % 3) * 0.16;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), i % 2 ? M.green : M.greenD);
    l.scale.set(0.30, 1.0, 0.62);
    add(l, 7.30 + Math.cos(a) * 0.16, 0.42 + len, 12.80 + Math.sin(a) * 0.16, salon);
    l.rotation.set(Math.sin(a) * 0.42, a, Math.cos(a) * 0.42);
  }

  /* ═══ КОРИДОР ═══════════════════════════════════════════════ */
  const hall = new THREE.Group(); flat.add(hall);
  for (let i = 0; i < 3; i++)
    rbox(0.94, 2.38, 0.58, 0.008, M.cab, 0.35, 1.23, 2.90 + i * 0.96, hall, Math.PI / 2, 0.006, 3);
  for (const z of [3.34, 4.30, 5.26]) box(0.02, 1.30, 0.02, M.chrome, 0.65, 1.30, z, hall);
  box(0.50, 0.42, 0.62, mat(0xE7E1D9, 0.7), 0.32, 1.62, 3.55, hall);
  box(0.50, 0.42, 0.62, mat(0xE7E1D9, 0.7), 0.32, 1.12, 4.55, hall);
  box(0.62, 0.05, 2.90, M.dark, 0.35, 0.045, 4.35, hall);
  rslab(0.86, 2.70, 0.018, 0.02, M.brown, 1.52, 0.032, 4.40, hall, 0, 0.004, 4).castShadow = false;
  cyl(0.07, 0.06, 0.13, M.stone, 0.32, 1.90, 3.55, hall, 24);
  lamp(1.10, 2.35, 4.40, 4.0);

  /* ═══ ВАННА ═════════════════════════════════════════════════
     За фото: бежевий мармур на всю висоту, підвісна біла тумба
     з двома шухлядами й інтегрованою раковиною, арочне дзеркало
     з підсвіткою, підвісний унітаз із хромовою клавішею,
     душ за плитковою перегородкою з квадратною тропічною лійкою. */
  const ba = new THREE.Group(); flat.add(ba);
  const bx0 = 0.06, bx1 = 2.145, bz0 = 0.06, bz1 = 2.245;

  /* суцільне облицювання мармуром */
  box(bx1 - bx0, 2.45, 0.02, M.tileB, (bx0 + bx1) / 2, 1.225, bz0 + 0.01, ba).castShadow = false;
  box(0.02, 2.45, bz1 - bz0, M.tileB, bx0 + 0.01, 1.225, (bz0 + bz1) / 2, ba).castShadow = false;
  box(0.02, 2.45, bz1 - bz0, M.tileB, bx1 - 0.01, 1.225, (bz0 + bz1) / 2, ba).castShadow = false;
  box(0.54, 2.45, 0.02, M.tileB, 0.33, 1.225, bz1 - 0.01, ba).castShadow = false;
  box(0.74, 2.45, 0.02, M.tileB, 1.775, 1.225, bz1 - 0.01, ba).castShadow = false;

  /* ── тумба: два глянцеві фасади-шухляди ─────────────────── */
  rbox(1.30, 0.24, 0.50, 0.010, M.cab, 0.31, 0.74, 1.10, ba, Math.PI / 2, 0.006, 3);
  rbox(1.30, 0.24, 0.50, 0.010, M.cab, 0.31, 0.48, 1.10, ba, Math.PI / 2, 0.006, 3);
  box(0.50, 0.012, 1.28, mat(0xE3DDD5, 0.5), 0.31, 0.612, 1.10, ba);
  /* стільниця з інтегрованою раковиною */
  rslab(0.54, 1.36, 0.10, 0.014, M.porc, 0.32, 0.91, 1.10, ba);
  rslab(0.38, 0.66, 0.055, 0.09, mat(0xF2EFEA, 0.14), 0.29, 0.905, 0.86, ba, 0, 0.02, 10);
  cyl(0.022, 0.022, 0.012, M.chrome, 0.29, 0.935, 0.86, ba, 20);
  /* хромовий змішувач */
  rbox(0.07, 0.13, 0.07, 0.014, M.chrome, 0.16, 1.03, 0.86, ba, 0, 0.008, 4);
  box(0.16, 0.035, 0.045, M.chrome, 0.235, 1.075, 0.86, ba);
  rbox(0.05, 0.10, 0.02, 0.008, M.chrome, 0.16, 1.14, 0.80, ba, 0, 0.006, 3);
  /* таця з флаконами */
  cyl(0.10, 0.10, 0.022, mat(0xE0D6C6, 0.6), 0.30, 0.972, 1.48, ba, 32);
  cyl(0.032, 0.032, 0.14, mat(0xF4F1EC, 0.25), 0.27, 1.05, 1.45, ba, 20);
  rbox(0.06, 0.13, 0.06, 0.014, mat(0x8FD3D8, 0.18), 0.34, 1.05, 1.52, ba, 0, 0.008, 4);
  for (let i = 0; i < 5; i++)
    cyl(0.004, 0.004, 0.13, M.wood, 0.26 + (i % 2) * 0.02, 1.14, 1.42 + i * 0.012, ba, 6).rotation.z = 0.12 * (i - 2);

  /* ── арочне дзеркало з підсвіткою ───────────────────────── */
  rbox(0.68, 1.02, 0.014, 0.30, mat(0xFFFFFF, 0.55, 0, { emissive: 0xFFEBCB, emissiveIntensity: 1.6 }),
       bx0 + 0.018, 1.62, 1.05, ba, Math.PI / 2, 0.006, 12);
  rbox(0.60, 0.94, 0.020, 0.27, M.mirror, bx0 + 0.036, 1.62, 1.05, ba, Math.PI / 2, 0.008, 12);
  lamp(bx0 + 0.34, 1.66, 1.05, 3.6, 0xFFF1DC);
  /* розетка */
  rbox(0.08, 0.08, 0.012, 0.012, mat(0xF6F4F1, 0.4), bx0 + 0.014, 1.28, 1.72, ba, Math.PI / 2, 0.005, 3);

  /* ── підвісний унітаз із хромовою клавішею ──────────────── */
  rbox(0.50, 1.08, 0.22, 0.012, M.cab, 1.15, 0.54, bz0 + 0.11, ba, 0, 0.008, 3);
  box(0.50, 0.02, 0.24, M.tileB, 1.15, 1.08, bz0 + 0.12, ba);
  rslab(0.36, 0.56, 0.30, 0.15, M.porc, 1.15, 0.50, bz0 + 0.46, ba, 0, 0.07, 12);
  rslab(0.30, 0.46, 0.22, 0.13, M.porc, 1.15, 0.42, bz0 + 0.50, ba, 0, 0.06, 12);
  rslab(0.35, 0.50, 0.045, 0.15, mat(0xF8F6F3, 0.2), 1.15, 0.665, bz0 + 0.46, ba, 0, 0.015, 12);
  rbox(0.22, 0.14, 0.016, 0.02, M.chrome, 1.15, 1.00, bz0 + 0.02, ba, 0, 0.006, 4);
  box(0.09, 0.02, 0.02, mat(0xA9AEB0, 0.3), 1.11, 1.00, bz0 + 0.012, ba);

  /* ── ніша з підсвіткою ──────────────────────────────────── */
  box(0.20, 0.92, 0.10, mat(0xE9E2D8, 0.6), 0.72, 1.62, bz0 + 0.05, ba);
  box(0.16, 0.88, 0.02, mat(0xFFFFFF, 0.5, 0, { emissive: 0xFFE4B8, emissiveIntensity: 1.3 }), 0.72, 1.62, bz0 + 0.005, ba);
  cyl(0.035, 0.035, 0.11, mat(0xF4F1EC, 0.25), 0.72, 1.26, bz0 + 0.06, ba, 20);
  for (let i = 0; i < 6; i++)
    cyl(0.004, 0.004, 0.16, M.wood, 0.70 + (i % 3) * 0.015, 1.38, bz0 + 0.05 + (i % 2) * 0.015, ba, 6).rotation.z = 0.15 * (i - 3);

  /* ── душ за плитковою перегородкою ──────────────────────── */
  const PIER_X = 1.46;
  box(0.10, 2.10, 0.80, M.tileB, PIER_X, 1.05, bz0 + 0.40, ba);        // перегородка
  box(0.12, 0.04, 0.82, mat(0xEFE9DF, 0.35), PIER_X, 2.12, bz0 + 0.40, ba);
  rslab(0.62, 1.32, 0.04, 0.01, M.tileB, 1.82, 0.025, 0.72, ba).castShadow = false;
  cyl(0.05, 0.05, 0.014, M.chrome, 1.82, 0.048, 0.72, ba, 28);
  /* хромова душова колона на дальній стіні */
  cyl(0.018, 0.018, 0.86, M.chrome, 1.86, 1.62, bz0 + 0.07, ba, 20);
  rbox(0.16, 0.09, 0.09, 0.02, M.chrome, 1.86, 1.14, bz0 + 0.10, ba, 0, 0.01, 5);
  cyl(0.016, 0.016, 0.10, M.chrome, 1.86, 2.05, bz0 + 0.07, ba, 16).rotation.x = 0;
  const arm = cyl(0.016, 0.016, 0.26, M.chrome, 1.86, 2.09, bz0 + 0.20, ba, 16);
  arm.rotation.x = Math.PI / 2;
  tor(0.05, 0.016, M.chrome, 1.86, 2.05, bz0 + 0.09, ba, 20).rotation.y = Math.PI / 2;
  rslab(0.24, 0.24, 0.026, 0.016, M.chrome, 1.86, 2.06, bz0 + 0.32, ba);   // квадратна лійка
  /* ручний душ на штанзі */
  cyl(0.012, 0.012, 0.20, M.chrome, 1.72, 1.52, bz0 + 0.08, ba, 14).rotation.z = 0.35;
  cyl(0.020, 0.020, 0.11, M.chrome, 1.66, 1.44, bz0 + 0.09, ba, 16).rotation.set(0.5, 0, 0.4);
  /* поличка з флаконами в душі */
  box(0.44, 0.02, 0.14, mat(0xEFE9DF, 0.4), 1.86, 1.02, bz0 + 0.08, ba);
  cyl(0.028, 0.028, 0.13, mat(0xE6EFEA, 0.3), 1.78, 1.09, bz0 + 0.09, ba, 18);
  cyl(0.026, 0.026, 0.11, mat(0xEDE4EE, 0.3), 1.93, 1.08, bz0 + 0.09, ba, 18);

  /* рушники біля дверей */
  box(0.02, 0.02, 0.50, M.chrome, bx0 + 0.03, 1.28, 2.00, ba);
  rslab(0.08, 0.26, 0.42, 0.03, M.linen, bx0 + 0.11, 1.07, 1.92, ba, 0, 0.02, 6);
  rslab(0.08, 0.24, 0.36, 0.03, M.cream, bx0 + 0.11, 1.09, 2.10, ba, 0, 0.02, 6);

  /* ═══ СПАЛЬНЯ 2 — капітоне ══════════════════════════════════ */
  const d2 = new THREE.Group(); flat.add(d2);
  const b2 = new THREE.Group(); b2.position.set(6.61, 0, 1.62); d2.add(b2);
  rbox(2.02, 0.24, 1.62, 0.02, M.woodD, 0, 0.16, 0, b2, 0, 0.01, 4);
  rslab(1.96, 1.56, 0.28, 0.05, M.linen, 0, 0.42, 0, b2, 0, 0.05, 8);
  duvet(1.30, 1.52, M.cream, -0.28, 0.62, 0, b2);
  rslab(0.64, 1.50, 0.10, 0.04, M.linen, 0.56, 0.62, 0, b2, 0, 0.03, 6);
  for (const z of [-0.36, 0.36]) {
    rslab(0.48, 0.62, 0.17, 0.09, M.linen, 0.68, 0.65, z, b2, 0.05, 0.06, 8);
    rslab(0.36, 0.48, 0.13, 0.08, M.linen, 0.44, 0.74, z, b2, -0.15, 0.05, 8);
  }
  rslab(0.30, 0.34, 0.11, 0.06, M.cream, 0.46, 0.76, 0, b2, 0.3, 0.05, 8);
  const hb2 = new THREE.Group(); hb2.position.set(1.02, 0, 0); b2.add(hb2);
  rbox(1.68, 1.24, 0.18, 0.06, M.tuft, 0, 0.86, 0, hb2, Math.PI / 2, 0.05, 8);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++)
    sph(0.020, M.cream, -0.088, 0.50 + j * 0.30, -0.62 + i * 0.31, hb2, 14);
  for (const z of [-1.06, 1.06]) {
    rbox(0.44, 0.42, 0.38, 0.014, M.wood, 7.45, 0.35, 1.62 + z, d2, Math.PI / 2, 0.008, 3);
    box(0.02, 0.014, 0.14, M.chrome, 7.25, 0.35, 1.62 + z, d2);
    for (const [dx, dz] of [[-0.16, -0.14], [0.16, -0.14], [-0.16, 0.14], [0.16, 0.14]])
      cyl(0.014, 0.011, 0.13, M.wood, 7.45 + dz, 0.07, 1.62 + z + dx, d2, 10);
    cyl(0.10, 0.115, 0.20, M.shade, 7.59, 1.54, 1.62 + z, d2, 32);
    box(0.03, 0.24, 0.03, M.chrome, 7.66, 1.35, 1.62 + z, d2);
    lamp(7.45, 1.54, 1.62 + z, 2.9);
  }
  const mir2 = new THREE.Group(); mir2.position.set(7.70, 2.06, 1.62); d2.add(mir2);
  tor(0.40, 0.024, M.gold, 0, 0, 0, mir2, 56).rotation.y = Math.PI / 2;
  cyl(0.40, 0.40, 0.02, M.mirror, -0.01, 0, 0, mir2, 56).rotation.z = Math.PI / 2;
  cyl(0.009, 0.009, 0.40, M.dark, 5.20, 2.50, 1.62, d2, 10);
  cyl(0.28, 0.28, 0.32, M.shade, 5.20, 2.16, 1.62, d2, 44);
  lamp(5.20, 2.10, 1.62, 7.2);
  curtain(0.42, 2.40, M.linen, 4.38, 1.24, 0.28, d2, Math.PI);
  curtain(0.42, 2.40, M.linen, 6.52, 1.24, 0.28, d2, Math.PI);
  box(2.40, 0.03, 0.03, M.chrome, 5.45, 2.45, 0.28, d2);
  rslab(1.90, 1.00, 0.018, 0.02, M.cream, 4.90, 0.030, 1.62, d2, 0, 0.004, 4).castShadow = false;

  /* ═══ СПАЛЬНЯ 1 — мурал ═════════════════════════════════════ */
  const d1 = new THREE.Group(); flat.add(d1);
  const mu = box(5.48, 2.62, 0.02, M.mural, 5.00, 1.31, 3.17, d1);
  mu.castShadow = false;
  M.mural.transparent = true;
  fadeItems.push({ m: M.mural, n: new THREE.Vector3(0, 0, 1), c: new THREE.Vector3(5.00, WH / 2, 3.1), cur: 1 });

  const b1 = new THREE.Group(); b1.position.set(5.00, 0, 4.35); d1.add(b1);
  rbox(1.62, 0.24, 2.02, 0.02, M.woodD, 0, 0.16, 0, b1, 0, 0.01, 4);
  rslab(1.56, 1.96, 0.26, 0.05, M.linen, 0, 0.41, 0, b1, 0, 0.05, 8);
  duvet(1.52, 1.72, M.linen, 0, 0.60, 0.10, b1);
  rslab(1.50, 0.62, 0.06, 0.04, M.cream, 0, 0.70, 0.60, b1, 0, 0.02, 6);
  for (const x of [-0.36, 0.36]) {
    rslab(0.62, 0.46, 0.16, 0.09, M.linen, x, 0.64, -0.70, b1, 0.05, 0.06, 8);
    rslab(0.52, 0.38, 0.13, 0.08, M.linen, x, 0.76, -0.60, b1, -0.12, 0.05, 8);
  }
  const hb = new THREE.Group(); hb.position.set(0, 0, -1.06); b1.add(hb);
  rbox(1.60, 1.36, 0.16, 0.30, M.brown, 0, 1.02, 0, hb, 0, 0.05, 12);
  for (const x of [-1.10, 1.10]) {
    rbox(0.44, 0.40, 0.38, 0.014, M.woodD, 5.00 + x, 0.34, 3.62, d1, 0, 0.008, 3);
    box(0.14, 0.014, 0.02, M.chrome, 5.00 + x, 0.34, 3.82, d1);
    for (const [dx, dz] of [[-0.16, -0.14], [0.16, -0.14], [-0.16, 0.14], [0.16, 0.14]])
      cyl(0.014, 0.011, 0.14, M.woodD, 5.00 + x + dx, 0.07, 3.62 + dz, d1, 10);
  }
  cyl(0.05, 0.04, 0.09, M.stone, 3.90, 0.585, 3.62, d1, 24);
  for (let i = 0; i < 3; i++)
    rslab(0.20, 0.14, 0.026, 0.005, [M.book2, M.book3, M.book1][i], 6.10, 0.555 + i * 0.028, 3.62, d1, 0.2 * i, 0.004, 3);
  rbox(0.16, 0.30, 0.22, 0.04, M.rattan, 6.60, 1.46, 3.22, d1, 0, 0.02, 6);
  lamp(6.60, 1.46, 3.40, 2.9);
  cyl(0.009, 0.009, 0.36, M.dark, 5.00, 2.50, 4.55, d1, 10);
  const d1s = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.20, 48, 1, true), M.rattan);
  d1s.material.side = THREE.DoubleSide;
  add(d1s, 5.00, 2.30, 4.55, d1);
  tor(0.52, 0.014, M.rattan, 5.00, 2.20, 4.55, d1, 44).rotation.x = Math.PI / 2;
  lamp(5.00, 2.18, 4.55, 7.2);
  for (let i = 0; i < 2; i++)
    rbox(0.85, 2.38, 0.58, 0.008, M.cab, 2.55, 1.23, 3.70 + i * 0.87, d1, Math.PI / 2, 0.006, 3);
  for (let i = 0; i < 2; i++)
    rbox(0.77, 2.24, 0.02, 0.01, M.mirror, 2.85, 1.24, 3.70 + i * 0.87, d1, Math.PI / 2, 0.006, 3);
  for (const z of [4.10, 4.55]) box(0.03, 1.30, 0.02, M.chrome, 2.865, 1.30, z, d1);
  curtain(0.40, 2.40, M.linen, 7.64, 1.24, 4.42, d1, Math.PI / 2);
  curtain(0.40, 2.40, M.linen, 7.64, 1.24, 5.82, d1, Math.PI / 2);
  rslab(0.90, 1.80, 0.018, 0.02, M.cream, 3.60, 0.030, 4.60, d1, 0, 0.004, 4).castShadow = false;

  /* ═══ ПІДПИСИ КІМНАТ ═══════════════════════════════════════ */
  const PINS = opts.labels || [
    { k: 'm3_salon',  t: 'Salón-comedor', p: [3.3, 1.30, 10.80] },
    { k: 'm3_cocina', t: 'Cocina',        p: [5.5, 1.60, 6.60] },
    { k: 'm3_hall',   t: 'Hall',          p: [1.3, 1.30, 4.90] },
    { k: 'm3_bano',   t: 'Baño',          p: [1.1, 1.45, 1.15] },
    { k: 'm3_d1',     t: 'Dormitorio 1',  p: [5.0, 1.35, 4.60] },
    { k: 'm3_d2',     t: 'Dormitorio 2',  p: [5.1, 1.35, 1.62] },
  ];
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const pinLayer = document.createElement('div');
  pinLayer.className = 'omaf3d-pins';
  pinLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  container.appendChild(pinLayer);
  const pins = PINS.map((d) => {
    const el = document.createElement('span');
    el.textContent = d.t;
    if (d.k) el.setAttribute('data-i18n', d.k);
    el.style.cssText = 'position:absolute;transform:translate(-50%,-50%);white-space:nowrap;' +
      'font:500 10px/1 Inter,system-ui,sans-serif;letter-spacing:.10em;text-transform:uppercase;' +
      'padding:5px 9px;border-radius:2px;background:var(--m3-pin-bg,rgba(27,5,16,.74));' +
      'color:var(--m3-pin-fg,#FAF7F5);backdrop-filter:blur(4px);opacity:0;transition:opacity .3s';
    pinLayer.appendChild(el);
    return { el, v: new THREE.Vector3(d.p[0], d.p[1], d.p[2]) };
  });
  /* підхоплюємо активну мову сторінки */
  if (typeof window.omaSetLang === 'function') {
    try { window.omaSetLang(document.documentElement.lang || 'es'); } catch (_) {}
  }

  /* ═══ КАМЕРА / ОРБІТА ══════════════════════════════════════ */
  const target = new THREE.Vector3(CX, 0.45, CZ + 1.0);
  const goal = { t: target.clone(), r: 20.5, phi: 0.66, th: -0.22 };
  const cam = { t: target.clone(), r: 20.5, phi: 0.66, th: -0.22 };

  function place() {
    const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
    camera.position.set(
      cam.t.x + cam.r * sp * Math.sin(cam.th),
      cam.t.y + cam.r * cp,
      cam.t.z + cam.r * sp * Math.cos(cam.th)
    );
    camera.lookAt(cam.t);
  }

  const VIEWS = {
    all:   { t: [CX, 0.45, CZ + 1.0], r: 20.5, phi: 0.66, th: -0.22 },
    salon: { t: [3.90, 0.80, 10.50],  r: 10.4, phi: 0.60, th: -0.20 },
    cocina:{ t: [5.00, 1.00, 7.60],   r: 8.0,  phi: 0.60, th: -0.26 },
    dorm1: { t: [5.00, 0.80, 4.50],   r: 7.4,  phi: 0.62, th: -1.00 },
    dorm2: { t: [5.10, 0.80, 1.62],   r: 7.4,  phi: 0.62, th: -0.72 },
    bano:  { t: [1.05, 1.00, 1.15],   r: 5.8,  phi: 0.54, th: 0.62 },
  };
  function focus(key) {
    const v = VIEWS[key] || VIEWS.all;
    goal.t.set(v.t[0], v.t[1], v.t[2]); goal.r = v.r; goal.phi = v.phi; goal.th = v.th;
  }

  /* ── керування ────────────────────────────────────────────── */
  let drag = null, pinch = 0, engaged = false;
  const pos = (e) => ({ x: e.clientX, y: e.clientY });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && e.isPrimary === false) return;
    engaged = true;
    drag = pos(e); canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing';
  });
  /* клік поза моделлю знову віддає колесо сторінці */
  const release = (e) => { if (!canvas.contains(e.target)) engaged = false; };
  document.addEventListener('pointerdown', release, true);
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = pos(e);
    goal.th -= (p.x - drag.x) * 0.006;
    goal.phi = THREE.MathUtils.clamp(goal.phi - (p.y - drag.y) * 0.005, 0.22, 1.28);
    drag = p;
  });
  const stop = (e) => { drag = null; canvas.style.cursor = 'grab'; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('wheel', (e) => {
    /* поки модель не «активована» кліком — колесо гортає сторінку */
    if (!engaged && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    goal.r = THREE.MathUtils.clamp(goal.r * (1 + Math.sign(e.deltaY) * 0.10), 3.4, 30);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                         e.touches[0].clientY - e.touches[1].clientY);
    if (pinch) goal.r = THREE.MathUtils.clamp(goal.r * (pinch / d), 3.4, 30);
    pinch = d;
  }, { passive: false });
  canvas.addEventListener('touchend', () => { pinch = 0; });

  /* ═══ АНІМАЦІЯ ══════════════════════════════════════════════ */
  let night = false, nightMix = 0;
  const camWorld = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let auto = true, running = true, showPins = true;

  function frame() {
    if (!running) return;
    const k = 0.085;
    cam.t.lerp(goal.t, k);
    cam.r += (goal.r - cam.r) * k;
    cam.phi += (goal.phi - cam.phi) * k;
    let dth = goal.th - cam.th;
    while (dth > Math.PI) dth -= Math.PI * 2;
    while (dth < -Math.PI) dth += Math.PI * 2;
    cam.th += dth * k;
    if (auto && !drag) goal.th += 0.0011;
    place();

    /* прозорість стін між камерою і точкою огляду */
    camera.getWorldPosition(camWorld);
    for (const it of fadeItems) {
      const a = it.n.dot(tmp.copy(camWorld).sub(it.c));
      const b = it.n.dot(tmp.copy(cam.t).sub(it.c));
      const blocking = Math.abs(b) > 0.06 && (a > 0) !== (b > 0);
      it.cur += ((blocking ? 0.07 : 1.0) - it.cur) * 0.12;
      it.m.opacity = it.cur;
    }

    /* день ⇄ вечір */
    const wantN = night ? 1 : 0;
    if (Math.abs(nightMix - wantN) > 0.002) {
      nightMix += (wantN - nightMix) * 0.075;
      sun.intensity = 2.45 * (1 - nightMix * 0.92);
      fill.intensity = 0.22 * (1 - nightMix * 0.80);
      hemi.intensity = 0.26 * (1 - nightMix * 0.80);
      amb.intensity = 0.07 * (1 - nightMix * 0.35) + nightMix * 0.05;
      for (const p of lampLights) p.intensity = p.userData.power * nightMix;
      scene.environmentIntensity = 0.42 * (1 - nightMix * 0.93) + 0.02;
      for (const m of emissives) m.emissiveIntensity = nightMix * 1.1;
      renderer.toneMappingExposure = 0.96 + nightMix * 0.18;
    }

    /* підписи кімнат */
    if (showPins) {
      const w = container.clientWidth, h = container.clientHeight;
      for (const p of pins) {
        tmp.copy(p.v).project(camera);
        const on = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
        p.el.style.opacity = on ? '1' : '0';
        if (on) {
          p.el.style.left = ((tmp.x * 0.5 + 0.5) * w).toFixed(1) + 'px';
          p.el.style.top = ((-tmp.y * 0.5 + 0.5) * h).toFixed(1) + 'px';
        }
      }
    }

    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);

  /* ═══ РОЗМІР І ВИДИМІСТЬ ════════════════════════════════════ */
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(container);
  const io = new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    renderer.setAnimationLoop(running ? frame : null);
  }, { threshold: 0 });
  io.observe(container);
  place();

  return {
    scene, renderer, camera, sun,
    focus,
    setNight: (v) => { night = v; },
    setAuto: (v) => { auto = v; },
    setPins: (v) => { showPins = v; if (!v) for (const p of pins) p.el.style.opacity = '0'; },
    get auto() { return auto; },
    get night() { return night; },
    dispose() {
      running = false;
      renderer.setAnimationLoop(null);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('pointerdown', release, true);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (m.map) m.map.dispose(); m.dispose();
        });
      });
      renderer.dispose();
      pinLayer.remove();
      canvas.remove();
    },
  };
}
