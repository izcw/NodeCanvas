import {
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  CornerDownLeft,
  FileText,
  Image as ImageIcon,
  Layers3,
  MessageCircle,
  Pause,
  ShieldCheck,
  Sparkles,
  Zap,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AgentRunOptions, CanvasNode, ModelConfig } from "../../types/canvas";
import { NodeSelect } from "./NodeSelect";
import { useModelRegistry } from "../../features/models/ModelRegistryContext";

type NodeChatComposerProps = {
  nodeTitle: string;
  onClose?: () => void;
  onSend: (prompt: string, model: ModelConfig, options: AgentRunOptions, actionMode: "modify" | "agent", assistantMode: AssistantMode, signal?: AbortSignal, onProgress?: (content: string, type: 'content' | 'reasoning') => void) => void | Promise<void | string[]>;
  nodes: CanvasNode[];
  defaultActionMode?: "modify" | "agent";
  showActionMode?: boolean;
  showAgentGenerationControls?: boolean;
  showAssistantMode?: boolean;
  portalSelects?: boolean;
  nodeId?: string;
  runStatus?: 'idle' | 'running' | 'completed' | 'failed';
  runSummary?: string[];
  isExecuting?: boolean;
  onStop?: () => void;
};

export type AssistantMode = "manual" | "auto" | "ask";
type MentionRef = { id: string; title: string };

// 每个节点聊天的输入草稿，关闭聊天框后重新打开时恢复，避免输入内容丢失。
const composerDrafts = new Map<string, string>();

