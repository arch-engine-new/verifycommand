# 交易查询（P4）

## 操作明细

| 操作 | 触发 | 结果 | 确认 | 角色 |
|------|------|------|------|------|
| 进入交易查询 | 点击左侧菜单「交易查询」 | 以默认条件（时间范围=今天，其余为空）调 A6 `listPayOrders` 加载第 1 页支付单列表（切换菜单即刷新，20 §9.1）。原型进入后列表区 `#tradeTable` 为空、从未渲染：PRD 要求，原型未实现 | 无 | 全部登录用户（管理员、运营） |
| 输入单号 | 在「单号」输入框输入 | 可匹配支付单号 `pay_order_id` / 业务单号 `biz_order_no` / 退款单号 `refund_order_id`；命中退款单号时，列表返回其原支付单（通过 A7 定位）。原型占位符只写「支付单号/业务单号」，缺少退款单号：PRD 要求，原型未实现 | 无 | 全部登录用户 |
| 选择商户 | 「商户」下拉 | 设置商户筛选条件；默认「全部商户」 | 无 | 全部登录用户 |
| 选择支付方式 | 「支付方式」下拉 | 设置支付方式筛选：微信 WECHAT / 支付宝 ALIPAY / 银行卡 UNIONPAY_CARD；默认「全部方式」。借记/贷记不分开，成交卡种只在列表与详情里按 `card_attr` 展示 | 无 | 全部登录用户 |
| 选择状态 | 「状态」下拉 | 设置支付单状态筛选：WAIT_PAY / PAID / REFUNDING / REFUNDED / CLOSED；默认「全部状态」。原型只有 PAID / WAIT_PAY / CLOSED / REFUNDED，缺少 REFUNDING：原型与 PRD 不一致，以 01 §7 状态总表为准 | 无 | 全部登录用户 |
| 筛选「需人工核查」 | 「需人工核查」下拉（全部 / 是 / 否） | 按 `manual_check` 标记筛选（01 §7「运营后台可筛选」）。PRD 要求，原型未实现 | 无 | 全部登录用户 |
| 选择时间范围 | 起止日期选择器（Jeecg `a-range-picker`） | 设置下单时间范围；默认今天至今天，跨度最长 90 天（见「校验」）。原型默认值写死为 2026-08-19：原型与 PRD 不一致，以 PRD「默认今天」为准 | 无 | 全部登录用户 |
| 查询 | 点击「查询」按钮 | 校验时间范围后，带全部筛选条件调 A6 `listPayOrders`，回到第 1 页刷新列表。原型只弹 toast「已按条件查询（演示数据固定）」：PRD 要求，原型未实现 | 无 | 全部登录用户 |
| 重置 | 点击「重置」按钮 | 筛选条件恢复默认值（时间范围=今天）并重新查询。Jeecg 列表页惯例，原型与 PRD 均未提及，作为标准交互补充 | 无 | 全部登录用户 |
| 翻页 / 改每页条数 | 表格底部分页器 | 带当前筛选条件调 A6 拉取对应页（服务端分页，20 §9.4「列表…分页」）。PRD 要求，原型未实现 | 无 | 全部登录用户 |
| 查看支付单详情 | 点击列表行（或行内「详情」） | 打开「支付单详情」弹窗，调 A6 `getPayOrderDetail` 展示基本信息、items 账单明细、银联流水号、手续费、结算日、关联退款单、交易流水。原型有弹窗壳 `#tradeModal`，但无打开入口、`#tradeDetail` 无内容：PRD 要求，原型未实现 | 无 | 全部登录用户 |
| 查看关联退款单（联动） | 在详情弹窗「关联退款单」区点击退款单号 | 关闭弹窗，跳转退款处理页并按该退款单号筛选（`/paycenter/refunds?refundNo=xxx`）。PRD 要求，原型未实现 | 无 | 全部登录用户 |
| 关闭详情 | 点击弹窗「关闭」按钮 / 遮罩 / 右上角关闭 | 关闭弹窗，列表与筛选状态保持不变 | 无 | 全部登录用户 |
| 导出 CSV | 点击「导出 CSV」按钮 | 一期不提供：按钮置灰或点击 toast「CSV 导出二期提供」（与原型一致）。二期接入导出接口 | 无 | 全部登录用户 |

