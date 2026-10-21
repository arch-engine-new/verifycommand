# F1-G6 报告：数据修正 + Task 20 全量测试 / 打包 / 端到端启动验证

Status: **DONE**

## 提交（均在 backend 嵌套仓库，分支 paycenter；主仓无提交）

| 提交 | SHA | 内容 |
|---|---|---|
| 数据修正（主 Agent 决策） | `b95a3fe4cf01ce572441e3a898ace382eb7e61a8` | `V20261020_2__paycenter_init_data.sql`：`pc_menu_root` 的 component 从 `layouts/RouteView` 改为 `layouts/default/index` |
| T20 缺陷修复 | `b3066e834356d10b77d930c65b28864c954bf234` | `PayWorkerIdAllocator` 加 `@Lazy(false)` |

修改前已确认 `flyway_schema_history` 尚未登记 20261020.2，修改 SQL 不会造成 checksum 不一致。

`run-local.ps1` 已具备后台启动、记录 PID、轮询 ping（180s）和 `-Stop`，**本次未修改**。

## 发现并修复的缺陷（S1 范围内）

- **现象**：第一次启动时 6 项校验中仅第 6 项失败，日志里没有 `paycenter workerId=`。
- **根因**：`application.yml` 设置了 `spring.main.lazy-initialization: true`，`PayWorkerIdAllocator` 在首次被注入前不会实例化，`@PostConstruct` 不执行。这会导致启动阶段 MyBatis-Plus 的 `IdWorker` 仍使用默认 workerId，多实例部署时有雪花 id 撞号风险（R9）。
- **修复**：类上加 `@Lazy(false)`，做法与 `FlywayConfig` 一致，并在类注释里说明原因。
- **验证**：重新跑模块测试（56 个全绿）→ 重新打包 → 重新启动；日志中出现 `paycenter workerId=1`。

## 全模块测试

`. scripts/paycenter/run-local.ps1 -EnvOnly; mvn -o -pl jeecg-boot-module/jeecg-module-paycenter test`
→ `Tests run: 56, Failures: 0, Errors: 0, Skipped: 0`，BUILD SUCCESS（修复前后各跑一次，结果相同）。
输出中的 `ERROR ... PayOpenApiExceptionHandler` 是 `PayOpenApiExceptionHandlerTest` 预期产生的日志。

## 打包

`mvn -q -o -DskipTests -pl jeecg-module-system/jeecg-system-start -am package` → EXIT=0。
`jeecg-system-start-3.9.5.jar` 中包含 `BOOT-INF/lib/jeecg-module-paycenter-3.9.5.jar`（用 .NET ZipFile 列目录核验，本机 PATH 中没有 `jar`）。

## 启动

- 启动前 8080 端口无占用。`scripts/paycenter/run-local.ps1` 注入 5 个变量（只打印变量名），打印 `started pid 28340`，随后 `/v1/ping returned 200`。
- Flyway：第一次启动日志为 `Migrating ... 3.9.5.1` / `20261020.1` / `20261020.2` → `Successfully applied 3 migrations ... now at version v20261020.2`；第二次启动为 `Schema is up to date`。
- **20261020.1 的处理**：pay_* 表此前已被手工建好，但 DDL 使用 `CREATE TABLE IF NOT EXISTS`，所以 Flyway 只对已存在的表记录 WARN（`Table 'pay_xxx' already exists`，SQL State 42S01），脚本照常执行并登记 success=1。**没有**人工改动 `flyway_schema_history`。
- `application-dev.yml` 中 `spring.flyway.enabled: true`，由 `FlywayConfig` 执行迁移，无需额外开关。

## 6 项校验（以最终一轮启动为准，pid 28340）

1. **R13 无相关 ERROR — 通过**：区分大小写匹配 ERROR 级日志行数为 0，与 paycenter/flyway/datasource 相关的行数为 0。注意 plan 中的 `Select-String -Pattern " ERROR "` 默认**不区分大小写**，会把 Flyway WARN 行里的 `Error Code: 1050/1681`（表已存在、整型显示宽度已废弃）误判为错误，因此改用 `-CaseSensitive` 判定。err.log 只有 3 条 logback「Appender not referenced」WARN。
2. **R11/R13 Flyway — 通过**：`3.9.5.1 1`、`20261020.1 1`、`20261020.2 1`。
3. **R12/R5 匿名 ping — 通过**：请求不带 token，返回 `HTTP/1.1 200`、`X-Trace-Id: t-123`，body 为 `{"code":"0000","data":{"service":"paycenter",...},"message":"成功"}`。反证：`/v1/not-exist` 返回 `HTTP/1.1 401` 和 `token为空!`，说明 Shiro 没有整体放行 `/v1/**`；且 401 响应也带 X-Trace-Id，说明 `PayTraceFilter` 位于 Shiro 之前。
4. **R5 trace 日志 — 通过**：`[http-nio-8080-exec-7] [t-123] INFO o.j.modules.paycenter.openapi.PayPingController:28 - ping`。
5. **R11 初始化数据 — 通过**：sys_dict pc_dict_% = 12；sys_permission pc_% = 15；sys_role_permission pc_rp_% = 26；pay_agreement_version = 5。另外核对：`pc_menu_root.component = layouts/default/index`，中文字典项入库正确（`pc_di_nps_ERROR` 的 item_text 为「异常」，hex E5BC82E5B8B8）。Flyway debug 日志里显示的 `??` 只是控制台编码问题。
6. **R9 workerId 日志 — 通过（修复后）**：`o.j.m.paycenter.common.no.PayWorkerIdAllocator:53 - paycenter workerId=1`。

## 安全检查

- 用当前进程环境变量值对 `.apt/paycenter-run.log` 和 `.apt/paycenter-run.err.log` 做字面匹配，只输出长度和命中次数：`PAY_DB_PASSWORD len=32 hitsInLogs=0`，`PAY_MASTER_KEY len=44 hitsInLogs=0`。日志中没有出现密钥。
- 全程没有读取 `.apt/local/*` 的内容。

## 停止

`run-local.ps1 -Stop` 输出 `stopped pid 28340`；之后 8080 无监听，pid 28340 不存在。第一轮启动（pid 28164）在修复前也已用 `-Stop` 停止。

## 白名单外改动

- `PayWorkerIdAllocator.java`：属于 paycenter 模块，在 Task 20「仅修复本 S1 范围内文件的缺陷」允许范围内。

## 遗留 / 待决

- 建议把 plan Task 20 校验 1 的命令改为 `Select-String -CaseSensitive`，或按日志级别字段匹配，避免把 Flyway 的 `Error Code` WARN 误判为错误。
- V20261020_1 在已建表的库上执行会产生 `already exists` WARN，属预期行为；全新库上不会出现。
