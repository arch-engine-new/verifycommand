# F1-G4 报告：S1 Task 13–16（Redis 锁 / 限流 / 防重放 / 单号）

总体 Status：**DONE_WITH_CONCERNS**（功能与 Verify 全部通过；有 3 处与 plan 文字的细节偏离，均为加强，见下文）

| Task | 状态 | backend commit |
|------|------|----------------|
| T13 Redis 键规范 + 分布式锁（R6） | DONE | `2b97325` |
| T14 滑动窗口限流（R7） | DONE_WITH_CONCERNS（取时方式偏离，见下） | `3ce1028` |
| T15 防重放 nonce + 时间窗（R8） | DONE | `919dee6` |
| T16 多实例安全单号生成（R9） | DONE_WITH_CONCERNS（序号取法偏离，见下） | `d3c120d` |

MCP 留痕：`search_arch` query=`RedisUtil StringRedisTemplate redis lock`，未命中可复用的锁/限流组件（仅 xxl-job 锁 Mapper、Redis 监控类），按 plan 直接基于 `StringRedisTemplate` 实现。MP `Sequence` 通过 `javap` 确认 `twepoch`、位布局（41 位时间 | 5 位 datacenter | 5 位 worker | 12 位序列）和 `public static parseIdTimestamp(long)`。

## T13 分布式锁
- 文件：`common/redis/PayRedisKeys.java`、`common/redis/PayRedisLock.java`、`resources/paycenter/lua/unlock.lua`、test `support/TestRedis.java`、`common/redis/PayRedisLockTest.java`
- 实现：`tryLock` 用 `setIfAbsent(key, UUID token, ttl)`，每 50ms 重试直到 wait 超时（线程中断时恢复中断标记并返回空）；`unlock` 用 `DefaultRedisScript<Long>` + `ResourceScriptSource(ClassPathResource)` 执行 unlock.lua；`executeWithLock` 拿不到锁抛 `PayException(SYSTEM_BUSY)`，finally 中解锁，如果解锁时锁已过期则 `log.warn`。实际键为 `PayRedisKeys.lock(key)`。
- `TestRedis`：读 `PAY_REDIS_HOST/PORT/PASSWORD`（默认 127.0.0.1:6379），用 `LettuceConnectionFactory`，依次 `afterPropertiesSet()` 和 `start()`，然后 PING；任何异常都 `fail`。
- Verify：`. scripts/paycenter/run-local.ps1 -EnvOnly; mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayRedisLockTest` → EXIT=0，**Tests run: 4, Failures: 0, Errors: 0, Skipped: 0**（互斥、错误 token 不能解锁且键仍在、ttl=300ms 到期后能重新获得、8 线程×25 次非原子计数结果 = 200）。

## T14 滑动窗口限流
- 文件：`resources/paycenter/lua/sliding_window.lua`、`common/redis/PayRateLimiter.java`、test `common/redis/PayRateLimiterTest.java`
- **偏离（取时方式）**：plan 写的是 ARGV 依次为 `now_ms, window_ms, limit, member`，并由 Java 取 Redis `TIME`。实现改为在 Lua 内调用 `redis.call('TIME')` 计算 now_ms，ARGV 改为 `window_ms, limit, uuid`，member 在 Lua 内拼成 `now-uuid`。这样取时和判断在同一次原子执行里完成，少一次往返，也避免两步之间的时间差；“多实例统一用 Redis 时钟”的意图不变。Redis 7.0.10 默认按效果复制，脚本中先 TIME 再写入是允许的。
- Verify：`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayRateLimiterTest` → EXIT=0，**Tests run: 3, Failures: 0, Skipped: 0**（limit=5/1s 时前 5 次放行、第 6 次被拒，等待 1.1s 后恢复；不同 key 互不影响；20 线程并发恰好 5 次成功）。
- 反证：设置 `PAY_REDIS_PORT=6390`（不可达）重跑，结果 EXIT=1、**Failures: 3、Skipped: 0**，报错为“无法连接 Redis 127.0.0.1:6390…”，说明 Redis 不可达时测试会失败而不是被跳过。

## T15 防重放
- 文件：`common/redis/PayNonceStore.java`、`common/redis/PayReplayGuard.java`、test `common/redis/PayReplayGuardTest.java`
- 实现：nonce 必须匹配 `^[A-Za-z0-9-]{8,64}$`（null 或不匹配返回 false），通过后执行 `setIfAbsent(PayRedisKeys.nonce(scope,nonce),"1",ttl)`；`verify` 先检查时间窗（`timestamp-skew-seconds`），再检查 nonce（ttl=`nonce-ttl-seconds`），两类失败都抛 `PayException(AUTH_FAILED, "timestamp expired" / "nonce replayed")`。
- Verify：`mvn -q -o ... -Dtest=PayReplayGuardTest` → EXIT=0，**Tests run: 5, Failures: 0, Skipped: 0**（正常请求通过；同一 nonce 第二次 → 1002；时间戳偏 ±6 分钟 → 1002；同一 nonce 在不同 scope 下互不影响；非法 nonce（过短、含特殊字符、null）→ 1002）。

