from __future__ import annotations

import json
import os
import re
import time
from abc import ABC, abstractmethod

import httpx

from collections.abc import Iterator

from .models import Candidate, ContextSnapshot, ModelConnection, ProviderGeneration, TokenUsage


def _context_user_text(context: ContextSnapshot) -> str:
    context_text = "\n".join(f"[{item.kind}] {item.title}\n{item.content}" for item in context.direct_inputs)
    focus_node_text = (
        f"\n\n当前锚点节点（回答或生成必须直接基于其主题与具体信息）：\n[{context.focus_node.kind}] {context.focus_node.title}\n{context.focus_node.content}"
        if context.focus_node and not context.current_node
        else ""
    )
    current_node_text = (
        f"\n\n必须修改的当前节点：\n[{context.current_node.kind}] {context.current_node.title}\n{context.current_node.content}"
        if context.current_node
        else ""
    )
    knowledge_text = "\n".join(context.knowledge)
    return f"目标：{context.goal}{focus_node_text}{current_node_text}\n\n左侧直接输入（辅助上下文）：\n{context_text}\n\n知识：\n{knowledge_text}"


class CandidateProvider(ABC):
    name: str

    @abstractmethod
    def generate(
        self,
        *,
        context: ContextSnapshot,
        count: int,
        model: str,
        generation_type: str,
        rows: int = 1,
        columns: int = 1,
    ) -> ProviderGeneration:
        raise NotImplementedError

    def stream_chat(self, *, context: ContextSnapshot, model: str, operation_mode: str = "chat") -> Iterator[str]:
        content = self.generate(context=context, count=1, model=model, generation_type="文本", rows=1, columns=1).candidates[0].content
        for start in range(0, len(content), 12):
            yield content[start:start + 12]
            if start + 12 < len(content):
                time.sleep(0.08)

    def stream_chat_events(self, *, context: ContextSnapshot, model: str, operation_mode: str = "chat") -> Iterator[tuple[str, str]]:
        for content in self.stream_chat(context=context, model=model, operation_mode=operation_mode):
            yield "content", content


