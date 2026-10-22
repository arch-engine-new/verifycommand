# paycenter S5 操作后台 · 自动化用例清单（H 簇 7 条 P0↔测试映射）

> 真源：`paycenter/22-支付验收测试用例.md` H 簇（操作后台 MVP）TC-H-01~H-07 + TC-X-08（未授权访问）。
> 三方对照：spec `docs/superpowers/specs/2026-10-20-paycenter-s5-admin-console-design.md` §4 R2–R10/R14 ↔ 22 文档用例 ↔ 自动化测试（14 类 60 方法）。
> 测试仓：`backend/jeecg-boot/jeecg-boot-module/jeecg-module-paycenter`（分支 paycenter，基线 HEAD c81799a）。
> 通道口径：同 S3/S4，通道桩 `UnionPayMockServer` + 时间线 `MutableClock` 可推进。
> 全量执行：`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test`（需先 dot-source `. scripts/paycenter/run-local.ps1 -EnvOnly` 注入真实 MySQL/Redis 环境变量）。组 A–C 于 HEAD c81799a 实测 **546 测试绿**（清 DB+Redis 后稳定 545/546，1 个 S4 既有 flaky 并发测试 `doubleInstanceExactlyOncePerTask` 偶发 60s 超时，重跑即绿，非 S5 回归）。

## spec R ↔ 22 H 簇 ↔ 测试类总对照

| spec R | 需求 | 22 用例 | 主测试类 |
|---|---|---|---|
| R2 | 支付主体管理（list/save/edit/toggle/reset + 凭证红线 + 事件发布） | TC-H-02（商户配置增改，主体为其半体） | `PaySubjectAdminDbTest`、`PayOpsControllersAdminTest` |
| R3 | 商户配置管理（CRUD/启停/开关/限额/回调地址/白名单 + 小区关联 + 映射） | TC-H-02 | `PayMerchantAdminDbTest`、`PayMerchantSubjectAdminDbTest`、`PayMerchantAdminControllerTest` |
| R4 | 交易查询（分页筛选/详情聚合 items+流水+退款/主动查单/markChecked） | TC-H-05 | `PayTradeAdminDbTest`、`PayOpsControllersAdminTest` |
| R5 | 退款发起与重试（ADMIN 源→S3 规则透传 / 重试=retry_of 新建） | TC-H-04 | `PayRefundAdminDbTest`、`PayOpsControllersAdminTest` |
| R6 | Dashboard（六指标 + 通道健康近 15min 成功率/最近错误） | 22 无独立用例（运营仪表盘） | `PayDashboardAdminDbTest`、`PayDashboardAdminControllerTest` |
| R7 | 协议留痕查询/版本列表/改 content_url/新增版本 | TC-H-06 | `PayAgreementAdminDbTest` |
| R8 | 操作日志分页（action∈字典 + diff JSON） | TC-H-07 | `PayLogAdminDbTest`、`PayOpsControllersAdminTest` |
| R9 | 回调 FAILED 分页 + manualRetry（写 CALLBACK_RETRY 日志） | 22 无独立用例（H 簇未单列） | `PayCallbackAdminDbTest`、`PayOpsControllersAdminTest` |
| R10 | 鉴权/脱敏/分页上限 ≤100 | TC-H-01（登录与权限）、TC-X-08（未授权） | `PayOpsControllersAdminTest`、各 `*ControllerTest` |
| R14 | 多支付主体后端（admin 层消费 S2.5 服务） | TC-H-02（商户+主体映射配置） | `PayMerchantSubjectAdminDbTest` |

## H 簇 P0 逐条映射

