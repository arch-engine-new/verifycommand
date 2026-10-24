# S2 银联通道适配 — Implementer 报告（Task 11–12）

- Plan：`docs/apt/plans/2026-10-21-paycenter-s2-unionpay-channel-plan.md`
- 总体状态：**DONE_WITH_CONCERNS**（T11 为保证 appPayRequest 键序，白名单外改了 `UnionPayHttpClient` 一行解析代码，详见 T11）
- backend 基线：`64a0f3b`（分支 `paycenter`，T10 之后）

| Task | 状态 | Commit（backend） | 测试 |
|------|------|-------------------|------|
| T11 UnionPayChannel 下单 | DONE_WITH_CONCERNS | `5013b0c` | UnionPayChannelCreateOrderTest 12 个 + PayChannelRouterTest 5 个，0 失败 |
| T12 查询 / 退货 / 退货查询 / 关单 | DONE | `fa46c33` | UnionPayChannelQueryRefundCloseTest 17 个 + UnionPayChannelCreateOrderTest 12 个，0 失败 |

## T11 — 下单（R1, R4, R6）
- `channel/unionpay/UnionPayChannel`（`@Slf4j @Component implements PayChannel`）：
  - 公开构造标 `@Autowired`（另有接收 `Clock` 的包内构造），`channelCode()` 返回 `UNIONPAY`。
  - `createOrder` 在任何 HTTP 调用之前校验必填项：payOrderNo、mchntOrderId、payMethod、totalAmount>0、orderDesc、vaMchntNo、vaTermNo、notifyUrl、expireTime；微信另需 subAppId。不合法时抛 `PayException(PARAM_INVALID, "missing field: <name>")`。
  - 报文用 `LinkedHashMap` 按 plan 的键序组装：
    - 只有微信上送 subAppId。
    - totalAmount 以“分”的字符串上送。
    - expireTime 按北京时间格式化为 `yyyy-MM-dd HH:mm:ss`。
    - srcReserve 非空时才上送。
    - vaFld 恰好包含 `{newShopFlag:GWCXS, isSubMchntPay:"02"}`，不上送 satType/satInfo。
  - 响应中的 mchntOrderId 与请求不一致时，抛 `PayChannelException(5001, MCHNT_ORDER_ID_MISMATCH, needQuery=true)`；响应缺该字段时记 WARN 并回填请求值。
  - appPayRequest：对象按原键序重新序列化，字符串原样返回，缺失时返回 null。
  - targetOrderId 优先取 targetOrderId，没有时取 prepayId。
  - rawCode 取 errCode，没有时取 respCode（与 HTTP 客户端判定口径一致）。
  - status 为 UNKNOWN 时正常返回。
- `UnionPayChannelCreateOrderTest`：用 JDK HttpServer 模拟银联，请求体从实际发出的原始字节解析后断言，共 12 个用例：
  1. 微信：断言 msgType=wx.unifiedOrder、subAppId、instMid=APPDEFAULT、vaFld 恰 2 键、原文不含 satType/satInfo、attachedData=payOrderNo、totalAmount 为字符串 `"1"`、expireTime=`2026-10-21 12:15:00`、notifyUrl 透传、Authorization 头存在且以 `OPEN-BODY-SIG ` 开头、srcReserve 为空时不上送。
  2. 支付宝：msgType=trade.appPreOrder；请求带 subAppId 也不上送；srcReserve 透传。
  3. 银联卡：msgType=uac.appOrder。
  4. appPayRequest 为对象：结果字符串与银联原文逐字相等，键序 `[appScheme, miniuser, prepayid, sign]`，值相等。
  5. appPayRequest 为字符串：`tn123` 原样返回；没有 targetOrderId 时取 prepayId。
  6. appPayRequest 与 mchntOrderId 缺失：appPayRequest 为 null，订单号回填请求值。
  7. 状态映射（参数化，4 组）：WAIT_BUYER_PAY 和 NEW_ORDER→WAIT_PAY，TRADE_SUCCESS→PAID，UNKNOWN→UNKNOWN 且不抛异常。
  8. mchntOrderId 不一致：5001，needQuery=true。
  9. 微信缺 subAppId、金额为 0、缺 vaMchntNo：均返回 1001，`requestCount()==0`。
