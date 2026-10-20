---
feature: paycenter
slice: S4
title: 首筑支付中心 — 可靠性闭环
Status: approved
risk: high
projectType: business
dependsOn: S1, S2, S3
redteam: user-confirmed-2026-10-20
---

# S4 可靠性闭环 — Design Spec

## 1. 目标

**Goal:** 让所有“失败”都有闭环：业务回调推送与重试、超时查单/关单、退款结果补查、状态更新冲突与异常补偿、多实例任务互斥、钉钉告警，满足一期验收“不丢单、不重复、无悬挂支付单”（`paycenter/08` §三 第 4、5 条）。

对应 08 一期 A6、C6，及 arch-review 用户追加要求：“防重复、防重放、多实例适配、回调业务系统失败、订单状态修改失败等各种失败的处理闭环”（`.ai/arch/arch-review.json` extraRequirements）。

## 2. 前置与约束
- 依赖 S3 的唯一状态写入口（`confirmPaid / markClosed / RefundService.confirmResult`）与 `pay_callback_task` 写入；依赖 S2 查询/关单/退货查询；依赖 S1 锁、Trace（`payTraceTaskDecorator`）。
- 调度：Spring `@Scheduled` + `PayRedisLock`（任务级互斥）+ 行级“领取”（条件更新），**双实例同时运行不重复处理**。不引入 xxl-job（`application-dev.yml` 中 `xxljob.enabled=false`）。
- 所有任务每轮处理有上限（默认 100 条）、可配置开关 `paycenter.jobs.<name>.enabled`。

## 3. 范围

### 3.1 业务回调推送（02 §3.6/§3.7）
- `PayCallbackDispatcher`：扫描 `pay_callback_task` 中 `status=PENDING AND next_retry_time<=now`，用条件更新领取（version + 租约字段/`next_retry_time` 推后 60s 作为租约），推送后写结果。
- 报文：PAY_SUCCESS/PAY_CLOSED 按 02 §3.6、REFUND_SUCCESS/REFUND_FAIL 按 §3.7；头 `X-Timestamp`(yyyyMMddHHmmss)、`X-Nonce`(32 位)、`X-Sign=Base64(HmacSHA256(app_secret, ts+"\n"+nonce+"\n"+body))`；app_secret 取下单应用（`pay_app`）解密。
- 成功判定：HTTP 200 且 body `{"code":"0000"}`；连接超时 3s、读超时 5s。
- 重试：失败按 1/2/4/8/16 分钟退避，共 5 次；第 5 次仍失败 → `FAILED` + 告警；记录 `retry_count/last_http_status/last_error`（截断 512）。
- 人工重推：`PayCallbackService.manualRetry(taskId, operator)` 重置为 PENDING、retry_count 归零、写 `pay_admin_log`（action=`CALLBACK_RETRY`，本切片追加该字典项）；供 S5 后台调用。
- notify_url 再校验：推送前确认域名仍在商户 `notify_domain` 白名单，否则 FAILED + 告警（防配置变更后误推）。

### 3.2 支付单兜底任务（08 C6、04 §4.2）
- **查单任务**：`status=WAIT_PAY AND next_query_time<=now`；首次在创建后 2 分钟，之后 5s/30s/60s 递进再到每 5 分钟；查询结果 PAID→`confirmPaid`，CLOSED→`markClosed`，UNKNOWN 累计 3 次 → 告警 + `manual_check=1`（继续查）。
- **超时关单任务**：`status=WAIT_PAY AND expire_time<now`：**先查单**（防止已支付被关）→ 已支付走 confirmPaid；否则调 S2 关单（尽力而为）+ `markClosed(reason=TIMEOUT)`。
- 通道异常（5001/超时）不改状态，仅推迟 next_query_time。

### 3.3 退款兜底任务（04 §6）
- `status=REFUNDING AND next_query_time<=now`：调 S2 退货查询，间隔 5s/30s/60s/5min，之后每 30 分钟；SUCCESS/FAIL → `RefundService.confirmResult`；超过 24 小时仍未明确 → `manual_check=1` + 告警（继续查）。

