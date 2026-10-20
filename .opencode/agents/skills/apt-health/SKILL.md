---
name: apt-health
description: 产品逻辑健康度自检 — 随时对 APT 产品自身（命令条文/关联模板/gate 脚本/平台镜像）做整体逻辑性自检：机械快检（C1–C8 聚合检查器，秒级）+ 命令条文语义深检（--deep 按命令派 agent 四镜头审查），findings 分级报告落盘 SSOT 并对照上轮趋势
---

# $apt-health — 产品逻辑健康度自检（快检 + 深检）

你是产品逻辑健康度自检代理。本命令**随时**对 APT 产品自身做整体逻辑性自检：默认**快检**秒级跑 L1 机械不变量聚合检查器（C1–C8，全量命令覆盖）；`--deep` **深检**在快检全跑之上，按命令派 agent 对「SKILL + 关联模板 + gate 代码」三角做语义审查。全程**只报告不修改**——findings 是人工裁决与修复流的输入，不是自动补丁。

设计依据：`docs/superpowers/specs/2026-09-04-apt-health-command-design.md`（数据基线：每条检查项绑定真实故障；四镜头对齐 P1–P5 语义缺陷实录）。

## 输入

```
$apt-health [--deep] [--fast] [--scope=<逗号列表>|all]
```

- **（默认）快检**：只跑 L1 机械检查器，零 LLM、秒级、全量命令覆盖
- **--deep**：L1 全跑 + L2 语义审查（§2，逐命令派审查 agent）
- **--fast**：透传给检查器——C6 门禁全家桶跳过 npm test 腿（快循环用）
- **--scope=...**：仅深检生效；`--scope=verify,accept` 子集 / `--scope=all` 全量

## 1. 快检（默认模式）

仓库根跑聚合检查器 `node scripts/check-product-health.cjs`（支持 `--json` 结构化输出、`--root=X` 替代根——单测/fixture 用）。八项独立判定，聚合 exit code = 最劣项：

| # | 检查项 | 抓的故障类 |
|---|--------|-----------|
| C1 | 镜像一致性（intake 组 md5 唯一值 + matrix gate） | 平台副本漂移 |
| C2 | 三方对齐（AGENTS 命令表 ↔ skills 目录 ↔ zcode commands；frontmatter name = 目录名） | 命令表面漂移 |
| C3 | 版本戳一致（apt-template-version == 根 package.json version） | bump 后 inject 漏刷 |
| C4 | 交叉引用闭合（保守悬空检测；误伤走检查器内 EXEMPT 豁免表校准） | 悬空引用 |
| C5 | 术语拼写一致（大小写敏感，白名单核心术语集） | 术语漂移 |
| C6 | 门禁全家桶（check-release-delivery / check-helper-references / npm test；`--fast` 跳 npm test 腿） | 既有门禁回归 |
| C7 | action 枚举一致（snake_case 词 ⊆ 命令映射 + 非命令白名单） | 孤儿 action 引用 |
| C8 | 安装器双平台对等（install.ps1 ↔ install.sh 的 pin / APT_* env / marker 三集合逐项比对） | 平台安装契约分裂 |

- **Overall（快检）**：任一项 FAIL = FAIL；全 PASS = PASS。C1–C8 **逐项结果**原样进报告 L1 表，禁止只贴聚合结论
- 检查器单项内部异常 = 该项 FAIL（检查器内已兜底，不静默跳过）；检查器自身无法执行（node 环境故障等）→ Overall **BLOCKED**（非业务 FAIL）
- 检查项误伤合法表述 → 走检查器内 EXEMPT / 白名单校准（首轮实测为准），不改本命令口径

## 2. 深检（--deep）

### 2.1 范围、增量与预算（先展示预算，用户确认后才派发）

- **默认范围 = 核心链路 8 命令**：intake / goal / feature / verify / accept / implement-plan / plan-from-spec / finish-feature
- `--scope=<逗号列表>` 指定子集；`--scope=all` 全量（以 AGENTS.md 命令表为准）
- **增量策略**：上轮 `latest.json` 中 severity ∈ {Critical, Important} 的 findings 所在命令**自动并入**本轮范围（与默认 / 指定范围合并去重）
- **预算提示（硬前置）**：默认 8 命令估 **5–15M tokens**/轮；`--scope=all` 按比例放大。`--deep` 前必须展示预算并获用户确认，未确认不派发
- 每命令一行审查结论（含耗时 / token，可得时）记入报告，供下轮预算决策

### 2.2 派发（逐命令一个审查 agent）

- 审查对象三角（prompt 内写明具体文件清单）：**SKILL**（`templates/.agents/skills/apt-<命令名>/SKILL.md`）· **关联模板**（该条文正文引用的 templates 片段）· **gate 代码**（守该命令判据的 scripts/check-* 与 goal-runner 脚本）
- 审查 agent prompt = §3 模板**整块复制** + 审查对象清单（自包含，不依赖本会话上下文，不依赖子 agent 内调 Skill 工具）
- agent 失败 / 超时 → 该命令记 **BLOCKED**（不算 FAIL，报告注明；路由见 §5），禁止空转重试拖死整轮

## 3. L2 审查 prompt 模板（内联 SSOT——派发时整块复制，禁止临场增删镜头）

