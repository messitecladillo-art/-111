"""Synthetic SAV semantics and real child-process lifecycle acceptance."""
import asyncio
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pyreadstat
import pytest

from evix_api import survey_import as sav


def synthetic_sav(tmp_path, frame, **kwargs):
    path = tmp_path / "synthetic-问卷.sav"
    pyreadstat.write_sav(frame, str(path), **kwargs)
    return path.read_bytes()


def assert_no_jobs(root):
    assert not list(root.glob("sav-*"))


@pytest.mark.asyncio
async def test_raw_codes_labels_missing_dates_and_private_cleanup(tmp_path):
    origin = datetime(1582, 10, 14)
    observed = datetime(2026, 10, 12, 11, 15, 30)
    frame = pd.DataFrame({
        "attitude": [1.0, 2.0, 99.0, float("nan")],
        "score": [8.5, 95.0, 97.0, 101.0],
        "text": ["中文", "NA", "", "正常"],
        "when": [observed, observed, observed, observed],
        "elapsed": [1.0, 61.5, 3600.0, 0.0],
    })
    content = synthetic_sav(
        tmp_path, frame, column_labels={"attitude": "评价", "score": "评价"},
        variable_value_labels={"attitude": {1: "相同标签", 2: "相同标签", 99: "拒答"}},
        missing_ranges={"attitude": [99], "score": [{"lo": 95, "hi": 99}, 101],
                        "text": ["NA"]},
        variable_measure={"attitude": "ordinal", "score": "scale", "text": "nominal"},
        variable_format={"when": "DATETIME20", "elapsed": "TIME8.2"},
    )
    root, receipts = tmp_path / "private", []
    result = await sav.parse_sav_bytes(content, temp_root=root, on_event=receipts.append)
    assert result["schema"] == "survey-import/sav-v1"
    assert result["parser"] == "pyreadstat/1.3.6"
    assert result["cleanup"] == {"completed": True, "reason": "temporary-upload"}
    assert result["rowCount"] == 4 and result["columnCount"] == 5
    assert result["rows"][0] == [1.0, 8.5, "中文", (observed - origin).total_seconds(), 1.0]
    assert result["rows"][1][:3] == [2.0, 95.0, "NA"]
    assert result["rows"][2][:3] == [99.0, 97.0, ""]
    assert result["rows"][3][0] is None
    a, score, text, date, elapsed = result["columns"]
    assert a["label"] == score["label"] == "评价"
    assert a["measurement"] == "ordinal"
    assert a["valueLabels"] == [{"value": 1.0, "label": "相同标签"},
                                {"value": 2.0, "label": "相同标签"},
                                {"value": 99.0, "label": "拒答"}]
    assert a["userMissingValues"] == [99.0] and a["userMissingRanges"] == []
    assert a["systemMissingCount"] == 1
    assert score["userMissingValues"] == [101.0]
    assert score["userMissingRanges"] == [{"lo": 95.0, "hi": 99.0}]
    assert text["userMissingValues"] == ["NA"] and text["systemMissingCount"] == 0
    assert date["originalFormat"].startswith("DATETIME")
    assert date["dateEncoding"] == {
        "kind": "date-time", "unit": "seconds", "epoch": "1582-10-14T00:00:00",
        "timezone": None,
    }
    assert elapsed["dateEncoding"] == {
        "kind": "duration", "unit": "seconds", "epoch": None, "timezone": None,
    }
    assert result["fileEncoding"] is not None
    assert [r["status"] for r in receipts] == ["started", "completed_cleaned"]
    assert all(set(r) == {"importId", "status", "at"} for r in receipts)
    assert len({r["importId"] for r in receipts}) == 1
    assert_no_jobs(root)
    if os.name != "nt":
        assert root.stat().st_mode & 0o777 == 0o700


@pytest.mark.asyncio
async def test_bad_sav_error_is_actionable_without_native_content_or_path(tmp_path):
    private_text = b"private-file-content-and-secret-label"
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(b"$FL2" + private_text, temp_root=tmp_path / "scratch")
    assert caught.value.code == "sav_invalid"
    assert private_text.decode() not in str(caught.value)
    assert str(tmp_path) not in str(caught.value)
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
@pytest.mark.parametrize("content,code", [(b"", "sav_empty"), (b"x" * 2_000_001, "sav_too_large")], ids=["empty", "oversized"])
async def test_upload_size_rejected_without_scratch_files(tmp_path, content, code):
    root = tmp_path / "scratch"
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(content, temp_root=root)
    assert caught.value.code == code
    assert not root.exists()


