# S2 银联通道适配 — Implementer 报告（Task 7–10）

- Plan：`docs/apt/plans/2026-10-21-paycenter-s2-unionpay-channel-plan.md`
- 总体状态：**DONE**
- backend 基线：`2874519`（分支 `paycenter`，T6 之后）

| Task | 状态 | Commit（backend） | 测试 |
|------|------|-------------------|------|
| T7 OPEN-BODY-SIG 签名器 | DONE | `b21d262` | OpenBodySigSignerTest：Tests run 5，0 失败 |
| T8 状态 / targetSys / 退款状态 / msgType 映射 | DONE | `8dd535a` | UnionPayStatusMapperTest：Tests run 30，0 失败 |
| T9 错误码映射 + 告警事件 | DONE | `77534c5` | UnionPayErrorMapperTest：Tests run 7，0 失败 |
| T10 HTTP 客户端（签名 / 超时 / 限流 / 9200 退避 / 脱敏日志） | DONE | `64a0f3b` | UnionPayLogMaskerTest 5 个 + UnionPayHttpClientTest 11 个，0 失败 |

合计 58 个用例，0 失败 / 0 错误。所有 Verify 均在 `backend/jeecg-boot` 下用 `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=...` 实际执行，退出码 0，surefire 报告中 Tests run > 0。

## T7 — OpenBodySigSigner
- 主代码 `channel/unionpay/OpenBodySigSigner`（final，不是 Bean）：
  - 公开无参构造使用 Asia/Shanghai 时钟和 32 位小写 hex nonce；包内构造可注入 `(Clock, Supplier<String>)`。
  - 静态方法 `bodyDigestHex`、`signature`、`authorization`；实例方法 `sign` 返回 `record SignedHeader`。
  - 发生 `GeneralSecurityException` 时抛 `IllegalStateException("OPEN-BODY-SIG sign failed")`，消息不带 key。
- 测试支撑 `support/UnionPayTestFixtures`：存放假凭证常量，提供 `config(baseUrl, connectMs, readMs)`。
- **参考值的独立性（R3）**：
  - 实现前在 PowerShell 中用 .NET `SHA256` / `HMACSHA256` 重新计算了 plan 给出的两个常量，结果一致：摘要 `0286d08b…ad8c2`，签名 `ijdzQvmGCvFEBs0mRS1sxGWzEz22uKjaWgCK3SO9pYg=`。测试类注释写明了常量来源。
  - 测试内另有用例 `independentJdkComputationMatchesConstants`：用 JDK `MessageDigest` / `Mac` 按 04 §2 的规则重新拼接计算，再与常量比对。整个过程不使用被测类的输出。
- 用例：静态方法与参考值逐字相等；固定时钟（UTC 04:00 对应上海 12:00）下时间戳和头部一致；默认构造生成的头部符合 plan 正则，且两次 nonce 不同；报文改动 1 字节后签名随之变化。

## T8 — UnionPayStatusMapper
- 交易状态在 trim 后**区分大小写**精确匹配，未知值、小写、空串、null 一律落 UNKNOWN。
- targetSys 匹配时 trim 并忽略大小写：WXPay 对应 WECHAT，以 ALIPAY 开头的对应 ALIPAY，UNIONPAY/UAC 对应 UNIONPAY_CARD，其余返回 null。
- 退款状态只精确识别三种值，其余落 UNKNOWN。
- msgType 有 3 种；入参为 null 时抛 `PayException(PARAM_INVALID)`，即错误码 1001。
- 测试用 `@ParameterizedTest @CsvSource` 覆盖 plan 列出的全部输入：6 个状态加 4 个异常值、8 个 targetSys、7 个退款状态、3 个 msgType，另有 null 抛 1001 的用例。

## T9 — UnionPayErrorMapper
- 映射规则与 plan 表格一致：
  - 1001 → 5001，并发出 CHANNEL_AUTH_FAILED 告警。
  - 1000 → 9999，并发出 CHANNEL_SIGN_FAILED 告警。
  - 9200 和 RATE_LIMITED → 5001，needQuery=false，不告警。
  - 其他码（含 null、TIMEOUT、IO_ERROR、HTTP_xxx、INVALID_JSON）→ 5001，needQuery=true。
- 告警 summary 和 WARN 日志内容为 `unionpay <api> rawCode=<code>`，不含报文。
- 小差异：新增公开常量 `RATE_LIMITED`，供 HTTP 客户端引用，避免魔法字符串。行为与 plan 表格一致。

## T10 — HTTP 客户端
- `UnionPayConstants`、`UnionPayApi`（5 个 path）严格按 plan 实现。
- `UnionPayLogMasker` 的处理规则：
  - 键名忽略大小写。
  - 商户号、终端号、用户标识类字段走 `PayMaskUtil.mask`。
  - sign、appKey、commKey、signature、authorization 的值替换为 `***`。
  - appPayRequest 只保留前 8 字符，再加 `...(len=N)`。
  - 嵌套 Map 递归处理。另外对 List 中的 Map 也做了递归，比 plan 多覆盖一层，防止深层字段漏掉。
