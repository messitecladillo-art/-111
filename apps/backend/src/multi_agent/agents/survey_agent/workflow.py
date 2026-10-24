"""Survey Agent: questionnaire and sampling design. Role-specific internal step order and output rules."""

from multi_agent.agents.contracts import AgentRole
from multi_agent.agents.runtime import InternalWorkflow
from .schemas import SurveyInput, SurveyOutput
from .state import SurveyState
from .tools import check_questionnaire


class SurveyWorkflow(InternalWorkflow[SurveyState]):
    role = AgentRole.SURVEY
    input_type = SurveyInput
    output_type = SurveyOutput
    state_type = SurveyState
    steps = ("design_variables", "design_questionnaire", "design_sampling",)

    def validate_output(self, state: SurveyState, output: SurveyOutput) -> None:
        super().validate_output(state, output)
        if output.deliverable.pilot_plan.get("status", "planned") != "planned":
            raise ValueError("A pilot plan cannot claim completed fieldwork")
        if not output.errors and not output.unresolved_questions:
            check_questionnaire(output.deliverable.questionnaire)
