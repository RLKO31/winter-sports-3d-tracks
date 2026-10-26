import json, os
from osgeo import gdal
import numpy as np

base_dir = r'C:\Users\oppel\Documents\antigravity\github\winter-sports-3d-tracks'
assets_dir = os.path.join(base_dir, 'assets')

# Load Terrain to query exact elevation at any UTM (X, Y)
ds_gap = gdal.Open(os.path.join(base_dir, 'data', 'dgm_garmisch', '655_5259.tif'))
vrt_gap = gdal.BuildVRT('', [os.path.join(base_dir, 'data', 'dgm_garmisch', f) for f in os.listdir(os.path.join(base_dir, 'data', 'dgm_garmisch')) if f.endswith('.tif')])
gt_gap = vrt_gap.GetGeoTransform()
arr_gap = vrt_gap.ReadAsArray()

def get_gap_elev(x, y):
    px = int((x - gt_gap[0]) / gt_gap[1])
    py = int((y - gt_gap[3]) / gt_gap[5])
    if 0 <= py < arr_gap.shape[0] and 0 <= px < arr_gap.shape[1]:
        return float(arr_gap[py, px])
    return 1000.0

# 1. KANDAHAR DOWNHILL TRACK (Garmisch)
# Waypoints with historic landmark stations
kandahar_waypoints = [
    {"name": "Start Kreuzjoch", "x": 655580.0, "y": 5257490.0, "desc": "Start auf 1.690 m am Kreuzjoch"},
    {"name": "Startschuss & S-Kurve", "x": 655480.0, "y": 5257750.0, "desc": "Extrem schnelle Startbeschleunigung"},
    {"name": "Tröglhang", "x": 655380.0, "y": 5258050.0, "desc": "Eisige Steilpassage mit Richtungswechsel"},
    {"name": "Olympia-Kurve", "x": 655420.0, "y": 5258350.0, "desc": "Weite Hochgeschwindigkeitskurve"},
    {"name": "Panorama-Sprung", "x": 655500.0, "y": 5258600.0, "desc": "Weitsprung mit Talblick"},
    {"name": "Bödele", "x": 655520.0, "y": 5258850.0, "desc": "Gleitteil vor der Schlüsselstelle"},
    {"name": "Seilbahnstadelsprung", "x": 655550.0, "y": 5259020.0, "desc": "Sprung über die Geländekante"},
    {"name": "Freier Fall", "x": 655580.0, "y": 5259160.0, "desc": "Steilster Hang im Weltcup (92 % Gefälle)"},
    {"name": "Hölle", "x": 655590.0, "y": 5259320.0, "desc": "Kompression nach dem Freien Fall"},
    {"name": "FIS-Schneise", "x": 655610.0, "y": 5259460.0, "desc": "Letzte Kurvenkombination"},
    {"name": "Tauberschuss / Ziel", "x": 655605.0, "y": 5259630.0, "desc": "Zielsprung & Zielarena Kreuzeckbahn (770 m)"}
]

# Densify path with smooth spline / linear interpolation every 20 meters
points_kandahar = []
milestones_kandahar = []

for i in range(len(kandahar_waypoints) - 1):
    w1 = kandahar_waypoints[i]
    w2 = kandahar_waypoints[i + 1]
    dist = np.hypot(w2['x'] - w1['x'], w2['y'] - w1['y'])
    steps = max(2, int(dist / 20.0))
    for s in range(steps):
        t = s / steps
        cx = w1['x'] + t * (w2['x'] - w1['x'])
        cy = w1['y'] + t * (w2['y'] - w1['y'])
        cz = get_gap_elev(cx, cy)
        points_kandahar.append([round(cx, 1), round(cy, 1), round(cz, 1)])
        if s == 0:
            milestones_kandahar.append({
                "name": w1['name'],
                "desc": w1['desc'],
                "pointIndex": len(points_kandahar) - 1,
                "coord": [round(cx, 1), round(cy, 1), round(cz, 1)]
            })

last_w = kandahar_waypoints[-1]
last_z = get_gap_elev(last_w['x'], last_w['y'])
points_kandahar.append([round(last_w['x'], 1), round(last_w['y'], 1), round(last_z, 1)])
milestones_kandahar.append({
    "name": last_w['name'],
    "desc": last_w['desc'],
    "pointIndex": len(points_kandahar) - 1,
    "coord": [round(last_w['x'], 1), round(last_w['y'], 1), round(last_z, 1)]
})

kandahar_payload = {
    "trackName": "Kandahar (Herren-Abfahrt)",
    "sport": "Ski Alpin",
    "venue": "Garmisch-Partenkirchen",
    "lengthMeters": 3330,
    "startElevation": 1690,
    "finishElevation": 770,
    "dropMeters": 920,
    "maxGradientPercent": 92,
    "points": points_kandahar,
    "milestones": milestones_kandahar
}

with open(os.path.join(assets_dir, 'garmisch_track.json'), 'w', encoding='utf-8') as f:
    json.dump(kandahar_payload, f, indent=2, ensure_ascii=False)
print(f"Kandahar track saved: {len(points_kandahar)} points, {len(milestones_kandahar)} milestones")

