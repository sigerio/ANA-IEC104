use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct PointDef {
    pub ioa: u32,
    pub name: &'static str,
    pub kind: &'static str,
    pub unit: &'static str,
}

pub fn all() -> Vec<PointDef> {
    [
        (0x000001, "门打开到位", "遥信", ""),
        (0x000002, "门关闭到位", "遥信", ""),
        (0x000003, "停机坪伸出到位", "遥信", ""),
        (0x000004, "停机坪缩回到位", "遥信", ""),
        (0x000010, "急停状态", "遥信", ""),
        (0x000011, "门运行状态", "遥信", ""),
        (0x000012, "停机坪运行状态", "遥信", ""),
        (0x000013, "WS2812 灯效活动", "遥信", ""),
        (0x000014, "指示灯已点亮", "遥信", ""),
        (0x000015, "内部照明已点亮", "遥信", ""),
        (0x000016, "门加热解冻使能", "遥信", ""),
        (0x000017, "门限位冲突故障", "遥信", ""),
        (0x000018, "平台限位冲突故障", "遥信", ""),
        (0x000100, "门状态", "遥测", "状态码"),
        (0x000101, "停机坪状态", "遥测", "状态码"),
        (0x000200, "打开门", "遥控", ""),
        (0x000201, "关闭门", "遥控", ""),
        (0x000210, "伸出停机坪", "遥控", ""),
        (0x000211, "缩回停机坪", "遥控", ""),
        (0x000220, "空调监控开机", "遥控", ""),
        (0x000221, "空调监控关机", "遥控", ""),
        (0x000222, "打开内部照明", "遥控", ""),
        (0x000223, "关闭内部照明", "遥控", ""),
        (0x000224, "使能门加热解冻", "遥控", ""),
        (0x000225, "关闭门加热", "遥控", ""),
        (0x001000, "温湿度传感器在线", "遥信", ""),
        (0x001001, "温湿度传感器故障", "遥信", ""),
        (0x001010, "风速风向传感器在线", "遥信", ""),
        (0x001011, "风速风向传感器故障", "遥信", ""),
        (0x001020, "水浸传感器在线", "遥信", ""),
        (0x001021, "水浸告警", "遥信", ""),
        (0x001030, "雨量传感器在线", "遥信", ""),
        (0x001031, "雨量传感器故障", "遥信", ""),
        (0x001040, "空调在线", "遥信", ""),
        (0x001041, "空调故障或告警", "遥信", ""),
        (0x001042, "空调制冷运行", "遥信", ""),
        (0x001043, "空调制热运行", "遥信", ""),
        (0x001044, "空调内风机运行", "遥信", ""),
        (0x001045, "空调外风机运行", "遥信", ""),
        (0x001046, "空调湿度高告警", "遥信", ""),
        (0x001047, "空调高温告警", "遥信", ""),
        (0x001048, "空调低温告警", "遥信", ""),
        (0x001049, "空调冷凝器高压告警", "遥信", ""),
        (0x00104A, "空调蒸发器冻结告警", "遥信", ""),
        (0x00104B, "空调机柜温度传感器故障", "遥信", ""),
        (0x00104C, "空调蒸发器温度传感器故障", "遥信", ""),
        (0x00104D, "空调冷凝器温度传感器故障", "遥信", ""),
        (0x00104E, "空调湿度传感器故障", "遥信", ""),
        (0x002000, "温度", "遥测", "°C"),
        (0x002001, "湿度", "遥测", "%RH"),
        (0x002010, "风速", "遥测", "m/s"),
        (0x002011, "风向", "遥测", "°"),
        (0x002020, "水浸原始值", "遥测", ""),
        (0x002030, "累计雨量翻斗计数", "遥测", "0.1mm/计数"),
        (0x002031, "瞬时雨量", "遥测", "mm"),
        (0x002032, "雨滴动态感应值", "遥测", ""),
        (0x002033, "雨水状态值", "遥测", ""),
        (0x002040, "空调机柜温度", "遥测", "°C"),
        (0x002041, "空调蒸发器温度", "遥测", "°C"),
        (0x002042, "空调冷凝器温度", "遥测", "°C"),
        (0x002043, "空调湿度", "遥测", "%RH"),
        (0x003000, "空调制冷启动温度阈值", "遥调", "°C"),
        (0x003001, "空调制冷停止温度阈值", "遥调", "°C"),
        (0x003002, "空调制热启动温度阈值", "遥调", "°C"),
        (0x003003, "空调制热停止温度阈值", "遥调", "°C"),
        (0x003004, "空调高温告警阈值", "遥调", "°C"),
        (0x003005, "空调低温告警阈值", "遥调", "°C"),
        (0x003006, "空调冷凝器高压保护阈值", "遥调", ""),
        (0x003007, "空调蒸发器防冻保护阈值", "遥调", ""),
        (0x003008, "空调除湿启动湿度", "遥调", "%RH"),
        (0x003009, "空调除湿停止湿度", "遥调", "%RH"),
        (0x00300A, "空调湿度告警阈值", "遥调", "%RH"),
        (0x00300B, "空调湿度校准值", "遥调", "%RH"),
        (0x00300C, "空调模式控制", "遥调", "整数"),
        (0x00300D, "温度校正", "遥调", "°C"),
        (0x00300E, "湿度校正", "遥调", "%RH"),
        (0x00300F, "风速校正", "遥调", "m/s"),
        (0x003010, "风向校正", "遥调", "°"),
    ]
    .into_iter()
    .map(|(ioa, name, kind, unit)| PointDef {
        ioa,
        name,
        kind,
        unit,
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_all_36_signals_and_limit_fault_quality() {
        let points: Vec<_> = all().into_iter().filter(|p| p.kind == "遥信").collect();
        let mut asdu = vec![1, 36, 20, 0, 1, 0];
        for point in &points {
            asdu.extend_from_slice(&point.ioa.to_le_bytes()[..3]);
            asdu.push(match point.ioa {
                0x17 => 1,
                0x18 => 0xc0,
                _ => 0,
            });
        }
        let frame = crate::iec104::i(0, 0, asdu);
        assert_eq!(frame[1], 0x9a);
        let parsed = crate::iec104::parse(&frame);
        assert!(parsed.error.is_none());
        assert_eq!(parsed.objects.len(), 36);
        for (point, object) in points.iter().zip(&parsed.objects) {
            assert_eq!(point.ioa, object.ioa);
        }
        let door = parsed.objects.iter().find(|p| p.ioa == 0x17).unwrap();
        assert_eq!(door.value, "ON");
        assert_eq!(door.quality, "正常");
        let platform = parsed.objects.iter().find(|p| p.ioa == 0x18).unwrap();
        assert_eq!(platform.value, "OFF");
        assert_eq!(platform.quality, "NT|IV");
    }

    #[test]
    fn includes_configured_controls() {
        let points = all();
        assert_eq!(
            points.iter().filter(|point| point.kind == "遥信").count(),
            36
        );
        assert!(points.iter().any(|point| point.ioa == 0x000017
            && point.name == "门限位冲突故障"
            && point.kind == "遥信"));
        assert!(points.iter().any(|point| point.ioa == 0x000018
            && point.name == "平台限位冲突故障"
            && point.kind == "遥信"));
        assert_eq!(
            points
                .iter()
                .filter(|point| matches!(point.kind, "遥测" | "遥调"))
                .count(),
            32
        );
        assert!(points
            .iter()
            .any(|point| point.ioa == 0x000013 && point.kind == "遥信"));
        assert!(points
            .iter()
            .any(|point| point.ioa == 0x000220 && point.name == "空调监控开机"));
        assert!(points
            .iter()
            .any(|point| point.ioa == 0x000221 && point.name == "空调监控关机"));
        assert!(points
            .iter()
            .any(|point| point.ioa == 0x000222 && point.kind == "遥控"));
        assert!(points
            .iter()
            .any(|point| point.ioa == 0x003010 && point.name == "风向校正"));
        assert_eq!(
            points.iter().filter(|point| point.kind == "遥控").count(),
            10
        );
        for (ioa, name, kind) in [
            (0x000016, "门加热解冻使能", "遥信"),
            (0x000224, "使能门加热解冻", "遥控"),
            (0x000225, "关闭门加热", "遥控"),
        ] {
            assert!(points
                .iter()
                .any(|point| point.ioa == ioa && point.name == name && point.kind == kind));
        }
    }
}
