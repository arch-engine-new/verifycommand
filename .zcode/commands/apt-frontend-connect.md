---
---
<!-- apt-template-version: 10.9.5-pro -->
# $apt-frontend-connect — 前端开发全流程

复制原型 → 迁移清单 + **Connect Ledger** → **`connect-gate` 强契约** → **先按 feature 补后端** → 再 mock→API 对接 → 验收闭环。

缺后端接口时：**写清楚「缺少后端接口」**，在对接阶段先补后端再接线；**不要中断、不要不做完**。

**强要求靠机制、不是提示词：** 完成判定依赖 `.apt/connect/` 账本 + `connect-gate.cjs` exit 0。见 `templates/_connect-strong-contracts.md`。

## 使用

```
$apt-frontend-connect <源工程路径> <目标工程路径>
```

示例：
```
$apt-frontend-connect D:\cgm-smart-community-v1\prototype\property-admin-web D:\cgm-app\community-admin-ui
```

## 执行步骤

参照 apt-frontend-connect skill 全自动执行：

1. Preflight + 复制原型到目标工程
2. 扫描 mock 缺口（query_connect_status）
3. 读 page.logic.md + 产出迁移清单（API 接入表：已有 / **缺少后端接口**；组件替换；Mock 清理；下拉走接口）+ 写入 `.apt/connect/`（`pages` / `required-apis` / `required-dropdowns` / `mocks` / `progress`）
4. **强制** `node templates/connect-runner/connect-gate.cjs --stage=ledger --dir=.apt/connect`（未过禁止 plan）
5. /plan-from-spec：Task A 按域 feature 补后端（在前）→ Task B 前端对接（在后）；写 `plan-tasks.json` → **`--stage=plan`**
6. /implement-plan：先 4a 补完后端 → **`--stage=backend`**，再 4b 清 mock 接线 → **`--stage=wire`**（多域串行；可续跑，禁止半截结束）
7. /verify（验收；缺失 API 应已可寻址且 mock 已清）
8. **`--stage=done`** 通过后 /finish-feature（闭环）

## 关键规则

- 发现缺接口 → 清单写「缺少后端接口」+ `required-apis=missing`，进入 plan，**不退出命令**
- 对接前先 feature 补后端，再接线；顺序不可颠倒；`stage=backend` 未过禁止 4b
- 下拉全部走接口或字典，无一例外
- 缺微服务提示架构师；普通缺 Controller 走 feature 补齐
- 不自己做实现——走标准闭环
- 不做完不结束——禁止只复制/写清单就宣称完成；**gate exit ≠ 0 不得 Overall 完成**
- done 过闸后在 `progress.json` 顶层如实标 `connectLevel`（`prototype|mock|real-backend|production`，缺省 `prototype`）；未到 `production` 注明剩余步骤一句
