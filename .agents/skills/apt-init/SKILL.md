---
name: apt-init
description: 配置支配扫描入口 — 直读盘 arch.config.json，两问 embedding+chat，官配可补、已给 baseUrl 按侧回填模型，独立 chunking 默认保留，policy CLI 判定后写入，shell 调 start-init，补位后再 --contract-gate
---
# `/apt-init` — 配置支配扫描

你是 APT **扫描编排代理**。本命令是客户仓入库的入口：以工作区根为 `projectRoot`（与 `query_project_status` / cwd 一致）**直读盘**已有 `.ai/arch/arch.config.json` → 收集 embedding/chat → **shell 调用 `apt-init-policy.cjs`** 判定并物化切块凭证 → 初读仓库写 `arch.config.json` → **shell 调用现有 `start-init` CLI** → 补位并回写 `scanRules` → 再跑 `start-init --contract-gate`。

**硬边界：**

- **禁止**在对话内重写扫描引擎；确定性扫描只走现有 `start-init` CLI（不要用 MCP `start_init` 替代本命令的 CLI 调用）。
- **禁止**读写 `arch.secrets.json`。已有 secrets 文件则保留不动。key 只写 `arch.config.json` 内联 `apiKey`（可另写 `apiKeyEnv` 作回退名）。secrets 不当作有 key。
- **禁止**依赖未声明的 `OPENAI_API_KEY`（用户没给 embedding/chat key 就当环境里「碰巧有」OPENAI_API_KEY 来过 start-init）。
- **禁止**单开第三问收集 chunking / summarize。已有独立 chunking 默认整段保留；无 chunking 段才与 chat 同源；用户明确要求才 mirror。
- **WorkBuddy 非目标**：不注入、不宣称、不引导用户去 WorkBuddy 跑本命令。
- 七端写代码 IDE 用斜杠 `/apt-init`（Claude Code / Cursor / Qoder / ZCode / OpenCode / Trae / CodeBuddy）；**Codex 走 skill `apt-init`**（ZCode / OpenCode 亦可用 `$apt-init`）。
- **禁止**把仓库搜索 / Glob 未命中当成没有 `arch.config.json`。CLI 与 Agent 都以磁盘绝对路径为准。
- **禁止**跳过 `apt-init-policy.cjs`：写 config 前必须 `--project-root` 调 decide；keep / 物化后必须 `--apply-chunking-credentials`。不调 = `/apt-init` 失败。禁止把自报的 exists/parse/config JSON 或「已物化」喂给 CLI。

任一失败判定命中 → **`/apt-init` 失败**，停止后续步骤，向用户报告原因。**不得**把「没索引」当成初始化成功。

## 开场：直读盘（先于提问）

`projectRoot` = 工作区根。**不得**改成别的目录来绕开已有 config。

用文件系统绝对路径直读盘 `{projectRoot}/.ai/arch/arch.config.json`（`existsSync` / `readFile` / `JSON.parse`，或等价 fs）。**仓库搜索、Glob、gitignore 未命中不等于没有文件。** 根 `.gitignore` 常忽略 `.ai/arch/`，文件仍可能在盘上。

- 文件不存在 → 绿场（后面仍要两问收齐 embedding / chat）。
- 文件存在但损坏 / 非 JSON → **失败**（`config-unreadable`），**禁止当绿场重写**。
- 文件可解析 → 记下 embedding / chat / chunking 各段是否存在、内联是否像真 key、是否声明了 `apiKeyEnv`。内联真假与 env 是否非空以随后 policy CLI 读盘为准，禁止 Agent 申报 `configFoundByFs` / `inlineKeyPresent`。

**禁止读 `arch.secrets.json`。** `via: secrets` 视为无 key。

探测已声明的 env（若仍需向用户展示）**禁止** `echo %VAR%`、禁止 `Write-Output $env:NAME`、禁止回显值。只报 `present=true|false` 与 `length=`。PowerShell 示例：`if ($env:NAME) { 'present=true length=' + $env:NAME.Length }`。长 key 对话掩码：`length > 8` 时前 4 个字符 + `…` + 长度；更短只报已有 / 长度。优先信 CLI 输出的 `maskHint`。明文 key 不得进终端、对话、argv、`archLog`、命令日志、policy stdout / `--user-json`。

