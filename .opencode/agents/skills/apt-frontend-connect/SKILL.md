---
name: apt-frontend-connect
description: Web 前端开发全流程（三场景：既有工程接线 / 有原型无工程→建 Vue·React 工程按页实现 / 纯页面逻辑→建工程实现）：迁移清单+Connect Ledger→connect-gate 强契约→先 feature 补后端→再对接清 mock→验收闭环。原型 HTML 永不作为最终页面交付。
---

# $apt-frontend-connect <源工程路径> <目标工程路径> [--framework=vue|react]

你是 **APT 前端开发编排代理**。把 PM 的原型工程/页面逻辑对接为可交付的**真实前端工程**，走完整标准闭环。

## 场景判定（原型有无 × 目标工程有无）

| 场景 | 原型 | 目标工程 | 行为 |
|------|------|----------|------|
| **S1 既有工程**（现状，保留） | 有 | 已存在真实 Vue/React 仓 | 复制原型进工程作参考 → 迁移清单（语义组件→框架组件）→ 补后端 → 清 mock 接线（现有流程不变） |
| **S2 有原型、无工程** | 有（`designs/v0` 可预览） | 不存在 | **创建 Vue/React 工程，按 page.logic.md + 原型视觉参考逐页实现**，同时补后端；原型保留在 `designs/v0` 仅作 PM 预览与设计参考，**不再复制为目标产物** |
| **S3 纯页面逻辑** | 无（仅 `page.logic.md`） | 不存在（或存在） | **按页面逻辑直接创建工程并实现**，无视觉参考 |

同一工程允许混合（部分页有原型、部分页只有逻辑）：逐页判定，账本 `pages.json` 每页 `mode` 分记。

**强要求 ≠ 提示词：** 对接完成判定靠 `.apt/connect/` 账本 + `connect-gate.cjs` exit 0，**不是提示词**自觉。详见共享闸门 `templates/_connect-strong-contracts.md`（下文亦内联强制点）。

## 命令参数

```
$apt-frontend-connect <源工程路径> <目标工程路径> [--framework=vue|react]
```

- **源工程路径**（必须）：PM 的原型工程（如 `prototype/property-admin-web`）
- **目标工程路径**（必须）：开发的前端工程（如 `D:\cgm-app\community-admin-ui`）
- **--framework=vue|react**（可选）：S1 沿用目标工程栈（参数仅提示）；S2/S3 未指定默认 `vue`，Phase 2 汇总停顿点明示「将创建 Vue 3 + Vite 工程」供用户当场改

两个路径参数都必须显式指定。不猜测、不默认。

## 核心顺序（必须遵守）

1. 发现缺后端接口 → **写清楚「缺少后端接口」**（迁移清单 + `required-apis` status=`missing`），不跳过、不假装已有。  
2. 对接实现时 → **先按 `/feature` 模式补齐缺失后端**，再 mock→API。  
3. **不要中断、不要不做完**：禁止只完成复制/清单就宣称结束；会话过长则按 plan 续跑，直到后端缺口清掉且对接完成，且 **gate `stage=done` exit 0**。

```
复制/扫描 → 迁移清单 + Ledger → gate ledger → plan → gate plan
  → Phase 4a 补后端 → gate backend → Phase 4b 清 mock → gate wire
  → verify → gate done → finish
```

（S2/S3：不复制原型，Task S 脚手架后按页垂直切片执行 4a/4b，见 Phase 3/4；五道 gate 顺序不变。）

## Connect 强契约（机制）

见 `templates/_connect-strong-contracts.md`。摘要：

| Phase | 必须跑 | 未过则 |
|-------|--------|--------|
| 2 后 | `--stage=ledger` | 禁止 Phase 3 |
| 3 后 | `--stage=plan` | 禁止 implement |
| 4a 后 | `--stage=backend` | 禁止 4b |
| 4b 后 | `--stage=wire` | 禁止宣称对接完成 |
| 完成前 | `--stage=done` | 禁止 Overall 完成叙事 |

