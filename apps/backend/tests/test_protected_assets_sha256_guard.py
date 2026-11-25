"""Permanent byte-for-byte SHA-256 tamper & anti-addition/deletion guard for all 92 protected assets."""

from __future__ import annotations

import hashlib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

# 1. 26 frozen core source, model, evaluation & corpus-manifest files
FROZEN_26_CORE_SHA256: dict[str, str] = {
    "apps/backend/src/multi_agent/assets/survey-corpus-skills.json": "ea046fca7efcd475289bdc5ecfefe86d6038d2344a1e237ef685b5d327e1a14d",
    "apps/frontend/content/topic-advisor/catalog.json": "fc56061d01cd84ca1f84cec6bc048ed36d5e3e49620119c01747f93dd65decbc",
    "apps/frontend/content/topic-advisor/county-pack-01-candidates-v2.json": "59a23fad2595509df853ba7c8d6a8c9e7d649c0ef9ff8a646a600e21f9018689",
    "apps/frontend/content/topic-advisor/county-pack-01.json": "a7c99603bbeaabc0b65758a8fe9b8142b0d431c41836997494eb6f9e93c08d58",
    "apps/frontend/content/topic-advisor/hotspot-events.json": "2fa8c95c79eab6c9e26f49cbb55ff5358a0a848990197f100623af352a279bdf",
    "apps/frontend/content/topic-advisor/published-counties.json": "36f51ba3d6fb0e685a8a050ccde5245dfb602484d9d1500610bb2c0f8554a383",
    "apps/frontend/content/topic-advisor/ranker.json": "048412a3a0bf9188625635d6ad53e6ec4b1fe5303246f5dff40868a77cc12ac8",
    "apps/frontend/content/topic-advisor/regions.catalog.json": "db55266d7e1ca53cc75c6f7b83bfad03a216b950a2700441611660bf7a942595",
    "apps/frontend/content/topic-advisor/source-versions.json": "4df083cee5041fb1c035244d2e7c3a10a218d31393bfc53da27931b0e66f6525",
    "apps/frontend/content/topic-advisor/sources.json": "904b15899ac0f96796a214829297ddacf38a283ef83fe4653a7268f5c09961a7",
    "apps/frontend/content/topic-advisor/topic-agent-source-versions.json": "611859993138c2797e679fd63699fc830a5268edd2075a8409a86e9542913093",
    "apps/frontend/content/topic-advisor/train.json": "18f067e920f8a35a94d72ffafe09b5969d9f11808a6aa03c59e56fb82c454e1f",
    "apps/frontend/lib/agent/demo-study.ts": "69919274ca5bd14a5e03d1ee139e7a3c01fa07d85c659376f8d27bd5556433c6",
    "apps/frontend/lib/agent/draft.ts": "124b7f5c180ef11ad52f08a3160b122bb348adada9f7e52884c77c88616eb6df",
    "apps/frontend/lib/agent/local-gateway-policy.ts": "56fde61d43581a13dbe2f8ba914fd27ef0f10895fde8947877cf28a875ad69e2",
    "apps/frontend/lib/questionnaire.ts": "4509b89a302ea49e00e5be2d6c5ecf5bf8f4f42437d4082183babdeeedd1aed4",
    "apps/frontend/lib/repro-script.ts": "439a9f01f748d1dc7b3f579673fddc03f6e101a6a1b5f8f0fdf09029767a841e",
    "apps/frontend/lib/topic-advisor/core.ts": "c5833f2d20cd6bf4103cb3bb4c4ed624a566ca1ae65958df0808093d4f5e9ca3",
    "apps/frontend/lib/topic-advisor/geography.ts": "796d54c479450abcad7c0922d92dad151ce5da3dd723ab2f6e418a5863714acc",
    "apps/frontend/lib/topic-advisor/parse.ts": "10c56d741226be7242ddde48e330c28594596a29dc71b17b0df570055a18d916",
    "apps/frontend/lib/topic-advisor/regions.ts": "670e03c344f7ecc0386b1b9b08b8fd1865f0a6b41daa01835c9b6c3c39301122",
    "apps/frontend/lib/topic-advisor/training.ts": "fd66787b246cc71a0c7a6bb090adb30abf9be3440de7daf668b1fda5d2089927",
    "apps/frontend/lib/topic-advisor/types.ts": "434c7271c333c1b8def146f1b2dc08484d68fddab6b098fde499899a74a1554d",
    "apps/frontend/scripts/evaluate-topic-advisor.mjs": "d6c7ddf2f9e13ea3ac2d02733cd2725b75bf9da24441b382cf4e0cbd95f37db8",
    "apps/frontend/scripts/topic-evaluation.mjs": "9895f8f03c290b8e97d95998da86ad344bb72c893e9ec7ac55087fd9f017269b",
    "apps/frontend/scripts/train-topic-advisor.mjs": "b3a8a15b44ececa613d6418b89077938286c6b498c84b2bcf29c4da76582b094",
}

