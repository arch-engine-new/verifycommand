---
feature: paycenter
slice: S2
title: 首筑支付中心 — 银联通道适配
Status: approved
risk: high
projectType: business
dependsOn: S1
redteam: user-confirmed-2026-10-20
---

# S2 银联通道适配 — Design Spec

## 1. 目标

**Goal:** 在 `jeecg-module-paycenter` 内实现银联商务（chinaums）新购物车 APP 支付通道适配器：签名、下单、查询、退货、退货查询、关单、异步通知接收验签与幂等，供 S3 交易核心调用。

对应 `paycenter/08` 一期功能 B1–B5；接口细节以 `paycenter/04-外部对接文档-银联商务.md` 为准（§2 签名、§3 接口映射、§4 下单、§5 查询、§6 退货、§7 通知、§8 关单、§9 注意事项）。

## 2. 前置与约束

- 依赖 S1：`PayCryptoService`、`PayRateLimiter`（`unionpay:global`）、`PayNoGenerator.unionpayMchntOrderId/RefundOrderId`、`PayTraceUtil`、`PayErrorCode`、`PayRedisLock`、14 实体。
- **不做 Mock 通道**（2026-10-19 决策，`.apt/arch-review/product-arch-answers.json` payment）。
- 凭证（AppId/AppKey/通讯密钥/商户号/终端号/subAppId/来源编号）**只经环境变量或 `.apt/local/` 本地文件注入**；入库字段 `*_enc` 加密；禁止出现在日志、异常信息、聊天、仓库。
- 银联测试环境 9:00–18:00 开放、需 IP 白名单；微信/云闪付无测试环境（04 §9）。

## 3. 范围

### 3.1 包含
1. **通道抽象**：`PayChannel` 接口（`createOrder / queryOrder / refund / queryRefund / closeOrder / parseAndVerifyNotify`）+ `PayChannelRouter`（按 `channel_code` 选实现；一期仅 `UNIONPAY`）+ 统一 DTO（`ChannelPayRequest/Result`、`ChannelQueryResult`、`ChannelRefundRequest/Result`、`ChannelNotify`），二期通道只加实现。
2. **通道配置加载**：`PayChannelConfigService` 读取 `pay_channel_config`（`status=1` 的 `UNIONPAY`），解密 `app_key_enc`/`comm_key_enc`，进程内缓存 60s + 后台修改时失效；提供 `PayChannelConfigBootstrap`：启动时若表中无记录且环境变量 `PAY_UNIONPAY_APP_ID/APP_KEY/COMM_KEY/BASE_URL` 齐全，则加密写入一条（幂等，不覆盖已有）。
3. **OPEN-BODY-SIG 签名**（04 §2）：`B=SHA256_hex(body)`；`C=AppId+Timestamp+Nonce+B`；`Signature=Base64(HmacSHA256(C, AppKey))`；Header `Authorization: OPEN-BODY-SIG AppId="..", Timestamp="yyyyMMddHHmmss", Nonce="..", Signature=".."`。
4. **HTTP 客户端**：JDK `HttpClient`（或项目已有 OkHttp）；连接/读超时取 `pay_channel_config.connect_timeout_ms/read_timeout_ms`（默认 3000/10000）；每次调用前 `PayRateLimiter.tryAcquireUnionPay()`，拒绝时短暂等待重试，超 1s 返回 `CHANNEL_ERROR(5001)`；`errCode=9200`（系统繁忙）退避重试 ≤3 次（200ms/500ms/1s）；其余错误不重试。
5. **五个接口**（04 §3）：
   - 下单 `POST /v1/inip/upsp/shop/app/pay`：msgType 映射 `WECHAT→wx.unifiedOrder`、`ALIPAY→trade.appPreOrder`、`UNIONPAY_CARD→uac.appOrder`；`instMid=APPDEFAULT`；`vaFld={newShopFlag:"GWCXS", isSubMchntPay:"02"}`；**不传 satType/satInfo**；微信必传 `subAppId`；`attachedData`=我方 `pay_order_no`；`expireTime`、`notifyUrl` 由调用方传入。返回 `appPayRequest`（原样透传，不解析不修改）、`targetOrderId`、`status`、`mchntOrderId` 一致性校验。
   - 查询 `online/query`：`sysSource=OPT`；返回 status/payTime/targetSys/targetOrderId/settleDate/totalAmount/cardAttr/seqId。
   - 退货 `online/refund`：`refundOrderId` 用 `PayNoGenerator.unionpayRefundOrderId()`（由 S3 生成并传入）；`refundStatus` 按 `SUCCESS/FAIL/PROCESSING/UNKNOWN` 映射，**未知值一律视为 UNKNOWN**。
   - 退货查询 `online/refund-query`：`mchntOrderId` 传退款订单号。
   - 关单 `common/order-close`：`requestTimestamp`；已支付单返回的错误映射为“不可关闭”。
