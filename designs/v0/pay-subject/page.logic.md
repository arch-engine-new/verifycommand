# 支付主体管理（P8）

> 技术栈 JeecgBoot，界面按 Jeecg Vue3（Ant Design Vue）列表页 + 弹窗表单风格（与商户管理 P3 一致）。
> 本页为 S2.5 多支付主体增补（R14）：银商侧一个支付主体（APP / 公众号 / 小程序 / H5）= 一个主商户号；经该主体收款的物业公司为其下子商户。
> 真源：`docs/schema/paycenter-s25-multi-subject-schema.md`（表 `pay_subject`，22 列）；`docs/superpowers/specs/2026-10-20-paycenter-s5-admin-console-design.md` R14 与 §2 约束（商户号列表只显末 4 位；`*_enc` 永不下发前端；密钥类字段编辑时只写不读）。
> 一期不提供删除：启停走 status（1=启用 0=停用），`del_flag` 保留后台语义——与商户管理「商户不提供删除只启停」惯例一致。

## 操作明细

| 操作 | 触发 | 结果 | 确认 | 角色 |
|------|------|------|------|------|
| 查询主体 | 输入「主体编码/名称」关键词，选择场景、状态，点击「查询」（Jeecg 列表页另有「重置」按钮） | 调 `listSubjects` 刷新列表，回到第 1 页 | 无 | 管理员 |
| 翻页 / 改每页条数 | 点击分页器 | 调 `listSubjects` 做服务端分页（Jeecg 标准 pageNo/pageSize） | 无 | 管理员 |
| 新增主体 | 点击「+ 新增主体」 | 打开新增弹窗，表单为空（channel_code 预填 UNIONPAY、notify_sign_type 预填 SHA256、key_version 预填 1、status 默认启用） | 无 | 管理员（运营无本页菜单） |
| 编辑主体 | 行内点击「编辑」 | 调 `getSubjectDetail` 回显非凭据字段（subject_name/scene/channel_code/main_mchnt_no/main_term_no/wx_sub_appid/remark 等）；「通道凭证」区块只显示「已配置」标记，不回显任何凭据明文/密文；标题为「编辑主体 {subjectCode}」 | 无 | 管理员 |
| 保存主体 | 在弹窗中点击「保存」 | 校验通过后，新增调 `addSubject`，编辑调 `editSubject`；后端写 `pay_admin_log`（SUBJECT_* 动作，含操作前后 diff）；成功后关闭弹窗，toast「已保存：{subjectCode}」，刷新列表 | 无 | 管理员 |
| 取消 | 在弹窗中点击「取消」/ 关闭图标 | 关闭弹窗，不保存 | 无 | 管理员 |
| 重置凭证 | 编辑弹窗「通道凭证」区块点击「重置凭证」 | 展开空白凭据表单（app_id / app_key / 通讯密钥 / msg_src / msg_src_id / notify_sign_type / key_version），填写后随「保存主体」提交覆盖入库（app_key/comm_key 以 AES-256-GCM 密文入库，前端永不回显明文；key_version 可按密钥轮换调整） | 确认重置主体 {subjectCode} 的通道凭证？保存后新交易与通知验签按新凭证执行 | 管理员 |
| 停用主体 | 在状态为启用的行内点击「停用」（危险样式按钮） | 调 `toggleSubjectStatus`（status→0），写 `pay_admin_log`（SUBJECT_*），toast「已停用 {subjectName}」，状态列立即刷新。影响：按 `pay_app.subject_id` 绑定该主体的应用，新下单在主体解析时失败（停用主体及其下映射视为未开通；已成交/在途单按 `pay_order.subject_id` 快照取凭证不受影响） | 确认停用主体 {subjectName}？停用后绑定该主体的应用新下单将失败，在途单不受影响 | 管理员 |
| 启用主体 | 在状态为停用的行内点击「启用」 | 调 `toggleSubjectStatus`（status→1），写 `pay_admin_log`（SUBJECT_*），toast「已启用 {name}」 | 确认启用主体 {subjectName}？ | 管理员 |

