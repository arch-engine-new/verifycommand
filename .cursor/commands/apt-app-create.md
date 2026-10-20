<!-- apt-template-version: 10.9.5-pro -->
# $apt-app-create — 从零做 App 产品（强制规格载体）

PM 说产品想法，一条命令产出 PRD + 原型工程 + 页面逻辑 + **像素级规格载体**（`page.spec.*`）。

适用于已配置原生 `targetPlatforms` 的 App 项目。纯 Web 请用 `$apt-create`。

## 使用

```
$apt-app-create <产品想法>
```

示例：
```
$apt-app-create 智慧社区APP，包含首页、在线缴费、报修、公告、个人中心
```

## 执行步骤

参照 apt-app-create skill（`.agents/skills/apt-app-create/SKILL.md`）全自动执行：

1. Preflight（query_project_status）
2. 原生门禁（targetPlatforms 须含原生，否则 FAIL → 改用 `$apt-create`）
3. 产 PRD（generate_prd）
4. 产原型 + 页面逻辑（generate_frontend_project）
5. **强制**像素级规格载体（每页 extract-page-spec；失败 / 无 HTML → FAIL）
6. 产品入库（start_product_init）
7. 更新 _pages.md（approved=no，等 PM 核对）
8. 输出报告

## 产出物

```
docs/prd/<产品名>.md
designs/v0/
├── index.html
├── _pages.md
├── <pageId>/{index.html, page.logic.md, page.manifest.json, page.spec.json, page.spec.png}
├── mock/
└── styles/
```

## 硬规则（相对 Web `$apt-create`）

- 无原生 `targetPlatforms` → **FAIL**（提示改用 `$apt-create`）
- 每页必须产出 `page.spec.json` + `page.spec.png`；不可跳过
- 文案用「像素级规格载体」；禁止「保证…还原到原生」类过满承诺