# 2. 14 cross-package shared contract & fixture files under packages/evi-x-shared/**
SHARED_14_PACKAGE_SHA256: dict[str, str] = {
    "packages/evi-x-shared/fixtures/topic-project-v1.json": "f36098e8e3b8640385d3ffcbf61c80ece61f99fd5bf88a13c75f28727cdd6433",
    "packages/evi-x-shared/fixtures/topic-project-v2.json": "33ea84d0f76a359107c89dcb95c31b3eac5d55d12571230d37e94d1606c7185b",
    "packages/evi-x-shared/fixtures/topic-questionnaire-transfer-v1.json": "a83d2d0da965cc137bd04653a2f8604ae6515e76230c73c8b5c484f00a2e15ab",
    "packages/evi-x-shared/fixtures/topic-region-v2.json": "caa24c3a3723192812ee452bfe92a9fef87e6b71be3444978e7831c2ae20edc8",
    "packages/evi-x-shared/fixtures/topic-transfer-hash-v1.json": "fedf1175f750ed5a35dbc8620041f8c6907de1bb9fafb9c5cdeb339d2b703cda",
    "packages/evi-x-shared/package.json": "11f8bfd0e799937c7ece263d7264b9e190aecb7711fe3f0ab38a67352128dcbe",
    "packages/evi-x-shared/src/api-types.ts": "8c111ff272cf98d18d98fcaff86b4e967a363850142b894c9d542daea8a88a86",
    "packages/evi-x-shared/src/index.ts": "fe3a511f9bad20929f7dfc1cf7b5331095dd26c53ad07fc3f95771a119a00098",
    "packages/evi-x-shared/src/questionnaire.ts": "4509b89a302ea49e00e5be2d6c5ecf5bf8f4f42437d4082183babdeeedd1aed4",
    "packages/evi-x-shared/src/topic-transfer.ts": "be50a8749d5b262e1660dc79b6b40fc6e5651d8f9e2c98335c3b4a9a9acb068f",
    "packages/evi-x-shared/tests/contracts.test.mjs": "d488a957b670027baa6cefc597cc9de4ca9b9a937f51f64198631bae7f0d6a89",
    "packages/evi-x-shared/tests/fixtures/legacy-questionnaire-goldens.json": "8cc4ad9fadd4341bab34765e03d55b9d3472c7e27190ea68ca310add72f1f47d",
    "packages/evi-x-shared/tests/native-model-services.test.mjs": "d2c1856c068d6e93a201ff937f9c6df9f0c82e60e73d920198cbacbddeff132f",
    "packages/evi-x-shared/tests/topic-transfer.test.mjs": "a07e350a066e3853fd990baf2bf37d2cd04399bf055fdc5bec7c69c3c34d94ce",
}

# 3. 52 hash-locked skill files across 10 protected skill directories
LOCKED_SKILL_DIRS: tuple[str, ...] = (
    "skill/research-descriptive-infographics",
    "skill/research-report-frame",
    "skill/research-report-title",
    "skill/survey-analysis-exhibit-weaver",
    "skill/survey-prose-abstract-action-forger",
    "skill/survey-questionnaire-architect",
    "skill/survey-report-architect",
    "skill/survey-report-redteam-auditor",
    "skill/survey-topic-and-design-craft",
    "skill/survey-visual-layout-typesetting",
)

