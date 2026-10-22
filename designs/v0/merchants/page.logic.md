# 商户管理（P3）

> 技术栈 JeecgBoot，界面按 Jeecg Vue3（Ant Design Vue）列表页 + 弹窗表单风格；原型只用来确定结构、字段和交互。
> 支付方式只有 3 个：微信 WECHAT / 支付宝 ALIPAY / 银行卡 UNIONPAY_CARD（借记卡和贷记卡不分开）。
> **S2.5 修订（2026-10-22，F-6）**：新增「子商户号映射」区块（见操作明细/字段与列/校验/选项数据源/依赖中标注 S2.5 的行）。真源 `docs/schema/paycenter-s25-multi-subject-schema.md`（表 `pay_merchant_subject`、resolve 语义）+ S5 设计 R14。原「银联商户号/终端号/微信子商户 subAppId」等直挂字段按 S2.5 schema 下线迁移（主体表/映射表）——本修订只增区块，不重构其余段；字段迁移落地归 S5 implement。

## 操作明细

| 操作 | 触发 | 结果 | 确认 | 角色 |
|------|------|------|------|------|
| 查询商户 | 输入「商户编码/名称」关键词，点击「查询」（Jeecg 列表页另有「重置」按钮） | 调 `listMerchants`（A2）刷新列表，回到第 1 页 | 无 | 管理员、运营 |
| 翻页 / 改每页条数 | 点击分页器 | 调 `listMerchants` 做服务端分页（PRD 要求，原型未实现：原型在前端过滤数组，没有分页） | 无 | 管理员、运营 |
| 新增商户 | 点击「+ 新增商户」 | 打开新增弹窗，表单为空（`fee_bearer`、`max_amount`=50000.00、3 个支付方式开关可预填默认值） | 无 | 管理员（运营：按钮禁用，文案「+ 新增商户（需管理员）」） |
| 编辑商户 | 行内点击「编辑」 | 调 `getMerchantDetail`（A2），弹窗回显 merchant 和 merchant_project 的全部字段；标题为「编辑商户 {merchantCode}」 | 无 | 管理员（运营：按钮禁用，或点击后提示「商户配置需管理员权限（运营只读）」） |
| 保存商户 | 在弹窗中点击「保存」 | 校验通过后，新增调 `addMerchant`，编辑调 `editMerchant`（A3）；开关和限额调 `updateMerchantPayMethods`（A4）；关联小区调 `saveMerchantProjects`（A5）。后端写操作日志（含变更前后的 JSON diff）。成功后关闭弹窗，toast「已保存：{code}，支付方式开关 ≤30s 生效」，刷新列表 | 无 | 管理员 |
| 取消 | 在弹窗中点击「取消」/ 关闭图标 | 关闭弹窗，不保存 | 无 | 管理员 |
| 停用商户 | 在状态为启用的行内点击「停用」（危险样式按钮） | 调 `toggleMerchantStatus`（A3）把 status 改成停用，写操作日志，toast「已停用 {name}，≤30s 内生效」，状态列立即刷新 | 确认停用商户 {merchantName}？停用=拒绝新单，在途单不受影响 | 管理员（原型与 PRD 不一致：原型没有拦截运营的启停操作，以 PRD 为准，运营不可启停） |
| 启用商户 | 在状态为停用的行内点击「启用」 | 调 `toggleMerchantStatus`（A3）把 status 改成启用，写操作日志，toast「已启用 {name}，≤30s 内生效」 | 确认启用商户 {merchantName}？ | 管理员（同上，运营不可操作） |
| 切换支付方式开关 | 在弹窗中切换微信 / 支付宝 / 银行卡开关，然后保存 | 随「保存商户」一起提交给 A4；≤30s 后缓存失效，C 端支付方式页（3.9）按新配置展示 | 无（随保存提交） | 管理员 |
| 维护关联小区 | 在弹窗中增删关联小区（每个小区可选填独立的银联商户号） | 随「保存商户」提交给 A5（PRD 要求，原型未实现：原型只有一个自由文本输入框） | 无 | 管理员 |
| 维护子商户号映射（S2.5） | 在弹窗「子商户号映射」区块增删改映射行：主体下拉（pay_subject 启用项）× 小区（可空=商户默认），填子商户号 sub_mchnt_no / 子终端号 sub_term_no | 随「保存商户」提交，走 `pay_merchant_subject`（新增=插入、编辑=更新、删除=物理删除，同 `pay_merchant_project` 惯例）；组合唯一 merchant×subject×project（project 空串=商户默认，uk 含 subject_id，两主体可各配不同 sub_mchnt_no）；变更写 `pay_admin_log`（SUBJECT_MAPPING 类动作，前后 diff 留痕） | 无（随保存提交；区块顶部常显提示：缺映射时该主体×小区组合下单将失败——「商户未开通当前支付主体」（2001 语义文案）） | 管理员 |
| 删除映射行（S2.5） | 映射行内点击「删除」 | 物理删除该 `pay_merchant_subject` 行，删除与变更均写 `pay_admin_log.diff` 可追溯（schema：处置细则） | 确认删除 {主体} × {小区/商户默认} 的子商户号映射？删除后该组合下单将提示「商户未开通当前支付主体」 | 管理员 |

