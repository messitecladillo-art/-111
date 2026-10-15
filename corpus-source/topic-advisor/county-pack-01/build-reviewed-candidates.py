"""Deterministic offline derivation of three draft candidates; never publication approval.

The frozen independent review is repository-local; --review can select an exact-byte copy.
Every source input must match its frozen raw-byte SHA-256 before JSON is interpreted.
Only --write changes the one new candidate JSON; the original twenty-county pack is read-only.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PARENT = ROOT / 'apps/evi-x-platform/content/topic-advisor/county-pack-01.json'
SUPPLEMENT = Path(__file__).resolve().parent / 'supplement-20261015.json'
REVIEW = Path(__file__).resolve().parent / 'review-first-candidates.json'
OUTPUT = ROOT / 'apps/evi-x-platform/content/topic-advisor/county-pack-01-candidates-v2.json'
HASHES = {
    'parent': 'a7c99603bbeaabc0b65758a8fe9b8142b0d431c41836997494eb6f9e93c08d58',
    'supplement': 'af301a0e0e046be2312c9f5b034e8f57888e86440421d03dbbc4ca25d0cb9c9f',
    'review': 'a17855b4789065fae877710828e33b3271f34334eaf700d5f304910ffbd5efec',
}
CODES = ('421222', '340882', '320623')
REVISION_IDS = ('county-421222-direction-1', 'county-340882-direction-2')
RUDONG_SOURCE = 'rudong-hr-2025-summary'
NEW_FACT = ('如东县人社局2026年1月5日发布的年度总结自报：'
            '2025年新增家门口就业服务站，并开展招聘及职业技能培训。')
PACK_KEYS = {'schemaVersion', 'id', 'contentVersion', 'catalogVersion', 'sources', 'profiles'}
SOURCE_KEYS = {'id', 'title', 'url', 'publishedAt', 'retrievedAt', 'authority', 'locator', 'supportedClaims'}
PROFILE_KEYS = {'id', 'regionRef', 'displayName', 'tags', 'facts', 'directions', 'status', 'gaps'}
FACT_KEYS = {'id', 'text', 'sourceIds', 'temporalKind', 'asOfDate'}
DIRECTION_KEYS = {'id', 'title', 'question', 'decisionOwner', 'decision', 'population', 'requiredAccess',
                  'minimumEvidence', 'sourceIds', 'classification'}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def anchored(raw, label):
    actual = digest(raw)
    if actual != HASHES[label]:
        raise ValueError(f'{label} input hash drift: expected {HASHES[label]}, got {actual}; '
                         'refusing to derive from a different input. Request a new review/version.')
    return json.loads(raw)


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def derive(parent, supplement, review):
    require(set(parent) == PACK_KEYS and parent['contentVersion'] == '2026-10-15.1', 'Unexpected parent schema/version')
    require(review['input']['packSha256'] == HASHES['parent'], 'Review is bound to another parent')
    require(review['independentReviewer'] is True and review['verdict']['publicationApproved'] is False,
            'Expected independent content review without publication approval')
    require(set(review['input']['countyCodes']) == set(CODES), 'Review county scope mismatch')
    directions_review = {item['id']: item for item in review['directions']}
    require(all(directions_review[key]['verdict'] == 'revise' for key in REVISION_IDS), 'Expected population findings are absent')
    require(next(item for item in review['supplementalClaims'] if item['id'] == 'rudong-supplement-claim-1')['verdict'] == 'acceptable',
            'The selected supplemental historical claim has not passed independent content review')
    source_review = {item['id']: item for item in review['sourceReview']}
    require(source_review[RUDONG_SOURCE]['verdict'] == 'acceptable' and source_review[RUDONG_SOURCE]['actualOriginalBodyRead'] is True,
            'The Rudong department body was not independently read')
    original_by_code = {p['regionRef']['code']: p for p in parent['profiles']}
    require(len(parent['profiles']) == 20 and all(code in original_by_code for code in CODES), 'Parent counties changed')
    profiles = [copy.deepcopy(original_by_code[code]) for code in CODES]
    accepted_facts = {f['id'] for f in review['facts'] if f['verdict'] == 'acceptable'}
    require(all(f['id'] in accepted_facts for p in profiles for f in p['facts']), 'An inherited fact lacks scoped review support')

    edits = {
        REVISION_IDS[0]: {
            'title': '通城县成年求职者对产业岗位信息的理解与咨询意愿',
            'question': '现居通城县或当前在当地工作的成年求职者如何理解岗位描述、技能要求与生活条件信息，提出哪些进一步咨询意愿？',
            'population': '研究时年满18周岁、现居通城县或当前在通城县工作、有求职意向且自愿参与者',
            'minimumEvidence': [
                '按年满18周岁、本地居住或工作及求职意向的同一规则筛选；先核对可用招募渠道。',
                '取得接触、岗位材料使用与引用许可；核实材料的当期来源及岗位资格。',
                '分开记录岗位信息理解任务、进一步咨询意愿与已发生的咨询行为；不将意愿当行动或据横截面差异声称因果效果。',
            ],
        },
        REVISION_IDS[1]: {
            'title': '潜山市成年求职者对制刷岗位的认知',
            'question': '现居潜山市或当前在当地工作的成年求职者如何理解核实后的制刷岗位说明，提出哪些进一步了解意愿与条件？',
            'population': '研究时年满18周岁、现居潜山市或当前在潜山市工作、有求职意向且自愿参与者',
            'minimumEvidence': [
                '按年满18周岁、本地居住或工作及求职意向的同一规则筛选；先核对可用招募渠道。',
                '取得接触、岗位材料使用与引用许可。',
                '先核实当地当期实际开放岗位与资格，再使用获准材料；将岗位认知、继续了解意愿与已发生的求职行动分开记录。',
            ],
        },
    }
    for profile in profiles:
        for direction in profile['directions']:
            if direction['id'] in edits:
                direction.update(copy.deepcopy(edits[direction['id']]))

    supplement_county = next(p for p in supplement['counties'] if p['countyCode'] == '320623')
    supplied = next(s for s in supplement_county['sources'] if s['id'] == RUDONG_SOURCE)
    require(supplied['actualReadStatus'] == 'body_read' and supplied['rawBodyStored'] is False,
            'Supplement does not represent the expected bounded body read')
    require(supplied['publicationDate'] == '2026-01-05' and supplied['retrievedAt'] == '2026-10-15', 'Rudong date provenance changed')
    require(supplied['reportingPeriod']['start'] == '2025-01-01' and supplied['reportingPeriod']['end'] == '2025-12-31',
            'Only the 2025 retrospective report is eligible')
    require(supplied['currentOperationalStatusVerified'] is False, 'Do not reinterpret this source as current operations')
    rudong = profiles[2]
    rudong['facts'].append({'id': 'county-320623-fact-2', 'text': NEW_FACT, 'sourceIds': [RUDONG_SOURCE],
                            'temporalKind': 'historical_reference', 'asOfDate': None})
    rudong['tags'].append({'label': '公共就业服务', 'sourceIds': [RUDONG_SOURCE]})
    rudong['gaps'][-1] = ('县级年度自报仅支持2025年历史活动；核实当前服务点开放、岗位有效性、招募入口和接触许可，'
                          '不将2026年计划作为已完成成果。')
    used = {sid for p in profiles for f in p['facts'] for sid in f['sourceIds']}
    sources = [copy.deepcopy(s) for s in parent['sources'] if s['id'] in used]
    sources.append({'id': supplied['id'], 'title': supplied['title'], 'url': supplied['url'],
                    'publishedAt': supplied['publicationDate'], 'retrievedAt': supplied['retrievedAt'],
                    'authority': 'official_county_department_annual_self_report',
                    'locator': '第一部分第（一）项（2025年就业工作）；页面来源与发布时间栏',
                    'supportedClaims': [NEW_FACT]})
    # Project inherited source declarations onto this three-county pack, without carrying other counties' claims.
    for source in sources:
        source['supportedClaims'] = [f['text'] for p in profiles for f in p['facts'] if source['id'] in f['sourceIds']]
    result = {'schemaVersion': 1, 'id': 'county-pack-01-candidates', 'contentVersion': '2026-10-15.2',
              'catalogVersion': parent['catalogVersion'], 'sources': sources, 'profiles': profiles}
    validate(result, parent)
    return result


def validate(pack, parent):
    require(set(pack) == PACK_KEYS and len(pack['profiles']) == 3 and len(pack['sources']) == 4, 'Candidate pack shape/count mismatch')
    sources = {s['id']: s for s in pack['sources']}
    require(len(sources) == 4, 'Duplicate source IDs')
    all_ids = set()
    old_profiles = {p['id']: p for p in parent['profiles']}
    for p in pack['profiles']:
        require(set(p) == PROFILE_KEYS and p['status'] == 'draft' and len(p['directions']) == 3, 'Draft profile contract changed')
        require(p['regionRef'] == old_profiles[p['id']]['regionRef'], 'Canonical county reference changed')
        for f in p['facts']:
            require(set(f) == FACT_KEYS and f['temporalKind'] == 'historical_reference', 'Fact contract changed')
            require(all(f['text'] in sources[s]['supportedClaims'] for s in f['sourceIds']), 'Fact lacks declared source support')
        for d in p['directions']:
            require(set(d) == DIRECTION_KEYS and d['classification'] == 'proposed' and len(d['minimumEvidence']) >= 3,
                    'Proposed direction contract changed')
            require(set(d['sourceIds']) <= sources.keys(), 'Direction source missing')
            old = next(x for x in old_profiles[p['id']]['directions'] if x['id'] == d['id'])
            require(d['sourceIds'] == old['sourceIds'] and d['requiredAccess'] == old['requiredAccess'],
                    'Supplement must not imply new direction support or respondent access')
            if d['id'] not in REVISION_IDS:
                require(d == old, 'An unrelated direction changed')
        for item in [p] + p['facts'] + p['directions']:
            require(item['id'] not in all_ids, 'Duplicate profile/item ID')
            all_ids.add(item['id'])
    for source in pack['sources']:
        require(set(source) == SOURCE_KEYS, 'Runtime source schema changed')
    require(sum(len(p['facts']) for p in pack['profiles']) == 6, 'Only one new narrow historical fact is allowed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--review', type=Path, default=REVIEW, help='Exact immutable independent report (default: repository-local review-first-candidates.json)')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--write', action='store_true', help='Write only the new derived candidate JSON')
    mode.add_argument('--stdout', action='store_true', help='Emit the deterministic candidate JSON without writing')
    parser.add_argument('--self-test', action='store_true', help='Also reject an in-memory byte drift in every frozen input')
    args = parser.parse_args()
    try:
        raws = {'parent': PARENT.read_bytes(), 'supplement': SUPPLEMENT.read_bytes(), 'review': args.review.read_bytes()}
        inputs = {key: anchored(raw, key) for key, raw in raws.items()}
        original = encode(inputs['parent'])
        result = derive(**inputs)
        require(encode(inputs['parent']) == original, 'Derivation mutated the in-memory parent')
        output = encode(result)
        rejected = 0
        if args.self_test:
            for key, raw in raws.items():
                try:
                    anchored(raw + b'\n', key)
                except ValueError:
                    rejected += 1
            require(rejected == 3, 'An input byte drift was accepted')
            require(encode(derive(**inputs)) == output, 'Repeated derivation was not byte deterministic')
        if args.stdout:
            print(output.decode('utf-8'), end='')
            return
        if args.write:
            OUTPUT.write_bytes(output)
        else:
            require(OUTPUT.exists() and OUTPUT.read_bytes() == output, 'Derived JSON differs or is absent; inspect and use --write to regenerate')
        print(json.dumps({'contract': 'pass', 'mode': 'write' if args.write else 'check', 'profiles': 3, 'directions': 9,
                          'facts': 6, 'sources': 4, 'publication': 'draft_not_published',
                          'inputHashes': HASHES, 'inputDriftRejections': rejected, 'sha256': digest(output)}, ensure_ascii=False))
    except (OSError, ValueError, KeyError, StopIteration) as exc:
        parser.exit(1, f'Candidate derivation refused: {exc}\n')


if __name__ == '__main__':
    main()
