# 首筑支付中心 S2 银联通道适配 Implementation Plan

> **Spec:** `docs/superpowers/specs/2026-10-20-paycenter-s2-unionpay-channel-design.md`
> **Command:** `/plan-from-spec`
> **Status:** approved（批量模式，用户 2026-10-20 预授权不逐份审）

**Goal:** 在 `jeecg-module-paycenter` 内实现银联商务新购物车 APP 支付通道适配器（签名、下单、查询、退货、退货查询、关单、异步通知接收验签与幂等），供 S3 交易核心直接调用。

**Architecture:** 新增 `channel` 包：通道无关的 `PayChannel` 接口 + `PayChannelRouter` + 统一 DTO/异常/通知处理接口（S3 接缝），`channel.unionpay` 子包为银联实现（OPEN-BODY-SIG 签名、JDK `HttpClient` 调用、状态/错误映射、通知解析验签）。通道配置从 `pay_channel_config` 读取并经 `PayCryptoService` 解密、进程内缓存 60s；启动时可从环境变量引导加密写入。通知入口 `POST /notify/unionpay/pay` 由 `UnionPayNotifyService` 编排：IP 白名单 → 验签 → Redis 锁 + `notify_id` 唯一键幂等 → 分发 `PayNotifyHandler`（S2 默认实现仅留痕 IGNORED，S3 覆盖）。**不新增任何第三方依赖，不新增/修改 DDL。**

---

## Part 1 — 技术方案（APT 寻址）

### 1.1 范围与约束

**包含：** R1–R12（见 1.6）：通道抽象与路由、通道配置加密加载与环境变量引导、OPEN-BODY-SIG 签名、HTTP 客户端（超时/限流/9200 退避）、5 个银联接口、状态与 targetSys 映射、错误码映射与告警事件、通知接收（解析/验签/IP 白名单/幂等/分发/应答）、报文日志脱敏、`unionpay-live` 联调测试骨架、通知入口匿名可达的端到端验证。

**非目标（spec §3.2）：** 支付单/退款单状态机与落库（S3）；回调业务系统、定时查单、告警接钉钉（S4）；主备域名切换（`backup_base_urls` 仅保留字段）；分账（二期，**任何请求不得出现 `satType`/`satInfo`**）；对账文件（二期）；后台通道配置页面（S5，S5 修改配置后发布 `PayChannelConfigChangedEvent` 即可让缓存失效）。

**硬约束：**
- 凭证（AppId/AppKey/通讯密钥/商户号/终端号/subAppId/来源编号）只经环境变量或 `.apt/local/paycenter-app.env`（由 `scripts/paycenter/run-local.ps1` 注入）进入进程；yml 一律 `${ENV:}` 占位；入库只存 `*_enc` 密文；日志、异常消息、`pay_notify_record.raw_body` 均不得出现 AppKey/通讯密钥原文，商户号/终端号/subAppId 用 `PayMaskUtil.mask` 脱敏，`appPayRequest` 截断。
- 全局 `spring.main.lazy-initialization=true`：启动即需生效的 Bean（`PayChannelConfigBootstrap`、含 `@EventListener` 的 `PayChannelConfigService`）必须 `@Lazy(false)`。
- 根 pom 默认 `skipTests=true`，本模块 pom 已设 `skipTests=false`；打包用 `-DskipTests`。
- 环境：Windows PowerShell 5（无 `&&`）；Maven `E:\maven`，本地仓库 `E:\repo`，命令一律在 `backend/jeecg-boot` 下执行并优先 `-o`；JDK 17；Spring Boot 4.1；fastjson 2.0.58（`com.alibaba.fastjson` 兼容包，base-core 已传递）。
- 容器内 SQL 只用 `docker exec paycenter-mysql sh /tmp/m.sh -N -D jeecg-boot -e "<sql>"`。
- 编码规范：公开方法 Javadoc、`@author paycenter`、函数体 ≤80 行、参数 ≤5 个、禁止空 catch。
- **DDL：** 本片无新表、无改表（`pay_channel_config`、`pay_notify_record` 列已满足），不新增 Flyway 脚本；严禁修改已执行的 `V20261020_1/2`。

**测试策略结论（已在本机核实）：**
- Maven 实际本地仓库为 `E:\repo`（`E:\maven\conf\settings.xml` 的 `<localRepository>`）；`%USERPROFILE%\.m2\repository\com\squareup\okhttp3` 下**无** `mockwebserver`；`E:\repo\com\squareup\okhttp3\mockwebserver\4.12.0` 存在，但根 pom `dependencyManagement` 把 `com.squareup.okhttp3:okhttp` 锁定为 **4.4.1**（`backend/jeecg-boot/pom.xml` L395–399），而 mockwebserver 4.12.0 依赖 okhttp 4.12.0 + kotlin-stdlib 1.8.21 + junit 4.13.2，版本被仲裁后会二进制不兼容。
- **结论：不用 MockWebServer**，改用 JDK 自带 `com.sun.net.httpserver.HttpServer` 自建测试支撑类 `UnionPayMockServer`（零依赖）。spec R4/R5/R7 中的 “MockWebServer” 统一理解为“本地模拟银联 HTTP 服务”（见 1.5 回填项）。
- HTTP 客户端用 JDK `java.net.http.HttpClient`（强制 HTTP/1.1），不引入 OkHttp。
- 单元测试用 `spring-boot-starter-test` 自带的 JUnit 5 + Mockito + AssertJ；日志断言用 logback `ListAppender`。
- `@Tag("unionpay-live")` 默认由模块 pom 的 surefire `excludedGroups` 排除；`-Dgroups=unionpay-live` 时由 profile 自动解除排除（T1）。

### 1.2 设计寻址

N/A（S2 无 UI）。

### 1.3 依赖寻址表

| 依赖 | 来源 | 引用 | 摘要 |
|------|------|------|------|
| PayChannel / PayNotifyHandler 等通道契约 | `query_contract` name=`PayChannel` → 未命中 | —（本片新建） | 新建契约，非外部缺失依赖，不触发 `report_missing`；签名见 Part 2 T3 |
| PayCryptoService | arch（`search_arch` 命中 assetId `backend/jeecg-module-paycenter/util/PayCryptoService`） | `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/common/crypto/PayCryptoService.java` | `encrypt(String)`→`v{ver}:Base64`；`decrypt(String)`；`currentKeyVersion()`；可注入 `Function<Integer,String>` 旧 key 解析器的构造便于测试；key 无效抛 `IllegalStateException`（消息不含 key） |
| PayRateLimiter | arch（`search_arch` 命中 `.../util/PayRateLimiter`） | `.../common/redis/PayRateLimiter.java` | `tryAcquireUnionPay()`：键 `unionpay:global`，上限 `paycenter.unionpay-tps`/1s；非 final 类，可 Mockito mock |
| PayRedisLock | arch（`search_arch` 命中 `.../util/PayRedisLock`） | `.../common/redis/PayRedisLock.java` | `executeWithLock(key, ttl, wait, Supplier)`，拿不到锁抛 `PayException(SYSTEM_BUSY)` |
| PayNoGenerator | arch（`search_arch` 命中 `.../util/PayNoGenerator`） | `.../common/no/PayNoGenerator.java` | `unionpayMchntOrderId()` / `unionpayRefundOrderId()`（28 位，来源编号取 `paycenter.unionpay-msg-src-id`）；S2 不调用（由 S3 生成后传入），仅 live 测试使用 |
| PayTraceUtil | arch（`search_arch` 命中 `.../util/PayTraceUtil`） | `.../common/trace/PayTraceUtil.java` | `current()` 取 MDC `traceId`；logback pattern 已含 `%X{traceId}` |
| PayMaskUtil | arch（`search_arch` 命中 `.../util/PayMaskUtil`） | `.../common/crypto/PayMaskUtil.java` | `mask(String)`：保留前 3 后 4，中间 `****`；长度 ≤7 全 `*` |
| PayErrorCode / PayException | arch（`search_arch` 命中 enum `PayErrorCode`、util `PayException`） | `.../common/error/PayErrorCode.java`、`PayException.java` | 用 `PARAM_INVALID(1001)`、`CHANNEL_ERROR(5001)`、`SYSTEM_BUSY(9999)`；`PayException(code, detail)`，非 final 可继承；**不新增码**（码表为对外契约） |
| PayChannelConfig 实体 / IPayChannelConfigService / PayChannelConfigMapper | arch（`search_arch` 命中 `.../util/PayChannelConfig`、`PayChannelConfigServiceImpl`）+ 源码 | `.../entity/PayChannelConfig.java`、`.../service/IPayChannelConfigService.java`、`.../service/impl/PayChannelConfigServiceImpl.java`、`.../mapper/PayChannelConfigMapper.java` | 字段：channelCode/env/apiBaseUrl/backupBaseUrls/appId/appKeyEnc/commKeyEnc/msgSrc/msgSrcId/notifySignType/keyVersion/connectTimeoutMs/readTimeoutMs/rateLimitTps/status/remark/delFlag(`@TableLogic`)；`uk(channel_code)` **含已逻辑删除行** |
| PayNotifyRecord 实体 / IPayNotifyRecordService | arch（`search_arch` 命中 `.../util/PayNotifyRecord`：只增不改）+ 源码 | `.../entity/PayNotifyRecord.java`、`.../service/IPayNotifyRecordService.java`、`.../service/impl/PayNotifyRecordServiceImpl.java` | 字段：notifyId/msgType/mchntOrderId/refundOrderId/signType/signValid/rawBody/clientIp/processStatus/processResult/payOrderId/refundId/traceId/receiveTime/processTime/createTime；`uk(notify_id)`；**只 insert 不 update** |
| PayCenterProperties | 源码 | `.../config/PayCenterProperties.java` | `@ConfigurationProperties("paycenter")`，已有 `unionpayTps`、`unionpayMsgSrcId`；本片加嵌套 `unionpay` 节点（relaxed binding 下 `paycenter.unionpay-tps` 与 `paycenter.unionpay.*` 互不冲突） |
| Shiro 匿名放行 | arch（`search_arch` 命中 `backend/jeecg-boot/util/ShiroConfig`、`Shiro`）+ 源码 | `backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/application-dev.yml` L293 | `excludeUrls` 已含 `/notify/unionpay/**`（S1 R12），本片不改 |
| DDL | 源码 | `backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/flyway/sql/mysql/V20261020_1__paycenter_init_tables.sql` | `pay_channel_config` L65–90；`pay_notify_record` L224–247；**商户号/终端号/subAppId 在 `pay_merchant`（L9–11）与 `pay_merchant_project`（L34–35 覆盖），不在 `pay_channel_config`**；`pay_order.unionpay_mchnt_no/term_no` 为下单快照 |
| 银联接口真源 | 文档 | `paycenter/04-外部对接文档-银联商务.md` §2/§3/§4/§5/§6/§7/§8/§9 | 签名、5 个 URL、请求字段、状态枚举、通知验签规则、关单字段 |
| 通道错误映射 | 文档 | `paycenter/02-内部系统对接文档.md` §1.3 L56–64 | 0000→成功；1001→5001+告警不重试；1000→9999+告警；9200→退避 ≤3 次后 5001；其他→5001 查单；status=UNKNOWN→查单不判失败 |
| fastjson | 源码（根 pom L159–161，`fastjson.version=2.0.58`；base-core 18 个文件使用 `com.alibaba.fastjson.JSONObject`） | `backend/jeecg-boot/pom.xml` | 报文 JSON 序列化/解析；`JSONObject` 基于 `LinkedHashMap` 保序 |
| 测试支撑 TestDb / TestRedis | 源码 | `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/support/TestDb.java` | `TestDb.sessionFactory()` 已注册 14 个 Mapper，环境变量缺失直接 fail |
| run-local.ps1 | 源码 | `scripts/paycenter/run-local.ps1` | `-EnvOnly` 注入 `.apt/local/paycenter-app.env` 全部 KEY；默认后台启动并等 `/v1/ping`；`-Stop` 停止 |
| surefire / JUnit5 Tag | 框架（Spring Boot 4.1 parent 管理 surefire 3.x） | `backend/jeecg-boot/pom.xml` L638–644 | 支持 `groups` / `excludedGroups` |

### 1.4 拟改动模块与文件

根前缀：`M=backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter`，`J=M/src/main/java/org/jeecg/modules/paycenter`，`T=M/src/test/java/org/jeecg/modules/paycenter`，`S=backend/jeecg-boot/jeecg-module-system/jeecg-system-start`。（Part 2 的 **Files** 一律写完整路径。）

