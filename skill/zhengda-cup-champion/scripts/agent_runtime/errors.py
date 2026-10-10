"""Stable error classes and exit codes for the agent runtime."""

from __future__ import annotations

from typing import Any


class AgentError(Exception):
    """Base exception surfaced as a machine-readable CLI failure."""

    exit_code = 4
    code = "runtime_error"
    failure_class = "runtime"

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.details = details or {}

    def as_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "class": self.failure_class,
            "message": str(self),
            "retryable": False,
            "details": self.details,
        }


class DomainBlocked(AgentError):
    exit_code = 1
    code = "domain_gate_blocked"
    failure_class = "gate"


class ContractError(AgentError):
    exit_code = 2
    code = "contract_invalid"
    failure_class = "validation"


class ArtifactError(AgentError):
    exit_code = 3
    code = "artifact_io_failed"
    failure_class = "artifact_io"


class ConflictError(AgentError):
    exit_code = 5
    code = "state_conflict"
    failure_class = "concurrency"
