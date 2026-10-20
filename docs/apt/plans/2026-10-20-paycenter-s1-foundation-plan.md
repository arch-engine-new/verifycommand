# 首筑支付中心 S1 工程骨架与基础设施 Implementation Plan

> **Spec:** `docs/superpowers/specs/2026-10-20-paycenter-s1-foundation-design.md`
> **Command:** `/plan-from-spec`
> **Status:** draft

**Goal:** 交付可启动的 `jeecg-module-paycenter` 模块及其全部基础设施组件与初始化数据，供 S2–S5 直接复用。

**Architecture:** 在 JeecgBoot 3.9.5 单体（`jeecg-system-start`）中新增业务模块 `jeecg-module-paycenter`（仿 `jeecg-module-demo`，仅依赖 `jeecg-boot-base-core`）。持久层用 MyBatis-Plus 实体映射已落库的 14 张 `pay_` 表；多实例相关能力（锁、限流、nonce、workerId）统一基于 `StringRedisTemplate` + Lua；密钥/口令全部经环境变量注入，AES-256-GCM 加密落库。初始化数据走 Flyway `V20261020_2`。

---

## Part 1 — 技术方案（APT 寻址）

### 1.1 范围与约束

**包含：** R1–R13（见 1.6）：新模块、环境变量化配置、14 实体/Mapper/Service、加解密、TraceId、分布式锁、限流、防重放、单号生成、错误码与异常、初始化数据、Shiro 白名单、端到端启动验证。

**非目标：** 银联报文/签名/HTTP（S2）；`/v1/**` 业务接口与 token 鉴权（S3，S1 仅放行路径并提供 `/v1/ping`）；定时任务与回调重试（S4）；前端页面（S5）。

**硬约束：**
- 仓库任何文件不得出现明文密码/密钥；`.apt/local/paycenter-db.env` 只能被脚本读取注入环境变量，禁止 `cat`/回显。
- Flyway 占位符前缀为 `#(`（`FlywayConfig`），SQL 中不得出现该字符序列。
- `FlywayConfig` 会吞掉迁移异常仅打印日志 → 迁移成功与否必须查 `flyway_schema_history.success`。
- 命令行环境：Windows PowerShell 5；Maven `E:\maven`；JDK 17；Docker 容器 `paycenter-mysql`(3307)、`redis`(6379)。
- 容器内执行 SQL 一律用 `docker exec paycenter-mysql sh /tmp/m.sh -N -D jeecg-boot -e "<sql>"`（helper 已在容器内，口令不出容器）。

### 1.2 设计寻址

N/A（S1 无 UI；菜单 component 路径约定 `paycenter/<page>/index`，由 S5 `/apt-frontend-connect` 落实）。

### 1.3 依赖寻址表

| 依赖 | 来源 | 引用 | 摘要 |
|------|------|------|------|
| JeecgEntity | arch（`query_contract` 未命中 → `search_arch`） | `backend/jeecg-boot/jeecg-boot-base-core/src/main/java/org/jeecg/common/system/base/entity/JeecgEntity.java` | id `ASSIGN_ID` + createBy/createTime/updateBy/updateTime，无 del_flag/sysOrgCode |
| JeecgService | arch | `backend/jeecg-boot/jeecg-boot-base-core/src/main/java/org/jeecg/common/system/base/service/JeecgService.java` | `JeecgService<T> extends IService<T>` |
| MybatisInterceptor | arch | `backend/jeecg-boot/jeecg-boot-base-core/src/main/java/org/jeecg/config/mybatis/MybatisInterceptor.java` | 按字段名自动填充 createBy/createTime/updateBy/updateTime |
| MybatisPlusSaasConfig | arch | `backend/jeecg-boot/jeecg-boot-base-core/src/main/java/org/jeecg/config/mybatis/MybatisPlusSaasConfig.java` | 已注册 `OptimisticLockerInnerInterceptor`；租户拦截仅作用于 `TENANT_TABLE`，`pay_` 表不受影响 |
| Result / JeecgBootException / JeecgBootExceptionHandler | arch | `jeecg-boot-base-core/.../common/api/vo/Result.java`、`.../common/exception/*` | 后台接口沿用；对内接口用独立 `PayApiResponse` |
| ShiroConfig + excludeUrls | arch | `jeecg-boot-base-core/src/main/java/org/jeecg/config/shiro/ShiroConfig.java`（L95 读取 `jeecg.shiro.excludeUrls`） | 逗号分隔 anon 路径 |
| FlywayConfig | arch | `jeecg-module-system/jeecg-system-start/src/main/java/org/jeecg/config/flyway/FlywayConfig.java` | locations `classpath:flyway/sql/mysql`，占位符 `#(`…`)`，异常仅日志 |
| jeecg-module-demo pom | 源码（模板） | `backend/jeecg-boot/jeecg-boot-module/jeecg-module-demo/pom.xml` | parent `jeecg-boot-module` 3.9.5，依赖 `jeecg-boot-base-core` |
| StringRedisTemplate | 框架（spring-data-redis，经 base-core 传递） | — | 锁/限流/nonce/workerId 的 Lua 执行 |
| IdWorker | 框架（MyBatis-Plus 3.5.16） | `com.baomidou.mybatisplus.core.toolkit.IdWorker` / `Sequence` | 雪花数值部分 |
| logback-spring.xml | 源码 | `jeecg-system-start/src/main/resources/logback-spring.xml` L12/L27 | 控制台与文件 pattern |
| application-dev.yml | 源码 | 同目录，datasource L146–149，redis L157–161，excludeUrls L293 | 待环境变量化 |
| DDL | 源码 | `.../flyway/sql/mysql/V20261020_1__paycenter_init_tables.sql` | 14 表，已在 3307 执行 |
| 错误码表 | 文档 | `paycenter/02-*.md` §1.3 | 16 个码，文案照抄 |

### 1.4 拟改动模块与文件

根前缀：`B=backend/jeecg-boot`，`M=B/jeecg-boot-module/jeecg-module-paycenter`，`J=M/src/main/java/org/jeecg/modules/paycenter`，`T=M/src/test/java/org/jeecg/modules/paycenter`，`S=B/jeecg-module-system/jeecg-system-start`。

