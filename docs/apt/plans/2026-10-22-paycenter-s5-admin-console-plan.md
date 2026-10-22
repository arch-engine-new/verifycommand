# 首筑支付中心 S5 操作后台 Implementation Plan（后端 API 部分；前端归 connect 阶段）

> **Spec:** `docs/superpowers/specs/2026-10-20-paycenter-s5-admin-console-design.md`（含 S2.5 修订 R14）
> **Command:** `/plan-from-spec`
> **Status:** approved（批量预授权；F-10 triage 同链）
> **前置已完成：** `$apt-create --refine`（pay-subject page.logic 139 行 + merchants +25；两变更页 approved=no 待 PM 复核；check 双 PASS；start_product_init 增量 2 页同步）。
> **DDL/数据：** 仅一项 Flyway 增量 `V20261022_2__paycenter_s5_menu_dict.sql`（菜单/按钮权限 + 字典 SUBJECT_*/paycenter:subject:* 码 + callback:retry 按钮），仿 V20261020_2 幂等写法。不改表。

**Goal:** 交付操作后台 8 页的**后端管理 API**（`/paycenter/admin/**`，Jeecg 登录态 + `@RequiresPermissions`），为 `$apt-frontend-connect` 供接线面；R14 支付主体管理 + 映射配置落地；UI 工程（vue3 8 页）不在本 plan（connect 阶段）。

**Architecture:** 新 `admin` 包按页拆 Controller/Service（dashboard/merchants/trades/refunds/agreements/logs/pay-subject/callback-task）；统一脱敏出参 VO（`PayMaskUtil` 末 4 位、`*_enc`→configured 布尔、手机号脱敏）；全部写操作经 `PayAdminLogWriter`（若无则本组建：operator/IP/traceId/before→after diff JSON、action 字典校验）；变更后发布 `PaySubjectChangedEvent`/`PayChannelConfigChangedEvent`（映射变更影响缓存则同发）使 S2.5 缓存即时失效。

---

## Part 1 — 技术方案

### 1.1 范围与约束
**包含** R2–R10、R14（后端面）+ R11 的接口测试部分。**非目标：** 对账/费率/三级开关/审核流（二期）；vue3 页面实现（connect）；`/apt-accept`（等用户提供商户参数）。

**硬约束：**
- 鉴权：`/paycenter/admin/**` 走 Jeecg Shiro 登录态（**不放行**，未登录 401）；按钮权限码沿用 S1 命名空间新增 `paycenter:subject:add/edit/toggle/reset`、`paycenter:merchant:mapping`、`paycenter:callback:retry`（Flyway 增量登记 sys_permission + 角色绑定 admin；运营角色只读页不绑写权限）。
- 脱敏红线：响应永不含 `*_enc`/AppKey/通讯密钥明文；main/sub 商户号、终端号末 4 位；凭证「已配置/未配置」+只写不读；重置动作按 pay-subject page.logic 定义执行。
- 写操作全部 `pay_admin_log`（action∈字典：S1 既有 + CALLBACK_RETRY(S4) + SUBJECT_ADD/EDIT/TOGGLE/RESET + MAPPING_ADD/EDIT/DEL——字典增量 SQL 补齐；终版命名以此为准并回写 page.logic 备注若不一致——PM 开放项 4 收口）。
- 业务复用不重造：商户 CRUD 用现 IService；映射=IPayMerchantSubjectService（resolve 已有，管理面加 list/save/delete）；refunds 发起=S3 `createRefund(source=ADMIN)`、重试=其 retry_of 语义（S3 组C 已实现则复用，缺则补最小）；主动查单=S3 query 收敛；人工重推=S4 `PayCallbackService.manualRetry`；dashboard/交易聚合=pay_order/pay_txn_flow SQL。
- 缓存失效：pay-subject 与映射任何写后发事件（S2.5 双事件面）；merchants toggle 亦发。
- 工程规范沿用（Javadoc/≤80 行/≤5 参/无新依赖）；Mock 测试沿用 PayTradeTestKit；admin 接口测试以 @WebMvcTest/standalone+Shiro 注解桩断权限码存在性（登录态 401 E2E 归组 D 运行态）。

### 1.2 设计寻址
有 UI 但本 plan 只做后端；connect 阶段按 `query_design`/page.logic 走（`.ai/design/profile.json` 无——spec §5 开放项：connect 若要求先 design-sync，届时执行）。

### 1.3 依赖寻址表
| 依赖 | 来源 | 摘要 |
|---|---|---|
| IPayMerchantSubjectService/IPaySubjectService/IPayAppService 等 16 实体服务 | 源码 | IService CRUD；S2.5 新服务含 resolve/findByCode/findByMsgSrcId |
| createRefund(source=ADMIN)/queryRefund/confirmResult | 源码 S3 组C | PayRefundTradeService |
| S3 主动查单收敛（query>10s 同函数）/markChecked? | 源码 | manual_check 置 0 方法若无→本组于 IPayOrderService 加 `markChecked(id,operator)` 最小增量+日志 |
| PayCallbackService.manualRetry + FAILED 列表 | 源码 S4 组A | 列表=pay_callback_task status=FAILED 分页 |
| PayAlertType/PayAdminLog 实体/IPayAdminLogService | S1/S4 | diff JSON 列现成 |
| PaySubjectChangedEvent/PayChannelConfigChangedEvent | S2.5 | 写后必发 |
| sys_permission/sys_dict 惯例 | V20261020_2 | 菜单 component=`paycenter/pay-subject/index`，按钮 perms |

