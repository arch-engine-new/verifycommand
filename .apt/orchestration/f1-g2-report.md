# S1 Task 4–9 Implementer 报告

**总体状态：** DONE_WITH_CONCERNS（6 个 Task 全部 Verify 通过；concerns 见末尾，均不阻断）
**仓库：** `backend`（分支 `paycenter`），BASE 为 `d548897`

| Task | 状态 | Commit | Verify 摘要 |
|------|------|--------|-------------|
| T4 配置类 4 表实体 | DONE | `007af87` | `mvn -q -o -DskipTests -pl jeecg-boot-module/jeecg-module-paycenter compile` 退出码 0 |
| T5 交易类 4 表实体 | DONE | `07cb9fe` | 同上 compile 退出码 0 |
| T6 通知/回调/协议/日志 6 表实体 | DONE | `dad21f2` | 同上 compile 退出码 0 |
| T7 14 Mapper + 14 Service + 14 ServiceImpl | DONE | `359e4d6` | compile 退出码 0；计数 mapper=14、service=14、impl=14 |
| T8 实体 ↔ DDL 一致性测试 | DONE | `29bc9a8` | `mvn -q -o -pl ... test -Dtest=PayEntityDdlConsistencyTest` 退出码 0；surefire：Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 |
| T9 Mapper 冒烟集成测试（MySQL 3307） | DONE | `405e3a3` | `. scripts/paycenter/run-local.ps1 -EnvOnly; mvn -q -o -pl ... test -Dtest=PayMapperSmokeTest` 退出码 0；surefire：Tests run: 15, Failures: 0, Errors: 0, Skipped: 0；残留查询 `pay_order ... like 'UT-%'` = 0，另查 13 张表 UT- 残留合计 = 0 |

## 实现要点

- **实体（14）**：逐列对照 DDL，类注释与字段注释取 DDL COMMENT。类型映射：`TINYINT(1)/INT→Integer`、`BIGINT→Long`、`DATETIME→Date`（`@JsonFormat(GMT+8, yyyy-MM-dd HH:mm:ss)` + `@DateTimeFormat`）、`DATE`（`settle_date`）→`Date`（pattern `yyyy-MM-dd`；plan 未显式列 DATE，按最接近规则处理）、`VARCHAR/TEXT/JSON→String`。
- **继承策略**（与 plan 一致，T8 证实无需额外调整）：
  - 继承 `JeecgEntity`：PayMerchant、PayMerchantProject、PayApp、PayChannelConfig、PayOrder、PayRefundOrder、PayCallbackTask、PayAgreementVersion（这 8 张表均含 create_by/create_time/update_by/update_time）。
  - 不继承（`implements Serializable` + `@TableId(ASSIGN_ID) id` + 自声明审计列）：PayOrderItem（create_time）、PayTxnFlow（create_by/create_time）、PayNotifyRecord（create_time）、PayAgreementConsent（create_time/update_time）、PayAgreementEventLog（create_time）、PayAdminLog（create_time）。
- `@TableLogic delFlag`：PayMerchant、PayApp、PayChannelConfig、PayAgreementVersion；PayMerchantProject 无 delFlag（物理删除）。
- `@Version`：PayOrder、PayRefundOrder、PayCallbackTask；PayAgreementVersion/Consent/EventLog 的 `version` 为 String 业务版本号，未加 `@Version`。
- `@JsonIgnore`：`PayApp.appSecretEnc`、`PayChannelConfig.appKeyEnc`、`PayChannelConfig.commKeyEnc`。
- **T8**：解析 DDL 每个 `CREATE TABLE` 块内反引号列名；实体用 `TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), cls)` 取 `keyColumn + fieldList.column`；断言 DDL 表数=14、表名集合相等、每表列集合完全相等（失败信息列出缺少/多出列）。MP 3.5.16 下无需额外配置。
- **T9**：`TestDb` 用 `PooledDataSource` + `MybatisConfiguration(mapUnderscoreToCamelCase=true)` + 显式 `GlobalConfig`（DefaultSqlInjector / DefaultIdentifierGenerator）+ `MybatisPlusInterceptor(OptimisticLockerInnerInterceptor)` + `MybatisSqlSessionFactoryBuilder`；`PAY_DB_PORT/USER/PASSWORD` 缺失即 `fail`，HOST/NAME 缺省 127.0.0.1 / jeecg-boot（run-local 未注入这两个变量）。冒烟测试 14 个 Mapper 各一个用例（insert→selectById→deleteById→selectById 为空；逻辑删表先断言行仍在再原生 DELETE；其余表断言物理删除），外加 `payOrderOptimisticLock`（同一旧 version 两次更新，第二次影响 0 行，最终 status=PAID、version=1）。`@AfterEach` 对所有插入 id 原生 DELETE 兜底，断言失败也不留残留。唯一键均为 `UT-` + 雪花 id。