> **确认**：启停属于危险操作，统一用 confirm 二次确认（20 §9.1）。  
> **角色**：运营对商户配置只读（20 §2、§9.1）。

## 主流程

1. 进入「商户管理」，调 `listMerchants`（A2）加载第 1 页商户列表。
2. （管理员）点击「+ 新增商户」，填写商户编码、名称、银联商户号/终端号、微信子商户 subAppId、回调地址、notify 域名白名单、手续费承担方、单笔限额、支付方式开关和关联小区，点击「保存」。
3. 前端校验，再校验商户编码是否唯一；通过后调 A3/A4/A5 保存，写操作日志，toast 提示开关 ≤30s 生效，关闭弹窗并刷新列表。
4. （管理员）对已有商户点击「编辑」，弹窗回显后修改字段并保存，流程同第 3 步。
5. （管理员）点击「停用/启用」，二次确认后调 A3，状态列立即刷新，≤30s 后生效。

> 仅快乐路径。错误/空态见「状态」。

## 状态

- `loading`：列表加载时显示 Jeecg 表格 loading（a-table spin）；编辑弹窗回显时表单显示 loading；保存和启停的按钮在请求中显示 loading 并禁止重复提交。（PRD/Jeecg 标准，原型未实现：原型是同步演示数据）
- `empty`：没有商户或查询无结果时，表格显示 a-empty「暂无数据」；管理员同时可以看到「+ 新增商户」入口。
- `forbidden`：未登录或没有本页菜单权限时，由 Jeecg 路由守卫拦截（403 页）。运营可以进入本页，但处于只读态：新增、编辑、启停按钮禁用，或点击后提示「商户配置需管理员权限（运营只读）」。这种情况和 empty 不同。
- `error`：列表加载失败时显示 Alert 和「重试」按钮；保存或启停失败时 toast 显示错误文案（后端错误码按 10 文档映射为用户文案，不直接显示错误码），弹窗保持打开、数据保留。商户编码重复时，字段级提示「商户编码已存在」。
- `success`：保存成功 toast「已保存：{code}，支付方式开关 ≤30s 生效」；启停成功 toast「已启用/已停用 {name}，≤30s 内生效」（toast 2s 后自动消失）。

## 字段与列

**列表列**

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| merchantCode / merchantName | string | yes | 表格列（第一列：编码加粗，名称灰色换行显示） | DataTable 列 |
| projectCount | number | no | 表格列「关联小区」（显示数量，来自 merchant_project 计数） | DataTable 列 |
| status | enum（1=启用 / 0=停用） | yes | 表格列「状态」（启用=绿色标签，停用=红色标签） | DataTable 列 + StatusTag |
| payMethodsEnabled | enum[]（WECHAT / ALIPAY / UNIONPAY_CARD） | yes | 表格列「支付方式开关」，3 个标签：微信 / 支付宝 / 银行卡，开=绿、关=红（原型与 PRD 不一致：20 §9.3 写的「四色标签」是笔误，以 3 个支付方式为准） | DataTable 列 + Tag |
| unionpayMchntNo | string | no | 表格列「银联商户号」，只显示末 4 位（原型与 PRD 不一致：原型显示 `898500****0690` 的掩码形式，以 PRD 的「末 4 位」为准；未下发时显示「待银联下发」） | DataTable 列 |
| actions | — | — | 表格列「操作」：编辑、停用/启用 | DataTable 操作列 |

