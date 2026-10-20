---
---
<!-- apt-template-version: 10.9.5-pro -->
# $apt-schema-apply — 评审后落 DO + migration

用户确认「表设计完成」或「评审通过，执行 apply」后，将 schema MD 转为 **DO + migration/DDL**，经扫描入 **EntityGraph**，账本标 `applied`。

## 使用

```
$apt-schema-apply [<feature>] [--apply] [--dry-run]
```

示例：
```
$apt-schema-apply order
# 账本已 ready-for-review 时
$apt-schema-apply order --apply
# 只报告 ApplyPlan / 栈，不写盘、不改 applied
$apt-schema-apply order --dry-run
```

- 触发须满足其一：用户含「表设计完成」/「评审通过，执行 apply」；或 `--apply` 且账本 `ready-for-review`。
- `--dry-run`：机检后只出报告即结束；**默认仍直接落盘**（评审确认后）。

## 执行步骤

参照 apt-schema-apply skill（`.agents/skills/apt-schema-apply/SKILL.md`）全自动执行：

1. Preflight（`query_project_status`）
2. 触发确认（评审语 / `--apply`；`--dry-run` 不豁免）
3. 跑 `check-schema-design`（路径：`<项目>/scripts` → `$APT_HOME/scripts`）；FAIL 停
4. 跑 `check-schema-apply`（路径解析同上）；产出 ApplyPlan + stack（jpa / mybatis / sql-fallback）；FAIL 停。若 `--dry-run` → 报告后结束（不写盘、不改 applied）
5. 按栈写 DO/Entity 或仅 SQL；参考 `templates/schema-apply/*.snippet`；路径：`**/domain/**/dal` → `**/entity` → `**/dataobject` → 否则 `docs/schema/generated/` + WARN；已有文件 diff 停等（禁止静默覆盖）
6. 入图：落盘后 `register_asset` / `refresh_asset` 或提示 sync-changes（**禁止**手改 entities.json）
7. 账本 `applied: yes` + 时间戳（非 dry-run）
8. 输出报告（含 stack / ApplyPlan 摘要）

## 产出物

```
<模块>/.../Entity|DO 或 docs/schema/generated/*（jpa/mybatis）
migration/DDL 草稿（各栈；sql-fallback 仅此）
.apt/schema/progress.md（applied: yes；dry-run 不改）
```

## 禁止

未确认评审即 apply；跳过 design/apply 机检；`--dry-run` 仍落盘或改账本；静默覆盖已有 DO；手改 EntityGraph 索引。
