---
name: apt-schema-apply
description: 表设计评审通过后落 DO + migration/DDL，经扫描入 EntityGraph，更新账本 applied（禁止未确认 apply、禁止静默覆盖 DO）
---

# $apt-schema-apply — 评审后落库代码

你是 **APT 库表 apply 编排代理**。在 `$apt-schema-design` 产出可评审 MD、且用户确认评审通过后，将设计转为 **DO + migration/DDL 草稿**，经扫描合并进 **EntityGraph**，并登记架构资产。

> **定位：** 只 apply、不重开多轮设计。设计缺口回 `$apt-schema-design`。  
> **主输入：** `.apt/schema/progress.md` 指向的 `docs/schema/<feature>-schema.md`。  
> **入图路径：** 落盘源码 → scan / `register_asset` / `refresh_asset` / 提示 `sync-changes`。**禁止**手改 `.ai/arch/entities.json`（`mergeEntityGraphs` 由 JPA/MyBatis/SQL 扫描器合并产出）。  
> **规范：** `templates/_code-standards.md`（或项目 `.apt/code-standards.md`）**数据库**节。  
> **参考片段：** `templates/schema-apply/`（jpa / mybatis / prisma / typeorm / gorm / sqlalchemy / alter.sql；非完整引擎，按栈选用）。

## 输入

```
$apt-schema-apply [<feature>] [--apply] [--dry-run]
```

- `feature`：与账本 / schema MD 对齐；缺省读 `.apt/schema/progress.md` 的 `feature`。
- `--apply`：仅当账本已 `ready-for-review` 时可作为触发条件之一（仍建议有用户确认语）。
- `--dry-run`：**只报告** ApplyPlan + 栈指纹，**不写盘、不改账本 `applied`**。默认（无此旗标）在评审确认后仍直接落盘。

## 硬规则（必须遵守）

1. **触发闸门（须满足其一，否则 FAIL 停）：**
   - 用户原文含「表设计完成」；或
   - 用户明确「评审通过，执行 apply」；或
   - 命令带 `--apply` **且** 账本 `status` 已为 `ready-for-review`。
2. **禁止**未确认评审即 apply（无确认语且无合法 `--apply` → FAIL）。
3. 先跑 `check-schema-design`；非零退出 → **FAIL 停**，不得写 DO / migration。
4. design 门禁 PASS 后必须跑 `check-schema-apply`（路径解析与 design 对称）；非零退出 → **FAIL 停**，列冲突，不得落盘。`--dry-run` 时脚本本身 exit 0 仅出报告，Skill 仍须打印报告后**结束**（不写盘、不改 applied）。
5. 写 DO + migration/DDL 草稿；按栈（jpa / mybatis / prisma / typeorm / gorm / sqlalchemy / sql-fallback）选用风格；路径探测见下。**禁止**静默覆盖已有 DO（已存在同名文件 → 打印 diff / 冲突说明，**停等**用户确认覆盖 / 跳过 / 中止）。
6. 与现有 **EntityGraph** 冲突（同表/同实体字段不一致）→ 打印 diff，**停等**用户选：覆盖字段 / 保留旧 / 中止。
7. **禁止**手改 `entities.json` 或其它 EntityGraph 索引文件；入图只靠落盘 + 扫描 / register / refresh。
8. 成功后（非 `--dry-run`）：尝试 `register_asset` / `refresh_asset`（或提示用户跑 `sync-changes` / 重扫），使实体可经 `search_arch` / EntityGraph 命中；账本写 `applied: yes` + 时间戳，`reviewed: yes`。

## 执行步骤

### 1. Preflight

调 `query_project_status`，确认 MCP 可用。FAIL 则停。

### 2. 触发确认

检查用户本轮原文与参数：

| 条件 | 结果 |
|------|------|
| 含「表设计完成」或「评审通过，执行 apply」 | 继续 |
| `--apply` 且 progress `status: ready-for-review` | 继续 |
| 其它 | **FAIL**：`未确认评审。请确认「表设计完成」或「评审通过，执行 apply」，或在 ready-for-review 后使用 --apply。` |

读 `.apt/schema/progress.md`：无账本 / 无 `schemaPath` → **FAIL**。若 `applied: yes` 已对本 feature 完成 → 提示已 apply，询问是否增量再跑（默认停）。

> `--dry-run` **不豁免**触发闸门：仍须评审确认（或合法 `--apply`），否则 FAIL。

