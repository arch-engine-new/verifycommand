# 工作台

## 操作明细

| 操作 | 触发 | 结果 | 确认 | 角色 |
|------|------|------|------|------|
| 进入工作台 | 登录成功后默认落地 / 点击左侧菜单「工作台」 | 调 A10 今日概览统计 + 通道健康探活，渲染 4 张指标卡、通道健康条、商户收款 Top5（切换菜单即刷新，见 20 §9.1） | 无 | 全部登录用户（管理员、运营） |
| 待处理退款「去处理 →」 | 点击指标卡「待处理退款」上的链接（或整卡） | 跳转退款处理页，并带状态筛选 `status=REFUNDING`（原型仅跳转，未带筛选，PRD 要求，原型未实现） | 无 | 全部登录用户 |
| 需人工核查「查看 →」 | 点击指标卡「需人工核查」上的链接（或整卡） | 跳转退款处理页，并带筛选 `manualCheck=1`（原型仅跳转，未带筛选，PRD 要求，原型未实现；原型卡名为「UNKNOWN 待核查」，原型与 PRD 不一致，以 PRD 为准） | 无 | 全部登录用户 |
| 刷新概览 | 重新进入本页 / 切换菜单回到本页 | 重新调 A10 + 探活，覆盖展示数据 | 无 | 全部登录用户 |

> 本页为只读概览，无写操作，无需二次确认；不写操作日志。

## 主流程

1. 用户登录后默认进入工作台（或从左侧菜单切换进入）。
2. 前端并行调用 A10 今日概览统计（`getDashboardOverview`）与通道健康探活（`getChannelHealth`）。
3. 渲染 4 张指标卡：今日支付成功（笔数 + 金额）、今日退款（笔数 + 金额）、待处理退款数、需人工核查数。
4. 渲染通道健康条：银联通道连通性（近 1h 成功率）、各支付方式开通情况、超时查单任务运行状态。
5. 渲染「今日各商户收款 Top5」表格。
6. 用户点击「去处理 →」/「查看 →」跳转退款处理页（带状态筛选）处理异常单。

> 仅快乐路径。错误/空态见「状态」。

## 状态

- `loading`：指标卡、通道健康条、Top5 表格分别显示骨架屏（Jeecg `a-skeleton` / `a-spin`），互不阻塞。（PRD 要求加载，原型未实现，原型为静态演示数据）
- `empty`：今日无交易时指标卡显示 `0 笔 / ¥0.00`（不显示空态插画）；Top5 表格显示「今日暂无收款」EmptyState。（原型未实现）
- `forbidden`：本页管理员、运营均可访问，正常不出现；token 失效/无角色时按 Jeecg 全局规则跳登录页或显示 403。
- `error`：A10 或探活失败时对应区域显示 Alert「概览数据加载失败」+「重试」按钮，错误码按 10 文档映射为用户文案（20 §9.1），不裸奔错误码。（原型未实现）
- `success`：数据正常展示，无 Toast。通道健康异常（探活失败或成功率低于阈值）时，健康条对应项与指标区变红并提示「银联通道异常」（20 §9.2「通道健康异常时卡变红并提示」，PRD 要求，原型未实现；原型仅有绿色「正常」静态展示）。

