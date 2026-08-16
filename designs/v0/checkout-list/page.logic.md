# 在借 / 超期清单

## 操作明细

| 操作 | 触发 | 结果 | 确认 | 角色 |
|------|------|------|------|------|
| 筛选状态 | 选择在借 / 超期 | 刷新列表 | 无 | 全部登录用户 |
| 打开夹具 | 点击夹具编码 | 进入 `fixture-detail` | 无 | 全部登录用户 |
| 去核验归还 | 行内「归还核验」 | 进入 `return-form` 并带上单据 | 无 | 仓管 |

## 主流程

1. 进入页面加载未关闭借出单；预计归还日已过仍在借的标为超期
2. 超期行用色条 + 「超期」文案双通道展示
3. 仓管从行内进入归还核验

## 状态

- `loading`：列表骨架屏
- `empty`：当前无在借 / 超期 EmptyState
- `forbidden`：班组长点击归还核验时提示仅仓管可核验
- `error`：加载失败 Alert + 重试
- `success`：（可选）无

## 字段与列

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| fixtureCode | string | no | 表格列 | DataTable 列 |
| borrowerName | string | no | 表格列 | DataTable 列 |
| purpose | string | no | 表格列 | DataTable 列 |
| expectedReturnDate | date | no | 表格列 | DataTable 列 |
| status | enum | no | 表格列 | StatusBadge |
| createdAt | datetime | no | 表格列 | DataTable 列 |

## 查询参数

| 参数名 | 含义 | 默认值 |
|--------|------|--------|
| status | 在借 / 超期 | 全部未关闭 |

## 选项数据源

| 字段 | 控件 | 来源 | 意向 API 或字典 type | value | label | 父字段(级联) | 加载时机 |
|------|------|------|----------------------|-------|-------|--------------|----------|
| status | Select | MOCK→API | dictCheckoutStatus | value | label | 无 | mount |

## 校验

无

## 权限

- 页级：登录即可
- 归还核验入口：仓管

## 依赖

- API 意向名：listCheckouts, dictCheckoutStatus
- 语义组件 id：PageHeader, DataTable, StatusBadge, EmptyState, SearchBar
