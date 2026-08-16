# 借出申请

## 操作明细

| 操作 | 触发 | 结果 | 确认 | 角色 |
|------|------|------|------|------|
| 选择夹具 | 下拉选择 | 带出编码、状态、校准到期日 | 无 | 班组长 |
| 填写用途与预计归还 | 输入 | 表单待提交 | 无 | 班组长 |
| 提交借出 | 点击「提交借出」 | 校验通过则夹具改在借并跳转在借清单 | 无 | 班组长 |
| 取消 | 点击「取消」 | 返回台账 | 无 | 班组长 |

## 主流程

1. 进入页面（可带 `fixtureId`）；加载可选夹具
2. 班组长填写借用人、预计归还日、用途并提交
3. 系统校验在库、未校准锁定、未被占用；成功后跳转 `checkout-list`

## 状态

- `loading`：表单骨架
- `empty`：无任何夹具主数据
- `forbidden`：非班组长进入，提示仅班组长可借出
- `error`：占用冲突或校准锁定 Alert（可读原因，校准拒绝文案含「校准」）+ 可改选后重试
- `success`：借出成功 Toast 后跳转

## 字段与列

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| fixtureId | string | yes | 表单 | Select |
| borrowerName | string | yes | 表单 | FormField |
| expectedReturnDate | date | yes | 表单 | FormField |
| purpose | string | yes | 表单 | FormField |

## 查询参数

| 参数名 | 含义 | 默认值 |
|--------|------|--------|
| fixtureId | 预选夹具 | 空 |

## 选项数据源

| 字段 | 控件 | 来源 | 意向 API 或字典 type | value | label | 父字段(级联) | 加载时机 |
|------|------|------|----------------------|-------|-------|--------------|----------|
| fixtureId | Select | MOCK→API | listFixtures | id | code | 无 | mount |

## 校验

| 规则 | 范围 | 说明 |
|------|------|------|
| required | fixtureId, borrowerName, expectedReturnDate, purpose | 缺项不可提交 |
| business | 夹具必须在库 | 非在库拒绝 |
| business | 校准到期日 > 今天 | 含当日锁定，文案含「校准」 |
| business | 无其他人在借 | 冲突失败，展示占用者 |

## 权限

- 页级：仅班组长可提交；其他角色只读提示 forbidden

## 依赖

- API 意向名：listFixtures, createCheckout
- 语义组件 id：PageHeader, FormField, Select, PrimaryButton, Alert
