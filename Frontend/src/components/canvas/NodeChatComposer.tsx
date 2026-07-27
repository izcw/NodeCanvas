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
import type { CanvasNode } from "../../types/canvas";
import { NodeSelect } from "./NodeSelect";

type NodeChatComposerProps = {
  nodeTitle: string;
  onClose?: () => void;
  onSend: (prompt: string, model: string) => void;
  nodes: CanvasNode[];
  mode?: "node" | "agent";
};

const models = [
  {
    name: "Kimi K2",
    description: "长上下文，适合复杂创作",
    duration: "12s",
    icon: "sparkles",
  },
  {
    name: "Qwen Max",
    description: "均衡可靠，擅长中文表达",
    duration: "8s",
    icon: "bot",
  },
  {
    name: "DeepSeek V3",
    description: "推理清晰，适合结构化任务",
    duration: "10s",
    icon: "brain",
  },
] as const;

export function NodeChatComposer({
  nodeTitle,
  onClose,
  onSend,
  nodes,
  mode = "node",
}: NodeChatComposerProps) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("Kimi K2");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [generationType, setGenerationType] = useState("文本");
  const [generationMenuOpen, setGenerationMenuOpen] = useState(false);
  const [cardCount, setCardCount] = useState(1);
  const [cardMenuOpen, setCardMenuOpen] = useState(false);
  const generationPickerRef = useRef<HTMLDivElement>(null);
  const cardCountPickerRef = useRef<HTMLDivElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const isAgent = mode === "agent";

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
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [generationMenuOpen, cardMenuOpen]);

  useEffect(() => {
    if (!mentionOpen && !cardMenuOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!inputWrapRef.current?.contains(event.target as Node)) {
        setMentionOpen(false);
        setCardMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [mentionOpen, cardMenuOpen]);

  const send = (event?: FormEvent) => {
    event?.preventDefault();
    const value = prompt.trim();
    if (!value) return;
    onSend(value, model);
    setPrompt("");
    if (inputRef.current) inputRef.current.textContent = "";
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
            ? "Agent：读取左侧上下文，输出到右侧"
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
          <NodeSelect value={model} ariaLabel="选择大模型" onChange={setModel} options={models.map((item) => ({ value: item.name, label: item.name, description: item.description, meta: item.duration, icon: item.icon === "sparkles" ? <Sparkles size={20} /> : item.icon === "bot" ? <Bot size={20} /> : <BrainCircuit size={20} /> }))} />
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
          <NodeSelect className="card-count-picker" value={String(cardCount)} ariaLabel="选择生成卡片数量" onChange={(value) => setCardCount(Number(value))} options={[1, 2, 3, 4, 5].map((count) => ({ value: String(count), label: `×${count}`, description: count === 1 ? '生成一个结果' : `生成 ${count} 个结果`, icon: <Layers3 size={20} /> }))} />
        </div>
        <button
          className="node-chat-send"
          type="submit"
          disabled={!prompt.trim()}
          aria-label="发送聊天请求"
        >
          <CornerDownLeft size={18} />
        </button>
      </footer>
    </form>
  );
}
