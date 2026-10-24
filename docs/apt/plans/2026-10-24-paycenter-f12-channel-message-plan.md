# F-12 银商通道进出 HTTP 报文落库留痕（pay_channel_message） Implementation Plan

> **Spec:** `docs/superpowers/specs/2026-10-24-paycenter-f12-channel-message-design.md`
> **Command:** `/plan-from-spec`
> **Status:** approved（批量队列 F-12 全自动链，spec risk=low 已 auto_approved）

**Goal:** 在 UnionPayHttpClient 统一出入口拦截，把银商 5 接口（下单/查询/退款/退款查询/关单）的请求+响应原文异步落库到 `pay_channel_message` 表，落库失败降级不阻断主交易。

**Architecture:** Spring ApplicationEvent 异步解耦 —— `UnionPayHttpClient.post()` 在拿到 `Outcome` 后（成功或 send 失败均覆盖）发布 `PayChannelMessageEvent`（try-catch 包裹防发布异常），`@Async @EventListener` 的 `PayChannelMessageListener` 调用 `PayChannelMessageService.saveMessage()`（内部 try-catch 吞异常）写入 `pay_channel_message` 表（Flyway `V20261024_2` 新建）。

---

## Part 1 — 技术方案（APT 寻址）

### 1.1 范围与约束

- 做：新建 `pay_channel_message` 表（预留 `channel` 字段，本期固定 `'unionpay'`）；`UnionPayHttpClient` 出入口事件发布；异步监听落库；5 接口（`UnionPayApi` 全枚举）请求+响应原文、api 类型、respCode、HTTP 状态、耗时、mchntOrderId、traceId、时间戳。
- 不做：不落 Authorization 头；不动 `pay_notify_record`；不改报文结构与签名；不提供后台查询页。
- 测试基线：paycenter 模块 UnionPay*Test 117 个全绿为回归基线；本切片新增单测不得破坏。

### 1.2 设计寻址

N/A（纯后端切片，无 UI）。

### 1.3 依赖寻址表

| 依赖 | 来源 | 引用 | 摘要 |
|------|------|------|------|
| UnionPayHttpClient | arch | `backend/jeecg-module-paycenter/util/UnionPayHttpClient` → `.../channel/unionpay/UnionPayHttpClient.java` | 统一出入口 post(api, body, cfg)，已含完整 bytes/Outcome/costMs |
| UnionPayApi | arch | `backend/jeecg-module-paycenter/enum/UnionPayApi` → `.../channel/unionpay/UnionPayApi.java` | 枚举：CREATE_ORDER/QUERY_ORDER/REFUND/QUERY_REFUND/CLOSE_ORDER（5 接口全覆盖） |
| PayNotifyRecord（参考） | arch | `backend/jeecg-module-paycenter/util/PayNotifyRecord` → `.../entity/PayNotifyRecord.java` | 留痕表实体范式：仅 create_time 审计列、不继承 JeecgEntity、IdType.ASSIGN_ID |
| PayNotifyRecordMapper（参考） | arch | `backend/jeecg-module-paycenter/util/PayNotifyRecordMapper` | BaseMapper 范式；全局 MapperScan（org.jeecg.**.mapper*）免 @Mapper |
| PayTraceUtil | 源码 | `.../paycenter/common/trace/PayTraceUtil.java` | `PayTraceUtil.current()` 取当前线程 traceId（PayAlertEvent 同用法） |

### 1.4 拟改动模块与文件

| 文件/模块 | 变更类型 | 说明 |
|-----------|----------|------|
| `jeecg-system-start/src/main/resources/flyway/sql/mysql/V20261024_2__paycenter_f12_channel_message.sql` | 新建 | DDL 建表（见 spec §3.1） |
| `paycenter/entity/PayChannelMessage.java` | 新建 | 实体（参考 PayNotifyRecord 范式） |
| `paycenter/mapper/PayChannelMessageMapper.java` | 新建 | BaseMapper |
| `paycenter/service/PayChannelMessageService.java` | 新建 | saveMessage，try-catch 降级 |
| `paycenter/channel/unionpay/PayChannelMessageEvent.java` | 新建 | Spring 事件载荷（record/普通类） |
| `paycenter/channel/unionpay/PayChannelMessageListener.java` | 新建 | `@Async @EventListener` 落库 |
| `paycenter/channel/unionpay/UnionPayHttpClient.java` | 修改 | 注入 ApplicationEventPublisher；post() 成功路径与 send() 失败路径发布事件（各 try-catch 包裹） |
| `paycenter/config/AsyncConfig`（或既有配置） | 查改 | 确认/新增 `payChannelMessageExecutor` 线程池（core=2,max=4,queue=100,DiscardPolicy）；若已有通用 @Async 池可直接复用并注明 |
| 测试：`UnionPayHttpClientMessageTest`、`PayChannelMessageServiceTest` | 新建 | 覆盖 R3/R5 |

### 1.5 风险与未决项

- 风险1：@Async 默认线程池若被其他任务占满 → 用独立 executor + DiscardPolicy 降级。
- 风险2：send() 抛异常路径无 HTTP status → 事件 httpStatus=null，respCode=TIMEOUT/IO_ERROR。
- 风险3：mchntOrderId 提取失败（非预期报文）→ 允许 null，索引仍可查 api_type+create_time。
- 未决项：无（spec 无开放项）。

### 1.6 需求锁定对照