```bash
node templates/connect-runner/connect-gate.cjs --stage=<ledger|plan|backend|wire|done> --dir=.apt/connect
```

Agent **必须**在目标工程写入：`pages.json`、`required-apis.json`、`required-dropdowns.json`、`mocks.json`、`progress.json`；Phase 3 写 `plan-tasks.json`；延期写 `deferred.json`。示例 schema：`templates/connect-runner/*.example`。

### 禁止（偷懒）

- 无 ledger / 不跑 `connect-gate` 就进下一 Phase  
- 只更新 Markdown 迁移清单、不写 `required-apis` 等 JSON  
- gate exit ≠ 0 仍宣称「对接完成 / 命令结束」  
- 把缺接口页静默跳过（须 `deferred.json` 显式延期）
- **目标工程内不得出现 `designs/v0` 原型 HTML 拷贝**（gate `PROTOTYPE_HTML_COPY` 会 FAIL）
- **禁止只跑 done 跳过中间四道 gate**——ledger / plan / backend / wire 必须逐阶段跑

## 工作流

### Phase 0 — Preflight + 场景判定

1. 调 `query_project_status`，确认 MCP 可用。FAIL 则停。
2. 从命令参数获取源路径和目标路径。
3. **场景判定**：
   - **逐页原型判定**：看 `designs/v0/<pageId>/index.html` 是否存在——有 → 原型页；无 → 逻辑页
   - **目标工程探测**：存在且 `package.json` 依赖 vue/react → **S1 既有工程**（沿用其栈）；不存在或非前端工程 → **S2/S3**（工程化创建）
4. **S2/S3 preflight**：`node -v` ≥18 与 `npm -v` 必查；缺失 → **FAIL** 并给安装指引（无 HTML 回退）
5. **S2/S3 禁止复制源工程**：`designs/v0` 原件不动、PM 预览保留；目标工程由 Task S 创建（见 Phase 3）
6. **S1 — 全量复制**（首次）或 **增量合并**（后续迭代）：
   - 首次：整个源工程复制到目标路径。原件不动。
   - 后续：调 `discover_v0_pages` 确定增量范围（新页复制/更新页报告/未变页跳过）
7. 在目标路径执行 `agent-init`（如尚未初始化）。

### Phase 1 — 扫描对接缺口

1. 执行 `start-init --full`（全量扫描目标工程）。
2. 调 `query_connect_status`（无参）获取对接全景：
   - 每页 status / mockFiles / fieldNeeds / backendCoverage / apiLinks  
   - 页级 `status` 枚举：`not-connected` | `partial` | `connected`（契约 `ConnectStatus`）
3. 记录缺口（仅记账，不因此结束命令）。

### Phase 2 — 读 page.logic.md + 产出迁移清单 + Ledger

**场景分支（迁移清单差异）**：

- **S1**：现行清单结构不变
- **S2**：**恢复并强化组件替换表**（原型语义组件 → Vue/React 组件，经 `query_design(component)` 寻址 bindings）；增「原型对照」小节列 `designs/v0/<pageId>/index.html` 路径——实现阶段打开对照布局结构、语义组件、tokens 用色
- **S3**：无组件替换表；组件来源 = page.logic.md 分区结构 + `query_design(scope: global)` 语义组件 + tokens
- **S2/S3 的 Mock 清理表**：目标 = 脚手架自带的 `src/mocks/**` 与 services mock 分支

对每个页面：

