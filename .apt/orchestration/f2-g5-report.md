# S2 F2-G5 报告：T14 小修复 + Task 16 端到端验证

- Plan：`docs/apt/plans/2026-10-21-paycenter-s2-unionpay-channel-plan.md`
- 总体 Status：**DONE_WITH_CONCERNS**（全部校验通过；关注点见末尾，均不阻断）
- 执行时间：2026-10-21 09:39–09:55（UTC+8）

## 0. T14 小修复：raw_body 按 UTF-8 字节截断 — DONE

- Commit（backend 仓库，分支 `paycenter`）：`ad93eb8` `fix(paycenter): S2 T14 notify raw_body truncate by UTF-8 bytes`
- 改动：
  - `channel/unionpay/UnionPayChannel.java`：`toNotify` 的脱敏原文截断由 `String.substring(0, 60000)`（按字符）改为 `truncateUtf8(masked, 60000)`；新增包级静态方法 `truncateUtf8(String, int)`，编码为 UTF-8 后若超限，截断点回退到非续字节（`(b & 0xC0) != 0x80`），保证不切断多字节字符（含 4 字节 emoji/代理对）。
  - `UnionPayChannelNotifyTest.java` 新增 2 个用例：
    - `chineseOversizedBodyTruncatedByUtf8Bytes`：22000 个“支”（66000 字节 > 64KB）JSON 报文 → `maskedBody` UTF-8 字节数 ≤ 60000 且 > 59990；严格解码器（REPORT）解码不抛异常、不含 U+FFFD。
    - `truncateUtf8Boundaries`：恰好上限不截断、null 原样、emoji 不被切半。
- 白名单说明：主 Agent 决策归入 T14 白名单；实际截断逻辑位于 `UnionPayChannel`（T13 产出的 `parseAndVerifyNotify`），属 S2 范围内文件。
- Verify：`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=UnionPayChannelNotifyTest` → `Tests run: 6, Failures: 0, Errors: 0, Skipped: 0`。

## 1. Task 16 — DONE_WITH_CONCERNS

### 1.1 全量模块测试
命令：`. scripts/paycenter/run-local.ps1 -EnvOnly`（注入 5 个变量名：PAY_DB_PASSWORD, PAY_DB_PORT, PAY_DB_USER, PAY_MASTER_KEY, PAY_MASTER_KEY_VERSION；未注入任何 PAY_UNIONPAY_*）→ 清空 surefire-reports → `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test`，退出码 0。

| 测试类 | tests | 失败/错误/跳过 |
|---|---|---|
| channel.config.PayChannelConfigBootstrapTest | 5 | 0/0/0 |
| channel.config.PayChannelConfigDbTest | 1 | 0/0/0 |
| channel.config.PayChannelConfigServiceTest | 7 | 0/0/0 |
| channel.PayChannelRouterTest | 5 | 0/0/0 |
| channel.unionpay.OpenBodySigSignerTest | 5 | 0/0/0 |
| channel.unionpay.UnionPayChannelCreateOrderTest | 12 | 0/0/0 |
| channel.unionpay.UnionPayChannelNotifyTest | 6 | 0/0/0 |
| channel.unionpay.UnionPayChannelQueryRefundCloseTest | 17 | 0/0/0 |
| channel.unionpay.UnionPayErrorMapperTest | 7 | 0/0/0 |
| channel.unionpay.UnionPayHttpClientTest | 11 | 0/0/0 |
| channel.unionpay.UnionPayLogMaskerTest | 5 | 0/0/0 |
| channel.unionpay.UnionPayNotifyParserTest | 4 | 0/0/0 |
| channel.unionpay.UnionPayNotifyVerifierTest | 6 | 0/0/0 |
| channel.unionpay.UnionPayStatusMapperTest | 30 | 0/0/0 |
| config.PayCenterPropertiesTest | 2 | 0/0/0 |
| notify.UnionPayNotifyControllerTest | 14 | 0/0/0 |
| （S1）common.crypto.PayCryptoServiceTest | 10 | 0/0/0 |
| （S1）common.error.PayErrorCodeTest | 3 | 0/0/0 |
| （S1）common.no.PayNoGeneratorTest | 7 | 0/0/0 |
| （S1）common.redis.PayRateLimiterTest | 3 | 0/0/0 |
| （S1）common.redis.PayRedisLockTest | 4 | 0/0/0 |
| （S1）common.redis.PayReplayGuardTest | 5 | 0/0/0 |
| （S1）common.trace.PayTraceFilterTest | 4 | 0/0/0 |
| （S1）entity.PayEntityDdlConsistencyTest | 1 | 0/0/0 |
| （S1）mapper.PayMapperSmokeTest | 15 | 0/0/0 |
| （S1）openapi.PayOpenApiExceptionHandlerTest | 3 | 0/0/0 |
| （S1）openapi.PayPingControllerTest | 1 | 0/0/0 |

