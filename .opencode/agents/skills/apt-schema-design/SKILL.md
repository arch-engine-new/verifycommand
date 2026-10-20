---
name: apt-schema-design
description: 多轮库表设计 — 以 page.logic 为主输入，对照 EntityGraph 标注 reuse/alter/create，产出含 E-R 的 schema MD 与账本，供线下评审（禁止写 DO）
---

# $apt-schema-design — 多轮库表设计

你是 **APT 库表设计编排代理**。在架构师之后、connect 之前，把产品页面逻辑收敛成**可评审的表设计 MD**（含 mermaid E-R）。

> **定位：** 只设计、不落库代码。生成 DO / migration / 写 EntityGraph 属于 `$apt-schema-apply`。  
> **主输入：** `designs/v0/**/page.logic.md`（契约语义对齐 `PageLogicOutput.logicMarkdown`）。  
> **辅输入：** `docs/prd/*.md` 数据模型；已扫描 **EntityGraph**（可空）。  
> **规范：** `templates/_code-standards.md`（或项目 `.apt/code-standards.md`）**数据库**节。

## 输入

```
$apt-schema-design [<feature>]
```

- `feature`：功能/产品切片名；缺省则从 PRD / page.logic 的 `feature` 字段 / 用户本轮描述推导，并写入账本。
- 多 feature 并存时：账本当前 `schemaPath` 指向本轮正在设计的那份 MD。

## 硬规则（必须遵守）

1. **无**任何 `designs/v0/**/page.logic.md` → **FAIL**：提示先 `$apt-create` / `$apt-ingest`（或 app 对等命令），**停止**。
2. **必须**读取 EntityGraph（可空）。对每个推导实体标注：`reuse` / `alter(新增字段)` / `create`。空 EntityGraph → 允许全部 `create`。
3. **多轮对话**：一次只聚焦一个缺口（缺表 **或** 缺字段）；**未齐不得**将账本标为 `ready-for-review`。
4. 产出 MD **必须**含：变更摘要；每表字段（名/类型/可空/说明）+ 主键/索引；关系表（from/to/kind）；mermaid `erDiagram`（或等价 E-R 节）。
5. 对齐 `_code-standards.md` 数据库节（主键、公共审计字段、命名等）；缺项在对话中补齐，或在 MD 中显式记「豁免理由」。
6. **禁止**在本命令生成 DO、migration/DDL，或直接改写 EntityGraph / `entities.json`。
7. 收尾必须跑 `check-schema-design`；非零退出 → **不得**标 `ready-for-review`。

## 执行步骤

### 1. Preflight

调 `query_project_status`，确认 MCP 可用。FAIL 则停。

### 2. 发现 page.logic（硬闸门）

扫描 `designs/v0/**/page.logic.md`：

- **0 个** → **FAIL**：`未找到 page.logic.md。请先运行 $apt-create / $apt-ingest（或 App 对等命令）产出页面逻辑后再设计表。`
- ≥1 个 → 列入本轮输入清单；可读对应 `page.manifest.json`（`PageLogicOutput.manifest`：id / pageType / feature / title / route / description / status）。

逻辑正文按四段消费（与 `PageLogicOutput.logicMarkdown` 骨架对齐）：**操作明细**、**主流程**、**状态**、**依赖**。从中推导实体与字段需求（列表筛选项、表单字段、详情展示、API 意向名等）。

可选辅读：`docs/prd/*.md` 的数据模型章节。

### 3. 读取 EntityGraph

1. `query_contract` name=`EntityGraph`（确认 `EntityDef` / `EntityField` / `EntityRelation` 语义）。
2. 用 `search_arch` / `query_ontology` / 项目已扫描实体清单读取**现有**表与字段；读不到则视为**空图**（允许全 `create`，记 WARN）。
3. 建立对照表：每个候选实体 → `reuse` | `alter(新增字段: …)` | `create`。

### 4. 多轮补齐（一次一缺口）

维护缺口队列（缺表 / 缺字段 / 缺关系 / 缺审计字段 / 命名不合规）：

