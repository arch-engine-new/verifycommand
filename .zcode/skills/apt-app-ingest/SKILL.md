---
name: apt-app-ingest
description: 摄入已有原型 — 页面逻辑 + 强制像素级规格载体（page.spec.*）；无 HTML 则 FAIL
---

# $apt-app-ingest — 摄入已有原型工程（App）

你是产品产出代理。PM 已有一个前端原型工程（自己用 v0/Codex/手写做的），你把它整理成 APT 规范的页面逻辑，并**强制**为每页生成**像素级规格载体**（`page.spec.json` + `page.spec.png`）。

> 本命令是 Web `$apt-ingest` 的 App 分支：依赖原生 `targetPlatforms`，规格提取不可跳过。  
> 只保证测量级**像素级规格载体**；禁止任何「保证…还原到原生」类过满承诺。

## 输入

PM 给工程路径。可选提供 PRD 文档路径。

```
$apt-app-ingest <前端工程路径> [PRD文档路径]
```

示例：
```
$apt-app-ingest D:\software\cgm-smart-community-v1\prototype\property-admin-web
$apt-app-ingest D:\software\cgm-smart-community-v1\prototype\property-admin-web D:\software\cgm-smart-community-v1\docs\01_交付底稿
```

无平台 CLI 参数；平台真源为 `.apt/project.json` 的 `targetPlatforms`。

**PRD 文档路径可选**：
- 提供了：子 Agent 同时读源码 + PRD，对齐提取（推荐）
- 没提供：子 Agent 只从源码提取

## 执行步骤（全自动，不停等）

### 1. Preflight

调 `query_project_status`，确认 MCP 可用。FAIL 则停。

### 2. 原生门禁（强制）

读 `.apt/project.json` 的 `targetPlatforms`：

- 至少含一项原生：`swiftui` | `compose` | `react-native` | `flutter` → 继续
- 空 / 仅 web / 无上述任一值 → **FAIL**，停止，并告知用户：

  > 当前项目无原生 targetPlatforms。请使用 Web 命令 `$apt-ingest`；或先在 `.apt/project.json` 配置原生平台后再跑 `$apt-app-ingest`。

### 3. 扫描工程