| 文件/模块 | 变更类型 | 说明 |
|-----------|----------|------|
| `M/pom.xml` | 修改 | surefire `excludedGroups` + `unionpay-live` profile |
| `J/config/PayCenterProperties.java` | 修改 | 嵌套 `UnionPay`/`Bootstrap` 配置，toString 脱敏 |
| `S/src/main/resources/application-dev.yml` | 修改 | `paycenter.unionpay.*` 配置节（全部 `${ENV:}`） |
| `scripts/paycenter/run-local.ps1` | 修改 | 仅新生成 app.env 模板时追加银联变量注释占位 |
| `J/channel/PayChannel.java`、`PayChannelRouter.java`、`PayChannelCode.java`、`PayChannelException.java`、`ChannelErrorInfo.java` | 新增 | 通道抽象与路由 |
| `J/channel/dto/*.java`（14 个：3 枚举 + 11 DTO） | 新增 | 统一 DTO 与枚举 |
| `J/channel/notify/PayNotifyHandler.java`、`PayNotifyHandleResult.java`、`NotifyProcessStatus.java`、`IgnoringPayNotifyHandler.java`、`UnionPayNotifyRecorder.java`、`NotifyRecordContext.java`、`UnionPayNotifyService.java` | 新增 | 通知分发接缝、留痕/告警、编排 |
| `J/channel/config/ChannelRuntimeConfig.java`、`PayChannelConfigService.java`、`PayChannelConfigBootstrap.java`、`PayChannelConfigChangedEvent.java` | 新增 | 通道配置加载/缓存/引导 |
| `J/channel/unionpay/UnionPayConstants.java`、`UnionPayApi.java`、`OpenBodySigSigner.java`、`UnionPayLogMasker.java`、`UnionPayStatusMapper.java`、`UnionPayErrorMapper.java`、`UnionPayHttpClient.java`、`UnionPayChannel.java`、`UnionPayNotifyParser.java`、`UnionPayNotifyVerifier.java` | 新增 | 银联实现 |
| `J/common/alert/PayAlertEvent.java`、`PayAlertType.java` | 新增 | 告警事件（S4 接钉钉） |
| `J/notify/UnionPayNotifyController.java` | 新增 | 通知入口 |
| `J/mapper/PayChannelConfigMapper.java` | 修改 | 增 `countByChannelCodeIncludingDeleted` |
| `J/service/IPayChannelConfigService.java`、`J/service/impl/PayChannelConfigServiceImpl.java` | 修改 | 增 `findActiveByCode` |
| `J/service/IPayNotifyRecordService.java`、`J/service/impl/PayNotifyRecordServiceImpl.java` | 修改 | 增 `existsByNotifyId` |
| `T/**`（14 个测试类 + `channel/unionpay/support/UnionPayMockServer.java`、`channel/unionpay/support/UnionPayTestFixtures.java`） | 新增 | 单测/集成测/联调骨架 |

### 1.5 风险与未决项

1. **MockWebServer 不可用 → JDK HttpServer**（理由见 1.1 测试策略）。回填 spec：R4/R5/R7 验收中的 “MockWebServer” 改为 “本地模拟银联 HTTP 服务（JDK HttpServer）”，断言内容不变。
2. **银联响应码字段名未经实测**：04 §4.2 写 `respCode/respDesc`，§9.3 写 `errCode`，§6 写 “SDK 示例 errCode=SUCCESS”。实现按“`respCode=0000` 或 `errCode∈{SUCCESS,0000}` 判成功；失败码取 `errCode` 优先、其次 `respCode`；描述取 `errInfo/errMsg/respDesc` 第一个非空”兼容两种写法，由 T15 联调确认后再收敛。错误码 1000/1001/9200 为联调惯例值（04 §9.3），银联官方码表到手后只改 `UnionPayErrorMapper`。
3. **`requestTimestamp`** 04 只在关单（§8）列出，其余接口未列；按文档实现，若联调报缺参再补（只改 `UnionPayChannel` 组包）。
4. **通知验签**：空值是否参与、报文格式须用真实测试通知确认 → `paycenter.unionpay.notify-sign-include-empty`（默认 false）可切换；`signType` 缺省按 MD5（spec），`pay_channel_config.notify_sign_type` 列本片不使用（保留）。
5. **`sysSource` 固定 `OPT`**（spec/04），`pay_channel_config.msg_src` 列本片不使用（保留）。
6. **商户号/终端号/subAppId 的归属（按 DDL 实际列）**：在 `pay_merchant.unionpay_mchnt_no/unionpay_term_no/wx_sub_appid`，小区可在 `pay_merchant_project.unionpay_mchnt_no/unionpay_term_no` 覆盖；**不在** `pay_channel_config`。因此 S2 的 DTO 由调用方传入 `vaMchntNo/vaTermNo/subAppId`；S3 负责解析（小区覆盖 > 商户主号）并写入 `pay_order.unionpay_mchnt_no/term_no` 快照，查单/退款/关单用快照。live 测试用环境变量 `PAY_UNIONPAY_MID/TID/SUB_APP_ID` 直接传入。
7. **限流参数**：`PayRateLimiter.tryAcquireUnionPay()` 用 `paycenter.unionpay-tps`，`pay_channel_config.rate_limit_tps` 本片不读取（引导写入时与配置同值）；S5 若要后台改 TPS 需另行接线。
8. **`appPayRequest` 透传**：响应为字符串时原样返回；为 JSON 对象时用 fastjson 保序重新序列化（字段与顺序不变），测试断言键序与值一致。若联调发现 SDK 对字节级敏感，再改为截取原文子串。
9. **多实例缓存失效**：`PayChannelConfigChangedEvent` 只在本实例生效，其余实例靠 60s TTL 收敛（可接受，配置变更低频）。
10. **通知来源 IP 白名单**：银商出口 IP 列表（04 §7 “APP 支付 PDF 生产 Q4 列表”）不在仓库 → 需用户提供；为空时不校验并 WARN。`X-Forwarded-For` 默认不信任（`notify-trust-forwarded-header=false`），部署在反向代理后需置 true 且代理覆盖该头。
11. **`pay_notify_record` 只增不改 + `uk(notify_id)`**：仅“已成功处理（PROCESSED/IGNORED）”的记录写入 `notify_id`；验签失败/IP 拒绝/处理异常/重复通知的记录 `notify_id=NULL`（原 notifyId 保留在脱敏后的 `raw_body`），从而银联重发时可重新分发且唯一键不被伪造通知占用。`raw_body` 存脱敏后的参数 JSON（无法用库内原文复验签，属有意取舍）。
12. **联调限制**：测试环境 9:00–18:00 且需出口 IP 白名单（约 2 天）；微信/云闪付无测试环境，只能生产联调；退款联调需先人工 App 实付 1 分（`PAY_UNIONPAY_LIVE_PAID_ORDER_ID`），否则该用例以 Assumption 跳过并提示。
13. **当前 active plan 为 S1 verify-fix（`docs/apt/plans/2026-10-21-verify-fix-paycenter-s1-quality-plan.md`）**：其 Files 仅涉及 `PayMapperSmokeTest`、`PayOpenApiExceptionHandler(Test)`、`PayWorkerIdAllocator`，与本 plan 无交集；建议其完成后再执行本 plan。
14. **需要用户提供的参数**（写入 `.apt/local/paycenter-app.env`，不进仓库/聊天）：`PAY_UNIONPAY_APP_ID`、`PAY_UNIONPAY_APP_KEY`、`PAY_UNIONPAY_COMM_KEY`、`PAY_UNIONPAY_BASE_URL`（测试 `https://test-api-open.chinaums.com`）、`PAY_UNIONPAY_ENV`（TEST/PROD，默认 TEST）、`PAY_UNIONPAY_MSG_SRC_ID`（S1 已定义）、`PAY_UNIONPAY_MID`、`PAY_UNIONPAY_TID`、`PAY_UNIONPAY_SUB_APP_ID`（微信，仅生产）、`PAY_UNIONPAY_NOTIFY_URL`（公网 https 回调地址）、`PAY_UNIONPAY_NOTIFY_IP_WHITELIST`（银商出口 IP）、可选 `PAY_UNIONPAY_LIVE_PAID_ORDER_ID`；另需向银联提交我方出口公网 IP 加白。
15. **回填 spec 项**：① 第 1 条；② `closeOrder` 对“已支付不可关闭”返回 `ChannelCloseResult(closed=false, statusAfter=PAID)` 而非抛异常（S3 据此转入支付成功处理）；③ 9200 重试耗尽后 `needQuery=false`（请求被限流拒绝，未受理）。

### 1.6 需求锁定对照

| Rn | 优先级 | 覆盖 Task | 备注 |
|----|--------|-----------|------|
| R1 | must | T3, T4, T11, T16 | T11 用真实 `UnionPayChannel` 断言路由 |
| R2 | must | T2, T5, T6, T16 | rg 无明文在 T16 |
| R3 | must | T7, T10 | T10 断言实际发出的请求签名 |
| R4 | must | T11 | |
| R5 | must | T12 | |
| R6 | must | T8, T11, T12 | |
| R7 | must | T10 | |
| R8 | must | T9, T10 | |
| R9 | must | T13, T14 | |
| R10 | must | T10, T14 | |
| R11 | must | T1, T15, T16 | |
| R12 | must | T14, T16 | |

must 覆盖检查：12/12 全覆盖。

---

## Part 2 — 可执行任务清单

> 每步 2–5 分钟粒度；`/implement-plan` 按 Task 派发子 Agent 串行执行。所有 mvn 命令在 `backend/jeecg-boot` 下执行，统一 `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter ...`（离线优先；首次失败可去掉 `-o`）。
> 用到 Redis/MySQL 的测试需先在同一 PowerShell 会话 `. scripts/paycenter/run-local.ps1 -EnvOnly`。
> 测试中的密钥一律用明显的假值（如 `testAppKey0123456789abcdefghijkl`、`testCommKey0123456789`），并集中放在 `UnionPayTestFixtures`；禁止使用真实凭证。
> 包名约定：`org.jeecg.modules.paycenter.channel`（下称 `channel`）；所有新类 `@author paycenter` + 类 Javadoc。

### Task 1: 构建 — `unionpay-live` 标签默认排除（R11）
- [ ] `M/pom.xml`：`<properties>` 增 `<paycenter.test.excludedGroups>unionpay-live</paycenter.test.excludedGroups>`；`<build>` 增 `<plugins><plugin>maven-surefire-plugin</plugin></plugins>`（groupId `org.apache.maven.plugins`，不写 version，由父 BOM 管理），`<configuration><excludedGroups>${paycenter.test.excludedGroups}</excludedGroups></configuration>`；保留原 `<resources>` 不变
- [ ] 同文件增 `<profiles><profile><id>unionpay-live</id><activation><property><name>groups</name><value>unionpay-live</value></property></activation><properties><paycenter.test.excludedGroups>paycenter-none</paycenter.test.excludedGroups></properties></profile></profiles>`（`-Dgroups=unionpay-live` 时自动激活，解除排除，使 spec R11 的命令原样可用）；加 XML 注释说明“live 用例需真实银联参数，默认排除”
  - **MCP:** 无（构建配置；依据 1.3 surefire 行）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/pom.xml`
  - **Verify:** `rg -n "<excludedGroups>\$\{paycenter.test.excludedGroups\}</excludedGroups>" backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/pom.xml` 命中 1 行；`rg -n "<paycenter.test.excludedGroups>unionpay-live</paycenter.test.excludedGroups>"` 命中 1 行；`rg -n "<value>unionpay-live</value>"` 命中 1 行；`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayErrorCodeTest` 通过（构建未被破坏；排除行为在 T15 实测，R11）

### Task 2: 配置 — `paycenter.unionpay.*` 节点 + 启动脚本模板（R2）
- [ ] `PayCenterProperties` 增字段 `private UnionPay unionpay = new UnionPay();`，新增 `public static class UnionPay`（`@Data`）字段与默认值：
  - `String notifyUrl`（银联回调我方地址，S3 下单时传入）
  - `boolean notifySignIncludeEmpty = false`（通知验签空值是否参与）
  - `String notifyIpWhitelist`（逗号分隔精确 IP，空=不校验）
  - `boolean notifyTrustForwardedHeader = false`（是否取 `X-Forwarded-For` 首个值作为来源 IP）
  - `int rateLimitWaitMs = 1000`（限流拒绝时最长等待）
  - `List<Long> busyRetryBackoffMs = List.of(200L, 500L, 1000L)`（9200 退避序列，长度=最大重试次数）
  - `int configCacheSeconds = 60`
  - `Bootstrap bootstrap = new Bootstrap()`
- [ ] 新增 `public static class Bootstrap`（`@Data`）：`String env = "TEST"`、`String apiBaseUrl`、`String appId`、`String appKey`、`String commKey`；**手写 `toString()`**：appKey/commKey 输出 `***`（为空输出 `<empty>`）；`UnionPay.toString()` 由 Lombok 生成但其中 bootstrap 走自定义 toString；`PayCenterProperties.toString()` 末尾追加 `", unionpay=" + unionpay`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/config/PayCenterProperties.java`
- [ ] `application-dev.yml` 的 `paycenter:` 节末尾追加（缩进 2 空格，与现有键同级）：
  ```yaml
    unionpay:
      notify-url: ${PAY_UNIONPAY_NOTIFY_URL:}
      notify-sign-include-empty: false
      notify-ip-whitelist: ${PAY_UNIONPAY_NOTIFY_IP_WHITELIST:}
      notify-trust-forwarded-header: false
      rate-limit-wait-ms: 1000
      busy-retry-backoff-ms: 200,500,1000
      config-cache-seconds: 60
      bootstrap:
        env: ${PAY_UNIONPAY_ENV:TEST}
        api-base-url: ${PAY_UNIONPAY_BASE_URL:}
        app-id: ${PAY_UNIONPAY_APP_ID:}
        app-key: ${PAY_UNIONPAY_APP_KEY:}
        comm-key: ${PAY_UNIONPAY_COMM_KEY:}
  ```
  - **Files:** `backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/application-dev.yml`
