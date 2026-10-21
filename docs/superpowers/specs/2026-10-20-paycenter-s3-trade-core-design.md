---
feature: paycenter
slice: S3
title: 首筑支付中心 — 交易核心与内部接口
Status: approved
risk: high
projectType: business
dependsOn: S1, S2
redteam: user-confirmed-2026-10-20
---

# S3 交易核心与内部接口 — Design Spec

## 1. 目标

**Goal:** 实现对内 OpenAPI v1.0（`paycenter/02` §3.1–3.5、§3.8–3.12）、支付单/退款单状态机、交易流水与银联通知处理，使业务系统可完成“下单 → 支付 → 查单 → 关单 → 退款 → 查退款 → 协议留痕”。

对应 `paycenter/08` 一期 A1–A5、A7–A11、C1–C5。契约以 02 文档为**冻结契约**，字段名 snake_case、金额分、时间 `yyyy-MM-dd HH:mm:ss`，响应 `{code,message,data}`（S1 `PayApiResponse`）。

## 2. 前置与约束
- 依赖 S1（实体、错误码、锁、限流、nonce、单号、加解密、Trace）与 S2（`PayChannelRouter`、`PayNotifyHandler` 接口）。
- 状态迁移**一律条件更新**：`UPDATE ... SET status=?, version=version+1 WHERE id=? AND status=? AND version=?`，影响 0 行视为被其他实例处理 → 重新读取后按幂等返回（schema 通用约定）。
- 多实例：账单在途锁定与同单并发操作用 `PayRedisLock`，DB 唯一索引兜底。

## 3. 范围

### 3.1 对内鉴权（同一 Task 内完成，禁止拆分）
1. `jeecg.shiro.excludeUrls` 把 S1 的 `/v1/ping` 改为 `/v1/**`。
2. `PayOpenApiAuthInterceptor`（注册到 `/v1/**`）**默认拒绝**：除 `@PayOpenApiPublic` 标注的接口（`/v1/token`、`/v1/ping`）外，必须携带 `Authorization: Bearer <token>`；token 不存在/过期 → 1003；app 停用 → 1002。
3. 防漏网测试 `PayOpenApiAuthCoverageTest`：从 `RequestMappingHandlerMapping` 枚举所有 `/v1/**` 接口，对未标 `@PayOpenApiPublic` 的逐个发起无 token 请求，断言 `code=1003`。
4. 商户越权：`pay_app.allowed_merchant_ids` 非空时，请求中的 `merchant_code` 必须在其内，否则 1002。
5. 防重放：`/v1/token` 的 `timestamp`（yyyyMMddHHmmss）与服务器时间差 ≤300s，否则 1002；其它接口若携带 `X-Timestamp`/`X-Nonce` 头则经 `PayReplayGuard` 校验（`paycenter.openapi.replay-guard=optional|required`，默认 optional 以兼容冻结契约；required 时缺头 → 1002）。写接口另由 `biz_order_no`/`biz_refund_no` 幂等防重。
6. 入站限流：`PayRateLimiter.tryAcquireMerchant(merchant_code)` 超限 → 9999（message 提示稍后重试）。

