# APT 批量队列（batch-mcp 渲染视图）
> 共 13 项（done x1 / parked x4 / archived x8）｜真源 .apt/batch/batch.db｜本文件为 .apt/batch/batch.db 的单向渲染视图，请勿手改；手改将被对账器判定为漂移并结构化拒绝

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
- 泊车：有
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
- 泊车：有
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
- 泊车：有
- 依赖：S1(F-1), S3(F-3), S4(F-4)

## F-6
- 类型：feature
- 优先级：P0
- 标题：S2.5 多支付主体（pay_subject 主商户 + 商户×主体子商户号映射 + 订单主体快照）
- 收敛记录：目的：支付中心对接多个支付主体。银商侧一个支付主体（APP/公众号/小程序/H5）= 一个主商户号，经该主体收款的物业公司为其下子商户。
边界：
1) 新表 pay_subject：subject_code(uk)、subject_name、scene(APP/WECHAT_MP/MINI_PROGRAM/H5，新增字典)、channel_code、main_mchnt_no、main_term_no、app_id、app_key_enc、comm_key_enc、msg_src、msg_src_id、notify_sign_type、key_version、wx_sub_appid（主体的微信 appid）、status、审计字段、del_flag。凭证每主体一套（用户确认），AES-GCM 加密，明文不入日志/聊天。
2) 新表 pay_merchant_subject：merchant_id、subject_id、project_id(可空=商户默认)、sub_mchnt_no、sub_term_no、status；uk(merchant_id,subject_id,project_id)。子商户号按 商户×主体(×小区) 配置（用户确认）；pay_merchant.unionpay_mchnt_no/unionpay_term_no/wx_sub_appid 与 pay_merchant_project.unionpay_mchnt_no/term_no 下线（表均 0 行，无数据迁移）。
3) pay_channel_config 降级为环境级：保留 api_base_url/backup_base_urls/超时/限流；凭证列迁至 pay_subject。env bootstrap（PAY_UNIONPAY_APP_ID 等）改为仅在本地开发引导默认主体或移除，由执行体在 spec 中定。
4) pay_app 加 subject_id：一个应用绑定一个主体，订单主体由调用方 app 决定（用户确认，不加 subjectCode 入参）。
5) pay_order、pay_refund_order 加 subject_id 快照；查单/退款/关单/退款查询按快照取主体凭证。
6) S2 适配：PayChannelConfigService.getActive(channel) → 按 subjectId 取运行时配置（环境级+主体级合并、缓存、失效）；Channel*Request 增 subjectId；通知验签先按 mchntOrderId/refundOrderId 查单定位主体取 comm_key，查不到时按订单号前 4 位来源编号匹配主体，均失败则验签失败；单号生成器的来源编号改为取主体 msg_src_id。
7) S3：下单解析 app→subject→pay_merchant_subject(小区优先，否则商户默认)，缺映射返回明确错误码；/v1/merchants/{code}/pay-methods 按主体判断。S5：后台增加「支付主体」管理页与商户弹窗内的子商户号映射配置（凭证脱敏只显示是否已配置，可重置不可回显），新增菜单与权限。
验收：14+2 表 DDL 与实体一致性测试通过；Flyway 迁移成功（flyway_schema_history 校验)；两个主体各自凭证下单/查单/退款/通知验签路由正确的单测；同一物业公司在两个主体下解析出不同子商户号；缺映射报错；日志不含任何凭证明文；/verify 通过。
- 截图：无
- 分流：schema 变更 → $apt-schema-design → $apt-schema-apply（需用户原话门禁「评审通过，执行 apply」或「表设计完成」，执行体不得自确认）→ S2 适配 + F-3/F-4/F-5 spec 修订 → plan_from_spec → implement_plan → verify → finish_feature
- 测试策略：单测+mapper 冒烟+多主体路由/验签单测；/verify 门禁
- 确认：已确认
- 泊车：无
- 依赖：依赖 F-2 完成；必须在 F-3 之前执行（F-3/F-4/F-5 spec 按新模型修订后再实现）

## F-7
- 类型：feature
- 优先级：P3
- 标题：编排调度记录（S2.5 让位泊车，非业务需求）
- 收敛记录：本行仅为让 userOverride 泊车 F-3/F-4/F-5 的结构化入队载体（schema 要求 items>=1）。用户 2026-10-20 确认 order=before_s3：S2.5（F-6）必须在 S3 之前执行；泊车为让位，S2.5 与 spec 修订完成后 S3/S4/S5 将重入队。非业务需求，不生成切片。
- 截图：无
- 分流：编排记录
- 测试策略：-
- 确认：已确认
- 泊车：有
- 依赖：无

