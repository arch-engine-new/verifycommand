# APT 批量台账（batch-mcp 渲染视图）
> 共 17 条｜真源 .apt/batch/batch.db｜本文件为 .apt/batch/batch.db 的单向渲染视图，请勿手改；手改将被对账器判定为漂移并结构化拒绝

## L-1
- batch：batch-1
- item：F-1
- 类型：acceptance-unit
- 记录：2026-10-20T15:32:04.052Z
- 数据：{"aiSelfAnswered":false,"criteria":"mvn package 成功且 start jar 含 paycenter 模块; 14 实体与 DDL 列集合完全相等; 加解密/锁/限流/防重放/单号单测通过; flyway 20261020.1/.2 success=1; 12 字典 15 菜单按钮 26 授权 5 协议入库; 未登录 GET /v1/ping 返回 0000 且回写 X-Trace-Id","reproduction":null,"sliceId":"F-1","status":"pending-acceptance"}

## L-2
- batch：batch-1
- item：F-2
- 类型：acceptance-unit
- 记录：2026-10-20T15:32:04.052Z
- 数据：{"aiSelfAnswered":false,"criteria":"OPEN-BODY-SIG 签名向量单测通过; 下单/查询/退货/退货查询/关单 MockWebServer 用例通过; 状态与错误映射全覆盖; 通知验签/幂等/分发/应答用例通过; 日志无密钥明文; unionpay-live 测试在用户提供参数后真实下单返回 appPayRequest","reproduction":null,"sliceId":"F-2","status":"pending-acceptance"}

## L-3
- batch：batch-1
- item：F-3
- 类型：acceptance-unit
- 记录：2026-10-20T15:32:04.052Z
- 数据：{"aiSelfAnswered":false,"criteria":"全部非公开 /v1 接口无 token 返回 1003; 创建支付单 7 类错误码用例通过; 同账单 16 并发仅 1 成功; 退款全额/PAID/360 天/失败回 PAID 用例通过; 状态机并发只生效一次且流水与回调任务各 1 条; 22 文档 A/C 类 P0 用例自动化全部通过","reproduction":null,"sliceId":"F-3","status":"pending-acceptance"}

## L-4
- batch：batch-1
- item：F-4
- 类型：acceptance-unit
- 记录：2026-10-20T15:32:04.052Z
- 数据：{"aiSelfAnswered":false,"criteria":"回调 X-Sign 正确且 5 次退避后 FAILED 并告警; 人工重推可用; 双实例不重复推送; 超时查单补捞 PAID 与 3 次 UNKNOWN 告警; 过期单先查后关; 退款补查与 24h 人工核查; 回调任务丢失可补建; 钉钉加签/去重/限流/脱敏且失败不阻断","reproduction":null,"sliceId":"F-4","status":"pending-acceptance"}

## L-5
- batch：batch-1
- item：F-5
- 类型：acceptance-unit
- 记录：2026-10-20T15:32:04.052Z
- 数据：{"aiSelfAnswered":false,"criteria":"frontend/ 为 jeecgboot-vue3 v3.9.5 且 build 成功; admin 登录可见支付中心 6 个菜单; 运营无商户写权限; 7 页按 page.logic.md 可用且每页 test-cases.md 关键用例自动化; 所有写操作写 pay_admin_log; 响应无 *_enc 且商户号仅末 4 位; frontend-connect 门禁 PASS","reproduction":null,"sliceId":"F-5","status":"pending-acceptance"}

## L-6
- batch：-
- item：-
- 类型：attestation
- 记录：2026-10-20T23:00:18.039Z
- 数据：{"evidence":"2026-10-21 07:00 用户在本会话回复「授权派发」，回应我列出的预授权清单：派发单个后台执行体按 F-1→F-5 串行执行；允许派发子 Agent、读写本仓库文件、执行终端命令（mvn、docker exec、git commit、pnpm、拉取 jeecgboot-vue3 前端仓库、启动本地应用）。平台=Cursor，支持后台子 Agent（Task run_in_background）。","kind":"dispatchFlip"}

## L-7
- batch：-
- item：-
- 类型：attestation
- 记录：2026-10-20T23:02:26.623Z
- 数据：{"evidence":"同 2026-10-21 07:00 用户「授权派发」；主仓已提交 efca5d7、backend 嵌套仓已提交 fa310dc（分支 paycenter），工作区前置满足后重调。","kind":"dispatchFlip"}

## L-8
- batch：-
- item：-
- 类型：attestation
- 记录：2026-10-20T23:02:49.248Z
- 数据：{"evidence":"同 2026-10-21 07:00 用户「授权派发」；前两次翻转留痕已提交，工作区已洁后重调。","kind":"dispatchFlip"}

