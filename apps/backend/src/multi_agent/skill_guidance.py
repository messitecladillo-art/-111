"""Fixed, hash-verified 7-skill survey corpus loader; never resolves model-supplied paths."""
from __future__ import annotations

from functools import lru_cache
from importlib.resources import files
import re

from multi_agent.agents.contracts import AgentRole
from shared.contracts import canonical, fingerprint, strict_json

RESOURCE_PATHS: tuple[str, ...] = (
    "survey-report-architect/SKILL.md",
    "survey-topic-and-design-craft/SKILL.md",
    "survey-questionnaire-architect/SKILL.md",
    "survey-analysis-exhibit-weaver/SKILL.md",
    "survey-prose-abstract-action-forger/SKILL.md",
    "survey-visual-layout-typesetting/SKILL.md",
    "survey-report-redteam-auditor/SKILL.md",
)
MAX_PACKAGE_BYTES = 65_536
_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")

ROLE_SKILL_MAP: dict[AgentRole, tuple[str, ...]] = {
    AgentRole.RESEARCH: (
        "survey-report-architect/SKILL.md",
        "survey-topic-and-design-craft/SKILL.md",
    ),
    AgentRole.SURVEY: (
        "survey-topic-and-design-craft/SKILL.md",
        "survey-questionnaire-architect/SKILL.md",
    ),
    AgentRole.DATA: (
        "survey-topic-and-design-craft/SKILL.md",
        "survey-analysis-exhibit-weaver/SKILL.md",
    ),
    AgentRole.WRITING: (
        "survey-report-architect/SKILL.md",
        "survey-analysis-exhibit-weaver/SKILL.md",
        "survey-prose-abstract-action-forger/SKILL.md",
        "survey-visual-layout-typesetting/SKILL.md",
    ),
    AgentRole.REVIEWER: (
        "survey-report-redteam-auditor/SKILL.md",
        "survey-visual-layout-typesetting/SKILL.md",
    ),
}


def load_corpus_skills() -> tuple[str, dict[str, str]]:
    """Load the shipped 7-skill corpus package and verify schema, allowlist and SHA-256 digest."""
    raw = files("multi_agent.assets").joinpath("survey-corpus-skills.json").read_bytes()
    if len(raw) > MAX_PACKAGE_BYTES:
        raise ValueError("Survey corpus skills package exceeds size budget")
    value = strict_json(raw.decode("utf-8"))
    if (
        not isinstance(value, dict)
        or set(value) != {"schema", "skill", "version", "resources"}
        or value["schema"] != "SurveyCorpusSkills/v1"
        or value["skill"] != "survey-corpus-7pack"
    ):
        raise ValueError("Invalid survey corpus skills package")
    resources = value["resources"]
    if (
        not isinstance(resources, dict)
        or set(resources) != set(RESOURCE_PATHS)
        or any(type(text) is not str or not text.strip() for text in resources.values())
    ):
        raise ValueError("Invalid survey corpus skills resources")
    version = value["version"]
    if type(version) is not str or not _SHA256_RE.fullmatch(version) or fingerprint(resources) != version:
        raise ValueError("Survey corpus skills content hash mismatch")
    canonical(resources).encode("utf-8")
    return version, {name: resources[name] for name in RESOURCE_PATHS}


@lru_cache(maxsize=1)
def active_corpus_skills() -> tuple[str, dict[str, str]]:
    """Pin one immutable 7-skill corpus package per process for deterministic instruction hashes."""
    return load_corpus_skills()


def role_corpus_guidance(role: AgentRole | str) -> str:
    """Render the signed distilled competition skills owned by a specialist role."""
    selected = role if isinstance(role, AgentRole) else AgentRole(role)
    skill_keys = ROLE_SKILL_MAP[selected]
    version, resources = active_corpus_skills()
    blocks = [resources[key] for key in skill_keys]
    return (
        f"<corpus-skill-guidance package=\"survey-corpus-7pack@{version[:12]}\">\n"
        "以下为全量 205 篇全国大学生市场调查与分析大赛获奖语料与第 17 届赛事规程蒸馏规范（仅作写作、设计与质检准则，"
        "绝不据此编造未提供的样本、统计数字、分析结果、文献或调研过程；输出正文与结论须采用连贯学术句式，"
        "严禁输出方头括号、直角引号、非数学花括号、词典冒号起句或底层工程术语）。\n\n"
        + "\n\n---\n\n".join(blocks)
        + "\n</corpus-skill-guidance>"
    )
