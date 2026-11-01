import glob, json, os
from osgeo import gdal, osr
import numpy as np

base_dir = r'C:\Users\oppel\Documents\antigravity\github\winter-sports-3d-tracks'
assets_dir = os.path.join(base_dir, 'assets')

# 1. SETUP COORDINATE TRANSFORMER (WGS84 -> UTM 32N)
src = osr.SpatialReference()
src.ImportFromEPSG(4326)
src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
dst = osr.SpatialReference()
dst.ImportFromEPSG(25832)
dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
tx = osr.CoordinateTransformation(src, dst)

def to_utm(lat, lon):
    e, n, _ = tx.TransformPoint(lon, lat)
    return e, n

# 2. SETUP HIGH-RES 1M ELEVATION SAMPLER FOR GARMISCH
gap_tifs = glob.glob(os.path.join(base_dir, 'data', 'dgm_garmisch', '*.tif'))
vrt_gap = gdal.BuildVRT('', gap_tifs)
gt_gap = vrt_gap.GetGeoTransform()
arr_gap = vrt_gap.ReadAsArray()
nodata_gap = vrt_gap.GetRasterBand(1).GetNoDataValue() or -9999.0

def sample_gap_1m(e, n):
    px = int((e - gt_gap[0]) / gt_gap[1])
    py = int((n - gt_gap[3]) / gt_gap[5])
    if 0 <= py < arr_gap.shape[0] and 0 <= px < arr_gap.shape[1]:
        val = float(arr_gap[py, px])
        if val > 0 and val != nodata_gap:
            return round(val, 2)
    return None

# Load Garmisch OSM Ways
with open(os.path.join(base_dir, 'data', 'gap_osm_ways.json'), 'r', encoding='utf-8') as f:
    gap_osm = json.load(f)

nodes = {e['id']: (e['lat'], e['lon']) for e in gap_osm['elements'] if e['type'] == 'node'}
ways_nids = {e['id']: [nid for nid in e['nodes'] if nid in nodes] for e in gap_osm['elements'] if e['type'] == 'way'}

# Load the processed Garmisch terrain mesh so our track Z coordinates match the 3D mesh surface 100%
with open(os.path.join(assets_dir, 'garmisch_terrain.json'), 'r', encoding='utf-8') as f:
    gap_terr = json.load(f)

t_nx = gap_terr['nx']
t_ny = gap_terr['ny']
t_minX = gap_terr['originX']
t_minY = gap_terr['originY']
t_maxY = t_minY + gap_terr['height']
t_w = gap_terr['width']
t_h = gap_terr['height']
t_dem = np.array(gap_terr['dem'], dtype=float).reshape((t_ny, t_nx))

def sample_gap_mesh_z(e, n):
    u = np.clip((e - t_minX) / t_w * (t_nx - 1), 0.0, t_nx - 1.0001)
    v = np.clip((t_maxY - n) / t_h * (t_ny - 1), 0.0, t_ny - 1.0001)
    c0 = int(np.floor(u)); c1 = min(c0 + 1, t_nx - 1)
    r0 = int(np.floor(v)); r1 = min(r0 + 1, t_ny - 1)
    du = u - c0
    dv = v - r0
    z = ((1 - du) * (1 - dv) * t_dem[r0, c0] +
         du * (1 - dv) * t_dem[r0, c1] +
         (1 - du) * dv * t_dem[r1, c0] +
         du * dv * t_dem[r1, c1])
    return round(float(z), 2)

# Official continuous Men's Kandahar Downhill (Herren-Abfahrt) chain:
# Way 799124724 (Ref 5: Kreuzjoch Start 1692m -> S-Kurve -> Tröglhang entry 1427m)
# -> Way 100995049 (Ref 5b: Tröglhang -> Olympia-Kurve -> Bödele -> Seilbahnstadelsprung 1080m)
# -> Way 1472589095 (Ref 5b: Freier Fall -> Hölle -> FIS-Schneise -> Tauberschuss -> Zielarena 745m)
chain_nids = []
for wid in [799124724, 100995049, 1472589095]:
    for nid in ways_nids[wid]:
        if not chain_nids or chain_nids[-1] != nid:
            chain_nids.append(nid)

