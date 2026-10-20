<!-- apt-template-version: 10.9.5-pro -->
# $apt-app-ingest — 摄入已有原型（强制规格载体）

PM 已有前端原型工程，一条命令产出页面逻辑 + **像素级规格载体**（`page.spec.*`）。

适用于已配置原生 `targetPlatforms` 的 App 项目。纯 Web 请用 `$apt-ingest`。

## 使用

```
$apt-app-ingest <前端工程路径>
```

示例：
```
$apt-app-ingest D:\software\cgm-smart-community-v1\prototype\property-admin-web
```

## 执行步骤

参照 apt-app-ingest skill（`.agents/skills/apt-app-ingest/SKILL.md`）全自动执行：

1. Preflight（query_project_status）
2. 原生门禁（targetPlatforms 须含原生，否则 FAIL → 改用 `$apt-ingest`）
3. 扫描工程（discover_v0_pages）
4. 逐页产页面逻辑（reconcile_page_logic）
5. **强制**像素级规格载体（每页 extract-page-spec；无 HTML / 失败 → FAIL 列页）
6. 产品入库（start_product_init）
7. 输出报告

## 产出物

```
designs/v0/
├── _pages.md
├── <pageId>/{page.logic.md, page.manifest.json, page.spec.json, page.spec.png}
```

## 硬规则

- 不重新生成原型（PM 的工程原样用）
- 逐页产出可中断/恢复（大工程分批）
- PM 核对后自行标 approved
- 无原生 `targetPlatforms` → **FAIL**（提示改用 `$apt-ingest`）
- live-project 无独立可测 HTML → **FAIL**（列页；建议改用 `$apt-app-create` 或补可测 HTML），**不可跳过**
- 文案用「像素级规格载体」；禁止「保证…还原到原生」类过满承诺
