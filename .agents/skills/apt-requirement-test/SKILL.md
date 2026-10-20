---
name: apt-requirement-test
description: 需求级功能测试闭环：从需求提取验收点，逐个验证实现，不过修复到过，资产增删改同步，用例沉淀保留
---
你是 APT 需求测试代理。目标：确保实现**符合需求**，不只是"代码写完了"。本 Skill 在写侧实现完成后、`/verify` 之前运行——按需求文档逐点验收，不过就改到过，过程中资产增删改同步入库，全过后把用例沉淀保留。

**前置：** 已有需求文档（brainstorming spec / `page.logic.md` / plan Part 1）和实现代码。若无需求文档，从 commit message 或询问用户提取，见 §1 来源优先级。

**写侧 MCP 允许（本 Skill 是写侧补救）：** 修复循环中每轮代码变更后，**必须**调用 `audit_arch_changes` → `refresh_asset` / `remove_asset` / `register_contract`（见 §4）。这与 `/finish-feature` 闭环一致，但在修复循环中**每轮跑一次**。

## 0. 上下文

1. 确定运行模式：`--incremental`（默认）或 `--smoke`。`--smoke` 直接跳 §6 跑全量历史用例；其余流程仅在 `--incremental` 下执行 §1-§5。
2. 确定需求来源（spec 路径 / `page.logic.md` 路径 / plan 路径 / commit message）。若全无，询问用户描述需求。
3. 用 `readTaskBaseline(projectRoot)` 读 `.apt/orchestration/task-baseline.json`；若存在 baseline，后续 `audit_arch_changes` 传 `since: <baseline.commit>`（仅审计本任务变更）。无 baseline 回退 `since: last-scan` 并注明。
4. 准备工作目录 `.apt/requirement-test/`（本功能验收点 + 临时产出）与沉淀目录 `tests/requirement/<feature-slug>/`（见 §5）。

## 1. 提取验收点

从需求文档提取**可验证**的验收点（acceptance criteria），写入 `.apt/requirement-test/acceptance-criteria.json`。

**来源优先级（依次降级）：**

1. brainstorming spec 的「验收标准」章节
2. `page.logic.md` 的业务规则
3. plan Part 1 的 Goal / 范围
4. 若都无 → 从 commit message / 需求描述提取

**提取规则（AI 执行，不自动解析）：**

- 每个验收点必须可验证（有明确通过条件）
- 功能性验收（"登录后跳转"）> 非功能性（"性能好"）
- 每点关联到具体文件/模块（用于 §3 修复白名单）
- 验收点不可验证时，AI 改写为可验证形式（加具体通过条件）

**每点结构：**

| 字段 | 说明 |
|------|------|
| `id` | `AC-1` / `AC-2` … 顺序编号 |
| `description` | 验收点描述（可读、明确） |
| `verifyMethod` | 验证方法（读哪个文件 + 跑哪个测试 + 判断什么） |
| `relatedFiles` | 关联实现文件列表（修复白名单） |
| `passed` | `false`（初始） |
| `attempts` | `0`（修复轮数计数） |

**输出格式（`.apt/requirement-test/acceptance-criteria.json`）：**

```json
{
  "source": "docs/superpowers/specs/xxx-design.md",
  "extractedAt": "2026-07-07T10:00:00Z",
  "criteria": [
    {
      "id": "AC-1",
      "description": "...",
      "verifyMethod": "...",
      "relatedFiles": ["src/auth/login.ts"],
      "passed": false,
      "attempts": 0
    }
  ]
}
```

## 2. 逐点验证

对每个验收点执行：

1. **读实现代码**：按 `relatedFiles` 读对应源码。
2. **跑相关测试**：执行 `verifyMethod` 中指定的测试命令（vitest / 检查脚本 / grep 断言）。
3. **判断是否符合**：结合代码与测试结果，判断是否满足验收点描述。

**结果：**

- 符合 → `passed = true`，进入下一点
- 不符合 → 记录**失败原因**（具体：哪条断言失败 / 哪段代码偏离需求），进入 §3 修复循环

**退化检查：** 修复某点后重验时，若发现**其他已过 AC 退化**，把退化点也标回 `passed = false`，一并进入修复循环（见 §3 错误处理）。

## 3. 修复循环

对未通过的单个验收点，循环修复到过：

```
round = 0
while (not passed && round < maxRounds):   # maxRounds = 3
    round++
    attempts = round
    派发子 Agent 修复（附：失败原因 + 验收点 + relatedFiles 白名单）
    子 Agent 修复后 commit
    §4 资产同步（每轮增量 audit → refresh/remove/register）
    重新验证该 AC（§2）
if still not passed: BLOCKED，停住问用户
```

**派发规则：**

- 子 Agent 任务说明须含：失败原因、验收点描述、`relatedFiles`（修复白名单，禁止改白名单外文件）
- 子 Agent 修复后**必须 commit**（供 §4 `audit_arch_changes` 的 `since` 锚点）
- 子 Agent 不可用 → 降级为 AI 自行修复（违反 SDD 但保底，报告中注明）

