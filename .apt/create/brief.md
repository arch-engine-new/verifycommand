# Create Brief

- confirmed: yes   # 依据：父任务简报转引的用户门禁原文——「范围来自已批准设计：用户 2026-10-20 确认 + 今日（2026-10-22）『批准』apply」；本轮为受派 refine 子代理，用户门禁已在上游通过（subagent 指令：不确认用户门禁）。非 Agent 臆写。
- mode: refine
- productGoal: 首筑支付中心操作后台 S2.5 多支付主体产品增量：新增 P8「支付主体管理」页（pay-subject）+ 修订 P3「商户管理」弹窗新增「子商户号映射」区块；范围=增量两页，不做全量 create
- changePages:
  - pay-subject（新增页，designs/v0/pay-subject/）
  - merchants（修订页，designs/v0/merchants/）
- domainStatus: clarified   # 四要素取自已批准设计真源（见下），非本轮新澄清

## 领域定位（四要素）

- 系统领域：物业公司缴费场景的支付中心运营管理后台（JeecgBoot，首筑平台侧全局视角）
- 领域角色：管理员（全权）、运营（只读为主 + 退款操作；主体页不分配）
- 领域实体惯名：支付主体（银商侧一主商户号 + 一套场景凭证）、商户（物业公司）、小区、子商户号映射、通道、凭证（app_id/app_key/通讯密钥）
- 领域惯例约束：商户号/终端号列表只显末 4 位；密钥类只写不读、永不回显明文；配置类表一期不提供删除只启停；所有写操作留痕 pay_admin_log；下单解析 商户×主体×小区 优先精确、回落商户默认（''哨兵），缺映射报「商户未开通当前支付主体」（2001 语义）

## 目标用户

首筑平台运营/管理员（本期新增配置能力全部仅管理员可见，凭证敏感）。

## 核心流程（3–7 步）

1. 管理员在 P8 新增/维护支付主体（编码、场景、主商户号/终端号、通道凭证、微信 appid）。
2. 凭证仅录入时可见，编辑只写不读；更换凭证走「重置凭证」二次确认。
3. 主体启停（一期无删除）；停用后绑定该主体的应用新下单在解析层失败，在途单按订单 subject_id 快照不受影响。
4. 管理员在 P3 商户弹窗「子商户号映射」区块维护 主体×小区→sub_mchnt_no/sub_term_no 映射（小区空=商户默认）。
5. 所有写操作写 pay_admin_log（SUBJECT_* 动作，含 diff）。

## 页面清单草案

| pageId | title | route | 变更类型 |
|--------|-------|-------|----------|
| pay-subject | 支付主体管理（P8） | /paycenter/pay-subject | 新增 |
| merchants | 商户管理（P3） | /paycenter/merchants | 修订（仅增映射区块与关联校验） |

## 非目标（明确不做）

- 不做全量 create：其余 5 页 logic、原型 HTML 原件、paycenter/ 目录文档一律不动
- 不生成任何代码/API/接口设计（归 S5 implement）；不生成 pay-subject 原型 HTML 与 page.spec（本轮为 logic 级增量，MCP generate 链不可用）
- 不做主体删除功能（一期 status 启停 + del_flag 后台语义）
- 不改已冻结契约文档；PRD 增量仅限「支付主体管理」相关章节追加

## 成功标准 / 验收要点

- 两页 page.logic.md 四段骨架齐全（操作明细/主流程/状态/依赖），格式与现存 7 页逐段一致
- pay-subject 硬语义逐条对齐 schema + R14：末 4 位脱敏、凭证「已配置/未配置」、重置二次确认、scene 字典 pay_scene、启停、一期无删除
- merchants 只增不改：映射区块 + uk/resolve/2001 提示 + pay_admin_log 留痕语义
- _pages.md：pay-subject 行 approved=no / merchants 行 approved=no（待 PM 复核）
- check-create-prd PASS；check-refine-fidelity（source=S5 spec）产出只增不减

## 澄清问答记录（一次一问）

- 本轮无新增澄清环：范围与硬语义已由上游批准设计锁定（2026-10-20 用户确认收敛 + 2026-10-22「批准」apply，父任务简报转引）；子代理按指令不再向用户重复确认门禁。
- 真源清单：docs/schema/paycenter-s25-multi-subject-schema.md；docs/superpowers/specs/2026-10-20-paycenter-s5-admin-console-design.md（R14、§2、§3）；docs/prd/01、20 副本。

## 执行环境备注

- APT MCP server 在本子代理会话未连接（query_project_status / generate_page_logic / reconcile_page_logic / generate_prd / generate_frontend_project / start_product_init 均不可用）。
- 按条文回退：手写产物标准补齐（格式对照现存 7 页与 `_page-logic-template.md`）；PRD 在 docs/prd 副本上人工追加（未调 generate_prd）；不调 generate_frontend_project（本轮交付不含原型重生，符合红线）。
- 脚本门禁以本地 node 直跑替代（`~/.apt/scripts`）。
- 原生规格：.apt/project.json 无 targetPlatforms（web only）→ 条件 extract 跳过（H6 判定：空/仅 web → 跳过）。
- O4 sourceDoc：goal.md frontmatter 无 sourceDoc 字段；本轮输入为已有设计文档，按条文以 S5 设计 spec 作 --source 跑 check-refine-fidelity 留痕。