| Rn | 优先级 | 覆盖 Task | 备注 |
|----|--------|-----------|------|
| R1 请求+响应原文落库 | must | T2, T3 | T3 在 post 两路径发布事件 |
| R2 字段完整可按 mchntOrderId 检索 | must | T1（DDL 索引）, T4（验证） | idx_mchnt_order_id |
| R3 落库失败不阻断 | must | T3（try-catch 发布）, T4（异常注入测试） | |
| R4 不落 Authorization | must | T3 | 仅 body 字节入事件 |
| R5 单测覆盖写库路径 | must | T4 | |
| R6 预留 channel 字段 | must | T1 | DDL + 实体默认值 |
| R7 Flyway migration | must | T1 | V20261024_2 |

---

## Part 2 — 可执行任务清单

> 实现由子 Agent 串行执行；backend 为嵌套 git 仓（d:\software\dog-food\backend），提交在 backend 仓。implement 前停 80 端口应用与本机冗余 java 进程，完成后重启回 80 并探活。

### Task 1: Flyway migration + 实体 + Mapper + Service

- [ ] 新建 `V20261024_2__paycenter_f12_channel_message.sql`（DDL 按 spec §3.1，含 channel/api_type/mchnt_order_id/request_body/response_body/http_status/resp_code/cost_ms/trace_id/create_time + 三索引）
  - **MCP:** `query_arch` path=`backend/jeecg-module-paycenter/util/PayNotifyRecord`（实体范式参考）
  - **Files:** `backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/flyway/sql/mysql/V20261024_2__paycenter_f12_channel_message.sql`
- [ ] 新建 `PayChannelMessage` 实体 + `PayChannelMessageMapper`（BaseMapper，全局 MapperScan 免注解）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/entity/PayChannelMessage.java`, `.../mapper/PayChannelMessageMapper.java`
- [ ] 新建 `PayChannelMessageService`：`saveMessage(PayChannelMessage)` 内部 try-catch 吞异常（log.error 降级）
  - **Files:** `.../paycenter/service/PayChannelMessageService.java`（或 service+impl 按模块惯例，参考 PayNotifyRecordService 结构）
  - **Verify:** `cd backend/jeecg-boot && mvn -pl jeecg-boot-module/jeecg-module-paycenter -am compile -q` 编译通过（覆盖 R6/R7）

### Task 2: 事件与异步监听

- [ ] 新建 `PayChannelMessageEvent`（字段：channel/apiType/mchntOrderId/requestBody/responseBody/httpStatus/respCode/costMs/traceId）
- [ ] 新建 `PayChannelMessageListener`：`@Async("payChannelMessageExecutor") @EventListener`，把事件映射为实体调 service 保存
- [ ] 配置 `payChannelMessageExecutor` 线程池（core=2,max=4,queue=100,DiscardPolicy）；查既有 AsyncConfig 决定是否新增 bean
  - **MCP:** `search_arch` query=`AsyncConfig paycenter`（查既有异步配置）
  - **Files:** `.../channel/unionpay/PayChannelMessageEvent.java`, `.../channel/unionpay/PayChannelMessageListener.java`, （按需）`.../paycenter/config/*Async*.java`
  - **Verify:** `mvn -pl jeecg-boot-module/jeecg-module-paycenter -am compile -q`（覆盖 R1 载体）

### Task 3: UnionPayHttpClient 拦截改造

- [ ] 注入 `ApplicationEventPublisher`（构造器追加，保持测试用构造器兼容：新参数放最后并给重载或默认 null-safe）
- [ ] post() 成功路径：`Outcome` 判定后发布事件（requestBody=new String(bytes, UTF_8)，responseBody=outcome.json 序列化或 nonJsonText，httpStatus，respCode=outcome.rawCode，costMs=elapsedMs(start)，traceId=PayTraceUtil.current()，mchntOrderId 从 body map 提取）；**try-catch Throwable 包裹发布**
- [ ] send() 失败路径（超时/IO）：在 `throw errorMapper.toException(...)` 前发布事件（responseBody=null，httpStatus=null，respCode=TIMEOUT/IO_ERROR）；同样 try-catch 包裹
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayHttpClient.java`
  - **Verify:** `mvn -pl jeecg-boot-module/jeecg-module-paycenter -am compile -q`；事件不含 Authorization（仅 body）（覆盖 R1/R3/R4）

### Task 4: 单测 + 回归基线

- [ ] `UnionPayHttpClientMessageTest`：①成功路径发布事件且字段匹配（mchntOrderId/apiType/respCode/httpStatus/costMs 非空）②send 超时路径发布事件 respCode=TIMEOUT、responseBody=null ③publisher 抛异常时 post 主流程不受影响
- [ ] `PayChannelMessageServiceTest`：saveMessage 内部异常被吞不抛出
- [ ] 回归：`mvn -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest='UnionPay*Test'` 117 基线 + 新增全绿
  - **Files:** `.../src/test/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayHttpClientMessageTest.java`, `.../src/test/java/org/jeecg/modules/paycenter/service/PayChannelMessageServiceTest.java`
  - **Verify:** `mvn -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest='UnionPay*Test,PayChannelMessage*Test'` 全绿（覆盖 R3/R5，回归 R1-R7）

### Task 5: 打包重启 80 + 冒烟

- [ ] 停 80 应用与冗余 java（`Get-Process java | Where Path -notmatch redhat | Stop-Process -Force`）
- [ ] `mvn -pl jeecg-module-system/jeecg-system-start -am package -DskipTests -q` 出 jar
- [ ] 后台重启：`. d:\software\dog-food\scripts\paycenter\run-local.ps1 -EnvOnly; java -jar backend\jeecg-boot\jeecg-module-system\jeecg-system-start\target\jeecg-system-start-3.9.5.jar`
- [ ] 探活 `http://127.0.0.1:80/jeecg-boot/v1/ping` 非 000；Flyway 日志确认 V20261024_2 success
  - **Verify:** 探活非 000 + flyway_schema_history 含 V20261024_2 success=1
