# Verify Fix — 首筑支付中心 S1 代码质量

> **Verify report:** `.apt/verify/latest.md`（F-1 第 1 轮，Overall: FAIL，implementation=[代码质量]，recommended=plan-from-verify）
> **Command:** `$apt-plan-from-verify`
> **Status:** approved（批量模式，用户 2026-10-20 预授权不逐份审）

## Part 1 — 修复范围

仅修复 `check_code_quality` 在 `jeecg-module-paycenter` 范围内报出的 3 high + 4 medium，不改业务行为。根前缀 `M=backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter`。

## Part 2 — 任务

### Task 1: 测试清理 SQL 参数化 + 测试/处理器注释（F1）
- [ ] `PayMapperSmokeTest` L255/L263 的原生清理 SQL 改为参数化（`PreparedStatement` `?` 占位；表名来自固定白名单常量时用 `switch`/常量映射而非拼接用户值，若必须动态表名则改为每表一条固定 SQL 常量）
  - **Files:** `M/src/test/java/org/jeecg/modules/paycenter/mapper/PayMapperSmokeTest.java`
- [ ] `PayOpenApiExceptionHandlerTest` 内测试 controller 的 `payEx`/`runtimeEx`/`body` 公开方法补 Javadoc（说明为何存在：用于触发对应异常分支）
  - **Files:** `M/src/test/java/org/jeecg/modules/paycenter/openapi/PayOpenApiExceptionHandlerTest.java`
- [ ] `PayOpenApiExceptionHandler.handleParamException` 补 Javadoc；`PayWorkerIdAllocator.resolveWorkerId` 补分支说明注释（配置优先 / Redis 自增取模 / 越界处理的原因）
  - **Files:** `M/src/main/java/org/jeecg/modules/paycenter/openapi/PayOpenApiExceptionHandler.java`, `M/src/main/java/org/jeecg/modules/paycenter/common/no/PayWorkerIdAllocator.java`
  - **Verify:** `. scripts/paycenter/run-local.ps1 -EnvOnly; mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test` 全绿（56 用例）；`check_code_quality` 过滤 `paycenter` 路径后 high=0 且 medium<5