class OpenAICompatibleProvider(CandidateProvider):
    name = "openai-compatible"

    def __init__(self, base_url: str, api_key: str, model_override: str | None = None, capabilities: list[str] | None = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model_override = model_override
        self.capabilities = capabilities or []

    def generate(self, *, context: ContextSnapshot, count: int, model: str, generation_type: str, rows: int = 1, columns: int = 1) -> ProviderGeneration:
        matrix_rule = (
            f"本次输出是一个 {rows} 行 x {columns} 列的整体内容矩阵，共 {count} 个节点。"
            "candidates 必须严格按从左到右、从上到下的行优先顺序返回。"
            "除非用户明确要求多个备选方案、不同方向或头脑风暴，否则这些节点不是互不相关的候选，而是同一份完整规划的连续拆分；"
            "同一行属于同一组/同一阶段，列表示组内先后步骤，后一节点必须承接前一节点，下一行必须承接上一行的结果。"
            "title 要直接标明组别和步骤/时段，content 要说明它与前后节点的衔接，禁止生成彼此无关的盲盒内容。"
            "若任务是旅行规划：每行默认代表一天，每列按时间先后代表当天行程；"
            "三列优先使用上午/下午/晚上，四列优先使用上午/中午/下午/晚上；"
            "每个节点结合需要写明时间、地点与活动、附近美食、从上一站的交通方式、预计用时和预算，并保持路线地理上连续。"
        )
        system = (
            "你是 NodeCanvas 的创意策划 Agent。只使用给定上下文，返回严格 JSON。"
            "当前锚点节点是本次任务的首要事实来源；即使用户指令很短，也必须基于该节点的具体内容回答或生成，禁止退化为与节点无关的通用模板。"
            "输出对象必须包含 candidates 数组，每项包含 title、content、tags、reason。"
            + matrix_rule
            + f"生成 {count} 个{generation_type}节点；默认相互衔接，仅在用户明确要求备选时才彼此差异。"
            "如果提供了必须修改的当前节点，title 必须保持当前节点标题，content 必须是优化后的完整正文，不要返回修改说明或前后缀。"
            f"所有面向用户的 JSON 字段必须使用{'中文' if context.response_language == 'zh-CN' else 'English'}回复。"
            + ("文本结果的 content 必须使用标准 Markdown 源码组织（标题、列表、强调等按需使用）。" if generation_type == "文本" else "")
        )
        user_text = _context_user_text(context)
        user_content: str | list[dict[str, object]] = user_text
        image_urls = [item.content for item in context.direct_inputs if item.kind == "image" and item.content.startswith(("http://", "https://", "data:image/"))]
        if image_urls and "vision" in self.capabilities:
            user_content = [{"type": "text", "text": user_text}] + [
                {"type": "image_url", "image_url": {"url": image_url}}
                for image_url in image_urls[:8]
            ]
        payload = {
            "model": self.model_override or model,
            "messages": [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": user_content,
                },
            ],
            "temperature": 0.75,
            "response_format": {"type": "json_object"},
        }
        try:
            with httpx.Client(timeout=90.0) as client:
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json=payload,
                )
            response.raise_for_status()
            body = response.json()
            content = body["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            candidates = [Candidate.model_validate(item) for item in parsed.get("candidates", [])]
            if len(candidates) < count:
                raise ValueError("model returned fewer candidates than requested")
            return ProviderGeneration(candidates=candidates[:count], usage=_usage_from_response(body, fallback_text=f"{system}\n{user_text}"))
        except (httpx.HTTPError, KeyError, ValueError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"model provider failed: {exc}") from exc

    def stream_chat_events(self, *, context: ContextSnapshot, model: str, operation_mode: str = "chat") -> Iterator[tuple[str, str]]:
        system = (
            "你是 NodeCanvas 的节点编辑 Agent。必须直接基于当前节点原文和用户要求完成修改。"
            "只输出修改后的完整正文，不要输出 JSON、修改说明、前后缀或内部思考过程。使用清晰的 Markdown 组织正文。"
            f"使用{'中文' if context.response_language == 'zh-CN' else 'English'}回复。"
            if operation_mode == "update_source"
            else
            "你是 NodeCanvas 的项目 Agent。当前锚点节点是首要事实来源，必须结合其具体内容回答，禁止给出脱离上下文的通用答案。"
            "直接回答用户问题，不要输出 JSON，不要描述内部思考过程。使用清晰的 Markdown 组织正文。"
            f"使用{'中文' if context.response_language == 'zh-CN' else 'English'}回复。"
        )
        user_text = _context_user_text(context)
        payload = {
            "model": self.model_override or model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_text}],
            "temperature": 0.65,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        emitted = False
        fallback_lines: list[str] = []
        try:
            with httpx.Client(timeout=90.0) as client:
                with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if not line:
                            continue
                        if not line.startswith("data:"):
                            fallback_lines.append(line)
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        body = json.loads(data)
                        choices = body.get("choices", [])
                        delta = choices[0].get("delta", {}) if choices else {}
                        reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                        if isinstance(reasoning, str) and reasoning:
                            yield "reasoning", reasoning
                        content = delta.get("content")
                        if isinstance(content, str) and content:
                            emitted = True
                            yield "content", content
            if not emitted and fallback_lines:
                body = json.loads("".join(fallback_lines))
                content = body["choices"][0]["message"]["content"]
                if content:
                    yield "content", str(content)
                    emitted = True
            if not emitted:
                raise ValueError("model returned no answer content")
        except (httpx.HTTPError, KeyError, ValueError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"model provider failed: {exc}") from exc

    def stream_chat(self, *, context: ContextSnapshot, model: str, operation_mode: str = "chat") -> Iterator[str]:
        for event_type, content in self.stream_chat_events(context=context, model=model, operation_mode=operation_mode):
            if event_type == "content":
                yield content


