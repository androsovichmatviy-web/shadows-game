import * as THREE from '../vendor/three.module.js';

/* =========================================================
   ДАР ВЕЧНОСТИ: ЭФЕРИН — 3D прототип экшен-RPG
   в стиле Genshin Impact: отряд стихийных странников,
   камера от третьего лица, элементальные реакции,
   открытый низкополигональный мир.
   ========================================================= */

/* ---------------- Renderer / scene / camera ---------------- */

const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY_TOP = 0x8fd9ff, SKY_BOTTOM = 0xeaf6e8;
scene.background = new THREE.Color(0xbfe6ff);
scene.fog = new THREE.Fog(0xbfe6ff, 60, 230);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- Lighting ---------------- */

scene.add(new THREE.HemisphereLight(SKY_TOP, 0x3a5a3a, 0.85));
const sun = new THREE.DirectionalLight(0xfff3d6, 1.4);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -120;
sun.shadow.camera.far = 260;
sun.shadow.bias = -0.0015;
scene.add(sun);
scene.add(sun.target);

/* ---------------- Elements & reactions ---------------- */

const ELEMENTS = {
  wind:    { name: 'Ветер',  color: 0x8ff0c0 },
  electro: { name: 'Гром',   color: 0xc9a6ff },
  fire:    { name: 'Пламя',  color: 0xff8a5c },
  cryo:    { name: 'Иней',   color: 0x9fe0ff },
  hydro:   { name: 'Поток',  color: 0x4aa8e0 },
};

const REACTIONS = {
  'fire+hydro':    { name: 'Испарение',         mult: 1.5, cc: null,         color: '#ff9a6f' },
  'fire+cryo':     { name: 'Плавление',         mult: 1.5, cc: null,         color: '#ffb07a' },
  'fire+electro':  { name: 'Перегрузка',        mult: 1.3, cc: 'knockback',  color: '#ffcf6f' },
  'hydro+electro': { name: 'Наэлектризация',    mult: 1.2, cc: 'dot',        color: '#b3d9ff' },
  'hydro+cryo':    { name: 'Заморозка',         mult: 1.0, cc: 'freeze',     color: '#cdefff' },
  'electro+cryo':  { name: 'Сверхпроводимость', mult: 1.2, cc: 'shatterDef', color: '#d6c2ff' },
};

function lookupReaction(a, b) { return REACTIONS[a + '+' + b] || REACTIONS[b + '+' + a] || null; }

/* ---------------- World ---------------- */

const WORLD_R = 150;

const groundGeo = new THREE.PlaneGeometry(WORLD_R * 2, WORLD_R * 2, 60, 60);
groundGeo.rotateX(-Math.PI / 2);
{
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = Math.hypot(x, z);
    const bump = Math.sin(x * 0.045) * Math.cos(z * 0.05) * 1.6 + Math.sin(d * 0.06) * 0.6;
    pos.setY(i, d > WORLD_R * 0.94 ? bump - 3 : bump);
  }
  groundGeo.computeVertexNormals();
}
const groundMat = new THREE.MeshStandardMaterial({ color: 0x4c8a4f, flatShading: true, roughness: 1 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);

// coastline: sea plane along the southern edge (z < -95), ties to the prologue's shore
const sea = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD_R * 3, 140),
  new THREE.MeshStandardMaterial({ color: 0x2f7db0, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.92 })
);
sea.rotation.x = -Math.PI / 2;
sea.position.set(0, -0.4, -160);
scene.add(sea);

const decorGroup = new THREE.Group();
scene.add(decorGroup);
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const treeTrunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 1.4, 6);
const treeTopGeo = new THREE.ConeGeometry(1.1, 2.2, 7);
(function buildDecor() {
  let seed = 1337;
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  for (let i = 0; i < 90; i++) {
    const x = (rnd() - 0.5) * WORLD_R * 1.9;
    const z = (rnd() - 0.5) * WORLD_R * 1.9 * 0.7 + 20;
    if (Math.hypot(x, z) < 14) continue;
    if (rnd() > 0.5) {
      const s = 0.6 + rnd() * 1.4;
      const rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x6b6a63, flatShading: true, roughness: 1 }));
      rock.position.set(x, s * 0.4, z);
      rock.scale.setScalar(s);
      rock.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
      rock.castShadow = true; rock.receiveShadow = true;
      decorGroup.add(rock);
    } else {
      const group = new THREE.Group();
      const trunk = new THREE.Mesh(treeTrunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a30, flatShading: true }));
      trunk.position.y = 0.7;
      const top = new THREE.Mesh(treeTopGeo, new THREE.MeshStandardMaterial({ color: 0x2f6b3a + Math.floor(rnd() * 0x001500), flatShading: true }));
      top.position.y = 1.9;
      group.add(trunk, top);
      group.position.set(x, 0, z);
      const s = 0.8 + rnd() * 0.7;
      group.scale.setScalar(s);
      group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      decorGroup.add(group);
    }
  }
})();