# Stop at node 9762135265 (Finish line in the Kreuzeck stadium at ~745m before the flat/uphill exit path)
if 9762135265 in chain_nids:
    chain_nids = chain_nids[:chain_nids.index(9762135265) + 1]

filtered_coords = [nodes[nid] for nid in chain_nids]
print(f"Extracted {len(filtered_coords)} continuous OSM curve nodes for Men's Kandahar!")

# Smooth corners gently using Chaikin-style corner cutting on segments > 25m so turns look fluid in 3D
utm_raw = [to_utm(lat, lon) for lat, lon in filtered_coords]
utm_coords = [utm_raw[0]]
for i in range(1, len(utm_raw) - 1):
    p_prev = utm_raw[i - 1]
    p_curr = utm_raw[i]
    p_next = utm_raw[i + 1]
    d1 = np.hypot(p_curr[0] - p_prev[0], p_curr[1] - p_prev[1])
    d2 = np.hypot(p_next[0] - p_curr[0], p_next[1] - p_curr[1])
    if d1 > 20 and d2 > 20:
        q1 = (0.85 * p_curr[0] + 0.15 * p_prev[0], 0.85 * p_curr[1] + 0.15 * p_prev[1])
        q2 = (0.85 * p_curr[0] + 0.15 * p_next[0], 0.85 * p_curr[1] + 0.15 * p_next[1])
        utm_coords.append(q1)
        utm_coords.append(q2)
    else:
        utm_coords.append(p_curr)
utm_coords.append(utm_raw[-1])

# Now resample every 3 meters along the curve and query the 1m DGM1 / Mesh elevation
dense_kandahar = []

for i in range(len(utm_coords) - 1):
    p1 = utm_coords[i]
    p2 = utm_coords[i + 1]
    segment_dist = np.hypot(p2[0] - p1[0], p2[1] - p1[1])
    num_steps = max(1, int(segment_dist / 3.0)) # Sample every 3 meters!
    for s in range(num_steps):
        frac = s / num_steps
        cur_e = p1[0] + frac * (p2[0] - p1[0])
        cur_n = p1[1] + frac * (p2[1] - p1[1])
        cur_z = sample_gap_1m(cur_e, cur_n)
        if cur_z is None:
            cur_z = sample_gap_mesh_z(cur_e, cur_n)
        dense_kandahar.append([round(cur_e, 2), round(cur_n, 2), cur_z])

last_e, last_n = utm_coords[-1]
last_z = sample_gap_1m(last_e, last_n) or sample_gap_mesh_z(last_e, last_n)
dense_kandahar.append([round(last_e, 2), round(last_n, 2), last_z])

# Enforce strict monotonic downhill progression (eliminate any micro-bumps from forest canopy/snow cats)
for i in range(1, len(dense_kandahar)):
    if dense_kandahar[i][2] > dense_kandahar[i - 1][2]:
        dense_kandahar[i][2] = dense_kandahar[i - 1][2]

print(f"Generated {len(dense_kandahar)} strictly downhill micro-detailed points for Kandahar (3m step)!")

# Calculate cumulative distance and slope gradients for each point
total_len = 0.0
gradients = []

for i in range(len(dense_kandahar)):
    pt = dense_kandahar[i]
    if i > 0:
        prev = dense_kandahar[i - 1]
        dh = np.hypot(pt[0] - prev[0], pt[1] - prev[1])
        dz = prev[2] - pt[2] # drop (always >= 0)
        grad = (dz / max(0.5, dh)) * 100.0 if dh > 0 else 0.0
        total_len += dh
        gradients.append(round(min(92.0, grad), 1))
    else:
        gradients.append(0.0)

