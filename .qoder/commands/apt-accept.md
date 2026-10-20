---
---
<!-- apt-template-version: 10.9.5-pro -->
# $apt-accept — 运行时按产品真源验收

依据 ingest 的 **`page.logic.md`** 做运行时验收：

1. 枚举**全量必验点（RP）** → `required-points.json`  
2. 写 `accept-cases.md`（一点一案）→ 验一条勾一条  
3. **视觉步 `view_visual`**（有原型 ∧ 路由可解析 ∧ `approved=yes` 的页）：原型 vs 实现布局骨架容差比对；前提缺一 → skip 计数汇总披露  
4. 跑 **`accept-gate`**（机制门禁，不是提示词）  
5. 写 **`ACCEPTANCE-REPORT`**（含全量 RP 覆盖表 + 机读 `visual` 段）  
6. FAIL 默认走 **`/feature`**（low 可自动批准）；`--no-fix` 可只要报告  

与 `/verify` 正交。不硬依赖外部 QA Skill。

## 使用

```
$apt-accept --base-url=https://staging.example.com --user=qa --password=***
```

选项：`--mode=auto|page|logic` · `--regression` · `--incremental` · `--smoke` · `--batch-size=5` · `--no-fix` · `--captcha=` / `--interactive-captcha`

## 硬规则

- 无 `required-points.json` / gate 未过 → 页不得 done，Overall 不得 PASS  
- 每一个 RP（加载/操作/校验/状态/下拉/上传/…）都必须独立案例并勾选  
- 视觉步 progress 行必须声明 `report`（visual-report.json 路径）+ `screenshots`（双截图路径）——gate 按声明核盘，缺失/矛盾即 FAIL  
- 视觉 fail（ROUTE-MISSING/容差超限）→ 修复三模式；`prototype-missing`/`prototype-broken` → 泊车人审，**不派 `/feature`**；`visual-blocked`（基础设施）不计产品 FAIL 但页不得 done  
- 终稿报告缺全量覆盖表 → Overall 不得 PASS  
- 禁止 accept 内 inline 改产品代码；修复走 `/feature`