1. 读 `designs/v0/<pageId>/page.logic.md`（需求真源）。
2. **可选 applied schema（软引用）**：若存在 `.apt/schema/progress.md` 且 `applied=yes`（或等价），迁移清单 / 缺表缺字段对齐时**优先参考** progress 指向的 `docs/schema/*`；缺失 progress 或未 applied → **继续**，**不 FAIL**。
3. 读 page.logic.md 的「选项数据源」节——**全部下拉必须走接口或字典，无一例外**。
4. 调 `query_connect_status(page)` 确认该页 mock/gap/API 缺口。
5. 调 `query_design`（scope: global）获取语义组件定义（用于组件替换映射）。
6. 对 page.logic.md 的 API 意向名调 `query_contract` / `search_arch` 寻址后端接口。
7. 产出**迁移清单**（`designs/v0/<pageId>/migration.md`）：

```markdown
# 迁移清单 — <pageId>

## API 接入表
| API 意向名 | 后端接口 | 状态 |
|-----------|---------|------|
| listUsers | GET /system/user/list | ✅ 已有 |
| createUser | POST /system/user/create | ✅ 已有 |
| exportUsers | 无 | ❌ 缺少后端接口 |

## 组件替换表
| 语义组件 | 框架组件 | 来源 |
|---------|---------|------|
| PrimaryButton | antd Button type="primary" | framework-bindings |
| DataTable | antd Table | framework-bindings |

## Mock 清理表
| Mock 文件/变量 | 替换为 |
|---------------|--------|
| src/mock-data/users.ts | GET /system/user/list |
| mockData.ts → roles[] | GET /system/dict/data/list?dictType=role |

## 下拉数据源（全部走接口或字典，无一例外）
| 下拉字段 | 数据来源 | 接口 |
|---------|---------|------|
| 角色 | 字典 | GET /system/dict/data/list?dictType=role |
| 社区 | 业务接口 | GET /property/community/list |
| 楼栋（级联） | 业务接口 | GET /property/house/tree?communityId=xxx |

## 菜单/导航接入表
| 页面 | 菜单挂载点 | 机制类型 |
|------|-----------|---------|
| 用户管理 | 系统管理/用户管理 | db-driven（后端菜单接口下发） |

## 数据契约对齐
| API 意向名 | volumeClass（page.logic「数据契约」节） | shape 申报 | 分页参数 |
|-----------|--------------------------------------|-----------|---------|
| listUsers | bounded | paged | pageNum/pageSize |
| exportUsers | bounded | full（fullReason：审计导出需一次取全量归档） | — |

## 前端数据防御申报（画像 ui 段；defaulted 可整节省略）
| 申报项 | 值（示例） | 说明 |
|--------|-----------|------|
| framework | react | react｜vue｜other；other/缺省档位上限 L1 |
| apiClientModule | src/services/apiClient | decode 层约定路径 |
| boundaryComponent | src/components/DataBoundary | 区块边界组件路径 |
| evidenceLevel | L2 | 申报取证档位；done 复算缺证据即 FAIL |

## 缺失项
- 缺少后端接口：exportUsers → 需按 feature 补 ExportController（写入 plan 后端 Task，排在接线前）
- 缺表：无
- 缺微服务：无
```

8. **同步写入 Connect Ledger**（目标工程 `.apt/connect/`，**机制强制**，与上表对齐）：
   - `pages.json`：全页；每页须含 `apis`，并记 `mode`（原型页 `prototype-ref` / 逻辑页 `logic-only`）；顶层记 `framework`（`vue` | `react`）；页级记 `nav`（机制 + 挂载点，取 page.logic「导航」节的菜单机制类型 × 菜单挂载点 × 画像探测结论，如 `nav: { "menuType": "db-driven", "mountPoint": "系统管理/用户管理" }`）
   - `required-apis.json`：每条 API `status` = `missing` | `ready` | `wired`；列表/查询类 API **申报数据形态**：`shape`（`paged` | `full`）+ `volumeClass`（**从 page.logic「数据契约」节取量级，PM 声明的 volumeClass 开发不得改**）；`shape=full` 须带非空 `fullReason`；`shape=paged` 须带 `pageParam` / `sizeParam`（取画像数据约定）。申报非法 gate 即拦：`DATA_SHAPE_INVALID` / `FULL_FETCH_UNBOUNDED`（ledger 阶段）、`FULL_FETCH_UNJUSTIFIED`（wire 阶段）、`PAGED_PARAMS_MISSING`（plan 阶段）
   - `required-dropdowns.json`：下拉 → 接口/字典（可空数组，文件必须存在）
   - `mocks.json`：待清理 mock 清单
   - `progress.json`：`phase` 至少推进到 ledger 阶段

