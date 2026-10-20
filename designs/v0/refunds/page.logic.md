# 退款处理

## 操作明细

| 操作 | 触发 | 结果 | 确认 | 角色 |
|------|------|------|------|------|
| 进入退款处理 | 点击左侧菜单「退款处理」/ 从工作台「去处理 →」「查看 →」跳转（带 `status` / `manualCheck` 筛选）/ 从交易查询 UNKNOWN 提示或退款单联动跳转 | 调 A7 退款单列表（分页），渲染警示条与列表；切换菜单即刷新（20 §9.1） | 无 | 全部登录用户（管理员、运营） |
| 查询 | 输入单号 / 选择状态 / 选择是否人工核查后点击「查询」 | 以筛选条件重新调 A7，页码回到第 1 页 | 无 | 全部登录用户 |
| 重置 | 点击「重置」 | 清空筛选条件并重新查询（Jeecg 列表页惯例；原型未实现，补齐） | 无 | 全部登录用户 |
| 翻页 / 改每页条数 | 点击分页器 | 调 A7 取对应页（20 §4 P5「筛选 + 分页」，PRD 要求，原型未实现） | 无 | 全部登录用户 |
| 查看退款详情 | 点击行内「详情」或退款单号 | 打开详情抽屉/弹窗：退款单完整信息与结果（调 A7 详情）（20 §3「结果查看」，PRD 要求，原型未实现） | 无 | 全部登录用户 |
| 打开发起退款 | 点击「+ 发起退款」 | 打开「发起退款」弹窗，表单为空（原型预填演示值，开发时不预填） | 无 | 全部登录用户（管理员、运营，20 §2） |
| 回显原单 | 弹窗内输入原支付单号后点击「回显原单」 | 调 A6 支付单详情，显示原单信息条：原单号、商户、金额、已退金额、可退金额（一期=全额）、原单状态、支付成功时间；不可退时显示原因并禁用提交 | 无 | 全部登录用户 |
| 提交退款 | 弹窗内点击「提交退款」 | 前端校验通过后调 A8 发起退款（复用 02 §3.4）→ 关闭弹窗 → toast「退款已提交：{退款单号}（状态 REFUNDING）」→ 列表刷新且新单置顶显示 REFUNDING → 后端写操作日志「退款发起」 | 「确认对支付单 {原支付单号}（{商户名称}）发起全额退款 ¥{金额}？退款将原路退回，提交后不可撤销。」（资金操作，按 schema L 危险操作规则补充；原型无） | 全部登录用户 |
| 取消发起 | 弹窗内点击「取消」/ 关闭 | 关闭弹窗，不提交 | 无 | 全部登录用户 |
| 重试退款 | 点击行内「重试」（仅 REFUND_FAIL 或 `manual_check=1` 的行显示） | 调 A9 退款重试 → toast「已发起重试：{退款单号}」→ 刷新列表状态 → 后端写操作日志「退款重试」。`manual_check` 单后端先自动调银联退款查询（online/refund-query）兜底，若已明确则直接更新状态并提示结果，仍未知才执行重试 | 确认重试退款 {退款单号}？UNKNOWN 单将先自动调银联退款查询，仍未知才允许重试 | 全部登录用户（管理员、运营） |

> 原型重试按钮条件为状态 `FAIL` 或 `UNKNOWN`；按 PRD 01 §7 状态总表改为 `REFUND_FAIL` 或 `manual_check=1`（原型与 PRD 不一致，以 PRD 为准，见「字段与列」status 说明）。

## 主流程

1. 用户进入退款处理页，前端调 A7 `listRefundOrders` 取第 1 页（若由工作台跳转则带上 `status` / `manualCheck` 筛选）。
2. 列表上方若存在 `manual_check=1` 的退款单，显示黄色警示条「有 N 笔退款需人工核查：…… 系统已自动调银联退款查询兜底，仍未知请按流程处理（联系银联）」。
3. 发起退款：点击「+ 发起退款」→ 输入原支付单号 → 点击「回显原单」（A6）→ 确认原单信息（金额 / 已退 / 可退）→ 退款金额自动带出为可退金额（一期仅全额）→ 填写退款原因 → 点击「提交退款」（A8）。
4. 提交成功：弹窗关闭，toast 提示，列表刷新并置顶显示新退款单（REFUNDING），操作日志由后端记录。
5. 处理异常单：对 REFUND_FAIL 或需人工核查的单点击「重试」→ confirm 二次确认 → A9 → 列表刷新状态。

> 仅快乐路径。错误/空态见「状态」。

## 状态

