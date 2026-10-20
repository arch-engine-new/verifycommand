---
feature: paycenter
slice: S1
title: 首筑支付中心 — 工程骨架与基础设施
Status: approved
risk: medium
projectType: business
---

# S1 工程骨架与基础设施 — Design Spec

## 1. 背景与目标

支付中心 v1.0 分 5 个切片交付（S1 骨架/基础设施 → S2 银联通道 → S3 交易核心与内部接口 → S4 可靠性闭环 → S5 操作后台）。
S1 是后续全部切片的地基，要求**一次做完整**：新模块可编译、可启动、连上本地 Docker MySQL(3307)/Redis(6379)，
14 张 `pay_` 表全部有实体/Mapper/Service，安全与多实例基础组件（加解密、TraceId、分布式锁、限流、防重放 nonce、单号生成、错误码）就绪且有单测，
字典 / 菜单 / 角色 / 协议初始数据通过 Flyway 落库。

**Goal:** 交付可启动的 `jeecg-module-paycenter` 模块及其全部基础设施组件与初始化数据，供 S2–S5 直接复用。

## 2. 权威输入

| 输入 | 用途 |
|------|------|
| `docs/schema/paycenter-schema.md` | 14 张表结构、字段、索引、豁免约定（SSOT） |
| `backend/.../flyway/sql/mysql/V20261020_1__paycenter_init_tables.sql` | 已执行 DDL，实体须与之一致 |
| `.ai/arch/arch-review.json` | 基础设施补齐决策（signing / secret_mgmt / rate_limit / timeout / tracing / alerting / lock / retry）与 extraRequirements |
| `paycenter/02-*.md` §1.3 | 对内错误码表（原文为准） |
| `paycenter/01-*PRD.md`、`.ai/product/pages/*.json` | 字典取值、菜单页面清单 |

## 3. 范围

### 3.1 包含
- 新 Maven 模块 `backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter`，包根 `org.jeecg.modules.paycenter`
- 本地环境配置（datasource 3307、Redis、密钥均走环境变量）
- 14 实体 + Mapper + Service（MyBatis-Plus），实体与 DDL 一致性单测
- 基础组件：`PayCryptoService`、TraceId、`PayRedisLock`、`PayRateLimiter`、`PayNonceStore`、`PayNoGenerator`、`PayErrorCode`/`PayException`/全局异常映射
- Flyway 初始化数据脚本 `V20261020_2__paycenter_init_data.sql`（字典、菜单、按钮权限、角色、协议 v1.0）
- Shiro 白名单（`/v1/**`、`/notify/unionpay/**`）
- 端到端启动验证

### 3.2 非目标（明确不做）
- 银联报文、签名、HTTP 调用（S2）
- `/v1/**` 业务接口与 token 鉴权实现（S3；S1 只放行路径 + 提供 token/nonce 基础组件）
- 定时任务、回调重试、补偿（S4）
- 前端页面（S5）

## 4. 设计要点

### 4.1 模块
- pom 参照 `jeecg-module-demo`：parent `jeecg-boot-module`，仅依赖 `jeecg-boot-base-core`；test 依赖 `spring-boot-starter-test`（JUnit5）。
- 注册到 `jeecg-boot-module/pom.xml` `<modules>`，并作为 `jeecg-system-start` 依赖。
- 扫描：复用 `@MapperScan("org.jeecg.**.mapper*")` 与 `classpath*:org/jeecg/**/xml/*Mapper.xml`，无需新增扫描配置。

### 4.2 配置（禁止明文密码入库）
- `application-dev.yml` datasource master：`url` 端口 `${PAY_DB_PORT:3307}`，`username: ${PAY_DB_USER:root}`，`password: ${PAY_DB_PASSWORD:}`。
- Redis：`${PAY_REDIS_HOST:127.0.0.1}` / `${PAY_REDIS_PORT:6379}` / `${PAY_REDIS_PASSWORD:}`。
- 新增 `paycenter:` 配置节（`PayCenterProperties`）：`master-key`=`${PAY_MASTER_KEY:}`、`master-key-version`、`nonce-ttl-seconds:300`、`timestamp-skew-seconds:300`、`unionpay-tps:5`、`merchant-inbound-tps:50`、`worker-id`=`${PAY_WORKER_ID:}`。
- 本地启动脚本 `scripts/paycenter/run-local.ps1`：从 `.apt/local/paycenter-db.env` 读取并注入环境变量，不回显任何值。