| 文件/模块 | 变更类型 | 说明 |
|-----------|----------|------|
| `M/pom.xml` | 新增 | 模块 pom |
| `B/jeecg-boot-module/pom.xml` | 修改 | `<modules>` 追加 |
| `S/pom.xml` | 修改 | 依赖 paycenter |
| `S/src/main/resources/application-dev.yml` | 修改 | datasource/redis 环境变量化；`paycenter:` 配置节；excludeUrls |
| `S/src/main/resources/logback-spring.xml` | 修改 | pattern 增 `[%X{traceId}]` |
| `S/src/main/resources/flyway/sql/mysql/V20261020_2__paycenter_init_data.sql` | 新增 | 字典/菜单/按钮/角色/协议 |
| `scripts/paycenter/run-local.ps1` | 新增 | 注入 env 并启动 |
| `J/config/PayCenterProperties.java`、`J/config/PayCenterConfig.java` | 新增 | 配置绑定 |
| `J/entity/*.java`（14） | 新增 | 实体 |
| `J/mapper/*.java`（14） | 新增 | Mapper |
| `J/service/I*Service.java`、`J/service/impl/*ServiceImpl.java`（各 14） | 新增 | Service |
| `J/common/error/PayErrorCode.java`、`PayException.java`、`J/common/api/PayApiResponse.java`、`J/openapi/PayOpenApiExceptionHandler.java`、`J/openapi/PayPingController.java` | 新增 | 错误码/响应/对内异常处理/ping |
| `J/common/crypto/PayCryptoService.java`、`PayMaskUtil.java` | 新增 | 加解密/脱敏 |
| `J/common/trace/PayTraceFilter.java`、`PayTraceUtil.java`、`PayTraceConfig.java` | 新增 | TraceId |
| `J/common/redis/PayRedisKeys.java`、`PayRedisLock.java`、`PayRateLimiter.java`、`PayNonceStore.java`、`PayReplayGuard.java` | 新增 | Redis 组件 |
| `J/common/no/PayNoGenerator.java`、`PayWorkerIdAllocator.java` | 新增 | 单号 |
| `M/src/main/resources/paycenter/lua/*.lua` | 新增 | unlock / sliding_window |
| `T/**`（11 个测试类 + `support/TestRedis.java`、`support/TestDb.java`） | 新增 | 单测/集成测 |

### 1.5 风险与未决项

1. **`fee_bearer` 编码**为提议值 PROPERTY / SHOUZHU / CONTRACT（文档仅中文选项）。若需改，只改 V20261020_2 中 3 行。
2. **协议 `content_url`** 为占位 `https://TODO-legal.example/agreements/{code}/v1.0`（用户已确认）：14 文档 §86/§97 规定全文 URL 化托管、文本由法务提供；到手后在 S5 协议管理页替换。
3. **银联单号规则已确认**：来源编号 4 位 + 17 位时间 + 7 位序号 = 28 位，支付与退款同规则；`pay_order_no`（P 号，给业务系统）与 `unionpay_order_id`（mchntOrderId，给银联）分开、一一对应；来源编号测试/生产相同，经 `PAY_UNIONPAY_MSG_SRC_ID` 注入，值不进仓库与聊天。
4. **Flyway 会补跑 `V3.9.5_1`**（当前库最高 3.9.5.0），属 Jeecg 自带脚本；E2E Task 一并核对 success=1。
5. **集成测试依赖本地 Docker**（3307/6379）；Redis/DB 不可达时测试必须失败而非跳过（避免“假绿”）。
6. **Maven 首次构建**需下载依赖，基线构建（`.apt/mvn-baseline.log`）完成前 T1 Verify 可能较慢。
7. **`/v1/**` 不在 S1 放行**（用户已确认）：S1 只放行 `/v1/ping`、`/notify/unionpay/**`；S3 必须在同一 Task 内完成「放行 `/v1/**` + 默认拒绝的 token/签名/防重放拦截器（仅 `@PayOpenApiPublic` 豁免）+ 遍历全部 `/v1` 接口未带 token 必须返回 1003 的测试」（S3 spec must 项）。
8. 回填 spec：无（寻址与 spec 一致；已按 schema 修正字典取值与实体继承策略）。

### 1.6 需求锁定对照

| Rn | 优先级 | 覆盖 Task | 备注 |
|----|--------|-----------|------|
| R1 | must | T1, T20 | |
| R2 | must | T2, T3, T20 | |
| R3 | must | T4, T5, T6, T7, T8, T9 | |
| R4 | must | T11 | |
| R5 | must | T12, T20 | |
| R6 | must | T13 | |
| R7 | must | T14 | |
| R8 | must | T15 | |
| R9 | must | T16 | |
| R10 | must | T10 | |
| R11 | must | T17, T18, T20 | |
| R12 | must | T2, T19, T20 | |
| R13 | must | T20 | |

must 覆盖检查：13/13 全覆盖。

---

## Part 2 — 可执行任务清单

> 每步 2–5 分钟粒度；`/implement-plan` 按 Task 派发子 Agent 串行执行。所有 mvn 命令在 `backend/jeecg-boot` 下执行，统一前缀 `mvn -q -o`（离线优先；首次失败可去掉 `-o`）。
> 集成测试（Redis/MySQL）需先在同一 PowerShell 会话执行 `. scripts/paycenter/run-local.ps1 -EnvOnly` 注入环境变量（T3 产出）。

