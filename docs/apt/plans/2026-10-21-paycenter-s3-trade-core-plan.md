# 首筑支付中心 S3 交易核心与内部接口 Implementation Plan

> **Spec:** `docs/superpowers/specs/2026-10-20-paycenter-s3-trade-core-design.md`（已按 S2.5 修订：R14 多支付主体、§5 字段落点改主体模型）
> **Command:** `/plan-from-spec`
> **Status:** approved（批量模式，用户 2026-10-20 预授权不逐份审）
> **DDL：** 无变更（`subject_id` 等列已由 S2.5 V20261021_1 落库）。**禁止**改已执行 Flyway 脚本。

**Goal:** 实现对内 OpenAPI v1.0（02 §3.1–3.5、§3.8–3.12）+ 支付/退款状态机 + 交易流水 + 通知处理，使业务系统完成「下单→支付→查单→关单→退款→查退款→协议留痕」；下单解析走 S2.5 主体模型（app→subject→pay_merchant_subject）。

**Architecture:** 新增 `openapi` 包（token/鉴权拦截器/10 接口 Controller/请求响应 DTO）、`order` 域服务（`PayOrderService.confirmPaid/markClosed`、`RefundService.confirmResult`、`PayOrderStateMachine` 集中迁移表 + 条件更新）、`PayNotifyHandler` 落地实现（S2 接口，通知→confirmPaid/markClosed/退款补查）。鉴权：Shiro 放行 `/v1/**` + `PayOpenApiAuthInterceptor` 默认拒绝（`@PayOpenApiPublic` 白名单豁免）；Redis 存 token（TTL 7200）；防重放 PayReplayGuard（optional 模式默认）；入站限流 tryAcquireMerchant。**不新增第三方依赖、不新增错误码。**

---

## Part 1 — 技术方案（APT 寻址）

### 1.1 范围与约束

**包含：** spec R1–R14（08 一期 A1–A5、A7–A11、C1–C5；22 文档 A/C 类 P0 自动化）。

**非目标（spec §3.5）：** 回调推送与重试、定时查单/关单/退款补查（S4）；后台页面与 API（S5）；部分退款、多账单合并、退款审核（二期）；对账、分账。

**硬约束：**
- 契约冻结：02 §3 字段名 snake_case、金额分、时间 `yyyy-MM-dd HH:mm:ss`、响应 `{code,message,data}`（S1 `PayApiResponse`）；错误码只用既有码表（缺映射/主体未绑定复用 `MERCHANT_DISABLED(2001)` detail「商户未开通当前支付主体」；幂等 2003；在途 2004；超限 2005；未开通 2002；状态类 3002/3004；未同意 4001；通道 5001；限流/繁忙 9999；参数 1001；鉴权 1002/1003）。
- 状态迁移一律条件更新 `WHERE id=? AND status=? AND version=?`，影响 0 行 → 重读幂等返回；状态机允许迁移表集中定义于 `PayOrderStateMachine`。
- 多实例并发：账单在途锁 `PayRedisLock`（键 `paycenter:bill:{biz_bill_no}`）；DB 唯一索引兜底；回调任务/流水与状态更新**同一事务**。
- **S2.5 R14 下单解析**：`pay_app.subject_id` → 主体；`IPayMerchantSubjectService.resolve(merchantId, subjectId, projectId)`（小区精确→''默认→缺 2001）；`pay_order`/`pay_refund_order` 落 `subject_id` 快照；单号 `PayNoGenerator.unionpayMchntOrderId(subject.msgSrcId)`；通道调用 `Channel*Request.subjectId`。
- 测试 HTTP 用 `UnionPayMockServer`（JDK HttpServer，S2 基建）；**不用 MockWebServer**（okhttp 版本仲裁冲突，S2 已核实）。fastjson2 兼容包（`com.alibaba.fastjson`）保序。
- lazy-init：含 `@EventListener`/启动即需 Bean `@Lazy(false)`；模块 pom skipTests=false；maven `-o`；PowerShell 无 `&&`。
- 凭证脱敏：任何响应/日志不含 `*_enc`/AppKey/通讯密钥；商户号 `PayMaskUtil.mask`。

