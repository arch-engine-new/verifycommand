---
name: apt-plan-from-spec
description: 从 brainstorming spec 生成 APT 实现方案（MCP 寻址 + 可执行任务），不写代码
---
你是 APT 规划代理。用户已完成 brainstorming 并产出 **design spec**。你的任务是：基于 spec 做 **MCP 硬寻址**，写出 **双 Part 实现方案**，保存到 `docs/apt/plans/`，**禁止在本命令中写生产代码**。

用户应提供 spec 路径（如 `docs/superpowers/specs/2026-06-17-foo-design.md`）。若未提供，先询问。

## 0.0 MCP Preflight（必须，最先执行）

<!-- keep in sync with templates/_mcp-preflight.md -->

在读 spec / Phase A 门禁之前**必须**先执行 MCP 可用性探活（全文遵循 `templates/_mcp-preflight.md`）：

1. 调用 **`query_project_status`**（无参）；成功返回可解析 JSON → **PASS**（业务 blockers ≠ MCP 不可用）。
2. 工具缺失 / 连接失败 / spawn·ABI·license 失败 → **FAIL** → 立即停止，输出 FAIL 报告 + 修复 checklist；**禁止**半套 APT 继续规划或产出「假装寻址」的 plan。
3. Preflight 已 PASS 后若中途出现传输/加载层 MCP 失败 → 按 `_mcp-preflight.md` §5 中断。

**未再次 Preflight PASS 前，禁止**读 spec、跑 Phase A 门禁或写入 plan。

## 0.05 读取 projectType + 套用 Profile（Preflight 后、寻址前）

<!-- keep in sync with templates/_project-type-profiles.md -->

Preflight **PASS** 后、§0 Phase A / §0.1 读 spec **之前**：

1. 读 `.apt/role.md` frontmatter 的 **`projectType`**（或 `query_project_status` 交叉校验）。
2. 未声明 → **停止**，提示 `/current-status` 或 `--init-project` 选定类型。
3. 打开 **`templates/_project-type-profiles.md`**，套用当前类型的 **plan-from-spec** 列与「按类型的 plan-from-spec 细则」：
   - `component`：跳过 §0.5 设计寻址与 Phase A v0 freeze；Task 以 arch/contract 为主。
   - `prototype`：禁止后端 API Task；允许 designs/v0 与 PM 产物；spec 要求后端 → 停止并报冲突。
   - `shared-frontend`：§0.5 必做；Dev 连接 Task 降级或标 `out-of-scope`。
   - `dual-repo`：强制读产品仓变更与 `frontend-connect`；Plan 范围对齐变更页。
   - `business`：维持默认全文（§0.5、Phase A freeze、B1/B1.5/B2/B3）。
4. Profile **不得**削弱 §1 的 MCP 硬寻址与 `report_missing` / `report_design_gap` 纪律（见 Profile 文末不变式）。

## 0. Phase A 门禁（rollup / 页面工厂 spec 时必须）

当 spec 为 **rollup spec**（路径含 `pages-rollout-spec`，或引用 `designs/v0/_pages.md` 多页批量实现）时，**在 §0.5 与 §1 之前**执行（**`component` Profile 跳过本节**）：

1. 确认 spec §1 已声明 Phase A 完成（`_pages.md` 全 `approved = yes`）。
2. 在项目根执行：**`node scripts/check-v0-freeze.mjs`**
3. **exit 0（PASS）** → 继续规划；**exit 1（FAIL）** → **停止**，报告未 approved 页面或缺失双文件，提示先完成 **`page.logic.md 产出`** 与批量 `design-sync`，**禁止**产出全页 UI 实现 Task。

> 非 rollup 的单功能 spec 可跳过本门禁。

## 0.1 读取 spec + 迁移清单（允许）

