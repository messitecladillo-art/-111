from __future__ import annotations

import copy
import dataclasses
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock


BRIDGE_DIR = Path(__file__).resolve().parents[1]
APP_ROOT = BRIDGE_DIR.parent
WORKSPACE_ROOT = APP_ROOT.parents[1]
AGENTCTL_PATH = WORKSPACE_ROOT / "skill" / "zhengda-cup-champion" / "scripts" / "agentctl.py"
sys.path.insert(0, str(BRIDGE_DIR))

import agentctl_read_bridge as bridge  # noqa: E402


class BridgeIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp = tempfile.TemporaryDirectory(prefix="evi-x-bridge-simulated-")
        cls.temp_root = Path(cls.temp.name)
        cls.projects_root = cls.temp_root / "projects"
        cls.project = cls.projects_root / "simulated-project"
        cls.projects_root.mkdir(parents=True)
        completed = subprocess.run(
            [
                sys.executable,
                "-B",
                "-X",
                "utf8",
                str(AGENTCTL_PATH),
                str(cls.project),
                "bootstrap",
                "--title",
                "SIMULATED bridge regression fixture",
            ],
            cwd=str(AGENTCTL_PATH.parent),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=False,
        )
        if completed.returncode != 0:
            raise RuntimeError("simulated bootstrap failed\n" + completed.stdout + "\n" + completed.stderr)
        cls.config_path = cls.temp_root / "bridge.config.json"
        cls.config_path.write_text(
            json.dumps(
                {
                    "schemaVersion": bridge.SCHEMA_VERSION,
                    "projectsRoot": str(cls.projects_root),
                    "projects": {"simulated": "simulated-project"},
                    "allowedOrigins": ["http://localhost:3001"],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        cls.config = bridge.BridgeConfig.load(cls.config_path, agentctl_path=AGENTCTL_PATH)
        cls.runner = bridge.AgentctlRunner(cls.config)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temp.cleanup()

    def test_real_snapshot_is_coherent_read_only_and_redacted(self) -> None:
        before = tree_fingerprint(self.project)
        snapshot = bridge.build_snapshot(self.config, self.runner, "simulated")
        after = tree_fingerprint(self.project)

        self.assertEqual(before, after)
        self.assertEqual(snapshot["schemaVersion"], "1.0.0")
        self.assertEqual(snapshot["authority"], "agentctl_read_only")
        self.assertTrue(snapshot["readOnly"])
        self.assertTrue(snapshot["consistent"])
        self.assertEqual(snapshot["status"]["controlStatus"], "intake")
        self.assertEqual(snapshot["status"]["statusRevision"], 0)
        self.assertEqual(list(snapshot["status"]["gates"]), list(bridge.GATE_NAMES))
        self.assertTrue(all(value == "not_run" for value in snapshot["status"]["gates"].values()))
        self.assertEqual(snapshot["nextAction"]["action"], "advance")
        self.assertIn("完整校验", snapshot["nextAction"]["definitionOfDone"])
        self.assertNotIn("已就绪", snapshot["nextAction"]["definitionOfDone"])
        self.assertTrue(snapshot["doctor"]["healthy"])
        self.assertEqual(snapshot["doctor"]["exitCode"], 0)
        serialized = json.dumps(snapshot, ensure_ascii=False)
        self.assertNotIn(str(self.project), serialized)
        self.assertNotIn("agentctl.py", serialized)
        self.assertNotIn("run-read", serialized)
        self.assertNotIn("stream_sha256", serialized)
        self.assertNotIn('"command"', serialized)
        self.assertNotIn('"sha256"', serialized.lower())

    def test_runner_rejects_every_non_read_action_before_spawn(self) -> None:
        for action in ("audit", "advance", "bootstrap", "handoff", "resume", "gate", "task"):
            with self.subTest(action=action):
                with self.assertRaises(bridge.BridgeError) as raised:
                    self.runner.invoke("simulated", action)
                self.assertEqual(raised.exception.code, "action_forbidden")

    def test_state_revision_mismatch_fails_closed_after_one_retry(self) -> None:
        source = {
            command: self.runner.invoke("simulated", command)
            for command in bridge.READ_COMMANDS
        }

        class MismatchRunner:
            def invoke(self, alias: str, command: str) -> bridge.CliResult:
                del alias
                item = source[command]
                payload = copy.deepcopy(item.payload)
                if command == "next":
                    payload["status_revision"] += 1
                return bridge.CliResult(command, item.return_code, item.stdout_bytes, payload)

        with self.assertRaises(bridge.BridgeError) as raised:
            bridge.build_snapshot(self.config, MismatchRunner(), "simulated")
        self.assertEqual(raised.exception.status, 409)
        self.assertEqual(raised.exception.code, "state_changed_during_read")

    def test_cross_field_contradictions_and_missing_doctor_checks_fail_closed(self) -> None:
        source = {
            command: self.runner.invoke("simulated", command)
            for command in bridge.READ_COMMANDS
        }

        mutations = {
            "transition_source": lambda payload: payload["next_transition"].__setitem__("from", "rule_lock"),
            "advance_target": lambda payload: payload["recommended"].__setitem__("to", "problem_framing"),
            "blocking_gate": lambda payload: payload.__setitem__("blocking_gates", ["rule"]),
            "missing_doctor_check": lambda payload: payload["checks"].pop(),
            "unknown_blocker_severity": lambda payload: payload.__setitem__("unresolved_blockers", [{"severity": "mystery"}]),
        }
        for case, mutate in mutations.items():
            with self.subTest(case=case):
                class ContradictoryRunner:
                    def invoke(inner_self, alias: str, command: str) -> bridge.CliResult:
                        del inner_self, alias
                        item = source[command]
                        payload = copy.deepcopy(item.payload)
                        if (case == "advance_target" and command == "next") \
                                or (case == "missing_doctor_check" and command == "doctor") \
                                or (case in {"transition_source", "blocking_gate", "unknown_blocker_severity"} and command == "status"):
                            mutate(payload)
                        return bridge.CliResult(command, item.return_code, item.stdout_bytes, payload)

                with self.assertRaises(bridge.BridgeError) as raised:
                    bridge.build_snapshot(self.config, ContradictoryRunner(), "simulated")
                self.assertEqual(raised.exception.status, 502)
                self.assertEqual(raised.exception.code, "runner_contract_mismatch")

    def test_runtime_contract_drift_fails_closed(self) -> None:
        changed = dataclasses.replace(
            self.config.runtime_contract,
            workflow_sha256="f" * 64,
        )
        with mock.patch.object(bridge, "_load_runtime_contract", return_value=changed):
            with self.assertRaises(bridge.BridgeError) as raised:
                bridge.build_snapshot(self.config, self.runner, "simulated")
        self.assertEqual(raised.exception.status, 409)
        self.assertEqual(raised.exception.code, "runtime_contract_changed")

    def test_expired_snapshot_deadline_stops_tree_and_hash_work(self) -> None:
        expired = time.monotonic() - 1
        for operation in (
            lambda: self.config.resolve_project("simulated", deadline=expired),
            lambda: bridge._project_anchor(self.project, deadline=expired),
            lambda: bridge._sha256_file(self.project / "project.yaml", deadline=expired),
        ):
            with self.subTest(operation=operation):
                with self.assertRaises(bridge.BridgeError) as raised:
                    operation()
                self.assertEqual(raised.exception.status, 504)
                self.assertEqual(raised.exception.code, "snapshot_timeout")

    def test_nonzero_read_failure_is_redacted_and_fails_closed(self) -> None:
        source = {
            command: self.runner.invoke("simulated", command)
            for command in bridge.READ_COMMANDS
        }
        marker = "PRIVATE_FAILURE_CODE_C:/secret"

        class FailedStatusRunner:
            def invoke(self, alias: str, command: str) -> bridge.CliResult:
                del alias
                item = source[command]
                payload = copy.deepcopy(item.payload)
                return_code = item.return_code
                if command == "status":
                    payload["exit_code"] = 5
                    payload["failure"] = {"code": marker}
                    return_code = 5
                return bridge.CliResult(command, return_code, item.stdout_bytes, payload)

        with self.assertRaises(bridge.BridgeError) as raised:
            bridge.build_snapshot(self.config, FailedStatusRunner(), "simulated")
        self.assertEqual(raised.exception.status, 409)
        self.assertEqual(raised.exception.code, "agentctl_state_conflict")
        self.assertNotIn(marker, json.dumps(raised.exception.details))

    def test_doctor_failure_remains_a_structured_health_result(self) -> None:
        source = {
            command: self.runner.invoke("simulated", command)
            for command in bridge.READ_COMMANDS
        }

        class UnhealthyRunner:
            def invoke(self, alias: str, command: str) -> bridge.CliResult:
                del alias
                item = source[command]
                payload = copy.deepcopy(item.payload)
                return_code = item.return_code
                if command == "doctor":
                    payload["healthy"] = False
                    payload["exit_code"] = 2
                    payload["failure"] = {
                        "code": "doctor_failed",
                        "class": "validation",
                        "message": "SENSITIVE INTERNAL DETAIL",
                        "retryable": False,
                        "details": {"path": "C:/private"},
                    }
                    payload["checks"][0]["passed"] = False
                    return_code = 2
                return bridge.CliResult(command, return_code, item.stdout_bytes, payload)

        snapshot = bridge.build_snapshot(self.config, UnhealthyRunner(), "simulated")
        self.assertFalse(snapshot["doctor"]["healthy"])
        self.assertEqual(snapshot["doctor"]["exitCode"], 2)
        self.assertIn("contracts", snapshot["doctor"]["failedChecks"])
        self.assertNotIn("SENSITIVE", json.dumps(snapshot))
        self.assertNotIn("C:/private", json.dumps(snapshot))

    def test_sensitive_rows_are_reduced_to_counts(self) -> None:
        source = {
            command: self.runner.invoke("simulated", command)
            for command in bridge.READ_COMMANDS
        }
        marker = "PRIVATE-NAME-private@example.com-C:/secret/raw.xlsx"

        class SensitiveRunner:
            def invoke(self, alias: str, command: str) -> bridge.CliResult:
                del alias
                item = source[command]
                payload = copy.deepcopy(item.payload)
                if command in {"status", "next"}:
                    payload["unresolved_blockers"] = [{"severity": "high", "title": marker}]
                    payload["unresolved_risks"] = {"fatal": [], "high": [marker], "medium": []}
                    payload["takeover_inventory"] = [{"file_path": marker, "sha256": "a" * 64}]
                    payload["materials_needed"] = [marker]
                return bridge.CliResult(command, item.return_code, item.stdout_bytes, payload)

        snapshot = bridge.build_snapshot(self.config, SensitiveRunner(), "simulated")
        serialized = json.dumps(snapshot, ensure_ascii=False)
        self.assertNotIn(marker, serialized)
        self.assertEqual(snapshot["status"]["blockerSummary"]["total"], 1)
        self.assertEqual(snapshot["status"]["riskSummary"]["total"], 1)
        self.assertEqual(snapshot["status"]["inventorySummary"]["total"], 1)
        self.assertTrue(snapshot["status"]["needsLocalMaterialReview"])

    def test_config_rejects_path_escape_absolute_mapping_and_cloud_origin(self) -> None:
        cases = [
            ({"escape": "../outside"}, ["http://localhost:3001"]),
            ({"absolute": str(self.project)}, ["http://localhost:3001"]),
            ({"simulated": "simulated-project"}, ["https://example.com"]),
        ]
        for index, (projects, origins) in enumerate(cases):
            with self.subTest(index=index):
                path = self.temp_root / f"invalid-{index}.json"
                path.write_text(
                    json.dumps(
                        {
                            "schemaVersion": bridge.SCHEMA_VERSION,
                            "projectsRoot": str(self.projects_root),
                            "projects": projects,
                            "allowedOrigins": origins,
                        }
                    ),
                    encoding="utf-8",
                )
                with self.assertRaises(bridge.BridgeError):
                    bridge.BridgeConfig.load(path, agentctl_path=AGENTCTL_PATH)

    def test_reparse_flag_is_rejected_before_resolution(self) -> None:
        real_lstat = os.lstat
        target = self.projects_root

        class ReparseStat:
            def __init__(self, wrapped: os.stat_result) -> None:
                self._wrapped = wrapped
                self.st_mode = wrapped.st_mode
                self.st_file_attributes = getattr(wrapped, "st_file_attributes", 0) | 0x400

            def __getattr__(self, name: str):
                return getattr(self._wrapped, name)

        def fake_lstat(path: str):
            result = real_lstat(path)
            if os.path.normcase(os.path.abspath(path)) == os.path.normcase(str(target)):
                return ReparseStat(result)
            return result

        with mock.patch.object(bridge.os, "lstat", side_effect=fake_lstat):
            with self.assertRaises(bridge.BridgeError) as raised:
                bridge._reject_reparse_chain(target)
        self.assertEqual(raised.exception.code, "reparse_point_forbidden")

    def test_subprocess_environment_drops_injection_variables(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "PYTHONPATH": "C:/attacker",
                "PYTHONSTARTUP": "C:/attacker/startup.py",
                "ZHENGDA_AGENT_FAULT_POINT": "after_event",
            },
            clear=False,
        ):
            environment = bridge._minimal_environment()
        self.assertNotIn("PYTHONPATH", environment)
        self.assertNotIn("PYTHONSTARTUP", environment)
        self.assertNotIn("ZHENGDA_AGENT_FAULT_POINT", environment)

    def test_output_limit_and_timeout_terminate_fake_runner(self) -> None:
        scripts = {
            "large": "import sys\nsys.stdout.write('x' * 600000)\n",
            "slow": "import time\ntime.sleep(2)\n",
        }
        for name, source in scripts.items():
            with self.subTest(name=name):
                fake = self.temp_root / f"fake-{name}.py"
                fake.write_text(source, encoding="utf-8")
                fake_config = copy.copy(self.config)
                object.__setattr__(fake_config, "agentctl_path", fake)
                timeout = 3.0 if name == "large" else 0.15
                runner = bridge.AgentctlRunner(fake_config, status_timeout=timeout, doctor_timeout=timeout)
                with self.assertRaises(bridge.BridgeError) as raised:
                    runner.invoke("simulated", "status")
                expected = "runner_output_too_large" if name == "large" else "runner_timeout"
                self.assertEqual(raised.exception.code, expected)

    def test_http_boundary_enforces_host_origin_token_alias_and_no_query(self) -> None:
        token = "evx_local_" + "a" * 43
        server = bridge.BridgeServer((bridge.BRIDGE_HOST, 0), self.config, token, self.runner)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        port = server.server_address[1]
        base = f"http://127.0.0.1:{port}"
        try:
            status, headers, body = http_json(
                base + "/v1/projects",
                origin="http://localhost:3001",
                token=token,
            )
            self.assertEqual(status, 200)
            self.assertEqual(body["projects"], [{"alias": "simulated"}])
            self.assertEqual(headers.get("Access-Control-Allow-Origin"), "http://localhost:3001")
            self.assertEqual(headers.get("Cache-Control"), "no-store")

            status, _, body = http_json(
                base + "/v1/projects/simulated/snapshot",
                origin="http://localhost:3001",
                token=token,
            )
            self.assertEqual(status, 200)
            self.assertEqual(body["authority"], "agentctl_read_only")

            status, headers, body = http_json(
                base + "/v1/projects",
                origin="http://localhost:3001",
                token="wrong",
            )
            self.assertEqual(status, 401)
            self.assertEqual(body["error"]["code"], "unauthorized")
            self.assertEqual(headers.get("Access-Control-Allow-Origin"), "http://localhost:3001")

            for path, origin, supplied_token, expected_status, expected_code in [
                ("/v1/projects", "http://evil.example", token, 403, "origin_forbidden"),
                ("/v1/projects?token=" + token, "http://localhost:3001", token, 400, "invalid_request"),
                ("/v1/projects/%2e%2e/snapshot", "http://localhost:3001", token, 404, "project_unavailable"),
                ("/v1/projects/simulated/advance", "http://localhost:3001", token, 404, "not_found"),
            ]:
                with self.subTest(path=path):
                    status, _, body = http_json(base + path, origin=origin, token=supplied_token)
                    self.assertEqual(status, expected_status)
                    self.assertEqual(body["error"]["code"], expected_code)

            request = urllib.request.Request(
                base + "/v1/projects",
                method="POST",
                data=b"{}",
                headers={
                    "Origin": "http://localhost:3001",
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json",
                },
            )
            with self.assertRaises(urllib.error.HTTPError) as raised:
                urllib.request.urlopen(request, timeout=5)
            self.assertEqual(raised.exception.code, 405)
            self.assertEqual(json.loads(raised.exception.read())["error"]["code"], "method_not_allowed")

            request = urllib.request.Request(
                base + "/v1/projects",
                method="GET",
                headers={
                    "Host": "attacker.example",
                    "Origin": "http://localhost:3001",
                    "Authorization": "Bearer " + token,
                },
            )
            with self.assertRaises(urllib.error.HTTPError) as raised:
                urllib.request.urlopen(request, timeout=5)
            self.assertEqual(raised.exception.code, 421)
            self.assertEqual(json.loads(raised.exception.read())["error"]["code"], "host_forbidden")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_private_network_preflight_is_rejected(self) -> None:
        token = "evx_local_" + "b" * 43
        server = bridge.BridgeServer((bridge.BRIDGE_HOST, 0), self.config, token, self.runner)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        port = server.server_address[1]
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/v1/projects",
            method="OPTIONS",
            headers={
                "Origin": "http://localhost:3001",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
                "Access-Control-Request-Private-Network": "true",
            },
        )
        try:
            with self.assertRaises(urllib.error.HTTPError) as raised:
                urllib.request.urlopen(request, timeout=5)
            self.assertEqual(raised.exception.code, 403)
            self.assertIsNone(raised.exception.headers.get("Access-Control-Allow-Private-Network"))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_normal_authorization_preflight_is_allowed_without_credentials(self) -> None:
        token = "evx_local_" + "c" * 43
        server = bridge.BridgeServer((bridge.BRIDGE_HOST, 0), self.config, token, self.runner)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        port = server.server_address[1]
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/v1/projects",
            method="OPTIONS",
            headers={
                "Origin": "http://localhost:3001",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization, accept",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                self.assertEqual(response.status, 204)
                self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:3001")
                self.assertEqual(response.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS")
                self.assertEqual(response.headers.get("Access-Control-Allow-Headers"), "Authorization, Accept")
                self.assertIsNone(response.headers.get("Access-Control-Allow-Credentials"))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


def tree_fingerprint(root: Path) -> list[tuple[str, int, str]]:
    result: list[tuple[str, int, str]] = []
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        data = path.read_bytes()
        result.append((path.relative_to(root).as_posix(), len(data), hashlib.sha256(data).hexdigest()))
    return result


def http_json(url: str, *, origin: str, token: str) -> tuple[int, MappingLike, dict]:
    request = urllib.request.Request(
        url,
        method="GET",
        headers={
            "Accept": "application/json",
            "Origin": origin,
            "Authorization": "Bearer " + token,
        },
    )
    try:
        response = urllib.request.urlopen(request, timeout=20)
    except urllib.error.HTTPError as error:
        return error.code, error.headers, json.loads(error.read().decode("utf-8"))
    with response:
        return response.status, response.headers, json.loads(response.read().decode("utf-8"))


MappingLike = object


if __name__ == "__main__":
    unittest.main(verbosity=2)
