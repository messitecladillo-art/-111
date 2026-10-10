#!/usr/bin/env python3
"""Initialize a traceable Zhengda Cup project workspace."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import sys
import uuid
from pathlib import Path

from agent_runtime.io_utils import atomic_write_text, resolve_inside


DIRECTORIES = [
    "inputs/official",
    "inputs/literature",
    "inputs/enterprise",
    "research/qualitative",
    "research/instruments",
    "data/raw",
    "data/processed",
    "analysis/code",
    "analysis/outputs",
    "design/source",
    "design/exports",
    "evidence",
    "evidence/rule-sources",
    "deliverables/report",
    "deliverables/ppt",
    "deliverables/defense",
    "deliverables/visuals",
    "reviews",
    "reviews/evidence",
    "team",
]

TEMPLATE_MAP = {
    "project.yaml": "project.yaml",
    "project-brief.md": "project-brief.md",
    "research-design.md": "research/research-design.md",
    "report-outline.md": "deliverables/report/report-outline.md",
    "evidence-ledger.csv": "evidence/evidence-ledger.csv",
    "ai-use-ledger.csv": "evidence/ai-use-ledger.csv",
    "decision-log.md": "evidence/decision-log.md",
    "preflight-checklist.csv": "evidence/preflight-checklist.csv",
    "visual-brief.md": "design/visual-brief.md",
    "visual-tokens.json": "design/visual-tokens.json",
    "visual-asset-ledger.csv": "evidence/visual-asset-ledger.csv",
    "visual-preflight-checklist.csv": "evidence/visual-preflight-checklist.csv",
    "rules.json": "evidence/rules.json",
    "team-tasks.csv": "evidence/team-tasks.csv",
    "blockers.csv": "evidence/blockers.csv",
    "artifact-registry.csv": "evidence/artifact-registry.csv",
    "review-queue.csv": "evidence/review-queue.csv",
    "handoff-manifest.json": "reviews/handoff-manifest.json",
}


def render_template(source: Path, title: str, created: str, project_id: str) -> str:
    text = source.read_text(encoding="utf-8")
    text = text.replace("{{CREATED_DATE}}", created).replace("{{PROJECT_ID}}", project_id)
    if source.name == "project.yaml":
        try:
            import yaml
        except ImportError as exc:
            raise RuntimeError("PyYAML is required to initialize project.yaml") from exc
        payload = yaml.safe_load(text)
        payload["project"]["title"] = title
        text = yaml.safe_dump(payload, allow_unicode=True, sort_keys=False, width=1000)
    else:
        text = text.replace("{{TITLE}}", title)
    if source.suffix.lower() == ".json":
        json.loads(text)
    elif source.suffix.lower() == ".csv":
        fields = next(csv.reader(io.StringIO(text)), [])
        if not fields or len(fields) != len(set(fields)):
            raise RuntimeError(f"Invalid CSV template header: {source.name}")
    return text


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_directory", help="Directory to create or initialize")
    parser.add_argument("--title", required=True, help="Human-readable project title")
    parser.add_argument(
        "--allow-existing",
        action="store_true",
        help="Add only missing files to an existing directory",
    )
    args = parser.parse_args()

    title = " ".join(args.title.splitlines()).strip()
    if not title:
        print("ERROR: title must contain a non-whitespace character", file=sys.stderr)
        return 2
    supplied_target = Path(args.project_directory).expanduser().absolute()
    if supplied_target.exists():
        supplied_stat = supplied_target.lstat()
        if supplied_target.is_symlink() or getattr(supplied_stat, "st_file_attributes", 0) & 0x400:
            print(f"ERROR: project root cannot be a symlink or junction: {supplied_target}", file=sys.stderr)
            return 2
    target = supplied_target.resolve()
    templates = Path(__file__).resolve().parent.parent / "assets" / "templates"
    if not templates.is_dir():
        print(f"ERROR: template directory not found: {templates}", file=sys.stderr)
        return 2

    if target.exists() and any(target.iterdir()) and not args.allow_existing:
        print(
            "ERROR: target directory is not empty; use --allow-existing to add only missing files",
            file=sys.stderr,
        )
        return 2

    created = dt.date.today().isoformat()
    project_id = f"project-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S')}-{uuid.uuid4().hex[:8]}"
    target.mkdir(parents=True, exist_ok=True)

    rendered: dict[str, str] = {}
    try:
        for relative in DIRECTORIES:
            resolve_inside(target, relative)
        for template_name, destination_name in TEMPLATE_MAP.items():
            destination = resolve_inside(target, destination_name)
            if not destination.exists():
                rendered[destination_name] = render_template(templates / template_name, title, created, project_id)
    except Exception as exc:
        print(f"ERROR: initialization preflight failed: {exc}", file=sys.stderr)
        return 2

    for relative in DIRECTORIES:
        resolve_inside(target, relative).mkdir(parents=True, exist_ok=True)

    created_files: list[str] = []
    skipped_files: list[str] = []
    for template_name, destination_name in TEMPLATE_MAP.items():
        source = templates / template_name
        destination = resolve_inside(target, destination_name)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            skipped_files.append(destination_name)
            continue
        atomic_write_text(destination, rendered[destination_name])
        created_files.append(destination_name)

    print(f"Initialized: {target}")
    print(f"Created files: {len(created_files)}")
    for item in created_files:
        print(f"  + {item}")
    if skipped_files:
        print(f"Skipped existing files: {len(skipped_files)}")
        for item in skipped_files:
            print(f"  = {item}")
    try:
        from agent_runtime.core import bootstrap_project

        bootstrap_project(target)
    except Exception as exc:
        print(f"ERROR: control-plane bootstrap failed: {exc}", file=sys.stderr)
        return 2

    print("Control plane: .agent/state.json")
    print("Next: complete project.yaml, resolve visual.mode, and add scoped official rules to evidence/rules.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