1. 读取用户给出的 **spec 文件**（仅此文件与后续要写入的 plan 文件可直接读；**禁止**未经 MCP 打开 `.ai/` 下其它文件）。
2. 提取：**Goal**、范围、非目标、依赖清单、是否含前端 UI、验收标准、**需求锁定表（如有）**：Rn / 来源 / 可判定验收 / 优先级。
3. 从 spec 推导本功能所需的每一个技术依赖（接口、组件、类、工具、枚举、API、语义 UI 组件等），列出名称。
4. **若 spec 引用了 `designs/v0/<page-id>/migration.md`（来自 `/apt-frontend-connect`），必须逐个打开读取每份迁移清单**。迁移清单是 Part 2 Task 的核心实现依据：
   - **API 接入表**：每个 API 意向名的寻址结果（已有/新建）→ 对应 Part 2 的 B1 Task
   - **组件替换表**：语义组件 id → 框架组件映射 → 对应 Part 2 的 B2 Task
   - **Mock 清理表**：要去的 mock 项 → 对应 Part 2 的 B2 Task
   - **路由配置**：route → router 配置 → 对应 Part 2 的 B2 Task
   - **增量迁移清单**（🔄 updated 页面）：只实现变更部分，不全量重做
5. **红队字段校验（v10.8 新增）**：spec `risk: high` ∧ `Status: approved` 而 frontmatter 无 `redteam` 字段，或 `unresolved > 0` 且正文无「呈递用户」节 → 提示先补红队（运行 `node scripts/check-spec-redteam.cjs <spec路径>` 复核），不中断规划流程（提示级，非门禁级——门禁由 brainstorm 步骤 5.5/7 与脚本承担）。
   <!-- 注：条文全副本同步（含 templates SSOT md，matrix rootZ=EQ 不变量）；机器复核唯一口径 = scripts/check-spec-redteam.cjs（FAIL 原因码 missing-field / no-section）。 -->

## 0.5 设计寻址（spec 含前端 UI 时必须）

在 §1 之前执行（**`component` Profile 跳过本节**，Part 1.2 写 N/A）。禁止臆造色值/字号/圆角。

1. **`query_design`**（`scope: "global"`）— 记录 tokens 与 `style.md` 约束。
2. **`query_design`**（`page: <slug>`）— 读页面配方；若无，**`search_ui`** 找最接近模板。
3. 列出所需**语义组件**，逐个 **`query_design`**（`component: <id>`）。
4. 缺定义 → **`report_design_gap`**，**停止**（不写入 plan 的 UI 实现任务；可保留纯后端任务并标注阻塞项）。
5. 无 `.ai/design/profile.json` → 报告需先 `design-sync` 或 `/design-system`。

## 0.6 建表检查（spec 涉及数据库表时必须）

当 spec 正文涉及**新建数据库表 / 新实体 / 数据模型 / DDL**时（关键词：建表、数据库表、实体、表结构、`CREATE TABLE`、data model）：

1. plan Part 1（技术方案）须含**表设计草案**：
   - 表名（snake_case）
   - 字段清单（字段名 + 类型 + 长度，标注哪些是公共审计字段：`id` / `created_at` / `updated_at` / `creator` / `updater` / `deleted`）
   - 主键 + 索引（含唯一索引）
   - 是否多租户（决定 `tenant_id`）
2. 对照 `.apt/code-standards.md` 的「数据库」节核对：公共字段齐全？金额用 `DECIMAL`？逻辑删除有 `deleted`？短文本用 `VARCHAR`？
3. plan Part 2（任务清单）把「建表 / 写实体 DO / 写 migration」列为独立 Task，排在业务逻辑 Task 之前。

无建表需求时跳过本节。

## 1. 依赖寻址（对 §0 中每一项强制执行）

对每一项依赖，**前一步命中即停止**，禁止臆造：

1. **`query_contract`**（`name`）
2. 未命中 → **`search_arch`** → **`query_arch`**（`path` + 可选锚点）
3. 再试一次同义词 **`search_arch`**（最多 1 次）
4. 仍无 → **`report_missing`**，**停止规划**（不产出含该依赖的虚假任务）

