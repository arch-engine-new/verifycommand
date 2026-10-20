---
goal: 首筑支付中心 v1.0 一期后端与操作后台（S1–S5）一次性实现
programMode: true
createdAt: 2026-10-21T07:05:00+08:00
---

# 目标

按批量队列 F-1 → F-5（S1 工程骨架与基础设施、S2 银联通道适配、S3 交易核心与内部接口、S4 可靠性闭环、S5 操作后台 7 页）串行完成实现，每片通过 `/verify` 门禁后再进入下一片。

## 队列指引

- 切片来源：MCP `batch_next_slice`（真源 `.apt/batch/batch.db`），完成后 `batch_complete_slice` 回传。
- 每片 spec 在 `docs/superpowers/specs/2026-10-20-paycenter-s{1..5}-*-design.md`；F-1 的 plan 已 approved：`docs/apt/plans/2026-10-20-paycenter-s1-foundation-plan.md`。
- 运行时验收（`/apt-accept`）不在本批：用户提供银联商户号/子商户号等参数后另行触发。