## 0. 失败即停（全程）

| 条件 | 行为 |
|------|------|
| 某一侧（embedding / chat）最终仍没有真 key（内联非占位，或已声明 `apiKeyEnv` 且探测到非空非占位） | **失败**，**不写** config，**不调** `start-init` |
| 该侧没有可用 `baseUrl`：用户没给完整 URL，且不能从官配厂商名补，且已有 config 该侧也没有 URL | **失败，不猜 URL**，**不调** `start-init` |
| 该侧三源都没有模型名（用户该侧 / config 该侧 / 该侧官配缺省） | **失败**，**不调** `start-init`。**已给完整 `baseUrl` 不得因缺模型名直接失败**，也不得因不在官配表直接失败 |
| 盘上 `{projectRoot}/.ai/arch/arch.config.json` 存在但 parse 失败 | **失败**（损坏 JSON），禁止当绿场 |
| 独立 chunking 需保留，但切块无内联真 key、声明 env 也无真值、用户也未补切块 key | **失败**（`missing-key`），禁止把 chat 内联抄进切块后只验 trim 非空 |
| 未调用 `apt-init-policy.cjs --project-root`（decide）或 `fail=true` / exit ≠ 0 | **失败**，不写 config（已写则停），**不调** `start-init` |
| keep / 物化后未调用同一 CLI `--apply-chunking-credentials`，或 apply exit ≠ 0 | **失败**，**不得** `start-init` |
| 规则阶段 `start-init`（无 `--contract-gate`）exit ≠ 0 | **失败**（缺 key 等；0 契约 **不是** 本步失败） |
| 补位后 `start-init --contract-gate` 不过 | **`/apt-init` 失败** |
| 补位产出的端点无源文件锚点 | **丢弃**该端点并记 WARN，不得入库 |

`query_project_status` 探活可选。返回缺 `last-scan.json` **不等于** 本命令失败（本命令就是来做首次扫描的）。

占位符（`YOUR_API_KEY`、`<your-api-key>`、`changeme` 等）= 无 key。

## 1. 两问（只问 embedding 与 chat）

**只问两轮。禁止**再开第三问收集 chunking / summarize。开场已直读盘之后再问；已能解析的一侧不要重复要 key。

### 问 1 — embedding

向用户收集：**模型名**、**key**；**URL 可选**。

该侧文件内联已是真 `apiKey`，或已声明 `apiKeyEnv` 且探测到非空非占位 → **不再要 key**（`skipAskKey`）。仍可确认模型。

### 问 2 — chat

向用户收集：**模型名**、**key**；**URL 可选**。

同上：已能解析则不再要 key。**chat 段缺失**（config 里没有 `chat` 对象）→ 仍要整套 chat（URL / key / 模型），不得用 embedding 顶替。

用户一次贴齐两套也可，不必机械拆成两次气泡；但收集面仍只有这两套，不得把 chunking 当成独立问题。keep 且切块内联空、env 也空时，只向用户要**切块 key**（可与 chat 不同），仍不是第三套 URL 问。

**该侧最终仍无真 key → 失败，不写 config，不调 start-init。** 未声明的 `OPENAI_API_KEY` 不得顶缺侧。

## 2. 官配表 vs 表外 URL

根据用户给出的名称 / URL 判定供应商。判定以「用户有没有给出完整 `baseUrl`、这一侧能不能解析出真 key」为准，**不以厂商品牌为 must**。官配表只是说了厂商名就能补 URL / 缺省模型的方便表。

### 2.1 官配（agent 可补 URL / 模型名；用户确认并给 key）

至少支持下表。命中官配时：agent **可以**按表补全 `baseUrl` 与缺省模型名，向用户确认后写入；**key 必须用户给**（该侧 `skipAskKey` 除外）。

| 厂商 | baseUrl | apiKeyEnv | 缺省 chat 模型 | 缺省 embedding 模型（可确认） |
|------|---------|-----------|----------------|------------------------------|
| DashScope（阿里云百炼兼容模式） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` | `qwen-max` | 用户未给则请用户给 embedding 模型名（常见 `text-embedding-v3`） |
| OpenAI | `https://api.openai.com/v1` | `OPENAI_API_KEY` | 用户未给则请确认（常见 `gpt-4o` / `gpt-4o-mini`） | 用户未给则请确认（常见 `text-embedding-3-small`） |

