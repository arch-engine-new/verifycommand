# 归还核验

## 操作明细

| 操作 | 触发 | 结果 | 确认 | 角色 |
|------|------|------|------|------|
| 选择在借单 | 下拉选择 | 带出夹具编码、借用人、预计归还 | 无 | 仓管 |
| 判定完好 | 选择「完好」并提交 | 夹具回库、本单关闭 | 确认完好归还并回库？ | 仓管 |
| 判定损坏 | 选择「损坏」并提交 | 夹具转入维修、本单关闭 | 确认损坏并转入维修？维修态不可再借。 | 仓管 |
| 取消 | 点击「取消」 | 返回在借清单 | 无 | 仓管 |

## 主流程

1. 进入页面加载未关闭借出单（可带 `checkoutId`）
2. 仓管选择完好或损坏并确认
3. 完好 → 在库；损坏 → 维修；单据关闭后回 `checkout-list`

## 状态

- `loading`：表单骨架
- `empty`：无待核验单据 EmptyState
- `forbidden`：非仓管进入，提示仅仓管可核验
- `error`：提交失败 Alert + 重试
- `success`：核验完成 Toast 后跳转

## 字段与列

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| checkoutId | string | yes | 表单 | Select |
| fixtureCode | string | no | 只读 | DescriptionItem |
| borrowerName | string | no | 只读 | DescriptionItem |
| condition | enum | yes | 表单 | Select |

## 查询参数

| 参数名 | 含义 | 默认值 |
|--------|------|--------|
| checkoutId | 预选单据 | 空 |

## 选项数据源

| 字段 | 控件 | 来源 | 意向 API 或字典 type | value | label | 父字段(级联) | 加载时机 |
|------|------|------|----------------------|-------|-------|--------------|----------|
| checkoutId | Select | MOCK→API | listCheckouts | id | fixtureCode | 无 | mount |
| condition | Select | MOCK→API | dictReturnCondition | value | label | 无 | mount |

## 校验

| 规则 | 范围 | 说明 |
|------|------|------|
| required | checkoutId | 必须选择在借单 |
| required | condition | 必须选择完好或损坏 |

## 权限

- 页级：仅仓管可提交；工艺员 / 班组长 forbidden

## 依赖

- API 意向名：listCheckouts, returnCheckout, dictReturnCondition
- 语义组件 id：PageHeader, FormField, Select, PrimaryButton, Alert
