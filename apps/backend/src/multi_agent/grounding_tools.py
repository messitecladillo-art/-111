"""Local corpus & statistical-method grounding tools for Research & Reviewer Agents."""

from __future__ import annotations

from functools import lru_cache
import json
import math
import os
from pathlib import Path
import re
from typing import Any
from urllib.parse import quote

import httpx

from multi_agent.agents.contracts import ToolResult
from shared.contracts import fingerprint

_ASSET_ROOT = Path(__file__).resolve().parent / "agents" / "research_agent"
_Z_SCORES = {0.90: 1.6449, 0.95: 1.96, 0.99: 2.5758}


def _load_knowledge_ids() -> list[str]:
    path = _ASSET_ROOT / "knowledge-catalog.json"
    if not path.is_file():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [entry["id"] for entry in payload.get("entries", []) if isinstance(entry, dict) and entry.get("id")]


def _load_topic_patterns_and_sources() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    tdir = _ASSET_ROOT / "topic_assets"
    catalog = json.loads((tdir / "catalog.json").read_text(encoding="utf-8")) if (tdir / "catalog.json").is_file() else {}
    sources_raw = json.loads((tdir / "sources.json").read_text(encoding="utf-8")) if (tdir / "sources.json").is_file() else {}
    return catalog.get("patterns", []), sources_raw


_GROUNDING_BRACKET_MAP: dict[int, str | None] = {
    0x300C: "“",
    0x300E: "“",
    0x300D: "”",
    0x300F: "”",
    0x3010: None,
    0x3011: None,
}


def _clean_grounding_text(value: Any) -> str:
    return str(value or "").strip().translate(_GROUNDING_BRACKET_MAP)


def verify_method_or_concept(*, query: str) -> ToolResult:
    """Resolve methodology queries against reviewed knowledge catalog & empirical rules."""
    clean_q = _clean_grounding_text(query)[:120]
    ids = _load_knowledge_ids()
    tokens = [t.lower() for t in re.split(r"[\s,，;；/]+", clean_q) if t.strip()]
    matched = [
        eid for eid in ids
        if any(tok in eid.lower() for tok in tokens)
    ][:12]
    receipt = {
        "query": clean_q,
        "matchedEntryIds": matched,
        "reviewedCatalogCount": len(ids),
        "groundedFormulaHint": (
            "n = ceil(z^2 * p * (1 - p) / e^2 * Deff / validRate)"
            if re.search(r"样本|sample|deff|抽样", clean_q, re.I)
            else "线性回归需核验 VIF ≤ 5；量表信度 Cronbach α ≥ 0.70 且 CITC ≥ 0.30；二元 Logistic 回归出现完全分离时改用 Firth 或 L2 惩罚似然估计"
        ),
    }
    return ToolResult(
        classification="actual",
        evidence_refs=[f"knowledge:{eid}" for eid in matched[:6]],
        data=receipt,
    )


def verify_regional_context(*, geography: str, topic_keywords: str = "") -> ToolResult:
    """Ground regional fieldwork scope using local verified topic catalog & source receipts."""
    patterns, sources = _load_topic_patterns_and_sources()
    geo = _clean_grounding_text(geography)
    kw = _clean_grounding_text(topic_keywords)
    hits = [
        {
            "id": p["id"],
            "title": _clean_grounding_text(p["title"]),
            "domain": _clean_grounding_text(p.get("domain")) if p.get("domain") else p.get("domain"),
            "methods": [_clean_grounding_text(m) for m in p.get("methods", [])],
            "scopeLimits": [_clean_grounding_text(s) for s in p.get("scopeLimits", [])],
            "sourceIds": p.get("sourceIds", []),
        }
        for p in patterns
        if (geo and (geo in str(p.get("title", "")) or geo in " ".join(p.get("regionTags", []))))
        or (kw and any(w in str(p.get("title", "")) + " " + str(p.get("question", "")) for w in kw.split()[:4]))
    ][:5]
    source_map = sources.get("sources", sources) if isinstance(sources, dict) else {}
    cited_sources: list[dict[str, str]] = []
    for h in hits:
        for sid in h["sourceIds"]:
            entry = source_map.get(sid) if isinstance(source_map, dict) else None
            if isinstance(entry, dict) and entry.get("title"):
                cited_sources.append({"id": sid, "title": _clean_grounding_text(entry["title"])[:160]})
    return ToolResult(
        classification="actual",
        evidence_refs=[f"source:{s['id']}" for s in cited_sources[:10]],
        data={
            "geography": geo,
            "matchedPatterns": hits,
            "verifiedSources": cited_sources[:10],
            "receiptHash": fingerprint({"geo": geo, "hits": [h["id"] for h in hits]}),
        },
    )