@pytest.mark.asyncio
@pytest.mark.parametrize("rows,columns", [(5001, 1), (1, 81), (2501, 80), (0, 1)])
async def test_dimension_limits_do_not_silently_truncate(tmp_path, rows, columns):
    content = synthetic_sav(tmp_path, pd.DataFrame({f"q{i}": [float(i)] * rows
                                                   for i in range(columns)}))
    assert len(content) <= sav.MAX_BYTES
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(content, temp_root=tmp_path / "scratch")
    assert caught.value.code == "sav_limits"
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
async def test_200000_cells_round_trip_without_relabelling_or_truncation(tmp_path):
    rows, columns = 2500, 80
    content = synthetic_sav(tmp_path, pd.DataFrame({
        f"q{i}": [float(i + j % 7) for j in range(rows)] for i in range(columns)
    }))
    result = await sav.parse_sav_bytes(content, temp_root=tmp_path / "scratch")
    assert len(result["rows"]) == rows
    assert all(len(row) == columns for row in result["rows"])
    assert result["rows"][-1][-1] == float(79 + 2499 % 7)
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
@pytest.mark.parametrize("value", [9_007_199_254_740_992.0, float("inf"), -float("inf")])
async def test_large_or_nonfinite_values_fail_explicitly(tmp_path, value):
    content = synthetic_sav(tmp_path, pd.DataFrame({"value": [value]}))
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(content, temp_root=tmp_path / "scratch")
    assert caught.value.code == "sav_number_unsafe"
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
@pytest.mark.parametrize("value", ["a" * 2001, "😀" * 1001], ids=["ascii-long", "astral-long"])
async def test_text_limits_match_javascript_utf16_units(tmp_path, value):
    content = synthetic_sav(tmp_path, pd.DataFrame({"text": [value]}))
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(content, temp_root=tmp_path / "scratch")
    assert caught.value.code == "sav_text_limit"
    assert_no_jobs(tmp_path / "scratch")


def test_nonfinite_metadata_is_not_converted_to_a_missing_code():
    for value in [float("nan"), float("inf"), -float("inf"), 10 ** 1000]:
        with pytest.raises(sav.SurveyImportError, match="数值"):
            sav._scalar(value)
    assert sav._scalar(float("nan"), system_missing=True) is None
    assert sav._scalar(-0.0) == 0.0
    assert sav._scalar(9_007_199_254_740_991) == 9_007_199_254_740_991


def patch_worker(monkeypatch, script):
    spawn = asyncio.create_subprocess_exec
    processes = []

    async def replacement(*args, **kwargs):
        process = await spawn(sav._process_executable(), "-I", "-B", "-c",
                              script, *args[-2:], **kwargs)
        processes.append(process)
        return process

    monkeypatch.setattr(sav.asyncio, "create_subprocess_exec", replacement)
    return processes