### Task 1: 新建 `jeecg-module-paycenter` 模块并接入构建（R1）
- [ ] 以 demo pom 为模板创建 `M/pom.xml`：parent `org.jeecgframework.boot3:jeecg-boot-module:3.9.5`，artifactId `jeecg-module-paycenter`，依赖 `jeecg-boot-base-core`；test 依赖 `org.springframework.boot:spring-boot-starter-test`（scope test，版本由父 BOM 管理）；`<build><resources>` 包含 `src/main/resources/**`（含 `paycenter/lua/*.lua`）
  - **MCP:** `query_arch` path=`backend/jeecg-boot/jeecg-module-demo`（模块概览）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/pom.xml`
- [ ] `B/jeecg-boot-module/pom.xml` `<modules>` 追加 `<module>jeecg-module-paycenter</module>`；`S/pom.xml` 在 `jeecg-module-demo` 依赖后追加 `jeecg-module-paycenter`（`${jeecgboot.version}` 或与 demo 依赖相同写法）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/pom.xml`, `backend/jeecg-boot/jeecg-module-system/jeecg-system-start/pom.xml`
- [ ] 创建包占位 `J/package-info.java`（javadoc：支付中心模块根包）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/package-info.java`
  - **Verify:** `mvn -q -DskipTests -pl jeecg-module-system/jeecg-system-start -am install` 退出码 0；`mvn -q -pl jeecg-module-system/jeecg-system-start dependency:tree -Dincludes=org.jeecgframework.boot3:jeecg-module-paycenter` 输出含 `jeecg-module-paycenter`（R1）

### Task 2: 配置环境变量化 + `paycenter` 配置节 + Shiro 白名单（R2, R12）
- [ ] `application-dev.yml` datasource master：url 改 `jdbc:mysql://${PAY_DB_HOST:127.0.0.1}:${PAY_DB_PORT:3307}/${PAY_DB_NAME:jeecg-boot}?<原参数不变>`，`username: ${PAY_DB_USER:root}`，`password: ${PAY_DB_PASSWORD:}`
  - **Files:** `backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/application-dev.yml`
- [ ] 同文件 redis 段：`host: ${PAY_REDIS_HOST:127.0.0.1}`、`port: ${PAY_REDIS_PORT:6379}`、`password: ${PAY_REDIS_PASSWORD:}`；redisson 段 `address: ${PAY_REDIS_HOST:127.0.0.1}:${PAY_REDIS_PORT:6379}`
  - **Files:** 同上
- [ ] 同文件 `jeecg.shiro.excludeUrls` 末尾追加 `,/v1/ping,/notify/unionpay/**`（**禁止**放行 `/v1/**`：S3 在同一 Task 内放行 `/v1/**` + 默认拒绝的鉴权拦截器 + 防漏网测试）
  - **MCP:** `query_arch` path=`backend/jeecg-boot/util` anchor=`shiroconfig`
  - **Files:** 同上
- [ ] 同文件末尾新增配置节：
  ```yaml
  paycenter:
    master-key: ${PAY_MASTER_KEY:}
    master-key-version: ${PAY_MASTER_KEY_VERSION:1}
    require-master-key: false
    nonce-ttl-seconds: 300
    timestamp-skew-seconds: 300
    unionpay-tps: 5
    merchant-inbound-tps: 50
    worker-id: ${PAY_WORKER_ID:}
    unionpay-msg-src-id: ${PAY_UNIONPAY_MSG_SRC_ID:}
  ```
  （来源编号测试/生产相同，只经环境变量注入；为空时生成银联单号抛 `IllegalStateException`）
  - **Files:** 同上
- [ ] 新增 `PayCenterProperties`（`@ConfigurationProperties(prefix="paycenter")`，字段同上，`masterKey` 的 `toString` 输出 `***`）与 `PayCenterConfig`（`@Configuration @EnableConfigurationProperties(PayCenterProperties.class)`）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/config/PayCenterProperties.java`, `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/config/PayCenterConfig.java`
  - **Verify:** `rg -n "password: root|password: 123456" backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/application-dev.yml` 中 datasource 段无命中（R2）；`rg -n "/v1/ping,/notify/unionpay/\*\*" application-dev.yml` 命中 1 行且 `rg -n "/v1/\*\*" application-dev.yml` 无命中（R12）；`mvn -q -DskipTests -pl jeecg-boot-module/jeecg-module-paycenter -am compile` 退出码 0

### Task 3: 本地启动脚本 `run-local.ps1`（R2）
- [ ] 创建脚本：参数 `-EnvOnly`（仅注入 env，供测试）与默认（注入后 `java -jar` 启动 start jar，`--spring.profiles.active=dev`）。逻辑：
  1. 读取 `.apt/local/paycenter-db.env`（`KEY=VALUE` 行），设置 `$env:PAY_DB_PASSWORD = MYSQL_ROOT_PASSWORD`，`PAY_DB_PORT=3307`，`PAY_DB_USER=root`；
  2. 若 `.apt/local/paycenter-app.env` 存在则逐行注入（`PAY_MASTER_KEY`、`PAY_UNIONPAY_MSG_SRC_ID` 等；来源编号由用户自行填入该文件）；不存在则生成一个随机 32 字节 Base64 主密钥写入该文件（仅本地，`.apt/local/` 已 gitignore），再注入；
  3. 只打印「已注入 N 个变量：名字列表（无值）」；任何分支禁止 `Write-Host` 变量值
  - **Files:** `scripts/paycenter/run-local.ps1`
- [ ] 核对 `.gitignore` 含 `.apt/local/`
  - **Files:** `.gitignore`（仅在缺失时修改）
  - **Verify:** `powershell -NoProfile -Command ". ./scripts/paycenter/run-local.ps1 -EnvOnly; 'len=' + $env:PAY_DB_PASSWORD.Length + ' mk=' + ([Convert]::FromBase64String($env:PAY_MASTER_KEY).Length)"` 输出 `len=32 mk=32` 且无任何明文值；`git check-ignore .apt/local/paycenter-app.env` 有输出（R2）

### Task 4: 实体 A — 配置类 4 表（R3）
- [ ] 按 DDL L5–90 逐列建实体，包 `org.jeecg.modules.paycenter.entity`：`PayMerchant`、`PayMerchantProject`、`PayApp`、`PayChannelConfig`。规则：
  - `@Data @EqualsAndHashCode(callSuper=true) @Accessors(chain=true) @TableName("<表>")`，`extends JeecgEntity`
  - 列名 snake_case ↔ 字段 camelCase（依赖 MP 默认驼峰映射，不写多余 `@TableField`）
  - `TINYINT(1)`→`Integer`；`INT`→`Integer`；`BIGINT`→`Long`（金额/限额单位分）；`DATETIME`→`java.util.Date`（`@JsonFormat(timezone="GMT+8", pattern="yyyy-MM-dd HH:mm:ss")`）；`VARCHAR/TEXT`→`String`
  - `PayMerchant`、`PayApp`、`PayChannelConfig` 的 `delFlag` 加 `@TableLogic`；`PayMerchantProject` 物理删除，无 delFlag
  - `*_enc` 字段加 `@JsonIgnore`（禁止序列化外泄）
  - **MCP:** `query_arch` path=`backend/jeecg-boot/util` anchor=`jeecgentity`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/entity/PayMerchant.java`, `.../entity/PayMerchantProject.java`, `.../entity/PayApp.java`, `.../entity/PayChannelConfig.java`
  - **Verify:** `mvn -q -DskipTests -pl jeecg-boot-module/jeecg-module-paycenter compile` 退出码 0（一致性由 T8 判定，R3）