- `PayChannelRouterTest` 追加 `routesToRealUnionPayChannel`：用真实 `UnionPayChannel` 装配路由，`get("UNIONPAY")` 通过 `assertInstanceOf` 校验为银联实现，`get("WXPAY")` 返回 5001。
- **与源码冲突的最小调整（白名单外 1 处）**：
  - plan 1.3 假设“fastjson `JSONObject` 基于 LinkedHashMap 保序”，实测 fastjson 2.0.58 兼容包的 `JSON.parseObject(String)` **不保序**。首次运行断言失败，实际键序为 `[miniuser, appScheme, sign, prepayid]`。
  - 修复：在 `UnionPayHttpClient.Outcome.parseJson` 中改用 `JSON.parseObject(trimmed, Feature.OrderedField)`，并加注释说明原因。不这样改，plan 1.5-8 “字段与顺序不变”的透传要求无法满足（顺序在通道层已无法恢复）。
  - 这一行修改随 T11 一起提交。回归 `UnionPayHttpClientTest` 11 个用例全部通过。
- Verify：`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test "-Dtest=UnionPayChannelCreateOrderTest,PayChannelRouterTest"` 退出码 0；`CreateOrderTest Tests run: 12`，`RouterTest Tests run: 5`，均为 0 失败（同时回归了 `UnionPayHttpClientTest Tests run: 11`）。

## T12 — 查询 / 退货 / 退货查询 / 关单（R5, R6）
- `queryOrder`：
  - 先校验 mchntOrderId、vaMchntNo、vaTermNo。
  - 报文为 `mchntOrderId, vaMchntNo, vaTermNo, sysSource=OPT, vaFld={newShopFlag}`。
  - 响应映射：
    - status 与 targetSys 经映射器转换，并保留原值。
    - payTime 按北京时间解析，解析失败为 null 并保留 rawPayTime。
    - totalAmount 支持字符串或整数，非法值为 null。
    - settleDate、cardAttr、seqId、targetOrderId 透传。
- `refund`：
  - 先校验 mchntOrderId、refundOrderId、refundAmount>0、vaMchntNo、vaTermNo。
  - 报文为 `mchntOrderId, vaMchntNo, vaTermNo, refundOrderId, refundAmount(字符串), sysSource=OPT, vaFld={newShopFlag, isSubMchntPay:"02"}`，不上送 satType/satInfo。
  - refundStatus 缺失或未知时为 UNKNOWN；响应未回显 refundOrderId 时用请求值；channelRefundId 取 refundTargetOrderId。
- `queryRefund`：报文与交易查询相同，但 `mchntOrderId` 取退款订单号；结果映射与 refund 相同。
- `closeOrder`：
  - 报文为 `mchntOrderId, vaMchntNo, vaTermNo, sysSource=OPT, requestTimestamp=now(clock)`（北京时间），不带 vaFld。
  - 成功：返回 `closed=true, CLOSED`。
  - 失败且 `isNeedQuery()` 为 true 时查单：
    - PAID 或 REFUND：返回 `closed=false, statusAfter=<该状态>`，rawCode 和 rawMessage 用关单的原始值。
    - CLOSED：返回 `closed=true`。
    - 其他状态：重新抛出原异常。
  - 失败且 needQuery=false（1000、1001、9200、限流）：直接抛出，不查单。
  - 小补充（不改变行为）：查单本身失败时，把查单异常挂到原关单异常的 suppressed 上，再抛出原关单异常，与“其他情况重新抛原异常”的口径一致。
