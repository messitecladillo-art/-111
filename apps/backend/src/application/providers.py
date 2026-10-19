import json

from infrastructure.llm import ChatCompletionClient
from multi_agent.agents.survey_agent.services.proposals import prompt

class LiveProvider(ChatCompletionClient):
    async def topic_agent(self, config, key, message, selected):
        return await self.complete(config, key, message, 65536)

    async def topic(self, config, key, message, selected):
        return await self.complete(config, key, message, 65536)

    async def __call__(self, config, key, brief):
        return await self.complete(config, key, prompt(brief), 32768)

    async def answer(self, config, key, message, spec):
        """One simulated-respondent turn for a 硅基样本 run; `spec` is for fixtures only."""
        return await self.complete(config, key, message, 65536)


class FixtureProvider:
    def __init__(self):
        self.calls = 0

    async def __call__(self, config, key, brief):
        self.calls += 1
        # Conspicuous synthetic content, never an actual supplier/model receipt.
        return json.dumps({"title": "合成测试问卷 · 待实施", "objective": "合成需求用于测试保存与版本链。", "population": "合成对象，不是实际受访者。",
                           "items": [{"text": f"合成测试题项 {n}：您如何评价拟议服务？", "type": "single", "choices": ["选项甲", "选项乙"],
                                      "researchQuestion": "拟议服务体验如何？", "decisionUse": "拟支持预测试规划。"} for n in range(1, 4)]}, ensure_ascii=False)

    async def topic(self, config, key, message, selected):
        self.calls += 1
        return json.dumps({"items": [{"patternId": item["id"], "title": "合成测试提案 · " + item["title"][:130],
            "researchQuestion": item["question"], "decisionOwner": item["decisionOwner"], "decision": item["decision"],
            "whyHere": "合成模型验收。地区背景按来源核对，团队渠道需自行确认。", "firstWeekPlan": item["minimumEvidence"][:3],
            "unknowns": ["尚未联系真实合作方"], "sourceIds": item["sourceIds"][:3]} for item in selected]}, ensure_ascii=False)

    async def topic_agent(self, config, key, message, selected):
        self.calls += 1
        return json.dumps({"text": "合成测试 Agent 回执：仅验证会话与提案链，不代表真实模型建议。",
            "questions": ["合成测试：调查入口是否已经确认？"],
            "items": [{"patternId": item["id"], "title": "合成测试提案 · " + item["title"][:130],
                "researchQuestion": item["question"], "decisionOwner": item["decisionOwner"], "decision": item["decision"],
                "whyHere": "合成验收。地区和调查条件仍需核查。", "firstWeekPlan": item["minimumEvidence"][:3],
                "unknowns": ["尚未联系真实合作方"], "sourceIds": item["sourceIds"][:3]} for item in selected]}, ensure_ascii=False)

    async def answer(self, config, key, message, spec):
        self.calls += 1
        # Conspicuously synthetic answers: first option, lowest point, a labelled placeholder text.
        def pick(item):
            if item["type"] == "single":
                return item["codes"][0] if item["codes"] else None
            if item["type"] == "multi":
                return item["codes"][:1] or None
            if item["type"] in ("likert", "number"):
                return item["min"] if item["min"] is not None else 0
            return "合成测试回答，不代表任何人的观点。"
        if spec["mode"] == "single":
            return json.dumps({"value": pick(spec["questions"][0]), "unclear": ""}, ensure_ascii=False)
        return json.dumps({"answers": [{"variable": item["variable"], "value": pick(item), "unclear": ""} for item in spec["questions"]]}, ensure_ascii=False)
