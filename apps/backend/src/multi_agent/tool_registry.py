"""Unified typed tool registry across StatisticalSandbox (ISA), EpistemicGraph, Reviewer, and AgentChat."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Literal, Sequence

ToolGroup = Literal["isa", "epistemic", "reviewer", "orchestrator", "sandbox", "grounding"]
RiskTier = Literal["readonly", "workspace_draft", "billable_or_commit"]

_ALLOWED_GROUPS = frozenset(("isa", "epistemic", "reviewer", "orchestrator", "sandbox", "grounding"))
_ALLOWED_TIERS = frozenset(("readonly", "workspace_draft", "billable_or_commit"))

_CHAT_ROOMS = (
    "overview", "diagnose", "rules", "design", "sampling", "analysis",
    "canvas", "editor", "defense", "cases", "silicon", "exam",
    "preflight", "workspace", "services",
)
_CHAT_STAGES = ("chat", "paper", "advisors", "library")
_CHAT_STUDIOS = ("chart", "code", "writing", "coach")


@dataclass(frozen=True)
class ToolSpec:
    """Canonical specification for one model-callable tool."""

    name: str
    zh_label: str
    group: str
    mutates: bool
    risk_tier: str
    description: str
    parameters: dict[str, Any]

    def __post_init__(self) -> None:
        if self.group not in _ALLOWED_GROUPS:
            raise ValueError(f"invalid_tool_group:{self.group}")
        if self.risk_tier not in _ALLOWED_TIERS:
            raise ValueError(f"invalid_risk_tier:{self.risk_tier}")


def _obj_schema(
    properties: dict[str, Any],
    *,
    required: list[str] | tuple[str, ...] = (),
) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(required),
        "additionalProperties": False,
    }


def _str_list(description: str) -> dict[str, Any]:
    return {"type": "array", "items": {"type": "string"}, "description": description}


def isa_tool_specs() -> tuple[ToolSpec, ...]:
    """Return canonical specifications for all 21 StatisticalSandbox operators."""
    return (
        ToolSpec(
            name="inspect_distribution",
            zh_label="变量分布与缺失审计",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="检查非文本变量的样本量、缺失率、均值/标准差、中位数/IQR、偏度与频数分布，返回统计诊断信号。",
            parameters=_obj_schema({
                "variables": _str_list("可选待检查变量名列表；省略时检查全部非文本变量。"),
            }),
        ),
        ToolSpec(
            name="apply_cleaning_pipeline",
            zh_label="四步有状态问卷清洗",
            group="isa",
            mutates=True,
            risk_tier="workspace_draft",
            description="执行有效应答率过滤与量表直选零方差清洗，并生成可追溯的数据清洗记录。",
            parameters=_obj_schema({
                "min_valid_ratio": {"type": "number", "default": 0.7, "description": "最低可见题有效作答率阈值。"},
                "drop_straightliners": {"type": "boolean", "default": True, "description": "是否剔除李克特量表零方差规律作答样本。"},
                "min_likert_for_straightline": {"type": "integer", "default": 4, "description": "触发规律作答判定的最少连续李克特题项数。"},
            }),
        ),
        ToolSpec(
            name="purify_scale_reliability",
            zh_label="量表信度与 CITC 净化",
            group="isa",
            mutates=True,
            risk_tier="workspace_draft",
            description="计算构念题项的 Cronbach's α 与校正题总相关 (CITC)，支持自动剔除负向/低 CITC 题项并合成衍生构念变量。",
            parameters=_obj_schema(
                {
                    "construct_name": {"type": "string", "description": "合成构念名称（将生成 construct:<construct_name>）。"},
                    "variables": _str_list("参与信度检验与合成的量表题项变量列表（至少 2 题）。"),
                    "drop_negative_or_low_citc": {"type": "boolean", "default": False, "description": "是否剔除 CITC 低于阈值的题项后重新计算。"},
                    "citc_threshold": {"type": "number", "default": 0.3, "description": "CITC 保留阈值，默认 0.30。"},
                },
                required=["construct_name", "variables"],
            ),
        ),
        ToolSpec(
            name="factor_suitability_kmo",
            zh_label="KMO 与 Bartlett 因子适切性检验",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="计算题项群的整体 KMO、个体 MSA 以及 Bartlett 球形度卡方与 p 值，评估是否适合因子分析。",
            parameters=_obj_schema(
                {"variables": _str_list("参与 KMO/Bartlett 检验的数值/量表变量列表（至少 3 个）。")},
                required=["variables"],
            ),
        ),
        ToolSpec(
            name="test_group_difference",
            zh_label="组间差异检验（参数/非参数/卡方）",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="根据结局类型与偏态特征自动或指定执行 Welch t、单因素 ANOVA、Mann-Whitney U、Kruskal-Wallis H 或列联表卡方检验。",
            parameters=_obj_schema(
                {
                    "outcome": {"type": "string", "description": "结局变量名（数值、李克特或单选分类）。"},
                    "group_var": {"type": "string", "description": "分组变量名。"},
                    "method": {
                        "type": "string",
                        "enum": ["auto", "welch_t", "anova", "chi_square", "mann_whitney", "kruskal_wallis", "nonparametric"],
                        "default": "auto",
                        "description": "检验方法；auto 在强偏态时自动降级为非参数检验。",
                    },
                },
                required=["outcome", "group_var"],
            ),
        ),
        ToolSpec(
            name="fit_linear_regression",
            zh_label="线性回归与 Ridge/HC3 稳健估计",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="拟合多元 OLS 或 Ridge 收缩回归，自动计算 VIF 共线性诊断、Breusch-Pagan 异方差检验及 HC1/HC3 稳健标准误。",
            parameters=_obj_schema(
                {
                    "outcome": {"type": "string", "description": "连续因变量名称。"},
                    "predictors": _str_list("自变量名称列表（支持已合成的 construct:* 变量）。"),
                    "ridge_lambda": {"type": "number", "default": 0.0, "description": "L2 岭回归惩罚系数 λ；>0 时抑制高 VIF 共线性。"},
                    "cov_type": {
                        "type": "string",
                        "enum": ["auto", "hc1", "hc3"],
                        "default": "auto",
                        "description": "协方差估计方式，选 auto 时若检出异方差将自动切换为 HC3 稳健标准误。",
                    },
                },
                required=["outcome", "predictors"],
            ),
        ),
        ToolSpec(
            name="fit_logistic_regression",
            zh_label="二元 Logistic 与分离惩罚估计",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="拟合二元 Logistic 回归输出优势比 OR 与 95% CI，检测准完全分离告警并支持 L2 惩罚稳定估计。",
            parameters=_obj_schema(
                {
                    "outcome": {"type": "string", "description": "二元分类或阈值化结局变量名。"},
                    "predictors": _str_list("预测变量列表。"),
                    "positive_code": {
                        "anyOf": [{"type": "string"}, {"type": "integer"}],
                        "description": "可选正类编码值。",
                    },
                    "l2_penalty": {"type": "number", "default": 0.0, "description": "L2 正则惩罚系数；检测到分离告警时应设 >0。"},
                },
                required=["outcome", "predictors"],
            ),
        ),
        ToolSpec(
            name="test_mediation_effect",
            zh_label="Bootstrap 中介效应路径检验",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="使用确定性 Bootstrap 重抽样与 Sobel 检验估计 X→M→Y 总效应、直接效应与间接效应 95% CI。",
            parameters=_obj_schema(
                {
                    "predictor": {"type": "string", "description": "自变量 X。"},
                    "mediator": {"type": "string", "description": "中介变量 M。"},
                    "outcome": {"type": "string", "description": "因变量 Y。"},
                    "bootstrap_samples": {"type": "integer", "default": 200, "description": "Bootstrap 次数（50-500）。"},
                    "seed": {"type": "integer", "default": 42, "description": "随机种子。"},
                },
                required=["predictor", "mediator", "outcome"],
            ),
        ),
        ToolSpec(
            name="scan_subgroup_heterogeneity",
            zh_label="子群异质性与辛普森悖论扫描",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="按调节维度分层估计斜率与显著性，扫描总体均值掩盖下的子群符号反转（辛普森悖论）。",
            parameters=_obj_schema(
                {
                    "outcome": {"type": "string", "description": "因变量名。"},
                    "predictor": {"type": "string", "description": "核心预测变量名。"},
                    "moderators": _str_list("待扫描的调节维度变量列表。"),
                },
                required=["outcome", "predictor", "moderators"],
            ),
        ),
        ToolSpec(
            name="check_common_method_bias",
            zh_label="Harman 共同方法偏差与游程检验",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="执行 Harman 单因子检验（警戒线 40%）及 Wald-Wolfowitz 游程随机性检验。",
            parameters=_obj_schema(
                {
                    "variables": _str_list("参与共同方法偏差检验的题项列表（至少 3 个）。"),
                    "sequence_var": {"type": "string", "description": "可选用于游程检验的序列变量名。"},
                },
                required=["variables"],
            ),
        ),
        ToolSpec(
            name="compute_correlation_matrix",
            zh_label="Spearman / Pearson 相关矩阵",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="计算多变量配对相关系数矩阵与 p 值，识别 |r|≥0.80 的高共线变量对。",
            parameters=_obj_schema(
                {
                    "variables": _str_list("待计算相关矩阵的变量列表（至少 2 个）。"),
                    "method": {
                        "type": "string",
                        "enum": ["spearman", "pearson"],
                        "default": "spearman",
                        "description": "相关系数计算方式，可选 spearman 秩相关或 pearson 线性相关。",
                    },
                },
                required=["variables"],
            ),
        ),
        ToolSpec(
            name="estimate_staggered_did_att",
            zh_label="交错 DID 队列动态 ATT 估计",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="基于 Callaway-Sant'Anna 干净控制组估计多期交错试点 ATT(g,t)，并对照静态 TWFE 负权重偏误。",
            parameters=_obj_schema(
                {
                    "outcome": {"type": "string", "description": "结局指标变量名。"},
                    "time_var": {"type": "string", "description": "期次/时间变量名。"},
                    "cohort_var": {"type": "string", "description": "首次干预队列变量名。"},
                    "never_treated_value": {"type": "number", "default": 0.0, "description": "从未干预组编码值，默认 0.0。"},
                },
                required=["outcome", "time_var", "cohort_var"],
            ),
        ),
        ToolSpec(
            name="compute_conformal_prediction_band",
            zh_label="Split Conformal 无分布预测区间",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="执行分布自由 Split Conformal 校准，给出有限样本覆盖率保证的预测区间半宽 q̂ 与高波动预警。",
            parameters=_obj_schema(
                {
                    "outcome": {"type": "string", "description": "预测目标变量名。"},
                    "predictors": _str_list("特征变量列表。"),
                    "alpha": {"type": "number", "default": 0.1, "description": "显著性违约率 α（0.01-0.45），目标覆盖率为 1-α。"},
                    "calibration_ratio": {"type": "number", "default": 0.35, "description": "校准集比例（0.20-0.60）。"},
                },
                required=["outcome", "predictors"],
            ),
        ),
        ToolSpec(
            name="run_kano_better_worse",
            zh_label="Kano 模型属性归类与 Better-Worse",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="基于正/反向配对题项划分 M/O/A/I/R/Q 属性，计算 Better 满意增益与 Worse 失望系数及反向作答预警。",
            parameters=_obj_schema(
                {
                    "pairs": {
                        "type": "array",
                        "description": "Kano 正反向配对定义列表。",
                        "items": {
                            "type": "object",
                            "properties": {
                                "feature": {"type": "string", "description": "需求特性名称。"},
                                "functional_var": {"type": "string", "description": "具备该特性时的正向评价变量。"},
                                "dysfunctional_var": {"type": "string", "description": "不具备该特性时的反向评价变量。"},
                            },
                            "required": ["feature", "functional_var", "dysfunctional_var"],
                            "additionalProperties": False,
                        },
                    },
                    "scale_max": {"type": "integer", "default": 5, "description": "原始量表最高分值（3-11，默认 5）。"},
                },
                required=["pairs"],
            ),
        ),
        ToolSpec(
            name="estimate_rdd_sharp_local",
            zh_label="Sharp RDD 断点局部线性回归",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="在配置变量断点处拟合三角核局部线性回归 τ，并运行 0.5×/1.0×/1.5× 多带宽敏感性与断点密度操纵检验。",
            parameters=_obj_schema(
                {
                    "outcome": {"type": "string", "description": "结果变量名。"},
                    "running_var": {"type": "string", "description": "驱动/配置变量（Running Variable）名。"},
                    "cutoff": {"type": "number", "default": 0.0, "description": "政策/准入断点阈值。"},
                    "bandwidth": {"type": "number", "description": "可选主带宽 h；省略时自动按 IK 口径选取。"},
                },
                required=["outcome", "running_var"],
            ),
        ),
        ToolSpec(
            name="run_psm_balance_att",
            zh_label="PSM 倾向得分匹配与平衡检验",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="执行 L2 正则化倾向得分 1:1 卡钳近邻匹配，汇报匹配净效应 ATT 及协变量匹配前后 |SMD| 降幅。",
            parameters=_obj_schema(
                {
                    "outcome": {"type": "string", "description": "结果变量名。"},
                    "treatment": {"type": "string", "description": "0/1 二元干预变量名。"},
                    "covariates": _str_list("待平衡的混淆协变量列表。"),
                    "caliper": {"type": "number", "default": 0.2, "description": "Logit 倾向得分标准差卡钳倍数，默认 0.20。"},
                },
                required=["outcome", "treatment", "covariates"],
            ),
        ),
        ToolSpec(
            name="compute_entropy_topsis_rank",
            zh_label="熵权 TOPSIS 多指标综合评价",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="按实体聚合多维正/负向指标，使用信息熵客观赋权并计算相对理想解贴近度 C_i 与梯度排名。",
            parameters=_obj_schema(
                {
                    "entity_var": {"type": "string", "description": "评价对象/区域实体分组变量名。"},
                    "indicators": _str_list("参与综合评价的数值指标列表（至少 2 个）。"),
                    "negative_indicators": _str_list("可选逆向（成本型，越小越好）指标名称列表。"),
                },
                required=["entity_var", "indicators"],
            ),
        ),
        ToolSpec(
            name="estimate_iv_2sls",
            zh_label="IV-2SLS 工具变量局部因果估计",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="拟合两阶段最小二乘估计 β_IV、第一阶段弱工具 F 统计量、HC1 稳健标准误与 Wu-Hausman 内生性检验。",
            parameters=_obj_schema(
                {
                    "outcome": {"type": "string", "description": "结果变量 Y。"},
                    "treatment": {"type": "string", "description": "内生处理变量 X。"},
                    "instrument": {"type": "string", "description": "外生工具变量 Z。"},
                    "controls": _str_list("可选控制变量列表。"),
                },
                required=["outcome", "treatment", "instrument"],
            ),
        ),
        ToolSpec(
            name="run_ab_sequential_test",
            zh_label="序贯 A/B 实验与 SRM/护栏检验",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="检验 0/1 分流实验样本比例失衡 (SRM)、O'Brien-Fleming 序贯显著性边界与安全护栏指标劣化风险。",
            parameters=_obj_schema(
                {
                    "treatment": {"type": "string", "description": "0/1 实验分流臂变量名。"},
                    "outcome": {"type": "string", "description": "核心北极星指标变量名。"},
                    "guardrail": {"type": "string", "description": "可选安全护栏指标变量名。"},
                    "expected_ratio": {"type": "number", "default": 0.5, "description": "预期实验组分配比例，默认 0.5。"},
                    "info_fraction": {"type": "number", "default": 1.0, "description": "当前序贯信息进度比例（0.1-1.0）。"},
                },
                required=["treatment", "outcome"],
            ),
        ),
        ToolSpec(
            name="estimate_kaplan_meier_logrank",
            zh_label="Kaplan-Meier 生存曲线与 Log-Rank",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="估计两组 Kaplan-Meier 生存函数、共同上限限制平均生存时间 RMST 差值与 Mantel-Haenszel Log-Rank 检验。",
            parameters=_obj_schema(
                {
                    "time_var": {"type": "string", "description": "随访/留存时长变量名（正数）。"},
                    "event_var": {"type": "string", "description": "0/1 终点事件指示变量名（1=事件发生，0=右删失）。"},
                    "group_var": {"type": "string", "description": "对比分组变量名。"},
                },
                required=["time_var", "event_var", "group_var"],
            ),
        ),
        ToolSpec(
            name="run_meta_random_effects",
            zh_label="DerSimonian-Laird 随机效应 Meta 合成",
            group="isa",
            mutates=False,
            risk_tier="readonly",
            description="执行随机效应 Meta 合成，计算合并效应 θ_RE、异质性 I²/τ² 与 Egger 漏斗图发表偏倚检验。",
            parameters=_obj_schema(
                {
                    "study_var": {"type": "string", "description": "纳入研究标识变量名。"},
                    "effect_var": {"type": "string", "description": "各研究效应量变量名。"},
                    "se_var": {"type": "string", "description": "各研究标准误变量名（正数）。"},
                },
                required=["study_var", "effect_var", "se_var"],
            ),
        ),
    )


def epistemic_tool_specs() -> tuple[ToolSpec, ...]:
    """Return specification for dynamic epistemic belief graph updates."""
    return (
        ToolSpec(
            name="mutate_epistemic_graph",
            zh_label="研究论证脉络动态演进",
            group="epistemic",
            mutates=True,
            risk_tier="workspace_draft",
            description="依据实证检验结果更新研究论证脉络，支持新增或修订结论节点、记录分析方向调整并标记待复核结论。",
            parameters=_obj_schema(
                {
                    "action": {
                        "type": "string",
                        "enum": ["upsert_node", "record_pivot", "mark_dirty"],
                        "description": "论证脉络变更动作类型。",
                    },
                    "node_id": {"type": "string", "description": "目标或新增节点编号。"},
                    "kind": {
                        "type": "string",
                        "enum": [
                            "question", "hypothesis", "construct", "item", "cleaning_rule",
                            "stat_snapshot", "mother_insight", "claim", "falsification_check",
                            "policy_lever", "literature_source",
                        ],
                        "default": "claim",
                        "description": "节点语义类型。",
                    },
                    "label": {"type": "string", "description": "节点中文展示标题。"},
                    "summary": {"type": "string", "description": "节点结论摘要或修订依据。"},
                    "old_node_id": {"type": "string", "description": "记录分析转向时被替代的原假设或原节点编号。"},
                    "evidence_snapshot_id": {"type": "string", "description": "支撑本次结论修订的已核验统计快照编号。"},
                    "refute_old": {"type": "boolean", "default": False, "description": "是否将原研究假设标记为已被实证证伪。"},
                },
                required=["action", "node_id"],
            ),
        ),
    )


def reviewer_tool_specs() -> tuple[ToolSpec, ...]:
    """Return specifications for read-only Reviewer falsification and hash-audit tools."""
    return (
        ToolSpec(
            name="verify_evidence_hashes",
            zh_label="统计结果完整性核验",
            group="reviewer",
            mutates=False,
            risk_tier="readonly",
            description="逐一核对上游统计检验快照编号与校验指纹完整性，排查伪造或缺失的证据链。",
            parameters=_obj_schema({
                "snapshot_ids": _str_list("可选待核验的快照 ID 列表；省略时核验全部声明快照。"),
            }),
        ),
        ToolSpec(
            name="challenge_subgroup_robustness",
            zh_label="子群异质性只读反证挑战",
            group="reviewer",
            mutates=False,
            risk_tier="readonly",
            description="对核心自变量与因变量按调节变量执行只读子群斜率复核，检验是否存在辛普森悖论反转边界。",
            parameters=_obj_schema(
                {
                    "outcome": {"type": "string", "description": "因变量名。"},
                    "predictor": {"type": "string", "description": "核心预测变量名。"},
                    "moderators": _str_list("调节维度变量列表。"),
                },
                required=["outcome", "predictor", "moderators"],
            ),
        ),
    )


def chat_orchestrator_tool_specs() -> tuple[ToolSpec, ...]:
    """Return unified specifications for all 19 /agent chat orchestrator tools."""
    return (
        ToolSpec(
            name="next",
            zh_label="下一步研究建议",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="按研究动线给出当前最该推进的一步。",
            parameters=_obj_schema({}),
        ),
        ToolSpec(
            name="light",
            zh_label="模块照度查询",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="读取项目各研究模块完成度照度。",
            parameters=_obj_schema({
                "room": {"type": "string", "enum": list(_CHAT_ROOMS), "description": "可选指定模块 ID。"},
            }),
        ),
        ToolSpec(
            name="blind",
            zh_label="研究盲区排查",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="排查尚未通过的合规与质量检查项。",
            parameters=_obj_schema({
                "room": {"type": "string", "enum": list(_CHAT_ROOMS), "description": "可选指定模块 ID。"},
            }),
        ),
        ToolSpec(
            name="trace",
            zh_label="图表数字溯源",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="回溯报告图表或指标背后的实证数字来处。",
            parameters=_obj_schema(
                {"reference": {"type": "string", "maxLength": 20, "description": "图表编号或引用标识，如“图 3-1”。"}},
                required=["reference"],
            ),
        ),
        ToolSpec(
            name="results",
            zh_label="读取已登记分析结果",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="读取项目中已登记的统计方法、有效样本量、统计量与确认发现。",
            parameters=_obj_schema({
                "query": {"type": "string", "maxLength": 40, "description": "可选按标题、方法或变量名筛选。"},
            }),
        ),
        ToolSpec(
            name="place",
            zh_label="回填结果至报告蓝图",
            group="orchestrator",
            mutates=True,
            risk_tier="workspace_draft",
            description="把尚未写入报告的登记分析结果按蓝图匹配写入对应章节（浏览器将先请用户确认）。",
            parameters=_obj_schema({}),
        ),
        ToolSpec(
            name="open",
            zh_label="打开右侧工作台模块",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="在右侧工作区打开指定研究模块面板。",
            parameters=_obj_schema(
                {"room": {"type": "string", "enum": list(_CHAT_ROOMS), "description": "目标模块 ID。"}},
                required=["room"],
            ),
        ),
        ToolSpec(
            name="lookup",
            zh_label="知识镜概念公式检索",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="在本地已审核知识镜中查询统计概念定义、数学公式与文献出处。",
            parameters=_obj_schema(
                {"query": {"type": "string", "maxLength": 60, "description": "待检索的概念或方法关键词。"}},
                required=["query"],
            ),
        ),
        ToolSpec(
            name="draft",
            zh_label="起草调查问卷",
            group="orchestrator",
            mutates=True,
            risk_tier="billable_or_commit",
            description="根据研究需求起草结构化调查问卷（执行前将先请用户确认）。",
            parameters=_obj_schema(
                {"brief": {"type": "string", "maxLength": 600, "description": "研究需求与问卷设计简报。"}},
                required=["brief"],
            ),
        ),
        ToolSpec(
            name="stage",
            zh_label="切换主工作舞台视图",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="切换主工作台视图至对话、报告成文页、专家圆桌或研究资料库。",
            parameters=_obj_schema(
                {"view": {"type": "string", "enum": list(_CHAT_STAGES), "description": "目标舞台视图。"}},
                required=["view"],
            ),
        ),
        ToolSpec(
            name="studio",
            zh_label="呼出交互专业工坊卡片",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="按需呼出图表生图、统计代码、写作润色或答辩模拟工坊卡片。",
            parameters=_obj_schema(
                {"kind": {"type": "string", "enum": list(_CHAT_STUDIOS), "description": "工坊类型。"}},
                required=["kind"],
            ),
        ),
        ToolSpec(
            name="draft_section",
            zh_label="按实证事实起草报告章节",
            group="orchestrator",
            mutates=True,
            risk_tier="billable_or_commit",
            description="按当前已登记分析事实为指定报告章节起草候选稿（执行前将先请用户确认）。",
            parameters=_obj_schema(
                {"node": {"type": "string", "maxLength": 40, "description": "章节标题或编号，如“摘要”或“3.2”。"}},
                required=["node"],
            ),
        ),
        ToolSpec(
            name="generate_report",
            zh_label="一键生成整篇完整报告",
            group="orchestrator",
            mutates=True,
            risk_tier="billable_or_commit",
            description="基于当前研究主题与已登记事实生成完整报告候选稿（执行前将先请用户确认）。",
            parameters=_obj_schema({
                "topic": {"type": "string", "maxLength": 200, "description": "可选研究主题摘要。"},
            }),
        ),
        ToolSpec(
            name="simulate",
            zh_label="运行教学模拟全流程",
            group="orchestrator",
            mutates=True,
            risk_tier="workspace_draft",
            description="按当前或指定选题运行完整教学模拟研究并填充标注为模拟的样本与图表。",
            parameters=_obj_schema({
                "topic": {"type": "string", "maxLength": 200, "description": "可选模拟选题方向。"},
            }),
        ),
        ToolSpec(
            name="run_autonomous_research",
            zh_label="启动多步自主统计探索",
            group="orchestrator",
            mutates=True,
            risk_tier="billable_or_commit",
            description="按预设步数上限执行多步统计检验、异常诊断与稳健性复核闭环。",
            parameters=_obj_schema({
                "goal": {"type": "string", "maxLength": 200, "description": "可选自主探索研究目标。"},
            }),
        ),
        ToolSpec(
            name="recommend_resource",
            zh_label="推荐研究资源库模板与案例",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="按主题检索并推荐研究资料库中的方法模板、量表结构或国奖参考模式。",
            parameters=_obj_schema({
                "query": {"type": "string", "maxLength": 80, "description": "可选检索主题或方法关键词。"},
            }),
        ),
        ToolSpec(
            name="lookup_county",
            zh_label="县域实证背景档案检索",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="检索本地县域及区域调研背景线索与相关课题参考出处。",
            parameters=_obj_schema(
                {"query": {"type": "string", "maxLength": 80, "description": "县域/地区名称或调研场景关键词。"}},
                required=["query"],
            ),
        ),
        ToolSpec(
            name="verify_citation",
            zh_label="方法学文献与 DOI 核验",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="核验统计学与调研方法学文献的 DOI、作者、年份与期刊真实性，防止编造引用。",
            parameters=_obj_schema({
                "query": {"type": "string", "maxLength": 120, "description": "可选文献标题、作者或方法关键词。"},
                "doi": {"type": "string", "maxLength": 80, "description": "可选待核验 DOI 字符串。"},
            }),
        ),
        ToolSpec(
            name="render_sandbox_plot",
            zh_label="渲染统计结果矢量图表",
            group="orchestrator",
            mutates=False,
            risk_tier="readonly",
            description="在只读受限环境中将已登记统计快照绘制为矢量 SVG 图表，并自动完成防重叠与越界版式校准。",
            parameters=_obj_schema({
                "snapshotId": {"type": "string", "maxLength": 80, "description": "可选统计快照编号，缺省时取最新快照。"},
                "chartKind": {
                    "type": "string",
                    "enum": ["auto", "bar", "line", "forest", "dumbbell"],
                    "description": "可选目标图表类型。",
                },
            }),
        ),
    )


def sandbox_tool_specs() -> tuple[ToolSpec, ...]:
    """Return specifications for isolated SVG plotting and custom readonly stat tools."""
    return (
        ToolSpec(
            name="run_sandbox_plot",
            zh_label="统计矢量图表绘制与版式自检",
            group="sandbox",
            mutates=False,
            risk_tier="readonly",
            description="在离线只读环境中运行受控 Matplotlib 绘图脚本或从统计快照生成纯矢量 SVG 图表，并自动执行防重叠与越界校准。",
            parameters=_obj_schema(
                {
                    "snapshot_id": {"type": "string", "description": "可选统计快照编号，缺省时须提供 script 与 data。"},
                    "chart_kind": {
                        "type": "string",
                        "enum": ["auto", "bar", "line", "forest", "dumbbell"],
                        "default": "auto",
                        "description": "自动生成脚本时的目标图表类型。",
                    },
                    "script": {"type": "string", "description": "可选经安全白名单校验的只读 Matplotlib 绘图脚本。"},
                    "data": {"type": "object", "description": "可选注入绘图的汇总数据字典。"},
                },
            ),
        ),
        ToolSpec(
            name="run_custom_stat_script",
            zh_label="自定义只读汇总统计脚本",
            group="sandbox",
            mutates=False,
            risk_tier="readonly",
            description="在剥离开放文本的离线只读环境中运行自定义汇总统计脚本，仅返回聚合统计指标与校验指纹，阻断逐行原始样本回传。",
            parameters=_obj_schema(
                {
                    "script": {"type": "string", "description": "经安全白名单校验的只读汇总统计脚本，需将结果字典赋值给 RESULT。"},
                },
                required=["script"],
            ),
        ),
    )


def grounding_tool_specs() -> tuple[ToolSpec, ...]:
    """Return specifications for regional gazetteer and scholarly citation verification tools."""
    return (
        ToolSpec(
            name="lookup_county_gazetteer",
            zh_label="县域区划与地域课题检索",
            group="grounding",
            mutates=False,
            risk_tier="readonly",
            description="按 6 位行政区划代码或中文省市县名称检索全国 34 省/333 地级/2845 县域目录，关联本地实证热点模板与覆盖边界提示。",
            parameters=_obj_schema(
                {
                    "query": {"type": "string", "description": "6 位区划码或省/市/县名称关键词。"},
                    "limit": {"type": "integer", "default": 5, "description": "最大返回条数（1-20）。"},
                },
                required=["query"],
            ),
        ),
        ToolSpec(
            name="verify_scholarly_citation",
            zh_label="方法学文献与 DOI 真实性核验",
            group="grounding",
            mutates=False,
            risk_tier="readonly",
            description="核验统计学与调研方法学核心文献的 DOI、作者、年份与期刊信息（默认离线经审核基准库，防编造文献）。",
            parameters=_obj_schema(
                {
                    "query": {"type": "string", "description": "文献标题、作者或方法关键词。"},
                    "doi": {"type": "string", "description": "可选待核验 DOI 字符串。"},
                },
            ),
        ),
    )


def all_tool_specs() -> tuple[ToolSpec, ...]:
    """Return all 47 canonical ToolSpecs across ISA, Epistemic, Reviewer, Orchestrator, Sandbox, and Grounding."""
    return (
        *isa_tool_specs(),
        *epistemic_tool_specs(),
        *reviewer_tool_specs(),
        *chat_orchestrator_tool_specs(),
        *sandbox_tool_specs(),
        *grounding_tool_specs(),
    )


def to_agent_tools(specs: Sequence[ToolSpec] | None = None) -> list[dict[str, Any]]:
    """Serialize ToolSpecs into provider-neutral tool declarations for complete_agent_turn."""
    items = all_tool_specs() if specs is None else specs
    return [
        {
            "name": spec.name,
            "description": spec.description,
            "parameters": deepcopy(spec.parameters),
        }
        for spec in items
    ]


def to_openai_tools(specs: Sequence[ToolSpec] | None = None) -> list[dict[str, Any]]:
    """Serialize ToolSpecs into OpenAI / DeepSeek / Qwen / Compatible function tools."""
    items = all_tool_specs() if specs is None else specs
    return [
        {
            "type": "function",
            "function": {
                "name": spec.name,
                "description": spec.description,
                "parameters": deepcopy(spec.parameters),
            },
        }
        for spec in items
    ]


def to_gemini_function_declarations(specs: Sequence[ToolSpec] | None = None) -> list[dict[str, Any]]:
    """Serialize ToolSpecs into Gemini functionDeclarations items."""
    items = all_tool_specs() if specs is None else specs
    return [
        {
            "name": spec.name,
            "description": spec.description,
            "parameters": deepcopy(spec.parameters),
        }
        for spec in items
    ]


def to_anthropic_tools(specs: Sequence[ToolSpec] | None = None) -> list[dict[str, Any]]:
    """Serialize ToolSpecs into Anthropic Messages tool definitions."""
    items = all_tool_specs() if specs is None else specs
    return [
        {
            "name": spec.name,
            "description": spec.description,
            "input_schema": deepcopy(spec.parameters),
        }
        for spec in items
    ]


def public_tool_catalog() -> dict[str, Any]:
    """Return the secret-free public catalog of all registered Agent tools."""
    specs = all_tool_specs()
    counts: dict[str, int] = {}
    for spec in specs:
        counts[spec.group] = counts.get(spec.group, 0) + 1
    return {
        "schemaVersion": 1,
        "totalCount": len(specs),
        "groups": counts,
        "tools": [
            {
                "name": spec.name,
                "zhLabel": spec.zh_label,
                "group": spec.group,
                "mutates": spec.mutates,
                "riskTier": spec.risk_tier,
                "description": spec.description,
                "parameters": deepcopy(spec.parameters),
            }
            for spec in specs
        ],
    }
