from multi_agent.agents.contracts import AgentRole, RoleDefinition

ROLE = RoleDefinition(
    role=AgentRole.REVIEWER,
    title="Reviewer Agent",
    focus="质量审核与竞赛评审",
    responsibilities=("检查研究逻辑", "核验数据与结论依据", "检查前后内容一致性", "检查竞赛规范"),
    deliverables=("审核意见", "修改建议"),
    prompt_file="reviewer.md",
)