> **确认**：启停、重置凭证属危险操作，统一 confirm 二次确认（20 §9.1 惯例）。
> **角色**：本页为密钥/商户号高度敏感的配置页，仅管理员；运营可用页面清单不含本页（20 §2、S5 设计 §2「运营对商户/协议只读」），不分配本菜单。
> **凭证红线**：凭证（app_id / app_key_enc / comm_key_enc / msg_src / msg_src_id / notify_sign_type / key_version）在任何界面与接口响应中只显示「已配置 / 未配置」，**永不回显明文**；编辑时只写不读（S5 设计 §2、R10/R14）。

## 主流程

1. 进入「支付主体管理」，调 `listSubjects` 加载第 1 页主体列表（商户号/终端号列只显末 4 位，凭证列显示「已配置/未配置」）。
2. （管理员）点击「+ 新增主体」，填写主体编码、名称、场景（pay_scene 字典下拉）、所属通道（默认 UNIONPAY）、主商户号/主终端号、通道凭证（app_id / app_key / 通讯密钥等，仅本次录入、不回显）、微信 appid（微信场景选填）、备注，点击「保存」。
3. 前端校验，再校验主体编码唯一；通过后调 `addSubject` 保存，写 `pay_admin_log`（SUBJECT_*），toast「已保存：{subjectCode}」，关闭弹窗并刷新列表。
4. （管理员）对已有主体点击「编辑」，弹窗回显非凭据字段；需要换凭证时在「通道凭证」区块点「重置凭证」→ 二次确认 → 填新值 → 保存（`editSubject`），流程同第 3 步。
5. （管理员）点击「停用/启用」，二次确认后调 `toggleSubjectStatus`，状态列立即刷新并写日志。

> 仅快乐路径。错误/空态见「状态」。

## 状态

- `loading`：列表加载时显示 Jeecg 表格 loading（a-table spin）；编辑弹窗回显时表单显示 loading；保存和启停按钮在请求中显示 loading 并禁止重复提交。
- `empty`：没有主体或查询无结果时，表格显示 a-empty「暂无数据」；管理员同时可以看到「+ 新增主体」入口。
- `forbidden`：未登录或没有本页菜单权限时，由 Jeecg 路由守卫拦截（403 页）。运营未分配本菜单，直接进入 403（与 empty 不同）。
- `error`：列表加载失败显示 Alert 和「重试」按钮；保存/启停失败时 toast 显示错误文案（后端错误码按 10 文档映射为用户文案，不裸奔错误码），弹窗保持打开、数据保留。主体编码重复时字段级提示「主体编码已存在」。
- `success`：保存成功 toast「已保存：{subjectCode}」；启停成功 toast「已启用/已停用 {subjectName}」；凭证重置成功 toast「凭证已重置（不回显明文）」（toast 2s 后自动消失）。

## 字段与列

**列表列**

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| subjectCode / subjectName（subject_code / subject_name） | string | yes | 表格列（第一列：编码加粗，名称灰色换行显示） | DataTable 列 |
| scene | enum（字典 pay_scene：APP / WECHAT_MP / MINI_PROGRAM / H5） | yes | 表格列「场景」（字典 item_text 标签） | DataTable 列 + Tag |
| mainMchntNo（main_mchnt_no） | string | yes | 表格列「主商户号」，**只显示末 4 位**（S5 设计 §2 脱敏约束） | DataTable 列 |
| mainTermNo（main_term_no） | string | yes | 表格列「主终端号」，**只显示末 4 位** | DataTable 列 |
| credentialsConfigured | 派生（凭证列：app_id / app_key_enc / comm_key_enc / msg_src / msg_src_id / notify_sign_type / key_version） | — | 表格列「凭证」，只显示「已配置 / 未配置」标签，永不回显明文（必填凭证齐=已配置） | DataTable 列 + StatusTag |
| status | enum（1=启用 / 0=停用） | yes | 表格列「状态」（启用=绿色标签，停用=红色标签） | DataTable 列 + StatusTag |
| actions | — | — | 表格列「操作」：编辑、停用/启用（一期无删除按钮） | DataTable 操作列 |

