# 首筑支付中心 S4 可靠性闭环 Implementation Plan

> **Spec:** `docs/superpowers/specs/2026-10-20-paycenter-s4-reliability-design.md`（已按 S2.5 修订 R13）
> **Command:** `/plan-from-spec`
> **Status:** approved（批量模式预授权）
> **DDL：** 仅一项字典增量 `V20261022_1__paycenter_s4_dict.sql`（`pay_admin_log_action` 追加 `CALLBACK_RETRY`，幂等 ON DUPLICATE 写法）。不改表结构。

**Goal:** 所有失败有闭环：回调推送重试→FAILED+告警+人工重推；超时查单/关单；退款补查 24h 转人工；冲突幂等；回调任务补建；悬挂检测；钉钉告警；@Scheduled+Redis 锁+行级领取双实例不重复（08 A6、C6）。

**Architecture:** `jobs` 包（Dispatcher/QueryJob/CloseJob/RefundQueryJob/ReconcileJob/HangingJob，@Scheduled+@Lazy(false)+`paycenter.jobs.<name>.enabled`+每轮上限 100）；`PayCallbackDispatcher` 条件更新领取（租约：version+next_retry_time 推后 60s）→X-Sign 推送→1/2/4/8/16min×5→FAILED+告警；`PayAlertService` 订阅 `PayAlertEvent`→钉钉（加签/去重 SETNX 10min/限流 20/min 合并风暴摘要/脱敏/异步吞错），未配置 webhook 时 ERROR 日志降级。**复用 S3 唯一状态写入口与组 C `convergeRefunding`，不另开 UPDATE。**

---

## Part 1 — 技术方案

### 1.1 范围与约束
**包含** spec R1–R13。**非目标：** 对账/主备切换/后台页面（二期/S5）。

**硬约束：**
- 调度：`@Scheduled`+`PayRedisLock` 任务级互斥+行级条件更新领取；双实例测试必须实证不重复。不引 xxl-job。
- 回调报文 02 §3.6/§3.7 冻结：头 `X-Timestamp`(yyyyMMddHHmmss)/`X-Nonce`(32)/`X-Sign=Base64(HmacSHA256(app_secret, ts+"\n"+nonce+"\n"+body))`；成功=HTTP200+body code="0000"；超时 connect3s/read5s；notify_url 推送前复查白名单否则 FAILED+告警。
- 查单递进 2min→5s/30s/60s→5min（UNKNOWN 3 次告警+manual_check 继续）；超时关单**先查后关**；退款补查 5s/30s/60s/5min→30min，>24h manual_check+告警；R13：一切通道调用按单 `subject_id` 快照（query/close/refundQuery 的 subjectId 从订单取）。
- S3 遗留接缝（组 C/D 报告确认）：`pay_order.next_query_time` 创建时未置位→组 B 在下单落库处初始化为 create+2min（增量语义，不动七步校验）；退款 `query_round/next_query_time` 同理由补查 job 自管；`confirmResult(refundOrderId,targetStatus,channelResult,source)`、`convergeRefunding(refundOrder)` 直接复用。
- 告警脱敏：无密钥/完整商户号/app_pay_request；含 traceId/业务单号/环境。webhook/secret 仅环境变量 `PAY_ALERT_DINGTALK_WEBHOOK/SECRET`。
- 优雅停机 @PreDestroy 停领取，租约接管；测试不依赖真实钉钉/Mock 回调端点用 JDK HttpServer。
- Maven -o、PowerShell 无 &&、Javadoc/@author paycenter/函数≤80/参数≤5/禁空 catch/不加依赖。

