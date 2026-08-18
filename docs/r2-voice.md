# Cloudflare R2 语音接入

当前站点覆盖全部 11 个章节，共用到 25856 个语音文件（约 4.4GB）。
语音文件不提交到 GitHub，而是上传到 Cloudflare R2，通过公共 URL 直接播放。

## 1. 创建桶并开启公共访问

1. 打开 Cloudflare Dashboard → R2 → Create bucket，桶名建议使用 `voice`。
2. 进入桶设置，开启 Public access：
   - 方式 A：使用 R2.dev 子域名，得到一个 `https://pub-xxxxxxxx.r2.dev/` 地址。
   - 方式 B：绑定自己的域名（如 `voice.qu354337.com`），并配置 CNAME 到 R2 提供的地址。
3. 记录桶的公共根地址，后面会填到 `js/config.js`。

语音必须按目录结构上传，保持 `人物语音/xxx.ogg` 这种相对路径，例如：

```text
Ema/0101Trial00_Ema001.ogg
Leia/0101Trial00_Leia001.ogg
无法识别语音/0101Adv04_Unknown002.ogg
```

## 2. 上传语音

推荐使用 rclone，因为它支持大文件和断点续传。

### 2.1 配置 rclone

在 Cloudflare R2 的账户设置里创建 API Token，然后执行：

```powershell
rclone config
```

选择 `New remote`，类型选择 `S3 compatible`，填写：

- Provider: `Cloudflare R2`
- Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- Access Key ID: R2 API Token 的 Access Key
- Secret Access Key: R2 API Token 的 Secret
- 其余保持默认

假设 remote 名称是 `r2`，桶名是 `voice`。

### 2.2 只上传 Chapter01 需要的语音

项目构建时已经生成了清单文件 `data/audio-manifest.txt`，里面每行是一个相对路径。
在项目目录执行：

```powershell
rclone copy "D:\魔裁解包密码0721\魔裁\人物语音（已按人物分类过了" r2:voice --files-from "D:\project\codex\website\data\audio-manifest.txt" --progress
```

rclone 会按清单里的相对路径原样复制，目录结构不会丢失。

如果之后要上传更多章节，可以扩展 `tools/build_data.mjs` 重新生成清单，再重复这条命令。

### 2.3 其他方式

少量文件也可以直接用 wrangler：

```powershell
wrangler r2 object put voice/Ema/0101Trial00_Ema001.ogg --file "D:\魔裁解包密码0721\魔裁\人物语音（已按人物分类过了\Ema\0101Trial00_Ema001.ogg"
```

注意 wrangler 逐个上传较慢，3262 个文件不建议用它全量上传。

## 3. 修改前端配置

编辑 `js/config.js`：

```js
window.APP_CONFIG = {
  dataUrl: "./data/game.json",
  audioBaseUrl: "https://pub-xxxxxxxx.r2.dev/voice/",
  audioLocalFallback: "./audio/",
};
```

- `audioBaseUrl` 填 R2 公共根地址，末尾保留 `/`。
- 站点会先用 `audioBaseUrl` 播放，失败后自动回退到本地 `./audio/`。
- 本地调试时也可以直接把 `audioBaseUrl` 改成 `"./audio/"`。

## 4. CORS 说明

网页里用 `<audio>` 直接播放 R2 音频，不需要 CORS 配置。
只有未来用 Web Audio API 做波形、混音等功能时才需要在 R2 桶设置里添加 CORS 规则。