## F-8
- 类型：feature
- 优先级：P1
- 标题：S3 交易核心与内部接口（/v1 鉴权默认拒绝+防漏网、10 个对内接口、状态机、流水、通知处理）
- 收敛记录：目的：实现 02 §3.1–3.5/3.8–3.12 对内 OpenAPI 与支付/退款状态机（08 A1–A5,A7–A11,C1–C5）。边界：放行 /v1/** 与默认拒绝拦截器+防漏网测试同一 Task；创建支付单 7 步校验；账单在途 Redis 锁；条件更新状态机；流水与回调任务同事务；实现 S2 PayNotifyHandler；不做回调推送/定时任务(S4)、后台(S5)、部分退款/多账单(二期)。验收：spec R1–R14（R14=S2.5 修订新增：下单解析 app→pay_app.subject_id 绑定主体→pay_merchant_subject 小区优先/''回落，缺映射 2001 上下文文案；pay_order/pay_refund_order 落 subject_id 快照；单号来源编号用 PayNoGenerator 按主体重载）（含 22 文档 A/C 类 P0 用例自动化）。spec: docs/superpowers/specs/2026-10-20-paycenter-s3-trade-core-design.md（已按 S2.5 修订）
- 截图：无
- 分流：需求·已确认 直跑（mini-spec 用户确认，risk high 已当场人批）：plan_from_spec → implement_plan → verify → finish_feature
- 测试策略：-
- 确认：已确认
- 泊车：无
- 依赖：S1(F-1), S2(F-2), S2.5(F-6 done)

## F-9
- 类型：feature
- 优先级：P1
- 标题：S4 可靠性闭环（回调推送重试/超时查单关单/退款补查/冲突补偿/多实例互斥/钉钉告警）
- 收敛记录：目的：所有失败有闭环，满足不丢单/不重复/无悬挂（08 A6、C6 + arch-review extraRequirements）。边界：回调 X-Sign 推送 1/2/4/8/16min×5→FAILED+告警+人工重推；查单 2min 起递进、3 次 UNKNOWN 告警；超时先查后关；退款补查 24h 转人工；冲突幂等；回调任务补建；悬挂检测；钉钉加签/去重/限流/脱敏；@Scheduled+Redis 锁+行级领取；不做对账/通道切换/UI。验收：spec R1–R13（R13=S2.5 修订新增：查单/关单/回调推送按 subject_id 快照取主体凭证与网关环境，MockWebServer→JDK HttpServer 表述）。spec: docs/superpowers/specs/2026-10-20-paycenter-s4-reliability-design.md（已按 S2.5 修订）
- 截图：无
- 分流：需求·已确认 直跑（mini-spec 用户确认，risk high 已当场人批）：plan_from_spec → implement_plan → verify → finish_feature
- 测试策略：-
- 确认：已确认
- 泊车：无
- 依赖：S1(F-1), S2(F-2), S2.5(F-6 done), S3(F-8)

## F-10
- 类型：feature
- 优先级：P2
- 标题：S5 操作后台 8 页（后台 API + 拉取 jeecgboot-vue3 v3.9.5 前端 + frontend-connect + 支付主体管理）
- 收敛记录：目的：交付操作后台 MVP（08 H1–H7 + S2.5 新增支付主体页）。边界：拉取官方 JeecgBoot v3.9.5 的 jeecgboot-vue3 到 frontend/（用户已确认许可）；/paycenter/admin/** 后台 API + @RequiresPermissions；8 页按 designs/v0/<page>/page.logic.md（支付主体页与商户弹窗映射配置待 $apt-create --refine 产出 page.logic 增量后实现）；回调 FAILED 人工重推；脱敏；写 pay_admin_log（SUBJECT_* 动作字典增量）；不做对账/费率/三级开关/审核流。验收：spec R1–R11+R14（含每页 test-cases.md 与 frontend-connect 门禁）。运行时验收 /apt-accept 待用户提供银联商户号/子商户号后手动触发。spec: docs/superpowers/specs/2026-10-20-paycenter-s5-admin-console-design.md（已按 S2.5 修订）
- 截图：无
- 分流：需求·已确认 直跑（mini-spec 用户确认）：plan_from_spec → implement_plan → connect($apt-frontend-connect) → verify → finish_feature
- 测试策略：accept-batch
- 确认：已确认
- 泊车：无
- 依赖：S1(F-1), S2.5(F-6 done), S3(F-8), S4(F-9)

## F-11
- 类型：feature
- 优先级：P1
- 标题：配置银商生产环境凭证（UNIONPAY_MAIN 主体 + 子商户号映射）
- 收敛记录：目的：配置银商生产环境凭证，使 paycenter 银联通道对接生产。
边界：1) application-dev.yml bootstrap 下补充 mid/tid/msg-src/msg-src-id 的 ${PAY_UNIONPAY_*:} 环境变量绑定；2) 设置环境变量 PAY_UNIONPAY_ENV=PROD, PAY_UNIONPAY_BASE_URL=https://api-mop.chinaums.com, PAY_UNIONPAY_BOOTSTRAP_MID=898500100012255, PAY_UNIONPAY_BOOTSTRAP_TID=5S6FL2VZ, PAY_UNIONPAY_BOOTSTRAP_MSG_SRC_ID=14BF, PAY_UNIONPAY_MSG_SRC_ID=14BF, 以及 appId/appKey/commKey/msgSrc（待用户提供）；3) 录入 pay_merchant_subject 子商户号 898500100012257（默认主体 UNIONPAY_MAIN + 商户级映射 project_id=''）。不开发新功能。
已确认：env=PROD, apiBaseUrl=https://api-mop.chinaums.com, mid=898500100012255, tid=5S6FL2VZ, msgSrcId=14BF, 子商户号=898500100012257（默认主体+商户级映射）。
待提供：appId, appKey, commKey, msgSrc（用户稍后提供）。
验收：1) yml bootstrap 有 mid/tid/msg-src/msg-src-id 的环境变量绑定；2) PAY_UNIONPAY_* 环境变量正确设置（含敏感凭证）；3) pay_merchant_subject 表有 sub_mchnt_no=898500100012257 的商户级映射；4) 启动后 pay_subject 表 UNIONPAY_MAIN 主体 main_mchnt_no=898500100012255, main_term_no=5S6FL2VZ, msg_src_id=14BF 且凭证已配置。
- 截图：无
- 分流：轻链：配置变更（yml 补充环境变量绑定 + 环境变量设置 + 子商户号录入），无需新 spec，≤2 子任务
- 测试策略：accept-batch
- 确认：待确认（敏感凭证 appId/appKey/commKey/msgSrc 待用户提供）
- 泊车：无
- 依赖：无

## B-1
- 类型：bug
- 优先级：P1
- 标题：银联查询/退款/退款查询/关单 vaMchntNo 对齐主商户号 + 退款补 satInfo 分账明细
- 收敛记录：复现：用子商户号 vaMchntNo 对已创建订单发查询/退款/关单 → 预期银商查无此单或拒单（订单创建于主商户号 898500100012255 下）。期望：queryOrder/refund/queryRefund/closeOrder 四处 vaMchntNo 改取主体级 mainMchntNo（与已验证下单基准一致）；refund 在分账模式（satType=01）下补 vaFld.satInfo（merId/refundOrderId/refundAmt/oriMerOrderId，PDF：satRule=01/03 只允许退 1 级子订单）。影响面：UnionPayChannel.queryOrder/refund/queryRefund/closeOrder 及退款/查询/关单编排调用方传值链路；通知验签已审计无差异。对照依据：docs/unionpay/chinaums-api-cheatsheet.md §2.2-2.5。
- 截图：无
- 分流：轻链：/feature §0.2 落痕 → 片内写复现测试（先红后绿）→ verify；联调先红（子商户号查询已建单被拒）后绿（主商户号通过）
- 测试策略：-
- 确认：AI 自答（证据: PDF 逐接口审计报告 + 已验证下单基准报文 vaMchntNo=主商户号 + UnionPayChannel.java 四处当前取子商户号快照；未经用户确认——PDF 对查询/退款/关单仅写"商户号"未明确主/子，最终以联调先红后绿为准）
- 泊车：无
- 依赖：无

## F-12
- 类型：feature
- 优先级：P2
- 标题：银商通道进出 HTTP 报文落库留痕（pay_channel_message）
- 收敛记录：目的：银商通道全量进出 HTTP 报文持久化留痕，替代当前仅 DEBUG 日志（paycenter.unionpay.raw）的方案，支撑联调排障与对账审计。
边界——做：新建报文留痕表（pay_channel_message），在 UnionPayHttpClient 统一出入口拦截落库，覆盖下单/查询/退款/退款查询/关单 5 接口的请求+响应原文（body 无密钥，签名在 Authorization 头不落）、api 类型、respCode、HTTP 状态、耗时、关联 mchntOrderId、时间戳；脱敏规则不适用（用户已定原文）。不做：不落 Authorization 头（含签名）；不动现有 pay_notify_record 回调留痕；不改报文结构；本期仅银商，表预留 channel 字段。
验收：①5 接口任一调用后 DB 可查对应请求+响应记录，字段完整可按 mchntOrderId 检索；②落库失败不阻断主交易（异步/捕获降级）；③单测覆盖拦截器写库路径。
- 截图：无
- 分流：全链：auto_brainstorm → plan_from_spec → implement_plan → verify → finish_feature
- 测试策略：-
- 确认：已确认
- 泊车：无
- 依赖：无