| 用例 | 名称 | 自动化覆盖（类#方法） | 状态 |
|---|---|---|---|
| TC-H-01 | 登录与权限（admin 可改/运营只能查+退款） | E2E：无 token `/paycenter/admin/dashboard/overview` → 401（`token为空!`）✅；admin 登录态 → 200 ✅（详见本文 E2E 节）；权限码断言：`PaySubjectAdminControllerTest`（perms=`paycenter:subject:add/edit/toggle/reset`）、`PayMerchantAdminControllerTest`、`PayDashboardAdminControllerTest`（perms=`paycenter:admin:dashboard:view`） | ✅ 自动化（鉴权+admin 全量）；运营角色门禁归前端 connect |
| TC-H-02 | 商户配置增改（保存成功+写操作日志） | `PayMerchantAdminDbTest#listPaginated`（CRUD 全链）、`#toggleDisabledSendsMerchantChangedEventAndInvalidatesCache`（开关变更→事件+缓存）、`#updateLimitsAndCallbackUrlAndWhitelistValidates`（限额/回调/白名单校验）、`#merchantCodeImmutableAfterSave`（商户号不可改）；`PayMerchantSubjectAdminDbTest#saveMappingWithUkConflictFriendlyError`（映射 uk 冲突友好提示）、`#deletePhysicalRemovesRowsAndLogsDiff`（物理删+diff）、`#resolvePreviewCalculatesSubjectMerchantCommunityToSubNo`（试算只读） | ✅ 自动化 |
| TC-H-03 | 支付方式开关 ≤30s 生效 | R3 开关变更发 `PayMerchantChangedEvent` + Redis 缓存失效，S2.5 订阅事件即时生效（`#toggleDisabledSendsMerchantChangedEventAndInvalidatesCache` 内 Redis key 断言）；"≤30s" 为设计口径（事件驱动=毫秒级） | ✅ 自动化（事件+缓存） |
| TC-H-04 | 退款发起/重试 | `PayRefundAdminDbTest#initiateRefundThroughS3PayRefundServiceWithAdminSource`（ADMIN 源→S3 规则透传错误码）、`#retryOnFailedCreatesRetryOfNewRefundInConvergeRefunding`（convergeRefunding 兜底）、`#retryOnStillRefundingRejectedWith3004`（明确收敛前拒绝+提示） | ✅ 自动化 |
| TC-H-05 | 交易查询（按单号/商户/日期/详情） | `PayTradeAdminDbTest#listPaginatedFiltersAndAggregatesDetailWithItemsFlowRefund`（分页筛选+详情聚合 items/流水/退款）、`#manualQueryActiveOrderConvergesAndLogs`（主动查单收敛）、`#markCheckedSetsManualCheckAndLogs`（人工核查标记） | ✅ 自动化 |
| TC-H-06 | 协议留痕查询 | `PayAgreementAdminDbTest#consentTimelineAggregatesAndDeduplicates`（时间线聚合去重）、`#saveVersionEditsContentUrlAndLogsDiff`（改 content_url+AGREEMENT_CONFIG 日志 diff JSON）、`#saveVersionCreatesAndGuardsUniqueness`（新增版本唯一性守卫） | ✅ 自动化 |
| TC-H-07 | 操作日志完整（操作人/动作/变更前后值/时间） | `PayLogAdminDbTest#listPaginatedFiltersByAction`（动作筛选）、`#writeSideEffectVerification`（各写操作→admin log 自动落）；事件断言：`PaySubjectAdminDbTest#resetSubjectSetsConfiguredFalseAndPublishesSubjectChangedEvent`（重置→事件→缓存）、`PayMerchantAdminDbTest#deletePhysicalRemovesRowsAndLogsDiff`（diff JSON 列） | ✅ 自动化 |
| TC-X-08 | 未授权访问 | E2E 未登录 → 401（本文 E2E #1）；Controller 层权限码注解断言：`PayDashboardAdminControllerTest#permissionsMatchDesign`（`@RequiresPermissions` 存在）、`PayOpsControllersAdminTest#allAdminControllersRequireAuth` | ✅ 自动化 |

## Dashboard 通道健康字段决策记录（group C→group D 衔接裁决）

| 项 | 裁决 | 依据 |
|---|---|---|
| 通道健康近 15min 成功率窗口 | 硬取 15min（spec R6 口径） | `DashboardData.channelHealth.windowMinutes=15`（dashboard SQL 聚合固定 15min 窗口） |
| 与 pay-subject 页 `unionpaySuccessRate1h` 命名冲突 | **当前 admin 层**：`channelHealth.successRate` + `channelHealth.windowMinutes`（响应自带窗口）；**connect 阶段**：pay-subject 页是否展示 1h 成功率先用 admin 层 15min 数据（或前端自行聚合）——由 PM 定稿，后端不动 | group C 交接注记"窗口按 spec 取 15min、命名与 page.logic 1h 字段冲突转 connect 定稿" |
| 响应带 `windowMinutes` | ✅ 已实现：`DashboardMetricsData.windowMinutes=15` | group C 交接注记"组 D 加 windowMinutes" |

## 运行态 E2E（S5 组 D T14，HEAD c81799a 打包）

新 jar（HEAD c81799a 打包，`jeecg-system-start-3.9.5.jar`，2026-10-22 15:18）经 `scripts/paycenter/run-local.ps1` 启动（pid 18780，`/v1/ping` 于 180s 内 200），逐项断言：

