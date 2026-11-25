"""Working-memory compaction and cross-run epistemic memory formatting utilities."""

from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any, Iterable

from multi_agent.react_loop import sanitize_trace_prose

_CTRL_RE = re.compile(r"[\x00-\x1f\x7f]+")
_BRIEF_BLOCK_RE = re.compile(r"\n*<working-memory-brief>\s*(.*?)\s*</working-memory-brief>\s*$", re.S)
_OBS_TAG_RE = re.compile(r"<observation-json>\s*(.*?)\s*</observation-json>", re.S)

_MEMORY_PRIORITY: dict[str, int] = {
    "mother_insight": 0,
    "steering_note": 1,
    "preference": 1,
    "cleaning_rule": 2,
    "refuted_claim": 3,
    "hypothesis": 4,
}


@dataclass(frozen=True)
class WorkingMemoryBrief:
    """Compact summary of archived middle turns attached to messages[1]."""

    dropped_count: int
    completed_operators: tuple[str, ...]
    verified_snapshots: tuple[str, ...]
    active_diagnostics: tuple[str, ...]
    pivots: tuple[str, ...]
    brief_text: str


def _clean_line(value: Any, max_len: int = 240) -> str:
    if value is None:
        return ""
    cleaned = _CTRL_RE.sub(" ", str(value)).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    if len(cleaned) > max_len:
        return cleaned[: max(1, max_len - 1)].rstrip() + "…"
    return cleaned