LOCKED_52_SKILL_SHA256: dict[str, str] = {
    "skill/research-descriptive-infographics/SKILL.md": "16bcae365a04fd9cecab53e5cdd4321638336f85ea1e317e4c1ab2fe603ed16f",
    "skill/research-descriptive-infographics/assets/provenance.json": "c16863678320fae3201ec8aa57b1bcf37906d78aa0d0ca130b17395f7a91371f",
    "skill/research-descriptive-infographics/assets/respondent-profile-concept.png": "ff400022b80715db5cda78e950e0f5ac0839a2bdfa1b8c68cdc9a394bf9035c1",
    "skill/research-descriptive-infographics/references/design-decisions.md": "f72f5d0ef721bdde026335d3c5b49fac990c66d4855b2d8b12e0beaa435b6a05",
    "skill/research-descriptive-infographics/references/imagegen-prompt-template.md": "8290b8c5658dd28f01dcaba3a8e54aca4f021c0ba5fa8f4ae51af990e5547753",
    "skill/research-descriptive-infographics/references/reference-analysis.md": "3315673f9d0bee9daf9b9a3d47f15e91c0ca9a01f7b620de24e6c929a2877a92",
    "skill/research-report-frame/.gitignore": "14b32aabf4d8fd1eeaca2960fe6bc4d6968205e6179c5e2e2ca170820b4adbb7",
    "skill/research-report-frame/SKILL.md": "de5681bf602e1fccc804cc03d8c3ad345099bcb0e39ac01449bc24594d166eae",
    "skill/research-report-frame/agents/openai.yaml": "44ddf50d2459ed1e3be2472065b584a50f17da34f2239b32940976dbf04c8c34",
    "skill/research-report-frame/assets/concepts/blue-contour-v1.png": "3b7ccb6a29db93121e22b15d77dca3c6c8041e5069284998f7a2cb8da7948a74",
    "skill/research-report-frame/assets/concepts/blue-geometric-v1.png": "2f0ebfd5a8a63e5552d4aadcabb2459e362fb91141d6f4521b0459b8237d671f",
    "skill/research-report-frame/assets/concepts/green-contour-v1.png": "e01dcd19187d22b59d050494876d776ae158599c424bfec5f95d5b38b34ae0b8",
    "skill/research-report-frame/assets/concepts/green-geometric-v1.png": "a443f9f60d4f365ed82870e02c6863f8f5578eece2e53063cccf901acd02f8fa",
    "skill/research-report-frame/assets/concepts/provenance.json": "4ff2b108531cee3969c48897e72aa5d7b73d721a20a559b0314e0efb97f62e77",
    "skill/research-report-frame/assets/finance-body.json": "f9474c896203dd887676d3551e1b5da866c4a03babdc7ba23f58bc5a2c7826b3",
    "skill/research-report-frame/assets/sports-body.json": "550eb29a64fdc4ff016d7120c15f9264e8199197b54c3579fb1e5b68fdc293af",
    "skill/research-report-frame/references/acceptance.md": "2728c608e998157e9a128eaf133d320ff236b7fc367d2ca78086e8180c129459",
    "skill/research-report-frame/references/concept-prompts.md": "4a4cb1a0498234826ebfe93ced9e75fb9b20586b5d7acc73b81b284260bee3ba",
    "skill/research-report-frame/references/geometry-and-contract.md": "eff02b817aa3f8ec1cb4ce09b819b78f55af119021070b12ca28a7da47c08317",
    "skill/research-report-frame/scripts/frame_geometry.py": "33700893c185c1552e99f8f09b572304311b611fcbb71ad0eb33a8126aab9d25",
    "skill/research-report-frame/tests/fixtures/cross-runtime-parity.json": "7b9a6fab0d266e69b2391d9d553a72eb7effb2fe47f81d2a5590548529658fde",
    "skill/research-report-frame/tests/test_frame_geometry.py": "c1756ba6755118d7fa56b2da613f7a45b5cc63f879f6dd0becfc4a7632b7a88b",
    "skill/research-report-title/SKILL.md": "68f599c1e1efb6a8b7e3eb11132ee995827d6a7d037eb3bc521e5dc18c95c639",
    "skill/research-report-title/references/naming-patterns.md": "7f8cf89683219270a4d4fb0e3d14bddeb76661131deb30eece8f61324946bb82",
    "skill/research-report-title/references/operating-modes.md": "cdaf32b0a84b32932c5899a9316677fc9316c4f7990121ed46ff08361bc4a09e",
    "skill/research-report-title/references/runtime-profile.md": "611f80e6ab143c6944d887a8bd7b10327c503de3b1f677c24a83001c263681ae",
    "skill/survey-analysis-exhibit-weaver/SKILL.md": "bf8cb2255f73212f5ea07dd3260303640c85bc0b982cb49862565aeb819480a8",
    "skill/survey-analysis-exhibit-weaver/references/analysis-ladder-and-reporting-contracts.md": "527558368298cfb36ed68e9a174934ded816e91a998877233358c260ec343b65",
    "skill/survey-analysis-exhibit-weaver/references/exhibit-selection-matrix.md": "9ca57fc3a9bd0c21c5ec2cb7705ef3193edd04e68ab190ec44a313a683e678e0",
    "skill/survey-analysis-exhibit-weaver/references/three-line-tables-cookbook.md": "cff451f9ece52f2f4192e61736edd01ee26e76349815a64ac52a5ed8233b6c40",
    "skill/survey-prose-abstract-action-forger/SKILL.md": "fac058a995d6f769a16c1a4ac61173c0e2c3326995c2f5dcb85a4ab77bbda281",
    "skill/survey-prose-abstract-action-forger/references/abstract-five-step-blueprint.md": "ae83a4d61206c1d9d38c1b3be1707d8737deb573c8dc56224d338fb0d6640ef4",
    "skill/survey-prose-abstract-action-forger/references/actionable-recommendations-patterns.md": "a58d8e70c73dbbcb439e4c1f125e416be233449db2e383234dd47638ff47c73d",
    "skill/survey-prose-abstract-action-forger/references/deai-academic-prose-lexicon.md": "9716931ef556edca524cccc636215fcde550da5c45f6bd732ae5a1f119443e56",
    "skill/survey-questionnaire-architect/SKILL.md": "f5796e5cd6bca70e560dc120829264f6089403ddbcf6360a100938a9f69b8234",
    "skill/survey-questionnaire-architect/references/domain-construct-matrix.md": "46714ff1f72695eaf7407b29a6709ba2de5653dd28a395c784284fb6df488e65",
    "skill/survey-questionnaire-architect/references/item-types-and-anti-bias-guards.md": "4eb2af2aedcefee5eb50e6b7af460ba45ec3e193e3263cec29e9175dd949e852",
    "skill/survey-report-architect/SKILL.md": "574aa14ce634598ad7333aee2af7842e9452c9007799ef952f7f9c19c740316a",
    "skill/survey-report-architect/references/era-evolution-and-stats.md": "e425313cfb9cff71258b62eec44bc418d24ffb74b1b7e086ac191724fc4534b0",
    "skill/survey-report-architect/references/inter-chapter-bridges.md": "854f3ebf96b33c8f4d5aac38d1de85142554a86f4fbe33754449401d99a0e411",
    "skill/survey-report-architect/references/structural-archetypes.md": "771950d96e89de3feeb99a4e9615fa53ce850d90ece6baa1b56fab6674825cb1",
    "skill/survey-report-redteam-auditor/SKILL.md": "007a79abbdcbdd2ab7bd9832afe301f1f2c1a38df7641f7e99b54c4aff564b42",
    "skill/survey-report-redteam-auditor/references/compliance-and-ai-disclosure.md": "ad982f671c7de16d508cad094df3ab17570a8b29ae28975956cb80af7f185908",
    "skill/survey-report-redteam-auditor/references/method-and-logic-pitfalls.md": "0b473af0e2db0feb70e508aa9b6893933eb01ba27404d6aef4166dee8ff398f5",
    "skill/survey-report-redteam-auditor/scripts/audit_report_draft.py": "52589760c347fc7a9288720a605be3bbb95d83470ed664a480d5ab17c41cc2d8",
    "skill/survey-topic-and-design-craft/SKILL.md": "97d03eddc82f80f09b117e03a69f7ce32807a8ad8a21c7714ca2520678e5d0b5",
    "skill/survey-topic-and-design-craft/references/exploratory-to-survey-bridge.md": "d5a7d2d866de91eefa7207b90761b0b911f8e62f5626c054f8c712fc428856fc",
    "skill/survey-topic-and-design-craft/references/sampling-and-cleaning-protocols.md": "de91a0a7fe9cee0cefc4fb3c035220e6f3de96851ed109e9eca46c75ccbfe43a",
    "skill/survey-topic-and-design-craft/references/title-and-tension-formulas.md": "8f849da7899359b30866dec068850c45f4e260a1dd532a4de8b17fca04006c62",
    "skill/survey-visual-layout-typesetting/SKILL.md": "c8808e69c8bbc9a3028ecfe420bfb04b43f3a1644187091083b7cc4a5665e9ce",
    "skill/survey-visual-layout-typesetting/references/color-and-chart-aesthetics.md": "818963d18dbb7d4e98cbc4c12033eacf21811b92e7b0d19dc33078421d3d0ea1",
    "skill/survey-visual-layout-typesetting/references/typography-and-page-geometry.md": "8bc02fc69385068dcd0187685a58a6014d2808e1500bd4f1da3b188152af92bc",
}

