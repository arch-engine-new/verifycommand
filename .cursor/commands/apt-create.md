<!-- apt-template-version: 10.9.5-pro -->
# $apt-create — 从零做产品

PM 说产品想法，一条命令产出 PRD + 原型工程 + 页面逻辑（+ 原生规格）。

## 使用

```
$apt-create <产品想法>
```

示例：
```
$apt-create 智慧社区APP，包含首页、在线缴费、报修、公告、个人中心
```

## 执行步骤

参照 apt-create skill（`.agents/skills/apt-create/SKILL.md`）全自动执行：

1. Preflight（query_project_status）
2. 产 PRD（generate_prd）
3. 产原型 + 页面逻辑（generate_frontend_project）
4. 原生规格（条件：targetPlatforms 含原生 → extract-page-spec.cjs）
5. 产品入库（start_product_init）
6. 更新 _pages.md（approved=no，等 PM 核对）
7. 输出报告

- **sourceDoc 绑定保真（O4 done-when）**：goal.md frontmatter 含 `sourceDoc`（或本轮输入即已有文档）→ 必须跑 `node scripts/check-refine-fidelity.cjs --source <sourceDoc> --pages designs/v0 [--prd <产出PRD>]` 且 **exit 0**（产出页面清单 / 非目标 / 验收相对源文档**只增不减**，漂移即 FAIL；脚本路径同 H8：项目 `scripts/` → `$APT_HOME/scripts/`，皆无 → FAIL）

## 产出物

```
docs/prd/<产品名>.md
designs/v0/
├── index.html
├── _pages.md
├── <pageId>/{index.html, page.logic.md, page.manifest.json}
├── mock/
└── styles/
```