- `UnionPayHttpClient` 的实现：
  - 公开构造标 `@Autowired`，与 T5 的 `PayChannelConfigService` 写法一致，因为同时存在包内构造。
  - `HttpClient` 强制 HTTP/1.1，并按 connectTimeout 缓存。
  - 每次尝试都重新签名；签名用的字节数组就是发送的字节数组。
  - 限流用 50ms 轮询，累计超过 `rateLimitWaitMs` 时抛 RATE_LIMITED。
  - 网络异常不重试：`HttpTimeoutException` 记为 TIMEOUT，其他 `IOException` 和中断记为 IO_ERROR。
  - 成败判定兼容 respCode 和 errCode 两种写法，且必须同时满足 HTTP 2xx。
  - 只有 9200 按退避序列重试，退避通过包内 `Sleeper` 注入。
  - 每次尝试输出一行 INFO 日志，请求和响应都经过脱敏。
- 与 plan 的小调整（均为加强）：
  - 非 JSON 响应在日志中只输出 `<non-json len=N>`，不输出原文前缀，因为原文无法逐字段脱敏。
  - 9200 退避期间如果线程被中断，按 9200 结束（needQuery=false），并恢复中断标志。
  - 响应为非 2xx 的 JSON 且不含 errCode/respCode 时，rawCode 记为 `HTTP_<status>`。
- `support/UnionPayMockServer`：基于 JDK `HttpServer`，只监听 127.0.0.1 的随机端口。
  - 记录请求的原始字节和小写键的请求头。
  - 支持带延迟的预置响应；没有预置响应时返回 500 NO_STUB。
  - 客户端超时断开导致写回失败时，捕获 `IOException` 并计入 `brokenWrites`，不是空 catch，并有注释说明。
  - `close()` 中先 `stop(0)` 再 `shutdownNow`。
  - `start()` 返回自身，方便链式调用。
- `UnionPayHttpClientTest`（11 个用例）覆盖 plan 的 10 项，另加 1 项 HTTP 200 非 JSON 对应 INVALID_JSON：
  1. 签名与实际发送的字节一致：测试内用 JDK `MessageDigest` / `Mac` 独立重算，不调用被测签名器。
  2. 读超时 300ms 对服务端延迟 1500ms：结果为 5001、needQuery、TIMEOUT，耗时 < 1400ms，请求 1 次。
  3. 9200 两次后成功：共 3 次请求，退避序列 [200, 500]。
  4. 9200 重试耗尽：共 4 次请求，退避序列 [200, 500, 1000]，needQuery=false。
  5. 限流始终拒绝：耗时在 900–2500ms 之间，rawCode 为 RATE_LIMITED，未发出请求。
  6. 限流先拒绝 2 次后放行：`tryAcquireUnionPay` 被调用 3 次。
  7. 1001 不重试，并产生 1 个 CHANNEL_AUTH_FAILED 事件。
  8. HTTP 500 返回 `oops`：rawCode 为 HTTP_500，needQuery=true。
  9. `errCode=SUCCESS` 判为成功。
  10. 日志脱敏：用 logback `ListAppender` 断言日志不含 AppKey、通讯密钥、SECRET_SIGN_VALUE、wx_prepay_123456789、898000000000001、OPEN-BODY-SIG；含 `898****0001`、`appPayRequest`；MDC 中 traceId 为 `t-s2-log`。
- R7 限流测试按 plan 用 Mockito 桩替代 `PayRateLimiter`，不依赖真实 Redis，所以本组 Verify 不需要注入环境变量。
- 观察：`UnionPayHttpClientTest` 第一个用例耗时约 15s，是 Mockito inline 与 JDK HttpClient 冷启动所致，之后的用例都在 0.1–1.1s。不影响结论。

## 白名单外改动
- 无。所有文件都在 T7–T10 的 Files 白名单内。

## 编码规范自检
- 所有公开方法、公开构造、record 和内部接口都有说明原因或契约的 Javadoc；测试类的 public 方法、`@BeforeEach` / `@AfterEach` 同样有。
- 多分支函数（`toOrderStatus`、`toException`、`Outcome.of`、`send`）都写了解释性注释。
- 无 SQL；无空 catch；函数体不超过 80 行，参数不超过 5 个（包内构造恰好 5 个）。
- 日志和异常消息不含 AppKey / 通讯密钥 / Authorization；本次没有读取 `.apt/local/*`。

## 待决问题
- 无新增。沿用 f2-g1 的待决项：T2 的 rg 命中 JeecgBoot 原有的 `baidu-api.app-id` 占位值。
