# dog-food 长任务方案（paycenter 操作后台全程开发）

> 2026-10-20 · 状态：**方案就绪，未开工**——双跑风险待解除（Cursor 侧会话是否已停，待用户确认）
> 前置事实：7 页 ingest approved=yes；schema 评审通过（docs/schema/paycenter-schema.md，2026-10-20）；14 表 flyway migration 已生成（backend untracked V20261020_1）；Java 代码未动、前端 vue3 页面未动；start_init(full) 重建索引中（workspace+=backend）

## 切片队列设计（7 页 + 地基片，依赖序）

| 序 | 切片 | 范围 | 依赖 | 验收面 |
|---|---|---|---|---|
| S0 | 地基片 | backend Java 基线：paycenter module 挂载 JeecgBoot（模块注册/包扫描/flyway 激活）、公共基础设施（雪花ID/金额分 TypeHandler/统一分页/操作日志切面） | init 索引 | mvn compile 过 + flyway 启动建表 14 张 |
| S1 | login | /login：单按钮登录（角色按账号）、图形验证码、5 次锁 15 分钟；复用 Jeecg sys_user | S0 | 片内测试 + verify |
| S2 | merchants | 商户管理 CRUD + 3 支付方式开关 + 关联小区增删（pay_merchant/pay_merchant_project） | S0 | 片内测试 + verify |
| S3 | trades | 交易查询列表/详情（items 子表 + 银联流水号 + 手续费 + 结算日；导出 CSV 二期不做） | S0, S2（商户数据） | 片内测试 + verify |
| S4 | refunds | 退款列表/发起（一期全额锁定 + 二次确认）/重试（UNKNOWN 先银联查询兜底）/待核查列表 | S3 | 片内测试 + verify |
| S5 | agreements + logs | 协议留痕（关键词必填、手机号关联用户系统）+ 操作日志（复用 sys_log 扩展、关删除） | S0 | 片内测试 + verify |
| S6 | dashboard | 工作台聚合（manual_check 待核查口径 + 通道健康建议 A10）——依赖各业务表有数据形态 | S1-S5 | 片内测试 + verify + accept |

每片 = 后端（entity/mapper/service/controller/dto）+ 前端（vue3 页面 + 路由菜单 SQL）+ 片内测试 + verify。菜单 JeecgBoot db-driven（菜单 SQL 随片交付）。

## 收敛记录要点（已清账）

- trades 三项待确认：PRD 定论收敛（AI 自答，2026-10-20，证据 §P4 L88-91/L205-208、§P5 L94）——_pages.md notes 已更新
- 导出 CSV：PRD 明文二期 → 一期切片不含
- 支付方式开关影响面：merchants 的 3 开关（WECHAT/ALIPAY/UNIONPAY_CARD）+ 微信子商户为空强制关闭

## 双跑规避（起跑前置条件）

Cursor 侧今日产出：schema 评审 + V20261020_1 SQL（untracked）。**起跑前必须确认 Cursor 会话已停**（同一批文件双写 = 游标/半成品互踩）。接管时 backend 的 untracked SQL 先 commit 入基线。

## 执行形态

$apt-intake legacy 轨（batch_* 工具面缺失）：7+1 片入队 → goal 循环程序模式串行推进，每片完成 complete_slice 语义（state 终态 + 证据），全程 verify 卡片，loopDone 出 DELIVERY-SUMMARY。