> 本页为只读查询页，没有写操作，不需要二次确认，也不写操作日志。退款发起和重试在退款处理页完成。

## 主流程

1. 运营或管理员从左侧菜单进入「交易查询」，页面以默认条件（今天）调 A6 加载第 1 页支付单列表。
2. 按需填写单号、商户、支付方式、状态、需人工核查、时间范围，点击「查询」刷新列表。
3. 点击某行打开「支付单详情」弹窗，查看账单明细、银联流水号、手续费、结算日、成交卡种、关联退款单和交易流水。
4. 如需处理退款，在详情里点击关联退款单号跳转退款处理页；否则关闭弹窗继续查询。

> 仅快乐路径。错误/空态见「状态」。

## 状态

- `loading`：查询或翻页时表格显示 Jeecg 表格 loading（`a-table :loading`），筛选区保持可操作；详情弹窗加载时弹窗内显示 `a-spin`。（PRD 要求加载，原型未实现）
- `empty`：查询结果为空时表格显示 EmptyState「当前条件下暂无交易记录」，并提示可调整时间范围或筛选条件；详情里没有关联退款单时，该区域显示「暂无退款记录」。（原型未实现）
- `forbidden`：管理员、运营均可访问本页，正常不出现；token 失效或无角色时按 Jeecg 全局规则跳登录页或显示 403。
- `error`：A6/A7 调用失败时表格上方显示 Alert「交易数据加载失败」+「重试」按钮；详情加载失败时弹窗内显示 Alert +「重试」。错误码按 10 文档映射为用户文案，不直接展示错误码（20 §9.1）。（原型未实现）
- `success`：列表正常展示，无 Toast。列表上方常驻提示条：「状态口径：以支付中心回调/查询为准；标记『需人工核查』的单据请按流程核查，退款类单据请进入『退款处理』页处理。」原型提示文案为「UNKNOWN 单请进『退款处理』页核查」，但 01 §7 规定 UNKNOWN 不是我方状态，需人工核查是 `manual_check` 标记：原型与 PRD 不一致，以 01 状态总表为准。

## 字段与列

**筛选区字段**

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| orderNo | string | no | 表单（单号：支付单号 / 业务单号 / 退款单号，模糊或精确匹配由后端决定） | FormField(Input) |
| merchantId | string | no | 表单（商户下拉，默认全部） | FormField(Select) |
| payMethod | enum（WECHAT / ALIPAY / UNIONPAY_CARD） | no | 表单（支付方式下拉，默认全部；原型选项为中文「微信/支付宝/银行卡」） | FormField(Select) |
| status | enum（WAIT_PAY / PAID / REFUNDING / REFUNDED / CLOSED） | no | 表单（支付单状态下拉，默认全部） | FormField(Select) |
| manualCheck | boolean | no | 表单（需人工核查：全部 / 是 / 否；PRD 要求，原型未实现） | FormField(Select) |
| createdRange | date[]（起, 止） | yes | 表单（时间范围，默认今天~今天，最长 90 天） | FormField(RangePicker) |

**列表列（支付单）**

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| pay_order_id | string | yes | 表格列「支付单号」（主行加粗，下方灰字显示业务单号） | DataTable 列 |
| biz_order_no | string | yes | 表格列「业务单号」（与支付单号合并单元格展示） | DataTable 列 |
| merchant_name | string | yes | 表格列「商户」 | DataTable 列 |
| project_name | string | no | 表格列「小区」（`pay_order.project_id` 关联；原型与 PRD 列表均未列，可选列，默认隐藏） | DataTable 列 |
| total_amount | number（分，展示为元 2 位小数 + ¥ 千分位） | yes | 表格列「金额」 | DataTable 列 |
| refunded_amount | number（分→元） | no | 表格列「已退金额」（01 §8 一期补充字段；>0 时展示，否则「—」） | DataTable 列 |
| pay_method | enum（WECHAT / ALIPAY / UNIONPAY_CARD） | yes | 表格列「支付方式」（字典翻译为 微信 / 支付宝 / 银行卡） | DataTable 列 |
| card_attr | enum（DEBIT_CARD / CREDIT_CARD） | no | 表格列「卡种」（仅银行卡交易回填，字典翻译为 借记卡 / 贷记卡；非银行卡显示「—」） | DataTable 列 |
| status | enum（WAIT_PAY / PAID / REFUNDING / REFUNDED / CLOSED） | yes | 表格列「状态」（状态标签：WAIT_PAY 灰、PAID 绿、REFUNDING 琥珀、REFUNDED 蓝、CLOSED 灰；字典翻译为中文） | DataTable 列 + StatusTag |
| manual_check | boolean | no | 表格列「需人工核查」（为是时在状态旁显示红色「需人工核查」标记） | DataTable 列 + StatusTag |
| created_at | datetime | yes | 表格列「下单时间」（yyyy-MM-dd HH:mm:ss） | DataTable 列 |
| notify_time | datetime | no | 表格列「支付时间」（PAID 后有值，否则「—」） | DataTable 列 |
| action | — | — | 表格列「操作」（「详情」链接） | DataTable 列 |

