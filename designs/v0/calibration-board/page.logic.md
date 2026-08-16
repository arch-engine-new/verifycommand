# 校准到期看板

## 操作明细

| 操作 | 触发 | 结果 | 确认 | 角色 |
|------|------|------|------|------|
| 查看预警与锁定 | 进入页面 | 列出到期前 7 天预警与到期及以后锁定 | 无 | 全部登录用户 |
| 打开夹具 | 点击编码 | 进入 `fixture-detail` | 无 | 全部登录用户 |
| 更新到期日 | 行内保存新日期 | 重算预警 / 锁定 | 无 | 工艺员、仓管 |

## 主流程

1. 进入页面计算每条夹具距校准到期日的天数
2. 到期前 7 天标预警（琥珀 + 文案）；到期当日及以后标锁定（红色条 + 「校准锁定」）
3. 工艺员可改到期日；锁定夹具不可从本页借出

## 状态

- `loading`：看板骨架
- `empty`：近 7 天无预警且无锁定 EmptyState
- `forbidden`：班组长尝试改到期日时提示无权限
- `error`：加载失败 Alert + 重试
- `success`：到期日保存成功 Toast

## 字段与列

| name | 类型 | 必填 | 展示 | 语义组件（可选） |
|------|------|------|------|------------------|
| code | string | no | 表格列 | DataTable 列 |
| typeLabel | string | no | 表格列 | DataTable 列 |
| calibrationDueDate | date | yes | 表格列 / 表单 | FormField |
| daysRemaining | number | no | 表格列 | DataTable 列 |
| level | enum | no | 表格列 | StatusBadge |
| status | enum | no | 表格列 | StatusBadge |

## 查询参数

| 参数名 | 含义 | 默认值 |
|--------|------|--------|
| level | 预警 / 锁定 | 全部非正常 |

## 选项数据源

| 字段 | 控件 | 来源 | 意向 API 或字典 type | value | label | 父字段(级联) | 加载时机 |
|------|------|------|----------------------|-------|-------|--------------|----------|
| level | Select | MOCK→API | dictCalibrationLevel | value | label | 无 | mount |

## 校验

| 规则 | 范围 | 说明 |
|------|------|------|
| required | calibrationDueDate | 更新到期日时必填 |

## 权限

- 页级：登录即可查看
- 改校准到期日：工艺员 / 仓管；禁止从本页绕过锁定借出

## 依赖

- API 意向名：listCalibration, upsertFixture, dictCalibrationLevel
- 语义组件 id：PageHeader, DataTable, StatusBadge, EmptyState, FormField
