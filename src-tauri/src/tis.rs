use serde::Deserialize;

// V3.3 §7.2/§7.3: scale explains raw write codes versus engineering readback.
// It is metadata for the UI only; incoming M_ME_NC_1 values are already scaled.
const PARAMETERS: &[(u32, f32, &str)] = &[
    (
        0x01960F,
        1.0,
        "电池类型 0～12：0=User，1=铅酸免维护，2=胶体，3=铅酸液体，4～12 为协议列出的锂电池类型。",
    ),
    (0x019610, 1.0, "蓄电池标称容量，写入 Ah 原始整数 0～65535。"),
    (0x019611, 1.0, "温度补偿系数 0～9，单位 mV/℃/2V，不乘 100。"),
    (
        0x019613,
        1.0,
        "充电均衡维持时间，分钟；60～120 为常用值，不作为强制范围。",
    ),
    (
        0x019614,
        1.0,
        "充电提升维持时间，分钟；60～120 为常用值，不作为强制范围。",
    ),
    (
        0x019615,
        100.0,
        "充电超压断开电压，写入 V×100 的 UINT16 原码。",
    ),
    (0x019616, 100.0, "充电限制电压，写入 V×100 的 UINT16 原码。"),
    (
        0x019617,
        100.0,
        "充电超压断开恢复电压，写入 V×100 的 UINT16 原码。",
    ),
    (0x019618, 100.0, "充电均衡电压，写入 V×100 的 UINT16 原码。"),
    (0x019619, 100.0, "充电提升电压，写入 V×100 的 UINT16 原码。"),
    (0x01961A, 100.0, "充电浮充电压，写入 V×100 的 UINT16 原码。"),
    (
        0x01961B,
        100.0,
        "充电提升恢复电压，写入 V×100 的 UINT16 原码。",
    ),
    (
        0x01961C,
        100.0,
        "充电低压断开恢复电压，写入 V×100 的 UINT16 原码。",
    ),
    (
        0x01961D,
        100.0,
        "充电欠压报警恢复电压，写入 V×100 的 UINT16 原码。",
    ),
    (
        0x01961E,
        100.0,
        "充电欠压报警电压，写入 V×100 的 UINT16 原码。",
    ),
    (
        0x01961F,
        100.0,
        "充电低压断开电压，写入 V×100 的 UINT16 原码。",
    ),
    (0x019620, 100.0, "放电限制电压，写入 V×100 的 UINT16 原码。"),
    (
        0x019621,
        1.0,
        "锂电池参数使能：768（0x0300）使能，1024（0x0400）不使能；不是 3/4。",
    ),
    (
        0x019622,
        100.0,
        "低温禁止充电控制点，-40～+10℃；写入 ℃×100 的 I16 补码。",
    ),
    (
        0x019623,
        100.0,
        "低温禁止放电控制点，-40～+10℃；写入 ℃×100 的 I16 补码。",
    ),
    (
        0x019624,
        1.0,
        "系统分秒参数：高字节为分、低字节为秒，各 0～59；不是完整 RTC。",
    ),
    (
        0x019631,
        100.0,
        "逆变器输出电压等级，仅允许 11000、12000、22000、23000。",
    ),
    (
        0x019632,
        100.0,
        "逆变器输出频率，仅允许 5000（50Hz）或 6000（60Hz）。",
    ),
    (
        0x019633,
        100.0,
        "逆变低压断开电压值，写入 V×100；详细适用范围由设备校验。",
    ),
    (
        0x019634,
        100.0,
        "逆变低压断开恢复电压值，写入 V×100；详细适用范围由设备校验。",
    ),
    (
        0x019635,
        100.0,
        "逆变过压断开恢复电压值，写入 V×100；详细适用范围由设备校验。",
    ),
    (
        0x019636,
        100.0,
        "逆变过压断开电压值，写入 V×100；详细适用范围由设备校验。",
    ),
    (
        0x019656,
        100.0,
        "蓄电池 1 温度告警上限，写入 ℃×100 的 I16 补码。",
    ),
    (
        0x019657,
        100.0,
        "蓄电池 1 温度告警下限，写入 ℃×100 的 I16 补码。",
    ),
    (
        0x019658,
        100.0,
        "设备内部温度上限，写入 ℃×100 的 I16 补码。",
    ),
    (
        0x019659,
        100.0,
        "设备内部温度上限恢复，写入 ℃×100 的 I16 补码。",
    ),
    (
        0x01965C,
        100.0,
        "夜晚时间阈值电压，写入 V×100 的 UINT16 原码。",
    ),
    (0x01965D, 1.0, "光信号启动（夜晚）确认时间，分钟，倍率 1。"),
    (
        0x01965E,
        100.0,
        "白天时间阈值电压，写入 V×100 的 UINT16 原码。",
    ),
    (0x01965F, 1.0, "光信号关闭（白天）确认时间，分钟，倍率 1。"),
    (
        0x019660,
        1.0,
        "负载输出控制模式 0～5：手动、光控、光控+多时段、定时及协议扩展模式。",
    ),
    (
        0x019661,
        1.0,
        "工作时长 1：高字节小时、低字节分钟，分钟 0～59。",
    ),
    (
        0x019662,
        1.0,
        "工作时长 2：高字节小时、低字节分钟，分钟 0～59。",
    ),
    (
        0x019663,
        1.0,
        "定时开时刻 1：当天累计秒数 0～86399，UINT32_LE；不是 HHMMSS。",
    ),
    (
        0x019666,
        1.0,
        "定时关时刻 1：当天累计秒数 0～86399，UINT32_LE；不是 HHMMSS。",
    ),
    (
        0x019669,
        1.0,
        "定时开时刻 2：当天累计秒数 0～86399，UINT32_LE；不是 HHMMSS。",
    ),
    (
        0x01966C,
        1.0,
        "定时关时刻 2：当天累计秒数 0～86399，UINT32_LE；不是 HHMMSS。",
    ),
    (
        0x01966F,
        1.0,
        "夜间时长：高字节小时、低字节分钟，分钟 0～59。",
    ),
    (
        0x019670,
        1.0,
        "定时控制时间段：0=1 时段、1=2 时段，以此类推，原始码 0～65535。",
    ),
    (
        0x019671,
        1.0,
        "手动控制条件下设定的开/关：0 关、1 开；不会自动修改负载模式。",
    ),
    (
        0x003011,
        1.0,
        "风向偏移：0 正常，1 偏移 180°；UINT16_LE，无回读。",
    ),
    (
        0x003012,
        1.0,
        "雨量灵敏度：0～65535，默认 0x0011；改小增加灵敏度，无回读。",
    ),
];