### 1.2 设计寻址：N/A（无 UI）。
### 1.3 依赖寻址表（关键）
| 依赖 | 来源 | 摘要 |
|---|---|---|
| confirmPaid/markClosed/confirmResult/convergeRefunding | 源码 S3 | 唯一写入口（组 C 签名报告） |
| PayAlertEvent/PayAlertType | 源码 S2 | 现 5 类型；S4 可扩枚举值（非契约面） |
| PayRedisLock/PayRedisKeys/PayRateLimiter/PayTraceUtil | S1 | 键新者加 PayRedisKeys；job 线程 MDC traceId 透传 |
| PayApp app_secret 解密/PayCryptoService | S1/S3 | 推送签名取下单应用 |
| pay_callback_task/PayCallbackTaskMapper | S1 | uk(biz_type,biz_id,event)、idx(status,next_retry_time) |
| PayAdminLog 服务 | S1 | manualRetry 写 CALLBACK_RETRY（字典增量 V20261022_1） |
| UnionPayMockServer/PayTradeTestKit | S2/S3 | 回调端点/通道 mock；测试装配沿用（effective=now−5min 约定勿改） |

### 1.4 契约：无新对外 HTTP 契约；manualRetry Service 签名供 S5（Javadoc 注明）。
### 1.5 测试策略
双实例并发（两个 Dispatcher 实例同跑 20 任务→每任务收到 1 次）；重试时间线注入时钟（1/2/4/8/16→FAILED+告警 1 次）；notify_url 白名单撤销→FAILED；查单 PAID/CLOSED/UNKNOWN×3；先查后关（PAID 不被关）；退款 24h→manual_check；reconcile 补建（删任务→补 1 条，uk 幂等）；告警：签名正确/去重 10min/限流合并/脱敏断言（ListAppender+Mock HttpServer）/webhook 500 不阻断；job enabled=false 不执行；单轮≤上限；traceId 透传断言。

### 1.6 需求锁定表：spec §4 R1–R13 为真源。

---

## Part 2 — 任务清单（组内逐 Task Verify；每组一 commit）

**组 A 回调推送（R1/R2/R3/R4）**：T1 Dispatcher 领取+租约+推送+报文 X-Sign（PayCallbackSigner 独立可测）+成功判定+结果写回；T2 退避 1/2/4/8/16×5→FAILED+告警+retry_count/last_*（截断 512）；T3 notify_url 白名单复查；T4 manualRetry（重置+pay_admin_log CALLBACK_RETRY+字典 Flyway V20261022_1）；T5 双实例不重复测试+组 A 全量绿。
**组 B 支付单/退款兜底任务（R5/R6/R7/R12/R13）**：T6 查单 job（递进+UNKNOWN×3 告警+manual_check；下单初始化 next_query_time=create+2min 增量）；T7 超时关单 job（先查后关+TIMEOUT 原因）；T8 退款补查 job（convergeRefunding 复用+24h 转人工）；T9 job 开关/上限/traceId 通用基建（@Lazy(false)、enabled、batch 100）；T10 组 B 测试（并发双实例、时间线注入）。
**组 C 补偿与告警（R8/R9/R10/R11）**：T11 PayAlertService 钉钉全特性（订阅/加签/去重/限流合并/脱敏/降级/异步吞错）；T12 ReconcileJob 补建+悬挂检测 job（WAIT_PAY 超 expire+30min、REFUNDING>24h、FAILED 计数→摘要告警）；T13 冲突幂等复查（S3 写入口已实现，补双实例并发回归测试 R8）+@PreDestroy 优雅停机；T14 组 C 测试。
**组 D 收口（R12 全量+回归）**：T15 全量 mvn test；T16 E2E（打包重启：双 job 实例并跑 Mock 回调端点计数断言、字典 V20261022_1 success=1、应用保持运行）；T17 `docs/apt/test-cases/paycenter-s4.md`（22 文档 A6/C6 P0 映射，GAP 如实）。

**执行体注记**：完成后 complete F-9→自取 F-10（S5，注意其前置 `designs/v0` 需先经 `$apt-create --refine` 产出支付主体页 page.logic——armed 流程）。verify FAIL→plan-from-verify ≤2 轮。