- [ ] `run-local.ps1` 的 `New-PcAppEnvFile` 模板 `$lines` 末尾追加注释占位（**仅影响新生成文件，不改已有文件，不打印值**）：`'# PAY_UNIONPAY_APP_ID=<fill>'`、`'# PAY_UNIONPAY_APP_KEY=<fill>'`、`'# PAY_UNIONPAY_COMM_KEY=<fill>'`、`'# PAY_UNIONPAY_BASE_URL=https://test-api-open.chinaums.com'`、`'# PAY_UNIONPAY_ENV=TEST'`、`'# PAY_UNIONPAY_MID=<fill>'`、`'# PAY_UNIONPAY_TID=<fill>'`、`'# PAY_UNIONPAY_SUB_APP_ID=<fill, PROD only>'`、`'# PAY_UNIONPAY_NOTIFY_URL=<public https url>'`、`'# PAY_UNIONPAY_NOTIFY_IP_WHITELIST=<comma separated ips>'`、`'# PAY_UNIONPAY_LIVE_PAID_ORDER_ID=<optional, paid mchntOrderId for refund live test>'`
  - **Files:** `scripts/paycenter/run-local.ps1`
- [ ] `PayCenterPropertiesTest`：用 `new Binder(new MapConfigurationPropertySource(map)).bind("paycenter", PayCenterProperties.class)` 绑定 `paycenter.unionpay-tps=7`、`paycenter.unionpay.notify-sign-include-empty=true`、`paycenter.unionpay.busy-retry-backoff-ms=100,200`、`paycenter.unionpay.bootstrap.app-key=secretAppKeyValue`、`paycenter.unionpay.bootstrap.comm-key=secretCommKeyValue`；断言 `unionpayTps==7`、`notifySignIncludeEmpty==true`、`busyRetryBackoffMs==[100,200]`、`bootstrap.appKey` 绑定正确；`properties.toString()` 不含 `secretAppKeyValue`/`secretCommKeyValue`；未配置时默认值 `rateLimitWaitMs==1000`、`configCacheSeconds==60`、`busyRetryBackoffMs==[200,500,1000]`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/config/PayCenterPropertiesTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayCenterPropertiesTest` 通过；`rg -n "app-key: \$\{PAY_UNIONPAY_APP_KEY:\}|comm-key: \$\{PAY_UNIONPAY_COMM_KEY:\}" backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/application-dev.yml` 命中 2 行；`rg -n "^\s*(app-key|comm-key|app-id):\s*[^$\s]" backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/application-dev.yml` 无命中（R2：配置无明文）

### Task 3: 通道抽象契约 — 接口 / DTO / 异常 / 事件（R1，S3 接缝）
- [ ] 枚举（包 `channel.dto`）：
  - `PayMethod { WECHAT, ALIPAY, UNIONPAY_CARD }`（与字典 `pay_method` 一致）
  - `ChannelOrderStatus { WAIT_PAY, PAID, CLOSED, REFUND, UNKNOWN }`
  - `ChannelRefundStatus { SUCCESS, FAIL, PROCESSING, UNKNOWN }`
- [ ] DTO（包 `channel.dto`，统一 `@Data @Builder @NoArgsConstructor @AllArgsConstructor`；金额一律 `Long` 分；时间 `java.util.Date`；字段 Javadoc 写清来源字段名）：

  | 类 | 字段 |
  |----|------|
  | `ChannelPayRequest` | `String payOrderNo`（→ attachedData）、`String mchntOrderId`、`PayMethod payMethod`、`Long totalAmount`、`String orderDesc`、`String vaMchntNo`、`String vaTermNo`、`String subAppId`（微信必传）、`String notifyUrl`、`Date expireTime`、`String srcReserve`（可空） |
  | `ChannelPayResult` | `String mchntOrderId`、`ChannelOrderStatus status`、`String rawStatus`、`String appPayRequest`、`String targetOrderId`、`String rawCode`、`String rawMessage` |
  | `ChannelQueryRequest` | `String mchntOrderId`、`String vaMchntNo`、`String vaTermNo` |
  | `ChannelQueryResult` | `String mchntOrderId`、`ChannelOrderStatus status`、`String rawStatus`、`Date payTime`、`String rawPayTime`、`PayMethod targetSys`（未识别为 null）、`String rawTargetSys`、`String targetOrderId`、`String settleDate`（原样）、`Long totalAmount`、`String cardAttr`、`String seqId`、`String rawCode`、`String rawMessage` |
  | `ChannelRefundRequest` | `String mchntOrderId`（原支付单）、`String refundOrderId`、`Long refundAmount`、`String vaMchntNo`、`String vaTermNo` |
  | `ChannelRefundQueryRequest` | `String refundOrderId`、`String vaMchntNo`、`String vaTermNo` |
  | `ChannelRefundResult` | `String refundOrderId`、`ChannelRefundStatus refundStatus`、`String rawRefundStatus`、`Long refundAmount`、`String channelRefundId`（响应含 `refundTargetOrderId` 时填充，否则 null）、`String rawCode`、`String rawMessage` |
  | `ChannelCloseRequest` | `String mchntOrderId`、`String vaMchntNo`、`String vaTermNo` |
  | `ChannelCloseResult` | `boolean closed`、`ChannelOrderStatus statusAfter`、`String rawCode`、`String rawMessage` |
  | `ChannelNotifyRequest` | `String rawBody`、`Map<String,String[]> parameterMap`、`String clientIp` |
  | `ChannelNotify` | `boolean signValid`、`String failReason`、`String signType`、`String notifyId`、`String msgType`、`String mchntOrderId`、`String refundOrderId`、`ChannelOrderStatus status`、`String rawStatus`、`Long totalAmount`、`Long refundAmount`、`Date payTime`、`PayMethod targetSys`、`String rawTargetSys`、`String seqId`、`String cardAttr`、`String mid`、`String tid`、`Map<String,String> params`（不可变）、`String maskedBody` |
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/dto/PayMethod.java`, `.../channel/dto/ChannelOrderStatus.java`, `.../channel/dto/ChannelRefundStatus.java`, `.../channel/dto/ChannelPayRequest.java`, `.../channel/dto/ChannelPayResult.java`, `.../channel/dto/ChannelQueryRequest.java`, `.../channel/dto/ChannelQueryResult.java`, `.../channel/dto/ChannelRefundRequest.java`, `.../channel/dto/ChannelRefundQueryRequest.java`, `.../channel/dto/ChannelRefundResult.java`, `.../channel/dto/ChannelCloseRequest.java`, `.../channel/dto/ChannelCloseResult.java`, `.../channel/dto/ChannelNotifyRequest.java`, `.../channel/dto/ChannelNotify.java`（前缀均为 `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter`）
- [ ] 通道接口与异常（包 `channel`），完整签名：
  ```java
  public interface PayChannel {
      /** 通道编码，与 pay_channel_config.channel_code / pay_order.pay_channel 一致，如 "UNIONPAY" */
      String channelCode();
      /** 下单；入参非法抛 PayException(PARAM_INVALID)；通道错误抛 PayChannelException；status=UNKNOWN 正常返回交由查单 */
      ChannelPayResult createOrder(ChannelPayRequest request);
      ChannelQueryResult queryOrder(ChannelQueryRequest request);
      /** 退款；refundStatus 未知值一律 UNKNOWN */
      ChannelRefundResult refund(ChannelRefundRequest request);
      ChannelRefundResult queryRefund(ChannelRefundQueryRequest request);
      /** 关单；已支付不可关闭时返回 closed=false + statusAfter=PAID，不抛异常 */
      ChannelCloseResult closeOrder(ChannelCloseRequest request);
      /** 解析并验签通知；从不因验签失败抛异常，以 signValid/failReason 表达 */
      ChannelNotify parseAndVerifyNotify(ChannelNotifyRequest request);
  }
  public enum PayChannelCode { UNIONPAY }
  /** 通道原始错误信息（不含任何密钥） */
  public record ChannelErrorInfo(String channelCode, String api, String rawCode, String rawMessage) {}
  public class PayChannelException extends PayException {
      public PayChannelException(PayErrorCode errorCode, ChannelErrorInfo info, boolean needQuery);
      public ChannelErrorInfo getInfo();
      /** true=请求可能已被通道受理或结果未知，调用方必须查单/查退款兜底，严禁直接判失败 */
      public boolean isNeedQuery();
  }
  ```
  `PayChannelException` 的 detail = `channelCode + " " + api + " rawCode=" + rawCode + " rawMsg=" + 截断128(rawMessage)`
  - **Files:** `.../channel/PayChannel.java`, `.../channel/PayChannelCode.java`, `.../channel/ChannelErrorInfo.java`, `.../channel/PayChannelException.java`（前缀同上）
- [ ] 通知分发接缝（包 `channel.notify`），完整签名：
  ```java
  public enum NotifyProcessStatus { PROCESSED, IGNORED, ERROR }   // 与字典 notify_process_status 一致
  @Data @Builder @NoArgsConstructor @AllArgsConstructor
  public class PayNotifyHandleResult {
      private NotifyProcessStatus status;   // 只允许 PROCESSED / IGNORED
      private String payOrderId;            // 匹配到的 pay_order.id，可空
      private String refundId;              // 匹配到的 pay_refund_order.id，可空
      private String message;               // ≤512，落 process_result
      public static PayNotifyHandleResult processed(String payOrderId, String refundId, String message);
      public static PayNotifyHandleResult ignored(String message);
  }
  /**
   * 验签通过的银联通知业务处理（S3 实现）。契约：
   * 1) 必须幂等（同一通知可能因 FAILED 应答被银联重发，按单据状态判重）；
   * 2) 处理成功返回 PROCESSED，无需处理（如单据不存在/已终态）返回 IGNORED；
   * 3) 需要银联重发时抛任意 RuntimeException（S2 记 ERROR、回 FAILED、发告警）；
   * 4) S3 实现类标注 @Order(0)（S2 默认实现为 LOWEST_PRECEDENCE），按 notify.status=TRADE_REFUND+refundOrderId 识别退款通知。
   */
  public interface PayNotifyHandler {
      PayNotifyHandleResult handle(ChannelNotify notify);
  }
  ```
  - **Files:** `.../channel/notify/NotifyProcessStatus.java`, `.../channel/notify/PayNotifyHandleResult.java`, `.../channel/notify/PayNotifyHandler.java`（前缀同上）
