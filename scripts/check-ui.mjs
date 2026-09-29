import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(
  readFileSync(new URL("../src/format.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
).outputText;
const { isUsable, isAbnormal, pointValue, adjustmentError, adjustmentGroup, parameterReplyMatches } = await import(
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

assert.equal(adjustmentError(0x19017, "-100"), "");
assert.notEqual(adjustmentError(0x19017, "-1.5"), "");
assert.notEqual(adjustmentError(0x19001, "-1"), "");
assert.deepEqual(adjustmentGroup(0x1901a), [0x19019, 0x1901a, 0x1901b]);
assert.deepEqual(adjustmentGroup(0x19031), [0x1902f, 0x19030, 0x19031]);
assert.deepEqual(adjustmentGroup(0x19017), [0x19017]);
const rtc = [0x2238, 0x1d0c, 0x1a09].map((value, i) => ({ ioa: 0x19019 + i, value }));
const reply = ["01 38 22", "01 0C 1D", "01 09 1A"].map((raw, i) => ({ ioa: 0x19019 + i, raw }));
assert.equal(parameterReplyMatches(reply, rtc, 1), true);
assert.equal(parameterReplyMatches(reply.slice(0, 1), rtc, 1), false);
assert.equal(parameterReplyMatches(reply, rtc, 0), false);
assert.equal(parameterReplyMatches([{ioa: 0x19017, raw: "01 9C FF"}], [{ioa: 0x19017, value: -100}], 1), true);
assert.equal(parameterReplyMatches([{ioa: 0x300d, raw: "01 00 00 A0 3F"}], [{ioa: 0x300d, value: 1.25}], 1), true);
console.log("V2 TIS raw values, groups and exact confirmation checks passed.");

assert.equal(pointValue({ioa: 0x13412, kind: "遥测"}, {...value, value: "240"}), "NTC故障（240）");
assert.equal(pointValue({ioa: 0x13413, kind: "遥测"}, {...value, value: "240"}), "240");
assert.match(pointValue({ioa: 0x13202, kind: "遥测"}, {...value, value: "32776"}), /过高；提升/);
assert.match(pointValue({ioa: 0x1901b, kind: "遥调"}, {...value, value: "6665"}), /年字段 26 \/ 9 月/);
assert.equal(isAbnormal({ioa: 0x42050, kind: "遥信", name: "TIS BMS在线（0=离线）"}, {...value, value: "OFF"}), true);
