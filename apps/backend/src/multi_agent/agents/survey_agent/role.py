from multi_agent.agents.contracts import AgentRole, RoleDefinition

ROLE = RoleDefinition(
    role=AgentRole.SURVEY,
    title="Survey Agent",
    focus="问卷与抽样设计",
    responsibilities=("设计调查问卷", "定义研究变量", "设计抽样方案", "规划预测试与样本量估算"),
    deliverables=("问卷", "抽样方案"),
    prompt_file="survey.md",
)
