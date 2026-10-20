"""Survey-owned tools. Existing SAV import remains in survey_import.py."""

from multi_agent.agents.contracts import ToolResult


def check_questionnaire(questionnaire: dict) -> ToolResult:
    """Check the Agent's proposal shape, not the separate persisted API design."""
    if not isinstance(questionnaire.get("title"), str) or not questionnaire["title"].strip():
        raise ValueError("Questionnaire title is required")
    sections = questionnaire.get("sections")
    if not isinstance(sections, list) or not sections or len(sections) > 30:
        raise ValueError("Questionnaire sections are required")
    ids = set()
    for section in sections:
        questions = section.get("questions") if isinstance(section, dict) else None
        if not isinstance(questions, list) or not questions:
            raise ValueError("Each section requires questions")
        for item in questions:
            if not isinstance(item, dict):
                raise ValueError("Invalid question")
            identifier = item.get("id")
            if not isinstance(identifier, str) or not identifier.strip() or identifier in ids:
                raise ValueError("Question IDs must be nonblank and unique")
            if not isinstance(item.get("text"), str) or not item["text"].strip():
                raise ValueError("Question text is required")
            ids.add(identifier)
            if len(ids) > 80:
                raise ValueError("Too many questions")
    return ToolResult(data={"valid_structure": True, "question_count": len(ids)})


def build_tools():
    return {"check_questionnaire": check_questionnaire}
