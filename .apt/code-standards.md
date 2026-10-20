# Code Standards（本项目编码规范）

> AI 在本项目中写代码时**必须遵守**以下规范。`/feature` 和 `/implement-plan` 会自动读取本文件并注入到子 Agent 的编码指令中。

## 通用

### 命名
- 变量/函数：camelCase（JS/TS/Java 方法）
- 类/接口/组件：PascalCase
- 常量：UPPER_SNAKE_CASE
- 文件名：组件 PascalCase，工具 camelCase，样式 kebab-case
- 布尔变量：以 is/has/can/should 开头

### 函数
- 单一职责：一个函数只做一件事
- 函数体 ≤ 80 行（超过则拆分）
- 参数 ≤ 5 个（超过则用对象参数）
- TS 函数必须有明确 return type

### 注释
- **关键方法**必须有注释：仓库外可调用入口（`export` / `public` / Go 大写导出 / Python 模块级 `def`）。公共类/方法/字段沿用此条。
- **关键逻辑**必须有行内或块注释：分支 / 状态 / 权限 / 钱 / 日期 / 并发 / 锁定等业务不变量；函数体很长或分支很多时必须注释。
- 注释说为什么，不复述代码在做什么。
- 禁止无意义注释（如 `// set x`、空 TODO）。
- 不要求每个 getter 或每一条 `if` 都写注释。

---

## 前端（React / Vue / 通用）

### 组件化
- **一个文件一个组件**（只 `export default` 一个）
- 组件文件名 = 组件名（PascalCase，如 `UserList.tsx`）
- 组件行数 ≤ 300 行（超过则拆子组件）
- props 必须有 TypeScript `interface` 或 `type` 定义
- 禁止在组件内写内联样式超过 3 个属性

### CSS / 样式
- **公共样式提取到独立文件**（`styles/` 目录或 `*.module.css`）
- 优先使用 CSS Modules 或 styled-components（非内联 `style`）
- 类名用 BEM 规范（`block__element--modifier`）
- 颜色/字号/间距用**设计 tokens**（不从硬编码 `#fff`）
- 禁止 `!important`（除非覆盖第三方库且注释原因）
- 全局 CSS 放 `styles/global.css`，组件 CSS 放组件同目录

### 状态管理
- 组件局部状态用 `useState` / `ref`
- 跨组件状态用 store（Pinia / Zustand / Redux）
- **禁止直接操作 DOM**（`document.querySelector` 等），用框架的 ref

### 列表渲染
- 必须有稳定的 `key`
- **不允许用 index 做 key**（列表项会增删时）

### 前端文件结构（推荐）
```
src/
├── components/          ← 公共组件（跨页面复用）
│   ├── Button/
│   │   ├── index.tsx
│   │   └── style.module.css
│   └── ...
├── pages/               ← 页面组件（路由级）
├── hooks/               ← 自定义 hooks
├── stores/              ← 状态管理
├── services/            ← API 调用层
├── styles/              ← 全局样式 + tokens
│   ├── global.css
│   ├── tokens.css       ← 设计 tokens（颜色/字号/间距）
│   └── reset.css
├── types/               ← TypeScript 类型定义
└── utils/               ← 工具函数
```

### 数据防御

> 骨架形状 / 文件路径 / DOM 标记的 SSOT 见 `templates/_frontend-data-defense.md`，实例化（connect Phase 4 骨架先行）与闸门断言均以该模板为准。

- **入口必 decode**：受管 API 响应必须经 apiClient decode 解析后消费，禁止组件内裸消费原始响应、禁止 `as Type` 断言替代校验。为什么：数据形态不符是前端白屏首因，类型断言没有运行时保护。
- **区块必 boundary**：含列表/详情消费的数据区块用 DataBoundary 包裹（粒度按区块，禁止只包整页）。为什么：错误要隔离在区块内，单块数据故障不得拖垮整页。
- **渲染必三态**：数据区块具备 loading/error/empty/data 四态渲染（空数组≠error），错误降级带 `[data-state="error"]` 标记、不拖垮整页。为什么：四态是可验收行为而非实现细节，缺态即无法做行为取证。
- **骨架必先于页面**：骨架文件（decode/boundary/契约测试）由脚手架生成、先于页面组件落地；`DONOTEDIT(scaffold)` 文件禁止手改（改断言=骗闸门，frontier：`FRONTEND_TEST_TAMPERED`）。为什么：骨架测试是闸门的行为证据基线，私改证据等于没有证据。