### Task 5: 实体 B — 交易类 4 表（R3）
- [ ] 按 DDL L92–222 建 `PayOrder`、`PayOrderItem`、`PayRefundOrder`、`PayTxnFlow`：
  - `PayOrder`、`PayRefundOrder` `extends JeecgEntity`，`version` 字段加 `@Version`
  - `PayOrderItem`（仅 create_time）、`PayTxnFlow`（create_by/create_time）**不继承** JeecgEntity：`implements Serializable`，自声明 `@TableId(type = IdType.ASSIGN_ID) private String id;` 及 DDL 实有审计列
  - 类型映射规则同 T4；JSON/TEXT 列为 `String`
  - **MCP:** `query_arch` path=`backend/jeecg-boot/util` anchor=`mybatisplussaasconfig`（确认乐观锁拦截器已注册）
  - **Files:** `.../entity/PayOrder.java`, `.../entity/PayOrderItem.java`, `.../entity/PayRefundOrder.java`, `.../entity/PayTxnFlow.java`（前缀同 T4）
  - **Verify:** `mvn -q -DskipTests -pl jeecg-boot-module/jeecg-module-paycenter compile` 退出码 0（R3）

### Task 6: 实体 C — 通知/回调/协议/日志 6 表（R3）
- [ ] 按 DDL L224–347 建 `PayNotifyRecord`、`PayCallbackTask`、`PayAgreementVersion`、`PayAgreementConsent`、`PayAgreementEventLog`、`PayAdminLog`：
  - `PayCallbackTask`（`@Version version`）、`PayAgreementVersion`（`@TableLogic delFlag`；`version` 为 VARCHAR 版本号，**不得**加 `@Version`）`extends JeecgEntity`
  - 其余 4 张只增表不继承 JeecgEntity，规则同 T5；`PayAgreementConsent`/`PayAgreementEventLog` 的 `version` 为 `String`
  - **Files:** `.../entity/PayNotifyRecord.java`, `.../entity/PayCallbackTask.java`, `.../entity/PayAgreementVersion.java`, `.../entity/PayAgreementConsent.java`, `.../entity/PayAgreementEventLog.java`, `.../entity/PayAdminLog.java`
  - **Verify:** `mvn -q -DskipTests -pl jeecg-boot-module/jeecg-module-paycenter compile` 退出码 0（R3）