6. **状态全量映射**（04 §4.2）：`NEW_ORDER/WAIT_BUYER_PAY→WAIT_PAY`、`TRADE_SUCCESS→PAID`、`TRADE_CLOSED→CLOSED`、`TRADE_REFUND→REFUND`、`UNKNOWN`/其他→`UNKNOWN`；`targetSys` 映射 `WXPay→WECHAT`、`ALIPAY→ALIPAY`、`UNIONPAY/UAC→UNIONPAY_CARD`。
7. **错误映射**（02 §1.3 下方“通道错误映射”表）：`respCode=0000`→成功；`errCode=1001`→5001 + 告警事件；`1000`→9999 + 告警事件；`9200`→重试后 5001；非 0000/未知→5001 + 标记需查单；`status=UNKNOWN`→不判失败、交给查单。告警事件只发布 Spring `PayAlertEvent`（S4 接钉钉）。
8. **通知接收** `POST /notify/unionpay/pay`（S1 已放行 `/notify/unionpay/**`）：
   - 兼容 form 与 JSON 解析；原文落 `pay_notify_record`（敏感字段脱敏后存）。
   - 验签（04 §7）：除 `sign` 外参数按 key 字典序拼 `k=v&...`，末尾拼通讯密钥，按 `signType`（SHA256，缺省 MD5）摘要转大写 hex 比对。**空值是否参与**做成配置项 `paycenter.unionpay.notify-sign-include-empty`（默认 false），以便实测后切换。
   - 来源 IP 白名单：配置 `paycenter.unionpay.notify-ip-whitelist`（逗号分隔，可为空=不校验并 WARN 日志）。
   - 幂等：`notifyId` 唯一（`uk(notify_id)`）+ `mchntOrderId`；重复通知直接回 `SUCCESS` 不再分发。
   - 分发：验签通过后调用 `PayNotifyHandler` 接口（S2 定义，S3 实现；S2 提供默认实现仅记录 `process_status=IGNORED` 并 WARN，避免 S3 前丢通知）。处理异常 → `process_status=ERROR`，回 `FAILED`（银联重发）。
   - 验签失败 → 记录 `ERROR` + 告警事件 + 回 `FAILED`。
9. **报文日志**：请求/响应 INFO 日志带 traceId、接口名、耗时、respCode；`appPayRequest`、密钥、商户号中间位脱敏（`PayMaskUtil`）。
10. **真实联调测试骨架**：`@Tag("unionpay-live")` 集成测试类（下单 1 分钱支付宝/银联卡、查询、关单、退款流程），默认 surefire 排除；环境变量缺失时测试 `fail` 并提示，由 `/apt-accept` 阶段在用户提供参数后执行。

### 3.2 非目标
- 支付单/退款单状态机与落库（S3）；回调业务系统与定时查单（S4）；主备域名自动切换（04 §9.5，预留 `backup_base_urls`，一期不做）；分账（二期）；对账文件（二期）。

## 4. 需求锁定表

| Rn | 需求 | 来源 | 可判定验收 | 优先级 |
|----|------|------|-----------|--------|
| R1 | 通道抽象 + 路由 + 统一 DTO | 07 P1.2 | `PayChannelRouterTest`：`UNIONPAY` 返回银联实现，未知 code 抛 `PayException(5001)` | must |
| R2 | 通道配置加密加载 + 环境变量引导写入 | arch-review secret_mgmt | `PayChannelConfigServiceTest`：密文入库、解密正确、缓存失效；仓库 `rg` 无明文 AppKey 模式 | must |
| R3 | OPEN-BODY-SIG 签名 | 04 §2 | `OpenBodySigSignerTest`：固定 AppId/Timestamp/Nonce/body/AppKey 输出与手工计算（独立实现的 HMAC 参考值）一致；Header 格式断言 | must |
| R4 | 下单（三种 msgType、不传分账、透传 appPayRequest） | 04 §4 | `UnionPayChannelTest`（MockWebServer 模拟银联）：请求体字段/vaFld/msgType 断言；响应 appPayRequest 原样返回；mchntOrderId 不一致抛错 | must |
| R5 | 查询/退货/退货查询/关单 | 04 §5/§6/§8 | 同上：四接口请求体与响应映射断言；refundStatus 未知值→UNKNOWN | must |
| R6 | 状态与 targetSys 全量映射 | 04 §4.2 | `UnionPayStatusMapperTest` 覆盖 6 个状态 + 未知值 | must |
| R7 | 超时、限流、9200 退避重试 | 04 §9 / arch-review timeout,rate_limit,retry | MockWebServer：延迟超读超时→5001；9200 两次后成功→成功且请求 3 次；限流拒绝→等待后 5001 | must |
| R8 | 错误码映射 + 告警事件 | 02 §1.3 映射表 | `UnionPayErrorMapperTest`：1001→5001+事件、1000→9999+事件、未知→5001 | must |
| R9 | 通知接收：验签、IP 白名单、幂等、分发、应答 | 04 §7 | `UnionPayNotifyControllerTest`：正确签名→SUCCESS 且 handler 调用 1 次；同 notifyId 再次→SUCCESS 且 handler 不再调用；错签→FAILED + ERROR 记录；handler 抛异常→FAILED | must |
| R10 | 报文日志脱敏 + traceId | arch-review desensitize,tracing | 测试日志捕获：不含 AppKey/通讯密钥原文，appPayRequest 被截断脱敏 | must |
| R11 | 真实联调测试骨架（unionpay-live） | 07 不做 Mock | 测试类存在且默认被排除；`mvn test -Dgroups=unionpay-live` 在缺参时以明确信息失败 | must |
| R12 | S1 已有 `/notify/unionpay/**` 放行可达 | S1 R12 | 启动后 `POST /jeecg-boot/notify/unionpay/pay` 空体返回 `FAILED`（非 401/302） | must |

## 5. 开放项
- 通知验签空值规则、报文格式须用真实测试通知确认（04 §7、23 文档 C1）→ 在 `/apt-accept` 阶段用用户提供的参数实测，必要时切换 `notify-sign-include-empty`。
- 银联官方错误码表待银联提供（04 §9.3），当前映射按联调惯例值。
