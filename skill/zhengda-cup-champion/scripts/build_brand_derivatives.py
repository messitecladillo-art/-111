#!/usr/bin/env python3
"""Build deterministic PNG icon derivatives from the approved EVI-X avatar."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path


DEFAULT_SIZES = (1024, 512, 400, 256, 128, 64, 32, 16)


def parse_sizes(value: str) -> tuple[int, ...]:
    try:
        sizes = tuple(sorted({int(part.strip()) for part in value.split(",")}, reverse=True))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("sizes must be comma-separated integers") from exc
    if not sizes or any(size < 16 or size > 4096 for size in sizes):
        raise argparse.ArgumentTypeError("each size must be between 16 and 4096 pixels")
    return sizes


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def output_name(size: int) -> str:
    if size == 1024:
        return "icon-large-1024.png"
    if size == 400:
        return "icon-small-400.png"
    return f"icon-{size}.png"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    skill_root = Path(__file__).resolve().parent.parent
    parser.add_argument(
        "--source",
        type=Path,
        default=skill_root / "assets" / "brand" / "raster" / "evi-x-avatar-v1.png",
        help="Approved square avatar source",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=skill_root / "assets" / "brand" / "ui",
        help="Directory for PNG derivatives",
    )
    parser.add_argument(
        "--sizes",
        type=parse_sizes,
        default=DEFAULT_SIZES,
        help="Comma-separated output sizes; defaults to 1024,512,400,256,128,64,32,16",
    )
    args = parser.parse_args()

    try:
        from PIL import Image
    except ImportError:
        print("ERROR: Pillow is required to build icon derivatives", file=sys.stderr)
        return 2

    source = args.source.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if not source.is_file():
        print(f"ERROR: source not found: {source}", file=sys.stderr)
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as raw:
        raw.load()
        if raw.width != raw.height:
            print(f"ERROR: source must be square, got {raw.width}x{raw.height}", file=sys.stderr)
            return 2
        image = raw.convert("RGBA")
        records: list[dict[str, object]] = []
        for size in args.sizes:
            resized = image.resize((size, size), Image.Resampling.LANCZOS)
            destination = output_dir / output_name(size)
            resized.save(destination, format="PNG", optimize=True)
            records.append(
                {
                    "path": destination.name,
                    "width": size,
                    "height": size,
                    "sha256": sha256(destination),
                }
            )

    index_path = output_dir / "derivatives.json"
    index_path.write_text(
        json.dumps(
            {
                "source": source.name,
                "method": "Pillow LANCZOS deterministic resize",
                "outputs": records,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"created": len(records), "index": str(index_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