9. **下拉数据源全部走接口或字典**（无一例外）：
   - 字典类（角色/状态/性别/类型）→ `GET /system/dict/data/list?dictType=xxx`
   - 业务数据（社区/楼栋/房屋/部门/员工）→ 对应业务接口
   - 级联（社区→楼栋→房屋）→ 按联动关系串接口
   - **禁止保留任何硬编码的下拉选项数组**

10. **缺失项处理**（记账，不退出）：
   - **缺少后端接口**（Controller/Service）→ 迁移清单标「❌ 缺少后端接口」+ `required-apis`=`missing` + 汇总表；**必须**进入 plan 的 **feature 式后端 Task**（按业务域拆分）
   - 缺表（DDL/Entity/Mapper）→ 同上，进 plan 后端 Task
   - 缺字段（已有表加字段）→ 同上
   - **缺微服务**（与「缺普通业务接口」不同）→ 提示架构师 `/apt-arch-review`；确认拆分策略后，仍把可落地的接口/BFF 缺口写入 plan；无法本会话落地的写入 `deferred.json`（`reason=needs_arch_review`），**不得**因普通缺接口而结束本命令

#### 工程机制画像（`.apt/profile.json`）

随迁移清单一并探测**目标工程**的菜单机制与数据约定，产出工程机制画像——「本项目什么叫合理」的政策声明，gate 用它 × 申报 × 证据做一致性判定（schema 见 `templates/connect-runner/profile.json.example`）：

1. **探测菜单机制**（`menu.type`）：db-driven=后端菜单接口下发（记 `navApi`，如 `/getRouters`）／route-driven=中心路由文件（记 `source` 路径；wire/done 静态断言该文件含每页 route，缺页 → `NAV_NOT_REGISTERED`）／code-driven=中心菜单注册文件（记 `source` 路径）。page.logic「导航」节机制类型为 `unknown` 的页以探测结果定。
2. **探测数据约定**（`data`）：列表响应 envelope（如 `{ rows, total }`）与分页参数名 `pageParam` / `sizeParam`（如 `pageNum` / `pageSize`）。
3. **探测前端防御声明（`ui` 段，并入画像人审）**：`framework`（`react|vue|other`）+ `apiClientModule`（decode 层约定路径）+ `boundaryComponent`（区块边界组件路径）+ `evidenceLevel`（`L1|L2|L3` 申报取证档位）；页级可用 `pages.json` 页对象 `evidenceLevel` 覆盖画像档位。**申报时向人讲明降级后果**：申报档位在 done 复算时缺证据 = FAIL（`FRONTEND_*` 失败码，见 Phase 6）；未申报（defaulted：缺省/空串/非法）→ 按 L1 放行（存量画像零破坏）；`framework=other`/缺省 → 档位上限 L1（gate WARN `FRONTEND_LEVEL_CAPPED`，按 L1 判）。ui 段申报结论记入迁移清单「前端数据防御申报」节。
4. 探测结论写入目标工程 `.apt/profile.json`，先落 `status: draft`。
5. **停顿点请人确认**：画像属政策声明，必须人审——`draft` 期间 gate 对画像相关判定只 WARN 不 FAIL；确认后置 `status: confirmed`（确认动作并入下方停顿点）。

