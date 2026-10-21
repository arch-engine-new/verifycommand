# 首筑支付中心 S2.5 多支付主体 Implementation Plan

> **Spec:** F-6 收敛记录（inbox I-1→F-6，用户 2026-10-20 确认；`docs/schema/paycenter-s25-multi-subject-schema.md` design 门禁 PASS、用户「批准」执行 apply）
> **Command:** `/plan-from-spec`
> **Status:** approved（批量模式预授权；schema-apply 门禁已由用户原话「批准」解除）
> **DDL:** `V20261021_1__paycenter_s25_subject.sql` 已随本计划落盘，由 Flyway 启动时执行（唯一执行者）

**Goal:** 建立"支付主体"模型——一个银商主商户号 + 商户×主体(×小区)子商户号映射；S2 通道层从"通道级配置"改为"按主体路由"（配置合并、通知验签主体定位、单号来源编号），为 F-3（重入队后按修订 spec R14）与 F-5（重入队后按修订 spec R14）铺底。

---

## Part 1 — 技术方案（APT 寻址）

### 1.1 范围与约束

**包含：**
1. 实体层：新建 `PaySubject` / `PayMerchantSubject`（MyBatis-Plus），修订 `PayMerchant`（-3）、`PayMerchantProject`（-2）、`PayChannelConfig`（-7 凭证列）、`PayApp`（+subjectId）、`PayOrder`（+subjectId）、`PayRefundOrder`（+subjectId）；`PayEntityDdlConsistencyTest` 同步（R：DDL 与实体一致性，F-1 验收既有）。
2. S2 适配：
   - 新 `IPaySubjectService` / `PaySubjectServiceImpl`（CRUD+按 code 取）与 `IPayMerchantSubjectService`（映射解析：resolve(merchantId, subjectId, projectId)→小区精确命中→商户默认''；缺 → 2001 上下文文案）。
   - 通道运行时配置：`PaySubjectChannelConfigService.getActive(subjectId)` — 主体级凭证（解密）+ 环境级（`pay_channel_config` 按 channel_code+env）合并；沿用进程内缓存 60s + `PayChannelConfigChangedEvent` 失效，主体级增加 `PaySubjectChangedEvent` 失效。
   - 通知验签主体定位：`mchntOrderId/refundOrderId` → 查 `pay_order`/`pay_refund_order` 快照 subject_id → 主体 commKey；查不到 → 订单号前 4 位 == `pay_subject.msg_src_id` 匹配；均失败 → 验签失败（保持 04 §7 语义）。
   - 单号生成器：`PayNoGenerator` 来源编号参数化（按主体 `msg_src_id`），保留旧重载默认取 `paycenter.unionpay-msg-src-id` 以兼容现有调用/测试。
   - env bootstrap（`PayChannelConfigBootstrap`）：维持仅本地开发语义，改为 upsert 默认主体（subject_code 由 `paycenter.unionpay.default-subject-code` 配置，缺省 `UNIONPAY_MAIN`，scene=APP）并随环境变量刷新其凭证；不再写 `pay_channel_config` 的凭证列（已物理下线）。
3. 测试：主体路由单测（getActive(subjectId) 双主体各取各凭证）、通知验签双主体路由（Mock 订单→主体 commKey）、映射解析（小区优先/默认回落/缺映射 2001/同商户两主体不同子商户号）、`PayNoGenerator` 主体来源编号、一致性测试扩展（16 表）。

**非目标：** S3 下单/状态机/通知分发编排（F-3 重入队后按修订 spec R14 实现，解析规则本身已落在 spec）；S5 支付主体管理页与映射弹窗 UI/API（F-5 重入队后）；分账/对账（二期）。**不改 02 §1.3 错误码表**（缺映射复用 2001）。

**硬约束（沿 S2 计划实际约束）：**
- 凭证只经环境变量/`.apt/local/paycenter-app.env` 进程；入库只存 `*_enc`；日志/`raw_body` 不出现 AppKey/通讯密钥原文，商户号/终端号/subject_code 用 `PayMaskUtil.mask` 脱敏。
- `spring.main.lazy-initialization=true`：启动即需生效 Bean（含 `@EventListener` 的配置合并服务、bootstrap）必须 `@Lazy(false)`。
- Maven `E:\repo`，命令在 `backend/jeecg-boot` 下优先 `-o`；JDK 17；fastjson2 兼容包；模块 pom `skipTests=false`（测试期再跑）。
- 根 pom 默认 skipTests；容器 SQL 只经 `docker exec paycenter-mysql sh /tmp/m.sh`。
- 公开方法 Javadoc、`@author paycenter`、函数体 ≤80 行、参数 ≤5、禁空 catch。

### 1.2 设计寻址

N/A（S2.5 无 UI 面；S5 页面变更在 F-5 依 armed 流程走 `$apt-create --refine`）。

### 1.3 依赖寻址表

