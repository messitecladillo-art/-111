"""Generate the fixed text-only title guidance package from repository source."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "skill/research-report-title"
TARGET = ROOT / "apps/backend/src/multi_agent/agents/research_agent/assets/research-title.json"
PUBLIC_VERSIONS = ROOT / "apps/frontend/content/topic-advisor/topic-agent-source-versions.json"
RESOURCE_PATHS = (
    "SKILL.md",
    "references/naming-patterns.md",
    "references/operating-modes.md",
    "references/runtime-profile.md",
)


def package():
    resources = {}
    for name in RESOURCE_PATHS:
        path = SOURCE / name
        if any(p.is_symlink() for p in (SOURCE, path.parent, path)) or not path.is_file():
            raise ValueError(f"Title Skill resource must be a regular repository file: {name}")
        resources[name] = path.read_text(encoding="utf-8")
    canonical = json.dumps(resources, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return {"schema": "ResearchTitleGuidance/v1", "skill": "research-report-title",
            "version": hashlib.sha256(canonical.encode("utf-8")).hexdigest(), "resources": resources}


def source_versions(version):
    # Reuse the existing validated topic/region derivation, rather than duplicating
    # its manifest and byte/hash checks. No browser receives the Skill resources.
    command = ["node", "--input-type=module", "-e",
               "import {loadTopicSourceVersions} from './apps/frontend/scripts/sync-topic-source-versions.mjs';"
               "process.stdout.write(JSON.stringify(await loadTopicSourceVersions()));"]
    result = subprocess.run(command, cwd=ROOT, check=True, capture_output=True, text=True,
                            encoding="utf-8", timeout=30)
    sys.path.insert(0, str(ROOT / "apps/backend/src"))
    loader = runpy.run_path(str(ROOT / "apps/backend/src/multi_agent/agents/research_agent/services/title_skill.py"))
    return loader["bind_title_skill_versions"](json.loads(result.stdout), version)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    guidance = package()
    expected = json.dumps(guidance, ensure_ascii=False, indent=2) + "\n"
    public = json.dumps(source_versions(guidance["version"]), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not TARGET.is_file() or TARGET.read_text(encoding="utf-8") != expected:
            raise SystemExit("Title guidance is stale; run scripts/sync-research-title-skill.py")
        if not PUBLIC_VERSIONS.is_file() or PUBLIC_VERSIONS.read_text(encoding="utf-8") != public:
            raise SystemExit("Topic Agent title source-version binding is stale; run scripts/sync-research-title-skill.py")
    else:
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_text(expected, encoding="utf-8")
        PUBLIC_VERSIONS.write_text(public, encoding="utf-8")
    print("Title guidance matches canonical Skill." if args.check else "Title guidance generated.")


if __name__ == "__main__":
    main()