- [ ] 事件：`common/alert/PayAlertType { CHANNEL_AUTH_FAILED, CHANNEL_SIGN_FAILED, NOTIFY_SIGN_INVALID, NOTIFY_IP_REJECTED, NOTIFY_PROCESS_ERROR }`；`common/alert/PayAlertEvent`（final，字段 `PayAlertType type`、`String channelCode`、`String summary`（不得含密钥/完整商户号）、`String traceId`、`Date occurredAt`；构造 `PayAlertEvent(PayAlertType type, String channelCode, String summary)` 内部取 `PayTraceUtil.current()` 与 `new Date()`；`@Getter @ToString`）；`channel/config/PayChannelConfigChangedEvent`（final，字段 `String channelCode`，S5 修改配置后发布）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/common/alert/PayAlertType.java`, `.../common/alert/PayAlertEvent.java`, `.../channel/config/PayChannelConfigChangedEvent.java`
  - **Verify:** `mvn -q -o -DskipTests -pl jeecg-boot-module/jeecg-module-paycenter compile` 退出码 0；`(Get-ChildItem backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/dto/*.java).Count` = 14；`rg -n "ChannelNotify parseAndVerifyNotify\(ChannelNotifyRequest request\)" .../channel/PayChannel.java` 命中 1 行（R1 契约部分）

### Task 4: `PayChannelRouter`（R1）
- [ ] `channel/PayChannelRouter`（`@Component`）：构造注入 `List<PayChannel> channels`，按 `channelCode()` 建 `Map`；重复编码 → `IllegalStateException("duplicate pay channel: X")`。方法：
  - `PayChannel get(String channelCode)`：`trim().toUpperCase(Locale.ROOT)` 后查找；null/空/未注册 → `PayException(CHANNEL_ERROR, "unsupported channel: " + code)`
  - `Set<String> supportedCodes()`（不可变）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/PayChannelRouter.java`
- [ ] `PayChannelRouterTest`：先用匿名 `PayChannel` 桩（`channelCode()` 返回 `UNIONPAY`；真实 `UnionPayChannel` 的断言在 T11 追加）；断言 `get("UNIONPAY")` 与 `get(" unionpay ")` 返回同一实例；`get("WXPAY")`、`get(null)`、`get("")` 抛 `PayException` 且 `getErrorCode()==CHANNEL_ERROR`（5001）；两个同编码桩构造抛 `IllegalStateException`；`supportedCodes()=={"UNIONPAY"}`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/PayChannelRouterTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayChannelRouterTest` 通过：UNIONPAY 返回银联实现、未知 code 抛 `PayException(5001)`（R1；真实 `UnionPayChannel` 装配在 T16 启动验证）

### Task 5: 通道配置加载 — 解密 + 60s 缓存 + 失效（R2）
- [ ] `PayChannelConfigMapper` 增：
  ```java
  /** 含已逻辑删除行的计数（uk(channel_code) 覆盖逻辑删除行，引导写入前必须用它判断） */
  @Select("SELECT COUNT(*) FROM pay_channel_config WHERE channel_code = #{channelCode}")
  long countByChannelCodeIncludingDeleted(@Param("channelCode") String channelCode);
  ```
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/mapper/PayChannelConfigMapper.java`
- [ ] `IPayChannelConfigService` 增 `PayChannelConfig findActiveByCode(String channelCode)`（`status=1` 且未逻辑删除，`last("limit 1")`）与 `long countIncludingDeleted(String channelCode)`；`PayChannelConfigServiceImpl` 实现（分别委托 `lambdaQuery()` 与 mapper 新方法）
  - **MCP:** `search_arch` query=`PayChannelConfigServiceImpl`（已命中，见 1.3）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/service/IPayChannelConfigService.java`, `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/service/impl/PayChannelConfigServiceImpl.java`
- [ ] `channel/config/ChannelRuntimeConfig`（Lombok `@Value @Builder`，`@ToString(exclude = {"appKey", "commKey"})`）：`channelCode`、`env`、`apiBaseUrl`（去掉末尾 `/`）、`appId`、`appKey`（明文，仅内存）、`commKey`（明文，仅内存）、`msgSrcId`、`int connectTimeoutMs`、`int readTimeoutMs`；静态工厂 `from(PayChannelConfig entity, String appKey, String commKey)`，`connect/read` 为 null 时取 3000/10000
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/config/ChannelRuntimeConfig.java`
- [ ] `channel/config/PayChannelConfigService`（`@Service @Lazy(false)`）：
  - 公开构造 `(IPayChannelConfigService configService, PayCryptoService cryptoService, PayCenterProperties properties)`；包内构造多一个 `LongSupplier nanoClock`（测试推进时间），公开构造传 `System::nanoTime`
  - `ChannelRuntimeConfig getActive(String channelCode)`：`ConcurrentHashMap<String, CacheEntry(config, expireAtNanos)>` 命中且未过期直接返回；否则 `findActiveByCode` → null 抛 `PayException(CHANNEL_ERROR, "channel config missing: X")`；`apiBaseUrl/appId/appKeyEnc` 空 → `PayException(CHANNEL_ERROR, "channel config incomplete: X")`；`decrypt` 抛 `IllegalStateException/IllegalArgumentException` → `log.error("paycenter channel key decrypt failed, channel={}")`（不打印密文/明文）后抛 `PayException(CHANNEL_ERROR, "channel key decrypt failed")`；TTL = `properties.getUnionpay().getConfigCacheSeconds()`
  - `void evict(String channelCode)`、`void evictAll()`
  - `@EventListener public void onConfigChanged(PayChannelConfigChangedEvent event)` → `evict(event.getChannelCode())`
  - 类 Javadoc 说明：其他实例靠 TTL 收敛
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/config/PayChannelConfigService.java`
- [ ] `PayChannelConfigServiceTest`（Mockito mock `IPayChannelConfigService`；真实 `PayCryptoService(props, v -> null)`，props.masterKey = 测试内 `SecureRandom` 生成的 32 字节 Base64；可变 `AtomicLong` 作为 nanoClock）：
  1. 用 crypto 加密 `testAppKey0123456789abcdefghijkl`/`testCommKey0123456789` 构造实体 → `getActive("UNIONPAY")` 的 appKey/commKey 等于明文；实体 `appKeyEnc` 以 `v1:` 开头且不含明文
  2. TTL 内连续两次调用 → `verify(configService, times(1)).findActiveByCode("UNIONPAY")`
  3. 时钟推进 61s → 再调用 → `times(2)`
  4. `onConfigChanged(new PayChannelConfigChangedEvent("UNIONPAY"))` 后调用 → 次数 +1
  5. `findActiveByCode` 返回 null → `PayException` 码 5001
  6. 密文被篡改（改 1 个 Base64 字符）→ `PayException` 码 5001，且异常消息不含明文
  7. `ChannelRuntimeConfig.toString()` 不含 appKey/commKey 明文；`apiBaseUrl` 输入 `https://x/` → 输出 `https://x`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/config/PayChannelConfigServiceTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayChannelConfigServiceTest` 通过：解密正确、缓存命中、TTL 过期与事件失效后重新加载、缺配置 5001（R2）

### Task 6: 通道配置环境变量引导写入 + 密文入库实测（R2）
- [ ] `channel/config/PayChannelConfigBootstrap`（`@Component @Lazy(false) implements ApplicationRunner`，构造注入 `IPayChannelConfigService`、`PayCryptoService`、`PayCenterProperties`）：
  - `public boolean bootstrapIfAbsent()`：
    1. 取 `properties.getUnionpay().getBootstrap()`；`apiBaseUrl/appId/appKey/commKey` 全空 → `log.info("paycenter unionpay bootstrap skipped: no PAY_UNIONPAY_* env")` 返回 false
    2. 部分为空 → `log.warn("paycenter unionpay bootstrap skipped, missing env: {}", 缺失的变量名列表如 PAY_UNIONPAY_APP_KEY)` 返回 false（只打印变量名）
    3. `countIncludingDeleted("UNIONPAY") > 0` → `log.info("... already exists, skip")` 返回 false（**不覆盖已有**）
    4. 组装实体：`channelCode=UNIONPAY`、`env=bootstrap.env`（空→TEST）、`apiBaseUrl`（去尾 `/`）、`appId`、`appKeyEnc=crypto.encrypt(appKey)`、`commKeyEnc=crypto.encrypt(commKey)`、`msgSrcId=properties.unionpayMsgSrcId`、`notifySignType=SHA256`、`keyVersion=crypto.currentKeyVersion()`、`connectTimeoutMs=3000`、`readTimeoutMs=10000`、`rateLimitTps=properties.unionpayTps`、`status=1`、`delFlag=0`、`createBy="system"`、`remark="bootstrap from env"`；`save` 成功 `log.info("paycenter unionpay channel config bootstrapped, env={}, keyVersion={}")` 返回 true
    5. `encrypt` 抛 `IllegalStateException`（主密钥无效）→ `log.warn` 返回 false；`save` 抛 `org.springframework.dao.DuplicateKeyException`（多实例并发）→ `log.info` 返回 false
  - `run(ApplicationArguments)`：调用上式，任何 `RuntimeException` 仅 `log.warn("paycenter unionpay bootstrap failed: {}", e.getClass().getSimpleName())`，不阻断启动
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/config/PayChannelConfigBootstrap.java`
- [ ] `PayChannelConfigBootstrapTest`（Mockito；`ArgumentCaptor<PayChannelConfig>`；logback `ListAppender` 挂 `PayChannelConfigBootstrap` logger）：
  1. 四项齐全 + count=0 → 返回 true，captor 实体 `crypto.decrypt(appKeyEnc)` 等于输入、`appKeyEnc` 不含明文、channelCode/env/status/keyVersion/超时/rateLimitTps 符合上表
  2. count=1 → 返回 false，`verify(service, never()).save(any())`
  3. 缺 appKey → 返回 false、never save；WARN 日志含 `PAY_UNIONPAY_APP_KEY`，所有日志不含其余三项的值
  4. 主密钥无效（props.masterKey=null）→ 返回 false、不抛异常
  5. `save` 抛 `DuplicateKeyException` → 返回 false、不抛异常
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/config/PayChannelConfigBootstrapTest.java`
- [ ] `PayChannelConfigDbTest`（真实 MySQL，`TestDb.sessionFactory()`）：生成 `code="UT_UP_" + 6 位随机大写`；用 crypto 加密后经 `PayChannelConfigMapper.insert`；`SqlSession.getConnection()` 原生 `SELECT app_key_enc, comm_key_enc FROM pay_channel_config WHERE channel_code=?` → 以 `v1:` 开头、不含明文、解密等于明文；`countByChannelCodeIncludingDeleted(code)==1`；`deleteById`（逻辑删）后仍 `==1`；`finally` 原生 `DELETE FROM pay_channel_config WHERE channel_code LIKE 'UT_UP_%'` 并 commit
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/config/PayChannelConfigDbTest.java`
  - **Verify:** `. scripts/paycenter/run-local.ps1 -EnvOnly; mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test "-Dtest=PayChannelConfigBootstrapTest,PayChannelConfigDbTest"` 通过；之后 `docker exec paycenter-mysql sh /tmp/m.sh -N -D jeecg-boot -e "select count(*) from pay_channel_config where channel_code like 'UT_UP_%'"` 输出 `0`（R2：密文入库、解密正确、引导幂等不覆盖）

### Task 7: OPEN-BODY-SIG 签名器（R3）
- [ ] `channel/unionpay/OpenBodySigSigner`（final，非 Bean）：
  - 公开无参构造：`Clock.system(ZoneId.of("Asia/Shanghai"))` + nonce = `UUID.randomUUID().toString().replace("-", "")`（32 位小写 hex）
  - 包内构造 `(Clock clock, Supplier<String> nonceSupplier)`
  - `public static String bodyDigestHex(byte[] body)`：SHA-256，**小写** hex（`HexFormat.of().formatHex`）
  - `public static String signature(String appId, String appKey, String timestamp, String nonce, byte[] body)`：`C = appId + timestamp + nonce + bodyDigestHex(body)`（UTF-8），`Base64(HmacSHA256(C, appKey))`
  - `public static String authorization(String appId, String timestamp, String nonce, String signature)`：`OPEN-BODY-SIG AppId="..", Timestamp="..", Nonce="..", Signature=".."`（逗号后一个空格）
  - `public SignedHeader sign(String appId, String appKey, byte[] body)`：timestamp=`yyyyMMddHHmmss`（时钟时区 Asia/Shanghai）；返回 `public record SignedHeader(String timestamp, String nonce, String authorization)`
  - `GeneralSecurityException` → `IllegalStateException("OPEN-BODY-SIG sign failed")`（不带 key）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/OpenBodySigSigner.java`
- [ ] `UnionPayTestFixtures`（test 支撑，final 常量类）：`APP_ID="testAppId001"`、`APP_KEY="testAppKey0123456789abcdefghijkl"`、`COMM_KEY="testCommKey0123456789"`、`MID="898000000000001"`、`TID="88880001"`；方法 `ChannelRuntimeConfig config(String baseUrl, int connectMs, int readMs)`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/support/UnionPayTestFixtures.java`
- [ ] `OpenBodySigSignerTest`（期望值已由 .NET `SHA256`/`HMACSHA256` 在规划阶段**独立计算**，非 Java 实现自证）：
  - 输入：AppId=`testAppId001`，Timestamp=`20261021120000`，Nonce=`abcdef0123456789abcdef0123456789`，AppKey=`testAppKey0123456789abcdefghijkl`，body（UTF-8 原样）=`{"mchntOrderId":"TEST20261021120000000000001","totalAmount":"1"}`
  - 断言 `bodyDigestHex == "0286d08b6facc97f839054314fa695c39eac536a86c246796eb67782290ad8c2"`
  - 断言 `signature == "ijdzQvmGCvFEBs0mRS1sxGWzEz22uKjaWgCK3SO9pYg="`
  - 断言 `authorization == "OPEN-BODY-SIG AppId=\"testAppId001\", Timestamp=\"20261021120000\", Nonce=\"abcdef0123456789abcdef0123456789\", Signature=\"ijdzQvmGCvFEBs0mRS1sxGWzEz22uKjaWgCK3SO9pYg=\""`
  - `new OpenBodySigSigner(Clock.fixed(Instant.parse("2026-10-21T04:00:00Z"), ZoneId.of("Asia/Shanghai")), () -> "abcdef0123456789abcdef0123456789").sign(...)` 的 timestamp=`20261021120000` 且 authorization 与上相同
  - 默认构造生成的 header 匹配 `^OPEN-BODY-SIG AppId="[^"]+", Timestamp="\d{14}", Nonce="[0-9a-f]{32}", Signature="[A-Za-z0-9+/]+=*"$`；连续两次 nonce 不同
  - body 改 1 字节 → signature 不同
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/OpenBodySigSignerTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=OpenBodySigSignerTest` 通过：固定输入输出与独立参考值 `ijdzQvmGCvFEBs0mRS1sxGWzEz22uKjaWgCK3SO9pYg=` 一致、Header 格式断言通过（R3）

### Task 8: 状态与 targetSys 映射（R6）
- [ ] `channel/unionpay/UnionPayStatusMapper`（final 工具类，静态方法）：
  - `ChannelOrderStatus toOrderStatus(String raw)`：`NEW_ORDER`、`WAIT_BUYER_PAY`→`WAIT_PAY`；`TRADE_SUCCESS`→`PAID`；`TRADE_CLOSED`→`CLOSED`；`TRADE_REFUND`→`REFUND`；`UNKNOWN`/null/空/其他→`UNKNOWN`（trim 后**区分大小写精确匹配**，未知值不得落到任何确定态）
  - `PayMethod toPayMethod(String rawTargetSys)`：trim + 忽略大小写：`WXPay`→`WECHAT`；以 `ALIPAY` 开头（兼容 `Alipay 2.0`）→`ALIPAY`；`UNIONPAY`、`UAC`→`UNIONPAY_CARD`；其他/null→`null`
  - `ChannelRefundStatus toRefundStatus(String raw)`：`SUCCESS`/`FAIL`/`PROCESSING`→同名；其他（含 `UNKNOWN`、null、`success` 小写、`WEIRD`）→`UNKNOWN`
  - `String msgTypeOf(PayMethod method)`：`WECHAT→wx.unifiedOrder`、`ALIPAY→trade.appPreOrder`、`UNIONPAY_CARD→uac.appOrder`；null → `PayException(PARAM_INVALID, "payMethod required")`
  - 类 Javadoc 引用 04 §4.2 / §6 / §10.1
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayStatusMapper.java`
- [ ] `UnionPayStatusMapperTest`：`@ParameterizedTest @CsvSource` 覆盖 6 个状态（`NEW_ORDER,WAIT_BUYER_PAY,TRADE_SUCCESS,TRADE_CLOSED,TRADE_REFUND,UNKNOWN`）+ 未知值 `FOO`、`trade_success`（小写）、null、空串 → `UNKNOWN`；targetSys `WXPay/wxpay/ALIPAY/Alipay 2.0/UNIONPAY/UAC/QMF/null`；refundStatus 4 个 + `success`/`WEIRD`/null；msgType 3 种 + null 抛 1001
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayStatusMapperTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=UnionPayStatusMapperTest` 通过：6 个状态 + 未知值全量映射、targetSys 三类映射（R6）

### Task 9: 错误码映射 + 告警事件（R8）
- [ ] `channel/unionpay/UnionPayErrorMapper`（`@Component`，构造注入 `ApplicationEventPublisher`）：
  - 常量 `BUSY="9200"`、`AUTH_FAILED="1001"`、`SIGN_FAILED="1000"`
  - `public boolean isRetryable(String rawCode)`：仅 `9200`
  - `public PayChannelException toException(String api, String rawCode, String rawMessage)`（≤5 参，`ChannelErrorInfo` 的 channelCode 固定 `UNIONPAY`）：
    | rawCode | PayErrorCode | needQuery | 告警事件 |
    |---------|--------------|-----------|----------|
    | `1001` | `CHANNEL_ERROR`(5001) | false | `CHANNEL_AUTH_FAILED` |
    | `1000` | `SYSTEM_BUSY`(9999) | false | `CHANNEL_SIGN_FAILED` |
    | `9200`（重试耗尽） | `CHANNEL_ERROR` | false | 无 |
    | `RATE_LIMITED`（本地限流等待超时） | `CHANNEL_ERROR` | false | 无 |
    | 其他 / null / `TIMEOUT` / `IO_ERROR` / `HTTP_xxx` / `INVALID_JSON` | `CHANNEL_ERROR` | **true** | 无 |
  - 告警 summary：`"unionpay " + api + " rawCode=" + rawCode`（不含报文）；`log.warn` 同内容
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayErrorMapper.java`
- [ ] `UnionPayErrorMapperTest`（publisher 用 lambda 收集到 `List<Object>`）：1001→码 5001 + 1 个 `PayAlertEvent(type=CHANNEL_AUTH_FAILED, channelCode=UNIONPAY)` + needQuery=false；1000→9999 + `CHANNEL_SIGN_FAILED`；9200→5001 无事件 needQuery=false；`E999`/null→5001 needQuery=true 无事件；`TIMEOUT`→needQuery=true；`isRetryable("9200")` true、`"1001"` false；`getInfo().rawCode()` 原样保留
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayErrorMapperTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=UnionPayErrorMapperTest` 通过：1001→5001+事件、1000→9999+事件、未知→5001（R8）

### Task 10: HTTP 客户端 — 签名发送 / 超时 / 限流 / 9200 退避 / 脱敏日志（R3, R7, R8, R10）
- [ ] `channel/unionpay/UnionPayConstants`（final）：`CHANNEL_CODE="UNIONPAY"`、`INST_MID="APPDEFAULT"`、`NEW_SHOP_FLAG="GWCXS"`、`IS_SUB_MCHNT_PAY="02"`、`SYS_SOURCE="OPT"`、`DATETIME_PATTERN="yyyy-MM-dd HH:mm:ss"`、`ZONE=ZoneId.of("Asia/Shanghai")`
- [ ] `channel/unionpay/UnionPayApi` 枚举（`path`、`desc`）：`CREATE_ORDER("/v1/inip/upsp/shop/app/pay","下单")`、`QUERY_ORDER("/v1/inip/upsp/shop/online/query","交易查询")`、`REFUND("/v1/inip/upsp/shop/online/refund","退货")`、`QUERY_REFUND("/v1/inip/upsp/shop/online/refund-query","退货查询")`、`CLOSE_ORDER("/v1/inip/upsp/shop/common/order-close","关单")`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayConstants.java`, `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayApi.java`
- [ ] `channel/unionpay/UnionPayLogMasker`（final 工具类）：
  - `public static Map<String,Object> maskParams(Map<String,?> src)`：返回新 `LinkedHashMap`；键忽略大小写：`vaMchntNo/vaTermNo/mid/tid/subAppId/merchantId/terminalId/buyerId/openId/subOpenId/bankCardNo/buyerUsername` → `PayMaskUtil.mask(String.valueOf(v))`；`sign/appKey/commKey/signature/authorization` → `***`；`appPayRequest` → 字符串化后取前 8 字符 + `...(len=N)`；值为 `Map`（如 `vaFld`）递归
  - `public static String maskJson(Map<String,?> src)`：`JSON.toJSONString(maskParams(src))`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayLogMasker.java`
- [ ] `channel/unionpay/UnionPayHttpClient`（`@Slf4j @Component`）：
  - 公开构造 `(PayRateLimiter rateLimiter, UnionPayErrorMapper errorMapper, PayCenterProperties properties)`；包内构造多 `(OpenBodySigSigner signer, Sleeper sleeper)`，`Sleeper` 为包内 `@FunctionalInterface interface Sleeper { void sleep(long ms) throws InterruptedException; }`（只用于 9200 退避，便于测试断言退避序列）
  - `HttpClient` 按 `connectTimeoutMs` 缓存在 `ConcurrentHashMap<Integer, HttpClient>`：`HttpClient.newBuilder().version(HTTP_1_1).connectTimeout(Duration.ofMillis(connectMs)).build()`
  - `public JSONObject post(UnionPayApi api, Map<String,Object> body, ChannelRuntimeConfig cfg)`（主流程 ≤80 行，拆私有方法）：
    1. `for attempt = 0..backoff.size()`：
    2. `acquirePermit()`：循环 `rateLimiter.tryAcquireUnionPay()`，false 则 `Thread.sleep(50)`，累计超过 `rateLimitWaitMs` → `throw errorMapper.toException(api.name(), "RATE_LIMITED", "local rate limit wait timeout")`
    3. `byte[] bytes = JSON.toJSONString(body).getBytes(UTF_8)`；`SignedHeader h = signer.sign(cfg.getAppId(), cfg.getAppKey(), bytes)`；`HttpRequest`：`POST cfg.apiBaseUrl + api.path`、`timeout(Duration.ofMillis(readTimeoutMs))`、`Content-Type: application/json;charset=UTF-8`、`Authorization: h.authorization()`，`BodyPublishers.ofByteArray(bytes)`（**签名字节 = 发送字节**）
    4. 发送：`HttpTimeoutException` → rawCode `TIMEOUT`；其他 `IOException` → `IO_ERROR`；`InterruptedException` → 恢复中断标志 + `IO_ERROR`；均记 WARN 日志后 `throw errorMapper.toException(...)`（**不重试**，needQuery=true）
    5. 解析：响应体非 JSON → `JSONObject` 空 + rawCode `HTTP_<status>`（2xx 时为 `INVALID_JSON`）；判成功：`"0000".equals(respCode) || "SUCCESS".equalsIgnoreCase(errCode) || "0000".equals(errCode)` 且 HTTP 2xx；失败 rawCode = 非空 `errCode` 优先，否则 `respCode`；rawMessage = `errInfo`/`errMsg`/`respDesc`/`errMessage` 第一个非空
    6. INFO 日志一行：`unionpay api={} httpStatus={} success={} rawCode={} costMs={} attempt={} req={} resp={}`，req/resp 均经 `UnionPayLogMasker.maskJson`；**任何分支禁止打印 Authorization 头、appKey、commKey**
    7. 成功返回 JSON；`errorMapper.isRetryable(rawCode)` 且还有退避额度 → `sleeper.sleep(backoff[attempt])` 后继续；否则 `throw errorMapper.toException(api.name(), rawCode, rawMessage)`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayHttpClient.java`