官配判定：用户说了厂商名（DashScope / 百炼 / 通义 / OpenAI / openai.com），或给出的 URL 等于上表 `baseUrl`。不要把表外网关写成 must 官配行。

用户给了官配 URL 但没给模型名 → 用上表缺省并请用户确认。用户给了模型名 → 用用户的。

### 2.2 表外 URL / 中转站（禁止猜测 URL）

凡 **不是** 上表官配（自建网关、OneAPI、OpenRouter、公司内网代理、只给了「兼容 OpenAI」但 URL 未知等）→ 用用户给的完整 `baseUrl`，不猜。

- **无 URL 且无官配厂商名且 config 该侧也无 URL → 失败**，不猜，不调 start-init。禁止把表外 URL 默成 OpenAI 或 DashScope。
- **已给完整 baseUrl 不得因缺模型失败**（已给完整 `baseUrl` 不得因缺模型名直接失败），也不得因不在官配表直接失败。模型按**侧**回填：只看该侧已有 `config.embedding.model` / `config.chat.model`、该侧官配缺省、或用户给的该侧模型（`modelSource` = `config-side` / `official-default` / `user`）。该侧三源都没有 → 失败。**禁止**把 embedding 模型套到 chat，反之亦然。
- 禁止用未声明的 `OPENAI_API_KEY` 顶 key。

## 3. chunking（写入时，不是第三问）

写入 `arch.config.json` 时按 policy 输出执行，禁止只用 trim 非空当自检：

- **已有独立 chunking**（盘上 `chunking.baseUrl` / `chunking.chatModel` 与即将写入的 chat 不同）→ **默认保留整段**（含 `apiKey` / `apiKeyEnv` / `maxChunkTokens` / summarize*），**当面告知用户**（`announceChunking`）。禁止套默认 800 模板覆盖已有字段。禁止把 chat 内联抄进 `chunking.apiKey`。
  - 读盘切块内联已是真 key → apply 只核对、不改值。
  - 内联空、`apiKeyEnv` 有真值 → 由 CLI `--apply-chunking-credentials` 物化写入切块 `apiKey`，Agent **不得**把 env 值或 chat 内联写入切块。
  - 内联空且 env 无真值 → 向用户要切块 key 后再写；仍须跑 apply。
  - **apply 后独立 URL 时切块内联不得等于 chat 内联。**
- **无 chunking 段** → 与 chat 同源（`baseUrl` / `apiKeyEnv` / `apiKey` / `chatModel` 来自 chat）。`chunking.maxChunkTokens` 缺省 `800`；`chunking.strategy` 固定 `"semantic-only"`。
- **用户明确要求**才 `mirrorChunkingFromChat`（此时允许切块与 chat 相同）。
- **禁止** 创建或读取 `arch.secrets.json`。

## 4. 初读仓库 → `workspace.repos` + `scanRules` + `expectedContracts`

在项目根探测构建清单与工程文件（可多仓 / 子目录），为每个 repo 写 `workspace.repos[]`。

**初读排除**路径含 `tests/`、`fixtures/`、`__tests__` 的工程信号（不要把测试夹具当成独立 repo / 扫描根）。

| 信号（任一命中） | `lang` |
|------------------|--------|
| `pom.xml` / Java `build.gradle` / `build.gradle.kts`（非 Android Application） | `java` |
| `go.mod` | `go` |
| `pyproject.toml` / `requirements.txt` / `setup.py` | `python` |
| `*.csproj` / `*.sln` | `csharp` |
| `package.json` 且依赖含 `electron` | `electron` |
| `package.json`（其余 TS/JS/Vue） | `ts` |
| Android `build.gradle` / `build.gradle.kts`（Application/Library + Kotlin） | `kotlin` |
| `Package.swift` / `*.xcodeproj` 且主要是 Swift | `swift` |
| `pubspec.yaml` | `dart` |
| `*.xcodeproj` / `*.m` / `*.mm` 且主要是 Objective-C | `objc` |
| `CMakeLists.txt` / `*.cpp` / `*.cc` / `*.hpp` | `cpp` |
| `*.c` / `*.h`（无 C++ 主导） | `c` |

