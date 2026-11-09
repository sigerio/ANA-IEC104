//! ANA IEC104 V3.3 主站发送报文参考实现。
//! 无第三方依赖：`rustc master_sender_reference.rs && ./master_sender_reference`。

const STARTDT_ACT: u8 = 0x07;
const STOPDT_ACT: u8 = 0x13;
const TESTFR_ACT: u8 = 0x43;

fn u_frame(command: u8) -> Vec<u8> {
    vec![0x68, 4, command, 0, 0, 0]
}

fn s_frame(nr: u16) -> Vec<u8> {
    let encoded = nr * 2;
    vec![0x68, 4, 1, 0, encoded as u8, (encoded >> 8) as u8]
}

fn i_frame(ns: u16, nr: u16, asdu: Vec<u8>) -> Vec<u8> {
    let mut frame = vec![0x68, (4 + asdu.len()) as u8];
    frame.extend_from_slice(&(ns * 2).to_le_bytes());
    frame.extend_from_slice(&(nr * 2).to_le_bytes());
    frame.extend(asdu);
    frame
}

fn asdu(ti: u8, ioa: u32, data: &[u8]) -> Vec<u8> {
    let mut result = vec![
        ti, 1, 6, 0, 1, 0, // TI、SQ=0 单对象、ACT、OA=0、CA=1
        ioa as u8,
        (ioa >> 8) as u8,
        (ioa >> 16) as u8,
    ];
    result.extend_from_slice(data);
    result
}

fn general_interrogation(ns: u16, nr: u16) -> Vec<u8> {
    i_frame(ns, nr, asdu(0x64, 0, &[0x14]))
}

fn control(ns: u16, nr: u16, ioa: u32, select: bool) -> Result<Vec<u8>, &'static str> {
    if !matches!(
        ioa,
        0x200 | 0x201 | 0x210 | 0x211 | 0x220..=0x225 | 0x230..=0x238 |
        0x240 | 0x241 | 0x500..=0x503 | 0x50c | 0x50d | 0x510 | 0x511 | 0x51a | 0x51b
    ) {
        return Err("unsupported V3.3 control IOA");
    }
    Ok(i_frame(ns, nr, asdu(0x2d, ioa, &[if select { 0x81 } else { 0x01 }])))
}

fn adjust_float(ns: u16, nr: u16, ioa: u32, value: f32, preset: bool, cancel: bool) -> Result<Vec<u8>, &'static str> {
    if !(0x3000..=0x300b).contains(&ioa) || !value.is_finite() || (preset && cancel) {
        return Err("unsupported or invalid V3.3 FLOAT32 adjustment");
    }
    if ioa == 0x300b {
        if !(-3276.0..=3276.0).contains(&value) || value.fract() != 0.0 {
            return Err("invalid humidity calibration");
        }
    } else {
        if !(-3276.8..=3276.7).contains(&value) {
            return Err("FLOAT32 value outside register range");
        }
        let scaled = (value * 10.0).trunc() as i32;
        let (min, max) = match ioa {
            0x3000 => (200, 550),
            0x3001 => (150, 350),
            0x3002 => (-300, 150),
            0x3003 => (0, 230),
            0x3004 => (300, 600),
            0x3005 => (-100, 100),
            _ => (-32768, 32767),
        };
        if !(min..=max).contains(&scaled) {
            return Err("FLOAT32 value outside point range");
        }
    }
    let pi = (preset as u8) | ((cancel as u8) << 1);
    let mut data = vec![pi];
    data.extend_from_slice(&value.to_le_bytes());
    Ok(i_frame(ns, nr, asdu(0xca, ioa, &data)))
}

fn adjust_mode(ns: u16, nr: u16, value: u16, preset: bool, cancel: bool) -> Result<Vec<u8>, &'static str> {
    if value > 3 || (preset && cancel) {
        return Err("invalid mode adjustment");
    }
    let pi = (preset as u8) | ((cancel as u8) << 1);
    let mut data = vec![pi];
    data.extend_from_slice(&value.to_le_bytes());
    Ok(i_frame(ns, nr, asdu(0xca, 0x300c, &data)))
}

fn is_power_ioa(ioa: u32) -> bool {
    matches!(
        ioa,
        0x1960f | 0x19610 | 0x19611 | 0x19613 | 0x19614 |
        0x19615..=0x19624 | 0x19631..=0x19636 | 0x19656..=0x19659 |
        0x1965c..=0x19663 | 0x19666 | 0x19669 | 0x1966c | 0x1966f..=0x19671
    )
}