**新增/编辑表单（merchant + merchant_project）**

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| merchantCode（merchant_code） | string | yes | 表单（编辑时只读） | FormField Input |
| merchantName（merchant_name） | string | yes | 表单（物业公司全称） | FormField Input |
| unionpayMchntNo（unionpay_mchnt_no） | string | no | 表单（银联开户后填写，placeholder「待银联下发」） | FormField Input |
| unionpayTermNo（unionpay_term_no） | string | no | 表单「终端号」（原型与 PRD 不一致：原型编辑时不回显、保存时不提交，以 PRD 为准，需回显和保存） | FormField Input |
| wxSubAppid（wx_sub_appid） | string | no | 表单「微信子商户 subAppId」（placeholder「未批留空 = 微信自动禁用」） | FormField Input |
| maxAmount（max_amount） | number（元，两位小数；库内存分，默认 5000000 分） | yes | 表单「单笔限额（元）」，默认 50000.00 | FormField InputNumber |
| callbackUrl（callback_url） | string（URL） | yes | 表单「回调地址 callback_url」 | FormField Input |
| notifyDomain（notify_domain） | string | yes | 表单「notify 域名白名单」 | FormField Input |
| feeBearer（fee_bearer） | enum（字典） | no | 表单「手续费承担方」 | FormField Select |
| payMethodsEnabled.WECHAT | boolean | yes | 表单开关「微信」，默认开 | FormField Switch |
| payMethodsEnabled.ALIPAY | boolean | yes | 表单开关「支付宝」，默认开 | FormField Switch |
| payMethodsEnabled.UNIONPAY_CARD | boolean | yes | 表单开关「银行卡」，默认开 | FormField Switch |
| projects（merchant_project[]） | array<{projectId, unionpayMchntNo?}> | no | 表单「关联小区」，可增删的子表或多选；每行可选填独立银联商户号，留空时用主商户号（PRD 要求，原型未实现：原型是一个自由文本框） | FormField 子表 / MultiSelect |
| status | enum（1/0） | — | 新增时默认启用，表单中不编辑；启停走列表操作（原型有，PRD 字段表列出了「状态」，由列表启停操作承载） | 只读 |

**子商户号映射（pay_merchant_subject[]，S2.5 新增区块）**

弹窗内独立区块「子商户号映射」，行式子表可增删改；列表页不新增映射列（映射只在弹窗维护）；sub_mchnt_no 在编辑表单内正常回显/编辑（脱敏「只显末 4 位」仅约束列表列，与本页既有银联商户号字段口径一致）。

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| subjectId（subject_id） | ref→pay_subject.id | yes | 区块行「支付主体」下拉，仅 pay_subject 启用项，显示「{subjectName}（{scene 字典文本}）」 | FormField Select |
| projectId（project_id） | ref→小区；空=商户默认 | no | 区块行「小区」下拉，选项=本商户关联小区 +「（默认）商户级映射」；落库存空串 ''（schema：NOT NULL DEFAULT ''，''=商户默认映射，uk 真实生效） | FormField Select |
| subMchntNo（sub_mchnt_no） | string(≤32) | yes | 区块行「子商户号」（物业公司在该主体下备案的银商子商户号；样例用明显占位形态如 8026…，不出现真实号段） | FormField Input |
| subTermNo（sub_term_no） | string(≤32) | no | 区块行「子终端号」，留空=用该主体主终端号（schema：空=用主终端号） | FormField Input |
| status | enum（1=启用 0=停用） | — | 行默认启用，一期区块内不单独提供启停开关（启停语义并入行的增/删，schema 有 status 列，UI 暴露与否归 implement 决议） | 只读 |

> **resolve 语义（schema §待评审要点 4，作为区块交互说明）**：下单时按 商户×主体×小区 解析——优先 project_id 精确命中，未命中回落 project_id=''（商户默认）；两者皆无 = 该组合未开通，下单失败提示「商户未开通当前支付主体」（2001 语义文案）。区块顶部以说明条呈现该口径。

## 查询参数

| 参数名 | 含义 | 默认值 |
|--------|------|--------|
| keyword | 商户编码或名称，模糊匹配（原型 `mSearch`） | 空 |
| pageNo | 页码（Jeecg 分页） | 1 |
| pageSize | 每页条数 | 10 |

## 数据契约

| 项 | 值 | 说明 |
|----|----|------|
| volumeClass | bounded | 商户就是物业公司，一期为试点物业，规模在数十到数百家，随业务拓展慢慢增长 |
| 增长性 | 随业务增长（新签物业公司时增加） | 量级裁决依据 |
| 列表分页预期 | server-side | volumeClass 为 bounded，必须做服务端分页（Jeecg 标准 pageNo/pageSize） |

## 选项数据源

| 字段 | 控件 | 来源 | 意向 API 或字典 type | value | label | 父字段(级联) | 加载时机 |
|------|------|------|----------------------|-------|-------|--------------|----------|
| feeBearer | Select | dict | `fee_bearer`（原型选项：分账优先扣（物业承担）/ 首筑承担 / 按商户约定） | itemValue | itemText | 无 | 打开弹窗时 |
| projects.projectId | MultiSelect / 子表 Select | MOCK→API | `listProjects`（小区列表，来源待对接 B 端物业系统的小区数据） | projectId | projectName | 无 | 打开弹窗时 |
| 映射行.subjectId（S2.5） | 子表行 Select | api | `listSubjects`（pay_subject 启用项筛选 status=1，label 含 scene 字典文本；字典 pay_scene；意向名与支付主体管理页共用） | subjectId | subjectName（scene） | 无 | 打开弹窗时 |
| 映射行.projectId（S2.5） | 子表行 Select | MOCK→API | `listProjects` 复用（选项限本商户关联小区 +「（默认）商户级映射」= 空串） | projectId（''=默认） | projectName /「（默认）商户级映射」 | 无 | 打开弹窗时 |