每个 repo 必填：`path`、`lang`、`slug`。

### 4.1 `expectedContracts` 缺省

- **Java / Go / Python / C#**：缺省 `["api"]` 或 `["rpc"]` 或两者（源码有 gRPC/Dubbo 信号则含 `rpc`；有 HTTP/Web 信号则含 `api`；都像则 `["api","rpc"]`）。
- **ts / electron / kotlin / swift / dart / objc**：缺省 `["frontend"]`（或平台路由 / 组件符号，`emit: "frontend"`）。
- **Kotlin 缺省按 App**，**不得**默认 `api`。仅当初读看到 Ktor / Spring / Retrofit 服务端注解时才改写为 `api` / `rpc`。
- 源码已有 Web / RPC / 路由注解或等价信号时，**`expectedContracts: []` 无效**（不得用来洗白过门）。纯库且 **没有** 这些信号才允许 `[]`。

### 4.2 `scanRules` 必须是源码函数

`scanRules` 按语言分节。每条规则最低字段（契约 `ScanRule`）：

- `glob` — 覆盖该族源文件
- `emit` — `"api"` \| `"rpc"` \| `"frontend"`
- `classMatch` — 类级注解 **简单名或 FQCN**（从源码抽出，不是 invent）
- `methodMatch` — 方法级 HTTP/RPC 注解或调用名列表（从源码抽出）
- `pathJoin` — `"class+method"` 或 `"method"`（看类级是否贡献 path 前缀）

**抽不出 path（或 frontend 符号名）的命中不计为契约，也不能拿来过门。**

**ts / electron 等前端仓：不强制编写当前扫描器不会执行的 `scanRules`。** 内置前端扫描已够用时，不要为了「看起来完整」编无人执行的规则。

**Java 仍从源码抽规则。禁止写死 JAX-RS 规则包**（禁止无源码依据就填 `javax.ws.rs` / `jakarta.ws.rs` 全家桶）。正确做法：打开实际源文件，看到什么注解/路由 API 就生成对应 `classMatch` / `methodMatch` / `pathJoin`。例如源码类上 `@Path("/users")`、方法上 `@GET @Path("/{id}")` → `classMatch: "Path"`，`methodMatch` 含 `GET` 与 `Path`，`pathJoin: "class+method"`（期望抽出 `/users/{id}`）。源码是 Spring `*Mapping` 就按 Spring 抽，不要预置 JAX-RS。

内置规则默认保留；仅当该族必须关掉内置时才设 `disableBuiltin: true`。

## 5. 判定 CLI → 写入 `arch.config.json` → apply CLI

路径：项目根 `.ai/arch/arch.config.json`（目录不存在则创建）。**只写这一文件**，不写 secrets。写入字段形状对齐契约 `ArchConfig`（`embedding` / `chat` / `chunking` 均有 `baseUrl`、`apiKeyEnv`、可选 `apiKey`；chat/embedding 用 `model`，chunking 用 `chatModel` + `maxChunkTokens` + `strategy`）。

### 5.1 写前必须 decide（`--project-root`）

定位脚本：开发仓 `scripts/apt-init-policy.cjs`；客户机 `$APT_HOME/scripts/apt-init-policy.cjs`（`APT_HOME` 缺省 `~/.apt`）。皆无 → `/apt-init` 失败。

把本轮用户输入写成临时 JSON 文件（**不得含明文 key**，不得含 `config` / `configFoundByFs` / `configParseError` / `envFlags` / 任一侧 `apiKey`）。仅允许：

```json
{
  "user": {
    "embedding": { "baseUrl": "", "model": "", "keyPresent": true, "vendorName": "" },
    "chat": { "baseUrl": "", "model": "", "keyPresent": true, "vendorName": "" }
  },
  "userForceChunkingMirrorChat": false
}
```

字段均可缺。`keyPresent` 为布尔：用户本轮是否贴了该侧 key（真值仍只由 CLI 读盘 / 读已声明 env 判定）。

然后 **必须** shell：

```
node <scripts>/apt-init-policy.cjs --project-root <abs-projectRoot> --user-json <file>
```

