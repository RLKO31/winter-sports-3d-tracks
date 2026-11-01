import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- APPLICATION STATE ---
const state = {
  editionTab: 'modern',      // 'modern' (Tab 1) or 'retro80s' (Tab 2: Garmisch 80s Ski Fashion)
  currentVenue: 'garmisch',  // 'garmisch' or 'ruhpolding'
  styleMode: 'winter',       // Tab 1: 'winter', 'topo', 'clay'
  retroStyleMode: 'bogner',  // Tab 2: 'bogner' (Colorblock '86), 'synth' (Miami Alpine), 'ice' (Electric Glacier)
  showTrackRibbon: true,
  showGradientColors: true,
  showMilestones: true,
  showSimulation: true,
  showWireframe: false,
  autoRotate: false,
  isLightTheme: false,
  hoverPointIndex: null
};

// --- GLOBALS ---
let scene, camera, renderer, controls;
let terrainMesh = null, terrainWireframe = null;
let terrainGeometry = null;
let trackGroup = new THREE.Group();
let milestonesGroup = new THREE.Group();
let retroDecorGroup = new THREE.Group();
let skierMarker = null;

let currentTerrainData = null;
let currentTrackData = null;

// Scale factors
const SCALE = 0.08;
const Z_SCALE = 0.08;

// Lighting
let ambientLight, hemiLight, sunLight;

// --- INITIALIZE APPLICATION ---
async function init() {
  const container = document.getElementById('canvas-container');

  // 1. Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060c18);
  scene.fog = new THREE.FogExp2(0x060c18, 0.0018);

  // 2. Camera setup
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 4000);
  camera.position.set(0, 160, 240);

  // 3. Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  // 4. OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minDistance = 15;
  controls.maxDistance = 650;
  controls.autoRotate = state.autoRotate;
  controls.autoRotateSpeed = 0.6;

  // 5. Lighting
  setupLighting();

  // 6. Groups
  scene.add(trackGroup);
  scene.add(milestonesGroup);
  scene.add(retroDecorGroup);

  // 7. Event Listeners
  setupEventListeners();
  window.addEventListener('resize', onWindowResize);

  // 8. Load Initial Venue
  await switchVenue(state.currentVenue);

  // 9. Animation Loop
  animate();
}

// --- LIGHTING ---
function setupLighting() {
  ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x1e293b, 0.65);
  hemiLight.position.set(0, 300, 0);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
  sunLight.position.set(180, 260, 150);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 800;
  sunLight.shadow.camera.left = -220;
  sunLight.shadow.camera.right = 220;
  sunLight.shadow.camera.top = 220;
  sunLight.shadow.camera.bottom = -220;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);
}

// --- EXACT BILINEAR INTERPOLATION ON THE 3D TERRAIN MESH ---
function sampleTerrainMeshElevation(x, y) {
  if (!currentTerrainData) return 0;
  const { originX, originY, width, height, nx, ny, dem, minZ } = currentTerrainData;
  const maxY = originY + height;

  const u = THREE.MathUtils.clamp(((x - originX) / width) * (nx - 1), 0, nx - 1.0001);
  const v = THREE.MathUtils.clamp(((maxY - y) / height) * (ny - 1), 0, ny - 1.0001);

  const c0 = Math.floor(u), c1 = Math.min(c0 + 1, nx - 1);
  const r0 = Math.floor(v), r1 = Math.min(r0 + 1, ny - 1);
  const du = u - c0;
  const dv = v - r0;

  const z00 = dem[r0 * nx + c0] ?? minZ;
  const z10 = dem[r0 * nx + c1] ?? minZ;
  const z01 = dem[r1 * nx + c0] ?? minZ;
  const z11 = dem[r1 * nx + c1] ?? minZ;

  return (1 - du) * (1 - dv) * z00 +
         du * (1 - dv) * z10 +
         (1 - du) * dv * z01 +
         du * dv * z11;
}

// --- EDITION TAB SWITCHING (TAB 1: MODERN GIS vs TAB 2: 80s RETRO SKI FASHION) ---
async function switchEditionTab(tabName) {
  state.editionTab = tabName;
  const is80s = tabName === 'retro80s';

  document.body.classList.toggle('mode-80s', is80s);

  document.querySelectorAll('.edition-tab').forEach(btn => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  // Tab 2 is specifically designed for the Garmisch Ski Alpin Kandahar track
  if (is80s && state.currentVenue !== 'garmisch') {
    document.querySelectorAll('.venue-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.venue === 'garmisch');
    });
    await switchVenue('garmisch');
  }

  // Update Header & Scene Atmosphere
  const mainTitle = document.getElementById('brand-main-title');
  const subTitle = document.getElementById('brand-sub-title');
  const visLabel = document.getElementById('lbl-vis-mode');

  if (is80s) {
    if (mainTitle) mainTitle.textContent = 'KANDAHAR ’86 JET-SET';
    if (subTitle) subTitle.textContent = '80s Alpine Ski Fashion Edition • Garmisch-Partenkirchen Downhill';
    if (visLabel) visLabel.textContent = '80s Fashion & Pisten-Look';

    scene.background.set(0x16052e);
    scene.fog.color.set(0x16052e);
    hemiLight.color.set(0xff66cc);
    hemiLight.groundColor.set(0x00f0ff);
    hemiLight.intensity = 0.85;
    sunLight.color.set(0xffe600);
    sunLight.intensity = 1.45;
  } else {
    if (mainTitle) mainTitle.textContent = 'Winter Sports 3D Tracks';
    if (subTitle) subTitle.textContent = 'Interaktive 3D-Geländemodelle & Streckenprofile (Saison 2026/27)';
    if (visLabel) visLabel.textContent = '3D-Darstellung';

    const bgColor = state.isLightTheme ? 0xe2e8f0 : 0x060c18;
    scene.background.set(bgColor);
    scene.fog.color.set(bgColor);
    hemiLight.color.set(state.isLightTheme ? 0xffffff : 0x7dd3fc);
    hemiLight.groundColor.set(state.isLightTheme ? 0x94a3b8 : 0x1e293b);
    hemiLight.intensity = 0.65;
    sunLight.color.set(0xfff7ed);
    sunLight.intensity = 1.35;
  }

  updateTerrainStyle();
  buildDetailedTrackRibbon();
  buildMilestones();
  buildRetro80sBackdrop();
  updateUIForVenue();
  drawElevationProfile();
}

