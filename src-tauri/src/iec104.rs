use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct DecodedObject {
    pub ioa: u32,
    pub value: String,
    pub raw: String,
    pub quality: String,
}
#[derive(Clone, Serialize)]
pub struct ParsedFrame {
    pub format: String,
    pub ti: Option<u8>,
    pub ti_name: String,
    pub ns: Option<u16>,
    pub nr: Option<u16>,
    pub vsq: Option<u8>,
    pub cot: Option<u8>,
    pub cot_name: String,
    pub oa: Option<u8>,
    pub ca: Option<u16>,
    pub objects: Vec<DecodedObject>,
    pub error: Option<String>,
}
fn u24(b: &[u8]) -> u32 {
    b[0] as u32 | ((b[1] as u32) << 8) | ((b[2] as u32) << 16)
}
fn hex(b: &[u8]) -> String {
    b.iter()
        .map(|x| format!("{x:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}
fn ti_name(t: u8) -> &'static str {
    match t {
        1 => "M_SP_NA_1",
        13 => "M_ME_NC_1",
        0x2D => "C_SC_NA_1",
        0x64 => "C_IC_NA_1",
        0xCA => "C_WS_NA_1",
        _ => "未知 TI",
    }
}
fn cot_name(c: u8) -> String {
    let name = match c & 0x3F {
        1 => "周期",
        2 => "背景扫描",
        3 => "自发",
        5 => "请求",
        6 => "激活",
        7 => "激活确认",
        8 => "停止激活",
        9 => "停止激活确认",
        10 => "激活终止",
        20 => "总召唤响应",
        44 => "未知类型",
        45 => "未知原因",
        46 => "未知 CA",
        47 => "未知 IOA",
        _ => "未知原因",
    };
    if c & 0x40 != 0 {
        format!("否定 {name}")
    } else {
        name.into()
    }
}
fn quality(v: u8) -> String {
    let mut q = Vec::new();
    if v & 0x10 != 0 {
        q.push("BL");
    }
    if v & 0x20 != 0 {
        q.push("SB");
    }
    if v & 0x40 != 0 {
        q.push("NT");
    }
    if v & 0x80 != 0 {
        q.push("IV");
    }
    if q.is_empty() {
        "正常".into()
    } else {
        q.join("|")
    }
}

pub fn parse(f: &[u8]) -> ParsedFrame {
    let bad = |s: &str| ParsedFrame {
        format: "INVALID".into(),
        ti: None,
        ti_name: "".into(),
        ns: None,
        nr: None,
        vsq: None,
        cot: None,
        cot_name: "".into(),
        oa: None,
        ca: None,
        objects: vec![],
        error: Some(s.into()),
    };
    if f.len() < 6 || f[0] != 0x68 || f.len() != f[1] as usize + 2 {
        return bad("APDU 长度或启动字符无效");
    }
    if f[2] & 1 == 0 && f[4] & 1 == 0 {
        let ns = u16::from_le_bytes([f[2], f[3]]) / 2;
        let nr = u16::from_le_bytes([f[4], f[5]]) / 2;
        if f.len() < 12 {
            let mut x = bad("I 帧缺少完整 ASDU");
            x.format = "I".into();
            x.ns = Some(ns);
            x.nr = Some(nr);
            return x;
        }
        let ti = f[6];
        let vsq = f[7];
        let cot = f[8];
        let oa = f[9];
        let ca = u16::from_le_bytes([f[10], f[11]]);
        let count = (vsq & 0x7f) as usize;
        let sq = vsq & 0x80 != 0;
        let mut pos = 12;
        let mut start = 0;
        let mut objects = Vec::new();
        let mut error = None;
        for i in 0..count {
            let ioa = if sq && i > 0 {
                start + i as u32
            } else {
                if pos + 3 > f.len() {
                    error = Some("IOA 越界".into());
                    break;
                }
                let x = u24(&f[pos..pos + 3]);
                pos += 3;
                start = x;
                x
            };
            let len = match ti {
                1 | 0x2d | 0x64 => 1,
                13 => 5,
                0xca => match crate::tis::value_len(ioa) {
                    Some(value_len) => 1 + value_len,
                    None => {
                        error = Some("未定义的遥调 IOA".into());
                        break;
                    }
                },
                _ => {
                    error = Some("不支持的 TI 信息元素".into());
                    break;
                }
            };
            if pos + len > f.len() {
                error = Some("信息元素越界".into());
                break;
            }
            let d = &f[pos..pos + len];
            pos += len;
            let (value, quality) = match ti {
                1 => (
                    if d[0] & 1 != 0 { "ON" } else { "OFF" }.into(),
                    quality(d[0]),
                ),
                13 => {
                    let value = f32::from_le_bytes(d[..4].try_into().unwrap());
                    let mut q = quality(d[4]);
                    if d[4] & 1 != 0 {
                        q = if q == "正常" {
                            "OV".into()
                        } else {
                            format!("OV|{q}")
                        };
                    }
                    if !value.is_finite() {
                        q = if q == "正常" {
                            "IV".into()
                        } else {
                            format!("IV|{q}")
                        };
                    }
                    (value.to_string(), q)
                }
                0x2d => (
                    format!(
                        "{} {}",
                        if d[0] & 1 != 0 { "ON" } else { "OFF" },
                        if d[0] & 0x80 != 0 { "选择" } else { "执行" }
                    ),
                    "".into(),
                ),
                0x64 => (format!("QOI=0x{:02X}", d[0]), "".into()),
                0xca => {
                    let value = if (0x003000..=0x00300b).contains(&ioa) {
                        f32::from_le_bytes(d[1..5].try_into().unwrap()).to_string()
                    } else if crate::tis::is_timer(ioa) {
                        u32::from_le_bytes(d[1..5].try_into().unwrap()).to_string()
                    } else if crate::tis::signed(ioa) {
                        i16::from_le_bytes(d[1..3].try_into().unwrap()).to_string()
                    } else {
                        u16::from_le_bytes(d[1..3].try_into().unwrap()).to_string()
                    };
                    (value, format!("PI=0x{:02X}", d[0]))
                }
                _ => (hex(d), "".into()),
            };
            objects.push(DecodedObject {
                ioa,
                value,
                raw: hex(d),
                quality,
            });
        }
        if error.is_none() && (count == 0 || pos != f.len()) {
            error = Some("ASDU 对象数量与长度不匹配".into());
        }
        return ParsedFrame {
            format: "I".into(),
            ti: Some(ti),
            ti_name: ti_name(ti).into(),
            ns: Some(ns),
            nr: Some(nr),
            vsq: Some(vsq),
            cot: Some(cot),
            cot_name: cot_name(cot),
            oa: Some(oa),
            ca: Some(ca),
            objects,
            error,
        };
    } else if f.len() == 6 && f[2] == 1 && f[3] == 0 && f[4] & 1 == 0 {
        return ParsedFrame {
            format: "S".into(),
            ti: None,
            ti_name: "".into(),
            ns: None,
            nr: Some(u16::from_le_bytes([f[4], f[5]]) / 2),
            vsq: None,
            cot: None,
            cot_name: "".into(),
            oa: None,
            ca: None,
            objects: vec![],
            error: None,
        };
    } else if f.len() == 6 && f[2] & 3 == 3 && f[3..6] == [0, 0, 0] {
        let n = match f[2] {
            7 => "STARTDT ACT",
            11 => "STARTDT CON",
            19 => "STOPDT ACT",
            35 => "STOPDT CON",
            67 => "TESTFR ACT",
            131 => "TESTFR CON",
            _ => "未知 U 命令",
        };
        return ParsedFrame {
            format: "U".into(),
            ti: None,
            ti_name: n.into(),
            ns: None,
            nr: None,
            vsq: None,
            cot: None,
            cot_name: "".into(),
            oa: None,
            ca: None,
            objects: vec![],
            error: if n == "未知 U 命令" {
                Some("U 控制域无效".into())
            } else {
                None
            },
        };
    }
    bad("APCI 控制域无效")
}
pub fn u(cmd: u8) -> Vec<u8> {
    vec![0x68, 4, cmd, 0, 0, 0]
}
pub fn s(nr: u16) -> Vec<u8> {
    let x = nr * 2;
    vec![0x68, 4, 1, 0, x as u8, (x >> 8) as u8]
}
pub fn i(ns: u16, nr: u16, asdu: Vec<u8>) -> Vec<u8> {
    let mut f = vec![0x68, (4 + asdu.len()) as u8];
    f.extend_from_slice(&(ns * 2).to_le_bytes());
    f.extend_from_slice(&(nr * 2).to_le_bytes());
    f.extend(asdu);
    f
}
pub fn asdu(ti: u8, ioa: u32, data: Vec<u8>) -> Vec<u8> {
    let mut a = vec![
        ti,
        1,
        6,
        0,
        1,
        0,
        ioa as u8,
        (ioa >> 8) as u8,
        (ioa >> 16) as u8,
    ];
    a.extend(data);
    a
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sample_control() {
        let p = parse(&[0x68, 0x0e, 0, 0, 0, 0, 0x2d, 1, 6, 0, 1, 0, 0, 2, 0, 0x81]);
        assert_eq!(p.ti_name, "C_SC_NA_1");
        assert_eq!(p.objects[0].ioa, 0x200);
        assert_eq!(p.objects[0].value, "ON 选择");
    }
    #[test]
    fn parses_sq_one_signal_sample() {
        let p = parse(&[0x68, 0x0f, 0, 0, 0, 0, 1, 0x82, 3, 0, 1, 0, 1, 0, 0, 1, 0]);
        assert_eq!(p.objects.len(), 2);
        assert_eq!(p.objects[0].ioa, 1);
        assert_eq!(p.objects[1].ioa, 2);
        assert_eq!(p.objects[0].value, "ON");
        assert_eq!(p.objects[1].value, "OFF");
    }
    #[test]
    fn parses_s_and_u_frames() {
        let s = parse(&[0x68, 4, 1, 0, 2, 0]);
        assert_eq!(s.format, "S");
        assert_eq!(s.nr, Some(1));
        let u = parse(&[0x68, 4, 0x0b, 0, 0, 0]);
        assert_eq!(u.format, "U");
        assert_eq!(u.ti_name, "STARTDT CON");
    }

    #[test]
    fn rejects_invalid_apci_control_fields() {
        assert!(parse(&[0x68, 4, 1, 1, 0, 0]).error.is_some());
        assert!(parse(&[0x68, 4, 7, 1, 0, 0]).error.is_some());
        assert!(
            parse(&[0x68, 0x0e, 0, 0, 1, 0, 0x64, 1, 6, 0, 1, 0, 0, 0, 0, 0x14])
                .error
                .is_some()
        );
    }

    #[test]
    fn labels_negative_confirmation() {
        let p = parse(&[
            0x68, 0x0e, 0, 0, 0, 0, 0x2d, 1, 0x47, 0, 1, 0, 0, 2, 0, 0x81,
        ]);
        assert_eq!(p.cot, Some(0x47));
        assert_eq!(p.cot_name, "否定 激活确认");
    }
    #[test]
    fn rejects_trailing_objects_and_marks_invalid_measurements() {
        let mut asdu = asdu(1, 0x17, vec![1, 0]);
        asdu[2] = 3;
        assert!(parse(&i(0, 0, asdu)).error.is_some());
        let mut data = f32::NAN.to_le_bytes().to_vec();
        data.push(1);
        let parsed = parse(&i(0, 0, super::asdu(13, 0x2000, data)));
        assert!(parsed.objects[0].quality.contains("IV"));
        assert!(parsed.objects[0].quality.contains("OV"));
    }

    #[test]
    fn rejects_bad_length() {
        assert!(parse(&[0x68, 4, 7, 0, 0, 0, 0]).error.is_some());
    }

    #[test]
    fn parses_v33_timer_telemetry_and_rejects_unknown_adjustment_ioa() {
        let mut data = 63030_f32.to_le_bytes().to_vec();
        data.push(0);
        let parsed = parse(&i(0, 0, asdu(13, 0x019663, data)));
        assert!(parsed.error.is_none());
        assert_eq!(parsed.objects[0].value, "63030");

        let parsed = parse(&i(0, 0, asdu(0xca, 0x003010, vec![1, 0, 0, 0, 0])));
        assert!(parsed.error.is_some());
    }
}