**详情弹窗（只读）**

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| pay_order_id / biz_order_no / biz_user_id | string | yes | 只读（基本信息） | Descriptions |
| merchant_name / project_name | string | yes / no | 只读（基本信息） | Descriptions |
| total_amount / refunded_amount | number（分→元） | yes / no | 只读（基本信息） | Descriptions |
| pay_channel / pay_method / card_attr | enum | yes / yes / no | 只读（支付信息；card_attr 仅银行卡） | Descriptions |
| status / manual_check | enum / boolean | yes / no | 只读（状态 + 需人工核查标记） | Descriptions + StatusTag |
| unionpay_order_id | string | no | 只读（银联商户订单号 mchntOrderId） | Descriptions |
| channel_seq | string | no | 只读（银联流水号，取自 `txn_flow.channel_seq`；PRD「银联流水号」） | Descriptions |
| target_order_id | string | no | 只读（渠道订单号） | Descriptions |
| fee_amount | number（分→元） | no | 只读（手续费，通知/查询回填，未回填显示「—」） | Descriptions |
| settle_date | date | no | 只读（结算日，一期预留，空显示「—」） | Descriptions |
| created_at / notify_time / expire_time | datetime | yes / no / no | 只读（下单 / 支付 / 过期时间） | Descriptions |
| close_time / close_reason | datetime / string | no | 只读（仅 CLOSED 展示） | Descriptions |
| items[].biz_bill_no | string | yes | 只读子表列「业务账单号」 | DataTable 列 |
| items[].bill_type | enum（物业费 / 停车月租） | yes | 只读子表列「账单类型」 | DataTable 列 |
| items[].billed_period | string | no | 只读子表列「账期」 | DataTable 列 |
| items[].amount | number（分→元） | yes | 只读子表列「金额」 | DataTable 列 |
| refunds[].refund_order_id | string | yes | 只读子表列「退款单号」（可点击，联动跳转退款处理页） | DataTable 列 |
| refunds[].refund_amount | number（分→元） | yes | 只读子表列「退款金额」 | DataTable 列 |
| refunds[].status | enum（REFUNDING / REFUND_SUCCESS / REFUND_FAIL） | yes | 只读子表列「退款状态」（以 01 §7 状态总表为准，不使用 SUCCESS / FAIL / UNKNOWN） | DataTable 列 + StatusTag |
| refunds[].manual_check | boolean | no | 只读子表列「需人工核查」 | DataTable 列 |
| refunds[].reason / created_at | string / datetime | yes | 只读子表列「原因」「时间」 | DataTable 列 |
| flows[].type / amount / fee_amount / status / channel_seq / card_attr / create_time | 混合 | — | 只读子表「交易流水」（txn_flow：PAY / REFUND；20 §3「流水查询」以详情内子表承载） | DataTable 列 |

> 以上列表列、详情字段在原型中均未实现（`#tradeTable`、`#tradeDetail` 为空）：PRD 要求，原型未实现。卡种 `card_attr`、需人工核查 `manual_check`、已退金额 `refunded_amount` 来自 01 §8 一期补充字段。

## 查询参数

| 参数名 | 含义 | 默认值 |
|--------|------|--------|
| orderNo | 单号（支付单号 / 业务单号 / 退款单号） | 空 |
| merchantId | 商户 ID | 空（全部商户） |
| payMethod | 支付方式 WECHAT / ALIPAY / UNIONPAY_CARD | 空（全部方式） |
| status | 支付单状态 | 空（全部状态） |
| manualCheck | 需人工核查标记 1 / 0 | 空（全部） |
| createdFrom | 下单时间起（含） | 今天 00:00:00（FixtureAPI.TODAY） |
| createdTo | 下单时间止（含） | 今天 23:59:59 |
| pageNo | 页码 | 1 |
| pageSize | 每页条数 | 10（Jeecg 默认，可选 10 / 20 / 50） |