// --- VENUE SWITCHING & DATA LOADING ---
async function switchVenue(venueKey) {
  state.currentVenue = venueKey;
  updateLoader(true, `Lade ${venueKey === 'garmisch' ? 'Garmisch Kandahar (HD)' : 'Ruhpolding Chiemgau Arena (HD)'}...`, 30);

  if (terrainMesh) scene.remove(terrainMesh);
  if (terrainWireframe) scene.remove(terrainWireframe);
  while (trackGroup.children.length > 0) trackGroup.remove(trackGroup.children[0]);
  while (milestonesGroup.children.length > 0) milestonesGroup.remove(milestonesGroup.children[0]);
  skierMarker = null;

  try {
    const terrainFile = venueKey === 'garmisch' ? 'assets/garmisch_terrain.json' : 'assets/ruhpolding_terrain.json';
    const trackFile = venueKey === 'garmisch' ? 'assets/garmisch_track.json' : 'assets/ruhpolding_track.json';

    const [resTerrain, resTrack] = await Promise.all([
      fetch(terrainFile).then(r => r.json()),
      fetch(trackFile).then(r => r.json())
    ]);

    currentTerrainData = resTerrain;
    currentTrackData = resTrack;

    updateLoader(true, 'Rendere HD-Streckenkurven & 3D-Pistenband...', 70);

    buildTerrainMesh();
    buildDetailedTrackRibbon();
    buildMilestones();
    buildRetro80sBackdrop();
    updateUIForVenue();
    drawElevationProfile();

    setCameraPreset('iso');
    updateLoader(false);
  } catch (err) {
    console.error('Fehler beim Laden der Streckendaten:', err);
    updateLoader(true, 'Fehler beim Laden der Daten!', 100);
    setTimeout(() => updateLoader(false), 2000);
  }
}

// --- BUILD 3D TERRAIN ---
function buildTerrainMesh() {
  if (!currentTerrainData) return;
  const { nx, ny, width, height, dem, minZ, maxZ } = currentTerrainData;

  const worldWidth = width * SCALE;
  const worldHeight = height * SCALE;

  terrainGeometry = new THREE.PlaneGeometry(worldWidth, worldHeight, nx - 1, ny - 1);
  terrainGeometry.rotateX(-Math.PI / 2);

  const posAttr = terrainGeometry.attributes.position;
  const colors = [];
  const baseZ = minZ;

  for (let i = 0; i < posAttr.count; i++) {
    const elev = dem[i] || baseZ;
    const yVal = (elev - baseZ) * Z_SCALE;
    posAttr.setY(i, yVal);

    const c = getTerrainColor(elev, minZ, maxZ);
    colors.push(c.r, c.g, c.b);
  }

  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeometry.computeVertexNormals();

  const is80s = state.editionTab === 'retro80s';
  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: is80s ? true : (state.styleMode !== 'clay'),
    color: (!is80s && state.styleMode === 'clay') ? 0xd1d5db : 0xffffff,
    roughness: is80s ? 0.45 : (state.styleMode === 'winter' ? 0.8 : 0.6),
    metalness: is80s ? 0.18 : 0.05,
    flatShading: is80s
  });

  terrainMesh = new THREE.Mesh(terrainGeometry, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  scene.add(terrainMesh);

  // Wireframe / Neon Grid
  const wireGeo = new THREE.WireframeGeometry(terrainGeometry);
  const wireMat = new THREE.LineBasicMaterial({
    color: is80s ? 0xff007f : 0x38bdf8,
    transparent: true,
    opacity: is80s ? 0.28 : 0.18,
    linewidth: 1
  });
  terrainWireframe = new THREE.LineSegments(wireGeo, wireMat);
  terrainWireframe.visible = state.showWireframe || is80s;
  scene.add(terrainWireframe);
}