### 3.2 接口（02 §3）
| 接口 | 关键规则 |
|------|----------|
| `POST /v1/token` | app_id + app_secret（解密 `app_secret_enc` 后常量时间比较）；token=32 位随机串存 Redis `paycenter:token:{token}`→appId，TTL 7200；返回 `access_token, expires_in` |
| `POST /v1/pay/orders` | 校验顺序严格按 02 §3.2：①幂等 2003（返回原单 data）②账单在途 2004（任一 biz_bill_no 存在 WAIT_PAY/PAID/REFUNDING 单；对每个 biz_bill_no 加 Redis 锁后查 `pay_order_item` join `pay_order`）③金额 >0 且 ≤ 商户单笔限额 2005；items 恰好 1 条且合计=total_amount 否则 1001 ④pay_method 在商户 `pay_methods_enabled` 内否则 2002；商户停用 2001 ⑤PAY_SERVICE 当前版本未同意 4001 ⑥notify_url 域名 ∈ 商户 notify 域名白名单否则 1001 ⑦生成 `pay_order_no`(P) 与 `unionpay_order_id`(mchntOrderId)，落 `pay_order`+`pay_order_item`（WAIT_PAY），调 S2 下单；通道失败 → 支付单置 CLOSED（close_reason=CHANNEL_FAIL）并返回 5001；返回 `pay_params{target_sys, app_pay_request, target_order_id, mchnt_order_id}`、`expire_time` |
| `POST /v1/pay/orders/query` | pay_order_id 或 biz_order_no 至少一个；返回 02 §3.3 字段（含 card_attr）；WAIT_PAY 且距创建 >10s 时同步调一次 S2 查询收敛（限流内） |
| `POST /v1/pay/orders/close` | 仅 WAIT_PAY 可关（否则 3002）；调 S2 关单尽力而为，失败不影响本地 CLOSED；触发 PAY_CLOSED 回调任务（S4 推送） |
| `POST /v1/refund/orders` | 一期全额（refund_amount=total_amount 否则 1001/3003）；原单必须 PAID 否则 3004；支付成功 ≤360 天否则 3003；幂等 biz_refund_no；原单 PAID→REFUNDING 条件更新；生成 `refund_order_no`(R) 与 `unionpay_refund_order_id`；调 S2 退货：SUCCESS→退款单 REFUND_SUCCESS、原单 REFUNDED；FAIL→REFUND_FAIL、原单回 PAID；PROCESSING/UNKNOWN→保持 REFUNDING 交给查询（S4 任务）；`source` 区分 API/ADMIN（后台复用同一 Service） |
| `POST /v1/refund/orders/query` | 返回 02 §3.5 字段；REFUNDING 时同步补查一次 S2 |
| `POST /v1/merchants/{merchant_code}/pay-methods` | 三种方式按商户 `pay_methods_enabled` 返回 enabled；商户停用 → 2001 |
| `POST /v1/trades/query` | biz_date_from/to 必填且 ≤31 天；按支付成功时间/退款完成时间归属；summary（pay_count/pay_amount/pay_fee/refund_count/refund_amount）+ 分页 list；数据源 `pay_txn_flow` join 订单 |
| `POST /v1/agreements/consent` | 幂等 (user_id, agreement_code, version)；同时写 `pay_agreement_event_log`；返回 consent_time |
| `POST /v1/agreements/status` | 返回 consented/consent_time；“当前版本”= 同 code 下 status=1 且 effective_time≤now 最晚一条 |

### 3.3 状态机与流水
- 支付单：`WAIT_PAY→PAID`（通知/查询确认）、`WAIT_PAY→CLOSED`（关单/超时/通道下单失败）、`PAID→REFUNDING→REFUNDED`、`REFUNDING→PAID`（退款失败）。非法迁移抛 3002，不落库。`PayOrderStateMachine` 集中定义允许迁移表。
- 退款单：`REFUNDING→REFUND_SUCCESS / REFUND_FAIL`。
- 交易流水 `pay_txn_flow`：支付成功、退款成功各写一条（`uk(type,biz_id)` 幂等），含 fee_amount（通知/查询有则回填）、settle_date、card_attr、source(NOTIFY/QUERY)。
- 支付成功/关闭、退款成功/失败时写 `pay_callback_task`（`uk(biz_type,biz_id,event)` 幂等，status=PENDING，next_retry_time=now）——**同一事务**内与状态更新一起提交；推送由 S4 负责。
- `PayOrderService.confirmPaid(ChannelQueryResult|ChannelNotify)`、`markClosed(...)`、`RefundService.confirmResult(...)` 为唯一状态写入口，S4 任务复用。

### 3.4 通知处理
实现 S2 `PayNotifyHandler`：按 `mchntOrderId` 定位支付单 / 按 `refundOrderId` 定位退款单；金额与 merchant 校验不一致 → `ERROR` + 告警事件 + 不改状态；`TRADE_SUCCESS`→confirmPaid；`TRADE_CLOSED`→markClosed；`TRADE_REFUND`→触发退款单补查（以 refund-query 为准，04 §7）。已终态重复通知 → `PROCESSED`（幂等）。

### 3.5 非目标
回调推送与重试、定时查单/关单/退款补查（S4）；后台页面与后台 API（S5）；部分退款、多账单合并、退款审核（二期）。

## 4. 需求锁定表