### 1.2 设计寻址
N/A（S3 无 UI 面）。

### 1.3 依赖寻址表（关键项）

| 依赖 | 来源 | 引用 | 摘要 |
|------|------|------|------|
| PayChannelRouter / Channel*Request | 源码（S2） | `.../paycenter/channel/PayChannelRouter.java`、`channel/dto/Channel*Request.java` | 5 接口均带 `subjectId`；返回 `Channel*Result` |
| PaySubjectChannelConfigService | 源码（S2.5） | `.../channel/config/PaySubjectChannelConfigService.java` | `getActive(subjectId)`；S3 不直接调（由通道层取），但单测可注入 |
| IPayMerchantSubjectService | 源码（S2.5） | `.../service/IPayMerchantSubjectService.java` | `resolve(merchantId, subjectId, projectId)`；缺→2001 |
| PayNoGenerator | 源码（S2.5） | `.../common/no/PayNoGenerator.java` | `unionpayMchntOrderId(String msgSrcId)` 重载；旧属性路径保留 |
| PayNotifyHandler | 源码（S2） | `.../channel/notify/PayNotifyHandler.java` | 接口，S3 提供 `@Primary` 实现；`UnionPayNotifyService` 编排不变 |
| 实体 16 表 + mapper | 源码 | `.../entity/*.java`（PayOrder/PayOrderItem/PayRefundOrder/PayTxnFlow/PayCallbackTask/PayNotifyRecord/PayApp/PayMerchant/PayMerchantProject/PaySubject/PayMerchantSubject/…） | 全部含 subject_id 快照/绑定关系；`@TableLogic`/审计字段惯例 |
| PayCryptoService / PayRedisLock / PayRateLimiter / PayTraceUtil / PayErrorCode / PayException / PayApiResponse | arch+源码（S1） | `.../common/**` | 解密 app_secret（常量时间比较）、锁 `executeWithLock`、限流、MDC traceId、错误码枚举（含 `MERCHANT_DISABLED`）、统一响应 |
| Shiro excludeUrls | 源码 | `jeecg-system-start/src/main/resources/application-dev.yml`（excludeUrls 现含 `/v1/ping`、`/notify/unionpay/**`） | 改 `/v1/**`（同一 Task 内配套拦截器默认拒绝） |
| 协议/同意 | 源码 + designs | `PayAgreementVersion/PayAgreementConsent` 服务；`designs/v0/agreements/page.logic.md` | 当前版本=同 code status=1 且 effective_time≤now 最晚 |
| 22 文档用例真源 | 文档 | `paycenter/22-支付验收测试用例.md`（A/C 类 P0）、`08` §三 | 用例清单 `docs/apt/test-cases/paycenter-s3.md` 逐条映射 |

### 1.4 EntityGraph / 契约
- 新公开接口落 `register_contract`（finish-feature 时）：`PayOpenApiV1`（10 接口路径+请求/响应关键字段+错误码映射）、`PayOrderStateMachine`（迁移表）、`RefundService`/`PayOrderService` 状态写入口签名。
- 实现阶段禁止手改 entities.json。

### 1.5 测试策略
- 单元：状态机全迁移表（`PayOrderStateMachineTest`）；7 步校验每码 1 例（含 2003 返原单、2004 锁、4001）；R14 双主体路由（同商户两主体不同 sub_mchnt_no、缺映射 2001、app 未绑定 2001）；通知 handler 金额不符 ERROR 不改状态、重复 PROCESSED、TRADE_REFUND 触发补查；token 常量时间比较/过期 1002/1003；越权 1002；限流 9999；防重放 optional/required 双模式。
- 集成：`PayOpenApiAuthCoverageTest` 枚举全部 `/v1/**` 无 token→1003 防漏网；`/v1/ping` 匿名 0000（S1 回归）；confirmPaid 幂等并发（16 线程仅 1 生效、流水 1 条、回调任务 1 条）；事务回滚两者都不存在。
- 端到端：Mock 银联通道 5 接口全链路（下单→通知→查单→退款→退款查询）。
- 用例清单：`docs/apt/test-cases/paycenter-s3.md`（22 A/C P0 逐条 ↔ 自动化测试名映射，verify 5.5 依据）。