### 1.4 契约：无新对外 HTTP 契约（对内 admin）；connect 接线面以各页 page.logic 的 API 意向名+本 plan Controller 为准，finish 时 `register_contract PayAdminApi`（端点清单+权限码）供 connect 消费。
### 1.5 测试策略：每接口 鉴权码断言+脱敏断言（列表含凭证布尔零明文）+成功/校验失败/越权(权限码缺失→403 Mock 桩) 三面；dashboard 构造数据 SQL 对照；merchants 映射 uk 冲突/diff 留痕/'' 哨兵；subject 重置→configured=false+缓存事件发布断言；logs 动作筛选。运行态 E2E（组 D）：未登录 401、admin 登录态下 ping+一查询接口 200（token 走 Jeecg 登录接口取 `X-Access-Token`）、菜单渲染数据存在（sys_permission 查询）。
### 1.6 需求锁定表：spec §4（R2–R11、R14）为真源；R1 前端可构建归 connect；R11 前端门禁归 connect。

---

## Part 2 — 任务清单（组内串行；每组一 commit；backend 逐文件 add，禁 push）

**组 A 基础与主体管理（R14 上半+R2 基建）**：T1 `V20261022_2` 菜单/按钮/角色绑定/字典增量 SQL（幂等；pay-subject 菜单+8 权限码+SUBJECT_*/MAPPING_* 字典项）；T2 `PayAdminLogWriter`（diff/IP/traceId 统一写入口，若无）；T3 `PaySubjectAdminController`+Service（list 分页筛选 scene/status、save（凭证只写：app_id/app_key/comm_key 明文入→加密存，key_version 管理）、edit 不含明文回显、toggle、reset（二次确认参数+置凭证未配置按 page.logic）、详情含 configured 布尔组）+每写发 `PaySubjectChangedEvent`；T4 接口测试+事件断言。commit。
**组 B 商户与映射（R4+R14 下半）**：T5 `PayMerchantAdminController` CRUD/启停/开关/限额/回调地址+白名单校验（复用商户号段校验惯例）+小区关联增删（物理删+diff）；T6 映射区块 API：list by merchant+subject 维度、save（uk 冲突友好错误）、delete、resolve 预览（试算 商户×主体×小区→sub 号，只读）；每次写发 `PayMerchantChangedEvent`（若无该事件且缓存无需要则不发，报告说明）+日志；T7 测试（含 merchant_code 不可改、'' 哨兵行、两主体不同映射）。commit。
**组 C 查询与操作面（R3/R5/R6/R7/R8/R9）**：T8 dashboard overview（六指标 SQL+通道健康近 15min 成功率/最近错误——数据源 pay_notify_record/pay_txn_flow/日志表，通道健康无指标表则按 SQL 近似并文档化）+回调 FAILED 分页+manualRetry 接入；T9 trades（分页筛选/详情聚合 items+流水+退款/主动查单调 S3 收敛/markChecked）；T10 refunds（分页/发起 ADMIN 源走 S3 规则透传错误码/重试=对 FAIL 单 retry_of 新建）；T11 agreements（留痕查询/版本列表/改 content_url/新增版本→AGREEMENT_CONFIG 日志）；T12 logs 分页。测试逐接口。commit。
**组 D 收口**：T13 全量 `cmd /c mvn test` 绿；T14 E2E：打包重启（先 -Stop）→未登录 `/paycenter/admin/dashboard/overview` 401；admin 登录取 token 后 overview/logs list 200 且脱敏；菜单表 pay-subject 行存在（docker SQL 断言）；应用保持运行；T15 `docs/apt/test-cases/paycenter-s5.md`（22 文档 H 簇 P0↔测试映射，GAP 如实）+回写 page.logic 开放项收口备注（动作命名终版）。主仓不 commit（编排者统一）。

**执行体注记：** S5 后端绿后进 `$apt-frontend-connect`（8 页 vue3，`.env.development` 代理 8080；R1 构建门禁 pnpm install/build——node 环境问题如实 BLOCKED 上报勿硬修）；connect PASS 后 verify（含 logic 同步维度此时应过：refine 产物+product-init 已同步）→ finish_feature（register_contract PayAdminApi）→ `batch_complete_slice(F-10)` → 批终态：playbook-gate exit 0 → DELIVERY-SUMMARY → `batch_lock_release`（自由释放）→ 可选 batch_archive。/apt-accept 不做（等用户参数）。
