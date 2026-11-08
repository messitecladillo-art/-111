"""Fixed, version-checked title guidance; never resolve a model-supplied path."""
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import re

from shared.contracts import canonical, fingerprint, strict_json

PACKAGE_PATH = Path(__file__).resolve().parents[1] / "assets/research-title.json"
RESOURCE_PATHS = (
    "SKILL.md",
    "references/naming-patterns.md",
    "references/operating-modes.md",
    "references/runtime-profile.md",
)
MAX_PACKAGE_BYTES = 32768


def bind_title_skill_versions(source_versions, version):
    """Keep the existing wire shape, with a TopicAgent-only prompt digest."""
    if not isinstance(version, str) or not re.fullmatch(r"[a-f0-9]{64}", version):
        raise ValueError("Invalid title guidance version")
    return {**source_versions, "topicDigest": fingerprint({"topicDigest": source_versions["topicDigest"], "titleSkill": version})}


@dataclass(frozen=True)
class TitleSkill:
    version: str
    resources: tuple[tuple[str, str], ...]

    def prompt(self):
        # Scope/naming rules are always relevant to a returned topic title.
        # Case-pattern reference remains packaged but is not loaded by default.
        texts = dict(self.resources)
        selected = ("SKILL.md", "references/operating-modes.md", "references/runtime-profile.md")
        return (f"命名规范 research-report-title@{self.version}：\n"
                + "\n\n".join(texts[name] for name in selected)
                + "\n命名规范仅调整给定候选的表达与范围，不改变本轮意图、候选ID、来源或下方JSON响应契约。")


def load_title_skill():
    """Load only the shipped package and reject malformed or drifted guidance."""
    raw = PACKAGE_PATH.read_bytes()
    if len(raw) > MAX_PACKAGE_BYTES:
        raise ValueError("Title guidance package exceeds its fixed text budget")
    value = strict_json(raw.decode("utf-8"))
    if (not isinstance(value, dict) or set(value) != {"schema", "skill", "version", "resources"}
            or value["schema"] != "ResearchTitleGuidance/v1" or value["skill"] != "research-report-title"):
        raise ValueError("Invalid title guidance package")
    resources = value["resources"]
    if (not isinstance(resources, dict) or set(resources) != set(RESOURCE_PATHS)
            or any(not isinstance(text, str) or not text.strip() for text in resources.values())):
        raise ValueError("Invalid title guidance resources")
    version = value["version"]
    if not isinstance(version, str) or not re.fullmatch(r"[a-f0-9]{64}", version) or fingerprint(resources) != version:
        raise ValueError("Title guidance content hash mismatch")
    # Ensure the same serialization contract as the generator, including Unicode.
    canonical(resources).encode("utf-8")
    return TitleSkill(version=version, resources=tuple((name, resources[name]) for name in RESOURCE_PATHS))


@lru_cache(maxsize=1)
def active_title_skill():
    """Pin one immutable package for prompt/receipt consistency in this process.

    Deploy regenerated resources with a process restart, like the source corpus.
    A disk change during a model call must not rebind its receipt to new guidance.
    """
    return load_title_skill()
