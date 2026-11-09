import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(
  readFileSync(new URL("../src/format.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
).outputText;
const {
  isUsable,
  isAbnormal,
  pointValue,
  adjustmentError,
  adjustmentGroup,
  parameterReplyMatches,
} = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const point = { ioa: 0x17, name: "门限位冲突", kind: "遥信", unit: "" };
const value = { value: "ON", quality: "正常", raw: "01", time: "12:00:00" };
assert.equal(pointValue(point, value), "限位冲突");
assert.equal(isAbnormal(point, value), true);
assert.equal(isUsable(value), true);
assert.equal(isUsable({ ...value, stale: true }), false);
assert.equal(isUsable({ ...value, quality: "IV|NT" }), false);
assert.equal(pointValue(point), "—");
assert.equal(isAbnormal(point), false);
const heater = { ioa: 0x16, name: "门加热解冻使能", kind: "遥信", unit: "" };
assert.equal(pointValue(heater, value), "已使能（导通）");
assert.equal(pointValue(heater, { ...value, value: "OFF" }), "已关闭");
assert.equal(isAbnormal(heater, value), false);
const commandBit = { ioa: 0x11101, name: "故障清除命令位", kind: "遥信", unit: "" };
assert.equal(isAbnormal(commandBit, value), false);
const powerOnline = { ioa: 0x1100f, name: "供电系统通讯在线", kind: "遥信", unit: "" };
assert.equal(isAbnormal(powerOnline, { ...value, value: "OFF" }), true);

assert.equal(adjustmentError(0x3000, "20"), "");
assert.notEqual(adjustmentError(0x3000, "19.9"), "");
assert.equal(adjustmentError(0x3000, "20.12"), "");
assert.equal(adjustmentError(0x3000, "55.09"), "");
assert.notEqual(adjustmentError(0x3000, "55.1"), "");
assert.equal(adjustmentError(0x3006, "1.25"), "");
assert.equal(adjustmentError(0x300b, "0"), "");
assert.notEqual(adjustmentError(0x300b, "1.5"), "");
assert.equal(adjustmentError(0x300c, "0"), "");
assert.notEqual(adjustmentError(0x300c, "4"), "");
assert.notEqual(adjustmentError(0x300d, "1"), "");
assert.notEqual(adjustmentError(0x3010, "1"), "");
assert.equal(adjustmentError(0x19622, "-1000"), "");
assert.notEqual(adjustmentError(0x19622, "-1.5"), "");
assert.notEqual(adjustmentError(0x19622, "1001"), "");
assert.equal(adjustmentError(0x19621, "768"), "");
assert.notEqual(adjustmentError(0x19621, "3"), "");
assert.equal(adjustmentError(0x19663, "63030"), "");
assert.notEqual(adjustmentError(0x19663, "86400"), "");
assert.equal(adjustmentError(0x19624, String(0x2238)), "");
assert.notEqual(adjustmentError(0x19624, "60"), "");
assert.equal(adjustmentError(0x3011, "1"), "");
assert.notEqual(adjustmentError(0x3011, "2"), "");
assert.notEqual(adjustmentError(0x19017, "-100"), "");
assert.deepEqual(adjustmentGroup(0x19663), [0x19663]);
assert.deepEqual(adjustmentGroup(0x3011), [0x3011]);

assert.equal(
  parameterReplyMatches(
    [{ ioa: 0x19663, raw: "01 36 F6 00 00" }],
    [{ ioa: 0x19663, value: 63030 }],
    1,
  ),
  true,
);
assert.equal(
  parameterReplyMatches(
    [{ ioa: 0x19663, raw: "01 36 F6" }],
    [{ ioa: 0x19663, value: 63030 }],
    1,
  ),
  false,
);
assert.equal(
  parameterReplyMatches(
    [{ ioa: 0x19622, raw: "01 18 FC" }],
    [{ ioa: 0x19622, value: -1000 }],
    1,
  ),
  true,
);
assert.equal(
  parameterReplyMatches(
    [{ ioa: 0x3000, raw: "01 00 00 C8 41" }],
    [{ ioa: 0x3000, value: 25 }],
    1,
  ),
  true,
);
assert.equal(
  parameterReplyMatches(
    [{ ioa: 0x3011, raw: "01 01 00" }],
    [{ ioa: 0x3011, value: 1 }],
    1,
  ),
  true,
);

assert.equal(
  pointValue({ ioa: 0x19663, kind: "遥调" }, { ...value, value: "63030" }),
  "17:30:30（63030 s）",
);
assert.match(
  pointValue({ ioa: 0x13523, kind: "遥测" }, { ...value, value: "20480" }),
  /输入电压过低；中度/,
);
assert.match(
  pointValue({ ioa: 0x13559, kind: "遥测" }, { ...value, value: "16392" }),
  /输入未接入；提升/,
);
assert.match(
  pointValue({ ioa: 0x1960f, kind: "遥调" }, { ...value, value: "1" }),
  /铅酸免维护/,
);
console.log("V3.3 UI values, validation and exact confirmation checks passed.");