- [ ] 测试支撑 `UnionPayMockServer`（test 包，`AutoCloseable`）：`HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0)` + `Executors.newCachedThreadPool()`；根 context 处理器：读取并记录 `RecordedRequest(String method, String path, Map<String,String> headers(小写键), byte[] body)` 到 `LinkedBlockingQueue`，弹出下一个预置 `StubResponse(int status, String body, long delayMs)`（无预置返回 500 `{"errCode":"NO_STUB"}`），延迟后写回（`Content-Type: application/json;charset=UTF-8`；客户端已超时导致的 `IOException` 吞掉并计数，**不得空 catch**，需注释说明）；方法：`start()`、`baseUrl()`、`enqueue(int status, String body)`、`enqueue(int status, String body, long delayMs)`、`RecordedRequest takeRequest()`（最多等 2s，超时返回 null）、`int requestCount()`、`close()`（`stop(0)` + 关线程池）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/support/UnionPayMockServer.java`
- [ ] `UnionPayLogMaskerTest`：嵌套 `vaFld` 内 `vaMchntNo` 被脱敏；`sign`→`***`；`appPayRequest` 为 JSON 对象/字符串时都只保留前 8 字符并带 `len=`；`mid=898000000000001`→`898****0001`；非敏感键原样
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayLogMaskerTest.java`
- [ ] `UnionPayHttpClientTest`（`UnionPayMockServer`；`PayRateLimiter` Mockito mock 默认返回 true；真实 `UnionPayErrorMapper` + 事件收集；记录型 `Sleeper` 记下每次参数不真实睡眠；props 默认值；cfg = `UnionPayTestFixtures.config(server.baseUrl(), 1000, 2000)`）：
  1. **签名即发送字节**：成功响应 `{"respCode":"0000","respDesc":"成功"}` → 记录请求 method=POST、path=`/v1/inip/upsp/shop/online/query`、`content-type` 含 `application/json`；解析 Authorization 中的 Timestamp/Nonce/Signature，`OpenBodySigSigner.signature(APP_ID, APP_KEY, ts, nonce, recorded.body)` 等于 Header 中 Signature（R3）
  2. **读超时**：cfg readTimeoutMs=300，服务端延迟 1500ms → 抛 `PayChannelException` 码 5001、`isNeedQuery()==true`、`getInfo().rawCode()=="TIMEOUT"`，耗时 < 1400ms，`requestCount()==1`（R7）
  3. **9200 两次后成功**：依次 `{"errCode":"9200","errInfo":"系统繁忙"}`×2、成功 → 返回成功 JSON，`requestCount()==3`，Sleeper 记录 `[200,500]`（R7）
  4. **9200 耗尽**：9200×4 → 5001、needQuery=false、`requestCount()==4`、Sleeper `[200,500,1000]`
  5. **限流拒绝**：mock 恒返回 false → 5001、rawCode `RATE_LIMITED`，耗时 ∈ [900ms, 2500ms]，`requestCount()==0`（R7）
  6. **限流短暂拒绝后放行**：mock 依次 false,false,true → 成功，`verify(rateLimiter, times(3)).tryAcquireUnionPay()`
  7. **1001 不重试**：`{"errCode":"1001","errInfo":"授权失败"}` → 5001、`requestCount()==1`、事件 1 个 `CHANNEL_AUTH_FAILED`（R8）
  8. **HTTP 500 非 JSON** `oops` → 5001、needQuery=true、rawCode `HTTP_500`
  9. **errCode=SUCCESS 判成功**：`{"errCode":"SUCCESS"}` → 正常返回
  10. **日志脱敏 + traceId（R10）**：`MDC.put("traceId","t-s2-log")`；`ListAppender<ILoggingEvent>` 挂 `UnionPayHttpClient` logger；请求体含 `vaMchntNo=898000000000001`；响应 `{"respCode":"0000","appPayRequest":{"prepayid":"wx_prepay_123456789","sign":"SECRET_SIGN_VALUE"}}` → 所有日志 `getFormattedMessage()` 不含 `APP_KEY`、`COMM_KEY`、`SECRET_SIGN_VALUE`、`wx_prepay_123456789`、`898000000000001`、`OPEN-BODY-SIG`；含 `898****0001` 与 `appPayRequest`；至少一条事件 `getMDCPropertyMap().get("traceId")=="t-s2-log"`；`finally` 移除 appender 与 MDC
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayHttpClientTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test "-Dtest=UnionPayLogMaskerTest,UnionPayHttpClientTest"` 通过：延迟超读超时→5001；9200 两次后成功且请求 3 次；限流拒绝→等待后 5001（R7）；1001→5001+事件（R8）；日志不含 AppKey/通讯密钥原文、appPayRequest 被截断脱敏、带 traceId（R10）；实际发出的 Authorization 与报文字节一致（R3）

### Task 11: `UnionPayChannel` — 下单（R4, R6）
- [ ] `channel/unionpay/UnionPayChannel`（`@Slf4j @Component implements PayChannel`）：
  - 公开构造 `(PayChannelConfigService configService, UnionPayHttpClient httpClient, PayCenterProperties properties)`；包内构造多 `Clock clock`（默认 `Clock.system(UnionPayConstants.ZONE)`）
  - `channelCode()` → `"UNIONPAY"`
  - `createOrder(ChannelPayRequest r)`：
    1. 校验（任何 HTTP 前）：`payOrderNo/mchntOrderId/orderDesc/vaMchntNo/vaTermNo/notifyUrl` 非空、`payMethod` 非 null、`totalAmount > 0`、`expireTime` 非 null；`WECHAT` 且 `subAppId` 空 → `PayException(PARAM_INVALID, "missing field: <name>")`
    2. `cfg = configService.getActive("UNIONPAY")`
    3. 组包 `LinkedHashMap`，键顺序：`mchntOrderId`、`vaMchntNo`、`vaTermNo`、`instMid=APPDEFAULT`、`msgType=UnionPayStatusMapper.msgTypeOf(payMethod)`、`subAppId`（**仅 WECHAT**）、`orderDesc`、`totalAmount=String.valueOf(分)`、`notifyUrl`、`attachedData=payOrderNo`、`expireTime`（`yyyy-MM-dd HH:mm:ss`，Asia/Shanghai）、`srcReserve`（非空才放）、`vaFld={newShopFlag:"GWCXS", isSubMchntPay:"02"}`；**不放 `satType`/`satInfo`**
    4. `json = httpClient.post(CREATE_ORDER, body, cfg)`
    5. 一致性：响应 `mchntOrderId` 非空且 ≠ 请求 → `throw new PayChannelException(CHANNEL_ERROR, new ChannelErrorInfo("UNIONPAY","CREATE_ORDER","MCHNT_ORDER_ID_MISMATCH",null), true)`；为空 → `log.warn` 后按请求值回填
    6. `appPayRequest`：`json.get("appPayRequest")` 为 `Map` → `JSON.toJSONString(value)`（保序）；为字符串 → 原样；缺失 → null（不报错，S3 判断）
    7. 返回 `ChannelPayResult`：`status=toOrderStatus(json.status)`（UNKNOWN 正常返回）、`rawStatus`、`targetOrderId`（`targetOrderId` 优先，空则 `prepayId`）、`rawCode`、`rawMessage`
  - 其余 5 个方法本 Task 先抛 `UnsupportedOperationException("implemented in T12/T13")`（T12/T13 替换）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayChannel.java`
