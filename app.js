import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- APPLICATION STATE ---
const state = {
  currentVenue: 'garmisch', // 'garmisch' or 'ruhpolding'
  styleMode: 'winter',      // 'winter', 'topo', 'clay'
  showTrackRibbon: true,
  showGradientColors: true,
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

function getTerrainColor(elev, minZ, maxZ) {
  const t = THREE.MathUtils.clamp((elev - minZ) / (maxZ - minZ), 0, 1);
  const c = new THREE.Color();

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
  const lz = -(y - centerY) * SCALE;
  const ly = (z - minZ) * Z_SCALE + 0.6; // Hugs 1m terrain closely
  return new THREE.Vector3(lx, ly, lz);
}

// --- GRADIENT COLOR FOR SLOPE IN PERCENT ---
function getGradientColor(grad) {
  // grad in %: 0-25% (Green/Cyan) -> 25-50% (Amber) -> 50-80% (Red) -> 80%+ (Dark Red/Purple 'Freier Fall')
  const c = new THREE.Color();
  if (grad < 25) {
    c.setRGB(0.06, 0.72, 0.51); // Gentle slope / gliding section
  } else if (grad < 50) {
    c.setRGB(0.96, 0.62, 0.04); // Medium race slope
  } else if (grad < 75) {
    c.setRGB(0.93, 0.27, 0.18); // Steep race pitch
  } else {
    c.setRGB(0.75, 0.05, 0.25); // Extreme section (>75%, e.g. Freier Fall 92%)
  }
  return c;
}

// --- BUILD HIGH-RESOLUTION 3D PISTENBAND (RIBBON MESH) ---
let trackPoints3D = [];
function buildDetailedTrackRibbon() {
  while (trackGroup.children.length > 0) trackGroup.remove(trackGroup.children[0]);
  if (!currentTrackData || !currentTrackData.points) return;

  const pts = currentTrackData.points;
  trackPoints3D = pts.map(p => worldToLocal(p[0], p[1], p[2]));

  const ribbonWidth = state.currentVenue === 'garmisch' ? 1.4 : 1.0; // Piste width in 3D units (~15m wide)
  const halfW = ribbonWidth / 2;

  const positions = [];
  const colors = [];
  const indices = [];

  for (let i = 0; i < trackPoints3D.length; i++) {
    const cur = trackPoints3D[i];
    
    // Compute tangent vector
    let forward = new THREE.Vector3();
    if (i < trackPoints3D.length - 1) {
      forward.subVectors(trackPoints3D[i + 1], cur).normalize();
    } else {
      forward.subVectors(cur, trackPoints3D[i - 1]).normalize();
    }

    // Normal orthogonal to forward and world UP (0, 1, 0)
    const side = new THREE.Vector3(-forward.z, 0, forward.x).normalize();

    // Left and Right vertices of the track ribbon
    const leftPt = new THREE.Vector3().copy(cur).addScaledVector(side, -halfW);
    const rightPt = new THREE.Vector3().copy(cur).addScaledVector(side, halfW);

    positions.push(leftPt.x, leftPt.y, leftPt.z);
    positions.push(rightPt.x, rightPt.y, rightPt.z);

    // Color based on slope gradient or sport
    let c = new THREE.Color();
    if (state.showGradientColors && currentTrackData.gradients) {
      const grad = currentTrackData.gradients[i] || 0;
      c = getGradientColor(grad);
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

      // Two triangles forming quad segment
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
    roughness: 0.35,
    metalness: 0.15
  });

  const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbonMesh.castShadow = true;
  ribbonMesh.receiveShadow = true;
  trackGroup.add(ribbonMesh);

  // Centerline glow string
  const lineGeo = new THREE.BufferGeometry().setFromPoints(trackPoints3D);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    linewidth: 2,
    transparent: true,
    opacity: 0.8
  });
  const lineMesh = new THREE.Line(lineGeo, lineMat);
  trackGroup.add(lineMesh);

  // Penalty Loop for Ruhpolding
  if (currentTrackData.penaltyLoop) {
    const penPts = currentTrackData.penaltyLoop.map(p => worldToLocal(p[0], p[1], p[2]));
    const penGeo = new THREE.BufferGeometry().setFromPoints(penPts);
    const penMat = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 });
    trackGroup.add(new THREE.LineLoop(penGeo, penMat));
  }

  // Skier / Runner Marker
  const sphereGeo = new THREE.SphereGeometry(1.8, 16, 16);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.2,
    roughness: 0.1
  });
  skierMarker = new THREE.Mesh(sphereGeo, sphereMat);
  trackGroup.add(skierMarker);

  trackGroup.visible = state.showTrackRibbon;
}

// --- BUILD MILESTONES (STATION FLAGS) ---
function buildMilestones() {
  while (milestonesGroup.children.length > 0) milestonesGroup.remove(milestonesGroup.children[0]);
  if (!currentTrackData || !currentTrackData.milestones) return;

  currentTrackData.milestones.forEach((m) => {
    const pos = worldToLocal(m.coord[0], m.coord[1], m.coord[2]);
    const group = new THREE.Group();
    group.position.copy(pos);

    // Mast
    const mastGeo = new THREE.CylinderGeometry(0.25, 0.25, 6, 8);
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
      emissiveIntensity: 0.85
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

  const tooltip = document.getElementById('milestone-tooltip');
  document.getElementById('tooltip-title').textContent = m.name;
  document.getElementById('tooltip-elev').textContent = `${Math.round(m.coord[2])} m`;
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

  // Draw Profile Line colored by gradient
  for (let i = 0; i < pts.length - 1; i++) {
    const x1 = padL + (i / (pts.length - 1)) * plotW;
    const y1 = padT + plotH - ((pts[i][2] - minE) / (maxE - minE)) * plotH;
    const x2 = padL + ((i + 1) / (pts.length - 1)) * plotW;
    const y2 = padT + plotH - ((pts[i + 1][2] - minE) / (maxE - minE)) * plotH;

    const grad = currentTrackData.gradients ? currentTrackData.gradients[i] : 20;
    const strokeC = getGradientColor(grad);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = `#${strokeC.getHexString()}`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Milestone Markers on HUD
  currentTrackData.milestones.forEach(m => {
    const i = m.pointIndex;
    const x = padL + (i / (pts.length - 1)) * plotW;
    const y = padT + plotH - ((m.coord[2] - minE) / (maxE - minE)) * plotH;

    ctx.beginPath();
    ctx.arc(x, y, 4.0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  document.querySelectorAll('.venue-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.venue-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchVenue(btn.dataset.venue);
    });
  });

  document.querySelectorAll('.style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.styleMode = btn.dataset.style;
      updateTerrainStyle();
    });
  });

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
    animProgress += 0.0018; // Smooth motion along micro-steps
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
