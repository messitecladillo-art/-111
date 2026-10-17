"""Exercise physical/safety properties, not generated wording or template names."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
MODULE_SPEC = importlib.util.spec_from_file_location("frame_geometry", ROOT / "scripts/frame_geometry.py")
frame = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(frame)


def fixture(name="finance-body"):
    return json.loads((ROOT / "assets" / f"{name}.json").read_text(encoding="utf-8"))


class GeometryTests(unittest.TestCase):
    def test_two_topics_three_variants_all_layouts_keep_same_body(self):
        for theme in ("finance-body", "sports-body"):
            original = fixture(theme)
            expected = frame.validate_spec(original)["body"]
            self.assertAlmostEqual(expected["widthMm"], 146.4)
            self.assertAlmostEqual(expected["heightMm"], 246.2)
            for variant in ("body", "chapter", "cover"):
                for layout in ("none", "corners", "open", "closed"):
                    with self.subTest(theme=theme, variant=variant, layout=layout):
                        style = copy.deepcopy(original)
                        style.update(variant=variant, layout=layout)
                        built = frame.build_frame(style)
                        self.assertEqual(built["body"], expected)
                        self.assertEqual(built["validation"]["collisionCount"], 0)
                        self.assertEqual(built["primitives"] == [], layout == "none")
                        xml = ET.fromstring(built["svg"])
                        self.assertEqual(len(xml), len(built["primitives"]))

    def test_adjusted_a4_margins_recalculate_not_reuse_example(self):
        style = fixture()
        style["marginsMm"].update(left=25, right=22, top=22, bottom=24)
        style["cornerSizeMm"] = 8
        built = frame.build_frame(style)
        self.assertAlmostEqual(built["body"]["widthMm"], 163)
        self.assertAlmostEqual(built["body"]["heightMm"], 251)
        self.assertEqual(built["body"]["xMm"], 25)

    def test_landscape_paper_uses_same_coordinate_contract(self):
        style = fixture("sports-body")
        style["paper"].update(widthMm=297, heightMm=210)
        style["protectedAreas"] = [{"id": "footer", "kind": "footer", "xMm": 130, "yMm": 197, "widthMm": 37, "heightMm": 7}]
        self.assertAlmostEqual(frame.build_frame(style)["body"]["widthMm"], 233.4)

    def test_tight_margins_fail_instead_of_narrowing_body(self):
        style = fixture()
        style["marginsMm"]["top"] = 12
        before = copy.deepcopy(style)
        with self.assertRaisesRegex(frame.FrameError, "trim guard"):
            frame.build_frame(style)
        self.assertEqual(style, before)
        style["layout"] = "none"
        self.assertEqual(frame.build_frame(style)["body"]["yMm"], 12)

    def test_additional_header_exclusion_is_enforced(self):
        style = fixture()
        style["protectedAreas"].append({"id": "wide-header", "kind": "header", "xMm": 10, "yMm": 10, "widthMm": 190, "heightMm": 12})
        with self.assertRaisesRegex(frame.FrameError, "wide-header"):
            frame.build_frame(style)

    def test_footer_and_dense_page_guards_not_only_body_are_protected(self):
        style = fixture()
        style["protectedAreas"].append({"id": "table-footnote", "kind": "footnote", "xMm": 25, "yMm": 250, "widthMm": 6, "heightMm": 30})
        with self.assertRaisesRegex(frame.FrameError, "table-footnote"):
            frame.build_frame(style)

    def test_line_crossing_body_cannot_hide_between_safe_endpoints(self):
        style = fixture()
        diagonal = {"type": "line", "x1": 10, "y1": 10, "x2": 200, "y2": 287,
                    "stroke": style["palette"]["primary"], "fill": "none", "strokeWidthPt": 0.85, "opacity": 1}
        with self.assertRaisesRegex(frame.FrameError, "body-guard"):
            frame.validate_primitives([diagonal], style)

    def test_stroke_radius_counts_for_collision(self):
        style = fixture()
        line = {"type": "line", "x1": 28.7, "y1": 50, "x2": 28.7, "y2": 100,
                "stroke": style["palette"]["primary"], "fill": "none", "strokeWidthPt": 0.85, "opacity": 1}
        with self.assertRaisesRegex(frame.FrameError, "body-guard"):
            frame.validate_primitives([line], style)

    def test_closed_outline_is_not_mistaken_for_filled_body(self):
        style = fixture()
        outline = {"type": "rect", "x": 25, "y": 19, "width": 160, "height": 258, "rx": 0,
                   "stroke": style["palette"]["primary"], "fill": "none", "strokeWidthPt": 0.85, "opacity": 1}
        frame.validate_primitives([outline], style)
        outline["fill"] = style["palette"]["primary"]
        with self.assertRaisesRegex(frame.FrameError, "body-guard"):
            frame.validate_primitives([outline], style)

    def test_bound_palette_is_preserved(self):
        style = fixture()
        palette = {style["palette"][key] for key in ("primary", "secondary", "accent")}
        built = frame.build_frame(style)
        colours = {primitive["stroke"] for primitive in built["primitives"]}
        self.assertTrue(colours <= palette)
        changed = copy.deepcopy(built["primitives"])
        changed[0]["stroke"] = "#FF0000"
        with self.assertRaisesRegex(frame.FrameError, "bound project palette"):
            frame.validate_primitives(changed, style)

    def test_finite_and_bounded_primitives(self):
        style = fixture()
        built = frame.build_frame(style)
        for value in (float("nan"), float("inf"), True):
            changed = copy.deepcopy(built["primitives"])
            changed[0]["x1"] = value
            with self.subTest(value=value), self.assertRaises(frame.FrameError):
                frame.validate_primitives(changed, style)
        with self.assertRaises(frame.FrameError):
            frame.validate_primitives(built["primitives"] * 20, style)


class ReviewTests(unittest.TestCase):
    def test_json_integral_versions_have_one_cross_runtime_identity(self):
        style = fixture()
        expected = frame.definition_hash(style)
        style["version"] = float(style["version"])
        style["palette"]["version"] = float(style["palette"]["version"])
        self.assertEqual(frame.build_frame(style)["definitionSha256"], expected)
        for value in (True, 1.5, float("nan"), float("inf")):
            broken = copy.deepcopy(style)
            broken["version"] = value
            with self.subTest(value=value), self.assertRaises(frame.FrameError):
                frame.build_frame(broken)

    def test_extreme_supported_line_weights_survive_svg_round_trip(self):
        for width in (0.25, 2):
            for theme in ("finance-body", "sports-body"):
                style = fixture(theme)
                style["lineWidthPt"] = width
                built = frame.build_frame(style)
                self.assertEqual(frame.validate_svg(built["svg"], style)["collisionCount"], 0)

    def test_review_timestamp_requires_real_bounded_iso_time(self):
        style = fixture()
        style["status"] = "approved"
        style["review"] = {"decision": "approved", "reviewer": "synthetic-unit-test", "at": "2026-10-17T08:00:00Z", "definitionSha256": frame.definition_hash(style)}
        frame.build_frame(style, True)
        for invalid in ("2026-10-17", "2026-02-30T08:00:00Z", "2026-10-17T08:00:00", "2026-10-17T08:00:00.1234567Z"):
            style["review"]["at"] = invalid
            with self.subTest(invalid=invalid), self.assertRaisesRegex(frame.FrameError, "timestamp"):
                frame.build_frame(style, True)

    def test_shared_numeric_canonicalization(self):
        value = {"title": "中文页框", "integerFloat": 1.0, "small": 0.000001, "zero": -0.0}
        self.assertEqual(frame.canonical_json(value), '{"integerFloat":1,"small":0.000001,"title":"中文页框","zero":0}')
        with self.assertRaisesRegex(frame.FrameError, "six fractional"):
            frame.canonical_json({"tooPrecise": 0.0000001})

    def test_cross_runtime_interface_fixture_remains_reproducible(self):
        reference = json.loads((ROOT / "tests/fixtures/cross-runtime-parity.json").read_text(encoding="utf-8"))
        self.assertEqual(frame.canonical_json(reference["canonicalExample"]["input"]), reference["canonicalExample"]["canonical"])
        for example in reference["examples"]:
            with self.subTest(style=example["style"]["id"], variant=example["style"]["variant"]):
                result = frame.build_frame(example["style"])
                self.assertEqual(result["definitionSha256"], example["definitionSha256"])
                self.assertEqual(result["body"], example["body"])
                self.assertEqual(len(result["primitives"]), example["primitiveCount"])

    def test_draft_has_no_implicit_approval(self):
        style = fixture()
        with self.assertRaisesRegex(frame.FrameError, "explicit hash-bound approval"):
            frame.build_frame(style, require_approved=True)
        style["status"] = "concept"
        with self.assertRaisesRegex(frame.FrameError, "reconstructed"):
            frame.build_frame(style)

    def test_exact_version_review_survives_status_change_but_not_palette_change(self):
        style = fixture()
        digest = frame.definition_hash(style)
        # Explicitly synthetic reviewer is a unit-test record, not a production approval.
        style["status"] = "approved"
        style["review"] = {"decision": "approved", "reviewer": "synthetic-unit-test", "at": "2026-10-17T08:00:00+00:00", "definitionSha256": digest}
        self.assertEqual(frame.build_frame(style, True)["definitionSha256"], digest)
        style["palette"]["version"] = 2
        with self.assertRaisesRegex(frame.FrameError, "exact frame"):
            frame.build_frame(style, True)

    def test_wrong_approval_and_unknown_fields_are_rejected(self):
        style = fixture()
        style["review"] = {"decision": "approved"}
        with self.assertRaisesRegex(frame.FrameError, "must not carry"):
            frame.build_frame(style)
        style = fixture()
        style["uncontrolledSvg"] = "<image/>"
        with self.assertRaises(frame.FrameError):
            frame.build_frame(style)


class SvgSafetyTests(unittest.TestCase):
    def setUp(self):
        self.style = fixture()
        self.svg = frame.build_frame(self.style)["svg"]

    def test_rejects_raster_scripts_css_filters_foreign_objects_and_all_references(self):
        additions = [
            '<image href="data:image/png;base64,AAAA"/>', '<script>alert(1)</script>',
            '<foreignObject/>', '<style>line {stroke:red}</style>', '<filter id="f"/>',
            '<use href="#local"/>', '<a href="https://example.com"/>', '<path d="M0 0 L1 1"/>',
            '<g transform="translate(0,0)"/>', '<metadata>payload</metadata>',
            '<line x1="10" y1="10" x2="20" y2="20" onload="alert(1)"/>',
        ]
        for addition in additions:
            with self.subTest(addition=addition), self.assertRaises(frame.FrameError):
                frame.validate_svg(self.svg.replace("</svg>", addition + "</svg>"), self.style)

    def test_entities_and_processing_instructions_fail_before_xml_expansion(self):
        for prefix in ('<!DOCTYPE svg [<!ENTITY secret SYSTEM "file:///secret">]>', '<?xml-stylesheet href="file:///secret"?>'):
            with self.subTest(prefix=prefix), self.assertRaises(frame.FrameError):
                frame.validate_svg(prefix + self.svg, self.style)

    def test_moved_geometry_and_changed_page_dimensions_are_rejected(self):
        root = ET.fromstring(self.svg)
        root[0].set("x1", "100")
        root[0].set("y1", "100")
        with self.assertRaisesRegex(frame.FrameError, "protected area"):
            frame.validate_svg(ET.tostring(root, encoding="unicode"), self.style)
        with self.assertRaisesRegex(frame.FrameError, "dimensions differ"):
            frame.validate_svg(self.svg.replace('width="210mm"', 'width="211mm"'), self.style)

    def test_huge_or_nonfinite_numbers_are_rejected(self):
        for value in ("NaN", "1e309", "9999999999"):
            root = ET.fromstring(self.svg)
            root[0].set("x1", value)
            with self.subTest(value=value), self.assertRaises(frame.FrameError):
                frame.validate_svg(ET.tostring(root, encoding="unicode"), self.style)

    def test_svg_round_trip_is_deterministic(self):
        repeated = frame.build_frame(fixture())
        self.assertEqual(self.svg, repeated["svg"])
        self.assertEqual(frame.validate_svg(self.svg, self.style)["svgSha256"], repeated["validation"]["svgSha256"])


class CliTests(unittest.TestCase):
    def test_cli_non_destructive_and_read_back_validation(self):
        with tempfile.TemporaryDirectory(prefix="frame-skill-test-") as directory:
            out = Path(directory) / "draft-v1"
            command = [sys.executable, "-X", "utf8", str(ROOT / "scripts/frame_geometry.py"), "build", "--spec", str(ROOT / "assets/finance-body.json"), "--out-dir", str(out)]
            built = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(built.returncode, 0, built.stderr)
            receipt = json.loads(built.stdout)
            self.assertEqual(receipt["status"], "vector_draft")
            original = (out / "frame.svg").read_bytes()
            duplicate = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(duplicate.returncode, 2)
            self.assertEqual((out / "frame.svg").read_bytes(), original)
            validate = subprocess.run([sys.executable, str(ROOT / "scripts/frame_geometry.py"), "validate", "--spec", str(ROOT / "assets/finance-body.json"), "--svg", str(out / "frame.svg")], capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(validate.returncode, 0, validate.stderr)
            self.assertEqual(json.loads(validate.stdout)["collisionCount"], 0)

    def test_duplicate_json_keys_are_not_silently_reinterpreted(self):
        with tempfile.TemporaryDirectory(prefix="frame-skill-test-") as directory:
            source = Path(directory) / "duplicate.json"
            source.write_text('{"schema":"ReportFrameStyle/v1","schema":"unsafe"}', encoding="utf-8")
            run = subprocess.run([sys.executable, str(ROOT / "scripts/frame_geometry.py"), "build", "--spec", str(source), "--out-dir", str(Path(directory) / "out")], capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(run.returncode, 2)
            self.assertIn("duplicate JSON key", run.stderr)


if __name__ == "__main__":
    unittest.main()