- 合计：**27 个测试类，Tests run 193，Failures 0，Errors 0，Skipped 0**；S2 要求的 16 个类全部在列；`TEST-...UnionPayLiveTest.xml` 存在性 = `False`（默认排除）。
- 日志：`.apt/f2-g5-fulltest.log`

### 1.2 打包
`mvn -q -o -DskipTests -pl jeecg-module-system/jeecg-system-start -am package` → 退出码 0（日志 `.apt/f2-g5-package.log`）。

### 1.3 启动
- 启动前 8080 无监听。
- `$t0 = 2026-10-21 09:47:59`；`scripts/paycenter/run-local.ps1` → `started pid 19040` → `/v1/ping returned 200`。
- 本地未配置银联凭证（预期）：应用正常启动。

### 1.4 校验（逐条）

| # | 校验 | 结果 |
|---|---|---|
| 1 | 启动日志 `Select-String -CaseSensitive " ERROR "` | 全部 ERROR 行 0 条，paycenter 相关 0 条 → **PASS**（R1） |
| 2 | R12 空体 `POST /jeecg-boot/notify/unionpay/pay` | `HTTP/1.1 200`，`Content-Type: text/plain;charset=UTF-8`，body = `FAILED`（非 401/302、非登录 JSON）→ **PASS** |
| 3 | JSON `{}` | `FAILED` → **PASS** |
| 4 | 错签表单 `notifyId=E2E-S2-001&...&sign=BAD` | `FAILED` → **PASS** |
| 5 | SQL：t0 之后 ERROR 记录数 / `notify_id like 'E2E-%'` | `4`（≥3）/ `0` → **PASS**；明细：3 条 `empty notify`、1 条 `channel config unavailable`，均 `sign_valid=0`、`notify_id=NULL` |
| 6 | 引导（`PAY_UNIONPAY_APP_ID` 长度 0） | 日志含 `PayChannelConfigBootstrap:79 - paycenter unionpay bootstrap skipped: no PAY_UNIONPAY_* env` → **PASS**（R2） |
| 7 | 日志无密钥 | `PAY_UNIONPAY_APP_KEY`/`COMM_KEY` 长度均为 0，按 plan 条件不适用 → **N/A（PASS）** |
| 8 | 仓库无明文 | 8a yml/properties 正则 rg 退出码 1（无命中）；8b `PAY_UNIONPAY_(APP_KEY|COMM_KEY)=\S` rg 退出码 1（无命中）；`application-dev.yml` 的 `paycenter:` 节点 app-key/comm-key/master-key 等均为 `${ENV:}` 占位 → **PASS**（R2；JeecgBoot 原有 `baidu-api.app-id` 占位不计） |
| 9 | R11 回归（移除 PAY_UNIONPAY_* 后 `-Dgroups=unionpay-live`） | 退出码 `1`（≠0）；`*UnionPayLiveTest.txt` 匹配 `缺少环境变量 .*PAY_UNIONPAY_APP_ID` 1 行 → **PASS** |

第 2 项说明：plan 原文 `curl.exe ... -d "" <url>` 在 PowerShell 5 下空字符串参数被丢弃，curl 把 URL 当作 `-d` 的值，报 `curl: (2) no URL specified`（未发出请求）。实际以等价写法验证：`curl.exe -s -i -X POST --data-binary "@NUL" <url>`（真正 0 字节体）与 `-d '""'`，两者均 `HTTP/1.1 200` + `FAILED`。

### 1.5 停止
`scripts/paycenter/run-local.ps1 -Stop` → `stopped pid 19040`；复查 8080 无监听、pid 19040 不存在。

### 1.6 修复
Task 16 过程中无启动失败、无新增缺陷修复（除 §0 的预定小修复外无其它 commit）。

## 关注点（不阻断，供主 Agent 决策）
1. plan T16 第 2 项命令在 PS5 下无法原样执行（见上），建议 plan/验收文档改用 `--data-binary "@NUL"` 或 `-d '""'`。
2. 缺参引导跳过日志为 **INFO** 级（`PayChannelConfigBootstrap:79`），而非 WARN；plan 只要求日志含该文本，已满足。若要求 WARN 级需改 T7 产物。
3. 空体 / 通道配置缺失也走 `!signValid` 分支，会发布 `NOTIFY_SIGN_INVALID` 告警（`summary=mchntOrderId=null`），与 plan 步骤 4 一致，但在本地未配凭证或被扫描时会产生告警噪音；S3 接告警通道前可考虑对 `empty notify` 降级。
4. 本次 E2E 产生 4 条 `pay_notify_record` ERROR 测试记录（receive_time ≥ 09:47:59，notify_id 均 NULL），未清理；如需清理按 `receive_time` 删除即可。

## 白名单外改动
无（主仓仅新增本报告与 `.apt/f2-g5-*.log`、`.apt/f2-g5-t0.txt` 运行产物，未提交）。
