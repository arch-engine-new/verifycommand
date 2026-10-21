# F1-G5 报告：S1 Task 17 / 18 / 19

总体 Status：**DONE_WITH_CONCERNS**（实现与 Verify 全部通过；有 2 处对 plan 字面的必要偏离与 1 个待确认点，见下）

| Task | Status | commit（backend 仓库，分支 paycenter） |
|------|--------|------|
| T17 初始化数据-12 个字典 | DONE_WITH_CONCERNS | `5568aaf` |
| T18 初始化数据-菜单/按钮/角色/协议 | DONE_WITH_CONCERNS | `d6a37fb` |
| T19 `/v1/ping` | DONE | `2cf4fc4` |

## 前置确认（实际库结构，`show create table` @ jeecg-boot）
- `sys_dict`：NOT NULL = id/dict_name/dict_code；`dict_code` 唯一键。12 个目标 dict_code 在正式库**均不存在**（无冲突）。
- `sys_dict_item`：NOT NULL = id/item_text/item_value；仅主键唯一。
- `sys_permission`：仅 id NOT NULL；按钮行风格参考 Jeecg 自带 `V3.9.5_1`（url/component NULL、is_route 0、perms_type '1'、status '1'）。
- `sys_role`：NOT NULL = id/role_code，`role_code` 唯一；`paycenter_operator` 不存在。
- `sys_role_permission`：仅 id 主键，无 (role_id, permission_id) 唯一键 → 以固定 id + `INSERT IGNORE` 保证幂等。
- `pay_agreement_version`：title/content_url/effective_time/create_time NOT NULL，`(agreement_code, version)` 唯一。
- admin 角色 `f6817f48af4fb3af11b9e8bf182f618b`（role_code=admin）**存在**。MySQL 8.0.46。
- MCP `query_arch path=backend/jeecg-boot/jeecg-module-system` 返回 Path not found，已改用库内 DDL 直接确认（以上）。

## T17
- 文件：`jeecg-system-start/src/main/resources/flyway/sql/mysql/V20261020_2__paycenter_init_data.sql`（新增）。
- 12 个 `sys_dict`（id `pc_dict_<code>`，type=0，tenant_id=0，del_flag=0，create_by=admin，create_time=NOW()）+ 46 个 `sys_dict_item`（status=1，sort_order 每字典从 1 递增），`ON DUPLICATE KEY UPDATE`。
- 字典项实数：3+5+3+2+2+3+5+4+9+4+3+3 = **46**，与 plan 一致。
- **偏离 1（字典项 id 规则）**：plan 要求 `pc_di_<code>_<value>` 截断到 32 字符；按字面截断会撞号（如 `pay_admin_log_action` 下 `REFUND_CREATE` 与 `REFUND_RETRY` 截断后同为 `pc_di_pay_admin_log_action_REFUN`）。改为 `pc_di_<字典缩写>_<value>`，缩写表写在 SQL 注释中（pm/pos/ros/ca/bt/fb/ac/as/pal/cbe/cts/nps），最长 26 字符，无截断、无冲突。统计口径 `id like 'pc_di_%'` 不受影响。
- Verify（临时库 `pc_dryrun`）：建库 + `create table ... like` 两表 → `docker cp` + `/tmp/imp.sh pc_dryrun` 执行**两次**均 exit 0 → `pc_dict_%`=12、item 总数=46、中文 hex 正确（`微信`=E5BEAEE4BFA1）→ `drop database pc_dryrun` 成功；`rg -c "#\("` 无命中（exit 1）；文件无 BOM。

## T18
- 同文件追加三段：
  - `sys_permission` 15 条：`pc_menu_root`（parent_id=''，`/paycenter`，`layouts/RouteView`，menu_type 0，is_route 1，is_leaf 0，sort_no 1.5，icon `ant-design:pay-circle-outlined`）；6 个二级菜单 url/component 照 spec 4.11（dashboard/logs is_leaf=1，其余 0，keep_alive 0）；8 个按钮 `pc_btn_<x>`（menu_type 2，perms_type '1'，is_leaf 1）。`ON DUPLICATE KEY UPDATE name`。
  - `sys_role`：`INSERT IGNORE pc_role_operator / paycenter_operator / 支付运营`。
  - `sys_role_permission` 26 条（admin 15 + operator 11），`INSERT IGNORE`。
  - `pay_agreement_version` 5 条（id `pc_agr_<code>_v10`，v1.0，占位 URL，effective_time 2026-10-20 00:00:00，status 1，remark「初始化占位，待法务替换 URL」），`ON DUPLICATE KEY UPDATE title`。
- **偏离 2（角色授权 id 规则）**：plan 写 `pc_rp_<role>_<perm>`（≤32）；若 `<perm>` 用完整权限 id 会超长（如 `pc_rp_admin_pc_btn_merchant_toggle`=35）。实际为 `pc_rp_<admin|op>_<权限 id 去掉 pc_ 前缀>`，最长恰 32（`pc_rp_admin_btn_agreement_config`）。T20 口径 `id like 'pc_rp_%'`=26 不受影响。
- Verify（临时库 `pc_dryrun`，追加 sys_permission/sys_role/sys_role_permission/pay_agreement_version 结构 + 复制 admin 角色行）：执行两次 exit 0；`sys_dict pc_dict_%`=12、item=46、`sys_permission pc_%`=15、admin 授权=15、operator 授权=11、`pc_rp_%`=26、`pay_agreement_version`=5、授权孤儿行=0、role 共 2 行（二次执行未重复）；演练后 `drop database pc_dryrun` 成功。
- 正式库 `jeecg-boot` 复核：`sys_permission pc_%`=0、`sys_dict pc_dict_%`=0 —— **未导入正式库**，留给 T20 Flyway。

## T19
- `openapi/PayPingController`：`@RestController @RequestMapping("/v1")`，`GET /ping` → `PayApiResponse.ok(Map.of("service","paycenter","time",epochMillis))`，内含 `log.info("ping")`（供 T20 按 traceId 核对日志）。
- `PayPingControllerTest`（standalone MockMvc）：200、`$.code=="0000"`、`$.data.service=="paycenter"`、`$.data.time` 为数字。
- Verify：`mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test -Dtest=PayPingControllerTest` exit 0；surefire：Tests run 1, Failures 0, Errors 0。

## 白名单外改动
无。

## 待确认 / 遗留
1. 一级菜单 component 按 plan/spec 用 `layouts/RouteView`；库内 Jeecg 自带一级菜单普遍用 `layouts/default/index`。若 S5 前端路由在 `layouts/RouteView` 下渲染异常，只需改 SQL 中 `pc_menu_root` 一行（T20 前可改；Flyway 执行后需新迁移或后台手改）。
2. 两处 id 命名偏离（上文偏离 1/2）不影响 T20 的计数校验口径。
3. MySQL 8.0.20+ 对 `VALUES()` 函数会给出弃用 warning（不影响执行，Jeecg 自带脚本同类用法普遍）。
