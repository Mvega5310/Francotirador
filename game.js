import * as THREE from "three";
import { GLTFLoader } from "./vendor/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "./vendor/jsm/utils/SkeletonUtils.js";

// ==============================
// CONFIGURACIÓN
// ==============================
const ROUND_SECONDS = 100;
const MAGAZINE_SIZE = 10;
const RELOAD_TIME = 1.6;
const MAX_STRIKES = 3;
const SWAY_BASE_AMPLITUDE = 0.006;
const SWAY_SCOPED_AMPLITUDE = 0.0015;
const BREATH_DRAIN_RATE = 22;
const BREATH_REGEN_RATE = 14;
const WIND_CHANGE_INTERVAL = 6;
const NORMAL_FOV = 60;
const SCOPED_FOV = 15;

const CIVILIAN_SPEED = 1.4;
const THIEF_SPEED = 4.2;
const CIVILIAN_SPAWN_INTERVAL = 1.8;
const INCIDENT_INTERVAL_MIN = 4.5;
const INCIDENT_INTERVAL_MAX = 8;

// Altura real (metros) a la que se normaliza cada modelo humano.
const HUMAN_HEIGHT = 1.8;

// Modelos de personas. Para agregar variedad basta añadir una línea con un .glb
// animado (p. ej. de Mixamo). "facing": si el modelo camina de lado, cambia el
// valor en pasos de Math.PI / 2. "walk" / "run": nombre o índice del clip.
const CHARACTER_MODELS = [
  { url: "./vendor/models/CesiumMan.glb", facing: Math.PI / 2, walk: 0, run: 0 },
];

// Ciudad (Kenney, CC0)
const CITY_URL = "./vendor/models/city/";
const CARS_URL = "./vendor/models/cars/";
const BUILDING_NAMES = "abcdefghijklmn".split("").map((c) => `building-${c}`);
const SKYSCRAPER_NAMES = "abcde".split("").map((c) => `building-skyscraper-${c}`);
const LOW_BUILDING_NAMES = "abcdefgh".split("").map((c) => `low-detail-building-${c}`);
const CAR_NAMES = ["sedan", "suv", "taxi", "van", "hatchback-sports", "police", "delivery"];
const BUS_MODEL = "truck";

// ==============================
// ESTADO DEL JUEGO
// ==============================
const state = {
  score: 0,
  casosResueltos: 0,
  casosPerdidos: 0,
  civilesHeridos: 0,
  ammo: MAGAZINE_SIZE,
  reloading: false,
  timeLeft: ROUND_SECONDS,
  wind: 0,
  windTimer: 0,
  breath: 100,
  holdingBreath: false,
  scoped: false,
  gameOver: false,
  started: false,
  civilianTimer: 0,
  incidentTimer: 3,
  clock: new THREE.Clock(),
};

let npcs = [];

// ==============================
// REFERENCIAS DOM
// ==============================
const viewport = document.getElementById("viewport");
const scoreEl = document.getElementById("score");
const timeLeftEl = document.getElementById("timeLeft");
const ammoEl = document.getElementById("ammo");
const windEl = document.getElementById("wind");
const breathBarEl = document.getElementById("breathBar");
const scopeOverlay = document.getElementById("scopeOverlay");
const crosshair = document.getElementById("crosshair");
const gameOverScreen = document.getElementById("gameOverScreen");
const finalScoreEl = document.getElementById("finalScore");
const restartBtn = document.getElementById("restartBtn");
const casosEl = document.getElementById("casos");
const strikesEl = document.getElementById("strikes");
const loadingScreen = document.getElementById("loadingScreen");

