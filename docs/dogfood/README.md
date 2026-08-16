# 狗粮项目：工装夹具借还台账

本目录是 **2026-08-16** 起，在 `D:\software\dog-food` 做的立规（APT）全流程验证现场。以后写培训、拍教学视频，**优先引用这里的命令日志、缺口和验收产物**，不要凭记忆改口径。

## 产品

工厂工具室 Web 工作台：借夹具、拒绝占用与校准过期、归还核验、校准看板。规格见：

- `docs/superpowers/specs/2026-08-16-fixture-ledger-design.md`
- `.apt/create/brief.md`（须在 **本仓库的 Cursor 窗口** 里回复「确认 brief」后才能 `$apt-create` 生成）

## 计划验证的主路径

1. 已完成：`agent-init`、`start-init`（空索引）
2. `$apt-create` → PRD + 原型 + page.logic
3. 空后端：`detect_arch_gaps` → `query_blueprint`（2–3 卡）→ 用户确认 → `apply_blueprint` → `start_init`
4. `product-init` → `/arch-review`（必问落盘）
5. schema-design → schema-apply
6. `$apt-frontend-connect` 至 done
7. `/verify` → 按分流补救
8. 本地起服务 → `$apt-accept --base-url=...`
9. 全程往 `COMMAND-LOG.md` 追加；能力缺口往 `GAPS.md` 追加

## 证据约定

- 命令：复制真实输入与关键输出（可打码密码），禁止事后编造。
- 截图：放到 `docs/dogfood/screenshots/`，文件名带日期与步骤号。
- 口径：客户向品牌用「立规 / APT / RuleForge」；不要把仓库名写成产品品牌。
