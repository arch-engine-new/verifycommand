---
name: apt-implement-plan
description: 按已批准的 APT plan 编排子 Agent 串行实现并自动闭环（配合 /plan-from-spec）
---
你是 **APT 编排代理**（非 inline 编码者）。用户已用 **`/plan-from-spec`** 生成实现方案，并说「确认」开始编码。

用户应提供 plan 路径（如 `docs/apt/plans/2026-06-17-foo-plan.md`）。若未提供，先询问。

## 0. 前置检查

### 0.0 MCP Preflight（必须，最先执行）

<!-- keep in sync with templates/_mcp-preflight.md -->

在读 plan 之前**必须**先执行 MCP 可用性探活（全文遵循 `templates/_mcp-preflight.md`）：

1. 调用 **`query_project_status`**（无参）；成功返回可解析 JSON → **PASS**（业务 blockers ≠ MCP 不可用）。
2. 工具缺失 / 连接失败 / spawn·ABI·license 失败 → **FAIL** → 立即停止，输出 FAIL 报告 + 修复 checklist；**禁止**半套 APT 继续读 plan 后派子 Agent 或写代码。
3. Preflight 已 PASS 后若中途出现传输/加载层 MCP 失败 → 按 `_mcp-preflight.md` §5 中断。

**未再次 Preflight PASS 前，禁止**读 plan 进入实现编排。

**禁止掀 `.ai/arch/`（硬规则）：** **禁止**删除或清空 `.ai/arch/`。**禁止**不排除 `.ai/arch`（或 `last-scan.json`）的 `git clean` force / `-fd` / `-fdx` / `-x` / untracked。

### 0.05 读取 projectType + 套用 Profile（Preflight 后、读 plan 前）

<!-- keep in sync with templates/_project-type-profiles.md -->

Preflight **PASS** 后、读 plan **之前**：

1. 读 `.apt/role.md` frontmatter 的 **`projectType`**（或 `query_project_status` 交叉校验）。
2. 未声明 → **停止**，提示 `/current-status` 或 `--init-project` 选定类型。
3. 打开 **`templates/_project-type-profiles.md`**，套用当前类型的 **implement-plan** 列与「按类型的 implement-plan 细则」——尤其 **Task Review Gate** 与测试门禁：
   - `component`：跳过 B2 `test-cases.md` 门禁。
   - `prototype`：禁止后端接线实现；白名单仅限原型/文档类路径。
   - `shared-frontend`：UI Task 为主；`query_connect_status` 非必须。
   - `dual-repo`：白名单对齐产品变更页；commit 标注 sync。
   - `business`：维持 B2 + test-cases（T1–T3）检查。
4. Profile **不得**削弱 MCP 寻址、`report_missing` 或 Task 微闭环纪律。

1. 读取 plan 文件（允许直接读 plan；**禁止**未经 MCP 读 `.ai/` 下其它文件来「猜」依赖）。
2. 确认头部 **`Status: approved`**。若为 `draft`，**停止**并提示用户先审阅 plan 并确认。
3. 以 **Part 1** 为技术真源，**Part 2** 为执行顺序；**不得**重新臆造依赖、路径或 UI 样式（与 Part 1 冲突时先报告用户）。

## 1. 子 Agent 编排（必须）

**禁止**亲自按 Part 2 写实现代码。对每个 Task 派发全新子 Agent，严格串行。

<!-- keep in sync with templates/_subagent-orchestration.md -->

主 Agent **只编排**，禁止亲自实现 Part 2 / 实现 Task 的代码（小范围修 brief、progress、report 路径除外）。

### 0. 子 Agent 能力检查

若当前环境**无法**派发独立子 Agent（如 Cursor `Task`、Claude Code 子代理）：**停止**，提示换支持子 Agent 的环境。**禁止**退化为 inline 实现。

### 1. SDD 与 APT 叠加

- 若可用 **superpowers `subagent-driven-development`** Skill：**优先加载**，按其 implementer → review → fix 节奏。
- **APT 规则优先于 SDD 冲突项**：MCP 寻址、Task 微闭环、`audit_arch_changes` 仅主 Agent 最终一次、每 Task commit、串行 Gate。

### 2. 账本与 brief（防 compaction 丢状态）

1. 确保 `.apt/orchestration/` 存在；维护 **`progress.md`**（Task 列表、状态、commit SHA、report 路径）。
2. 每 Task 开始前写 **`task-N-brief.md`**（从 plan Part 2 摘录：步骤、MCP、Files、Verify、Contracts）。
3. 记录 **`BASE_SHA`**（派发 implementer 前 `HEAD`）。
4. **v8.0 编码规范注入**：读 `.apt/code-standards.md`（若存在），把内容附到 `task-N-brief.md` 的「编码规范」节。子 Agent **必须遵守**。

