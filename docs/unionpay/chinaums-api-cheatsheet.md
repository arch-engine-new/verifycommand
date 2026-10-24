# 银联商务新购物车 APP 支付接口字段速查表

> 来源：`6-银联商务开放平台--新购物车APP支付接口20250217.pdf`（主文档 18 页）、`银联商务开放平台--新购物车公共接口.pdf`（27 页）。
> 基准：2026-10-23 生产联调已验证下单正确报文。用途：通道代码修改/联调对照依据，禁止凭记忆改报文。

## 0. 公共约定

| 项 | 值 | 说明 |
|---|---|---|
| 签名 | OPEN-BODY-SIG | appId/appKey 签名在 Authorization 头，报文体内不含密钥 |
| instMid | APPDEFAULT | APP 支付固定值 |
| sysSource | WWW.SZWLJSCQYXGS.COM | 银商分配的来源标识（可选字段，建议上送） |
| 金额 | totalAmount 数字（分）；refundAmount 字符串（分） | 两接口类型不一致，注意 |
| 时间格式 | yyyy-MM-dd HH:mm:ss（北京时间） | expireTime/requestTimestamp/payTime |
| 可空字段 | 显式 null 上送 | srcReserve/subAppId/tradeType 等（fastjson 需 WriteMapNullValue） |

## 1. 分账模式总规则（PDF 明确部分）

- satInfo 强制：satRule=01/03 时**下单必须上送**；satRule=02 不允许上送。
- 退款：satRule=01/03 时"只允许退 1 级子订单"——satInfo（merId/refundOrderId/refundAmt/oriMerOrderId）缺失很可能被拒（PDF 未写"必须"，联调确认）。
- **vaMchntNo 语义**：下单=**主商户号**（生产验证，子商户走 satInfo.merId）；查询/退款/退款查询/关单 PDF 仅写"商户号"未明确主/子——按同源原则应同为主商户号（订单在主商户号下创建）。

## 2. 各接口字段对照

### 2.1 下单 app/pay（主文档 P2-5）— ✅ 已验证

正确报文（2026-10-23 生产 1 分单验证通过）：

```json
{"instMid":"APPDEFAULT","mchntOrderId":"14BF...","vaMchntNo":"主商户号","vaTermNo":"...",
 "srcReserve":null,"sysSource":"WWW.SZWLJSCQYXGS.COM","msgType":"trade.appPreOrder",
 "subAppId":null,"orderDesc":"...","totalAmount":1,"notifyUrl":"...","expireTime":"...",
 "tradeType":null,"attachedData":"...",
 "vaFld":{"newShopFlag":"GWCXS","isSubMchntPay":"02","platAmt":0,"satType":"01",
  "satInfo":[{"merId":"子商户号","merOrderId":"14BF...独立单号","satAmt":1,
   "refundOrderId":null,"refundAmt":null,"oriMerOrderId":null,"payBear":"Y"}]}}
```

- msgType：微信=wx.unifiedOrder（subAppId 必填）；支付宝/云闪付=trade.appPreOrder。**uac.appOrder 会被 SA16 拒单**。
- 响应：appPayRequest 对象（拉起参数）或字符串（云闪付 tn）；targetOrderId/prepayId 为渠道单号。

### 2.2 交易查询 online/query（公共 PDF P22-26）

- 必填：mchntOrderId、vaMchntNo、vaTermNo；vaFld 必填但仅含 newShopFlag。
- 响应：status/payTime/targetSys/targetOrderId/settleDate/totalAmount(string)/cardAttr/seqId。
- ⚠️ vaMchntNo 主/子 PDF 未明确 → 见 §1。

### 2.3 退款 online/refund（公共 PDF P10-16）

- 必填：mchntOrderId（**原消费单号**）、refundOrderId、refundAmount（字符串）、vaMchntNo、vaTermNo。
- vaFld：newShopFlag + isSubMchntPay；satRule=01/03 时应补 satInfo（merId/refundOrderId/refundAmt/oriMerOrderId，退款单号进 satInfo.refundOrderId）。
- 响应：refundStatus（SUCCESS/FAIL/PROCESSING/UNKNOWN）+ refundTargetOrderId。

### 2.4 退款查询 online/refund-query（公共 PDF P17-21）

- 报文同交易查询，但 mchntOrderId 上送**退款单号**；vaFld 仅 newShopFlag。

### 2.5 关单 common/order-close（公共 PDF P8-9）

- 必填：mchntOrderId、vaMchntNo、vaTermNo；可选：sysSource、requestTimestamp。
- 仅未支付订单可关；已支付/已关闭由查单定性。

### 2.6 支付结果通知（主文档 P16-17、公共 PDF P2-3）

- 商户号字段：mid/tid 必填，vaMchntNo/vaTermNo 可选（代码 mid 优先兼容 vaMchntNo ✅）。
- sign 必填、signType 可选（SHA256/MD5，大写 hex）；字段表无 msgType。
- 验签算法细节（字典序拼接+通讯密钥）PDF 本文未写，沿用网付规则（代码 UnionPayNotifyVerifier）。

## 3. 已知陷阱清单

1. msgType=uac.appOrder → SA16「平台商户未注册或状态无效」拒单（云闪付须用 trade.appPreOrder）。
2. fastjson 默认不序列化 null → 必须 WriteMapNullValue，否则可空字段缺失与正确报文不符。
3. totalAmount 数字 / refundAmount 字符串——类型写反会被拒。
4. satInfo.merOrderId 须独立单号（同带 msgSrcId 前缀），不可复用 mchntOrderId。
