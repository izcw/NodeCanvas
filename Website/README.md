# 灵构 NodeCanvas 官网

这是灵构（NodeCanvas）产品官网，使用 Next.js 兼容的 vinext 构建，并通过 Sites 发布。

官网视觉采用黑色背景、宽留白、低饱和图片和简洁的产品叙事，内容依据项目根目录的 README 归纳，包含：

- 节点式无限画布与知识库
- Context Graph 结构化上下文
- AI 候选决策与约束校验
- 分层偏好记忆与 Agent 工作流
- Schema 驱动的摄影、产品策划和营销文案模板
- 摄影 3D 相机、灯光节点及后续导出能力

## 目录结构

```text
Website/
├── app/
│   ├── components/
│   │   ├── ProductSection.tsx  # 可复用的功能区块
│   │   └── SiteHeader.tsx       # 顶部导航
│   ├── page.tsx                 # 官网首页与配置数据
│   ├── layout.tsx               # 页面元数据与 Open Graph
│   └── globals.css               # 全局样式与响应式规则
├── public/
│   ├── logo.png                 # 灵构 Logo
│   └── og.png                   # 分享预览图
├── .openai/hosting.json         # Sites 项目绑定信息
└── README.md
```

## 本地开发

环境要求：Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

开发服务器默认地址：`http://localhost:3000`。

## 构建与测试

```bash
npm run build
node --test tests/rendered-html.test.mjs
```

构建产物会生成在 `dist/`，测试会检查首页是否能正常服务端渲染、页面标题和主要内容是否存在。

## 导出静态页面

宝塔面板使用静态网站时，执行：

```bash
npm run export:static
```

命令会生成 `static-site/`，并自动整理 `index.html`、JavaScript、CSS、Logo 和分享图片。将 `static-site/` 目录中的全部文件上传到宝塔网站根目录即可。

宝塔配置建议：

1. 新建“静态网站”，绑定域名。
2. 将 `static-site/` 内的文件上传到网站根目录。
3. 默认首页设置为 `index.html`。
4. 开启 HTTPS 和 gzip / Brotli 静态资源压缩。
5. 如果使用 CDN，请为 `assets/` 配置长期缓存。

## 如何提交代码

每次修改完成后，先查看变更，再提交一个有说明性的 commit：

```bash
git status
git add app README.md
git commit -m "更新官网首屏布局"
```

如果修改了其他目录，也可以使用：

```bash
git add .
```

## 如何推送代码

### 推送到已有 Git 远程仓库

如果本地已经配置 `origin`：

```bash
git push origin main
```

如果还没有配置远程仓库：

```bash
git remote add origin <远程仓库地址>
git push -u origin main
```

### 推送到 Sites 源码仓库

Sites 使用短期凭证推送，凭证不要写入远程 URL、`.git/config` 或项目文件。推送流程如下：

1. 在 Sites 中获取当前项目的源码写入凭证。
2. 使用一次性的 HTTP Authorization 请求头推送当前分支：

```bash
git -c http.extraHeader="Authorization: Bearer <短期凭证>" \
  push <Sites 源码仓库地址> HEAD:main
```

3. 使用当前推送后的 commit SHA 打包并保存 Sites 版本。
4. 部署保存的版本，并轮询部署状态直到成功。

不要把 `<短期凭证>` 提交到代码仓库，也不要使用带凭证的远程地址。

## 官网发布

官网当前由 Sites 私密托管。修改页面代码后，推荐使用以下顺序：

```text
修改代码
  → npm run build
  → node --test tests/rendered-html.test.mjs
  → git commit
  → 推送源码
  → package-site.sh 打包
  → 保存 Sites 版本
  → 部署私密版本
```

`.openai/hosting.json` 中只保存 `project_id`、D1 和 R2 绑定信息，不保存源码推送凭证。