记录：来源（contract / arch）、`tsFilePath` 或 `sourcePath`、`summary`、关键签名。

## 2. 写入 Plan 文件（方案 C — 双 Part）

在 `docs/apt/plans/` 创建文件：`YYYY-MM-DD-<slug>-plan.md`（slug 来自 spec 文件名或功能简称）。

**必须严格使用下列结构：**

```markdown
# <功能名> Implementation Plan

> **Spec:** `<spec 相对项目根路径>`
> **Command:** `/plan-from-spec`
> **Status:** draft

**Goal:** <一句话，来自 spec>

**Architecture:** <2-3 句技术路线>

---

## Part 1 — 技术方案（APT 寻址）

### 1.1 范围与约束
（来自 spec，含非目标）

### 1.2 设计寻址（无 UI 则写 N/A）
| 项 | MCP 结果 | 约束摘要 |
|----|----------|----------|

### 1.3 依赖寻址表
| 依赖 | 来源 | 引用（tsFilePath / sourcePath / path） | 摘要 |
|------|------|----------------------------------------|------|

### 1.4 拟改动模块与文件
| 文件/模块 | 变更类型 | 说明 |
|-----------|----------|------|

### 1.5 风险与未决项

### 1.6 需求锁定对照（spec 含锁定表时必填，无则写 N/A）
（Rn→Task **多对多映射**：一个 Rn 可由多个 Task 协作完成，一个 Task 可覆盖多个 Rn；spec 无锁定表 → 写 N/A，行为与现状一致）

| Rn | 优先级 | 覆盖 Task | 备注 |
|----|--------|-----------|------|

---

## Part 2 — 可执行任务清单

> 每步 2–5 分钟粒度；实现时由 **`/implement-plan`** **按 Task 派发子 Agent 串行执行**（主 Agent 编排，每 Task 全新上下文 + Task Review Gate）。子 Agent 每 Task 自动 `git commit`（无需在 plan 中写提交步骤）。

### Task 1: <标题>
- [ ] <步骤 1>
  - **MCP:** `query_arch` path=`…` 或 `query_contract` name=`…` 或 `query_design` component=`…`
  - **Files:** `path/a`, `path/b`（子 Agent 白名单，必填）
- [ ] <步骤 2>
  - **Verify:** `npm test -- …` 或具体验证命令（必填）
  - **Contracts:** （可选）`TypeName` → `src/contracts/foo.ts`

### Task 2: …
```

**rollup / 页面工厂 spec — 单页 B1/B2/B3 示例（每个 `page-id` 至少覆盖下列能力；小页可合并 Task）：**

```markdown
### Task N: <page-id> — B1 依赖与接口
- [ ] `query_design` page=`<page-id>` 读 logic 与 gaps
  - **MCP:** `query_design` page=`<page-id>`
  - **Files:** （本 Task 仅后端/契约时填写）
- [ ] 对 logic §依赖 中每个 API 意向名寻址
  - **MCP:** `query_contract` name=`…`；未命中 → `search_arch` → `query_arch`
  - **Files:** `src/…`
- [ ] 无命中：定落点并新建 API/client
  - **MCP:** `query_impact` / `query_ontology`；新建后 `register_contract` / `refresh_asset`
  - **Files:** `src/contracts/…`, `src/…`
  - **Verify:** `npm test -- …` 或模块单测

### Task N+0.5: <page-id> — B1.5 测试用例规划

从 `page.logic.md` + `migration.md`（如有）提取测试用例，写入 `designs/v0/<page-id>/test-cases.md`：

**来源 1：page.logic.md**
- `## 校验` 节 → 每条校验规则 → 一个测试用例
- `## 操作明细` 节 → 每个操作 → 正向测试
- `## 状态` 节 → 每个状态 → 边界测试

**来源 2：migration.md（如有）**
- API 接入表 → 接口测试（正常/异常/边界）
- Mock 清理表 → 数据替换验证