- 按 plan 抽出的私有方法：`requireNotBlank`、`toLong`、`parseTime`、`baseQueryBody`，另有 `merchantBody`、`requireMerchant`、`validateRefund`、`toRefundResult`、`resolveCloseFailure`。所有方法体都不超过 80 行。
- `parseAndVerifyNotify` 仍抛 `UnsupportedOperationException("implemented in T13")`，留给 T13 实现。
- `UnionPayChannelQueryRefundCloseTest`：固定时钟为 `2026-10-21T04:16:00Z`，共 17 个用例：
  1. 查询请求体：sysSource=OPT，vaFld 恰 1 键，Authorization 头存在。
  2. 查询响应映射：TRADE_SUCCESS→PAID；payTime 等于北京时间 12:01:02 对应的 Date；WXPay→WECHAT；totalAmount 为 1L；cardAttr、seqId、settleDate、targetOrderId 透传。
  3. 查询异常值：UAC→UNIONPAY_CARD；payTime=`bad` 时为 null 且 rawPayTime=`bad`；数字型金额 100 转为 100L。
  4. 查询缺商户号：返回 1001，不发请求。
  5. 退货请求体：refundOrderId、refundAmount 为字符串 `"1"`、sysSource=OPT、vaFld 恰 2 键、原文不含 satType/satInfo；channelRefundId=RT1。
  6. refundStatus 映射（参数化，5 组）：SUCCESS、FAIL、PROCESSING、UNKNOWN 各自对应，WEIRD→UNKNOWN。
  7. refundStatus 缺失：映射为 UNKNOWN，refundOrderId 回填请求值。
  8. 退货金额为 0 或缺退款单号：返回 1001，不发请求。
  9. 退货查询：请求体 mchntOrderId 等于退款单号，vaFld 恰 1 键；PROCESSING 映射正确。
  10. 关单成功：requestTimestamp=`2026-10-21 12:16:00`，sysSource=OPT，无 vaFld；结果 closed=true、CLOSED。
  11. 已支付订单关单：先返回 ORDER_STATUS_ERR，再查单得到 TRADE_SUCCESS。断言第二个请求的 path 为 online/query，结果 closed=false、PAID、rawCode=ORDER_STATUS_ERR，不抛异常。
  12. 关单失败后查单为 TRADE_CLOSED：结果 closed=true。
  13. 关单失败后查单为 WAIT_BUYER_PAY：抛 5001，共 2 次请求。
  14. 关单返回 1000：抛 9999，`requestCount()==1`，不查单。
- Verify：`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test "-Dtest=UnionPayChannelQueryRefundCloseTest,UnionPayChannelCreateOrderTest"` 退出码 0；`QueryRefundCloseTest Tests run: 17`，`CreateOrderTest Tests run: 12`，均为 0 失败。

## 附加回归
- 执行 `. scripts/paycenter/run-local.ps1 -EnvOnly` 后跑模块全量 `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test`：退出码 0，**23 个测试类、163 个用例，0 失败/错误**。输出中的 ERROR “channel key decrypt failed” 来自 T5 篡改密文用例的预期日志。

## 白名单外改动
1. `channel/unionpay/UnionPayHttpClient.java`（T10 产物）：响应 JSON 解析增加 `Feature.OrderedField`，并新增 1 个 import 和 1 行注释。原因见 T11：fastjson 兼容包默认不保序，导致 appPayRequest 透传顺序改变，与 plan 1.5-8 冲突。已随 T11 一起提交（`5013b0c`）。

## 编码规范自检
- 所有公开方法与构造都有说明契约或原因的 Javadoc，覆盖 `UnionPayChannel` 的 7 个接口方法和公开构造，以及测试类中的 `@BeforeEach`、`@AfterEach` 和每个 `@Test` / `@ParameterizedTest`。
- 多分支逻辑都写了解释性注释，包括 `resolveCloseFailure`、`validateCreate`、`buildCreateBody` 的分账说明、`checkEchoedOrderId`、`appPayRequestOf`、`toLong`、`parseTime`。
- 函数体不超过 80 行、参数不超过 5 个；无 SQL；无空 catch。两个 catch 分别记 WARN 并返回 null，以及挂 suppressed 后重新抛出原异常。
- 日志不打印商户号原文、密钥或 Authorization；金额解析失败时只打印长度。本次没有读取 `.apt/local/*`。

## 待决问题
1. plan 1.3 中“fastjson `JSONObject` 基于 LinkedHashMap 保序”与实测不符。已在 HTTP 客户端最小修正，建议主 Agent 回填 plan 1.3 或 1.5-8。T13 的 `UnionPayNotifyParser` 用 `JSON.parseObject` 解析通知时同样不保序，但验签按字典序拼接，不受影响。
2. 沿用 f2-g1 的待决项：T2 Verify 第 3 条的 rg 命中 JeecgBoot 原有的 `baidu-api.app-id` 占位值。
