#!/usr/bin/env python3
"""Validate the EVI-X brand manifest, assets, hashes, dimensions, and usage modes."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any
from xml.etree import ElementTree
from collections import Counter


REQUIRED_ROLES = {
    "character_master",
    "hero",
    "sticker_pack",
    "avatar",
    "ui_icon_small",
    "ui_icon_large",
    "logo_mark",
    "logo_lockup",
    "merchandise_concept",
}
ALLOWED_MODES = {"agent_ui", "public_promo", "competition_submission"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def raster_size(path: Path) -> tuple[int, int]:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required to validate raster assets") from exc
    with Image.open(path) as image:
        image.verify()
        return image.size


def svg_is_valid(path: Path) -> bool:
    root = ElementTree.parse(path).getroot()
    return root.tag.endswith("svg") and bool(root.attrib.get("viewBox"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    skill_root = Path(__file__).resolve().parent.parent
    parser.add_argument(
        "--manifest",
        type=Path,
        default=skill_root / "assets" / "brand" / "brand-manifest.json",
    )
    parser.add_argument("--json-out", type=Path, help="Optional machine-readable audit output")
    args = parser.parse_args()

    manifest_path = args.manifest.expanduser().resolve()
    if not manifest_path.is_file():
        print(f"ERROR: manifest not found: {manifest_path}", file=sys.stderr)
        return 2
    brand_root = manifest_path.parent
    try:
        manifest: dict[str, Any] = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: invalid manifest: {exc}", file=sys.stderr)
        return 2

    errors: list[str] = []
    warnings: list[str] = []
    assets = manifest.get("assets")
    if not isinstance(assets, list):
        print("ERROR: manifest.assets must be a list", file=sys.stderr)
        return 2

    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    roles: set[str] = set()
    role_counts: Counter[str] = Counter()
    source_references: list[tuple[str, str]] = []
    for index, item in enumerate(assets):
        if not isinstance(item, dict):
            errors.append(f"assets[{index}] must be an object")
            continue
        asset_id = str(item.get("id", "")).strip()
        relative = str(item.get("path", "")).strip()
        role = str(item.get("role", "")).strip()
        modes = item.get("usage_modes", [])
        if not asset_id or asset_id in seen_ids:
            errors.append(f"assets[{index}] has missing or duplicate id: {asset_id!r}")
        seen_ids.add(asset_id)
        if not relative or relative in seen_paths:
            errors.append(f"{asset_id or index}: missing or duplicate path: {relative!r}")
        seen_paths.add(relative)
        roles.add(role)
        role_counts[role] += 1
        if not isinstance(modes, list) or any(mode not in ALLOWED_MODES for mode in modes):
            errors.append(f"{asset_id}: invalid usage_modes")
        if item.get("brand_locked", True) and "competition_submission" in modes:
            errors.append(f"{asset_id}: branded asset cannot be competition_submission safe")
        review_status = str(item.get("review_status", "")).strip().lower()
        if (role.endswith("_deprecated") or review_status.startswith("rejected")) and modes:
            errors.append(f"{asset_id}: rejected or deprecated asset must have empty usage_modes")

        references: list[str] = []
        source_asset = item.get("source_asset")
        if isinstance(source_asset, str) and source_asset.strip():
            references.append(source_asset.strip())
        source_assets = item.get("source_assets")
        if isinstance(source_assets, list):
            references.extend(str(value).strip() for value in source_assets if str(value).strip())
        source_references.extend((asset_id, reference) for reference in references)

        path = (brand_root / relative).resolve()
        try:
            path.relative_to(brand_root.resolve())
        except ValueError:
            errors.append(f"{asset_id}: path escapes brand root")
            continue
        if not path.is_file():
            errors.append(f"{asset_id}: file not found: {relative}")
            continue

        expected_hash = str(item.get("sha256", "")).lower()
        actual_hash = sha256(path)
        if expected_hash != actual_hash:
            errors.append(f"{asset_id}: sha256 mismatch")

        suffix = path.suffix.lower()
        if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            try:
                width, height = raster_size(path)
            except Exception as exc:  # Pillow supplies format-specific failures.
                errors.append(f"{asset_id}: invalid raster: {exc}")
                continue
            expected_width = item.get("width")
            expected_height = item.get("height")
            if expected_width != width or expected_height != height:
                errors.append(
                    f"{asset_id}: dimension mismatch; expected {expected_width}x{expected_height}, got {width}x{height}"
                )
        elif suffix == ".svg":
            try:
                if not svg_is_valid(path):
                    errors.append(f"{asset_id}: SVG requires a valid viewBox")
            except ElementTree.ParseError as exc:
                errors.append(f"{asset_id}: invalid SVG XML: {exc}")
        else:
            warnings.append(f"{asset_id}: uninspected file type {suffix}")

        prompt_ref = str(item.get("prompt_ref", "")).strip()
        if item.get("generation_method") == "built_in_imagegen":
            if not prompt_ref:
                errors.append(f"{asset_id}: imagegen asset requires prompt_ref")
            elif not (brand_root / prompt_ref).is_file():
                errors.append(f"{asset_id}: prompt_ref not found: {prompt_ref}")
        if not item.get("alt_text"):
            errors.append(f"{asset_id}: alt_text is required")

    missing_roles = sorted(REQUIRED_ROLES - roles)
    if missing_roles:
        errors.append(f"missing required roles: {', '.join(missing_roles)}")
    duplicate_required_roles = sorted(role for role in REQUIRED_ROLES if role_counts[role] > 1)
    if duplicate_required_roles:
        errors.append(f"required roles must be unique: {', '.join(duplicate_required_roles)}")
    for asset_id, reference in source_references:
        if reference not in seen_ids:
            errors.append(f"{asset_id}: unknown source asset reference: {reference}")

    tracked_visuals = {
        path.relative_to(brand_root).as_posix()
        for path in brand_root.rglob("*")
        if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".svg"}
    }
    untracked_visuals = sorted(tracked_visuals - seen_paths)
    if untracked_visuals:
        errors.append(f"untracked visual assets: {', '.join(untracked_visuals)}")
    if not str(manifest.get("non_official_disclaimer", "")).strip():
        errors.append("non_official_disclaimer is required")

    report = {
        "manifest": str(manifest_path),
        "asset_count": len(assets),
        "errors": errors,
        "warnings": warnings,
        "passed": not errors,
    }
    output = json.dumps(report, ensure_ascii=False, indent=2)
    print(output)
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(output + "\n", encoding="utf-8")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
