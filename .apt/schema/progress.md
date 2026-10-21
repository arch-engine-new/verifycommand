# Schema Progress

- feature: paycenter-s2.5-multi-subject
- status: ready-for-review
- schemaPath: docs/schema/paycenter-s25-multi-subject-schema.md
- reviewed: yes
- applied: yes
- appliedAt: 2026-10-21T20:05:00+08:00
- confirmedBy: 用户原话「批准」（2026-10-21 会话，触发闸门 = 用户确认 + --apply + ready-for-review）
- round: F-6（S2.5 多支付主体，2026-10-21）
- applied-gate: 2026-10-21 check-schema-apply PASS（stack=sql-fallback）；Flyway V20261021_1 success=1（flyway_schema_history）；16 表结构核对通过（pay_subject 22 列、下线列 0 残留、subject_id 三表就位、pay_scene 字典 4 项）
- stack: sql-fallback（DDL 已由 Flyway 落库；MyBatis-Plus 实体类在 implement 计划 T1/T2 生成，见 docs/apt/plans/2026-10-21-paycenter-s25-multi-subject-plan.md）
- migration: backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/flyway/sql/mysql/V20261021_1__paycenter_s25_subject.sql
- entitygraph: 落实体后经 register/refresh/sync-changes 入图（S1 14 表已入图，S2.5 +2 表）
- design-basis: 用户 2026-10-20 收敛确认（inbox I-1→F-6）：cred=per_subject、route=by_app、sub=mapping、scene=APP/WECHAT_MP/MINI_PROGRAM/H5、order=before_s3
- inputs: docs/schema/paycenter-schema.md（S1 基线，14 表已 applied）+ V20261020_1 DDL + 用户确认稿
- gap-resolutions: 主体 Credential 迁移来源 pay_channel_config（用户已确认）；子商户映射 uc 含 project_id（用户已确认）；project_id 哨兵 ''（MySQL uk 空值缺陷，待评审要点 1）；pay_channel_config uk→(channel_code,env)（降级环境级，待评审要点 2）；下单不加 subjectCode 入参（用户已确认）
- gate: 2026-10-21 check-schema-design：PASS；待用户原话门禁「评审通过，执行 apply」或「表设计完成」

---

# Schema Progress（历史归档：S1 round）

- feature: paycenter
- status: applied
- schemaPath: docs/schema/paycenter-schema.md
- reviewed: yes
- applied: yes
- appliedAt: 2026-10-20T20:20:00+08:00
- stack: sql-fallback（只产出 DDL；MyBatis-Plus 实体类在 implement-plan 阶段生成）
- migration: backend/jeecg-boot/jeecg-module-system/jeecg-system-start/src/main/resources/flyway/sql/mysql/V20261020_1__paycenter_init_tables.sql
- database: docker paycenter-mysql（mysql:8.0.46，localhost:3307，库 jeecg-boot，root 密码见 .apt/local/paycenter-db.env，已 gitignore）；redis（localhost:6379）
- EntityGraph: start-init 实体扫描 214→228，14 张 pay_* 表已入图（source=sql）

## 输入
- designs/v0/*/page.logic.md（7 页）
- paycenter/01 §7/§8、02（令牌/回调）、14 §6.2（协议留痕）
- EntityGraph：214 实体（JeecgBoot），可复用 sys_user / sys_dict / sys_dict_item / sys_log / sys_quartz_job / sys_permission

## 缺口队列（一次一项）
1. [已定 A] 主键 id VARCHAR(32) 雪花；审计字段 create_by/create_time/update_by/update_time；逻辑删除 del_flag（豁免 code-standards，理由：Jeecg 基类/代码生成/自动填充 + 多实例无冲突）；流水类表不设 del_flag
2. [已定] 统一 pay_ 前缀（PRD/对接文档表名同步改）；一期 14 张表全建：pay_merchant / pay_merchant_project / pay_order / pay_order_item / pay_refund_order / pay_txn_flow / pay_agreement_consent / pay_agreement_event_log / pay_agreement_version / pay_app / pay_channel_config / pay_notify_record / pay_callback_task / pay_admin_log
3. [已定 A] 新建 pay_admin_log（operator/action 字典/target_type/target_id/target_name/diff JSON/ip/create_time），不改 sys_log；登录也写一条 LOGIN
4. [已定 A] 密钥入库 AES-256-GCM 加密（*_enc + key_version），主密钥仅环境变量 PAY_MASTER_KEY；app_secret 仅创建时展示一次；不用 Jeecg AesEncryptUtil
5. [已定] 唯一键：pay_order uk(merchant_id,biz_order_no)/uk(pay_order_no)/uk(unionpay_order_id)；pay_refund_order uk(merchant_id,biz_refund_no)/uk(refund_order_no)/uk(unionpay_refund_order_id)；pay_notify_record uk(notify_id)；consent uk(user_id,agreement_code,version)。全额退款靠 PAID→REFUNDING 条件更新占位；pay_order/pay_refund_order 加 version + query_round/next_query_time/last_query_time/manual_check/manual_check_time；nonce 与任务锁走 Redis，不建表
6. [已定] pay_callback_task（event 4 种、payload、status PENDING/SUCCESS/FAILED、retry_count/next_retry_time、last_*、manual_check、version；uk(biz_type,biz_id,event)、idx(status,next_retry_time)）；pay_notify_record（uk notify_id、raw_body、sign_valid、process_status、client_ip，只增不改）；后台重推二期
7. [已定] pay_agreement_version（agreement_code/version/title/content_url/effective_time/status/remark；uk(agreement_code,version)）；当前版本=启用且已生效中 effective_time 最晚者，不设 is_current；一期初始化 SQL 写 5 份 v1.0，后续 Jeecg 在线表单/SQL 维护
8. [已定] 不建小区主表；pay_merchant_project 存 project_id + project_name 快照，uk(project_id)，该表物理删除（豁免）；一期手工录入小区；pay_order 快照 unionpay_mchnt_no / unionpay_term_no

## 门禁
- 2026-10-20 check-schema-design：PASS（docs/schema/paycenter-schema.md）
- 2026-10-20 check-schema-apply：PASS（stack=sql-fallback，14 表 create，无冲突）
- 2026-10-20 DDL 已执行到 paycenter-mysql：14 表，列数/索引数与设计一致

## 待办（落到后续 spec）
- JeecgBoot 后端配置改连 3307 + 密码走环境变量（当前 application-dev.yml 为 3306/root/root）
- 字典初始化（13 个字典）、5 份协议 v1.0 初始化（需法务提供 content_url）、菜单与按钮权限 SQL
- 启动时 Flyway 会补跑 V3.9.5_1 与本脚本（本脚本 CREATE TABLE IF NOT EXISTS，可重入）

## 本地环境（供 schema-apply / 联调）
- 运行中容器：nacos(8848)、minio(9000)、qdrant、neo4j、docengine-postgres(5434)、nexus3
- 已停止：maindb mysql:latest(3306)、preaudit-mysql mysql:8.0(3306)、redis 7.0.10(6379)——两个 MySQL 同占 3306，只能起一个
- 支付中心需 MySQL + Redis；单体部署不用 nacos
