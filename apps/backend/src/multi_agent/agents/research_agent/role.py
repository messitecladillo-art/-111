from multi_agent.agents.contracts import AgentRole, RoleDefinition

ROLE = RoleDefinition(
    role=AgentRole.RESEARCH,
    title="Research Agent",
    focus="选题与研究设计",
    responsibilities=("搜集资料", "提出选题", "分析可行性", "设计研究问题与研究框架"),
    deliverables=("选题报告", "研究方案"),
    prompt_file="research.md",
)