### 4.3 实体
- 四个审计列齐全的 8 张表（merchant / merchant_project / app / channel_config / order / refund_order / callback_task / agreement_version）继承 `JeecgEntity`（id `ASSIGN_ID`，审计字段由 `MybatisInterceptor` 按字段名填充）。
- 只增类 6 张表（order_item / txn_flow / notify_record / agreement_consent / agreement_event_log / admin_log）审计列不全，**不继承** `JeecgEntity`，自声明 `@TableId(type = IdType.ASSIGN_ID) String id` 与 DDL 实有的审计列。
- 配置类表（`pay_merchant`、`pay_app`、`pay_channel_config`、`pay_agreement_version`）`del_flag` 加 `@TableLogic`。
- `pay_order`、`pay_refund_order`、`pay_callback_task` 的 `version INT` 加 `@Version`（基座 `MybatisPlusSaasConfig` 已注册 `OptimisticLockerInnerInterceptor`）；协议三表的 `version` 是 VARCHAR 版本号，**禁止**加 `@Version`。
- 金额字段 `Long`（分）；时间 `Date`；JSON 列 `String`。
- 一致性单测：读取 DDL 文件解析每表列名集合，与实体 `@TableField`/驼峰映射列集合**完全相等**。

### 4.4 加解密（secret_mgmt）
- AES-256-GCM，12 字节随机 IV，128 bit tag；密文格式 `v{keyVersion}:{base64(iv|cipher|tag)}`。
- 主密钥 `PAY_MASTER_KEY`（Base64 32 字节）；缺失或长度错误时，**首次调用**抛出明确异常；`paycenter.require-master-key=true`（prod）时启动即失败。
- 支持多版本 key 解密（`PAY_MASTER_KEY_V{n}`），加密始终用当前版本。
- 提供 `mask(String)` 脱敏工具（保留前 3 后 4）。

### 4.5 TraceId（tracing）
- `PayTraceFilter`（最高优先级 Filter）：取 `X-Trace-Id`，无则生成 32 位；写 MDC `traceId`，响应头回写。
- logback 两个 pattern 增加 `[%X{traceId}]`。
- `PayTraceUtil.wrap(Runnable/Callable)` 透传 MDC 到异步线程；提供 `TaskDecorator` Bean 供 S4 线程池使用。

### 4.6 分布式锁（lock / 多实例）
- `PayRedisLock`：`SET key token NX PX ttl` 加锁，Lua 比对 token 删除；`tryLock(key, ttl, waitMs)`、`unlock`、`executeWithLock(key, ttl, Supplier)`。
- key 前缀 `paycenter:lock:`。

### 4.7 限流（rate_limit）
- `PayRateLimiter`：Redis ZSET 滑动窗口 Lua（原子），`tryAcquire(key, permits, windowMs)`。
- 预置：`unionpay:global` 5 TPS（可配）；`merchant:{code}` 入站 TPS（可配）。

### 4.8 防重放（anti-replay）
- `PayNonceStore.checkAndSave(scope, nonce, ttl)`：`SET NX EX`，重复返回 false。
- `PayReplayGuard.verify(timestampMillis, nonce, scope)`：时间偏差 > `timestamp-skew-seconds` 或 nonce 重复 → `PayException(1002)`。

### 4.9 单号生成（防重复 / 多实例）
- 基于 MyBatis-Plus `IdWorker`（雪花）生成数值部分；workerId 来自 `PAY_WORKER_ID`，缺省时由 Redis `INCR paycenter:worker-seq % 1024` 分配并在日志打印。
- `payOrderNo()`=`P`+yyyyMMddHHmmss+雪花尾段；`refundOrderNo()`=`R`…；`flowNo()`=`F`…；`notifyTaskNo()`=`C`…；长度 ≤ 32。
- `unionpayMchntOrderId()` / `unionpayRefundOrderId()` = 来源编号(4位，`PAY_UNIONPAY_MSG_SRC_ID`，测试/生产相同)+`yyyyMMddHHmmssSSS`(17位)+7 位序号 = 28 位（04 文档 §83；退款同规则）。`pay_order_no` 与 mchntOrderId 分开、一一对应（用户已确认）。
- 单测：多线程 10 万次无重复。

