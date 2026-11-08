"""Fixed read-only guidance resource; no arbitrary path or network access."""
import hashlib
import json
from pathlib import Path


def descriptive_infographic_guidance():
    path = Path(__file__).resolve().parents[1] / "assets/descriptive-infographics.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    resources = data["resources"]
    canonical = json.dumps(resources, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    if data.get("schema") != "WritingVisualGuidance/v1" or data.get("version") != hashlib.sha256(canonical.encode()).hexdigest():
        raise ValueError("Visual guidance package integrity mismatch")
    return data
