import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- APPLICATION STATE ---
const state = {
  currentVenue: 'garmisch', // 'garmisch' or 'ruhpolding'
  styleMode: 'winter',      // 'winter', 'topo', 'clay'
  showTrack: true,
  showMilestones: true,
  showSimulation: true,
  showWireframe: false,
  autoRotate: false,
  isLightTheme: false
};

// --- GLOBALS ---
let scene, camera, renderer, controls;
let terrainMesh = null, terrainWireframe = null;
let terrainGeometry = null;
let trackGroup = new THREE.Group();
let milestonesGroup = new THREE.Group();
let skierMarker = null;

let currentTerrainData = null;
let currentTrackData = null;

// Scale factors: 1 unit in Three.js = 10 meters
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
  scene.fog = new THREE.FogExp2(0x060c18, 0.002);

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
  controls.maxPolarAngle = Math.PI / 2 - 0.03; // Don't go below ground
  controls.minDistance = 20;
  controls.maxDistance = 600;
  controls.autoRotate = state.autoRotate;
  controls.autoRotateSpeed = 0.6;

  // 5. Lighting
  setupLighting();

  // 6. Groups
  scene.add(trackGroup);
  scene.add(milestonesGroup);

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

  // Sunlight (Directional with soft shadows)
  sunLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
  sunLight.position.set(180, 260, 150);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 800;
  sunLight.shadow.camera.left = -200;
  sunLight.shadow.camera.right = 200;
  sunLight.shadow.camera.top = 200;
  sunLight.shadow.camera.bottom = -200;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);
}

// --- VENUE SWITCHING & DATA LOADING ---
async function switchVenue(venueKey) {
  state.currentVenue = venueKey;
  updateLoader(true, `Lade ${venueKey === 'garmisch' ? 'Garmisch Kandahar' : 'Ruhpolding Chiemgau Arena'}...`, 30);

  // Clear previous venue objects
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

    updateLoader(true, 'Erzeuge 3D-Geländerelief & Rennstrecken-Geometrie...', 70);

    buildTerrainMesh();
    buildTrackMesh();
    buildMilestones();
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
  terrainGeometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

  const posAttr = terrainGeometry.attributes.position;
  const colors = [];

  const baseZ = minZ;

  for (let i = 0; i < posAttr.count; i++) {
    const elev = dem[i] || baseZ;
    const yVal = (elev - baseZ) * Z_SCALE;
    posAttr.setY(i, yVal);

    // Compute color based on style
    const c = getTerrainColor(elev, minZ, maxZ);
    colors.push(c.r, c.g, c.b);
  }

  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeometry.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: state.styleMode !== 'clay',
    color: state.styleMode === 'clay' ? 0xd1d5db : 0xffffff,
    roughness: state.styleMode === 'winter' ? 0.8 : 0.6,
    metalness: 0.05,
    flatShading: false
  });

  terrainMesh = new THREE.Mesh(terrainGeometry, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  scene.add(terrainMesh);

  // Wireframe
  const wireGeo = new THREE.WireframeGeometry(terrainGeometry);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.18,
    linewidth: 1
  });
  terrainWireframe = new THREE.LineSegments(wireGeo, wireMat);
  terrainWireframe.visible = state.showWireframe;
  scene.add(terrainWireframe);
}