// ==============================
// ESCENA THREE.JS
// ==============================
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  NORMAL_FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  220
);
camera.position.set(0, 9, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
viewport.appendChild(renderer.domElement);

// ==============================
// CIELO (degradado generado por código)
// ==============================
function createSkyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#0d1a33");
  grad.addColorStop(0.55, "#33415c");
  grad.addColorStop(1, "#8a95a6");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
scene.background = createSkyTexture();
scene.fog = new THREE.Fog(0x33415c, 45, 140);

// Luces
const hemi = new THREE.HemisphereLight(0x8a95a6, 0x2a2f38, 0.7);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d9, 1.15);
sun.position.set(25, 40, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 150;
sun.shadow.bias = -0.0015;
scene.add(sun);

// ==============================
// TEXTURAS PROCEDURALES
// ==============================
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function createAsphaltTexture() {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#25282e";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const shade = 30 + Math.random() * 25;
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade + 4}, 0.5)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // línea central discontinua
  ctx.fillStyle = "#e5c34d";
  for (let y = 10; y < 256; y += 40) {
    ctx.fillRect(124, y, 8, 22);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 14);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSidewalkTexture() {
  const canvas = makeCanvas(128, 128);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#7d8592";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#5d6472";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  for (let i = 0; i < 300; i++) {
    const shade = 110 + Math.random() * 30;
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade + 5}, 0.4)`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// PRNG determinístico simple (para que cada edificio tenga ventanas fijas)
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ==============================
// ESCENARIO: CALLE
// ==============================
const NEAR_SIDEWALK_Z = -14;
const ROAD_Z = -22;
const FAR_SIDEWALK_Z = -30;
const STALL_Z = -34;

function buildStreet() {
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 14),
    new THREE.MeshStandardMaterial({ map: createAsphaltTexture(), roughness: 0.95 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, ROAD_Z);
  road.receiveShadow = true;
  scene.add(road);

  const sidewalkTex = createSidewalkTexture();
  [NEAR_SIDEWALK_Z, FAR_SIDEWALK_Z].forEach((z) => {
    const sidewalk = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 8),
      new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.9 })
    );
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(0, 0.01, z);
    sidewalk.receiveShadow = true;
    scene.add(sidewalk);
  });

  // Suelo lejano para que no se vea vacío detrás de los edificios
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 260),
    new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, -60);
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(makeStall(-22, STALL_Z));

  // Farolas a lo largo de ambas aceras
  [-40, -15, 10, 35].forEach((x) => {
    scene.add(makeStreetLamp(x, NEAR_SIDEWALK_Z + 3.5));
    scene.add(makeStreetLamp(x + 12, FAR_SIDEWALK_Z - 3.5));
  });

  // Árboles decorativos, fuera de las rutas de los NPC
  [-48, -18, 5, 25, 44].forEach((x) => {
    scene.add(makeTree(x, FAR_SIDEWALK_Z - 6.5));
  });
}

function makeStall(x, z) {
  const group = new THREE.Group();
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(3, 1, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x92400e })
  );
  table.position.y = 0.5;
  const roofPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x44403c })
  );
  roofPole.position.set(0, 2, 0);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 1, 4),
    new THREE.MeshStandardMaterial({ color: 0xb45309 })
  );
  roof.position.y = 3.1;
  roof.rotation.y = Math.PI / 4;
  group.add(table, roofPole, roof);
  group.traverse((c) => {
    if (c.isMesh) c.castShadow = true;
  });
  group.position.set(x, 0, z);
  return group;
}

function makeStreetLamp(x, z) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 4.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.6, roughness: 0.4 })
  );
  pole.position.y = 2.1;
  pole.castShadow = true;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 10),
    new THREE.MeshStandardMaterial({
      color: 0xfff4cc,
      emissive: 0xffdd88,
      emissiveIntensity: 1.1,
    })
  );
  head.position.y = 4.3;

  group.add(pole, head);
  group.position.set(x, 0, z);
  return group;
}

function makeTree(x, z) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.24, 2.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x5b3a21, roughness: 0.9 })
  );
  trunk.position.y = 1.2;
  trunk.castShadow = true;

  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.9 });
  const foliage1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), foliageMat);
  foliage1.position.y = 3.1;
  const foliage2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), foliageMat);
  foliage2.position.set(0.6, 2.6, 0.3);
  const foliage3 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), foliageMat);
  foliage3.position.set(-0.6, 2.7, -0.3);

  group.add(trunk, foliage1, foliage2, foliage3);
  group.traverse((c) => {
    if (c.isMesh) c.castShadow = true;
  });
  group.position.set(x, 0, z);
  return group;
}

buildStreet();

// ==============================
// CARGA DE MODELOS (personas, edificios, carros)
// ==============================
const gltfLoader = new GLTFLoader();
const characterTemplates = [];
let assetsReady = false;

function loadGLB(url) {
  return new Promise((resolve, reject) => gltfLoader.load(url, resolve, undefined, reject));
}

function enableShadows(root, cast = true, receive = true) {
  root.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
}

function pickClip(clips, spec) {
  if (typeof spec === "number") return clips[spec];
  return clips.find((c) => c.name === spec) || clips[0];
}

function prepareCharacter(gltf, spec) {
  const root = gltf.scene;
  enableShadows(root, true, false);
  root.updateMatrixWorld(true);
  const height = new THREE.Box3().setFromObject(root, true).getSize(new THREE.Vector3()).y;
  characterTemplates.push({
    scene: root,
    walk: pickClip(gltf.animations, spec.walk),
    run: pickClip(gltf.animations, spec.run),
    facing: spec.facing,
    scale: height > 0 ? HUMAN_HEIGHT / height : 1,
  });
}

// Tamaño (ya escalado) de un modelo, para colocarlo sobre el suelo
function sizeOf(root, scale) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return { size: box.getSize(new THREE.Vector3()).multiplyScalar(scale), minY: box.min.y * scale };
}

function placeModel(template, { x, z, scale, rotY = 0 }) {
  const holder = new THREE.Group();
  const model = template.scene.clone(true);
  const { minY } = sizeOf(template.scene, scale);
  model.scale.setScalar(scale);
  model.position.y = -minY; // apoya la base en el suelo
  holder.add(model);
  holder.rotation.y = rotY;
  holder.position.set(x, 0, z);
  enableShadows(holder);
  scene.add(holder);
  return holder;
}

// Fila de edificios pegados uno al lado del otro a lo largo del eje X
function buildRow(templates, z, scale, rand, gap) {
  let x = -85;
  while (x < 85) {
    const t = templates[Math.floor(rand() * templates.length)];
    const width = sizeOf(t.scene, scale).size.x;
    placeModel(t, { x: x + width / 2, z, scale });
    x += width + gap;
  }
}

function buildCity(buildings, skyscrapers, lows, cars, bus) {
  const rand = mulberry32(2024);
  // Fila frontal (detrás de la acera lejana), skyline detrás
  buildRow(buildings, FAR_SIDEWALK_Z - 8, 11, rand, 0.4);
  buildRow([...skyscrapers, ...lows], FAR_SIDEWALK_Z - 24, 13, rand, 1.5);

  // Carros parqueados: en puntos de escape del robo de carro y en el carril lejano
  const car = () => cars[Math.floor(rand() * cars.length)];
  [-30, -8, 18].forEach((x) => placeModel(car(), { x, z: ROAD_Z + 4, scale: 1.7, rotY: Math.PI / 2 }));
  [-46, -14, 6, 40].forEach((x) =>
    placeModel(car(), { x, z: ROAD_Z - 4, scale: 1.7, rotY: -Math.PI / 2 })
  );

  // Vehículo grande: punto de escape del atraco
  placeModel(bus, { x: 28, z: ROAD_Z, scale: 2, rotY: Math.PI / 2 });
}

async function loadAssets() {
  const loadingText = loadingScreen.querySelector("p");
  const lists = {
    buildings: BUILDING_NAMES.map((n) => CITY_URL + n + ".glb"),
    skyscrapers: SKYSCRAPER_NAMES.map((n) => CITY_URL + n + ".glb"),
    lows: LOW_BUILDING_NAMES.map((n) => CITY_URL + n + ".glb"),
    cars: CAR_NAMES.map((n) => CARS_URL + n + ".glb"),
    bus: [CARS_URL + BUS_MODEL + ".glb"],
  };
  const total = CHARACTER_MODELS.length + Object.values(lists).flat().length;
  let done = 0;
  const track = (promise) =>
    promise.then((g) => {
      loadingText.textContent = `Cargando escena... ${Math.round((++done / total) * 100)}%`;
      return g;
    });

  try {
    const [characters, buildings, skyscrapers, lows, cars, bus] = await Promise.all([
      Promise.all(CHARACTER_MODELS.map((m) => track(loadGLB(m.url)))),
      ...Object.values(lists).map((urls) => Promise.all(urls.map((u) => track(loadGLB(u))))),
    ]);
    characters.forEach((g, i) => prepareCharacter(g, CHARACTER_MODELS[i]));
    buildCity(buildings, skyscrapers, lows, cars, bus[0]);
    assetsReady = true;
    loadingScreen.classList.add("hidden");
    state.started = true;
    state.clock.start();
  } catch (err) {
    loadingText.textContent = "No se pudieron cargar los modelos. Revisa la consola (F12).";
    console.error("Error cargando modelos:", err);
  }
}

// ==============================
// PERSONAJE HUMANO
// ==============================
function makeHumanFigure(carryColor, running) {
  const tpl = characterTemplates[Math.floor(Math.random() * characterTemplates.length)];
  const root = new THREE.Group();
  const model = cloneSkeleton(tpl.scene);
  model.rotation.y = tpl.facing;
  model.scale.setScalar(tpl.scale * (0.96 + Math.random() * 0.08));

  // Variación sutil de ropa/tono por persona (clona el material para no afectar a los demás)
  model.traverse((c) => {
    if (c.isMesh) {
      c.material = c.material.clone();
      c.material.color.setHSL(Math.random(), 0.18, 0.8 + Math.random() * 0.2);
    }
  });
  root.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const clip = running ? tpl.run : tpl.walk;
  const action = mixer.clipAction(clip);
  action.play();
  action.time = Math.random() * clip.duration; // desincroniza el ciclo de piernas

  if (carryColor) {
    const item = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.26, 0.18),
      new THREE.MeshStandardMaterial({ color: carryColor })
    );
    item.position.set(0.38, 1.05, 0.15);
    item.castShadow = true;
    root.add(item);
  }

  return { root, mixer, action };
}

// ==============================
// TIPOS DE INCIDENTE
// ==============================
const CRIME_TYPES = [
  { type: "bolso", color: 0xec4899, z: NEAR_SIDEWALK_Z },
  { type: "zapatos", color: 0x92400e, z: STALL_Z },
  { type: "carro", color: 0xd1d5db, z: ROAD_Z + 4 },
  { type: "bus", color: 0xfacc15, z: ROAD_Z },
];

function spawnCivilian() {
  if (!assetsReady) return;
  const z = Math.random() < 0.5 ? NEAR_SIDEWALK_Z : FAR_SIDEWALK_Z;
  const fromLeft = Math.random() < 0.5;
  const startX = fromLeft ? -55 : 55;
  const endX = fromLeft ? 55 : -55;

  const figure = makeHumanFigure(null, false);
  figure.action.timeScale = 0.9 + Math.random() * 0.3;
  figure.root.position.set(startX, 0, z + (Math.random() - 0.5) * 3);
  scene.add(figure.root);

  npcs.push({
    ...figure,
    type: "civilian",
    crimeType: null,
    start: { x: startX, z: figure.root.position.z },
    exit: { x: endX, z: figure.root.position.z },
    speed: CIVILIAN_SPEED * (0.8 + Math.random() * 0.4),
    progress: 0,
    active: true,
  });
}

function spawnIncident() {
  if (!assetsReady) return;
  const def = CRIME_TYPES[Math.floor(Math.random() * CRIME_TYPES.length)];
  const fromLeft = Math.random() < 0.5;
  const startX = fromLeft ? -50 : 50;
  const endX = fromLeft ? 50 : -50;

  const figure = makeHumanFigure(def.color, true);
  figure.action.timeScale = 2.4; // ritmo de carrera
  figure.root.position.set(startX, 0, def.z);
  scene.add(figure.root);

  npcs.push({
    ...figure,
    type: "thief",
    crimeType: def.type,
    start: { x: startX, z: def.z },
    exit: { x: endX, z: def.z },
    speed: THIEF_SPEED,
    progress: 0,
    active: true,
  });
}

function updateNpcs(delta) {
  npcs.forEach((npc) => {
    if (!npc.active) return;

    npc.mixer.update(delta);

    const dist = Math.hypot(npc.exit.x - npc.start.x, npc.exit.z - npc.start.z);
    npc.progress += (npc.speed * delta) / dist;

    if (npc.progress >= 1) {
      if (npc.type === "thief") state.casosPerdidos++;
      removeNpc(npc);
      return;
    }

    const x = npc.start.x + (npc.exit.x - npc.start.x) * npc.progress;
    const z = npc.start.z + (npc.exit.z - npc.start.z) * npc.progress;
    npc.root.position.x = x;
    npc.root.position.z = z;
    npc.root.lookAt(npc.exit.x, npc.root.position.y, npc.exit.z);
  });

  npcs = npcs.filter((n) => n.active);
}

function removeNpc(npc) {
  npc.active = false;
  npc.mixer.stopAllAction();
  scene.remove(npc.root);
  npc.root.traverse((c) => c.isMesh && c.material.dispose());
}

// ==============================
// SISTEMA DE VIENTO
// ==============================
function updateWind(delta) {
  state.windTimer += delta;
  if (state.windTimer >= WIND_CHANGE_INTERVAL) {
    state.windTimer = 0;
    state.wind = Math.random() * 2 - 1;
  }
  const arrow = state.wind > 0.15 ? "→" : state.wind < -0.15 ? "←" : "•";
  windEl.textContent = `${arrow} ${Math.abs(state.wind).toFixed(1)}`;
}

// ==============================
// SISTEMA DE ESTABILIDAD (SWAY + ALIENTO)
// ==============================
let sway = { x: 0, y: 0, z: 0 };

function updateBreathAndSway(delta, elapsed) {
  if (state.holdingBreath && state.breath > 0) {
    state.breath = Math.max(0, state.breath - BREATH_DRAIN_RATE * delta);
  } else {
    state.breath = Math.min(100, state.breath + BREATH_REGEN_RATE * delta);
  }

  breathBarEl.style.width = `${state.breath}%`;
  breathBarEl.style.background =
    state.breath < 25 ? "#dc2626" : state.breath < 55 ? "#f59e0b" : "#22c55e";

  const isStabilizing = state.holdingBreath && state.breath > 0;
  const baseAmp = state.scoped ? SWAY_SCOPED_AMPLITUDE : SWAY_BASE_AMPLITUDE;
  const amplitude = isStabilizing ? baseAmp * 0.15 : baseAmp;

  sway = {
    z: Math.sin(elapsed * 1.3) * amplitude * 3,
    x: Math.sin(elapsed * 0.9) * amplitude * 2,
    y: Math.sin(elapsed * 0.6) * amplitude * 4,
  };
}

// ==============================
// SISTEMA DE DISPARO
// ==============================
const raycaster = new THREE.Raycaster();
const shotVector = new THREE.Vector2();

function findNpcFromObject(obj) {
  let o = obj;
  while (o) {
    const found = npcs.find((n) => n.root === o);
    if (found) return found;
    o = o.parent;
  }
  return null;
}

function shoot() {
  if (state.gameOver || state.reloading || !assetsReady) return;
  if (state.ammo <= 0) {
    reload();
    return;
  }

  state.ammo--;

  const windFactor = state.scoped ? 0.015 : 0.05;
  shotVector.set(state.wind * windFactor, 0);

  raycaster.setFromCamera(shotVector, camera);
  const meshes = [];
  npcs.forEach((n) => {
    if (n.active) n.root.traverse((c) => c.isMesh && meshes.push(c));
  });
  const hits = raycaster.intersectObjects(meshes, false);

  if (hits.length > 0) {
    const npc = findNpcFromObject(hits[0].object);
    if (npc) {
      if (npc.type === "thief") {
        state.score += 100;
        state.casosResueltos++;
      } else {
        state.score -= 150;
        state.civilesHeridos++;
        if (state.civilesHeridos >= MAX_STRIKES) {
          removeNpc(npc);
          updateHud();
          endGame();
          return;
        }
      }
      removeNpc(npc);
    }
  }

  updateHud();
}

function reload() {
  if (state.reloading || state.ammo === MAGAZINE_SIZE) return;
  state.reloading = true;
  setTimeout(() => {
    state.ammo = MAGAZINE_SIZE;
    state.reloading = false;
    updateHud();
  }, RELOAD_TIME * 1000);
}

// ==============================
// MIRA (SCOPE)
// ==============================
function setScoped(on) {
  state.scoped = on;
  camera.fov = on ? SCOPED_FOV : NORMAL_FOV;
  camera.updateProjectionMatrix();
  scopeOverlay.classList.toggle("hidden", !on);
  crosshair.classList.toggle("hidden", on);
}

// ==============================
// CONTROLES
// ==============================
let yaw = 0;
let pitch = 0;
const LOOK_LIMIT_X = 0.7;
const LOOK_LIMIT_Y = 0.35;

renderer.domElement.addEventListener("click", () => {
  renderer.domElement.requestPointerLock();
});

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  const sensitivity = state.scoped ? 0.0006 : 0.0022;
  yaw -= e.movementX * sensitivity;
  pitch -= e.movementY * sensitivity;
  pitch = Math.max(-LOOK_LIMIT_Y, Math.min(LOOK_LIMIT_Y, pitch));
  yaw = Math.max(-LOOK_LIMIT_X, Math.min(LOOK_LIMIT_X, yaw));
});

document.addEventListener("mousedown", (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  if (e.button === 0) shoot();
  if (e.button === 2) setScoped(true);
});

document.addEventListener("mouseup", (e) => {
  if (e.button === 2) setScoped(false);
});

renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") state.holdingBreath = true;
  if (e.code === "KeyZ") setScoped(!state.scoped);
  if (e.code === "KeyR") reload();
});

document.addEventListener("keyup", (e) => {
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") state.holdingBreath = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ==============================
// HUD
// ==============================
function updateHud() {
  scoreEl.textContent = state.score;
  timeLeftEl.textContent = Math.ceil(state.timeLeft);
  ammoEl.textContent = state.reloading ? "..." : state.ammo;
  casosEl.textContent = `${state.casosResueltos} / ${state.casosPerdidos} perdidos`;
  strikesEl.textContent = `${state.civilesHeridos} / ${MAX_STRIKES}`;
}

// ==============================
// FIN DE RONDA
// ==============================
function endGame() {
  state.gameOver = true;
  document.exitPointerLock();
  finalScoreEl.textContent = state.score;
  gameOverScreen.classList.remove("hidden");
}

function resetGame() {
  npcs.forEach(removeNpc);
  npcs = [];

  state.score = 0;
  state.casosResueltos = 0;
  state.casosPerdidos = 0;
  state.civilesHeridos = 0;
  state.ammo = MAGAZINE_SIZE;
  state.reloading = false;
  state.timeLeft = ROUND_SECONDS;
  state.wind = 0;
  state.windTimer = 0;
  state.breath = 100;
  state.holdingBreath = false;
  state.gameOver = false;
  state.civilianTimer = 0;
  state.incidentTimer = 3;
  setScoped(false);

  gameOverScreen.classList.add("hidden");
  updateHud();
  state.clock.start();
}

restartBtn.addEventListener("click", resetGame);

// ==============================
// LOOP PRINCIPAL
// ==============================
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(state.clock.getDelta(), 0.1);
  const elapsed = state.clock.getElapsedTime();

  if (state.started && !state.gameOver) {
    state.timeLeft -= delta;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      endGame();
    }

    state.civilianTimer -= delta;
    if (state.civilianTimer <= 0) {
      spawnCivilian();
      state.civilianTimer = CIVILIAN_SPAWN_INTERVAL * (0.6 + Math.random() * 0.8);
    }

    state.incidentTimer -= delta;
    if (state.incidentTimer <= 0) {
      spawnIncident();
      state.incidentTimer =
        INCIDENT_INTERVAL_MIN +
        Math.random() * (INCIDENT_INTERVAL_MAX - INCIDENT_INTERVAL_MIN);
    }

    updateWind(delta);
    updateNpcs(delta);
    updateBreathAndSway(delta, elapsed);

    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw + sway.y;
    camera.rotation.x = pitch + sway.x - 0.15;
    camera.rotation.z = sway.z;

    updateHud();
  }

  renderer.render(scene, camera);
}

loadAssets();
updateHud();
animate();
