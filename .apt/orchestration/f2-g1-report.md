# S2 银联通道适配 — Implementer 报告（Task 1–6）

- Plan：`docs/apt/plans/2026-10-21-paycenter-s2-unionpay-channel-plan.md`
- 总体状态：**DONE_WITH_CONCERNS**（T2 Verify 第 3 条 rg 命中 1 行，是 JeecgBoot 原有的百度 API 占位配置，不是本片引入的明文，详见 T2）
- backend 基线：`7792ac9`（分支 `paycenter`）

| Task | 状态 | Commit（仓库） |
|------|------|----------------|
| T1 unionpay-live 标签默认排除 | DONE | `cf522b6`（backend） |
| T2 paycenter.unionpay 配置 + 脚本模板 | DONE_WITH_CONCERNS | `d9131f4`（backend）、`f98ead7`（主仓） |
| T3 通道抽象契约 | DONE | `cc810eb`（backend） |
| T4 PayChannelRouter | DONE | `81a4357`（backend） |
| T5 通道配置解密 + 60s 缓存 | DONE | `4e8ce17`（backend） |
| T6 环境变量引导写入 + 密文入库实测 | DONE | `2874519`（backend） |

## T1 — pom.xml
- 改动：`<properties>` 增 `paycenter.test.excludedGroups=unionpay-live`；`<build><plugins>` 增 surefire（无 version）`excludedGroups=${paycenter.test.excludedGroups}`；`<profiles>` 增 `unionpay-live`（`groups=unionpay-live` 自动激活，属性改为 `paycenter-none`）；均加了 XML 注释。
- Verify：三条 rg 各命中 1 行（L62 / L19 / L75）；`mvn -q -o ... test -Dtest=PayErrorCodeTest` 退出码 0，surefire 报告 `PayErrorCodeTest Tests run: 3, Failures: 0`（报告时间戳为本次运行）。排除行为按 plan 在 T15 实测。

## T2 — 配置节点
- `PayCenterProperties`：新增嵌套 `UnionPay`（notifyUrl / notifySignIncludeEmpty / notifyIpWhitelist / notifyTrustForwardedHeader / rateLimitWaitMs=1000 / busyRetryBackoffMs=[200,500,1000] / configCacheSeconds=60 / bootstrap）与 `Bootstrap`（env=TEST / apiBaseUrl / appId / appKey / commKey，手写 toString：密钥为空输出 `<empty>`，否则输出 `***`）；`PayCenterProperties.toString()` 末尾追加 `unionpay=`。
  - 小调整：`busyRetryBackoffMs` 默认值用 `new ArrayList<>(List.of(...))`（可变列表，避免 Binder 或调用方修改时抛异常），值与 plan 一致。
- `application-dev.yml`：`paycenter.unionpay.*` 节点，凭证全部 `${ENV:}` 占位。
- `scripts/paycenter/run-local.ps1`：`New-PcAppEnvFile` 模板追加 11 行银联变量注释占位（只影响新生成的文件，不打印值）。
- `PayCenterPropertiesTest`（2 个用例）：绑定、toString 脱敏、默认值。
- Verify：
  - `mvn ... test -Dtest=PayCenterPropertiesTest` → `Tests run: 2, Failures: 0`（首次运行遇到 S1 已知坑 `ClassFormatError`，对模块 `clean` 后通过）。
  - rg `app-key: ${PAY_UNIONPAY_APP_KEY:}|comm-key: ...` 命中 2 行（L463/L464）。
  - rg `^\s*(app-key|comm-key|app-id):\s*[^$\s]` **命中 1 行**：L388 `app-id: ??`，位于 JeecgBoot 原有的 `jeecg.baidu-api` 节点（占位值 `??`，非真实凭证，也不是本片改动）。银联节点本身无命中。不在白名单内，未改动；该 rg 模式需主 Agent 判定是否收窄到 `paycenter` 节点。

## T3 — 通道抽象契约
- 新增 `channel/dto/*` 14 个（3 枚举 + 11 DTO，统一 `@Data @Builder @NoArgsConstructor @AllArgsConstructor`，每个字段写了来源字段名注释）；`channel/PayChannel`、`PayChannelCode`、`ChannelErrorInfo`（record）、`PayChannelException`（detail 按 plan 格式拼接，rawMessage 截断 128）；`channel/notify/NotifyProcessStatus`、`PayNotifyHandleResult`（`processed/ignored` 静态工厂）、`PayNotifyHandler`；`common/alert/PayAlertType`、`PayAlertEvent`（final，构造时取 traceId + 时间）；`channel/config/PayChannelConfigChangedEvent`。
- MCP：`query_contract name=PayChannel` → 未命中（符合 plan 1.3：本片新建契约，不触发 report_missing）。
- Verify：`mvn -q -o -DskipTests ... compile` 退出码 0；dto 文件数 = 14；rg `ChannelNotify parseAndVerifyNotify(ChannelNotifyRequest request)` 命中 1 行（L77）。本 Task 没有测试用例。