展示迁移清单汇总（N 页 + M 个缺少后端接口 + K 个缺表）。  
若仅需用户扫一眼清单：可短暂停顿确认；**S2/S3 在此停顿点明示「将创建 Vue 3 + Vite / React + Vite 工程」（未指定 `--framework` 时默认 Vue）供用户当场改**；**同一停顿点一并展示工程机制画像（菜单机制 + 数据约定 + `ui` 段前端防御申报）请人确认**，确认后置 `.apt/profile.json` `status: confirmed`；存量工程迭代时画像已 `confirmed` → **跳过本停顿，不重复打扰**；**确认后必须继续 Phase 3–4，禁止当作对接已完成。**

#### Phase 2 出口闸门（强制）

```bash
node templates/connect-runner/connect-gate.cjs --stage=ledger --dir=.apt/connect
```

exit ≠ 0 → **禁止**进入 Phase 3。

### Phase 3 — 规划

调 `/plan-from-spec`，传入迁移清单 + ledger 作为实现依据。

plan 的 Task **必须**按此顺序：

1. **Task S — 工程脚手架**（仅 S2/S3，首个 Task，`kind: "scaffold"`）  
   - 产出：package.json（vue3 + vite + vue-router / react + react-router）/ vite.config / `src/router`（PRD 页清单→路由表）/ main / `src/styles/tokens.css` / `src/services` + `src/mocks` 骨架  
   - **工程级文件用代码模板生成，不走 LLM**，保证 `npm install && npm run dev` 必能起  
   - view 路径约定（与 connect-gate 对齐）：**vue → `src/views/<pageId>/index.vue`；react → `src/pages/<pageId>/index.tsx`**  
   - 全局 CSS 必含 `[hidden]{display:none !important}`（防内联 `style` 覆盖 `hidden` 属性导致隐藏态闪现；随 `src/styles/tokens.css`/全局样式一并注入）  
   - services 层 `http.ts` 自定义请求头常量按 **ASCII 码值**生成（角色/门店等业务语义映射为码值如 foreman/store/process，映射关系以 JS 常量注释说明；非 ISO-8859-1 字符会被 Chromium 拒绝）  
2. **Task A — 按域 feature 补后端**（仅针对「❌ 缺少后端接口 / 缺表 / 缺字段」）  
   - 每一业务域一个（或一组）Task，模式对齐 `/feature`：补 Controller/Service/Entity/Mapper 等  
   - 多域（如 20 域）**按域拆开串行**，保证索引表完整，避免一上下文塞爆后半截放弃  
   - **消费工程机制画像**：db-driven 工程的菜单数据变更（SQL / 菜单配置）必须进 Task A 后端域；`shape=paged` 的缺失 API 进后端 Task 时**带 `pageParam` / `sizeParam` 约定**（取自画像 `data` 节；缺失 → gate plan 阶段 `PAGED_PARAMS_MISSING`）  
   - **reset-demo 约定**：为有写操作的域提供 `POST /api/<domain>/reset-demo`（幂等，重置到 page.logic 演示态）；与 `$apt-accept` Phase 0.5 **重置能力探针**互指——该探针即探测此约定（或可重复种子，两者皆无 → 探针 WARN）  
3. **Task B′ — 按页实现**（依赖对应 Task A 完成；S1 即现行「Task B — 前端对接」）  
   - 每页 = view 组件树（page.logic.md 为 SSOT；**S2 另对照原型视觉**：布局结构、语义组件、tokens 用色）+ services（先接 mock，该页 API ready 后切真）+ 下拉走接口/字典  
   - S1 行为不变：删 mock + 连 API + 实现功能 + 下拉走接口；每页以 page.logic.md 为 SSOT  

禁止：只有前端 Task、或把「缺少后端接口」的页直接跳过。  
禁止：页内私挂菜单——工程无菜单机制 → plan 必含**中心注册 Task**（建 route-driven 中心路由 / code-driven 注册机制），菜单接入一律走画像声明的机制。

