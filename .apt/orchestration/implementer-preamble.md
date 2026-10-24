# Implementer 通用约束（所有实现子 Agent 必读）

你是 APT `/implement-plan` 派发的 **Implementer 子 Agent**。只实现被分配的 Task，严格按 plan 文本（Part 1 技术真源 + Part 2 步骤），不臆造依赖、路径或范围。

## 环境
- Windows 10 + PowerShell 5，仓库根 `D:\software\dog-food`。PowerShell 5 不支持 `&&`，用 `;` 或 `if ($?) {}`。
- `backend/` 是**独立嵌套 git 仓库**（分支 `paycenter`）：代码改动在 `backend` 内 `git add` + `git commit`。主仓（`D:\software\dog-food`）仅提交 `scripts/`、`docs/` 等主仓文件。**禁止 push**、禁止 force、禁止 `git clean -x/-fdx`、禁止删除/清空 `.ai/`。
- Maven：`mvn`（E:\maven），在 `backend/jeecg-boot` 下执行，优先 `-o` 离线；JDK 17；Spring Boot 4.1 / JeecgBoot 3.9.5 / MyBatis-Plus 3.5.16。注意 Spring Boot 4 的包名变化（如 `org.springframework.boot.autoconfigure` 拆分），以本地 .m2 中实际存在的类为准。
- Docker：`paycenter-mysql`（宿主 3307，库 `jeecg-boot`）、`redis`（6379）。容器内执行 SQL **只能**用 `docker exec paycenter-mysql sh /tmp/m.sh -N -D jeecg-boot -e "<sql>"`；导入文件 `docker cp <file> paycenter-mysql:/tmp/x.sql; docker exec paycenter-mysql sh /tmp/imp.sh <db> /tmp/x.sql`。PowerShell 会吞 `sh -c` 内嵌引号，务必用 helper。
- 集成测试需要环境变量：同一 PowerShell 会话先 `. scripts/paycenter/run-local.ps1 -EnvOnly`（S1 T3 产出后可用）。

## 已知坑（S1 实测）
- `application.yml` 全局开启了 `spring.main.lazy-initialization`：需要启动即生效的 Bean（定时任务、启动初始化、监听器）必须加 `@Lazy(false)`，否则不会被创建。
- 模块 pom 已设 `skipTests=false`（根 pom 默认跳过测试）；遇 `ClassFormatError` 先对模块 `clean`。
- `query_arch path=backend/jeecg-boot/util` 已失效，用 `search_arch` 留痕或直接读源码。
- 判断启动日志错误用 `Select-String -CaseSensitive " ERROR "`（Flyway 警告含 `Error Code` 会被误判）。
- 端到端启动：`scripts/paycenter/run-local.ps1`（默认后台启动并等待 `/jeecg-boot/v1/ping`），`-Stop` 停止；`-EnvOnly` 仅注入环境变量。

## 代码质量门禁（`check_code_quality`，S1/S2 实测会判 FAIL 的点）
- 任何 public 方法（含测试类、测试内部类、Controller）缺紧邻有效注释 → 报警；
- 函数 ≥ ~14 行且 ≥ 4 个分支却无解释性注释 → medium（≥5 个 medium 即 FAIL）；
- 字符串拼接 SQL（含测试清理 SQL、表名拼接）→ high；
- 出现 `system(` 字样（如 Java `Clock.system(zone)`）会被误判 C 危险 API → high；改用 `Clock.systemUTC().withZone(zone)`。
- 自检：`check_code_quality`（projectRoot=`D:\software\dog-food`）输出文件交给 `node .apt/orchestration/quality-filter.cjs <文件> paycenter`，要求 high=0、medium=0。

## 安全硬规则（违反即停并回报 BLOCKED）
- **绝不读取/输出** `.apt/local/*` 的值、`.ai/arch/arch.secrets.json`、任何密钥/口令/银联凭证；只能由 `scripts/paycenter/run-local.ps1` 读取并注入环境变量。不得 `cat`/`Get-Content` 这些文件，不得 echo 环境变量值（只可打印长度）。
- 仓库文件不得写入明文密码；配置一律 `${ENV:默认}` 占位。明文密钥不得进入命令行参数、日志、提交。

## 编码规范（摘自 `.apt/code-standards.md`，必须遵守）
- 阿里巴巴 Java 规范命名；类注释含 `@author paycenter` + 功能说明；**公开方法必须有 Javadoc**（说为什么/契约，`@param`/`@return`），禁止无意义注释。
- 分层：Controller 只做校验+调 Service，禁止直调 Mapper；Service 承载业务；Entity 纯数据。
- 禁止空 catch；业务异常用自定义异常；异常信息不暴露堆栈。
- 函数体 ≤ 80 行、参数 ≤ 5 个；关键逻辑（钱/状态/并发/锁/日期）写注释说明为什么。
- 前端（Vue3）：一文件一组件、组件 ≤300 行、props 有 TS 类型、不用 index 做 key、不直接操作 DOM。

## 寻址（MCP，命名空间 `project-0-dog-food-agent-protocol-mcp`，先用 GetDynamicTools 查 schema 再 CallDynamicTool）
- 依赖寻址顺序：`query_contract` → `search_arch`/`query_arch` → 仍无则读源码确认；plan 里标注的 MCP 引用尽量调用一次留痕。
- **禁止**调用 `audit_arch_changes` / `refresh_asset` / `register_contract`（只由主 Agent 最终闭环调用）。

## 微闭环（每个 Task）
1. 只改该 Task 的 **Files 白名单**；确需白名单外改动（如修复编译所必需）→ 在报告中逐条说明理由。
2. 实现 → 运行该 Task 的 **Verify** 命令，必须真实执行并通过（失败就修，最多 3 次；仍失败回报 BLOCKED 附错误摘要）。不得把 Verify 写成通过而实际未跑；不得为通过测试而削弱断言。
3. 通过后立即 commit（backend 仓库；主仓文件在主仓提交），提交信息 `feat(paycenter): S<n> T<k> <简述>` 风格。
4. 完成全部被分配 Task 后，写报告到指定 report 路径：每 Task 的状态（DONE/DONE_WITH_CONCERNS/BLOCKED）、commit SHA、Verify 命令与关键输出摘要（不含任何密钥值）、白名单外改动、遗留问题。

## 回报（最终消息）
仅返回：总体 Status、每 Task commit SHA、一行测试摘要、report 路径、需要主 Agent 决策的问题（如有）。
