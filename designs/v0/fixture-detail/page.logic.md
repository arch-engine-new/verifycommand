# 夹具详情

## 操作明细

| 操作 | 触发 | 结果 | 确认 | 角色 |
|------|------|------|------|------|
| 查看主数据 | 进入页面 | 展示编码、类型、状态、校准到期日 | 无 | 全部登录用户 |
| 查看借还历史 | 进入页面 | 展示该夹具 Checkout 历史 | 无 | 全部登录用户 |
| 发起借出 | 点击「借出」 | 进入 `checkout-form` | 无 | 班组长 |
| 更新校准到期日 | 修改日期并保存 | 写回主数据并重算锁定 | 无 | 工艺员、仓管 |
| 返回台账 | 点击「返回台账」 | 进入 `fixture-list` | 无 | 全部登录用户 |

## 主流程

1. 按路由 `:id` 加载夹具与借还历史
2. 展示当前状态与校准是否锁定
3. 有权限角色保存校准日期后停留本页并提示成功

## 状态

- `loading`：详情骨架屏
- `empty`：夹具不存在 EmptyState
- `forbidden`：班组长尝试改校准日期时提示无权限
- `error`：加载失败 Alert + 重试
- `success`：保存成功 Toast

## 字段与列

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| code | string | no | 只读 | DescriptionItem |
| typeLabel | string | no | 只读 | DescriptionItem |
| status | enum | no | 只读 | StatusBadge |
| calibrationDueDate | date | yes | 表单 | FormField |
| history.borrowerName | string | no | 表格列 | DataTable 列 |
| history.expectedReturnDate | date | no | 表格列 | DataTable 列 |
| history.status | enum | no | 表格列 | StatusBadge |
| history.returnCondition | enum | no | 表格列 | DataTable 列 |

## 查询参数

| 参数名 | 含义 | 默认值 |
|--------|------|--------|
| id | 夹具 id | 路由必填 |

## 选项数据源

（本页无下拉）

## 校验

| 规则 | 范围 | 说明 |
|------|------|------|
| required | calibrationDueDate | 工艺员保存时到期日必填 |

## 权限

- 页级：登录即可进入
- 改校准到期日：工艺员 / 仓管；借出：班组长且夹具在库且未锁定

## 依赖

- API 意向名：getFixture, upsertFixture
- 语义组件 id：PageHeader, DescriptionList, StatusBadge, DataTable, PrimaryButton, FormField