### 4.10 错误码与异常
- `PayErrorCode` 枚举逐条照抄 `paycenter/02` §1.3：0000、1001、1002、1003、2001、2002、2003、2004、2005、3001、3002、3003、3004、4001、5001、9999（文案以原文为准）。
- `PayException(PayErrorCode, detail)`；`PayApiResponse<T>{code,message,data}`（对内接口格式，区别于 Jeecg `Result`）。
- `PayOpenApiExceptionHandler`：`@RestControllerAdvice(basePackages="org.jeecg.modules.paycenter.openapi")` + 高优先级，仅作用于对内接口包；未知异常 → 9999 且不泄露堆栈。

### 4.11 初始化数据（`V20261020_2__paycenter_init_data.sql`，幂等 `INSERT ... ON DUPLICATE KEY UPDATE` / `WHERE NOT EXISTS`；避免出现 Flyway 占位符前缀 `#(`）
字典（dict_code → items）：

| dict_code | 名称 | items |
|-----------|------|-------|
| pay_method | 支付方式 | WECHAT 微信 / ALIPAY 支付宝 / UNIONPAY_CARD 银联卡 |
| pay_order_status | 支付单状态 | WAIT_PAY 待支付 / PAID 已支付 / REFUNDING 退款中 / REFUNDED 已退款 / CLOSED 已关闭 |
| refund_order_status | 退款单状态 | REFUNDING 退款中 / REFUND_SUCCESS 退款成功 / REFUND_FAIL 退款失败 |
| card_attr | 卡种 | DEBIT_CARD 借记卡 / CREDIT_CARD 贷记卡 |
| bill_type | 账单类型 | PROPERTY_FEE 物业费 / PARKING_MONTHLY 停车月卡 |
| fee_bearer | 手续费承担方 | PROPERTY 分账优先扣（物业承担）/ SHOUZHU 首筑承担 / CONTRACT 按商户约定 |
| agreement_code | 协议编码 | USER_SERVICE 用户服务协议 / PRIVACY 隐私政策 / PAY_SERVICE 支付服务协议 / FEE_NOTICE 收费说明 / REFUND_RULE 退款规则 |
| agreement_source | 同意来源 | LOGIN 登录 / PAY_APP 支付应用 / BILL_PAGE 账单页 / REFUND 退款 |
| pay_admin_log_action | 后台操作类型 | LOGIN / MCH_ADD / MCH_EDIT / MCH_TOGGLE / SWITCH_CHANGE / LIMIT_CHANGE / REFUND_CREATE / REFUND_RETRY / AGREEMENT_CONFIG（中文名见 plan） |
| callback_event | 回调事件 | PAY_SUCCESS / PAY_CLOSED / REFUND_SUCCESS / REFUND_FAIL |
| callback_task_status | 回调任务状态 | PENDING 待推送 / SUCCESS 成功 / FAILED 失败 |
| notify_process_status | 通知处理状态 | PROCESSED 已处理 / IGNORED 已忽略 / ERROR 异常 |

共 12 个新字典（`yn` 复用 Jeecg 内置，合计 13）。取值以 `docs/schema/paycenter-schema.md` 字段注释为准。

菜单（一级 `支付中心` `/paycenter`，`layouts/RouteView`）+ 6 个二级页面（登录页复用 Jeecg 自带）：

| 页面 | url | component | 按钮 perms |
|------|-----|-----------|-----------|
| 数据看板 | /paycenter/dashboard | paycenter/dashboard/index | — |
| 交易记录 | /paycenter/trades | paycenter/trades/index | paycenter:trade:detail, paycenter:trade:export |
| 退款记录 | /paycenter/refunds | paycenter/refunds/index | paycenter:refund:add, paycenter:refund:retry |
| 商户管理 | /paycenter/merchants | paycenter/merchants/index | paycenter:merchant:add, paycenter:merchant:edit, paycenter:merchant:toggle |
| 协议管理 | /paycenter/agreements | paycenter/agreements/index | paycenter:agreement:config |
| 操作日志 | /paycenter/logs | paycenter/logs/index | — |

> 按钮来源：`prototype/paycenter-admin/index.html` 的按钮（新增商户/编辑/启停、发起退款/重试、交易详情/导出 CSV）与 `pay_admin_log_action` 的 AGREEMENT_CONFIG。