// Terrain Color Function
function getTerrainColor(elev, minZ, maxZ) {
  const t = THREE.MathUtils.clamp((elev - minZ) / (maxZ - minZ), 0, 1);
  const c = new THREE.Color();

  if (state.styleMode === 'winter') {
    // Winter Alpine Palette: Talgrün / Waldbraun -> Frischer Pulverschnee & Firn
    if (t < 0.25) {
      c.setRGB(0.55 + t * 0.4, 0.62 + t * 0.35, 0.65 + t * 0.32); // Lower elevation snow/rock mix
    } else if (t < 0.65) {
      c.setRGB(0.85 + (t - 0.25) * 0.3, 0.9 + (t - 0.25) * 0.25, 0.95); // Deep winter snowpack
    } else {
      c.setRGB(0.96, 0.98, 1.0); // Pure glacial/summit alpine snow
    }
  } else if (state.styleMode === 'topo') {
    // Hypsometric tint (Emerald -> Amber -> Ochre -> Snow)
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

  if (terrainMesh) {
    terrainMesh.material.vertexColors = state.styleMode !== 'clay';
    terrainMesh.material.color.set(state.styleMode === 'clay' ? 0xd1d5db : 0xffffff);
    terrainMesh.material.needsUpdate = true;
  }
}

// --- CONVERT WORLD COORDINATES TO THREE.JS LOCAL SCENE ---
function worldToLocal(x, y, z) {
  const { originX, originY, width, height, minZ } = currentTerrainData;
  const centerX = originX + width / 2;
  const centerY = originY + height / 2;

  const lx = (x - centerX) * SCALE;
  const lz = -(y - centerY) * SCALE; // Invert Y to Z
  const ly = (z - minZ) * Z_SCALE + 1.2; // Elevation slightly lifted above ground
  return new THREE.Vector3(lx, ly, lz);
}

// --- BUILD 3D RACE TRACK MESH (RIBBON / TUBE) ---
let trackPoints3D = [];
function buildTrackMesh() {
  while (trackGroup.children.length > 0) trackGroup.remove(trackGroup.children[0]);
  if (!currentTrackData) return;

  trackPoints3D = currentTrackData.points.map(pt => worldToLocal(pt[0], pt[1], pt[2]));

  // 1. Create CatmullRom Curve for smooth race track
  const curve = new THREE.CatmullRomCurve3(trackPoints3D);
  const trackColor = state.currentVenue === 'garmisch' ? 0xf59e0b : 0x10b981; // Amber for Alpine, Emerald for Biathlon

  // Extrude TubeGeometry
  const tubeGeo = new THREE.TubeGeometry(curve, 180, 1.2, 8, false);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: trackColor,
    emissive: trackColor,
    emissiveIntensity: 0.55,
    roughness: 0.3,
    metalness: 0.2
  });
  const trackMesh = new THREE.Mesh(tubeGeo, tubeMat);
  trackMesh.castShadow = true;
  trackGroup.add(trackMesh);

  // If Ruhpolding, also add the 150m penalty loop in red
  if (currentTrackData.penaltyLoop) {
    const penaltyPoints = currentTrackData.penaltyLoop.map(pt => worldToLocal(pt[0], pt[1], pt[2]));
    const penaltyCurve = new THREE.CatmullRomCurve3(penaltyPoints, true);
    const penTubeGeo = new THREE.TubeGeometry(penaltyCurve, 32, 0.9, 6, true);
    const penTubeMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.7,
      roughness: 0.3
    });
    trackGroup.add(new THREE.Mesh(penTubeGeo, penTubeMat));
  }

  // 2. Animated Skier / Runner marker
  const sphereGeo = new THREE.SphereGeometry(2.2, 16, 16);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.0,
    roughness: 0.1
  });
  skierMarker = new THREE.Mesh(sphereGeo, sphereMat);
  trackGroup.add(skierMarker);

  trackGroup.visible = state.showTrack;
}