---

## 后端（Java）

### 命名（阿里巴巴 Java 开发手册）
- 类名：UpperCamelCase（`UserController`）
- 方法名：lowerCamelCase（`getUserById`）
- 常量：UPPER_SNAKE_CASE（`MAX_PAGE_SIZE`）
- 包名：全小写（`com.xxx.controller`）
- 抽象类用 `Abstract` 开头
- 接口实现类用 `Impl` 结尾
- 测试类用被测类名 + `Test`（`UserServiceTest`）

### 分层架构
- **Controller**：参数校验 + 调 Service（**禁止**直接调 Mapper/Entity）
- **Service**：业务逻辑（可调 Mapper）
- **Mapper/Repository**：数据库操作（不含业务逻辑）
- **Entity**：纯数据载体（不含业务逻辑）
- **DTO**：数据传输对象（接口层与业务层隔离）

### API 设计
- RESTful：GET 查询 / POST 创建 / PUT 更新 / DELETE 删除
- 统一返回 `Result<T>`（`code` / `message` / `data`）
- 分页用 `PageResult<T>`（`list` / `total` / `pageNum` / `pageSize`）
- 参数校验用 `@Valid` + JSR 303 注解

### 异常处理
- 用全局异常处理器（`@ControllerAdvice` + `@ExceptionHandler`）
- **禁止空 catch 块**（至少记日志）
- 业务异常用自定义异常类（`BusinessException`）
- 异常信息不暴露给前端（用统一 code/message）

### 注释（阿里巴巴手册）
- 类必须有 `@author` + 功能说明
- 公共方法必须有 `@param` + `@return` + 功能说明
- 复杂逻辑必须行内注释

---

## 后端（Python）

### 命名（PEP 8）
- 函数/变量：snake_case（`get_user_by_id`）
- 类：PascalCase（`UserController`）
- 常量：UPPER_SNAKE_CASE（`MAX_PAGE_SIZE`）
- 私有：_ 前缀（`_internal_method`）

### 结构
- 一个函数 ≤ 50 行
- 类型注解（`def get_user(user_id: int) -> User:`）
- docstring（公共函数）
- 异常用 `try/except`，不裸 `except:`
- 路由函数用装饰器（`@app.route`）

---

## 后端（Go）

### 命名（Effective Go）
- 导出（公开）：PascalCase（`GetUser`）
- 未导出（私有）：camelCase（`getUser`）
- 接口名：-er 后缀（`Reader` / `Writer` / `Validator`）

### 结构
- 一个文件一个主要类型
- `error` 必须处理（**禁止 `_, _ = fn()`**）
- 包注释（`// Package xxx ...`）
- 不用 `panic` 做正常错误处理（用 `error` 返回）

---

## 数据库

### 表设计（每张业务表必须满足）
- **主键**：`id`，BIGINT 自增（或框架等价）
- **公共审计字段**（框架不自动提供时必须显式声明）：

  | 字段 | 类型 | 说明 |
  |------|------|------|
  | `id` | BIGINT | 主键 |
  | `created_at` / `create_time` | DATETIME | 创建时间 |
  | `updated_at` / `update_time` | DATETIME | 更新时间 |
  | `creator` / `created_by` | VARCHAR(64) | 创建人标识 |
  | `updater` / `updated_by` | VARCHAR(64) | 更新人标识 |
  | `deleted` / `is_deleted` | TINYINT(1) | 逻辑删除标记（0=正常，1=已删） |
  | `tenant_id` | BIGINT | 多租户场景的租户 ID（无多租户可省） |

- **逻辑删除**：用 `deleted TINYINT(1) DEFAULT 0`，**禁止物理删除**业务数据（除非明确数据治理需求）

### 字段长度规范
| 场景 | 推荐类型 | 说明 |
|------|---------|------|
| 短文本（名称/标题） | VARCHAR(64) / VARCHAR(128) | 用户名、订单号、标题 |
| 长文本（描述/备注） | VARCHAR(512) / TEXT | 描述、备注（超长用 TEXT） |
| 编码/标识 | VARCHAR(32) / VARCHAR(64) | 状态码、类型编码 |
| URL | VARCHAR(512) | 链接地址 |
| JSON | JSON / TEXT | 结构化数据 |
| 金额 | DECIMAL(10,2) / DECIMAL(20,4) | **禁止 FLOAT/DOUBLE 存金额** |
| 布尔 | TINYINT(1) | 不用 ENUM |

