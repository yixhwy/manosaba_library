# 魔裁 台词语音站

纯 HTML/CSS/JS 的静态视觉小说台词预览站，覆盖全部 11 个章节，
左侧提供章节/场景导航，顶部搜索栏支持“一周目/二周目/三周目/角色”
范围标签多选、关键词搜索和台词语音播放。

## 本地运行

建议通过本地服务器打开，而不是直接双击 `index.html`：

```powershell
cd D:\project\codex\website
python -m http.server 8080
```

然后访问 <http://localhost:8080>。

## 生成数据

数据由 `tools/build_data.mjs` 从游戏解包目录生成，输出
`data/game.json`（全部章节台词）和
`data/audio-manifest.txt`（R2 上传清单）：

```powershell
node tools/build_data.mjs
```

构建脚本不包含本地绝对路径。运行前需要通过环境变量指定游戏解包目录：

```powershell
$env:GAME_ROOT = "D:\魔裁解包密码0721\魔裁"
node tools/build_data.mjs
```

脚本会在 `GAME_ROOT` 下查找 `游戏文本` 和
`人物语音（已按人物分类过了`；也可以用 `TEXT_ROOT`、`VOICE_ROOT`
单独覆盖这两个目录。

构建过程会保留 `<link>` 选项、`@choice` 和说话人信息，并自动把
每章带 Bad 选项的 Adv 场景与对应 Bad 结局分组。
脚本只生成 JSON，不会把 4.4GB 语音复制进仓库。

## 音频地址

语音已上传到 GitHub 仓库的 `audio` 分支，Cloudflare Pages 通过
`functions/audio/[[path]].js` 同源代理音频，并优先走 Cloudflare
边缘缓存；前端地址为 `/audio/`，上游为 jsDelivr：

```js
audioBaseUrl: "/audio/",
audioFallbackUrl: "https://cdn.jsdelivr.net/gh/yixhwy/manosaba_library@audio/audio/",
```

GitHub 仓库必须是公开仓库，音频才能被公开访问。页面播放失败时会
自动回退到 jsDelivr，再回退到本地 `./audio/`。

## 部署到 Cloudflare Pages

1. 把当前目录推送到 GitHub 仓库。
2. 在 Cloudflare Pages 新建项目并连接该仓库。
3. 构建命令留空，构建输出目录填写 `/`。
4. 部署后访问 `*.pages.dev` 地址。

语音文件位于 GitHub 仓库的独立 `audio` 分支，不进入 Cloudflare Pages 部署分支。