- [ ] `UnionPayChannelCreateOrderTest`（`UnionPayMockServer` + 真实 `UnionPayHttpClient`（limiter mock=true）+ mock `PayChannelConfigService.getActive` 返回 fixtures cfg；请求体用 `JSON.parseObject(new String(body, UTF_8))` 断言）：
  1. WECHAT：`msgType=wx.unifiedOrder`、`subAppId` 存在、`instMid=APPDEFAULT`、`vaFld` 恰 2 键 `{newShopFlag:GWCXS,isSubMchntPay:"02"}`、请求体原文不含 `satType`/`satInfo`、`attachedData==payOrderNo`、`totalAmount=="1"`（字符串）、`expireTime=="2026-10-21 12:15:00"`、`notifyUrl` 透传
  2. ALIPAY：`trade.appPreOrder`，即使请求带 subAppId 也**不出现** `subAppId` 键
  3. UNIONPAY_CARD：`uac.appOrder`
  4. 响应 `appPayRequest` 为对象 `{"appScheme":"s","miniuser":"u","prepayid":"p1","sign":"S"}` → 结果解析后与原对象相等且 `keySet()` 顺序一致；为字符串 `"tn123"` → 结果恰为 `tn123`
  5. 状态：`WAIT_BUYER_PAY`、`NEW_ORDER`→`WAIT_PAY`；`TRADE_SUCCESS`→`PAID`；`UNKNOWN`→`UNKNOWN` 且不抛异常（R6）
  6. 响应 `mchntOrderId` 不一致 → `PayChannelException` 5001 且 needQuery=true
  7. WECHAT 缺 subAppId、totalAmount=0、缺 vaMchntNo → `PayException` 码 1001 且 `requestCount()==0`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayChannelCreateOrderTest.java`
- [ ] `PayChannelRouterTest` 追加用例：以真实 `new UnionPayChannel(mockConfigService, mockHttpClient, props)` 构造路由，`get("UNIONPAY")` 为 `UnionPayChannel` 实例（`assertInstanceOf`），`get("WXPAY")` 仍抛 5001
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/PayChannelRouterTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test "-Dtest=UnionPayChannelCreateOrderTest,PayChannelRouterTest"` 通过：请求体字段/vaFld/msgType 断言；appPayRequest 原样返回；mchntOrderId 不一致抛错（R4）；`UNIONPAY` 返回银联实现、未知 code 抛 `PayException(5001)`（R1）

### Task 12: `UnionPayChannel` — 查询 / 退货 / 退货查询 / 关单（R5, R6）
- [ ] `queryOrder(ChannelQueryRequest r)`：校验 `mchntOrderId/vaMchntNo/vaTermNo`；组包 `mchntOrderId, vaMchntNo, vaTermNo, sysSource=OPT, vaFld={newShopFlag:GWCXS}`；`post(QUERY_ORDER)`；映射：`status`、`payTime`（`yyyy-MM-dd HH:mm:ss` Asia/Shanghai 解析，失败 → null 且 `rawPayTime` 保留）、`targetSys=toPayMethod`、`rawTargetSys`、`targetOrderId`、`settleDate` 原样、`totalAmount`（字符串/数字 → Long，非法 → null）、`cardAttr`、`seqId`
- [ ] `refund(ChannelRefundRequest r)`：校验含 `refundOrderId`、`refundAmount > 0`；组包 `mchntOrderId, vaMchntNo, vaTermNo, refundOrderId, refundAmount=String, sysSource=OPT, vaFld={newShopFlag:GWCXS, isSubMchntPay:"02"}`（无 satType/satInfo）；`post(REFUND)`；结果 `refundStatus=toRefundStatus(json.refundStatus)`（缺失/未知 → UNKNOWN）、`refundOrderId`（响应空则用请求值）、`refundAmount`、`channelRefundId=json.refundTargetOrderId`
- [ ] `queryRefund(ChannelRefundQueryRequest r)`：组包同查询，但 **`mchntOrderId = r.refundOrderId`**；`post(QUERY_REFUND)`；映射同 refund
- [ ] `closeOrder(ChannelCloseRequest r)`：组包 `mchntOrderId, vaMchntNo, vaTermNo, sysSource=OPT, requestTimestamp=now(clock)`（`yyyy-MM-dd HH:mm:ss`）；
  - 成功 → `ChannelCloseResult(closed=true, statusAfter=CLOSED, rawCode, rawMessage)`
  - 捕获 `PayChannelException` 且 `isNeedQuery()` → 调 `queryOrder` 同参：`PAID`/`REFUND` → 返回 `closed=false, statusAfter=<该状态>, rawCode=关单原始码`（“已支付不可关闭”）；`CLOSED` → `closed=true, statusAfter=CLOSED`（已被关闭视为成功）；其他 → 重新抛出原异常
  - `isNeedQuery()==false`（1000/1001/9200/限流）→ 直接抛出
- [ ] 抽私有方法 `requireNotBlank(String field, String value)`、`toLong(Object)`、`parseTime(String)`、`baseQueryBody(...)`，保证每个方法 ≤80 行
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayChannel.java`
- [ ] `UnionPayChannelQueryRefundCloseTest`（同 T11 装配，Clock 固定 `2026-10-21T04:16:00Z`）：
  1. 查询请求体：`sysSource=OPT`、`vaFld` 恰 `{newShopFlag:GWCXS}`；响应 `{"respCode":"0000","status":"TRADE_SUCCESS","payTime":"2026-10-21 12:01:02","targetSys":"WXPay","targetOrderId":"T1","settleDate":"2026-10-21","totalAmount":"1","cardAttr":"DEBIT_CARD","seqId":"S1"}` → `PAID`、payTime = 该上海时间对应 `Date`、`targetSys=WECHAT`、`totalAmount==1L`、`cardAttr/seqId/settleDate` 透传；`targetSys=UAC`→`UNIONPAY_CARD`；`payTime=bad`→null 且 rawPayTime=`bad`
  2. 退货请求体：`refundOrderId`、`refundAmount=="1"`、`sysSource=OPT`、`vaFld` 恰 2 键、原文不含 `satType/satInfo`；`refundStatus` 为 `SUCCESS/FAIL/PROCESSING/UNKNOWN` 分别映射；`WEIRD` 与缺失 → `UNKNOWN`（R5）
  3. 退货查询：请求体 `mchntOrderId == 请求的 refundOrderId`、`vaFld={newShopFlag}`；`refundStatus=PROCESSING` → `PROCESSING`
  4. 关单成功：请求体 `requestTimestamp=="2026-10-21 12:16:00"`、`sysSource=OPT`、无 `vaFld`；结果 closed=true、CLOSED
  5. 关单失败转查单：先 `{"errCode":"ORDER_STATUS_ERR","errInfo":"订单已支付"}`、再查询 `TRADE_SUCCESS` → 第二个请求 path=`/v1/inip/upsp/shop/online/query`，结果 closed=false、statusAfter=PAID、rawCode=`ORDER_STATUS_ERR`
  6. 关单失败、查单 `WAIT_BUYER_PAY` → 抛 `PayChannelException` 5001
  7. 关单 `1000` → 抛 9999，`requestCount()==1`（不查单）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayChannelQueryRefundCloseTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test "-Dtest=UnionPayChannelQueryRefundCloseTest,UnionPayChannelCreateOrderTest"` 通过：四接口请求体与响应映射断言；refundStatus 未知值→UNKNOWN（R5, R6）

