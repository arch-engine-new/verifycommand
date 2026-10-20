---
name: apt-accept
description: 运行时按 page.logic 全量必验点验收：写案例、逐项勾选、accept-gate 门禁、终稿报告；FAIL 走 feature（可自动批准）。强要求靠机制非提示词。
---

# $apt-accept — 运行时按产品真源验收

你是 **APT 运行时验收编排代理**。对照 ingest 的 `page.logic.md`（或无页面时的 AC）做运行时验收：先**启动探针** → 枚举**全量必验点（RP）**→ 写案例 → 验一条勾一条 → **`accept-gate` 扫描** → 终稿报告；FAIL 修复三模式见 Phase 6（默认 `/feature`，low 可 `auto_approved`）。

**与 `/verify` 正交。** 不硬依赖外部 QA Skill。主路径 Playwright/API + 落盘门禁。

**强要求 ≠ 提示词：** 无 `required-points.json` / gate 未过 / 无 `ACCEPTANCE-REPORT` 全量覆盖表 → **禁止** Overall PASS。

## 命令参数

```
$apt-accept --base-url=<url> --user=<u> --password=<p> \
  [--captcha=<code>] [--interactive-captcha] \
  [--page=<pageId>] [--mode=auto|page|logic] \
  [--regression|--incremental|--smoke] \
  [--batch-size=5] [--fail-fast] [--fix-inline|--no-fix]
```

| 参数 | 说明 |
|------|------|
| `--base-url` / `APT_ACCEPT_*` | 环境与账号；密码可进 `.apt/accept/credentials.local.json`（gitignore） |
| `--mode=auto` | 有 `designs/v0/*/page.logic.md` → page；否则 logic |
| `--regression` | 默认推荐：先历史 `tests/accept` 再增量 |
| `--fix-inline` | 三模式之一：inline 修产品代码（触发与白名单见 Phase 6） |
| `--no-fix` | 三模式之一：只要报告 |
| `--batch-size` | 单会话最多完成页数，默认 5 |

## 真源

1. `designs/v0/<pageId>/page.logic.md`（SSOT，ingest 产物）  
2. 可选 `test-cases.md`（对齐 T*↔C*）  
3. `_pages.md`；`.ai/product/` 有则用  

写案例**不强制**全量 `search_arch`；接口类案例执行时按需点查。

## 验证码

旁路 → `--captcha` → `--interactive-captcha` → 登录 BLOCKED。禁止破解。

---

## 全量必验点（RP）— 机制强约束

从 page.logic **枚举**写入 `.apt/accept/pages/<pageId>/required-points.json`（后沉淀到 `tests/accept/<pageId>/`）：

| kind | 规则 |
|------|------|
| `view_load` | 主视图/列表（含空态若有） |
| `action` | 每一个主操作 |
| `validation` | §校验每一条 |
| `state` | 每一个关键状态 |
| `dropdown` | 每一个下拉/选择器/级联/选项数据源 |
| `upload` | 每一个上传/附件/导入 |
| `other` | logic 其它可观察验收句 |

**每一条 RP = 恰好一条独立案例 C-***，一对一。下拉/上传与其它 kind **同一门禁**。

### 禁止（偷懒）

- 无 `required-points.json` 就开跑  
- 一条案例勾多个 RP；「其余同理」「关键路径已覆盖」  
- 只靠 Skill 文案自觉、不跑 `accept-gate`  
- 先宣布 PASS 再补案例  
- 静默 SKIP 任一 RP（环境阻塞整页 BLOCKED，不得装过）

### 案例生成规则

- **禁止「写操作 + 固定短 sleep + 断言」**：写后必须 `waitForSelector('.alert,.toast,[data-role=msg]')` 或 `waitForURL`；断言文案前确认元素可见。  
- **案例排序**：dismiss/只读案例先于消耗态案例；或消耗态案例自备夹具（先 reset 再造数）。  
- **blocked 标记**：无演示数据 → `blocked-no-data`；前序案例消耗 → `blocked-consumed`（gate 分流见 `templates/accept-runner/accept-gate.cjs`，不计产品 FAIL）。  
- **日期断言单源**：一律读 page.logic「依赖」节的**演示日来源**声明（默认 `FixtureAPI.TODAY`，可指后端接口/冻结值）；**禁止**脚本内写死 `TODAY=...`。

---

## 工作流

### Phase 0 — Preflight

1. `query_project_status`；失败则停。  
2. baseUrl / 凭证；Playwright 检测（页面通道需要）。

### Phase 0.5 — Preflight Probes（开跑批次前必做）

四探针，结果写 `.apt/accept/probes.json`（每项 `pass|warn|fail` + 现象 + 分类 + 建议）：

| 探针 | 判定 |
|------|------|
| 门面探针 | 任一页面 load 后，`window` 上 page.logic 声明的数据门面对象（如 `FixtureAPI`）是否 defined |
| ASCII 头探针 | 发一条带 page.logic 声明的自定义头 XHR；非 ISO-8859-1 抛错即命中 |
| 后端健康探针 | 任一 5xx 响应体含 `Unresolved compilation` / `PortInUse` / `CommunicationsException` → 判构建/环境问题 |
| 重置能力探针 | `POST /api/<domain>/reset-demo` 存在或可重复种子；两者皆无 → WARN |

- 探针脚本自身异常 → **WARN 不 FAIL**（验收不因探针工具坏而中断），报告注明「探针不可用」。  
- 重置能力 WARN → 案例生成避开消耗态依赖，**不得**用现场脏数据硬跑。  
- 任一探针 fail → 整批 **BLOCKED(env)**：不生成页面 FAIL 案例；报告单列「环境阻塞」节；子 Agent 只处理 probe-pass 页；gate 不计入产品失败数。

