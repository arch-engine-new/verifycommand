# 协议留痕（P6）

> 技术栈 JeecgBoot，界面按 Jeecg Vue3（Ant Design Vue）列表页风格；原型只用来确定结构、字段和交互。
> 本页**只读**，供法务/客服响应争议（20 §4 P6、§9.6）。数据来自支付中心库 `user_agreement_consent`（14 §6.2），该表**永久保留**（14 §6.4）。
> 协议编码 agreement_code：USER_SERVICE（用户服务协议）/ PRIVACY（隐私政策）/ PAY_SERVICE（支付服务协议）/ FEE_NOTICE（缴费须知）/ REFUND_RULE（退款规则）（02 §3.11、14 §6.2）。
> 来源 source：LOGIN / PAY_APP / BILL_PAGE / REFUND（14 §6.2）。

## 操作明细

| 操作 | 触发 | 结果 | 确认 | 角色 |
|------|------|------|------|------|
| 进入页面 | 点击左侧菜单「协议留痕」 | 显示查询区与空表格，提示「请输入 user_id 或手机号查询」，**不自动拉全量**（原型与 PRD 不一致：原型进入页即渲染全部演示记录；以 PRD「输入 → 调 A11」为准，且留痕表永久增长不宜全量扫描） | 无 | 管理员、运营 |
| 查询 | 在「user_id / 手机号」输入框输入关键词，点击「查询」或回车 | 校验通过后调 `listAgreementConsents`（A11），按 user_id 精确匹配或手机号匹配，返回该用户全部协议同意记录，回到第 1 页 | 无 | 管理员、运营 |
| 重置 | 点击「重置」（Jeecg 列表页标准按钮） | 清空关键词与结果，回到初始提示态（原型未实现，Jeecg 列表页惯例保留） | 无 | 管理员、运营 |
| 翻页 / 改每页条数 | 点击分页器 | 调 `listAgreementConsents` 服务端分页（PRD 要求，原型未实现：原型无分页） | 无 | 管理员、运营 |

> 本页无新增/编辑/删除/导出操作：留痕为法律证据，后台不可改动（20 §4 P6「只读」）。

## 主流程

1. 法务/客服从左侧菜单进入「协议留痕」，看到查询区与初始提示。
2. 输入业主的 user_id 或手机号，点击「查询」。
3. 调 `listAgreementConsents`（A11）→ 表格按同意时间倒序列出该用户的协议同意记录（协议、版本、同意时间、来源、设备号）。
4. 据此答复争议（例如确认用户在何时、通过哪个入口同意了哪一版《支付服务协议》）。

## 状态

- `loading`：点击查询后表格显示 Ant Design `a-table` loading（Spin 遮罩），查询按钮置为 loading 防重复提交（PRD 未写，原型未实现，Jeecg 默认行为）。
- `empty`：
  - 初始态（未查询）：表格空态文案「请输入 user_id 或手机号查询」。
  - 查询无结果：表格空态文案「无记录」（20 §9.6「无记录显示空态」；原型已实现：`<td colspan="4" class="empty">无记录</td>`）。
- `forbidden`：无本菜单权限的账号访问路由时显示 Jeecg 403 页「抱歉，您无权访问此页面」（一期管理员、运营都有本页权限，正常不会出现）。
- `error`：A11 调用失败时 toast 后端错误文案（按 10 文档错误码映射为用户文案，不裸露错误码，20 §9.1），表格保留上次结果或空态，用户可再次点击「查询」重试（PRD 要求，原型未实现）。
- `success`：查询成功直接展示列表，不弹 toast。