@pytest.mark.asyncio
async def test_timeout_kills_reaps_and_cleans_actual_child(tmp_path, monkeypatch):
    processes = patch_worker(monkeypatch, "import time; time.sleep(60)")
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(b"synthetic", timeout_seconds=0.05,
                                 temp_root=tmp_path / "scratch")
    assert caught.value.code == "sav_timeout"
    assert len(processes) == 1 and processes[0].returncode is not None
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
async def test_cancel_event_kills_reaps_and_cleans_actual_child(tmp_path, monkeypatch):
    processes = patch_worker(monkeypatch, "import time; time.sleep(60)")
    cancelled, started = asyncio.Event(), asyncio.Event()

    def observe(record):
        if record["status"] == "started":
            started.set()

    task = asyncio.create_task(sav.parse_sav_bytes(
        b"synthetic", temp_root=tmp_path / "scratch",
        cancel_event=cancelled, on_event=observe,
    ))
    await asyncio.wait_for(started.wait(), 5)
    cancelled.set()
    with pytest.raises(sav.SurveyImportError) as caught:
        await task
    assert caught.value.code == "sav_cancelled"
    assert processes[0].returncode is not None
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
async def test_request_task_cancellation_terminates_actual_child(tmp_path, monkeypatch):
    processes = patch_worker(monkeypatch, "import time; time.sleep(60)")
    started = asyncio.Event()
    task = asyncio.create_task(sav.parse_sav_bytes(
        b"synthetic", temp_root=tmp_path / "scratch",
        on_event=lambda record: started.set() if record["status"] == "started" else None,
    ))
    await asyncio.wait_for(started.wait(), 5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert processes[0].returncode is not None
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
async def test_child_exit_and_output_noise_do_not_expose_details(tmp_path, monkeypatch):
    processes = patch_worker(
        monkeypatch,
        "import sys; sys.stdout.write('synthetic-secret'*100000); "
        "sys.stderr.write('path-or-label'); sys.exit(17)",
    )
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(b"synthetic", temp_root=tmp_path / "scratch")
    assert caught.value.code == "sav_worker_failed"
    assert "synthetic-secret" not in str(caught.value)
    assert "path-or-label" not in str(caught.value)
    assert processes[0].returncode == 17
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [
    '{"ok":true,"result":{"sourceSha256":"wrong"}}',
    '{"ok":true,"result":NaN}',
    '{"ok":false,"code":"native-parser-private-message"}',
])
async def test_invalid_child_receipt_has_no_success_and_is_cleaned(tmp_path, monkeypatch, payload):
    patch_worker(monkeypatch,
                 "from pathlib import Path; import sys; "
                 f"Path(sys.argv[-1]).write_text({payload!r},encoding='utf-8')")
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(b"synthetic", temp_root=tmp_path / "scratch")
    assert caught.value.code == "sav_worker_failed"
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
async def test_bounded_child_result_file(tmp_path, monkeypatch):
    patch_worker(monkeypatch,
                 "from pathlib import Path; import sys; "
                 f"Path(sys.argv[-1]).write_bytes(b'x'*{sav.MAX_RESULT_BYTES + 1})")
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(b"synthetic", temp_root=tmp_path / "scratch")
    assert caught.value.code == "sav_result_too_large"
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
async def test_cleanup_failure_cannot_return_success(tmp_path, monkeypatch):
    content = synthetic_sav(tmp_path, pd.DataFrame({"value": [1.0]}))
    original = sav._remove_job

    def fail(root, job):
        raise sav.SurveyImportError("sav_cleanup_failed")

    monkeypatch.setattr(sav, "_remove_job", fail)
    root = tmp_path / "scratch"
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(content, temp_root=root)
    assert caught.value.code == "sav_cleanup_failed"
    assert list(root.glob("sav-*"))
    for job in root.glob("sav-*"):
        original(root.resolve(), job)


@pytest.mark.asyncio
async def test_observer_failure_does_not_change_success_or_cleanup(tmp_path):
    content = synthetic_sav(tmp_path, pd.DataFrame({"value": [1.0]}))

    def broken_observer(_):
        raise RuntimeError("synthetic log failure")

    result = await sav.parse_sav_bytes(content, temp_root=tmp_path / "scratch",
                                      on_event=broken_observer)
    assert result["rows"] == [[1.0]]
    assert_no_jobs(tmp_path / "scratch")


def lease_job(root, identifier, *, expires, parent_pid=0, child_pid=None, phase="prepared"):
    job = root / f"sav-{identifier}"
    job.mkdir()
    (job / "input.sav").write_bytes(b"private-original")
    (job / "lease.json").write_text(json.dumps({
        "schema": "sav-import-lease/v1", "id": identifier, "createdAt": expires - 15,
        "expiresAt": expires, "parentPid": parent_pid, "childPid": child_pid, "phase": phase,
    }), encoding="utf-8")
    return job


def test_restart_cleanup_only_expired_owned_jobs_and_opaque_receipts(tmp_path):
    root = sav._root(tmp_path / "scratch")
    now = time.time()
    stale = lease_job(root, "1" * 32, expires=now - 1)
    live = lease_job(root, "2" * 32, expires=now - 1, parent_pid=os.getpid())
    future = lease_job(root, "3" * 32, expires=now + 60)
    unowned = root / "other-app-data"
    unowned.mkdir()
    (unowned / "input.sav").write_bytes(b"do-not-delete")
    records = sav.cleanup_stale_imports(root, now=now)
    assert not stale.exists() and live.exists() and future.exists() and unowned.exists()
    assert records == [
        {"importId": "1" * 32, "status": "removed", "at": now},
        {"importId": "2" * 32, "status": "deferred", "at": now},
    ]
    assert all(set(record) == {"importId", "status", "at"} for record in records)
    assert "private-original" not in json.dumps(records)


