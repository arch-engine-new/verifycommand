# APT 批量队列（batch-mcp 渲染视图）
> 共 5 项（pending x5）｜真源 .apt/batch/batch.db｜本文件为 .apt/batch/batch.db 的单向渲染视图，请勿手改；手改将被对账器判定为漂移并结构化拒绝

## F-1
- 类型：feature
- 优先级：P1
- 标题：S1 工程骨架与基础设施（paycenter 模块/配置/14 实体/加解密/Trace/锁/限流/防重放/单号/错误码/初始化数据）
- 收敛记录：目的：交付可启动的 jeecg-module-paycenter 及全部基础设施，供 S2–S5 复用。边界：做 spec §3.1 全部；不做银联调用(S2)/对内接口(S3)/任务(S4)/UI(S5)；Shiro 仅放行 /v1/ping 与 /notify/unionpay/**。验收：spec 需求锁定表 R1–R13（含 Flyway 20261020.1/.2 success=1、/v1/ping 匿名 0000、X-Trace-Id 回写）。spec: docs/superpowers/specs/2026-10-20-paycenter-s1-foundation-design.md；plan 已由用户确认 approved: docs/apt/plans/2026-10-20-paycenter-s1-foundation-plan.md（直接从 implement_plan 开始）。
- 截图：无
- 分流：需求·已确认 直跑（plan 已 approved）：implement_plan → verify → finish_feature
- 测试策略：-
- 确认：已确认
- 泊车：无
- 依赖：无

## F-2
- 类型：feature
- 优先级：P1
- 标题：S2 银联通道适配（OPEN-BODY-SIG/下单/查询/退货/退货查询/关单/通知验签幂等）
- 收敛记录：目的：实现银联商务新购物车 APP 支付通道适配器（08 B1–B5，04 文档）。边界：通道抽象+路由、配置加密加载、签名、5 接口、状态/错误映射、超时限流 9200 退避、通知接收验签幂等分发、脱敏日志、unionpay-live 真实联调测试骨架；不做状态机(S3)/回调与任务(S4)/主备切换/分账/对账/Mock 通道。验收：spec R1–R12（MockWebServer 单测；真实联调在 /apt-accept 阶段用用户提供参数执行）。spec: docs/superpowers/specs/2026-10-20-paycenter-s2-unionpay-channel-design.md
- 截图：无
- 分流：需求·已确认 直跑（mini-spec 用户确认，risk high 已当场人批）：plan_from_spec → implement_plan → verify → finish_feature
- 测试策略：-
- 确认：已确认
- 泊车：无
- 依赖：S1(F-1)

## F-3
- 类型：feature
- 优先级：P1
- 标题：S3 交易核心与内部接口（/v1 鉴权默认拒绝+防漏网、10 个对内接口、状态机、流水、通知处理）
- 收敛记录：目的：实现 02 §3.1–3.5/3.8–3.12 对内 OpenAPI 与支付/退款状态机（08 A1–A5,A7–A11,C1–C5）。边界：放行 /v1/** 与默认拒绝拦截器+防漏网测试同一 Task；创建支付单 7 步校验；账单在途 Redis 锁；条件更新状态机；流水与回调任务同事务；实现 S2 PayNotifyHandler；不做回调推送/定时任务(S4)、后台(S5)、部分退款/多账单(二期)。验收：spec R1–R13（含 22 文档 A/C 类 P0 用例自动化）。spec: docs/superpowers/specs/2026-10-20-paycenter-s3-trade-core-design.md
- 截图：无
- 分流：需求·已确认 直跑（mini-spec 用户确认，risk high 已当场人批）：plan_from_spec → implement_plan → verify → finish_feature
- 测试策略：-
- 确认：已确认
- 泊车：无
- 依赖：S1(F-1), S2(F-2)

## F-4
- 类型：feature
- 优先级：P1
- 标题：S4 可靠性闭环（回调推送重试/超时查单关单/退款补查/冲突补偿/多实例互斥/钉钉告警）
- 收敛记录：目的：所有失败有闭环，满足不丢单/不重复/无悬挂（08 A6、C6 + arch-review extraRequirements）。边界：回调 X-Sign 推送 1/2/4/8/16min×5→FAILED+告警+人工重推；查单 2min 起递进、3 次 UNKNOWN 告警；超时先查后关；退款补查 24h 转人工；冲突幂等；回调任务补建；悬挂检测；钉钉加签/去重/限流/脱敏；@Scheduled+Redis 锁+行级领取；不做对账/通道切换/UI。验收：spec R1–R12。spec: docs/superpowers/specs/2026-10-20-paycenter-s4-reliability-design.md
- 截图：无
- 分流：需求·已确认 直跑（mini-spec 用户确认，risk high 已当场人批）：plan_from_spec → implement_plan → verify → finish_feature
- 测试策略：-
- 确认：已确认
- 泊车：无
- 依赖：S1(F-1), S2(F-2), S3(F-3)

## F-5
- 类型：feature
- 优先级：P2
- 标题：S5 操作后台 7 页（后台 API + 拉取 jeecgboot-vue3 v3.9.5 前端 + frontend-connect）
- 收敛记录：目的：交付操作后台 MVP 7 页（08 H1–H7）。边界：拉取官方 JeecgBoot v3.9.5 的 jeecgboot-vue3 到 frontend/（用户已确认许可）；/paycenter/admin/** 后台 API + @RequiresPermissions；7 页按 designs/v0/<page>/page.logic.md；回调 FAILED 人工重推；脱敏；写 pay_admin_log；不做对账/费率/三级开关/审核流。验收：spec R1–R11（含每页 test-cases.md 与 frontend-connect 门禁）。运行时验收 /apt-accept 待用户提供银联商户号/子商户号后手动触发。spec: docs/superpowers/specs/2026-10-20-paycenter-s5-admin-console-design.md
- 截图：无
- 分流：需求·已确认 直跑（mini-spec 用户确认）：plan_from_spec → implement_plan → connect($apt-frontend-connect) → verify → finish_feature
- 测试策略：accept-batch
- 确认：已确认
- 泊车：无
- 依赖：S1(F-1), S3(F-3), S4(F-4)