## 字段与列

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| keyword | string | yes | 表单（查询区输入框，占位「user_id / 手机号」） | SearchForm / FormField（Input） |
| userId | string | yes | 表格列「user_id」 | DataTable 列 |
| mobile | string（脱敏，如 138****0001） | no | 表格列「手机号」（原型有；`user_agreement_consent` 表无手机号字段，需按 user_id 关联用户系统取得并脱敏） | DataTable 列 |
| agreementCode | enum（USER_SERVICE / PRIVACY / PAY_SERVICE / FEE_NOTICE / REFUND_RULE） | yes | 表格列「协议」，显示字典中文名 + 编码 | DataTable 列（字典翻译） |
| version | string（如 v1.0） | yes | 表格列「版本」 | DataTable 列 |
| consentTime | date（datetime，服务端生成的权威时间） | yes | 表格列「同意时间」，格式 YYYY-MM-DD HH:mm:ss，默认倒序 | DataTable 列 |
| source | enum（LOGIN / PAY_APP / BILL_PAGE / REFUND） | yes | 表格列「来源」，显示字典中文名（原型与 PRD 不一致：原型演示数据用了 `REGISTER`，PRD 枚举无此值，以 PRD 的 `LOGIN` 为准） | DataTable 列（字典翻译） |
| deviceId | string | no | 表格列「设备号」（PRD 要求，原型未实现：原型数据里有 `d` 字段但未展示） | DataTable 列 |

> 列布局：原型按「一个用户一行、多条协议用换行拼接」展示（4 列：user_id / 手机号 / 已同意协议（含版本）/ 同意时间（来源））；PRD 按记录列出 agreement_code、版本、时间、来源、device_id。Jeecg 采用**一条同意记录一行**的平铺表格，便于排序和分页。
> 原型缺陷：版本列渲染为 `'v'+x.v`，而数据已带 `v` 前缀，会显示成「vv1.0」，实现时直接显示 version 原值。
> `client_ip` 在 14 §6.2 表中存在，但 20 P6 未要求展示，本期不作为列；如法务需要可后续加。

## 查询参数

| 参数名 | 含义 | 默认值 |
|--------|------|--------|
| keyword | user_id 或手机号（原型 `aUser`）；后端判断：11 位数字按手机号查，否则按 user_id 精确查 | 空（必填后才发起查询） |
| pageNo | 页码（Jeecg 分页） | 1 |
| pageSize | 每页条数 | 10 |

## 数据契约

| 项 | 值 | 说明 |
|----|----|------|
| volumeClass | unbounded | `user_agreement_consent` 每个业主注册/首次支付都会新增记录，且永久保留不清理（14 §6.4） |
| 增长性 | 随业务增长（每新增业主至少 2–3 条，协议改版后再增） | 量级裁决依据 |
| 列表分页预期 | server-side | unbounded 必须服务端分页；单用户结果通常很少，但仍走 pageNo/pageSize |

## 选项数据源

（本页无下拉）

> 表格中 agreementCode、source 两列需字典翻译显示中文名：字典 `agreement_code`、`agreement_source`（Jeecg 数据字典，落库），见「依赖」。

## 校验

| 规则 | 范围 | 说明 |
|------|------|------|
| required | keyword | 关键词去首尾空格后为空时不发请求，提示「请输入 user_id 或手机号」（原型与 PRD 不一致：原型空关键词会显示全部记录；以 PRD「输入后查询」为准） |
| maxLength | keyword | 不超过 64 个字符（与 `user_id varchar(64)` 一致） |
| pattern（后端分流） | keyword | 11 位数字视为手机号，其他视为 user_id；手机号查不到对应用户时返回空列表，显示「无记录」 |

## 权限

- 页级：管理员、运营两个 Jeecg 角色都分配本菜单（20 §2：运营可用页面含协议留痕）；登录后可进入。
- 操作级：两个角色操作一致，只有查询/重置/翻页，无写操作（Jeecg 按钮权限可留 `paycenter:agreement:list`）。二期客服只读角色也可分配本菜单（20 §2 二期扩展）。
- 与操作明细「角色」列互补；此处写页入口，行内写操作级。

## 导航

- 路由：/paycenter/agreements
- 菜单挂载点：支付中心/协议留痕（左侧菜单第 5 项，位于「退款处理」之后、「操作日志」之前）
- 菜单机制类型：db-driven（JeecgBoot 菜单来自 sys_permission 表，由后台菜单管理配置）
- 需权限：是

## 依赖

- API 意向名：`listAgreementConsents`（A11 协议留痕查询：复用 02 §3.12 协议状态查询的服务层，补「按 user_id / 手机号查全部同意记录 + 分页」条件）、`dict:agreement_code`（协议编码字典）、`dict:agreement_source`（来源字典）
- 语义组件 id：PageHeader, SearchForm, FormField, DataTable, EmptyState, Toast
- 演示日来源：FixtureAPI.TODAY
