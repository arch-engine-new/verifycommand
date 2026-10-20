---
feature: paycenter
slice: S5
title: 首筑支付中心 — 操作后台 7 页（后台 API + JeecgBoot Vue3 前端）
Status: approved
risk: medium
projectType: business
dependsOn: S1, S3, S4
redteam: user-confirmed-2026-10-20
---

# S5 操作后台 7 页 — Design Spec

## 1. 目标

**Goal:** 交付首筑操作后台 MVP 7 页（`paycenter/08` H1–H7）：后台管理 API（Jeecg 登录态 + 按钮权限）与 JeecgBoot Vue3 前端页面，按 `designs/v0/<page-id>/page.logic.md` 实现，经 `/apt-frontend-connect` 接力。

权威输入：`designs/v0/_pages.md`（7 页均 approved=yes）、各页 `page.logic.md`/`page.manifest.json`、`paycenter/20-操作后台设计.md`、原型 `prototype/paycenter-admin/index.html`、S1 菜单/按钮/角色初始化数据。

## 2. 前置与约束
- **前端工程**：使用仓库内已有的官方 `backend/jeecgboot-vue3`（与 `backend/jeecg-boot` 同一 JeecgBoot 提交 4998e64，Apache-2.0，用户 2026-10-20 已确认采用），**不另行拉取**；`.env.development` 代理到 `http://127.0.0.1:8080/jeecg-boot`。
- 路由与菜单：db-driven（S1 `sys_permission`），component 路径 `paycenter/<page>/index` → 文件 `backend/jeecgboot-vue3/src/views/paycenter/<page>/index.vue`。
- 后台 API 前缀 `/paycenter/admin/**`（走 Shiro 登录态，不放行），按钮级 `@RequiresPermissions`，权限码与 S1 一致（`paycenter:merchant:add/edit/toggle`、`paycenter:refund:add/retry`、`paycenter:trade:detail/export`、`paycenter:agreement:config`）。
- 角色：admin 全部；`paycenter_operator`（运营）商户/协议只读（原型“运营登录 → 配置只读”）。
- 敏感数据：商户号列表只显示末 4 位；手机号脱敏；`*_enc` 永不下发前端；密钥类字段编辑时只写不读。
- 所有写操作写 `pay_admin_log`（action 字典 S1 + S4 `CALLBACK_RETRY`），含操作前后差异摘要、IP、traceId。

## 3. 范围（按页，细节以各页 page.logic.md 为准）

| page-id | 后台 API | 前端要点 |
|---------|----------|----------|
| login (H1) | 复用 Jeecg 登录（验证码、失败锁定按 page.logic.md：5 次锁定 15 分钟，若 Jeecg 默认策略不符则通过配置/扩展实现） | 复用 Jeecg 登录页，品牌文案按 page.logic.md |
| dashboard (H2) | `GET /paycenter/admin/dashboard/overview`：今日成功笔数/金额、今日退款、待处理退款（REFUNDING）、需人工核查（manual_check=1）、通道健康（近 15 分钟银联调用成功率/最近错误，来自 S2 指标或通知/调用日志统计）、回调 FAILED 数 | 卡片 + 列表跳转 |
| merchants (H3) | 列表/详情/新增/编辑/启停；支付方式三开关；单笔限额；回调地址与 notify_domain；微信 subAppId（为空强制关微信）；小区关联增删（`pay_merchant_project` 物理删除）；merchant_code 创建后不可改 | 运营只读；表单校验按 page.logic.md |
| trades (H4) | 支付单分页查询（单号/商户/日期/状态/支付方式/manual_check）、详情（含 items、txn_flow、refund 列表、channel_seq、card_attr、fee）、主动查单（调 S3 查询收敛）、标记已核查（manual_check→0，写日志）、导出（若 page.logic.md 标注二期则只保留按钮占位隐藏） | 详情弹窗 |
| refunds (H5) | 退款单分页查询；发起退款（调 S3 `RefundService`，source=ADMIN，全额、360 天、二次确认）；失败/UNKNOWN 重试；回显原单 | 发起弹窗含回显原单 |
| agreements (H6) | 协议留痕查询：按用户 ID/协议编码/版本/时间查 `pay_agreement_consent` + 事件流水；协议版本列表（`pay_agreement_version`，admin 可改 content_url/新增版本 → AGREEMENT_CONFIG 日志） | 运营只读 |
| logs (H7) | `pay_admin_log` 分页查询（操作人/动作/时间/目标） | 只读 |
| 回调任务（附属于 dashboard/trades） | 回调 FAILED 列表 + 人工重推（调 S4 `manualRetry`，权限 `paycenter:refund:retry` 复用或新增 `paycenter:callback:retry` 并追加 Flyway 菜单按钮） | 列表按钮 |

### 非目标
对账中心、费率、三级开关后台、退款审核流、商户自助进件（二期）；C 端 APP（不在本仓库）。

## 4. 需求锁定表

| Rn | 需求 | 来源 | 可判定验收 | 优先级 |
|----|------|------|-----------|--------|
| R1 | 前端工程可构建并可启动 | 用户决策 | `backend/jeecgboot-vue3` 下 `pnpm install && pnpm build` 成功；dev 代理到 8080 登录成功看到“支付中心”菜单 | must |
| R2 | 后台 API 鉴权与按钮权限 | S1 菜单/角色 | 未登录访问 `/paycenter/admin/**`→401；运营调用商户新增→无权限；admin 正常 | must |
| R3 | dashboard 指标正确 | 08 H2、page.logic.md | 构造数据后接口数值与 SQL 计算一致（集成测试） | must |
| R4 | merchants 全部操作与校验 | 08 H3、page.logic.md | 新增/编辑/启停/开关/限额/小区关联各有接口测试；merchant_code 不可改；subAppId 空→微信关；每次写操作有日志 | must |
| R5 | trades 查询/详情/查单/标记核查 | 08 H4 | 筛选条件组合测试；详情包含 items/流水/退款；标记核查写日志 | must |
| R6 | refunds 发起/重试 | 08 H5 | 发起走 S3 规则（非 PAID→3004 提示）；重试仅 FAIL/UNKNOWN 可见可用；写日志 | must |
| R7 | agreements 留痕查询与版本配置 | 08 H6、14 文档 | 按用户查询返回同意记录；admin 改 content_url 写 AGREEMENT_CONFIG 日志；运营只读 | must |
| R8 | logs 查询 | 08 H7 | 按动作/时间筛选正确 | must |
| R9 | 回调 FAILED 人工重推 | S4 R3 | 页面可见 FAILED 任务并重推成功后状态变 PENDING | must |
| R10 | 敏感数据脱敏 | arch-review desensitize | 接口响应不含 `*_enc`；商户号仅末 4 位；手机号脱敏 | must |
| R11 | 7 页按 page.logic.md 实现并通过 frontend-connect 门禁 | `_pages.md` | 每页 `test-cases.md`（B1.5）生成且关键用例有自动化（后端接口测试 + 前端组件/E2E 冒烟）；`/apt-frontend-connect` 门禁 PASS | must |

## 5. 开放项
- 运行时验收（`/apt-accept`）待用户提供银联商户号、子商户号等参数后执行（用户 2026-10-20 决策：批末不自动验收）。
- UI 设计 token：项目尚无 `.ai/design/profile.json`，按 JeecgBoot 默认主题 + 原型布局实现；如 `/apt-frontend-connect` 要求设计同步，先执行 `design-sync`。
