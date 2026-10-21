# 交接：首筑支付中心批量执行（Cursor → OpenCode）

日期：2026-10-21 14:45（UTC+8）。全程用简体中文回复。

## 1. 现在到哪了

| 项 | 状态 |
|----|------|
| F-1 S1 工程骨架 | done（主仓 769d772，backend 7792ac9） |
| F-2 S2 银联通道 | done（主仓 `e56babd`，backend `c75ed7d`，第 3 轮 `/verify` PASS） |
| inbox #1 S2.5 多支付主体 | 已收敛、用户已确认，**必须在 F-3 之前执行**；记录在 `.apt/batch/pending-batch.md` |
| F-3 S3 交易核心 / F-4 S4 可靠性 / F-5 S5 操作后台 | pending |

批量锁仍被持有（holder `batch-mcp`），批次未结束。

## 2. F-2 收尾（已完成，仅供参考）

F-2 已于主仓 `e56babd` 收尾：闭环、playbook-state、`batch_complete_slice` 均已完成；批量锁未释放，也没有取下一片。下面是当时的检查与补做步骤，留作参考：

```powershell
git log --oneline -3          # 看有没有 "F-2 S2 银联通道完成" 的提交
git status --short .apt docs .ai/product
```

如果还没有 F-2 完成提交，按顺序补做：

1. finish_feature 闭环：MCP `audit_arch_changes` → 对 modified/new 调 `refresh_asset`，deleted 调 `remove_asset`。
2. 把 `.apt/goal/playbook-state.json` 中 F-2 的 steps 标为 done。
3. MCP `batch_complete_slice` 把 F-2 所在片标 done（证据：`.apt/verify/latest.md`，backend `c75ed7d`）。被拒时先试 `batch_recover`；因工作区脏被拒时先提交再试。
4. 主仓提交，**只 add 这些路径，不要 `git add -A`**：
   `git add .apt/batch .apt/goal .apt/verify .apt/arch-review .ai/product docs backend .apt/handoff`
   提交信息：`feat(paycenter): F-2 S2 银联通道完成（backend c75ed7d，verify PASS）`

本轮已改的用户决策文件（用户已授权）：`.apt/arch-review/product-arch-answers.json` 改为顶层数组，并在 dict_catalog 项加了 `note`，豁免 `jeecg-module-demo` 的 mock JSON。

## 3. 第二件事：S2.5 多支付主体（在 F-3 之前）

用户已确认的设计：

- 新表 `pay_subject`（支付主体 = 一个主商户号）。字段：
  - 标识：subject_code（唯一）、subject_name、scene（字典：APP / WECHAT_MP / MINI_PROGRAM / H5）、channel_code
  - 主商户：main_mchnt_no、main_term_no
  - 凭证（每主体一套，AES-GCM 加密）：app_id、app_key_enc、comm_key_enc、msg_src、msg_src_id、notify_sign_type、key_version
  - 其他：wx_sub_appid、status、审计字段、del_flag
- 新表 `pay_merchant_subject`：merchant_id、subject_id、project_id（可空，表示商户默认）、sub_mchnt_no、sub_term_no、status；唯一键 (merchant_id, subject_id, project_id)。
- 下线字段：`pay_merchant.unionpay_mchnt_no/unionpay_term_no/wx_sub_appid`，以及 `pay_merchant_project.unionpay_mchnt_no/term_no`。这些表都是 0 行。
- `pay_channel_config` 降为环境级：只保留网关地址、备用地址、超时、限流；凭证列迁到 `pay_subject`。
- `pay_app` 增加 `subject_id`：一个应用绑定一个主体，下单接口不加 subjectCode 参数。`pay_order`、`pay_refund_order` 增加 `subject_id` 快照。
- S2 适配：
  - 配置按 subjectId 读取。
  - 通知验签先按订单号查到主体，查不到再按订单号前 4 位来源编号匹配主体。
  - 单号生成器的来源编号改为取主体的 msg_src_id。
- 按新模型修订 S3/S4/S5 的 spec：
  - S3 下单解析顺序：app → 主体 → 子商户号（小区优先），缺映射时返回明确错误码。
  - S5 增加“支付主体”管理页，商户弹窗里加子商户号映射；凭证只显示是否已配置，可重置，不回显。

流程：先把 inbox #1 入队并排在 F-3 前（`batch_enqueue` 用 mergeInboxIds=[1]，或由执行体片间自取）→ 跑 `$apt-schema-design` → **到 `$apt-schema-apply` 门禁停下**，需要用户原话「评审通过，执行 apply」或「表设计完成」→ 修订 spec → `plan_from_spec` → `implement_plan` → `/verify` → `finish_feature`。

## 4. 之后

依次做 F-3 → F-4 → F-5，每片都要 `/verify` PASS 后才能 `batch_complete_slice`。S3–S5 的 plan 生成后直接实现，用户已预授权，不用逐个确认。**不要跑 `/apt-accept`**：要等用户提供商户号、子商户号等参数。

## 5. 环境

- `backend/` 是独立嵌套 git 仓（JeecgBoot 官方源码）。代码提交到它的 `paycenter` 分支，再在主仓提交 gitlink。**禁止 push backend 到 origin。**
- 后端：JeecgBoot 3.9.5、Java 17、Maven（`E:\maven`，可 `-o` 离线）。
  - 模块：`backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter`
  - 测试：`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test`
- 前端已存在 `backend/jeecgboot-vue3`，不要再克隆。
- Docker：`paycenter-mysql`（端口 3307，库 `jeecg-boot`）和 `redis`（6379）。
  - 执行 SQL：`docker exec paycenter-mysql sh /tmp/m.sh -N -D jeecg-boot -e "<sql>"`
  - 判断 Flyway 是否成功，以 `flyway_schema_history` 为准（FlywayConfig 会吞掉异常）。
- 本地启动：`scripts/paycenter/run-local.ps1`。
- 运行超过 1 分钟的命令要放后台并把输出重定向到日志，否则在 Cursor 里容易断连。

## 6. 安全硬约束

- 禁止读取或回显 `.apt/local/*` 的值和 `.ai/arch/arch.secrets.json`。
- 任何密钥、银联凭证（商户号、终端号、AppId、AppKey、通讯密钥、subAppId、来源编号）只能报告“是否存在 / 长度”，不得进入命令参数、日志、提交或聊天。
- 禁止删除或清空 `.ai/arch/`；禁止 `git clean -x/-fdx`；禁止 force push。
- 不得自行确认任何用户门禁。

## 7. 已知 APT 缺陷（不要被带偏）

1. answers 文件格式不对时会被静默读成“未回答”。已修正格式；`query_project_status` 若仍报 arch_review，以队列为准。
2. 产品对齐检查是逐层短路的，一轮只暴露一个问题。
3. 可疑 JSON 扫描没有排除 `target/` 和框架示例模块。
4. `batch_trigger_check` 先写台账、后验工作区是否干净，会形成循环；被拒时先提交再试。
5. `start_product_init` 增量模式报告“写入 0 页”，实际已刷新哈希。
6. `sync_arch_changes` 忽略 `.sql`；`detect_arch_gaps` 会把所有项都判为缺失。
7. Java 覆盖门禁只看主仓 git diff，看不到嵌套的 backend 仓，会报 "no java paths touched" 并跳过；以 `audit_arch_changes` 结果作为佐证。

## 8. 在 OpenCode 里怎么开始

对话第一句可以这样写：

> 读 `.apt/handoff/2026-10-21-opencode-handoff.md`，从 §3 开始继续执行 `$apt-goal --continue`；到 schema-apply 门禁停下等我确认。