角色：`admin`（已有）授予全部支付中心菜单与按钮；新增 `paycenter_operator`「支付运营」授予全部 6 个菜单 + `trade:detail`、`trade:export`、`refund:add`、`refund:retry`，不含商户写操作与协议配置（与原型「运营登录」看不到“新增商户”一致）。
协议：5 条 v1.0 `pay_agreement_version`，`content_url` 用占位 `https://TODO-legal.example/agreements/{code}/v1.0`，`status` 已发布（待法务提供真实 URL，列入风险）。
通道：`pay_channel_config` 的 app_id / app_key_enc / comm_key_enc / api_base_url 均 NOT NULL，S1 **不插入**，由 S2 以加密方式写入。

### 4.12 Shiro 白名单
`jeecg.shiro.excludeUrls` 仅追加 `/v1/ping,/notify/unionpay/**`。`/v1/**` 由 S3 在同一 Task 内与默认拒绝的鉴权拦截器、防漏网测试一起放行（用户已确认）。

## 5. 需求锁定表

| Rn | 需求 | 来源 | 可判定验收 | 优先级 |
|----|------|------|-----------|--------|
| R1 | 新建 `jeecg-module-paycenter` 并接入构建与启动模块 | 切片计划 | `mvn -DskipTests -pl jeecg-module-system/jeecg-system-start -am package` 成功，start jar 内含 paycenter 模块 jar | must |
| R2 | datasource→3307、Redis、密钥全部走环境变量，仓库无明文密码 | arch-review secret_mgmt | `rg -n "password: root" application-dev.yml` 无输出；`run-local.ps1` 启动成功连上 3307 | must |
| R3 | 14 实体/Mapper/Service 与 DDL 一致 | schema 文档 | `PayEntityDdlConsistencyTest` 通过（14 表列集合完全相等）；`PayMapperSmokeTest` 对每表 insert/select/delete 通过 | must |
| R4 | AES-256-GCM 加解密 + 多版本 key + 脱敏 | arch-review secret_mgmt | `PayCryptoServiceTest`：往返、篡改失败、错 key 失败、缺 key 明确异常、旧版本 key 可解密 | must |
| R5 | TraceId 全链路（请求→日志→响应头→异步） | arch-review tracing | `PayTraceFilterTest` 通过；启动后请求带 `X-Trace-Id: t-123`，响应头回写且日志行含 `t-123` | must |
| R6 | Redis 分布式锁（多实例） | arch-review lock | `PayRedisLockTest`（真实 Redis）：互斥、token 不匹配不可解锁、过期自动释放 | must |
| R7 | Redis 滑动窗口限流 | arch-review rate_limit | `PayRateLimiterTest`：窗口内第 6 次被拒、窗口后恢复 | must |
| R8 | 防重放 nonce + 时间窗 | extraRequirements anti-replay | `PayReplayGuardTest`：重复 nonce→1002、超时窗→1002、正常通过 | must |
| R9 | 多实例安全的业务单号生成 | extraRequirements anti-dup | `PayNoGeneratorTest`：16 线程 10 万次无重复、长度≤32、前缀正确 | must |
| R10 | 对内错误码 + 异常 + 响应格式 | `paycenter/02` §1.3 | `PayErrorCodeTest`：16 个码与文档一致；Handler 测试未知异常→9999 无堆栈 | must |
| R11 | 字典/菜单/按钮/角色/协议初始数据 | PRD + pages | 启动后 SQL：12 个新 dict_code 存在且 items 数符合；`/paycenter` 菜单+6 子菜单；admin 与 paycenter_operator 绑定；5 条协议；flyway 记录 success=1 | must |
| R12 | Shiro 仅放行 `/v1/ping`、`/notify/unionpay/**` | 02 文档 / S2-S3 前置 | 启动后 `GET /jeecg-boot/v1/ping` 未登录返回 200 且 body `code=0000`；其它 `/v1/*` 未登录不返回匿名 200 | must |
| R13 | 端到端启动验证 | 切片 DoD | 启动日志无 ERROR；`flyway_schema_history` 含 `20261020.1`、`20261020.2` success=1；R5/R12 请求通过 | must |

## 6. 开放项（实现时按默认执行，已在 plan 风险中列出）
- `fee_bearer` 编码 PROPERTY/SHOUZHU/CONTRACT 为提议值（文档仅有中文选项）。
- 协议 `content_url` 为占位（用户已确认），法务提供文本/链接后在 S5 协议管理页替换。
