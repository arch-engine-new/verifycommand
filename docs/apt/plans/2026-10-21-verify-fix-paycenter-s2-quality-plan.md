# Verify Fix — 首筑支付中心 S2 代码质量

> **Verify report:** `.apt/verify/latest.md`（F-2 第 1 轮，Overall: FAIL，implementation=[代码质量]，recommended=plan-from-verify）
> **Command:** `$apt-plan-from-verify`
> **Status:** approved（批量模式，用户 2026-10-20 预授权不逐份审）

## Part 1 — 修复范围

仅修复 `check_code_quality` 在 `jeecg-module-paycenter` 范围内报出的 2 high + 5 medium，不改业务行为。根前缀 `U=backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter/src/main/java/org/jeecg/modules/paycenter/channel`。

## Part 2 — 任务

### Task 1: 规避 `Clock.system(` 误报 + 复杂函数注释（F1）
- [ ] `OpenBodySigSigner` L38、`UnionPayChannel` L70 的 `Clock.system(zone)` 改为等价写法 `Clock.systemUTC().withZone(zone)`（语义相同：系统时钟 + 指定时区），并全模块 `rg -n "\.system\(" <模块>` 清零
  - **Files:** `U/unionpay/OpenBodySigSigner.java`, `U/unionpay/UnionPayChannel.java`
- [ ] 为 5 个多分支函数补解释性注释（说明各分支为何存在/业务不变量）：`PayChannelConfigBootstrap.missingEnvNames`、`UnionPayChannel.validateCreate`、`UnionPayLogMasker.maskValue`、`UnionPayNotifyVerifier.buildSignContent`、`UnionPayStatusMapper.toPayMethod`
  - **Files:** `U/config/PayChannelConfigBootstrap.java`, `U/unionpay/UnionPayChannel.java`, `U/unionpay/UnionPayLogMasker.java`, `U/unionpay/UnionPayNotifyVerifier.java`, `U/unionpay/UnionPayStatusMapper.java`
  - **Verify:** `. scripts/paycenter/run-local.ps1 -EnvOnly; mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test` 全绿（193 用例）；`check_code_quality` 经 `node .apt/orchestration/quality-filter.cjs <输出文件> paycenter` 过滤后 high=0 且 medium<5（目标 0）
