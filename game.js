import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

/*
  ONE IN THE WELL — prototype
  Static web game. Designed for Safari/iPad.

  The game is intentionally simple visually. Replace the primitive geometry
  and WebAudio placeholder sounds later with the final art/audio.
*/

const CONFIG = {
  wellRadius: 3.2,
  barRadius: 0.10,
  barLength: 5.0,
  barVerticalSpacing: 3.15,
  visibleBars: 18,

  // The three important run milestones are randomized.
  looseMin: 12,
  looseMax: 30,
  boardMinAfterLoose: 12,
  boardMax: 55,
  secondMinAfterBoard: 12,
  secondMax: 90,

  // Horror event probabilities after TWO IN THE WELL.
  ambientChance: 0.055,
  scareChance: 0.030,
  chaseChance: 0.018,

  creatureBarsMin: 8,
  creatureBarsMax: 18,
  creatureStepSeconds: 0.95,

  looseBarSeconds: 3.0,

  cameraPitchMin: -1.48,
  cameraPitchMax: 1.48,

  climbDuration: 0.48
};

const gameEl = document.querySelector("#game");
const startScreen = document.querySelector("#start-screen");
const deathScreen = document.querySelector("#death-screen");
const startButton = document.querySelector("#start-button");
const restartButton = document.querySelector("#restart-button");
const deathReason = document.querySelector("#death-reason");
const barCounter = document.querySelector("#bar-counter");
const hint = document.querySelector("#hint");
const status = document.querySelector("#status");
const message = document.querySelector("#message");

let scene, camera, renderer;
let world, barsGroup, boardsGroup;
let ambientLight, moonLight;
let raycaster;
let audio = null;

let running = false;
let dead = false;
let playerBar = 0;
let targetBar = 0;
let climbing = false;
let climbStart = 0;
let climbFromY = 0;
let climbToY = 0;

let yaw = 0;
let pitch = 0.16;
let lookPointer = null;
let lookMoved = false;

let bars = new Map();
let boards = new Map();

let looseStart = 0;
let boardStart = 0;
let twoStart = 0;

let creature = {
  active: false,
  bar: -999,
  remaining: 0,
  nextStep: 0,
  startPlayerBar: 0
};

let screenShake = 0;
let screenShakeTime = 0;
let lastTime = performance.now();

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function makeScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010101);
  scene.fog = new THREE.FogExp2(0x010101, 0.14);

  camera = new THREE.PerspectiveCamera(
    68,
    innerWidth / innerHeight,
    0.03,
    100
  );

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  gameEl.appendChild(renderer.domElement);

  ambientLight = new THREE.AmbientLight(0x777777, 0.45);
  scene.add(ambientLight);

  moonLight = new THREE.PointLight(0xb8c4ff, 2.0, 13);
  moonLight.position.set(0, 4, 0);
  scene.add(moonLight);

  raycaster = new THREE.Raycaster();

  world = new THREE.Group();
  barsGroup = new THREE.Group();
  boardsGroup = new THREE.Group();
  world.add(barsGroup, boardsGroup);
  scene.add(world);

  createWell();
  resetRun();
}

function createWell() {
  // Four simple vertical wall strips. They make the prototype read as a well
  // without requiring textures.
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x242424,
    roughness: 1
  });

  const wallGeometry = new THREE.CylinderGeometry(
    CONFIG.wellRadius,
    CONFIG.wellRadius,
    180,
    32,
    1,
    true
  );

  const wall = new THREE.Mesh(wallGeometry, wallMaterial);
  wall.rotation.x = Math.PI;
  wall.position.y = 0;
  scene.add(wall);

  const bottom = new THREE.Mesh(
    new THREE.CylinderGeometry(CONFIG.wellRadius - .05, CONFIG.wellRadius - .05, .3, 32),
    new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1 })
  );
  bottom.position.y = -2;
  scene.add(bottom);

  // Small distant light so the well has just enough shape to read.
  const tiny = new THREE.PointLight(0x778899, 1.0, 7);
  tiny.position.set(0, 0, 0);
  scene.add(tiny);
}