## 白名单外改动

1. **`jeecg-module-paycenter/pom.xml`（T8 commit）**：新增 `<properties><skipTests>false</skipTests></properties>`。原因：根 `jeecg-boot/pom.xml` 默认 `skipTests=true` 且 surefire 读取该属性，plan 中所有 `mvn ... test -Dtest=...` Verify 命令在不改的情况下会**静默跳过测试**（假绿）。改为模块级开启后，plan 原文命令即可真实执行；T20 打包命令自带 `-DskipTests` 不受影响。任务说明已允许修改该 pom。
2. 未新增任何依赖：mysql 驱动（`mysql:mysql-connector-java:8.0.27`，runtime，经 base-core 传递，test classpath 可见）、JUnit Jupiter（经 spring-boot-starter-test）均已就绪。

## 过程记录

- 首次运行测试时本地 .m2 缺 `surefire-junit-platform:3.5.6`，按 plan「首次失败可去掉 -o」在线执行一次下载（仅该 provider 及其 pom），之后均 `-o` 离线通过。
- 首跑测试遇 `ClassFormatError: Invalid method Code length 0`：`target/classes` 中的实体类疑似被 IDE 的 Java 语言服务写入了不完整 class，Maven 增量编译认为已是最新未重编。执行一次模块级 `mvn -o -pl jeecg-boot-module/jeecg-module-paycenter clean test` 后正常。
- 乐观锁用例首跑失败（第二次更新返回 1）：原因是同一 SqlSession 一级缓存让两次 `selectById` 返回同一实例；已在两次查询间 `clearCache()` 并加 `assertNotSame` / `version==0` 断言，属测试修正，未削弱断言。
- MCP 留痕：`query_arch` path=`backend/jeecg-boot/util#jeecgentity|mybatisplussaasconfig|jeecgservice` 均返回 `Path not found`（plan 中的 arch path 已失效），改为直接读源码确认 `JeecgEntity` 字段与 `JeecgService`、MP 3.5.16 API（javap 核对 `MybatisSqlSessionFactoryBuilder.build(Configuration)`、`GlobalConfig` setter）。
- 未读取/输出任何 `.apt/local/*` 内容或密钥值；测试数据中的 `*_enc` 为 `v1:UT-not-a-real-*` 占位字符串。

## 遗留 / 需主 Agent 关注

1. **plan 中的 arch 寻址路径 `backend/jeecg-boot/util#...` 已不存在**，后续 Task（T10 `jeecgbootexceptionhandler`、T2 `shiroconfig` 等）的 MCP 留痕同样会失败，建议闭环时 `start-init` 后改用 `search_arch`。
2. 模块已默认执行测试：之后若有人在**未注入环境变量**的会话里对含 paycenter 的反应堆跑 `mvn install`（未带 `-DskipTests`），`PayMapperSmokeTest` 会按设计 fail。符合 plan「不可达时失败而非跳过」，但需团队知悉。
3. IDE 可能再次向 `target/classes` 写入残缺 class，导致 `-o` 增量测试报 `ClassFormatError`；遇到时对模块 `clean` 即可。
