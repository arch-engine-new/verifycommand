---
---
<!-- apt-template-version: 10.9.5-pro -->
# $apt-ingest — 摄入已有原型工程

PM 已有前端原型工程，一条命令产出页面逻辑（+ 原生规格）。

## 使用

```
$apt-ingest <前端工程路径>
```

示例：
```
$apt-ingest D:\software\cgm-smart-community-v1\prototype\property-admin-web
```

## 执行步骤

参照 apt-ingest skill（`.agents/skills/apt-ingest/SKILL.md`）全自动执行：

1. Preflight（query_project_status）
2. 扫描工程（discover_v0_pages）
3. 逐页产页面逻辑（reconcile_page_logic）
4. 原生规格（条件：targetPlatforms 含原生 → extract-page-spec.cjs）
5. 产品入库（start_product_init）
6. 输出报告

## 产出物

```
designs/v0/
├── _pages.md
├── <pageId>/{page.logic.md, page.manifest.json}
```

## 硬规则

- 不重新生成原型（PM 的工程原样用）
- 逐页产出可中断/恢复（大工程分批）
- PM 核对后自行标 approved