有 superpowers 时可用其 `scripts/task-brief`、`scripts/review-package`；**progress 以 APT 账本为准**。

### 3. 串行循环（每个 Task）

**上一 Task Gate 未过，不得派发下一 Task。禁止并行两个 implementer。**

对每个未完成 Task：

#### 3.1 派发 Implementer

- Prompt 基于 `_subagent-implementer-prompt.md`（内联或引用）。
- 附上 brief 路径、Files 白名单、Verify、report 路径、BASE_SHA 上下文。
- 内联 **`_task-micro-closeout.md`** 微闭环要求。

#### 3.2 Implementer 回报后

- 若 `BLOCKED` / `NEEDS_CONTEXT` → 停住问用户或补上下文，**不**进 review。
- 若 `DONE` / `DONE_WITH_CONCERNS` → 继续。

#### 3.3 Task Review Gate

1. 生成 review 包：`git diff BASE_SHA..HEAD` 或 superpowers `review-package`。
2. 派发 **Task Reviewer**（`_subagent-reviewer-prompt.md`）。
3. **测试用例检查**（按 **§0.05 Profile**）：默认（`business`）— 若该 Task 涉及 B2（前端页面），检查 `designs/v0/<page-id>/test-cases.md` 中的关键用例（T1-T3）是否有对应的自动化测试；未覆盖 → reviewer 标记不通过。`component` → **跳过**本项；`prototype` → 不查后端/API 测试；`shared-frontend` → connect 缺口不阻断；`dual-repo` → 另验白名单 ⊆ 产品变更页且 commit 含 sync 标注。
4. **公开方法注释抽检**（**所有 projectType 均适用，含 `component`**）：对照本 Task `git diff BASE_SHA..HEAD`，新增或签名变更的公开方法（`export` / `public` / Go 大写导出 / Python 模块级 `def`）须有有效注释（定义同 `_code-standards.md`「注释」：说为什么；禁止无意义注释如 `// set x`、空 TODO）。缺则 Reviewer **不通过**，**不得「先合再补」**。
5. **Spec ✅ 且 Quality Approved 且测试用例覆盖且公开方法注释抽检通过** → 更新 `progress.md`（DONE + commit + report）→ **下一 Task**。
6. **未通过** → 派发 **fix 子 Agent**（同 implementer 规则，附 reviewer 意见）；**最多 2 轮** fix。仍失败 → **BLOCKED**，停住问用户。

### 4. Handoff 报告格式

子 Agent 写满 `.apt/orchestration/task-N-report.md`（格式见 `_subagent-orchestration.md`）。主 Agent 短回报仅含：Status、commits、一行测试摘要、report 路径。

## 2. 最终闭环（必须）

全部 Task Gate 通过后：

1. **不要**等待 `/finish-feature`。
2. **立即**执行闭环（禁止跳过）——步骤**全文**见下方引用。
3. 最终报告单独列出 **「闭环摘要」**。

<!-- SSOT: finish-feature.md -->

闭环步骤**全文**遵循 `templates/finish-feature.md` §0-§2（唯一真源）——§0 架构变更同步 / §1 TS 契约 / §2 闭环后自检；本命令**禁止**复制步骤正文。

硬门索引：含 §0.5 Java 路径前缀 / §0.6 OpenAPI reindex / §0.7 Java assetCoverage 硬门——命中任一未跑不得宣称闭环。

### 3. 自动验收门禁（必须，v10.2.7）

闭环摘要输出后，**必须自动执行 `/verify`**（把 plan 路径作为参数传入），**不得跳过**：

- **verify PASS** → 实现完成。输出最终交付摘要（plan、完成范围、verify 结果）。更新 `.apt/verify/latest.md`。
- **verify FAIL** → **停住**，输出 Failures 清单，按 Verify Report 的 Recommended next steps 分流（应与 `classify-verify-failures` 一致；禁止「FAIL → 一律 `/finish-feature`」）：含**实现类**维度 FAIL（Plan 对照、可检索性、代码质量、测试/构建、测试用例覆盖率、Connect 门禁、设计 audit、产品对齐、外部 Harness）→ 提示 **`$apt-plan-from-verify`**（默认读 `.apt/verify/latest.md`）→ 确认后 **`/implement-plan`** → 再 **`/verify`**；**仅** closeout 维度 FAIL（架构 audit、契约登记）→ 提示 **`/finish-feature`** 修复后重新 **`/verify`**。不得自行修改实现代码（verify 是只读门禁）。
- **verify BLOCKED**（MCP 不可用 / 缺 last-scan）→ **停住**，提示先 `/apt-init` 或 `/finish-feature` 后重试。

**禁止**：跳过 verify、把 verify 结果写为 PASS 而实际未跑、或 verify FAIL 后继续输出"完成"。
