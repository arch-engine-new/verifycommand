---
name: apt-create
description: 从零做产品 — PM 说产品想法，一条命令产出 PRD + 原型工程 + 页面逻辑（+ 原生规格）
---

# $apt-create — 从零做产品

你是产品产出代理。PM 给你一个产品想法，你产出**全部交付物**。

> **必须遵循**产品闸门 SSOT：读并遵守 `templates/_create-product-gates.md`。  
> **必须遵循**无 baoyu 时的风格卡：`templates/_create-style-presets.md`。  
> 本 Skill 与上述文件冲突时，以 **gates + 已落盘账本** 为准。

## 输入

PM 说一句话描述产品。例如：

```
$apt-create 智慧社区APP，包含首页、在线缴费、报修、公告、个人中心
```

可选旗标：`--fast`（仅旗标或原文精确「跳过澄清」才跳过澄清/风格）、`--refine` / `--create`（强制模式）。

## 执行步骤

### 1. Preflight

调 `query_project_status`，确认 MCP 可用。FAIL 则停。

### 2. 模式探测（mode）

按 `templates/_create-product-gates.md` §2：

| 条件 | mode |
|------|------|
| 已有 `docs/prd/*.md` **且** `designs/v0/_pages.md` | 默认 `refine` |
| 上述不全 | 默认 `create` |
| 用户显式 `--refine` / 「完善产品文档」/ 「增量改页」 | 强制 `refine` |
| 用户显式 `--create` / 「从零重做」 | 强制 `create`（须警示可能覆盖） |
| 用户显式 `--fast` 旗标，或原文**精确含**「跳过澄清」 | 跳过 Phase 0 / 0.5（见 gates §6）；「快点」「直接做」等**不算** |

`refine` 但磁盘无 PRD 或无 `_pages.md` → **FAIL**：提示改用 create，或先 `$apt-ingest`。

把最终 `mode` 写入 `.apt/create/brief.md` 头部。

### 3. Phase 0 — 需求澄清（硬闸门）

**除非**合法 `--fast`（见 gates §6），否则**必须**执行。条文见 gates §3。

1. 确保目录 `.apt/create/` 存在；维护 `.apt/create/brief.md`（最低章节见 gates）。
2. **productGoal 一致性（H1）**：对本轮目标与 brief 头字段 `productGoal` 做 trim + 折叠连续空白后再比较；**不一致** → 将 `confirmed` **重置为 `no`**，重跑 Phase 0；**禁止**沿用旧 `confirmed: yes` 直接生成。
3. **一次一问**澄清：产品目的 → 目标用户 → 必做页面/核心流程 → 非目标 → 成功标准；（`mode=refine`）变更页清单 → 写入非空 `changePages:`。
4. 信息足够后展示 brief 摘要，并**停等**：

> **【停】** 请审阅 `.apt/create/brief.md`。若认可，请回复 **「确认 brief」** 继续；若要改，直接说明修改点。

5. **仅当**用户**本轮原文**含「确认 brief」后，将 `confirmed: yes` 写入 brief，才允许进入 Phase 0.5 / 生成。
6. **禁止自确认（H3）**：Agent **不得自行把 `confirmed` 写成 `yes`**；账本已有 `confirmed: yes` 不等于本轮已确认，须先过 productGoal 一致性检查。
7. 未确认却要求直接生成 → **停**；重申须「确认 brief」或改用合法 `--fast`（仅旗标 / 「跳过澄清」）。

`refine` 时：围绕「要改什么 / 保留什么」提问，读取现有 PRD / `_pages.md` / `page.logic.md`，不要假装从零发现产品。空 / 缺 `changePages` → **停**，补问后再继续。

### 4. Phase 0.5 — 风格选择

**除非**合法 `--fast`，否则**必须**执行（须在 brief 已确认之后）。条文见 gates §4。

1. 优先探测本机 **baoyu-design / baoyu-skills**；可用则产出 2–3 张风格卡供选。
2. 不可用或失败 → **WARN**（可提示 install 代装 baoyu），改用 `templates/_create-style-presets.md` 中 **≥2** 张预设卡。
3. **禁止**只给 1 个方向；**禁止**因缺 baoyu 阻断流程。
4. 展示风格卡后写入/更新 `.apt/create/style-choice.md`，初始 **`confirmed: no`**（可先记候选 `styleId`）。
5. **停等**：

> **【停】** 请选定风格。回复 **「确认风格」**，或明确写出选定的 **styleId / 风格卡名称**。

6. 仅当用户本轮原文含 **「确认风格」**，或**明确选定**某一 `styleId` / 风格卡名称时：落盘最终 `styleId` / `source` / `designTokens`，并将 `style-choice.md` 的 `confirmed` 标为 **`yes`**。
7. **禁止自确认**：Agent **不得自行把 `confirmed` 写成 `yes`**。
8. **未确认禁止**调用 `generate_prd` / `generate_frontend_project`（合法 `--fast` 除外）。

### 5. 生成前自检

调用任何 `generate_prd` / `generate_frontend_project` **之前**，按 gates §7 逐项自检；任一项未通过 → **停**。要点：

