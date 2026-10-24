---
feature: paycenter
slice: F-12
title: 银商通道进出 HTTP 报文落库留痕（pay_channel_message）
Status: approved
risk: low
projectType: business
dependsOn: S2
---

# F-12 银商通道进出 HTTP 报文落库留痕 — Design Spec

## 1. 目标

**Goal:** 在 `UnionPayHttpClient` 统一出入口拦截，把银商 5 接口（下单 `ORDER`、查询 `QUERY`、退款 `REFUND`、退款查询 `REFUND_QUERY`、关单 `CLOSE`）的请求+响应原文异步落库到 `pay_channel_message` 表，替代当前仅 DEBUG 日志（`paycenter.unionpay.raw`）的方案，支撑联调排障与对账审计。

## 2. 前置与约束

- 依赖 S2 的 `UnionPayHttpClient`（统一出入口，已含完整 req/resp 字节、costMs、HTTP 状态、respCode）。
- 复用 S1 的 `payTraceTaskDecorator` traceId（MDC）。
- 表结构参考 `pay_notify_record`（仅 `create_time` 审计列，不继承 JeecgEntity）。
- Flyway migration 命名风格沿用 `V20261024_N__paycenter_f12_*.sql`（N 为当日序号，当前已用到 V20261024_1）。
- **禁改报文结构**：请求字节与发送字节为同一数组，签名摘要一致；本切片只做"读取+落库"，不做任何修改。
- **不落 Authorization 头**：含签名与密钥，R10 红线；仅落 body。
- **本期仅银商**：表预留 `channel` 字段，当前固定 `'unionpay'`。

## 3. 范围

### 3.1 新建表 `pay_channel_message`