function resetRun() {
  playerBar = 0;
  targetBar = 0;
  climbing = false;
  dead = false;
  creature.active = false;
  creature.bar = -999;
  creature.remaining = 0;
  screenShake = 0;
  screenShakeTime = 0;

  looseStart = randInt(CONFIG.looseMin, CONFIG.looseMax);
  boardStart = randInt(
    looseStart + CONFIG.boardMinAfterLoose,
    Math.min(CONFIG.boardMaxAfterBoard, looseStart + 55)
  );
  twoStart = randInt(
    boardStart + CONFIG.secondMinAfterBoard,
    Math.min(CONFIG.secondMaxAfterBoard, boardStart + 90)
  );

  bars.clear();
  boards.clear();

  while (barsGroup.children.length) barsGroup.remove(barsGroup.children[0]);
  while (boardsGroup.children.length) boardsGroup.remove(boardsGroup.children[0]);

  // Generate a large initial range. More bars are generated as needed.
  for (let i = 1; i <= CONFIG.visibleBars + 5; i++) createBar(i);

  placePlayerAtBar(0);

  barCounter.textContent = "BAR 0";
  status.textContent = "";
  hint.textContent = "Drag to look. Tap a bar to grab it.";
  showMessage("ONE IN THE WELL.", 1800);

  console.log("Run milestones:", {
    looseBars: looseStart,
    boards: boardStart,
    twoInTheWell: twoStart
  });
}

function createBar(index) {
  if (bars.has(index)) return bars.get(index);

  const angle = (index * 2.3999632297) % (Math.PI * 2);
  const radius = CONFIG.wellRadius - 0.18;

  const group = new THREE.Group();
  group.position.set(
    Math.cos(angle) * radius,
    barY(index),
    Math.sin(angle) * radius
  );

  // Bars are horizontal through the well.
  group.rotation.y = angle;

  const material = new THREE.MeshStandardMaterial({
    color: 0x777777,
    roughness: .85,
    metalness: .45
  });

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(
      CONFIG.barRadius,
      CONFIG.barRadius,
      CONFIG.barLength,
      10
    ),
    material
  );

  // Cylinder's native axis is Y. Rotate to X.
  mesh.rotation.z = Math.PI / 2;
  mesh.userData.barIndex = index;
  mesh.userData.kind = "bar";

  group.add(mesh);
  barsGroup.add(group);

  const data = {
    index,
    group,
    mesh,
    loose: index >= looseStart,
    detached: false,
    heldSince: 0
  };

  bars.set(index, data);

  if (index >= boardStart && index < boardStart + 2) {
    createBoard(index);
  }

  return data;
}

function createBoard(index) {
  if (boards.has(index)) return boards.get(index);

  const angle = ((index * 1.713) % (Math.PI * 2));
  const radius = CONFIG.wellRadius - 0.13;

  const group = new THREE.Group();
  group.position.set(
    Math.cos(angle) * radius,
    barY(index) + 1.25,
    Math.sin(angle) * radius
  );
  group.rotation.y = angle;

  const material = new THREE.MeshStandardMaterial({
    color: 0x5a3e27,
    roughness: 1
  });

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(.35, 2.3, 5.2),
    material
  );

  mesh.userData.boardIndex = index;
  mesh.userData.kind = "board";
  group.add(mesh);
  boardsGroup.add(group);

  const data = {
    index,
    group,
    mesh,
    removed: false,
    progress: 0
  };

  boards.set(index, data);
  return data;
}

function barY(index) {
  return index * CONFIG.barVerticalSpacing;
}

function placePlayerAtBar(index) {
  playerBar = index;
  targetBar = index;
  const y = barY(index);

  camera.position.set(0, y + 1.0, 0);
  updateCameraRotation();
}

