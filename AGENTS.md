# Project Agents

本文件由 APT `agent-init` 维护。

<!-- apt-workflow:start -->
## APT Workflow

### Preflight

`/feature`、`/implement-plan`、`/plan-from-spec`、`/apt-goal`、`/verify`、`/finish-feature` 启动时先调 `query_project_status`。失败则停止。

### 命令 / Skill 对照

支持平台：Claude Code、Cursor、Qoder、Codex、ZCode、OpenCode、Trae、CodeBuddy。

| 场景 | Claude / Cursor / Qoder / ZCode / OpenCode / Trae / CodeBuddy | Codex |
|------|---------------------------------------------------------------|-------|
| 功能开发 | `/feature` | `apt-feature`（ZCode / OpenCode 亦可用 `$apt-feature`） |
| Web 从零做产品 | `/apt-create` | `apt-create`（ZCode / OpenCode 用 `$apt-create`） |
| Web 摄入已有原型 | `/apt-ingest` | `apt-ingest`（ZCode / OpenCode 用 `$apt-ingest`） |
| Web 开发接力 | `/apt-frontend-connect` | `apt-frontend-connect`（ZCode / OpenCode 用 `$apt-frontend-connect`） |
| App 从零做产品 | `/apt-app-create` | `apt-app-create`（ZCode / OpenCode 用 `$apt-app-create`） |
| App 摄入已有原型 | `/apt-app-ingest` | `apt-app-ingest`（ZCode / OpenCode 用 `$apt-app-ingest`） |
| App 开发接力 | `/apt-app-connect` | `apt-app-connect`（ZCode / OpenCode 用 `$apt-app-connect`） |
| Spec → 方案 | `/plan-from-spec` | `apt-plan-from-spec` |
| 按方案实现 | `/implement-plan` | `apt-implement-plan` |
| 验收（知识门禁） | `/verify` | `apt-verify` |
| 运行时按 PRD 验收 | `/apt-accept` | `apt-accept`（ZCode / OpenCode 用 `$apt-accept`） |
| 闭环补救 | `/finish-feature` | `apt-finish-feature` |
| 设计同步 | `/design-system` | `design（baoyu，可选）` |
| 单页设计 | `/design-page` | `design（baoyu，可选）` |
| 自主闭环 | `/apt-goal` | `apt-goal`（ZCode / OpenCode 亦可用 `$apt-goal`） |
| 批量摄入（收敛即入队 → 队列驱动连续执行） | `$apt-intake`（Skill 形态无斜杠） | `apt-intake`（ZCode / OpenCode 亦可用 `$apt-intake`） |
| 产品逻辑健康度自检（快检+深检） | `$apt-health` | `apt-health`（ZCode / OpenCode 亦可用 `$apt-health`） |
| Brainstorming | `/auto-brainstorm` | `apt-auto-brainstorm` |
| PM / UI / 架构审查 | `/apt-create` / `/apt-ingest` / `/apt-arch-review`（PRD 用 MCP `generate_prd`，非斜杠） | 同左 Skill 名 |
| 进度 | `/current-status` | `apt-current-status` |
| 初始化（配置支配扫描入口） | `/apt-init` | `apt-init`（ZCode / OpenCode 亦可用 `$apt-init`） |
| 批量摄入（收敛即入队） | `/apt-intake` | `apt-intake`（ZCode / OpenCode 亦可用 `$apt-intake`） |
| 按 Verify Failures 出修复 plan | `/apt-plan-from-verify` | `apt-plan-from-verify`（ZCode / OpenCode 亦可用 `$apt-plan-from-verify`） |
| 需求级功能测试闭环 | `/apt-requirement-test` | `apt-requirement-test`（ZCode / OpenCode 亦可用 `$apt-requirement-test`） |
| 多轮库表设计 | `/apt-schema-design` | `apt-schema-design`（ZCode / OpenCode 亦可用 `$apt-schema-design`） |
| 评审后落 DO + migration | `/apt-schema-apply` | `apt-schema-apply`（ZCode / OpenCode 亦可用 `$apt-schema-apply`） |
| PM 的 git 助手（分享产品成果） | `/apt-share` | `apt-share`（ZCode / OpenCode 亦可用 `$apt-share`） |
| 架构审查 | `/arch-review` | `arch-review`（ZCode / OpenCode 亦可用 `$arch-review`） |

### 迭代摄入（armed 项目）

- 判定：`.apt/create/armed.json`（armed:true）或 `designs/v0/_pages.md` 存在 → 本项目 armed。
- 规则：armed 项目对 `designs/v0` 原型 / PRD / 页面源码的 PM 需求变更，**必须先经 `$apt-create`（自动 refine）**产出标准增量输出（变更页 `page.logic.md` + manifest 重生、PRD 段落级修改、`_pages.md` 变更页 approved=no），再进开发链（单页 `/feature`；批量 rollup spec + `/plan-from-spec`）。
- 兜底：直改源码 / 原型而不更新标准产物 → `/verify`「logic 同步」维度 FAIL（`scripts/check-logic-sync.cjs`）。
- 批量场景（需求 / bug 列表持续投喂）用 `$apt-intake`：收敛即入队，队列驱动连续执行——无运行锁 ∧ 有就绪新任务 ∧ 预授权在位 → 自动派发后台执行体跑 `/apt-goal --continue`；执行体存活则 inbox 排队片间自取（`--start` 为手动触发入口）。

### 依赖寻址

1. `query_contract`
2. 未命中 → `search_arch` → `query_arch`
3. 仍无 → `report_missing` 并停止

### 含 UI 时

1. `query_design`（`scope: global`）
2. `query_design`（`page` / `component`）
3. 缺失 → `report_design_gap` 并停止

### 闭环

1. `audit_arch_changes`
2. `modified` / `new` → `refresh_asset`；`deleted` → `remove_asset`
3. 新 TS 类型 → `register_contract`

终端：`start-init`、`design-sync`、`sync-changes`。
<!-- apt-workflow:end -->