## T4 — PayChannelRouter
- `@Component`，构造时按 `trim+大写` 后的编码建只读 Map，重复编码抛 `IllegalStateException("duplicate pay channel: X")`；`get` 遇到 null、空串或未注册编码时抛 `PayException(CHANNEL_ERROR, "unsupported channel: ...")`；`supportedCodes()` 返回不可变集合。
- `PayChannelRouterTest`（4 个用例）：桩通道用具名私有静态内部类代替匿名类，因为每个方法都要写 Javadoc，与 plan 的匿名桩等价。
- Verify：`mvn ... test -Dtest=PayChannelRouterTest` → `Tests run: 4, Failures: 0`。

## T5 — 通道配置加载
- `PayChannelConfigMapper.countByChannelCodeIncludingDeleted`（`@Select` + `#{}` 参数绑定）。
- `IPayChannelConfigService.findActiveByCode` / `countIncludingDeleted`；实现分别使用 `lambdaQuery().eq(...).eq(status,1).last("limit 1").one()`（`last` 里是常量字面量，没有拼接）和 mapper 新方法。
- `ChannelRuntimeConfig`（`@Value @Builder @ToString(exclude={appKey,commKey})`，`from()` 超时默认 3000/10000），另外公开了静态方法 `trimTrailingSlash` 供 T6 复用。
- `PayChannelConfigService`（`@Service @Lazy(false)`）：使用 ConcurrentHashMap + 单调时钟 TTL；配置缺失/不完整/解密失败抛 5001，日志只打印通道编码；支持 `evict/evictAll` 与 `@EventListener onConfigChanged`；包内构造可注入 `LongSupplier`。
- MCP：`search_arch query=PayChannelConfigServiceImpl` 命中 assetId `backend/jeecg-module-paycenter/util/PayChannelConfigServiceImpl`。
- `PayChannelConfigServiceTest`（7 个用例，对应 plan 的 7 项）。
- Verify：`mvn ... test -Dtest=PayChannelConfigServiceTest` → `Tests run: 7, Failures: 0`（篡改用例的 ERROR 日志是预期输出，只含 channel=UNIONPAY）。

## T6 — 引导写入
- `PayChannelConfigBootstrap`（`@Component @Lazy(false) implements ApplicationRunner`）严格按 plan 的 5 步实现：四项全空时 INFO；部分缺失时 WARN 只列变量名；含逻辑删除行已存在则不覆盖；主密钥无效（`IllegalStateException`）时 WARN 并返回 false；`DuplicateKeyException` 时 INFO 并返回 false；`run()` 捕获 RuntimeException，只记录类名。
- `PayChannelConfigBootstrapTest`（5 个用例，用 logback `ListAppender` 校验日志里没有密钥值）。
- `PayChannelConfigDbTest`（1 个用例，真实 MySQL）：SQL 全部是常量，并用 `?` 绑定参数；清理语句 `DELETE ... LIKE 'UT_UP_%'` 为常量字面量。
- Verify：`. scripts/paycenter/run-local.ps1 -EnvOnly; mvn ... test "-Dtest=PayChannelConfigBootstrapTest,PayChannelConfigDbTest"` → `BootstrapTest Tests run: 5`、`DbTest Tests run: 1`，均为 0 失败；之后 docker SQL `count(*) ... like 'UT_UP_%'` 输出 `0`。

## 附加回归
- 在注入环境变量的前提下跑模块全量 `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test`：退出码 0，**16 个测试类、75 个用例，0 失败/错误**（S1 原有用例全部通过）。

## 白名单外改动
- 无。

## 编码规范自检
- 所有新增/修改的公开方法（含测试类中的 public 方法与内部桩的 @Override 方法）都有说明契约或原因的 Javadoc；测试方法与 `@BeforeEach/@AfterEach` 也加了 Javadoc。
- 无 SQL 字符串拼接（主代码与测试代码均无）；无空 catch；函数体都在 80 行以内、参数不超过 5 个；关键分支（TTL 比较、引导跳过分级、并发重复）写了说明原因的注释。
- 日志与异常消息不含 AppKey/通讯密钥；本次执行没有读取或输出 `.apt/local/*` 的值。

## 待决问题
1. T2 Verify 第 3 条 rg 会命中 JeecgBoot 原有的 `baidu-api.app-id: ??`（L388），需主 Agent 决定是否接受，或在 T16 第 8 条与后续 verify 中把模式收窄到 `paycenter` 节点。