1. **一次只抛出一个缺口**给用户（或给出默认草案请确认）。
2. 用户确认后写入工作稿，再问下一个。
3. **禁止**在缺口未清时把账本 `status` 写成 `ready-for-review`。
4. 对照 `_code-standards.md` **数据库**节检查：`id` 主键、公共审计字段（`created_at`/`updated_at`/`creator`/`updater`/`deleted` 等）、snake_case、金额不用 FLOAT、索引命名。缺省公共字段 → 补问或记豁免理由。

### 5. 写 schema MD

路径：`docs/schema/<feature>-schema.md`（目录不存在则创建）。

**推荐模板（须能过 `check-schema-design`）：**

~~~~markdown
# <feature> 库表设计

## 变更摘要
- 新建表：`t_a`, `t_b`
- 变更表：`t_c`（新增字段：`foo`, `bar`）
- 实体处置：`EntityA=create` / `EntityC=alter` / `EntityD=reuse`

## 表清单

### 表 `t_a`
- 表名：`t_a`
- 处置：create
- 主键：`id`
- 索引：`idx_t_a_xxx` / `uk_t_a_yyy`

| 字段名 | 类型 | 可空 | 说明 |
|--------|------|------|------|
| id | BIGINT | NO | 主键 |
| ... | ... | ... | ... |

### 表 `t_b`
...

## 关系
| from | to | kind |
|------|----|------|
| t_a | t_b | many-to-one |

## E-R

\`\`\`mermaid
erDiagram
  t_a ||--o{ t_b : has
\`\`\`
~~~~

说明：字段表表头须含「字段/名」与「类型」列，以便门禁识别；关系表须含 from/to/kind；必须出现 `erDiagram` 或独立「E-R」节。

### 6. 写账本

确保目录 `.apt/schema/` 存在；维护 `.apt/schema/progress.md`，至少含：

| 字段 | 说明 |
|------|------|
| `feature` | 本轮 feature 名 |
| `status` | `draft` →（齐套且 check PASS 后）`ready-for-review` |
| `schemaPath` | 如 `docs/schema/<feature>-schema.md` |
| `reviewed` | 本命令保持 `no`（评审在线下 / apply 前） |
| `applied` | 本命令保持 `no` |

示例：

```markdown
# Schema Progress

- feature: order
- status: draft
- schemaPath: docs/schema/order-schema.md
- reviewed: no
- applied: no
```

未齐 → `status: draft`。仅当缺口清零 **且** 下一步 check PASS 后，才可改为 `ready-for-review`。

### 7. 收尾门禁 — check-schema-design

**解析 `check-schema-design.cjs` 路径（按序，命中即用）：**
1. `<项目根>/scripts/check-schema-design.cjs`
2. `$APT_HOME/scripts/check-schema-design.cjs`（`$APT_HOME` = 环境变量 `APT_HOME`，缺省 `~/.apt`）
3. 皆无 → **FAIL**：提示重装 / 升级 APT，**停止**（不得标 `ready-for-review`）

跑：

```bash
node <解析到的脚本> <项目根>
# 或显式：
node <解析到的脚本> --file docs/schema/<feature>-schema.md
```

- 非零退出 → **FAIL**：按 stderr 缺项修 MD，**禁止**将账本标为 `ready-for-review`。
- exit 0 → 可将 `status` 更新为 `ready-for-review`，并提示用户线下评审；评审通过后走 `$apt-schema-apply`（须用户确认语，本 Skill **不**执行 apply）。

### 8. 输出报告（对人）

简要列出：feature、schemaPath、实体处置摘要（reuse/alter/create 计数）、check 结果、账本 status、下一步（线下评审 → `$apt-schema-apply`）。

## 禁止

- 无 `page.logic` 仍继续设计
- 跳过 EntityGraph 读取（空图须显式当作空，不可假装已读）
- 一次抛多个缺口导致未确认字段混入终稿
- 缺口未齐或 check FAIL 时写 `ready-for-review`
- 生成 / 修改 DO、Entity 源码、migration、EntityGraph 索引
- 静默发明与 page.logic / PRD 无关的大表而不标注假设

## 与下游关系

| 命令 | 关系 |
|------|------|
| `$apt-schema-apply` | 用户确认「表设计完成」/「评审通过」后落 DO + migration 并入 EntityGraph |
| `$apt-frontend-connect` / `$apt-app-connect` | 可选读已 `applied` 的 schema；**无则仍可运行**（软引用） |