CLI **自己** `existsSync` / `readFile` / `JSON.parse` `{projectRoot}/.ai/arch/arch.config.json`，自己 `isRealKey`，自己读已声明的 `process.env`。禁止另传 configPath。stdout 为判定 JSON（`hasConfig` / `fail` / `failReason` / 每侧 `skipAskKey` `confirmModel` `needFullSection` `modelSource` / `keepChunking` / `announceChunking` / `mirrorChunkingFromChat` / `chunkingMustRetainFields` / `chunkingMaterializeApiKey` / `maskHint`），**无 key 正文**。

- `fail=true` 或 exit ≠ 0 → **不写 config、不调 `start-init`**，向用户报告 `failReason`（`missing-url` | `missing-key` | `missing-model` | `config-unreadable`）。
- 否则执行判定器给出的 skip / 问 / 保留。禁止只用搜索或口头申报代替这次调用。

### 5.2 写入结构

Agent 可写 `workspace` / `scanRules` / embedding / chat / chunking **结构**（`keepChunking` 则整段拷贝已有 chunking，**禁止**把 chat 内联抄进 `chunking.apiKey`）：

```json
{
  "embedding": {
    "baseUrl": "<resolved>",
    "apiKeyEnv": "<DASHSCOPE_API_KEY | OPENAI_API_KEY | 用户指定>",
    "apiKey": "<user key or kept inline>",
    "model": "<embedding model, same side only>"
  },
  "chat": {
    "baseUrl": "<resolved>",
    "apiKeyEnv": "<same family as collected>",
    "apiKey": "<user key or kept inline>",
    "model": "<chat model, same side only>"
  },
  "chunking": {
    "baseUrl": "<keep existing independent URL, or chat.baseUrl if no chunking section>",
    "apiKeyEnv": "<keep or from chat>",
    "apiKey": "<keep existing; never copy chat inline on keep path>",
    "chatModel": "<keep or from chat.model>",
    "maxChunkTokens": 800,
    "strategy": "semantic-only"
  },
  "scanRules": { "<lang>": [ { "glob": "...", "emit": "api", "classMatch": "...", "methodMatch": [], "pathJoin": "class+method" } ] },
  "workspace": {
    "repos": [
      {
        "path": ".",
        "lang": "java",
        "slug": "<from dir or artifact>",
        "expectedContracts": ["api"]
      }
    ]
  }
}
```

已有 config：合并 embedding/chat/chunking/scanRules/workspace，**不要**抹掉用户已有的 `apiSpecGlobs` / `scanners` / `java` 等无关字段。keep 时不得改已有 `maxChunkTokens`。key 以本次收集 + CLI 读盘为准。

写入后自检：

- keep 时：整段字段仍在；**禁止**只验 trim 非空；不得强制切块凭证与 chat 对齐。
- 无 chunking 段而同源写入时：切块 URL / 模型 / env 来自 chat。
- 模型未串侧。

### 5.3 写后必须 apply（`--apply-chunking-credentials`）

keep 或需要物化切块凭证时（建议**每次写完都调**，同源段 CLI 会 no-op 且 exit 0）：

```
node <scripts>/apt-init-policy.cjs --project-root <abs-projectRoot> --apply-chunking-credentials
```

该模式由 CLI 物化切块 env→内联（若需要），再读盘核对：`isRealKey(chunking.apiKey)`；独立 URL 时切块内联 **不得等于** chat 内联；物化时还须等于 `process.env[chunking.apiKeyEnv]`。stdout 无明文。Agent 不得自报已物化。

exit ≠ 0 → **不调 `start-init`**。不调 apply → **不得 `start-init`**。

## 6. Shell 调现有 `start-init`（不要 `--contract-gate`）

在项目根执行 **现有 CLI**（PATH 上的 `start-init`，或 `start-init.cmd` / `start-init.ps1` / `bin/start-init.sh`；Windows 亦可用 `node $env:USERPROFILE\.apt\arch-engine\dist\cli.js`）。

**本步不要带 `--contract-gate`。** 目的：规则阶段某族 0 契约时 CLI 仍 **exit 0**，好让补位能跑。

- exit 0 → 读日志 / 产出：记下「规则族已 match 到文件但抽出 0 条契约」的集合（WARN），进入 §7。
- exit ≠ 0（缺 key、config 不可用等）→ **`/apt-init` 失败**。
- **禁止**因为 0 个 api 就在本步宣布成功结束；必须进入补位再过契约门。

