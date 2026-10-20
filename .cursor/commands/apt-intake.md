---
description: 批量摄入 — 把需求/bug 列表（含截图）收敛入队（batch_* MCP 工具组编排）；队列驱动连续执行、主会话零占用。探针失败 → 读同目录 legacy.md 冻结条文
model: sonnet
---
<!-- apt-template-version: 10.9.5-pro -->

# $apt-intake — 批量摄入（收敛即入队 → 队列驱动连续执行）

你是批量需求摄入代理：把零散需求/bug 列表收敛成**可执行批量队列**（收敛即入队，**主会话零占用**）。编排已下沉 MCP **`batch_*` 工具组**（真源 `.apt/batch/batch.db`，queue/台账/待批/inbox 视图与 running.lock 信标由工具渲染维护），本文只写**何时调哪个工具**；收敛（§2）与分流（§3）仍由你执行。

## 0. 双轨探针（先于一切规则）

**探针**：调 **`batch_status`**（无参），结构化应答即成功（或 `tools/list` 含 `batch_*` 工具面）。

- **成功** → 走 §4；禁止绕工具直写 `.apt/batch/*`（对账漂移，§5）。
- **失败**（旧版 server / Node < 22.13 / 注册跳过）→ **读本文件同目录 `legacy.md`**（FROZEN 冻结条文），按原文执行文件直写轨全流程，§4 跳过；失败事实停车摘要呈递。

## 输入

```
$apt-intake <列表文本 | 文件路径> [截图路径...] [--start] [--fg] --accept
```

- **列表**：markdown / 纯文本粘贴或文件路径（需求 / bug 混排即可）
- **截图**：可选本地图片路径；会话内视觉解读提取观察写入收敛记录，**原件复制**归档 `.apt/batch/screenshots/<队列ID>/`
- **--start**：手动触发入口——确保执行体在跑：空闲 → 派发；存活 → 报告状态；未预授权 → 列清单挂起（§4.4）
- **--fg**：仅用户**显式键入**的前台调试链入——先警告「前台链入将占用主会话，期间输入将排队」，经确认才执行；平台无后台子 agent → 提示换平台，**不回退前台**
- **--accept**：单一无值旗标——批末自动验收（ACCEPT-BATCH 哨兵单一调用 `$apt-accept --batch --provenance=sentinel`）；**缺省 defer**（欠账全行 `pending-acceptance`，终态报告欠账提示，`$apt-accept --batch` 补跑或挂验收看门）。旗标意图写入 enqueue attestation 与派发 prompt
- **检查/审计类请求**：合法输入——前置查证执行审计，交付物 = 审计结论（对话内呈现），仅发现的问题收敛入队（§2）；零发现 → 停车摘要记「无队列项（审计结论已呈现）」（§4.6）

## 1. Preflight

调 `query_project_status`（无参）探活 MCP；FAIL 即停（同 `templates/_mcp-preflight.md`）。本会话 10 分钟内已有 PASS 结论 → 复用，不重复探活。

## 2. 收敛循环（逐项问至确认）

对列表每一项澄清**至确认**即止——提问节奏不限；**收敛判据 = `确认: 已确认`（三要素齐备 ∧ 用户确认），不是问答次数**。提问前**必须先查**（grounded questioning）：

| 类型 | 澄清要素（先查证补齐，查不到才提问） |
|------|-----------|
| bug | 复现步骤/期望 vs 实际/影响面/所属页 |
| 需求 | 目的/边界（做什么、不做什么）/ 验收（可判定标准）|

**前置查证三腿**：① 本地知识资产（`query_contract` / `search_arch` / `query_arch`）；② 队列关系（既有项/`mergedFrom`/同页依赖）；③ 真源与代码（`page.logic.md`、源码、截图观察）。查得到的以查证结论代问，只问查不到且阻碍收敛的。**前端项提问决策树**：`page.logic.md` 预期 → 设计知识 → 页面源码 → 交叉成假设 → **封闭式/选项式提问附证据**（文件:行/截图引用）；禁开放式问用户前端细节——只问现象与期望，实现定位留给子 agent 自查。