/* ---------------- Party ---------------- */

function makeChar(cfg) {
  return { ...cfg, hp: cfg.maxHp, energy: 0, skillCd: 0, burstCd: 0 };
}

const PARTY = [
  makeChar({
    id: 'hero', name: 'Странник', title: 'Безымянный',
    element: 'wind', maxHp: 260, atk: 22, energyMax: 80,
    skillName: 'Порыв', skillCdMax: 3.2, skillRadius: 6.5, skillDmg: 32,
    burstName: 'Вихрь Искры', burstRadius: 9.5, burstDmg: 70,
  }),
  makeChar({
    id: 'eyla', name: 'Эйла', title: 'Странница Ордена',
    element: 'electro', maxHp: 220, atk: 26, energyMax: 70,
    skillName: 'Клятва Грозы', skillCdMax: 4.5, skillRadius: 7.5, skillDmg: 40,
    burstName: 'Суд Молний', burstRadius: 10.5, burstDmg: 95,
  }),
  makeChar({
    id: 'mal', name: 'Мал', title: 'Кузнец-полудракон',
    element: 'fire', maxHp: 320, atk: 30, energyMax: 80,
    skillName: 'Молот Кузнеца', skillCdMax: 4.0, skillRadius: 5.5, skillDmg: 48,
    burstName: 'Дыхание Аргеона', burstRadius: 8.5, burstDmg: 110,
  }),
  makeChar({
    id: 'saya', name: 'Сая', title: 'Изгнанная учёная',
    element: 'cryo', maxHp: 200, atk: 24, energyMax: 65,
    skillName: 'Ледяная Печать', skillCdMax: 4.2, skillRadius: 8, skillDmg: 36,
    burstName: 'Академический Разлом', burstRadius: 10, burstDmg: 85,
  }),
  makeChar({
    id: 'til', name: 'Тиль', title: 'Беспризорник Мерейны',
    element: 'hydro', maxHp: 210, atk: 21, energyMax: 60,
    skillName: 'Воровской Всплеск', skillCdMax: 3.6, skillRadius: 7, skillDmg: 30,
    burstName: 'Морской Узел', burstRadius: 9.5, burstDmg: 80,
  }),
];

let activeIndex = 0;
function active() { return PARTY[activeIndex]; }

/* ---------------- Player ---------------- */

const player = {
  pos: new THREE.Vector3(0, 0, -90),
  yaw: Math.PI,
  speed: 6.4,
  sprintMult: 1.7,
  stamina: 100,
  staminaMax: 100,
  atkCd: 0,
};

const playerGroup = new THREE.Group();
const sparkGeo = new THREE.OctahedronGeometry(0.22, 0);
function buildPlayerMesh() {
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 1.05, 4, 8),
    new THREE.MeshStandardMaterial({ color: ELEMENTS[active().element].color, flatShading: true, roughness: 0.6 })
  );
  body.position.y = 1.05;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xf2d9b8, flatShading: true })
  );
  head.position.y = 1.85;
  head.castShadow = true;
  const spark = new THREE.Mesh(sparkGeo, new THREE.MeshStandardMaterial({
    color: ELEMENTS[active().element].color, emissive: ELEMENTS[active().element].color, emissiveIntensity: 1.4,
  }));
  spark.position.y = 1.35;
  spark.position.z = 0.42;
  spark.name = 'spark';
  playerGroup.add(body, head, spark);
  playerGroup.userData.body = body;
  playerGroup.userData.head = head;
  playerGroup.userData.spark = spark;
}
buildPlayerMesh();
playerGroup.position.copy(player.pos);
scene.add(playerGroup);