## 7. 补位（回写 scanRules；走 `backfillScanRules` helper）

输入 = 规则族 **已经 match 到源文件** 但抽出 **0 条契约** 的文件集合（不要另问用户「这算不算接口」）。

对本集合调用确定性补位 helper **`backfillScanRules`**（`arch-engine/src/backfill-scan-rules.ts`）。规则必须来自源码函数（Java 可复用 `deriveScanRulesFromJavaSources`），**禁止写死 JAX-RS 包**，禁止 LLM。测试走同一 helper 的 mock 路径。

1. 读源码，抽出真实 HTTP/RPC/路由符号；每条必须能指向 **源文件 + 行**（锚点）。
2. **有锚点** → 记入契约（`ApiEndpoint` / `RpcEndpoint` / 前端符号）+ `AssetCard`（kind 与 `emit` 对齐：api/rpc/component/route 等）。
3. **无源文件锚点** → **丢弃**并 WARN，禁止幻觉端点入库。helper 不会把无锚点候选写进契约或卡片。
4. Helper 把本次真正抽出的注解/调用 **回写** 到 `.ai/arch/arch.config.json` 的 `scanRules`（`cleanArchDir` **不删**该文件；不要写会被清掉的旁路文件）。按语言追加或修正规则，字段仍是 `glob`/`emit`/`classMatch`/`methodMatch`/`pathJoin`。随后 `start-init --full` 清索引后仍能靠规则扫到，**不依赖再跑一遍补位对话**。

Agent 调 helper，不要在对话里重写扫描器。

若没有任何「已 match 但 0 契约」的文件，§7 记「无需补位」，仍必须执行 §8。

## 8. 补位后再 `start-init --contract-gate`

再次 shell 调现有 CLI，**必须带 `--contract-gate`**：

```
start-init --contract-gate
```

过门粒度：**语言 × 规则族**（每个内置族、每条 `scanRules`）。一族 match 到了源文件但抽出 0 条可计数契约 → 该族失败。fallback `util`、空 path **不计** 为契约。不得用另一族（含 OpenAPI glob、Spring `*Mapping`）的计数顶替。混仓每种语言分别过门。

- 契约门通过（exit 0 且无失败族）→ `/apt-init` **成功**。报告：写入的 config 路径、repos/lang、scanRules 条数、补位回写了哪些规则、gate 结果。
- 契约门失败 → **`/apt-init` 失败**。报告失败族（语言 + 规则族）与仍为 0 契约的已 match 文件。不要宣称初始化成功。

## 9. 完成判定清单（可判定）

全部为是才算成功：

- [ ] 已对 `{projectRoot}/.ai/arch/arch.config.json` **直读盘**（搜索 / Glob 未命中 ≠ 没有文件）；损坏 JSON 未当绿场
- [ ] 写 config 前已调 `apt-init-policy.cjs --project-root`；keep / 物化后已调 `--apply-chunking-credentials` 且二者 exit 0
- [ ] 已给完整 `baseUrl` 的一侧，未因缺模型名或不在官配表直接失败；模型按侧回填，未把 embedding 模型套到 chat
- [ ] embedding 与 chat 都有真 key（不是靠未声明 `OPENAI_API_KEY`；secrets 不算）
- [ ] 未读写 `arch.secrets.json`
- [ ] 已有独立 chunking：整段保留并当面告知；apply 后独立 URL 时切块内联不得等于 chat 内联；无 chunking 段才与 chat 同源；用户明确要求才 mirror
- [ ] 未只验 trim 非空；探测未回显 env 值
- [ ] `arch.config.json` 含 `workspace.repos[].expectedContracts`；Java `scanRules` 来自源码、非写死 JAX-RS 包；ts 未强制编写无人执行的 `scanRules`；初读排除了 `tests/`、`fixtures/`、`__tests__`
- [ ] 第一次 `start-init` **无** `--contract-gate` 且未在对话里重写扫描器
- [ ] 补位已回写 `scanRules`（或明确无需补位）；无锚点端点已丢弃
- [ ] 第二次 `start-init --contract-gate` 通过
- [ ] 未向用户宣称 WorkBuddy 可用
