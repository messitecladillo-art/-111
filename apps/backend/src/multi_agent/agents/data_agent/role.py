from multi_agent.agents.contracts import AgentRole, RoleDefinition

ROLE = RoleDefinition(
    role=AgentRole.DATA,
    title="Data Agent",
    focus="数据处理与统计分析",
    responsibilities=("检查调查数据", "清洗数据", "选择统计方法", "计算分析并生成图表"),
    deliverables=("统计结果", "分析图表"),
    prompt_file="data.md",
)