**执行顺序（S2/S3）——按页垂直切片**：

```
Task S（一次）→ 逐页: [该页缺 API 的 Task A 子任务 → 该页 UI 实现 → 该页接线清 mock] → 下一页
```

- 同域 API 允许在首个引用页批量补齐（避免重复扫域）  
- 每页内部仍遵守「该页 API ready 后才清该页 mock」  

同时写出 `.apt/connect/plan-tasks.json`（从 plan 摘录 Task id / kind=`backend|wire|scaffold` / pageIds / apiIds / domain；**Task S 记 `kind: "scaffold"`，其余 kind 不变**），供机检。

#### Phase 3 出口闸门（强制）

```bash
node templates/connect-runner/connect-gate.cjs --stage=plan --dir=.apt/connect
```

exit ≠ 0 → **禁止**调 `/implement-plan`。

### Phase 4 — 实现（两段，都要做完）

调 `/implement-plan`，子 Agent **严格串行**：

> **S2/S3**：4a/4b 以**按页垂直切片**交织执行（顺序见 Phase 3）——`backend` gate = **全部 `required-apis` 达 `ready` 后**方可宣称后端齐；`wire` gate 前**所有页须已实现并接线**。S1 维持两段串行不变。

#### Phase 4a — 先补后端（feature 模式）

- 只跑 Task A：按域补齐缺失 API / 表 / 字段  
- 每完成一域：回写迁移清单 API 表状态（❌ → ✅ 或注明已实现路径）；同步把对应 `required-apis` 从 `missing` → `ready`  
- **未完成全部 Task A 前，禁止开始清 mock**

#### Phase 4a 出口闸门（强制）

曾标「缺少后端接口」的项应可 `search_arch` / `query_contract` 命中；然后：

```bash
node templates/connect-runner/connect-gate.cjs --stage=backend --dir=.apt/connect
```

exit ≠ 0 → **禁止**进入 Phase 4b。

#### Phase 4b — 再对接前端

##### 骨架先行（前端数据防御，先于任何页面组件）

受管页在写任何页面组件**之前**，先从 SSOT `templates/_frontend-data-defense.md` 实例化防御骨架——接口形状/文件路径/DOM 标记/断言全部照抄模板，AI 只填 `TODO(scaffold-fill)` 空位（填空而非造轮子）：

- **实例化五产物**：decodeClient + requestJson（apiClient 模块内）→ per-API decoder stub（`<api-name>.decode.ts`）→ DataBoundary → useResource → per-API 契约测试（`tests/frontend-contracts/`）；契约测试文件头两行 `// DONOTEDIT(scaffold)` + `// fingerprint: sha256:<hex>`，指纹逐条入 `.apt/connect/frontend-fingerprints.json`（ledger）
- **遵守 `templates/_code-standards.md`「数据防御」四则**：入口必 decode / 区块必 boundary / 渲染必三态 / 骨架必先于页面；DOM 标记照模板写死：页面根元素带 `[data-page-root]`，错误降级带 `data-state="error"`（四态 `loading|error|empty|data` 与 useResource 一一对应）
- **三禁（gate L1 即拦，`FRONTEND_SKELETON_MISSING`）**：禁裸消费原始响应；禁 `as Type` 断言替代校验（假 decode）；禁只包整页单 boundary（粒度按数据区块）
- **`DONOTEDIT(scaffold)` 文件禁手改**：私改断言/删测试 → done 闸指纹复算 `FRONTEND_TEST_TAMPERED`（改证据骗闸门 = 无证据）
- S2/S3 按页垂直切片时，骨架先行落在**每页 UI 实现之前**（先实例化该页骨架，再实现该页）