#[derive(Clone, Copy, PartialEq, Eq)]
enum Category {
    Power,
    Environment,
}

pub fn parameter(ioa: u32) -> Option<&'static (u32, f32, &'static str)> {
    PARAMETERS.iter().find(|p| p.0 == ioa)
}

pub fn is_power(ioa: u32) -> bool {
    (0x01960F..=0x019671).contains(&ioa) && parameter(ioa).is_some()
}

pub fn is_environment(ioa: u32) -> bool {
    matches!(ioa, 0x003011 | 0x003012)
}

pub fn is_timer(ioa: u32) -> bool {
    matches!(ioa, 0x019663 | 0x019666 | 0x019669 | 0x01966C)
}

/// VALUE byte length for every supported C_WS_NA_1 point, excluding PI.
pub fn value_len(ioa: u32) -> Option<usize> {
    if (0x003000..=0x00300B).contains(&ioa) || is_timer(ioa) {
        Some(4)
    } else if ioa == 0x00300C || is_power(ioa) || is_environment(ioa) {
        Some(2)
    } else {
        None
    }
}

pub fn signed(ioa: u32) -> bool {
    matches!(ioa, 0x019622 | 0x019623 | 0x019656..=0x019659)
}

fn category(ioa: u32) -> Option<Category> {
    if is_power(ioa) {
        Some(Category::Power)
    } else if is_environment(ioa) {
        Some(Category::Environment)
    } else {
        None
    }
}

#[derive(Clone, Deserialize)]
pub struct Setting {
    pub ioa: u32,
    // Signed integer for I16 points; unsigned integer for UINT16/UINT32 points.
    pub value: i32,
}

fn validate_value(ioa: u32, value: i32) -> Result<(), String> {
    let (min, max) = match ioa {
        0x01960F => (0, 12),
        0x019611 => (0, 9),
        0x019621 => (0, 65535),
        0x019622 | 0x019623 => (-4000, 1000),
        0x019631 | 0x019632 => (0, 65535),
        0x019656..=0x019659 => (-32768, 32767),
        0x019660 => (0, 5),
        0x019663 | 0x019666 | 0x019669 | 0x01966C => (0, 86399),
        0x019671 => (0, 1),
        0x003011 => (0, 1),
        _ if signed(ioa) => (-32768, 32767),
        _ => (0, 65535),
    };
    if !(min..=max).contains(&value) {
        return Err(format!("0x{ioa:06X} 原始码范围 {min}～{max}"));
    }
    let valid = match ioa {
        0x019621 => matches!(value, 768 | 1024),
        0x019624 => value & 0xff <= 59 && (value >> 8) & 0xff <= 59,
        0x019631 => matches!(value, 11000 | 12000 | 22000 | 23000),
        0x019632 => matches!(value, 5000 | 6000),
        0x019661 | 0x019662 | 0x01966F => value & 0xff <= 59,
        _ => true,
    };
    if !valid {
        return Err(format!("0x{ioa:06X} 枚举或打包参数无效"));
    }
    Ok(())
}

