import {
  COMPETITION_RULES,
  RULE_CORPUS_META,
  RULE_SCOPES,
  RULE_SOURCES,
} from "@/data/rule-corpus.generated";
import { COMPETITION_UPDATE } from "@/data/competition-update";
import {
  apiErrorResponse,
  assertOnlyKeys,
  noStoreJson,
  readJsonObject,
  requiredString,
} from "../_lib/http";

const DIMENSIONS = ["edition", "group", "region", "track", "stage"] as const;
type Dimension = (typeof DIMENSIONS)[number];
type RuleScopeRequest = Record<Dimension, string>;

export async function GET() {
  return noStoreJson({
    corpus: RULE_CORPUS_META,
    totalRules: COMPETITION_RULES.length,
    totalSources: RULE_SOURCES.length,
    competitionUpdate: COMPETITION_UPDATE,
    dimensions: Object.fromEntries(
      DIMENSIONS.map((dimension) => [
        dimension,
        availableValues(dimension),
      ]),
    ),
    notice: ruleNotice(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request, 4_096);
    assertOnlyKeys(body, DIMENSIONS);
    const requested = Object.fromEntries(
      DIMENSIONS.map((dimension) => [
        dimension,
        requiredString(body, dimension, {
          max: 80,
          label: dimensionLabel(dimension),
        }),
      ]),
    ) as RuleScopeRequest;

    const matchedScopeIds = RULE_SCOPES
      .filter((scope) => DIMENSIONS.every((dimension) => selectorMatches(scope[dimension], requested[dimension])))
      .map((scope) => scope.id);
    const rules = COMPETITION_RULES.filter((rule) => matchedScopeIds.includes(rule.scope_id));

    if (rules.length === 0) {
      return noStoreJson({
        match: "none",
        blocking: true,
        requested,
        rules: [],
        sources: [],
        coverage: [],
        unknowns: [
          "当前证据库没有与这五个维度同时匹配的官方规则快照。",
          "不得用其他届次、组别或阶段的规则替代；请取得当前适用的正式通知并完成核验。",
        ],
        corpus: RULE_CORPUS_META,
        competitionUpdate: COMPETITION_UPDATE,
        notice: ruleNotice(),
      });
    }

    const usedSourceIds = new Set(rules.map((rule) => rule.source_id));
    const sources = RULE_SOURCES.filter((source) => usedSourceIds.has(source.id));
    const coverage = RULE_SCOPES
      .filter((scope) => matchedScopeIds.includes(scope.id))
      .map((scope) => ({
        scopeId: scope.id,
        dimensions: Object.fromEntries(
          DIMENSIONS.map((dimension) => [
            dimension,
            scope[dimension].mode === "all" ? "all_values_in_source_scope" : "explicit_value",
          ]),
        ),
      }));

    return noStoreJson({
      match: "exact",
      blocking: false,
      requested,
      rules,
      sources,
      coverage,
      unknowns: [
        "本结果不证明已覆盖赛区、学校或后续阶段另行发布的补充通知。",
        "正式提交前必须再次核对当前通知、原始附件与更新时间。",
      ],
      corpus: RULE_CORPUS_META,
      notice: ruleNotice(),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function selectorMatches(
  selector: { readonly mode: string; readonly values?: readonly string[] },
  requested: string,
) {
  return selector.mode === "all" || selector.values?.includes(requested) === true;
}

function availableValues(dimension: Dimension) {
  const values = new Set<string>();
  let all = false;
  for (const scope of RULE_SCOPES) {
    const selector = scope[dimension];
    if (selector.mode === "all") all = true;
    else selector.values.forEach((value) => values.add(value));
  }
  return { mode: all ? "all" : "values", values: [...values] };
}

function dimensionLabel(dimension: Dimension) {
  return {
    edition: "届次",
    group: "组别",
    region: "赛区",
    track: "赛道",
    stage: "阶段",
  }[dimension];
}

function ruleNotice() {
  return {
    title: "历史核验快照，不自动代表其他范围",
    body: "解析器只返回五维范围同时匹配的已收录规则；没有匹配即阻断，不会回退套用旧届或其他组别规则。",
    snapshotVerifiedAt: RULE_CORPUS_META.snapshot.verified_at,
    independent: true,
  };
}
