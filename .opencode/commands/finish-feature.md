---
description: 闭环写侧补救（知识库同步：audit / refresh / 契约；不改业务实现）
---
<!-- apt-template-version: 10.9.5-pro -->
> 本文件是 APT 闭环条文的**唯一真源（SSOT）**——`_feature-closeout.md` 与各命令内联引用禁止复制步骤正文。

你是 APT **闭环写侧**代理：只做知识库同步（`audit_arch_changes` → `refresh_asset` / `remove_asset`、`register_contract` 等），**禁止**改业务/实现代码。

**分流（先读 `.apt/verify/latest.md`；路由判定与 `scripts/classify-verify-failures.cjs` 保持同构，新增维度时同步）：**

- Overall=BLOCKED（MCP 不可用 / 缺 last-scan / 产品索引）→ **停止本命令**：修 MCP 或先 `/apt-init` / `product-init` 后重新 `/verify`（unblock 路由），本命令不处理门禁故障。
- Overall=FAIL 且含**实现类**维度 FAIL → **先** `$apt-plan-from-verify`（再 `/implement-plan`），勿指望本命令修实现。
- **Harness 空跑（harnessMissed）压过 Overall=PASS**：Overall=PASS 但 goal / sourceDoc 命中可执行规格而 `## Harness` 节缺失或整节 SKIP → **不得收尾**，先 `$apt-plan-from-verify` 补跑 Harness 后重新 `/verify`。
- Overall=FAIL 但 Summary 无法分类（缺 Summary 表 / 无 FAIL 维度行）→ **停止本命令**：修正 verify 报告格式后重新 `/verify`（re-verify）。
- Overall=PASS、仅 closeout FAIL（架构 audit / 契约登记）、或 `/feature` / `/implement-plan` 漏跑闭环 → **继续**本命令。

确认只需闭环时，**必须**补跑下列步骤。

## 0.0 MCP Preflight（必须，写侧闭环前）

<!-- keep in sync with templates/_mcp-preflight.md -->

写侧闭环之前**必须**先执行 MCP 可用性探活（全文遵循 `templates/_mcp-preflight.md`）：

1. 调用 **`query_project_status`**（无参）；成功返回可解析 JSON → **PASS**（业务 blockers ≠ MCP 不可用）。
2. 工具缺失 / 连接失败 / spawn·ABI·license 失败 → **FAIL** → 立即停止，输出 FAIL 报告 + 修复 checklist；**禁止**半套 APT 调用写侧工具。
3. Preflight 已 PASS 后若中途出现传输/加载层 MCP 失败 → 按 `_mcp-preflight.md` §5 中断。

**未再次 Preflight PASS 前，禁止** `audit_arch_changes` / `refresh_asset` / `register_contract` 等写侧操作。

**禁止掀 `.ai/arch/`（硬规则）：** **禁止**删除或清空 `.ai/arch/`。**禁止**不排除 `.ai/arch`（或 `last-scan.json`）的 `git clean` force / `-fd` / `-fdx` / `-x` / untracked。

## 0. 架构变更同步（必须）

1. 调用 **`audit_arch_changes`**（默认 `since: last-scan`）。无可用 last-scan 且无非空 `arch-index.json` 时报告需先 `/apt-init`。
2. 对 **`modified`** 每一项：调用 **`refresh_asset`**（`sourcePath` 必填）。禁止仅用旧 summary 调 `register_asset` 代替。
3. 对 **`new`** / **`unregistered`**：调用 **`refresh_asset`**（从源码入库）。
4. 对 **`deleted`**：调用 **`remove_asset`**（`assetId` 或 `sourcePath`）。
5. 若四类皆空：在报告中写明「无架构资产变更」。

可选补救：在项目根执行 `sync-changes` 或 `sync-changes --dry-run` 预览。

### 0.5 Java API 路径前缀（若本次涉及）

若 audit 显示大量 API `modified` 且根因是路径前缀规则而非业务逻辑变更：