ALL_92_PROTECTED_SHA256: dict[str, str] = {
    **FROZEN_26_CORE_SHA256,
    **SHARED_14_PACKAGE_SHA256,
    **LOCKED_52_SKILL_SHA256,
}


def verify_sha256_manifest(
    root: Path,
    manifest: dict[str, str],
    *,
    exhaustive_dirs: tuple[str, ...] = (),
) -> dict[str, list[str]]:
    """Verify exact SHA-256 hashes and optional directory-level file set parity (anti-addition/deletion)."""
    missing: list[str] = []
    drifted: list[str] = []
    unexpected: list[str] = []

    for rel_path, expected_sha in sorted(manifest.items()):
        target = root / rel_path
        if not target.is_file():
            missing.append(rel_path)
            continue
        actual_sha = hashlib.sha256(target.read_bytes()).hexdigest()
        if actual_sha != expected_sha:
            drifted.append(f"{rel_path} (expected {expected_sha[:12]}..., got {actual_sha[:12]}...)")

    manifest_keys = set(manifest)
    for rel_dir in exhaustive_dirs:
        dir_path = root / rel_dir
        if not dir_path.is_dir():
            missing.append(f"{rel_dir}/")
            continue
        disk_rels = {
            p.relative_to(root).as_posix()
            for p in dir_path.rglob("*")
            if p.is_file() and "node_modules" not in p.parts and "__pycache__" not in p.parts
        }
        expected_in_dir = {k for k in manifest_keys if k.startswith(rel_dir + "/")}
        for extra in sorted(disk_rels - expected_in_dir):
            unexpected.append(extra)

    return {"missing": missing, "drifted": drifted, "unexpected": unexpected}


