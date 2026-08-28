# ANA-IEC104

React + Vite + Tauri 2 + Rust 实现的 IEC 60870-5-104 串口主站。

## 当前范围

- 物理链路：USART，可调波特率，8N1 / 无校验 / 无流控；对接 `xj_jc` 默认 IEC104 端口时使用 1000000 bit/s。
- 承载：协议文档定义的 APDU 串行字节流，不使用 TCP/2404。
- 监控：连接状态、STARTDT/STOPDT 状态、N(S)/N(R)、原始 RX/TX 十六进制消息、I/S/U 与 ASDU 字段解析、全量遥信/遥测实时值和品质。
- 控制：站总召唤、8 个单点遥控、13 个遥调参数的预置、固化与取消。

## 开发检查

    npm install
    npm run check
    npm run build
    cargo test --manifest-path src-tauri/Cargo.toml --offline

## Windows x64 构建

    npm run build:win

WSL2 使用 cargo-xwin 和 x86_64-pc-windows-msvc 目标。运行 Windows 程序需要 WebView2 Runtime；现场串口使用实际 COMx。真实设备联调仍需在 Windows 上连接 USART 或 USB 转串口设备验证。

`xj_jc` 当前默认将 USART2 分配给 IEC104，速率为 1000000 bit/s。若从机在编译时切换了串口角色，主站应改为该固件对应的端口参数。
