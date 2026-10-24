# S2 银联通道适配 — Implementer 报告（Task 13–15）

- Plan：`docs/apt/plans/2026-10-21-paycenter-s2-unionpay-channel-plan.md`；通知真源 `paycenter/04-外部对接文档-银联商务.md` §7
- 总体状态：**DONE**（T13–T15 全部通过 Verify；没有白名单外改动）
- backend 基线：`fa46c33`（分支 `paycenter`，T12 之后）

| Task | 状态 | Commit（backend） | 测试 |
|------|------|-------------------|------|
| T13 通知解析与验签 | DONE | `79796ef` | UnionPayNotifyVerifierTest 6 个 + UnionPayNotifyParserTest 4 个 + UnionPayChannelNotifyTest 4 个，0 失败 |
| T14 通知接收编排、默认处理器、入口 Controller | DONE | `bab6792` | UnionPayNotifyControllerTest 14 个（含 1 个真实 MySQL 用例），0 失败 |
| T15 `unionpay-live` 联调骨架 | DONE | `a617026` | 默认全量：27 个测试类、191 个用例，0 失败/错误/跳过，且不含 LiveTest；`-Dgroups=unionpay-live` 缺参时退出码 1，并给出明确提示 |

## T13 — 通知解析与验签（R9 验签部分）
- `UnionPayNotifyParser.parse(rawBody, parameterMap)`：
  - 请求体以 `{` 开头时按 JSON 解析。嵌套对象和数组转成 JSON 字符串，null 值跳过。JSON 不合法时返回空 Map，不抛异常。
  - 其他非空请求体按表单解析：以首个 `=` 切分，做 URL 解码。
  - 请求体为空时，从参数表中取每个键的第一个值。
  - 小差异：JSON 解析使用 `Feature.OrderedField`，原因与 T11 相同（fastjson 默认不保留键序）。验签按字典序拼接，不受这一点影响；这样做是为了让 `maskedBody` 留痕的字段顺序与原文一致。
- `UnionPayNotifyVerifier`：
  - 待签串：排除 `sign` 后按 key 字典序拼接；`includeEmpty=false` 时不拼空值。
  - 摘要算法：SHA256（兼容 `SHA-256` 写法、忽略大小写）；signType 为空或 `MD5` 时用 MD5；其他算法返回 null，判为验签失败。
  - 比对：签名统一转大写后，用 `MessageDigest.isEqual` 做常量时间比较。
  - sign 或通讯密钥为空时直接判失败。
- `UnionPayChannel.parseAndVerifyNotify`：
  - 配置不可用时，`failReason` 为 `channel config unavailable`；参数为空时为 `empty notify`；签名不符时为 `sign invalid`。这三种情况都不抛异常。
  - 商户号/终端号优先取 `mid/tid`，没有时兼容 `vaMchntNo/vaTermNo`。
  - `params` 不可修改。
  - `maskedBody` 先经 `UnionPayLogMasker.maskJson` 脱敏，再截断到 60000 字符。
- 测试中的参考签名值（`0CB0…96B9`、`CD58…A1BE`、`7F4F…A59E`）与 plan 一致，由规划阶段用 .NET 独立计算，测试未改动这些值。
- Verify：`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test "-Dtest=UnionPayNotifyVerifierTest,UnionPayNotifyParserTest,UnionPayChannelNotifyTest"`，退出码 0，三个类分别 `Tests run: 6 / 4 / 4`，均为 0 失败。

## T14 — 通知接收编排（R9、R10、R12）
- `IPayNotifyRecordService.existsByNotifyId` 用 `selectCount` 按 notify_id 判重，notifyId 为空时返回 false。MCP 调用 `search_arch query=PayNotifyRecordServiceImpl` 已命中 assetId `backend/jeecg-module-paycenter/util/PayNotifyRecordServiceImpl`。
- `UnionPayNotifyRecorder`：
  - 只调用 `save`，从不 update。
  - `traceId` 取自 `PayTraceUtil.current()`；`raw_body` 写入脱敏后的 JSON，`processResult` 截断到 512 字符。
  - 加固（plan 未要求）：按列宽截断 msgType/mchntOrderId/refundOrderId（64）、signType（16）、clientIp（45）。否则伪造通知字段超长时，ERROR 记录本身会写库失败，留不下痕迹。
  - 告警以 `PayAlertEvent` 发布，同时记 WARN 日志。