- 跑 Task B / B′：删 mock → 连 API → 操作/状态/校验 → 下拉走接口  
- 回写 `mocks.json`（cleared/done）与 `required-apis`→`wired`；更新 `progress.json`  
- 调 `query_connect_status`，将快照写入 `.apt/connect/connect-status.json`  
- 接线后运行 **wire 探针**：`node templates/connect-runner/wire-probe.cjs --base-url=<目标后端> --ledger=.apt/connect`（**M2，Task 8 交付**）→ 产出 `.apt/connect/wire-evidence.json`（逐页导航数据源 + 列表请求的原始捕获）；环境不可用 → 证据标 `blocked(env)` 并如实上报，**禁止虚假「已对接」叙事**  
- 若某页仍依赖未补齐的 API → BLOCKED，回到 4a，不得跳过该页假装完成

#### Phase 4b 出口闸门（强制）

```bash
node templates/connect-runner/connect-gate.cjs \
  --stage=wire \
  --dir=.apt/connect \
  --connect-status=.apt/connect/connect-status.json \
  --target=<目标工程>
```

`--target` 指向目标工程根（CLI 与 MCP `check_connect_gate` 的 `target` 参数均可）；提供时 wire/done 额外断言工程化实现——S2/S3 页须有真实 view 文件、且工程内无原型 HTML 拷贝。

exit ≠ 0 → **禁止**宣称对接完成 / 进入「命令结束」叙事。建议同时调 `check_code_quality`；`highCount>0` 视为未过。

#### 续跑（不要中断、不要不做完）

- 会话过长 / 子 Agent 额度用尽：写入 `.apt/orchestration` 续跑点（下一 Task id）+ 更新 `progress.json`  
- 提示用户对**同一目标**继续 `/implement-plan` 或再次 `$apt-frontend-connect`（增量），从续跑点接着做  
- **禁止**在仅完成 Phase 0–2 或只完成部分域时输出「对接完成 / 命令结束」；出口须列出尚未过的 `connect-gate` stage

### Phase 5 — 验收

调 `/verify`，9 维验收（若存在 `.apt/connect/progress.json`，后续 verify 将含 connect 维）。

FAIL → `/finish-feature` → 重新 `/verify`。

**前端防御取证（按申报档位；画像 `ui` 段或页级 `evidenceLevel` 已申报时必跑）**：

```bash
node templates/connect-runner/wire-probe.cjs --resilience --ledger=.apt/connect \
  [--base-url=<目标后端> --user=<u> --password=<p>] --level=both --target=<目标工程>
```

证据落 `.apt/connect/frontend-evidence.json`（只含原始事实，无结论字段）。**L3 申报必 `--level=both`**：阶梯累积 L3⊃L2，缺 L2 证据 gate 会报 `missing:levels.L2`。无测试运行器/无浏览器 → 探针 `skipped`（`no-test-runner` / `no-playwright`）= 合法降档路径，非失败；**显式申报高档而证据缺失才 FAIL**（defaulted 未申报 → 按 L1 放行）。

验收前自检：迁移清单中曾标「缺少后端接口」的项应已可 `search_arch` / `query_contract` 命中，且对应 Mock 清理表已处理；若已产出 `.apt/connect/wire-evidence.json` 与 `.apt/connect/frontend-evidence.json`，一并核对证据与申报/画像一致——探针 `blocked(env)` 须如实注明，不得当作探针已通过；否则不得宣称完成。

### Phase 6 — 闭环 + done 闸门

调 `/finish-feature`，同步架构资产。

宣称本命令完成前 **必须**：

```bash
node templates/connect-runner/connect-gate.cjs \
  --stage=done \
  --dir=.apt/connect \
  --connect-status=.apt/connect/connect-status.json \
  --target=<目标工程>
```

exit ≠ 0 → **禁止** Overall 完成叙事。

**N5 对接分级（done 时如实标注）**：done 过闸后必须在 `progress.json` 顶层如实标 `connectLevel`（`prototype|mock|real-backend|production`，缺省视为 `prototype`；gate 会在 done 输出透出该档位）。未到 `production` 时，完成输出须注明剩余升级路径**一句**（例：`connectLevel=mock：后端仍为 mock，需换接真实后端后重跑 done 闸门`）。