function updateCameraRotation() {
  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

function ensureBarsAhead() {
  const maxNeeded = playerBar + CONFIG.visibleBars + 8;
  for (let i = 1; i <= maxNeeded; i++) {
    if (!bars.has(i)) createBar(i);
  }

  // Keep old bars in the scene for atmosphere, but don't let the group grow
  // without limit during a long run.
  const minimumKeep = Math.max(1, playerBar - 35);
  for (const [index, data] of bars) {
    if (index < minimumKeep && data.group.parent) {
      barsGroup.remove(data.group);
    }
  }
}

function beginGrab(index) {
  if (!running || dead || climbing) return;
  if (index <= playerBar) return;

  const data = bars.get(index);
  if (!data || data.detached) return;

  // You can only grab the next bar for now. This keeps the prototype readable.
  if (index !== playerBar + 1) {
    hint.textContent = "You need the next bar.";
    return;
  }

  // Board blocks the route until removed.
  const board = boards.get(index);
  if (board && !board.removed) {
    beginPry(board);
    return;
  }

  data.heldSince = performance.now();

  if (data.loose) {
    status.textContent = "LOOSE BAR — CLIMB NOW";
  } else {
    status.textContent = "GRABBED";
  }

  // Tap a grabbed bar again to pull up.
  data.mesh.userData.grabbed = true;
  climbing = true;
  climbStart = performance.now();
  climbFromY = camera.position.y;
  climbToY = barY(index) + 1.0;
  targetBar = index;

  playGrabSound();
}

function beginPry(board) {
  status.textContent = "WOODEN BOARD — TAP IT REPEATEDLY";
  board.progress = 0;
  hint.textContent = "Tap the board repeatedly to pry it loose.";
}

function pryBoard(board) {
  if (board.removed) return;

  board.progress += 1;

  board.group.rotation.z = -board.progress * 0.07;

  if (board.progress >= 5) {
    board.removed = true;
    boardsGroup.remove(board.group);
    status.textContent = "";
    hint.textContent = "Board removed. Grab the bar.";
    playBoardSound();
  } else {
    playPrySound(board.progress);
  }
}

function finishClimb() {
  const previous = playerBar;
  playerBar = targetBar;
  climbing = false;

  camera.position.y = barY(playerBar) + 1.0;
  barCounter.textContent = `BAR ${playerBar}`;

  const held = bars.get(playerBar);

  if (held?.loose) {
    const elapsed = (performance.now() - held.heldSince) / 1000;
    if (elapsed > CONFIG.looseBarSeconds) {
      die("The loose bar came out of the wall.");
      return;
    }
  }

  // First title is intentionally one; the second is the major reveal.
  if (playerBar === twoStart) {
    showMessage("TWO IN THE WELL.", 2600);
    hint.textContent = "Keep climbing.";
  }

  // Once the player has reached the second milestone, the well becomes
  // probabilistic. It can remain quiet for long stretches.
  if (playerBar >= twoStart) {
    maybeTriggerHorror();
  }

  if (playerBar !== previous) {
    playClimbSound();
  }

  ensureBarsAhead();
}

function maybeTriggerHorror() {
  if (creature.active) return;

  const roll = Math.random();

  if (roll < CONFIG.chaseChance) {
    startChase();
  } else if (roll < CONFIG.chaseChance + CONFIG.scareChance) {
    triggerScare();
  } else if (roll < CONFIG.chaseChance + CONFIG.scareChance + CONFIG.ambientChance) {
    triggerAmbient();
  }
}

function startChase() {
  creature.active = true;
  creature.bar = playerBar - randInt(3, 7);
  creature.remaining = randInt(
    CONFIG.creatureBarsMin,
    CONFIG.creatureBarsMax
  );
  creature.nextStep = performance.now() + 650;
  creature.startPlayerBar = playerBar;

  status.textContent = "";
  hint.textContent = "CLIMB.";

  playChaseStart();

  // The creature gets one step every ~second. The update loop controls
  // the audio volume and screen shake continuously.
}

function updateCreature(now, dt) {
  if (!creature.active) {
    screenShake = Math.max(0, screenShake - dt * 3.5);
    return;
  }

  if (now >= creature.nextStep) {
    creature.bar += 1;
    creature.remaining -= 1;
    creature.nextStep = now + CONFIG.creatureStepSeconds * 1000;
    playCreatureClang(creatureDistance());
  }

  const distance = creatureDistance();

  // Reaching the player's current bar kills them.
  if (creature.bar >= playerBar) {
    die("Something reached your bar.");
    return;
  }

  // Chase ends once its rolled number of climbs is exhausted.
  if (creature.remaining <= 0) {
    creature.active = false;
    status.textContent = "";
    hint.textContent = "Keep climbing.";
    playChaseEnd();
  }

  // Extremely nonlinear intensity curve. Far away = almost nothing.
  // Close = absurdly violent.
  if (distance <= 14) {
    const closeness = clamp(1 - distance / 14, 0, 1);
    screenShake = Math.pow(closeness, 2.2);
    screenShakeTime += dt * (8 + 70 * Math.pow(closeness, 2.5));
  } else {
    screenShake = 0;
  }

  updateCreatureAudio(distance);
}

function creatureDistance() {
  return Math.max(0, playerBar - creature.bar);
}

function updateCreatureAudio(distance) {
  if (!audio || !creature.active) return;

  const closeness = clamp(1 - distance / 14, 0, 1);
  const intensity = Math.pow(closeness, 2);

  audio.setCreatureIntensity(intensity);
}

function triggerAmbient() {
  playAmbient();
}

function triggerScare() {
  screenShake = Math.max(screenShake, .45);
  screenShakeTime += 2;
  playScare();
}

function showMessage(text, duration = 1500) {
  message.textContent = text;
  message.classList.add("show");

  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    message.classList.remove("show");
  }, duration);
}

