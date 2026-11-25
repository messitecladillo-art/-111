"""Epistemic Belief Graph tracking hypotheses, pivots, snapshots, and dirty propagation."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from multi_agent.react_loop import sanitize_trace_prose
from shared.contracts import fingerprint

NodeKind = Literal[
    "question",
    "hypothesis",
    "construct",
    "item",
    "cleaning_rule",
    "stat_snapshot",
    "mother_insight",
    "claim",
    "falsification_check",
    "policy_lever",
    "literature_source",
]

NodeStatus = Literal["proposed", "verified", "refuted", "pivoted", "dirty"]

EdgeRelation = Literal[
    "measured_by",
    "tested_by",
    "cleaned_by",
    "supports",
    "refutes",
    "pivoted_to",
    "falsified_by",
    "mitigated_by",
    "synthesizes",
]


class EpistemicNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=80)
    kind: NodeKind
    label: str = Field(min_length=1, max_length=240)
    status: NodeStatus = "proposed"
    summary: str = Field(default="", max_length=1500)
    snapshot_ids: list[str] = Field(default_factory=list, max_length=40)
    dirty_reason: str = Field(default="", max_length=400)


class EpistemicEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str = Field(min_length=1, max_length=80)
    target: str = Field(min_length=1, max_length=80)
    relation: EdgeRelation
    note: str = Field(default="", max_length=300)


class EpistemicGraph(BaseModel):
    """Belief graph linking research questions through verified statistical pivots."""

    model_config = ConfigDict(extra="forbid")

    project_id: str = Field(default="", max_length=64)
    nodes: dict[str, EpistemicNode] = Field(default_factory=dict)
    edges: list[EpistemicEdge] = Field(default_factory=list)
    pivot_log: list[dict[str, str]] = Field(default_factory=list)

    def upsert_node(
        self,
        *,
        node_id: str,
        kind: NodeKind,
        label: str,
        status: NodeStatus = "proposed",
        summary: str = "",
        snapshot_ids: list[str] | None = None,
    ) -> EpistemicNode:
        clean_label = sanitize_trace_prose(label, 240) or label[:240]
        clean_summary = sanitize_trace_prose(summary, 1500) if summary else ""
        node = EpistemicNode(
            id=node_id,
            kind=kind,
            label=clean_label,
            status=status,
            summary=clean_summary,
            snapshot_ids=list(snapshot_ids or [])[:40],
        )
        self.nodes[node_id] = node
        return node

    def add_edge(self, source: str, target: str, relation: EdgeRelation, note: str = "") -> EpistemicEdge:
        if source not in self.nodes or target not in self.nodes:
            raise ValueError(f"missing_graph_endpoint:{source}->{target}")
        clean_note = sanitize_trace_prose(note, 300) if note else ""
        edge = EpistemicEdge(source=source, target=target, relation=relation, note=clean_note)
        if edge not in self.edges:
            self.edges.append(edge)
        return edge

    def mark_dirty(self, node_id: str, reason: str = "上游证据或构念发生变更") -> list[str]:
        """Propagate staleness forward along outgoing belief edges via BFS."""
        if node_id not in self.nodes:
            return []
        clean_reason = sanitize_trace_prose(reason, 400) or "上游证据或构念发生变更"
        affected: list[str] = []
        queue = [node_id]
        visited = {node_id}
        while queue:
            cur = queue.pop(0)
            for edge in self.edges:
                if edge.source != cur:
                    continue
                nxt = edge.target
                if nxt in visited or nxt not in self.nodes:
                    continue
                visited.add(nxt)
                target_node = self.nodes[nxt]
                if target_node.kind in ("claim", "mother_insight", "policy_lever", "hypothesis") and target_node.status in ("proposed", "verified"):
                    target_node.status = "dirty"
                    target_node.dirty_reason = clean_reason
                    affected.append(nxt)
                queue.append(nxt)
        return affected

    def record_pivot(
        self,
        *,
        old_node_id: str,
        new_node: EpistemicNode,
        reason: str,
        evidence_snapshot_id: str = "",
        refute_old: bool = False,
    ) -> list[str]:
        """Supersede a naive hypothesis or faulty construct specification with an evidence-backed pivot."""
        if old_node_id not in self.nodes:
            raise ValueError(f"unknown_pivot_source:{old_node_id}")
        clean_reason = sanitize_trace_prose(reason, 300) or reason[:300]
        sanitized_new = EpistemicNode(
            id=new_node.id,
            kind=new_node.kind,
            label=sanitize_trace_prose(new_node.label, 240) or new_node.label[:240],
            status=new_node.status,
            summary=sanitize_trace_prose(new_node.summary, 1500) if new_node.summary else "",
            snapshot_ids=list(new_node.snapshot_ids)[:40],
            dirty_reason=sanitize_trace_prose(new_node.dirty_reason, 400) if new_node.dirty_reason else "",
        )
        old = self.nodes[old_node_id]
        old.status = "refuted" if refute_old else "pivoted"
        dirty = self.mark_dirty(old_node_id, reason=clean_reason)
        self.nodes[sanitized_new.id] = sanitized_new
        self.add_edge(old_node_id, sanitized_new.id, "pivoted_to", note=clean_reason)
        if evidence_snapshot_id and evidence_snapshot_id in self.nodes:
            self.add_edge(evidence_snapshot_id, sanitized_new.id, "supports", note="统计检验实证结果支撑修正")
        self.pivot_log.append({
            "fromNode": old_node_id,
            "toNode": sanitized_new.id,
            "reason": clean_reason,
            "snapshotId": evidence_snapshot_id,
        })
        return dirty

    def audit_completeness(self) -> dict[str, object]:
        dirty_nodes = [n.id for n in self.nodes.values() if n.status == "dirty"]
        unsupported_claims = [
            n.id
            for n in self.nodes.values()
            if n.kind in ("claim", "mother_insight")
            and n.status == "verified"
            and not n.snapshot_ids
            and not any(e.target == n.id and e.relation == "supports" for e in self.edges)
        ]
        mother_nodes = [n for n in self.nodes.values() if n.kind == "mother_insight" and n.status == "verified"]
        falsified_checked = any(
            n.kind == "falsification_check" and n.status == "verified" for n in self.nodes.values()
        )
        passed = bool(mother_nodes) and falsified_checked and not dirty_nodes and not unsupported_claims
        return {
            "passed": passed,
            "nodeCount": len(self.nodes),
            "edgeCount": len(self.edges),
            "pivotCount": len(self.pivot_log),
            "dirtyNodes": dirty_nodes,
            "unsupportedClaims": unsupported_claims,
            "hasVerifiedMotherInsight": bool(mother_nodes),
            "hasFalsificationCheck": falsified_checked,
            "graphHash": fingerprint(self.to_dict()),
        }

    def to_dict(self) -> dict:
        return {
            "project_id": self.project_id,
            "nodes": [n.model_dump(mode="json") for n in self.nodes.values()],
            "edges": [e.model_dump(mode="json") for e in self.edges],
            "pivot_log": list(self.pivot_log),
        }

    @classmethod
    def from_dict(cls, raw: dict) -> EpistemicGraph:
        nodes = {item["id"]: EpistemicNode.model_validate(item) for item in raw.get("nodes", [])}
        edges = [EpistemicEdge.model_validate(item) for item in raw.get("edges", [])]
        return cls(
            project_id=raw.get("project_id", ""),
            nodes=nodes,
            edges=edges,
            pivot_log=list(raw.get("pivot_log", [])),
        )