function refreshPlayerAppearance() {
  const col = ELEMENTS[active().element].color;
  playerGroup.userData.body.material.color.setHex(col);
  playerGroup.userData.spark.material.color.setHex(col);
  playerGroup.userData.spark.material.emissive.setHex(col);
}

/* ---------------- Camera rig (third person orbit) ---------------- */

const camRig = { yaw: player.yaw, pitch: 0.36, dist: 9 };
let dragging = false, lastMouse = { x: 0, y: 0 };

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 2) { dragging = true; lastMouse = { x: e.clientX, y: e.clientY }; }
});
window.addEventListener('mouseup', () => (dragging = false));
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMouse.x, dy = e.clientY - lastMouse.y;
  lastMouse = { x: e.clientX, y: e.clientY };
  camRig.yaw -= dx * 0.0045;
  camRig.pitch = Math.max(0.08, Math.min(1.15, camRig.pitch - dy * 0.0035));
});
renderer.domElement.addEventListener('wheel', (e) => {
  camRig.dist = Math.max(4.5, Math.min(20, camRig.dist + e.deltaY * 0.01));
}, { passive: true });

function updateCamera() {
  const { yaw, pitch, dist } = camRig;
  const cx = player.pos.x + Math.sin(yaw) * Math.cos(pitch) * dist;
  const cy = player.pos.y + 1.5 + Math.sin(pitch) * dist;
  const cz = player.pos.z + Math.cos(yaw) * Math.cos(pitch) * dist;
  camera.position.set(cx, cy, cz);
  camera.lookAt(player.pos.x, player.pos.y + 1.3, player.pos.z);
}

/* ---------------- Enemies ---------------- */

const ENEMY_BASE = {
  void:   { name: 'Забытый Клинок',  hp: 90,  atk: 10, r: 0.62, color: 0x8a8a99 },
  fire:   { name: 'Носитель Пламени', hp: 110, atk: 12, r: 0.68, color: 0xff8a5c },
  cryo:   { name: 'Носитель Инея',    hp: 100, atk: 10, r: 0.66, color: 0x9fe0ff },
  electro:{ name: 'Носитель Грома',   hp: 95,  atk: 13, r: 0.66, color: 0xc9a6ff },
  hydro:  { name: 'Носитель Потока',  hp: 105, atk: 9,  r: 0.66, color: 0x4aa8e0 },
};

const enemyGeo = new THREE.IcosahedronGeometry(1, 0);
const ringGeo = new THREE.TorusGeometry(1, 0.06, 8, 24);

function makeEnemy(x, z, kind, aura) {
  const base = ENEMY_BASE[kind];
  const baseColor = base.color;
  const mesh = new THREE.Mesh(enemyGeo, new THREE.MeshStandardMaterial({ color: base.color, flatShading: true, roughness: 0.5 }));
  mesh.scale.setScalar(base.r);
  mesh.castShadow = true;
  mesh.position.set(x, 1.1, z);
  scene.add(mesh);

  const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1, transparent: true, opacity: 0.8 }));
  ring.scale.setScalar(base.r * 1.35);
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  mesh.add(ring);

  const tag = document.createElement('div');
  tag.className = 'enemy-tag';
  tag.innerHTML = `<div class="name">${base.name}</div><div class="bar enemy-hp-bar-mini"><div class="bar-fill"></div></div>`;
  document.body.appendChild(tag);

  return {
    mesh, ring, tag, baseColor,
    x, z, spawnX: x, spawnZ: z,
    r: base.r, hp: base.hp, maxHp: base.hp, atk: base.atk, name: base.name,
    aura: aura || null, auraTimer: 0,
    state: 'idle', hitCd: 0, alive: true, wanderT: Math.random() * 10, wanderDx: 0, wanderDz: 0,
    frozen: 0, defShatter: 0, dotTimer: 0, dotTick: 0, bob: Math.random() * 10,
  };
}