fn adjust_raw(ns: u16, nr: u16, ioa: u32, value: i32, preset: bool, cancel: bool) -> Result<Vec<u8>, &'static str> {
    let timer = matches!(ioa, 0x19663 | 0x19666 | 0x19669 | 0x1966c);
    if (!is_power_ioa(ioa) && !matches!(ioa, 0x3011 | 0x3012)) || (preset && cancel) {
        return Err("unsupported raw adjustment");
    }
    let valid = match ioa {
        0x1960f => (0..=12).contains(&value),
        0x19611 => (0..=9).contains(&value),
        0x19621 => matches!(value, 768 | 1024),
        0x19622 | 0x19623 => (-4000..=1000).contains(&value),
        0x19624 => value >= 0 && value & 0xff <= 59 && (value >> 8) & 0xff <= 59,
        0x19631 => matches!(value, 11000 | 12000 | 22000 | 23000),
        0x19632 => matches!(value, 5000 | 6000),
        0x19656..=0x19659 => (-32768..=32767).contains(&value),
        0x19660 => (0..=5).contains(&value),
        0x19661 | 0x19662 | 0x1966f => value >= 0 && value & 0xff <= 59,
        0x19663 | 0x19666 | 0x19669 | 0x1966c => (0..=86399).contains(&value),
        0x19671 => matches!(value, 0 | 1),
        0x3011 => matches!(value, 0 | 1),
        _ => (0..=65535).contains(&value),
    };
    if !valid {
        return Err("raw adjustment outside V3.3 range");
    }
    let pi = (preset as u8) | ((cancel as u8) << 1);
    let mut data = vec![pi];
    if timer {
        data.extend_from_slice(&(value as u32).to_le_bytes());
    } else {
        data.extend_from_slice(&(value as u16).to_le_bytes());
    }
    Ok(i_frame(ns, nr, asdu(0xca, ioa, &data)))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02X}")).collect::<Vec<_>>().join(" ")
}

fn main() {
    assert_eq!(hex(&u_frame(STARTDT_ACT)), "68 04 07 00 00 00");
    assert_eq!(hex(&u_frame(STOPDT_ACT)), "68 04 13 00 00 00");
    assert_eq!(hex(&u_frame(TESTFR_ACT)), "68 04 43 00 00 00");
    assert_eq!(hex(&s_frame(3)), "68 04 01 00 06 00");
    assert_eq!(
        hex(&general_interrogation(0, 0)),
        "68 0E 00 00 00 00 64 01 06 00 01 00 00 00 00 14"
    );
    assert_eq!(
        hex(&control(0, 0, 0x200, true).unwrap()),
        "68 0E 00 00 00 00 2D 01 06 00 01 00 00 02 00 81"
    );
    assert_eq!(
        hex(&control(0, 0, 0x500, true).unwrap()),
        "68 0E 00 00 00 00 2D 01 06 00 01 00 00 05 00 81"
    );
    assert_eq!(
        hex(&adjust_float(0, 0, 0x3000, 25.0, true, false).unwrap()),
        "68 12 00 00 00 00 CA 01 06 00 01 00 00 30 00 01 00 00 C8 41"
    );
    assert_eq!(
        hex(&adjust_mode(0, 0, 2, true, false).unwrap()),
        "68 10 00 00 00 00 CA 01 06 00 01 00 0C 30 00 01 02 00"
    );
    assert_eq!(
        hex(&adjust_raw(0, 0, 0x19621, 768, true, false).unwrap()),
        "68 10 00 00 00 00 CA 01 06 00 01 00 21 96 01 01 00 03"
    );
    assert_eq!(
        hex(&adjust_raw(0, 0, 0x19622, -1000, true, false).unwrap()),
        "68 10 00 00 00 00 CA 01 06 00 01 00 22 96 01 01 18 FC"
    );
    assert_eq!(
        hex(&adjust_raw(0, 0, 0x19663, 63030, true, false).unwrap()),
        "68 12 00 00 00 00 CA 01 06 00 01 00 63 96 01 01 36 F6 00 00"
    );
    assert_eq!(
        hex(&adjust_raw(0, 0, 0x3011, 1, true, false).unwrap()),
        "68 10 00 00 00 00 CA 01 06 00 01 00 11 30 00 01 01 00"
    );

    println!("总召: {}", hex(&general_interrogation(0, 0)));
    println!("遥控选择: {}", hex(&control(0, 0, 0x200, true).unwrap()));
    println!("空调遥调预置: {}", hex(&adjust_float(0, 0, 0x3000, 25.0, true, false).unwrap()));
    println!("定时开1预置: {}", hex(&adjust_raw(0, 0, 0x19663, 63030, true, false).unwrap()));
}
