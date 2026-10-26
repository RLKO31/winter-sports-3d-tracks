import urllib.request, urllib.parse, json

# 1. Fetch exact Garmisch Kandahar ways from Overpass
way_ids = [100995049, 256613604, 383068630, 799124724, 1472589095, 1472589096, 135200908, 1147663033, 1147663034]
q_gap = f"[out:json][timeout:30];way(id:{','.join(map(str, way_ids))});out body;>;out skel qt;"
url_gap = 'https://overpass-api.de/api/interpreter?data=' + urllib.parse.quote(q_gap)

req = urllib.request.Request(url_gap, headers={'User-Agent': 'WinterSports3D/1.0'})
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        d_gap = json.loads(resp.read().decode())
        with open('data/gap_osm_ways.json', 'w', encoding='utf-8') as f:
            json.dump(d_gap, f, indent=2)
        print(f"Saved Garmisch OSM ways: {len(d_gap.get('elements', []))} elements")
except Exception as e:
    print(f"Error fetching GAP: {e}")

# 2. Fetch Ruhpolding Chiemgau Arena pistes with specific bounding box
q_ruhp = """
[out:json][timeout:30];
(
  way(47.705, 12.635, 47.725, 12.665)["piste:type"="nordic"];
  way(47.705, 12.635, 47.725, 12.665)["leisure"="track"];
  way(47.705, 12.635, 47.725, 12.665)["sport"="shooting"];
);
out body;
>;
out skel qt;
"""
url_ruhp = 'https://overpass-api.de/api/interpreter?data=' + urllib.parse.quote(q_ruhp)
req2 = urllib.request.Request(url_ruhp, headers={'User-Agent': 'WinterSports3D/1.0'})
try:
    with urllib.request.urlopen(req2, timeout=30) as resp:
        d_ruhp = json.loads(resp.read().decode())
        with open('data/ruhp_osm_ways.json', 'w', encoding='utf-8') as f:
            json.dump(d_ruhp, f, indent=2)
        print(f"Saved Ruhpolding OSM ways: {len(d_ruhp.get('elements', []))} elements")
except Exception as e:
    print(f"Error fetching RUHP: {e}")