const enemies = [];
(function spawnEnemies() {
  const spots = [
    [20, -20, 'void', null], [26, -14, 'fire', 'fire'],
    [-40, 30, 'void', null], [-46, 36, 'cryo', 'cryo'], [-54, 28, 'void', null],
    [60, 10, 'electro', 'electro'], [66, 16, 'void', null],
    [90, 70, 'hydro', 'hydro'], [96, 64, 'void', null],
    [50, 90, 'fire', 'fire'], [54, 96, 'cryo', 'cryo'],
    [-10, -60, 'void', null],
    [110, -10, 'electro', 'electro'],
    [-70, 80, 'hydro', 'hydro'],
  ];
  for (const [x, z, kind, aura] of spots) enemies.push(makeEnemy(x, z, kind, aura));
})();

let targetedEnemy = null;

/* ---------------- Input ---------------- */

const keys = new Set();
let gameStarted = false;

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (dialogueActive) { advanceDialogue(); return; }
  keys.add(k);
  if (!gameStarted) return;
  if (k >= '1' && k <= '5') switchActive(parseInt(k, 10) - 1);
  if (k === 'e') useSkill();
  if (k === 'q') useBurst();
  if (k === ' ') { normalAttack(); e.preventDefault(); }
  if (k === 'c') toggleCodex();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
renderer.domElement.addEventListener('mousedown', (e) => {
  if (dialogueActive) { advanceDialogue(); return; }
  if (e.button !== 0 || !gameStarted) return;
  normalAttack();
});

function switchActive(i) {
  if (i < 0 || i >= PARTY.length) return;
  activeIndex = i;
  refreshPlayerAppearance();
  spawnFloaterWorld(player.pos.x, player.pos.y + 2.1, player.pos.z, `Отряд: ${active().name}`, '#e8c77e');
  syncPartyUI();
}

/* ---------------- Combat helpers ---------------- */

function applyElementToEnemy(enemy, element) {
  if (!enemy.alive) return { reaction: null, mult: 1 };
  if (!enemy.aura) {
    if (element !== 'wind') { enemy.aura = element; enemy.auraTimer = 6; }
    return { reaction: null, mult: 1 };
  }
  if (enemy.aura === element) { enemy.auraTimer = 6; return { reaction: null, mult: 1 }; }

  let def;
  if (element === 'wind') {
    def = { name: 'Развеивание', mult: 1.2, cc: 'swirl', color: '#bff5da' };
  } else {
    def = lookupReaction(enemy.aura, element);
  }
  if (!def) { enemy.aura = element; enemy.auraTimer = 6; return { reaction: null, mult: 1 }; }

  if (def.cc === 'freeze') enemy.frozen = 2.2;
  if (def.cc === 'knockback') {
    const dx = enemy.x - player.pos.x, dz = enemy.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    enemy.x += (dx / d) * 2.2; enemy.z += (dz / d) * 2.2;
  }
  if (def.cc === 'dot') { enemy.dotTimer = 3; enemy.dotTick = 0; }
  if (def.cc === 'shatterDef') enemy.defShatter = 4;
  if (def.cc === 'swirl') {
    for (const other of enemies) {
      if (other === enemy || !other.alive) continue;
      if (Math.hypot(other.x - enemy.x, other.z - enemy.z) < 4.5 && !other.aura) {
        other.aura = enemy.aura; other.auraTimer = 6;
      }
    }
  }
  enemy.aura = (def.cc === 'freeze' || def.cc === 'swirl') ? enemy.aura : null;
  showReactionBanner(def.name, def.color);
  return { reaction: def, mult: def.mult };
}

function dealDamageToEnemy(enemy, amount, element, sourceChar) {
  if (!enemy.alive) return;
  const r = applyElementToEnemy(enemy, element);
  let dmg = amount * r.mult;
  if (enemy.defShatter > 0) dmg *= 1.15;
  dmg = Math.round(dmg);
  enemy.hp -= dmg;
  enemy.hitCd = 0.4;
  enemy.state = 'aggro';
  targetedEnemy = enemy;
  spawnFloaterWorld(enemy.x, enemy.mesh.position.y + 1, enemy.z, `-${dmg}`, r.reaction ? r.reaction.color : '#fff');
  if (sourceChar) {
    sourceChar.energy = Math.min(sourceChar.energyMax, sourceChar.energy + 10);
    for (const c of PARTY) if (c !== sourceChar) c.energy = Math.min(c.energyMax, c.energy + 2);
  }
  if (enemy.hp <= 0) killEnemy(enemy);
}