## 字段与列

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| todayPaidCount | number | yes | 只读（指标卡「今日支付成功」笔数） | StatCard |
| todayPaidAmount | number（元，2 位小数） | yes | 只读（指标卡「今日支付成功」金额，¥ 千分位） | StatCard |
| todayRefundCount | number | yes | 只读（指标卡「今日退款」笔数，口径：今日 REFUND_SUCCESS） | StatCard |
| todayRefundAmount | number（元，2 位小数） | yes | 只读（指标卡「今日退款」金额） | StatCard |
| pendingRefundCount | number | yes | 只读（指标卡「待处理退款」，琥珀色；口径：退款单 REFUNDING） | StatCard |
| manualCheckCount | number | yes | 只读（指标卡「需人工核查」，红色；口径：支付单/退款单 `manual_check=1` 合计，来源超时查单任务告警，PRD 01 §7.3）。原型卡名「UNKNOWN 待核查」，原型与 PRD 不一致：UNKNOWN 不是我方状态，以 PRD 为准 | StatCard |
| unionpayChannelStatus | enum（NORMAL / ABNORMAL） | yes | 只读（通道健康条「银联通道：正常/异常」，异常变红） | HealthBar |
| unionpaySuccessRate1h | number（%） | yes | 只读（近 1h 下单/查询成功率） | HealthBar |
| methodWechatEnabled | boolean | no | 只读（「微信支付：已开通」，原型有、PRD P2 未提及，保留） | HealthBar |
| methodAlipayEnabled | boolean | no | 只读（「支付宝：已开通」，原型有、PRD P2 未提及，保留） | HealthBar |
| methodUnionpayCardEnabled | boolean | no | 只读（「银行卡/云闪付：已开通（银联统一收银台）」，对应支付方式 UNIONPAY_CARD，借记/贷记不分开；原型有、PRD P2 未提及，保留） | HealthBar |
| timeoutQueryJobStatus | enum（RUNNING / STOPPED） | no | 只读（「超时查单任务：运行中」，原型有、PRD P2 未提及，保留） | HealthBar |
| top5.merchantName | string | yes | 表格列「商户」 | DataTable 列 |
| top5.paidCount | number | yes | 表格列「笔数」 | DataTable 列 |
| top5.paidAmount | number（元） | yes | 表格列「金额」 | DataTable 列 |
| top5.feeAmount | number（元） | yes | 表格列「手续费」 | DataTable 列 |
| top5.netAmount | number（元） | yes | 表格列「净额」（= 金额 − 手续费） | DataTable 列 |

> Top5 表格原型有、PRD P2 未提及，保留；数据建议并入 A10 返回。

## 查询参数

| 参数名 | 含义 | 默认值 |
|--------|------|--------|
| 无 | 本页无筛选；统计日固定为「今日」（服务端自然日） | — |

## 数据契约

| 项 | 值 | 说明 |
|----|----|------|
| volumeClass | bounded-small | Top5 表格固定最多 5 行 |
| 增长性 | 固定 Top5，不随业务增长 | 服务端排序截断后返回 |
| 列表分页预期 | client-side-ok | 不分页，一次性展示 |

## 选项数据源

（本页无下拉）

## 校验

| 规则 | 范围 | 说明 |
|------|------|------|
| 无 | — | 本页只读，无表单输入 |

## 权限

- 页级：登录即可；管理员、运营两个 Jeecg 角色均可进入（20 §2：运营可用页面含工作台）。
- 角色差异：无。两角色看到的指标、健康条、Top5 与跳转入口一致（二期按商户数据权限隔离时再区分）。
- 跳转退款处理页后的退款发起/重试权限由退款处理页控制（管理员、运营均可）。

## 导航

- 路由：/paycenter/dashboard
- 菜单挂载点：首筑支付中心操作后台/工作台（左侧菜单第 1 项，登录后默认首页）
- 菜单机制类型：db-driven
- 需权限：否

## 依赖

- API 意向名：getDashboardOverview（A10 今日概览统计：指标卡 + Top5）, getChannelHealth（通道健康探活：银联连通性/近 1h 成功率/各支付方式开通/超时查单任务状态，20 §9.2 要求与 A10 同时加载，20 §5 未单列，建议并入 A10 或作为 A10 子接口）
- 跳转目标：退款处理页 `/paycenter/refunds?status=REFUNDING`、`/paycenter/refunds?manualCheck=1`（依赖退款处理页支持该筛选，A7 退款单列表需支持 `manual_check` 条件）
- 语义组件 id：PageHeader, StatCard, HealthBar, DataTable, EmptyState, Alert
- 演示日来源：FixtureAPI.TODAY
