# 夹具台账

## 操作明细

| 操作 | 触发 | 结果 | 确认 | 角色 |
|------|------|------|------|------|
| 筛选台账 | 输入编码 / 选择状态 / 类型 | 刷新列表 | 无 | 全部登录用户 |
| 打开详情 | 点击行内「详情」 | 进入 `fixture-detail` | 无 | 全部登录用户 |
| 发起借出 | 点击行内「借出」 | 进入 `checkout-form` 并带上夹具 | 无 | 班组长 |
| 录入夹具 | 点击「录入夹具」并提交 | 新增主数据并刷新 | 无 | 仓管、工艺员 |
| 改回在库 | 维修行「改回在库」 | 维修 → 在库 | 确认将该夹具从维修改回在库？ | 仓管 |

## 主流程

1. 进入页面加载夹具列表，派生状态（在库 / 在借 / 超期 / 维修 / 校准锁定）
2. 用户按编码、状态、类型筛选；班组长从在库行发起借出
3. 仓管 / 工艺录入新夹具后列表刷新

## 状态

- `loading`：表格骨架屏
- `empty`：无匹配夹具 EmptyState（非权限）
- `forbidden`：班组长点击录入时提示无主数据维护权限
- `error`：加载失败 Alert + 重试
- `success`：录入成功 Toast

## 字段与列

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| code | string | yes | 表格列 | DataTable 列 |
| type | enum | yes | 表格列 / 表单 | Select |
| status | enum | no | 表格列 | StatusBadge |
| calibrationDueDate | date | yes | 表格列 / 表单 | FormField |
| currentCheckoutId | string | no | 只读 | — |
| q | string | no | 筛选 | SearchBar |

## 查询参数

| 参数名 | 含义 | 默认值 |
|--------|------|--------|
| q | 编码模糊搜索 | 空 |
| status | 状态筛选 | 全部 |
| type | 类型筛选 | 全部 |

## 选项数据源

| 字段 | 控件 | 来源 | 意向 API 或字典 type | value | label | 父字段(级联) | 加载时机 |
|------|------|------|----------------------|-------|-------|--------------|----------|
| type | Select | MOCK→API | dictFixtureType | value | label | 无 | mount |
| status | Select | MOCK→API | dictFixtureStatus | value | label | 无 | mount |

## 校验

| 规则 | 范围 | 说明 |
|------|------|------|
| required | code | 夹具编码必填 |
| required | type | 类型必填 |
| required | calibrationDueDate | 校准到期日必填 |

## 权限

- 页级：登录即可进入
- 录入 / 改回在库：仓管；工艺员可改校准到期日；班组长只读 + 借出

## 依赖

- API 意向名：listFixtures, upsertFixture, restoreFromRepair, dictFixtureType, dictFixtureStatus
- 语义组件 id：PageHeader, SearchBar, DataTable, StatusBadge, EmptyState, PrimaryButton, FormField
