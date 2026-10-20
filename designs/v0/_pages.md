# v0 页面进度表

来源：`prototype/paycenter-admin/index.html`（= `paycenter/21-操作后台HTML原型.html`，单文件 SPA，按 `data-page` 手动拆页）
PRD：`paycenter/20-首筑操作后台设计.md`（§4 功能明细、§5 管理接口、§9 交互逻辑）、`paycenter/01-支付产品需求文档-PRD.md`
路由约定：业务页统一 `/paycenter/*`（JeecgBoot 菜单 db-driven），登录页 `/login`。

| page-id | title | handoff | approved | synced | notes |
|---------|-------|---------|----------|--------|-------|
| login | 登录页（P1） | ready | yes | no | /login；单按钮登录（角色由账号决定）、图形验证码、5 次锁 15 分钟 |
| dashboard | 工作台（P2） | ready | yes | no | /paycenter/dashboard；「需人工核查」= manual_check；通道健康建议并入 A10 |
| merchants | 商户管理（P3） | ready | yes | no | /paycenter/merchants；运营只读；3 个支付方式开关；关联小区可增删 |
| trades | 交易查询（P4） | ready | yes | no | /paycenter/trades；三项待确认已按 PRD 定论收敛（AI 自答 2026-10-20，证据：20-设计.md §P4 L88-91/L205-208、§P5 L94）：银联流水号入详情弹窗（channel_seq）；退款列表含原支付单列可联动；流水/账单明细放详情子表 |
| refunds | 退款处理（P5） | ready | yes | no | /paycenter/refunds；全额锁定、360 天、提交退款二次确认（已补） |
| agreements | 协议留痕（P6） | ready | yes | no | /paycenter/agreements；关键词必填、手机号需关联用户系统 |
| logs | 操作日志（P7） | ready | yes | no | /paycenter/logs；复用 Jeecg sys_log 扩展，关闭删除 |