def test_all_92_protected_assets_exact_counts_and_sha256_integrity():
    assert len(FROZEN_26_CORE_SHA256) == 26
    assert len(SHARED_14_PACKAGE_SHA256) == 14
    assert len(LOCKED_52_SKILL_SHA256) == 52
    assert len(ALL_92_PROTECTED_SHA256) == 92

    # Anti-addition / anti-deletion on content/topic-advisor/*.json (must stay exactly 11 JSON files)
    advisor_json_on_disk = {
        p.relative_to(REPO_ROOT).as_posix()
        for p in (REPO_ROOT / "apps/frontend/content/topic-advisor").glob("*.json")
        if p.is_file()
    }
    advisor_json_expected = {
        k for k in FROZEN_26_CORE_SHA256 if k.startswith("apps/frontend/content/topic-advisor/")
    }
    assert len(advisor_json_expected) == 11
    assert advisor_json_on_disk == advisor_json_expected

    # Cross-package questionnaire mirror invariant
    assert (
        FROZEN_26_CORE_SHA256["apps/frontend/lib/questionnaire.ts"]
        == SHARED_14_PACKAGE_SHA256["packages/evi-x-shared/src/questionnaire.ts"]
    )

    report = verify_sha256_manifest(
        REPO_ROOT,
        ALL_92_PROTECTED_SHA256,
        exhaustive_dirs=("packages/evi-x-shared", *LOCKED_SKILL_DIRS),
    )
    assert report == {"missing": [], "drifted": [], "unexpected": []}, (
        f"Protected asset SHA-256 or file-count violation detected: {report}"
    )


def test_verify_sha256_manifest_catches_tamper_deletion_and_unapproved_addition(tmp_path: Path):
    pkg = tmp_path / "packages" / "evi-x-shared"
    pkg.mkdir(parents=True)
    f_a = pkg / "a.json"
    f_b = pkg / "b.ts"
    f_a.write_bytes(b'{"v":1}\n')
    f_b.write_bytes(b"export const x = 1;\n")

    manifest = {
        "packages/evi-x-shared/a.json": hashlib.sha256(b'{"v":1}\n').hexdigest(),
        "packages/evi-x-shared/b.ts": hashlib.sha256(b"export const x = 1;\n").hexdigest(),
    }
    assert verify_sha256_manifest(tmp_path, manifest, exhaustive_dirs=("packages/evi-x-shared",)) == {
        "missing": [],
        "drifted": [],
        "unexpected": [],
    }

    # 1-byte tamper + unapproved extra file + deleted file
    f_a.write_bytes(b'{"v":2}\n')
    f_b.unlink()
    (pkg / "rogue.ts").write_bytes(b"// unapproved\n")

    res = verify_sha256_manifest(tmp_path, manifest, exhaustive_dirs=("packages/evi-x-shared",))
    assert res["missing"] == ["packages/evi-x-shared/b.ts"]
    assert len(res["drifted"]) == 1 and res["drifted"][0].startswith("packages/evi-x-shared/a.json")
    assert res["unexpected"] == ["packages/evi-x-shared/rogue.ts"]