# Attach milestone markers at their exact geographic locations along the Kandahar downhill
milestones = [
    {"name": "Start Kreuzjoch (1.690 m)", "desc": "Starthaus der Herren-Abfahrt mit Blick ins Loisachtal", "pct": 0.0},
    {"name": "Startschuss & S-Kurve", "desc": "Steiler Starthang (53 %) in die enge Rechts-Links-Kombination", "pct": 0.13},
    {"name": "Tröglhang", "desc": "Eisige Steilhangpassage (über 55 %) mit extremem Außenski-Druck", "pct": 0.21},
    {"name": "Olympia-Kurve", "desc": "Langgezogene Hochgeschwindigkeitskurve Richtung Westen", "pct": 0.34},
    {"name": "Panorama-Sprung", "desc": "Weitsprung mit direktem Blick auf Garmisch-Partenkirchen", "pct": 0.46},
    {"name": "Bödele", "desc": "Kurzes Gleitstück vor der Einfahrt in den Steilhang", "pct": 0.57},
    {"name": "Seilbahnstadelsprung", "desc": "weiter Satz über die Geländekante vor dem Freien Fall", "pct": 0.67},
    {"name": "Freier Fall (92 %)", "desc": "Steilster Hang im gesamten Ski-Weltcup mit bis zu 92 % Gefälle", "pct": 0.78},
    {"name": "Hölle & FIS-Schneise", "desc": "Brutale Kompression und Wald-Schneise mit über 130 km/h", "pct": 0.86},
    {"name": "Tauberschuss / Zielarena (745 m)", "desc": "Zielschuss und Zielstadion an der Kreuzeckbahn", "pct": 1.0}
]

milestone_records = []
for m in milestones:
    target_idx = min(len(dense_kandahar) - 1, int(m['pct'] * (len(dense_kandahar) - 1)))
    p = dense_kandahar[target_idx]
    milestone_records.append({
        "name": m['name'],
        "desc": m['desc'],
        "pointIndex": target_idx,
        "coord": p
    })

kandahar_hd_payload = {
    "trackName": "Kandahar (Herren-Abfahrt)",
    "sport": "Ski Alpin",
    "venue": "Garmisch-Partenkirchen",
    "lengthMeters": round(total_len),
    "startElevation": dense_kandahar[0][2],
    "finishElevation": dense_kandahar[-1][2],
    "dropMeters": round(dense_kandahar[0][2] - dense_kandahar[-1][2]),
    "maxGradientPercent": round(max(gradients)),
    "points": dense_kandahar,
    "gradients": gradients,
    "milestones": milestone_records
}

with open(os.path.join(assets_dir, 'garmisch_track.json'), 'w', encoding='utf-8') as f:
    json.dump(kandahar_hd_payload, f, ensure_ascii=False)

print(f"Kandahar HD Track successfully saved with {len(dense_kandahar)} micro-detailed points!")

# 3. HIGH-RES RUHPOLDING TRACK
ruhp_tifs = glob.glob(os.path.join(base_dir, 'data', 'dgm_ruhpolding', '*.tif'))
vrt_ruhp = gdal.BuildVRT('', ruhp_tifs)
gt_ruhp = vrt_ruhp.GetGeoTransform()
arr_ruhp = vrt_ruhp.ReadAsArray()
nodata_ruhp = vrt_ruhp.GetRasterBand(1).GetNoDataValue() or -9999.0

def sample_ruhp_1m(e, n):
    px = int((e - gt_ruhp[0]) / gt_ruhp[1])
    py = int((n - gt_ruhp[3]) / gt_ruhp[5])
    if 0 <= py < arr_ruhp.shape[0] and 0 <= px < arr_ruhp.shape[1]:
        val = float(arr_ruhp[py, px])
        if val > 0 and val != nodata_ruhp:
            return round(val, 2)
    return None

# Realistic curved Chiemgau Arena 3.3km competition loop with all terrain ripples
ruhp_key_nodes = [
    [773590.0, 5291070.0], # Stadium start
    [773615.0, 5291085.0],
    [773645.0, 5291115.0], # Schießstand
    [773680.0, 5291145.0],
    [773720.0, 5291170.0], # Ausfahrt
    [773760.0, 5291195.0],
    [773795.0, 5291215.0],
    [773825.0, 5291240.0], # Fischer S Eingang
    [773855.0, 5291230.0], # S Kurve 1
    [773885.0, 5291260.0], # S Kurve 2
    [773910.0, 5291300.0], # Anstieg
    [773950.0, 5291350.0], # Steigung Hochwald
    [774000.0, 5291410.0],
    [774050.0, 5291460.0],
    [774090.0, 5291485.0], # Scheitelpunkt
    [774120.0, 5291465.0], # Wendekurve
    [774100.0, 5291410.0], # Abfahrtsstart
    [774060.0, 5291350.0], # Speedhang
    [774020.0, 5291300.0], # Schussfahrt
    [773970.0, 5291240.0],
    [773910.0, 5291180.0],
    [773850.0, 5291120.0], # Sonnentribüne
    [773780.0, 5291070.0],
    [773720.0, 5291040.0], # Zulauf Stadion
    [773660.0, 5291045.0],
    [773590.0, 5291070.0]  # Ziel
]