function takeStreamLine(buffer: string, force = false) {
  const leadingTrimmed = buffer.replace(/^\s+/, '');
  if (!leadingTrimmed) return null;
  const punctuationIndex = leadingTrimmed.search(/[。！？!?；;\n]/);
  const cutAt = punctuationIndex >= 0 && punctuationIndex < 44
    ? punctuationIndex + 1
    : leadingTrimmed.length >= 36
      ? 36
      : force
        ? leadingTrimmed.length
        : 0;
  if (!cutAt) return null;
  const rawLine = leadingTrimmed.slice(0, cutAt);
  const line = rawLine
    .replace(/\s+/g, ' ')
    .replace(/^[#>*`_~-]+\s*/, '')
    .trim();
  return { line, rest: leadingTrimmed.slice(cutAt) };
}

export function NodeChatComposer({
  nodeTitle,
  onClose,
  onSend,
  nodes,
  defaultActionMode = "agent",
  showActionMode = true,
  showAgentGenerationControls = true,
  showAssistantMode = false,
  portalSelects = false,
  nodeId,
  runStatus = 'idle',
  runSummary = [],
  isExecuting = false,
  onStop,
}: NodeChatComposerProps) {
  const { models } = useModelRegistry();
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(() => models[0]?.id ?? "");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState<MentionRef[]>([]);
  const [actionMode, setActionMode] = useState<"modify" | "agent">(defaultActionMode);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("ask");
  const [generationType, setGenerationType] = useState<AgentRunOptions['generationType']>("自动");
  const [generationMenuOpen, setGenerationMenuOpen] = useState(false);
  const [cardMenuOpen, setCardMenuOpen] = useState(false);
  const [resultGrid, setResultGrid] = useState({ rows: 1, columns: 1 });
  const [hoveredGrid, setHoveredGrid] = useState({ rows: 1, columns: 1 });
  const [localRunStatus, setLocalRunStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [localSummary, setLocalSummary] = useState<string[]>([]);
  const [localExecuting, setLocalExecuting] = useState(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const submittedPromptRef = useRef("");
  const generationPickerRef = useRef<HTMLDivElement>(null);
  const cardCountPickerRef = useRef<HTMLDivElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const draftRestoredRef = useRef(false);
  const draftKey = (nodeId ?? "").trim() || (nodeTitle ?? "").trim();
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const mentionMenuRef = useRef<HTMLDivElement>(null);
  const [mentionMenuPosition, setMentionMenuPosition] = useState({ x: 0, y: 0 });
  const isAgent = actionMode === "agent";
  const executing = isExecuting || localExecuting;
  const effectiveRunStatus = executing ? 'running' : isAgent ? runStatus : localRunStatus;
  const closeLocked = effectiveRunStatus === 'running';
  const executionSummary = isAgent ? runSummary : localSummary;
  const compatibleModels = models.filter((item) => {
    if (!item.apiKey.trim()) return false;
    if (!isAgent) return !item.capabilities.includes('image');
    if (generationType === '自动') return true;
    return generationType === '图片' ? item.capabilities.includes('image') : !item.capabilities.includes('image');
  });
  const selectedModel = compatibleModels.find((item) => item.id === modelId) ?? compatibleModels[0];

  useEffect(() => () => {
    requestControllerRef.current?.abort();
  }, []);

  // 模型注册表的第一个可用模型就是默认模型。模型排序或加密配置恢复后，
  // 重新打开聊天框会跟随新顺序；用户在当前聊天中手动选择其他模型不受影响。
  useEffect(() => {
    const defaultModel = compatibleModels[0];
    if (defaultModel && defaultModel.id !== modelId) setModelId(defaultModel.id);
  }, [models, actionMode, generationType]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const editor = inputRef.current;
      if (!editor) return;
      if (!draftRestoredRef.current) {
        const saved = composerDrafts.get(draftKey);
        if (saved) {
          editor.innerHTML = saved;
          setPrompt(editor.textContent ?? "");
          setSelectedMentions((current) => current.filter((mention) => (editor.textContent ?? "").includes(`@${mention.title}`)));
        }
        draftRestoredRef.current = true;
      }
      editor.focus();
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    return () => cancelAnimationFrame(frame);
  }, [draftKey, isAgent, nodeTitle]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!modelPickerRef.current?.contains(event.target as Node))
        setModelMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModelMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!generationMenuOpen && !cardMenuOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!generationPickerRef.current?.contains(target))
        setGenerationMenuOpen(false);
      if (!cardCountPickerRef.current?.contains(target)) setCardMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setGenerationMenuOpen(false);
      setCardMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [generationMenuOpen, cardMenuOpen]);

  useEffect(() => {
    if (!mentionOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!inputWrapRef.current?.contains(target) && !mentionMenuRef.current?.contains(target)) {
        setMentionOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [mentionOpen, cardMenuOpen]);

  useEffect(() => {
    if (!mentionOpen) return;
    let frame = 0;
    const syncPosition = () => {
      const input = inputWrapRef.current;
      if (input) {
        const bounds = input.getBoundingClientRect();
        const width = 250;
        const height = Math.min(220, window.innerHeight - 16);
        const nextPosition = {
          x: Math.min(Math.max(8, bounds.left), Math.max(8, window.innerWidth - width - 8)),
          y: Math.min(Math.max(8, bounds.top - height + 2), Math.max(8, window.innerHeight - height - 8)),
        };
        setMentionMenuPosition((current) => current.x === nextPosition.x && current.y === nextPosition.y ? current : nextPosition);
      }
      frame = window.requestAnimationFrame(syncPosition);
    };
    syncPosition();
    return () => window.cancelAnimationFrame(frame);
  }, [mentionOpen]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (effectiveRunStatus === 'running') return;
    const value = prompt.trim();
    if (!value) return;
    if (!selectedModel) return;
    const mentionContext = selectedMentions.length
      ? `\n\n[用户引用节点：${selectedMentions.map((mention) => `${mention.id}|${mention.title}`).join('；')}]`
      : '';
    const submittedValue = `${value}${mentionContext}`;
    const visualIntent = /(?:生成|制作|创建|画|设计).{0,8}(?:图片|图像|插画|海报|封面|视觉|效果图|logo|icon)|(?:图片|图像|插画|海报|封面|视觉|效果图).{0,8}(?:生成|制作|创建|设计)/i.test(value);
    const executionModel = generationType === '自动' && visualIntent && !selectedModel.capabilities.includes('image')
      ? models.find((item) => item.protocol === 'dashscope-image' && item.apiKey) ?? selectedModel
      : selectedModel;
    const controller = new AbortController();
    submittedPromptRef.current = submittedValue;
    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;
    setLocalExecuting(true);
    let streamBuffer = "";
    let displayedStreamLines: string[] = [];
    let currentStreamType: 'content' | 'reasoning' | null = null;
    let streamLineTimer: number | null = null;
    const publishNextStreamLine = (force = false) => {
      const next = takeStreamLine(streamBuffer, force);
      if (!next) return false;
      streamBuffer = next.rest;
      if (next.line) {
        displayedStreamLines = [...displayedStreamLines, next.line].slice(-3);
        setLocalSummary(displayedStreamLines);
      }
      return true;
    };
    if (!isAgent) {
      setLocalRunStatus('running');
      setLocalSummary(['正在等待模型开始流式输出…']);
      streamLineTimer = window.setInterval(() => publishNextStreamLine(), 520);
    }
    try {
      const resultSummary = await onSend(submittedValue, executionModel, {
        generationType,
        grid: resultGrid,
      }, actionMode, assistantMode, controller.signal, (chunk, type) => {
        if (isAgent) return;
        if (currentStreamType && currentStreamType !== type && streamBuffer.trim()) streamBuffer += '。';
        currentStreamType = type;
        streamBuffer += chunk;
      });
      if (controller.signal.aborted) {
        setLocalRunStatus('idle');
        setLocalSummary(['已暂停执行。']);
        window.setTimeout(() => setLocalSummary([]), 1800);
        return;
      }
      setPrompt("");
      setSelectedMentions([]);
      setMentionOpen(false);
      if (inputRef.current) inputRef.current.textContent = "";
      if (draftKey) composerDrafts.delete(draftKey);
      if (!isAgent) {
        if (streamLineTimer !== null) window.clearInterval(streamLineTimer);
        streamLineTimer = null;
        let safety = 0;
        while (streamBuffer.trim() && safety < 100) {
          if (!publishNextStreamLine(true)) break;
          safety += 1;
        }
        setLocalRunStatus('completed');
        if (displayedStreamLines.length === 0) setLocalSummary(resultSummary?.slice(0, 3) ?? ['已完成要求解析与内容更新。']);
        window.setTimeout(() => {
          setLocalRunStatus('idle');
          setLocalSummary([]);
        }, 2400);
      }
    } catch (error) {
      if (streamLineTimer !== null) window.clearInterval(streamLineTimer);
      streamLineTimer = null;
      if (error instanceof DOMException && error.name === 'AbortError') {
        setLocalRunStatus('idle');
        setLocalSummary(['已暂停执行。']);
        window.setTimeout(() => setLocalSummary([]), 1800);
        return;
      }
      if (!isAgent) {
        setLocalRunStatus('failed');
        setLocalSummary([error instanceof Error ? error.message : '执行失败，请重试。']);
      }
    } finally {
      if (streamLineTimer !== null) window.clearInterval(streamLineTimer);
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
      setLocalExecuting(false);
    }
  };

  const stopExecution = (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    requestControllerRef.current?.abort();
    if (!prompt.trim() && submittedPromptRef.current) {
      setPrompt(submittedPromptRef.current);
      if (inputRef.current) inputRef.current.textContent = submittedPromptRef.current;
    }
    onStop?.();
  };

  const getCaretOffset = (fallback = prompt.length) => {
    const element = inputRef.current;
    const selection = window.getSelection();
    if (
      !element ||
      !selection ||
      selection.rangeCount === 0 ||
      !selection.anchorNode
    )
      return fallback;
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(element);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
  };

  const setCaretOffset = (offset: number) => {
    const element = inputRef.current;
    if (!element) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let textNode: Node | null = walker.nextNode();
    while (textNode) {
      const length = textNode.textContent?.length ?? 0;
      if (remaining <= length) {
        range.setStart(textNode, remaining);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      remaining -= length;
      textNode = walker.nextNode();
    }
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const mentionResults = nodes.filter((node) =>
    node.data.title.toLowerCase().includes(mentionQuery.toLowerCase()),
  );

  useEffect(() => {
    if (!mentionOpen) return;
    mentionMenuRef.current?.querySelectorAll<HTMLButtonElement>("button")[highlightedMentionIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedMentionIndex, mentionOpen]);

  const decorateMentions = () => {
    const editor = inputRef.current;
    if (!editor || selectedMentions.length === 0) return;
    const value = editor.textContent ?? "";
    const escaped = selectedMentions
      .map((mention) => mention.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    if (!escaped) return;
    const parts = value.split(new RegExp(`(@(?:${escaped}))`, "g"));
    const fragment = document.createDocumentFragment();
    parts.forEach((part) => {
      if (part.startsWith("@") && selectedMentions.some((mention) => mention.title === part.slice(1))) {
        const highlight = document.createElement("span");
        highlight.className = "mention-highlight";
        highlight.textContent = part;
        fragment.appendChild(highlight);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    });
    editor.replaceChildren(fragment);
  };

  useEffect(() => {
    const editor = inputRef.current;
    if (!editor) return;
    const caret = pendingCaretRef.current ?? getCaretOffset();
    if (!selectedMentions.length) {
      editor.replaceChildren(document.createTextNode(editor.textContent ?? ""));
      pendingCaretRef.current = null;
      return;
    }
    decorateMentions();
    requestAnimationFrame(() => {
      setCaretOffset(caret);
      pendingCaretRef.current = null;
    });
  }, [selectedMentions]);

  useEffect(() => {
    setHighlightedMentionIndex(0);
  }, [mentionOpen, mentionQuery]);

  const syncMention = (
    value: string,
    cursor = getCaretOffset(value.length),
  ) => {
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) {
      setMentionOpen(false);
      return;
    }
    setMentionStart(
      cursor - match[0].length + (match[0].startsWith(" ") ? 1 : 0),
    );
    setMentionQuery(match[1]);
    setMentionOpen(true);
  };

  const chooseMention = (node: CanvasNode) => {
    const cursor = getCaretOffset();
    const next = `${prompt.slice(0, mentionStart)}@${node.data.title} ${prompt.slice(cursor)}`;
    setPrompt(next);
    if (inputRef.current) inputRef.current.textContent = next;
    pendingCaretRef.current = mentionStart + node.data.title.length + 2;
    setSelectedMentions((current) =>
      current.some((mention) => mention.id === node.id)
        ? current
        : [...current, { id: node.id, title: node.data.title }],
    );
    setMentionOpen(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      setCaretOffset(
        pendingCaretRef.current ?? mentionStart + node.data.title.length + 2,
      );
    });
  };

  const handleMentionDeletion = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed) return false;
    const cursor = getCaretOffset();
    const matchBefore = prompt.slice(0, cursor).match(/@([^\s@]+) $/);
    const matchAfter = prompt.slice(cursor).match(/^@([^\s@]+)/);
    const title =
      event.key === "Backspace"
        ? matchBefore?.[1]
        : event.key === "Delete"
          ? matchAfter?.[1]
          : undefined;
    const mention = selectedMentions.find((item) => item.title === title);
    if (!title || !mention) return false;
    event.preventDefault();
    const start =
      event.key === "Backspace" ? cursor - title.length - 2 : cursor;
    const end = event.key === "Backspace" ? cursor : cursor + title.length + 1;
    const next = prompt.slice(0, start) + prompt.slice(end);
    setPrompt(next);
    setSelectedMentions((current) => current.filter((item) => item.id !== mention.id));
    pendingCaretRef.current = start;
    if (inputRef.current) inputRef.current.textContent = next;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      setCaretOffset(start);
    });
    return true;
  };

  return (
    <form
      className={`node-chat-composer ${isAgent ? "is-agent-mode" : "is-modify-mode"}`}
      onSubmit={send}
    >
      <header>
        <span>
          <Sparkles size={14} />
          {isAgent
            ? effectiveRunStatus === 'running'
              ? "Agent 正在读取上下文并生成结果…"
              : effectiveRunStatus === 'failed'
                ? "Agent 执行失败，请检查后端或模型配置"
                : "Agent：生成、修改、删除或咨询画布"
            : `仅修改「${nodeTitle}」`}
        </span>
        {onClose && (
          <button type="button" onClick={() => { if (!closeLocked) onClose() }} disabled={closeLocked} aria-label={closeLocked ? "执行完成后可关闭聊天节点" : "关闭聊天节点"} title={closeLocked ? "正在执行，完成后才能关闭" : "关闭"}>
            <X size={15} />
          </button>
        )}
      </header>
      <div ref={inputWrapRef} className="node-chat-input-wrap">
        <div
          ref={inputRef}
          className={`node-chat-editor ${prompt ? "" : "is-empty"}`}
          contentEditable
          suppressContentEditableWarning
          autoFocus
          role="textbox"
          aria-multiline="true"
          aria-label="聊天节点输入"
          data-placeholder={isAgent ? "描述想生成、修改或删除的内容，也可以直接咨询…" : "描述你想如何修改当前节点内容…"}
          onInput={(event) => {
            const value = event.currentTarget.textContent ?? "";
            setPrompt(value);
            if (draftKey) composerDrafts.set(draftKey, event.currentTarget.innerHTML);
            setSelectedMentions((current) => {
              const next = current.filter((mention) => value.includes(`@${mention.title}`));
              return next.length === current.length ? current : next;
            });
            syncMention(value, value.length);
          }}
          onKeyDown={(event) => {
            if (
              mentionOpen &&
              mentionResults.length > 0 &&
              event.key === "ArrowDown"
            ) {
              event.preventDefault();
              setHighlightedMentionIndex(
                (index) => (index + 1) % mentionResults.length,
              );
              return;
            }
            if (
              mentionOpen &&
              mentionResults.length > 0 &&
              event.key === "ArrowUp"
            ) {
              event.preventDefault();
              setHighlightedMentionIndex(
                (index) =>
                  (index - 1 + mentionResults.length) % mentionResults.length,
              );
              return;
            }
            if (
              mentionOpen &&
              mentionResults.length > 0 &&
              event.key === "Enter" &&
              !event.shiftKey
            ) {
              event.preventDefault();
              chooseMention(mentionResults[highlightedMentionIndex]);
              return;
            }
            if (
              mentionOpen &&
              (event.key === "Escape" || event.key === "Tab")
            ) {
              event.preventDefault();
              setMentionOpen(false);
              return;
            }
            if (handleMentionDeletion(event)) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        {mentionOpen && mentionResults.length > 0 && createPortal(
          <div
            ref={mentionMenuRef}
            className="node-mention-menu nowheel"
            role="listbox"
            aria-label="选择节点"
            style={{ left: mentionMenuPosition.x, top: mentionMenuPosition.y }}
          >
            {mentionResults.map((node, index) => (
              <button
                type="button"
                key={node.id}
                className={
                  index === highlightedMentionIndex ? "is-highlighted" : ""
                }
                aria-selected={index === highlightedMentionIndex}
                onMouseEnter={() => setHighlightedMentionIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseMention(node)}
              >
                <span className={`mention-node-icon ${node.type}`}>@</span>
                <span>
                  <strong>{node.data.title}</strong>
                  <small>
                    {node.type === "text"
                      ? "文本节点"
                      : node.type === "image"
                        ? "图片节点"
                        : node.type === "file"
                          ? "文件节点"
                          : "备注节点"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        , document.body)}
      </div>
      <footer>
        <div>
          <NodeSelect portal={portalSelects} value={selectedModel?.id ?? ''} ariaLabel="选择大模型" onChange={setModelId} options={compatibleModels.map((item) => ({ value: item.id, label: item.name, description: item.description, meta: item.apiKey ? '已配置' : '未配置', icon: item.capabilities.includes('reasoning') ? <BrainCircuit size={20} /> : item.capabilities.includes('image') ? <ImageIcon size={20} /> : item.capabilities.includes('vision') ? <Bot size={20} /> : <Sparkles size={20} /> }))} />
          {showActionMode && <NodeSelect value={actionMode} ariaLabel="选择操作模式" onChange={(value) => { setActionMode(value as "modify" | "agent"); setGenerationMenuOpen(false); setCardMenuOpen(false) }} options={[
            { value: 'modify', label: '修改当前', description: '只修改当前节点内容', icon: <FileText size={20} /> },
            { value: 'agent', label: 'Agent', description: '生成、延展或修改分支内容', icon: <Bot size={20} /> },
          ]} />}
          {showAssistantMode && <NodeSelect portal={portalSelects} value={assistantMode} ariaLabel="选择 Agent 执行模式" onChange={(value) => setAssistantMode(value as AssistantMode)} options={[
            { value: 'manual', label: '手动确认', description: '生成前询问确认', icon: <ShieldCheck size={20} /> },
            { value: 'auto', label: '自动生成', description: '完全自动生成', icon: <Zap size={20} /> },
            { value: 'ask', label: 'Ask', description: '纯聊天，不修改画布', icon: <MessageCircle size={20} /> },
          ]} />}
          {isAgent && showAgentGenerationControls && (
            <div
              className="node-model-picker generation-type-picker nodrag nopan"
              ref={generationPickerRef}
            >
              <button
                type="button"
                className="node-model-trigger"
                aria-label="选择生成类型"
                aria-haspopup="listbox"
                aria-expanded={generationMenuOpen}
                onClick={() => setGenerationMenuOpen((value) => !value)}
              >
                {generationType === "图片" ? <ImageIcon size={14} /> : generationType === "文本" ? <FileText size={14} /> : <Sparkles size={14} />}
                <span>{generationType}</span>
                <ChevronDown
                  className={generationMenuOpen ? "is-open" : ""}
                  size={13}
                />
              </button>
              {generationMenuOpen && (
                <div
                  className="node-model-menu"
                  role="listbox"
                  aria-label="生成类型"
                >
                  {[
                    { label: "自动", icon: <Sparkles size={20} />, description: '根据需求与模型能力自动选择' },
                    { label: "文本", icon: <FileText size={20} /> },
                    { label: "图片", icon: <ImageIcon size={20} /> },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.label}
                      className={`node-model-option ${generationType === item.label ? "selected" : ""}`}
                      role="option"
                      aria-selected={generationType === item.label}
                      onClick={() => {
                        setGenerationType(item.label as AgentRunOptions['generationType']);
                        setGenerationMenuOpen(false);
                      }}
                    >
                      <span className="node-model-icon">{item.icon}</span>
                      <span className="node-model-copy">
                        <strong>{item.label}</strong>
                        <small>{item.description ?? 'Agent 输出类型'}</small>
                      </span>
                      {generationType === item.label && (
                        <Check className="node-model-check" size={15} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {isAgent && showAgentGenerationControls ? (
            <div
              className="result-grid-picker nodrag nopan"
              ref={cardCountPickerRef}
            >
              <button
                type="button"
                className="card-count-trigger"
                aria-label="选择 Agent 结果宫格"
                aria-haspopup="dialog"
                aria-expanded={cardMenuOpen}
                onClick={() => setCardMenuOpen((open) => !open)}
              >
                <Layers3 size={14} />
                <span>{resultGrid.rows} × {resultGrid.columns}</span>
                <ChevronDown className={cardMenuOpen ? "is-open" : ""} size={13} />
              </button>
              {cardMenuOpen && (
                <div
                  className="result-grid-menu"
                  role="dialog"
                  aria-label="自定义宫格"
                  onMouseLeave={() => setHoveredGrid(resultGrid)}
                >
                  <div className="result-grid-menu__header">
                    <strong>自定义宫格</strong>
                    <span>{hoveredGrid.rows} × {hoveredGrid.columns}</span>
                  </div>
                  <div className="result-grid-menu__cells">
                    {Array.from({ length: 4 }, (_, rowIndex) =>
                      Array.from({ length: 4 }, (_, columnIndex) => {
                        const rows = rowIndex + 1;
                        const columns = columnIndex + 1;
                        const isActive =
                          rows <= hoveredGrid.rows &&
                          columns <= hoveredGrid.columns;
                        return (
                          <button
                            type="button"
                            key={`${rows}-${columns}`}
                            className={isActive ? "is-active" : ""}
                            aria-label={`${rows} 行 ${columns} 列，共 ${rows * columns} 个结果`}
                            onMouseEnter={() => setHoveredGrid({ rows, columns })}
                            onFocus={() => setHoveredGrid({ rows, columns })}
                            onClick={() => {
                              const nextGrid = { rows, columns };
                              setResultGrid(nextGrid);
                              setHoveredGrid(nextGrid);
                              setCardMenuOpen(false);
                            }}
                          />
                        );
                      }),
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
          <button
            className={`node-chat-send ${executing ? 'is-stop' : ''}`}
          type="button"
          onClick={(event) => {
            if (executing) {
              stopExecution(event);
              return;
            }
            event.preventDefault();
            void send();
          }}
            disabled={executing ? false : !prompt.trim() || effectiveRunStatus === 'running' || !selectedModel || (isAgent && selectedModel.capabilities.includes('image') && !selectedModel.apiKey)}
            aria-label={executing ? '暂停当前执行' : '发送聊天请求'}
            title={executing ? '暂停' : '发送'}
          >
            {executing ? <Pause size={18} fill="currentColor" /> : <CornerDownLeft size={18} />}
          </button>
      </footer>
      {executionSummary.length > 0 && (
        <div className={`execution-summary execution-summary--${effectiveRunStatus}`} role="status" aria-live="polite">
          <span className="execution-summary__pulse" />
          <span>{(effectiveRunStatus === 'running' ? executionSummary.slice(-3) : executionSummary.slice(0, 3)).map((line, index) => <small key={`${index}-${line}`}>{line}</small>)}</span>
        </div>
      )}
    </form>
  );
}
