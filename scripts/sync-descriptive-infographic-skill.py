"""Build the Writing Agent's read-only text package from the canonical Skill."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "skill/research-descriptive-infographics"
TARGET = ROOT / "apps/backend/src/multi_agent/agents/writing_agent/assets/descriptive-infographics.json"
IMAGE = SOURCE / "assets/respondent-profile-concept.png"
PUBLIC_IMAGE = ROOT / "apps/frontend/public/research-visuals/respondent-profile-concept.png"


def package():
    paths = [SOURCE / "SKILL.md", *sorted((SOURCE / "references").glob("*.md"))]
    resources = {str(p.relative_to(SOURCE)).replace("\\", "/"): p.read_text(encoding="utf-8") for p in paths}
    canonical = json.dumps(resources, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return {"schema": "WritingVisualGuidance/v1", "skill": "research-descriptive-infographics",
            "version": hashlib.sha256(canonical.encode()).hexdigest(), "resources": resources}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = json.dumps(package(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not TARGET.is_file() or TARGET.read_text(encoding="utf-8") != text:
            raise SystemExit("Writing visual guidance is stale; run scripts/sync-descriptive-infographic-skill.py")
        if not PUBLIC_IMAGE.is_file() or hashlib.sha256(PUBLIC_IMAGE.read_bytes()).digest() != hashlib.sha256(IMAGE.read_bytes()).digest():
            raise SystemExit("Public infographic example differs from its canonical approved asset")
    else:
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_text(text, encoding="utf-8")
        PUBLIC_IMAGE.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(IMAGE, PUBLIC_IMAGE)
    print("Writing visual guidance matches canonical Skill." if args.check else "Writing visual guidance generated.")


if __name__ == "__main__":
    main()