### Task 13: 通知解析与验签（R9）
- [ ] `channel/unionpay/UnionPayNotifyParser`（final 工具类）：`public static Map<String,String> parse(String rawBody, Map<String,String[]> parameterMap)` → 返回 `LinkedHashMap`：
  - `rawBody` trim 后以 `{` 开头 → fastjson `JSON.parseObject`，值为 `Map`/`List` 的 `JSON.toJSONString`，其余 `String.valueOf`，null 跳过；JSON 非法 → 返回空 map
  - 否则 `rawBody` 非空 → 按 `&` 拆分、首个 `=` 分隔，`URLDecoder.decode(.., UTF_8)`
  - 否则 → `parameterMap` 每个键取第一个值（null 安全）；两者皆空 → 空 map
- [ ] `channel/unionpay/UnionPayNotifyVerifier`（final 工具类）：
  - `public static String buildSignContent(Map<String,String> params, boolean includeEmpty)`：排除键 `sign`；`includeEmpty=false` 时排除 null 与 `""` 值；按 key 字典序（`TreeMap` 自然序）拼 `k=v&k=v`
  - `public static String digestUpperHex(String content, String signType)`：`SHA256`（忽略大小写，兼容 `SHA-256`）→ `SHA-256`；null/空/`MD5` → `MD5`；其他 → 返回 null
  - `public static boolean verify(Map<String,String> params, String commKey, boolean includeEmpty)`：`sign` 或 commKey 为空 → false；`expected = digestUpperHex(buildSignContent(..) + commKey, params.get("signType"))`；null → false；`MessageDigest.isEqual(expected.getBytes(US_ASCII), sign.trim().toUpperCase(Locale.ROOT).getBytes(US_ASCII))`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayNotifyParser.java`, `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayNotifyVerifier.java`
- [ ] `UnionPayChannel.parseAndVerifyNotify(ChannelNotifyRequest r)`：`params = parse(...)`；`cfg = configService.getActive("UNIONPAY")`，抛 `PayException` → `signValid=false, failReason="channel config unavailable"`；否则 `signValid = verify(params, cfg.getCommKey(), properties.getUnionpay().isNotifySignIncludeEmpty())`，失败 `failReason = params 为空 ? "empty notify" : "sign invalid"`；映射：`notifyId`、`msgType`、`mchntOrderId`、`refundOrderId`、`status=toOrderStatus`、`rawStatus`、`totalAmount/refundAmount`（Long）、`payTime`、`targetSys`、`seqId`、`cardAttr`、`mid=mid 否则 vaMchntNo`、`tid=tid 否则 vaTermNo`、`signType`、`params=Collections.unmodifiableMap`、`maskedBody=UnionPayLogMasker.maskJson(params)` 截断至 60000 字符
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayChannel.java`
- [ ] `UnionPayNotifyVerifierTest`（期望值由 .NET 独立计算，commKey=`testCommKey0123456789`）：
  1. params `mchntOrderId=TEST20261021120000000000001, notifyId=N0001, signType=SHA256, status=TRADE_SUCCESS, totalAmount=1, sign=0CB0371C647A127B8820947BBF74BBE3A4CEE83A62B5EC40A8DC23D3D0EF96B9` → `buildSignContent(false)=="mchntOrderId=TEST20261021120000000000001&notifyId=N0001&signType=SHA256&status=TRADE_SUCCESS&totalAmount=1"`，verify=true；sign 改小写仍 true
  2. 同上把 `totalAmount` 改 2 → false
  3. 追加 `attachedData=""`：`includeEmpty=false` 仍用上值 true；`includeEmpty=true` 时 sign=`CD5801710761F4BF40C3D20B0C64BEE363155808644FAEBDE666CD33E042A1BE` → true，且原 SHA256 值 → false
  4. 无 signType：`mchntOrderId=TEST20261021120000000000001, notifyId=N0002, status=TRADE_SUCCESS, totalAmount=1, sign=7F4FBE543D234FE5BD2BA04DA1CEA59E`（MD5）→ true
  5. `signType=SM3` → false；缺 sign → false；commKey 空 → false
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayNotifyVerifierTest.java`
- [ ] `UnionPayNotifyParserTest`：form `a=1&b=%E4%B8%AD&c=` → `{a:1,b:中,c:""}`；JSON `{"a":"1","n":2,"o":{"x":1}}` → `n=="2"`、`o=="{\"x\":1}"`；空 body + parameterMap `{m:[v]}` → `{m:v}`；null body + null map → 空；非法 JSON `{bad` → 空
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayNotifyParserTest.java`
- [ ] `UnionPayChannelNotifyTest`（mock configService 返回 fixtures cfg）：上述正确 SHA256 表单 → `signValid=true`、`status=PAID`、`totalAmount=1L`、`notifyId=N0001`；仅含 `vaMchntNo=898000000000001` 无 `mid` → `mid=="898000000000001"` 且 `maskedBody` 不含该原值；configService 抛 `PayException` → `signValid=false`、`failReason=="channel config unavailable"`；空 body → `signValid=false`、`failReason=="empty notify"`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayChannelNotifyTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test "-Dtest=UnionPayNotifyVerifierTest,UnionPayNotifyParserTest,UnionPayChannelNotifyTest"` 通过：独立参考值验签一致、空值开关生效、MD5 缺省生效（R9 验签部分）

### Task 14: 通知接收编排 + 默认处理器 + 入口 Controller（R9, R10, R12）
- [ ] `IPayNotifyRecordService` 增 `boolean existsByNotifyId(String notifyId)`；`PayNotifyRecordServiceImpl` 实现 `baseMapper.selectCount(Wrappers.<PayNotifyRecord>lambdaQuery().eq(PayNotifyRecord::getNotifyId, notifyId)) > 0`（notifyId 空返回 false）
  - **MCP:** `search_arch` query=`PayNotifyRecordServiceImpl`（已命中，只增不改约束见 1.3）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/service/IPayNotifyRecordService.java`, `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/service/impl/PayNotifyRecordServiceImpl.java`
- [ ] `channel/notify/IgnoringPayNotifyHandler`（`@Slf4j @Component @Order(Ordered.LOWEST_PRECEDENCE) implements PayNotifyHandler`）：`log.warn("paycenter PayNotifyHandler not provided (S3 pending), notify kept only, mchntOrderId={}", notify.getMchntOrderId())`，返回 `PayNotifyHandleResult.ignored("no business handler (S2 default)")`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/notify/IgnoringPayNotifyHandler.java`
- [ ] `channel/notify/NotifyRecordContext`（`@Data @Builder`）：`String clientIp`、`Date receiveTime`、`String notifyIdToStore`（仅成功处理时非空）、`int signValid`、`NotifyProcessStatus status`、`String result`、`String payOrderId`、`String refundId`
- [ ] `channel/notify/UnionPayNotifyRecorder`（`@Component`，构造注入 `IPayNotifyRecordService`、`ApplicationEventPublisher`）——留痕与告警集中于此，保证编排类依赖 ≤5：
  - `public boolean isHandled(String notifyId)` → `existsByNotifyId`
  - `public void save(ChannelNotify notify, NotifyRecordContext ctx)`：组装 `PayNotifyRecord`：`notifyId=ctx.notifyIdToStore`、`msgType/mchntOrderId/refundOrderId/signType` 取自 notify（notify 为 null 时留空）、`signValid=ctx.signValid`、`rawBody=notify.maskedBody`（null → `""`）、`clientIp`、`processStatus=ctx.status.name()`、`processResult` 截断 512、`payOrderId`、`refundId`、`traceId=PayTraceUtil.current()`、`receiveTime`、`processTime=new Date()`、`createTime=new Date()`；**只 `save`，从不 update**；`DuplicateKeyException` 向上抛（由编排类判定）
  - `public void alert(PayAlertType type, String summary)` → 发布 `new PayAlertEvent(type, "UNIONPAY", summary)` 并 `log.warn`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/notify/NotifyRecordContext.java`, `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/notify/UnionPayNotifyRecorder.java`
- [ ] `channel/notify/UnionPayNotifyService`（`@Slf4j @Service`）：构造注入 `PayChannelRouter`、`UnionPayNotifyRecorder`、`PayRedisLock`、`ObjectProvider<PayNotifyHandler>`、`PayCenterProperties`（5 个）。常量 `SUCCESS="SUCCESS"`、`FAILED="FAILED"`、锁 TTL 30s、等待 3s。
  - `public String receive(String rawBody, Map<String,String[]> parameterMap, String remoteAddr, String forwardedFor)`（**从不抛异常**，最外层 `catch (RuntimeException e)` → `log.error` + 尽力落 ERROR 记录 → FAILED）：
    1. `receiveTime=new Date()`；`clientIp = trustForwarded && forwardedFor 非空 ? forwardedFor.split(",")[0].trim() : remoteAddr`
    2. `notify = router.get("UNIONPAY").parseAndVerifyNotify(new ChannelNotifyRequest(rawBody, parameterMap, clientIp))`
    3. 白名单非空且 `clientIp` 不在（精确匹配，逗号分隔 trim）→ `recorder.save`（`notifyIdToStore=null`、`signValid=notify.signValid?1:0`、`ERROR`、`"ip not allowed"`）+ `recorder.alert(NOTIFY_IP_REJECTED, "ip=" + clientIp)` → FAILED；白名单为空 → 首次请求 `log.warn("paycenter unionpay notify ip whitelist empty, source ip not checked")`（`AtomicBoolean` 只打一次）
    4. `!signValid` → `recorder.save`（`null`、`0`、`ERROR`、`failReason`）+ `recorder.alert(NOTIFY_SIGN_INVALID, "mchntOrderId=" + mchntOrderId)` → FAILED
    5. `notifyId` 为空 → 直接 `dispatch`（无去重；handler 幂等兜底），`notifyIdToStore=null`
    6. 否则 `redisLock.executeWithLock("notify:unionpay:" + notifyId, 30s, 3s, () -> handleOnce(notify, ctx))`；`PayException(SYSTEM_BUSY)`（锁忙）→ 落 ERROR `"lock busy"` → FAILED
  - `handleOnce`：`recorder.isHandled(notifyId)` → 落记录（`null`、`IGNORED`、`"duplicate notifyId"`）→ SUCCESS（**不调用 handler**）；否则 `dispatch`
  - `dispatch`：`handler = provider.orderedStream().findFirst().orElseThrow()`；`result = handler.handle(notify)`；`status` 非 PROCESSED/IGNORED → 视为 IGNORED；落记录（`notifyIdToStore=notify.notifyId`、`1`、`result.status`、`payOrderId`、`refundId`、`message`）→ SUCCESS；落库抛 `DuplicateKeyException` → `log.warn` 后 SUCCESS（并发重复）；handler 抛 `RuntimeException` → 落记录（`null`、`ERROR`、`e.getClass().getSimpleName() + ": " + 截断200(e.getMessage())`）+ `recorder.alert(NOTIFY_PROCESS_ERROR, ...)` → FAILED
  - INFO 日志一行：`unionpay notify notifyId={} mchntOrderId={} signValid={} result={} costMs={}`（不打印原文）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/notify/UnionPayNotifyService.java`
- [ ] `notify/UnionPayNotifyController`（`@Slf4j @RestController @RequestMapping("/notify/unionpay")`，**不放在 `openapi` 包**，避免被 `PayOpenApiExceptionHandler` 包装）：
  - `@PostMapping(value = "/pay", produces = "text/plain;charset=UTF-8") public String pay(HttpServletRequest request)`：不声明 `consumes`（银联 ContentType 可能为空）；读取 body 最多 64KB（`request.getInputStream()` 循环读，超限截断并 WARN；`IOException` → body `""` 并 WARN）；调用 `notifyService.receive(body, request.getParameterMap(), request.getRemoteAddr(), request.getHeader("X-Forwarded-For"))` 原样返回
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/notify/UnionPayNotifyController.java`
- [ ] `UnionPayNotifyControllerTest`（`MockMvcBuilders.standaloneSetup(controller)`；真实 `UnionPayChannel`（configService mock 返回 fixtures cfg，commKey=`testCommKey0123456789`）+ 真实 `PayChannelRouter`；真实 `UnionPayNotifyRecorder`，其 `IPayNotifyRecordService` 为 Mockito mock：`save` 把实体加入 `List<PayNotifyRecord> saved` 并在 `notifyId` 非空时加入 `Set<String> handled`，`existsByNotifyId` 查 `handled`；`PayRedisLock` mock：`executeWithLock` 直接执行 Supplier；handler 为可编程桩，计数调用次数；`ObjectProvider` 用 `DefaultListableBeanFactory.registerSingleton` + `getBeanProvider(PayNotifyHandler.class)`；事件收集；SHA256 正确签名表单 `F1 = mchntOrderId=TEST20261021120000000000001&notifyId=N0001&signType=SHA256&status=TRADE_SUCCESS&totalAmount=1&sign=0CB0371C647A127B8820947BBF74BBE3A4CEE83A62B5EC40A8DC23D3D0EF96B9`）：
  1. POST `F1`（`application/x-www-form-urlencoded`）→ 200 `SUCCESS`；handler 调用 1 次；`saved` 1 条：`notifyId=N0001`、`signValid=1`、`processStatus=PROCESSED`、`traceId` 字段已赋值（测试前 `MDC.put`）
  2. 再 POST `F1` → `SUCCESS`；handler 仍 1 次；新增记录 `notifyId=null`、`IGNORED`、`duplicate notifyId`
  3. 错签（`sign=` 改为 64 个 `A`）→ `FAILED`；记录 `ERROR`、`signValid=0`、`notifyId=null`；事件 `NOTIFY_SIGN_INVALID` 1 个；handler 未调用
  4. handler 抛 `IllegalStateException` → `FAILED`；记录 `ERROR`、`notifyId=null`；事件 `NOTIFY_PROCESS_ERROR`；随后 handler 恢复正常、同报文重发 → `SUCCESS` 且 handler 再被调用（重发可重新分发）
  5. 白名单 `10.0.0.1`，MockMvc 默认 remoteAddr `127.0.0.1` → `FAILED`、事件 `NOTIFY_IP_REJECTED`、handler 未调用；白名单含 `127.0.0.1` → `SUCCESS`
  6. JSON 体（`application/json`，同字段）→ `SUCCESS`
  7. 无 signType 的 MD5 报文（N0002，sign `7F4FBE543D234FE5BD2BA04DA1CEA59E`）→ `SUCCESS`
  8. **空体**（无 Content-Type、无内容）→ 200 `FAILED`，记录 `ERROR`、`processResult=="empty notify"`（R12 单测部分）
  9. configService 抛 `PayException(CHANNEL_ERROR)` → `FAILED`，记录 `ERROR`
  10. 默认处理器：provider 只注册 `IgnoringPayNotifyHandler` → `SUCCESS`、记录 `IGNORED`；同时注册桩（`@Order(0)` 的测试类）→ 走桩（验证 S3 覆盖机制）
  11. 所有 `saved.rawBody` 不含 `testCommKey0123456789`；带 `mid=898000000000001` 的报文（签名不论）其 rawBody 不含该原值（R10）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/notify/UnionPayNotifyControllerTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=UnionPayNotifyControllerTest` 通过：正确签名→SUCCESS 且 handler 调用 1 次；同 notifyId 再次→SUCCESS 且 handler 不再调用；错签→FAILED + ERROR 记录；handler 抛异常→FAILED（R9）；空体→FAILED（R12 单测）；落库原文脱敏（R10）

### Task 15: 真实联调测试骨架 `unionpay-live`（R11）
- [ ] `UnionPayLiveTest`（`@Tag("unionpay-live") @TestMethodOrder(MethodOrderer.OrderAnnotation.class)`，不启 Spring）：
  - `@BeforeAll`：必需环境变量 `PAY_UNIONPAY_APP_ID, PAY_UNIONPAY_APP_KEY, PAY_UNIONPAY_BASE_URL, PAY_UNIONPAY_MSG_SRC_ID, PAY_UNIONPAY_MID, PAY_UNIONPAY_TID`；任一缺失 → `fail("缺少环境变量 " + 缺失名列表 + "：请写入 .apt/local/paycenter-app.env 后执行 . scripts/paycenter/run-local.ps1 -EnvOnly；银联测试环境仅 9:00-18:00 开放且需出口 IP 白名单")`（**只列变量名，不打印任何值**）
  - 装配：`ChannelRuntimeConfig` 由环境变量构造（`commKey` 取 `PAY_UNIONPAY_COMM_KEY`，可空；connect 3000/read 10000）；`PayChannelConfigService` Mockito mock 返回它；`PayRateLimiter` mock 恒 true；真实 `UnionPayErrorMapper`（publisher 记录日志）、`UnionPayHttpClient`、`UnionPayChannel`；单号用 `new PayNoGenerator(null, props)`（props.unionpayMsgSrcId=env）的 `unionpayMchntOrderId()`/`unionpayRefundOrderId()`；notifyUrl 取 `PAY_UNIONPAY_NOTIFY_URL`，空则 `http://127.0.0.1:8080/jeecg-boot/notify/unionpay/pay`
  - `@Order(1) alipayCreateQueryClose`：ALIPAY 1 分、expire=now+15min、orderDesc `S2联调-支付宝1分` → `appPayRequest` 非空、status ∈ {WAIT_PAY, UNKNOWN}；`queryOrder` → status ∈ {WAIT_PAY, UNKNOWN}；`closeOrder` → `closed==true`；再 `queryOrder` → `CLOSED`
  - `@Order(2) unionpayCardCreateClose`：UNIONPAY_CARD 1 分 → `appPayRequest` 非空 → `closeOrder.closed==true`
  - `@Order(3) refundOnPaidOrder`：`Assumptions.assumeTrue(PAY_UNIONPAY_LIVE_PAID_ORDER_ID 非空, "需先用 App 实付 1 分并设置 PAY_UNIONPAY_LIVE_PAID_ORDER_ID")` → `refund` 1 分 → `refundStatus` 非 null；`queryRefund` → ∈ {SUCCESS, PROCESSING, UNKNOWN, FAIL}
  - `@Order(4) wechatCreateClose`：`assumeTrue(PAY_UNIONPAY_SUB_APP_ID 非空 且 PAY_UNIONPAY_ENV==PROD, "微信无测试环境，仅生产联调")` → WECHAT 1 分 → `appPayRequest` 非空 → close
  - 各步只 `log.info` 脱敏结果（`UnionPayLogMasker`）与 rawCode
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/channel/unionpay/UnionPayLiveTest.java`
  - **Verify:**
    1. 默认被排除：`Remove-Item -Recurse -Force backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/target/surefire-reports -ErrorAction SilentlyContinue; . scripts/paycenter/run-local.ps1 -EnvOnly; mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test`（在 `backend/jeecg-boot`）通过，且 `Test-Path backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/target/surefire-reports/TEST-org.jeecg.modules.paycenter.channel.unionpay.UnionPayLiveTest.xml` 输出 `False`
    2. 缺参明确失败：在仓库根执行 `powershell -NoProfile -Command "Get-ChildItem Env:PAY_UNIONPAY_* | ForEach-Object { Remove-Item ('Env:' + $_.Name) }; Set-Location backend/jeecg-boot; mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dgroups=unionpay-live; exit $LASTEXITCODE"`，退出码 ≠ 0；`Select-String -Encoding UTF8 -Path backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/target/surefire-reports/*UnionPayLiveTest.txt -Pattern "缺少环境变量 .*PAY_UNIONPAY_APP_ID"` 至少 1 行（R11）

### Task 16: 全量测试 + 打包 + 启动端到端验证（R1, R2, R11, R12）
- [ ] 全模块测试：`. scripts/paycenter/run-local.ps1 -EnvOnly; mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test` 全绿；`Get-ChildItem backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/target/surefire-reports/TEST-*.xml` 包含 S2 全部测试类：`PayCenterPropertiesTest, PayChannelRouterTest, PayChannelConfigServiceTest, PayChannelConfigBootstrapTest, PayChannelConfigDbTest, OpenBodySigSignerTest, UnionPayStatusMapperTest, UnionPayErrorMapperTest, UnionPayLogMaskerTest, UnionPayHttpClientTest, UnionPayChannelCreateOrderTest, UnionPayChannelQueryRefundCloseTest, UnionPayNotifyVerifierTest, UnionPayNotifyParserTest, UnionPayChannelNotifyTest, UnionPayNotifyControllerTest`（16 个），且不含 `UnionPayLiveTest`；S1 原有测试仍全部通过
  - **Files:** （无新增；仅修复本 S2 范围内文件的缺陷）
- [ ] 打包：`mvn -q -o -DskipTests -pl jeecg-module-system/jeecg-system-start -am package` 退出码 0
  - **Files:** 无
- [ ] 记录开始时间 `$t0 = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')`；后台启动 `scripts/paycenter/run-local.ps1`（等待 `/v1/ping` 200）
  - **Files:** 无
- [ ] 校验（全部须满足，逐条输出）：
  1. `Select-String -CaseSensitive -Path .apt/paycenter-run.log -Pattern " ERROR "` 中无含 `paycenter|unionpay|PayChannel|UnionPay` 的行（R1：`PayChannelRouter`/`UnionPayChannel` 等 Bean 装配无错）
  2. **R12**：`curl.exe -s -i -X POST -d "" http://127.0.0.1:8080/jeecg-boot/notify/unionpay/pay` → 状态行 `HTTP/1.1 200`，body 恰为 `FAILED`（非 401/302、非登录跳转 JSON）
  3. `curl.exe -s -X POST -H "Content-Type: application/json" -d "{}" http://127.0.0.1:8080/jeecg-boot/notify/unionpay/pay` → `FAILED`
  4. 错签表单：`curl.exe -s -X POST -H "Content-Type: application/x-www-form-urlencoded" -d "notifyId=E2E-S2-001&mchntOrderId=E2E001&status=TRADE_SUCCESS&sign=BAD" http://127.0.0.1:8080/jeecg-boot/notify/unionpay/pay` → `FAILED`
  5. SQL：`docker exec paycenter-mysql sh /tmp/m.sh -N -D jeecg-boot -e "select count(*) from pay_notify_record where process_status='ERROR' and receive_time >= '$t0'"` ≥ 3；`... -e "select count(*) from pay_notify_record where notify_id like 'E2E-%'"` = `0`（未验签通知不占用 notify_id 唯一键）
  6. 引导：若当前会话 `$env:PAY_UNIONPAY_APP_ID` 为空 → 日志含 `paycenter unionpay bootstrap skipped`；否则 `... -e "select count(*) from pay_channel_config where channel_code='UNIONPAY' and app_key_enc like 'v%:%' and comm_key_enc like 'v%:%'"` = `1`（R2）
  7. 日志无密钥：若 `$env:PAY_UNIONPAY_APP_KEY` 非空，`(Select-String -SimpleMatch -Path .apt/paycenter-run.log -Pattern $env:PAY_UNIONPAY_APP_KEY).Count` = 0（只打印计数）；`COMM_KEY` 同理（R2）
  8. 仓库无明文（R2）：`rg -n -i "^\s*(app-key|comm-key|app_key|comm_key|appKey|commKey)\s*[:=]\s*[^$\s{]" backend/jeecg-boot --glob "*.yml" --glob "*.yaml" --glob "*.properties" --glob "!**/target/**"` 无命中；`rg -n "^[^#']*PAY_UNIONPAY_(APP_KEY|COMM_KEY)=\S" --glob "!.apt/local/**" --glob "!**/target/**" .` 无命中
  9. R11 回归：重复 T15 Verify 第 2 条，退出码 ≠ 0 且报告含 `缺少环境变量`
- [ ] 停止：`scripts/paycenter/run-local.ps1 -Stop`
  - **Verify:** 上述 9 项逐条输出并全部满足；其中第 2 项即 spec R12 验收“启动后 `POST /jeecg-boot/notify/unionpay/pay` 空体返回 `FAILED`（非 401/302）”（R1, R2, R11, R12）

### Task 17: APT 闭环（主 Agent 执行）
- [ ] `audit_arch_changes` → 对 `modified`/`new` 资产 `refresh_asset`；新增的 Java 契约（`PayChannel`、`PayNotifyHandler`、DTO）按 Skill 闭环要求如需 `register_contract` 一并登记（至少：`channel/**`、`channel/unionpay/**`、`channel/config/**`、`channel/notify/**`、`common/alert/**`、`notify/UnionPayNotifyController.java`、`config/PayCenterProperties.java`、`mapper/PayChannelConfigMapper.java`、`service/IPayChannelConfigService.java`、`service/IPayNotifyRecordService.java` 及其 impl、`application-dev.yml`）；`deleted` → `remove_asset`
  - **MCP:** `audit_arch_changes`；`refresh_asset` sourcePath=`backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel/...`
  - **Files:** 无（仅 `.ai/` 由 MCP 维护）
- [ ] 终端执行增量 `start-init`（`node C:\Users\weilt\.apt\arch-engine\dist\cli.js start-init`），使新契约进入 arch 索引
  - **Files:** 无
  - **Verify:** `search_arch` query=`PayChannel`、`PayNotifyHandler`、`UnionPayHttpClient` 均有命中且 sourcePath 指向 `jeecg-module-paycenter/.../channel/`
