"""Stdlib-only layout tests; fixtures are memory lists, never real old apps."""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

CHECKER = Path(__file__).resolve().parents[1] / "scripts/check-repo-layout.py"
SPEC = importlib.util.spec_from_file_location("repo_layout_guard", CHECKER)
guard = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = guard
SPEC.loader.exec_module(guard)


def fixture():
    root = {"workspaces": ["apps/frontend", "packages/evi-x-shared"], "scripts": {
        name + ":web": "npm run " + name + " --workspace evi-x-zhengda-champion-platform"
        for name in ["dev", "build", "typecheck"]}}
    frontend = {"name": "evi-x-zhengda-champion-platform", "scripts": {"dev": "next dev", "build": "next build", "typecheck": "tsc --noEmit"}}
    lock = {"packages": {"": {"workspaces": root["workspaces"]}, "apps/frontend": {}, "packages/evi-x-shared": {}, "node_modules/evi-x-zhengda-champion-platform": {"link": True, "resolved": "apps/frontend"}}}
    contents = {path: "" for path in guard.REQUIRED}
    contents.update({"package.json": json.dumps(root), "apps/frontend/package.json": json.dumps(frontend), "package-lock.json": json.dumps(lock), ".github/workflows/ci.yml": "jobs:\n  web:\n    defaults:\n      run:\n        working-directory: apps/frontend\n  api:\n    defaults:\n      run:\n        working-directory: apps/backend\n"})
    return set(contents), contents