function getTerrainColor(elev, minZ, maxZ) {
  const t = THREE.MathUtils.clamp((elev - minZ) / (maxZ - minZ), 0, 1);
  const c = new THREE.Color();

  // TAB 2: 80s SKI FASHION PALETTES
  if (state.editionTab === 'retro80s') {
    // Crisp neon contour lines every 100m of elevation
    const isContourBand = Math.abs((elev % 100) - 50) < 3.2;

    if (state.retroStyleMode === 'bogner') {
      // Colorblock '86: Deep Indigo Valley -> Electric Teal Mid-mountain -> Hot Magenta Ridge -> Sunburst Peak
      if (isContourBand) {
        c.setHex(0x00f0ff);
      } else if (t < 0.28) {
        c.setRGB(0.14 + t * 0.4, 0.08 + t * 1.1, 0.38 + t * 1.2);
      } else if (t < 0.62) {
        const k = (t - 0.28) / 0.34;
        c.setRGB(0.25 + k * 0.65, 0.38 - k * 0.22, 0.72 - k * 0.15);
      } else {
        const k = (t - 0.62) / 0.38;
        c.setRGB(0.90 + k * 0.1, 0.18 + k * 0.72, 0.57 - k * 0.35);
      }
    } else if (state.retroStyleMode === 'synth') {
      // Miami Alpine: Purple Night -> Neon Pink -> Sunset Orange -> Golden Summit
      if (isContourBand) {
        c.setHex(0xffe600);
      } else if (t < 0.45) {
        const k = t / 0.45;
        c.setRGB(0.18 + k * 0.72, 0.05 + k * 0.08, 0.35 + k * 0.25);
      } else {
        const k = (t - 0.45) / 0.55;
        c.setRGB(0.90 + k * 0.1, 0.13 + k * 0.68, 0.60 - k * 0.50);
      }
    } else {
      // Electric Glacier: Bright Mint/Cyan & Lavender Snow Suit look
      if (isContourBand) {
        c.setHex(0xff007f);
      } else {
        c.setRGB(0.25 + t * 0.68, 0.65 + t * 0.32, 0.85 + t * 0.15);
      }
    }
    return c;
  }

  // TAB 1: STANDARD GIS MODES
  if (state.styleMode === 'winter') {
    if (t < 0.25) {
      c.setRGB(0.55 + t * 0.4, 0.62 + t * 0.35, 0.65 + t * 0.32);
    } else if (t < 0.65) {
      c.setRGB(0.85 + (t - 0.25) * 0.3, 0.9 + (t - 0.25) * 0.25, 0.95);
    } else {
      c.setRGB(0.96, 0.98, 1.0);
    }
  } else if (state.styleMode === 'topo') {
    if (t < 0.33) c.setRGB(0.1 + t * 1.2, 0.65, 0.3);
    else if (t < 0.66) c.setRGB(0.9, 0.65 + (t - 0.33) * 0.5, 0.2);
    else c.setRGB(0.85 + (t - 0.66) * 0.4, 0.35, 0.25);
  } else {
    c.setRGB(0.82, 0.84, 0.86);
  }
  return c;
}

function updateTerrainStyle() {
  if (!terrainGeometry || !currentTerrainData) return;
  const { dem, minZ, maxZ } = currentTerrainData;
  const colors = [];

  for (let i = 0; i < terrainGeometry.attributes.position.count; i++) {
    const elev = dem[i] || minZ;
    const c = getTerrainColor(elev, minZ, maxZ);
    colors.push(c.r, c.g, c.b);
  }

  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeometry.attributes.color.needsUpdate = true;

  const is80s = state.editionTab === 'retro80s';
  if (terrainMesh) {
    terrainMesh.material.vertexColors = is80s ? true : (state.styleMode !== 'clay');
    terrainMesh.material.color.set((!is80s && state.styleMode === 'clay') ? 0xd1d5db : 0xffffff);
    terrainMesh.material.flatShading = is80s;
    terrainMesh.material.roughness = is80s ? 0.45 : (state.styleMode === 'winter' ? 0.8 : 0.6);
    terrainMesh.material.needsUpdate = true;
  }

  if (terrainWireframe) {
    terrainWireframe.material.color.setHex(is80s ? 0xff007f : 0x38bdf8);
    terrainWireframe.material.opacity = is80s ? 0.24 : 0.18;
    terrainWireframe.visible = state.showWireframe || is80s;
  }
}

// --- 80s RETRO SUN & SYNTHWAVE FLOOR GRID BACKDROP ---
function buildRetro80sBackdrop() {
  while (retroDecorGroup.children.length > 0) retroDecorGroup.remove(retroDecorGroup.children[0]);
  if (state.editionTab !== 'retro80s') {
    retroDecorGroup.visible = false;
    return;
  }
  retroDecorGroup.visible = true;

  // 1. Neon Horizon Grid Plane below the mountain base
  const gridHelper = new THREE.GridHelper(600, 48, 0xff007f, 0x00f0ff);
  gridHelper.position.set(0, -1.2, 0);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.35;
  retroDecorGroup.add(gridHelper);

  // 2. Iconic 80s Striped Sunset Disc behind the Kreuzjoch mountain peak (South)
  const sunGeo = new THREE.CircleGeometry(75, 48);
  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = 256;
  sunCanvas.height = 256;
  const sctx = sunCanvas.getContext('2d');
  const grad = sctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#ffe600');
  grad.addColorStop(0.45, '#ff5e00');
  grad.addColorStop(1.0, '#ff007f');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 256, 256);

  // Cut horizontal 80s synthwave blinds in lower half
  sctx.globalCompositeOperation = 'destination-out';
  for (let y = 135; y < 256; y += 16) {
    const barH = Math.min(10, (y - 125) * 0.09);
    sctx.fillRect(0, y, 256, barH);
  }
  const sunTex = new THREE.CanvasTexture(sunCanvas);
  const sunMat = new THREE.MeshBasicMaterial({
    map: sunTex,
    transparent: true,
    side: THREE.DoubleSide,
    fog: false
  });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.position.set(20, 95, -175);
  retroDecorGroup.add(sunMesh);
}

