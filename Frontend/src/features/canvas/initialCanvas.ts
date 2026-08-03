import type { CanvasEdge, CanvasNode } from '../../types/canvas'

const PRODUCT_IMAGES = [
  'https://www.maicong.cn/static/1776652760624_Ace%2068%20Air%202-%E4%B8%BB%E5%9B%BE-1.jpg',
  'https://www.maicong.cn/static/1776652763586_Ace%2068%20Air%202-%E4%B8%BB%E5%9B%BE-2.jpg',
  'https://www.maicong.cn/static/1776652766356_Ace%2068%20Air%202-%E4%B8%BB%E5%9B%BE-3.jpg',
  'https://www.maicong.cn/static/1776652769626_Ace%2068%20Air%202-%E4%B8%BB%E5%9B%BE-4.jpg',
]

export const initialNodes: CanvasNode[] = [
  {
    id: 'brief-1', type: 'text', position: { x: 40, y: 470 }, style: { width: 360, height: 270 },
    data: {
      title: '键盘卖点营销',
      content: '为一款新一代职业级电竞磁轴键盘策划一套完整内容营销方案。围绕“不羁风范，与生俱来”，让目标用户理解产品的轻盈、速度与个性，并愿意在社媒上分享、讨论和购买。',
    },
  },
  {
    id: 'product-1', type: 'image', position: { x: 510, y: 470 }, style: { width: 360, height: 258 },
    data: { title: '主视觉 01｜产品英雄图', imageUrl: PRODUCT_IMAGES[0] },
  },
  {
    id: 'product-2', type: 'image', position: { x: 2160, y: 30 }, style: { width: 360, height: 258 },
    data: { title: '主视觉 02｜桌搭场景', imageUrl: PRODUCT_IMAGES[1] },
  },
  {
    id: 'product-3', type: 'image', position: { x: 2160, y: 760 }, style: { width: 360, height: 258 },
    data: { title: '主视觉 03｜细节质感', imageUrl: PRODUCT_IMAGES[2] },
  },
  {
    id: 'product-4', type: 'image', position: { x: 3040, y: 40 }, style: { width: 360, height: 258 },
    data: { title: '主视觉 04｜个性配色', imageUrl: PRODUCT_IMAGES[3] },
  },
  {
    id: 'insight-1', type: 'text', position: { x: 950, y: 250 }, style: { width: 350, height: 240 },
    data: { title: '产品认知｜先建立记忆点', content: '核心认知：旗舰磁轴键盘 = 轻盈外形 × 职业级磁轴 × 不羁个性。\n\n传播语气：克制、锋利、有速度感；用可感知的画面代替参数堆砌。' },
  },
  {
    id: 'audience-1', type: 'text', position: { x: 950, y: 600 }, style: { width: 350, height: 240 },
    data: { title: '目标人群｜谁会被打动', content: '01 电竞玩家：在意响应、操控和稳定表现。\n02 桌搭用户：在意外观、氛围和个性表达。\n03 键盘爱好者：在意磁轴手感、结构与可玩性。' },
  },
  {
    id: 'strategy-1', type: 'text', position: { x: 1340, y: 440 }, style: { width: 350, height: 270 },
    data: { title: '内容策略｜从卖点到话题', content: '用一条主叙事串起三类内容：\n\n轻：轻盈外形与桌面美学，降低第一次了解门槛。\n快：磁轴响应与竞技场景，证明性能价值。\n酷：不羁风范与个性配色，形成社媒记忆点。' },
  },
  {
    id: 'file-1', type: 'file', position: { x: 1340, y: 790 }, style: { width: 350, height: 112 },
    data: { title: '产品资料', fileName: '键盘产品卖点.pdf', fileSize: '1.8 MB', fileKind: 'PDF' },
  },
  {
    id: 'pillar-1', type: 'text', position: { x: 1750, y: 40 }, style: { width: 350, height: 255 },
    data: { title: '内容支柱 A｜轻盈上桌', content: '主题：一把不占空间的性能键盘。\n\n形式：桌搭转场、开箱短片、ASMR 细节。\n钩子：轻到像把速度放在桌面上。\nCTA：看看你的下一把桌搭主角。' },
  },
  {
    id: 'pillar-2', type: 'text', position: { x: 1750, y: 390 }, style: { width: 350, height: 255 },
    data: { title: '内容支柱 B｜快到先一步', content: '主题：磁轴键盘如何改变操作节奏。\n\n形式：游戏实测、按键慢镜头、对比挑战。\n钩子：不是更用力，而是更早一步。\nCTA：把每一次输入都变成优势。' },
  },
  {
    id: 'pillar-3', type: 'text', position: { x: 1750, y: 740 }, style: { width: 350, height: 255 },
    data: { title: '内容支柱 C｜不羁风范', content: '主题：键盘也是你的个性签名。\n\n形式：配色搭配、用户桌面征集、UGC 二创。\n钩子：你的桌面，应该有自己的规则。\nCTA：晒出你的键盘。' },
  },
  {
    id: 'concept-1', type: 'text', position: { x: 2600, y: 410 }, style: { width: 380, height: 265 },
    data: { title: '传播大概念｜把速度放上桌', content: '品牌主张：不羁风范，与生俱来。\n\n内容母题：把看不见的响应速度，拍成看得见的光、动作和节奏。\n\n视觉：冷调金属、透明键帽、蓝紫光带；剪辑从慢到快，最后定格在产品名。' },
  },
  {
    id: 'script-1', type: 'text', position: { x: 3040, y: 390 }, style: { width: 380, height: 285 },
    data: { title: '30 秒短视频脚本｜第一支种草片', content: '0–03s｜黑场，一次清脆按键声，字幕“速度，应该被看见”。\n03–10s｜产品英雄图切入，滑轨展示轻盈外形。\n10–20s｜磁轴细节与游戏操作快切，字幕“更快响应，更早一步”。\n20–27s｜桌搭配色与手部特写，字幕“不羁风范，与生俱来”。\n27–30s｜产品定格 + CTA“把速度放上桌”。' },
  },
  {
    id: 'copy-1', type: 'text', position: { x: 3040, y: 760 }, style: { width: 380, height: 270 },
    data: { title: '社媒发布组合｜一套内容多次复用', content: '小红书：桌搭图文 + “为什么换磁轴”的体验笔记。\n抖音：30 秒主片 + 15 秒按键细节切片。\nB 站：磁轴体验与游戏实测长视频。\n微博：主视觉海报 + #把速度放上桌# 话题。\n\n每条内容统一导向产品页与用户晒单。' },
  },
  {
    id: 'campaign-1', type: 'text', position: { x: 3500, y: 470 }, style: { width: 470, height: 360 },
    data: { title: '完整内容营销方案', content: '目标：建立这款键盘的产品认知、体验信任与社媒讨论。\n\n传播主线：把速度放上桌。\n内容支柱：轻盈上桌 / 快到先一步 / 不羁风范。\n\n交付：1 支 30 秒主片、3 支卖点切片、1 组桌搭图文、1 条磁轴实测、1 个用户晒单话题。\n\n衡量：完播率、收藏率、评论中的“磁轴/手感/速度”提及率，以及产品页点击。' },
  },
]

