import json
import math
import re
from shared.contracts import object_fields, text
from shared.errors import ApiError

def questionnaire(value):
    fields = ("schema", "classification", "title", "objective", "population", "geography", "period", "recruitment", "introduction", "pilotNotes", "questions")
    d = object_fields(value, fields)
    if d["schema"] != "questionnaire-design/v1" or d["classification"] != "proposed":
        raise ApiError()
    for key in ("title", "population", "geography", "period"):
        text(d[key], 160)
    for key in ("objective", "recruitment"):
        text(d[key], 600)
    for key in ("introduction", "pilotNotes"):
        text(d[key], 2000)
    if not isinstance(d["questions"], list) or len(d["questions"]) > 80:
        raise ApiError()
    ids = set()
    for question in d["questions"]:
        q = object_fields(question, ("id", "variable", "text", "type", "required", "purpose", "researchQuestion", "construct", "analysis", "decisionUse", "source", "choices", "min", "max", "minLabel", "maxLabel", "reverse", "condition"))
        text(q["id"], 64, 1)
        if not re.fullmatch(r"[A-Za-z0-9_-]+", q["id"]) or q["id"] in ids:
            raise ApiError()
        ids.add(q["id"])
        for key, maximum in (("variable", 32), ("text", 600), ("researchQuestion", 500), ("decisionUse", 500), ("source", 500), ("construct", 120), ("minLabel", 120), ("maxLabel", 120)):
            text(q[key], maximum)
        if q["type"] not in ("single", "multi", "likert", "number", "text") or q["analysis"] not in ("undecided", "description", "comparison", "association", "measurement", "coding", "routing") or q["purpose"] not in ("research", "screening", "background"):
            raise ApiError()
        if type(q["required"]) is not bool or type(q["reverse"]) is not bool:
            raise ApiError()
        for key in ("min", "max"):
            v = q[key]
            if v is not None and (type(v) not in (int, float) or abs(v) > 1e9 or not math.isfinite(v)):
                raise ApiError()
        if not isinstance(q["choices"], list) or len(q["choices"]) > 30:
            raise ApiError()
        for choice in q["choices"]:
            c = object_fields(choice, ("code", "label"))
            text(c["code"], 16)
            text(c["label"], 160)
        if q["condition"] is not None:
            c = object_fields(q["condition"], ("questionId", "codes"))
            text(c["questionId"], 64)
            if not isinstance(c["codes"], list) or len(c["codes"]) > 30:
                raise ApiError()
            for code in c["codes"]:
                text(code, 16)
    if len(json.dumps(d, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")) > 300_000:
        raise ApiError(413, "design_too_large", "问卷超过300KB。")
    return d
