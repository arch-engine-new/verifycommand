# paycenter S3 交易核心与内部接口 · 自动化用例清单（R13）

> 真源：`paycenter/22-支付验收测试用例.md` A/C 类 P0 + `paycenter/08-功能两期拆分.md` §一（一期 A1–A5、A7–A11、C1–C5）。
> 三方对照：spec `docs/superpowers/specs/2026-10-20-paycenter-s3-trade-core-design.md` §4 R1–R14 ↔ 22 文档用例 ↔ 自动化测试（类#方法）。
> 测试仓：`backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter`（分支 paycenter）。
> 通道口径：全程 `UnionPayMockServer`/Mockito 通道桩（**非 MockWebServer**——okhttp 版本仲裁冲突，plan 1.1 硬约束修订了 spec R13 原文表述）。
> 全量执行：`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test`（需先 `. scripts/paycenter/run-local.ps1 -EnvOnly` 注入真实 MySQL/Redis 环境变量）。

## spec R ↔ 22 用例 ↔ 测试类总对照

| spec R | 需求 | 22 用例 | 主测试类 |
|---|---|---|---|
| R1 | 默认拒绝 + 防漏网 | TC-A-02 / TC-X-08（越权面） | `PayOpenApiAuthCoverageTest` |
| R2 | token 换取/校验/过期 | TC-A-01 / TC-A-02 | `PayTokenServiceTest`、`PayOpenApiAuthInterceptorTest` |
| R3 | 商户越权与入站限流 | TC-X-08（越权面） | `PayOpenApiAuthInterceptorTest`、`PayRateLimiterTest` |
| R4 | 下单 7 步校验与顺序 | TC-A-03/04/06/07/08/09 | `PayOrderCreateDbTest` |
| R5 | 账单在途并发锁定 | TC-A-05 / TC-X-02 | `PayOrderBillConcurrentDbTest` |
| R6 | 查单/关单 | TC-A-10 / TC-A-14 | `PayOrderQueryCloseDbTest` |
| R7 | 退款创建/查询 | TC-A-11/12/13 | `PayRefundCreateDbTest`、`PayRefundQueryConfirmDbTest` |
| R8 | 支付方式查询 / 交易查询 | TC-A-15 / TC-A-16 | `PayMethodQueryDbTest`、`PayTradeQueryDbTest`（组 D） |
| R9 | 协议同意/状态 + 4001 联动 | TC-A-17（+TC-A-08） | `PayAgreementTradeDbTest`（组 D）、`PayOrderCreateDbTest` |
| R10 | 状态机集中 + 条件更新并发 | TC-C-01 | `PayOrderStateMachineTest`、`PayOrderConfirmPaidDbTest` |
| R11 | 流水与回调任务同事务 | TC-C-03 | `PayOrderConfirmPaidDbTest` |
| R12 | 通知处理 | TC-B-05/06/07（我方侧语义） | `PayTradeNotifyHandlerDbTest`、`UnionPayNotifyControllerTest` |
| R13 | A/C 类 P0 自动化 | 本清单 | 全部 |
| R14 | S2.5 多主体下单解析 | TC-A-03（主体面） | `PayOrderCreateDbTest`、`PayMerchantSubjectResolveTest` |

## A. 接口层 P0 逐条映射（TC-A-01 – TC-A-17；TC-A-18 为 P1，仅备注）