### 1.6 需求锁定表
spec §4 R1–R14 为验收真源（本 plan 不复述），其中 R1/R4/R10/R11/R12/R14 为 must 关键路径。

---

## Part 2 — 任务清单（子 Agent 分组串行；组内逐 Task Verify；每组一次 commit）

**组 A — 鉴权与 token（R1/R2/R3）**
- T1 `ShiroConfig` excludeUrls `/v1/ping`→`/v1/**` + `PayOpenApiAuthInterceptor`（默认拒绝、`@PayOpenApiPublic` 豁免、token 校验 Redis 查找、app 停用 1002、越权 allowed_merchant_ids、入站限流 tryAcquireMerchant→9999）注册 `/v1/**`；**与防漏网测试同 Task**：T4 `PayOpenApiAuthCoverageTest`（枚举 HandlerMapping 全量断言 1003/豁免清单固定）。
- T2 `POST /v1/token`：app_id+app_secret 解密常量时间比较、timestamp±300s（1002）、token 32 位随机存 Redis TTL 7200、返回 `access_token/expires_in`（02 §3.1 字段）。
- T3 防重放接线 `PayReplayGuard`（`paycenter.openapi.replay-guard=optional`；X-Timestamp/X-Nonce 存在即校验，required 缺头 1002）。
- Verify：`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test` 新用例绿 + 全量绿；commit。

**组 B — 状态机与下单链路（R4/R5/R6/R10/R11/R14）**
- T5 `PayOrderStateMachine`（允许迁移表集中定义）+ `PayOrderService.confirmPaid/markClosed` 唯一状态写入口 + 条件更新 + `PayOrderStateMachineTest` 全迁移表。
- T6 创建支付单 7 步校验（02 §3.2 严格顺序；幂等 2003；账单在途 Redis 锁+join 查询；R14 主体解析与快照；单号按主体；通道失败→CLOSED(CHANNEL_FAIL)+5001）；落 pay_order+pay_order_item 同事务。
- T7 查单 `/v1/pay/orders/query`（WAIT_PAY 且>10s 同步收敛限流内）、关单 `/v1/pay/orders/close`（仅 WAIT_PAY；S2 尽力而为；PAY_CLOSED 回调任务）。
- T8 流水+回调任务同事务写入（uk 幂等；confirmPaid→PAY_SUCCESS 任务、markClosed→PAY_CLOSED 任务；`txn_flow` fee/settle/card_attr）。
- Verify：单测+并发集成绿；commit。

**组 C — 退款与通知（R7/R12/R13 部分）**
- T9 `RefundService.createRefund/query`（全额、PAID、≤360 天、幂等 biz_refund_no、原单 PAID→REFUNDING 条件更新占位、S2 退货三态映射、FAIL 回 PAID、PROCESSING/UNKNOWN 保持、source=API/ADMIN 复用、退款单 subject_id 快照继承原单）。
- T10 `PayNotifyHandler` 实现（定位/金额校验 ERROR 不改状态/TRADE_SUCCESS confirmPaid/TRADE_CLOSED markClosed/TRADE_REFUND 触发 refund-query/重复 PROCESSED；raw_body 留痕语义 S2 已管）。
- Verify：双主体通知路由、金额不符、幂等并发用例绿；commit。

**组 D — 其余对内接口（R8/R9）与收口（R13）**
- T11 `/v1/merchants/{code}/pay-methods`（按主体判断+商户开关，微信主体 wx_sub_appid 空→强制关）、`/v1/trades/query`（≤31 天、summary+分页、pay_txn_flow join）、`/v1/agreements/consent|status`（幂等+事件流水、当前版本规则、4001 联动下单）。
- T12 `docs/apt/test-cases/paycenter-s3.md`（22 A/C P0 ↔ 自动化映射全表）+ 全量 `mvn test` 绿 + 启动 E2E（ping + 一次 Mock 下单链路）；commit。

**执行体注记：** 每组子 Agent 串行，主 Agent 不 inline 编码；完成后 `batch_complete_slice(F-8, done, 证据)` → F-9/F-10 依次自取。verify FAIL 走 plan-from-verify 修复链（≤2 轮）。