function killEnemy(enemy) {
  enemy.alive = false;
  enemy.mesh.visible = false;
  enemy.tag.style.display = 'none';
  spawnFloaterWorld(enemy.x, enemy.mesh.position.y + 1.2, enemy.z, 'Искра рассеяна', '#e8c77e');
  if (targetedEnemy === enemy) targetedEnemy = null;
}

/* ---------------- VFX ---------------- */

const activeVfx = [];
function spawnRingVfx(x, z, radius, colorHex) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.85, radius, 32),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.15, z);
  scene.add(ring);
  activeVfx.push({ mesh: ring, life: 0.55, maxLife: 0.55, baseR: radius });

  const flash = new THREE.PointLight(colorHex, 6, radius * 3);
  flash.position.set(x, 1.5, z);
  scene.add(flash);
  activeVfx.push({ mesh: flash, life: 0.25, maxLife: 0.25, isLight: true });
}

/* floating combat text projected from 3D world space to screen */
const floatersLayer = document.getElementById('floaters');
const _v = new THREE.Vector3();
function worldToScreen(x, y, z) {
  _v.set(x, y, z).project(camera);
  return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight, behind: _v.z > 1 };
}
function spawnFloaterWorld(x, y, z, text, color) {
  const s = worldToScreen(x, y, z);
  if (s.behind) return;
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  el.style.color = color || '#fff';
  el.style.left = s.x + 'px';
  el.style.top = s.y + 'px';
  floatersLayer.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

const reactionBanner = document.getElementById('reactionBanner');
function showReactionBanner(name, color) {
  reactionBanner.textContent = name + '!';
  reactionBanner.style.color = color;
  reactionBanner.classList.remove('show');
  void reactionBanner.offsetWidth;
  reactionBanner.classList.add('show');
}

/* ---------------- Abilities ---------------- */

function enemiesNear(x, z, radius) {
  return enemies.filter((e) => e.alive && Math.hypot(e.x - x, e.z - z) < radius + e.r);
}

function normalAttack() {
  const c = active();
  if (player.atkCd > 0) return;
  player.atkCd = 0.4;
  const radius = 2.6;
  spawnRingVfx(player.pos.x, player.pos.z, radius, ELEMENTS[c.element].color);
  for (const e of enemiesNear(player.pos.x, player.pos.z, radius)) dealDamageToEnemy(e, c.atk, null, c);
}

function useSkill() {
  const c = active();
  if (c.skillCd > 0) return;
  c.skillCd = c.skillCdMax;
  spawnRingVfx(player.pos.x, player.pos.z, c.skillRadius, ELEMENTS[c.element].color);
  for (const e of enemiesNear(player.pos.x, player.pos.z, c.skillRadius)) dealDamageToEnemy(e, c.skillDmg, c.element, c);
  spawnFloaterWorld(player.pos.x, player.pos.y + 2.4, player.pos.z, c.skillName, '#' + ELEMENTS[c.element].color.toString(16).padStart(6, '0'));
}

function useBurst() {
  const c = active();
  if (c.energy < c.energyMax) return;
  c.energy = 0;
  spawnRingVfx(player.pos.x, player.pos.z, c.burstRadius, 0xffe9a8);
  for (const e of enemiesNear(player.pos.x, player.pos.z, c.burstRadius)) dealDamageToEnemy(e, c.burstDmg, c.element, c);
  spawnFloaterWorld(player.pos.x, player.pos.y + 2.6, player.pos.z, c.burstName + '!', '#ffe9a8');
}

/* ---------------- Update ---------------- */

let last = performance.now();

function update(dt) {
  updateCamera();
  if (!gameStarted) { renderer.render(scene, camera); return; }

  let ix = 0, iz = 0;
  if (keys.has('w')) iz -= 1;
  if (keys.has('s')) iz += 1;
  if (keys.has('a')) ix -= 1;
  if (keys.has('d')) ix += 1;
  const moving = ix !== 0 || iz !== 0;

  if (moving) {
    const len = Math.hypot(ix, iz);
    ix /= len; iz /= len;
    const forward = new THREE.Vector3(-Math.sin(camRig.yaw), 0, -Math.cos(camRig.yaw));
    const right = new THREE.Vector3(Math.cos(camRig.yaw), 0, -Math.sin(camRig.yaw));
    const moveDir = forward.multiplyScalar(-iz).add(right.multiplyScalar(ix));
    moveDir.normalize();
    const sprinting = keys.has('shift') && player.stamina > 1;
    const spd = player.speed * (sprinting ? player.sprintMult : 1);
    player.pos.x += moveDir.x * spd * dt;
    player.pos.z += moveDir.z * spd * dt;
    const targetYaw = Math.atan2(moveDir.x, moveDir.z);
    let diff = targetYaw - player.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    player.yaw += diff * Math.min(1, dt * 12);
  }
  player.pos.x = Math.max(-WORLD_R * 0.92, Math.min(WORLD_R * 0.92, player.pos.x));
  player.pos.z = Math.max(-WORLD_R * 0.92, Math.min(WORLD_R * 0.92, player.pos.z));
  playerGroup.position.set(player.pos.x, player.pos.y, player.pos.z);
  playerGroup.rotation.y = player.yaw;

  const sprintingNow = keys.has('shift') && moving && player.stamina > 1;
  const staminaWrap = document.getElementById('staminaWrap');
  if (sprintingNow) {
    player.stamina = Math.max(0, player.stamina - dt * 26);
    staminaWrap.classList.add('show');
  } else {
    player.stamina = Math.min(player.staminaMax, player.stamina + dt * 14);
    if (player.stamina >= player.staminaMax) staminaWrap.classList.remove('show');
  }

  player.atkCd = Math.max(0, player.atkCd - dt);
  for (const c of PARTY) { c.skillCd = Math.max(0, c.skillCd - dt); c.burstCd = Math.max(0, c.burstCd - dt); }

  for (const e of enemies) {
    if (!e.alive) continue;
    e.bob += dt;
    if (e.auraTimer > 0) { e.auraTimer -= dt; if (e.auraTimer <= 0) e.aura = null; }
    if (e.frozen > 0) { e.frozen -= dt; }
    else {
      if (e.defShatter > 0) e.defShatter -= dt;
      if (e.dotTimer > 0) {
        e.dotTimer -= dt; e.dotTick -= dt;
        if (e.dotTick <= 0) { e.dotTick = 0.5; dealDamageToEnemy(e, 6, null, null); }
      }
      e.hitCd = Math.max(0, e.hitCd - dt);

      const distToPlayer = Math.hypot(player.pos.x - e.x, player.pos.z - e.z);
      if (distToPlayer < 22) e.state = 'aggro';
      if (distToPlayer > 36) e.state = 'idle';

      if (e.state === 'aggro') {
        const d = Math.hypot(e.x - player.pos.x, e.z - player.pos.z) || 1;
        const spd = 3.1;
        if (d > e.r + 1.1) {
          e.x += ((player.pos.x - e.x) / d) * spd * dt;
          e.z += ((player.pos.z - e.z) / d) * spd * dt;
        } else if (e.hitCd <= 0 && e.alive) {
          e.hitCd = 1.1;
          const c = active();
          c.hp = Math.max(0, c.hp - e.atk);
          spawnFloaterWorld(player.pos.x, player.pos.y + 1.8, player.pos.z, `-${e.atk}`, '#ff6b6b');
          if (c.hp <= 0) respawnActive(c);
        }
      } else {
        e.wanderT -= dt;
        if (e.wanderT <= 0) {
          e.wanderT = 2 + Math.random() * 3;
          e.wanderDx = (Math.random() - 0.5);
          e.wanderDz = (Math.random() - 0.5);
        }
        e.x += e.wanderDx * 0.4 * dt;
        e.z += e.wanderDz * 0.4 * dt;
        e.x = e.spawnX + Math.max(-3, Math.min(3, e.x - e.spawnX));
        e.z = e.spawnZ + Math.max(-3, Math.min(3, e.z - e.spawnZ));
      }
    }

    e.mesh.position.x = e.x;
    e.mesh.position.z = e.z;
    e.mesh.position.y = 1.1 + Math.sin(e.bob * 2) * 0.08 + (e.frozen > 0 ? 0 : 0);
    e.mesh.rotation.y += dt * 0.6;
    if (e.aura) {
      e.ring.visible = true;
      e.ring.material.color.setHex(ELEMENTS[e.aura].color);
      e.ring.material.emissive.setHex(ELEMENTS[e.aura].color);
      e.ring.rotation.z += dt * 2;
    } else {
      e.ring.visible = false;
    }
    e.mesh.material.color.setHex(e.frozen > 0 ? 0xbfe9ff : e.baseColor);
  }

  for (let i = activeVfx.length - 1; i >= 0; i--) {
    const v = activeVfx[i];
    v.life -= dt;
    const t = 1 - v.life / v.maxLife;
    if (v.isLight) {
      v.mesh.intensity = 6 * (1 - t);
    } else {
      v.mesh.scale.setScalar(1 + t * 0.6);
      v.mesh.material.opacity = 0.75 * (1 - t);
    }
    if (v.life <= 0) { scene.remove(v.mesh); activeVfx.splice(i, 1); }
  }

  syncUI();
  renderer.render(scene, camera);
}

function respawnActive(c) {
  spawnFloaterWorld(player.pos.x, player.pos.y + 2, player.pos.z, `${c.name} отступает...`, '#ff9a9a');
  setTimeout(() => { c.hp = c.maxHp; }, 900);
}

/* ---------------- HUD tags for enemies ---------------- */

function syncEnemyTags() {
  for (const e of enemies) {
    if (!e.alive) { e.tag.style.display = 'none'; continue; }
    if (Math.hypot(e.x - player.pos.x, e.z - player.pos.z) > 34) { e.tag.style.display = 'none'; continue; }
    const s = worldToScreen(e.x, e.mesh.position.y + e.r + 0.9, e.z);
    if (s.behind || s.x < -50 || s.x > window.innerWidth + 50) { e.tag.style.display = 'none'; continue; }
    e.tag.style.display = 'block';
    e.tag.style.left = s.x + 'px';
    e.tag.style.top = s.y + 'px';
    const fill = e.tag.querySelector('.bar-fill');
    fill.style.width = Math.max(0, (e.hp / e.maxHp) * 100) + '%';
  }
}

/* ---------------- UI sync ---------------- */

const partyBar = document.getElementById('partyBar');
function buildPartyUI() {
  partyBar.innerHTML = '';
  PARTY.forEach((c, i) => {
    const slot = document.createElement('div');
    slot.className = 'party-slot';
    slot.style.borderColor = '#' + ELEMENTS[c.element].color.toString(16).padStart(6, '0');
    slot.innerHTML = `<span>${c.name[0]}</span><span class="num">${i + 1}</span><div class="mini-hp"><i></i></div>`;
    slot.title = `${c.name} — ${c.title} (${ELEMENTS[c.element].name})`;
    slot.addEventListener('click', () => switchActive(i));
    partyBar.appendChild(slot);
  });
  syncPartyUI();
}

function syncPartyUI() {
  const slots = partyBar.querySelectorAll('.party-slot');
  slots.forEach((slot, i) => {
    slot.classList.toggle('active', i === activeIndex);
    slot.querySelector('.mini-hp i').style.width = Math.max(0, (PARTY[i].hp / PARTY[i].maxHp) * 100) + '%';
  });
}

function syncUI() {
  const c = active();
  document.getElementById('activeName').textContent = `${c.name} · ${ELEMENTS[c.element].name}`;
  document.getElementById('activeHpFill').style.width = Math.max(0, (c.hp / c.maxHp) * 100) + '%';
  document.getElementById('activeEnergyFill').style.width = Math.max(0, (c.energy / c.energyMax) * 100) + '%';
  document.getElementById('staminaFill').style.width = player.stamina + '%';
  syncPartyUI();
  syncEnemyTags();

  const enemyHud = document.getElementById('enemyHud');
  if (targetedEnemy && targetedEnemy.alive) {
    enemyHud.classList.remove('hidden');
    document.getElementById('enemyName').textContent = targetedEnemy.name;
    document.getElementById('enemyHpFill').style.width = Math.max(0, (targetedEnemy.hp / targetedEnemy.maxHp) * 100) + '%';
  } else {
    enemyHud.classList.add('hidden');
  }
}

/* ---------------- Codex ---------------- */

const CODEX = [
  ['Эферин', 'Континент семи ветров, разделённый на земли: Пламя, Поток, Гром, Иней, Ветер, Камень и Свет. Каждой землёй правит свой Хранитель — древнее существо, чья сила пропитывает климат и характер жителей.'],
  ['Искра Отклика', 'Кристалл, откликающийся на душу своего носителя. Даёт власть над одной из семи стихий. Редко передаётся по рождению — чаще находит того, кто пережил нечто, изменившее его.'],
  ['Орден Семи Дорог', 'Вольное содружество странников, не подчиняющееся Хранителям земель. Девиз — «Дорога длиннее любой стены». Новичков зовут Ищущими, опытных — Странниками, легенд — просто Именами.'],
  ['Забытые', 'Древний культ, поклоняющийся Пустоте, из которой родился Создатель. Верят, что свобода воли — болезнь мира, и вырезают Искры Отклика из носителей.'],
  ['Эйла из Кайрена', 'Странница Ордена, резкая и ироничная. Владеет силой Грома. Первой находит героя на берегу Мерейны.'],
  ['Мал из Ирвары', 'Кузнец-полудракон, добродушный великан. Ищет сбежавшего младшего брата, которого видели среди Забытых.'],
  ['Сая из Аврелии', 'Изгнанная учёная, исследовавшая природу Искр Отклика. Подозревает, что в герое есть нечто необъяснимое.'],
  ['Тиль из Мерейны', 'Беспризорник, промышлявший мелким воровством. Прибился к отряду почти случайно.'],
];

function buildCodex() {
  document.getElementById('codexBody').innerHTML = CODEX.map(([t, d]) => `<div class="codex-entry"><b>${t}</b><p>${d}</p></div>`).join('');
}
function toggleCodex() { document.getElementById('codex').classList.toggle('hidden'); }
document.getElementById('codexBtn').addEventListener('click', toggleCodex);
document.getElementById('codexClose').addEventListener('click', toggleCodex);

/* ---------------- Dialogue / intro ---------------- */

const DIALOGUE = [
  ['Рассказчик', 'Где-то в пустоте между мирами гаснет свеча одной короткой жизни...'],
  ['Создатель', '«Твой счёт с болью закрыт. Я не властен вернуть тебе прежнюю жизнь, но могу дать то, чего не получал ни один смертный — выбор, каким будет твоё продолжение».'],
  ['Создатель', '«Условие одно: ты не будешь помнить это имя. Но твоя природа — твоё любопытство, твоя доброта — останется с тобой».'],
  ['???', '«Я хочу мир, где ничего не решено заранее. Хочу выбирать сам — каждый день, который у меня теперь есть».'],
  ['Создатель', '«Тогда иди. Эферин — континент семи ветров — ждёт тебя. Одна частица силы останется с тобой: та, что откликается на само право двигаться дальше».'],
  ['Рассказчик', 'Герой открывает глаза на каменистом берегу Мерейны. Ни имени, ни памяти о доме — только тёплая Искра Отклика на груди.'],
  ['Эйла', '«Очнулся? Хорошо. Не важно, откуда ты родом. Важно, куда ты решишь идти».'],
  ['Эйла', '«Я Эйла, Странница Ордена Семи Дорог. Раз уж Искра выбрала тебя — идём, покажу, на что ты способен».'],
];

let dialogueIndex = 0;
let dialogueActive = true;
const dialogueEl = document.getElementById('dialogue');
const dSpeaker = document.getElementById('dSpeaker');
const dText = document.getElementById('dText');

function showDialogueLine() {
  const [speaker, text] = DIALOGUE[dialogueIndex];
  dSpeaker.textContent = speaker;
  dText.textContent = text;
}
function advanceDialogue() {
  dialogueIndex++;
  if (dialogueIndex >= DIALOGUE.length) { endDialogue(); return; }
  showDialogueLine();
}
function endDialogue() {
  dialogueActive = false;
  dialogueEl.classList.add('hidden');
  gameStarted = true;
  activeIndex = 0;
  refreshPlayerAppearance();
  spawnFloaterWorld(player.pos.x, player.pos.y + 2.1, player.pos.z, 'Эйла присоединилась к отряду', '#e8c77e');
}
dialogueEl.addEventListener('click', advanceDialogue);
dialogueEl.classList.remove('hidden');
showDialogueLine();

/* ---------------- Boot ---------------- */

buildPartyUI();
buildCodex();
sun.target.position.set(0, 0, 0);
updateCamera();
renderer.render(scene, camera);

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  sun.position.set(player.pos.x + 60, 90, player.pos.z + 40);
  sun.target.position.copy(player.pos);
  update(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