@pytest.mark.asyncio
async def test_cancel_before_start_does_not_create_files(tmp_path):
    event = asyncio.Event()
    event.set()
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(b"synthetic", cancel_event=event,
                                 temp_root=tmp_path / "scratch")
    assert caught.value.code == "sav_cancelled"
    assert not (tmp_path / "scratch").exists()


@pytest.mark.asyncio
async def test_concurrent_uploads_use_separate_directories_and_hashes(tmp_path):
    content_a = synthetic_sav(tmp_path, pd.DataFrame({"value": [1.0]}))
    content_b = synthetic_sav(tmp_path, pd.DataFrame({"value": [2.0]}))
    receipts = []
    a, b = await asyncio.gather(
        sav.parse_sav_bytes(content_a, temp_root=tmp_path / "scratch", on_event=receipts.append),
        sav.parse_sav_bytes(content_b, temp_root=tmp_path / "scratch", on_event=receipts.append),
    )
    assert a["rows"] == [[1.0]] and b["rows"] == [[2.0]]
    assert a["sourceSha256"] != b["sourceSha256"]
    assert len({record["importId"] for record in receipts}) == 2
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
async def test_repeated_task_cancellation_cannot_interrupt_cleanup(tmp_path, monkeypatch):
    processes = patch_worker(monkeypatch, "import time; time.sleep(60)")
    started, cleaning = asyncio.Event(), asyncio.Event()
    finish = sav._finish_job

    async def slower_finish(*args):
        cleaning.set()
        await asyncio.sleep(0.05)
        await finish(*args)

    monkeypatch.setattr(sav, "_finish_job", slower_finish)
    task = asyncio.create_task(sav.parse_sav_bytes(
        b"synthetic", temp_root=tmp_path / "scratch",
        on_event=lambda record: started.set() if record["status"] == "started" else None,
    ))
    await asyncio.wait_for(started.wait(), 5)
    task.cancel()
    await asyncio.wait_for(cleaning.wait(), 5)
    for _ in range(3):
        task.cancel()
        await asyncio.sleep(0.005)
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(task, 5)
    assert processes[0].returncode is not None
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
async def test_cancellation_during_process_creation_still_reaps_child(tmp_path, monkeypatch):
    spawn = asyncio.create_subprocess_exec
    started, processes = asyncio.Event(), []

    async def delayed_spawn(*args, **kwargs):
        process = await spawn(sav._process_executable(), "-I", "-B", "-c",
                              "import time; time.sleep(60)", *args[-2:], **kwargs)
        processes.append(process)
        started.set()
        await asyncio.sleep(0.05)
        return process

    monkeypatch.setattr(sav.asyncio, "create_subprocess_exec", delayed_spawn)
    task = asyncio.create_task(sav.parse_sav_bytes(b"synthetic", temp_root=tmp_path / "scratch"))
    await asyncio.wait_for(started.wait(), 5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(task, 5)
    assert processes[0].returncode is not None
    assert_no_jobs(tmp_path / "scratch")


def test_restart_cleanup_recovers_old_jobs_before_first_lease(tmp_path):
    root = sav._root(tmp_path / "scratch")
    now = time.time()
    old = root / ("sav-" + "4" * 32)
    recent = root / ("sav-" + "5" * 32)
    old.mkdir()
    recent.mkdir()
    (old / ".lease.tmp").write_text('{"incomplete":', encoding="utf-8")
    os.utime(old, (now - sav.INCOMPLETE_LEASE_GRACE_SECONDS - 1,) * 2)
    records = sav.cleanup_stale_imports(root, now=now)
    assert not old.exists() and recent.exists()
    assert records == [{"importId": "4" * 32, "status": "removed", "at": now}]


@pytest.mark.asyncio
async def test_started_event_sees_complete_atomic_lease(tmp_path):
    content = synthetic_sav(tmp_path, pd.DataFrame({"value": [1.0]}))
    root, leases = tmp_path / "scratch", []

    def observe(record):
        if record["status"] == "started":
            job = root / ("sav-" + record["importId"])
            leases.append(json.loads((job / "lease.json").read_text(encoding="utf-8")))
            assert not (job / ".lease.json.tmp").exists()

    await sav.parse_sav_bytes(content, temp_root=root, on_event=observe)
    assert len(leases) == 1 and isinstance(leases[0]["childPid"], int)
    assert leases[0]["parentPid"] == os.getpid()
    assert_no_jobs(root)


def test_date_encoding_is_explicit_and_unknown_formats_are_retained():
    from types import SimpleNamespace

    for name in ("DATE11", "ADATE10", "EDATE10", "JDATE7", "SDATE10",
                 "DATETIME20", "YMDHMS20"):
        assert sav._date_encoding(name)["epoch"] == "1582-10-14T00:00:00"
    for name in ("TIME8.2", "DTIME20.2"):
        assert sav._date_encoding(name)["epoch"] is None
    metadata = SimpleNamespace(original_variable_types={"date": "MOYR8"})
    column = sav._column_metadata(metadata, ["date"])[0]
    assert column["originalFormat"] == "MOYR8"
    assert column["dateEncoding"] is None


@pytest.mark.skipif(os.name != "nt", reason="Windows sharing-violation lifecycle")
def test_cleanup_retries_only_transient_windows_sharing_violation(tmp_path, monkeypatch):
    root = sav._root(tmp_path / "scratch")
    job = lease_job(root, "6" * 32, expires=time.time() - 1)
    original, attempts, delays = sav.shutil.rmtree, [], []

    def sharing_violation(path):
        attempts.append(path)
        if len(attempts) < 3:
            error = PermissionError("synthetic sharing violation")
            error.winerror = 32
            raise error
        original(path)

    monkeypatch.setattr(sav.shutil, "rmtree", sharing_violation)
    monkeypatch.setattr(sav.time, "sleep", delays.append)
    sav._remove_job(root, job)
    assert len(attempts) == 3 and delays == [0.01, 0.02]
    assert not job.exists()


@pytest.mark.skipif(os.name != "nt", reason="Windows sharing-violation lifecycle")
@pytest.mark.parametrize("winerror,expected_attempts", [(5, 1), (32, 7), (33, 7)])
def test_cleanup_exhausted_or_nontransient_error_remains_failure(
    tmp_path, monkeypatch, winerror, expected_attempts,
):
    root = sav._root(tmp_path / "scratch")
    job = lease_job(root, "7" * 32, expires=time.time() - 1)
    original, attempts, delays = sav.shutil.rmtree, [], []

    def blocked(path):
        attempts.append(path)
        error = PermissionError("synthetic inaccessible file")
        error.winerror = winerror
        raise error

    monkeypatch.setattr(sav.shutil, "rmtree", blocked)
    monkeypatch.setattr(sav.time, "sleep", delays.append)
    with pytest.raises(sav.SurveyImportError) as caught:
        sav._remove_job(root, job)
    assert caught.value.code == "sav_cleanup_failed"
    assert len(attempts) == expected_attempts and sum(delays) <= 0.64
    assert (job / "input.sav").read_bytes() == b"private-original"
    original(job)


@pytest.mark.asyncio
@pytest.mark.parametrize("trial", range(25))
async def test_25_actual_timeout_cleanup_trials(tmp_path, monkeypatch, trial):
    processes = patch_worker(monkeypatch, "import time; time.sleep(60)")
    root = tmp_path / f"scratch-{trial}"
    # This is a real-child cleanup test, not a 25ms filesystem benchmark.
    # Hold only the decoder's business clock until the child exists, then
    # expire its deadline. The event loop and process-reaping clocks stay real.
    anchor = time.monotonic()
    monkeypatch.setattr(sav, "time", SimpleNamespace(
        time=time.time, sleep=time.sleep,
        monotonic=lambda: time.monotonic() + 2 if processes else anchor,
    ))
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(b"synthetic", timeout_seconds=1, temp_root=root)
    assert caught.value.code == "sav_timeout"
    assert len(processes) == 1 and processes[0].returncode is not None
    assert_no_jobs(root)


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", [None, "spawning"])
async def test_parent_death_spawn_gap_does_not_remove_live_child_input(tmp_path, phase):
    root = sav._root(tmp_path / "scratch")
    now = time.time()
    job = lease_job(root, "8" * 32, expires=now - 1, phase=phase)
    process = await asyncio.create_subprocess_exec(
        sav._process_executable(), "-I", "-B", "-c", "import time; time.sleep(60)",
        cwd=job, stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        records = sav.cleanup_stale_imports(root, now=now)
        assert records == [{"importId": "8" * 32, "status": "deferred", "at": now}]
        assert process.returncode is None
        assert (job / "input.sav").read_bytes() == b"private-original"
        assert (job / "lease.json").is_file()
    finally:
        process.kill()
        await process.wait()
        sav._remove_job(root, job)


@pytest.mark.asyncio
async def test_worker_owned_registration_protects_live_child_then_allows_recovery(tmp_path):
    root = sav._root(tmp_path / "scratch")
    now = time.time()
    job = lease_job(root, "9" * 32, expires=now - 1, phase="spawning")
    process = await asyncio.create_subprocess_exec(
        sav._process_executable(), "-I", "-B", "-c", "import time; time.sleep(60)",
        cwd=job, stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    sav._write_record(job, "worker.json", {
        "schema": "sav-import-worker/v1", "id": "9" * 32, "pid": process.pid, "at": now,
    })
    try:
        assert sav.cleanup_stale_imports(root, now=now)[0]["status"] == "deferred"
        assert (job / "input.sav").read_bytes() == b"private-original"
    finally:
        process.kill()
        await process.wait()
    assert sav.cleanup_stale_imports(root, now=now)[0]["status"] == "removed"
    assert not job.exists()


@pytest.mark.asyncio
async def test_actual_orphan_worker_registers_and_exits_before_reading_sav(tmp_path):
    root = sav._root(tmp_path / "scratch")
    now = time.time()
    job = lease_job(root, "a" * 32, expires=now - 1, phase="spawning")
    process = await asyncio.create_subprocess_exec(
        *sav._worker_command(job / "input.sav", job / "result.json"), cwd=job,
        stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        await asyncio.wait_for(process.wait(), 5)
        assert process.returncode == 0
        # Invalid SAV would produce sav_invalid if decoding had been attempted.
        assert json.loads((job / "result.json").read_text(encoding="utf-8")) == {
            "ok": False, "code": "sav_worker_failed",
        }
        registration = json.loads((job / "worker.json").read_text(encoding="utf-8"))
        assert registration["pid"] == process.pid
        assert (job / "input.sav").read_bytes() == b"private-original"
        assert sav.cleanup_stale_imports(root, now=now)[0]["status"] == "removed"
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()
        if job.exists():
            sav._remove_job(root, job)


@pytest.mark.asyncio
async def test_spawn_delay_consumes_the_same_deadline_as_decoding(tmp_path, monkeypatch):
    spawn = asyncio.create_subprocess_exec
    processes = []

    async def delayed_spawn(*args, **kwargs):
        process = await spawn(sav._process_executable(), "-I", "-B", "-c",
                              "import time; time.sleep(60)", *args[-2:], **kwargs)
        processes.append(process)
        await asyncio.sleep(0.1)
        return process

    monkeypatch.setattr(sav.asyncio, "create_subprocess_exec", delayed_spawn)
    statuses = []
    with pytest.raises(sav.SurveyImportError) as caught:
        await sav.parse_sav_bytes(b"synthetic", timeout_seconds=0.05,
                                 temp_root=tmp_path / "scratch", on_event=statuses.append)
    assert caught.value.code == "sav_timeout"
    # Timeout occurs while spawning; no fresh parse budget or 'started' receipt.
    assert [record["status"] for record in statuses] == ["failed_cleaned"]
    assert len(processes) == 1 and processes[0].returncode is not None
    assert_no_jobs(tmp_path / "scratch")


@pytest.mark.asyncio
async def test_actual_parser_pid_is_the_process_held_and_reaped_by_parent(tmp_path, monkeypatch):
    content = synthetic_sav(tmp_path, pd.DataFrame({"value": [1.0]}))
    finish, registrations = sav._finish_job, []

    async def inspect_then_finish(root, job, process, *args):
        registration = json.loads((job / "worker.json").read_text(encoding="utf-8"))
        registrations.append((registration["pid"], process.pid, process.returncode))
        await finish(root, job, process, *args)

    monkeypatch.setattr(sav, "_finish_job", inspect_then_finish)
    result = await sav.parse_sav_bytes(content, temp_root=tmp_path / "scratch")
    assert result["rows"] == [[1.0]]
    assert len(registrations) == 1
    actual_pid, held_pid, returncode = registrations[0]
    assert actual_pid == held_pid and returncode == 0
    assert not sav._pid_alive(actual_pid)
    assert_no_jobs(tmp_path / "scratch")