### 3.4 失败闭环与补偿
- **状态更新冲突**：条件更新影响 0 行 → 重读；若已是目标终态视为成功（幂等）；否则记录 WARN 并交给下一轮任务，不抛给调用方 500。
- **通知处理异常**：S2/S3 已回 `FAILED` 让银联重发；同时查单任务兜底。
- **回调任务丢失防护**：`PayCallbackReconcileJob` 每 10 分钟扫描近 24 小时终态订单/退款单缺失对应 callback_task 的，补建任务（依赖 uk 幂等）。
- **悬挂检测**：每小时统计 `WAIT_PAY` 超过 expire_time+30 分钟、`REFUNDING` 超 24 小时、`callback FAILED` 的数量，>0 发告警摘要。
- **优雅停机**：`@PreDestroy` 停止领取新任务；租约到期后其他实例可接管。

### 3.5 告警（钉钉）
- `PayAlertService`：订阅 S2/S3/S4 发布的 `PayAlertEvent`（级别、类型、业务键、摘要）；钉钉群机器人 webhook，环境变量 `PAY_ALERT_DINGTALK_WEBHOOK`、`PAY_ALERT_DINGTALK_SECRET`（加签，`timestamp+"\n"+secret` HmacSHA256 → Base64 → URL 编码）；未配置时仅写 ERROR 日志（启动 WARN 一次）。
- 去重：同 `类型+业务键` 10 分钟内只发一次（Redis SETNX）；全局每分钟最多 20 条（限流），超出合并为一条“告警风暴”摘要。
- 内容含 traceId、业务单号、环境名；**不得包含密钥、完整商户号、app_pay_request**。
- 发送失败不影响主流程（异步、吞异常、记 ERROR）。

### 3.6 非目标
对账兜底（二期）；通道主备切换（二期）；后台页面（S5，S4 只提供 Service 与查询能力）。

## 4. 需求锁定表

| Rn | 需求 | 来源 | 可判定验收 | 优先级 |
|----|------|------|-----------|--------|
| R1 | 回调推送报文与 X-Sign 签名 | 02 §3.6/§3.7 | `PayCallbackSignerTest` 用固定 secret/ts/nonce/body 断言签名；MockWebServer 收到的头与 body 符合 02 | must |
| R2 | 回调重试 1/2/4/8/16 分钟×5 → FAILED + 告警 | 02 §3.6 | 可注入时钟测试：接收方持续 500，5 次后 FAILED、告警事件 1 次；第 3 次成功则 SUCCESS 停止 | must |
| R3 | 人工重推 | 用户追加要求 | manualRetry 后 PENDING、retry_count=0、写操作日志 | must |
| R4 | 多实例不重复处理 | arch-review lock / 多实例 | 两个 Dispatcher 实例并发跑同一批 20 个任务，接收方每任务只收到 1 次 | must |
| R5 | 超时查单（2 分钟起、递进、3 次 UNKNOWN 告警） | 08 C6 | MockWebServer：PAID→confirmPaid 一次且产生回调任务；连续 UNKNOWN 3 次→告警 + manual_check=1 | must |
| R6 | 超时关单（先查单再关） | 08 C6 | 过期单查询为 PAID→不关单而 PAID；查询 WAIT→CLOSED(TIMEOUT) 且关单接口被调用 | must |
| R7 | 退款补查与 24h 人工核查 | 04 §6 | PROCESSING→SUCCESS 后退款单成功、原单 REFUNDED；超 24h→manual_check=1 + 告警 | must |
| R8 | 状态冲突幂等与补偿 | 用户追加要求 | 模拟并发：通知与查单同时确认 PAID，仅 1 次生效、无异常外抛、回调任务 1 条 | must |
| R9 | 回调任务丢失补建 | 用户追加要求 | 删除某 PAID 单的 callback_task 后，Reconcile 任务补建 1 条 | must |
| R10 | 悬挂检测摘要告警 | 08 §三.4 | 构造 1 条超时 WAIT_PAY → 摘要告警包含其单号 | must |
| R11 | 钉钉告警：加签、去重、限流、脱敏、失败不阻断 | 用户选择钉钉 | `PayDingTalkAlertTest`（MockWebServer）：签名参数正确；10 分钟内同键只发 1 次；超 20 条合并；内容不含 secret/完整商户号；webhook 500 时主流程不受影响 | must |
| R12 | 任务开关、批量上限、traceId 透传 | arch-review tracing | 关闭开关后任务不执行；单轮处理 ≤ 上限；任务日志带 traceId | must |

## 5. 开放项
- `pay_admin_log_action` 需新增 `CALLBACK_RETRY`（回调重推），在本切片以 Flyway 增量脚本追加字典项。
