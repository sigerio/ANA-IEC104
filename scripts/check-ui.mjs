import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(
  readFileSync(new URL("../src/format.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
).outputText;
const { isUsable, isAbnormal, pointValue, adjustmentError } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const point = { ioa: 0x17, name: "门限位冲突故障", kind: "遥信", unit: "" };
const value = { value: "ON", quality: "正常", raw: "01", time: "12:00:00" };
assert.equal(pointValue(point, value), "限位冲突");
assert.equal(isAbnormal(point, value), true);
assert.equal(isUsable(value), true); // 品质有效与故障触发独立。
assert.equal(isUsable({ ...value, stale: true }), false);
assert.equal(isUsable({ ...value, quality: "IV|NT" }), false);
assert.equal(pointValue(point), "—");
assert.equal(isAbnormal(point), false);
const heater = { ioa: 0x16, name: "门加热解冻使能", kind: "遥信", unit: "" };
assert.equal(pointValue(heater, value), "已使能（导通）");
assert.equal(pointValue(heater, { ...value, value: "OFF" }), "已关闭");
assert.equal(pointValue(heater), "—");
assert.equal(isAbnormal(heater, value), false);
assert.equal(adjustmentError(0x3000, "20"), "");
assert.notEqual(adjustmentError(0x3000, "19.9"), "");
assert.notEqual(adjustmentError(0x3000, "20.12"), "");
assert.equal(adjustmentError(0x300b, "0"), "");
assert.notEqual(adjustmentError(0x300b, "1.5"), "");
assert.equal(adjustmentError(0x300c, "0"), "");
assert.notEqual(adjustmentError(0x300c, "4"), "");
assert.notEqual(adjustmentError(0x300d, ""), "");
assert.notEqual(adjustmentError(0x300d, "NaN"), "");
assert.notEqual(adjustmentError(0x300d, "1.234"), "");
assert.equal(adjustmentError(0x300d, "-10"), "");
assert.equal(adjustmentError(0x300d, "1.25"), "");
console.log("UI state and parameter checks passed.");
