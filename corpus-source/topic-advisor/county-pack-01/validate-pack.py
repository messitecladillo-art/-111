"""Content/provenance contract checks; these do not approve editorial substance."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
APP = ROOT / 'apps/evi-x-platform'
raw = (APP / 'content/topic-advisor/county-pack-01.json').read_bytes()
pack = json.loads(raw)
catalog = json.loads((APP / 'content/topic-advisor/regions.catalog.json').read_text(encoding='utf-8'))
evidence = json.loads((HERE / 'editorial-evidence.json').read_text(encoding='utf-8'))
captures = {s['id']: s for s in json.loads((HERE / 'captures.json').read_text(encoding='utf-8'))['sources']}
recovery = {s['id']: s for s in json.loads((HERE / 'recovery.json').read_text(encoding='utf-8'))['sources']}
regions = {r['code']: r for r in catalog['records']}
sources = {s['id']: s for s in pack['sources']}
access = {'campus_students','campus_ops','community_residents','community_partner','older_adults','merchants','firms','employees','jobseekers','farmers','tourists','event_organizer','logistics_partner','training_partner'}
assert pack['catalogVersion'] == catalog['catalogVersion']
assert len(pack['profiles']) == len({p['id'] for p in pack['profiles']}) == 20
assert len(sources) == len(pack['sources']) == 14
assert len({p['regionRef']['code'] for p in pack['profiles']}) == 20
assert hashlib.sha256(raw).hexdigest() == evidence['packSha256']
all_ids = set()
for profile in pack['profiles']:
    region = regions[profile['regionRef']['code']]
    assert region['level'] == 'county' and region['name'] == profile['displayName']
    assert profile['regionRef']['catalogVersion'] == pack['catalogVersion']
    assert profile['status'] == 'draft' and profile['gaps']
    assert len(profile['directions']) == len({d['question'] for d in profile['directions']}) == 3
    assert len({d['decision'] for d in profile['directions']}) == 3
    for item in profile['facts']:
        assert item['temporalKind'] == 'historical_reference'
        assert item['sourceIds'] and set(item['sourceIds']) <= sources.keys()
        for sid in item['sourceIds']: assert item['text'] in sources[sid]['supportedClaims']
    for item in profile['directions']:
        assert item['classification'] == 'proposed'
        assert item['sourceIds'] and set(item['sourceIds']) <= sources.keys()
        assert item['requiredAccess'] and set(item['requiredAccess']) <= access
        assert len(item['minimumEvidence']) >= 3
    for item in profile['facts'] + profile['directions']:
        assert item['id'] not in all_ids; all_ids.add(item['id'])
    for item in profile['tags']: assert item['sourceIds'] and set(item['sourceIds']) <= sources.keys()
for sid, source in sources.items():
    assert source['url'].startswith('https://') and '.gov.cn/' in source['url']
    assert source['retrievedAt'] == '2026-10-15'
    assert captures[sid]['status'] == 'retrieved' or recovery.get(sid, {}).get('status') == 'retrieved'
    record = next(s for s in evidence['sources'] if s['id'] == sid)
    summary = {'id': sid, 'title': source['title'], 'locator': source['locator'], 'supportedClaims': source['supportedClaims']}
    assert hashlib.sha256(json.dumps(summary, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest() == record['originalSummarySha256']
    assert record['reviewStatus'] == 'pending'
for sid in ('jinxi-chain-2025','pingyang-plan-2025','guangshan-digital-2026','chengmai-report-2025','zhuoni-tourism'):
    assert sid not in sources
assert sources['mohe-homestay-2023']['publishedAt'] is None
assert sources['mct-rural-2022']['publishedAt'] is None
assert sources['miit-2025-clusters']['publishedAt'] is None
assert sources['wushen-tourism']['publishedAt'] == '2026-03-12'
print(json.dumps({'contract': 'pass', 'profiles': 20, 'directions': 60, 'sourceCount': 14, 'twoSourceProfiles': sum(p['distinctSourceCount'] >= 2 for p in evidence['profiles']), 'publication': 'draft_pending_independent_review', 'sha256': evidence['packSha256']}, ensure_ascii=False))
