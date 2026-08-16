# 命令与输出日志

按时间追加。每条至少：时间、步骤、命令/工具、结果摘要、产物路径。

| 时间 (UTC+8) | 步骤 | 命令或工具 | 结果 | 产物 |
|--------------|------|------------|------|------|
| 2026-08-16 | 接入 | `agent-init` | 八端命令与项目 MCP 已在盘上 | `.mcp.json`、`.cursor/`、`AGENTS.md` |
| 2026-08-16 | 扫描 | `start-init` | 空仓索引；modules/packages 皆空 | `.ai/arch/last-scan.json` |
| 2026-08-16 | 立项 | 在源码仓会话选定产品并写 brief | brief `confirmed: no`，待本仓库窗口确认 | `.apt/create/brief.md` |

（后续 `$apt-create` / 底座 / connect / verify / accept 在本表续写。）
