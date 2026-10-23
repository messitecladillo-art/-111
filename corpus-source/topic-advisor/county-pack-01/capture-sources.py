"""Bounded public-source capture. Save fingerprints and tiny audit fragments only."""
import concurrent.futures
import datetime
import hashlib
import html.parser
import json
import pathlib
import re
import urllib.parse
import urllib.request

SOURCES = [
 ('miit-2025-clusters', 'https://www.miit.gov.cn/cms_files/filemanager/1226211233/attach/202510/b38d359736bc48408f7977561e84bd02.pdf', ['2025', '通城县', '潜山市']),
 ('mct-rural-2022', 'https://sjfw.mct.gov.cn/site/dataservice/rural', ['数据截止日期', '茶庄村', '李家庄村', '巴图湾村']),
 ('tongcheng-gig-2024', 'https://rst.hubei.gov.cn/bmdt/dtyw/gzdt/202405/t20240510_5186532.shtml', ['零工驿站', '2024-05-10', '挂牌']),
 ('jinxi-chain-2025', 'https://www.cppcc.gov.cn/zxww/2025/10/24/ARTI1761270582806325.shtml', ['2025', '金溪县政协', '种植', '贸易']),
 ('wenxi-visit-2025', 'https://gxj.yuncheng.gov.cn/doc/2025/07/01/535999.shtml', ['发表时间', '6月23日', '职业技能']),
 ('pingyang-plan-2025', 'https://www.zjpy.gov.cn/art/2025/5/16/art_1229252500_4291722.html', ['发布日期', '2025—2027', '印刷', '数智']),
 ('anxi-report-2024', 'https://www.fjax.gov.cn/zwgk/zfxxgkzl/zfxxgkml/gzbg/202401/t20240112_2993505.htm', ['发布时间', '海峡两岸', '藤铁', '海外仓']),
 ('guangshan-digital-2026', 'https://www.xinyang.gov.cn/2026/02-11/753589.html', ['2026', '订单', '工业互联网', '数字化']),
 ('chengmai-report-2025', 'https://www.hainan.gov.cn/hainan/xgwjtv/202502/6f09aeb6e899441caa9b66167b498b66.shtml', ['时间', '数字经济核心', '油服', '冷链']),
 ('yimen-pesticide-2024', 'https://www.ym.gov.cn/ymxzfxxgk/ymxnyjzhxxny/20241129/1570962.html', ['发布时间', '农药包装', '2023年', '回收']),
 ('yiwu-jobs-2025', 'https://www.xjyiwu.gov.cn/xjyiwu/c120572/202604/c845e22a877a472aac10a1c02ef7130f.shtml', ['2026-04-01', '培训', '就业']),
 ('pingshan-tourism-2020', 'https://www.ndrc.gov.cn/xwdt/ztzl/qgxclydxal/stzyytx/202004/t20200423_1226489.html', ['发布时间', '李家庄', '快旅慢游', '科普']),
 ('wushen-tourism', 'https://wsq.gov.cn/qqgk/ld/ly/202403/t20240313_1762497.html', ['发布时间', '发布日期', '巴图湾红色文化小镇简介', '巴图湾村']),
 ('xinbin-heritage-2025', 'https://www.ln.gov.cn/web/sqgk/whly/ajjq/4ajq/2025101516253252042/index.shtml', ['2025', '赫图阿拉城位于', '旗袍博物馆']),
 ('qianguo-lake-2026', 'https://sthjt.jl.gov.cn/ywdt/ssdt/dfdt/202602/t20260206_3553353.html', ['2026-02-09', '水质监测', '采购无人机', '每周巡查']),
 ('mohe-homestay-2023', 'https://nynct.hlj.gov.cn/nynct/xczxxx/202310/c00_31673936.shtml', ['2023', '家庭宾馆', '山特产品店', '北红']),
 ('longsheng-culture-2022', 'https://www.mct.gov.cn/whzx/whyw/202212/t20221220_938183.htm', ['2022-12-20', '大寨村', '红瑶', '梯田']),
 ('taijiang-crafts', 'https://www.qdnrd.gov.cn/xsrd/6345.jhtml', ['长滩村', '刺绣', '线上', '培训']),
 ('zhuoni-tourism', 'https://www.zhuoni.gov.cn/info/1135/28780.htm', ['2023', '博峪村', '专业村', '精品民宿']),
]

class Text(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.skip = 0; self.meta = {}
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in ('script', 'style', 'noscript'): self.skip += 1
        if tag in ('p', 'div', 'h1', 'h2', 'h3', 'br', 'li', 'tr'): self.parts.append('\n')
        if tag == 'meta' and values.get('content'):
            key = values.get('name', values.get('property', '')).lower()
            if re.search(r'date|time|title|source', key): self.meta[key] = values['content'][:250]
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript') and self.skip: self.skip -= 1
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)

def capture(source):
    source_id, url, needles = source
    base = {'id': source_id, 'url': url, 'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'rights': 'source_metadata_original_summary_and_tiny_audit_fragment_only'}
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'EVI-X public-source research/1.0'})
        with urllib.request.urlopen(request, timeout=30) as response:
            final_url = response.geturl()
            if not urllib.parse.urlparse(final_url).hostname.endswith('.gov.cn'): raise ValueError('Redirect outside official gov.cn domain')
            raw = response.read(5_000_001)
            if len(raw) > 5_000_000: raise ValueError('Source exceeds 5 MB')
            content_type = response.headers.get('Content-Type', '')
        base.update(status='retrieved', finalUrl=final_url, rawSha256=hashlib.sha256(raw).hexdigest(), rawBytes=len(raw), contentType=content_type)
        if raw.startswith(b'%PDF'):
            import fitz
            document = fitz.open(stream=raw, filetype='pdf')
            text = '\n'.join(page.get_text() for page in document)
            base['pageCount'] = len(document); metadata = {}
        else:
            charset = re.search(br'charset=["\s]*([A-Za-z0-9_-]+)', raw[:10000])
            encoding = charset.group(1).decode('ascii') if charset else 'utf-8'
            parser = Text(); parser.feed(raw.decode(encoding, errors='replace'))
            text = '\n'.join(re.sub(r'\s+', ' ', line).strip() for line in ''.join(parser.parts).splitlines() if line.strip())
            metadata = parser.meta
        excerpts = []
        for needle in needles:
            position = text.find(needle)
            if position >= 0: excerpts.append({'needle': needle, 'text': text[max(0, position-80):position+600]})
        base['pageMetadata'] = metadata
        base['auditFragment'] = next((x['text'][:40] for x in excerpts if source_id not in ('miit-2025-clusters', 'mct-rural-2022')), '')
        return base, {'id': source_id, 'status': 'retrieved', 'metadata': metadata, 'inspection': excerpts}
    except Exception as exc:
        base.update(status='failed', error=str(exc)[:250])
        return base, {'id': source_id, 'status': 'failed', 'error': str(exc)[:250]}

if __name__ == '__main__':
    root = pathlib.Path(__file__).resolve().parent
    results = list(concurrent.futures.ThreadPoolExecutor(max_workers=4).map(capture, SOURCES))
    (root / 'captures.json').write_text(json.dumps({'schemaVersion': 1, 'method': 'bounded_http_get_no_retries_raw_body_hash_only', 'sources': [r[0] for r in results]}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for _, inspection in results: print(json.dumps(inspection, ensure_ascii=False))