class DashScopeImageProvider(CandidateProvider):
    name = "dashscope-image"

    def __init__(self, endpoint: str, api_key: str, model_id: str):
        self.endpoint = endpoint
        self.api_key = api_key
        self.model_id = model_id

    def generate(self, *, context: ContextSnapshot, count: int, model: str, generation_type: str, rows: int = 1, columns: int = 1) -> ProviderGeneration:
        if generation_type != "图片":
            raise RuntimeError("生图模型只能用于图片结果")
        results: list[Candidate] = []
        usage = TokenUsage()
        while len(results) < count:
            index = len(results)
            row = index // columns + 1
            column = index % columns + 1
            cell_prompt = (
                f"{context.goal}\n\n"
                f"这是同一组 {rows}x{columns} 连续视觉规划中的第 {row} 行、第 {column} 列（总序号 {index + 1}/{count}）。"
                "画面必须延续整组统一的地点、人物、色彩、镜头语言和视觉风格，同时准确表现当前格在时间或流程上的下一步；"
                "不要生成与整组主题无关的独立方案。"
                + ("旅行规划中每行代表一天、每列代表当天按时间推进的行程，画面应与前一站和下一站在路线与时间上连续。" if re.search(r"旅行|旅游|行程|景点|目的地|travel|trip|itinerary", context.goal, re.I) else "")
            )
            payload = {
                "model": self.model_id,
                "input": {"messages": [{"role": "user", "content": [{"text": cell_prompt}]}]},
                "parameters": {"size": "2K", "n": 1, "watermark": False, "thinking_mode": True},
            }
            try:
                with httpx.Client(timeout=180.0) as client:
                    response = client.post(
                        self.endpoint,
                        headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                        json=payload,
                    )
                response.raise_for_status()
                body = response.json()
            except (httpx.HTTPError, json.JSONDecodeError) as exc:
                raise RuntimeError(f"image provider failed: {exc}") from exc
            urls = _extract_image_urls(body)
            if not urls:
                raise RuntimeError("image provider returned no image URL")
            batch_usage = _usage_from_response(body, fallback_text=cell_prompt)
            usage.prompt_tokens += batch_usage.prompt_tokens
            usage.completion_tokens += batch_usage.completion_tokens
            usage.total_tokens += batch_usage.total_tokens
            usage.estimated = usage.estimated or batch_usage.estimated
            image_url = urls[0]
            results.append(Candidate(
                title=f"第 {row} 组 · 步骤 {column}",
                content=cell_prompt,
                tags=["图片", f"row-{row}", f"column-{column}"],
                reason="同一视觉规划的连续节点",
                asset_url=image_url,
            ))
        return ProviderGeneration(candidates=results, usage=usage)


def _extract_image_urls(value: object) -> list[str]:
    urls: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"url", "image", "image_url"} and isinstance(child, str) and child.startswith(("http://", "https://", "data:image/")):
                urls.append(child)
            else:
                urls.extend(_extract_image_urls(child))
    elif isinstance(value, list):
        for child in value:
            urls.extend(_extract_image_urls(child))
    return list(dict.fromkeys(urls))


class DeterministicProvider(CandidateProvider):
    """Offline provider used for local development and tests, not a fake HTTP service."""

    name = "deterministic-local"
    directions = ("核心主张", "受众洞察", "场景表达", "渠道转化", "视觉叙事", "执行清单")
    english_directions = ("Core Message", "Audience Insight", "Scenario", "Channel Conversion", "Visual Narrative", "Execution Plan")

    def generate(self, *, context: ContextSnapshot, count: int, model: str, generation_type: str, rows: int = 1, columns: int = 1) -> ProviderGeneration:
        english = context.response_language == "en-US"
        focus_title = context.focus_node.title if context.focus_node else "当前节点"
        focus_content = context.focus_node.content if context.focus_node else ""
        source_titles = "、".join([focus_title, *(item.title for item in context.direct_inputs)])
        current_content = context.current_node.content if context.current_node else ""
        travel_text = "\n".join([context.goal, focus_title, focus_content, *(item.title + "\n" + item.content for item in context.direct_inputs)])
        is_travel_plan = bool(re.search(r"旅行|旅游|行程|景点|酒店|住宿|出发|目的地|预算|travel|trip|itinerary", travel_text, re.I))
        zh_periods = {
            1: ("全天",),
            2: ("白天", "晚上"),
            3: ("上午", "下午", "晚上"),
            4: ("上午", "中午", "下午", "晚上"),
        }
        en_periods = {
            1: ("Full day",),
            2: ("Daytime", "Evening"),
            3: ("Morning", "Afternoon", "Evening"),
            4: ("Morning", "Noon", "Afternoon", "Evening"),
        }
        directions = self.english_directions if english else self.directions
        candidates = [
            Candidate(
                title=context.current_node.title if context.current_node else (
                    f"Day {index // columns + 1} · {en_periods[columns][index % columns]}"
                    if english and is_travel_plan
                    else f"第 {index // columns + 1} 天 · {zh_periods[columns][index % columns]}"
                    if is_travel_plan
                    else f"{'Stage' if english else '阶段'} {index // columns + 1} · {'Step' if english else '步骤'} {index % columns + 1}"
                ),
                content=(
                    f"{current_content}\n\n{'Optimization brief' if english else '优化说明'}: {context.goal}"
                    if context.current_node
                    else (
                        (
                            f"This is {en_periods[columns][index % columns]} on day {index // columns + 1} of one connected itinerary based on {source_titles}.\n\n"
                            f"Trip requirements: {focus_content}\n\n"
                            f"Continue from: {'the trip starting point' if index == 0 else 'the previous node and its location'}. Include a suitable place/activity, nearby food, transport, duration, and estimated cost."
                            if english else
                            f"这是基于 {source_titles} 编排的同一份连续行程：第 {index // columns + 1} 天{zh_periods[columns][index % columns]}。\n\n"
                            f"行程要求：{focus_content}\n\n"
                            f"衔接：{'从出发地开始' if index == 0 else '承接上一个节点的地点与时间'}；请落实适合的地点与活动、附近美食、交通方式、预计用时和预算。"
                        )
                        if is_travel_plan else
                        f"Based on “{context.goal}” and {source_titles}, this is option {index + 1}.\n\n"
                        f"Current node context: {focus_content}\n\n"
                        f"This is stage {index // columns + 1}, step {index % columns + 1} in one connected plan.\n"
                        f"Continue from: {'the starting context' if index == 0 else 'the previous step'}; prepare the next step for {'completion' if index + 1 == count else 'the following node'}."
                        if english else f"围绕“{context.goal}”，基于 {source_titles} 的当前内容形成第 {index + 1} 个{generation_type}方案。\n\n"
                        f"当前节点原文：{focus_content}\n\n"
                        f"这是同一份规划中的阶段 {index // columns + 1}、步骤 {index % columns + 1}。\n"
                        f"衔接：{'从当前上下文开始' if index == 0 else '承接上一步'}，并为{'收束整体结果' if index + 1 == count else '下一个节点'}准备明确输入。"
                    )
                ),
                tags=["Text" if english and generation_type == "文本" else generation_type, f"row-{index // columns + 1}", f"column-{index % columns + 1}"],
                reason="Generated by the local deterministic provider; configure a model key to use a live model." if english else "由本地确定性 Provider 生成，配置模型密钥后会切换为真实模型输出。",
            )
            for index in range(count)
        ]
        prompt_tokens = _estimate_tokens("\n".join([context.goal, focus_content, *(item.content for item in context.direct_inputs), *(context.knowledge or [])]))
        completion_tokens = sum(_estimate_tokens(candidate.content) for candidate in candidates)
        return ProviderGeneration(candidates=candidates, usage=TokenUsage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            estimated=True,
        ))


