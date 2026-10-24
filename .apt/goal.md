---
goalId: unionpay-channel-message-persist
createdAt: 2026-10-24
---

# 目标

完成批量队列 F-12：银商通道进出 HTTP 报文落库留痕（新建 pay_channel_message 表，UnionPayHttpClient 统一出入口落 5 接口请求+响应原文，落库失败降级不阻断主交易），并通过 /verify 验收闭环。

## 队列指引

- 真源：`.apt/batch/batch.db`；工具链：batch_lock_acquire → batch_next_slice → batch_complete_slice → batch_lock_release
- 队列项：F-12（P2 feature，全链：auto_brainstorm → plan_from_spec → implement_plan → verify → finish_feature；验收标准见台账 ledger #15）
- 收敛记录（需求边界）：请求+响应原文落库（用户确认，body 无密钥）；不落 Authorization 头；不动 pay_notify_record 回调留痕；本期仅银商，表预留 channel 字段
- 报文结构依据：`docs/unionpay/chinaums-api-cheatsheet.md`（PDF 提取速查表，禁凭记忆改报文）
- 注意：本机应用跑在 80 端口做生产联调（natapp 隧道），implement 阶段需停应用重打包，完成后果断重启回 80
