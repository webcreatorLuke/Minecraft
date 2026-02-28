/* global THREE */
// ============ GAME STATE ============
const state = {
  scene: null,
  camera: null,
  renderer: null,
  world: null,
  player: null,
  isPlaying: false,
  isPaused: false,
  initialized: false,
  keys: {},
  mouse: { x: 0, y: 0, locked: false },
  clock: null,
  settings: {
    fullscreen: false,
    guiScale: 2,
    brightness: 50,
    fov: 70,
    renderDistance: 12,
    graphicsQuality: 'fancy',
    smoothLighting: true,
    maxFramerate: 'unlimited',
    viewBobbing: true,
    clouds: true,
    particles: 'all',
    mouseSensitivity: 100,
    invertY: false,
    autoJump: false,
    masterVolume: 100,
    musicVolume: 100,
    ambientVolume: 100,
    blocksVolume: 100,
    hostileVolume: 100,
    subtitles: false,
    distortionEffects: true,
    fovEffects: true,
  },
};

// ============ BLOCK TYPES ============
const BLOCKS = {
  grass: { top: 0x4a7c23, side: 0x8b5a2b, bottom: 0x5c4033 },
  dirt: { top: 0x8b5a2b, side: 0x8b5a2b, bottom: 0x8b5a2b },
  stone: { top: 0x808080, side: 0x808080, bottom: 0x808080 },
  wood: { top: 0x8b4513, side: 0x654321, bottom: 0x8b4513 },
  leaves: { top: 0x228b22, side: 0x228b22, bottom: 0x228b22 },
  sand: { top: 0xc2b280, side: 0xc2b280, bottom: 0xc2b280 },
  water: { top: 0x1e90ff, side: 0x1e90ff, bottom: 0x1e90ff },
};

// ============ WORLD GENERATION ============
function createBlockMaterial(colors) {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: state.settings.smoothLighting ? false : true,
  });
}

function createBlockGeometry(colors) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const pos = geo.attributes.position;
  const colorsArr = [];
  const color = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y > 0.4) color.setHex(colors.top);
    else if (y < -0.4) color.setHex(colors.bottom);
    else color.setHex(colors.side);
    colorsArr.push(color.r, color.g, color.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colorsArr, 3));
  return geo;
}

class World {
  constructor() {
    this.blocks = new Map();
    this.meshes = [];
    this.group = new THREE.Group();
  }