### Task 7: 14 个 Mapper + Service（R3）
- [ ] `mapper/<Entity>Mapper extends BaseMapper<Entity>`（`@Mapper` 不需要，依赖全局 `@MapperScan("org.jeecg.**.mapper*")`）
  - **MCP:** `query_arch` path=`backend/jeecg-boot/util` anchor=`jeecgservice`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/mapper/*.java`（14）
- [ ] `service/I<Entity>Service extends JeecgService<Entity>`；`service/impl/<Entity>ServiceImpl extends ServiceImpl<Mapper, Entity> implements I<Entity>Service`，`@Service`
  - **Files:** `.../service/*.java`（14）, `.../service/impl/*.java`（14）
  - **Verify:** `mvn -q -DskipTests -pl jeecg-boot-module/jeecg-module-paycenter compile` 退出码 0；`(Get-ChildItem <J>/mapper/*.java).Count` = 14 且 `service/impl` = 14（R3）

### Task 8: 实体 ↔ DDL 一致性测试（R3）
- [ ] `PayEntityDdlConsistencyTest`（纯单测，无外部依赖）：
  1. 读取 `../../jeecg-module-system/jeecg-system-start/src/main/resources/flyway/sql/mysql/V20261020_1__paycenter_init_tables.sql`（相对模块目录，用 `Path.of(System.getProperty("user.dir"))` 解析）；
  2. 正则解析每个 `CREATE TABLE IF NOT EXISTS \`(\w+)\`` 块内以反引号开头的列名集合；
  3. 对 14 个实体用 MP `TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), Entity.class)` 取 `keyColumn` + `fieldList.column` 集合；
  4. 断言：表名集合 = 14 个且一一对应；每表列集合**完全相等**（失败信息列出多/少的列）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/entity/PayEntityDdlConsistencyTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayEntityDdlConsistencyTest` 通过，14 表列集合完全相等（R3）

### Task 9: Mapper 冒烟集成测试（真实 MySQL 3307）（R3）
- [ ] `support/TestDb`：从环境变量 `PAY_DB_*` 构建 `org.apache.ibatis.datasource.pooled.PooledDataSource`（`com.mysql.cj.jdbc.Driver`），`MybatisSqlSessionFactoryBuilder` + `MybatisConfiguration`（`mapUnderscoreToCamelCase=true`，注册 `MybatisPlusInterceptor` 含 `OptimisticLockerInnerInterceptor`），`addMapper` 注册 14 个 Mapper；环境变量缺失时 `fail("请先 . scripts/paycenter/run-local.ps1 -EnvOnly")`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/support/TestDb.java`
- [ ] `PayMapperSmokeTest`：对 14 个 Mapper 各执行 insert（必填字段填测试值，id 用 `IdWorker.getIdStr()`，唯一键带 `UT-` + 随机后缀）→ selectById 断言非空 → deleteById（逻辑删表随后补 `DELETE` 原生 SQL 清理）；`PayOrder` 额外测：`updateById` 两次以同一旧 version 更新，第二次影响行数 0（乐观锁生效）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/mapper/PayMapperSmokeTest.java`
  - **Verify:** `. scripts/paycenter/run-local.ps1 -EnvOnly; mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayMapperSmokeTest` 通过；之后 `docker exec paycenter-mysql sh /tmp/m.sh -N -D jeecg-boot -e "select count(*) from pay_order where pay_order_no like 'UT-%'"` 输出 `0`（R3）

### Task 10: 错误码、异常、对内响应与异常处理（R10）
- [ ] `PayErrorCode` 枚举（`code`、`message`），逐条照抄 `paycenter/02` §1.3：`SUCCESS("0000")`、`PARAM_INVALID("1001")`、`AUTH_FAILED("1002")`、`TOKEN_INVALID("1003")`、`MERCHANT_DISABLED("2001")`、`PAY_METHOD_DISABLED("2002")`、`BIZ_ORDER_EXISTS("2003")`、`BILL_IN_PROGRESS("2004")`、`LIMIT_EXCEEDED("2005")`、`PAY_ORDER_NOT_FOUND("3001")`、`PAY_ORDER_STATUS_INVALID("3002")`、`REFUND_INVALID("3003")`、`REFUND_NOT_ALLOWED("3004")`、`AGREEMENT_NOT_CONFIRMED("4001")`、`CHANNEL_ERROR("5001")`、`SYSTEM_BUSY("9999")`；`message` 用文档原文（UTF-8 读文档后复制）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/common/error/PayErrorCode.java`
- [ ] `PayException extends RuntimeException`（`errorCode`、`detail`，可带 `data` 用于 2003 幂等返回原单）；`PayApiResponse<T>`（`code`、`message`、`data`，静态 `ok(data)`、`fail(PayErrorCode)`、`fail(PayException)`）
  - **Files:** `.../common/error/PayException.java`, `.../common/api/PayApiResponse.java`
- [ ] `PayOpenApiExceptionHandler`：`@RestControllerAdvice(basePackages="org.jeecg.modules.paycenter.openapi") @Order(Ordered.HIGHEST_PRECEDENCE)`；`PayException`→对应码；`MethodArgumentNotValidException`/`HttpMessageNotReadableException`/`ConstraintViolationException`→1001；其他 `Exception`→9999（`log.error` 带 traceId，body 不含堆栈与异常信息）；HTTP 状态统一 200
  - **MCP:** `query_arch` path=`backend/jeecg-boot/util` anchor=`jeecgbootexceptionhandler`
  - **Files:** `.../openapi/PayOpenApiExceptionHandler.java`
- [ ] 测试：`PayErrorCodeTest` 断言 16 个码与顺序、码唯一；`PayOpenApiExceptionHandlerTest`（`MockMvcBuilders.standaloneSetup(测试 controller).setControllerAdvice(handler)`，测试 controller 放 test 包 `org.jeecg.modules.paycenter.openapi`）覆盖 PayException(3004)→`code=3004`、RuntimeException→`code=9999` 且 body 不含 "Exception"/"at org."
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/common/error/PayErrorCodeTest.java`, `.../src/test/java/org/jeecg/modules/paycenter/openapi/PayOpenApiExceptionHandlerTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest="PayErrorCodeTest,PayOpenApiExceptionHandlerTest"` 通过：16 个码与文档一致；未知异常→9999 且无堆栈（R10）

### Task 11: `PayCryptoService` AES-256-GCM + 多版本 key + 脱敏（R4）
- [ ] 实现 `PayCryptoService`（`@Component`，构造注入 `PayCenterProperties` + `Environment`）：
  - `encrypt(String plain)` → `v{ver}:` + Base64(iv12 ‖ cipher ‖ tag16)，`SecureRandom` IV，`Cipher.getInstance("AES/GCM/NoPadding")`，`GCMParameterSpec(128, iv)`
  - `decrypt(String enc)`：解析版本号 → 当前版本用 `paycenter.master-key`，旧版本读 `PAY_MASTER_KEY_V{n}` 环境变量；Base64 解码长度≠32 或缺失 → `IllegalStateException("PAY_MASTER_KEY 未配置或长度不是 32 字节")`（消息不含 key）
  - `currentKeyVersion()`；`@PostConstruct`：`require-master-key=true` 且 key 无效 → 抛异常阻止启动；否则仅 `log.warn`（不打印 key）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/common/crypto/PayCryptoService.java`
- [ ] `PayMaskUtil.mask(String)`：长度 ≤7 → 全 `*`；否则保留前 3 后 4，中间 `****`；`null`→`null`
  - **Files:** `.../common/crypto/PayMaskUtil.java`
- [ ] `PayCryptoServiceTest`：往返一致；同明文两次密文不同；篡改密文任意 1 字节 → `AEADBadTagException`（包装异常亦可，断言根因）；错 key 解密失败；缺 key → `IllegalStateException` 且 message 不含 key；v1 加密后切到 v2 为当前版本、`PAY_MASTER_KEY_V1` 提供旧 key 仍能解密（用可注入的 `Function<Integer,String>` key 解析器避免改真实 env）；`PayMaskUtil` 边界
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/common/crypto/PayCryptoServiceTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayCryptoServiceTest` 通过：往返、篡改失败、错 key 失败、缺 key 明确异常、旧版本 key 可解密（R4）

### Task 12: TraceId 全链路（R5）
- [ ] `PayTraceFilter extends OncePerRequestFilter`，`@Component @Order(Ordered.HIGHEST_PRECEDENCE)`：取 `X-Trace-Id`（校验 `^[A-Za-z0-9-]{1,64}$`，不合法则重新生成）否则 `UUID` 去横线；`MDC.put("traceId")`；`response.setHeader("X-Trace-Id")`；`finally MDC.remove`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/common/trace/PayTraceFilter.java`
- [ ] `PayTraceUtil`：`current()`、`wrap(Runnable)`、`wrap(Callable)`（捕获调用线程 MDC 副本，执行后恢复）；`PayTraceConfig` 暴露 `TaskDecorator payTraceTaskDecorator`（Bean 名固定，S4 线程池使用）
  - **Files:** `.../common/trace/PayTraceUtil.java`, `.../common/trace/PayTraceConfig.java`
- [ ] logback 两处 pattern（L12 控制台、L27 文件）在 `[%thread]` 后插入 ` [%X{traceId}]`
  - **Files:** `backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/logback-spring.xml`
- [ ] `PayTraceFilterTest`（`MockHttpServletRequest`/`MockFilterChain`）：带头 `t-123` → 链内 `MDC.get("traceId")=="t-123"`、响应头回写、结束后 MDC 清空；无头 → 生成 32 位；非法头 `a b<` → 重新生成；`PayTraceUtil.wrap` 在新线程中取到原 traceId
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/common/trace/PayTraceFilterTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayTraceFilterTest` 通过；`rg -c "%X\{traceId\}" logback-spring.xml` = 2（R5 单测部分，E2E 部分见 T20）

### Task 13: Redis 键规范 + 分布式锁（R6）
- [ ] `PayRedisKeys`：常量前缀 `paycenter:`，方法 `lock(String)`、`rate(String)`、`nonce(String scope, String nonce)`、`workerSeq()`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/common/redis/PayRedisKeys.java`
- [ ] `paycenter/lua/unlock.lua`：`if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/resources/paycenter/lua/unlock.lua`
- [ ] `PayRedisLock`（`@Component`，`StringRedisTemplate`）：`Optional<String> tryLock(String key, Duration ttl, Duration wait)`（`setIfAbsent(key, token, ttl)`，等待期内 50ms 退避重试）、`boolean unlock(String key, String token)`（`DefaultRedisScript<Long>` 执行 unlock.lua）、`<T> T executeWithLock(String key, Duration ttl, Duration wait, Supplier<T>)`（拿不到锁抛 `PayException(SYSTEM_BUSY)`，finally 解锁）
  - **Files:** `.../common/redis/PayRedisLock.java`
- [ ] `support/TestRedis`：从 `PAY_REDIS_HOST/PORT/PASSWORD`（默认 127.0.0.1:6379）建 `LettuceConnectionFactory` + `StringRedisTemplate`，`afterPropertiesSet()`，连接失败直接 `fail`（禁止跳过）
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/support/TestRedis.java`
- [ ] `PayRedisLockTest`：互斥（A 持有时 B `tryLock` 返回空）；错误 token `unlock` 返回 false 且 key 仍在；ttl=300ms 后 B 能获得；`executeWithLock` 并发 8 线程累加计数器结果正确（无丢失）
  - **Files:** `.../src/test/java/org/jeecg/modules/paycenter/common/redis/PayRedisLockTest.java`
  - **Verify:** `. scripts/paycenter/run-local.ps1 -EnvOnly; mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayRedisLockTest` 通过：互斥、token 不匹配不可解锁、过期自动释放（R6）

### Task 14: 滑动窗口限流（R7）
- [ ] `paycenter/lua/sliding_window.lua`：参数 KEYS[1]、ARGV[now_ms, window_ms, limit, member]；`ZREMRANGEBYSCORE key 0 now-window`；`ZCARD < limit` 则 `ZADD now member` + `PEXPIRE key window` 返回 1，否则返回 0
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/resources/paycenter/lua/sliding_window.lua`
- [ ] `PayRateLimiter`（`@Component`）：`boolean tryAcquire(String key, int limit, Duration window)`（member=`now-UUID`，时间取 Redis `TIME` 避免多实例时钟偏差）；便捷方法 `tryAcquireUnionPay()`（`unionpay:global`，limit=`paycenter.unionpay-tps`，1s）、`tryAcquireMerchant(String merchantCode)`（limit=`merchant-inbound-tps`，1s）
  - **Files:** `.../common/redis/PayRateLimiter.java`
- [ ] `PayRateLimiterTest`：limit=5/1s 连续 6 次 → 前 5 true、第 6 false；等待 1.1s 后恢复 true；两个不同 key 互不影响；并发 20 线程同一 key 恰好 5 次成功
  - **Files:** `.../src/test/java/org/jeecg/modules/paycenter/common/redis/PayRateLimiterTest.java`
  - **Verify:** `. scripts/paycenter/run-local.ps1 -EnvOnly; mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayRateLimiterTest` 通过：窗口内第 6 次被拒、窗口后恢复（R7）

### Task 15: 防重放 nonce + 时间窗（R8）
- [ ] `PayNonceStore`（`@Component`）：`boolean checkAndSave(String scope, String nonce, Duration ttl)` = `setIfAbsent(PayRedisKeys.nonce(scope,nonce), "1", ttl)`；nonce 校验 `^[A-Za-z0-9-]{8,64}$`，不合法返回 false
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/common/redis/PayNonceStore.java`
- [ ] `PayReplayGuard`（`@Component`）：`void verify(String scope, long timestampMillis, String nonce)`：`|now - ts| > timestamp-skew-seconds` → `PayException(AUTH_FAILED, "timestamp expired")`；`checkAndSave` false → `PayException(AUTH_FAILED, "nonce replayed")`；ttl=`nonce-ttl-seconds`
  - **Files:** `.../common/redis/PayReplayGuard.java`
- [ ] `PayReplayGuardTest`：正常通过；同 nonce 第二次 → 1002；ts 偏 6 分钟 → 1002；不同 scope 同 nonce 互不影响；非法 nonce → 1002
  - **Files:** `.../src/test/java/org/jeecg/modules/paycenter/common/redis/PayReplayGuardTest.java`
  - **Verify:** `. scripts/paycenter/run-local.ps1 -EnvOnly; mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayReplayGuardTest` 通过：重复 nonce→1002、超时窗→1002、正常通过（R8）

### Task 16: 多实例安全的业务单号生成（R9）
- [ ] `PayWorkerIdAllocator`（`@Component`）：`paycenter.worker-id` 有值（0–1023）直接用；否则 `INCR paycenter:worker-seq` 对 1024 取模；`@PostConstruct` 中 `IdWorker.initSequence(workerId>>5, workerId&31)` 并 `log.info("paycenter workerId={}")`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/common/no/PayWorkerIdAllocator.java`
- [ ] `PayNoGenerator`（`@Component`，依赖 Allocator 确保初始化顺序）：`payOrderNo()`/`refundOrderNo()`/`flowNo()`/`callbackTaskNo()` = 前缀 `P/R/F/C` + `yyyyMMddHHmmss`（Asia/Shanghai）+ `IdWorker.getId()` 低 13 位十进制补零（总长 28 ≤ 32）；`unionpayMchntOrderId()` 与 `unionpayRefundOrderId()`（04 文档 §83，退款同规则）= 来源编号（`paycenter.unionpay-msg-src-id`，校验 4 位数字/字母，缺失抛 `IllegalStateException`）+ `yyyyMMddHHmmssSSS`（17 位，Asia/Shanghai）+ 7 位序号（取 `IdWorker.getId()` 末 7 位十进制补零，雪花保证多实例不撞号，DB 唯一索引兜底）= 28 位；内部方法 `unionpayNo(String msgSrcId)` 供单测直接传参
  - **Files:** `.../common/no/PayNoGenerator.java`
- [ ] `PayNoGeneratorTest`（纯单测，直接 new，固定 workerId）：16 线程共 10 万个 `payOrderNo` 放入 `ConcurrentHashMap.newKeySet()` 无重复；各前缀正确、长度 ≤32、仅含 `[A-Z0-9]`；`unionpayNo("3194")` 16 线程 10 万次无重复、长度恰为 28、以 `3194` 开头、第 5–21 位可按 `yyyyMMddHHmmssSSS` 解析；msgSrcId 非 4 位抛 `IllegalArgumentException`；未配置来源编号时 `unionpayMchntOrderId()` 抛 `IllegalStateException`
  - **Files:** `.../src/test/java/org/jeecg/modules/paycenter/common/no/PayNoGeneratorTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayNoGeneratorTest` 通过：16 线程 10 万次无重复、长度≤32、前缀正确（R9）

### Task 17: 初始化数据 — 12 个字典（R11）
- [ ] 新建 `V20261020_2__paycenter_init_data.sql`，第一段：12 个 `sys_dict`（固定 id `pc_dict_<code>`，`type=0`，`tenant_id=0`，`del_flag=0`，`create_by='admin'`，`create_time=NOW()`）+ `sys_dict_item`（固定 id `pc_di_<code>_<value>`，截断到 32 字符以内，`status=1`，`sort_order` 递增）；全部 `INSERT ... ON DUPLICATE KEY UPDATE item_text=VALUES(item_text)` 幂等。取值：
  - pay_method：WECHAT 微信 / ALIPAY 支付宝 / UNIONPAY_CARD 银联卡
  - pay_order_status：WAIT_PAY 待支付 / PAID 已支付 / REFUNDING 退款中 / REFUNDED 已退款 / CLOSED 已关闭
  - refund_order_status：REFUNDING 退款中 / REFUND_SUCCESS 退款成功 / REFUND_FAIL 退款失败
  - card_attr：DEBIT_CARD 借记卡 / CREDIT_CARD 贷记卡
  - bill_type：PROPERTY_FEE 物业费 / PARKING_MONTHLY 停车月卡
  - fee_bearer：PROPERTY 分账优先扣（物业承担）/ SHOUZHU 首筑承担 / CONTRACT 按商户约定
  - agreement_code：USER_SERVICE 用户服务协议 / PRIVACY 隐私政策 / PAY_SERVICE 支付服务协议 / FEE_NOTICE 收费说明 / REFUND_RULE 退款规则
  - agreement_source：LOGIN 登录 / PAY_APP 支付应用 / BILL_PAGE 账单页 / REFUND 退款
  - pay_admin_log_action：LOGIN 登录 / MCH_ADD 新增商户 / MCH_EDIT 编辑商户 / MCH_TOGGLE 启停商户 / SWITCH_CHANGE 支付方式开关 / LIMIT_CHANGE 限额调整 / REFUND_CREATE 发起退款 / REFUND_RETRY 退款重试 / AGREEMENT_CONFIG 协议配置
  - callback_event：PAY_SUCCESS 支付成功 / PAY_CLOSED 支付关闭 / REFUND_SUCCESS 退款成功 / REFUND_FAIL 退款失败
  - callback_task_status：PENDING 待推送 / SUCCESS 成功 / FAILED 失败
  - notify_process_status：PROCESSED 已处理 / IGNORED 已忽略 / ERROR 异常
  - **MCP:** `query_arch` path=`backend/jeecg-boot/jeecg-module-system`（sys_dict / sys_dict_item 实体）
  - **Files:** `backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/flyway/sql/mysql/V20261020_2__paycenter_init_data.sql`
  - **Verify:** 在容器内用 imp 脚本对一个临时库演练：`docker exec paycenter-mysql sh /tmp/m.sh -e "create database if not exists pc_dryrun"` → 复制 `sys_dict`/`sys_dict_item` 表结构（`create table pc_dryrun.sys_dict like \`jeecg-boot\`.sys_dict` 等）→ `docker cp` 脚本后执行两次无报错 → `select count(*) from pc_dryrun.sys_dict where id like 'pc_dict_%'` = 12、item 总数 = 46 → `drop database pc_dryrun`；`rg -c "#\(" V20261020_2__paycenter_init_data.sql` = 0（R11）

### Task 18: 初始化数据 — 菜单/按钮/角色/协议（R11）
- [ ] 同一 SQL 文件追加第二段：
  - 一级菜单：id `pc_menu_root`，`parent_id=''`，name `支付中心`，url `/paycenter`，component `layouts/RouteView`，`menu_type=0`，`is_route=1`，`is_leaf=0`，`sort_no=1.5`，icon `ant-design:pay-circle-outlined`，`del_flag=0`，`status=1`
  - 6 个二级菜单（`menu_type=1`，`is_leaf` 有按钮则 0 否则 1，`keep_alive=0`）：`pc_menu_dashboard` 数据看板 `/paycenter/dashboard` `paycenter/dashboard/index`；`pc_menu_trades` 交易记录；`pc_menu_refunds` 退款记录；`pc_menu_merchants` 商户管理；`pc_menu_agreements` 协议管理；`pc_menu_logs` 操作日志（url/component 按 spec 4.11 表）
  - 按钮（`menu_type=2`，`perms_type=1`，`is_leaf=1`）：`paycenter:trade:detail`、`paycenter:trade:export`、`paycenter:refund:add`、`paycenter:refund:retry`、`paycenter:merchant:add`、`paycenter:merchant:edit`、`paycenter:merchant:toggle`、`paycenter:agreement:config`（id `pc_btn_<x>`）
  - 角色：`INSERT IGNORE sys_role(id='pc_role_operator', role_code='paycenter_operator', role_name='支付运营', create_by='admin', create_time=NOW())`
  - `sys_role_permission`：admin 角色（`f6817f48af4fb3af11b9e8bf182f618b`）绑定全部 15 个（1+6+8）；operator 绑定 root + 6 菜单 + trade:detail/export、refund:add/retry（11 个）；id `pc_rp_<role>_<perm>`（≤32）
  - 协议 5 条：`pay_agreement_version`（id `pc_agr_<code>_v10`，version `v1.0`，title 同字典中文名，content_url `https://TODO-legal.example/agreements/<code>/v1.0`，effective_time `2026-10-20 00:00:00`，status 1，remark `初始化占位，待法务替换 URL`，create_by `admin`）
  - 全部用 `INSERT ... ON DUPLICATE KEY UPDATE` 或 `INSERT IGNORE` 保证幂等
  - **MCP:** `query_arch` path=`backend/jeecg-boot/jeecg-module-system`（sys_permission / sys_role / sys_role_permission）
  - **Files:** `backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/flyway/sql/mysql/V20261020_2__paycenter_init_data.sql`
  - **Verify:** 同 T17 临时库演练（追加 `sys_permission`/`sys_role`/`sys_role_permission`/`pay_agreement_version` 结构 + admin 角色行），执行两次无报错；`select count(*) from pc_dryrun.sys_permission where id like 'pc_%'` = 15；`sys_role_permission` admin 15、operator 11；`pay_agreement_version` = 5；演练后删库（R11）

### Task 19: 对内接口探活 `/v1/ping`（R12）
- [ ] `PayPingController`（包 `org.jeecg.modules.paycenter.openapi`，`@RestController @RequestMapping("/v1")`）：`GET /ping` 返回 `PayApiResponse.ok(Map.of("service","paycenter","time",<epochMillis>))`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/openapi/PayPingController.java`
- [ ] `PayPingControllerTest`（standalone MockMvc）：200 且 `$.code == "0000"`
  - **Files:** `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/test/java/org/jeecg/modules/paycenter/openapi/PayPingControllerTest.java`
  - **Verify:** `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayPingControllerTest` 通过（R12 单测部分，匿名访问见 T20）

### Task 20: 全量测试 + 打包 + 端到端启动验证（R1, R2, R5, R11, R12, R13）
- [ ] 全模块测试：`. scripts/paycenter/run-local.ps1 -EnvOnly; mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test` 全绿
  - **Files:** （无新增；仅修复本 S1 范围内文件的缺陷）
- [ ] 打包：`mvn -q -o -DskipTests -pl jeecg-module-system/jeecg-system-start -am package`；`jar tf <start jar> | Select-String jeecg-module-paycenter` 命中
  - **Files:** 无
- [ ] 后台启动：`scripts/paycenter/run-local.ps1`，日志重定向到 `.apt/paycenter-run.log`（脚本内 `Start-Process` + 等待 `/jeecg-boot/v1/ping` 200，超时 180s）
  - **Files:** `scripts/paycenter/run-local.ps1`（若需补等待逻辑）
- [ ] 校验（全部须满足）：
  1. `Select-String .apt/paycenter-run.log -Pattern " ERROR "` 无与 paycenter/flyway/datasource 相关的行（R13）
  2. `docker exec paycenter-mysql sh /tmp/m.sh -N -D jeecg-boot -e "select version,success from flyway_schema_history where version in ('3.9.5.1','20261020.1','20261020.2')"` 三行 success=1（R11, R13）
  3. `curl.exe -s -i -H "X-Trace-Id: t-123" http://127.0.0.1:8080/jeecg-boot/v1/ping`：HTTP 200、响应头 `X-Trace-Id: t-123`、body `"code":"0000"`，且未带登录 token（R12, R5）；反证：`curl.exe -s http://127.0.0.1:8080/jeecg-boot/v1/not-exist` 不是匿名 200（仍被 Shiro 拦截，证明未整体放行 `/v1/**`）
  4. `Select-String .apt/paycenter-run.log -Pattern "t-123"` 至少 1 行（R5；如 ping 无日志，则在 `PayPingController` 中 `log.debug` 不够 → 用 `log.info("ping")`）
  5. SQL：`select count(*) from sys_dict where id like 'pc_dict_%'`=12；`select count(*) from sys_permission where id like 'pc_%'`=15；`select count(*) from sys_role_permission where id like 'pc_rp_%'`=26；`select count(*) from pay_agreement_version`=5（R11）
  6. 日志含 `paycenter workerId=`（R9 启动侧）
- [ ] 停止进程（按脚本记录的 PID）
  - **Verify:** 上述 6 项逐条输出并全部满足（R1, R2, R5, R11, R12, R13）

### Task 21: APT 闭环
- [ ] `audit_arch_changes` → 对 `modified`/`new` 资产 `refresh_asset`（至少：paycenter 模块 entity/mapper/service/common/openapi、application-dev.yml、logback-spring.xml、V20261020_2 SQL）
  - **MCP:** `audit_arch_changes`；`refresh_asset` sourcePath=`backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/...`
  - **Files:** 无（仅 `.ai/` 由 MCP 维护）
- [ ] 终端执行增量 `start-init`（`node C:\Users\weilt\.apt\arch-engine\dist\cli.js start-init`），使新模块进入 arch 索引与 EntityGraph
  - **Files:** 无
  - **Verify:** `search_arch` query=`PayCryptoService` 与 `PayRedisLock` 均有命中，sourcePath 指向新模块
