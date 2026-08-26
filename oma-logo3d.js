/**
 * OMA BUILDING — 3D логотип (WebGPU / TSL, з автоматичним фолбеком на WebGL2)
 *
 * Емблема відтворена параметрично за обміром оригінального PNG (151×90 px):
 * 9 шпилів, двосхилий фронтон з вікном 2×2, три ступінчасті блоки з кожного
 * боку та нижня дуга. Кожна частина екструдується у справжній об'єм.
 *
 * Точка входу: initOmaLogo3D(container) → Promise<{ dispose }>
 */

import * as THREE from 'three/webgpu';
import { color, float, uniform, normalWorld, positionWorld, cameraPosition, Fn } from 'three/tsl';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ─── система координат оригіналу ────────────────────────────────
   x: 0..150 (вісь симетрії 74.75), y: 0..89.6 (вниз)
   у 3D: X = x − AX, Y = CY − y, далі вся група масштабується на S   */
const AX = 74.75;   // вісь дзеркальної симетрії
const CY = 47;      // візуальний центр по вертикалі
const S  = 1 / 34;  // px → світові одиниці

const mx = (x) => AX * 2 - x;            // дзеркало по X
const vx = (x) => x - AX;
const vy = (y) => CY - y;

/* ─── обміряні параметри емблеми ─────────────────────────────── */
const ROOF_APEX_Y = 44.3;   // вершина даху
const ROOF_SLOPE  = 1.917;  // dx на 1 dy
const EAVE_Y      = 69;     // рівень карниза
const BASE_Y      = 77.6;   // низ стін / початок дуги
const ROOF_RUN    = 5;      // горизонтальна товщина смуги даху

const roofY = (x) => ROOF_APEX_Y + Math.abs(x - 75) / ROOF_SLOPE;

const SPIRE_TOPS = [1, 7, 12, 37, 40];  // верх шпиля за |i|
const SPIRE_GAP  = 4.31;
const SPIRE_W    = 2.6;

// ступінчасті блоки, ліва половина: [правий край, лівий край, верх, кінець скосу, низ]
const TIERS = [
  { xr: 51, xl: 33, yTop: 13, ySlope: 21,   yBot: 30.2 },
  { xr: 43, xl: 26, yTop: 30, ySlope: 34.3, yBot: 44.3 },
  { xr: 35, xl: 18, yTop: 44, ySlope: 48.3, yBot: BASE_Y },
];

// глибина екструзії кожної групи, у px оригіналу
const DEPTH = { tier: 13, roof: 10, wall: 10, spire: 8, win: 5, arc: 5 };

/* ─── побудова плоских контурів ──────────────────────────────── */

function shapeFromPoints(pts) {
  const s = new THREE.Shape();
  s.moveTo(vx(pts[0][0]), vy(pts[0][1]));
  for (let i = 1; i < pts.length; i++) s.lineTo(vx(pts[i][0]), vy(pts[i][1]));
  s.closePath();
  return s;
}