function die(reason) {
  if (dead) return;

  dead = true;
  running = false;
  creature.active = false;
  deathReason.textContent = reason;
  deathScreen.classList.remove("hidden");
  status.textContent = "";
  hint.textContent = "";
  playDeath();
}

function startGame() {
  if (!audio) audio = new AudioEngine();

  audio.resume();
  startScreen.classList.add("hidden");
  deathScreen.classList.add("hidden");
  running = true;
  dead = false;
  resetRun();
  lastTime = performance.now();
}

function onPointerDown(e) {
  if (!running || dead) return;

  lookPointer = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY
  };
  lookMoved = false;

  try {
    renderer.domElement.setPointerCapture(e.pointerId);
  } catch {}
}

function onPointerMove(e) {
  if (!lookPointer || e.pointerId !== lookPointer.id || !running) return;

  const dx = e.clientX - lookPointer.x;
  const dy = e.clientY - lookPointer.y;

  if (Math.abs(dx) + Math.abs(dy) > 4) lookMoved = true;

  yaw -= dx * 0.006;
  pitch -= dy * 0.005;
  pitch = clamp(pitch, CONFIG.cameraPitchMin, CONFIG.cameraPitchMax);

  lookPointer.x = e.clientX;
  lookPointer.y = e.clientY;

  updateCameraRotation();
}

function onPointerUp(e) {
  if (!lookPointer || e.pointerId !== lookPointer.id) return;

  if (!lookMoved) {
    handleTap(e.clientX, e.clientY);
  }

  lookPointer = null;
}

function handleTap(x, y) {
  if (!running || dead || climbing) return;

  // Center ray from the tap location.
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((x - rect.left) / rect.width) * 2 - 1,
    -((y - rect.top) / rect.height) * 2 + 1
  );

  raycaster.setFromCamera(ndc, camera);

  const boardHits = raycaster.intersectObjects(boardsGroup.children, true);
  if (boardHits.length) {
    const boardIndex = boardHits[0].object.userData.boardIndex;
    if (boardIndex !== undefined) {
      const board = boards.get(boardIndex);
      if (board && !board.removed && boardIndex === playerBar + 1) {
        pryBoard(board);
        return;
      }
    }
  }

  const barHits = raycaster.intersectObjects(barsGroup.children, true);
  if (barHits.length) {
    const mesh = barHits[0].object;
    const index = mesh.userData.barIndex;

    if (index !== undefined) {
      beginGrab(index);
    }
  }
}

