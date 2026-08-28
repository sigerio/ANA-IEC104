//! ANA IEC104 主站发送报文参考实现。
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
        ti,
        1, // VSQ：一个对象，SQ=0
        6, // COT：激活 ACT
        0, // OA
        1,
        0, // CA=1，小端
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
    if !matches!(ioa, 0x200 | 0x201 | 0x210 | 0x211 | 0x220 | 0x221 | 0x222 | 0x223) {
        return Err("unsupported control IOA");
    }
    Ok(i_frame(
        ns,
        nr,
        asdu(0x2d, ioa, &[if select { 0x81 } else { 0x01 }]),
    ))
}

fn adjust_float(
    ns: u16,
    nr: u16,
    ioa: u32,
    value: f32,
    preset: bool,
    cancel: bool,
) -> Result<Vec<u8>, &'static str> {
    let calibration = (0x300d..=0x3010).contains(&ioa);
    if !(0x3000..=0x300b).contains(&ioa) && !calibration
        || !value.is_finite()
        || (calibration
            && (!(-10.0..=10.0).contains(&value)
                || ((value * 100.0).round() - value * 100.0).abs() > 0.0001))
        || (!calibration && !(-3276.8..=3276.7).contains(&value))
        || (preset && cancel)
    {
        return Err("invalid float adjustment");
    }
    let mut data = vec![(preset as u8) | ((cancel as u8) << 1)];
    data.extend_from_slice(&value.to_le_bytes());
    Ok(i_frame(ns, nr, asdu(0xca, ioa, &data)))
}

fn adjust_mode(
    ns: u16,
    nr: u16,
    value: u16,
    preset: bool,
    cancel: bool,
) -> Result<Vec<u8>, &'static str> {
    if value > 3 || (preset && cancel) {
        return Err("invalid mode adjustment");
    }
    let mut data = vec![(preset as u8) | ((cancel as u8) << 1)];
    data.extend_from_slice(&value.to_le_bytes());
    Ok(i_frame(ns, nr, asdu(0xca, 0x300c, &data)))
}

fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
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
        hex(&control(0, 0, 0x220, true).unwrap()),
        "68 0E 00 00 00 00 2D 01 06 00 01 00 20 02 00 81"
    );
    assert_eq!(
        hex(&adjust_float(0, 0, 0x3000, 25.0, true, false).unwrap()),
        "68 12 00 00 00 00 CA 01 06 00 01 00 00 30 00 01 00 00 C8 41"
    );
    assert_eq!(
        hex(&adjust_float(0, 0, 0x300d, 1.25, true, false).unwrap()),
        "68 12 00 00 00 00 CA 01 06 00 01 00 0D 30 00 01 00 00 A0 3F"
    );
    assert_eq!(
        hex(&adjust_mode(0, 0, 2, true, false).unwrap()),
        "68 10 00 00 00 00 CA 01 06 00 01 00 0C 30 00 01 02 00"
    );

    println!("总召: {}", hex(&general_interrogation(0, 0)));
    println!("遥控选择: {}", hex(&control(0, 0, 0x200, true).unwrap()));
    println!(
        "遥调预置: {}",
        hex(&adjust_float(0, 0, 0x3000, 25.0, true, false).unwrap())
    );
}