## 数据契约

| 项 | 值 | 说明 |
|----|----|------|
| volumeClass | unbounded | 支付单随缴费业务持续增长（工作台演示日成功约 1,286 笔/天） |
| 增长性 | 随业务增长，每日新增上千笔 | 全量支付单 + 关联退款单 + 流水 |
| 列表分页预期 | server-side | 必须服务端分页 + 时间范围上限 90 天，禁止前端全量拉取 |

## 选项数据源

| 字段 | 控件 | 来源 | 意向 API 或字典 type | value | label | 父字段(级联) | 加载时机 |
|------|------|------|----------------------|-------|-------|--------------|----------|
| merchantId | Select（可搜索） | api | listMerchantOptions（A2 商户列表精简版） | merchant_id | merchant_name | 无 | mount |
| payMethod | Select | dict | pay_method | WECHAT / ALIPAY / UNIONPAY_CARD | 微信 / 支付宝 / 银行卡 | 无 | mount |
| status | Select | dict | pay_order_status | WAIT_PAY / PAID / REFUNDING / REFUNDED / CLOSED | 待支付 / 支付成功 / 退款中 / 已退款 / 已关闭 | 无 | mount |
| manualCheck | Select | dict | yn（Jeecg 内置是/否字典） | 1 / 0 | 是 / 否 | 无 | mount |

> 原型商户下拉硬编码「重庆龙湖物业 / 金科物业服务集团」两项、状态下拉硬编码 4 个状态码：终态改为 api / dict。列表与详情中的 `card_attr`（字典 `card_attr`：DEBIT_CARD 借记卡 / CREDIT_CARD 贷记卡）、退款状态（字典 `refund_order_status`）、账单类型（字典 `bill_type`）仅用于翻译展示，不作为筛选项。

## 校验

| 规则 | 范围 | 说明 |
|------|------|------|
| required | createdRange | 时间范围不能为空，提示「请选择时间范围」 |
| cross-field | createdFrom ≤ createdTo | 起始日期不能晚于结束日期，提示「开始日期不能晚于结束日期」 |
| cross-field（max span） | createdTo − createdFrom ≤ 90 天 | 超出提示「查询时间跨度最长 90 天」，不发起请求；后端同样校验。PRD 要求，原型未实现 |
| trim | orderNo | 单号去除首尾空格后提交 |

## 权限

- 页级：登录即可；管理员、运营两个 Jeecg 角色都可进入（20 §2：运营可用页面含交易查询，权限含「查单」）。
- 角色差异：无。两个角色看到的筛选、列表、详情和联动跳转一致；本页没有写操作。二期按商户数据权限隔离后，运营只能查自己负责的物业公司。
- 联动跳转后的退款发起和重试权限由退款处理页控制（管理员、运营均可）。

## 导航

- 路由：/paycenter/trades
- 菜单挂载点：首筑支付中心操作后台/交易查询（左侧菜单第 3 项）
- 菜单机制类型：db-driven
- 需权限：否

## 依赖

- API 意向名：listPayOrders（A6 支付单查询，分页 + 筛选，复用 02 §3.3 / §3.10）, getPayOrderDetail（A6 支付单详情：含 items、channel_seq、fee_amount、settle_date、card_attr、关联退款单、txn_flow 流水）, listRefundOrders（A7 退款单列表：按 pay_order_id 或 refund_order_id 查询，用于退款单号定位原支付单与详情联动）, listMerchantOptions（A2 商户列表）, dict: pay_method / pay_order_status / refund_order_status / card_attr / bill_type / yn；exportPayOrders（导出 CSV，二期，一期不实现）
- 跳转目标：退款处理页 `/paycenter/refunds?refundNo=xxx`（依赖退款处理页支持按退款单号预填筛选）
- 语义组件 id：PageHeader, FilterBar, DataTable, StatusTag, Descriptions, Modal, EmptyState, Alert
- 演示日来源：FixtureAPI.TODAY