// --- BUILD MILESTONES (STATION FLAGS) ---
function buildMilestones() {
  while (milestonesGroup.children.length > 0) milestonesGroup.remove(milestonesGroup.children[0]);
  if (!currentTrackData || !currentTrackData.milestones) return;

  currentTrackData.milestones.forEach((m, idx) => {
    const pos = worldToLocal(m.coord[0], m.coord[1], m.coord[2]);
    const group = new THREE.Group();
    group.position.copy(pos);

    // Mast
    const mastGeo = new THREE.CylinderGeometry(0.3, 0.3, 6, 8);
    mastGeo.translate(0, 3, 0);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8 });
    group.add(new THREE.Mesh(mastGeo, mastMat));

    // Flag or Beacon at top
    const isSpecial = m.name.includes('Freier Fall') || m.name.includes('Schießstand');
    const flagGeo = new THREE.SphereGeometry(isSpecial ? 1.8 : 1.2, 12, 12);
    flagGeo.translate(0, 6.5, 0);
    const flagMat = new THREE.MeshStandardMaterial({
      color: isSpecial ? 0xef4444 : 0x38bdf8,
      emissive: isSpecial ? 0xef4444 : 0x0284c7,
      emissiveIntensity: 0.8
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
      targetCam.set(0, 170, 230);
      targetLook.set(0, 20, 0);
      break;
    case 'start':
      targetCam.set(startPt.x + 35, startPt.y + 25, startPt.z + 45);
      targetLook.copy(startPt);
      break;
    case 'finish':
      targetCam.set(finishPt.x + 30, finishPt.y + 20, finishPt.z + 40);
      targetLook.copy(finishPt);
      break;
    case 'key':
      // Focus on Freier Fall or Fischer S
      const keyM = currentTrackData.milestones.find(m => m.name.includes('Freier Fall') || m.name.includes('Fischer S'));
      if (keyM) {
        const kp = worldToLocal(keyM.coord[0], keyM.coord[1], keyM.coord[2]);
        targetCam.set(kp.x + 25, kp.y + 18, kp.z + 30);
        targetLook.copy(kp);
      }
      break;
    case 'top':
      targetCam.set(0, 320, 2);
      targetLook.set(0, 0, 0);
      break;
  }

  // Smooth Camera Tween
  let step = 0;
  function tween() {
    if (step < 35) {
      camera.position.lerp(targetCam, 0.08);
      controls.target.lerp(targetLook, 0.08);
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

  document.getElementById('stat-length').textContent = `${d.lengthMeters.toLocaleString()} m`;
  document.getElementById('stat-drop').textContent = `${d.dropMeters ? d.dropMeters + ' m' : d.totalClimb + ' m Anstieg'}`;
  document.getElementById('stat-elev').textContent = `${d.startElevation} / ${d.finishElevation} m`;

  const specLabel = document.getElementById('stat-special-label');
  const specVal = document.getElementById('stat-special-val');
  if (d.maxGradientPercent) {
    specLabel.textContent = 'Max. Gefälle';
    specVal.textContent = `${d.maxGradientPercent} % (Freier Fall)`;
  } else {
    specLabel.textContent = 'Höchster Punkt';
    specVal.textContent = `${d.highestPoint} m ü. NHN`;
  }

  // Populate Camera Presets Buttons
  const presetsContainer = document.getElementById('cam-presets-container');
  presetsContainer.innerHTML = `
    <button class="cam-btn" data-cam="iso"><i class="fa-solid fa-mountain"></i> Panorama</button>
    <button class="cam-btn" data-cam="start"><i class="fa-solid fa-flag-checkered"></i> Startbereich</button>
    <button class="cam-btn" data-cam="finish"><i class="fa-solid fa-bullseye"></i> Zielstadion</button>
    <button class="cam-btn" data-cam="key"><i class="fa-solid fa-star"></i> Schlüsselstelle</button>
    <button class="cam-btn" data-cam="top" style="grid-column: span 2;"><i class="fa-solid fa-compass"></i> Vogelperspektive</button>
  `;
  presetsContainer.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => setCameraPreset(btn.dataset.cam));
  });

  // Populate Milestones List
  const msList = document.getElementById('milestones-list');
  msList.innerHTML = '';
  d.milestones.forEach((m, idx) => {
    const item = document.createElement('div');
    item.className = 'milestone-item';
    item.innerHTML = `
      <span><strong>${idx + 1}.</strong> ${m.name}</span>
      <span class="milestone-elev">${m.coord[2]} m</span>
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
  const targetLook = p;

  let step = 0;
  function tween() {
    if (step < 35) {
      camera.position.lerp(targetCam, 0.08);
      controls.target.lerp(targetLook, 0.08);
      controls.update();
      step++;
      requestAnimationFrame(tween);
    }
  }
  tween();

  // Show Tooltip Card
  const tooltip = document.getElementById('milestone-tooltip');
  document.getElementById('tooltip-title').textContent = m.name;
  document.getElementById('tooltip-elev').textContent = `${m.coord[2]} m`;
  document.getElementById('tooltip-desc').textContent = m.desc;
  tooltip.classList.add('active');
  setTimeout(() => tooltip.classList.remove('active'), 5000);
}

// --- DRAW ELEVATION PROFILE HUD (CANVAS) ---
function drawElevationProfile() {
  const canvas = document.getElementById('elevation-canvas');
  if (!canvas || !currentTrackData) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const pts = currentTrackData.points;
  const elevs = pts.map(p => p[2]);
  const minE = Math.min(...elevs) - 20;
  const maxE = Math.max(...elevs) + 20;

  const w = rect.width;
  const h = rect.height;
  const padL = 40, padR = 20, padT = 10, padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  ctx.clearRect(0, 0, w, h);

  // Background Gridlines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let s = 0; s <= 3; s++) {
    const gy = padT + (plotH / 3) * s;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(w - padR, gy);
    ctx.stroke();

    const elevLabel = Math.round(maxE - ((maxE - minE) / 3) * s);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText(`${elevLabel}m`, 4, gy + 3);
  }

  // Draw Profile Area & Line
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = padL + (i / (pts.length - 1)) * plotW;
    const y = padT + plotH - ((p[2] - minE) / (maxE - minE)) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  const strokeColor = state.currentVenue === 'garmisch' ? '#f59e0b' : '#10b981';
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Gradient Fill under curve
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.lineTo(padL, padT + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, state.currentVenue === 'garmisch' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Milestone Markers on HUD
  currentTrackData.milestones.forEach(m => {
    const i = m.pointIndex;
    const x = padL + (i / (pts.length - 1)) * plotW;
    const y = padT + plotH - ((m.coord[2] - minE) / (maxE - minE)) * plotH;

    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  // Venue Switcher
  document.querySelectorAll('.venue-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.venue-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchVenue(btn.dataset.venue);
    });
  });

  // Style Mode Buttons
  document.querySelectorAll('.style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.styleMode = btn.dataset.style;
      updateTerrainStyle();
    });
  });

  // Toggles
  const togTrack = document.getElementById('toggle-track');
  if (togTrack) togTrack.addEventListener('change', e => {
    state.showTrack = e.target.checked;
    trackGroup.visible = state.showTrack;
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

  // Theme Toggle
  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // Legal Modal
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
  state.isLightTheme = !state.isLightTheme;
  document.body.classList.toggle('theme-light', state.isLightTheme);

  const bgColor = state.isLightTheme ? 0xe2e8f0 : 0x060c18;
  scene.background.set(bgColor);
  scene.fog.color.set(bgColor);
  hemiLight.color.set(state.isLightTheme ? 0xffffff : 0x7dd3fc);
  hemiLight.groundColor.set(state.isLightTheme ? 0x94a3b8 : 0x1e293b);
  ambientLight.intensity = state.isLightTheme ? 0.7 : 0.45;
}

// --- LOADER ---
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

  // Animate skier marker along the track
  if (state.showSimulation && skierMarker && trackPoints3D.length > 1) {
    animProgress += 0.0035;
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
