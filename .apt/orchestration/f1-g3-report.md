# F1-G3 报告：S1 Task 10 / 11 / 12

总体 Status：**DONE**（backend 仓库，分支 `paycenter`，未 push）

| Task | 状态 | commit | Verify | 结果 |
|------|------|--------|--------|------|
| T10 错误码/异常/对内响应/openapi 异常处理（R10） | DONE | `403bea2` | `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest="PayErrorCodeTest,PayOpenApiExceptionHandlerTest"` | EXIT=0；PayErrorCodeTest tests=3、PayOpenApiExceptionHandlerTest tests=3，failures/errors/skipped=0 |
| T11 PayCryptoService AES-256-GCM + 多版本 key + 脱敏（R4） | DONE | `3082b24` | `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayCryptoServiceTest` | EXIT=0；tests=10，failures/errors/skipped=0 |
| T12 TraceId 全链路（R5 单测部分） | DONE | `57fe79b` | `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayTraceFilterTest`；`rg -c "%X\{traceId\}" logback-spring.xml` | EXIT=0；tests=4，failures/errors/skipped=0；rg 计数 = 2 |

合计 Tests run = 20，全部通过（以 surefire XML 计数核对，非仅退出码）。

## T10 要点
- `PayErrorCode`：16 个码，顺序与 `paycenter/02-内部系统对接文档.md` §1.3 一致，`message` 为文档「说明」列原文（UTF-8 读取后复制，含括号补充说明）。
- `PayException`：`errorCode` / `detail`（仅入日志）/ `data`（2003 幂等回带原单）。
- `PayApiResponse<T>`：`ok(data)`、`fail(PayErrorCode)`、`fail(PayException)`；失败响应 message 恒为标准文案，不透出 detail。
- `PayOpenApiExceptionHandler`：`@RestControllerAdvice(basePackages="org.jeecg.modules.paycenter.openapi") @Order(HIGHEST_PRECEDENCE)`；PayException→对应码；`MethodArgumentNotValidException`/`HttpMessageNotReadableException`/`jakarta.validation.ConstraintViolationException`→1001；其他→9999（`log.error` 带 MDC traceId 与堆栈，body 仅 `{code:9999,message:系统繁忙}`）；HTTP 200。
- 测试：码值/文案/顺序/枚举名/唯一性；standalone MockMvc 覆盖 3004、未知异常 9999 且 body 不含 "Exception"/"at org."/异常信息、非法 JSON→1001。
- MCP 留痕：`search_arch` query=`JeecgBootExceptionHandler` 命中 `backend/jeecg-boot/util/JeecgBootExceptionHandler`（plan 中 `query_arch path=backend/jeecg-boot/util` 已失效，按指示改用 search_arch）。

## T11 要点
- 密文格式 `v{ver}:Base64(iv12 ‖ cipher ‖ tag16)`，`AES/GCM/NoPadding`，`GCMParameterSpec(128, iv)`，`SecureRandom` IV。
- 旧版本 key 解析抽象为可注入 `Function<Integer,String>`：生产构造（`@Autowired`）`PayCryptoService(PayCenterProperties, Environment)` 默认读 `PAY_MASTER_KEY_V{n}`；测试构造 `PayCryptoService(PayCenterProperties, Function<Integer,String>)`。
- key 缺失/非 Base64/长度≠32 → `IllegalStateException("PAY_MASTER_KEY 未配置或长度不是 32 字节（版本 vN）")`；Base64 解码异常**不挂 cause**（JDK 消息会带出非法字符）。解密/篡改失败 → `IllegalStateException`，根因 `AEADBadTagException`。日志/异常均不含 key。
- `@PostConstruct validateOnStartup()`：`require-master-key=true` 且 key 无效→抛异常阻止启动；否则仅 `log.warn`（无 key）。
- `encrypt(null)`/`decrypt(null)` 返回 null（便于可空字段）；密文格式非法 → `IllegalArgumentException`。
- `PayMaskUtil.mask`：null→null；长度≤7 全 `*`；否则前 3 + `****` + 后 4。
- 测试覆盖：往返、随机 IV、篡改 iv/密文/tag 字节→AEADBadTag 根因、错 key、缺 key/短 key/非 Base64 key 消息不含 key、v1→v2 轮换（注入解析器）、默认 Environment 解析器（`MockEnvironment` 提供 `PAY_MASTER_KEY_V1`）、格式非法、启动校验开关、脱敏边界。测试 key 均为测试内随机生成，未读取 `.apt/local/*`。

## T12 要点
- `PayTraceFilter`（`@Component @Order(HIGHEST_PRECEDENCE)`，`OncePerRequestFilter`）：`X-Trace-Id` 符合 `^[A-Za-z0-9-]{1,64}$` 则沿用，否则 UUID 去横线（32 位）；MDC 写入、响应头回写、`finally MDC.remove`。
- `PayTraceUtil`：`MDC_KEY="traceId"`、`current()`、`wrap(Runnable)`、`wrap(Callable)`（捕获提交线程 MDC 副本，执行后恢复执行线程原 MDC）。
- `PayTraceConfig`：Bean `payTraceTaskDecorator`（`TaskDecorator`）。
- `logback-spring.xml`：控制台（L12）与文件（L27）pattern 在 `[%thread]` 后插入 ` [%X{traceId}]`；注释掉的旧 pattern（L11）未改。
- 测试：头 `t-123` 透传+回写+结束清空；无头生成 32 位 hex；非法头（`a b<`、空串、65 位）重新生成；`wrap(Runnable/Callable)` 跨线程取到原 traceId 且执行后恢复；`TaskDecorator` 透传。

## 白名单外改动
无。

## 遗留 / 待决
- 无阻塞问题。
- backend 仓库内 `target/` 已被 `jeecg-boot/.gitignore` 忽略；但主仓 `git status` 会把 `backend/**/target` 显示为未跟踪（嵌套仓库未被主仓忽略），属既有状况，建议主 Agent 视情况在主仓 `.gitignore` 处理。