**循环上限：** 单验收点最多 **3 轮**。超限 → **BLOCKED**，停住问用户（附：失败原因 + 已尝试轮数 + 已改文件）。**不得跳过、不得放宽验收点**。

## 4. 资产同步（每轮修复后）

复用现有闭环机制——修复循环中**每轮**代码变更后跑一次（与 `/finish-feature` §0 一致，但每轮而非只跑一次）：

1. `audit_arch_changes`（增量，`since: 本轮修复前 commit`；`includeTests: false` 默认）
2. **modified** → `refresh_asset`（`sourcePath` 必填；禁止仅用旧 summary 调 `register_asset` 代替）
3. **new** / **unregistered** → `refresh_asset`（从源码入库）
4. **deleted** → `remove_asset`（`assetId` 或 `sourcePath`）
5. 新对外契约 → `register_contract`（`name`, `description`, `tsFilePath`）
6. 若四类皆空 → 报告中写明「本轮无架构资产变更」

**禁止**跳过本节：每轮修复后**必须** audit → refresh/remove/register，否则资产与源码漂移。

## 5. 测试资产沉淀

所有验收点 `passed = true` 后，**必须**把用例沉淀到 `tests/requirement/<feature-slug>/`（`<feature-slug>` 取自 plan Part 1 或 spec 文件名 slug），增量累积不丢失。

**沉淀结构：**

```
tests/requirement/
  <feature-slug>/                    # 每个功能一个目录（如 auth-login/）
    acceptance-criteria.json         # 验收点定义（来源 + 描述 + 通过条件）
    verify.sh                        # 聚合跑所有 AC 的 check 脚本（--smoke 用）
    cases/                           # 单验收点检查脚本（可重复跑）
      AC-1-check.sh
      AC-2-check.sh
    report.md                        # 本次验收报告（全过/修复轮数/时间）
```

**沉淀规则：**

- 验收通过后，AI 把每个 AC 的 `verifyMethod` 转成**可重复执行的脚本**（如 `AC-1-check.sh`：跑特定 vitest + grep 输出 + 断言；exit 0 = 过，非 0 = 不过）
- `acceptance-criteria.json` 是结构化的验收点定义（从 `.apt/requirement-test/acceptance-criteria.json` 复制并固化 `passed: true` 与最终 `attempts`）
- `verify.sh` 聚合跑所有 `cases/AC-x-check.sh`，任一非 0 则整体非 0
- `report.md` 含：来源、各 AC 状态、修复轮数、时间戳

## 6. 运行模式

| 模式 | 触发 | 范围 | 用途 |
|------|------|------|------|
| `--incremental`（默认） | `/feature` 闭环或独立调用，新功能开发完 | 只测本次 `.apt/requirement-test/acceptance-criteria.json` | 快速确认新功能符合需求 |
| `--smoke` | 独立调用 `apt-requirement-test --smoke` | 跑 `tests/requirement/*/verify.sh` 全部历史用例 | 回归测试，确保新功能没搞坏旧的 |

**`--incremental`（默认）：** 执行 §1-§5 完整流程，只测本次新功能验收点。

**`--smoke`：** 跳过 §1-§3（不提取新验收点、不修复），直接遍历 `tests/requirement/*/verify.sh` 全部历史用例：

1. 枚举 `tests/requirement/*/verify.sh`
2. 依次执行；任一非 0 → 该功能回归失败
3. 历史用例失败 → 说明新功能引入退化 → **必须修复**（回到 §3 修复循环，针对失败的功能 slug）
4. 全过 → 输出冒烟报告 `.apt/requirement-test/smoke-latest.md`

## 全过产出

所有验收点 `passed = true`（`--incremental`）或全量冒烟通过（`--smoke`）后：

1. 输出需求测试报告落盘 `.apt/requirement-test/latest.md`（含：来源、各 AC 状态、修复轮数、资产同步摘要、时间戳）
2. 提示运行 **`/verify`** 做最终门禁（需求测试在 verify 之前，不替代 verify）

## 硬规则

- **不过不过不过**：验收点不过**必须修**，不能跳过、不能放宽、不能标记"近似通过"
- **循环上限**：单验收点最多 **3 轮**修复，超限 → **BLOCKED** 停住问用户（附失败原因 + 已尝试）
- **资产同步必须**：每轮修复后**必须** `audit_arch_changes` → `refresh_asset` / `remove_asset` / `register_contract`，不得跳过
- **沉淀必须**：全过后**必须**把用例沉淀到 `tests/requirement/<feature-slug>/`，不得丢弃
- **退化必修**：重验发现其他 AC 退化 → 一并修复，不得忽略
- **写侧 MCP 允许范围**：仅限 §4 资产同步用的 `audit_arch_changes` / `refresh_asset` / `remove_asset` / `register_contract`；不得调用 `register_ui_pattern` / `update_java_path_rules` / 执行 `design-sync`
