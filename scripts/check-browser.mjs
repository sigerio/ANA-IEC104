import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({ headless: true, channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => dialog.accept());
const device = (callback, arg) => page.evaluate(callback, arg);
const row = (text) => page.locator("tbody tr").filter({ hasText: text });
const control = page.locator(".command").filter({ hasText: "打开门" });
const expectEnabled = async (locator) => {
  await locator.click({ trial: true });
  assert.equal(await locator.isEnabled(), true);
};
try {
  await page.goto(
    `${process.env.UI_TEST_URL || "http://localhost:1421"}/tests/ui.html`,
  );
  await page.waitForFunction(
    () => document.querySelectorAll("tbody tr").length === 281,
  );
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/ana-ui-check/disconnected.png",
    fullPage: true,
  });
  assert.equal(
    await control
      .getByRole("button", { name: "执行", exact: true })
      .isEnabled(),
    false,
  );
  await device(() => {
    window.testDevice.ports = ["COM8"];
  });
  await page.getByRole("button", { name: "刷新串口列表" }).click();
  await page.waitForFunction(
    () => document.querySelector("#serial-port").value === "COM8",
  );
  assert.equal(
    await page.getByLabel("波特率", { exact: true }).inputValue(),
    "1000000",
  );
  await page.getByLabel("波特率", { exact: true }).selectOption("115200");
  assert.equal(await page.locator("#serial-settings").count(), 0);
  await device(() => {
    window.testDevice.failOpen = true;
  });
  await page.getByRole("button", { name: "连接串口", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Access denied" }).waitFor();
  assert.equal(
    await device(
      () =>
        window.testDevice.calls.filter((call) => call.cmd === "connect").at(-1)
          .args.baudRate,
    ),
    115200,
  );
  await page.getByLabel("波特率", { exact: true }).selectOption("1000000");
  await device(() => {
    window.testDevice.failOpen = false;
  });
  await page.getByRole("button", { name: "连接串口", exact: true }).click();
  await page.getByText("IEC104 已建立", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("波特率", { exact: true }).isEnabled(),
    false,
  );
  await page.getByRole("button", { name: "站总召唤", exact: true }).click();
  await page.getByText("281 / 281 已更新", { exact: true }).waitFor();
  assert.equal(
    await row("0x000017").locator(".point-value").innerText(),
    "正常",
  );
  await device(() =>
    window.testDevice.emit(
      "parsed-frame",
      window.testDevice.frame("M_SP_NA_1", [
        { ioa: 0x17, value: "ON", raw: "01", quality: "正常" },
      ]),
    ),
  );
  await row("0x000017").getByText("限位冲突", { exact: true }).waitFor();
  await page.getByLabel("仅异常").check();
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByLabel("仅异常").uncheck();
  await page.getByRole("searchbox").fill("不存在的点位");
  await page.getByText("没有符合条件的点位").waitFor();
  await page.getByRole("button", { name: "重置筛选" }).click();
  // TX 以及未采纳的接收帧均不能覆盖真实遥信。
  await device(async () => {
    const d = window.testDevice;
    for (const extra of [
      { direction: "TX", accepted: false },
      { direction: "RX", accepted: false },
    ]) {
      await d.emit(
        "parsed-frame",
        d.frame(
          "M_SP_NA_1",
          [{ ioa: 0x17, value: "OFF", raw: "00", quality: "正常" }],
          3,
          extra,
        ),
      );
    }
  });
  assert.equal(
    await row("0x000017").locator(".point-value").innerText(),
    "限位冲突",
  );
  await control.getByRole("button", { name: "选择", exact: true }).click();
  await control.getByText("已确认选择 · 可执行").waitFor();
  await expectEnabled(
    control.getByRole("button", { name: "执行", exact: true }),
  );
  await control.getByRole("button", { name: "执行", exact: true }).click();
  await page
    .getByText("设备已接受动作请求，请通过遥信确认实际结果。", { exact: true })
    .waitFor();
  assert.equal(
    await control
      .getByRole("button", { name: "执行", exact: true })
      .isEnabled(),
    false,
  );
  assert.equal(await page.locator(".command").count(), 29);
  for (const [ioa, name, value, label] of [
    [0x224, "使能门加热解冻", "ON", "已使能（导通）"],
    [0x225, "关闭门加热", "OFF", "已关闭"],
  ]) {
    const heater = page.locator(".command").filter({ hasText: name });
    assert.equal(await heater.getByRole("button", { name: "执行", exact: true }).isEnabled(), false);
    await heater.getByRole("button", { name: "选择", exact: true }).click();
    await heater.getByText("已确认选择 · 可执行").waitFor();
    await heater.getByRole("button", { name: "执行", exact: true }).click();
    await page.getByText("设备已接受动作请求，请通过遥信确认实际结果。", { exact: true }).waitFor();
    assert.deepEqual(
      await device(() => window.testDevice.calls.filter((call) => call.cmd === "control").slice(-2).map((call) => call.args)),
      [{ ioa, select: true }, { ioa, select: false }],
    );
    await device((state) => window.testDevice.emit(
      "parsed-frame",
      window.testDevice.frame("M_SP_NA_1", [{ ioa: 0x16, value: state, raw: state === "ON" ? "01" : "00", quality: "正常" }]),
    ), value);
    await row("0x000016").getByText("门加热解冻使能", { exact: true }).waitFor();
    await row("0x000016").getByText(label, { exact: true }).waitFor();
  }
  const actuator = page.locator(".command").filter({ hasText: "万融 整机推出 停止" });
  await actuator.getByRole("button", { name: "选择", exact: true }).click();
  await actuator.getByText("已确认选择 · 可执行").waitFor();
  await actuator.getByRole("button", { name: "执行", exact: true }).click();
  await page.getByText("万融动作请求已接受；本协议无到位反馈，请现场核实。", {exact: true}).waitFor();
  await page.getByRole("button", { name: "参数设置" }).click();
  assert.equal(await page.locator(".adjust").count(), 88);
  const parameter = (ioa) => page.locator(`#adjust-${ioa}`).locator("xpath=ancestor::section");
  const temperature = parameter(0x19017);
  await temperature.getByRole("spinbutton").fill("-100");
  await temperature.getByRole("button", {name: "预置", exact: true}).click();
  await temperature.getByText("预置已确认", {exact: true}).waitFor();
  await temperature.getByRole("button", {name: "固化", exact: true}).click();
  await page.getByText("设备已接受参数写入请求；请稍后总召核对实际回传值。", {exact: true}).waitFor();
  assert.deepEqual(await device(() => window.testDevice.calls.filter((c) => c.cmd === "adjust_tis").at(-1).args),
    {items: [{ioa: 0x19017, value: -100}], pi: 0});
  const rtc = parameter(0x19019);
  await rtc.getByRole("spinbutton").fill(String(0x2238));
  assert.equal(await rtc.getByRole("button", {name: "预置", exact: true}).isEnabled(), false);
  await parameter(0x1901a).getByRole("spinbutton").fill(String(0x1d0c));
  await parameter(0x1901b).getByRole("spinbutton").fill(String(0x1a09));
  await rtc.getByRole("button", {name: "预置", exact: true}).click();
  await rtc.getByText("预置已确认", {exact: true}).waitFor();
  await parameter(0x1901b).getByRole("spinbutton").fill(String(0x1a0a));
  assert.equal(await rtc.getByRole("button", {name: "固化", exact: true}).isEnabled(), false);
  await parameter(0x1901b).getByRole("spinbutton").fill(String(0x1a09));
  await parameter(0x1901a).getByRole("button", {name: "固化", exact: true}).click();
  await page.getByText("设备已接受参数写入请求；请稍后总召核对实际回传值。", {exact: true}).waitFor();
  assert.deepEqual(await device(() => window.testDevice.calls.filter((c) => c.cmd === "adjust_tis").at(-1).args),
    {items: [{ioa: 0x19019, value: 0x2238}, {ioa: 0x1901a, value: 0x1d0c}, {ioa: 0x1901b, value: 0x1a09}], pi: 0});

  const adjustment = page
    .locator(".adjust")
    .filter({ hasText: "空调制冷启动温度阈值" });
  await adjustment.getByRole("spinbutton").fill("26");
  assert.equal(
    await adjustment
      .getByRole("button", { name: "固化", exact: true })
      .isEnabled(),
    false,
  );
  await adjustment.getByRole("button", { name: "预置", exact: true }).click();
  await adjustment.getByText("预置已确认", { exact: true }).waitFor();
  assert.match(await adjustment.locator(".adjust-value").innerText(), /25/);
  await adjustment.getByRole("spinbutton").fill("27");
  assert.equal(
    await adjustment
      .getByRole("button", { name: "固化", exact: true })
      .isEnabled(),
    false,
  );
  await adjustment.getByRole("spinbutton").fill("26");
  await adjustment.getByRole("button", { name: "固化", exact: true }).click();
  await page
    .getByText("设备已接受参数写入请求；请稍后总召核对实际回传值。", {
      exact: true,
    })
    .waitFor();
  assert.match(await adjustment.locator(".adjust-value").innerText(), /25/);
  await adjustment.getByRole("button", { name: "预置", exact: true }).click();
  await adjustment.getByText("预置已确认", { exact: true }).waitFor();
  await device(() => {
    window.testDevice.failCommand = true;
  });
  await adjustment.getByRole("button", { name: "预置", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "模拟业务发送失败" })
    .waitFor();
  assert.equal(
    await adjustment
      .getByRole("button", { name: "固化", exact: true })
      .isEnabled(),
    false,
  );
  await device(() => {
    window.testDevice.failCommand = false;
  });
  await device(() => {
    window.testDevice.reject = true;
  });
  await adjustment.getByRole("button", { name: "预置", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "预置未成功" }).waitFor();
  assert.equal(
    await adjustment
      .getByRole("button", { name: "固化", exact: true })
      .isEnabled(),
    false,
  );
  await page.getByRole("button", { name: "关闭错误提示" }).click();
  await device(() => {
    window.testDevice.reject = false;
  });
  await page.getByRole("button", { name: "设备控制" }).click();
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/ana-ui-check/overview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /通信调试/ }).click();
  await page.getByRole("button", { name: "暂停显示" }).click();
  const count = await page.locator(".log > div").count();
  await device(() =>
    window.testDevice.emit("raw-message", {
      direction: "RX",
      hex: "68 04 43 00 00 00",
      timestamp: "00:00:00",
    }),
  );
  assert.equal(await page.locator(".log > div").count(), count);
  await page.getByRole("button", { name: "恢复显示" }).click();
  await page.waitForFunction(
    (previous) => document.querySelectorAll(".log > div").length > previous,
    count,
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出日志" }).click();
  assert.match((await downloadEvent).suggestedFilename(), /^IEC104-.*\.log$/);
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/ana-ui-check/logs.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /通信调试/ }).click();
  await page.clock.install();
  await device(() => {
    window.testDevice.silent = true;
  });
  await control.getByRole("button", { name: "选择", exact: true }).click();
  await page.clock.fastForward(16000);
  await page.getByRole("alert").filter({ hasText: "选择确认超时" }).waitFor();
  assert.equal(
    await control
      .getByRole("button", { name: "执行", exact: true })
      .isEnabled(),
    false,
  );
  await device(() => {
    window.testDevice.silent = false;
  });
  await page.clock.resume();
  await page.getByRole("button", { name: "关闭错误提示" }).click();
  await control.getByRole("button", { name: "选择", exact: true }).click();
  await control.getByText("已确认选择 · 可执行").waitFor();
  await page.getByRole("button", { name: "停止会话", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".point-value")?.classList.contains("muted"),
  );
  assert.equal(
    await control
      .getByRole("button", { name: "执行", exact: true })
      .isEnabled(),
    false,
  );
  await page.getByRole("button", { name: "断开串口", exact: true }).click();
  await expectEnabled(
    page.getByRole("button", { name: "连接串口", exact: true }),
  );
  await expectEnabled(page.getByLabel("波特率", { exact: true }));
  for (const [width, height] of [
    [1100, 700],
    [900, 600],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      animations: "disabled",
      path: `/tmp/ana-ui-check/layout-${width}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      `${width}px page overflow`,
    );
    await page.getByRole("button", { name: /通信调试/ }).click();
    await page.screenshot({
      animations: "disabled",
      path: `/tmp/ana-ui-check/debug-${width}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      `${width}px debug overflow`,
    );
    if (width > 1060)
      assert.equal(
        await page
          .locator(".log-workspace")
          .evaluate(
            (el) =>
              el.getBoundingClientRect().bottom <=
              document.querySelector("footer").getBoundingClientRect().top,
          ),
        true,
        "debug panel must remain above footer",
      );
    await page.getByRole("button", { name: /通信调试/ }).click();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: connection, refresh, errors, telemetry, alarms, control confirmations, parameter confirmations, log pause/export, stale state, responsive layout.",
  );
} finally {
  await browser.close();
}
