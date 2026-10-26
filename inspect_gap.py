import json

with open('data/gap_osm_ways.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

nodes = {e['id']: (e['lat'], e['lon']) for e in d.get('elements', []) if e['type'] == 'node'}
ways = [e for e in d.get('elements', []) if e['type'] == 'way']

print("Garmisch ways retrieved:")
for w in ways:
    coords = [nodes[nid] for nid in w['nodes'] if nid in nodes]
    tags = w.get('tags', {})
    start_pt = coords[0] if coords else None
    end_pt = coords[-1] if coords else None
    name = tags.get('name', 'unnamed')
    ref = tags.get('ref', '')
    diff = tags.get('piste:difficulty', '')
    print(f"Way {w['id']} | name: {name} | ref: {ref} | diff: {diff} | points: {len(coords)}")