// --- CONVERT WORLD COORDINATES TO THREE.JS LOCAL SCENE ---
// Uses exact bilinear interpolation of the 3D terrain mesh so the track ribbon never floats or sinks!
function worldToLocal(x, y, zOverride = null) {
  const { originX, originY, width, height, minZ } = currentTerrainData;
  const centerX = originX + width / 2;
  const centerY = originY + height / 2;

  const lx = (x - centerX) * SCALE;
  const lz = -(y - centerY) * SCALE;
  const meshSurfaceZ = sampleTerrainMeshElevation(x, y);
  const ly = (meshSurfaceZ - minZ) * Z_SCALE + 0.45; // Sits flush right on top of the 3D slope surface
  return new THREE.Vector3(lx, ly, lz);
}

// --- GRADIENT COLOR FOR SLOPE IN PERCENT ---
function getGradientColor(grad, idx = 0) {
  const c = new THREE.Color();

  // In 80s Ski Fashion Mode: Vibrant Neon Color-Block Racing Stripes along the slope
  if (state.editionTab === 'retro80s') {
    if (grad >= 70) {
      c.setHex(0xff007f); // Hot Magenta for extreme pitches (Freier Fall)
    } else if (grad >= 42) {
      c.setHex(0xffe600); // Sunburst Neon Yellow for steep race sections
    } else if (grad >= 22) {
      c.setHex(0x00f0ff); // Electric Cyan for medium carving turns
    } else {
      c.setHex(0xbf00ff); // Electric Purple for high-speed gliding sections
    }
    return c;
  }

  // Standard GIS Mode: 0-25% (Green/Cyan) -> 25-50% (Amber) -> 50-75% (Red) -> 75%+ (Dark Red/Purple 'Freier Fall')
  if (grad < 25) {
    c.setRGB(0.06, 0.72, 0.51);
  } else if (grad < 50) {
    c.setRGB(0.96, 0.62, 0.04);
  } else if (grad < 75) {
    c.setRGB(0.93, 0.27, 0.18);
  } else {
    c.setRGB(0.75, 0.05, 0.25);
  }
  return c;
}