| 用例 | 名称 | 自动化覆盖（类#方法） | 状态 |
|---|---|---|---|
| TC-A-01 | 获取令牌成功（7200s） | `PayTokenServiceTest#validCredentialsIssueTokenStoredInRedisAndResolvable`、`#tokenTtlFollowsPropertiesOverride`；`PayCenterPropertiesTest#openapiDefaultsAndOverrides`（默认 TTL） | ✅ 自动化 |
| TC-A-02 | 令牌鉴权失败（错 secret/缺 Authorization→1002/1003） | `PayTokenServiceTest#wrongSecretRejected1002`、`#staleAndFutureTimestampRejected1002`、`#unknownAndDisabledAppRejected1002WithSameHint`；`PayOpenApiAuthInterceptorTest#missingAuthorizationHeaderDenied1003`、`#unknownTokenDenied1003`、`#disabledAppDenied1002`；`PayOpenApiAuthCoverageTest#everyProtectedV1HandlerRejectsRequestsWithoutToken`；E2E 冒烟（本文档末） | ✅ 自动化 |
| TC-A-03 | 创建支付单-正常（pay_params.app_pay_request 非空） | `PayOrderCreateDbTest#createSuccessPersistsOrderWithSubjectSnapshot`（pay_params 三要素 + app_pay_request 透传断言）；通道报文级 `UnionPayChannelCreateOrderTest#wechatRequestBody`、`#alipayOmitsSubAppId`、`#unionpayCardMsgType`、`#appPayRequestObjectPassThrough` | ✅ 自动化 |
| TC-A-04 | 幂等-同单号重复（2003 返原单不重复建单） | `PayOrderCreateDbTest#idempotentDuplicateReturnsOriginalOrder2003` | ✅ 自动化 |
| TC-A-05 | 账单在途锁定（2004） | `PayOrderCreateDbTest#billInProgressWaitPayRejected2004`、`#billInProgressPaidAndRefundingBothRejected`；并发 `PayOrderBillConcurrentDbTest#concurrentOrdersOnSameBillOnlyOneWins`（16 线程） | ✅ 自动化 |
| TC-A-06 | 金额超限（2005） | `PayOrderCreateDbTest#amountLimitViolationsRejected2005` | ✅ 自动化 |
| TC-A-07 | pay_method 必填校验（1001/2002） | `PayOrderCreateDbTest#missingRequiredAndBadExpireRejected1001`、`#payMethodNotEnabledRejected2002`、`#wechatWithoutSubAppidRejectedAndClosed`（主体侧 2002） | ✅ 自动化 |
| TC-A-08 | 协议未同意（4001） | `PayOrderCreateDbTest#unconsentedUserRejected4001`、`#consentMustMatchCurrentLatestVersion` | ✅ 自动化 |
| TC-A-09 | 回调域名白名单（1001） | `PayOrderCreateDbTest#notifyUrlWhitelistEnforced` | ✅ 自动化 |
| TC-A-10 | 支付单查询（不存在 3001） | `PayOrderQueryCloseDbTest#queryParameterAndNotFound`、`#queryStaleWaitPayConvergesPaidThroughChannel`（含 card_attr/channel_txn_id）、`#queryFreshWaitPayDoesNotHitChannel` | ✅ 自动化 |
| TC-A-11 | 创建退款-正常（0000 + refund_order_id + REFUNDING） | `PayRefundCreateDbTest#channelProcessingKeepsRefunding`、`#channelUnknownKeepsRefunding`（REFUNDING 语义）；成功收敛全链路 `#channelSuccessConvergesRefunded`；端点包装 `PayRefundControllerTest#successPathsWrapContractFields` | ✅ 自动化 |
| TC-A-12 | 退款金额/状态校验（3004/3003） | `PayRefundCreateDbTest#nonPaidOriginRejected3004`、`#originAlreadyRefundingRejected3004`、`#partialAmountRejected1001`、`#over360DaysRejected3003` | ✅ 自动化 |
| TC-A-13 | 退款幂等（同 biz_refund_no 返原单） | `PayRefundCreateDbTest#sameBizRefundNoIdempotentReturnsOriginal` | ✅ 自动化 |
| TC-A-14 | 关闭支付单（0000→CLOSED；PAID→3002） | `PayOrderQueryCloseDbTest#closeSuccessWritesTaskAndPayload`、`#closeNonWaitPayRejected3002`、`#closeChannelFailureStillLocalClosed`、`#closeUnknownOrder3001` | ✅ 自动化 |
| TC-A-15 | 商户支付方式查询 | `PayMethodQueryDbTest#allEnabledForAppSubjectWithWxAppid`、`#merchantSwitchOffWinsDisableReason`、`#wechatForceDisabledWhenSubjectHasNoWxAppid`、`#sceneMatrixAdjudication`、`#merchantSwitchReasonTakesPriorityOverScene`、`#merchantDisabledOrUnknownRejected2001`、`#subjectMissingOrDisabledRejected2001`、`#pathVariableMerchantScopeRechecked`；端点 `PayGroupDControllerTest#payMethodsEnvelope` | ✅ 自动化 |
| TC-A-16 | 交易查询（summary 与 list 一致、手续费列） | `PayTradeQueryDbTest#summaryMatchesListAcrossPages`（逐页合计==summary，含 pay_fee）、`#requiredFieldsAndDateFormat`、`#dateSpanLimit`（32 天→1001）、`#pageParameterLimits`（page_size 上限 100）、`#attributionWindows`、`#nonSuccessStatesExcluded`、`#refundedOrderKeepsPayRowAndPairsRefundRow`、`#confirmPaidFlowVisibleInTradesQuery`（组 B 流水同源）、`#unknownMerchantRejectedDisabledMerchantReadable`；端点 `PayGroupDControllerTest#tradesQueryEnvelope` | ✅ 自动化 |
| TC-A-17 | 协议同意/状态（同意幂等；未同意 consented=false） | `PayAgreementTradeDbTest#newConsentWritesRecordAndEvent`、`#repeatedConsentIsIdempotent`、`#versionMustBeCurrentEffective`、`#disabledVersionNotEffective`、`#sourceDefaultsAndClientIpStored`、`#eventFailureRollsBackConsent`、`#statusForExplicitCodes`、`#statusWithoutCodesEnumeratesEffectiveAgreements`、`#oldVersionConsentNotCountedAgainstCurrent`、`#singleAgreementCodeCompatAndParamGuards`；端点 `PayGroupDControllerTest#agreementsEnvelope` | ✅ 自动化 |