| 检查 | 通过条件 |
|------|----------|
| `--fast` | 仅旗标或原文精确「跳过澄清」；合法 fast 可跳过 brief/风格确认项 |
| brief | 非 fast：`confirmed: yes` 且可追溯用户「确认 brief」；productGoal 一致 |
| 风格 | 非 fast：`style-choice.md` `confirmed: yes`；用户曾「确认风格」或明确选定 styleId/风格卡名 |
| refine | `changePages` **非空**；即将传入的 `pages` ⊆ `changePages` |

### 6. 产 PRD（gates 之后）

仅在 brief 已确认（或合法 `--fast`）且风格已确认（或合法 `--fast`）后，且 §5 自检通过：

调 `generate_prd`（契约 `PrdOutput` / 输入 `PrdInput`）：
- `productGoal`：产品目标（来自 brief 或一句话）
- `constraints`：**注入** `.apt/create/brief.md` 全文（页面清单草案、非目标、成功标准、`changePages` 等硬约束）
- `existingContext`：**注入** brief 澄清记录 +（refine 时）现有 PRD / 相关 page.logic 摘要
- **禁止**仅凭一句口号臆造页面清单
- 产出存 `docs/prd/<产品名>.md`（**正式 PRD** 写盘）
- 含：产品定位、目标用户、核心流程、功能模块、**页面清单**（pageId/pageType/title/route）、数据模型

`refine`：按 brief 只改指定页/模块对应的 PRD 段落，保留未改动章节。

### 6.1 正式 PRD 硬门禁（H8）— 产 PRD 后、产原型前

写盘后、调用 `generate_frontend_project` **之前**必须跑通 `check-create-prd`：

**解析 `check-create-prd.cjs` 路径（按序，命中即用）——与 extract 同序：**
1. `<项目根>/scripts/check-create-prd.cjs`
2. `$APT_HOME/scripts/check-create-prd.cjs`（`$APT_HOME` = 环境变量 `APT_HOME`，缺省 `~/.apt`）
3. 皆无 → **FAIL**：提示重装 / 升级 APT，**停止**

跑：`node <解析到的脚本> <项目根>`（可选 `--prd docs/prd/<产品名>.md`）。

- 非零退出 → **FAIL**：stderr 列缺项；**禁止**调用 `generate_frontend_project`；修 PRD 后重跑至 PASS
- `--fast` **不**免除本门禁；**禁止**跳过脚本
- `refine`：改 PRD 后同样必须 PASS；不得因「已有旧 PRD」跳过

### 7. 产原型工程 + 页面逻辑

仅在 §6.1 H8 PASS 后，调 `generate_frontend_project`（契约 `ProductFlowAPI` / `GenerateFrontendInput`；复用 `pages` + `designTokens`）：
- `productGoal`：PRD 产品目标
- `pages`：PRD 页面清单；**`mode=refine` 时只能含 `changePages` 中的变更页**（`pages` ⊆ `changePages`）；**禁止**整仓页面列表重生覆盖未改页
- `dataModel`：PRD 数据模型
- `projectRoot`：项目根
- `designTokens`：**必须**来自 `.apt/create/style-choice.md` 的 tokens（`--fast` 且无 style-choice 时可读 `.ai/design/profile.json`，仍无则默认）
- 同时把 **风格约束 / visualKeywords**（style brief）拼进传给生成的 tokens/上下文，要求原型按选定风格追求**设计感**
- 产出 `designs/v0/`（index.html + 每页 index.html + page.logic.md + mock/）

`refine` 专条（gates §5 / H5）：
- brief 头部**强制非空** `changePages:`；空列表 / 缺字段 → **停**
- **禁止默认清空** `designs/v0`（不得 `rm -rf designs/v0` 或整仓重生成覆盖未改页）
- 未改动的页面 HTML / logic / spec **必须保留**
- 仅对变更页重生/修补
- **sourceDoc 绑定保真（O4 done-when）**：goal.md frontmatter 含 `sourceDoc`（或本轮输入即已有文档）→ 必须跑 `node scripts/check-refine-fidelity.cjs --source <sourceDoc> --pages designs/v0 [--prd <产出PRD>]` 且 **exit 0**（产出页面清单 / 非目标 / 验收相对源文档**只增不减**，漂移即 FAIL；脚本路径同 H8：项目 `scripts/` → `$APT_HOME/scripts/`，皆无 → FAIL）

### 8. 原生规格（条件；H6）

读 `.apt/project.json` 的 `targetPlatforms`：
- 含 swiftui/compose/react-native/flutter → 对相关页跑 extract（`create`：相关页；`refine`：**仅变更页** / `changePages`）
- 空/仅 web → 跳过
- `--fast` **不**免除本条件步骤（有原生平台时仍须跑）

**解析 `extract-page-spec.cjs` 路径（按序，命中即用）——与 App create 同序：**
1. `<项目根>/scripts/extract-page-spec.cjs`
2. `$APT_HOME/scripts/extract-page-spec.cjs`（`$APT_HOME` = 环境变量 `APT_HOME`，缺省 `~/.apt`）
3. 皆无 → **FAIL**：提示重装 / 升级 APT（release 须含 `extract-page-spec.cjs`），**停止**

