# MyUsagi 

> 本仓库 fork 自 [WayneYe912/OhMyChiikawa](https://github.com/WayneYe912/OhMyChiikawa)，将后端从 Electron 迁移至 Rust + Tauri 2。

## 前置要求

- [Rust](https://rustup.rs/) 1.75+
- [Bun](https://bun.sh/) 1.3+（TS 编译打包 + 素材烘焙脚本 + devDependencies）
- Windows：WebView2（Win10+ 通常已内置）
- macOS：Xcode Command Line Tools

## 快速开始

```bash
cd MyUsagi

# 首次需安装前端依赖并构建 webview bundle（产出 webview/dist/）
bun install
bun run build:webview

# 开发运行（Tauri 从 webview/dist/ 加载前端）
cargo tauri dev

# 或直接运行 CLI 二进制
cargo run -- --size medium
```

> 改完 `webview/src/` 下的 TS 源码后需重新 `bun run build:webview`，`cargo tauri dev` 才能看到变更。开发时可改用 `bun run dev:webview` 监听式重建。

## CLI

构建后 `myusagi` 二进制集成全部子命令：

```bash
cargo build --release

# 启动（乌萨奇）
./target/release/myusagi

# 指定尺寸
./target/release/myusagi --size large

# 重建加密资源包（增量合并 webview/images/ → webview/assets.pak）
./target/release/myusagi pack

# 版本
./target/release/myusagi version
```

Windows 可用根目录 `myusagi.cmd` 包装脚本。

## 乌萨奇动作

右键菜单：跳一下、转手、**跳舞**（含 BGM，随音频结束停止）。跳舞帧来自 `Usagi_chiikawa_Desktop-virtual-pet/cartoon_dance`，BGM 来自同项目 `MP3/dance.mp3`，经复制后打入 `assets.pak`。

```bash
# 重新烘焙跳舞素材
bun install
bun run bake:dance
# 复制 BGM（若尚未存在）
# copy ..\Usagi_chiikawa_Desktop-virtual-pet\MP3\dance.mp3 ..\webview\audio\usagi_dance.mp3
cargo run --release -- pack
```

## 对话配音

点击身体/脸/耳朵或 idle 随机台词时，若配置了 `audio` 字段会播放对应 MP3。默认台词见 `webview/src/speech/data.ts`，需将下列文件放入 `webview/audio/` 后执行 `cargo run -- pack`（与跳舞 BGM 同一流程，**增量合并**，不会覆盖 pak 内已有条目）：

| 文件 | 台词 |
|------|------|
| `audio/usagi_haah.mp3` | 哈？ |
| `audio/usagi_ura.mp3` | 乌拉！ |
| `audio/usagi_urayala.mp3` | 乌拉呀哈呀啦呜哈～ |
| `audio/usagi_wulili.mp3` | 乌哩哩 |

素材可从 [OhMyChiikawa](https://github.com/WayneYe912/OhMyChiikawa) 原版 `audio/` 目录复制（文件名与上表一致）。若 pak 内仅有 `usagi_dance.mp3` 而无上述文件，对话气泡仍会显示，但不会有配音。

```bash
# 示例：从 Electron 版复制后打包
# copy ..\OhMyChiikawa\audio\usagi_haah.mp3 webview\audio\
# …（其余 mp3 同理）
cargo run -- pack
bun run build:webview
```

## 打包

```bash
cargo tauri build
```

产物位于 `target/release/bundle/`（NSIS / Portable / DMG）。

## 清理构建缓存

本仓库为 Cargo workspace（成员 `native/`），编译产物统一落在根目录 `target/`。

### Rust / Tauri（常用）

```bash
# 删除全部 debug + release 构建产物（约 1–2 GiB）
cargo clean

# 仅清理 release
cargo clean --release
```

清理后下次 `cargo tauri dev` / `cargo tauri build` 会完整重新编译。

### Tauri 生成文件

若权限/能力 schema 异常，可手动删除后让 Tauri 重新生成：

```bash
# Windows
Remove-Item -Recurse -Force native\gen

# macOS / Linux
rm -rf native/gen
```

### Bun 依赖（TS 构建 + 素材烘焙脚本）

```bash
# Windows
Remove-Item -Recurse -Force node_modules

# macOS / Linux
rm -rf node_modules

bun install
```

### 说明

| 路径 | 内容 | 清理方式 |
|------|------|----------|
| `target/` | Rust 编译缓存、二进制、安装包 | `cargo clean` |
| `native/gen/` | Tauri CLI 生成的 schema | 手动删除 |
| `webview/dist/` | 前端 Bun 打包产物（可由 `bun run build:webview` 重建） | 手动删除后重新构建 |
| `node_modules/` | TS 构建/烘焙/测试用 devDependencies | 手动删除后 `bun install` |

全局 Cargo 注册表缓存（`~/.cargo/registry`、`~/.cargo/git`）一般无需清理；仅在磁盘空间不足或依赖损坏时考虑 `cargo cache --autoclean`（需安装 [cargo-cache](https://github.com/matthiaskrgr/cargo-cache)）。

## 目录结构

顶层按职责分为 **`webview/`**（WebView 渲染层，TypeScript 源码 + Bun 打包产物）与 **`native/`**（Tauri 原生壳）：

```
MyUsagi/
├── webview/                # WebView 渲染层
│   ├── src/                #   TS 源码（PetEngine 五模块 + pets + bridge）
│   ├── tests/              #   vitest 单元测试（import src/ TS）
│   ├── dist/               #   Bun 构建产物（bundle.js + index.html + styles.css）
│   ├── styles.css          #   样式源（build 拷贝到 dist/）
│   └── assets.pak          #   加密资源包
├── native/                 # Tauri 原生壳（Rust 后端）
│   ├── src/
│   │   ├── vault.rs        #   AES-256-CBC（与 Electron 版兼容）
│   │   ├── window.rs       #   窗口、拖拽、散步
│   │   ├── cursor.rs       #   光标跟随
│   │   ├── menu.rs         #   右键菜单
│   │   ├── commands.rs     #   Tauri IPC
│   │   └── pack.rs         #   myusagi pack
│   └── tauri.conf.json     #   frontendDist → ../webview/dist
├── scripts/                # 素材烘焙 + webview 构建脚本
├── tsconfig.json           # strict TS 配置
├── vitest.config.mjs       # vitest 配置
├── myusagi / myusagi.cmd   # 指向构建产物的包装
└── docs/                   # 设计文档
```

## 开发说明

- 前端为 TypeScript（`strict`），由 Bun 打包成单文件 `webview/dist/bundle.js`；改完 TS 必须 `bun run build:webview`。
- 类型检查：`bun run typecheck`（`tsc --noEmit`）；单元测试：`bun run test`（vitest，用例在 `webview/tests/`）。
- `assets.pak` 格式与加密密钥与 Electron 版**完全兼容**，可直接复用。
- 原始 PNG/MP3 放入 `webview/images/` 或 `webview/audio/` 后运行 `myusagi pack` 更新 pak。
- macOS 透明窗口鼠标穿透需在真机验证（见 REFACTOR-TAURI.md §5.1）。

## 许可证

MIT
