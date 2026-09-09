# ANA-IEC104

React + Vite + Tauri 2 + Rust 实现的 IEC 60870-5-104 串口主站。

## 0.2.2 工作台

- 浅色紧凑界面：灰白底、白色面板与深色文字；蓝色标记主要操作，绿/黄/红分别表示有效、待确认与告警状态。波特率直接下拉选择，日志与参数设置使用统一浅色样式。

- 设备概览：门、停机坪、故障/安全与温湿度状态。未知或品质无效的数据不会显示为设备正常。
- 实时监控：36 个遥信、15 个遥测和 17 个遥调回传点，支持类别切换、名称/IOA 搜索、异常筛选。遥信状态与数据品质独立显示；断开或停止会话后，旧值标记为历史数据。
- 操作中心：10 个遥控按门、门加热解冻、停机坪、照明和空调分组；选择收到肯定确认后才能执行。17 个遥调参数支持范围/步进校验、预置确认、固化和取消，输入改变后必须重新预置。执行、固化均需用户确认。
- 通信调试：可折叠，折叠或暂停显示期间继续接收；支持 RX/TX 筛选、日志导出与清空。保留最近 500 条原始记录和 200 帧解析，RX 原始记录按实际串口读取批次记录，半帧、非协议字节也可见。
- 窗口支持拖动分隔条、键盘方向键调整和双击复位；小窗口改为纵向排列。桌面展开日志时收起概览，为点表和调试面板留出空间。

## 连接与操作

1. 在 **Tauri 桌面应用**中选择实际 COM 端口并连接。默认 `1000000 bit/s`，8N1 / 无校验 / 无流控。波特率在连接栏直接下拉选择（1200～2000000，包含默认 1000000）；连接期间锁定，更改前先断开串口。
2. 连接自动发送 STARTDT ACT。顶部“串口已打开”与“IEC104 已建立”分别表示物理端口和协议会话状态；收到 STARTDT CON 后才能下发业务。
3. 点击“站总召唤”获取设备快照。总召回传共 68 个状态/测量/参数点，支持分帧；动作请求确认不等于执行到位，固化确认也不会覆盖实际参数回传值，应通过遥信或后续总召核对。
4. 等待握手超时可以重新握手；会话异常时查看日志中的 U/I/S 帧、N(S)/N(R) 和错误提示。业务确认等待上限为 15 秒，超时后不会自动重发动作。

承载为串口 APDU 字节流，不使用 TCP/2404。`xj_jc` 当前默认将 USART2 分配给 IEC104；若固件切换了串口角色，应按实际固件接线，部分协议文档的 USART1 描述可能未同步。

门加热遥控：`0x000224` 使能、`0x000225` 关闭，均以 `SCO=0x81` 选择、`SCO=0x01` 执行。遥信 `0x000016` 表示 PC5 门加热输出使能（1=导通、0=关闭），不表示温度达标或解冻完成。

## 已处理的连接问题

- 保留 `try_clone()` 读写分离，读线程不持有写锁；保留 Tauri `core:event:default` 事件权限。
- 未建立会话、k=12 窗口已满仅拒绝本次发送，实际串口 I/O 失败才释放连接。
- 主动断开等待读线程退出和句柄释放后再返回，连接/断开操作串行化。
- 刷新端口时会清除已经消失的旧端口选择；监听就绪前禁用连接操作，监听初始化失败明确报错。
- 实时数据和控制确认仅采纳有效的 RX 帧；TX、序号异常、错误 ASDU 和地址不匹配的帧保留诊断记录，不更新设备数值。
- 会话停止、断线和业务确认超时清除相关选择或预置许可，防止沿用旧确认。

## 开发检查

```bash
npm install
npm run check
npm run test:ui
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --offline
```

`npm run dev` 仅运行浏览器前端；真实串口调试使用 `npm run tauri:dev` 或 Windows 安装程序。

### 浏览器交互回归（模拟设备）

`tests/ui.html` 使用 Tauri 官方 IPC 模拟接口加载真实页面与点表，独立于生产入口，不会打入安装包。覆盖端口刷新、连接失败、遥信异常、发送帧隔离、遥控与遥调确认、超时、日志暂停/导出以及小窗口布局。

测试工具可装在临时目录，无需给产品增加依赖：

```bash
npm install --prefix /tmp/ana-ui-check --no-audit --no-fund playwright
PLAYWRIGHT_BROWSERS_PATH=/tmp/ana-ui-check/browsers node /tmp/ana-ui-check/node_modules/playwright/cli.js install chromium --no-shell
npm run dev -- --port 1421
```

另一个终端运行：

```bash
PLAYWRIGHT_MODULE=/tmp/ana-ui-check/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/ana-ui-check/browsers \
node scripts/check-browser.mjs
```

默认访问 `http://localhost:1421/tests/ui.html`，可用 `UI_TEST_URL` 修改地址；截图写入 `/tmp/ana-ui-check/`。Linux 截图环境需要可用的中文字体。模拟测试与单元测试不替代实机串口验证。

## Windows x64 构建

```bash
npm run build:win
```

也可以直接运行 `bash scripts/build-windows-installer.sh`。脚本完成前端和 Rust 构建后，读取当前版本号，自动整理到 `release/<版本号>/`：

- `ANA-IEC104_<版本号>_x64.exe`：应用可执行文件，可直接双击运行，无需安装本应用；前端资源已嵌入。
- `ANA-IEC104_<版本号>_x64-setup.exe`：Windows 安装程序。
- `SHA256SUMS.txt`：两份文件的 SHA-256 校验值，脚本生成后自动校验。

在当前已配置的 WSL2 Windows 交叉编译环境中运行，目标为 `x86_64-pc-windows-msvc`。目标 Windows 电脑仍需 WebView2 Runtime；直接运行版不会自动安装该运行时。

发布前需在目标电脑连接真实 USART / USB 转串口，验证端口占用报错、握手、总召、拔插重连、遥控到位和遥调实际读回。