跑：`node <解析到的脚本> designs/v0/<pageId>/index.html`；确认产出 `page.spec.json` + `page.spec.png`。

任一页出现以下情况 → **FAIL**，停止，并列出失败页：
- 无可用 / 无可测量 HTML
- 项目与 `$APT_HOME` 皆无 `extract-page-spec.cjs`（须重装 APT）
- `extract-page-spec.cjs` 非零退出或未写出 `page.spec.json` / `page.spec.png`

**禁止降级（明文）：** 不得用纯 Node HTML 解析、puppeteer、占位 PNG 冒充 `page.spec.*`。缺脚本 / 缺 Playwright / 测量失败只能 **FAIL**，不得自造替代方案。不得削弱 extract 交付。

### 9. 产品入库

调 `start_product_init`（契约 `ProductInitOptions`），同步 page.logic.md 到 `.ai/product/`。  
`refine` 用增量同步（默认非 `full`）。

### 10. 更新 _pages.md

维护 `designs/v0/_pages.md`；新建/变更页 `approved=no`（等 PM 核对后改）。未改页保留原状态。

### 11. 输出报告

**报告前再跑 H8：**再执行一次 `check-create-prd`（同 §6.1 路径解析）。FAIL → Overall **FAIL**（即使原型已生成），不得宣称 create 成功。

**报告前写 armed 标识：**create 或 refine 成功产报告前，写入/刷新 `.apt/create/armed.json`：`{ "armed": true, "lastMode": "<create|refine>", "updatedAt": "<ISO 时间>" }`（`.apt/create/` 内其它账本不动，见 gates §8）。

展示：
- `mode`（create / refine）与是否 `--fast`
- **正式 PRD 路径**（绝对或相对；缺合格正式 PRD → **FAIL**）
- 产出/变更了多少页、每页路径
- 原型预览入口（`designs/v0/index.html`）
- 非 fast：附 `.apt/create/brief.md` / `style-choice.md` 路径
- **armed 标识路径与状态**：`armed: true（.apt/create/armed.json，lastMode=<mode>）`；refine 时另附 `changePages` 清单行
- `--fast` 时须含**醒目警告**（gates §6）：已跳过需求澄清与风格选择，产物易走偏
- 提示 PM：浏览器打开确认 → 标 approved=yes → 运行 `/apt-share` 推送

## 输出物

```
.apt/create/brief.md              ← 需求账本（非 --fast）
.apt/create/style-choice.md       ← 风格账本（非 --fast）
.apt/create/armed.json            ← armed 标识（成功产报告前写入）
docs/prd/<产品名>.md              ← PRD（含页面清单 + 数据模型）
designs/v0/
├── index.html                    ← 原型入口
├── _pages.md                     ← 进度表（变更页 approved=no）
├── <pageId>/
│   ├── index.html                ← 可交互原型（须有设计感）
│   ├── page.logic.md             ← 页面逻辑
│   ├── page.manifest.json        ← 元数据（source: "generated"）
│   ├── page.spec.json            ← 原生规格（条件产出）
│   └── page.spec.png             ← 截图参考（条件产出）
├── mock/                         ← Mock 数据
└── styles/                       ← 样式（含选定 tokens）
```

## 硬规则

- **必须遵循** `templates/_create-product-gates.md` 与 `_create-style-presets.md`
- **H1** `productGoal` 不一致 → `confirmed` 重置为 `no`；禁止沿用旧确认直接生成
- **H3** Agent **不得自行把 `confirmed` 写成 `yes`**（brief 与 style-choice 均适用）；须引用用户本轮原文
- **H2** 非 `--fast`：须用户「确认风格」或明确选定 styleId/风格卡名，且 `style-choice.md` `confirmed: yes`，才可 `generate_*`
- **H4** `--fast` **仅**旗标或原文精确「跳过澄清」；「快点」「直接做」等不算
- **H5** `refine`：强制非空 `changePages`；`pages` ⊆ `changePages`；**禁止默认清空** `designs/v0`
- **H6** 条件 extract：项目 `scripts/` → `$APT_HOME/scripts/` → FAIL；**禁止**纯 Node HTML 解析 / puppeteer / 占位 PNG 冒充 `page.spec.*`
- **H8** 正式 PRD：产 PRD 写盘后、`generate_frontend_project` 前必须 `check-create-prd` PASS；报告前再验；路径：项目 `scripts/` → `$APT_HOME/scripts/` → FAIL；`--fast` **不**免除；报告须列正式 PRD 路径；FAIL → 停 / Overall FAIL
- 非合法 `--fast`：未「确认 brief」/未「确认风格」前，**禁止**调用 `generate_prd` / `generate_frontend_project`
- 必须按选定风格追求设计感；**禁止**灰盒堆砌、无层次无主色乱码布局
- 不写 src/ 业务代码
- 不做架构审查 / 技术选型
- PM 核对后自行标 approved