function update(dt, now) {
  if (!running || dead) return;

  if (climbing) {
    const t = clamp((now - climbStart) / (CONFIG.climbDuration * 1000), 0, 1);
    const smooth = t * t * (3 - 2 * t);
    camera.position.y = THREE.MathUtils.lerp(climbFromY, climbToY, smooth);

    if (t >= 1) finishClimb();
  }

  updateCreature(now, dt);

  // Small environmental movement so the prototype doesn't feel completely
  // frozen.
  moonLight.position.y = camera.position.y + 4;
  moonLight.position.x = Math.sin(now * .00018) * 1.5;

  applyCameraShake();
}

function applyCameraShake() {
  if (!screenShake) {
    updateCameraRotation();
    return;
  }

  const strength = screenShake;
  const x = Math.sin(screenShakeTime * 1.7) * strength * 0.12;
  const y = Math.cos(screenShakeTime * 2.9) * strength * 0.12;
  const z = Math.sin(screenShakeTime * 4.4) * strength * 0.04;

  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw + x;
  camera.rotation.x = clamp(pitch + y, CONFIG.cameraPitchMin, CONFIG.cameraPitchMax);
  camera.rotation.z = z;
}

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min(.05, (now - lastTime) / 1000);
  lastTime = now;

  update(dt, now);
  renderer.render(scene, camera);
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

class AudioEngine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = .7;
    this.master.connect(this.ctx.destination);

    this.creatureGain = this.ctx.createGain();
    this.creatureGain.gain.value = 0;
    this.creatureGain.connect(this.master);

    this.creatureOsc = this.ctx.createOscillator();
    this.creatureOsc.type = "sawtooth";
    this.creatureOsc.frequency.value = 48;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 190;

    this.creatureOsc.connect(filter);
    filter.connect(this.creatureGain);
    this.creatureOsc.start();
  }

  resume() {
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  tone(freq, duration, volume, type = "sine") {
    this.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001, volume), t + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + .03);
  }

  noise(duration, volume, lowpass = 900) {
    this.resume();

    const length = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = lowpass;

    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001, volume), t + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t);
  }

  setCreatureIntensity(intensity) {
    const t = this.ctx.currentTime;
    const volume = .003 + Math.pow(intensity, 1.7) * .24;
    this.creatureGain.gain.cancelScheduledValues(t);
    this.creatureGain.gain.linearRampToValueAtTime(volume, t + .08);
    this.creatureOsc.frequency.setTargetAtTime(
      38 + intensity * 22,
      t,
      .08
    );
  }

  stopCreature() {
    const t = this.ctx.currentTime;
    this.creatureGain.gain.cancelScheduledValues(t);
    this.creatureGain.gain.linearRampToValueAtTime(0, t + .15);
  }
}

function playGrabSound() {
  audio?.tone(170, .09, .035, "triangle");
}

function playClimbSound() {
  audio?.tone(115, .10, .025, "square");
}

function playPrySound(step) {
  audio?.tone(75 + step * 9, .11, .025, "square");
}

function playBoardSound() {
  audio?.noise(.35, .10, 700);
}

function playAmbient() {
  audio?.tone(randInt(80, 180), randInt(4, 9) / 10, .035, "sine");
}

function playScare() {
  audio?.noise(.55, .16, 1200);
  audio?.tone(42, .8, .12, "sawtooth");
}

function playChaseStart() {
  audio?.noise(.7, .18, 500);
  audio?.tone(38, 1.0, .10, "sawtooth");
}

function playCreatureClang(distance) {
  if (!audio) return;

  const closeness = clamp(1 - distance / 14, 0, 1);
  const volume = .035 + Math.pow(closeness, 2) * .16;

  audio.tone(62, .28, volume, "square");
  audio.noise(.16, volume * .45, 900);
}

function playChaseEnd() {
  audio?.stopCreature();
  audio?.tone(80, .45, .06, "sine");
}

function playDeath() {
  audio?.stopCreature();
  audio?.noise(.8, .2, 450);
  audio?.tone(28, 1.2, .14, "sawtooth");
}

rendererSetup();
animate(performance.now());

function rendererSetup() {
  makeScene();

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", onPointerUp);

  startButton.addEventListener("click", startGame);
  restartButton.addEventListener("click", startGame);

  addEventListener("resize", onResize);
}
