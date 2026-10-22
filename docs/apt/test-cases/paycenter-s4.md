# paycenter S4 可靠性闭环 · 自动化用例清单（A6/C6 收口）

> 真源：`paycenter/22-支付验收测试用例.md` B/C/F/X 类 P0（08 §一 A6 业务回调簇、C6 超时查单/关闭簇）+ `paycenter/08-功能两期拆分.md` §三 第 4、5 条（不丢单、不重复）与附:上线门禁 #7 兜底任务、#8 监控告警。
> 三方对照：spec `docs/superpowers/specs/2026-10-20-paycenter-s4-reliability-design.md` §4 R1–R13 ↔ 22 文档用例 ↔ 自动化测试（类#方法）。
> 测试仓：`backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter`（分支 paycenter，基线 HEAD 148f21d）。
> 通道口径：全程通道桩 `UnionPayMockServer`（S2/S3 资产）+ 回调接收端 `CallbackMockServer` / 钉钉接收端 `DingTalkMockServer`（均 JDK HttpServer，plan 1.1 冻结，不用 MockWebServer）；时间线用可推进 `MutableClock` 注入，退避/递进不真实等待。
> 全量执行：`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test`（需先 dot-source `. scripts/paycenter/run-local.ps1 -EnvOnly` 注入真实 MySQL/Redis 环境变量）。组 A–C 于 HEAD 148f21d 实测 **463 全绿**；S4 组 D T15 于同一 HEAD 工作树零改动复核仍 **463 全绿**（failures=0 / errors=0 / skipped=0，59 个测试类）。S4 新增测试类 11 个共 77 条，另 `PayCenterPropertiesTest` 增量 2 条（组 B/C 配置面），相关 12 类合计 83 条。

## spec R ↔ 22 用例 ↔ 测试类总对照

| spec R | 需求 | 22 用例 | 主测试类 |
|---|---|---|---|
| R1 | 回调推送报文与 X-Sign 签名（02 §3.6/§3.7） | TC-X-07（发送面）/ TC-B-05（推送环节） | `PayCallbackSignerTest`、`PayCallbackDispatcherDbTest` |
| R2 | 重试 1/2/4/8/16 分钟×5 → FAILED + 告警 | 08 A6「指数退避重试 ≤5 次」（22 无独立 TC，散见 TC-B-05 预期链） | `PayCallbackDispatcherDbTest` |
| R3 | 人工重推（manualRetry + CALLBACK_RETRY 字典） | 用户追加要求（22 无独立 TC） | `PayCallbackServiceDbTest` |
| R4 | 多实例不重复处理 | 用户追加要求 / arch-review lock | `PayCallbackDispatcherDbTest`、`PayConflictTakeoverDbTest` |
| R5 | 超时查单（2 分钟起、递进、UNKNOWN×3 告警） | TC-C-04 / TC-B-11 | `PayOrderQueryJobDbTest` |
| R6 | 超时关单（先查后关） | TC-C-05 | `PayOrderCloseJobDbTest` |
| R7 | 退款补查与 24h 人工核查 | TC-B-09（+04 §6） | `PayRefundQueryJobDbTest` |
| R8 | 状态冲突幂等与补偿 | TC-X-03（P1 交叠）/ TC-B-07（S3 通知侧） | `PayConflictTakeoverDbTest`、`PayOrderCloseJobDbTest` |
| R9 | 回调任务丢失补建（Reconcile） | 用户追加要求（支撑门禁 #7） | `PayCallbackReconcileJobDbTest` |
| R10 | 悬挂检测摘要告警 | 08 §三.4（无悬挂支付单） | `PayHangingJobDbTest` |
| R11 | 钉钉告警：加签/去重/限流/脱敏/失败不阻断 | TC-R-08（P1 交叠） | `PayAlertServiceTest`、`PayDingTalkSignerTest` |
| R12 | 任务开关、批量上限、traceId 透传、优雅停机 | 门禁 #7（兜底任务已上线并验证） | 各 job 测试类通用组 + `PayCenterPropertiesTest` |
| R13 | S2.5 主体快照一致性（查单/关单/退款补查按单 `subject_id` 路由） | 22 无独立用例（架构收敛项） | `PayOrderQueryJobDbTest`、`PayOrderCloseJobDbTest`、`PayRefundQueryJobDbTest` |