**分级诚实链（M2，Task 9 交付 gate 断言）**：done 前核对 `.apt/connect/wire-evidence.json`——mocks 全清 + `required-apis` 全 wired 却把 `connectLevel` 报成 `mock|prototype` → gate FAIL `LEVEL_EVIDENCE_CONFLICT`；档位必须与证据相符，不得低报装保守、不得无证据高报。

**FRONTEND_* 失败码与修复路径（done 阶段按申报档位复算；失败码/marker 以 `connect-gate.cjs` 实码为准，全表见 `templates/connect-runner/README.md`）**：

| 失败码 | 修复路径 |
|--------|----------|
| `FRONTEND_SKELETON_MISSING`（marker `fake-decode`/`boundary`） | 回 Phase 4b **骨架先行重跑**：补 decode 引用链 / boundary 引用，禁 `as Type` 假 decode |
| `FRONTEND_EVIDENCE_MISSING` | **补证据**：重跑 `wire-probe --resilience` 取证 / 补齐契约测试与运行器 / 补 `frontend-fingerprints.json` 指纹 ledger |
| `FRONTEND_TEST_TAMPERED` | **重算指纹**：从 SSOT 重新实例化被改/被删的骨架文件并重算指纹入库；禁止手改 `DONOTEDIT(scaffold)` 骗闸门 |
| `FRONTEND_EVIDENCE_INCONSISTENT` | 证据含结论字段（`passed/ok/success/verdict`）或出现未申报档位证据 → 删手写证据，重跑 `--resilience` 取真实证据 |
| `LEVEL_EVIDENCE_CONFLICT` | **如实降档**：申报改到证据可支撑的档位，或补齐高档证据，二选一 |

非阻断 WARN：`FRONTEND_LEVEL_CAPPED`（`framework=other`/缺省 → 档位上限 L1，按 L1 判——此时如实按 L1 申报即正确形态，不算降级违规）。

**出口**：→ `/current-status`（看进度，确认交付）。

## 约束

- **不自己做实现**——实现归 `/implement-plan` 的子 Agent  
- **原件不动**——所有修改在目标工程上  
- **下拉全部走接口或字典**——无一例外  
- **缺接口 = 记账并先 feature 补齐**——不是退出条件，也不是跳过对接的理由  
- **先后端、后接线**——顺序不可颠倒；`stage=backend` 未过禁止 4b  
- **不做完不结束**——禁止静默半截收工；完成靠 `connect-gate` 机制  
- **缺微服务需架构确认**——与普通缺 Controller 区分；普通缺口走 feature 补齐  
- **菜单必须走画像声明的机制**——db-driven=后端菜单数据、route-driven/code-driven=中心注册；禁页内私挂  
- **量级以 page.logic 数据契约为真源**——PM 声明的 `volumeClass` 开发不得改；申报（`shape`）与证据围绕它裁决  
- **数据防御骨架先行**——受管页先从 `_frontend-data-defense.md` 实例化骨架再写页面组件；禁裸消费原始响应/`as Type` 假 decode/只包整页单 boundary；`DONOTEDIT(scaffold)` 文件禁手改  
- **迁移清单是 plan 的输入**——不是最终实现；机检以 `.apt/connect/` 为准
- **applied schema 软引用**——有则优先参考 `docs/schema/*`；无则不 FAIL  
- **原型永不交付**——S2 的原型仅是预览与视觉参考；最终页面一律为工程内 view 组件  
- **S2/S3 无 Node 环境即 FAIL**——不回退 HTML  
- **`designs/v0` 原件不动**——S1 复制进目标工程作参考的行为保留（属复制到目标工程的参考副本）；gate 的拷贝断言针对「平铺 `<pageId>/index.html` 当最终页面」的形态  
 