### 命名
- 表名：snake_case（`user_order`）
- 字段名：snake_case（`created_at`）
- 索引名：`idx_表名_字段名`（`idx_user_email`）
- 唯一索引：`uk_表名_字段名`
- 外键名：`fk_表名_关联表名`

### 查询规范
- 禁止 `SELECT *`（明确列名）
- 状态字段用 `TINYINT` + 常量定义（不用 `ENUM`）
- 大表分页必须有索引覆盖

---

## Flutter（Dart）

### Widget
- Widget 文件名 = Widget 名（PascalCase，如 `UserListWidget.dart`）
- Widget ≤ 300 行（超过则拆子 Widget）
- StatefulWidget 的 State 类可以放同文件
- 构造函数参数用 `@required` 或 `required` 关键字
- 公共 Widget 必须有 `///` docstring

### 状态管理
- 局部状态：`setState`
- 跨组件状态：Provider / Riverpod / Bloc（选一个统一用）
- **禁止全局变量做状态**
- 状态变化必须走 State/Notifier/Bloc（禁止直接修改 Model）

### API 调用
- 统一放 Service 层（`class XxxService`）
- 用 `dio` / `http` 包
- 响应解析用 `fromJson` / `json_serializable` / `freezed`
- 错误处理用 `try-catch`，不裸 `throw`

### 文件结构
```
lib/
├── main.dart
├── pages/               ← 页面 Widget
├── widgets/             ← 公共 Widget（跨页面复用）
├── services/            ← API 调用 + 业务逻辑
├── models/              ← 数据模型（freezed/json_serializable）
├── router/              ← 路由配置
└── utils/               ← 工具函数
```

### 命名
- 类名：PascalCase（`UserListWidget`）
- 变量/函数：camelCase（`getUserList`）
- 文件名：snake_case（`user_list_widget.dart`）
- 常量：lowerCamelCase（Dart 规范，不用 UPPER_SNAKE）

---

## iOS（Swift）

### 命名
- 类名：PascalCase（`UserViewController`）
- 协议名：-able 后缀（`Fetchable` / `Cacheable`）
- 变量/函数：camelCase（`fetchUsers`）
- 文件名 = 类名（`UserViewController.swift`）

### 分层
- ViewController → Service → Repository
- **禁止 ViewController 直调网络**（必须经 Service）
- Model 用 `struct` + `Codable`
- Service 可以用 `protocol` 定义接口

### UI
- 用 Auto Layout / SwiftUI（禁止绝对坐标）
- ViewController ≤ 300 行（超过则拆）
- cell 复用（`dequeueReusableCell`）

### 错误处理
- 用 `throws` + `do-try-catch`（不用可选值表示错误）
- 不裸 `try!`（除非确定不会抛）
- 错误要有日志

---

## Android（Kotlin）

### 命名
- 类名：PascalCase（`UserActivity`）
- 包名：全小写（`com.xxx.ui.activity`）
- 资源文件：snake_case（`activity_user.xml`）
- 变量/函数：camelCase（`fetchUsers`）

### 分层
- Activity → ViewModel → Repository
- **禁止 Activity 直调网络**（必须经 ViewModel → Repository）
- ViewModel 用 `ViewModelScope`
- Repository 可以用 `interface` 定义接口
- Model 用 `data class`

### UI
- 用 Jetpack Compose 或 XML DataBinding
- Activity ≤ 300 行（超过则拆 Fragment）
- RecyclerView 用 ListAdapter / DiffUtil

### 依赖注入
- 推荐 Hilt / Koin
- 不用 `object`（单例）做 Service（不好测试）

### 错误处理
- 用 `Result<T>` 或 `sealed class` 表示成功/失败
- Coroutine 异常用 `CoroutineExceptionHandler`
- 不裸 `throw`（用 sealed class 传递错误）

---

## 后端（C#）

### 命名（Microsoft C# Coding Conventions）
- 类/接口/枚举/方法/属性：PascalCase（`UserController`、`GetUserById`）
- 局部变量/参数：camelCase（`userId`、`pageSize`）
- 私有字段：`_camelCase` 前缀（`_dbContext`）
- 常量：PascalCase 或 `const` + PascalCase（`MaxPageSize`）
- 接口：`I` 前缀（`IUserService`）
- 异步方法：`Async` 后缀（`GetUserAsync`）
- 文件名 = 主类型名（`UserController.cs`）

