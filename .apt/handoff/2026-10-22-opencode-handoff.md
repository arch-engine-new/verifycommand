# 交接：S2.5/S3/S4 已完成，F-10（S5）前置分叉待决策（OpenCode 会话续）

日期：2026-10-22 10:05（UTC+8）。全程简体中文。承接 `.apt/handoff/2026-10-21-opencode-handoff.md`。

## 1. 现在到哪了

| 项 | 状态 |
|----|------|
| F-6 S2.5 多支付主体 | done（backend `0947833`+`fd5cac2` 前批完成，主仓 `849a75b`，verify PASS） |
| F-8 S3 交易核心 | done（backend `39f567c→0990c65→451c5b5→3612712`，383 测试绿，verify PASS，主仓 `cef28ae`/`8dd1a97`） |
| F-9 S4 可靠性闭环 | done（backend `61faa5c→263870b→148f21d`，463 测试绿，verify PASS，E2E 过含字典 V20261022_1，主仓 `4bf0592`） |
| F-10 S5 操作后台 | **已领取（running），前置步骤 F-10:PB-1 blocked**——见 §2 |
| 批量锁 | epoch 3，holder=batch-mcp（本会话）。会话终止后若失联 → `batch_recover`（stale 机械判定）后 `--continue` |

## 2. F-10 的前置分叉（需用户定夺）

armed 判定成立（`designs/v0/_pages.md` 存在；`.apt/create/armed.json` 无）。PM 变更（S2.5 新增「支付主体」页 + merchants 弹窗子商户映射）规定须走标准产物增量，但 `$apt-create --refine` 硬前提 `docs/prd/*.md` **不存在**（PRD 真源在 `paycenter/01-…PRD.md`、`paycenter/20-…设计.md`，`_pages.md` 头部有指认）。三个入口：

- **A. 补齐前提走正路（推荐）**：把 01/20（及 21 原型说明）复制/链入 `docs/prd/`，再 `$apt-create --refine`（changePages=`pay-subject`(新)+`merchants`），产出标准增量（新页 page.logic+manifest、_pages.md 变更行 approved=no）。
- **B. PM 工具直产**：`generate_page_logic`（新页）+ `reconcile_page_logic`（merchants 修订）+ 手改 `_pages.md` 两行（approved=no）——绕开 create 编排，产物同形，但偏离 armed 条文字面。
- **C. `$apt-ingest`**：现原型 HTML 无主体页，需先补原型——不建议。

分叉定了之后 F-10 链：`plan_from_spec`（spec 已含 S2.5 修订 R14）→ `implement_plan`（/paycenter/admin/** API + jeecgboot-vue3 8 页，禁把原型 HTML 当交付）→ `$apt-frontend-connect` → `/verify` → `finish_feature` → `batch_complete_slice(F-10)`。**不要跑 /apt-accept**（等用户提供银联商户号/子商户号，届时另行触发）。

## 3. 收口清单（F-10 之后）
1. 全部非泊车切片终态 → playbook-gate（`node C:\Users\weilt\.apt\templates\goal-runner\playbook-gate.cjs --state .apt/goal/playbook-state.json --goal .apt/goal.md`）exit 0 → DELIVERY-SUMMARY → `batch_lock_release`（loopDone 后自由释放，**不再需要 force**）。
2. 泊车行 F-3/F-4/F-5/F-7 为历史簿记（实际工作由 F-8/F-9/F-10 承接），留档即可；批终态后可 `batch_archive`。
3. 主仓提交沿用窄路径 add（`.apt/batch .apt/goal .apt/verify .apt/schema docs backend`），禁 `add -A`；backend 禁 push。

## 4. 环境与工具备忘（本会话实测）
- MCP：项目 `.opencode/opencode.json` 已改 **V2 形态**（`mcp.servers` + `timeout.startup:60000`）。会话内 catalog 偶发掉线/引擎偶发挂起：`Get-Process node` 找挂死 server（命令行含 `.apt\mcp-server`）kill 后重连即恢复（冷启 8–33s，偶发 >40s 属引擎不稳定，重试即可）。
- 兜底通道：`node %TEMP%\opencode\mcp-call.mjs <tool> <argsFile|{}>`，配 `$env:MCP_CALL_OUT=<outFile>` **直写 UTF8**（PowerShell 管道会把中文输出 GBK 乱码）。批操作（complete_slice/next_slice/lock_release）都可走它。
- 全量测试：`cmd /c "mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test > x.log 2>&1"` 取真 exit code；DB 用例前 dot-source `scripts/paycenter/run-local.ps1 -EnvOnly`。当前应用 pid 6920（新 jar 含 S4）在跑。
- 质量门禁：`check_code_quality` 全仓 8000+ 条全是 JeecgBoot 上游框架码；判定一律过 `.apt/orchestration/quality-filter.cjs <out> paycenter`（现状 0）。

## 5. 已知缺陷追加（接上表 §7）
8. `batch_complete_slice` 的 `tokenUsage` 传 `null` 被 schema 拒（Expected string）——省略该字段即可。
9. MCP server 引擎（arch-engine）import 偶发无限挂起，杀掉僵尸 server 进程后自愈；license heartbeat/自防御代码疑似与并发 spawn 互踩。
10. MyBatis L1 缓存在并发轮询断言中读到旧值——用裸 SQL 计数；Mockito 共享桩非线程安全——手写计数 stub（组 B/C 有先例）。
11. `paycenter.alert` webhook 未配置时降级分支先于去重/限流返回（设计行为，非 bug，E2E 已注记）。

## 6. 安全红线（不变）
禁读/回显 `.apt/local/*`、`.ai/arch/arch.secrets.json`；凭证只报存在性/长度；禁删 `.ai/arch/`、禁 `git clean -x/-fdx`、禁 force push；**不得自行确认任何用户门禁**。