| 依赖 | 来源 | 引用 | 摘要 |
|------|------|------|------|
| 实体惯例 | 源码 | `.../paycenter/entity/PayChannelConfig.java`、`PayOrder.java` | MyBatis-Plus `@TableName`、`@TableId(type=ASSIGN_ID)`、`@TableLogic del_flag`、审计字段自动填充 |
| PayCryptoService | arch（S2 已入图） | `.../common/crypto/PayCryptoService.java` | encrypt/decrypt/currentKeyVersion；主体凭证列沿用 |
| PayChannelConfigService | arch | `.../service/impl/PayChannelConfigServiceImpl.java` | 现按 channel 取+缓存+`PayChannelConfigChangedEvent`；本片改为环境级精简 + 主体级合并新服务 |
| PayNoGenerator | arch | `.../common/no/PayNoGenerator.java` | 28 位；来源编号现取 `paycenter.unionpay-msg-src-id`（属性），参数化按主体 |
| PayErrorCode/PayException | arch | `.../common/error/PayErrorCode.java`、`PayException.java` | 缺映射用 `MERCHANT_NOT_CONFIGURED(2001)` + detail「商户未开通当前支付主体」；不新增码 |
| UnionPayNotifyService（验签定位） | arch | `.../channel/unionpay/UnionPayNotifyService.java` | 定位 hook：先按单号查快照、再按 msg_src_id 匹配 |
| DDL | 源码 | `V20261021_1__paycenter_s25_subject.sql` + `V20261020_1` | 16 表基线；consistency test 目标 |
| 字典 | 源码 | 字典 SQL（迁移第四段） | `pay_scene` 4 项 |

### 1.4 EntityGraph / 契约

- EntityGraph：S1 后 14 表已入图；本片落实体后经 `register_asset`/`refresh_asset`/`sync-changes` 入图（16 表）；`query_contract EntityGraph` 未注册（WARN 可空，实体真源=源码）。
- 新契约：`IPaySubjectService`、`IPayMerchantSubjectService`、`PaySubjectChannelConfigService` 完成后 `register_contract`（finish-feature 闭环）。

### 1.5 测试策略

- 单测（spring-boot-starter-test + Mockito；DB 相关用 H2 或 mapper 冒烟容器沿用 S1 方案——以 S1 既有测试基建为准）：主体凭证路由、验签双主体、映射解析、单号前缀、bootstrap upsert。
- 集成：`PayEntityDdlConsistencyTest` 扩展 16 表（事实真源 = 容器 DDL）。
- E2E：启动 → `flyway_schema_history` 校验 `20261021.1` success=1 → `/v1/ping` 200。

### 1.6 需求锁定表（F-6 范围内可判定验收）

| Rn | 需求 | 来源 | 可判定验收 | 优先级 |
|----|------|------|-----------|--------|
| R1 | Flyway V20261021_1 应用成功，16 表结构=设计 | 用户批准 apply | `flyway_schema_history` version=20261021.1 success=1；`SHOW CREATE TABLE` 与设计稿一致 | must |
| R2 | 双主体配置路由 | F-6 payload #6 | `getActive(subjectId)` 两主体各返回各主体凭证/网关配置；缓存失效生效 | must |
| R3 | 通知验签主体定位 | F-6 payload #6 | 双主体各自订单号验签路由正确单测；前 4 位 msg_src_id 匹配回退；均不中 → 验签失败 | must |
| R4 | 映射解析服务 | F-6 payload #7 | 小区优先、''回落、同商户两主体不同 sub_mchnt_no、缺映射 2001+上下文文案 | must |
| R5 | 单号来源编号按主体 | F-6 payload #6 | `PayNoGenerator` 主体 msg_src_id 前缀单测（旧属性路径回归保留） | must |
| R6 | DDL-实体一致性 | F-1 既有验收 | consistency test 含 16 表，全绿 | must |
| R7 | 日志与凭证安全 | S2 既有 + F-6 | 日志无码原文；脱敏规则覆盖主体编码/主商号；`_enc` 不出现在任何响应 | must |
| R8 | spec 修订完成 | 用户 order=before_s3 | S3(S14)/S4(S13)/S5(S14) 修订提交（本计划前置已完成） | must |

---

## Part 2 — 任务清单（子 Agent 串行，组内逐 Task Verify+commit）

- **组 A（实体与 DDL 一致性）**：T1 新建 PaySubject/PayMerchantSubject + mapper + service 接口/impl；T2 修订 6 实体字段；T3 consistency test 扩展 16 表；T4 `mvn -o -pl jeecg-boot-module/jeecg-module-paycenter test`（组 A 子集）+ `git commit`（先 DDL 由 Flyway 验证）。
- **组 B（S2 适配）**：T5 通道配置合并服务 + 事件失效 + bootstrap 改造；T6 Channel*Request 增 subjectId 并改路由取值；T7 通知验签主体定位；T8 PayNoGenerator 主体来源编号；T9 组 B 测试 + commit。
- **组 C（验收收口）**：T10 全量 `mvn -q -o -pl jeecg-boot-module/jeecg-module-paycenter test`；T11 启动 E2E（flyway history + ping）；T12 文档/账本 sync + 主仓提交。

**执行体注记：** 完成后经 `batch_complete_slice(F-6, done)` 回传；随后解锁 F-3/F-4/F-5 泊车（新队列项重入队，依赖本片契约入库）。