  blockKey(x, y, z) {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  getBlock(x, y, z) {
    return this.blocks.get(this.blockKey(x, y, z));
  }

  setBlock(x, y, z, type) {
    const key = this.blockKey(x, y, z);
    if (this.blocks.has(key)) return;
    const colors = BLOCKS[type] || BLOCKS.dirt;
    const geo = createBlockGeometry(colors);
    const mat = createBlockMaterial(colors);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.floor(z) + 0.5);
    mesh.userData = { type, x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
    this.group.add(mesh);
    this.meshes.push(mesh);
    this.blocks.set(key, mesh);
  }

  generate(chunkSize = 8, renderDistance = 4) {
    const size = chunkSize * renderDistance;
    const half = size / 2;
    const seed = Math.random() * 10000;

    const noise = (x, z) => {
      return Math.sin(x * 0.1 + seed) * Math.cos(z * 0.1 + seed * 0.7) * 3 +
             Math.sin((x + z) * 0.05) * 5;
    };

    for (let x = -half; x < half; x++) {
      for (let z = -half; z < half; z++) {
        const height = Math.floor(noise(x, z)) + 20;
        for (let y = 0; y <= height; y++) {
          if (y === height) {
            if (height > 22) this.setBlock(x, y, z, 'stone');
            else if (height > 18) this.setBlock(x, y, z, 'grass');
            else this.setBlock(x, y, z, 'sand');
          } else if (y > height - 4) {
            this.setBlock(x, y, z, 'dirt');
          } else {
            this.setBlock(x, y, z, 'stone');
          }
        }
        if (height > 20 && Math.random() < 0.02) {
          const treeHeight = 4 + Math.floor(Math.random() * 3);
          for (let t = 1; t <= treeHeight; t++) this.setBlock(x, height + t, z, 'wood');
          for (let tx = -2; tx <= 2; tx++)
            for (let tz = -2; tz <= 2; tz++)
              for (let ty = 0; ty < 3; ty++)
                if (Math.abs(tx) + Math.abs(tz) + Math.abs(ty - 1) < 4)
                  this.setBlock(x + tx, height + treeHeight + ty, z + tz, 'leaves');
        }
      }
    }
  }
}

// ============ PLAYER & COLLISION ============
class Player {
  constructor() {
    this.position = new THREE.Vector3(0, 25, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.height = 1.8;
    this.radius = 0.3;
    this.onGround = false;
    this.bobPhase = 0;
  }

  getFeetY() { return this.position.y - this.height / 2; }
  getHeadY() { return this.position.y + this.height / 2; }

  intersectsBlock(world, px, py, pz) {
    const r = this.radius;
    const h = this.height;
    const minX = Math.floor(px - r);
    const maxX = Math.floor(px + r);
    const minY = Math.floor(py - h / 2);
    const maxY = Math.floor(py + h / 2);
    const minZ = Math.floor(pz - r);
    const maxZ = Math.floor(pz + r);
    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (world.getBlock(bx, by, bz)) return true;
        }
      }
    }
    return false;
  }

  move(world, delta) {
    const speed = 4.5;
    const jumpForce = 8;
    const gravity = -25;

    let dx = 0, dz = 0;
    if (state.keys['KeyW']) dz -= 1;
    if (state.keys['KeyS']) dz += 1;
    if (state.keys['KeyA']) dx -= 1;
    if (state.keys['KeyD']) dx += 1;

    if (dx !== 0 || dz !== 0) {
      const len = Math.sqrt(dx * dx + dz * dz);
      dx /= len;
      dz /= len;
      const cos = Math.cos(this.rotation.y);
      const sin = Math.sin(this.rotation.y);
      const mdx = dx * cos + dz * sin;
      const mdz = -dx * sin + dz * cos;
      dx = mdx * speed * delta;
      dz = mdz * speed * delta;
    }

    let dy = this.velocity.y * delta;
    this.velocity.y += gravity * delta;

    if (state.keys['Space'] && this.onGround) {
      this.velocity.y = jumpForce;
      this.onGround = false;
    }

    if (dx !== 0 && !this.intersectsBlock(world, this.position.x + dx, this.position.y, this.position.z)) {
      this.position.x += dx;
    }
    if (dy !== 0) {
      if (!this.intersectsBlock(world, this.position.x, this.position.y + dy, this.position.z)) {
        this.position.y += dy;
      } else {
        this.velocity.y = 0;
        if (dy < 0) this.onGround = true;
      }
    }
    if (dz !== 0 && !this.intersectsBlock(world, this.position.x, this.position.y, this.position.z + dz)) {
      this.position.z += dz;
    }

    const groundBlock = world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.getFeetY() - 0.05),
      Math.floor(this.position.z)
    );
    this.onGround = !!groundBlock;

    if (state.settings.autoJump && this.onGround) {
      const ahead = world.getBlock(
        this.position.x + Math.sin(this.rotation.y) * 0.6,
        this.getFeetY() + 0.1,
        this.position.z - Math.cos(this.rotation.y) * 0.6
      );
      const blockAbove = world.getBlock(
        this.position.x + Math.sin(this.rotation.y) * 0.6,
        this.getFeetY() + 1.1,
        this.position.z - Math.cos(this.rotation.y) * 0.6
      );
      if (ahead && !blockAbove) this.velocity.y = jumpForce;
    }
  }
}

// ============ INIT & RENDER ============
function init() {
  if (typeof THREE === 'undefined') {
    document.body.innerHTML = '<div style="padding:2rem;color:red;font-family:sans-serif;">Failed to load Three.js. Check your internet connection and try again.</div>';
    return;
  }
  state.clock = new THREE.Clock();
  const canvas = document.getElementById('game-canvas');
  const container = document.getElementById('game-container');

  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x87ceeb);
  state.scene.fog = new THREE.Fog(0x87ceeb, 20, state.settings.renderDistance * 16);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(50, 100, 50);
  state.scene.add(light);
  state.scene.add(new THREE.AmbientLight(0x404060, 0.6));

  state.camera = new THREE.PerspectiveCamera(
    state.settings.fov,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );

  state.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  state.renderer.setSize(container.clientWidth, container.clientHeight);
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.renderer.shadowMap.enabled = true;

  state.world = new World();
  state.world.generate(8, 4);
  state.scene.add(state.world.group);

  state.player = new Player();
  const spawnY = 30;
  for (let y = spawnY; y > 0; y--) {
    if (state.world.getBlock(0, y, 0)) {
      state.player.position.set(0, y + 2, 0);
      break;
    }
  }

  window.addEventListener('resize', onResize);
  state.initialized = true;
}

