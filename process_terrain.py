import glob, json, os
from osgeo import gdal
import numpy as np

base_dir = r'C:\Users\oppel\Documents\antigravity\github\winter-sports-3d-tracks'
assets_dir = os.path.join(base_dir, 'assets')
os.makedirs(assets_dir, exist_ok=True)

# 1. PROCESS RUHPOLDING
# Tiles are: X: [772000..775000], Y: [5290000..5293000]
print('--- Processing Ruhpolding DGM1 ---')
ruhp_files = glob.glob(os.path.join(base_dir, 'data', 'dgm_ruhpolding', '*.tif'))
vrt_ruhp = gdal.BuildVRT('', ruhp_files)

# Center around Chiemgau Arena (773587, 5291071)
# Safe bounds fully within [772000..775000] and [5290000..5293000]:
minX_r = 772200
maxX_r = 774800 # 2600m
minY_r = 5290100
maxY_r = 5292700 # 2600m

nx_r = 160
ny_r = 160
ds_ruhp = gdal.Warp('', vrt_ruhp, format='MEM',
                    outputBounds=[minX_r, minY_r, maxX_r, maxY_r],
                    width=nx_r, height=ny_r,
                    resampleAlg=gdal.GRA_Bilinear)
arr_ruhp = ds_ruhp.ReadAsArray().astype(float)
arr_ruhp = np.round(arr_ruhp, 1)

ruhp_payload = {
    'venue': 'Chiemgau Arena Ruhpolding',
    'sport': 'Biathlon',
    'originX': minX_r,
    'originY': minY_r,
    'width': maxX_r - minX_r,
    'height': maxY_r - minY_r,
    'nx': nx_r,
    'ny': ny_r,
    'minZ': float(np.min(arr_ruhp)),
    'maxZ': float(np.max(arr_ruhp)),
    'dem': arr_ruhp.flatten().tolist()
}
with open(os.path.join(assets_dir, 'ruhpolding_terrain.json'), 'w') as f:
    json.dump(ruhp_payload, f)
print(f"Ruhpolding terrain saved! Size: {nx_r}x{ny_r}, elev: {ruhp_payload['minZ']} - {ruhp_payload['maxZ']} m")

# 2. PROCESS GARMISCH KANDAHAR
# Tiles are: X: [654000..657000], Y: [5257000..5261000]
print('--- Processing Garmisch Kandahar DGM1 ---')
gap_files = glob.glob(os.path.join(base_dir, 'data', 'dgm_garmisch', '*.tif'))
vrt_gap = gdal.BuildVRT('', gap_files)

minX_g = 654400
maxX_g = 656800  # 2400m wide
minY_g = 5257100
maxY_g = 5260300  # 3200m high

nx_g = 150
ny_g = 200
ds_gap = gdal.Warp('', vrt_gap, format='MEM',
                   outputBounds=[minX_g, minY_g, maxX_g, maxY_g],
                   width=nx_g, height=ny_g,
                   resampleAlg=gdal.GRA_Bilinear)
arr_gap = ds_gap.ReadAsArray().astype(float)
arr_gap = np.round(arr_gap, 1)

gap_payload = {
    'venue': 'Garmisch-Partenkirchen (Kandahar)',
    'sport': 'Ski Alpin',
    'originX': minX_g,
    'originY': minY_g,
    'width': maxX_g - minX_g,
    'height': maxY_g - minY_g,
    'nx': nx_g,
    'ny': ny_g,
    'minZ': float(np.min(arr_gap)),
    'maxZ': float(np.max(arr_gap)),
    'dem': arr_gap.flatten().tolist()
}
with open(os.path.join(assets_dir, 'garmisch_terrain.json'), 'w') as f:
    json.dump(gap_payload, f)
print(f"Garmisch terrain saved! Size: {nx_g}x{ny_g}, elev: {gap_payload['minZ']} - {gap_payload['maxZ']} m")