```sql
CREATE TABLE `pay_channel_message` (
  `id` varchar(32) NOT NULL COMMENT '主键',
  `channel` varchar(32) NOT NULL DEFAULT 'unionpay' COMMENT '渠道',
  `api_type` varchar(32) NOT NULL COMMENT '接口类型：ORDER/QUERY/REFUND/REFUND_QUERY/CLOSE',
  `mchnt_order_id` varchar(64) DEFAULT NULL COMMENT '商户订单号（请求中的 mchntOrderId）',
  `request_body` mediumtext COMMENT '请求报文原文（JSON）',
  `response_body` mediumtext COMMENT '响应报文原文（JSON 或原始文本）',
  `http_status` int DEFAULT NULL COMMENT 'HTTP 状态码',
  `resp_code` varchar(32) DEFAULT NULL COMMENT '响应码（respCode/errCode/HTTP_xxx/TIMEOUT/IO_ERROR）',
  `cost_ms` bigint DEFAULT NULL COMMENT '耗时（毫秒）',
  `trace_id` varchar(64) DEFAULT NULL COMMENT '链路追踪 ID',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_mchnt_order_id` (`mchnt_order_id`),
  KEY `idx_api_type` (`api_type`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='渠道报文留痕';
```

### 3.2 实体与 Mapper

- `PayChannelMessage` 实体：字段与表一一对应，`@TableName("pay_channel_message")`。
- `PayChannelMessageMapper`：`BaseMapper<PayChannelMessage>`。
- `PayChannelMessageService`：`saveMessage(PayChannelMessage)`，内部 `try-catch` 吞异常（降级不阻断）。

### 3.3 异步落库拦截

- 事件：`PayChannelMessageEvent`（含 channel/apiType/mchntOrderId/requestBody/responseBody/httpStatus/respCode/costMs/traceId）。
- 发布：`UnionPayHttpClient.post()` 在拿到 `Outcome` 后、返回/抛异常前，`applicationEventPublisher.publishEvent(...)`。
  - 成功路径：正常发布。
  - 异常路径（`send()` 抛 `PayChannelException`）：也发布（responseBody=null，respCode=TIMEOUT/IO_ERROR/HTTP_xxx）。
  - **try-catch 包裹发布逻辑**：发布失败（如线程池满）仅 WARN 日志，不影响主交易。
- 监听：`PayChannelMessageListener` `@Async` + `@EventListener`，调用 `PayChannelMessageService.saveMessage()`。
  - `@Async` 线程池复用 `payTraceTaskDecorator` 已有线程池（或新建 `payChannelMessageExecutor`：core=2, max=4, queue=100, 拒绝策略=DiscardPolicy 防 OOM）。
- `mchntOrderId` 提取：从 request body JSON 中 `getString("mchntOrderId")`；提取失败为 null。

### 3.4 与现有 RAW_LOG 的关系

- 保留 `RAW_LOG`（联调时临时开启），但本切片后主要排查手段转为 DB 查询。
- 两者并行：DB 留痕是持久化方案，RAW_LOG 是实时控制台方案。

### 3.5 非目标

- 不落 Authorization 头（含签名）。
- 不动 `pay_notify_record` 回调留痕。
- 不改报文结构、不改签名逻辑。
- 本期仅银商，其他通道预留 `channel` 字段但不实现。
- 不提供后台查询页面（S5 已交付 8 页，本切片无新增页面）。

## 4. 需求锁定表

| Rn | 需求 | 来源 | 可判定验收 | 优先级 |
|----|------|------|-----------|--------|
| R1 | 5 接口请求+响应原文落库 | 用户明示 | 调用任一接口后 DB 可查 `pay_channel_message` 有对应记录，含 request_body + response_body | must |
| R2 | 字段完整可按 mchntOrderId 检索 | 用户明示 | `SELECT * FROM pay_channel_message WHERE mchnt_order_id = ?` 返回记录，字段非空（异常路径 response_body 可为 null） | must |
| R3 | 落库失败不阻断主交易 | 用户明示 | 注入 `PayChannelMessageService` 抛异常，UnionPayHttpClient.post 正常返回/抛原异常 | must |
| R4 | 不落 Authorization 头 | 用户明示 | DB 中无 Authorization 字段；request_body 仅含 body JSON | must |
| R5 | 单测覆盖拦截器写库路径 | 用户明示 | `UnionPayHttpClientMessageTest`：成功/失败路径各 1 条，验证 event 发布与 service 调用 | must |
| R6 | 表预留 channel 字段 | 用户明示 | DDL 含 `channel` 字段，默认 `'unionpay'` | must |
| R7 | Flyway migration 新建表 | 用户明示 | `V20261024_N__paycenter_f12_channel_message.sql` 存在且可执行 | must |

## 5. 设计

### 5.1 架构

```
UnionPayHttpClient.post()
  → 发布 PayChannelMessageEvent（try-catch 降级）
    → PayChannelMessageListener (@Async)
      → PayChannelMessageService.saveMessage()
        → PayChannelMessageMapper.insert()
```

### 5.2 组件

| 组件 | 职责 |
|------|------|
| `PayChannelMessage` | 实体 |
| `PayChannelMessageMapper` | MyBatis-Plus BaseMapper |
| `PayChannelMessageService` | 保存，try-catch 吞异常 |
| `PayChannelMessageEvent` | Spring ApplicationEvent |
| `PayChannelMessageListener` | `@Async @EventListener` |
| `UnionPayHttpClient` | 发布事件（改动点） |

### 5.3 数据流

1. `post()` 序列化 body 为 `bytes`（与发送同字节）。
2. 发送 HTTP，拿到 `HttpResponse<byte[]>` 或异常。
3. 构造 `Outcome`（成功/失败）。
4. **发布事件**：requestBody=new String(bytes), responseBody=outcome.json/nonJsonText, httpStatus, respCode, costMs。
5. 异步监听写入 DB。

### 5.4 错误处理

- 事件发布异常：catch Throwable，log.warn，不抛出。
- Service 保存异常：catch Exception，log.error，不抛出。
- 线程池拒绝：DiscardPolicy + log.warn。

### 5.5 测试

- `UnionPayHttpClientMessageTest`：
  - `post_success_publishesEventWithRequestAndResponse`：Mock service 验证 1 次调用，字段匹配。
  - `post_sendFailure_publishesEventWithErrorCode`：Mock 超时，验证 event 含 respCode=TIMEOUT。
  - `post_eventPublishFails_mainFlowNotBlocked`：Mock publisher 抛异常，post 正常返回。
- `PayChannelMessageServiceTest`：`saveMessage_exception_swallowed`。
- Flyway migration 执行测试（启动时自动验证）。

## 6. 追问记录

- 轮次：2 轮（最少要求）。
- 第 1 轮 S1：联调排障需看原始请求 → 确认成对落库。S2：DB 故障不能影响支付 → 确认异步降级。S3：UnionPayHttpClient 已有完整字节与 costMs → 可行。S4：可写单测验证 event 发布。
- 第 2 轮：无新实质发现，收敛。
- 需求修订：v1→v2 明确"异常路径也落库（responseBody=null）"。
- 红队：risk=low，步骤 4 方案红队强化代替独立红队。

## 7. Ontology detection

- 未调用 `query_ontology`（需求边界清晰，无需探索）。
- 检测到既有资产：`pay_notify_record`（留痕表结构参考）、`payTraceTaskDecorator`（traceId MDC）、`UnionPayHttpClient`（拦截点）。
- 复用决策：复用 `UnionPayHttpClient` 作为统一出入口（不新建拦截器）；复用 MDC traceId；表结构参考 `pay_notify_record` 但独立新建（业务含义不同）。

## 8. 开放项

- 无。
