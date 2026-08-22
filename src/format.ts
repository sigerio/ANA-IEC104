export const showIoa = (n: number) => "0x" + n.toString(16).toUpperCase().padStart(6, "0");
export const now = () => new Date().toLocaleTimeString("zh-CN", { hour12: false });
export const displayValue = (value: string) =>
  value.replace(/ON/g, "置位").replace(/OFF/g, "复位").replace(/^QOI=0x14$/, "总召唤");