1. `query_path_rules` 或 `query_arch` 诊断当前 path
2. `update_java_path_rules` 一次写入规则并重算 API 索引
3. `query_arch` / `search_arch` 验证 path 已正确
4. **禁止**对每个 Controller 循环 `refresh_asset`

### 0.6 OpenAPI / Swagger 增量（硬步骤）

本轮变更路径若命中 `apiSpecGlobs`（含 yaml/json 等 OpenAPI/Swagger 规格）：

1. **必须**跑 `sync-changes`（已含 OpenAPI reindex）或显式 `start-init --reindex-apis` / 等价 `runReindexApis`。
2. reindex **失败** → 闭环 **FAIL**；**禁止**宣称闭环完成（规格已变却未进 DocumentModel / API 索引不可静默）。
3. 无规格变更 → 可 SKIP，摘要写明理由。

### 0.7 Java assetCoverage gate（硬步骤）

本轮若触及 Java（`.java` / Java 模块）：

1. **必须**跑与 `start-init` 同配置的 `java.assetCoverage` gate（推荐 `sync-changes`，其已接同源 coverage）。
2. `assetCoverage=error` 且 `uncoveredCount>0` → 闭环 **FAIL**；列出 uncovered 路径；**禁止**宣称闭环完成。
3. `warn` / `off` 行为与 start-init 一致；无 Java scanner / 无触及 → SKIP，摘要写明理由。

### 0.8 logic 同步 gate（硬步骤）

本轮若 armed（`.apt/create/armed.json` armed:true 或 `designs/v0/_pages.md` 存在）且变更触及页面层：

1. **必须**跑 `node scripts/check-logic-sync.cjs --base <锚点>`；锚点取 `.apt/orchestration/progress.md` 头部 `BASE_SHA`，无则 `HEAD`。
2. exit 1（C1/C2/C3 FAIL）→ 闭环 **FAIL**；列出失败页与 code；修复路径见脚本输出（`$apt-create --refine` / `reconcile_page_logic`；**禁止**手改 `page.logic.md` 凑同步）。
3. 未 armed / 未触及页面层 → SKIP，摘要写明理由。

### 0.9 kb-debt 消费钩子（并行批知识欠账，硬步骤）

弧内**首轮** finish-feature 须先查并行批知识欠账并逐项消费（R12/RM4：worktree sweep merge 后入账的 `.ai/` 义务，payload `consumeBy: next-arc finish-feature`）：

1. 调用 `batch_summary` 读 `ledger.kbDebtOutstanding`（欠账 N）；N=0 或字段缺失（串行批/旧版 server）→ SKIP，摘要写明理由。
2. N>0 → **逐项消费**：每笔 `entry_type='kb-debt'` 台账项按其 payload（itemId/sliceId/branch/reason）在**主仓**补做写侧同步（重放 §0 的 audit/refresh/register 步骤）；**禁止**在 worktree/分支侧补救，禁止跳项。
3. 消费一笔在该台账项 payload 记 `consumedAt`（消费标记）；重跑 `batch_summary` 复核 `kbDebtOutstanding === 0` 方可闭环——无法清零的项在闭环摘要单列（项 ID+原因+恢复路径）并计 openItem，禁止静默丢弃。

## 1. TS 契约（若有对外 TS 类型）

1. 检查是否新建可供外部调用的接口、类或函数。
2. 确保 `src/contracts/` 或对应目录有严格 TS 类型定义。
3. 每个新契约调用 **`register_contract`**（`name`, `description`, `tsFilePath`）。

## 2. 闭环后自检（简要）

完整验收请运行 **`/verify`**。此处仅做闭环后最小确认：

- 每个 `register_contract`：确认 `.ai/INDEX.md` 已更新。
- 每个 refresh/remove：用 **`search_arch`** 抽检 1–2 项；精读用 **`query_arch`**。
- 输出 **闭环摘要**：audit 统计、已 refresh 的 assetId 列表、已注册契约列表；**必须**含 `openapiReindexed` / `javaCoverage` / `logicSync`（或各自 SKIP 理由）。
