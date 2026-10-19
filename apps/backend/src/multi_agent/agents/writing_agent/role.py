from multi_agent.agents.contracts import AgentRole, RoleDefinition

ROLE = RoleDefinition(
    role=AgentRole.WRITING,
    title="Writing Agent",
    focus="报告撰写与成果生成",
    responsibilities=("依据研究设计与分析结果组织报告", "生成摘要、结论、建议和报告草稿"),
    deliverables=("调查报告", "Word 草稿"),
    prompt_file="writing.md",
)
