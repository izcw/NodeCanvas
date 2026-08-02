from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from urllib import error, request as urllib_request

from .models import Candidate, ContextSnapshot, ModelConnection, ProviderGeneration, TokenUsage


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
    ) -> ProviderGeneration:
        raise NotImplementedError


class OpenAICompatibleProvider(CandidateProvider):
    name = "openai-compatible"

    def __init__(self, base_url: str, api_key: str, model_override: str | None = None, capabilities: list[str] | None = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model_override = model_override
        self.capabilities = capabilities or []

    def generate(self, *, context: ContextSnapshot, count: int, model: str, generation_type: str) -> ProviderGeneration:
        system = (
            "你是 NodeCanvas 的创意策划 Agent。只使用给定上下文，返回严格 JSON。"
            "输出对象必须包含 candidates 数组，每项包含 title、content、tags、reason。"
            f"生成 {count} 个差异明显的{generation_type}结果。"
            "如果提供了必须修改的当前节点，title 必须保持当前节点标题，content 必须是优化后的完整正文，不要返回修改说明或前后缀。"
            f"所有面向用户的 JSON 字段必须使用{'中文' if context.response_language == 'zh-CN' else 'English'}回复。"
            + ("文本结果的 content 必须使用标准 Markdown 源码组织（标题、列表、强调等按需使用）。" if generation_type == "文本" else "")
        )
        context_text = "\n".join(
            f"[{item.kind}] {item.title}\n{item.content}" for item in context.direct_inputs
        )
        current_node_text = (
            f"\n\n必须修改的当前节点：\n[{context.current_node.kind}] {context.current_node.title}\n{context.current_node.content}"
            if context.current_node
            else ""
        )
        knowledge_text = "\n".join(context.knowledge)
        user_text = f"目标：{context.goal}{current_node_text}\n\n画布上下文：\n{context_text}\n\n知识：\n{knowledge_text}"
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
        http_request = urllib_request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib_request.urlopen(http_request, timeout=90) as response:
                body = json.loads(response.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            candidates = [Candidate.model_validate(item) for item in parsed.get("candidates", [])]
            if len(candidates) < count:
                raise ValueError("model returned fewer candidates than requested")
            return ProviderGeneration(candidates=candidates[:count], usage=_usage_from_response(body, fallback_text=f"{system}\n{user_text}"))
        except (error.URLError, KeyError, ValueError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"model provider failed: {exc}") from exc


class DashScopeImageProvider(CandidateProvider):
    name = "dashscope-image"

    def __init__(self, endpoint: str, api_key: str, model_id: str):
        self.endpoint = endpoint
        self.api_key = api_key
        self.model_id = model_id

    def generate(self, *, context: ContextSnapshot, count: int, model: str, generation_type: str) -> ProviderGeneration:
        if generation_type != "图片":
            raise RuntimeError("生图模型只能用于图片结果")
        results: list[Candidate] = []
        usage = TokenUsage()
        while len(results) < count:
            batch_size = min(4, count - len(results))
            payload = {
                "model": self.model_id,
                "input": {"messages": [{"role": "user", "content": [{"text": context.goal}]}]},
                "parameters": {"size": "2K", "n": batch_size, "watermark": False, "thinking_mode": True},
            }
            http_request = urllib_request.Request(
                self.endpoint,
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib_request.urlopen(http_request, timeout=180) as response:
                    body = json.loads(response.read().decode("utf-8"))
            except (error.URLError, json.JSONDecodeError) as exc:
                raise RuntimeError(f"image provider failed: {exc}") from exc
            urls = _extract_image_urls(body)
            if not urls:
                raise RuntimeError("image provider returned no image URL")
            batch_usage = _usage_from_response(body, fallback_text=context.goal)
            usage.prompt_tokens += batch_usage.prompt_tokens
            usage.completion_tokens += batch_usage.completion_tokens
            usage.total_tokens += batch_usage.total_tokens
            usage.estimated = usage.estimated or batch_usage.estimated
            for image_url in urls[:batch_size]:
                index = len(results) + 1
                results.append(Candidate(title=f"图片方案 {index:02d}", content=context.goal, tags=["图片"], reason="模型生成", asset_url=image_url))
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

    def generate(self, *, context: ContextSnapshot, count: int, model: str, generation_type: str) -> ProviderGeneration:
        english = context.response_language == "en-US"
        source_titles = "、".join(item.title for item in context.direct_inputs) or "当前 Agent 节点"
        current_content = context.current_node.content if context.current_node else ""
        directions = self.english_directions if english else self.directions
        candidates = [
            Candidate(
                title=context.current_node.title if context.current_node else f"{directions[index % len(directions)]} {index + 1:02d}",
                content=(
                    f"{current_content}\n\n{'Optimization brief' if english else '优化说明'}: {context.goal}"
                    if context.current_node
                    else (
                        f"Based on “{context.goal}” and {source_titles}, this is option {index + 1}.\n\n"
                        f"Focus: {directions[index % len(directions)]}\n"
                        "Recommendation: keep outcomes verifiable, define the deliverable, and differentiate this direction from the other options."
                        if english else f"围绕“{context.goal}”，基于 {source_titles} 形成第 {index + 1} 个{generation_type}方案。\n\n"
                        f"重点：{directions[index % len(directions)]}\n"
                        "建议：保留可验证目标、明确交付格式，并让该方向与其他候选保持差异。"
                    )
                ),
                tags=["Text" if english and generation_type == "文本" else generation_type, directions[index % len(directions)]],
                reason="Generated by the local deterministic provider; configure a model key to use a live model." if english else "由本地确定性 Provider 生成，配置模型密钥后会切换为真实模型输出。",
            )
            for index in range(count)
        ]
        prompt_tokens = _estimate_tokens("\n".join([context.goal, *(item.content for item in context.direct_inputs), *(context.knowledge or [])]))
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
