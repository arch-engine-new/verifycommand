---
name: apt-ingest
description: 已有原型工程 — PM 给路径，一条命令产出页面逻辑（+ 原生规格）
---

# $apt-ingest — 摄入已有原型工程

你是产品产出代理。PM 已有一个前端原型工程（自己用 v0/Codex/手写做的），你把它整理成 APT 规范的页面逻辑。

## 输入

PM 给工程路径。可选提供 PRD 文档路径。

```
$apt-ingest <前端工程路径> [PRD文档路径]
```

示例：
```
$apt-ingest D:\software\cgm-smart-community-v1\prototype\property-admin-web
$apt-ingest D:\software\cgm-smart-community-v1\prototype\property-admin-web D:\software\cgm-smart-community-v1\docs\01_交付底稿
```

**PRD 文档路径可选**：
- 提供了：子 Agent 同时读源码 + PRD，对齐提取（推荐）
- 没提供：子 Agent 只从源码提取

## 执行步骤（全自动，不停等）

### 1. Preflight

调 `query_project_status`，确认 MCP 可用。FAIL 则停。

### 2. 扫描工程

调 `discover_v0_pages`（`projectRoot` = PM 给的路径）：
- 识别页面文件（page.tsx/*.vue/index.html）
- 识别技术栈（package.json → Next.js/Vue/React）
- 识别路由结构
- 产出 `designs/v0/_pages.md`（全 approved=no）

### 3. 逐页产页面逻辑（主 Agent 编排，子 Agent 逐页执行）

**主 Agent（你）负责编排：**
1. 读 `_pages.md`，拿到全部页面列表
2. 对每个 pending 页面，**派一个子 Agent**（spawn / Agent tool）处理该页
3. 主 Agent 等子 Agent 返回后，更新 `_pages.md` 该页状态
4. 继续下一页（可并行派多个子 Agent，建议每批 3-5 页）

**子 Agent 的任务（每页一个，全新上下文）：**
```
你是页面逻辑提取 Agent。处理一个页面：

页面：<pageId>
工程路径：<projectRoot>
源码文件：<列出该页的 page.tsx + content 组件路径>
PRD 文档：<列出对应的 PRD 文件路径（如有）>

步骤：
1. 读该页源码文件
2. 【如有 PRD】读对应的 PRD 文档章节
3. 调 MCP reconcile_page_logic（projectRoot=<路径>, pageId=<pageId>）
4. 如果 MCP 不可用，手动读源码提取：
   - 操作明细（增删改查/导出/审批）
   - 状态（loading/empty/error/success）
   - 字段与列（表单字段/表格列）
   - 校验（必填/格式/范围）
   - API 意向名（listXxx/createXxx）
5. 【如有 PRD】对齐原型与 PRD：
   - PRD 要求但原型未实现的操作/字段/校验 → 写入 page.logic.md，备注标注「PRD 要求，原型未实现」
   - 原型有但 PRD 未提及 → 保留（以源码实际为准）
   - 两者冲突 → 以 PRD 为准，备注标注「原型与 PRD 不一致」
6. 按 page.logic.md schema L 模板写入 designs/v0/<pageId>/page.logic.md
7. 写 page.manifest.json（source: "live-project"）
8. git add + commit（消息：ingest: <pageId> page.logic.md）

完成后返回：页名 + 成功/失败 + 逻辑摘要（操作数/字段数/API意向数）+ PRD对齐差异（如有）
```

**关键：**
- 子 Agent 必须有 MCP 配置（.zcode/mcp.json 或等效），能调 reconcile_page_logic
- 如果子 Agent MCP 不可用，fallback 手动读源码提取（不阻塞）
- 主 Agent 不自己读源码——全部交给子 Agent
- 每页独立 git commit，失败不影响其他页
- 大工程（>10 页）分批，每批 3-5 页并行

### 4. 原生规格（条件）

读 `.apt/project.json` 的 `targetPlatforms`：
- 含 swiftui/compose/react-native/flutter 且该页有 index.html → 跑 `node scripts/extract-page-spec.cjs`
- live-project（无独立 HTML）→ 跳过（豁免）
- 空/仅 web → 跳过

### 5. 产品入库

调 `start_product_init`，同步 page.logic.md 到 `.ai/product/`。

### 6. 输出报告

展示：
- 摄入了多少页
- 每页路径
- 提示 PM：浏览器打开原型确认 → 对照 page.logic.md → 标 approved=yes → 运行 `/apt-share` 推送 → `/current-status` 看进度（引导架构师接手）

## 输出物

```
designs/v0/
├── _pages.md                     ← 进度表（全 approved=no）
├── <pageId>/
│   ├── page.logic.md             ← 页面逻辑
│   ├── page.manifest.json        ← 元数据（source: "live-project"）
│   └── page.spec.json            ← 原生规格（条件产出）
```

## 硬规则

- 全自动执行，不停等用户（除 Preflight FAIL）
- 不重新生成原型（PM 的工程原样用）
- 不写 src/ 业务代码
- 不做架构审查 / 技术选型
- PM 核对后自行标 approved
- 逐页产出可中断/恢复（大工程分批）
