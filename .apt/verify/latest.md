# Verify Report

**Plan:** 无独立 plan（B-1 bug 轻链；对照锚点 = 任务描述修复点 1-4 + .apt/batch/queue.md B-1 收敛记录）
**Overall:** PASS
**Date:** 2026-10-24

## Summary
| 维度 | 结果 |
|------|------|
| Plan 对照 | SKIP（无 plan 对照模式；轻链锚点 4 修复点全落地：4 接口 vaMchntNo→主商户号、refund vaFld 补 satType+satInfo、oriMerOrderId 落库链路、先红后绿测试） |
| 架构 audit | PASS（audit_arch_changes since=last-scan(bd474c4e)：modified/new/deleted/unregistered 四类皆空；layerRulesUnchecked 为既有 WARN） |
| 设计 audit | SKIP（无 UI/前端设计知识层变更） |
| 产品对齐 | PASS（.ai/product/last-scan.json fileHashes 逐个 SHA256 核验全 MATCH，含 B-1 入列提交翻动 approved 的 _pages.md；无 unansweredConcerns） |
| logic 同步 | PASS（降级核验：仓内 scripts/check-logic-sync.cjs 缺失（git 历史从未提交），改以 git diff HEAD 核验 designs/v0 + .apt/create 零变更，无产品源↔代码失配面；脚本缺失记 WARN 待 APT 工具链修复） |
| Connect 门禁 | SKIP（无 .apt/connect 接线账本） |
| 契约登记 | PASS（纯 Java 改动，无新增对外 TS 类型/接口） |
| 可检索性 | PASS（search_arch 命中 UnionPayChannel/IPayRefundOrderService/PayRefundOrder，sourcePath 与现网一致） |
| 代码质量 | PASS（scoped paycenter：0 high / 0 medium 触达本切片改动文件；仓级 9040 issues 为 jeecgboot-vue3 等前端既有历史债，沿 S5 verify 口径不判本切片） |
| 测试/构建 | PASS（UnionPay*Test 117/117 绿；编排层 PayOrderCreateDbTest 等 4 个 DbTest 57/57 绿；Flyway V20261024_1 应用成功 schema→v20261024.1） |
| 测试用例覆盖率 | SKIP（B-1 无新增 designs/v0/*/test-cases.md；回归断言由 UnionPayChannelQueryRefundCloseTest 承载：vaMchntNo==MID、refund vaFld 恰 4 键、satInfo 五字段） |
| 外部 Harness | SKIP（无触发） |

## Harness
SKIP：无外部 Harness 触发。

## Plan Coverage
无 plan → SKIP。轻链锚点逐项：
| 修复点 | 结果 | 证据 |
|--------|------|------|
| 1. queryOrder/queryRefund/refund/closeOrder vaMchntNo→主商户号 | PASS | UnionPayChannel.mainMchntConfig() 统一取 cfg.getMainMchntNo()，缺则 1001；测试断言报文头 vaMchntNo==MID |
| 2. refund vaFld 补 satType+satInfo 单条 | PASS | vaFld 恰 4 键（newShopFlag/isSubMchntPay/satType/satInfo）；satInfo={merId=子商户号, refundOrderId, refundAmt, oriMerOrderId, payBear=Y} |
| 3. oriMerOrderId 落库链路 | PASS | Flyway V20261024_1 加 pay_order.sub_mchnt_order_id；PayOrder 实体 + buildOrder 落库 + PayRefundTradeService 快照读取 + ChannelRefundRequest.oriMerOrderId |
| 4. 先红后绿测试 | PASS | UnionPayChannelQueryRefundCloseTest 断言改写后先红（修复前 vaMchntNo==子商户号）后绿（117/117） |

## Failures
- 无

## 备注
- **联调证据（后绿受限）**：对订单 14BF202610240012553580655363 发 online/query——请求 vaMchntNo=898****2255（主商户号），HTTP 200 到达业务查询阶段（非 SA16 平台拒单），返回 NO_ORDER；JDBC 查库该单 status=CLOSED（未支付已关单，银商侧老化不可查），NO_ORDER 无法区分红/绿。「主商户号查询返回订单详情」列为**待用户确认项**（需一笔未支付活跃订单或新建 1 分单，未授权 create 副作用故未自建）。
- **真实退款/关单涉及资金，未执行**，列入待用户确认：需人工实付 1 分后设 PAY_UNIONPAY_LIVE_PAID_ORDER_ID + PAY_UNIONPAY_LIVE_SUB_ORDER_ID 跑 UnionPayLiveTest#refundOnPaidOrder。
- **存量订单风险**：2026-10-24 前落库订单 sub_mchnt_order_id=null，对其退款会被 validateRefund 以 1001（oriMerOrderId 必填）拦截——符合预期（分账退款无 oriMerOrderId 必被银商拒），需运营侧知悉。
- **WARN**：scripts/check-logic-sync.cjs 仓内缺失（AGENTS.md 引用之），本轮以 git diff 人工降级核验；建议 APT 工具链回补脚本。

## Recommended next steps
- Overall **PASS** → backend 子模块提交 fix(paycenter) → 主仓提交子模块指针 → batch_complete_slice(B-1, done) → playbook-gate → batch_lock_release → push upstream
- 待用户确认：真实退款/关单资金操作、主商户号查询后绿返回订单详情
