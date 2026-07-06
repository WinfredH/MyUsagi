# MyUsagi — AI Agent 指南

MyUsagi 是 [OhMyChiikawa](https://github.com/WayneYe912/OhMyChiikawa) 的 **Rust + Tauri 2** 迁移版：完全离线的桌面宠物应用，默认角色为乌萨奇（Usagi）。后端负责 OS 交互，前端为 **TypeScript** 渲染层，经 **PetEngine 五模块**（面向对象 class）组织，由 **Bun** 编译打包为单文件 bundle。

本文档面向 AI 编码代理，说明技术架构、模块职责与开发约定。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Rust 1.75+、Tauri 2、Bun 1.3+（TS 编译打包 + 素材烘焙脚本） |
| 前端 | **TypeScript**（`strict: true`，ESM `class`，无 React / 无运行时框架） |
| 打包 | `bun run build:webview` → `webview/dist/bundle.js`；`cargo tauri build`（NSIS / Portable / DMG） |
| 依赖 | 零前端运行时依赖；Rust 侧见 `Cargo.toml`；devDependencies 见 `package.json` |
| 网络 | **不使用任何网络访问** |

---

## 进程架构

```
myusagi (CLI 二进制 / cargo run)
 └── Tauri App
      ├── native/        Rust：窗口、菜单、散步、光标、资源解密、IPC
      └── webview/       WebView：PetEngine + 宠物渲染
           ├── src/            TS 源码（PetEngine 五模块 + pets + bridge）
           │   ├── pet-bridge.ts   PetBridge class → window.petAPI
           │   ├── renderer.ts     薄编排层（组装五引擎并启动）
           │   └── ...             engine / pets / types
           └── dist/          Bun 打包产物（bundle.js + index.html + styles.css）
```

### Rust 主进程 (`native/src/`)

| 模块 | 职责 |
|------|------|
| `lib.rs` | 应用启动、状态注入、`get_asset_bundle` |
| `window.rs` | 透明窗口、拖拽、自动散步、尺寸 |
| `cursor.rs` | 全局光标轮询 → `pet_look` / `cursor_move` |
| `menu.rs` | 右键菜单 → `pet_react` 等事件 |
| `commands.rs` | Tauri invoke 命令 |
| `vault.rs` | AES-256-CBC 加解密（与 Electron 版兼容） |
| `pack.rs` | `myusagi pack` 增量合并 `webview/images/`、`webview/audio/` → `assets.pak` |

### 前端桥接 (`webview/src/pet-bridge.ts`)

`PetBridge` class 替代 Electron `preload.js`。构造时订阅全部 Tauri 事件；`init()` 调 `invoke('get_asset_bundle')` **一次性**注入全部资源的 data URL；渲染进程通过 `window.petAPI.asset(path)` 同步读取。`renderer.ts` 调 `installPetBridge(bridge)` 将实例挂到 `window.petAPI`。

---

## PetEngine 五模块架构

渲染层自单体 `renderer.js` 拆为五个引擎 + 薄编排层。**TS 化后全部为 ESM `class`，通过 `import` 组织；不再使用 IIFE / `globalThis.PetEngine` 命名空间。**

```
TriggerHub ──Intent──► ActionEngine ──► CharacterEngine
 │      │                 │
 │      │                 └──► AudioEngine
 │      └──► SpeechEngine ─► AudioEngine
 └──► AudioEngine（仅 setEnabled，由 `audio_enabled` IPC 触发）
```

### 模块职责

| 模块 | 文件 | 类 | 职责 |
|------|------|------|------|
| **TriggerHub** | `src/trigger.ts` | `TriggerHub` | IPC / 指针 / idle 定时器 / **悬停 3 秒** → Intent 派发；IntentGuard 互斥（`canDispatch` 静态方法）；监听 `audio_enabled` 切换 AudioEngine |
| **ActionEngine** | `src/action.ts` | `ActionEngine` | 动作注册表、帧播放、散步 sustained、overlay 动作锁 |
| **CharacterEngine** | `src/character.ts` | `CharacterEngine` | DOM 图层、视觉模式、RAF 运动、命中测试、气泡视图 |
| **SpeechEngine** | `src/speech/index.ts` | `SpeechEngine` + `DialogueInstance` / `SpeechLine` / `SpeechSession` | 对话数据消费、`SpeechSession` 生命周期、对话音频同步（气泡时长跟随音频） |
| **AudioEngine** | `src/audio.ts` | `AudioEngine` + `AudioHandle` | 音频播放能力的**统一管理者**；`action`/`speech` 双通道隔离；`setEnabled` 全局开关；所有音频播放必经此类 |
| **SpeechData** | `src/speech/data.ts` | 常量 export | 默认对话数据（`DEFAULT_SPEECH` / `DEFAULT_ROLL_DIALOGUE`），与实现分离 |
| **util** | `src/util.ts` | `Util`（静态方法） | `clamp` / `lerp` / `assetURL` / 帧序列加载 |
| **region** | `src/region.ts` | `RegionUtil`（静态方法） | 归一化坐标 → 分部位命中区域 |
| **types** | `src/types.ts` | 接口/类型 | `Intent` / `Dialogue` / `PetConfig` / `PetrAPI` / 各引擎 structural interface |
| **编排** | `src/renderer.ts` | `boot()` | init 资源 → `new` 五引擎 → `start()` |

### 依赖规则（单向，不得违反）

由 ES `import` 在编译期保证单向依赖：

- TriggerHub → ActionEngine、CharacterEngine、SpeechEngine、AudioEngine（仅 `setEnabled`，由 `audio_enabled` IPC 触发）
- ActionEngine → CharacterEngine、AudioEngine、SpeechEngine（roll `onStart` 触发 roll 台词）
- SpeechEngine → CharacterEngine（气泡视图）、AudioEngine（speech 通道）
- AudioEngine → 仅 `Util.assetURL`；**不**感知动作/对话语义，被动提供播放能力
- CharacterEngine → `Util`、`RegionUtil`（**不**感知菜单、动作锁、对话）
- 模块间通过 **Intent** 或公开实例方法通信，禁止反向依赖
- **音频播放必经 AudioEngine**：ActionEngine 与 SpeechEngine 不得直接 `new Audio(...)`

### Intent 协议

TriggerHub 统一派发意图对象（`Intent` 接口定义在 `src/types.ts`）：

```typescript
// 动作 → ActionEngine.handleIntent
{ kind: 'action.play', name: 'hop'|'roll'|'dance'|'walk', source: string }
{ kind: 'action.stop', name: 'walk', source: string }

// 角色 → CharacterEngine.handleIntent
{ kind: 'character.look', dx, dy }
{ kind: 'character.walk', active, dir, facing }
{ kind: 'character.scale', height }
{ kind: 'character.lang', code }
{ kind: 'character.part', region: 'ear-l'|'face'|'hand-l'|..., source }
{ kind: 'character.blink' | 'character.wobble' }

// 对话 → SpeechEngine.handleIntent
{ kind: 'character.speech', name?, text?, audio?, duration?, source }
//   - 带 name：按 Dialogue.name 精准触发（presentByName）
//   - 带 text/audio：临时构造 SpeechLine（present）
//   - 全空：从当前语言池随机抽取（presentRandom）
```

**内置触发源**：右键菜单（`pet_react`）、单击分区、双击转手、idle 随机行为、**鼠标悬停角色 3 秒 → dance**（`source: 'hover'`）。悬停计时在离开角色、拖拽、或 overlay 动作进行中时取消；Windows 穿透模式下依赖 Rust `cursor_move` 轮询。

### 状态归属

| 状态 | 所有者 | 说明 |
|------|--------|------|
| overlay 动作锁 | `ActionEngine._overlayAction` / `isBusy()` | roll/dance 期间为 true |
| 散步 sustained | `ActionEngine._sustainedAction` | walk overlay；**不**阻塞 hop |
| 视觉模式 | `CharacterEngine._visualMode` | `idle` / `acting` / `running` → CSS class |
| 运动态 | `CharacterEngine._motion` | look、hop、拖拽、walk bob、耳朵等 |
| 对话会话 | `SpeechEngine._activeSession` | 同一时刻最多一个；新对话 `stop()` 旧会话 |
| 音频播放开关 | `AudioEngine._enabled` / `isEnabled()` | `false` 时 `play*` 返回 null，上层走兜底；Rust `WindowState.audio_enabled` 镜像 |
| 通道槽位 | `AudioEngine._channels` | `{ action, speech }` 双通道，互不抢占 |

### 动作类型（ActionKind）

| kind | 示例 | 结束条件 |
|------|------|----------|
| `procedural` | hop | CharacterEngine 640ms 缓动 |
| `overlay-frames` | roll, dance | `count × loops` 或 `loopUntil: 'audio'` |
| `sequence-inplace` | usagi-roll（内部变体） | `loops`；单图原地换帧 |
| `sustained-overlay` | walk | Rust `pet_walk_stop` → `action.stop walk` |

`ActionEngine` 启动时 **自动注册** `pet.actions` 中未内置的动作；`roll` / `dance` / `hop` / `walk` 有内置钩子（如 roll 台词、dance 音频）。

### 对话与音频

#### Dialogue 数据模型

对话条目统一为多语言对象，定义在 `src/speech/data.ts` 或 `src/pets/<id>.ts` 的 `speech` / `rollSpeech` 字段：

```typescript
{
  name: 'wulili',            // 唯一标识，用于 presentByName / Intent.name
  textZh: '乌哩哩',           // 三语文案，运行时按 lang 取用
  textEn: 'Wulili',
  textJa: 'ウリリ',
  audio: 'audio/usagi_wulili.mp3',  // 可选；引用音频时气泡时长跟随音频
  duration: 2400                    // 可选；与音频时长保持一致，音频缺失时作兜底
}
```

- 仅接受标准字段，**不**兼容旧格式（string / `{zh,en,ja}` 分语言结构）
- `pet.speech` 为 Dialogue 数组；`pet.rollSpeech` 为单个 Dialogue（`name` 默认补 `'roll'`）
- `presentRandom()` 从池中随机抽取；`presentByName(name)` / `Intent.name` 精准触发

#### SpeechSession 生命周期

- `start()`：`showBubble(text)` → 若 `hasAudio` 则 `audio.playSpeech` + `onEnded(finish)`（气泡时长 = 音频时长），否则 `setTimeout(finish, duration)`
- 音频播放失败 / `onError` / `play()` reject → 回退到 `duration` 计时
- `stop()` / `finish()` 幂等；新对话会先 `stop()` 旧 session

#### AudioEngine 统一入口

`AudioEngine`（`src/audio.ts`，ES `class`）是音频播放的唯一管理者：

| API | 说明 |
|-----|------|
| `play(path, channel)` | 核心；关闭或资源缺失返回 `null` |
| `playAction` / `playSpeech` | 通道便捷方法；`play` 默认走 `action` 通道 |
| `stopAll` / `stopAction` / `stopSpeech` | 通道停止 |
| `setEnabled(on)` / `isEnabled()` | 全局播放开关；关闭时 `stopAll()` 并阻止后续 `play` |

- **所有音频必经 AudioEngine**：ActionEngine（动作 BGM）与 SpeechEngine（对话配音）均通过 `audio.playAction` / `audio.playSpeech`，不得直接 `new Audio(...)`
- `action` / `speech` 双通道隔离，互不抢占
- 右键菜单"音频"项 → Rust `toggle:audio` → `audio_enabled` 事件 → TriggerHub → `AudioEngine.setEnabled`，对对话和动作音频同时生效
- 关闭时 `play*` 返回 `null`，上层走兜底（对话 → `duration` 计时；动作 → `loops` 帧循环），动画与气泡不中断

---

## 动画合成（CharacterEngine）

整体运动合并写入 `#layer-move` 单一 `transform`：

```
#layer-move     整体位移 / 旋转 / 缩放 / 朝向翻转
 #layer-tilt    点头（脸点击）
  #pet-content
    .layered    待机：body + ears + CSS 眼睑
    .action-img overlay 动作帧（.acting）
    .run-img    跑步帧（.running）
#speech         对话气泡（transform 栈外）
```

- **Alpha 命中测试**：body + ears 绘制到离屏 canvas，按像素 alpha 判断交互
- **透明穿透**：TriggerHub 根据 `overPet()` 调用 `petAPI.setIgnore()`
- **分部位点击**：仅 `image-layered` 且定义了 `ears` 的宠物支持 `regionAt()`

---

## IPC 契约

### 渲染进程 → Rust（invoke）

| 方法 | 用途 |
|------|------|
| `init()` | 加载 `get_asset_bundle` |
| `asset(path)` | 同步获取 data URL |
| `fit(w, h)` | 调整窗口尺寸 |
| `dragStart / dragMove / dragEnd` | 拖拽窗口 |
| `setIgnore(ignore)` | 透明区域鼠标穿透 |
| `openMenu()` | 打开右键菜单 |
| `quit()` | 退出应用 |

### Rust → 渲染进程（Tauri event）

| 事件 | payload | TriggerHub 映射 |
|------|---------|-----------------|
| `pet_react` | `'hop'` / `'roll'` / `'dance'` | `action.play` |
| `pet_look` | `{ dx, dy }` | `character.look` |
| `pet_walk` | `{ dir }` | `character.walk` + `action.play walk` |
| `pet_walk_stop` | — | `action.stop walk` + `character.walk` |
| `scale_set` | 像素高度 | `character.scale` |
| `pet_lang` | `'zh'` / `'en'` / `'ja'` | `character.lang` |
| `cursor_move` | `{ x, y }` | Windows 穿透模式下更新 `setIgnore` |
| `audio_enabled` | `bool` | TriggerHub → `AudioEngine.setEnabled`，切换音频播放能力 |

---

## 宠物系统

### 注册机制

宠物在 `webview/src/pets/<id>.ts` 中以 `export default PET`（`PetConfig`）形式定义，由 `renderer.ts` 显式 `import` 并调 `PetRegistry.register(...)`。当前运行时固定加载 **usagi**（`renderer.ts` 写死 `PetRegistry.get('usagi')`）。

### 宠物类型 (`kind`)

| kind | 说明 | 示例 |
|------|------|------|
| `image-layered` | 身体 + 耳朵层 + CSS 眼睑 | usagi（默认） |
| `image-sequence` | 单 `<img>` 切帧，idle 与动作无缝 | usagi-roll（内部，非用户可选） |
| `image` | 单张平铺精灵图 | （当前未使用） |

### 关键配置字段（`webview/src/pets/usagi.ts`）

```typescript
const PET: PetConfig = {
  id: 'usagi',
  kind: 'image-layered',
  aspect: 600 / 910,
  natural: { w: 600, h: 910 },
  body: 'images/usagi/body.webp',
  ears: [{ src, side, box, origin }, …],
  eyes: [{ x, y, w, h }, …],           // 归一化 0–1
  lid: 'rgb(…)',
  actions: {
    roll: { base, count, pad, ext, start, fps, loops },
    dance: { …, loopUntil: 'audio', audio: 'audio/usagi_dance.mp3', layoutPad: { aspect: 840/910 } }
  },
  walk: { base, count, pad, ext, start, fps },
  speech: [ { name, textZh, textEn, textJa, audio?, duration? }, … ],   // 可选；缺省回退 SpeechData.DEFAULT_SPEECH
  rollSpeech: { name:'roll', textZh, textEn, textJa, audio?, duration? } // 可选；缺省回退 SpeechData.DEFAULT_ROLL_DIALOGUE
};
export default PET;
```

---

## 扩展新动作

1. 素材 → `webview/images/` 或 `webview/audio/` → `cargo run -- pack`
2. 在 `src/pets/usagi.ts` 的 `actions` 增加配置（自动注册）
3. 需台词/特效：在 `src/action.ts` 手动 `register()`（优先于自动注册）
4. 菜单触发：在 `native/src/menu.rs` 增加项并 `emit("pet_react", "name")`
5. 音频：`loopUntil: 'audio'` + `audio` 路径；播放经 `AudioEngine.playAction`；失败时回退 `loops`
6. 改完运行 `bun run build:webview` 重建 bundle

非连续帧序列应 **离线烘焙** 为连续编号 PNG（参考 `scripts/bake-usagi-dance.mjs`）。

---

## 资源加密

- 原始 PNG/MP3 **不提交** Git；提交加密后的 `webview/assets.pak`
- 算法：AES-256-CBC，密钥与 Electron 版**完全兼容**
- `myusagi pack` 采用**增量合并**：保留 pak 内已有条目，覆盖/追加磁盘文件
- 开发时若无 pak，`Util.assetURL` 回退到 `webview/images/` 等原始路径

---

## 目录结构

```
MyUsagi/
├── webview/                       # WebView 渲染层
│   ├── src/                       # TS 源码（PetEngine 五模块）
│   │   ├── types.ts               # Intent / Dialogue / PetConfig / PetrAPI 等共享类型
│   │   ├── util.ts                # Util 静态类
│   │   ├── region.ts              # RegionUtil 静态类
│   │   ├── audio.ts               # AudioEngine + AudioHandle
│   │   ├── character.ts           # CharacterEngine
│   │   ├── speech/                # SpeechEngine 模块（实现 + 数据分离）
│   │   │   ├── index.ts           # DialogueInstance / SpeechLine / SpeechSession / SpeechEngine
│   │   │   └── data.ts            # 默认对话数据（DEFAULT_SPEECH / DEFAULT_ROLL_DIALOGUE）
│   │   ├── action.ts              # ActionEngine
│   │   ├── trigger.ts             # TriggerHub
│   │   ├── pets/
│   │   │   ├── registry.ts        # PetRegistry 静态单例
│   │   │   ├── usagi.ts           # export default PetConfig
│   │   │   └── usagi-roll.ts      # 内部变体，非用户可选
│   │   ├── pet-bridge.ts          # PetBridge class → window.petAPI
│   │   └── renderer.ts            # boot() 入口（薄编排）
│   ├── tests/                     # vitest 测试用例（import src/ TS）
│   │   ├── setup.mjs
│   │   ├── util.test.mjs
│   │   ├── trigger-guard.test.mjs
│   │   ├── registry.test.mjs
│   │   └── engine/
│   │       ├── setup-vitest.mjs
│   │       ├── region.test.mjs
│   │       ├── speech-engine.test.mjs
│   │       ├── action-engine.test.mjs
│   │       └── trigger-dispatch.test.mjs
│   ├── dist/                      # Bun 构建产物（.gitignore）
│   │   ├── bundle.js              # 单文件 bundle
│   │   ├── index.html             # 由 build 脚本内联生成
│   │   └── styles.css             # 从 webview/styles.css 拷贝
│   ├── styles.css                 # 样式源（build 拷贝到 dist/）
│   ├── assets.pak                 # 加密资源包
│   ├── images/                    # 开发用，.gitignore
│   └── audio/                     # 开发用，.gitignore
├── native/                        # Tauri 原生壳
│   ├── src/                       # Rust 源码
│   └── tauri.conf.json            # frontendDist → ../webview/dist
├── scripts/                       # bake-usagi-dance.mjs、build-webview.ts 等
├── tsconfig.json                  # strict TS 配置（noEmit，仅类型检查）
├── vitest.config.mjs              # vitest 配置（include webview/tests/**）
├── package.json                   # bun 脚本与 devDependencies
├── myusagi / myusagi.cmd
└── AGENTS.md
```

---

## 构建与常用命令

```bash
# 前端 TS 编译打包（产出 webview/dist/bundle.js + index.html + styles.css）
bun install
bun run build:webview

# 开发运行（需先 build:webview，Tauri 从 webview/dist 加载）
bun run build:webview && cargo tauri dev

# 监听式重建前端
bun run dev:webview

# 类型检查（tsc --noEmit，strict）
bun run typecheck

# 单元测试（vitest，import src/ TS）
bun run test

# Rust 侧
cargo run -- --size large    # CLI 启动并指定尺寸
cargo run -- pack            # 重建 assets.pak
cargo tauri build            # 发行打包

# 素材烘焙
bun run bake:dance
```

> **重要**：`cargo tauri dev` / `cargo tauri build` 从 `webview/dist/` 加载前端，因此改完 TS 必须先 `bun run build:webview`。`tauri.conf.json` 的 `frontendDist` 指向 `../webview/dist`。

---

## 编码约定

- **TypeScript strict**：`tsconfig.json` 开启 `strict` / `noImplicitAny` / `strictNullChecks`
- **面向对象**：各引擎为 ESM `class`，通过 `import` 组织；**不再使用 IIFE / `globalThis.PetEngine`**
- **访问修饰符**：私有成员以 `_` 前缀命名（如 `_overlayAction`），公有成员显式写 `public` 关键字
- **静态工具类**：`Util` / `RegionUtil` / `PetRegistry` 为纯静态方法类
- **类型层**：跨模块契约（`Intent` / `Dialogue` / `PetConfig` / `PetrAPI`）集中在 `src/types.ts`，引擎通过 structural interface 解耦（如 `CharacterEngineLike`）
- **最小侵入**：新动作优先改 `src/pets/*.ts` + `menu.rs`；仅当 ActionKind 不够用时改 `src/action.ts`
- **不改 IPC 事件名**：与 Electron 版 payload 保持一致，便于对照
- **注释语言**：源码注释以英文为主；用户可见文案支持 zh / en / ja
- **离线原则**：不得引入网络请求、遥测或 CDN
- **运行时零依赖**：Bun 仅用于编译打包，bundle.js 不引用任何 npm 运行时包

---

## 修改时注意

| 场景 | 注意点 |
|------|--------|
| 改动作播放逻辑 | `src/action.ts`；DOM/CSS 切换在 `src/character.ts` |
| 改交互 / idle / IPC | `src/trigger.ts` |
| 改 BGM / 音频播放 | `src/audio.ts`；动作音频路径在 `src/pets/usagi.ts` 的 `actions.*.audio` |
| 改对话文案 / 配音 | `src/speech/data.ts`（默认数据）或 `src/pets/usagi.ts` 的 `speech` / `rollSpeech` |
| 改对话气泡时长跟随音频 | `src/speech/index.ts` 的 `SpeechSession`；勿在 CharacterEngine 维护对话定时器 |
| 音频开关（菜单"音频"项） | Rust `WindowState.audio_enabled` + `audio_enabled` 事件 → `AudioEngine.setEnabled` |
| 改窗口 / 菜单 / 散步 | `native/src/` |
| 改图片 / 音频 | 改完运行 `myusagi pack` |
| 改 TS 源码 | 改完运行 `bun run build:webview` 重建 bundle（否则 `cargo tauri dev` 看不到变更） |
| 互斥规则 | overlay 锁在 `ActionEngine._overlayAction`；不要同时在 CharacterEngine 维护 `acting` 布尔 |
| walk vs hop | walk 不占用 `isBusy()`；roll/dance 开始前会停止 walk |
| 音频播放入口 | 任何模块播放音频必须经 `AudioEngine`，不得直接 `new Audio(...)` |

---

## 与 Electron 版的差异

| 项目 | Electron (OhMyChiikawa) | Tauri (MyUsagi) |
|------|-------------------------|----------------|
| 后端 | Node main 进程 | Rust |
| 资源加载 | 同步 IPC 逐条 | 启动时 bundle 一次性注入 |
| 前端语言 | 纯 JavaScript（IIFE） | **TypeScript（strict，ESM class）** |
| 前端构建 | 无 | **Bun 打包为单文件 bundle.js** |
| 前端结构 | 单体 `renderer.js` | PetEngine 五模块（含 SpeechEngine） |
| 切换宠物 | `loadFile` reload | 当前仅 usagi |
| 多角色菜单 | 支持 chiikawa / hachiware | 未移植 |

---

## 平台差异

- **Windows**：WebView2；默认 `setIgnoreCursorEvents(true)`；需 Rust 侧 `cursor_move` 轮询配合穿透
- **macOS**：透明窗口与穿透需在真机验证；支持隐藏 Dock（见 `platform.rs`）

---

## 相关文档

- [README.md](README.md) — 用户安装与构建
