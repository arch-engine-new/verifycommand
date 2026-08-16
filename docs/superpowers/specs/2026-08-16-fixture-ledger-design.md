---
title: 工装夹具借还台账
status: approved
risk: low
date: 2026-08-16
---

# 工装夹具借还台账 Design Spec

> 落地仓库：`D:\software\dog-food`。本 spec 只冻结产品与狗粮证据要求；**业务代码不由 `/plan-from-spec` 在源码仓手写**，而由该仓库窗口执行 `$apt-create` 生成 PRD / 原型 / page.logic，再走空后端底座 → schema → connect → `/verify` → `$apt-accept`。

## Goal

做一个**略有难度**的工厂工具室 Web 工作台，用来一次跑通立规（APT）从空仓到运行时验收的全流程，并留下可被培训、教学视频引用的证据。

一句话：班组长向工具室借夹具，系统拒绝「别人占用」和「校准过期」；仓管核验归还；工艺员看校准到期看板。

## 范围

- Web 管理端（桌面浏览器），6 个页面（见下）。
- 三种角色：班组长（借用人）、工具室仓管、工艺员（校准日期）。
- 状态机：在库 / 在借 / 超期 / 维修 / 校准锁定。
- 空后端：扫描为空时走开源管理端底座（用户确认 license/SPDX 后落地），再 schema 与 connect。
- 证据目录 `docs/dogfood/`：命令日志、缺口、截图位、验收引用。

## 非目标

- 不做 App / 小程序 / 条码枪硬件对接。
- 不接 SAP、不做出入库财务计价、不做多工厂组织。
- 不做 IoT 传感器、不做自动柜。
- 不在立规源码仓实现本业务。
- 第一期不做打印标签 PDF。

## 验收标准

1. 本地能打开工作台；同一夹具两人并发借出，第二人看到明确失败。
2. 校准到期日 ≤ 今天的夹具，借出申请被拒绝，文案含「校准」。
3. 超期清单能列出预计归还日已过仍在借的单据。
4. 归还核验：完好回库；损坏转入维修。
5. 知识门禁 `/verify` 对本次实现有报告；运行时 `$apt-accept --base-url=<本地>` 能按 page.logic 勾选必验点。
6. `docs/dogfood/COMMAND-LOG.md` 与 `GAPS.md` 有至少一轮真实记录，可供后续培训/视频当资料源。

## 方案选择（已冻结）

曾对比三案：

| 方案 | 难度 | 对全流程的压力 | 结论 |
|------|------|----------------|------|
| A 工装借还 + 校准锁定 | 中 | 状态机 + 日期 + 冲突 + 三角色，页面够 connect/accept 抽 RP | **采用** |
| B 质量异常 NCR / 8D 闭环 | 偏高 | 附件与审批链过长，第一次狗粮容易做不完 | 不采用 |
| C 班组交接班日志 | 偏低 | 缺冲突与锁定，验证底座/schema 偏弱 | 不采用 |

推荐理由：够难（冲突占用、校准锁定、超期、损坏分流），又收得住（6 页、无硬件），工厂场景适合以后当演示片。

## 设计

### Architecture

- 前端：`$apt-create` 产出的 Web 原型工程（页面路由与 page.logic 为产品真源）。
- 后端：空仓先底座（管理端类蓝图，确认后 clone），再按 schema 落表。
- 知识：`start-init` 已有空索引；底座落地后必须再扫；产品源 `product-init`；含 UI 则 `design-sync`。
- 对接：`frontend-connect` 账本走到 `done`，再 `/verify`，最后本地起服务跑 `$apt-accept`。

### Components（页面）

| pageId | 标题 | 类型 | 路由草案 |
|--------|------|------|----------|
| fixture-list | 夹具台账 | list | `/fixtures` |
| fixture-detail | 夹具详情（主数据 + 借还历史） | detail | `/fixtures/:id` |
| checkout-form | 借出申请 | form | `/checkouts/new` |
| checkout-list | 在借 / 超期清单 | list | `/checkouts` |
| return-form | 归还核验 | form | `/returns/new` |
| calibration-board | 校准到期看板 | list | `/calibration` |

### Data flow

1. 工艺/仓管维护夹具：编码、类型（字典）、状态、校准到期日。
2. 班组长提交借出：夹具、预计归还、用途 → 校验在库且未校准锁定且未被占用 → 写借出单、夹具改在借。
3. 定时或打开清单时：预计归还日 < 今天且仍在借 → 超期。
4. 仓管归还：完好 → 在库；损坏 → 维修（本单关闭，夹具不可借直到仓管改回在库）。
5. 看板：到期前 7 天预警；到期当日及以后 = 校准锁定（即使在库也不可借）。

### Error handling

- 占用冲突：返回可读错误，不写第二张在借单。
- 校准锁定：拒绝借出，提示最近校准到期日。
- 无权限：班组长不能改校准日期；工艺员不能做归还核验（仓管做）。
- 底座 clone：必须用户确认许可与 SPDX；禁止静默覆盖已有锁。

### Testing

- create 产出的 `test-cases.md` / 必验点覆盖：冲突借出、校准拒绝、超期列表、损坏转维修。
- `/verify`：有产品源则 Product Alignment；有 connect 账本则 Connect 门禁。
- `$apt-accept`：`--base-url` 指向本地前端；Playwright 依赖须已随安装脚本装过。

## Ontology detection

- 本会话 `query_ontology()`：命中的是**立规源码仓**全景（工具仓），不是 dog-food。
- `query_ontology(topic=blueprint)`：源码仓有蓝图查询/落地与 `QueryBlueprintInput` / `ApplyBlueprintInput` 等契约。
- dog-food 本地 `last-scan`：`modules` / `packages` 皆空，`designs/v0/_features.md` 仅示例行。

复用决策：

- **不复用**源码仓任何业务模块进本工作台（那是产品本身，不是客户应用）。
- **复用**空后端底座能力（查询 2–3 张卡 → 用户确认 → 落地 → 下一步固定再扫描），这是本狗粮要验证的路径。
- **不复用** `_features.md` 里的 `user-management` 示例行当真实功能；create 后以正式页面清单为准。

## 拟改动文件（本 spec 直接写入，≤5）

- `docs/superpowers/specs/2026-08-16-fixture-ledger-design.md`（本文件）
- `.apt/create/brief.md`
- `docs/dogfood/README.md`
- `docs/dogfood/COMMAND-LOG.md`
- `docs/dogfood/GAPS.md`

业务工程文件由 `$apt-create` 及后续命令在 dog-food 生成，不计入本 spec 的手写文件数。