## T16 单号生成
- 文件：`common/no/PayWorkerIdAllocator.java`、`common/no/PayNoGenerator.java`、test `common/no/PayNoGeneratorTest.java`
- Allocator：`paycenter.worker-id` 有值时校验在 0–1023 内（越界抛 `IllegalStateException`）；无值时 `INCR paycenter:worker-seq` 后 `floorMod 1024`；`@PostConstruct init()` 调用 `IdWorker.initSequence(workerId>>5, workerId&31)` 并打印 `log.info("paycenter workerId={}")`。构造参数为 `(PayCenterProperties, StringRedisTemplate)`，配置了固定 workerId 时 Redis 可以为 null（单测就是这样 new 出来的）。
- **最终算法（偏离 plan“时间取系统时钟 + IdWorker.getId() 末 N 位”）**：每个单号只取**一个**雪花 id，时间段和序号段都从这个 id 解出。
  - 时间 = `Sequence.parseIdTimestamp(id)`，按 Asia/Shanghai 格式化。
  - P/R/F/C 单号 = 前缀 + `yyyyMMddHHmmss` + `id % 10^13` 补零到 13 位，共 28 位。
  - 银联单号 = 来源编号 4 位 + `yyyyMMddHHmmssSSS` 17 位 + `id & (2^22-1)`（即 datacenter+worker+序列，最大 4194303）补零到 7 位，共 28 位。
- **理由**：plan 原方案的时间取自系统时钟、序号取自雪花 id，两者的毫秒边界可能不一致，例如 MP 的序列在 4096 用尽时会等待下一毫秒，或格式化与取 id 之间跨了毫秒。这时同一个时间串下，两个雪花时间相差 ≥2ms 的 id，其末 7 位十进制可能相同（相差 2ms 的 id 差值区间包含 10^7），存在撞号风险。改成从同一个 id 解出时间后：
  - 同一毫秒内，低 22 位就是雪花的 workerId+序列，必然不同；
  - 同一秒内，雪花 id 的跨度小于 1000×2^22 ≈ 4.2×10^9，小于 10^13，取模后仍然不同；
  - 唯一性因此完全由雪花 id 本身保证。多实例的唯一性依赖不同 workerId（10 位），单实例高并发的唯一性依赖 12 位序列，DB 唯一索引作为兜底。
  - 本次没有先跑 plan 原方案去复现重复，而是直接采用了上述严格更强的算法；测试断言没有削弱。
- 来源编号校验 `^[A-Za-z0-9]{4}$`，不符合抛 `IllegalArgumentException`，异常消息中不包含编号值；未配置时 `unionpayMchntOrderId()` 和 `unionpayRefundOrderId()` 抛 `IllegalStateException`。`unionpayNo(String)` 为包内可见。
- Verify：`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayNoGeneratorTest` → EXIT=0，**Tests run: 7, Failures: 0, Skipped: 0**：
  - 16 线程共 10 万个 `payOrderNo` 无重复，长度 ≤32，只含 `[A-Z0-9]`；
  - P/R/F/C 前缀正确，长度 28，时间段可解析；
  - `unionpayNo("3194")` 16 线程 10 万次无重复，长度恰为 28，以 3194 开头，第 5–21 位可按 `yyyyMMddHHmmssSSS` 解析，末 7 位为数字；
  - 非 4 位来源编号抛 IAE，未配置来源编号抛 ISE；
  - 额外用例：配置来源编号后两类银联单号正常生成；workerId=1024 时启动失败。

## 汇总回归
`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test "-Dtest=PayRedisLockTest,PayRateLimiterTest,PayReplayGuardTest,PayNoGeneratorTest"` → EXIT=0，各类 Tests run 分别为 4/3/5/7，合计 19，全部通过且 Skipped 为 0。之后执行 `redis-cli --scan --pattern "paycenter:*ut-*"`，残留键为 0。

## 白名单外改动
无。四个 Task 只改动了各自 Files 白名单中的文件。

## 遗留 / 待主 Agent 决策
1. T14 在 Lua 内取 Redis TIME，ARGV 顺序与 plan 文字不同（意图一致）。若 reviewer 要求严格按文字实现，只需改 Lua 和 `tryAcquire` 两处。
2. T16 序号算法偏离 plan 文字（理由见上）。银联单号末 7 位实际是 0–4194303，不会覆盖满 7 位十进制范围；28 位格式不受影响。
3. `PayWorkerIdAllocator` 依赖容器中存在 `StringRedisTemplate` Bean。base-core 中没有显式定义，预期由 Spring Boot Redis 自动配置提供，需在 T20 端到端启动时确认，可通过日志中的 `paycenter workerId=` 判断。另外，Redis 自增分配在超过 1024 次重启后会循环；生产环境建议显式配置 `PAY_WORKER_ID`。