// --- BUILD HIGH-RESOLUTION 3D PISTENBAND (RIBBON MESH) ---
let trackPoints3D = [];
function buildDetailedTrackRibbon() {
  while (trackGroup.children.length > 0) trackGroup.remove(trackGroup.children[0]);
  if (!currentTrackData || !currentTrackData.points) return;

  const is80s = state.editionTab === 'retro80s';
  const pts = currentTrackData.points;
  trackPoints3D = pts.map(p => worldToLocal(p[0], p[1], p[2]));

  const ribbonWidth = state.currentVenue === 'garmisch' ? (is80s ? 1.85 : 1.45) : 1.05;
  const halfW = ribbonWidth / 2;

  const positions = [];
  const colors = [];
  const indices = [];
  const leftEdgePts = [];
  const rightEdgePts = [];

  for (let i = 0; i < trackPoints3D.length; i++) {
    const cur = trackPoints3D[i];
    const worldX = pts[i][0];
    const worldY = pts[i][1];

    // Compute tangent vector in XZ plane
    let forward = new THREE.Vector3();
    if (i < trackPoints3D.length - 1) {
      forward.subVectors(trackPoints3D[i + 1], cur).normalize();
    } else {
      forward.subVectors(cur, trackPoints3D[i - 1]).normalize();
    }

    // Normal orthogonal to forward and world UP (0, 1, 0)
    const side = new THREE.Vector3(-forward.z, 0, forward.x).normalize();

    // Sample exact terrain height at left and right ribbon edges so the ribbon banks naturally with the mountain!
    const edgeOffsetWorld = (halfW / SCALE);
    const dirWorldX = side.x;
    const dirWorldY = -side.z;

    const leftPt = worldToLocal(worldX - dirWorldX * edgeOffsetWorld, worldY - dirWorldY * edgeOffsetWorld);
    const rightPt = worldToLocal(worldX + dirWorldX * edgeOffsetWorld, worldY + dirWorldY * edgeOffsetWorld);

    leftEdgePts.push(leftPt);
    rightEdgePts.push(rightPt);

    positions.push(leftPt.x, leftPt.y, leftPt.z);
    positions.push(rightPt.x, rightPt.y, rightPt.z);

    let c = new THREE.Color();
    if (state.showGradientColors && currentTrackData.gradients) {
      const grad = currentTrackData.gradients[i] || 0;
      c = getGradientColor(grad, i);
    } else {
      c.setHex(state.currentVenue === 'garmisch' ? 0xf59e0b : 0x10b981);
    }

    colors.push(c.r, c.g, c.b);
    colors.push(c.r, c.g, c.b);

    if (i < trackPoints3D.length - 1) {
      const i0 = i * 2;
      const i1 = i * 2 + 1;
      const i2 = (i + 1) * 2;
      const i3 = (i + 1) * 2 + 1;

      indices.push(i0, i1, i2);
      indices.push(i1, i3, i2);
    }
  }

  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  ribbonGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  ribbonGeo.setIndex(indices);
  ribbonGeo.computeVertexNormals();

  const ribbonMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: is80s ? 0.2 : 0.35,
    metalness: is80s ? 0.3 : 0.15,
    emissive: is80s ? 0x220033 : 0x000000,
    emissiveIntensity: is80s ? 0.45 : 0
  });

  const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbonMesh.castShadow = true;
  ribbonMesh.receiveShadow = true;
  trackGroup.add(ribbonMesh);

  // Centerline & Racing Stripe Rails
  const lineGeo = new THREE.BufferGeometry().setFromPoints(trackPoints3D);
  const lineMat = new THREE.LineBasicMaterial({
    color: is80s ? 0xffe600 : 0xffffff,
    linewidth: 2,
    transparent: true,
    opacity: 0.9
  });
  trackGroup.add(new THREE.Line(lineGeo, lineMat));

  if (is80s) {
    // 80s Triple Racing Stripe Edge Rails (Hot Pink left rail, Electric Cyan right rail)
    const leftGeo = new THREE.BufferGeometry().setFromPoints(leftEdgePts);
    const rightGeo = new THREE.BufferGeometry().setFromPoints(rightEdgePts);
    trackGroup.add(new THREE.Line(leftGeo, new THREE.LineBasicMaterial({ color: 0xff007f, linewidth: 2 })));
    trackGroup.add(new THREE.Line(rightGeo, new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 })));
  }

  // Penalty Loop for Ruhpolding
  if (currentTrackData.penaltyLoop) {
    const penPts = currentTrackData.penaltyLoop.map(p => worldToLocal(p[0], p[1], p[2]));
    const penGeo = new THREE.BufferGeometry().setFromPoints(penPts);
    const penMat = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 });
    trackGroup.add(new THREE.LineLoop(penGeo, penMat));
  }

  // Skier / Runner Marker
  const sphereGeo = new THREE.SphereGeometry(is80s ? 2.1 : 1.7, 16, 16);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: is80s ? 0xffe600 : 0x38bdf8,
    emissive: is80s ? 0xff007f : 0x38bdf8,
    emissiveIntensity: 1.4,
    roughness: 0.1
  });
  skierMarker = new THREE.Mesh(sphereGeo, sphereMat);
  skierMarker.visible = state.showSimulation;
  trackGroup.add(skierMarker);

  trackGroup.visible = state.showTrackRibbon;
}

// --- BUILD MILESTONES (STATION FLAGS & 80s SLALOM ARCHES) ---
function buildMilestones() {
  while (milestonesGroup.children.length > 0) milestonesGroup.remove(milestonesGroup.children[0]);
  if (!currentTrackData || !currentTrackData.milestones) return;

  const is80s = state.editionTab === 'retro80s';

  currentTrackData.milestones.forEach((m, idx) => {
    const pos = worldToLocal(m.coord[0], m.coord[1], m.coord[2]);
    const group = new THREE.Group();
    group.position.copy(pos);

    const isSpecial = m.name.includes('Freier Fall') || m.name.includes('Schießstand') || idx === 0 || idx === currentTrackData.milestones.length - 1;

    // Mast
    const mastGeo = new THREE.CylinderGeometry(0.25, 0.25, is80s ? 7.5 : 6, 8);
    mastGeo.translate(0, is80s ? 3.75 : 3, 0);
    const mastColor = is80s ? (idx % 2 === 0 ? 0x00f0ff : 0xffe600) : 0xffffff;
    const mastMat = new THREE.MeshStandardMaterial({ color: mastColor, metalness: 0.8, roughness: 0.2 });
    group.add(new THREE.Mesh(mastGeo, mastMat));

    // Flag or Beacon at top
    const flagGeo = is80s
      ? new THREE.OctahedronGeometry(isSpecial ? 2.2 : 1.5, 0)
      : new THREE.SphereGeometry(isSpecial ? 1.8 : 1.2, 12, 12);
    flagGeo.translate(0, is80s ? 8.2 : 6.5, 0);

    const beaconColor = is80s
      ? (isSpecial ? 0xff007f : (idx % 2 === 0 ? 0xffe600 : 0x00f0ff))
      : (isSpecial ? 0xef4444 : 0x38bdf8);

    const flagMat = new THREE.MeshStandardMaterial({
      color: beaconColor,
      emissive: beaconColor,
      emissiveIntensity: is80s ? 1.1 : 0.85
    });
    const flagMesh = new THREE.Mesh(flagGeo, flagMat);
    flagMesh.userData = { milestone: m };
    group.add(flagMesh);

    milestonesGroup.add(group);
  });

  milestonesGroup.visible = state.showMilestones;
}

