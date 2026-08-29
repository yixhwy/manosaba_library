# 魔裁台词语音站

纯 HTML/CSS/JS 静态站点，用于浏览、搜索魔裁全章节台词并播放对应语音。

## 线上架构

- 网页静态文件由 Cloudflare Pages 部署。
- 台词数据发布在 `data/game.json`、`data/manifest.json`、`data/search-index.json` 和 `data/chapters/`。
- 语音文件存放在 GitHub 仓库 [yixhwy/manosaba_library](https://github.com/yixhwy/manosaba_library) 的 `audio` 分支，不上传到本项目或 Cloudflare R2。
- 网页只请求同源 `/audio/<文件路径>`；Cloudflare Pages Function `functions/audio/[[path]].js` 将请求转发到 GitHub 音频分支，并利用边缘缓存。

## 本地运行

只查看页面和数据时，可以使用普通静态服务器：

```powershell
cd D:\project\codex\copy
python -m http.server 8080
```

然后访问 <http://localhost:8080>。普通静态服务器不会执行 Cloudflare Pages Function，因此 `/audio/*` 语音代理不会在该方式下工作。语音链路需要部署到 Cloudflare Pages，或使用支持 Pages Functions 的本地模拟环境。

## 重新生成数据

使用游戏解包目录生成完整台词数据和 GitHub 音频清单：

```powershell
$env:GAME_ROOT = "D:\魔裁解包密码0721\魔裁解包"
node tools/build_data.mjs
node tools/split_data.mjs
```

默认会读取 `GAME_ROOT\游戏文本` 和 `GAME_ROOT\人物语音`。脚本也兼容旧目录名 `人物语音（已按人物分类过了`，或使用 `TEXT_ROOT`、`VOICE_ROOT` 分别指定路径。

构建结果包括：

- `data/game.json`：完整数据副本，便于构建和排错。
- `data/audio-manifest.txt`：被剧情引用的 `.ogg` 相对路径清单。
- `data/chapters/*.json`：按章节懒加载的台词数据。
- `data/manifest.json`：章节统计、Bad 分支关系和真实角色列表。
- `data/search-index.json`：搜索所需的轻量索引。

构建会检查输入目录、重复音频 ID、音频路径和 Bad 分支数量；检查失败时不会得到可部署的完整结果。

## Cloudflare Pages 部署

1. 将本目录连接到 Cloudflare Pages，构建命令留空，输出目录使用项目根目录。
2. 确认 `functions/audio/[[path]].js` 随项目一起部署。
3. 保持 GitHub 音频仓库公开，并确认 `audio` 分支中的目录结构与 `data/audio-manifest.txt` 相同。
4. 部署后检查站点页面和任意 `/audio/` 语音请求。

当前前端不直连 GitHub 或 jsDelivr，音频统一由同源 Cloudflare Function 提供。