1. **鉴权门禁**：未登录 `GET /paycenter/admin/dashboard/overview` → **401** `{"code":401,"message":"token为空!"}` ✅
2. **admin 登录**：`POST /sys/login` admin/123456 → `X-Access-Token` 155 字符 ✅
3. **dashboard 200**：带 token `GET /paycenter/admin/dashboard/overview` → **200**，返回结构包含 `callbackFailedCount`、`channelHealth{status:"NORMAL",successRate:null,windowMinutes:15}`、`manualCheckCount`、`todayPaidAmount/Count` 等 ✅
4. **logs 200**：带 token `GET /paycenter/admin/logs/list?pageNo=1&pageSize=10` → **200** ✅
5. **菜单/按钮权限 SQL 断言**：`sys_permission` 表
   - 菜单 `pc_menu_subject`：name=`支付主体管理`、url=`/paycenter/pay-subject`、component=`paycenter/pay-subject/index` ✅
   - 按钮 `pc_btn_subject_add/edit/reset/toggle`：perms=`paycenter:subject:add/edit/reset/toggle` ✅
6. **Flyway 增量 V20261022_2**：菜单+按钮权限+角色绑定+字典 `SUBJECT_*`/`paycenter:subject:*` 码 + `callback:retry` 按钮 —— 组 A 已落库（组 C 运行态 DB 验证）✅
7. 结束后应用**保持运行**（pid 18780，供 verify）。

## GAP 汇总

| # | 条目 | 级别 | 归因与去向 |
|---|---|---|---|
| 1 | 前端 Vue3 8 页实现 + 接线（connect） | 准 P0 | plan 明确"前端归 connect"（R1 构建门禁、R11 前端门禁）；`$apt-frontend-connect` 阶段执行（`.env.development` 代理 8080） |
| 2 | 运营角色只查+退款的页面级隔离 | P1 | E2E 只验证 admin 全量；运营角色菜单分配（Jeecg sys_permission_role）由前端 connect 或部署脚本补；后端 `@RequiresPermissions` 已按码拦截 |
| 3 | 通道健康 15min vs 1h 命名 | must 内 connect 收口 | admin 层固定 15min（spec R6）、响应带 `windowMinutes=15`；pay-subject 页是否展示 1h 数据由 connect PM 定稿——后端不动 |
| 4 | 双实例进程级回调重试 E2E | P0 交叠 | 同 S4 GAP #2：行级 version 守护 + Redis 租约=防重机制，不依赖进程边界；真实双进程部署验证归生产拓扑专项 |
| 5 | connect 阶段 `query_design` 先 design-sync | 技术流程 | `.ai/design/profile.json` 无，spec §5 开放项；connect 时自动执行（若要求先 design-sync） |
| 6 | callback 重推恰 1 条 CALLBACK_RETRY 日志断言 | 组 D 已验证 | 组 C 交接注记 "callback 重推恰 1 条 CALLBACK_RETRY 日志（manualRetry 内部已写，admin 侧禁双写）" — `PayCallbackAdminDbTest#retryResetsAndLogsExactlyOnce` 断言 ✅；但 E2E 空数据场景未产生日志（按设计） |
| 7 | pay_admin_log 不在 TestKit 清理内 | 组 C 交接已处理 | 按 target 前缀自清（TestKit 清 pay_* 表，pay_admin_log 不在清名单→测试手动滚同 Kit prefix，已覆盖） |
| 8 | `pay_merchant_subject` 映射 resolve 预览试算 子商户号 | 运行态通道 Mock 限制 | `PayMerchantSubjectAdminDbTest#resolvePreviewCalculatesSubjectMerchantCommunityToSubNo` 内走 `IPaySubjectService.resolve` 通道桩；真实通道试算归生产专项 |

## page.logic 开放项收口

| 开放项 | 原位置 | 收口 |
|---|---|---|
| 通道健康 15min windowMinutes 响应 | 组 C→D 交接 | admin 层已实现 `channelHealth.windowMinutes=15`；与 pay-subject 1h 命名差异归 connect PM 定稿 |
| callback 重推日志恰 1 条 | group C 裁决 | 已 `retryResetsAndLogsExactlyOnce` 断言验证 ✅；manualRetry 内部写、admin 侧禁双写 |
| 分页上限新接口 ≤100 | group C 裁决 | 已统一（组 D T13）；A/B 旧代码 200 已组 D 改为 100 |
| callback 单留痕 diff JSON 用 parse | group C 裁决 | 已 PayAdminLogWriter 统一 diff JSON 列 ✅ |
