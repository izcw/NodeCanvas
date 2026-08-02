import {
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  CornerDownLeft,
  File,
  FileText,
  Image as ImageIcon,
  Layers3,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { AgentRunOptions, CanvasNode, ModelConfig } from "../../types/canvas";
import { NodeSelect } from "./NodeSelect";
import { useModelRegistry } from "../../features/models/ModelRegistryContext";

type NodeChatComposerProps = {
  nodeTitle: string;
  onClose?: () => void;
  onSend: (prompt: string, model: ModelConfig, options: AgentRunOptions) => void | Promise<void | string[]>;
  nodes: CanvasNode[];
  mode?: "node" | "agent";
  runStatus?: 'idle' | 'running' | 'completed' | 'failed';
  runSummary?: string[];
};

export function NodeChatComposer({
  nodeTitle,
  onClose,
  onSend,
  nodes,
  mode = "node",
  runStatus = 'idle',
  runSummary = [],
}: NodeChatComposerProps) {
  const { models } = useModelRegistry();
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [generationType, setGenerationType] = useState("文本");
  const [generationMenuOpen, setGenerationMenuOpen] = useState(false);
  const [cardMenuOpen, setCardMenuOpen] = useState(false);
  const [resultGrid, setResultGrid] = useState({ rows: 1, columns: 1 });
  const [hoveredGrid, setHoveredGrid] = useState({ rows: 1, columns: 1 });
  const [localRunStatus, setLocalRunStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [localSummary, setLocalSummary] = useState<string[]>([]);
  const generationPickerRef = useRef<HTMLDivElement>(null);
  const cardCountPickerRef = useRef<HTMLDivElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const isAgent = mode === "agent";
  const effectiveRunStatus = isAgent ? runStatus : localRunStatus;
  const executionSummary = isAgent ? runSummary : localSummary;
  const compatibleModels = models.filter((item) => generationType === '图片' ? item.capabilities.includes('image') : !item.capabilities.includes('image'));
  const selectedModel = compatibleModels.find((item) => item.id === modelId) ?? compatibleModels[0] ?? models[0];

  useEffect(() => {
    if (selectedModel && selectedModel.id !== modelId) setModelId(selectedModel.id);
  }, [modelId, selectedModel]);

  useEffect(() => {
    if (isAgent) return;
    const frame = requestAnimationFrame(() => {
      const editor = inputRef.current;
      if (!editor) return;
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
  }, [isAgent, nodeTitle]);

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
      if (!inputWrapRef.current?.contains(event.target as Node)) {
        setMentionOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [mentionOpen, cardMenuOpen]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const value = prompt.trim();
    if (!value) return;
    if (!selectedModel) return;
    setPrompt("");
    if (inputRef.current) inputRef.current.textContent = "";
    if (!isAgent) {
      setLocalRunStatus('running');
      setLocalSummary(['正在理解修改要求…', `正在优化「${nodeTitle}」的内容…`]);
    }
    try {
      const resultSummary = await onSend(value, selectedModel, {
        generationType: generationType as AgentRunOptions['generationType'],
        grid: resultGrid,
      });
      if (!isAgent) {
        setLocalRunStatus('completed');
        setLocalSummary(resultSummary?.slice(0, 3) ?? ['已完成要求解析与内容更新。', `「${nodeTitle}」已写入最新结果。`]);
        window.setTimeout(() => {
          setLocalRunStatus('idle');
          setLocalSummary([]);
        }, 2400);
      }
    } catch (error) {
      if (!isAgent) {
        setLocalRunStatus('failed');
        setLocalSummary([error instanceof Error ? error.message : '执行失败，请重试。']);
      }
    }
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

  const decorateMentions = () => {
    const editor = inputRef.current;
    if (!editor || selectedMentions.length === 0) return;
    const value = editor.textContent ?? "";
    const escaped = selectedMentions
      .map((mention) => mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    if (!escaped) return;
    const parts = value.split(new RegExp(`(@(?:${escaped}))`, "g"));
    const fragment = document.createDocumentFragment();
    parts.forEach((part) => {
      if (part.startsWith("@") && selectedMentions.includes(part.slice(1))) {
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
      current.includes(node.data.title)
        ? current
        : [...current, node.data.title],
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
    if (!title || !selectedMentions.includes(title)) return false;
    event.preventDefault();
    const start =
      event.key === "Backspace" ? cursor - title.length - 2 : cursor;
    const end = event.key === "Backspace" ? cursor : cursor + title.length + 1;
    const next = prompt.slice(0, start) + prompt.slice(end);
    setPrompt(next);
    setSelectedMentions((current) =>
      current.filter((mention) => mention !== title),
    );
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
      className={`node-chat-composer ${isAgent ? "node-chat-composer--agent" : ""}`}
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
                : "Agent：读取左侧上下文，输出到右侧"
            : `仅修改「${nodeTitle}」`}
        </span>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="关闭聊天节点">
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
          autoFocus={!isAgent}
          role="textbox"
          aria-multiline="true"
          aria-label="聊天节点输入"
          data-placeholder="描述任何你想生成、修改或延展的内容…"
          onInput={(event) => {
            const value = event.currentTarget.textContent ?? "";
            setPrompt(value);
            setSelectedMentions((current) => {
              const next = current.filter((mention) =>
                value.includes(`@${mention}`),
              );
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
        {mentionOpen && mentionResults.length > 0 && (
          <div
            className="node-mention-menu"
            role="listbox"
            aria-label="选择节点"
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
                          : node.type === "agent"
                            ? "Agent 节点"
                            : "备注节点"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <footer>
        <div>
          <button
            type="button"
            className="chat-attachment"
            aria-label="添加参考"
          >
            <Plus size={15} />
          </button>
          <NodeSelect value={selectedModel?.id ?? ''} ariaLabel="选择大模型" onChange={setModelId} options={compatibleModels.map((item) => ({ value: item.id, label: item.name, description: item.description, meta: item.apiKey ? '已配置' : '未配置', icon: item.capabilities.includes('reasoning') ? <BrainCircuit size={20} /> : item.capabilities.includes('image') ? <ImageIcon size={20} /> : item.capabilities.includes('vision') ? <Bot size={20} /> : <Sparkles size={20} /> }))} />
          {isAgent && (
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
                {generationType === "图片" ? <ImageIcon size={14} /> : generationType === "文档" ? <File size={14} /> : <FileText size={14} />}
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
                    { label: "文本", icon: <FileText size={20} /> },
                    { label: "图片", icon: <ImageIcon size={20} /> },
                    { label: "文档", icon: <File size={20} /> },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.label}
                      className={`node-model-option ${generationType === item.label ? "selected" : ""}`}
                      role="option"
                      aria-selected={generationType === item.label}
                      onClick={() => {
                        setGenerationType(item.label);
                        setGenerationMenuOpen(false);
                      }}
                    >
                      <span className="node-model-icon">{item.icon}</span>
                      <span className="node-model-copy">
                        <strong>{item.label}</strong>
                        <small>Agent 输出类型</small>
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
          {isAgent ? (
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
            className="node-chat-send"
            type="submit"
            disabled={!prompt.trim() || effectiveRunStatus === 'running' || !selectedModel || (generationType === '图片' && !selectedModel.apiKey)}
          aria-label="发送聊天请求"
        >
          <CornerDownLeft size={18} />
        </button>
      </footer>
      {executionSummary.length > 0 && (
        <div className={`execution-summary execution-summary--${effectiveRunStatus}`} role="status" aria-live="polite">
          <span className="execution-summary__pulse" />
          <span>{executionSummary.slice(0, 3).map((line) => <small key={line}>{line}</small>)}</span>
        </div>
      )}
    </form>
  );
}