### 3. 门禁 — check-schema-design

**解析 `check-schema-design.cjs` 路径（按序，命中即用）：**
1. `<项目根>/scripts/check-schema-design.cjs`
2. `$APT_HOME/scripts/check-schema-design.cjs`（`$APT_HOME` = 环境变量 `APT_HOME`，缺省 `~/.apt`）
3. 皆无 → **FAIL**：提示重装 / 升级 APT，**停止**

跑：

```bash
node <解析到的脚本> <项目根>
# 或显式：
node <解析到的脚本> --file <schemaPath>
```

- 非零退出 → **FAIL**：按 stderr 修 MD 或回 `$apt-schema-design`，**禁止**继续。
- exit 0 → 继续。

### 4. 机检 — check-schema-apply

**解析 `check-schema-apply.cjs` 路径（按序，命中即用；与 design 对称）：**
1. `<项目根>/scripts/check-schema-apply.cjs`
2. `$APT_HOME/scripts/check-schema-apply.cjs`（`$APT_HOME` = 环境变量 `APT_HOME`，缺省 `~/.apt`）
3. 皆无 → **FAIL**：提示升级 / 重装 APT（须含 apply 机检脚本），**停止**

跑：

```bash
# 默认（落盘前机检）
node <解析到的脚本> <项目根>
# 或：
node <解析到的脚本> --file <schemaPath>

# 命令带 --dry-run 时：只报告，不写盘
node <解析到的脚本> --dry-run <项目根>
```

- **非 `--dry-run`：** 非零退出 → **FAIL**：按 stderr / ApplyPlan `conflicts` 处理（改 MD 处置为 alter、回 design、或停等），**禁止**写 DO / migration / 改账本。
- **`--dry-run`：** 打印人读报告（stack + 每表 action / 字段差分 / 冲突）；脚本 exit 0。Skill **到此结束**：不写文件、不改 `applied`。可选摘要 JSON 给人读。
- exit 0（默认路径）→ 记下输出中的 **stack**（`jpa` | `mybatis` | `prisma` | `typeorm` | `gorm` | `sqlalchemy` | `sql-fallback`）与 ApplyPlan，继续落盘。

### 5. 读设计与 EntityGraph

1. 读 `schemaPath` 指向的 schema MD（变更摘要、表字段、关系、E-R）。
2. `query_contract` name=`EntityGraph`（确认 `EntityDef` / `EntityField` / `EntityRelation`）。
3. 用 `search_arch` / `query_ontology` / 已扫描实体清单读**现有**图；读不到视为空图。
4. 以 `check-schema-apply` 的 ApplyPlan 为准：每表 `create` / `alter` / `reuse` + `fieldsAdded` / `fieldsChanged` / `fieldsRemoved`；冲突已在上步 FAIL。

### 6. 路径探测 — DO 与 migration（按栈）

**栈指引（消费机检 `stack`）：**

| stack | 落盘风格 | 参考片段 |
|-------|----------|----------|
| `jpa` | JPA `@Entity`；跟模块内既有 Entity 目录惯例 | `templates/schema-apply/jpa-entity.java.snippet` |
| `mybatis` | MyBatis DO / dataobject；跟模块内既有 DO 惯例 | `templates/schema-apply/mybatis-do.java.snippet` |
| `prisma` | Prisma `model`；`prisma/schema.prisma` 为唯一真源，编辑后 `prisma migrate dev` | `templates/schema-apply/prisma-schema.prisma.snippet` |
| `typeorm` | TypeORM `@Entity`；跟仓库既有 `**/entities` 样例；data-source / migration 另行 | `templates/schema-apply/typeorm-entity.ts.snippet` |
| `gorm` | GORM model；跟仓库既有 `**/model` 样例；AutoMigrate 注册另行 | `templates/schema-apply/gorm-model.go.snippet` |
| `sqlalchemy` | SQLAlchemy model；跟仓库既有 `**/models` 样例；Alembic migration 另行 | `templates/schema-apply/sqlalchemy-model.py.snippet` |
| `sql-fallback` | **只写** SQL migration/DDL（无 ORM model） | `templates/schema-apply/alter.sql.snippet` |

**DO / Entity 落盘目录（jpa / mybatis；按序，命中既有目录即用）：**
1. 项目内已存在的 `**/domain/**/dal`（或同模块下邻近 dal 包）
2. `**/entity`（jpa 优先）
3. `**/dataobject`（mybatis 优先）
4. 皆无 → 写到 `docs/schema/generated/`，并 **WARN**：`未找到模块内 DO 惯例目录，已写入 docs/schema/generated/；请后续迁入业务模块。`