const edge = (id: string, source: string, target: string, stroke = '#6f849b'): CanvasEdge => ({
  id, source, sourceHandle: 'right-source', target, targetHandle: 'left-target', animated: false, style: { stroke, strokeWidth: 1.8 },
})

export const initialEdges: CanvasEdge[] = [
  edge('brief-product-1', 'brief-1', 'product-1'), edge('product-1-insight', 'product-1', 'insight-1'),
  edge('insight-strategy', 'insight-1', 'strategy-1'), edge('audience-strategy', 'audience-1', 'strategy-1'), edge('file-strategy', 'file-1', 'strategy-1'),
  edge('strategy-pillar-1', 'strategy-1', 'pillar-1'), edge('strategy-pillar-2', 'strategy-1', 'pillar-2'), edge('strategy-pillar-3', 'strategy-1', 'pillar-3'),
  edge('pillar-1-product-2', 'pillar-1', 'product-2', '#9db8d2'), edge('product-2-concept', 'product-2', 'concept-1', '#9db8d2'),
  edge('pillar-2-concept', 'pillar-2', 'concept-1'), edge('pillar-3-product-3', 'pillar-3', 'product-3', '#9db8d2'), edge('product-3-concept', 'product-3', 'concept-1', '#9db8d2'),
  edge('concept-product-4', 'concept-1', 'product-4', '#a998d8'), edge('product-4-script', 'product-4', 'script-1', '#a998d8'),
  edge('concept-copy', 'concept-1', 'copy-1', '#a998d8'),
  edge('script-campaign', 'script-1', 'campaign-1', '#b8d36b'), edge('copy-campaign', 'copy-1', 'campaign-1', '#b8d36b'),
]
