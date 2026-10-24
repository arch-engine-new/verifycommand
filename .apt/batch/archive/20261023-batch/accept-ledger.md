# APT 批量台账（batch-mcp 渲染视图）
> 共 10 条｜真源 .apt/batch/batch.db｜本文件为 .apt/batch/batch.db 的单向渲染视图，请勿手改；手改将被对账器判定为漂移并结构化拒绝

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
