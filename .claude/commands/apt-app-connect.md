<!-- apt-template-version: 10.9.5-pro -->
# $apt-app-connect — App 原生开发全流程

复制原型到原生目标仓 → 消费**像素级规格载体** + native-bindings → 迁移清单 + Connect Ledger（含 **`platform.json`**）→ **connect-gate 强契约** → **先按 feature 补后端** → 再 mock→API / 原生对接 → 验收闭环。

适用于已配置原生 `targetPlatforms` 的 App 项目。纯 Web 请用 `$apt-frontend-connect`。

> 只保证编排消费测量级**像素级规格载体**；禁止「保证…还原到原生」类过满承诺。实现质量由 Agent + 人 + `/verify` 门禁负责。

**强要求 ≠ 提示词：** 对接完成靠目标工程 `.apt/connect/` 账本 + `connect-gate.cjs` exit 0，**不是提示词**自觉。共享闸门见 `templates/_connect-strong-contracts.md`。App 额外强制 `.apt/connect/platform.json`。

缺后端接口时：**写清楚「缺少后端接口」**，在对接阶段先补后端再接线；**不要中断、不要不做完**；宣称完成前须 `stage=done` 过闸。

## 使用

```
$apt-app-connect <源工程路径> <目标工程路径> --platform=swiftui|compose|react-native|flutter
```

`--platform` **必填且恰好一个**；必须 ∈ `.apt/project.json` 的 `targetPlatforms`。

多平台示例（同一份 `page.spec.*`，每平台一次 connect）：
```
$apt-app-connect D:\proto\app D:\app-ios --platform=swiftui
$apt-app-connect D:\proto\app D:\app-android --platform=compose
$apt-app-connect D:\proto\app D:\app-flutter --platform=flutter
```

## 执行步骤

参照 apt-app-connect skill 全自动执行：

1. Preflight + 原生门禁 + `--platform` 校验 + 复制原型到目标工程
2. 扫描 mock / API 缺口（query_connect_status）
3. 读 page.logic.md + **page.spec.json/png** + **native-bindings/<platform>.json** → 产出 `migration-<platform>.md` + Ledger + **`platform.json`** → **gate `stage=ledger`**
4. /plan-from-spec：Task A 按域 feature 补后端（在前）→ Task B 该平台原生对接（在后）→ **gate `stage=plan`**
5. /implement-plan：Phase 4a 补后端 → **gate `stage=backend`** → Phase 4b 清 mock + 原生接线（对照 spec + bindings）→ **gate `stage=wire`**
6. /verify（验收）
7. /finish-feature + **gate `stage=done`**（闭环；exit ≠ 0 禁止 Overall 完成）

```bash
node templates/connect-runner/connect-gate.cjs --stage=<ledger|plan|backend|wire|done> --dir=.apt/connect
```

## 硬规则

- 无原生 `targetPlatforms` → **FAIL**（提示改用 `$apt-frontend-connect`）
- 缺 `--platform` / 非法值 / ∉ `targetPlatforms` → **FAIL**
- 缺 `page.spec.json` / `page.spec.png` → **FAIL**
- 缺 `native-bindings/<platform>.json` → **FAIL** + `report_design_gap`
- 缺 `.apt/connect/platform.json`（Phase 2）→ **FAIL**，禁止进 plan
- 迁移清单文件名：`migration-<platform>.md`（避免多平台互相覆盖）
- 发现缺接口 → 清单写「缺少后端接口」+ `required-apis=missing`，进入 plan，**不退出命令**
- 对接前先 feature 补后端，再接线；`stage=backend` 未过禁止 4b
- 不做完不结束；会话过长则续跑；完成靠 `connect-gate` 机制
- 下拉全部走接口或字典，无一例外
- 缺微服务提示架构师；普通缺 Controller 走 feature 补齐
- 不自己做实现——走标准闭环
- done 过闸后在 `progress.json` 顶层如实标 `connectLevel`（`prototype|mock|real-backend|production`，缺省 `prototype`）；未到 `production` 注明剩余步骤一句
