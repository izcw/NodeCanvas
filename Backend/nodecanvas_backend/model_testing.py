from __future__ import annotations

import time

import httpx

from .api_models import ModelConnectionTestRequest, ModelConnectionTestResponse


def test_model_connection(config: ModelConnectionTestRequest) -> ModelConnectionTestResponse:
    started = time.perf_counter()
    headers = {"Authorization": f"Bearer {config.api_key}", "Content-Type": "application/json"}
    if config.protocol == "dashscope-image":
        payload = {
            "model": config.model_id,
            "input": {"messages": [{"role": "user", "content": [{"text": "极简蓝色圆点图标，纯白背景"}]}]},
            "parameters": {"size": "2K", "n": 1, "watermark": False, "thinking_mode": False},
        }
        timeout = 180.0
    else:
        payload = {
            "model": config.model_id,
            "messages": [{"role": "user", "content": "只回复 OK"}],
            "max_tokens": 8,
            "stream": False,
        }
        timeout = 45.0

    endpoint = config.base_url if config.protocol == "dashscope-image" else f"{config.base_url.rstrip('/')}/chat/completions"
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(endpoint, headers=headers, json=payload)
        latency_ms = round((time.perf_counter() - started) * 1000)
        if response.is_error:
            detail = _response_detail(response)
            return ModelConnectionTestResponse(ok=False, latency_ms=latency_ms, message=f"HTTP {response.status_code}: {detail}")
        body = response.json()
        if config.protocol == "openai-chat" and not body.get("choices"):
            return ModelConnectionTestResponse(ok=False, latency_ms=latency_ms, message="接口可访问，但返回内容不是 Chat Completions 格式")
        return ModelConnectionTestResponse(ok=True, latency_ms=latency_ms, message="模型连接成功")
    except (httpx.HTTPError, ValueError) as exc:
        latency_ms = round((time.perf_counter() - started) * 1000)
        return ModelConnectionTestResponse(ok=False, latency_ms=latency_ms, message=f"连接失败：{exc}")


def _response_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict) and error.get("message"):
                return str(error["message"])[:240]
            if payload.get("message"):
                return str(payload["message"])[:240]
    except ValueError:
        pass
    return response.text[:240] or "请求失败"