const rectShape = (x0, y0, x1, y1) =>
  shapeFromPoints([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

/** Шпилі: 9 вертикальних стовпчиків, що ховаються за дахом. */
function spireShapes() {
  const out = [];
  for (let i = -4; i <= 4; i++) {
    const cx = AX + i * SPIRE_GAP;
    const top = SPIRE_TOPS[Math.abs(i)];
    const bot = roofY(cx) + 2.5;   // з запасом заходить під дах
    out.push(rectShape(cx - SPIRE_W / 2, top, cx + SPIRE_W / 2, bot));
  }
  return out;
}

/** Дах: шеврон-смуга від карниза через вершину до карниза. */
function roofShape() {
  const innerApexY = ROOF_APEX_Y + ROOF_RUN / ROOF_SLOPE;
  const xl = 75 - (EAVE_Y - ROOF_APEX_Y) * ROOF_SLOPE;   // ≈ 27.5
  const xr = mx(xl);
  return shapeFromPoints([
    [xl, EAVE_Y], [75, ROOF_APEX_Y], [xr, EAVE_Y],
    [xr - ROOF_RUN, EAVE_Y], [75, innerApexY], [xl + ROOF_RUN, EAVE_Y],
  ]);
}

/** Вікно 2×2 у центрі фронтону. */
function windowShapes() {
  const cols = [[67, 73.5], [76, 82.5]];
  const rows = [[57.5, 64], [65.5, 72]];
  const out = [];
  for (const [x0, x1] of cols)
    for (const [y0, y1] of rows) out.push(rectShape(x0, y0, x1, y1));
  return out;
}

/** Нижня дуга — парабола, що виходить за межі емблеми з обох боків. */
function arcShape() {
  const T = 2.2, N = 72;
  const yAt = (x) => BASE_Y + 12 * Math.pow((x - 75) / 75, 2);
  const top = [], bottom = [];
  for (let i = 0; i <= N; i++) {
    const x = (150 / N) * i;
    top.push([x, yAt(x)]);
    bottom.push([x, yAt(x) + T]);
  }
  return shapeFromPoints(top.concat(bottom.reverse()));
}

/** Ступінчастий блок зі скошеним верхом; side = 1 (лівий) або −1 (правий). */
function tierShape(t, side) {
  const f = side === 1 ? (x) => x : mx;
  return shapeFromPoints([
    [f(t.xr), t.yTop], [f(t.xr), t.yBot], [f(t.xl), t.yBot], [f(t.xl), t.ySlope],
  ]);
}

/* ─── матеріали ──────────────────────────────────────────────── */

const fresnel = Fn(([power = 3.0]) => {
  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const nDotV = normalWorld.dot(viewDir).saturate();
  return float(1.0).sub(nDotV).pow(power);
});

const PALETTE = {
  light: { pink: 0xe15c97, block: 0x2b0a18, rim: 0.45, blockRim: 1.45 },
  dark:  { pink: 0xf08cb6, block: 0x35101f, rim: 0.55, blockRim: 1.70 },
};

/* ─── головна ініціалізація ──────────────────────────────────── */

export async function initOmaLogo3D(container) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, false);

  const canvas = renderer.domElement;
  canvas.style.cssText = 'width:100%;height:100%;display:block';
  container.appendChild(canvas);

  await renderer.init();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  /* уніформи кольору — перемикаються разом із темою сайту */
  const uPink     = uniform(new THREE.Color(PALETTE.light.pink));
  const uBlock    = uniform(new THREE.Color(PALETTE.light.block));
  const uRim      = uniform(PALETTE.light.rim);
  const uBlockRim = uniform(PALETTE.light.blockRim);

  const matPink = new THREE.MeshStandardNodeMaterial({ metalness: 0.45, roughness: 0.28 });
  matPink.colorNode = uPink;
  matPink.emissiveNode = uPink.mul(fresnel(2.6)).mul(uRim);

  // темний корпус + вузький рожевий кант по ребрах — так само, як обведення в оригіналі
  const matBlock = new THREE.MeshStandardNodeMaterial({ metalness: 0.12, roughness: 0.58 });
  matBlock.colorNode = uBlock;
  matBlock.emissiveNode = uPink.mul(fresnel(4.0)).mul(uBlockRim);

  /* геометрія */
  const root = new THREE.Group();
  const spin = new THREE.Group();     // обертається
  spin.add(root);
  scene.add(spin);

  const extrude = (shape, depth, mat, zOffset = 0) => {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.8,
      bevelSize: 0.65,
      bevelOffset: 0,
      bevelSegments: 3,
      curveSegments: 4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = -depth / 2 + zOffset;
    root.add(mesh);
    return mesh;
  };

  for (const t of TIERS) {
    extrude(tierShape(t, 1), DEPTH.tier, matBlock);
    extrude(tierShape(t, -1), DEPTH.tier, matBlock);
  }
  extrude(roofShape(), DEPTH.roof, matPink);
  extrude(rectShape(27.0, EAVE_Y, 29.5, BASE_Y), DEPTH.wall, matPink);
  extrude(rectShape(mx(29.5), EAVE_Y, mx(27.0), BASE_Y), DEPTH.wall, matPink);
  for (const s of spireShapes()) extrude(s, DEPTH.spire, matPink);
  for (const w of windowShapes()) extrude(w, DEPTH.win, matPink, DEPTH.roof / 2 + 1);
  extrude(arcShape(), DEPTH.arc, matPink);

  root.scale.setScalar(S);

  /* межі → дистанція камери */
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  root.position.sub(box.getCenter(new THREE.Vector3()));   // центруємо в нулі

  // під час обертання по Y горизонтальний габарит не перевищує max(ширина, глибина),
  // а нахил по X додає до висоти частку глибини
  const halfW = Math.max(size.x, size.z) / 2;
  const halfH = size.y / 2 + size.z * 0.15;

  /* світло */
  scene.add(new THREE.AmbientLight(0xffffff, 0.20));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffb6d4, 0.8);
  fill.position.set(4, -1, 3);
  scene.add(fill);
  const back = new THREE.DirectionalLight(0xff7fb0, 1.1);
  back.position.set(1, 2, -5);
  scene.add(back);

  /* оточення для металевих відблисків — необов'язкове */
  let envRT = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.25;
    pmrem.dispose();
  } catch (e) {
    scene.environmentIntensity = 0;   // обійдемось світлом
  }

  /* стан циклу — оголошено до applyTheme/resize, які на нього спираються */
  let running = false;
  let pausedAt = 0;                    // накопичений час анімації до паузи
  function renderOnce() { renderer.render(scene, camera); }

  /* ─── тема ─── */
  const applyTheme = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const p = dark ? PALETTE.dark : PALETTE.light;
    uPink.value.setHex(p.pink);
    uBlock.value.setHex(p.block);
    uRim.value = p.rim;
    uBlockRim.value = p.blockRim;
    if (!running) renderOnce();
  };
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  applyTheme();

  /* ─── розмір ─── */
  function resize() {
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    camera.aspect = w / h;

    // дистанція, за якої габарити вписуються і по вертикалі, і по горизонталі
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    camera.position.z = 1.06 * Math.max(
      halfH / Math.tan(vFov / 2),
      halfW / Math.tan(hFov / 2)
    );

    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (!running) renderOnce();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  addEventListener('resize', resize);   // підстраховка, якщо RO не спрацює
  resize();

  /* ─── рух ─── */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointerMove = (e) => {
    const r = container.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  const onPointerLeave = () => { pointer.tx = 0; pointer.ty = 0; };
  if (!reduceMotion) {
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);
  }

  let t0 = performance.now();

  /* Повний оберт за SPIN_PERIOD, але нерівномірний: біля фронтального й
     тильного вигляду (0° і 180°) сповільнюється, профіль пролітає швидко —
     емблема симетрична, тож 0° і 180° читаються однаково добре.
     yaw = φ − k·sin(2φ);  швидкість ∝ 1 − 2k·cos(2φ),
     при k = 0.25 відношення «профіль : фронт» рівно 3:1, рух монотонний. */
  const SPIN_PERIOD = 14;   // секунд на повний оберт
  const EASE_K = 0.25;
  const easedYaw = (t) => {
    const phi = (2 * Math.PI * t) / SPIN_PERIOD;
    return phi - EASE_K * Math.sin(2 * phi);
  };

  function animate() {
    const t = (performance.now() - t0) / 1000;
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;

    spin.rotation.y = easedYaw(t) + pointer.x * 0.35;
    spin.rotation.x = Math.sin(t * 0.45) * 0.10 + pointer.y * 0.18;
    renderer.render(scene, camera);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    t0 = performance.now() - pausedAt;
    renderer.setAnimationLoop(animate);
  }
  function stop() {
    if (!running) return;
    running = false;
    pausedAt = performance.now() - t0;   // щоб не смикалось після паузи
    renderer.setAnimationLoop(null);
  }

  if (reduceMotion) {
    // статична поза, що читається як логотип
    spin.rotation.set(-0.06, -0.5, 0);
    renderOnce();
  }

  /* стартуємо одразу, а IntersectionObserver лише ставить на паузу за межами
     екрана — так анімація працює навіть там, де IO не спрацьовує */
  start();
  const io = new IntersectionObserver(
    ([entry]) => (entry.isIntersecting && !document.hidden ? start() : stop()),
    { threshold: 0.01 }
  );
  io.observe(container);

  const onVisibility = () => {
    if (document.hidden) stop();
    else if (container.getBoundingClientRect().bottom > 0) start();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    dispose() {
      stop();
      io.disconnect();
      ro.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('resize', resize);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      root.traverse((o) => o.geometry && o.geometry.dispose());
      matPink.dispose();
      matBlock.dispose();
      if (envRT) envRT.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
