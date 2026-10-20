---
name: apt-arch-review
description: 架构师 Agent — 产品知识同步 + 必问门禁 + 子阶段可恢复 + 30 维架构缺口 + 技术选型 + 逐项补齐（v10.2）
---
> ⚠ **能力边界：** 生产级深度（路径规则 / AST 解析 / DO 落库 / 30 维关键词）**当前仅 Java**；Go / TS / Python 可跑审查流程，但蓝图、索引、落库为半支持——选型靠 blueprint 卡片 + sql-fallback + 人工校正，不承诺与 Java 同级可重复交付。

请执行架构师 Agent 流程（apt-arch-review skill）。

**强制顺序：** product sync（`start_product_init` / `product-init`）→ 呈现 `productArchConcerns` 必问并**停等** → 写 `.apt/arch-review/product-arch-answers.json` → `detect_arch_gaps` → **底座推荐（见下，插在 30 维补齐之前）** → **30 维**缺口纠正与补齐 → 用户选补齐项 → 逐项 brainstorm/plan/implement。续跑只做当前子阶段（见「子阶段账本」）。

**必问含 `dict_catalog`：** 当产品源有选项/级联信号时，必须问「选项/级联主数据是否统一字典服务并落库（禁止 JSON 文件终态）？」；答案仍写入 `.apt/arch-review/product-arch-answers.json`（`concernId: "dict_catalog"`）。

**必问含 `iot_platform` / `gis_platform`：** 产品文案或信号出现物联网/设备/地图/GIS 时，必须问「要不要引入开源 IoT/GIS 底座？」；答案写入同一 answers 文件。

**检索：** 产品能力用 `search_product` / `query_product`；代码架构用 `search_arch`。验收含 **Product Alignment** 维度。

## 底座推荐（插在 30 维补齐之前）

`detect_arch_gaps` 返回后，先处理 `blueprintSuggestions`，**禁止**跳过底座编排直接做 30 维补齐。**禁止未确认许可就 clone。** 蓝图目录未命中或需要评估目录外候选时，可用 MCP **`query_github_repo`**（输入 owner/name）查仓库元数据（star/license/语言/最近提交）辅助选型决策。

### 无后端（`trigger: no-backend`）

若 `blueprintSuggestions` 含 `trigger: no-backend`：

1. 必须 `query_blueprint(category=admin)`（可附 langs/region），呈现 **2–3** 张卡片并**停等**（表格：name / SPDX / restrictions / whenToUse / defaultTarget）。
2. 用户选定 `id` 并明确确认许可后：`apply_blueprint(id, confirmLicense=true, confirmSpdx=卡片 SPDX)`（`confirmSpdx` 必须等于该卡片 SPDX）。
3. apply 成功后必须立刻 `start_init`（apply **不**内嵌扫描；返回 `nextTool: "start_init"`）。
4. 然后才进入 30 维补齐（按已 clone 代码纠正缺口，不再重复推荐同一个 admin 底座）。

### 消息中心

`message_notify` 答案为「要」：`query_blueprint(category=message)`，同样呈现 2–3 选并停等；选定后 `apply_blueprint(..., confirmLicense=true, confirmSpdx=卡片 SPDX)`，再 `start_init`。

### IoT / GIS

产品文案/concern 出现物联网/设备/地图/GIS，或 `concernId` 为 `iot_platform` / `gis_platform`：答案为「要」则分别 `query_blueprint(category=iot)` / `query_blueprint(category=gis)`，编排同上。

## 子阶段账本

进入本命令时**先读** `.apt/arch-review/progress.md`。

- **无此文件：** 创建它，YAML frontmatter 写 `stage: concerns` 与 `updatedAt:`（ISO 8601），从 `concerns` 开始。
- **有此文件：** **只做** frontmatter 的当前 `stage`。禁止重开已完成阶段；禁止跳阶段。
- 阶段只能沿：`concerns` → `blueprint` → `scan` → `correct` → `closed`。每次切阶段必须改 `stage` 并刷新 `updatedAt`。
- **禁止**把「服务起来了」「Started AppRun」「后端已启动」当成审查结束。完成标志只有 `stage: closed` **且** 已写 `.ai/arch/arch-review.json`。

