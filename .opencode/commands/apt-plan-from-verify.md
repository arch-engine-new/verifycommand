---
---
<!-- apt-template-version: 10.9.5-pro -->
# $apt-plan-from-verify — 按 Verify Failures 出修复 plan

默认读 `.apt/verify/latest.md`，用 `classify-verify-failures` 机械分流：仅当 `recommended=plan-from-verify` 时写修复 plan；否则**降级**（指向 `/finish-feature` / unblock / re-verify），**禁止**写生产代码。

## 使用

```
$apt-plan-from-verify [<verify-report-path>]
```

示例：
```
$apt-plan-from-verify
$apt-plan-from-verify .apt/verify/latest.md
```

## 执行步骤

参照 apt-plan-from-verify skill（`.agents/skills/apt-plan-from-verify/SKILL.md`）全自动执行：

1. Preflight（`query_project_status`）
2. 解析输入（默认 `.apt/verify/latest.md`）
3. 跑 `node scripts/classify-verify-failures.cjs`；读 `recommended`
4. `recommended` ≠ `plan-from-verify` → **降级**说明，不写 plan，停止（`finish-feature` / unblock / re-verify）
5. 否则写 `docs/apt/plans/YYYY-MM-DD-verify-fix-<slug>-plan.md`（draft；Part 1 + Part 2 Tasks）
6. MCP 寻址缺依赖 → `report_missing` 停
7. 提示用户确认后 `/implement-plan` → 再 `/verify`

## 产出物

```
docs/apt/plans/YYYY-MM-DD-verify-fix-<slug>-plan.md
```

（仅当 `recommended=plan-from-verify`；降级时无产出文件。）

## 禁止

本命令不写生产代码；不替代 `/finish-feature` 闭环；不扩展 `/plan-from-spec`。