## A6 簇 P0 逐条映射（业务回调推送，08 §一 A6）

| 用例/场景 | 名称 | 自动化覆盖（类#方法） | 状态 |
|---|---|---|---|
| TC-B-05 | 支付成功通知 → PAID → 回调业务系统 PAY_SUCCESS | S3 通知侧 `PayTradeNotifyHandlerDbTest`（入账+任务落库）；S4 推送侧 `PayCallbackDispatcherDbTest#happyPushVerifiesHeadersBodyAndSign`（body=payload 列原文（02 §3.6）、`X-Timestamp`=yyyyMMddHHmmss(GMT+8)、`X-Nonce` 32 位随机、`X-Sign` 接收方按同式复核一致、Content-Type JSON、成功写回 SUCCESS/retry_count=0/last_http_status/last_response） | ✅ 自动化 |
| TC-F-01 | 账单回写-已缴（回调驱动） | 支付中心侧语义=「推送到达且按成功判定」：`#happyPushVerifiesHeadersBodyAndSign`（HTTP200+code=0000 判成功）；`PayCallbackReconcileJobDbTest#refundedOrderRebuildsPaySuccess`（PAID/REFUNDED 单 PAY_SUCCESS 任务应有而缺→补建可推）。物业侧账单回写本身在业务系统，见 GAP #3 | ✅ 自动化（中心侧） |
| TC-F-02 | 账单回写-已退（REFUND_SUCCESS/FAIL 回调） | `PayCallbackReconcileJobDbTest#terminalRefundOrdersRebuildRefundTasks`（终态退款单任务补建）；推送报文透传与 §3.6 同链路（payload 生成在 S3 写侧，`PayRefundQueryConfirmDbTest` 断言任务落库） | ✅ 自动化（中心侧） |
| TC-X-07 | 回调伪造 X-Sign（验签口径） | 发送方签名可复核性：`PayCallbackSignerTest#signMatchesIndependentVector`、`#vectorCrossCheckWithJdkMac`、`#signIsSensitiveToEveryInput`、`#signOutputContainsNoSecret`、`#timestampFormatsGmt8SecondPrecision`、`#nonceIs32AlnumAndUnique`、`#headersConstantNamesMatchContract`；接收方按同式复算一致断言在 `#happyPushVerifiesHeadersBodyAndSign`（app_secret 取下单应用解密） | ✅ 自动化 |
| 08 A6 退避 | 指数退避 1/2/4/8/16 分钟×5 → FAILED + 告警 1 次 | `PayCallbackDispatcherDbTest#backoffTimelineFiveFailuresThenFailedWithSingleAlert`（MutableClock 逐档断言 T0→+1m→+3m→+7m→+15m→第 5 次用尽 FAILED+manual_check=1，`CALLBACK_FAILED` 告警恰 1 条含 biz_no+traceId，终态后不再推送）；`#thirdAttemptSuccessStopsRetrying`（第 3 次成功停止，不再告警）；`#http200WithWrongCodeCountsAsFailure`（200 但 code≠0000 判失败）；retry_count/last_http_status/last_error 截断断言同方法内 | ✅ 自动化 |
| 08 A6 人工重推 | manualRetry 重置 PENDING + retry_count 归零 + 操作日志（action=CALLBACK_RETRY） | `PayCallbackServiceDbTest#manualRetryResetsFailedTaskAndWritesAdminLog`、`#manualResetTaskIsPushedAgainByDispatcher`、`#manualRetryRejectsPushingAndUnknownTask`；字典增量 `V20261022_1` Flyway 运行态验证（本文档 E2E #2） | ✅ 自动化 |
| spec §3.1 撤销 | notify_url 推送前复查白名单，撤销即 FAILED+告警不推送 | `PayCallbackDispatcherDbTest#whitelistRevokedFailsWithoutPush`（`CALLBACK_URL_REJECTED`，接收端零请求） | ✅ 自动化 |
| R4 | 多实例不重复（租约领取） | `PayCallbackDispatcherDbTest#doubleInstanceExactlyOncePerTask`（两 Dispatcher 实例并发同批 20 任务→每任务接收端恰 1 次）；`#pushingLeaseExpiryReclaimedAndFreshLeaseSkipped`（60s 租约到期接管、新租约不抢）；`PayConflictTakeoverDbTest#dispatcherStopAcceptingSkipsClaimAndExpiredLeaseReclaimed` | ✅ 自动化 |