- `UnionPayNotifyService.receive` 从不向外抛异常，处理顺序：
  1. 确定来源 IP：只有配置信任时才取 X-Forwarded-For 的首个值。
  2. 白名单：为空时跳过校验，只告警一次；不在白名单时记 ERROR、发 `NOTIFY_IP_REJECTED`、返回 FAILED。
  3. 验签失败：记 ERROR（signValid=0，failReason 写入 process_result），发 `NOTIFY_SIGN_INVALID`，返回 FAILED。
  4. 没有 notifyId：直接分发，由 handler 保证幂等。
  5. 有 notifyId：在 Redis 锁 `notify:unionpay:<notifyId>`（TTL 30s、等待 3s）内处理。已处理过的记 IGNORED「duplicate notifyId」并返回 SUCCESS，不再调用 handler；否则分发。锁忙时记 ERROR「lock busy」，返回 FAILED。
  6. 分发：handler 抛异常时记 ERROR（异常类名 + 截断后的消息，notify_id 为空），发 `NOTIFY_PROCESS_ERROR`，返回 FAILED，银联可重发后重新分发。成功时写入 notify_id，记 PROCESSED 或 IGNORED（其他状态一律按 IGNORED）。落库遇到 `DuplicateKeyException` 视为并发重复，返回 SUCCESS。
  7. 兜底：任何意外的 RuntimeException 都会尝试记一条 ERROR，然后返回 FAILED。
  - 每次请求记一行 INFO 日志，只包含 notifyId、mchntOrderId、signValid、result、costMs，不打印原文。
- **默认处理器与 S3 如何接入**：`IgnoringPayNotifyHandler`（`@Component @Order(LOWEST_PRECEDENCE)`）是兜底实现。编排层通过 `ObjectProvider.orderedStream()` 优先选择**任意一个非默认实现**，只有不存在其他实现时才使用默认处理器。
  - **S3 接入方式**：只需新增一个 `@Component` 类实现 `PayNotifyHandler`（建议加 `@Order(0)`）。不需要删除默认类，也不依赖 `@Order` 是否标对。
  - 没有使用 `@ConditionalOnMissingBean`：这个注解放在组件扫描类上时，效果取决于 Bean 的注册顺序，不可靠。当前做法与 plan 的“@Order 覆盖”效果相同，并且更稳健。
  - 用例 `defaultHandlerReplacedByBusinessHandler` 覆盖了两种情况：只有默认处理器时记 IGNORED；同时存在桩实现时走桩实现。
  - 如果 S3 提供了多个实现，按 `@Order` 取第一个。
- `UnionPayNotifyController`：
  - 位于 `notify` 包（不在 openapi 包下），映射 `POST /notify/unionpay/pay`，应答 `text/plain`，不声明 consumes。
  - 请求体最多读取 64KB，超出部分截断并记 WARN；读取出现 IOException 时按空体处理。
  - 只做请求解析并调用 Service，不直接调用 Mapper。
- `UnionPayNotifyControllerTest`（14 个用例）：
  - 装配：真实的 Controller、编排、路由、`UnionPayChannel` 和 Recorder。记录 Service 用内存桩，模拟 uk(notify_id) 唯一键冲突。
  - 正确签名：返回 SUCCESS，handler 调用 1 次，记录 PROCESSED，notify_id=N0001，traceId、clientIp、payOrderId 正确。
  - 同 notifyId 重发：返回 SUCCESS，handler 仍为 1 次，新增 IGNORED 记录（notify_id 为空）。
  - 错签：返回 FAILED，记录 ERROR、signValid=0、无 notify_id；发出 1 个 `NOTIFY_SIGN_INVALID`；handler 未被调用。
  - handler 抛异常：返回 FAILED，记录 ERROR，发出 `NOTIFY_PROCESS_ERROR`。handler 恢复后重发同一报文：返回 SUCCESS，handler 再次被调用。
  - 白名单拒绝：返回 FAILED，发出 `NOTIFY_IP_REJECTED`；放行时返回 SUCCESS。X-Forwarded-For 只在配置信任时生效。
  - JSON 报文和缺省 signType 的 MD5 报文都能通过。
  - 空体：返回 200 FAILED，记录原因为 `empty notify`（R12 单测部分）。
  - 配置不可用：返回 FAILED。
  - 锁忙：返回 FAILED。
  - 并发写入时唯一键冲突：返回 SUCCESS。
  - 留痕的 raw_body 不含通讯密钥、sign 原值和商户号原文，包含 `898****0001`（R10）。
  - **真实 MySQL 用例 `persistsMaskedRecordsInMysql`**：
    - 使用真实的 `PayNotifyRecordServiceImpl` 和 `TestDb` 会话，单号前缀为 `UTNTF`。
    - 依次发送：正确签名、重发、错签。库中得到 PROCESSED、IGNORED、ERROR 各 1 条，只有 PROCESSED 那条写了 notify_id；三条的 raw_body 均已脱敏，trace_id 正确。
    - 测试签名在用例内用 JDK `MessageDigest` 独立计算，不依赖被测验签器。
    - 查询和清理都使用参数化 SQL（`WHERE mchnt_order_id = ?`），在 finally 中执行；清理后断言 `existsByNotifyId` 为 false。