## 校验

| 规则 | 范围 | 说明 |
|------|------|------|
| required | merchantCode、merchantName | 「商户编码/名称为必填」（原型已实现） |
| required | callbackUrl、notifyDomain、maxAmount | 必填（原型标了 * 但没有校验：PRD 要求，原型未实现） |
| unique（异步） | merchantCode（仅新增） | 调 `checkMerchantCodeUnique` 检查，重复时提示「商户编码已存在」（原型与 PRD 不一致：原型输入已存在的编码时会直接覆盖该商户，以 PRD「唯一性校验」为准） |
| immutable | merchantCode（编辑） | 编辑时商户编码只读，不能修改 |
| pattern | callbackUrl | 必须是合法的 https URL |
| cross-field | callbackUrl ↔ notifyDomain | callback_url 的域名必须在 notify_domain 白名单内，否则提示「回调地址须与 notify 域名白名单一致」（PRD 要求，原型未实现） |
| cross-field | wxSubAppid ↔ payMethodsEnabled.WECHAT | subAppId 为空时，微信开关强制关闭并置灰，提示「未批留空 = 微信自动禁用」（PRD 要求，原型未实现） |
| required（S2.5） | 映射行 subjectId、subMchntNo | 每行主体与子商户号必填；提示「主体与子商户号为必填」 |
| unique（组合，S2.5） | 映射行 subjectId × projectId（空=商户默认） | 同一商户下「主体×小区」组合唯一（`uk_pay_merchant_subject_msp` merchant_id+subject_id+project_id，''=默认哨兵）；重复时提示「该主体下此小区（或默认）已有映射」 |
| 引用（S2.5） | 映射行 projectId | 只能选本商户关联小区，或选「（默认）商户级映射」；不允许任选全量小区 |
| 影响提示（S2.5，非阻断） | 映射区块整体 | 保存不强制存在映射行；缺映射仅提示口径「商户未开通当前支付主体」（2001）在下单时发生，后台保存不阻断 |
| range | maxAmount | 必须大于 0，最多两位小数，单位为元，提交时换算成分 |

## 权限

- 页级：登录即可进入，管理员和运营两个 Jeecg 角色都分配本菜单。运营处于只读态（20 §9.1；20 §2 的表中「运营可用页面」没有列出商户管理，但同表写明「商户配置只读」，本页按只读可见处理）。
- 操作级：新增、编辑、保存、启停、开关、限额、关联小区只有管理员可用（Jeecg 按钮权限，如 `paycenter:merchant:add` / `edit` / `toggle`）；查询和翻页两个角色都能用。
- 操作级（S2.5）：「子商户号映射」区块的增删改随商户编辑/保存权限（`paycenter:merchant:edit`）走管理员专属，运营只读态下该区块同步禁用；如 S5 需要独立按钮权限码（如 `paycenter:merchant:mapping`），作为菜单/按钮初始化增量在 implement 阶段决议（R14）。
- 与操作明细「角色」列互补；此处写页入口，行内写操作级。

## 导航

- 路由：/paycenter/merchants
- 菜单挂载点：支付中心/商户管理（左侧菜单第 2 项，位于「工作台」之后）
- 菜单机制类型：db-driven（JeecgBoot 菜单来自 sys_permission 表，由后台菜单管理配置）
- 需权限：是

## 依赖

- API 意向名：`listMerchants`（A2 商户列表）、`getMerchantDetail`（A2 商户详情）、`addMerchant`（A3 新增）、`editMerchant`（A3 编辑）、`toggleMerchantStatus`（A3 启停）、`checkMerchantCodeUnique`（A3 编码唯一性校验）、`updateMerchantPayMethods`（A4 支付方式开关 + 单笔限额）、`saveMerchantProjects`（A5 商户-小区关联维护）、`listProjects`（小区选项）、`dict:fee_bearer`（手续费承担方字典）
- API 意向名（S2.5 增补）：`listSubjects`（启用主体下拉，与支付主体管理页共用）、`saveMerchantSubjectMappings`（弹窗保存时提交 `pay_merchant_subject[]` 增删改；归属 A5 扩展或独立管理接口由 implement 阶段定，接口设计非本页职责）；变更写 `pay_admin_log`（SUBJECT_MAPPING 类动作，前后 diff）
- 语义组件 id：PageHeader, SearchForm, DataTable, StatusTag, Tag, Modal, FormField, Switch, InputNumber, EmptyState, Alert, Toast, ConfirmDialog
- 演示日来源：FixtureAPI.TODAY