## C6 簇 P0 逐条映射（支付单/退款兜底任务，08 §一 C6）

| 用例 | 名称 | 自动化覆盖（类#方法） | 状态 |
|---|---|---|---|
| TC-C-04 | 超时查单任务（通知丢失补捞、3 次 UNKNOWN 告警） | `PayOrderQueryJobDbTest#paidConvergesViaConfirmPaidWithQuerySourceFlowAndSingleTask`（PAID→`confirmPaid` 一次+query source 流水+回调任务 1 条）；`#ladderTimelineFiveSecondsToFiveMinutes`（2min 起 5s/30s/60s→5min 递进）；`#unknownThirdRoundSetsManualCheckWithSingleAlert`（UNKNOWN×3→`manual_check=1`+`UNKNOWN_QUERY` 告警 1 条且继续查）；`#closedQueryMarksChannelClosed`（CLOSED→`markClosed`）；`#channelExceptionKeepsPostponementWithoutStateChange`（通道异常不改状态仅推后）；下单初始化 `next_query_time=create+2min` 由 `PayOrderCreateDbTest#createSuccessPersistsOrderWithSubjectSnapshot` 断言（组 B 增量） | ✅ 自动化 |
| TC-C-05 | 超期关闭任务（超 expire_time 自动 CLOSED，无悬挂单） | `PayOrderCloseJobDbTest#expiredUnpaidOrderClosesChannelThenMarksTimeout`（先查后关：查为 WAIT→通道关单+CLOSED(TIMEOUT)）；`#expiredButPaidOrderConvergesPaidAndNeverCloses`（过期但已付→收敛 PAID 不关单）；`#channelCloseFailureDoesNotBlockLocalTimeout`、`#queryExceptionStillClosesTimeout`（通道尽力而为）；`#closedOrderQueriedPaidAlertsWithoutChangingOrder`（已关单回查 PAID→`CLOSE_AFTER_QUERY` 告警不改单，02 资金异常语义） | ✅ 自动化 |
| TC-B-09 | 退款 UNKNOWN 兜底（5s/30s/60s/5min 补查收敛） | `PayRefundQueryJobDbTest#ladderTimelineWithNullNextQueryFallbackInit`（递进+next_query_time 空值兜底自管）；`#explicitDueNextQueryTimeScannedDirectly`；`#successConvergesViaConfirmResultWithFlowTaskAndOrderLinkage`（SUCCESS→`confirmResult`+流水+REFUND_SUCCESS 任务+原单 REFUNDED）；`#failConvergesBackToPaidWithTaskAndNoFlow`（FAIL→原单回 PAID+REFUND_FAIL 任务）；`#channelExceptionRetriesNextRoundAndOtherRowsStillProcessed` | ✅ 自动化 |
| TC-B-11 | 下单后状态 UNKNOWN 查单兜底 ≥3 次后告警 | S3 侧不落成功态（`PayOrderCreateDbTest` 七步链）；S4 侧同 TC-C-04 的 `#ladderTimelineFiveSecondsToFiveMinutes` + `#unknownThirdRoundSetsManualCheckWithSingleAlert` 覆盖 | ✅ 自动化 |
| 04 §6 / R7 | 退款 >24h 未明确 → manual_check + 告警（继续查） | `PayRefundQueryJobDbTest#overTwentyFourHoursSetsManualCheckWithSingleAlertAndKeepsQuerying`（`REFUND_TIMEOUT_24H` 告警恰 1 条）；`#underTwentyFourHoursDoesNotAlert` | ✅ 自动化 |

