# S1 F1-G1 Implementer 报告（Task 1–3）

总体 Status：**DONE**

## Task 1 新建 jeecg-module-paycenter 模块并接入构建 — DONE
- Commit：`e8e06b4`（backend 仓库，分支 paycenter）
- 改动：新增 `jeecg-module-paycenter/pom.xml`（parent jeecg-boot-module 3.9.5，依赖 base-core；test 依赖 spring-boot-starter-test，沿用根 pom 的 asm exclusion；`<build><resources>` 包含 `src/main/resources/**` 且 `filtering=false`，避免 Lua 等资源被 Maven 占位符过滤；另含 `src/main/java/**/*.xml` 以备 Mapper XML）、`package-info.java`；`jeecg-boot-module/pom.xml` 追加 module；`jeecg-system-start/pom.xml` 在 demo 后追加 paycenter 依赖（`${jeecgboot.version}`）。
- Verify：
  - `mvn -q -o -DskipTests -pl jeecg-module-system/jeecg-system-start -am install` → EXIT=0（约 7.5 分钟）。
  - `dependency:tree -Dincludes=...:jeecg-module-paycenter`：`-o` 离线缺 `build-helper-maven-plugin:3.6.1` 插件描述 → 按约定去掉 `-o` 重试，输出 `\- org.jeecgframework.boot3:jeecg-module-paycenter:jar:3.9.5:compile`，BUILD SUCCESS。
- MCP：`query_arch backend/jeecg-boot/jeecg-module-demo` 路径不存在，改用 `backend/jeecg-module-demo/overview` 留痕（无细节，模板以源码 pom 为准）。

## Task 2 配置环境变量化 + paycenter 配置节 + Shiro 白名单 — DONE
- Commit：`d548897`（backend 仓库）
- 改动：`application-dev.yml` datasource url/username/password → `${PAY_DB_*}`（原参数不变）；redis host/port/password → `${PAY_REDIS_*}`；redisson address → `${PAY_REDIS_HOST}:${PAY_REDIS_PORT}`（redisson password 保持原空值，未改）；excludeUrls 末尾追加 `,/v1/ping,/notify/unionpay/**`；文件末尾新增 `paycenter:` 配置节（与 plan 一致）。新增 `PayCenterProperties`（`toString` 主密钥输出 `***`）、`PayCenterConfig`。
- Verify：`password: root|password: 123456` 无命中；`/v1/ping,/notify/unionpay/**` 命中 1 行；`/v1/**` 无命中；`mvn -q -o -DskipTests -pl jeecg-boot-module/jeecg-module-paycenter -am compile` EXIT=0。
- MCP：`query_arch backend/jeecg-boot/util#shiroconfig` 返回 path not found，改 `search_arch "ShiroConfig excludeUrls"` 命中 ShiroConfig/Shiro VO 留痕。

## Task 3 本地启动脚本 run-local.ps1 — DONE
- Commit：`024b3f7`（主仓 D:\software\dog-food，仅 add `scripts/paycenter/run-local.ps1`）
- `.gitignore` 已含 `.apt/local/`（L3），未修改。
- 脚本（纯 ASCII，兼容 PS5，无 `??`/`&&`）：
  - `-EnvOnly`：读 `paycenter-db.env` 的 `MYSQL_ROOT_PASSWORD` → `PAY_DB_PASSWORD`，并设 `PAY_DB_PORT=3307`、`PAY_DB_USER=root`；`paycenter-app.env` 不存在则用 `RandomNumberGenerator` 生成 32 字节 Base64 `PAY_MASTER_KEY`（+`PAY_MASTER_KEY_VERSION=1`，来源编号注释占位）写入，不打印值；存在则逐行注入（按首个 `=` 分割，兼容 Base64 填充）。只打印变量名与个数。
  - 默认：注入后 `Start-Process java -jar <start jar> --spring.profiles.active=dev`，stdout→`.apt/paycenter-run.log`，stderr→`.apt/paycenter-run.err.log`，PID→`.apt/paycenter-run.pid`，轮询 `/jeecg-boot/v1/ping` 至 200 或 180s（`-TimeoutSeconds` 可调；进程提前退出/超时 `throw`）。
  - `-Stop`：按 PID 停止并删除 pid 文件。
- Verify：`. ./scripts/paycenter/run-local.ps1 -EnvOnly; 'len=...'` 输出 `len=32 mk=32`，仅打印变量名（5 个）无明文；`git check-ignore .apt/local/paycenter-app.env` 有输出；二次运行（文件已存在分支）mk=32；`-Stop` 无 pid 时正常提示；脚本 Parser 解析错误 0。
- 默认（启动）模式未在本 Task 实跑，留待 Task 20 端到端验证。

## 白名单外改动
- 无。

## 遗留 / 提示
- 首次运行已在 `.apt/local/paycenter-app.env` 生成本地主密钥（gitignored）；`PAY_UNIONPAY_MSG_SRC_ID` 需用户自行填入该文件。
- 离线 `-o` 模式下 `dependency:tree` 缺插件（已在线下载补齐，后续 `-o` 应可用）。
- MCP `query_arch` 中 plan 标注的 `backend/jeecg-boot/util` 路径不可直接浏览，需用 `search_arch` 替代。
