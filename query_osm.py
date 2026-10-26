import urllib.request, urllib.parse, json

# 1. Query Garmisch downhill pistes
q_gap = '[out:json][timeout:30];way(around:4000, 47.47, 11.065)["piste:type"="downhill"];out geom;'
url_gap = 'https://overpass-api.de/api/interpreter?data=' + urllib.parse.quote(q_gap)

req = urllib.request.Request(url_gap, headers={'User-Agent': 'WinterSports3DApp/1.0 (ralf.oppel@study.thws.de)'})
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        d = json.loads(resp.read().decode())
        print(f"Garmisch downhill ways found: {len(d.get('elements', []))}")
        for e in d.get('elements', []):
            tags = e.get('tags', {})
            name = tags.get('name', '')
            ref = tags.get('ref', '')
            if 'kandahar' in name.lower() or ref == '5' or 'olympia' in name.lower() or 'troegl' in name.lower():
                print(f"MATCH: ID {e['id']} | name: {name} | ref: {ref} | pts: {len(e.get('geometry', []))}")
except Exception as e:
    print(f"GAP Overpass error: {e}")

# 2. Query Ruhpolding nordic pistes
q_ruhp = '[out:json][timeout:30];way(around:2000, 47.715, 12.648)["piste:type"="nordic"];out geom;'
url_ruhp = 'https://overpass-api.de/api/interpreter?data=' + urllib.parse.quote(q_ruhp)

req2 = urllib.request.Request(url_ruhp, headers={'User-Agent': 'WinterSports3DApp/1.0 (ralf.oppel@study.thws.de)'})
try:
    with urllib.request.urlopen(req2, timeout=30) as resp:
        d2 = json.loads(resp.read().decode())
        print(f"Ruhpolding nordic ways found: {len(d2.get('elements', []))}")
        for e in d2.get('elements', []):
            tags = e.get('tags', {})
            name = tags.get('name', 'unnamed')
            print(f"RUHP: ID {e['id']} | name: {name} | pts: {len(e.get('geometry', []))}")
except Exception as e:
    print(f"RUHP Overpass error: {e}")