// --- CAMERA PRESET VIEWS ---
function setCameraPreset(presetKey) {
  if (!currentTrackData) return;
  const targetCam = new THREE.Vector3();
  const targetLook = new THREE.Vector3(0, 0, 0);

  const startPt = trackPoints3D[0] || new THREE.Vector3(0, 20, 0);
  const finishPt = trackPoints3D[trackPoints3D.length - 1] || new THREE.Vector3(0, 0, 0);

  switch (presetKey) {
    case 'iso':
      targetCam.set(0, 165, 225);
      targetLook.set(0, 25, 0);
      break;
    case 'start':
      targetCam.set(startPt.x + 32, startPt.y + 22, startPt.z + 42);
      targetLook.copy(startPt);
      break;
    case 'finish':
      targetCam.set(finishPt.x + 28, finishPt.y + 18, finishPt.z + 38);
      targetLook.copy(finishPt);
      break;
    case 'key':
      const keyM = currentTrackData.milestones.find(m => m.name.includes('Freier Fall') || m.name.includes('Fischer S'));
      if (keyM) {
        const kp = worldToLocal(keyM.coord[0], keyM.coord[1], keyM.coord[2]);
        targetCam.set(kp.x + 25, kp.y + 18, kp.z + 30);
        targetLook.copy(kp);
      }
      break;
    case 'top':
      targetCam.set(0, 310, 2);
      targetLook.set(0, 0, 0);
      break;
  }

  tweenCamera(targetCam, targetLook);
}

function tweenCamera(targetCam, targetLook) {
  let step = 0;
  function tween() {
    if (step < 35) {
      camera.position.lerp(targetCam, 0.09);
      controls.target.lerp(targetLook, 0.09);
      controls.update();
      step++;
      requestAnimationFrame(tween);
    }
  }
  tween();
}

// --- UPDATE UI ELEMENTS & MILESTONE LIST ---
function updateUIForVenue() {
  const d = currentTrackData;
  if (!d) return;

  const sportBadge = document.getElementById('track-sport-badge');
  sportBadge.textContent = d.sport;
  sportBadge.className = `badge ${d.sport === 'Ski Alpin' ? 'alpine' : 'biathlon'}`;

  document.getElementById('track-title').textContent = d.trackName;
  document.getElementById('track-venue-location').textContent = `${d.venue}, Deutschland`;

  document.getElementById('stat-length').textContent = `${d.lengthMeters.toLocaleString('de-DE')} m`;
  document.getElementById('stat-drop').textContent = `${d.dropMeters ? d.dropMeters + ' m' : d.totalClimb + ' m Anstieg'}`;
  document.getElementById('stat-elev').textContent = `${Math.round(d.startElevation)} / ${Math.round(d.finishElevation)} m`;

  const specLabel = document.getElementById('stat-special-label');
  const specVal = document.getElementById('stat-special-val');
  if (d.maxGradientPercent) {
    specLabel.textContent = 'Max. Gefälle';
    specVal.textContent = `${d.maxGradientPercent} % (Freier Fall)`;
  } else {
    specLabel.textContent = 'Höchster Punkt';
    specVal.textContent = `${Math.round(d.highestPoint)} m ü. NHN`;
  }

  // Update Camera Preset Button Label for Key Section
  const keyCamBtn = document.querySelector('.cam-btn[data-cam="key"]');
  if (keyCamBtn) {
    keyCamBtn.innerHTML = d.sport === 'Ski Alpin'
      ? '<i class="fa-solid fa-bolt"></i> Freier Fall (92%)'
      : '<i class="fa-solid fa-bolt"></i> Fischer-S & Schießstand';
  }

  // Populate Milestones List
  const msList = document.getElementById('milestones-list');
  msList.innerHTML = '';
  d.milestones.forEach((m, idx) => {
    const item = document.createElement('div');
    item.className = 'milestone-item';
    item.innerHTML = `
      <span><strong>${idx + 1}.</strong> ${m.name}</span>
      <span class="milestone-elev">${Math.round(m.coord[2])} m</span>
    `;
    item.addEventListener('click', () => {
      focusMilestone(m);
    });
    msList.appendChild(item);
  });
}

function focusMilestone(m) {
  const p = worldToLocal(m.coord[0], m.coord[1], m.coord[2]);
  const targetCam = new THREE.Vector3(p.x + 22, p.y + 16, p.z + 28);
  tweenCamera(targetCam, p);

  const tooltip = document.getElementById('milestone-tooltip');
  document.getElementById('tooltip-title').textContent = m.name;
  document.getElementById('tooltip-elev').textContent = `${Math.round(m.coord[2])} m`;
  document.getElementById('tooltip-desc').textContent = m.desc;
  tooltip.classList.add('active');
  setTimeout(() => tooltip.classList.remove('active'), 5000);
}