> TC-A-18（P1 参数边界：金额 0/负/items 合计≠total）已顺带自动化：`PayOrderCreateDbTest#itemsConstraintViolationsRejected1001`、`#amountLimitViolationsRejected2005`（≤0 分支）。

### TC-A-15 口径备注（22 文档 vs 02 契约）

22 文档写「仅返回 enabled=true 的项」；02 §3.9（冻结契约，含响应示例）为三项全量返回 + `enabled` 标志。按 S3 spec「契约以 02 为冻结契约」裁决：**三项全量返回**，停用项 `enabled=false` + `disable_reason`，C 端按 `enabled=false` 过滤不展示——与「微信未批时不展示」的验收语义等价，不损失判定信息。主体判定最终口径（组 D 落定）：`enabled = 商户 pay_methods_enabled ∩ 主体约束`；主体约束 = ①场景支持矩阵（一期银联间连通道 02 §4 确认的三个 msgType 均为 APP 场景接口：WECHAT 另支持微信生态场景 WECHAT_MP/MINI_PROGRAM，H5 一期无映射全关）+ ②WECHAT 必须主体 `wx_sub_appid` 非空（S2 契约「微信必传 subAppId」，与下单链路 `requireWxSubAppid` 同口径）。故 **APP 主体支持微信**（配了 wx_sub_appid 即 enabled=true）。出处：02 §3.9/§4、S2 spec §下单映射、S2.5 schema（pay_scene/wx_sub_appid 列口径）、PRD 01 FR-09/风险5。

## C. 交易核心 P0 逐条映射（TC-C-01 – TC-C-05）

| 用例 | 名称 | 自动化覆盖（类#方法） | 状态 |
|---|---|---|---|
| TC-C-01 | 支付单状态机全流转（每步可查，非法流转被拒） | `PayOrderStateMachineTest#fullTransitionMatrixMatchesSpec`、`#allowedTransitionsDoNotThrow`、`#illegalTransitionsThrow3002`、`#terminalAndUnknownStatesRejected`；入口级 `PayOrderConfirmPaidDbTest#confirmPaidAllowedFromRefunding`、`#confirmPaidFromTerminalStatesRejected`；流转链 `PayRefundCreateDbTest#channelSuccessConvergesRefunded`（WAIT_PAY→PAID→REFUNDING→REFUNDED 全链落库可查） | ✅ 自动化 |
| TC-C-02 | 退款失败回滚（原单回 PAID，可再次发起） | `PayRefundCreateDbTest#channelFailRollbacksOriginToPaid`、`#retryAfterFailCarriesSeqAndLineage`；查询侧 `PayRefundQueryConfirmDbTest#queryRefundConvergesFail`、`#confirmResultKeepsTerminalStateOnConflict` | ✅ 自动化 |
| TC-C-03 | 交易流水落库（PAY/REFUND 各一条，fee_amount/settle_date 有值） | 条数与幂等：`PayOrderConfirmPaidDbTest#confirmPaidWritesFlowAndCallbackTaskAtomically`（PAY 流水 1 条，source/channel_seq/status/amount 断言 + 订单 settle_date 有值）、`#concurrentConfirmPaidOnlyOneWins`（并发仅 1 条）、`#rollbackLeavesNoFlowAndTask`（回滚不留流水）；REFUND 流水：`PayRefundQueryConfirmDbTest#confirmResultIsIdempotentOnRepeat`、`#concurrentConfirmResultOnlyOneWins`；查询列呈现：`PayTradeQueryDbTest#summaryMatchesListAcrossPages`（fee 列入 summary）。**fee_amount 真实有值 = GAP**：一期银联通道回传报文不含手续费字段（04 文档核实，`ChannelQueryResult` 无 fee 属性），`writePayFlow` 仅透传 `pay_order.fee_amount`（当前无置值入口）；真实取数依赖二期的对账文件回填（08：流水 fee 为对账二期基础）。**settle_date**：支付侧已从通道回传解析落 `pay_txn_flow.settle_date`（代码级），测试断言到订单列 + 流水行存在性，流水 settle_date 列值由 `PayTradeQueryDbTest` 同源回归覆盖 | ⚠️ 部分 GAP（fee 数据源，非 S3 缺陷） |
| TC-C-04 | 超时查单任务（5 分钟补捞、3 次 UNKNOWN 告警） | — | ❌ 出片（08 C6→**S4**；spec §3.5 非目标「定时查单/关单/退款补查（S4）」。S3 已备好入口：`confirmPaid/markClosed/RefundService.confirmResult` 唯一写入口 + `queryRound/next_query_time` 列） |
| TC-C-05 | 超期关闭任务（超 expire_time 自动 CLOSED） | — | ❌ 出片（同上，S4；S3 备好 `markClosed` 入口与 `PayCloseReasons`） |