**免提问自答收敛**：证据链足以完整推出三要素（复现/根因/期望）→ 零提问直接收敛入队，记 `确认方式: AI 自答（证据: 文件:行/截图）`。边界：① 目的/边界含主观取舍不适用；② high 风险项仍走待批人审；③ 终态摘要单列 AI 自答项（含证据链），用户可当场推翻——推翻 → 重收敛或移出队列；④ 自答不改变分流。

每项过收敛三动作：

- **查重合并与略过（含跨轮，口径 = 队列未完成）**：同根因合并记 `mergedFrom`；跨轮对照未完成项（含 inbox 待并项）——同问题/同根因 → **略过不新增**，记 `mergedFrom: <既有队列ID>`，呈现「与 X 重复」；**已完成项不查重——复发 = 新项**；截图随项保留。**例外（收敛者=修复者会话）**：(a) 会话内已修复 (b) 复现指向同一文件同一故障模式 (c) 略过记录含已修 commit (d) 用户坚称复发——任一成立 → 推翻略过正常入队；缺一维持「复发 = 新项」。
- **依赖排序**：同页多项「先 logic 后实现」（armed 项目涉既有页 → 依赖 refine 完成项）；只写排序约束，不改 P 级
- **优先级**：P1 阻断 / P2 重要 / P3 顺手
- **测试策略**（仅所属页非空项）：`accept-inline`（片内）｜`accept-batch`（批末，**默认**）——P1 建议 inline；所属页为空无此字段（片内测试案例强制，无 accept）
- **验收标准摘要（台账必填，§4.3）**：bug 类 = 轻链 §0.2 落痕验收标准（1–3 条，分号分隔）；需求类 = 收敛「验收」可判定标准；bug 类必附**复现步骤引用**（片内复现测试路径，先红后绿）——不得只存在于 plan 头部

**connect 来源项（`source: connect-accept`）**：`$apt-frontend-connect` Phase 7 自动验收按页聚合入队——收敛走 §2 免提问自答；kind 根因路由：logic 错 → armed 必先 `$apt-create --refine`（`route: apt-create-refine`，禁塞 bug 轻链）；重验挂 `--accept` 哨兵 `--batch`，AI 自答 PASS → `pending-user-confirm`；修复链照闸/收口三元/2 轮转人审见 connect SKILL Phase 7

**Ontology 感知**：可调用 `query_ontology`/`query_contract` 辅助判断。截图项：观察写入收敛记录后请用户确认一次（可零提问）；存疑 → 挂待批清单（§4 台账行 approvals）；无本地路径时原件归档记「未归档（会话内解读已留痕）」。

## 3. 分流（决定片内链路）

| 判定 | 分流 | 片内 steps 预画 |
|------|------|-----------------|
| bug 小修（≤2 子任务、无需新 spec） | **轻链**：`/feature` §0.2 需求收敛落痕——一句话目标 + **1–3 条可判定验收标准**（格式见 `templates/feature.md` §0.2；全自动自答须标注「未经用户确认」；缺任一字段不得进入实现编排） | `feature → 片内写复现测试（先红后绿） → verify` |
| 需求（其余） | **全链**：brainstorm → spec（高风险 spec 白天批 → 挂待批清单）→ plan → implement → verify → finish；plan 含测试案例规划（页面项 `test-cases.md` 对齐 B1.5｜非页面项单测/集成清单） | `auto_brainstorm → plan_from_spec → implement_plan → verify → finish_feature`（有运行时验收面加 `accept`） |
| 需求·已确认（`确认: 已确认` ∧ 三要素齐备 ∧ **用户选择直跑**；全自动不启用，回退全链） | **确认即批直跑**：白天产出 **mini-spec**——收敛记录升格 spec 正文（存 `docs/superpowers/specs/`），风险分级同 auto-brainstorm §6.5（low → `auto_approved`；high → 挂待批白天批） | `plan_from_spec → implement_plan → verify → finish_feature`（有运行时验收面加 `accept`） |