def validate_sampling_design_deff(
    *,
    confidence: float = 0.95,
    margin: float = 0.05,
    proportion: float = 0.5,
    design_effect: float = 1.35,
    valid_rate: float = 0.90,
) -> ToolResult:
    """Compute exact design-effect-adjusted sample size and contact quota."""
    z = _Z_SCORES.get(round(float(confidence), 2), 1.96)
    e = max(0.005, min(0.25, float(margin)))
    p = max(0.01, min(0.99, float(proportion)))
    deff = max(1.0, min(5.0, float(design_effect)))
    vr = max(0.2, min(1.0, float(valid_rate)))
    srs_n = (z * z * p * (1.0 - p)) / (e * e)
    completes = math.ceil(srs_n * deff)
    contacts = math.ceil(completes / vr)
    return ToolResult(
        classification="actual",
        evidence_refs=[f"deff-formula:n={completes}"],
        data={
            "confidence": confidence,
            "margin": e,
            "proportion": p,
            "designEffect": deff,
            "validRate": vr,
            "srsBaseline": math.ceil(srs_n),
            "requiredCompletes": completes,
            "plannedContacts": contacts,
            "receiptHash": fingerprint({"completes": completes, "contacts": contacts, "deff": deff}),
        },
    )


_GEO_SUFFIX_RE = re.compile(r"(?:特别行政区|自治区|自治州|自治县|地区|省|市|区|县|旗)$")
_ADCODE_RE = re.compile(r"\b([1-9]\d{5})\b")
_DOI_PREFIX_RE = re.compile(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", re.I)
_DOI_VALID_RE = re.compile(r"^10\.\d{4,9}/[-._;()/:A-Za-z0-9]+$")


@lru_cache(maxsize=1)
def _load_county_gazetteer_index() -> dict[str, Any]:
    path = _ASSET_ROOT / "topic_assets" / "regions.catalog.json"
    if not path.is_file():
        return {"records": [], "byCode": {}, "coverage": {}, "catalogVersion": ""}
    raw = json.loads(path.read_text(encoding="utf-8"))
    records = [r for r in (raw.get("records") or []) if isinstance(r, dict) and r.get("code")]
    by_code: dict[str, dict[str, Any]] = {str(r["code"]): r for r in records}
    enriched: list[dict[str, Any]] = []
    for rec in records:
        code = str(rec["code"])
        level = str(rec.get("level") or "")
        parent_code = rec.get("parentCode")
        prov_code = str(rec.get("provinceCode") or "")
        prov_rec = by_code.get(prov_code)
        prov_name = str(prov_rec["name"]) if prov_rec else ""
        pref_code: str | None = None
        pref_name = ""
        if level == "prefecture":
            pref_code = code
            pref_name = str(rec.get("name") or "")
        elif level == "county" and parent_code and str(parent_code) != prov_code:
            pref_rec = by_code.get(str(parent_code))
            if pref_rec:
                pref_code = str(pref_rec["code"])
                pref_name = str(pref_rec.get("name") or "")
        name = str(rec.get("name") or "")
        full_path = "".join(part for part in (prov_name, pref_name if pref_name != name else "", name) if part)
        enriched.append({
            "code": code,
            "name": name,
            "level": level,
            "parentCode": str(parent_code) if parent_code else None,
            "provinceCode": prov_code,
            "provinceName": prov_name,
            "prefectureCode": pref_code,
            "prefectureName": pref_name,
            "startYear": rec.get("startYear"),
            "fullPath": full_path,
        })
    return {
        "records": enriched,
        "byCode": {item["code"]: item for item in enriched},
        "coverage": dict(raw.get("coverage") or {}),
        "catalogVersion": str(raw.get("catalogVersion") or ""),
    }


def _strip_geo_suffix(token: str) -> str:
    stripped = _GEO_SUFFIX_RE.sub("", token).strip()
    return stripped if len(stripped) >= 2 else token


def lookup_county_gazetteer(*, query: str, limit: int = 5) -> ToolResult:
    """Resolve 6-digit adcodes or Chinese geo names across the 34/333/2845 regional directory."""
    clean_q = str(query or "").strip()[:120]
    lim = max(1, min(20, int(limit)))
    idx = _load_county_gazetteer_index()
    records: list[dict[str, Any]] = idx["records"]
    by_code: dict[str, dict[str, Any]] = idx["byCode"]
    coverage: dict[str, Any] = idx["coverage"]

    matches: list[dict[str, Any]] = []
    if clean_q:
        adcodes = _ADCODE_RE.findall(clean_q)
        seen_codes: set[str] = set()
        for code in adcodes:
            hit = by_code.get(code)
            if hit and code not in seen_codes:
                seen_codes.add(code)
                matches.append({k: v for k, v in hit.items() if k != "fullPath"})

        if len(matches) < lim:
            raw_tokens = [t for t in re.split(r"[\s,，;；/·、]+", clean_q) if t.strip()]
            norm_tokens = [_strip_geo_suffix(t) for t in raw_tokens]
            q_stripped = _strip_geo_suffix(clean_q)
            prefers_county = any(ch in clean_q for ch in ("区", "县", "旗", "市"))
            scored: list[tuple[int, int, str, dict[str, Any]]] = []
            level_rank = {"county": 0, "prefecture": 1, "province": 2}

            for rec in records:
                code = rec["code"]
                if code in seen_codes:
                    continue
                name = rec["name"]
                name_short = _strip_geo_suffix(name)
                full_path = rec["fullPath"]
                score = 0

                if name == clean_q or (q_stripped and name_short == q_stripped):
                    score += 500
                elif clean_q in name or (len(q_stripped) >= 2 and q_stripped in name):
                    score += 260
                elif clean_q in full_path:
                    score += 140
                elif len(name_short) >= 2 and name_short in clean_q:
                    score += 110
                    if rec["provinceName"] and _strip_geo_suffix(rec["provinceName"]) in clean_q:
                        score += 60
                    if rec["prefectureName"] and _strip_geo_suffix(rec["prefectureName"]) in clean_q:
                        score += 60

                if norm_tokens and all(tok in full_path for tok in norm_tokens):
                    score += 180
                    if any(tok in name for tok in norm_tokens):
                        score += 120
                elif raw_tokens and any(tok in name or _strip_geo_suffix(tok) in name for tok in raw_tokens if len(_strip_geo_suffix(tok)) >= 2):
                    score += 90

                if score <= 0:
                    continue
                if prefers_county and rec["level"] == "county":
                    score += 20
                scored.append((-score, level_rank.get(rec["level"], 3), code, rec))

            scored.sort(key=lambda item: (item[0], item[1], item[2]))
            for _, _, code, rec in scored:
                if len(matches) >= lim:
                    break
                if code not in seen_codes:
                    seen_codes.add(code)
                    matches.append({k: v for k, v in rec.items() if k != "fullPath"})

    patterns, _sources = _load_topic_patterns_and_sources()
    geo_hints: set[str] = set()
    if clean_q:
        geo_hints.add(_strip_geo_suffix(clean_q))
    for m in matches:
        for field_name in ("provinceName", "prefectureName", "name"):
            val = str(m.get(field_name) or "").strip()
            if val:
                geo_hints.add(_strip_geo_suffix(val))
    geo_hints = {g for g in geo_hints if len(g) >= 2}

    matched_patterns = [
        {
            "id": p["id"],
            "title": _clean_grounding_text(p["title"]),
            "domain": _clean_grounding_text(p.get("domain")) if p.get("domain") else p.get("domain"),
            "methods": [_clean_grounding_text(m) for m in p.get("methods", [])],
            "scopeLimits": [_clean_grounding_text(s) for s in p.get("scopeLimits", [])],
            "sourceIds": p.get("sourceIds", []),
        }
        for p in patterns
        if any(
            h in str(p.get("title", "")) or h in " ".join(p.get("regionTags", [])) or h in " ".join(p.get("cityTags", []))
            for h in geo_hints
        )
    ][:5]

    return ToolResult(
        classification="actual",
        evidence_refs=[f"adcode:{m['code']}" for m in matches],
        data={
            "query": clean_q,
            "matches": matches[:lim],
            "matchedPatterns": matched_patterns,
            "coverage": coverage,
            "caveats": [_clean_grounding_text(c) for c in (coverage.get("limitations") or [])],
            "catalogVersion": idx["catalogVersion"],
            "receiptHash": fingerprint({"query": clean_q, "codes": [m["code"] for m in matches[:lim]]}),
        },
    )


_OFFLINE_SCHOLARLY_FIXTURES: tuple[dict[str, Any], ...] = (
    {
        "doi": "10.1007/BF02310555",
        "title": "Coefficient alpha and the internal structure of tests",
        "authors": ["Cronbach, L. J."],
        "year": 1951,
        "venue": "Psychometrika",
        "tags": ["reliability", "cronbach alpha", "scale", "psychometrics", "信度"],
    },
    {
        "doi": "10.1177/002224378101800104",
        "altDois": ["10.2307/3151312"],
        "title": "Evaluating Structural Equation Models with Unobservable Variables and Measurement Error",
        "authors": ["Fornell, C.", "Larcker, D. F."],
        "year": 1981,
        "venue": "Journal of Marketing Research",
        "tags": ["sem", "ave", "discriminant validity", "fornell-larcker", "效度"],
    },
    {
        "doi": "10.1037/0021-9010.88.5.879",
        "title": "Common method biases in behavioral research: A critical review of the literature and recommended remedies",
        "authors": ["Podsakoff, P. M.", "MacKenzie, S. B.", "Lee, J.-Y.", "Podsakoff, N. P."],
        "year": 2003,
        "venue": "Journal of Applied Psychology",
        "tags": ["cmb", "common method bias", "harman", "共同方法偏差"],
    },
    {
        "doi": "10.1093/biomet/80.1.27",
        "title": "Bias reduction of maximum likelihood estimates",
        "authors": ["Firth, D."],
        "year": 1993,
        "venue": "Biometrika",
        "tags": ["firth", "logistic regression", "separation", "penalized likelihood", "完全分离"],
    },
    {
        "doi": "10.1080/00031305.2000.10474549",
        "title": "Using Heteroscedasticity Consistent Standard Errors in the Linear Regression Model",
        "authors": ["Long, J. S.", "Ervin, L. H."],
        "year": 2000,
        "venue": "The American Statistician",
        "tags": ["hc3", "heteroscedasticity", "robust se", "ols", "异方差"],
    },
    {
        "doi": "10.1016/j.jeconom.2020.12.001",
        "title": "Difference-in-Differences with multiple time periods",
        "authors": ["Callaway, B.", "Sant'Anna, P. H. C."],
        "year": 2021,
        "venue": "Journal of Econometrics",
        "tags": ["did", "staggered did", "twfe", "att", "交错双重差分"],
    },
    {
        "doi": "10.48550/arXiv.1905.03222",
        "title": "Conformalized Quantile Regression",
        "authors": ["Romano, Y.", "Patterson, E.", "Candès, E. J."],
        "year": 2019,
        "venue": "Advances in Neural Information Processing Systems (NeurIPS)",
        "tags": ["conformal prediction", "distribution-free", "prediction interval", "预测区间"],
    },
    {
        "doi": "10.20684/quality.14.2_147",
        "title": "Attractive Quality and Must-Be Quality",
        "authors": ["Kano, N.", "Seraku, N.", "Takahashi, F.", "Tsuji, S."],
        "year": 1984,
        "venue": "Journal of the Japanese Society for Quality Control",
        "tags": ["kano", "better-worse", "quality attributes", "需求分类"],
    },
    {
        "doi": "10.3982/ECTA11757",
        "title": "Robust Nonparametric Confidence Intervals for Regression-Discontinuity Designs",
        "authors": ["Calonico, S.", "Cattaneo, M. D.", "Titiunik, R."],
        "year": 2014,
        "venue": "Econometrica",
        "tags": ["rdd", "regression discontinuity", "bandwidth", "断点回归"],
    },
    {
        "doi": "10.1093/biomet/70.1.41",
        "title": "The central role of the propensity score in observational studies for causal effects",
        "authors": ["Rosenbaum, P. R.", "Rubin, D. B."],
        "year": 1983,
        "venue": "Biometrika",
        "tags": ["psm", "propensity score", "matching", "倾向得分匹配"],
    },
    {
        "doi": "10.2307/2171753",
        "altDois": ["10.3386/t0151"],
        "title": "Instrumental Variables Regression with Weak Instruments",
        "authors": ["Staiger, D.", "Stock, J. H."],
        "year": 1997,
        "venue": "Econometrica",
        "tags": ["iv", "2sls", "weak instruments", "first stage f", "工具变量"],
    },
    {
        "doi": "10.1017/9781108653985",
        "title": "Trustworthy Online Controlled Experiments: A Practical Guide to A/B Testing",
        "authors": ["Kohavi, R.", "Tang, D.", "Xu, Y."],
        "year": 2020,
        "venue": "Cambridge University Press",
        "tags": ["ab testing", "srm", "sequential", "guardrail", "在线实验"],
    },
    {
        "doi": "10.1080/01621459.1958.10501452",
        "title": "Nonparametric Estimation from Incomplete Observations",
        "authors": ["Kaplan, E. L.", "Meier, P."],
        "year": 1958,
        "venue": "Journal of the American Statistical Association",
        "tags": ["kaplan-meier", "survival", "censoring", "生存分析"],
    },
    {
        "doi": "10.1016/0197-2456(86)90046-2",
        "title": "Meta-analysis in clinical trials",
        "authors": ["DerSimonian, R.", "Laird, N."],
        "year": 1986,
        "venue": "Controlled Clinical Trials",
        "tags": ["meta-analysis", "random effects", "heterogeneity", "异质性"],
    },
    {
        "doi": "10.1111/rssb.12348",
        "title": "Making Sense of Sensitivity: Extending Omitted Variable Bias",
        "authors": ["Cinelli, C.", "Hazlett, C."],
        "year": 2020,
        "venue": "Journal of the Royal Statistical Society: Series B (Statistical Methodology)",
        "tags": ["sensitivity analysis", "omitted variable bias", "robustness", "敏感性分析"],
    },
    {
        "doi": "10.1002/9781118162915",
        "title": "Sampling Techniques (3rd ed.)",
        "authors": ["Cochran, W. G."],
        "year": 1977,
        "venue": "John Wiley & Sons",
        "tags": ["sampling", "deff", "stratified", "survey", "抽样公式"],
    },
)


def _normalize_doi(raw_doi: str) -> str:
    cleaned = _DOI_PREFIX_RE.sub("", str(raw_doi or "").strip())
    return cleaned.strip()


def _format_citation_entry(entry: dict[str, Any], *, source: str) -> dict[str, Any]:
    doi_val = str(entry["doi"])
    return {
        "doi": doi_val,
        "title": str(entry["title"]),
        "authors": list(entry["authors"]),
        "year": int(entry["year"]),
        "venue": str(entry["venue"]),
        "url": f"https://doi.org/{doi_val}",
        "tags": list(entry.get("tags") or []),
        "source": source,
    }


def _parse_crossref_work(item: dict[str, Any]) -> dict[str, Any] | None:
    doi_val = str(item.get("DOI") or "").strip()
    titles = item.get("title") or []
    title = str(titles[0]).strip() if isinstance(titles, list) and titles else str(titles or "").strip()
    if not doi_val or not title:
        return None
    authors: list[str] = []
    for a in (item.get("author") or [])[:8]:
        if isinstance(a, dict):
            fam = str(a.get("family") or "").strip()
            giv = str(a.get("given") or "").strip()
            if fam and giv:
                authors.append(f"{fam}, {giv}")
            elif fam or giv:
                authors.append(fam or giv)
    year = 0
    for date_key in ("published-print", "published-online", "issued", "created"):
        parts = (item.get(date_key) or {}).get("date-parts") if isinstance(item.get(date_key), dict) else None
        if isinstance(parts, list) and parts and isinstance(parts[0], list) and parts[0]:
            if isinstance(parts[0][0], int):
                year = parts[0][0]
                break
    containers = item.get("container-title") or []
    venue = str(containers[0]).strip() if isinstance(containers, list) and containers else str(item.get("publisher") or "").strip()
    return {
        "doi": doi_val,
        "title": title,
        "authors": authors,
        "year": year,
        "venue": venue,
        "url": f"https://doi.org/{doi_val}",
        "tags": [],
        "source": "crossref_live",
    }


def verify_scholarly_citation(
    *,
    query: str = "",
    doi: str = "",
    enable_live: bool | None = None,
) -> ToolResult:
    """Verify scholarly citation metadata offline against curated catalog (live Crossref opt-in only)."""
    clean_q = str(query or "").strip()[:240]
    clean_doi = _normalize_doi(doi)
    if clean_doi and not _DOI_VALID_RE.fullmatch(clean_doi):
        return ToolResult(
            classification="actual",
            evidence_refs=[],
            data={
                "verified": False,
                "query": clean_q,
                "doi": clean_doi,
                "source": "invalid_doi_format",
                "citation": None,
                "matches": [],
                "reason": "invalid_doi_syntax",
            },
        )

    # 1. Exact DOI match in offline curated fixtures
    if clean_doi:
        doi_low = clean_doi.lower()
        for entry in _OFFLINE_SCHOLARLY_FIXTURES:
            all_dois = [str(entry["doi"]).lower(), *(str(d).lower() for d in entry.get("altDois") or ())]
            if doi_low in all_dois:
                cit = _format_citation_entry(entry, source="offline_curated_catalog")
                return ToolResult(
                    classification="actual",
                    evidence_refs=[f"doi:{cit['doi']}"],
                    data={
                        "verified": True,
                        "query": clean_q,
                        "doi": cit["doi"],
                        "source": "offline_curated_catalog",
                        "citation": cit,
                        "matches": [cit],
                        "receiptHash": fingerprint({"doi": cit["doi"], "source": "offline_curated_catalog"}),
                    },
                )

    # 2. Query match in offline curated fixtures (only when DOI was not explicitly given or didn't conflict)
    if clean_q and not clean_doi:
        tokens = [t.lower() for t in re.split(r"[\s,，;；/()]+", clean_q) if len(t.strip()) >= 2]
        scored: list[tuple[int, dict[str, Any]]] = []
        for entry in _OFFLINE_SCHOLARLY_FIXTURES:
            haystack = " ".join([
                str(entry["doi"]),
                str(entry["title"]),
                " ".join(entry["authors"]),
                str(entry["year"]),
                str(entry["venue"]),
                " ".join(entry.get("tags") or ()),
            ]).lower()
            hits = sum(1 for tok in tokens if tok in haystack)
            if clean_q.lower() in haystack:
                hits += 3
            if hits > 0 and (len(tokens) <= 1 or hits >= 2 or clean_q.lower() in haystack):
                scored.append((hits, entry))
        if scored:
            scored.sort(key=lambda pair: (-pair[0], -int(pair[1]["year"])))
            top = [_format_citation_entry(e, source="offline_curated_catalog") for _, e in scored[:3]]
            return ToolResult(
                classification="actual",
                evidence_refs=[f"doi:{c['doi']}" for c in top],
                data={
                    "verified": True,
                    "query": clean_q,
                    "doi": top[0]["doi"],
                    "source": "offline_curated_catalog",
                    "citation": top[0],
                    "matches": top,
                    "receiptHash": fingerprint({"query": clean_q, "doi": top[0]["doi"]}),
                },
            )

    # 3. Live Crossref lookup ONLY when explicitly enabled
    live_allowed = (
        (enable_live is True)
        or (enable_live is None and os.environ.get("EVIX_ENABLE_LIVE_SCHOLAR_API") == "1")
    )
    if not live_allowed:
        return ToolResult(
            classification="actual",
            evidence_refs=[],
            data={
                "verified": False,
                "query": clean_q,
                "doi": clean_doi,
                "source": "offline_only_not_found",
                "citation": None,
                "matches": [],
                "reason": "not_in_verified_catalog_live_lookup_disabled",
            },
        )

    try:
        if clean_doi:
            url = f"https://api.crossref.org/works/{quote(clean_doi, safe='')}"
        elif clean_q:
            url = f"https://api.crossref.org/works?query={quote(clean_q)}&rows=3"
        else:
            return ToolResult(
                classification="actual",
                evidence_refs=[],
                data={
                    "verified": False,
                    "query": "",
                    "doi": "",
                    "source": "empty_query",
                    "citation": None,
                    "matches": [],
                    "reason": "query_or_doi_required",
                },
            )
        resp = httpx.get(
            url,
            headers={"Accept": "application/json", "User-Agent": "EVI-X/1.0 (academic-citation-verifier)"},
            follow_redirects=False,
            trust_env=False,
            timeout=6.0,
        )
        if resp.status_code != 200:
            return ToolResult(
                classification="actual",
                evidence_refs=[],
                data={
                    "verified": False,
                    "query": clean_q,
                    "doi": clean_doi,
                    "source": "crossref_live",
                    "citation": None,
                    "matches": [],
                    "reason": f"crossref_http_{resp.status_code}",
                },
            )
        payload = resp.json()
        msg = payload.get("message") if isinstance(payload, dict) else None
        parsed_list: list[dict[str, Any]] = []
        if clean_doi and isinstance(msg, dict):
            parsed = _parse_crossref_work(msg)
            if parsed:
                parsed_list.append(parsed)
        elif isinstance(msg, dict) and isinstance(msg.get("items"), list):
            for item in msg["items"][:3]:
                if isinstance(item, dict):
                    parsed = _parse_crossref_work(item)
                    if parsed:
                        parsed_list.append(parsed)
        if not parsed_list:
            return ToolResult(
                classification="actual",
                evidence_refs=[],
                data={
                    "verified": False,
                    "query": clean_q,
                    "doi": clean_doi,
                    "source": "crossref_live",
                    "citation": None,
                    "matches": [],
                    "reason": "crossref_no_match",
                },
            )
        return ToolResult(
            classification="actual",
            evidence_refs=[f"doi:{c['doi']}" for c in parsed_list],
            data={
                "verified": True,
                "query": clean_q,
                "doi": parsed_list[0]["doi"],
                "source": "crossref_live",
                "citation": parsed_list[0],
                "matches": parsed_list,
                "receiptHash": fingerprint({"doi": parsed_list[0]["doi"], "source": "crossref_live"}),
            },
        )
    except Exception:
        return ToolResult(
            classification="actual",
            evidence_refs=[],
            data={
                "verified": False,
                "query": clean_q,
                "doi": clean_doi,
                "source": "crossref_live",
                "citation": None,
                "matches": [],
                "reason": "live_lookup_failed",
            },
        )
