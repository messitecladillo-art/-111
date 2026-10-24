"""Compatibility registry for the five independently defined agent packages.

Role metadata and contracts live beside each role implementation. This module
only gathers those definitions for workflow discovery and older imports.
"""

from multi_agent.agents.contracts import AgentRole, RoleDefinition
from multi_agent.agents.data_agent.role import ROLE as DATA_ROLE
from multi_agent.agents.research_agent.role import ROLE as RESEARCH_ROLE
from multi_agent.agents.reviewer_agent.role import ROLE as REVIEWER_ROLE
from multi_agent.agents.survey_agent.role import ROLE as SURVEY_ROLE
from multi_agent.agents.writing_agent.role import ROLE as WRITING_ROLE

AGENT_ROLES: tuple[RoleDefinition, ...] = (
    RESEARCH_ROLE,
    SURVEY_ROLE,
    DATA_ROLE,
    WRITING_ROLE,
    REVIEWER_ROLE,
)
ROLE_BY_ID = {definition.role: definition for definition in AGENT_ROLES}

__all__ = ["AgentRole", "RoleDefinition", "AGENT_ROLES", "ROLE_BY_ID"]
