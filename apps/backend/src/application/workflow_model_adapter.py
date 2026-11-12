"""Trusted public-Agent wiring; the injected caller owns credentials and receipts."""
from copy import deepcopy
import json

from application.agent_model_bindings import ROLE_STEPS
from multi_agent.agents.contracts import AgentRole
from multi_agent.agents.research_agent import ResearchAgent, ResearchOutput
from multi_agent.agents.survey_agent import SurveyAgent, SurveyOutput
from multi_agent.agents.data_agent import DataAgent, DataOutput
from multi_agent.agents.writing_agent import WritingAgent, WritingOutput
from multi_agent.agents.reviewer_agent import ReviewerAgent, ReviewerOutput
from multi_agent.prompt_registry import PROMPT_VERSION, build_messages
from multi_agent.workflow.handlers import create_agent_handlers
from shared.contracts import strict_json, fingerprint
from shared.errors import ProviderFailure

ADAPTER_VERSION = 'workflow-model/v1'
AGENTS = {
    AgentRole.RESEARCH: (ResearchAgent, ResearchOutput),
    AgentRole.SURVEY: (SurveyAgent, SurveyOutput),
    AgentRole.DATA: (DataAgent, DataOutput),
    AgentRole.WRITING: (WritingAgent, WritingOutput),
    AgentRole.REVIEWER: (ReviewerAgent, ReviewerOutput),
}


def schema_instruction(role, step):
    output_type = AGENTS[role][1]
    schema = (output_type.model_json_schema() if step == ROLE_STEPS[role.value][-1]
              else {'type': 'object', 'description': '当前内部步骤的结构化分析，不能声称读取未提供资料。'})
    return ('\n仅返回一个完整JSON对象，不使用Markdown代码围栏。最终步骤须符合以下JSON Schema：\n'
            + json.dumps(schema, ensure_ascii=False, separators=(',', ':')))


def instruction_hashes(role):
    return {f'{role.value}.{step}': fingerprint(build_messages(role, {}, step=step)[0]['content'] + schema_instruction(role, step))
            for step in ROLE_STEPS[role.value]}


def model_handler(role, invoke):
    """Only JSON reasoning is delegated. Models cannot execute Python or tools.

    Existing role validators reject invented references, fabricated computation,
    unreceipted exports and contradictory reviews. Tool adapters are a separate
    explicit integration; this bridge never synthesizes successful tool results.
    """
    agent_type, _ = AGENTS[role]
    final_step = ROLE_STEPS[role.value][-1]

    def execute(request):
        messages = deepcopy(request.messages)
        messages[0]['content'] += schema_instruction(role, request.step)
        raw = invoke(f'{role.value}.{request.step}', messages)
        try:
            value = strict_json(raw)
            if type(value) is not dict:
                raise ValueError
            if role is AgentRole.REVIEWER and request.step == final_step:
                # This model-only bridge has no file audit/export capabilities.
                # A model's assertion cannot certify a submission as ready.
                if value.get('deliverable', {}).get('competition_readiness', {}).get('status') == 'ready':
                    raise ValueError
            return value
        except Exception:
            raise ProviderFailure('invalid_response') from None

    agent = agent_type(executors={step: execute for step in ROLE_STEPS[role.value]})
    return create_agent_handlers({role: agent})[role]


def public_materials(state):
    """Whitelist the source envelope; reject rather than silently drop extra data.

    Raw questionnaires/answer rows, media and arbitrary context are not a model
    input contract. Upstream typed Agent outputs are added by the public handler,
    and bounded derived results are covered explicitly by the role consent.
    """
    def strings(value, allowed):
        if type(value) is not dict or set(value) - set(allowed):
            raise ValueError('unsupported_model_materials')
        for key, item in value.items():
            if key == 'researchQuestions':
                if type(item) is not list or len(item) > 20 or any(type(x) is not str or len(x) > 1000 for x in item):
                    raise ValueError('unsupported_model_materials')
            elif type(item) is not str or len(item) > 8000:
                raise ValueError('unsupported_model_materials')
        return deepcopy(value)

    requirements = strings(state.requirements, ('goal', 'title', 'geography', 'population', 'decisionOwner', 'decision', 'researchQuestions'))
    constraints = strings(state.constraints, ('edition', 'group', 'region', 'track', 'stage', 'deadline', 'notes'))
    if type(state.context) is not dict or set(state.context) - {'literature', 'user_feedback'}:
        raise ValueError('unsupported_model_materials')
    if 'user_feedback' in state.context:
        strings({'user_feedback': state.context['user_feedback']}, ('user_feedback',))
    literature = state.context.get('literature', [])
    if type(literature) is not list or len(literature) > 20:
        raise ValueError('unsupported_model_materials')
    for item in literature:
        strings(item, ('title', 'sourceRef', 'excerpt', 'location'))
        if set(item) != {'title', 'sourceRef', 'excerpt', 'location'} or item['sourceRef'] not in state.evidence_refs:
            raise ValueError('unsupported_model_materials')
    return {'requirements': requirements, 'context': deepcopy(state.context),
            'constraints': constraints, 'inputArtifactRefs': list(state.input_artifact_refs),
            'artifactRefs': list(state.artifact_refs), 'evidenceRefs': list(state.evidence_refs),
            'upstreamOutputs': deepcopy(state.agent_outputs), 'promptVersion': PROMPT_VERSION,
            'adapterVersion': ADAPTER_VERSION}