**新增/编辑表单（pay_subject）**

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| subjectCode（subject_code） | string(≤32) | yes | 表单「主体编码」，唯一，创建后不可改（编辑时只读；样例形态：YL_APP_MAIN 类编码，见 schema 注记） | FormField Input |
| subjectName（subject_name） | string(≤128) | yes | 表单「主体名称」 | FormField Input |
| scene | enum 字典 pay_scene | yes | 表单「场景」下拉（APP 应用 / 微信公众号 / 微信小程序 / H5） | FormField Select |
| channelCode（channel_code） | string(≤32) | yes | 表单「所属通道」，默认 UNIONPAY（一期单通道） | FormField Select |
| mainMchntNo（main_mchnt_no） | string(≤32) | yes | 表单「主商户号」（银商开户后填入；样例用占位形态 8026…，不出现真实号段） | FormField Input |
| mainTermNo（main_term_no） | string(≤32) | yes | 表单「主终端号」 | FormField Input |
| appId（app_id） | string(≤64) | 新增 yes | 「通道凭证」区块内「银联开放平台 AppId」；编辑不回显，仅重置时填写新值 | FormField Input（凭据区） |
| appKey（app_key_enc） | string | 新增 yes | 「通道凭证」区块内「AppKey」；输入即写、密文入库（AES-256-GCM）、**永不回显** | FormField Input password（凭据区） |
| commKey（comm_key_enc） | string | 新增 yes | 「通道凭证」区块内「通讯密钥」（通知验签用）；输入即写、密文入库、**永不回显** | FormField Input password（凭据区） |
| msgSrc（msg_src） | string(≤64) | no | 「通道凭证」区块内「消息来源」 | FormField Input（凭据区） |
| msgSrcId（msg_src_id） | string(≤8) | no | 「通道凭证」区块内「来源编号」（商户订单号前缀，单号生成器取此值） | FormField Input（凭据区） |
| notifySignType（notify_sign_type） | string(≤16)，默认 SHA256 | yes | 「通道凭证」区块内「通知签名算法」，默认 SHA256 | FormField Input/Select（凭据区） |
| keyVersion（key_version） | int，默认 1 | yes | 「通道凭证」区块内「主密钥版本」（支持轮换） | FormField InputNumber（凭据区） |
| wxSubAppid（wx_sub_appid） | string(≤64) | no | 表单「主体微信 appid」（WECHAT_MP / MINI_PROGRAM 场景填写；APP / H5 可空） | FormField Input |
| remark（remark） | string(≤512) | no | 表单「备注」 | FormField Textarea |
| status | enum（1/0） | — | 新增默认启用，表单中不编辑；启停走列表操作（del_flag 一期不暴露，后台语义保留） | 只读 |

> 编辑态「通道凭证」区块：默认折叠为一行「凭证：已配置（不回显）＋［重置凭证］」；未配置（理论仅出现在数据修复过渡态）显示「未配置」并强制展开填写。app_id / app_key / comm_key 必填列 NOT NULL，重置需三项齐。

## 查询参数

| 参数名 | 含义 | 默认值 |
|--------|------|--------|
| keyword | 主体编码或名称，模糊匹配 | 空 |
| scene | 场景筛选（字典 pay_scene，含「全部」） | 空 |
| status | 状态筛选（1 启用 / 0 停用，含「全部」） | 空 |
| pageNo | 页码（Jeecg 分页） | 1 |
| pageSize | 每页条数 | 10 |

## 数据契约

| 项 | 值 | 说明 |
|----|----|------|
| volumeClass | bounded-small | 主体数 = 通道 × 场景；一期银联商务单通道 × 4 场景，个位数到十位数 |
| 增长性 | 缓慢增长（新增通道/场景时增加），不随业务量线性增长 | 量级裁决依据 |
| 列表分页预期 | server-side | 与 Jeecg 列表页与其余各页保持一致（bounded-small 虽允许 client-side，统一走 Jeecg 标准服务端分页） |

## 选项数据源

| 字段 | 控件 | 来源 | 意向 API 或字典 type | value | label | 父字段(级联) | 加载时机 |
|------|------|------|----------------------|-------|-------|--------------|----------|
| scene | Select | dict | `pay_scene`（schema 记为系统字典 pc_dict_pay_scene，4 项：APP / WECHAT_MP / MINI_PROGRAM / H5） | itemValue | itemText | 无 | 打开弹窗、查询区加载时 |
| channelCode | Select | api | `listChannels`（启用通道，一期仅 UNIONPAY） | channelCode | channelName | 无 | 打开弹窗时 |
| notifySignType | Select / Input | 默认值 | 默认 SHA256（非业务枚举下拉；如需扩展二期再定） | — | — | 无 | — |

