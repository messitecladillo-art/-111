"""Generate the fixed, hash-verified 7-skill survey corpus guidance bundle from repository source."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SKILLS_DIR = ROOT / "skill"
TARGET = ROOT / "apps/backend/src/multi_agent/assets/survey-corpus-skills.json"

SKILL_NAMES = (
    "survey-report-architect",
    "survey-topic-and-design-craft",
    "survey-questionnaire-architect",
    "survey-analysis-exhibit-weaver",
    "survey-prose-abstract-action-forger",
    "survey-visual-layout-typesetting",
    "survey-report-redteam-auditor",
)
RESOURCE_PATHS = tuple(f"{name}/SKILL.md" for name in SKILL_NAMES)

_EXPECTED_SUBFILES: dict[str, tuple[str, ...]] = {
    "survey-report-architect": (
        "references/structural-archetypes.md",
        "references/inter-chapter-bridges.md",
        "references/era-evolution-and-stats.md",
    ),
    "survey-topic-and-design-craft": (
        "references/title-and-tension-formulas.md",
        "references/exploratory-to-survey-bridge.md",
        "references/sampling-and-cleaning-protocols.md",
    ),
    "survey-questionnaire-architect": (
        "references/domain-construct-matrix.md",
        "references/item-types-and-anti-bias-guards.md",
    ),
    "survey-analysis-exhibit-weaver": (
        "references/analysis-ladder-and-reporting-contracts.md",
        "references/exhibit-selection-matrix.md",
        "references/three-line-tables-cookbook.md",
    ),
    "survey-prose-abstract-action-forger": (
        "references/abstract-five-step-blueprint.md",
        "references/deai-academic-prose-lexicon.md",
        "references/actionable-recommendations-patterns.md",
    ),
    "survey-visual-layout-typesetting": (
        "references/typography-and-page-geometry.md",
        "references/color-and-chart-aesthetics.md",
    ),
    "survey-report-redteam-auditor": (
        "references/method-and-logic-pitfalls.md",
        "references/compliance-and-ai-disclosure.md",
        "scripts/audit_report_draft.py",
    ),
}

_REF_LINK = re.compile(r"\[([^\]]+)\]\((?:references|scripts)/[^)]+\)")
_CLI_AUDIT_BLOCK = re.compile(r"```bash\s*\r?\npython scripts/audit_report_draft\.py[^\n]*\r?\n```")


def _assert_regular_clean(path: Path, label: str) -> str:
    if any(p.is_symlink() for p in (SKILLS_DIR, path.parent, path)) or not path.is_file():
        raise ValueError(f"Survey corpus skill asset must be a regular repository file: {label}")
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        raise ValueError(f"Survey corpus skill asset is empty: {label}")
    if "C:/Users/" in text or "C:\\Users\\" in text:
        raise ValueError(f"Local workstation path must not enter repository skill asset: {label}")
    return text


def _runtime_digest(skill_markdown: str) -> str:
    """Strip YAML frontmatter and relative-file link targets so runtime models never try to open disk paths."""
    body = skill_markdown.strip()
    if body.startswith("---\n") and "\n---\n" in body[4:]:
        body = body.split("\n---\n", 1)[1].strip()
    body = _CLI_AUDIT_BLOCK.sub("（交付前须经平台确定性规则审稿器与人工双重复核）", body)
    return _REF_LINK.sub(r"《\1》", body)


def package() -> dict:
    resources: dict[str, str] = {}
    for name in SKILL_NAMES:
        skill_dir = SKILLS_DIR / name
        skill_md = _assert_regular_clean(skill_dir / "SKILL.md", f"{name}/SKILL.md")
        resources[f"{name}/SKILL.md"] = _runtime_digest(skill_md)
        for sub in _EXPECTED_SUBFILES[name]:
            _assert_regular_clean(skill_dir / sub, f"{name}/{sub}")

    canonical = json.dumps(resources, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return {
        "schema": "SurveyCorpusSkills/v1",
        "skill": "survey-corpus-7pack",
        "version": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "resources": resources,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    bundle = package()
    expected = json.dumps(bundle, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not TARGET.is_file() or TARGET.read_text(encoding="utf-8") != expected:
            raise SystemExit("Survey corpus skills package is stale; run scripts/sync-survey-corpus-skills.py")
        print("Survey corpus skills match canonical 7-skill tree.")
    else:
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_text(expected, encoding="utf-8")
        print("Survey corpus skills package generated.")


if __name__ == "__main__":
    main()