def _usage_from_response(body: object, fallback_text: str) -> TokenUsage:
    """Normalise OpenAI- and DashScope-style usage payloads without guessing silently."""
    usage = body.get("usage", {}) if isinstance(body, dict) else {}
    if not isinstance(usage, dict):
        usage = {}
    prompt = usage.get("prompt_tokens", usage.get("input_tokens", usage.get("input_token_count", 0)))
    completion = usage.get("completion_tokens", usage.get("output_tokens", usage.get("output_token_count", 0)))
    total = usage.get("total_tokens", usage.get("total_token_count", 0))
    if all(isinstance(value, int) and value >= 0 for value in (prompt, completion, total)) and total > 0:
        return TokenUsage(prompt_tokens=prompt, completion_tokens=completion, total_tokens=total)
    estimated_prompt = _estimate_tokens(fallback_text)
    return TokenUsage(prompt_tokens=estimated_prompt, completion_tokens=0, total_tokens=estimated_prompt, estimated=True)


def _estimate_tokens(text: str) -> int:
    if not text.strip():
        return 0
    cjk = sum("\u4e00" <= char <= "\u9fff" for char in text)
    other = len(text) - cjk
    return max(1, round(cjk / 1.5 + other / 4))


def provider_from_env() -> CandidateProvider:
    api_key = os.getenv("NODECANVAS_LLM_API_KEY", "").strip()
    base_url = os.getenv("NODECANVAS_LLM_BASE_URL", "").strip()
    if api_key and base_url:
        return OpenAICompatibleProvider(
            base_url=base_url,
            api_key=api_key,
            model_override=os.getenv("NODECANVAS_LLM_MODEL") or None,
        )
    return DeterministicProvider()


def provider_from_connection(connection: ModelConnection | None) -> CandidateProvider:
    if not connection or not connection.api_key.strip() or not connection.base_url.strip():
        return provider_from_env()
    if connection.protocol == "dashscope-image":
        return DashScopeImageProvider(connection.base_url, connection.api_key, connection.model_id)
    return OpenAICompatibleProvider(
        base_url=connection.base_url,
        api_key=connection.api_key,
        model_override=connection.model_id,
        capabilities=connection.capabilities,
    )