// --- DRAW INTERACTIVE ELEVATION PROFILE HUD (CANVAS) ---
function drawElevationProfile() {
  const canvas = document.getElementById('elevation-canvas');
  if (!canvas || !currentTrackData) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const is80s = state.editionTab === 'retro80s';
  const pts = currentTrackData.points;
  const elevs = pts.map(p => p[2]);
  const minE = Math.min(...elevs) - 20;
  const maxE = Math.max(...elevs) + 20;

  const w = rect.width;
  const h = rect.height;
  const padL = 44, padR = 20, padT = 10, padB = 18;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  ctx.clearRect(0, 0, w, h);

  // Background Gridlines
  ctx.strokeStyle = is80s ? 'rgba(0, 240, 255, 0.22)' : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let s = 0; s <= 3; s++) {
    const gy = padT + (plotH / 3) * s;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(w - padR, gy);
    ctx.stroke();

    const elevLabel = Math.round(maxE - ((maxE - minE) / 3) * s);
    ctx.fillStyle = is80s ? '#ffe600' : '#64748b';
    ctx.font = is80s ? 'bold 10px JetBrains Mono' : '10px JetBrains Mono';
    ctx.fillText(`${elevLabel}m`, 4, gy + 3);
  }

  // Subtle area fill under profile
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  for (let i = 0; i < pts.length; i++) {
    const x = padL + (i / (pts.length - 1)) * plotW;
    const y = padT + plotH - ((pts[i][2] - minE) / (maxE - minE)) * plotH;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.closePath();
  const areaGrad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  if (is80s) {
    areaGrad.addColorStop(0, 'rgba(255, 0, 127, 0.38)');
    areaGrad.addColorStop(1, 'rgba(0, 240, 255, 0.05)');
  } else {
    areaGrad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    areaGrad.addColorStop(1, 'rgba(56, 189, 248, 0.02)');
  }
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // Draw Profile Line colored by gradient
  for (let i = 0; i < pts.length - 1; i++) {
    const x1 = padL + (i / (pts.length - 1)) * plotW;
    const y1 = padT + plotH - ((pts[i][2] - minE) / (maxE - minE)) * plotH;
    const x2 = padL + ((i + 1) / (pts.length - 1)) * plotW;
    const y2 = padT + plotH - ((pts[i + 1][2] - minE) / (maxE - minE)) * plotH;

    const grad = currentTrackData.gradients ? currentTrackData.gradients[i] : 20;
    const strokeC = getGradientColor(grad, i);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = `#${strokeC.getHexString()}`;
    ctx.lineWidth = is80s ? 3.2 : 2.5;
    ctx.stroke();
  }

  // Milestone Markers on HUD
  currentTrackData.milestones.forEach(m => {
    const i = m.pointIndex;
    const x = padL + (i / (pts.length - 1)) * plotW;
    const y = padT + plotH - ((m.coord[2] - minE) / (maxE - minE)) * plotH;

    ctx.beginPath();
    ctx.arc(x, y, is80s ? 4.8 : 4.0, 0, Math.PI * 2);
    ctx.fillStyle = is80s ? '#ffe600' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = is80s ? '#ff007f' : '#0284c7';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Hover Indicator Line
  if (state.hoverPointIndex !== null && pts[state.hoverPointIndex]) {
    const hi = state.hoverPointIndex;
    const hx = padL + (hi / (pts.length - 1)) * plotW;
    const hy = padT + plotH - ((pts[hi][2] - minE) / (maxE - minE)) * plotH;

    ctx.beginPath();
    ctx.moveTo(hx, padT);
    ctx.lineTo(hx, padT + plotH);
    ctx.strokeStyle = is80s ? '#ffe600' : '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(hx, hy, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = is80s ? '#ff007f' : '#38bdf8';
    ctx.fill();
  }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  // Top-level Edition Tabs (Tab 1: Standard GIS vs Tab 2: 80s Retro Ski Fashion)
  document.querySelectorAll('.edition-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      switchEditionTab(btn.dataset.tab);
    });
  });

  // Venue Switcher (Tab 1)
  document.querySelectorAll('.venue-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.venue-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchVenue(btn.dataset.venue);
    });
  });

  // Tab 1 Terrain Style Selector
  document.querySelectorAll('.style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.styleMode = btn.dataset.style;
      updateTerrainStyle();
    });
  });

  // Tab 2 80s Fashion Style Selector
  document.querySelectorAll('.retro-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.retro-style-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.retroStyleMode = btn.dataset.retrostyle;
      updateTerrainStyle();
      buildDetailedTrackRibbon();
      drawElevationProfile();
    });
  });

  // Camera Preset Buttons
  document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setCameraPreset(btn.dataset.cam);
    });
  });

  // Interactive Elevation Profile Canvas (Hover & Click to fly to track point)
  const elevCanvas = document.getElementById('elevation-canvas');
  const hoverInfo = document.getElementById('hud-hover-info');
  if (elevCanvas) {
    elevCanvas.addEventListener('mousemove', e => {
      if (!currentTrackData || !currentTrackData.points) return;
      const rect = elevCanvas.getBoundingClientRect();
      const padL = 44, padR = 20;
      const plotW = rect.width - padL - padR;
      const relX = THREE.MathUtils.clamp((e.clientX - rect.left - padL) / plotW, 0, 1);
      const pts = currentTrackData.points;
      const idx = Math.round(relX * (pts.length - 1));
      state.hoverPointIndex = idx;

      const distM = Math.round(relX * currentTrackData.lengthMeters);
      const elevM = Math.round(pts[idx][2]);
      const gradPct = currentTrackData.gradients ? currentTrackData.gradients[idx] : 0;
      if (hoverInfo) {
        hoverInfo.textContent = `Distanz: ${distM} m | Höhe: ${elevM} m | Gefälle: ${gradPct} % (Klicken für 3D-Zoom)`;
      }
      drawElevationProfile();
    });

    elevCanvas.addEventListener('mouseleave', () => {
      state.hoverPointIndex = null;
      if (hoverInfo) {
        hoverInfo.textContent = 'Bewege die Maus über das Profil oder klicke auf einen Abschnitt';
      }
      drawElevationProfile();
    });

    elevCanvas.addEventListener('click', () => {
      if (state.hoverPointIndex !== null && trackPoints3D[state.hoverPointIndex]) {
        const pt = trackPoints3D[state.hoverPointIndex];
        const targetCam = new THREE.Vector3(pt.x + 22, pt.y + 16, pt.z + 28);
        tweenCamera(targetCam, pt);
      }
    });
  }

  const togTrack = document.getElementById('toggle-track');
  if (togTrack) togTrack.addEventListener('change', e => {
    state.showTrackRibbon = e.target.checked;
    trackGroup.visible = state.showTrackRibbon;
  });

  const togMilestones = document.getElementById('toggle-milestones');
  if (togMilestones) togMilestones.addEventListener('change', e => {
    state.showMilestones = e.target.checked;
    milestonesGroup.visible = state.showMilestones;
  });

  const togPulse = document.getElementById('toggle-pulse');
  if (togPulse) togPulse.addEventListener('change', e => {
    state.showSimulation = e.target.checked;
    if (skierMarker) skierMarker.visible = state.showSimulation;
  });

  const togWire = document.getElementById('toggle-wireframe');
  if (togWire) togWire.addEventListener('change', e => {
    state.showWireframe = e.target.checked;
    if (terrainWireframe) terrainWireframe.visible = state.showWireframe;
  });

  const togRotate = document.getElementById('toggle-rotate');
  if (togRotate) togRotate.addEventListener('change', e => {
    state.autoRotate = e.target.checked;
    controls.autoRotate = state.autoRotate;
  });

  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  const legalModal = document.getElementById('legal-modal');
  const openLegal = document.getElementById('btn-open-legal');
  const closeLegal = document.getElementById('btn-close-modal');
  const ackLegal = document.getElementById('btn-modal-ack');

  const openM = () => legalModal.classList.add('active');
  const closeM = () => legalModal.classList.remove('active');

  if (openLegal) openLegal.addEventListener('click', openM);
  if (closeLegal) closeLegal.addEventListener('click', closeM);
  if (ackLegal) ackLegal.addEventListener('click', closeM);
  if (legalModal) {
    legalModal.addEventListener('click', e => {
      if (e.target === legalModal) closeM();
    });
  }
}