## 失败闭环与补偿（08 §三 4/5、用户追加「各种失败的处理闭环」）

| 场景 | 自动化覆盖（类#方法） | 状态 |
|---|---|---|
| R8 通知与查单并发确认 PAID 仅 1 次生效、无异常外抛、回调任务 1 条 | `PayConflictTakeoverDbTest#concurrentNotifyAndQueryConfirmPaidAppliesExactlyOnce`（双线程同刻竞态）；`PayOrderCloseJobDbTest#queryAndCloseJobsConvergeRowOnceWithoutDoubleWrite`（两 job 竞同一行） | ✅ 自动化 |
| R9 回调任务丢失补建（近 24h 终态单「应有而缺」→幂等重建） | `PayCallbackReconcileJobDbTest#paidOrderMissingTaskRebuiltExactlyOnceAndIdempotent`（删任务→补 1 条，uk 幂等重复轮不重复补）、`#existingTaskInAnyStatusIsNotRebuilt`、`#closedOrderRebuildsPayClosedWithSnapshotReason`、`#refundedOrderRebuildsPaySuccess`、`#terminalRefundOrdersRebuildRefundTasks`、`#nonTerminalOutsideWindowNotRebuilt` | ✅ 自动化 |
| R10 悬挂检测摘要（超时 WAIT_PAY / 超 24h REFUNDING / FAILED 计数>0） | `PayHangingJobDbTest#threeHangingKindsProduceOneSummaryWithCountsAndSamples`（一条 `HANGING_SUMMARY` 摘要含计数与单号样本）、`#noHangingSendsNothing` | ✅ 自动化 |
| 优雅停机 @PreDestroy 停领取、租约他实例接管 | `PayConflictTakeoverDbTest#queryJobStopAcceptingThenPeerTakesOverAfterLease`、`#dispatcherStopAcceptingSkipsClaimAndExpiredLeaseReclaimed`、`#reconcileStopAcceptingBlocksRebuild`；`PayHangingJobDbTest#stopAcceptingEmitsNothing`；`PayCallbackReconcileJobDbTest#stopAcceptingBlocksRebuild` | ✅ 自动化 |
| TC-X-03（P1）通知风暴不告警刷屏 | `PayAlertServiceTest#sameTypeAndBizKeySuppressedWithinWindow`（同键 10 分钟去重 SETNX）、`#rateLimitTwentyDirectThenStormSummaryOnNextWindow`（>20 条/分钟合并「告警风暴」摘要）、`#scheduledFlushEmitsStormWithoutNewEvents`（窗口滚过补发） | ✅ 自动化（顺带） |

## 告警基建与通用 job 基建（R11/R12/R13）