def _dedupe_ordered(items: Iterable[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        clean = item.strip()
        if clean and clean not in seen:
            seen.add(clean)
            out.append(clean)
    return tuple(out)


def _parse_existing_brief(content: str) -> tuple[str, int, list[str], list[str], list[str], list[str]]:
    match = _BRIEF_BLOCK_RE.search(content)
    if not match:
        return content, 0, [], [], [], []
    base_content = content[: match.start()].rstrip()
    body = match.group(1)
    prior_dropped = 0
    ops: list[str] = []
    snaps: list[str] = []
    diags: list[str] = []
    pivots: list[str] = []
    in_pivots = False
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("已归档历史消息数:"):
            in_pivots = False
            num_txt = line.split(":", 1)[1].strip()
            if num_txt.isdigit():
                prior_dropped = int(num_txt)
        elif line.startswith(("已执行步骤:", "已执行工具:", "已完成步骤:", "已执行\u7b97\u5b50:")):
            in_pivots = False
            val = line.split(":", 1)[1].strip()
            if val and val != "无":
                ops.extend(part.strip() for part in val.split(",") if part.strip())
        elif line.startswith("已签发快照:"):
            in_pivots = False
            val = line.split(":", 1)[1].strip()
            if val and val != "无":
                snaps.extend(part.strip() for part in val.split(",") if part.strip())
        elif line.startswith("活跃诊断信号:"):
            in_pivots = False
            val = line.split(":", 1)[1].strip()
            if val and val != "无":
                diags.extend(part.strip() for part in val.split(",") if part.strip())
        elif line.startswith("研究转向与人工指令:"):
            in_pivots = True
        elif in_pivots and line.startswith("- "):
            item = line[2:].strip()
            if item:
                pivots.append(item)
    return base_content, prior_dropped, ops, snaps, diags, pivots


def _extract_from_obs_dict(
    obs: dict[str, Any],
    *,
    ops: list[str],
    snaps: list[str],
    diags: list[str],
    pivots: list[str],
) -> None:
    if obs.get("status") == "error" or ("error" in obs and "snapshot_id" not in obs and "operator" not in obs):
        return
    op_name = _clean_line(obs.get("operator"), 80)
    if op_name:
        ops.append(op_name)
    snap_id = _clean_line(obs.get("snapshot_id"), 64)
    if snap_id:
        snaps.append(snap_id)
    for vs in obs.get("verifiedSnapshots") or []:
        clean_vs = _clean_line(vs, 64)
        if clean_vs:
            snaps.append(clean_vs)
    for diag in obs.get("diagnostics") or []:
        clean_diag = _clean_line(diag, 120)
        if clean_diag:
            diags.append(clean_diag)
    pivot_note = _clean_line(obs.get("pivotTaken") or obs.get("pivot") or "", 220)
    if pivot_note:
        pivots.append(pivot_note)
    elif op_name == "mutate_epistemic_graph" and obs.get("action") == "record_pivot":
        summary = _clean_line(obs.get("summary"), 220)
        if summary:
            pivots.append(summary)


def _format_brief_block(
    *,
    dropped_count: int,
    ops: tuple[str, ...],
    snaps: tuple[str, ...],
    diags: tuple[str, ...],
    pivots: tuple[str, ...],
    max_brief_chars: int,
) -> str:
    open_tag = "<working-memory-brief>\n"
    close_tag = "\n</working-memory-brief>"
    budget = max(80, int(max_brief_chars))

    def _render(op_lim: int, snap_lim: int, diag_lim: int, pivot_lim: int) -> str:
        lines = [
            f"已归档历史消息数: {dropped_count}",
            "已执行步骤: " + (", ".join(ops[:op_lim]) if ops else "无"),
            "已签发快照: " + (", ".join(snaps[:snap_lim]) if snaps else "无"),
            "活跃诊断信号: " + (", ".join(diags[:diag_lim]) if diags else "无"),
        ]
        if pivots and pivot_lim > 0:
            lines.append("研究转向与人工指令:")
            for p in pivots[:pivot_lim]:
                lines.append(f"- {p}")
        return open_tag + "\n".join(lines) + close_tag

    op_lim = len(ops)
    snap_lim = len(snaps)
    diag_lim = len(diags)
    pivot_lim = len(pivots)
    rendered = _render(op_lim, snap_lim, diag_lim, pivot_lim)
    while len(rendered) > budget:
        if pivot_lim > 2:
            pivot_lim -= 1
        elif diag_lim > 4:
            diag_lim = max(4, diag_lim - 2)
        elif snap_lim > 4:
            snap_lim = max(4, snap_lim - 2)
        elif op_lim > 4:
            op_lim = max(4, op_lim - 2)
        elif pivot_lim > 0:
            pivot_lim -= 1
        else:
            inner_budget = max(16, budget - len(open_tag) - len(close_tag) - 1)
            inner = rendered[len(open_tag) : len(rendered) - len(close_tag)]
            rendered = open_tag + inner[:inner_budget].rstrip() + "…" + close_tag
            break
        rendered = _render(op_lim, snap_lim, diag_lim, pivot_lim)
    return rendered


def compact_agent_messages(
    messages: list[dict[str, Any]],
    *,
    max_messages: int = 24,
    keep_recent_messages: int = 10,
    max_brief_chars: int = 2400,
) -> tuple[list[dict[str, Any]], WorkingMemoryBrief | None]:
    """Compress middle multi-turn messages while preserving atomic assistant/tool boundaries."""
    if len(messages) <= max_messages or len(messages) < 3:
        return messages, None

    raw_start = max(2, len(messages) - max(1, int(keep_recent_messages)))
    assistant_indices = [
        idx for idx in range(2, len(messages))
        if isinstance(messages[idx], dict) and messages[idx].get("role") == "assistant"
    ]

    tail_start: int | None = None
    if assistant_indices:
        fitting_back = [
            idx for idx in assistant_indices
            if idx <= raw_start and (2 + len(messages) - idx) <= max_messages
        ]
        if fitting_back:
            tail_start = fitting_back[-1]
        else:
            fwd = [idx for idx in assistant_indices if idx >= raw_start]
            if fwd:
                tail_start = fwd[0]
            else:
                back = [idx for idx in assistant_indices if idx <= raw_start]
                if back:
                    tail_start = back[-1]
        if tail_start is not None and tail_start <= 2:
            return messages, None
    else:
        tail_start = len(messages)

    assert tail_start is not None
    dropped = messages[2:tail_start]
    tail = messages[tail_start:]
    if not dropped:
        return messages, None

    raw_msg1_content = str((messages[1] or {}).get("content") or "")
    base_content, prior_dropped, ops, snaps, diags, pivots = _parse_existing_brief(raw_msg1_content)

    for msg in dropped:
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        if role == "assistant":
            for tc in msg.get("tool_calls") or []:
                if isinstance(tc, dict) and tc.get("name"):
                    ops.append(_clean_line(tc["name"], 80))
                    if tc["name"] == "mutate_epistemic_graph":
                        args = tc.get("arguments") or {}
                        if isinstance(args, dict) and args.get("action") == "record_pivot":
                            label = _clean_line(args.get("label") or args.get("node_id"), 180)
                            if label:
                                pivots.append(f"图谱转向: {label}")
            raw_c = msg.get("content")
            if isinstance(raw_c, str) and raw_c.lstrip().startswith("{"):
                try:
                    parsed = json.loads(raw_c)
                    if isinstance(parsed, dict):
                        for tc in parsed.get("tool_calls") or []:
                            if isinstance(tc, dict) and tc.get("name"):
                                ops.append(_clean_line(tc["name"], 80))
                except Exception:
                    pass
        elif role == "tool":
            tname = _clean_line(msg.get("name"), 80)
            raw_c = msg.get("content")
            parsed_obs: dict[str, Any] | None = None
            if isinstance(raw_c, str):
                try:
                    candidate = json.loads(raw_c)
                    if isinstance(candidate, dict):
                        parsed_obs = candidate
                except Exception:
                    parsed_obs = None
            if parsed_obs is not None:
                if "operator" not in parsed_obs and tname:
                    parsed_obs = {**parsed_obs, "operator": tname}
                _extract_from_obs_dict(parsed_obs, ops=ops, snaps=snaps, diags=diags, pivots=pivots)
            elif tname:
                ops.append(tname)
        elif role == "user":
            content = str(msg.get("content") or "")
            obs_match = _OBS_TAG_RE.search(content)
            if obs_match:
                try:
                    obs_pack = json.loads(obs_match.group(1))
                    if isinstance(obs_pack, dict):
                        for item in obs_pack.get("observations") or []:
                            if not isinstance(item, dict):
                                continue
                            tool_nm = _clean_line(item.get("tool"), 80)
                            if item.get("status") == "ok" and isinstance(item.get("result"), dict):
                                res = item["result"]
                                if "operator" not in res and tool_nm:
                                    res = {**res, "operator": tool_nm}
                                _extract_from_obs_dict(res, ops=ops, snaps=snaps, diags=diags, pivots=pivots)
                except Exception:
                    pass
            else:
                clean_u = sanitize_trace_prose(_clean_line(content, 200), 200)
                if clean_u:
                    if "人工审阅与纠偏指令" in content:
                        pivots.append(f"人工审阅调整（{clean_u}）")
                    elif "返回 revise" in content:
                        pivots.append(f"复核补充意见（{clean_u}）")
                    else:
                        pivots.append(f"研究补充说明（{clean_u}）")

    total_dropped = prior_dropped + len(dropped)
    dedup_ops = _dedupe_ordered(ops)
    dedup_snaps = _dedupe_ordered(snaps)
    dedup_diags = _dedupe_ordered(diags)
    dedup_pivots = _dedupe_ordered(pivots)

    brief_text = _format_brief_block(
        dropped_count=total_dropped,
        ops=dedup_ops,
        snaps=dedup_snaps,
        diags=dedup_diags,
        pivots=dedup_pivots,
        max_brief_chars=max_brief_chars,
    )
    updated_msg1 = dict(messages[1])
    updated_msg1["content"] = (base_content + "\n\n" + brief_text).strip() if base_content else brief_text

    brief = WorkingMemoryBrief(
        dropped_count=total_dropped,
        completed_operators=dedup_ops,
        verified_snapshots=dedup_snaps,
        active_diagnostics=dedup_diags,
        pivots=dedup_pivots,
        brief_text=brief_text,
    )
    compacted = [dict(messages[0]), updated_msg1, *(dict(m) for m in tail)]
    return compacted, brief


def compact_chat_history(dropped_entries: list[dict[str, str]], *, max_chars: int = 800) -> dict[str, Any]:
    """Summarize evicted chat history entries cleanly within a strict character budget."""
    count = len(dropped_entries)
    if count == 0:
        return {"droppedCount": 0, "highlights": []}

    budget = max(80, int(max_chars))
    highlights: list[str] = []
    used = 0
    for entry in dropped_entries:
        if not isinstance(entry, dict):
            continue
        role = _clean_line(entry.get("role") or "user", 16)
        text_val = sanitize_trace_prose(_clean_line(entry.get("text") or "", 140), 140)
        if not text_val:
            continue
        snippet = f"{role} ({text_val})"
        if used + len(snippet) + 4 > budget:
            remaining = budget - used - 4
            if remaining >= 20 and not highlights:
                highlights.append(snippet[: remaining - 1].rstrip() + "…")
            break
        highlights.append(snippet)
        used += len(snippet) + 4
        if len(highlights) >= 6:
            break
    return {"droppedCount": count, "highlights": highlights}


def format_project_epistemic_memory(
    records: list[dict[str, Any]],
    *,
    max_items: int = 12,
    max_chars: int = 2400,
) -> dict[str, Any]:
    """Prioritize and deduplicate cross-run epistemic memories for prompt recall."""
    if not records:
        return {
            "recalledCount": 0,
            "motherInsights": [],
            "cleaningRules": [],
            "refutedClaims": [],
            "steeringNotes": [],
            "items": [],
            "briefText": "",
        }

    deduped: dict[str, tuple[int, int, dict[str, Any]]] = {}
    for idx, raw in enumerate(records):
        if not isinstance(raw, dict):
            continue
        kind = _clean_line(raw.get("kind") or "hypothesis", 40)
        status = _clean_line(raw.get("status") or "active", 32)
        summary = sanitize_trace_prose(_clean_line(raw.get("summary") or "", 400), 400)
        if not summary:
            continue
        mkey = _clean_line(raw.get("memoryKey") or raw.get("memory_key") or "", 120)
        dedup_id = mkey or f"{kind}:{summary}"
        prio = _MEMORY_PRIORITY.get(kind, 5)
        snaps = [
            _clean_line(s, 64)
            for s in (raw.get("snapshotRefs") or raw.get("snapshot_refs") or [])
            if _clean_line(s, 64)
        ][:10]
        clean_rec = {
            "memoryKey": mkey or dedup_id[:120],
            "kind": kind,
            "status": status,
            "summary": summary,
            "snapshotRefs": snaps,
        }
        prev = deduped.get(dedup_id)
        if prev is None or prio < prev[0]:
            deduped[dedup_id] = (prio, idx, clean_rec)

    ordered = [
        item for _, _, item in sorted(deduped.values(), key=lambda pair: (pair[0], pair[1]))
    ][: max(1, int(max_items))]

    mother_insights: list[str] = []
    cleaning_rules: list[str] = []
    refuted_claims: list[str] = []
    steering_notes: list[str] = []
    brief_lines: list[str] = []
    char_budget = max(120, int(max_chars))
    used_chars = 0
    selected_items: list[dict[str, Any]] = []

    for rec in ordered:
        kind = rec["kind"]
        summary = rec["summary"]
        line = f"[{kind}/{rec['status']}] {summary}"
        if used_chars + len(line) + 1 > char_budget and selected_items:
            break
        if len(line) > char_budget:
            line = line[: char_budget - 1].rstrip() + "…"
        brief_lines.append(line)
        used_chars += len(line) + 1
        selected_items.append(rec)

        if kind == "mother_insight":
            mother_insights.append(summary)
        elif kind in ("steering_note", "preference"):
            steering_notes.append(summary)
        elif kind == "cleaning_rule":
            cleaning_rules.append(summary)
        elif kind == "refuted_claim":
            refuted_claims.append(summary)

    return {
        "recalledCount": len(selected_items),
        "motherInsights": mother_insights,
        "cleaningRules": cleaning_rules,
        "refutedClaims": refuted_claims,
        "steeringNotes": steering_notes,
        "items": selected_items,
        "briefText": "\n".join(brief_lines),
    }