function toggleTheme() {
  if (state.editionTab === 'retro80s') {
    // In 80s mode, cycle between the 3 80s fashion looks on theme button click
    const modes = ['bogner', 'synth', 'ice'];
    const next = modes[(modes.indexOf(state.retroStyleMode) + 1) % modes.length];
    state.retroStyleMode = next;
    document.querySelectorAll('.retro-style-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.retrostyle === next);
    });
    updateTerrainStyle();
    drawElevationProfile();
    return;
  }

  state.isLightTheme = !state.isLightTheme;
  document.body.classList.toggle('theme-light', state.isLightTheme);

  const bgColor = state.isLightTheme ? 0xe2e8f0 : 0x060c18;
  scene.background.set(bgColor);
  scene.fog.color.set(bgColor);
  hemiLight.color.set(state.isLightTheme ? 0xffffff : 0x7dd3fc);
  hemiLight.groundColor.set(state.isLightTheme ? 0x94a3b8 : 0x1e293b);
  ambientLight.intensity = state.isLightTheme ? 0.7 : 0.45;
}

function updateLoader(show, text = '', progress = 0) {
  const overlay = document.getElementById('loader-overlay');
  const statusEl = document.getElementById('loader-status');
  const barEl = document.getElementById('loader-progress-bar');

  if (statusEl && text) statusEl.textContent = text;
  if (barEl && progress) barEl.style.width = `${progress}%`;

  if (overlay) {
    if (show) overlay.classList.remove('fade-out');
    else overlay.classList.add('fade-out');
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  drawElevationProfile();
}

// --- ANIMATION LOOP ---
let animProgress = 0;
function animate() {
  requestAnimationFrame(animate);

  if (state.showSimulation && skierMarker && trackPoints3D.length > 1) {
    animProgress += 0.0018; // Continuous downhill progression from Start (Kreuzjoch) to Finish
    if (animProgress > 1.0) animProgress = 0;

    const totalPts = trackPoints3D.length - 1;
    const exactIndex = animProgress * totalPts;
    const idx0 = Math.floor(exactIndex);
    const idx1 = Math.min(totalPts, idx0 + 1);
    const ratio = exactIndex - idx0;

    skierMarker.position.lerpVectors(trackPoints3D[idx0], trackPoints3D[idx1], ratio);
  }

  controls.update();
  renderer.render(scene, camera);
}

init();