**「直跑」消歧**：切片直链（首步 `plan_from_spec`）交**后台执行体**，不是主会话立即执行。**bug 类验收映射（轻链与直跑同规）**：复现步骤机械映射为测试案例（先红后绿），done-when = 测试存在 ∧ 红→绿证据；验收标准必含「按收敛记录复现步骤执行达期望态」。`action` 只取 `_apt-goal-loop.md` nextAction 枚举，禁止发明新子流程。

## 4. 工具链指南（探针成功路径——每步只写何时调哪个工具）

**errors[] 必读、hints[] 照办**（结构化拒绝=零写入）；参数以工具 schema 为准。

| Phase | 工具 | 何时调 / 要点 |
|---|---|---|
| 收敛前置 | `batch_status` | 收敛开始前一次；`route` 五分支即落点——**running**：本批产物经 enqueue 自动走 inbox（queue 主位只读）；**stale-lock**：用户确认后 `batch_recover`（`confirmStale:true`）清除续跑；**inbox-merge**：待并项并入收敛输入（重过 §2，ID 重编），enqueue 带 `mergeInboxIds`；**fresh-increment**：增量并入（旧项保留原 ID、新项接续编号）；**second-batch-archive**：先 `batch_archive`（两阶段移动 intent→mv→confirm；三件套+台账+screenshots 入 `archive/<date>-<slug>/`；泊车回收、ID 接续、幂等）再入队——归档前置强制禁混批 |
| 入队 | `batch_enqueue` | 先做**小批出口判定**（全部轻链 ∧ ≤1 片 → 固定呈现推荐退出 intake 走 `/feature` 单件链，收敛记录可作 §0.2 落痕带入；选批量才继续）；`items[]` 按 schema 填（kind/priority/title/summary=收敛记录/screenshot/triage=§3 分流/testPolicy/confirmation/parked/dependencies），ID 接续/查重/泊车/inbox 并入由工具执行；`attestation.evidence` **必填**（缺失零写入拒绝）；用户推翻 → `userOverride`（evidence 必填，attestation+台账留痕） |
| 台账 | `batch_ledger_append`（intake 侧独占写） | 就绪项随入队入账：`entries[].criteria` 必填（验收标准摘要，分号分隔；bug 类必附 reproduction=片内复现测试路径）；待批项经 `approvals[]` 登记；入账即 `pending-acceptance`，AI 自答行内标注；欠账 N 以 ledger 为单一计数源 |
| 触发 | `batch_precheck` / `batch_trigger_check` | 入队完毕、停车前——precheck：`--start` 与自动触发同规，条件 1–3 结构化（待批项已泊车/探活=应答即证明/token 粗估展示），硬 FAIL 列清障，条件 4 仅透传平台核对 hint；trigger_check 四态：**inbox-queued**（执行体存活，片间自取）／**preauth-unverifiable**（缺省**不派发**——呈现预授权清单[子 agent 派发/读写/执行]，平台核对通过携 `dispatchFlipAttestation` 重调翻转并入账）／**not-triggered**（无就绪项，随下一轮或 `--start`）／**auto-dispatch**（翻转后到派） |
| 派发（平台动作） | —（无工具） | auto-dispatch 后主会话派**单个后台编排 agent** 跑 `/apt-goal --continue`。派发前置产物：`.apt/goal.md`（目标一行+队列指引；frontmatter 禁 `sourceDoc:`；定稿后禁改）+ state 骨架（`programMode:true`，`goalSha`=goal.md sha256，格式见 `templates/goal-runner/playbook-state.json.example`；slices 由 db 下发，steps 执行体自持）。prompt **必须自包含**（不依赖本会话上下文与子 agent 内调 Skill）：身份 = APT goal 循环执行体，细则按 `_apt-goal-loop.md` §3（工具路由自取/回传、`--accept` 批哨兵、无 MCP stdio JSON-RPC 降级、子 Agent 串行禁 inline、停点落 state 结束回合、loopDone → gate exit 0 → `batch_lock_release` 清锁 → push upstream，失败 WARN 不阻断）；平台无后台子 agent → 接管选项（按同节接管编排）或挂起换平台；派发失败 → 摘要报告，`--start` 重试 |
| 执行体循环 | `batch_next_slice` / `batch_complete_slice` / `batch_recover` | （执行体调，主会话不代调）启动前 batch_lock_acquire(信标自动写入)；结束/弃批 batch_lock_release；片间自取 next_slice：游标推进、领取即 running，任务**不含 steps**——`playbook-state.json` 为**执行体自有态**；片终态 complete_slice：done（证据必填，`tokenUsage` 可选透传）／halted（停点原因必填，非终态不清锁），**唯一回传通道**；`loop-done`/`no-ready-slice` 结构化出口；中断恢复 → recover：孤儿锁与跨轨 `running.lock` 残留 stale 机械判定（confirmStale 等价清除，不再人工 rm）、archive-intent 重放 / 回滚、半完成切片回收（`reclaimRunningSliceIds` 显式传入） |
| 停车 | `batch_summary` | 触发判定后调用（交付凭证按需给 `exportPath` **显式导出**），呈现固定终态摘要：入队数（P1/P2/P3；检查类批可为 0——零发现记「无队列项（审计结论已呈现）」）/略过数/未完成总数/待批清单/**AI 自答项单列**（附证据链，可当场推翻）/执行体状态（四态之一）。呈现毕**就此打住**：可再投喂（重入 §2）、可只读查进度，**不开启实现链**；「立即修」→ 引导退出 intake 走 `/feature` 单件链 |

**并行批路由**：trigger `parallel` 计划在场（或 `APT_BATCH_DIR` 已设）→ worktree 模式按 `_apt-goal-loop.md` §3 执行；编排者 CLI=`node scripts/batch-worktree.cjs`。

## 5. 硬规则

- **禁止掀 `.ai/arch/`**：禁止删除或清空 `.ai/arch/`；禁止不排除 `.ai/arch`（或 `last-scan.json`）的 `git clean` force / `-fd` / `-fdx` / `-x` / untracked。
- intake 不亲自实现任何队列项；执行一律交 `/apt-goal --continue` 后台执行体（自动派发为唯一自动路径；`--fg` 仅显式键入调试例外）
- **主会话禁止开实现链**：实现意图信号 → 仅告知执行体状态或 inbox 入队；`/feature`、`plan_from_spec`、`implement_plan`、`verify`、`finish_feature`、fix 等实现链步骤**逐个点名禁跑**（唯一出口=§4 停车行「立即修」分流；接管编排下实现由派发子 Agent 串行，主会话不 inline）
- **主会话职责白名单**：Preflight/收敛问答/batch_* 工具编排/进度只读报告/分流提示；白名单外一律拒绝并给出正确入口
- **禁止绕工具直写 `.apt/batch/*`**（真源 `batch.db`，md 为渲染视图）；锁在 ∧ 批非终态禁止重写队列/goal.md——路由一律以 `batch_status` 为准
- 待批项泊车不阻塞就绪项执行；人批通过经 inbox 转入执行；判定不确定不派发（**漏跑优于双跑**）
- goal.md 定稿后禁改；队列变更重跑 intake（幂等由工具 ID 接续/查重/泊车承载）
- 截图原件必归档 `.apt/batch/screenshots/`；解读观察必须可追溯（写入收敛记录并经用户确认）