### 分层架构（对齐 Java 分层心智）
- **Controller / API**：参数校验 + 调 Service（**禁止**直调 `DbContext`、`I*Repository`、ADO.NET）
- **Service**：业务逻辑（可调 Repository / DbContext）
- **Repository**：数据访问（不含业务逻辑）
- **Entity / Model**：纯数据载体（可用 EF Core 实体或 DTO）
- DTO 与 Entity 隔离；API 层不暴露 EF 导航属性

### API 与异常
- RESTful + 统一 `Result<T>` 或 ProblemDetails
- 参数校验用 Data Annotations 或 FluentValidation
- 全局异常中间件；**禁止空 catch**
- 业务异常用自定义异常类；不向前端暴露堆栈

### 安全
- **禁止硬编码密钥**（连接串、API Key、JWT Secret）
- **禁止 SQL 字符串拼接**（用 EF Core 参数化或 Dapper 参数）
- `Process.Start` / `ShellExecute` 须白名单校验用户输入
- 敏感配置放 `appsettings` + User Secrets / 环境变量

---

## 桌面（Electron）

### 安全（Electron Security Tutorial）
- **contextIsolation: true**（默认开启，禁止为兼容旧代码关闭）
- **sandbox: true**（渲染进程沙箱）
- **nodeIntegration: false**（渲染进程禁止 Node.js）
- **enableRemoteModule: false**（禁用 `@electron/remote`）
- 主进程与渲染进程通信用 **preload + contextBridge**（`contextBridge.exposeInMainWorld`）
- **禁止**在渲染进程 `require('fs')` / `require('child_process')` / `require('electron').remote`

### 进程职责
- **main**：窗口生命周期、系统 API、IPC 注册
- **preload**：白名单 API 桥接（最小暴露面）
- **renderer**：纯 UI（沿用前端 React/Vue 规范）

### IPC
- 使用 `ipcMain.handle` / `ipcRenderer.invoke`（不用已废弃的 `sendSync`）
- 校验所有 IPC 入参（类型 + 权限）
- 不在 IPC 通道传敏感明文（token 走 secure storage）

### 文件结构（推荐）
```
electron/
├── main/                ← 主进程
├── preload/             ← preload 脚本
└── renderer/            ← 渲染进程（或复用 src/）
```

---

## 原生（C / C++）

### 命名（Google C++ Style Guide）
- 类型名：PascalCase（`UserService`、`HttpClient`）
- 函数/变量：snake_case（`get_user_by_id`、`page_size`）
- 常量：`k` 前缀 + PascalCase（`kMaxPageSize`）
- 宏：UPPER_SNAKE_CASE（`MAX_BUFFER_SIZE`）
- 文件名：snake_case（`user_service.cpp`、`user_service.h`）
- 头文件用 `#pragma once` 或 include guard

### 头文件与模块
- `.h/.hpp` 放声明，`.c/.cpp` 放实现
- 头文件自包含（include 所需依赖）
- 优先前置声明减少编译依赖
- C 与 C++ 混编时用 `extern "C"` 包裹 C 接口

### 危险 API（CERT C/C++ — 禁止或须边界检查）
- **禁止**：`gets`、`strcpy`、`strcat`、`sprintf`、`vsprintf`
- **慎用须边界检查**：`scanf`/`sscanf`（无宽度）、`strncpy`（不保证 `\0`）、`memcpy`（长度须校验）
- **禁止未校验入参**：`system(`、`popen(`、`exec*` 族
- 字符串用 `std::string` / `snprintf` / `strlcpy`（平台可用时）
- 内存：`new`/`delete` 成对；优先 RAII / 智能指针

### 结构与错误处理
- 函数单一职责；公开 API 文档注释（`///` 或 Doxygen）
- 错误用返回值 / `std::optional` / `std::expected`（C++23），不吞错误
- 资源获取即初始化（RAII）；析构函数 `noexcept` 且不做抛异常逻辑

---

## Git 提交

- 提交信息格式：`type(scope): description`
- type：`feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore`
- 一个提交只做一件事
- 提交前跑测试（`npm test` / `mvn test`）

---

## 自定义

> 在下方添加项目特有的编码规范：

<!-- 项目自定义规范写在这里 -->