function setupMenus() {
  const mainMenu = document.getElementById('main-menu');
  const pauseMenu = document.getElementById('pause-menu');
  const settingsPanel = document.getElementById('settings-panel');
  const canvas = document.getElementById('game-canvas');

  document.getElementById('play-btn').onclick = () => {
    if (!state.initialized) {
      const loading = document.getElementById('loading-overlay');
      loading.classList.add('visible');
      try {
        init();
        loading.classList.remove('visible');
        mainMenu.classList.add('hidden');
        state.isPlaying = true;
        state.isPaused = false;
        canvas.requestPointerLock();
      } catch (err) {
        loading.classList.remove('visible');
        alert('Failed to load game: ' + (err.message || err));
      }
    } else {
      mainMenu.classList.add('hidden');
      state.isPlaying = true;
      state.isPaused = false;
      canvas.requestPointerLock();
    }
  };

  document.getElementById('settings-btn').onclick = () => {
    settingsPanel.classList.add('visible');
  };

  document.getElementById('back-to-game-btn').onclick = () => {
    pauseMenu.classList.remove('visible');
    state.isPaused = false;
    canvas.requestPointerLock();
  };

  document.getElementById('pause-options-btn').onclick = () => {
    pauseMenu.classList.remove('visible');
    settingsPanel.classList.add('visible');
  };

  document.getElementById('save-quit-btn').onclick = () => {
    pauseMenu.classList.remove('visible');
    state.isPlaying = false;
    state.isPaused = false;
    mainMenu.classList.remove('hidden');
    document.exitPointerLock();
  };

  document.getElementById('settings-back-btn').onclick = () => {
    settingsPanel.classList.remove('visible');
    if (state.isPlaying && !state.isPaused) {
      canvas.requestPointerLock();
    } else if (state.isPlaying && state.isPaused) {
      pauseMenu.classList.add('visible');
    }
  };

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (settingsPanel.classList.contains('visible')) {
        settingsPanel.classList.remove('visible');
        if (state.isPlaying) pauseMenu.classList.add('visible');
      } else if (state.isPlaying) {
        state.isPaused = !state.isPaused;
        pauseMenu.classList.toggle('visible', state.isPaused);
        if (state.isPaused) document.exitPointerLock();
        else canvas.requestPointerLock();
      }
    }
  });
}