建议文件头：

```yaml
---
stage: concerns
updatedAt: 2026-08-18T00:00:00Z
---
```

### concerns

1. 执行上方强制顺序中的 product sync（`start_product_init` / `product-init`）。
2. 呈现 `productArchConcerns` 必问（含 `dict_catalog` / `iot_platform` / `gis_platform` 触发时）并**停等**。
3. 用户回答后写入 `.apt/arch-review/product-arch-answers.json`（`concernId` / `answer` / `decidedAt`）。
4. 完成后把 progress 改为 `stage: blueprint`。禁止未写 answers 就进入 blueprint。

### blueprint

1. 调用 `detect_arch_gaps`，先处理 `blueprintSuggestions`（上方「底座推荐」：卡片停等 / 用户确认许可 / `apply_blueprint(id, confirmLicense=true, confirmSpdx=卡片 SPDX)`）。**禁止未确认许可就 clone。**
2. 一旦 `apply_blueprint` 成功，或探测到后端已启动：立刻把 progress 改为 `stage: scan`，然后进入 scan。**禁止**在本阶段结束对话或宣称审查完成。
3. 长扫描未开始前的停等（许可、Docker）保持在本阶段；许可完成后仍须进入 `scan`。

### scan

1. 判定 `.ai/arch/last-scan.json`：文件不存在、内容为空仓、或扫描时间早于本次 clone / `apply_blueprint` → **必须**立刻调用 `start_init`。禁止跳过。
2. 用户在本阶段说「基础设施不补」：仍须先跑完 `start_init`，禁止跳过扫描去闭合。
3. `start_init` 失败（覆盖率等）：停在 `stage: scan`，向用户报告失败原因。禁止改 `stage` 为 `correct`。禁止写 `.ai/arch/arch-review.json`。
4. `start_init` 成功：把 progress 改为 `stage: correct`。**作废**空仓阶段用户勾选的 missing / 缺口清单（不得沿用 clone 前的 30 维勾选）。

### correct

1. 再次调用 `detect_arch_gaps`（扫描后的索引）。
2. `detect_arch_gaps` 可能为每维附带 `indexHits`（`path` / `score` / `summary`）。这只是检索提示；**引擎不自动把任何维标为 `ok`**。弱命中、低分、或资产与该维无关 → 保持 `missing`，不得标 `ok`。
3. 用 `indexHits` + `search_arch` 逐维校正。机械 25 条 missing **不是**完成。
4. 向用户呈现校正后的缺口，让用户选补齐或 skip。用户选补齐 → 逐项 brainstorm/plan/implement。用户说「基础设施不补」→ 把对应维写入 skip，进入 closed（见下）。**本回合禁止**启动 `$apt-schema-design` / `/apt-schema-design`。

### closed

1. **必须**写 `.ai/arch/arch-review.json`，至少包含：纠正后的 `dimensions`（每维 `status`：`ok` / `missing` / `partial` / `not-applicable`）、`userConfirm`（skip 列表）、`reviewedAt`（ISO 8601）。可选保留 `indexHits` 作证据。
2. 把 progress 改为 `stage: closed` 并刷新 `updatedAt`。
3. 这是状态机完成标志：无此 JSON = 审查未完成。禁止用「服务已启动」或空仓 missing 报告代替本文件。

### 已 closed 再跑

若 progress 已是 `closed` 且 `.ai/arch/arch-review.json` 存在：提示审查已完成，询问是否重开校正；**默认停**（不重开、不改 stage、不重跑 `start_init`）。仅当用户明确要求重开校正时，把 `stage` 设为 `correct`（禁止退回 `concerns` / `blueprint` / `scan`）。