## L-9
- batch：-
- item：F-3,F-4,F-5
- 类型：attestation
- 记录：2026-10-21T09:35:11.207Z
- 数据：{"evidence":"用户 2026-10-20 确认 order=before_s3；S2.5（F-6，P0）必须在 F-3 之前执行且 F-3/F-4/F-5 spec 需按新支付主体模型修订。泊车 F-3/F-4/F-5 让位，完成后 S3/S4/S5 重入队继续。","itemIds":["F-3","F-4","F-5"],"kind":"userOverride"}

## L-10
- batch：batch-2
- item：F-11
- 类型：acceptance-unit
- 记录：2026-10-22T11:27:59.294Z
- 数据：{"aiSelfAnswered":false,"criteria":"yml bootstrap 有 mid/tid/msg-src/msg-src-id 环境变量绑定；PAY_UNIONPAY_* 环境变量正确设置（含 appId/appKey/commKey/msgSrc）；pay_merchant_subject 有 sub_mchnt_no=898500100012257 商户级映射；启动后 pay_subject UNIONPAY_MAIN 凭证正确","reproduction":null,"sliceId":"F-11","status":"pending-acceptance"}

## L-11
- batch：batch-3
- item：B-1
- 类型：acceptance-unit
- 记录：2026-10-23T20:23:50.484Z
- 数据：{"aiSelfAnswered":true,"criteria":"①queryOrder/refund/queryRefund/closeOrder 四处 vaMchntNo 均上送主体级主商户号（与已验证下单基准一致）；②refund 分账模式补 vaFld.satInfo（merId/refundOrderId/refundAmt/oriMerOrderId）；③复现测试先红后绿全绿；④生产联调：主商户号查询/退款/关单各一次不再被拒（先红=子商户号查无此单证据留痕）","reproduction":"片内复现测试：UnionPayChannelQueryRefundCloseTest 断言请求体 vaMchntNo=主商户号（先红=当前为子商户号）；生产复现：对订单 14BF202610240012553580655363 用子商户号 898500100012257 发 online/query 预期查无此单","sliceId":"B-1","status":"pending-acceptance"}

## L-12
- batch：-
- item：-
- 类型：attestation
- 记录：2026-10-24T01:15:32.752Z
- 数据：{"evidence":"用户 2026-10-24 显式指令「批准入列并修复，然后重新走验收流程」——平台侧预授权（子 agent 派发/读写/执行）核对通过，由用户当轮指令直接授权","kind":"dispatchFlip"}

## L-13
- batch：-
- item：-
- 类型：attestation
- 记录：2026-10-24T01:18:58.366Z
- 数据：{"evidence":"用户 2026-10-24 显式指令「批准入列并修复，然后重新走验收流程」；main-session-commit 前置已清（主仓两笔提交：backend 4b4eff0 报文修复 + 速查表、APT 管理面与 goal.md）——平台侧预授权核对通过","kind":"dispatchFlip"}

## L-14
- batch：-
- item：-
- 类型：attestation
- 记录：2026-10-24T01:20:59.503Z
- 数据：{"evidence":"用户 2026-10-24 显式指令「批准入列并修复，然后重新走验收流程」；main-session-commit 已清（accept-ledger.md 已补提交，剩余 batch.db/tool-call-log 为豁免清单内工具自写产物）","kind":"dispatchFlip"}

## L-15
- batch：batch-4
- item：F-12
- 类型：acceptance-unit
- 记录：2026-10-24T10:09:58.385Z
- 数据：{"aiSelfAnswered":false,"criteria":"银商下单/查询/退款/退款查询/关单 5 接口调用后 DB（pay_channel_message）可查对应请求+响应原文记录，字段含 api 类型/respCode/HTTP 状态/耗时/mchntOrderId/时间戳；落库失败降级不阻断主交易；单测覆盖写库路径","reproduction":null,"sliceId":"F-12","status":"pending-acceptance"}

## L-16
- batch：-
- item：-
- 类型：attestation
- 记录：2026-10-24T10:12:07.358Z
- 数据：{"evidence":"用户在 intake 停车线后明确指令「run,」（--start 手动触发等价），当面授权派发后台执行体跑 F-12 全链（2026-10-24 会话）","kind":"dispatchFlip"}

## L-17
- batch：-
- item：-
- 类型：attestation
- 记录：2026-10-24T10:13:28.257Z
- 数据：{"evidence":"用户明确指令「run,」授权派发；主仓已提交（0b03c97）工作区已洁，precondition 应通过（2026-10-24 会话）","kind":"dispatchFlip"}