# 2. RUHPOLDING BIATHLON COMPETITION LOOPS (Chiemgau Arena)
vrt_ruhp = gdal.BuildVRT('', [os.path.join(base_dir, 'data', 'dgm_ruhpolding', f) for f in os.listdir(os.path.join(base_dir, 'data', 'dgm_ruhpolding')) if f.endswith('.tif')])
gt_ruhp = vrt_ruhp.GetGeoTransform()
arr_ruhp = vrt_ruhp.ReadAsArray()

def get_ruhp_elev(x, y):
    px = int((x - gt_ruhp[0]) / gt_ruhp[1])
    py = int((y - gt_ruhp[3]) / gt_ruhp[5])
    if 0 <= py < arr_ruhp.shape[0] and 0 <= px < arr_ruhp.shape[1]:
        return float(arr_ruhp[py, px])
    return 720.0

# Chiemgau Arena 3.3 km Loop + Schießstand
ruhp_waypoints = [
    {"name": "Start & Zielstadion", "x": 773590.0, "y": 5291070.0, "desc": "Zuschauertribüne & Hauptstadion Chiemgau Arena (710 m)"},
    {"name": "Schießstand", "x": 773640.0, "y": 5291120.0, "desc": "30 Bahnen Kleinkaliber Schießanlage & 150m-Strafrunde"},
    {"name": "Stadion-Ausfahrt", "x": 773720.0, "y": 5291170.0, "desc": "Beschleunigungszone zur Streckenteilung"},
    {"name": "Fischer S", "x": 773820.0, "y": 5291240.0, "desc": "Legendäre S-Kurvenkombination & Zuschauermagnet"},
    {"name": "Bergauf-Passage", "x": 773950.0, "y": 5291350.0, "desc": "Rhythmischer Skating-Anstieg Richtung Hochwald"},
    {"name": "Scheitelpunkt / Wendeschleife", "x": 774100.0, "y": 5291480.0, "desc": "Höchster Punkt der Schleife (755 m)"},
    {"name": "Speed-Abfahrt", "x": 774020.0, "y": 5291300.0, "desc": "Schnelle Kurvenabfahrt mit Schussfahrt"},
    {"name": "Rückleitung Sonnentribüne", "x": 773850.0, "y": 5291120.0, "desc": "Zuschauerbereich Sonnentribüne"},
    {"name": "Stadioneinfahrt / Schießstand-Zulauf", "x": 773680.0, "y": 5291030.0, "desc": "Letzte Schleife vor dem Einlauf ins Stadion"},
    {"name": "Start & Zielstadion", "x": 773590.0, "y": 5291070.0, "desc": "Zieleinlauf"}
]

points_ruhp = []
milestones_ruhp = []

for i in range(len(ruhp_waypoints) - 1):
    w1 = ruhp_waypoints[i]
    w2 = ruhp_waypoints[i + 1]
    dist = np.hypot(w2['x'] - w1['x'], w2['y'] - w1['y'])
    steps = max(2, int(dist / 15.0))
    for s in range(steps):
        t = s / steps
        cx = w1['x'] + t * (w2['x'] - w1['x'])
        cy = w1['y'] + t * (w2['y'] - w1['y'])
        cz = get_ruhp_elev(cx, cy)
        points_ruhp.append([round(cx, 1), round(cy, 1), round(cz, 1)])
        if s == 0:
            milestones_ruhp.append({
                "name": w1['name'],
                "desc": w1['desc'],
                "pointIndex": len(points_ruhp) - 1,
                "coord": [round(cx, 1), round(cy, 1), round(cz, 1)]
            })

last_rw = ruhp_waypoints[-1]
last_rz = get_ruhp_elev(last_rw['x'], last_rw['y'])
points_ruhp.append([round(last_rw['x'], 1), round(last_rw['y'], 1), round(last_rz, 1)])
milestones_ruhp.append({
    "name": last_rw['name'],
    "desc": last_rw['desc'],
    "pointIndex": len(points_ruhp) - 1,
    "coord": [round(last_rw['x'], 1), round(last_rw['y'], 1), round(last_rz, 1)]
})

# Add Penalty loop (Strafrunde: 150m Oval)
penalty_center_x = 773635.0
penalty_center_y = 773090.0
penalty_loop = []
for deg in range(0, 360, 20):
    rad = np.radians(deg)
    px = penalty_center_x + 35 * np.cos(rad)
    py = penalty_center_y + 15 * np.sin(rad)
    pz = get_ruhp_elev(px, py)
    penalty_loop.append([round(px, 1), round(py, 1), round(pz, 1)])

ruhp_track_payload = {
    "trackName": "Chiemgau Arena 3.3 km Weltcup-Loipe",
    "sport": "Biathlon",
    "venue": "Ruhpolding",
    "lengthMeters": 3300,
    "startElevation": 710,
    "finishElevation": 710,
    "highestPoint": 755,
    "totalClimb": 115,
    "points": points_ruhp,
    "milestones": milestones_ruhp,
    "penaltyLoop": penalty_loop
}

with open(os.path.join(assets_dir, 'ruhpolding_track.json'), 'w', encoding='utf-8') as f:
    json.dump(ruhp_track_payload, f, indent=2, ensure_ascii=False)
print(f"Ruhpolding track saved: {len(points_ruhp)} points, {len(milestones_ruhp)} milestones")