function setupSettings() {
  const sync = (id, key, formatter = v => v) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') {
      el.checked = state.settings[key];
      el.onchange = () => { state.settings[key] = el.checked; };
    } else if (el.type === 'range') {
      el.value = state.settings[key];
      const valEl = document.getElementById(id + '-val');
      if (valEl) valEl.textContent = formatter(el.value);
      el.oninput = () => {
        state.settings[key] = parseFloat(el.value);
        if (valEl) valEl.textContent = formatter(el.value);
      };
    } else if (el.tagName === 'SELECT') {
      el.value = state.settings[key];
      el.onchange = () => { state.settings[key] = el.value; };
    }
  };

  sync('fullscreen', 'fullscreen');
  sync('gui-scale', 'guiScale');
  sync('brightness', 'brightness', v => v + '%');
  sync('fov', 'fov', v => v + '°');
  sync('render-distance', 'renderDistance', v => v + ' chunks');
  sync('graphics-quality', 'graphicsQuality');
  sync('smooth-lighting', 'smoothLighting');
  sync('max-framerate', 'maxFramerate');
  sync('view-bobbing', 'viewBobbing');
  sync('clouds', 'clouds');
  sync('particles', 'particles');
  sync('mouse-sensitivity', 'mouseSensitivity', v => v + '%');
  sync('invert-y', 'invertY');
  sync('auto-jump', 'autoJump');
  sync('master-volume', 'masterVolume', v => v + '%');
  sync('music-volume', 'musicVolume', v => v + '%');
  sync('ambient-volume', 'ambientVolume', v => v + '%');
  sync('blocks-volume', 'blocksVolume', v => v + '%');
  sync('hostile-volume', 'hostileVolume', v => v + '%');
  sync('subtitles', 'subtitles');
  sync('distortion-effects', 'distortionEffects');
  sync('fov-effects', 'fovEffects');

  document.getElementById('fullscreen').onchange = () => {
    state.settings.fullscreen = document.getElementById('fullscreen').checked;
    if (state.settings.fullscreen) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  };

  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('section-' + tab.dataset.tab).classList.add('active');
    };
  });

  document.querySelectorAll('[data-reset]').forEach(btn => {
    btn.onclick = () => {
      const section = btn.dataset.reset;
      const defaults = {
        video: { brightness: 50, fov: 70 },
        graphics: { renderDistance: 12, graphicsQuality: 'fancy', smoothLighting: true, maxFramerate: 'unlimited', viewBobbing: true, clouds: true, particles: 'all' },
        controls: { mouseSensitivity: 100, invertY: false, autoJump: false },
        sound: { masterVolume: 100, musicVolume: 100, ambientVolume: 100, blocksVolume: 100, hostileVolume: 100 },
        accessibility: { subtitles: false, distortionEffects: true, fovEffects: true },
      };
      Object.assign(state.settings, defaults[section] || {});
      setupSettings();
    };
  });
}

function setupInput() {
  document.addEventListener('keydown', e => { state.keys[e.code] = true; });
  document.addEventListener('keyup', e => { state.keys[e.code] = false; });

  const canvas = document.getElementById('game-canvas');
  canvas.addEventListener('click', () => {
    if (state.isPlaying && !state.isPaused) canvas.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    state.mouse.locked = document.pointerLockElement === canvas;
  });

  document.addEventListener('mousemove', (e) => {
    if (!state.mouse.locked) return;
    const sens = state.settings.mouseSensitivity / 100 * 0.002;
    const inv = state.settings.invertY ? -1 : 1;
    state.player.rotation.y -= e.movementX * sens;
    state.player.rotation.x -= e.movementY * sens * inv;
    state.player.rotation.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, state.player.rotation.x));
  });
}

function onResize() {
  if (!state.camera || !state.renderer) return;
  const container = document.getElementById('game-container');
  state.camera.aspect = container.clientWidth / container.clientHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  if (!state.scene || !state.camera || !state.renderer || !state.clock) return;

  const delta = Math.min(state.clock.getDelta(), 0.1);
  const canvas = document.getElementById('game-canvas');

  if (state.settings.maxFramerate !== 'unlimited') {
    const limit = parseInt(state.settings.maxFramerate);
    if (limit && 1000 / limit > delta * 1000) return;
  }

  if (state.isPlaying && !state.isPaused && state.mouse.locked) {
    state.player.move(state.world, delta);
    state.player.bobPhase += delta * 10;
  }

  state.camera.position.copy(state.player.position);
  state.camera.rotation.copy(state.player.rotation);

  if (state.settings.viewBobbing && state.isPlaying && !state.isPaused) {
    const bob = Math.sin(state.player.bobPhase) * 0.03 * (state.keys['KeyW'] || state.keys['KeyS'] || state.keys['KeyA'] || state.keys['KeyD'] ? 1 : 0);
    state.camera.position.y += bob;
  }

  state.camera.fov = state.settings.fov;
  state.camera.updateProjectionMatrix();

  state.scene.fog.far = state.settings.renderDistance * 16;
  const brightness = 0.5 + (state.settings.brightness - 50) / 200;
  state.scene.background.setHSL(0.6, 0.3, Math.max(0.2, Math.min(1, brightness)));

  state.renderer.render(state.scene, state.camera);
}

// ============ START ============
function start() {
  if (typeof THREE === 'undefined') {
    document.body.innerHTML = '<div style="padding:2rem;color:red;font-family:sans-serif;">Failed to load Three.js. Check your internet connection.</div>';
    return;
  }
  setupMenus();
  setupSettings();
  setupInput();
  animate();
}
start();
