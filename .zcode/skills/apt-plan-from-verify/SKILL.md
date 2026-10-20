---
name: apt-plan-from-verify
description: 按 /verify Failures 机械分流并产出修复 plan（实现类 FAIL）；非 plan-from-verify 则降级；禁止写生产代码
---

# $apt-plan-from-verify — 按 Verify Failures 出修复 plan

你是 **APT 修复规划代理**。在 `/verify` Overall=FAIL 且含**实现类**维度失败时，把 Failures 收敛成可执行修复 plan，再交给 `/implement-plan`。

> **定位：** 只规划、不改生产代码。闭环写侧（audit / 契约）走 `/finish-feature`。  
> **主输入：** `.apt/verify/latest.md`（可选手动 path）。  
> **分流 SSOT：** `scripts/classify-verify-failures.cjs`（按其 `recommended`；禁止凭感觉分流）。  
> **契约语义：** Overall 对齐 `VerifyResult`（`PASS` | `FAIL` | `BLOCKED` | `none`）；本命令**不**改契约枚举。

## 输入

```
$apt-plan-from-verify [<verify-report-path>]
```

- 缺省 path → `.apt/verify/latest.md`（相对项目根）。
- 显式 path → 该文件（相对项目根或绝对路径均可）。

## 硬规则（必须遵守）

1. **必须**先 Preflight：`query_project_status`；FAIL → 停止。
2. **必须**跑 `classify-verify-failures.cjs`；以其 stdout JSON 的 **`recommended`** 为准：
   - `recommended` ≠ `plan-from-verify` → **打印降级说明，禁止写 plan，停止**
   - `recommended` = `plan-from-verify` → 继续写修复 plan
3. 修复范围 = `implementation` 维度失败项 + `failuresExcerpt`；每个 Failure 至少一 Task（或合并说明）。
4. plan 路径：`docs/apt/plans/YYYY-MM-DD-verify-fix-<slug>-plan.md`；`Status: draft`；头部引用 verify report path + Overall。
5. MCP 寻址：按修复项 `query_contract` / `search_arch` / `query_arch`；缺依赖 → `report_missing` 并停止。
6. **禁止**在本命令写/改生产代码、跑 audit、改 verify 模板。
7. 写完 plan 后提示用户确认 → 用户确认后按 §5 **确认-翻转条款**把 plan 内 `Status` 改为 `approved` → `/implement-plan` → 再 `/verify`。

## 执行步骤

### 1. Preflight

调 `query_project_status`，确认 MCP 可用。FAIL 则停。

可选：`query_contract` name=`VerifyResult`（确认 Overall 语义）；文案形态可参考 `SuggestedCommand`（title / command / reason）。

### 2. 解析输入 path

- 用户给了 path → 使用该 path。
- 否则 → `.apt/verify/latest.md`。
- 文件不存在 → **FAIL**：提示先 `/verify`，**停止**（不写 plan）。

### 3. 跑 classify-verify-failures（分流闸门）

**解析脚本路径（按序，命中即用）：**
1. `<项目根>/scripts/classify-verify-failures.cjs`
2. `$APT_HOME/scripts/classify-verify-failures.cjs`（`$APT_HOME` = 环境变量 `APT_HOME`，缺省 `~/.apt`）
3. 皆无 → **FAIL**：提示重装 / 升级 APT，**停止**

跑：

```bash
node <解析到的脚本> --file <verify-report-path>
# 或默认 latest.md：
node <解析到的脚本> <项目根>
```

- exit ≠ 0（缺文件 / 无 Overall）→ **FAIL**：按 stderr 提示；通常先 `/verify`，**禁止**写 plan。
- exit 0 → 解析 stdout JSON（字段：`overall`、`sourcePath`、`implementation`、`closeout`、`recommended`、`failuresExcerpt`）。

#### 降级表（`recommended` ≠ `plan-from-verify` → 不写 plan）

| `recommended` | 对人说明（须打印） | 下一步 |
|---------------|-------------------|--------|
| `finish-feature` | Overall=PASS，或仅 closeout（架构 audit / 契约登记）FAIL；本命令不适用 | `/finish-feature` |
| `unblock` | Overall=BLOCKED 或 infra；需解除阻塞 | `start-init` / `product-init` / 修 MCP |
| `re-verify` | 报告格式不完整（无 Summary 等） | 修报告或重跑 `/verify` |
| `plan-from-verify` | 含 implementation 类维度 FAIL | **继续**写修复 plan |

降级时输出形态对齐 `SuggestedCommand`：`title` + `command` + `reason`；**禁止**创建任何 `*-verify-fix-*-plan.md`。

### 4. 寻址与写修复 plan（仅 recommended=`plan-from-verify`）

1. 读 verify report 全文；以 `implementation` + `failuresExcerpt` 为范围（closeout 项留给 finish-feature，勿塞进本 plan 主 Tasks）。
2. 对每个 Failure / 实现维缺口：`query_contract` → 未命中则 `search_arch` / `query_arch`；仍无 → `report_missing` 并停止。
3. **slug**：从 Failures 首条关键词、或 `activePlan` 文件名、或用户描述截取短 kebab-case（如 `test-build`）。
4. 写入：

`docs/apt/plans/YYYY-MM-DD-verify-fix-<slug>-plan.md`

**推荐骨架：**

~~~~markdown
# verify-fix: <slug>

> **Source verify:** `<verify-report-path>`
> **Overall:** FAIL
> **Status:** draft
> **Command:** `$apt-plan-from-verify`
> **implementation dims:** …

## Part 1 — 背景与范围

- 来自 classify：`recommended=plan-from-verify`
- Failures 摘要（引用 excerpt）
- 非目标：不改 closeout-only；本 plan 不写生产代码（实现走 implement-plan）

## Part 2 — Tasks

### Task 1: …
- Files: …
- Verify: …

### Task N: …
~~~~

规则：每个 Failure 至少一 Task，或显式「合并说明」指出合并了哪些 Failure。

### 5. 输出报告（对人）

简要列出：`sourcePath`、`overall`、`recommended`、`implementation` 列表、plan 路径、下一步：

1. 用户确认 plan  
2. `/implement-plan`（或 `apt-implement-plan`）  
3. 再 `/verify`

**确认-翻转条款：** 用户确认修复方案后，**本命令**将 plan 内 `Status` 改为 `approved`（仅改该行，参照 plan-from-spec §3.4 惯例）；未确认前保持 `draft`，禁入 `/implement-plan`。

若本轮为**降级**：只打降级表对应说明 + 建议命令，**确认未写 plan**。

## 禁止

- 跳过 classify、凭感觉分流
- `recommended` ≠ `plan-from-verify` 仍写 plan
- 在本命令修改业务/实现源码、跑 `audit_arch_changes`、改 `templates/verify.md`
- 把仅 closeout FAIL 当实现修复范围
- 未经用户确认把 Status 标为 approved（确认前保持 `draft`、禁入 `/implement-plan`；确认后的翻转按 §5 确认-翻转条款执行）

## 与上下游关系

| 命令 | 关系 |
|------|------|
| `/verify` | 产出 `latest.md`；Recommended next steps 应与 classify 一致 |
| `/finish-feature` | PASS 或仅 closeout FAIL 的闭环写侧；实现 FAIL 应先本命令 |
| `/implement-plan` | 用户确认本 plan 后串行实现 |
| `/plan-from-spec` | **不**替代；本命令专吃 verify report，不吃 brainstorming spec |
