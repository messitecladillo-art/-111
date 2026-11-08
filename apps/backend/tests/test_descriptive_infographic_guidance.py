import importlib.util
import hashlib
import json
from pathlib import Path

from multi_agent.agents.writing_agent.tools import build_tools


def test_deployed_guidance_tool_is_read_only_and_matches_canonical_source():
    root = Path(__file__).resolve().parents[3]
    spec = importlib.util.spec_from_file_location("guidance_generator", root / "scripts/sync-descriptive-infographic-skill.py")
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)
    result = build_tools()["load_descriptive_infographic_guidance"]()
    assert result.data == generator.package()
    assert set(result.data["resources"]) == {"SKILL.md", "references/design-decisions.md", "references/reference-analysis.md", "references/imagegen-prompt-template.md"}
    assert "load_descriptive_infographic_guidance" in build_tools()


def test_example_is_the_recorded_generated_asset_and_public_copy_matches():
    root = Path(__file__).resolve().parents[3]
    assets = root / "skill/research-descriptive-infographics/assets"
    source = (assets / "respondent-profile-concept.png").read_bytes()
    recorded = json.loads((assets / "provenance.json").read_text(encoding="utf-8"))
    assert hashlib.sha256(source).hexdigest() == recorded["sha256"]
    assert source == (root / "apps/frontend/public/research-visuals/respondent-profile-concept.png").read_bytes()
    assert recorded["dataClassification"] == "simulated"
    assert source.startswith(b"\x89PNG\r\n\x1a\n")
