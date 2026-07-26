import type { CanvasEdge, CanvasNode } from '../../types/canvas'

export const initialNodes: CanvasNode[] = [
  {
    id: 'brief-1',
    type: 'text',
    position: { x: 80, y: 110 },
    style: { width: 330, height: 252 },
    data: {
      title: '夏日品牌短片',
      content:
        '为新能源旅行品牌策划一组夏日公路短片。画面需要克制、自然，并突出“自由出发”的轻松感。',
    },
  },
  {
    id: 'image-1',
    type: 'image',
    position: { x: 510, y: 62 },
    style: { width: 360, height: 258 },
    data: { title: '公路视觉参考', imageUrl: '/sample-concept.svg' },
  },
  {
    id: 'file-1',
    type: 'file',
    position: { x: 520, y: 395 },
    style: { width: 320, height: 112 },
    data: {
      title: '项目附件',
      fileName: '品牌拍摄需求.pdf',
      fileSize: '2.4 MB',
      fileKind: 'PDF',
    },
  },
]

export const initialEdges: CanvasEdge[] = [
  {
    id: 'brief-image',
    source: 'brief-1',
    target: 'image-1',
    animated: true,
    style: { stroke: '#7d91a5', strokeWidth: 1.7 },
  },
  {
    id: 'brief-file',
    source: 'brief-1',
    target: 'file-1',
    style: { stroke: '#4d5964', strokeWidth: 1.5 },
  },
]
