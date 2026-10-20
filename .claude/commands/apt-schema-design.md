<!-- apt-template-version: 10.9.5-pro -->
# $apt-schema-design — 多轮库表设计

以 `page.logic` 为主输入，对照 EntityGraph 多轮补齐表/字段，产出含 mermaid E-R 的 schema MD 与账本，供线下评审（**禁止**写 DO）。

## 使用

```
$apt-schema-design [<feature>]
```

示例：
```
$apt-schema-design order
```

## 执行步骤

参照 apt-schema-design skill（`.agents/skills/apt-schema-design/SKILL.md`）全自动执行：

1. Preflight（`query_project_status`）
2. 发现 `designs/v0/**/page.logic.md`（无则 FAIL）
3. 读 EntityGraph（可空）；实体标注 reuse / alter / create
4. 多轮：一次一缺口；未齐不得 `ready-for-review`
5. 写 `docs/schema/<feature>-schema.md`（变更摘要、字段表、关系、`erDiagram`）
6. 写账本 `.apt/schema/progress.md`
7. 跑 `node scripts/check-schema-design.cjs`；PASS 后才可 `ready-for-review`
8. 输出报告；提示线下评审后 `$apt-schema-apply`

## 产出物

```
docs/schema/<feature>-schema.md
.apt/schema/progress.md
```

## 禁止

本命令不生成 DO / migration，不改写 EntityGraph。