> 22 C 类无独立 TC 对应 08 C4（商户配置最小集）/C5（账单在途锁定）：C4 由 S2/S2.5 资产覆盖——`PayChannelConfigBootstrapTest#createsDefaultSubjectAndEnvRow`、`PaySubjectChannelConfigServiceTest`（双主体隔离/凭证解密）、`PayMerchantSubjectResolveTest`（小区→默认回落、缺映射 2001）、`PayAuthFinderDbTest#getByMerchantCodeFindsRegisteredAndMissesUnknown`、`PayEntityDdlConsistencyTest#entityColumnsMatchDdlExactly`；C5 即 TC-A-05 行。

## 越权/防漏网（TC-A-02、TC-X-08 交叠面，组 D 增量）

| 场景 | 自动化覆盖 |
|---|---|
| 组 D 三控制器零豁免 + 无 token 1003 | `PayGroupDControllerTest#groupDControllersAreNotPublicAnnotated`、`#anonymousRequestsRejected1003`、`#payMethodsMissingContextRejected1003`；`PayOpenApiAuthCoverageTest` 自动枚举（含 `/v1/merchants/{merchant_code}/pay-methods` 路径变量型） |
| 路径变量 merchant_code 越权复查（拦截器不提取→服务层） | `PayMethodQueryDbTest#pathVariableMerchantScopeRechecked`（allowed_merchant_ids 外→1002；命中→放行） |

## E2E 冒烟（S3 组 D T12.3，运行态）

新 jar（组 D 代码）经 `scripts/paycenter/run-local.ps1` 启动后断言，执行记录见组 D 交付报告：

1. `GET /v1/ping` → code=0000（匿名，Shiro 放行 + 豁免注解）；
2. 无 token `POST /v1/pay/orders` → HTTP 200 信封 code=1003（默认拒绝，运行态验证拦截器挂载生效）；
3. `POST /v1/token` 错 secret/未知 app_id → code=1002。

## GAP 汇总（不得虚标，供 verify/S4 参考）

| # | 条目 | 级别 | 归因与去向 |
|---|---|---|---|
| 1 | TC-C-03 `fee_amount` 真实有值 | P0 部分 | 一期通道报文不回传手续费（04 文档），流水仅透传 `pay_order.fee_amount` 管道已就绪；数据源属对账二期。列值呈现与聚合已由 `PayTradeQueryDbTest` 覆盖 |
| 2 | TC-C-04 超时查单任务 | P0（08 C6） | spec §3.5 非目标 → S4 交付；`pay_order.query_round/next_query_time` 本期未置位（有意留给 S4） |
| 3 | TC-C-05 超期关闭任务 | P0（08 C6） | 同上 → S4；`markClosed`/`PAY_CLOSED` 任务入口本期已就绪 |
| 4 | 回调推送（08 A6 / TC-F-01/02 / PAY_SUCCESS 任务实际推送） | P0（08 A6） | S4 范围（spec §3.5）；S3 已落 `pay_callback_task` PENDING 行（payload 断言见 `PayOrderConfirmPaidDbTest`/`PayOrderQueryCloseDbTest`） |
| 5 | TC-A-15/16/17 端到端 HTTP 运行态（鉴权全链路打真实服务） | — | 单测为 MockMvc standalone + 服务层真实 MySQL；运行态由 E2E 冒烟第 2 条 + `PayOpenApiAuthCoverageTest` 组合覆盖，全链路真实 token 下单链 E2E 归 verify |