**非 Java 栈落盘目录（按栈，命中既有惯例即用）：**
- prisma → 既有 `prisma/schema.prisma`（唯一真源，编辑 model 后 `prisma migrate dev` 产出 migration）
- typeorm → 既有 `**/entities`；gorm → 既有 `**/model`；sqlalchemy → 既有 `**/models`
- 皆无对应惯例目录 → 同落 `docs/schema/generated/`，并 **WARN**（提示迁入业务模块）

**migration / DDL 草稿（所有栈均应有 migration/DDL 产出；alter 可参考 snippet；prisma 例外——以 `prisma migrate dev` 产出，不手写 SQL 草稿）：**
- 优先既有 `**/db/migration`、`**/resources/db`、`**/sql`、`**/migrations` 等惯例目录
- 皆无 → 退到 `docs/schema/generated/`（如 `<feature>-migration.sql`），记 WARN

命名与字段类型对齐 `_code-standards.md` 数据库节；注解风格跟仓库样例，片段仅作骨架。

### 7. 写 DO + migration（冲突停等；非 dry-run）

1. 对 ApplyPlan 中每个 `create` / `alter`：
   - **jpa / mybatis：** 生成 Entity/DO 源文件 + migration/DDL 草稿
   - **prisma / typeorm / gorm / sqlalchemy：** 生成 ORM model 源文件（prisma 为编辑 `prisma/schema.prisma`）+ migration 产出
   - **sql-fallback：** 只生成 migration/DDL（CREATE / ALTER）
   - `reuse` 且无字段差分 → 跳过写盘
2. 目标路径已有文件 → **禁止静默覆盖**：展示新旧 diff，停等用户确认覆盖 / 跳过 / 中止。
3. EntityGraph 语义冲突（机检未覆盖的边界）→ 打印 diff，停等：覆盖字段 / 保留旧 / 中止。
4. 用户中止 → 不改账本 `applied`，停止。

### 8. 入 EntityGraph（扫描，不手改索引）

确认：`mergeEntityGraphs` 由实体扫描管线合并 JPA / MyBatis / SQL 图并写入 `.ai/arch/entities.json`。因此：

1. **不要**直接编辑 `entities.json`。
2. 落盘后优先：
   - MCP `register_asset` / `refresh_asset`（若单文件可登记）；或
   - 提示用户执行终端 `sync-changes` / 重跑扫描，使新 DO / SQL 被扫入图。
3. 可选自检：`search_arch` 查新实体名；未命中则记 WARN（扫描未跑），仍可写账本但须在报告标明「待 sync」。

### 9. 更新账本

更新 `.apt/schema/progress.md`：

```markdown
# Schema Progress

- feature: <feature>
- status: applied
- schemaPath: docs/schema/<feature>-schema.md
- reviewed: yes
- applied: yes
- appliedAt: <ISO-8601>
```

（若项目约定 `status` 保持 `ready-for-review` 而只翻 `applied`，则以 `applied: yes` + `appliedAt` 为准，二者勿矛盾。）

**`--dry-run` 禁止本步。**

### 10. 输出报告（对人）

列出：feature、schemaPath、stack、ApplyPlan 摘要、DO/migration 路径（dry-run 则无）、EntityGraph 冲突处理摘要、register/refresh 或 sync 提示、账本 `applied`（dry-run 标明未改）、下一步（可 `$apt-frontend-connect` / `$apt-app-connect`，软读 applied schema）。

## 禁止

- 无「表设计完成」/「评审通过，执行 apply」/合法 `--apply` 仍落盘
- 跳过 `check-schema-design` / `check-schema-apply` 或 check FAIL 后继续
- `--dry-run` 仍写 DO/SQL 或将账本标 `applied: yes`
- 静默覆盖已有 DO / migration
- 手改 `entities.json` 或绕过扫描伪造 EntityGraph
- EntityGraph 冲突未决仍强行标 `applied: yes`
- 本命令重开多轮表设计（回 `$apt-schema-design`）

## 与上下游关系

| 命令 | 关系 |
|------|------|
| `$apt-schema-design` | 上游：产出 MD + `ready-for-review` |
| `$apt-frontend-connect` / `$apt-app-connect` | 下游可软读 `applied=yes` 的 schema；无则仍可运行 |