- `loading`：列表区 Jeecg `BasicTable` 自带 loading 遮罩；回显原单、提交退款、重试期间对应按钮显示 loading 并禁止重复点击（防重复提交）。（PRD 未细化，原型未实现，原型为本地演示数据）
- `empty`：无退款单或筛选无结果时，列表显示 EmptyState「暂无退款单」；警示条隐藏。（原型未实现：原型筛选无结果时仅剩表头）
- `forbidden`：本页管理员、运营均可访问，正常不出现；token 失效 / 无角色时按 Jeecg 全局规则跳登录页或显示 403。
- `error`：
  - 列表加载失败：表格区显示 Alert「退款单加载失败」+「重试」按钮；错误码按 10 文档映射为用户文案，不裸奔错误码（20 §9.1）。（原型未实现）
  - 回显原单失败：原单不存在时 toast「未找到该支付单」并隐藏原单信息条（原型已实现）；原单状态非 PAID（REFUNDING / REFUNDED / CLOSED / WAIT_PAY，02 §3.4 code=3004）或超过 360 天退款时限时，原单信息条显示不可退原因并禁用「提交退款」。（PRD 要求，原型未实现）
  - 提交退款失败：toast 映射后的错误文案（如「原支付单状态不允许退款」「超过 360 天退款时限」「退款金额须等于可退金额」「该退款已提交，请勿重复操作」），弹窗保持打开以便修改。（PRD 要求，原型未实现）
  - 重试失败：toast 错误文案，列表状态不变。
- `success`：操作成功统一 toast（2s 自动消失，20 §9.1）：提交「退款已提交：{退款单号}（状态 REFUNDING）」，重试「已发起重试：{退款单号}」。原单信息条 / 详情中提示「退款成功仅表示渠道已受理，到账时效以渠道实际入账为准（零钱/余额即时，银行卡 0-3 个工作日）」（01 §5.2、02 §3.4，PRD 要求，原型未实现）。

## 字段与列

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| refundOrderId | string | yes | 表格列「退款单号/原支付单」上行（加粗，可点击看详情） | DataTable 列 |
| payOrderId | string | yes | 表格列「退款单号/原支付单」下行（灰色） | DataTable 列 |
| merchantName | string | yes | 表格列「商户」 | DataTable 列 |
| refundAmount | number（分，展示为 ¥ 元 2 位小数） | yes | 表格列「金额」 | DataTable 列 |
| status | enum（REFUNDING / REFUND_SUCCESS / REFUND_FAIL） | yes | 表格列「状态」（色标签：REFUNDING 琥珀、REFUND_SUCCESS 绿、REFUND_FAIL 红）。原型状态值为 REFUNDING / SUCCESS / FAIL / UNKNOWN，原型与 PRD 不一致：以 01 §7 状态总表为准，UNKNOWN 不是我方状态，改由 `manualCheck` 标记表达（20 §4 P5 列出 UNKNOWN 亦以 01 为准） | DataTable 列 + StatusTag |
| manualCheck | boolean | yes | 表格列「状态」旁附加红色标签「需人工核查」（01 §7：标记字段，连续 3 轮定时查单仍未明确时置位，运营后台可筛选；PRD 要求，原型未实现） | StatusTag |
| createdAt | datetime | yes | 表格列「时间」（发起时间，yyyy-MM-dd HH:mm:ss） | DataTable 列 |
| reason | string | yes | 表格列「原因」 | DataTable 列 |
| actions | — | — | 表格列「操作」：「详情」（全部行）；「重试」（仅 REFUND_FAIL 或 manualCheck=1 时显示，否则显示「—」） | TableAction |
| payOrderIdInput | string | yes | 表单（发起退款弹窗）「原支付单号 *」+「回显原单」按钮 | FormField |
| originInfo | object | — | 只读（弹窗原单信息条：原单号、商户、金额、已退金额、可退金额（全额）、原单状态、支付成功时间） | Descriptions / Alert |
| refundAmountInput | number（元，2 位小数；提交转分） | yes | 表单「退款金额 *」：回显后自动带出可退金额并锁定只读（一期仅全额）。原型为可自由编辑的「退款金额（分）」输入框，原型与 PRD 不一致，以 PRD 为准 | FormField（InputNumber，disabled） |
| reasonInput | string | yes | 表单「退款原因 *」 | FormField（Input / Textarea） |
| detail.refundOrderId / payOrderId / merchantName / refundAmount / status / manualCheck / reason / createdAt | — | — | 只读（详情抽屉，同列表字段） | Descriptions |
| detail.channelRefundId | string | no | 只读（详情「银联退货单号」，02 §3.5 channel_refund_id；PRD 要求，原型未实现） | Descriptions |
| detail.refundTime | datetime | no | 只读（详情「退款完成时间」，02 §3.5 refund_time；PRD 要求，原型未实现） | Descriptions |
| detail.operator | string | no | 只读（详情「发起人」，对应 refund_order.reviewer；PRD 01 §8 表字段，原型未实现） | Descriptions |
| detail.failReason | string | no | 只读（详情「失败原因」，如「可用余额不足」分类提示，01 §5.2；PRD 要求，原型未实现） | Descriptions |

> 原型提交时商户写死为「重庆龙湖物业」；开发时商户由原单回显带出（merchant_code 取原支付单），不在表单中填写。

## 查询参数