| 场景 | 自动化覆盖（类#方法） | 状态 |
|---|---|---|
| R11 钉钉加签 | `PayDingTalkSignerTest#signMatchesIndependentVector`、`#vectorCrossCheckWithJdkMac`、`#signIsUrlSafeEncoding`、`#signedUrlAppendsTimestampAndSign`、`#signedUrlUsesQuestionMarkWhenNoQuery`、`#signSensitiveToInputs` | ✅ 自动化 |
| R11 未配置降级/失败不阻断/脱敏/异步 | `PayAlertServiceTest#unconfiguredWebhookDegradesToErrorLogWithoutHttp`、`#startupWarnsOnceWhenWebhookMissing`、`#webhookFailure500LoggedAsErrorNeverThrows`、`#contentCarriesEnvBizKeyTraceAndSignParamsWithoutSecret`（含 traceId/业务单号/env，不含密钥、完整商户号、app_pay_request）、`#eventDeliveryIsDeferredToAlertExecutor` | ✅ 自动化 |
| R12 开关/每轮上限/默认值 | `PayCenterPropertiesTest#jobsDefaultsAndOverrides`、`#paycenterBJobsNodesAndByName`（query/close/refundQuery byName+松绑定+未知名 null）、`#paycenterCJobsAndAlertMasking`（reconcile/hanging byName+alert webhook/secret toString 脱敏+env-name 绑定）；各 job：`PayCallbackDispatcherDbTest#disabledSwitchSkipsPollEntirely`/`#batchLimitCapsPerRound`、`PayOrderQueryJobDbTest`/`PayOrderCloseJobDbTest`/`PayRefundQueryJobDbTest`/`PayHangingJobDbTest` 同名方法、`PayCallbackReconcileJobDbTest#disabledSwitchSkipsPollEntirely`/`#batchLimitCapsScanPerRound` | ✅ 自动化 |
| R12 job 线程 traceId 透传 | `PayOrderQueryJobDbTest#roundLogsAndAlertShareRoundTraceId`（本轮日志与告警共享同一 traceId）；`#backoffTimelineFiveFailuresThenFailedWithSingleAlert` 内告警 traceId 断言 | ✅ 自动化 |
| R13 查单按行 `subject_id` 快照路由 | `PayOrderQueryJobDbTest#queriesUseSubjectSnapshotPerRow`（两主体各一单，同轮扫描每请求路由各自 subjectId/商户号/终端号/渠道单号） | ✅ 自动化 |
| R13 关单/退款补查按单快照路由 | `PayOrderCloseJobDbTest#expiredButPaidOrderConvergesPaidAndNeverCloses` 与 `#expiredUnpaidOrderClosesChannelThenMarksTimeout` 内查单/关单请求 subjectId=订单行快照断言；`PayRefundQueryJobDbTest#successConvergesViaConfirmResultWithFlowTaskAndOrderLinkage` 内退货查询请求取退款单 subject_id 快照断言 | ✅ 自动化 |
| R13 回调推送凭证取下单应用 | `PayCallbackDispatcherDbTest#happyPushVerifiesHeadersBodyAndSign`（app_secret 由任务所属 pay_app 解密，签名按该 secret 复核） | ✅ 自动化 |
| R13 快照缺失→9999 兜底分支 | job 层无独立用例（见 GAP #5：subject_id NOT NULL 约束 + S3 创建侧 `PayRefundCreateDbTest#missingSubjectSnapshotRejected2001` 前置拒绝） | ⚠️ 约束兜底 |

## E2E 运行态（S4 组 D T16，新 jar 真实启动，本切片执行记录）

新 jar（HEAD 148f21d 打包，`jeecg-system-start-3.9.5.jar`，2026-10-22 09:13）经 `scripts/paycenter/run-local.ps1` 启动（pid 6920，`/v1/ping` 于 180s 内 200），逐项断言：