| Rn | 需求 | 来源 | 可判定验收 | 优先级 |
|----|------|------|-----------|--------|
| R1 | 放行 `/v1/**` + 默认拒绝拦截器 + 防漏网测试（同一 Task） | 用户 2026-10-20 决策 | `PayOpenApiAuthCoverageTest` 通过：全部非公开 `/v1` 接口无 token→1003 | must |
| R2 | token 换取/校验/过期 | 02 §3.1 | 正确凭证得 token；错 secret→1002；timestamp 偏 6 分钟→1002；token 过期→1003 | must |
| R3 | 商户越权与入站限流 | arch-review rate_limit | allowed_merchant_ids 外的商户→1002；超 TPS→9999 | must |
| R4 | 创建支付单 7 步校验与顺序 | 02 §3.2 | 每个错误码各 1 个用例（2003 返回原单、2004、2005、2002、2001、4001、1001 notify 域名/items）；通道失败→5001 且本地 CLOSED | must |
| R5 | 账单在途并发锁定 | 08 C5 | 16 线程同 biz_bill_no 并发下单仅 1 个成功，其余 2004 | must |
| R6 | 查单/关单 | 02 §3.3/§3.8 | 非 WAIT_PAY 关单→3002；关单银联失败仍本地 CLOSED 且生成 PAY_CLOSED 回调任务 | must |
| R7 | 退款创建/查询（全额、PAID、360 天、幂等、失败回 PAID） | 02 §3.4/§3.5 | 非 PAID→3004；金额≠原单→拒绝；同 biz_refund_no→原单；FAIL→原单回 PAID；UNKNOWN→REFUNDING | must |
| R8 | 支付方式查询 / 交易查询 | 02 §3.9/§3.10 | 停用方式 enabled=false；跨度 32 天→1001；summary 与 list 汇总一致 | must |
| R9 | 协议同意/状态 + 4001 校验 | 02 §3.11/§3.12、14 文档 | 重复同意不重复插入；未同意下单→4001 | must |
| R10 | 状态机集中定义 + 条件更新 + 并发安全 | schema 通用约定 | `PayOrderStateMachineTest` 全迁移表；并发 confirmPaid 两次仅 1 次生效、流水 1 条、回调任务 1 条 | must |
| R11 | 交易流水与回调任务同事务写入 | 08 C3、02 §3.6 | confirmPaid 后 txn_flow 1 条、callback_task PENDING 1 条；事务回滚时两者都不存在 | must |
| R12 | 通知处理（定位、金额校验、幂等、退款补查） | 04 §7 | 金额不符→ERROR 不改状态；重复通知→PROCESSED；TRADE_REFUND→触发 refund-query | must |
| R13 | 22 文档 A/C 类 P0 用例自动化 | 08 §三 | 用例清单 `docs/apt/test-cases/paycenter-s3.md` 与 22 文档 A/C P0 逐条对应，全部自动化通过（通道用 MockWebServer） | must |
| R14 | S2.5 多支付主体：下单解析 app→subject→pay_merchant_subject（小区优先，缺省回落商户默认），订单落 subject_id 快照 | S2.5 收敛确认（用户 2026-10-20 order=before_s3） | app 按 `pay_app.subject_id` 绑定主体；下单按项目精确命中→商户默认（''）解析 sub_mchnt_no/sub_term_no；同一物业公司在两个主体下解析出不同子商户号；未绑定主体或未配置映射 → 复用错误码 2001（配置类缺失，响应文案带「商户未开通当前支付主体」上下文，不在 02 §1.3 外新增对内码）；`pay_order`/`pay_refund_order` 落 `subject_id` | must |

## 5. 字段落点（已按 S2.5 主体模型修订）
- 主体（凭证与主商户号）：`pay_subject.main_mchnt_no/main_term_no`、`app_id`、`app_key_enc/comm_key_enc`（AES-256-GCM）、`msg_src/msg_src_id`（单号来源编号前缀）、`notify_sign_type`、`key_version`、`wx_sub_appid`（公众号/小程序场景）、`scene`（字典 pay_scene）、`status`。
- 子商户号解析：`pay_merchant_subject`（uk: merchant_id+subject_id+project_id），`project_id=''` 为商户默认，小区精确命中优先；主体由 `pay_app.subject_id` 决定（下单接口不加 subjectCode 入参）。
- 商户：`pay_merchant.notify_domain`（回调域名白名单）、`max_amount`（单笔限额，分）、`pay_methods_enabled`、`status`；银商字段已迁主体（S2.5 下线 `unionpay_mchnt_no/unionpay_term_no/wx_sub_appid`）。
- 订单快照：`pay_order`/`pay_refund_order.subject_id`；`pay_order.unionpay_mchnt_no/unionpay_term_no` 保留为"下单时解析结果"快照（值来自主体映射 sub_*）。