pub fn build(items: &[Setting], pi: u8) -> Result<Vec<u8>, String> {
    if items.is_empty() || items.len() > 16 || pi > 2 {
        return Err("每帧须为 1～16 个参数，PI 为 0/1/2".into());
    }
    let category_kind = category(items[0].ioa).ok_or("不支持的遥调参数点")?;
    let maximum = match category_kind {
        Category::Power => 16,
        Category::Environment => 2,
    };
    if items.len() > maximum {
        return Err("该类别遥调参数超过单帧上限".into());
    }
    let mut asdu = vec![0xca, items.len() as u8, 6, 0, 1, 0];
    for (index, item) in items.iter().enumerate() {
        if category(item.ioa) != Some(category_kind)
            || (index > 0 && items[index - 1].ioa >= item.ioa)
        {
            return Err("遥调参数必须同类、按 IOA 递增且不重复".into());
        }
        validate_value(item.ioa, item.value)?;
        asdu.extend_from_slice(&item.ioa.to_le_bytes()[..3]);
        asdu.push(pi);
        if is_timer(item.ioa) {
            asdu.extend_from_slice(&(item.value as u32).to_le_bytes());
        } else {
            asdu.extend_from_slice(&(item.value as u16).to_le_bytes());
        }
    }
    Ok(asdu)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::iec104;

    fn setting(ioa: u32, value: i32) -> Setting {
        Setting { ioa, value }
    }

    #[test]
    fn raw_parameters_match_v33_examples_and_widths() {
        for pi in 0..=2 {
            let frame = build(&[setting(0x019622, -1000)], pi).unwrap();
            assert_eq!(
                frame,
                vec![0xca, 1, 6, 0, 1, 0, 0x22, 0x96, 1, pi, 0x18, 0xfc]
            );
            let parsed = iec104::parse(&iec104::i(0, 0, frame));
            assert!(parsed.error.is_none());
            assert_eq!(parsed.objects[0].value, "-1000");
        }

        let timer = build(&[setting(0x019663, 63030)], 1).unwrap();
        assert_eq!(
            timer,
            vec![0xca, 1, 6, 0, 1, 0, 0x63, 0x96, 1, 1, 0x36, 0xf6, 0, 0]
        );
        let parsed = iec104::parse(&iec104::i(0, 0, timer));
        assert!(parsed.error.is_none());
        assert_eq!(parsed.objects[0].value, "63030");

        let enable = build(&[setting(0x019621, 768)], 1).unwrap();
        assert_eq!(&enable[6..], &[0x21, 0x96, 1, 1, 0, 3]);
        let packed = build(&[setting(0x019624, 0x2238)], 1).unwrap();
        assert_eq!(&packed[6..], &[0x24, 0x96, 1, 1, 0x38, 0x22]);
        assert_eq!(
            build(&[setting(0x003011, 1)], 1).unwrap()[6..],
            [0x11, 0x30, 0, 1, 1, 0]
        );
        assert_eq!(
            build(&[setting(0x003012, 0x11)], 1).unwrap()[6..],
            [0x12, 0x30, 0, 1, 0x11, 0]
        );
    }

    #[test]
    fn parses_mixed_width_power_frames_and_rejects_invalid_values() {
        let items = [
            setting(0x019662, 0x0102),
            setting(0x019663, 63030),
            setting(0x019666, 86399),
            setting(0x019670, 2),
        ];
        let frame = iec104::i(0, 0, build(&items, 1).unwrap());
        let parsed = iec104::parse(&frame);
        assert!(parsed.error.is_none());
        assert_eq!(parsed.objects.len(), 4);
        assert_eq!(parsed.objects[0].ioa, 0x019662);
        assert_eq!(parsed.objects[1].value, "63030");
        assert_eq!(parsed.objects[2].value, "86399");
        assert_eq!(parsed.objects[3].ioa, 0x019670);

        for (ioa, value) in [
            (0x019663, 86400),
            (0x019621, 3),
            (0x019621, 4),
            (0x019660, 6),
            (0x019631, 11001),
            (0x019632, 5001),
            (0x019624, 60),
            (0x019624, 60 << 8),
            (0x019661, 60),
            (0x019622, -4001),
            (0x019622, 1001),
            (0x003011, 2),
            (0x019000, 0),
            (0x00300d, 0),
        ] {
            assert!(
                build(&[setting(ioa, value)], 1).is_err(),
                "0x{ioa:06X}={value}"
            );
        }
        assert!(build(&[setting(0x019663, 0)], 3).is_err());
        assert!(build(&[setting(0x019663, 0); 0], 1).is_err());
        assert!(build(&vec![setting(0x019610, 0); 17], 1).is_err());
        assert!(build(&[setting(0x019610, 0), setting(0x01960f, 0)], 1).is_err());
        assert!(build(&[setting(0x019610, 0), setting(0x019610, 0)], 1).is_err());
        assert!(build(&[setting(0x003011, 0), setting(0x019610, 0)], 1).is_err());
        assert!(build(
            &[
                setting(0x003011, 0),
                setting(0x003012, 0),
                setting(0x003012, 0)
            ],
            1
        )
        .is_err());
    }
}