```
你是 APT 产品条文语义审查 agent。审查对象：<命令名>
  1) SKILL：templates/.agents/skills/apt-<命令名>/SKILL.md
  2) 关联模板：从 SKILL 正文的「见 X」类 templates 引用自行提取并读取
  3) gate 代码：守该命令判据的脚本（scripts/check-* / templates/goal-runner/），自行判断并读取

固定四镜头，逐文件过，缺一不可：
  ① 链路矛盾——终点判定/步骤顺序跨文件是否一致（实录 P4：样例链 verify→accept→finish 与 SKILL 终点判定矛盾）
  ② 条文缺口——A 侧契约 B 侧缺失（实录 P1：回填契约只写 intake 侧、执行侧缺失 → gate 死锁）
  ③ 防护缺失——重入/覆盖/边界场景无守卫（实录 P3：已有常规 goal 无防护被静默覆盖）
  ④ 措辞因果——校验归属/条件表述与代码行为不符（实录 P5：「三道校验挂 sourceDoc」实为两道）

审查基准 = .apt/health/baselines.md（产品不变量宪法）——逐条对照，
每条不变量给出「仍满足 / 失守（附证据）」结论；禁止凭感觉自由发挥，禁止引入清单外「应该」。

每条 finding 强制三要素，缺一即整条无效：
  - severity：Critical（链路断裂/死锁/静默覆盖）｜Important（语义缺陷/契约缺口）｜Minor（措辞/排版）
  - 证据：文件:行（须可人工秒验）
  - 建议修复：一句话（只建议，不动手）

硬纪律：只报告不修改——不写任何文件、不跑任何写侧操作；读文件 + 输出报告，仅此而已。
输出格式：findings 列表（可为空）+ 末行「<命令名>: 审毕，N findings（Critical x / Important y / Minor z）」。
```

## 4. 报告 SSOT（.apt/health/latest.md + latest.json）

快检 / 深检完毕**必须落盘双文件**（人读 md + 机读 json）。**Overall 只许 `PASS | FAIL | BLOCKED` 且两文件必须一致**（verify 同款硬规则）。

`latest.md` 模板：

```markdown
# APT 产品健康度报告
> Date: <ISO8601>｜Mode: fast｜deep｜Scope: <full / 命令列表>

**Overall: PASS**

## L1 机械检查（C1–C8 逐项）
| # | 检查项 | 结果 |
|---|--------|------|
| C1 | 镜像一致性 | PASS |
| …（C2–C8 逐行列出，禁止省略） | | |

## L2 语义 findings（快检写「未执行（快检模式）」）
| # | 命令 | severity | 镜头 | 证据（文件:行） | 建议修复 |
|---|------|----------|------|----------------|----------|

（附每命令一行审查结论，含耗时 / token（可得时））

## 趋势对照（vs 上轮 latest.json）
- 新增：<列表｜首轮>
- 已修复：<列表>
- 仍开放：<列表>

## Recommended next steps
（按 §5 路由生成实际行）
```

`latest.json` 模板（字段名固定，`overall` 枚举外值禁止写入）：

```json
{
  "overall": "PASS",
  "date": "<ISO8601>",
  "mode": "fast",
  "scope": [],
  "l1": [{ "id": "C1", "pass": true }],
  "findings": [
    { "command": "accept", "severity": "Critical", "lens": "链路矛盾", "evidence": "path:line", "fix": "…" }
  ],
  "trend": { "baseline": null, "new": [], "fixed": [], "open": [] },
  "notes": []
}
```

- **Overall 判定**：L1 任一 FAIL ∨ L2 存在 Critical = **FAIL**；深检存在 BLOCKED 命令（或检查器无法执行）= **BLOCKED**；其余 = **PASS**（仅 Important / Minor 时在 md Overall 行下注记条数——即设计稿 PASS-WITH-NOTES 语义；json `overall` 仍写 `"PASS"`，注记进 `notes` 数组）
- **趋势对照**：读上轮 `latest.json`，按「命令 + 证据」比对——上轮有本轮无 = 已修复；两轮皆有 = 仍开放；本轮新现 = 新增；**无上轮报告 → 趋势节写「首轮」**

## 5. 报告路由（Recommended next steps，按实际情形写进报告尾）

| 情形 | 路由 |
|------|------|
| Critical / Important findings | **人工裁决后** `/feature` 立项修复，或人工确认后直接修——本命令与审查 agent 均禁止自行修复 |
| 仅 Minor | 择期处理（未修则下轮趋势节「仍开放」持续可见） |
| 深检 BLOCKED（agent 失败 / 超时） | 修环境后 `--scope=<该命令>` 单独重跑 |
| L1 任一 FAIL | 按 FAIL 行处置（真问题修复，或 EXEMPT / 白名单校准误伤）后重跑快检 |
| PASS 且无未决 findings | 无动作，报告留档 |

## 硬规则

- **只报告不修改**：本命令与深检 agent 一律不写产品文件、不跑写侧 MCP / 写侧命令；修复只发生在人工裁决之后的下游流程
- **findings 无证据行无效**：每条必须带可人工秒验的 `文件:行` 证据；给不出证据的「感觉」发现一律丢弃
- **baselines 逐条对照**：L2 审查必须对 `.apt/health/baselines.md` 每条不变量给出对照结论，禁止凭感觉、禁止引入清单外标准
- **findings 人工裁决后才进修复流**：Recommended next steps 只是建议，采纳与否由用户决定
- **Overall 双文件一致**：latest.md 与 latest.json 的 Overall 必须同值，枚举仅 `PASS | FAIL | BLOCKED`
- 快检结论必须含 C1–C8 **逐项**结果；深检范围必须含增量并入的命令，禁止静默缩圈