### Phase 1 — Discover + 队列

枚举页/AC → `.apt/accept/queue.json`。主 Agent 只留指针。

### Phase 2 — 回归（默认）

跑 `tests/accept/*/accept.mjs`（或历史脚本）；FAIL → REGRESSION，Overall 不得 PASS。修复走 Phase 6（除非 `--no-fix`）。

### Phase 3 — 单页：RP → 案例 → 勾选 → gate

**调度规则（按页分类）：**

- page.logic 含 POST/PUT/表单提交/状态迁移 → **写路径页**：强制**串行** + 页间重置演示数据。  
- list/board/loading/empty/forbidden 类 → **读路径页**：可并行（batch 语义保留，抗上下文爆炸）。  
- 写路径页间重置优先走重置能力探针发现的 reset-demo / 种子；无该能力则消耗态案例自备夹具（先 reset 再造数）。  
- `resume.json` 含 `demoState` 节（关键实体状态 + 未关闭单 id）；续跑批次先按快照恢复再执行。

对每一页（子 Agent，全新上下文）：

1. 读 `page.logic.md` → 写 **`required-points.json`**（全量 RP）。  
2. 写 **`accept-cases.md`**，每 RP 绑定一个 `C-*`；同步初始 **`progress.json`**（皆 pending）。  
3. **无 points 文件 → 禁止**浏览器步骤。  
4. 按 RP/C 顺序执行；每完一条立即：勾选 `[x]`/`[!]` + 更新 `progress.json`。  
5. 页结束前**必须**执行：

```
node <aptHome或项目>/templates/accept-runner/accept-gate.cjs \
  --points .apt/accept/pages/<pageId>/required-points.json \
  --progress .apt/accept/pages/<pageId>/progress.json
```

exit ≠ 0 → **不得**标该页 done。  
6. 达 `--batch-size` → `resume.json` 续跑。

### Phase 4 — 沉淀

PASS 的页/案例沉淀到 `tests/accept/<pageId>/`（points、cases、progress 快照、accept.mjs）；只增不删旧；登记 `_manifest.json`。

### Phase 5 — 终稿报告（强制）

必须写 `.apt/accept/ACCEPTANCE-REPORT.md`（可另存 `docs/apt/accept/`），章节缺一 Overall 不得 PASS；**同时必须**写机读 SSOT `.apt/accept/acceptance-report.json`（N3：下游机读不解析 md 自然语言，与报告 Overall 必须一致）：

```json
{
  "overall": "PASS",
  "date": "2026-08-24",
  "points": { "total": 12, "passed": 12, "failed": 0, "blocked": 0 }
}
```

（`overall` 只许 `"PASS" | "FAIL" | "BLOCKED"`；`points` 按 RP 覆盖表统计，`blocked` 为环境阻塞项（`blocked-no-data`/`blocked-consumed`/probe fail，不计产品 FAIL）。）

1. 范围与环境  
2. 页面结果表  
3. **全量 RP 覆盖表**（page × rpId × kind × caseId × 状态）  
4. gate 失败 / 未覆盖项  
5. **环境阻塞**（探针 fail 明细：现象 + 分类 + 建议）  
6. **未覆盖清单**（`blocked-no-data` / `blocked-consumed`，不计产品 FAIL）  
7. 缺陷与 feature 修复队列  
8. 各页 `accept-gate` exit 汇总  

报告只聚合磁盘上的 points+progress，禁止凭印象写。

**Overall PASS 仅当：** 回归通过（若启用）∧ 当次各页 gate exit 0 ∧ 有完整 ACCEPTANCE-REPORT ∧（Fix 后相关 RP 已绿，或 `--no-fix` 且明确未修）。

### Phase 6 — Fix 三模式

| 模式 | 触发 | 行为 |
|------|------|------|
| `accept-feature`（默认） | 无口令 | 现 behavior：派 `/feature`，禁止 inline |
| `accept-fix-inline` | 用户原文「先修再重验」或 `--fix-inline` | inline 修产品代码（限 `frontend/`、`backend/` 与 connect 产物路径白名单），修后**串行**重跑该页案例 + gate；最多 2 轮；每笔修改记入 `fix-queue.json` |
| `--no-fix` | 旗标 | 只出报告（不变） |

1. 收集 `[!]` / REGRESSION → `.apt/accept/fix-queue.json`（inline 模式每笔修改同样记入）。  
2. 按页/slug 生成修复 spec（含 RP id、复现、page.logic 锚点，`source: apt-accept`）。  
3. **风险分级**（feature 模式，与现网一致）：low → `auto_approved` 并继续；high → 等人批。  
4. ENV.md 按模式生成（模板 `templates/accept-runner/ENV.md.example`）；inline 模式子 Agent 说明不写死「禁止改 frontend/backend」，改为白名单路径。  
5. 越权路径（白名单外）→ gate 前置检查拒绝并回退 feature 模式。  
6. 修后重跑该页案例 + `accept-gate`；仍失败最多再 2 轮，否则 BLOCKED。

---

## 上下文防爆

磁盘队列 / 一页一子 Agent / 只回短摘要 / batch 续跑；写路径页**串行**、读路径页可并行（Phase 3）。禁止主会话吞全站 logic。

## 约束

- 不替代 `/verify`  
- 不硬依赖外部 QA Skill  
- 密钥不入库  
- **强要求靠 required-points + accept-gate + 报告，不是提示词**  
- 修复三模式见 Phase 6；`--no-fix` 只出报告