- Verify：先执行 `. scripts/paycenter/run-local.ps1 -EnvOnly`，再执行 `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=UnionPayNotifyControllerTest`，退出码 0，`Tests run: 14, Failures: 0, Errors: 0`。之后执行 `docker exec paycenter-mysql sh /tmp/m.sh -N -D jeecg-boot -e "select count(*) from pay_notify_record where mchnt_order_id like 'UTNTF%'"`，输出 `0`。
  - 第一次运行时 `lockBusyFails` 报 NPE：Mockito 用 `when(...)` 重新打桩时，会触发此前设置的 answer。改为 `doThrow/doReturn` 后通过，断言没有削弱。

## T15 — `UnionPayLiveTest`（R11）
- 类注解为 `@Tag("unionpay-live")` 和按 `@Order` 排序，不启动 Spring。
- `@BeforeAll` 校验 6 个必需环境变量，缺失时 `fail("缺少环境变量 [名列表]：…9:00-18:00…出口 IP 白名单")`，只列变量名，不输出值。
- 装配：
  - HTTP 客户端、签名器、错误映射、`UnionPayChannel` 都使用生产实现。
  - 配置服务和限流用桩代替，因此不依赖数据库和 Redis。
  - 单号由 `new PayNoGenerator(null, props)` 生成。
- 用例 1–4 按 plan 实现：支付宝的下单、查单、关单、再查单；云闪付的下单、关单；退款依赖 `PAY_UNIONPAY_LIVE_PAID_ORDER_ID`，未设置时以 Assumption 跳过；微信只在 PROD 且有 subAppId 时运行，否则以 Assumption 跳过。
- 日志只输出 status、rawCode，以及经 `UnionPayLogMasker` 截断的 appPayRequest。
- **未发出任何真实银联请求**：两次 Verify 中，一次 LiveTest 被排除，另一次在 `@BeforeAll` 缺参阶段就失败了。
- Verify：
  1. 删除 surefire-reports，执行 `-EnvOnly` 后跑模块全量 `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test`：退出码 0，汇总 27 个类、191 个用例，failures、errors、skipped 均为 0。`Test-Path …/TEST-org.jeecg.modules.paycenter.channel.unionpay.UnionPayLiveTest.xml` 输出 `False`。
  2. 在仓库根按 plan 原命令执行：用子 powershell 清空 `PAY_UNIONPAY_*` 后运行 `mvn … test -Dgroups=unionpay-live`，退出码 1。`Select-String -Encoding UTF8 … -Pattern "缺少环境变量 .*PAY_UNIONPAY_APP_ID"` 命中 1 行；报告为 `Tests run: 1, Failures: 1`，消息列出 6 个变量名。
  - 只需传 `-Dgroups=unionpay-live`，profile 会自动把 excludedGroups 覆盖为 `paycenter-none`，不必另外覆盖 excludedGroups。

## 白名单外改动
- 无。

## 编码规范自检
- 新增和修改的公开方法、公开构造都有说明原因或契约的 Javadoc，包括测试类中每个 `@Test`、`@BeforeEach/@AfterEach/@BeforeAll` 和桩的 `handle`。
- 多分支函数都写了解释性注释，包括 `process`、`dispatch`、`selectHandler`、`ipAllowed`、`algorithmOf`、`parseForm`。
- 函数体不超过 80 行（最长的是 `receive` 和 `parseAndVerifyNotify`，约 25 行）；参数不超过 5 个；没有空 catch。
- SQL 只出现在测试中，且都是参数化的。
- 日志、告警和留痕中不含通讯密钥、AppKey、sign 原值和商户号原文。
- 本次没有读取 `.apt/local/*`；`run-local.ps1 -EnvOnly` 只打印了变量名。

## 遗留 / 待决问题
1. **pay_notify_record.raw_body 是 TEXT 类型（最大 65535 字节）**：`maskedBody` 按字符截断到 60000。如果是接近 64KB 的纯中文伪造报文，按字节计算可能超出上限，写 ERROR 记录会失败。这种情况下应答仍为 FAILED，只是少一条留痕。正常通知只有数百字节，不影响功能。如需彻底处理，可在 Recorder 中改为按 UTF-8 字节截断（属于 T14 白名单内的改动，等主 Agent 决定）。
2. plan 1.5-4 / 1.5-10 仍需真实数据确认：通知验签时空值是否参与拼接，需要用真实测试通知验证；银商出口 IP 白名单需要用户提供。当前默认行为是空值不参与，白名单为空时不校验并告警。
3. 沿用前序报告的待决项：T2 Verify 第 3 条的 rg 会命中 JeecgBoot 原有的 `baidu-api.app-id: ??`；fastjson 不保序与 plan 1.3 的描述不符，需要回填 plan。
