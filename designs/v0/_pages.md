# v0 页面冻结进度

开发维护的 SSOT。由 `$apt-create` 产出，变更页 `approved=no` 待 PM 核对。

| page-id | title | handoff | approved | synced | notes |
|---------|-------|---------|----------|--------|-------|
| fixture-list | 夹具台账 | done | no | no | source=generated；风格 baoyu-shift-console |
| fixture-detail | 夹具详情 | done | no | no | source=generated |
| checkout-form | 借出申请 | done | no | no | 必验：占用冲突、校准拒绝 |
| checkout-list | 在借 / 超期清单 | done | no | no | 必验：超期列表 |
| return-form | 归还核验 | done | no | no | 必验：损坏→维修 |
| calibration-board | 校准到期看板 | done | no | no | 必验：到期锁定 |

**列说明**

| 列 | 含义 |
|----|------|
| `page-id` | kebab-case，与 `page.manifest.json` 的 `id` 一致 |
| `title` | 中文标题 |
| `handoff` | `pending` \| `wip` \| `done` — 双文件是否写完 |
| `approved` | `no` \| `yes` — 开发认定已按 PM 设计说清楚 |
| `synced` | `no` \| `yes` — 是否已 `design-sync --adapter v0` |
| `notes` | 待对文档、权限等待办 |