## 校验

| 规则 | 范围 | 说明 |
|------|------|------|
| required | subjectCode、subjectName、scene、mainMchntNo、mainTermNo | 列为 NOT NULL；提示「{字段}为必填」 |
| required（仅新增/重置凭证时） | appId、appKey、commKey | 凭证列 NOT NULL（schema：app_id / app_key_enc / comm_key_enc）；重置时须一次填齐 |
| unique（异步） | subjectCode（仅新增） | subject_code 唯一（uk_pay_subject_subject_code）；重复时提示「主体编码已存在」 |
| immutable | subjectCode（编辑） | 主体编码创建后不可改（schema 字段说明），编辑时只读 |
| range | keyVersion | 整数且 ≥1（列默认 1） |
| maxlength | subjectCode ≤32、subjectName ≤128、channelCode/mainMchntNo/mainTermNo ≤32、appId ≤64、msgSrc ≤64、msgSrcId ≤8、notifySignType ≤16、wxSubAppid ≤64、remark ≤512 | 按 schema 列宽限制 |
| cross-field（提示不阻断） | scene ∈ {WECHAT_MP, MINI_PROGRAM} 且 wxSubAppid 为空 | 提示「微信场景建议填写主体微信 appid（APP/H5 可空）」；列可空，不强制阻断（schema：YES 可空） |
| 写-only-read | 凭证全部字段（编辑） | 编辑回显不含凭证明文/密文（`*_enc` 永不下发前端，S5 设计 §2）；只有「重置凭证」路径可写入新值 |

## 权限

- 页级：仅管理员。本页菜单不分配给运营角色（20 §2 运营可用页面清单不含支付主体管理；主体凭证高度敏感，运营连「已配置/未配置」聚合态也不开放列表）。未分配角色的用户由 Jeecg 路由守卫拦截（403）。
- 操作级：新增、编辑、保存、重置凭证、启停只有管理员可用（Jeecg 按钮权限，沿用 S1 权限码命名惯例：`paycenter:subject:add` / `edit` / `toggle` / `reset`；属 R14「新增菜单与按钮权限」增量，S1 菜单/角色初始化数据需在 implement 阶段补充）。
- 与操作明细「角色」列互补；此处写页入口，行内写操作级。

## 导航

- 路由：/paycenter/pay-subject
- 菜单挂载点：支付中心/支付主体管理（建议排在「商户管理」之后；R14 新增菜单，db-driven 由 sys_permission 初始化增量落）
- 菜单机制类型：db-driven（JeecgBoot 菜单来自 sys_permission 表，由后台菜单管理配置）
- 需权限：是

## 依赖

- API 意向名：`listSubjects`（主体分页列表，脱敏出参：商户号/终端号末 4 位、凭证聚合「已配置/未配置」）、`getSubjectDetail`（详情回显，不含凭证明文/密文）、`addSubject`（新增）、`editSubject`（编辑，含凭证重置写入）、`toggleSubjectStatus`（启停）、`checkSubjectCodeUnique`（编码唯一性校验）、`listChannels`（通道选项）、`dict:pay_scene`（场景字典）
- 关联真源：表 `pay_subject`（22 列，`docs/schema/paycenter-s25-multi-subject-schema.md`）；`pay_app.subject_id` 绑定主体（应用决定订单主体）；`pay_order` / `pay_refund_order.subject_id` 快照（查单/退款/关单/通知验签按快照取凭证）；`pay_channel_config` 降级为环境级（凭证已迁至本页维护）；写 `pay_admin_log`（SUBJECT_* 动作，字典 pay_admin_log_action 增量，schema 待评审要点 5）
- 语义组件 id：PageHeader, SearchForm, DataTable, StatusTag, Tag, Modal, FormField, InputNumber, EmptyState, Alert, Toast, ConfirmDialog
- 演示日来源：FixtureAPI.TODAY
