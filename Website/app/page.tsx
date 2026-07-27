import { Github } from "lucide-react";
import { SiteHeader } from "./components/SiteHeader";
import { ProductSection, type ProductSectionData } from "./components/ProductSection";
import { HeroStage } from "./components/HeroStage";

const HERO_IMAGE =
  "https://www.lumehub.duoyu.link/resource/blog/original/cb2e47afbfcd_20260727.png";
const CAPABILITY_IMAGES = [
  "https://www.lumehub.duoyu.link/resource/blog/original/a6421cdc2cef_20260727.png",
  "https://www.lumehub.duoyu.link/resource/blog/original/33b03dac6134_20260727.png",
  "https://www.lumehub.duoyu.link/resource/blog/original/551ea32eecc7_20260727.png",
  "https://www.lumehub.duoyu.link/resource/blog/original/493d2c4e6d05_20260727.png",
  "https://www.lumehub.duoyu.link/resource/blog/original/85fb50d66e5e_20260727.png",
];

const sections: ProductSectionData[] = [
  {
    id: "canvas",
    title: "让思考拥有空间，而不只是时间顺序",
    description:
      "在无限画布中自由放置文本、图片、文件与对话节点。拖拽、缩放、框选、连线和分组，让复杂策划从一串消息，变成可以直接理解和编辑的创意地图。",
    image: CAPABILITY_IMAGES[0],
    imageAlt: "NodeCanvas 功能视觉占位图",
    direction: "text-left",
    tone: "ink",
  },
  {
    id: "context",
    title: "每一次选择，都成为可追溯的上下文",
    description:
      "NodeCanvas 用可编辑的 Context Graph 组织目标、候选、约束与输出。系统从当前分支、祖先节点和锁定决策中动态构建上下文快照，减少长对话里的信息丢失与方向漂移。",
    image: CAPABILITY_IMAGES[1],
    imageAlt: "Context Graph 功能视觉占位图",
    direction: "image-left",
    tone: "graphite",
  },
  {
    id: "candidates",
    title: "不是给出唯一答案，而是帮助你做出判断",
    description:
      "AI 将围绕当前目标生成方向清晰、结构一致的候选卡。你可以选择、淘汰、保留或继续发散；语义去重与约束校验则负责守住差异性和上下文一致性。",
    image: CAPABILITY_IMAGES[2],
    imageAlt: "候选决策机制功能视觉占位图",
    direction: "text-left",
    tone: "violet",
  },
  {
    id: "memory",
    title: "记住偏好，也记得偏好从何而来",
    description:
      "项目决策、项目内偏好与跨项目长期偏好被分层管理，并保留来源证据与置信权重。单一主 Agent 通过明确的工作节点完成意图识别、知识检索、候选生成与图谱写入。",
    image: CAPABILITY_IMAGES[3],
    imageAlt: "记忆与 Agent 功能视觉占位图",
    direction: "image-left",
    tone: "ember",
  },
  {
    id: "roadmap",
    title: "一套底层机制，生长出不同创意工作流",
    description:
      "通过 Schema 定义节点类型、策划维度与关系约束，统一引擎将逐步支持摄影、产品策划、营销文案与旅游规划。摄影场景还将加入 3D 相机与灯光节点，并输出可执行的方案、镜头和参数。",
    image: CAPABILITY_IMAGES[4],
    imageAlt: "扩展生态与未来能力视觉占位图",
    direction: "text-left",
    tone: "blue",
  },
];

export default function Home() {
  return (
    <main>
      <SiteHeader />

      <section className="hero" id="top">
        <div className="hero-grid" aria-hidden="true" />
        {/* <div className="hero-glow hero-glow-one" aria-hidden="true" />
        <div className="hero-glow hero-glow-two" aria-hidden="true" /> */}

        <div className="hero-inner">
          <h1>把创意过程，变成一张会生长的图。</h1>
          <p className="hero-copy">以可编辑的上下文图替代线性聊天，让 AI 策划更连续、更一致、更可控。</p>
          <div className="hero-actions">
            <a className="button button-light" href="#canvas">开始探索</a>
          </div>
        </div>

        <HeroStage image={HERO_IMAGE} />
      </section>

      <div id="capabilities">
        {sections.map((section, index) => (
          <ProductSection key={section.id} section={section} index={index} />
        ))}
      </div>

      <section className="final-cta">
        <div className="final-orbit" aria-hidden="true" />
        <h2>开始体验灵构</h2>
        <a className="button button-light" href="#canvas">免费开始</a>
      </section>

      <footer>
       <div className="brand-box">
        <a className="brand brand-footer" href="#top" aria-label="灵构返回顶部">
            <img className="brand-logo-image" src="/logo.png" alt="灵构" />
            <span>灵构</span>
          </a>
          <div className="footer-socials" aria-label="社交链接">
            <a href="https://space.bilibili.com/479608201?spm_id_from=333.1007.0.0" target="_blank" rel="noreferrer" aria-label="哔哩哔哩">B</a>
            <a href="https://github.com/izcw" target="_blank" rel="noreferrer" aria-label="GitHub"><Github size={15} /></a>
          </div>
          <a className="back-top" href="#top">回到顶部 ↑</a>
       </div>
        <div className="copyright-box">
          <p className="copyright">隐私政策&nbsp; | &nbsp;服务条款</p>
          <p className="copyright">© 2026 灵构 · NodeCanvas. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