class RepoLayoutTests(unittest.TestCase):
    def findings(self, change=None, extra=None):
        paths, contents = fixture()
        if change:
            change(paths, contents)
        if extra:
            paths.update(extra)
        return guard.check_snapshot(paths, contents.__getitem__)

    def assertCode(self, findings, code):
        self.assertIn(code, {item.code for item in findings}, findings)

    def test_current_memory_tree_passes_and_preserves_existing_package_name(self):
        self.assertEqual([], self.findings())

    def test_old_runtime_entries_fail_without_creating_old_directories(self):
        for path in ["apps/evi-x-platform/app/page.tsx", "apps/evi-x-api/src/evix_api/app.py", "apps/evi-x-api/pyproject.toml", "apps/evi-x-api/requirements.txt", "apps/evi-x-platform/public/logo.svg", "apps/EVI-X-API/src/app.py"]:
            with self.subTest(path=path):
                self.assertCode(self.findings(extra=[path]), "retired_app_runtime")

    def test_windows_separators_are_normalized(self):
        findings = guard.validate_paths([r"apps\evi-x-platform\app\page.tsx"])
        self.assertEqual(findings[0].path, "apps/evi-x-platform/app/page.tsx")

    def test_path_segments_not_substrings(self):
        paths = ["apps/evi-x-api-tools/app.py", "apps/frontend/lib/evi-x-api/client.ts", "packages/evi-x-platform/src/index.ts"]
        self.assertEqual([], guard.validate_paths(paths))

    def test_history_legacy_private_archives_and_generated_names_not_scanned(self):
        history = ["apps/frontend/legacy/apps/evi-x-platform/app/page.tsx", "docs/migrations/apps/evi-x-api/app.py", ".collab/old/apps/evi-x-api/src/app.py", "apps/evi-x-platform/README.md", "apps/evi-x-api/docs/old-layout.json", "apps/evi-x-platform/legacy/app/page.tsx", "node_modules/apps/evi-x-api/app.py", "apps/frontend/.next/apps/evi-x-api/app.py"]
        # read_text would raise KeyError if ignored/history entries were read.
        self.assertEqual([], self.findings(extra=history))

    def test_absolute_parent_and_control_paths_rejected(self):
        for value in ["C:\\old\\app.py", "/tmp/app.py", "apps/../old.py", "apps//old.py", "apps/./old.py", "apps/bad\nname.py"]:
            with self.subTest(path=value):
                self.assertCode(guard.validate_paths([value]), "invalid_path")

    def test_each_required_tracked_entry_is_required(self):
        for missing in guard.REQUIRED:
            with self.subTest(path=missing):
                self.assertCode(self.findings(lambda paths, data: paths.remove(missing)), "missing_entry")

    def test_missing_workspace_even_with_file_present_fails(self):
        def change(paths, contents):
            data = json.loads(contents["package.json"])
            data["workspaces"] = ["apps/evi-x-platform", "packages/evi-x-shared"]
            contents["package.json"] = json.dumps(data)
        self.assertCode(self.findings(change), "workspace_contract")

    def test_duplicate_or_extra_workspaces_fail(self):
        for workspaces in [["apps/frontend", "apps/frontend"], ["apps/frontend", "packages/evi-x-shared", "apps/other"]]:
            with self.subTest(workspaces=workspaces):
                def change(paths, contents):
                    data = json.loads(contents["package.json"])
                    data["workspaces"] = workspaces
                    contents["package.json"] = json.dumps(data)
                self.assertCode(self.findings(change), "workspace_contract")

    def test_delegation_supports_current_name_and_path_options(self):
        name = "evi-x-zhengda-champion-platform"
        for command in ["npm run dev --workspace " + name, "npm --workspace apps/frontend run dev", "npm run dev --workspace=apps/frontend", "npm.cmd run dev -w apps/frontend"]:
            self.assertTrue(guard.delegates(command, "dev", name), command)

    def test_fake_or_wrong_delegation_is_not_accepted(self):
        for command in ["echo 'npm run dev --workspace apps/frontend'", "npm run build --workspace apps/frontend", "npm run dev --workspace apps/other", "npm run dev --workspace apps/frontend && echo ok", "npm run dev", "npm run dev -w apps/frontend -w other", None]:
            self.assertFalse(guard.delegates(command, "dev", "evi-x-zhengda-champion-platform"), command)

    def test_wrong_root_delegate_and_missing_target_script_fail(self):
        def wrong(paths, contents):
            data = json.loads(contents["package.json"])
            data["scripts"]["dev:web"] = "npm run dev --workspace unrelated"
            contents["package.json"] = json.dumps(data)
        self.assertCode(self.findings(wrong), "web_delegate")
        def missing(paths, contents):
            data = json.loads(contents["apps/frontend/package.json"])
            del data["scripts"]["typecheck"]
            contents["apps/frontend/package.json"] = json.dumps(data)
        self.assertCode(self.findings(missing), "web_delegate")

    def test_old_path_in_frontend_script_fails(self):
        def change(paths, contents):
            data = json.loads(contents["apps/frontend/package.json"])
            data["scripts"]["start"] = "node ../../apps/evi-x-platform/server.js"
            contents["apps/frontend/package.json"] = json.dumps(data)
        self.assertCode(self.findings(change), "active_script_path")

    def test_local_file_dependency_rejects_retired_directory_not_package_name(self):
        def change(paths, contents):
            data = json.loads(contents["package.json"])
            data["dependencies"] = {"archived": "file:apps/evi-x-api"}
            contents["package.json"] = json.dumps(data)
        self.assertCode(self.findings(change), "local_dependency_path")
        self.assertFalse(guard.old_reference("evi-x-zhengda-champion-platform"))

    def test_relative_deployment_paths_are_checked_without_substring_matching(self):
        self.assertTrue(guard.old_reference("../evi-x-api/src"))
        self.assertTrue(guard.old_reference(r"..\evi-x-platform\server.js"))
        self.assertFalse(guard.old_reference("../evi-x-api-tools/src"))

    def test_invalid_frontend_name_returns_a_finding(self):
        def change(paths, contents):
            data = json.loads(contents["apps/frontend/package.json"])
            data["name"] = []
            contents["apps/frontend/package.json"] = json.dumps(data)
        self.assertCode(self.findings(change), "invalid_config")

    def test_lock_old_package_key_and_link_target_fail(self):
        for key, value in [("apps/evi-x-platform", {}), ("node_modules/old", {"link": True, "resolved": "apps/evi-x-api"}), ("node_modules/file-dep", {"resolved": "file:../apps/evi-x-api"})]:
            with self.subTest(key=key):
                def change(paths, contents):
                    lock = json.loads(contents["package-lock.json"])
                    lock["packages"][key] = value
                    contents["package-lock.json"] = json.dumps(lock)
                self.assertCode(self.findings(change), "lock_retired_path")

    def test_lock_missing_current_workspace_or_root_mismatch_fail(self):
        def missing(paths, contents):
            lock = json.loads(contents["package-lock.json"])
            del lock["packages"]["apps/frontend"]
            contents["package-lock.json"] = json.dumps(lock)
        self.assertCode(self.findings(missing), "lock_contract")
        def mismatch(paths, contents):
            lock = json.loads(contents["package-lock.json"])
            lock["packages"][""]["workspaces"] = []
            contents["package-lock.json"] = json.dumps(lock)
        self.assertCode(self.findings(mismatch), "lock_contract")

    def test_selected_active_configs_reject_old_paths(self):
        for name, source in [("apps/frontend/next.config.ts", "const tracingRoot = 'apps/evi-x-platform';"), ("apps/frontend/tsconfig.json", '{"paths":{"old":["apps/evi-x-api/src"]}}'), ("scripts/start-p0-api.ps1", r"Set-Location 'apps\evi-x-api'"), ("deploy/compose.dev.yaml", "build: apps/evi-x-platform"), ("apps/frontend/scripts/start-hosted.mjs", "const bundle = 'apps/evi-x-platform/server.js';"), ("apps/backend/pyproject.toml", 'packages = ["apps/evi-x-api/src"]')]:
            with self.subTest(path=name):
                def change(paths, contents):
                    paths.add(name)
                    contents[name] = source
                self.assertCode(self.findings(change), "active_config_path")

    def test_comments_and_archival_topic_script_do_not_fail(self):
        def change(paths, contents):
            contents["apps/frontend/next.config.ts"] = "// formerly apps/evi-x-platform\n/* apps/evi-x-api */\nconst url = 'https://example.test';"
            contents["apps/backend/pyproject.toml"] = "# replaced apps/evi-x-api\n"
            paths.add("apps/frontend/scripts/topic-evaluation.mjs")
            contents["apps/frontend/scripts/topic-evaluation.mjs"] = "const archivedPath = 'apps/evi-x-platform/';"
            contents[".github/workflows/ci.yml"] += "# migration from apps/evi-x-api\n"
        self.assertEqual([], self.findings(change))

    def test_ci_working_directory_checks_real_tracked_directories(self):
        def old(paths, contents):
            contents[".github/workflows/ci.yml"] = "working-directory: apps/evi-x-api\n"
        self.assertCode(self.findings(old), "active_config_path")
        def missing(paths, contents):
            contents[".github/workflows/ci.yml"] = "working-directory: apps/missing\n"
        self.assertCode(self.findings(missing), "ci_directory")
        def current(paths, contents):
            contents[".github/workflows/ci.yml"] = "working-directory: './apps/backend' # migration history\n"
        self.assertEqual([], self.findings(current))

    def test_malformed_json_reports_findings_not_tracebacks(self):
        for name in ["package.json", "apps/frontend/package.json", "package-lock.json"]:
            with self.subTest(path=name):
                self.assertCode(self.findings(lambda paths, contents: contents.__setitem__(name, "{")), "invalid_config")

    def test_bad_memory_paths_produce_nonzero_cli_status(self):
        failures = guard.validate_paths(["apps/evi-x-api/src/evix_api/app.py"])
        output = io.StringIO()
        with patch.object(guard, "check_repository", return_value=(1, failures)), redirect_stdout(output):
            self.assertEqual(1, guard.main(["--root", "."]))
        receipt = json.loads(output.getvalue())
        self.assertEqual("fail", receipt["status"])
        self.assertEqual("apps/evi-x-api/src/evix_api/app.py", receipt["findings"][0]["path"])

    @unittest.skipUnless(os.environ.get("EVIX_LAYOUT_TEST_ROOT"), "Set EVIX_LAYOUT_TEST_ROOT for the actual tracked checkout")
    def test_actual_checkout_and_cli_pass_without_mutating_sources(self):
        root = Path(os.environ["EVIX_LAYOUT_TEST_ROOT"])
        count, findings = guard.check_repository(root)
        self.assertGreater(count, 100)
        self.assertEqual([], findings)
        result = subprocess.run([sys.executable, str(CHECKER), "--root", str(root)], check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8", timeout=30)
        self.assertEqual(0, result.returncode, result.stderr + result.stdout)
        self.assertEqual("pass", json.loads(result.stdout)["status"])


if __name__ == "__main__":
    unittest.main()