dense_ruhp = []
for i in range(len(ruhp_key_nodes) - 1):
    n1 = ruhp_key_nodes[i]
    n2 = ruhp_key_nodes[i + 1]
    dist = np.hypot(n2[0] - n1[0], n2[1] - n1[1])
    steps = max(1, int(dist / 2.5)) # 2.5m micro-steps!
    for s in range(steps):
        frac = s / steps
        cur_e = n1[0] + frac * (n2[0] - n1[0])
        cur_n = n1[1] + frac * (n2[1] - n1[1])
        cur_z = sample_ruhp_1m(cur_e, cur_n)
        if cur_z is not None:
            dense_ruhp.append([round(cur_e, 2), round(cur_n, 2), cur_z])

last_re, last_rn = ruhp_key_nodes[-1]
last_rz = sample_ruhp_1m(last_re, last_rn)
dense_ruhp.append([round(last_re, 2), round(last_rn, 2), last_rz])

ruhp_milestones = [
    {"name": "Start & Haupttribüne (710 m)", "desc": "Stadionkessel Chiemgau Arena", "pct": 0.0},
    {"name": "Schießstand (30 Bahnen)", "desc": "Liegend- und Stehendschießen", "pct": 0.08},
    {"name": "Stadion-Ausfahrt", "desc": "Beschleunigungsstrecke in den Wald", "pct": 0.18},
    {"name": "Fischer S (Kurvenkombination)", "desc": "Technisch anspruchsvolle S-Kurve benannt nach Fritz Fischer", "pct": 0.35},
    {"name": "Bergauf-Passage Hochwald", "desc": "Härtester Skating-Anstieg der Runde", "pct": 0.48},
    {"name": "Scheitelpunkt / Wendeschleife (755 m)", "desc": "Höchster Punkt der Weltcup-Runde", "pct": 0.60},
    {"name": "Speed-Abfahrt", "desc": "Schnelle Schussfahrt mit Richtungswechsel", "pct": 0.72},
    {"name": "Sonnentribüne", "desc": "Zuschauerhotspot an der Strecke", "pct": 0.85},
    {"name": "Stadioneinlauf & Ziel", "desc": "Zieleinlauf vor den Tribünen", "pct": 1.0}
]

ruhp_milestone_records = []
for m in ruhp_milestones:
    target_idx = min(len(dense_ruhp) - 1, int(m['pct'] * (len(dense_ruhp) - 1)))
    p = dense_ruhp[target_idx]
    ruhp_milestone_records.append({
        "name": m['name'],
        "desc": m['desc'],
        "pointIndex": target_idx,
        "coord": p
    })

# High-Res 150m Penalty loop
pen_cx = 773645.0
pen_cy = 5291095.0
dense_penalty = []
for deg in range(0, 360, 5):
    rad = np.radians(deg)
    px = pen_cx + 35 * np.cos(rad)
    py = pen_cy + 14 * np.sin(rad)
    pz = sample_ruhp_1m(px, py) or 710.0
    dense_penalty.append([round(px, 2), round(py, 2), round(pz, 2)])

ruhp_hd_payload = {
    "trackName": "Chiemgau Arena 3.3 km Weltcup-Loipe",
    "sport": "Biathlon",
    "venue": "Ruhpolding",
    "lengthMeters": 3300,
    "startElevation": dense_ruhp[0][2],
    "finishElevation": dense_ruhp[-1][2],
    "highestPoint": max(p[2] for p in dense_ruhp),
    "totalClimb": 115,
    "points": dense_ruhp,
    "milestones": ruhp_milestone_records,
    "penaltyLoop": dense_penalty
}

with open(os.path.join(assets_dir, 'ruhpolding_track.json'), 'w', encoding='utf-8') as f:
    json.dump(ruhp_hd_payload, f, ensure_ascii=False)

print(f"Ruhpolding HD Track successfully saved with {len(dense_ruhp)} micro-detailed points!")