1. **Flyway 增量**：`flyway_schema_history` `version='20261022.1'` → `success=1` ✅（脚本 `V20261022_1__paycenter_s4_dict.sql`，幂等 ON DUPLICATE，未改 V20261020/1021/1022 已执行序列）。
2. **字典项**：`sys_dict_item` `id='pc_di_pal_CALLBACK_RETRY' AND status=1` → COUNT=1 ✅；`pay_admin_log_action` 全列 10 项，`CALLBACK_RETRY` sort=10 在位。
3. **鉴权冒烟**（沿用组 D S3 法）：`GET /v1/ping` → code=0000 ✅；无 token `POST /jeecg-boot/v1/pay/orders` → code=1003 ✅。
4. **启动日志**（`.apt/paycenter-run.log`，脱敏 grep）：`paycenter alert dingtalk webhook not configured` WARN **恰 1 次**（line 240，09:15:12）✅；启动完成标记 line 268（Tomcat）/283（Started 72.9s）；按日志级别判定的 ERROR 行 **0 条**（排除消息文本含「ERROR logs」字样的 WARN 误匹配）✅。
5. **env 嵌套占位解析生效确认**：伪造签名通知探测（`POST /notify/unionpay/pay`，探针单号 E2E-PROBE-SIGN-INVALID，非真实资金单）→ 应答 `FAILED`；line 301 通知侧告警事件发布 WARN（带 HTTP 线程 traceId）；line 303 钉钉降级 ERROR 行 `[env=TEST]`——`${PAY_ALERT_ENV_NAME:${paycenter.unionpay.bootstrap.env:TEST}}` 嵌套占位在运行态解析生效 ✅。附带验证 spec §3.5「未配置仅 ERROR 日志降级」运行态语义；`pay_notify_record` 留痕 1 行（status ERROR / sign invalid）。**注**：降级路径在去重/限流**之前**返回（`PayAlertService#handle` L197-199 设计），故本地未配 webhook 时 Redis 观察不到 `paycenter:alert:dedup:*`/`paycenter:alert:rate:*` 键族属预期，该两键族功能由组 C 单测（真 Redis+ListAppender）覆盖。
6. **job 运行取证**（不强等首轮，方式说明）：本地库 `pay_order`/`pay_callback_task` 空闲（0 行），各 job 空轮**按设计静默**（轮次日志门槛 `processed>0`/`rebuilt>0`：`PayOrderQueryJob` L85-88、`PayReconcileSupport` L109-111 等，组 B/C 既有语义）。取证=① `application-dev.yml` L471-508 六 job 节点在位（callback 5s/query 10s/close 30s/refund-query 60s/**reconcile 600000ms=10min**/**hanging 3600000ms=1h**，enabled=true/batch-limit=100）；② `PayCenterPropertiesTest#paycenterBJobsNodesAndByName`/`#paycenterCJobsAndAlertMasking` 实证 `byName("reconcile"/"hanging")` 可定位+默认启用（463 绿内）；③ 运行日志 job 报错行（`processing failed|rebuild failed|round.*error`）0 条、调度器异常（`Unexpected error occurred in scheduled task`）0 条 ✅。
7. 结束后应用**保持运行**（pid 6920，供 verify）。

## GAP 汇总（不得虚标，供 verify/上线专项参考）

| # | 条目 | 级别 | 归因与去向 |
|---|---|---|---|
| 1 | 钉钉真实网络投递（webhook 配置后的生产发送） | P1（TC-R-08） | 本地未配 webhook，运行态仅验证「未配置降级 ERROR 日志」路径（E2E #5）；去重/限流/风暴/加签全链由组 C 单测（JDK HttpServer `DingTalkMockServer`）覆盖。真实接通=上线门禁 #8 生产专项 |
| 2 | 双实例进程级（两 JVM）E2E | P0 交叠（R4） | 以进程内双实例并发测试替代（`doubleInstanceExactlyOncePerTask` 等）——防重机制=行级条件更新领取+Redis 租约，不依赖进程边界；真实双进程部署验证归生产拓扑专项（arch-review 多实例适配） |
| 3 | TC-F-01/02 物业侧账单回写端到端 | P0（跨系统） | 支付中心侧「推送到达+成功判定+任务闭环」已自动化（A6 簇表）；业务系统按 X-Sign 验签入账为物业侧实现，不在本仓测试边界 |
| 4 | TC-R-02 回调地址公网可达 | P0（生产） | 银联→我方公网回推可达性=生产部署专项（需要公网 HTTPS 域名），本地 Mock 通道不适用 |
| 5 | R13「快照缺失→9999 兜底」job 层独立用例 | must 内边缘分支 | `pay_order/pay_refund_order.subject_id` NOT NULL 物理约束 + S3 创建侧 `missingSubjectSnapshotRejected2001` 前置拒绝，job 扫描行必然带快照；spec 判据「理论上不可能」如实登记 |
| 6 | reconcile/hanging 运行态首轮日志痕迹 | 门禁 #7 | 空闲轮静默为组 B/C 既有设计（避免刷屏）；本地无在途数据可催生首轮痕迹，按 plan 许可改用「yml 节点+byName 测试+job 零报错」组合取证（E2E #6）；生产环境有流量时自然可观测 |
| 7 | 回调真实外网投递（业务系统公网地址） | P0 交叠（TC-B-05 推送段） | 以 `CallbackMockServer`（JDK HttpServer，验三头+签名+成功判定）替代；公网 TLS/连通性归 TC-R-02 同批生产专项 |