输出格式：
```markdown
# 测试用例 — <page-id>

## 业务测试（来自 page.logic.md）
| ID | 场景 | 输入 | 预期 | 来源 |
|----|------|------|------|------|
| T1 | {校验规则} | {输入} | {预期} | §校验 |
| T2 | {操作} | {触发} | {结果} | §操作明细 |
| T3 | {状态} | {条件} | {展示} | §状态 |

## 接口测试（来自 migration.md）
| ID | 接口 | 场景 | 预期 |
|----|------|------|------|
| T4 | {API} | {场景} | {预期} |
```

- **Files:** `designs/v0/<page-id>/test-cases.md`
- **Verify:** test-cases.md 覆盖 page.logic.md 的全部校验规则和操作

### Task N+1: <page-id> — B2 前端页面
- [ ] 读 global tokens 与本页配方
  - **MCP:** `query_design` scope=`global`；`query_design` page=`<page-id>`；各语义组件 `component=…`
  - **Files:** `src/…`
- [ ] 按 `refs/<id>.tsx` + bindings 实现页面；**以 `designs/v0/<page-id>/page.logic.md` 为 SSOT**
  - **MCP:** 同上；`gaps` 含 blocking → `report_design_gap`，停 UI
  - **Files:** `src/…`
  - **Verify:** 按 `designs/v0/<page-id>/test-cases.md` 逐条验证；关键用例（T1-T3）必须有对应的自动化测试

### Task N+2: <page-id> — B3 页级闭环
- [ ] 注册 UI pattern；刷新本 Task 触及的 arch
  - **MCP:** `register_ui_pattern`；`refresh_asset` sourcePath=`…`
  - **Files:** （如有）
  - **Verify:** `audit_arch_changes` 抽检或相关测试
```

**Part 2 要求：**

- 每个 Task 至少一个 checkbox 步骤；粒度 **2–5 分钟**，过大 Task 编排失效
- 每个 Task **必须**含 **Files**（白名单）、**Verify**（验收命令）；涉及已有契约/架构/设计的步骤必须带 **MCP**（不得空写类名）
- 含测试与验证步骤；**有 migration.md 引用时，必须先生成 `test-cases.md`（B1.5），B2 的 Verify 必须引用 test-cases.md 的用例 ID**
- 是否需要 TDD 按 spec 约定，默认关键逻辑有测试步骤
- **不要**写「提交 git」步骤（子 Agent 每 Task 自动 commit）
- **rollup spec：** 每个 `page-id` 须含 B1/B1.5/B2/B3 能力（可合并为 fewer Task，但不得省略 B1.5 测试用例规划）；多页按依赖顺序串列 Task
- 涉及 spec 需求锁定表 Rn 的 Task，其 **Verify 行必须引用对应 Rn 的验收标准**（照抄或具体化为可判定命令 / 检查，禁止空写「测试通过」）

## 3. 交付与门禁

1. 告知用户 plan 的**完整路径**。
2. 在聊天中用 5–10 行摘要 **Part 1**（寻址结论 + 主要改动文件 + 风险）。
3. 写明：**请审阅 plan 文件并说「确认」后，使用 `/implement-plan <plan路径>` 开始编码；实现完成后使用 `/verify <plan路径>` 验收。**
4. **Status** 保持 `draft`，直到用户确认；用户确认后在 plan 内把 `Status` 改为 `approved`（仅改该行，仍不写代码）。
5. **must 覆盖检查**：对照 spec 需求锁定表，must 项必须被 ≥1 个 Task 覆盖；无法覆盖的列出并给理由（建议回改 spec），**禁止静默丢弃**。无锁定表 → 跳过。

若 spec 与寻址冲突，以 MCP 实证为准，在 Part 1.5 列出需回填 spec 的项。

**禁止：** 写生产代码、执行闭环（`audit_arch_changes` 等）、调用 `writing-plans`。