| 参数名 | 含义 | 默认值 |
|--------|------|--------|
| keyword | 退款单号 / 原支付单号（模糊或精确匹配，原型为包含匹配） | 空 |
| status | 退款单状态（REFUNDING / REFUND_SUCCESS / REFUND_FAIL）；工作台「去处理 →」跳转带 `status=REFUNDING` | 空（全部） |
| manualCheck | 是否需人工核查（1=是）；工作台「查看 →」跳转带 `manualCheck=1`（PRD 要求，原型未实现） | 空（全部） |
| pageNo | 页码 | 1 |
| pageSize | 每页条数 | 10（Jeecg 默认） |

> 排序：按发起时间倒序（新提交的单置顶）。

## 数据契约

| 项 | 值 | 说明 |
|----|----|------|
| volumeClass | unbounded | 退款单随业务持续增长 |
| 增长性 | 随业务增长（每日新增若干笔） | 退款单为流水型数据 |
| 列表分页预期 | server-side | A7 退款单列表须服务端分页（20 §4 P5「筛选 + 分页」）；原型为前端全量过滤，开发时改为服务端 |

## 选项数据源

| 字段 | 控件 | 来源 | 意向 API 或字典 type | value | label | 父字段(级联) | 加载时机 |
|------|------|------|----------------------|-------|-------|--------------|----------|
| status | Select | dict | refund_order_status | REFUNDING / REFUND_SUCCESS / REFUND_FAIL | 退款中 / 退款成功 / 退款失败 | 无 | mount |
| manualCheck | Select | dict | yn | 1 / 0 | 是 / 否 | 无 | mount |

> 原型状态下拉为硬编码 option（含 SUCCESS / FAIL / UNKNOWN），开发时改为 Jeecg 数据字典并按 PRD 状态码修正。

## 校验

| 规则 | 范围 | 说明 |
|------|------|------|
| required | payOrderIdInput | 「请输入原支付单号」（原型已实现） |
| required | reasonInput | 「请填写退款原因」（20 §9.5 原因必填；原型已实现，合并提示「请完整填写支付单号/金额/原因」） |
| required | refundAmountInput | 须先回显原单后才可提交（原型未强制回显，PRD 要求，原型未实现） |
| cross-field：退款金额 = 可退金额 | refundAmountInput × originInfo | 「一期仅支持全额退款，退款金额须等于原单金额」（20 §9.5「校验 = 可退金额」、02 §3.4 refund_amount 必须 = 原单 total_amount；PRD 要求，原型未实现） |
| 原单状态 = PAID | originInfo.status | 「原支付单状态不允许退款」（02 §3.4，REFUNDING / REFUNDED / CLOSED / WAIT_PAY 均拒绝，code=3004；PRD 要求，原型未实现） |
| 退款时限 ≤ 360 天 | originInfo.paidTime | 「已超过 360 天退款时限」（01 §5.2、02 §3.4，自原支付成功之日起；PRD 要求，原型未实现） |
| 幂等 | 提交退款 | 前端提交期间禁用按钮；后端按 biz_refund_no 幂等，重复提交提示「该退款已提交，请勿重复操作」（02 §3.4；PRD 要求，原型未实现） |
| 重试前置条件 | 重试 | 仅 REFUND_FAIL 或 manualCheck=1 可重试；后端二次校验，非法状态拒绝 |
| maxLength（建议） | reasonInput | 建议 ≤ 200 字（PRD 未规定，建议值） |

> 前端校验仅为体验，以上 PRD 约束后端（A8 / A9）必须再次校验。

## 权限

- 页级：登录即可；管理员、运营两个 Jeecg 角色均可进入（20 §2：运营可用页面含退款处理；管理员全部 7 页）。
- 操作级：查询、详情、发起退款、重试对管理员与运营均开放（20 §2「运营：退款发起与重试、查单」，§9.1「可查单/退款/重试」）；两角色在本页无差异。
- 二期：按商户数据权限隔离（运营只管部分物业公司）后再区分可见范围。

## 导航

- 路由：/paycenter/refunds
- 菜单挂载点：首筑支付中心操作后台/退款处理（左侧菜单第 4 项）
- 菜单机制类型：db-driven
- 需权限：否

## 依赖

- API 意向名：listRefundOrders（A7 退款单列表，复用 02 §3.5 + 补列表，支持 keyword / status / manualCheck / 分页）, getRefundOrderDetail（A7 退款单详情）, getPayOrderDetail（A6 支付单详情，用于「回显原单」：金额 / 已退 / 可退 / 状态 / 支付成功时间）, createRefundOrder（A8 发起退款，复用 02 §3.4）, retryRefundOrder（A9 退款重试，管理专用；manual_check 单先调银联 refund-query 兜底）, dict:refund_order_status, dict:yn
- 操作日志：退款发起 / 退款重试由后端在 A8 / A9 内写入（20 §4 P7），前端不单独调用。
- 跳转来源：工作台 `/paycenter/refunds?status=REFUNDING`、`/paycenter/refunds?manualCheck=1`；交易查询页退款单联动 / UNKNOWN 引导。
- 语义组件 id：PageHeader, SearchForm, DataTable, StatusTag, TableAction, Alert, Modal, FormField, Descriptions, Drawer, EmptyState
- 演示日来源：FixtureAPI.TODAY