调 `discover_v0_pages`（`projectRoot` = PM 给的路径）：
- 识别页面文件（page.tsx/*.vue/index.html）
- 识别技术栈（package.json → Next.js/Vue/React）
- 识别路由结构
- 产出 `designs/v0/_pages.md`（全 approved=no）

### 4. 逐页产页面逻辑（主 Agent 编排，子 Agent 逐页执行）

**主 Agent（你）负责编排：**
1. 读 `_pages.md`，拿到全部页面列表
2. 对每个 pending 页面，**派一个子 Agent**（spawn / Agent tool）处理该页
3. 主 Agent 等子 Agent 返回后，更新 `_pages.md` 该页状态
4. 继续下一页（可并行派多个子 Agent，建议每批 3-5 页）

**子 Agent 的任务（每页一个，全新上下文）：**
```
你是页面逻辑提取 Agent。处理一个页面：

页面：<pageId>
工程路径：<projectRoot>
源码文件：<列出该页的 page.tsx + content 组件路径>
PRD 文档：<列出对应的 PRD 文件路径（如有）>

步骤：
1. 读该页源码文件
2. 【如有 PRD】读对应的 PRD 文档章节
3. 调 MCP reconcile_page_logic（projectRoot=<路径>, pageId=<pageId>）
4. 如果 MCP 不可用，手动读源码提取：
   - 操作明细（增删改查/导出/审批）
   - 状态（loading/empty/error/success）
   - 字段与列（表单字段/表格列）
   - 校验（必填/格式/范围）
   - API 意向名（listXxx/createXxx）
5. 【如有 PRD】对齐原型与 PRD：
   - PRD 要求但原型未实现的操作/字段/校验 → 写入 page.logic.md，备注标注「PRD 要求，原型未实现」
   - 原型有但 PRD 未提及 → 保留（以源码实际为准）
   - 两者冲突 → 以 PRD 为准，备注标注「原型与 PRD 不一致」
6. 按 page.logic.md schema L 模板写入 designs/v0/<pageId>/page.logic.md
7. 写 page.manifest.json（source: "live-project"）
8. git add + commit（消息：ingest: <pageId> page.logic.md）

完成后返回：页名 + 成功/失败 + 逻辑摘要（操作数/字段数/API意向数）+ PRD对齐差异（如有）
```

**关键：**
- 子 Agent 必须有 MCP 配置（.zcode/mcp.json 或等效），能调 reconcile_page_logic
- 如果子 Agent MCP 不可用，fallback 手动读源码提取（不阻塞）
- 主 Agent 不自己读源码——全部交给子 Agent
- 每页独立 git commit，失败不影响其他页
- 大工程（>10 页）分批，每批 3-5 页并行

### 5. 像素级规格载体（强制，不可跳过）

对 `_pages.md` 中的**每一页**：

1. 确认该页存在可测 HTML（如 `designs/v0/<pageId>/index.html`，或工程内等价可测量入口）
2. **解析 `extract-page-spec.cjs` 路径（按序，命中即用）：**
   1. `<项目根>/scripts/extract-page-spec.cjs`
   2. `$APT_HOME/scripts/extract-page-spec.cjs`（`$APT_HOME` = 环境变量 `APT_HOME`，缺省 `~/.apt`）
   3. 皆无 → **FAIL**：提示用户重装 / 升级 APT（release 须含 `extract-page-spec.cjs`），**停止**
3. 跑：`node <解析到的脚本> <该页 HTML 路径>`
4. 确认产出 `page.spec.json` + `page.spec.png`

**相对 Web `$apt-ingest` 的关键差异：**

- live-project **无独立 HTML** → **不得跳过 / 不得豁免**
- 无 HTML 或 extract 失败 → **FAIL**，停止，并列出失败页清单
- 建议用户：改用 `$apt-app-create` 生成可测原型，或为失败页补齐可测量 HTML 后重跑

**禁止降级（明文）：** 不得用纯 Node HTML 解析、puppeteer、占位 PNG 冒充 `page.spec.*`。缺脚本 / 缺 Playwright / 测量失败只能 **FAIL**，不得自造替代方案。

不得静默跳过任何页。

### 6. 产品入库

调 `start_product_init`，同步 page.logic.md 到 `.ai/product/`。

### 7. 输出报告

展示：
- 摄入了多少页
- 每页路径（含 `page.spec.json` / `page.spec.png`）
- 说明：已产出**像素级规格载体**（测量级），供后续 `$apt-app-connect` 消费
- 提示 PM：浏览器打开原型确认 → 对照 page.logic.md → 标 approved=yes → 运行 `/apt-share` 推送 → `/current-status` 看进度（引导架构师接手）

## 输出物

```
designs/v0/
├── _pages.md                     ← 进度表（全 approved=no）
├── <pageId>/
│   ├── page.logic.md             ← 页面逻辑
│   ├── page.manifest.json        ← 元数据（source: "live-project"）
│   ├── page.spec.json            ← 像素级规格载体（强制）
│   └── page.spec.png             ← 截图参考（强制）
```

## 硬规则

- 全自动执行，不停等用户（除 Preflight / 原生门禁 / 规格提取 FAIL）
- 无原生 targetPlatforms → **FAIL**（改用 `$apt-ingest`）
- 每页强制 extract-page-spec（项目 `scripts/` → `$APT_HOME/scripts/` → FAIL 重装 APT）；无 HTML / 失败 → **FAIL** 列页（建议 create 或补可测 HTML）
- **禁止**纯 Node HTML 解析 / puppeteer / 占位 PNG 冒充 `page.spec.*`
- 文案只用「像素级规格载体」；禁止「保证…还原到原生」类过满承诺
- 不重新生成原型（PM 的工程原样用）
- 不写 src/ 业务代码
- 不做架构审查 / 技术选型
- PM 核对后自行标 approved
- 逐页产出可中断/恢复（大工程分批）
