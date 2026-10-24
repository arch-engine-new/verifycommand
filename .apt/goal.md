---
goalId: unionpay-vamchntno-align
createdAt: 2026-10-24
---

# 目标

完成批量队列 B-1：银联查询/退款/退款查询/关单 vaMchntNo 对齐主商户号 + 退款补 satInfo 分账明细，并通过 /verify 验收闭环。

## 队列指引

- 真源：`.apt/batch/batch.db`；工具链：batch_lock_acquire → batch_next_slice → batch_complete_slice → batch_lock_release
- 队列项：B-1（P1 bug，轻链，验收标准见台账 ledger #11）
- 报文对照依据：`docs/unionpay/chinaums-api-cheatsheet.md`（PDF 提取速查表，禁凭记忆改报文）
