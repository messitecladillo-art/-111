/**
 * Pure-Vector Chinese County Architectural Landmark Illustrations (中国县域标志性建筑群矢量图库)
 *
 * Crafts 104 intricate, unmistakable pure-SVG architectural landmark archetypes (`360×225`, 16:10)
 * strictly conforming to `assertTrueVector` (zero `<style>`, `<filter>`, `<image>`, `url(...)`, or scripts).
 * Resolves all 2,845 counties across 34 provincial units via:
 *   1. Exact county landmark mappings (`COUNTY_EXACT_LANDMARKS`, 2,851 curated entries: 2,845 / 2,845 = 100.00% of mainland counties/districts incl. all 9 Jinhua units & 20 official pack units + 6 TW/HK/MO units)
 *   2. Prefecture + Toponymic Smart Archetype Picker + Province-specific cultural pools with deterministic sibling variety.
 */
import type { FigureInk } from '../figure-palette.ts';

export type LandmarkArchetypeId =
  | 'bayong_lou'
  | 'wanfo_pagoda_plaza'
  | 'covered_bridge_pavilion'
  | 'memorial_archway_paifang'
  | 'tea_house_heritage'
  | 'ancestral_taiji_hall'
  | 'yiwu_tradecity_jiming'
  | 'dongyang_luzhai_mansion'
  | 'wufeng_academy_cliff'
  | 'tiananmen_gatehouse'
  | 'temple_of_heaven'
  | 'summer_palace_foxxiang'
  | 'oriental_pearl_lujiazui'
  | 'bund_shikumen'
  | 'canton_tower_qilou'
  | 'pingan_harbor_skyline'
  | 'hk_boc_harbour'
  | 'macau_st_pauls'
  | 'taipei_101_memorial'
  | 'jiangnan_gardens_gate'
  | 'west_lake_leifeng'
  | 'yellow_crane_tower'
  | 'tengwang_yueyang_tower'
  | 'huizhou_matouqiang'
  | 'fujian_tulou_round'
  | 'minnan_swallowtail_qilou'
  | 'potala_palace_fortress'
  | 'diaojiaolou_stilt'
  | 'dong_drum_tower'
  | 'dali_three_pagodas'
  | 'lijiang_naxi_gate'
  | 'dai_peacock_temple'
  | 'xian_bell_goose_pagoda'
  | 'yaodong_baota_hill'
  | 'yingxian_timber_pagoda'
  | 'pingyao_city_gate'
  | 'dunhuang_mogao_nine'
  | 'jiayuguan_pass_fortress'
  | 'kashgar_islamic_arcade'
  | 'harbin_sophia_dome'
  | 'mongol_ger_oboo'
  | 'dujiangyan_temple_weir'
  | 'chongqing_hongyadong'
  | 'confucian_temple_qufu'
  | 'maritime_lighthouse_harbor'
  | 'sea_crossing_cable_bridge'
  | 'hsr_modern_hub'
  | 'modern_civic_opera'
  | 'smart_science_twin_towers'
  | 'ancient_water_wharf'
  | 'bamboo_courtyard_library'
  | 'beacon_tower_greatwall'
  | 'industrial_heritage_loft'
  | 'desert_observatory_solar'
  | 'volcanic_stone_village'
  | 'karst_stone_watchtower'
  | 'hakka_weilongwu'
  | 'shanxi_courtyard_jinshang'
  | 'tibetan_white_pagoda'
  | 'dong_wind_rain_bridge'
  | 'northeast_wooden_granary'
  | 'lingnan_wok_ear_hall'
  | 'grand_canal_granary'
  | 'karst_radio_telescope'
  | 'grotto_cliff_buddha'
  | 'porcelain_dragon_kiln'
  | 'salt_well_derrick'
  | 'terraced_rice_pavilion'
  | 'ancient_star_observatory'
  | 'red_revolution_memorial'
  | 'hydroelectric_arch_dam'
  | 'inland_dryport_railhub'
  | 'ancient_post_station'
  | 'floating_water_market'
  | 'wind_solar_storage_base'
  | 'iron_chain_canyon_bridge'
  | 'bamboo_sea_watchtower'
  | 'tea_horse_caravan_gate'
  | 'mangrove_bird_boardwalk'
  | 'space_launch_gantry'
  | 'coastal_salt_pan_pyramid'
  | 'hanging_cliff_monastery'
  | 'crater_tianchi_volcano_rim'
  | 'automated_deepwater_port_crane'
  | 'glacier_snow_peak_station'
  | 'classical_wood_opera_stage'
  | 'geothermal_hot_spring_pavilion'
  | 'subtropical_coffee_drying_terrace'
  | 'ancient_stone_aqueduct_weir'
  | 'cliffside_tea_terraces'
  | 'island_wind_turbine_bay'
  | 'border_port_railway_gate'
  | 'bamboo_raft_karst_pier'
  | 'glass_greenhouse_agripark'
  | 'red_sandstone_danxia_arch'
  | 'snow_birch_timber_station'
  | 'tidal_estuary_sluice_bridge'
  | 'volcanic_basalt_sea_stack'
  | 'subterranean_karst_cavern_hall'
  | 'floating_solar_reservoir_array'
  | 'high_speed_viaduct_mountain_tunnel'
  | 'ceramic_dragon_kiln_chimney'
  | 'alpine_yak_meadow_pass'
  | 'ancient_silk_caravanserai_gate';

export const LANDMARK_ARCHETYPES: readonly LandmarkArchetypeId[] = [
  'bayong_lou',
  'wanfo_pagoda_plaza',
  'covered_bridge_pavilion',
  'memorial_archway_paifang',
  'tea_house_heritage',
  'ancestral_taiji_hall',
  'yiwu_tradecity_jiming',
  'dongyang_luzhai_mansion',
  'wufeng_academy_cliff',
  'tiananmen_gatehouse',
  'temple_of_heaven',
  'summer_palace_foxxiang',
  'oriental_pearl_lujiazui',
  'bund_shikumen',
  'canton_tower_qilou',
  'pingan_harbor_skyline',
  'hk_boc_harbour',
  'macau_st_pauls',
  'taipei_101_memorial',
  'jiangnan_gardens_gate',
  'west_lake_leifeng',
  'yellow_crane_tower',
  'tengwang_yueyang_tower',
  'huizhou_matouqiang',
  'fujian_tulou_round',
  'minnan_swallowtail_qilou',
  'potala_palace_fortress',
  'diaojiaolou_stilt',
  'dong_drum_tower',
  'dali_three_pagodas',
  'lijiang_naxi_gate',
  'dai_peacock_temple',
  'xian_bell_goose_pagoda',
  'yaodong_baota_hill',
  'yingxian_timber_pagoda',
  'pingyao_city_gate',
  'dunhuang_mogao_nine',
  'jiayuguan_pass_fortress',
  'kashgar_islamic_arcade',
  'harbin_sophia_dome',
  'mongol_ger_oboo',
  'dujiangyan_temple_weir',
  'chongqing_hongyadong',
  'confucian_temple_qufu',
  'maritime_lighthouse_harbor',
  'sea_crossing_cable_bridge',
  'hsr_modern_hub',
  'modern_civic_opera',
  'smart_science_twin_towers',
  'ancient_water_wharf',
  'bamboo_courtyard_library',
  'beacon_tower_greatwall',
  'industrial_heritage_loft',
  'desert_observatory_solar',
  'volcanic_stone_village',
  'karst_stone_watchtower',
  'hakka_weilongwu',
  'shanxi_courtyard_jinshang',
  'tibetan_white_pagoda',
  'dong_wind_rain_bridge',
  'northeast_wooden_granary',
  'lingnan_wok_ear_hall',
  'grand_canal_granary',
  'karst_radio_telescope',
  'grotto_cliff_buddha',
  'porcelain_dragon_kiln',
  'salt_well_derrick',
  'terraced_rice_pavilion',
  'ancient_star_observatory',
  'red_revolution_memorial',
  'hydroelectric_arch_dam',
  'inland_dryport_railhub',
  'ancient_post_station',
  'floating_water_market',
  'wind_solar_storage_base',
  'iron_chain_canyon_bridge',
  'bamboo_sea_watchtower',
  'tea_horse_caravan_gate',
  'mangrove_bird_boardwalk',
  'space_launch_gantry',
  'coastal_salt_pan_pyramid',
  'hanging_cliff_monastery',
  'crater_tianchi_volcano_rim',
  'automated_deepwater_port_crane',
  'glacier_snow_peak_station',
  'classical_wood_opera_stage',
  'geothermal_hot_spring_pavilion',
  'subtropical_coffee_drying_terrace',
  'ancient_stone_aqueduct_weir',
  'cliffside_tea_terraces',
  'island_wind_turbine_bay',
  'border_port_railway_gate',
  'bamboo_raft_karst_pier',
  'glass_greenhouse_agripark',
  'red_sandstone_danxia_arch',
  'snow_birch_timber_station',
  'tidal_estuary_sluice_bridge',
  'volcanic_basalt_sea_stack',
  'subterranean_karst_cavern_hall',
  'floating_solar_reservoir_array',
  'high_speed_viaduct_mountain_tunnel',
  'ceramic_dragon_kiln_chimney',
  'alpine_yak_meadow_pass',
  'ancient_silk_caravanserai_gate',
] as const;

export interface LandmarkResolution {
  kind: LandmarkArchetypeId;
  landmarkName: string;
  badgeTag: string;
}

export interface LandmarkRenderSpec {
  code: string;
  name: string;
  provinceCode: string;
  prefectureName: string;
  kind: LandmarkArchetypeId;
  landmarkName: string;
  accentHex: string;
  tags?: readonly string[];
}

export interface ExactLandmarkEntry {
  kind: LandmarkArchetypeId;
  landmarkName: string;
  badgeTag: string;
}

export const COUNTY_EXACT_LANDMARKS: Readonly<Record<string, ExactLandmarkEntry>> = {
  // === 金华市全 9 县市区（逐一独立标志性建筑） ===
  '330702': { kind: 'bayong_lou', landmarkName: '八咏楼', badgeTag: '八咏词韵古楼' },
  '330703': { kind: 'wanfo_pagoda_plaza', landmarkName: '万佛塔与施光南音乐广场', badgeTag: '万佛塔影新城' },
  '330723': { kind: 'covered_bridge_pavilion', landmarkName: '熟溪古廊桥', badgeTag: '熟溪廊桥温泉' },
  '330726': { kind: 'memorial_archway_paifang', landmarkName: '郑义门江南第一家牌坊', badgeTag: '九世义门牌坊' },
  '330727': { kind: 'tea_house_heritage', landmarkName: '玉山古茶场飞檐茶楼', badgeTag: '宋代古茶场' },
  '330781': { kind: 'ancestral_taiji_hall', landmarkName: '诸葛八卦村钟池大公堂', badgeTag: '八卦钟池宗祠' },
  '330782': { kind: 'yiwu_tradecity_jiming', landmarkName: '国际商贸城与鸡鸣阁', badgeTag: '万国商贸地标' },
  '330783': { kind: 'dongyang_luzhai_mansion', landmarkName: '卢宅肃雍堂木雕门楼', badgeTag: '江南木雕甲第' },
  '330784': { kind: 'wufeng_academy_cliff', landmarkName: '方岩五峰书院与胡公祠', badgeTag: '丹崖五峰书院' },

  // === 北京市 ===
  '110101': { kind: 'temple_of_heaven', landmarkName: '天坛祈年殿与前门', badgeTag: '中轴皇城遗产' },
  '110102': { kind: 'tiananmen_gatehouse', landmarkName: '太和门阙与白塔鼓楼', badgeTag: '古都金融胡同' },
  '110105': { kind: 'smart_science_twin_towers', landmarkName: 'CBD中国尊与鸟巢地标', badgeTag: '国际商务地标' },
  '110106': { kind: 'hsr_modern_hub', landmarkName: '丰台铁路枢纽与卢沟桥', badgeTag: '京南枢纽门户' },
  '110108': { kind: 'summer_palace_foxxiang', landmarkName: '颐和园佛香阁', badgeTag: '三山五园科创' },
  '110112': { kind: 'grand_canal_granary', landmarkName: '通州燃灯塔大运河漕运仓', badgeTag: '副中心运河门户' },
  '110115': { kind: 'hsr_modern_hub', landmarkName: '大兴国际机场飞翼航站楼', badgeTag: '临空凤凰枢翼' },
  '110116': { kind: 'beacon_tower_greatwall', landmarkName: '慕田峪长城敌楼', badgeTag: '雁栖峰会长城' },
  '110119': { kind: 'beacon_tower_greatwall', landmarkName: '八达岭长城雄关', badgeTag: '京北长城雄关' },
  '110109': { kind: 'yingxian_timber_pagoda', landmarkName: '潭柘寺千年古刹山门', badgeTag: '京西古刹禅林' },
  '110111': { kind: 'wanfo_pagoda_plaza', landmarkName: '云居寺石经塔周口店', badgeTag: '石经房山遗址' },
  '110114': { kind: 'beacon_tower_greatwall', landmarkName: '居庸关雄关十三陵坊', badgeTag: '京师北枕雄关' },
  '110118': { kind: 'beacon_tower_greatwall', landmarkName: '古北水镇司马台长城', badgeTag: '京郊水镇长城' },
  '110107': { kind: 'industrial_heritage_loft', landmarkName: '首钢园三高炉与滑雪跳台', badgeTag: '冬奥工业转型区' },
  '110113': { kind: 'hsr_modern_hub', landmarkName: '首都机场飞翼与潮白水岸', badgeTag: '临空国际会展港' },
  '110117': { kind: 'wufeng_academy_cliff', landmarkName: '丫髻山古道观与金海湖', badgeTag: '京东桃花休闲谷' },

  // === 天津市 ===
  '120101': { kind: 'bund_shikumen', landmarkName: '五大道洋楼与解放桥', badgeTag: '百年洋楼商脉' },
  '120104': { kind: 'memorial_archway_paifang', landmarkName: '古文化街牌坊与鼓楼', badgeTag: '津门曲艺学府' },
  '120105': { kind: 'sea_crossing_cable_bridge', landmarkName: '海河之眼与意式风情区', badgeTag: '海河桥梁风貌' },
  '120116': { kind: 'maritime_lighthouse_harbor', landmarkName: '滨海津门灯塔与生态港湾', badgeTag: '北方航运大港' },
  '120119': { kind: 'yingxian_timber_pagoda', landmarkName: '独乐寺千年观音木阁', badgeTag: '千年辽代木构' },
  '120111': { kind: 'dongyang_luzhai_mansion', landmarkName: '杨柳青石家大院戏楼', badgeTag: '年画运河古镇' },
  '120114': { kind: 'bund_shikumen', landmarkName: '武清北运河意式拱廊', badgeTag: '京津走廊商圈' },
  '120115': { kind: 'yingxian_timber_pagoda', landmarkName: '宝坻辽代广济寺古阁', badgeTag: '京东辽代名刹' },
  '120117': { kind: 'bamboo_courtyard_library', landmarkName: '七里海古泻湖湿地馆', badgeTag: '渤海湿地稻乡' },
  '120102': { kind: 'industrial_heritage_loft', landmarkName: '棉三百年纱厂与海河东岸', badgeTag: '海河工业文创带' },
  '120103': { kind: 'modern_civic_opera', landmarkName: '津湾文化中心大剧院穹顶', badgeTag: '海河都市文化核' },
  '120106': { kind: 'hsr_modern_hub', landmarkName: '天津西站红砖站楼与高铁', badgeTag: '海河源头高铁门' },
  '120110': { kind: 'smart_science_twin_towers', landmarkName: '津门临空科创研发双塔', badgeTag: '航空制造科创城' },
  '120112': { kind: 'modern_civic_opera', landmarkName: '国家会展中心与海教园馆', badgeTag: '津南会展大学城' },
  '120113': { kind: 'ancient_water_wharf', landmarkName: '北运河古渡与桃花堤阁', badgeTag: '京津运河制造区' },
  '120118': { kind: 'ancient_water_wharf', landmarkName: '独流古镇运河古渡老醋坊', badgeTag: '运河老醋康养区' },

  // === 河北省 ===
  '130102': { kind: 'modern_civic_opera', landmarkName: '石家庄中心大剧院群', badgeTag: '燕赵都市中轴' },
  '130123': { kind: 'pingyao_city_gate', landmarkName: '正定南城门与四塔古影', badgeTag: '九楼四塔古城' },
  '130131': { kind: 'red_revolution_memorial', landmarkName: '西柏坡太行礼堂院落', badgeTag: '太行红色圣地' },
  '130202': { kind: 'industrial_heritage_loft', landmarkName: '开滦百年矿业遗址公园', badgeTag: '近代工业文博' },
  '130303': { kind: 'jiayuguan_pass_fortress', landmarkName: '山海关天下第一关城楼', badgeTag: '万里长城东首' },
  '130304': { kind: 'maritime_lighthouse_harbor', landmarkName: '北戴河鸽子窝海岸灯塔', badgeTag: '渤海康养海湾' },
  '130632': { kind: 'ancient_water_wharf', landmarkName: '白洋淀荷花古渡水门', badgeTag: '雄安生态水城' },
  '130709': { kind: 'modern_civic_opera', landmarkName: '崇礼雪如意跳台与云顶', badgeTag: '冬奥冰雪地标' },
  '130802': { kind: 'tiananmen_gatehouse', landmarkName: '避暑山庄丽正门宫阙', badgeTag: '皇家塞外园林' },
  '130133': { kind: 'covered_bridge_pavilion', landmarkName: '赵州安济桥单孔石拱', badgeTag: '天下第一古桥' },
  '130726': { kind: 'pingyao_city_gate', landmarkName: '蔚县暖泉西古堡门楼', badgeTag: '蔚州剪纸古堡' },
  '130633': { kind: 'memorial_archway_paifang', landmarkName: '清西陵泰陵石雕牌坊', badgeTag: '易水太行古陵' },
  '130281': { kind: 'tiananmen_gatehouse', landmarkName: '清东陵孝陵大红门阙', badgeTag: '燕山皇家陵寝' },
  '130283': { kind: 'tengwang_yueyang_tower', landmarkName: '迁安滦河黄台山轩辕阁', badgeTag: '水城精品钢城' },
  '130481': { kind: 'wufeng_academy_cliff', landmarkName: '武安东太行京娘湖崖', badgeTag: '太行山岳钢城' },
  '130322': { kind: 'maritime_lighthouse_harbor', landmarkName: '昌黎翡翠岛海岸灯塔', badgeTag: '碣石山酿酒湾' },
  '130634': { kind: 'confucian_temple_qufu', landmarkName: '曲阳北岳庙德宁大殿', badgeTag: '定瓷石雕之乡' },
  '130928': { kind: 'pingyao_city_gate', landmarkName: '吴桥江湖文化城鼓楼', badgeTag: '中国杂技之乡' },
  '130426': { kind: 'hanging_cliff_monastery', landmarkName: '涉县娲皇宫悬崖飞阁吊楼', badgeTag: '太行悬空石阁' },
  '130730': { kind: 'ancient_post_station', landmarkName: '怀来鸡鸣驿古城楼驿道', badgeTag: '千年鸡鸣古驿' },
  '130826': { kind: 'mongol_ger_oboo', landmarkName: '丰宁京北第一草原毡房', badgeTag: '坝上草原风情' },
  '130682': { kind: 'wanfo_pagoda_plaza', landmarkName: '定州开元寺料敌古塔', badgeTag: '千年定瓷古城' },
  '130425': { kind: 'bund_shikumen', landmarkName: '大名府古城百年教堂', badgeTag: '冀南宋代陪都' },
  '130828': { kind: 'beacon_tower_greatwall', landmarkName: '塞罕坝林海望火高塔', badgeTag: '木兰秋狝林海' },
  '130104': { kind: 'bund_shikumen', landmarkName: '百年正太饭店与大石桥', badgeTag: '铁路开埠红色城' },
  '130110': { kind: 'wufeng_academy_cliff', landmarkName: '抱犊寨悬崖南天门古城', badgeTag: '太行东麓电子城' },
  '130203': { kind: 'modern_civic_opera', landmarkName: '唐山抗震纪念馆与文化园', badgeTag: '北方瓷都中心区' },
  '130403': { kind: 'bayong_lou', landmarkName: '战国赵武灵王丛台古阁', badgeTag: '三千年成语古都' },
  '130606': { kind: 'jiangnan_gardens_gate', landmarkName: '古莲花池书院与总督署', badgeTag: '京畿名园莲池城' },
  '130903': { kind: 'grand_canal_granary', landmarkName: '沧州南川楼运河漕运古仓', badgeTag: '武术杂技运河城' },
  '130105': { kind: 'confucian_temple_qufu', landmarkName: '毗卢寺明代壁画殿', badgeTag: '石家庄明代壁画' },
  '130181': { kind: 'yiwu_tradecity_jiming', landmarkName: '辛集国际皮革城阁', badgeTag: '中国皮都化工县' },
  '130184': { kind: 'tiananmen_gatehouse', landmarkName: '新乐伏羲台古殿阁', badgeTag: '羲皇圣里人文源' },
  '130209': { kind: 'automated_deepwater_port_crane', landmarkName: '曹妃甸深水集装箱自动化岸桥', badgeTag: '渤海湾深水自动化' },
  '130225': { kind: 'red_revolution_memorial', landmarkName: '乐亭李大钊纪念馆', badgeTag: '大钊故里渤海湾' },
  '130284': { kind: 'pingyao_city_gate', landmarkName: '滦州古城东门紫金塔', badgeTag: '滦河千年古城' },
  '130302': { kind: 'tiananmen_gatehouse', landmarkName: '秦皇求仙入海处阙', badgeTag: '秦皇岛深水大港' },
  '130423': { kind: 'tiananmen_gatehouse', landmarkName: '临漳邺城铜雀三台', badgeTag: '建安文学古邺都' },
  '130427': { kind: 'ceramic_dragon_kiln_chimney', landmarkName: '磁县磁州窑遗址阶梯窑棚烟囱', badgeTag: '千年磁州名窑群' },
  '130502': { kind: 'bayong_lou', landmarkName: '邢台清风楼与开元寺', badgeTag: '三千五百年邢都' },
  '130681': { kind: 'wanfo_pagoda_plaza', landmarkName: '涿州辽代智度双塔', badgeTag: '三国桃园影视城' },
  '130683': { kind: 'confucian_temple_qufu', landmarkName: '安国药王庙古戏楼', badgeTag: '千年药都祁州城' },
  '130705': { kind: 'pingyao_city_gate', landmarkName: '宣化清远楼与镇朔楼', badgeTag: '京西第一古城' },
  '130984': { kind: 'dongyang_luzhai_mansion', landmarkName: '河间府署古衙院落', badgeTag: '诗经文化古城' },
  '131081': { kind: 'bayong_lou', landmarkName: '胜芳古镇戏楼文昌阁', badgeTag: '京津冀温泉戏曲' },
  '131103': { kind: 'pingyao_city_gate', landmarkName: '冀州古城址与竹林寺', badgeTag: '古九州冀州湖城' },
  '130109': { kind: 'dongyang_luzhai_mansion', landmarkName: '藁城宫灯非遗老街院落', badgeTag: '中华宫灯名城' },
  '130129': { kind: 'wufeng_academy_cliff', landmarkName: '赞皇嶂石岩丹崖回音石壁', badgeTag: '太行嶂石岩地' },
  '130227': { kind: 'beacon_tower_greatwall', landmarkName: '迁西青山关水下长城敌楼', badgeTag: '板栗长城水关' },
  '130306': { kind: 'beacon_tower_greatwall', landmarkName: '抚宁董家口长城边塞敌楼', badgeTag: '长城板厂峪关' },
  '130324': { kind: 'wanfo_pagoda_plaza', landmarkName: '卢龙尊胜陀罗尼经幢古塔', badgeTag: '孤竹古国酒城' },
  '130408': { kind: 'pingyao_city_gate', landmarkName: '广府古城太极水城弘济桥', badgeTag: '杨式太极水城' },
  '130406': { kind: 'grotto_cliff_buddha', landmarkName: '响堂山北齐石窟摩崖悬阁', badgeTag: '北齐皇家石窟' },
  '130503': { kind: 'wufeng_academy_cliff', landmarkName: '邢台前南峪抗大太行山院', badgeTag: '太行百泉山城' },
  '130523': { kind: 'confucian_temple_qufu', landmarkName: '内丘扁鹊庙与邢窑白瓷坊', badgeTag: '神医扁鹊邢瓷' },
  '130582': { kind: 'pingyao_city_gate', landmarkName: '沙河王硇古石寨红石城堡', badgeTag: '太行红石古寨' },
  '130623': { kind: 'wufeng_academy_cliff', landmarkName: '涞水野三坡百里峡崖壁阁', badgeTag: '京西百里峡城' },
  '130624': { kind: 'yaodong_baota_hill', landmarkName: '阜平晋察冀边区革命院馆', badgeTag: '红色太行山乡' },
  '130630': { kind: 'beacon_tower_greatwall', landmarkName: '涞源白石山乌龙沟古长城', badgeTag: '凉城白石奇峰' },
  '130722': { kind: 'mongol_ger_oboo', landmarkName: '张北草原天路中都原始帐', badgeTag: '坝上草原风电' },
  '130731': { kind: 'tiananmen_gatehouse', landmarkName: '涿鹿中华三祖堂合符坛殿', badgeTag: '中华三祖合符' },
  '130824': { kind: 'beacon_tower_greatwall', landmarkName: '滦平金山岭万里长城敌楼', badgeTag: '金山岭长城美' },
  '130923': { kind: 'grand_canal_granary', landmarkName: '东光铁佛寺运河谢家漕仓', badgeTag: '京杭运河铁佛' },
  '130981': { kind: 'grand_canal_granary', landmarkName: '泊头清真寺大运河古粮仓', badgeTag: '铸造鸭梨运河' },
  '131082': { kind: 'modern_civic_opera', landmarkName: '燕郊潮白河梦东方文化馆', badgeTag: '京津冀协同极' },
  '131127': { kind: 'wanfo_pagoda_plaza', landmarkName: '景县开福寺北魏舍利古塔', badgeTag: '广川董子故里' },
  '130107': { kind: 'industrial_heritage_loft', landmarkName: '井陉正丰矿段家楼', badgeTag: '百年煤炭工业遗' },
  '130111': { kind: 'modern_civic_opera', landmarkName: '栾城通航机场博览馆', badgeTag: '省会通航智造城' },
  '130121': { kind: 'karst_stone_watchtower', landmarkName: '井陉于家石头古村阁', badgeTag: '太行石头民俗村' },
  '130125': { kind: 'confucian_temple_qufu', landmarkName: '行唐文庙千年大成殿', badgeTag: '千年古县大枣乡' },
  '130126': { kind: 'wanfo_pagoda_plaza', landmarkName: '灵寿幽居寺北齐砖塔', badgeTag: '五岳寨太行古县' },
  '130127': { kind: 'tiananmen_gatehouse', landmarkName: '高邑刘秀汉光武登基台', badgeTag: '千年凤凰城陶乡' },
  '130130': { kind: 'yiwu_tradecity_jiming', landmarkName: '无极皮革商贸镇远楼', badgeTag: '华北皮革商贸城' },
  '130132': { kind: 'wufeng_academy_cliff', landmarkName: '元氏封龙山书院汉碑阁', badgeTag: '太行汉碑名山城' },
  '130183': { kind: 'dongyang_luzhai_mansion', landmarkName: '周家庄古韵合作社大院', badgeTag: '中国鸭梨之乡' },
  '130204': { kind: 'industrial_heritage_loft', landmarkName: '古冶唐山矿百年工业坊', badgeTag: '煤瓷工业焕新区' },
  '130205': { kind: 'industrial_heritage_loft', landmarkName: '开平唐山花海陶瓷文创', badgeTag: '冀东百年古镇区' },
  '130207': { kind: 'ancient_water_wharf', landmarkName: '丰南河头老街唐风古埠', badgeTag: '运河唐人街水乡' },
  '130208': { kind: 'wanfo_pagoda_plaza', landmarkName: '丰润天宫寺辽代古花塔', badgeTag: '千年辽塔雪芹祖' },
  '130229': { kind: 'confucian_temple_qufu', landmarkName: '玉田净觉寺京东古刹', badgeTag: '京东泥塑鸦鸿桥' },
  '130321': { kind: 'beacon_tower_greatwall', landmarkName: '青龙冷口关长城古敌楼', badgeTag: '燕山板栗满乡城' },
  '130402': { kind: 'tiananmen_gatehouse', landmarkName: '邯山赵王城龙台夯土阙', badgeTag: '战国赵都城遗址' },
  '130435': { kind: 'bamboo_courtyard_library', landmarkName: '曲周农大科技小院书舍', badgeTag: '绿色农业科技院' },
  '130522': { kind: 'porcelain_dragon_kiln', landmarkName: '临城邢窑白瓷古窑遗址', badgeTag: '唐代邢窑白瓷源' },
  '130524': { kind: 'jiangnan_gardens_gate', landmarkName: '柏乡千年汉牡丹园古阁', badgeTag: '千年汉牡丹花乡' },
  '130525': { kind: 'memorial_archway_paifang', landmarkName: '隆尧唐祖陵石刻华表坊', badgeTag: '李唐祖籍千年城' },
  '130528': { kind: 'yiwu_tradecity_jiming', landmarkName: '宁晋线缆商贸文庙古阁', badgeTag: '华北线缆产业城' },
  '130529': { kind: 'pingyao_city_gate', landmarkName: '巨鹿宋代古城遗址水门', badgeTag: '金银花枸杞古郡' },
  '130534': { kind: 'yiwu_tradecity_jiming', landmarkName: '清河国际羊绒商贸展馆', badgeTag: '中国羊绒之都' },
  '130607': { kind: 'dunhuang_mogao_nine', landmarkName: '满城汉墓中山靖王崖窟', badgeTag: '金缕玉衣出土处' },
  '130608': { kind: 'yaodong_baota_hill', landmarkName: '清苑冉庄地道战遗址院', badgeTag: '抗战地道战名村' },
  '130627': { kind: 'memorial_archway_paifang', landmarkName: '唐县白求恩纪念馆牌坊', badgeTag: '古唐国肉羊名城' },
  '130629': { kind: 'smart_science_twin_towers', landmarkName: '容城雄安市民中心双塔', badgeTag: '未来之城启动区' },
  '130638': { kind: 'ancient_water_wharf', landmarkName: '雄县白洋淀古渡口码头', badgeTag: '千年雄州白洋淀' },
  '130684': { kind: 'yiwu_tradecity_jiming', landmarkName: '高碑店白沟箱包商贸城', badgeTag: '北方箱包商贸都' },
  '130803': { kind: 'wanfo_pagoda_plaza', landmarkName: '双滦双塔山辽代峰顶塔', badgeTag: '双塔山辽代奇峰' },
  '130108': { kind: 'smart_science_twin_towers', landmarkName: '裕华石家庄世纪高塔科创', badgeTag: '省会科教金融核' },
  '130404': { kind: 'industrial_heritage_loft', landmarkName: '复兴邯钢百年钢铁转型园', badgeTag: '邯郸钢铁转型区' },
  '130434': { kind: 'ancient_water_wharf', landmarkName: '魏县礼贤台与万亩鸭梨水', badgeTag: '中国鸭梨第一县' },
  '130581': { kind: 'red_revolution_memorial', landmarkName: '南宫冀南烈士纪念碑廊院', badgeTag: '冀南红色革命地' },
  '130602': { kind: 'smart_science_twin_towers', landmarkName: '竞秀中国电谷光伏科创塔', badgeTag: '中国电谷新能源' },
  '130609': { kind: 'tea_house_heritage', landmarkName: '徐水刘伶醉千年烧锅酒坊', badgeTag: '千年古酿刘伶醉' },
  '130628': { kind: 'red_revolution_memorial', landmarkName: '高阳布里留法勤工俭学馆', badgeTag: '中国纺织之乡县' },
  '130636': { kind: 'shanxi_courtyard_jinshang', landmarkName: '顺平腰山王氏清代大庄园', badgeTag: '太行东麓红富士' },
  '130702': { kind: 'hsr_modern_hub', landmarkName: '桥东百年京张铁路老站馆', badgeTag: '京张铁路重镇芯' },
  '130703': { kind: 'jiayuguan_pass_fortress', landmarkName: '桥西大境门万里长城第一', badgeTag: '大好河山大境门' },
  '130708': { kind: 'pingyao_city_gate', landmarkName: '万全右卫明代军事古城墙', badgeTag: '明长城京西重卫' },
  '130724': { kind: 'mongol_ger_oboo', landmarkName: '沽源闪电河坝上草原毡房', badgeTag: '滦河发源草原湖' },
  '130727': { kind: 'bamboo_courtyard_library', landmarkName: '阳原泥河湾百万年人类馆', badgeTag: '东方人类发源地' },
  '130732': { kind: 'beacon_tower_greatwall', landmarkName: '赤城独石口长城边塞敌楼', badgeTag: '京北第一温泉关' },
  '130822': { kind: 'ancient_star_observatory', landmarkName: '兴隆雾灵山国家天文观台', badgeTag: '华北最大光学台' },
  '130825': { kind: 'red_revolution_memorial', landmarkName: '隆化董存瑞烈士陵园碑阁', badgeTag: '英雄存瑞故里县' },
  '130881': { kind: 'pingyao_city_gate', landmarkName: '平泉八沟契丹辽风古城门', badgeTag: '中华菌乡契丹源' },
  '130929': { kind: 'covered_bridge_pavilion', landmarkName: '献县明代单桥五孔石拱桥', badgeTag: '实事求是源献县' },
  '130982': { kind: 'industrial_heritage_loft', landmarkName: '任丘华北油田采油工业架', badgeTag: '冀中油田扁鹊里' },
  '130983': { kind: 'coastal_salt_pan_pyramid', landmarkName: '黄骅长芦南大港盐田银垛', badgeTag: '长芦海盐晒场' },
  '131024': { kind: 'pingyao_city_gate', landmarkName: '香河天下第一城明清城门', badgeTag: '京津冀家具之都' },
  '131102': { kind: 'wanfo_pagoda_plaza', landmarkName: '桃城衡水湖与宋代宝云塔', badgeTag: '冀中明珠衡水湖' },
  '131123': { kind: 'dongyang_luzhai_mansion', landmarkName: '武强中国木版年画博物院', badgeTag: '中国木版年画乡' },
  '131125': { kind: 'red_revolution_memorial', landmarkName: '安平第一个农村党支部馆', badgeTag: '中国丝网之都县' },
  '130128': { kind: 'tiananmen_gatehouse', landmarkName: '深泽北极台真武古庙阁', badgeTag: '明代高台古建' },
  '130224': { kind: 'classical_wood_opera_stage', landmarkName: '滦南成兆才评剧雕花古戏楼', badgeTag: '百年评剧古戏楼' },
  '130407': { kind: 'confucian_temple_qufu', landmarkName: '肥乡平原君与井堂寺殿', badgeTag: '平原君故里区' },
  '130424': { kind: 'yingxian_timber_pagoda', landmarkName: '成安二祖寺隋代禅宗殿', badgeTag: '隋代禅宗古刹' },
  '130430': { kind: 'modern_civic_opera', landmarkName: '邱县中国民间农民画展馆', badgeTag: '民间农民画乡' },
  '130431': { kind: 'memorial_archway_paifang', landmarkName: '鸡泽毛遂故里文化牌坊', badgeTag: '毛遂故里椒乡' },
  '130432': { kind: 'ancient_water_wharf', landmarkName: '广平东湖天鹅生态水阁', badgeTag: '冀南天鹅水乡' },
  '130433': { kind: 'grand_canal_granary', landmarkName: '馆陶卫运河粮画古粮仓', badgeTag: '中国粮画小镇' },
  '130505': { kind: 'memorial_archway_paifang', landmarkName: '任泽北魏游雅故里石牌坊', badgeTag: '大陆泽古泽乡' },
  '130506': { kind: 'grotto_cliff_buddha', landmarkName: '南和白佛寺北齐石刻碑', badgeTag: '宠物产业古邑' },
  '130530': { kind: 'red_revolution_memorial', landmarkName: '新河董振堂将军纪念馆', badgeTag: '红军名将故里' },
  '130531': { kind: 'tiananmen_gatehouse', landmarkName: '广宗商秦沙丘平台古阙', badgeTag: '沙丘古台遗韵' },
  '130532': { kind: 'yiwu_tradecity_jiming', landmarkName: '平乡中国童车产业商贸城', badgeTag: '中国童车之都' },
  '130533': { kind: 'confucian_temple_qufu', landmarkName: '威县古孔庙与万亩梨园阁', badgeTag: '冀南威梨名县' },
  '130535': { kind: 'grand_canal_granary', landmarkName: '临西卫运河古渡与玉兰馆', badgeTag: '运河古渡玉兰' },
  '130626': { kind: 'yingxian_timber_pagoda', landmarkName: '定兴元代慈云阁与黄金台', badgeTag: '元代飞阁古台' },
  '130631': { kind: 'tiananmen_gatehouse', landmarkName: '望都古尧庙与汉代壁画馆', badgeTag: '尧母故里辣椒' },
  '130635': { kind: 'yiwu_tradecity_jiming', landmarkName: '蠡县留史国际皮毛商贸城', badgeTag: '北方皮毛商都' },
  '130637': { kind: 'confucian_temple_qufu', landmarkName: '博野颜元习斋祠堂书院', badgeTag: '颜李学派故里' },
  '130706': { kind: 'industrial_heritage_loft', landmarkName: '下花园百年电厂与鸡鸣山', badgeTag: '京西煤炭电城' },
  '130723': { kind: 'pingyao_city_gate', landmarkName: '康保辽金土城子古城遗址', badgeTag: '遗鸥草原湿地' },
  '130725': { kind: 'mongol_ger_oboo', landmarkName: '尚义大青山坝上草原毡房', badgeTag: '察汗淖尔草原' },
  '130728': { kind: 'pingyao_city_gate', landmarkName: '怀安卫明代军事古城门楼', badgeTag: '明代边防古城' },
  '130804': { kind: 'industrial_heritage_loft', landmarkName: '鹰手营子兴隆百年矿区坊', badgeTag: '燕山百年煤城' },
  '130821': { kind: 'tea_house_heritage', landmarkName: '承德县板城烧锅古酒坊阁', badgeTag: '燕山板城酒乡' },
  '130827': { kind: 'beacon_tower_greatwall', landmarkName: '宽城潘家口水下长城敌楼', badgeTag: '喜峰口水长城' },
  '130902': { kind: 'kashgar_islamic_arcade', landmarkName: '沧州明代清真北大寺拱门', badgeTag: '运河老城回韵' },
  '130921': { kind: 'covered_bridge_pavilion', landmarkName: '沧县杜林登瀛桥与铁狮子', badgeTag: '千年铁狮古桥' },
  '130922': { kind: 'grand_canal_granary', landmarkName: '青县盘古大运河古渡粮仓', badgeTag: '京津菜篮运河' },
  '130924': { kind: 'volcanic_stone_village', landmarkName: '海兴小山古火山地质石门', badgeTag: '渤海古火山群' },
  '130925': { kind: 'memorial_archway_paifang', landmarkName: '盐山千童祠徐福东渡古坊', badgeTag: '徐福东渡古邑' },
  '130926': { kind: 'yiwu_tradecity_jiming', landmarkName: '肃宁国际裘皮商贸会展城', badgeTag: '中国裘皮之都' },
  '130927': { kind: 'confucian_temple_qufu', landmarkName: '南皮张之洞故居慈恩书院', badgeTag: '张之洞故里城' },
  '130930': { kind: 'ancestral_taiji_hall', landmarkName: '孟村中国八极拳祖祠演武', badgeTag: '中华八极拳源' },
  '131002': { kind: 'wanfo_pagoda_plaza', landmarkName: '安次前南庄辽代陀罗尼幢', badgeTag: '京津走廊生态' },
  '131003': { kind: 'modern_civic_opera', landmarkName: '广阳丝路国际艺术大剧院', badgeTag: '京津冀艺文核' },
  '131022': { kind: 'smart_science_twin_towers', landmarkName: '固安京南航天科创双子塔', badgeTag: '京南科创走廊' },
  '131023': { kind: 'beacon_tower_greatwall', landmarkName: '永清宋辽边关古战道烽垒', badgeTag: '宋辽古战道乡' },
  '131025': { kind: 'dongyang_luzhai_mansion', landmarkName: '大城中国红木城雕花古楼', badgeTag: '北方红木之都' },
  '131026': { kind: 'ancient_water_wharf', landmarkName: '文安洼千里古淀生态水埠', badgeTag: '京南鱼米水乡' },
  '131028': { kind: 'kashgar_islamic_arcade', landmarkName: '大厂民族宫飞檐拱廊地标', badgeTag: '京郊回族文化' },
  '131121': { kind: 'yiwu_tradecity_jiming', landmarkName: '枣强大营天下裘都商贸城', badgeTag: '中国裘祖之乡' },
  '131122': { kind: 'dongyang_luzhai_mansion', landmarkName: '武邑明清硬木雕刻古艺楼', badgeTag: '千年古县雕艺' },
  '131124': { kind: 'glass_greenhouse_agripark', landmarkName: '饶阳果蔬智慧连栋玻璃棚', badgeTag: '京南智慧温室园' },
  '131126': { kind: 'wanfo_pagoda_plaza', landmarkName: '故城庆林寺宋代舍利古塔', badgeTag: '运河宋塔古县' },
  '131128': { kind: 'red_revolution_memorial', landmarkName: '阜城本斋纪念园抗战红馆', badgeTag: '漫河西瓜红色' },
  '131182': { kind: 'grand_canal_granary', landmarkName: '深州清代盈亿义仓四合院', badgeTag: '形意拳蜜桃乡' },

  // === 山西省 ===
  '140106': { kind: 'wanfo_pagoda_plaza', landmarkName: '太原双塔寺凌霄古塔', badgeTag: '三晋文脉双塔' },
  '140213': { kind: 'pingyao_city_gate', landmarkName: '大同古城墙代王府阙楼', badgeTag: '北魏古都城垣' },
  '140214': { kind: 'grotto_cliff_buddha', landmarkName: '云冈石窟飞檐护阁', badgeTag: '世界石窟艺术' },
  '140622': { kind: 'yingxian_timber_pagoda', landmarkName: '应县佛宫寺释迦木塔', badgeTag: '千年纯木奇塔' },
  '140728': { kind: 'pingyao_city_gate', landmarkName: '平遥古城墙与市楼', badgeTag: '晋商票号古城' },
  '140802': { kind: 'salt_well_derrick', landmarkName: '运城千年盐池与池神古庙', badgeTag: '河东池盐祖庭' },
  '140823': { kind: 'confucian_temple_qufu', landmarkName: '闻喜裴氏宗祠与礼元坊', badgeTag: '中华宰相祖祠' },
  '141024': { kind: 'memorial_archway_paifang', landmarkName: '洪洞大槐树寻根祭祖坊', badgeTag: '根祖寻宗牌坊' },
  '140922': { kind: 'yingxian_timber_pagoda', landmarkName: '五台山佛光寺唐代木殿', badgeTag: '四大佛教名山' },
  '140225': { kind: 'hanging_cliff_monastery', landmarkName: '恒山悬空寺危崖飞阁', badgeTag: '北岳奇观悬空' },
  '140729': { kind: 'shanxi_courtyard_jinshang', landmarkName: '灵石王家大院红门堡', badgeTag: '民间故宫晋商' },
  '140727': { kind: 'shanxi_courtyard_jinshang', landmarkName: '祁县乔家大院在中堂', badgeTag: '晋商祖庭大院' },
  '140781': { kind: 'hanging_cliff_monastery', landmarkName: '介休绵山抱腹岩云峰悬空寺', badgeTag: '绵山绝壁悬阁' },
  '140830': { kind: 'confucian_temple_qufu', landmarkName: '芮城永乐宫三清殿彩绘', badgeTag: '元代壁画艺术' },
  '140822': { kind: 'yingxian_timber_pagoda', landmarkName: '万荣飞云楼四层纯木阁', badgeTag: '中华第一木楼' },
  '141124': { kind: 'ancient_water_wharf', landmarkName: '临县碛口黑龙庙黄河渡', badgeTag: '九曲黄河古渡' },
  '140522': { kind: 'karst_stone_watchtower', landmarkName: '阳城皇城相府河山碉楼', badgeTag: '清代名相府邸' },
  '140825': { kind: 'glass_greenhouse_agripark', landmarkName: '新绛设施果蔬智能玻璃棚', badgeTag: '晋南现代温室园' },
  '141023': { kind: 'ancient_star_observatory', landmarkName: '襄汾陶寺古观象台与丁村', badgeTag: '华夏最早观象台' },
  '141028': { kind: 'dujiangyan_temple_weir', landmarkName: '吉县黄河壶口瀑布栈道', badgeTag: '黄河壶口飞瀑' },
  '140932': { kind: 'beacon_tower_greatwall', landmarkName: '偏关老牛湾长城望河台', badgeTag: '长城黄河握手' },
  '141182': { kind: 'tea_house_heritage', landmarkName: '汾阳杏花村千年老酒坊', badgeTag: '清香白酒祖庭' },
  '140105': { kind: 'hsr_modern_hub', landmarkName: '太原南站飞翼高铁枢纽', badgeTag: '省会高铁科创极' },
  '140107': { kind: 'pingyao_city_gate', landmarkName: '太原拱极门城楼与唱经楼', badgeTag: '晋阳府城古门楼' },
  '140110': { kind: 'dujiangyan_temple_weir', landmarkName: '晋祠难老泉鱼沼飞梁殿', badgeTag: '三晋宗祠古太原' },
  '141123': { kind: 'red_revolution_memorial', landmarkName: '兴县蔡家崖晋绥革命院', badgeTag: '晋绥红色首府县' },
  '140429': { kind: 'red_revolution_memorial', landmarkName: '武乡八路军太行纪念馆', badgeTag: '太行精神摇篮县' },
  '140722': { kind: 'red_revolution_memorial', landmarkName: '麻田八路军总部太行院', badgeTag: '太行民歌红色县' },
  '140502': { kind: 'confucian_temple_qufu', landmarkName: '晋城府城玉皇庙彩塑殿', badgeTag: '二十八宿古建城' },
  '141002': { kind: 'tiananmen_gatehouse', landmarkName: '临汾尧庙五凤楼与华门', badgeTag: '华夏第一都尧乡' },
  '140108': { kind: 'confucian_temple_qufu', landmarkName: '窦大夫祠与傅山园', badgeTag: '太原北城工业区' },
  '140121': { kind: 'tea_house_heritage', landmarkName: '清徐宝源老醋坊院', badgeTag: '中国老陈醋之乡' },
  '140321': { kind: 'jiayuguan_pass_fortress', landmarkName: '娘子关水上雄关城', badgeTag: '天下第九关固关' },
  '140403': { kind: 'pingyao_city_gate', landmarkName: '长治上党门与观音堂', badgeTag: '太行明珠上党芯' },
  '140581': { kind: 'confucian_temple_qufu', landmarkName: '高平炎帝陵与铁佛寺', badgeTag: '神农炎帝长平地' },
  '140623': { kind: 'jiayuguan_pass_fortress', landmarkName: '右玉杀虎口边关堡', badgeTag: '走西口绿洲精神' },
  '140702': { kind: 'pingyao_city_gate', landmarkName: '榆次老城玄鉴楼阁', badgeTag: '晋中首府千年城' },
  '140703': { kind: 'shanxi_courtyard_jinshang', landmarkName: '太谷三多堂晋商大院', badgeTag: '形意拳玛钢之乡' },
  '140881': { kind: 'xian_bell_goose_pagoda', landmarkName: '永济普救寺莺莺塔', badgeTag: '普救寺西厢故地' },
  '140882': { kind: 'dujiangyan_temple_weir', landmarkName: '河津禹门口黄河峡', badgeTag: '鱼跃龙门铝工业' },
  '140923': { kind: 'beacon_tower_greatwall', landmarkName: '代县雁门关边靖楼', badgeTag: '中华第一关名城' },
  '141081': { kind: 'tiananmen_gatehouse', landmarkName: '侯马晋国古都遗址', badgeTag: '春秋霸主晋都城' },
  '141181': { kind: 'bayong_lou', landmarkName: '孝义中阳楼与胜溪湖', badgeTag: '皮影木偶百强市' },
  '140423': { kind: 'shanxi_courtyard_jinshang', landmarkName: '襄垣仙堂山晋东南大院', badgeTag: '千年上党古县' },
  '140521': { kind: 'shanxi_courtyard_jinshang', landmarkName: '沁水湘峪古堡柳氏大院', badgeTag: '明代蜂窝古堡' },
  '140525': { kind: 'shanxi_courtyard_jinshang', landmarkName: '泽州大阳古镇晋商古宅', badgeTag: '中国古铁城院' },
  '140725': { kind: 'shanxi_courtyard_jinshang', landmarkName: '寿阳祁寯藻故居三进院', badgeTag: '三代帝师古院' },
  '140821': { kind: 'confucian_temple_qufu', landmarkName: '临猗临晋县衙元代大堂', badgeTag: '元代古衙果乡' },
  '140824': { kind: 'xian_bell_goose_pagoda', landmarkName: '稷山青龙寺元代壁画阁', badgeTag: '千年后稷农源' },
  '140826': { kind: 'shanxi_courtyard_jinshang', landmarkName: '绛县太阴寺晋南古民居', badgeTag: '晋南千年古县' },
  '140828': { kind: 'tiananmen_gatehouse', landmarkName: '夏县司马光祠宇禹王殿', badgeTag: '夏都司马温公' },
  '140829': { kind: 'dujiangyan_temple_weir', landmarkName: '平陆三湾黄河湿地天鹅', badgeTag: '天鹅之乡古渡' },
  '140902': { kind: 'pingyao_city_gate', landmarkName: '忻州古城秀容书院北门', badgeTag: '摔跤之乡古城' },
  '140921': { kind: 'yingxian_timber_pagoda', landmarkName: '定襄河边民俗馆砖木阁', badgeTag: '中国法兰之乡' },
  '140924': { kind: 'wufeng_academy_cliff', landmarkName: '繁峙岩山寺金代壁画殿', badgeTag: '五台山北门户' },
  '140925': { kind: 'hanging_cliff_monastery', landmarkName: '宁武芦芽山王化沟绝壁悬空村', badgeTag: '太行绝壁悬空村' },
  '141021': { kind: 'tiananmen_gatehouse', landmarkName: '曲沃晋国博物馆曲村阙', badgeTag: '千年晋国故都' },
  '141121': { kind: 'red_revolution_memorial', landmarkName: '文水刘胡兰纪念馆碑院', badgeTag: '英雄故里醋乡' },
  '141122': { kind: 'yingxian_timber_pagoda', landmarkName: '交城玄中寺净土宗古刹', badgeTag: '净土祖庭山城' },
  '140109': { kind: 'industrial_heritage_loft', landmarkName: '太原西山煤矿工业园区', badgeTag: '汾西能源文创' },
  '140681': { kind: 'porcelain_dragon_kiln', landmarkName: '怀仁陶瓷文化艺博窑厂', badgeTag: '北方日用瓷都' },
  '140122': { kind: 'shanxi_courtyard_jinshang', landmarkName: '阳曲青龙古镇晋商大院', badgeTag: '太原北门明清镇' },
  '140123': { kind: 'yaodong_baota_hill', landmarkName: '娄烦高君宇故居石窑院', badgeTag: '汾河水库红色乡' },
  '140215': { kind: 'volcanic_stone_village', landmarkName: '云州大同火山群玄武阁', badgeTag: '塞外火山黄花乡' },
  '140223': { kind: 'hanging_cliff_monastery', landmarkName: '广灵水神堂陡崖悬空古刹', badgeTag: '边塞危崖古寺' },
  '140224': { kind: 'beacon_tower_greatwall', landmarkName: '灵丘平型关古长城雄关', badgeTag: '平型关抗战名城' },
  '140404': { kind: 'confucian_temple_qufu', landmarkName: '上党荫城古镇城隍庙殿', badgeTag: '千年铁货上党城' },
  '140425': { kind: 'yingxian_timber_pagoda', landmarkName: '平顺天台庵唐代古木殿', badgeTag: '太行天路古建群' },
  '140426': { kind: 'karst_stone_watchtower', landmarkName: '黎城黄崖洞太行兵工寨', badgeTag: '太行红色兵工城' },
  '140427': { kind: 'covered_bridge_pavilion', landmarkName: '壶关太行八泉峡悬崖桥', badgeTag: '太行大峡谷明珠' },
  '140428': { kind: 'yingxian_timber_pagoda', landmarkName: '长子法兴寺宋代古木殿', badgeTag: '精卫填海发祥地' },
  '140524': { kind: 'karst_stone_watchtower', landmarkName: '陵川锡崖沟太行挂壁村', badgeTag: '南太行挂壁公路' },
  '140602': { kind: 'yingxian_timber_pagoda', landmarkName: '朔城崇福寺金代弥陀殿', badgeTag: '金代古建塞上城' },
  '140621': { kind: 'beacon_tower_greatwall', landmarkName: '山阴广武明长城月亮门', badgeTag: '桑干河明长城关' },
  '140827': { kind: 'ancient_water_wharf', landmarkName: '垣曲黄河古城古渡码头', badgeTag: '中条山铜都古渡' },
  '140930': { kind: 'ancient_water_wharf', landmarkName: '河曲西口黄河古渡口阁', badgeTag: '二人台民歌之乡' },
  '140981': { kind: 'pingyao_city_gate', landmarkName: '原平崞阳古城文庙城门', badgeTag: '酥梨之乡书画城' },
  '141082': { kind: 'pingyao_city_gate', landmarkName: '霍州元代州署谯楼城门', badgeTag: '中镇霍山古州署' },
  '141125': { kind: 'shanxi_courtyard_jinshang', landmarkName: '柳林三交古镇晋商民居', badgeTag: '红枣名城黄河渡' },
  '140181': { kind: 'red_revolution_memorial', landmarkName: '古交晋绥红军东征纪念馆', badgeTag: '中国焦煤生态城' },
  '140212': { kind: 'beacon_tower_greatwall', landmarkName: '新荣得胜口明长城边墙堡', badgeTag: '大同北门长城关' },
  '140221': { kind: 'yingxian_timber_pagoda', landmarkName: '阳高云林寺明代悬塑古殿', badgeTag: '杏韵古堡许家窑' },
  '140222': { kind: 'beacon_tower_greatwall', landmarkName: '天镇李二口长城与慈云寺', badgeTag: '鸡鸣闻三省长城' },
  '140226': { kind: 'beacon_tower_greatwall', landmarkName: '左云摩天岭月亮门古长城', badgeTag: '塞外风电长城县' },
  '140302': { kind: 'red_revolution_memorial', landmarkName: '阳泉1947中共创建第一城', badgeTag: '中共创建第一城' },
  '140303': { kind: 'industrial_heritage_loft', landmarkName: '阳泉百年无烟煤工业矿架', badgeTag: '三晋无烟煤重镇' },
  '140311': { kind: 'red_revolution_memorial', landmarkName: '郊区狮脑山百团大战碑廊', badgeTag: '百团大战主战场' },
  '140322': { kind: 'ancient_post_station', landmarkName: '盂县白马关古驿道驿城', badgeTag: '忠义藏山古驿' },
  '140405': { kind: 'wufeng_academy_cliff', landmarkName: '屯留老爷山三嵕古刹丹阁', badgeTag: '后羿射日老爷山' },
  '140406': { kind: 'wanfo_pagoda_plaza', landmarkName: '潞城原起寺青龙宝塔宋阁', badgeTag: '三晋古建煤化城' },
  '140430': { kind: 'grotto_cliff_buddha', landmarkName: '沁县南涅水北魏石刻造像', badgeTag: '北方小米水乡城' },
  '140431': { kind: 'red_revolution_memorial', landmarkName: '沁源太岳抗战精神纪念馆', badgeTag: '太岳绿肺沁源县' },
  '140603': { kind: 'industrial_heritage_loft', landmarkName: '平鲁安太堡露天矿山高台', badgeTag: '晋北塞上煤电区' },
  '140721': { kind: 'yingxian_timber_pagoda', landmarkName: '榆社福祥寺宋代纯木大殿', badgeTag: '晋中古建云竹湖' },
  '140723': { kind: 'covered_bridge_pavilion', landmarkName: '和顺太行天河牛郎织女桥', badgeTag: '中国牵绣牛郎乡' },
  '140724': { kind: 'terraced_rice_pavilion', landmarkName: '昔阳大寨虎头山石坎梯田', badgeTag: '太行大寨梯田乡' },
  '140926': { kind: 'wanfo_pagoda_plaza', landmarkName: '静乐天柱山宋代文峰古塔', badgeTag: '中国藜麦之乡县' },
  '140927': { kind: 'pingyao_city_gate', landmarkName: '神池八角明代边塞古城墙', badgeTag: '晋北月饼胡麻乡' },
  '140928': { kind: 'mongol_ger_oboo', landmarkName: '五寨荷叶坪高山亚高原帐', badgeTag: '管涔山麓杂粮乡' },
  '140929': { kind: 'space_launch_gantry', landmarkName: '岢岚太原卫星发射塔架', badgeTag: '太原卫星发射港' },
  '140931': { kind: 'ancient_water_wharf', landmarkName: '保德黄河天桥峡古渡码头', badgeTag: '晋陕蒙黄河古渡' },
  '141022': { kind: 'classical_wood_opera_stage', landmarkName: '翼城乔泽庙元代木构古戏台', badgeTag: '元代戏台活化石' },
  '141025': { kind: 'jiangnan_gardens_gate', landmarkName: '古县千年古牡丹苑三合亭', badgeTag: '太岳牡丹天下奇' },
  '141026': { kind: 'confucian_temple_qufu', landmarkName: '安泽荀子故里礼乐古祠堂', badgeTag: '战国先师荀子乡' },
  '141027': { kind: 'wufeng_academy_cliff', landmarkName: '浮山神山老君洞丹崖古观', badgeTag: '晋南剪纸厨师乡' },
  '141029': { kind: 'karst_stone_watchtower', landmarkName: '乡宁云丘山塔尔坡石头村', badgeTag: '晋南冰洞紫砂乡' },
  '141030': { kind: 'ancestral_taiji_hall', landmarkName: '大宁黄河太极乾坤湾观台', badgeTag: '万里黄河太极湾' },
  '141031': { kind: 'grotto_cliff_buddha', landmarkName: '隰县小西天悬塑千佛宝庵', badgeTag: '中国玉露香梨窟' },
  '141032': { kind: 'red_revolution_memorial', landmarkName: '永和红军东征纪念馆碑院', badgeTag: '黄河乾坤湾红地' },
  '141033': { kind: 'confucian_temple_qufu', landmarkName: '蒲县柏山东岳庙古建殿群', badgeTag: '晋南古建彩塑县' },
  '141034': { kind: 'shanxi_courtyard_jinshang', landmarkName: '汾西师家沟清代山地大院', badgeTag: '天下第一村古院' },
  '141102': { kind: 'confucian_temple_qufu', landmarkName: '离石安国寺晋商名刹院落', badgeTag: '吕梁山芯于成龙' },
  '141126': { kind: 'ancient_water_wharf', landmarkName: '石楼红军东征黄河第一渡', badgeTag: '万里黄河第一湾' },
  '141127': { kind: 'yaodong_baota_hill', landmarkName: '岚县八路军120师窑洞院', badgeTag: '中国面塑土豆乡' },
  '141128': { kind: 'wufeng_academy_cliff', landmarkName: '方山北武当山花岗崖真武', badgeTag: '三晋第一道教山' },
  '141129': { kind: 'tea_house_heritage', landmarkName: '中阳柏洼山古柏禅院阁楼', badgeTag: '吕梁剪纸黑木耳' },
  '141130': { kind: 'grotto_cliff_buddha', landmarkName: '交口千佛洞唐代摩崖石窟', badgeTag: '吕梁山夏菇之乡' },

  // === 内蒙古自治区 ===
  '150103': { kind: 'kashgar_islamic_arcade', landmarkName: '大召无量寺与塞上老街', badgeTag: '青城召庙古街' },
  '150105': { kind: 'mongol_ger_oboo', landmarkName: '昭君博物院草原穹庐', badgeTag: '草原和亲史诗' },
  '150203': { kind: 'industrial_heritage_loft', landmarkName: '包头钢铁工业文化园', badgeTag: '草原钢城记忆' },
  '150603': { kind: 'modern_civic_opera', landmarkName: '康巴什乌兰木伦景观塔', badgeTag: '草原现代新城' },
  '150626': { kind: 'mongol_ger_oboo', landmarkName: '乌审旗萨拉乌苏草原敖包', badgeTag: '毛乌素绿洲牧乡' },
  '150702': { kind: 'mongol_ger_oboo', landmarkName: '呼伦贝尔敖包与伊敏河桥', badgeTag: '北疆草原明珠' },
  '150781': { kind: 'border_port_railway_gate', landmarkName: '满洲里中俄铁路换装国门', badgeTag: '百年中俄铁轨门' },
  '152202': { kind: 'snow_birch_timber_station', landmarkName: '阿尔山林海雪原白桦小站', badgeTag: '兴安雪原白桦驿' },
  '150425': { kind: 'mongol_ger_oboo', landmarkName: '克什克腾乌兰布统敖包', badgeTag: '百景草原石林' },
  '150627': { kind: 'mongol_ger_oboo', landmarkName: '伊金霍洛成吉思汗陵殿', badgeTag: '天骄圣地草原' },
  '150622': { kind: 'yaodong_baota_hill', landmarkName: '准格尔黄河大峡谷窑台', badgeTag: '黄河大峡谷旗' },
  '152923': { kind: 'ancient_silk_caravanserai_gate', landmarkName: '额济纳黑水城夯土驿门胡杨烽', badgeTag: '居延黑城胡杨林' },
  '150784': { kind: 'snow_birch_timber_station', landmarkName: '额尔古纳白桦林雪原木屋', badgeTag: '恩和白桦木刻楞' },
  '152502': { kind: 'potala_palace_fortress', landmarkName: '锡林浩特贝子庙金顶群', badgeTag: '锡林郭勒草原' },
  '152501': { kind: 'border_port_railway_gate', landmarkName: '二连浩特中蒙跨轨铁路门', badgeTag: '北疆换装铁路门' },
  '152921': { kind: 'desert_observatory_solar', landmarkName: '阿拉善定远营腾格里驿', badgeTag: '大漠驼乡营城' },
  '152531': { kind: 'potala_palace_fortress', landmarkName: '多伦汇宗寺清代古刹院', badgeTag: '草原多伦诺尔' },
  '150422': { kind: 'xian_bell_goose_pagoda', landmarkName: '巴林左旗辽上京南古塔', badgeTag: '契丹辽都遗址' },
  '152530': { kind: 'pingyao_city_gate', landmarkName: '正蓝旗元上都明德门城', badgeTag: '金莲川元世遗' },
  '150102': { kind: 'tiananmen_gatehouse', landmarkName: '绥远城将军衙署清代门', badgeTag: '青城北疆门户芯' },
  '150725': { kind: 'mongol_ger_oboo', landmarkName: '莫尔格勒河九曲草原帐', badgeTag: '第一曲水草原牧' },
  '150727': { kind: 'mongol_ger_oboo', landmarkName: '贝尔湖畔呼伦贝尔牧帐', badgeTag: '中蒙俄边贸牧旗' },
  '150104': { kind: 'potala_palace_fortress', landmarkName: '玉泉席力图召古寺', badgeTag: '青城古韵召庙芯' },
  '150206': { kind: 'industrial_heritage_loft', landmarkName: '白云鄂博稀土矿区', badgeTag: '世界稀土之都源' },
  '150302': { kind: 'modern_civic_opera', landmarkName: '乌海湖大桥书法馆', badgeTag: '黄河明珠书法城' },
  '150402': { kind: 'yaodong_baota_hill', landmarkName: '红山文化玉龙古台', badgeTag: '中华玉龙第一乡' },
  '150502': { kind: 'mongol_ger_oboo', landmarkName: '科尔沁草原博物院', badgeTag: '西辽河安代舞乡' },
  '150621': { kind: 'wind_solar_storage_base', landmarkName: '达拉特旗库布其风光储基', badgeTag: '库布其光伏治沙' },
  '150782': { kind: 'snow_birch_timber_station', landmarkName: '牙克石凤凰山雪原白桦驿', badgeTag: '雪原白桦森林驿' },
  '150785': { kind: 'snow_birch_timber_station', landmarkName: '根河敖鲁古雅白桦雪林驿', badgeTag: '中国冷极白桦驿' },
  '150802': { kind: 'modern_civic_opera', landmarkName: '河套文化博物院馆', badgeTag: '塞外粮仓河套芯' },
  '150902': { kind: 'red_revolution_memorial', landmarkName: '集宁战役红馆碑林', badgeTag: '草原皮都枢纽城' },
  '152201': { kind: 'potala_palace_fortress', landmarkName: '乌兰浩特成吉思庙', badgeTag: '红色首城兴安盟' },
  '150783': { kind: 'northeast_wooden_granary', landmarkName: '扎兰屯中东铁路木刻楞', badgeTag: '塞外苏杭吊桥' },
  '150723': { kind: 'northeast_wooden_granary', landmarkName: '鄂伦春仙人柱撮罗子营', badgeTag: '兴安游猎森林' },
  '150724': { kind: 'mongol_ger_oboo', landmarkName: '鄂温克巴彦呼硕草原包', badgeTag: '敖包相会草原' },
  '150722': { kind: 'mongol_ger_oboo', landmarkName: '莫旗曲棍球达斡尔毡帐', badgeTag: '曲棍球名城乡' },
  '150122': { kind: 'ancient_water_wharf', landmarkName: '托克托河口古渡黄河阁', badgeTag: '黄河麦野古渡' },
  '150223': { kind: 'mongol_ger_oboo', landmarkName: '达茂百灵庙希拉穆仁帐', badgeTag: '百灵草原风电' },
  '150428': { kind: 'tiananmen_gatehouse', landmarkName: '喀喇沁亲王府清代宫院', badgeTag: '蒙东清代王府' },
  '150430': { kind: 'yaodong_baota_hill', landmarkName: '敖汉兴隆洼八千年遗址', badgeTag: '世界小米之乡' },
  '150524': { kind: 'potala_palace_fortress', landmarkName: '库伦三大寺黄教古殿群', badgeTag: '安代舞荞麦乡' },
  '150602': { kind: 'modern_civic_opera', landmarkName: '东胜鄂尔多斯大剧院馆', badgeTag: '暖城现代能源' },
  '150821': { kind: 'ancient_water_wharf', landmarkName: '五原河套水利古渡农馆', badgeTag: '五原誓师河套' },
  '150929': { kind: 'desert_observatory_solar', landmarkName: '四子王旗航天着陆场塔', badgeTag: '神舟归来草原' },
  '152525': { kind: 'mongol_ger_oboo', landmarkName: '东乌珠穆沁乌拉盖草原', badgeTag: '九曲湾游牧乡' },
  '152526': { kind: 'mongol_ger_oboo', landmarkName: '西乌珠穆沁游牧文化帐', badgeTag: '白马之乡草原' },
  '152922': { kind: 'desert_observatory_solar', landmarkName: '巴丹吉林沙漠必鲁图峰', badgeTag: '沙山鸣沙奇观' },
  '150121': { kind: 'mongol_ger_oboo', landmarkName: '土左旗敕勒川草原穹庐', badgeTag: '敕勒歌发祥草原' },
  '150123': { kind: 'pingyao_city_gate', landmarkName: '和林格尔盛乐北魏古城', badgeTag: '北魏首府乳业芯' },
  '150124': { kind: 'beacon_tower_greatwall', landmarkName: '清水河老牛湾明长城堡', badgeTag: '长城黄河交汇堡' },
  '150202': { kind: 'shanxi_courtyard_jinshang', landmarkName: '东河区包头老街晋商院', badgeTag: '走西口老包头城' },
  '150204': { kind: 'industrial_heritage_loft', landmarkName: '包头青山区北方兵器园', badgeTag: '草原重工军工城' },
  '150221': { kind: 'potala_palace_fortress', landmarkName: '土右旗美岱召城寺古堡', badgeTag: '塞外城寺合一召' },
  '150421': { kind: 'mongol_ger_oboo', landmarkName: '阿旗罕山游牧圣地敖包', badgeTag: '中国草原游牧乡' },
  '150423': { kind: 'tibetan_white_pagoda', landmarkName: '巴林右旗辽庆州古白塔', badgeTag: '千年辽代白塔城' },
  '150424': { kind: 'industrial_heritage_loft', landmarkName: '林西大井夏商古铜矿坊', badgeTag: '草原青铜文化源' },
  '150429': { kind: 'wanfo_pagoda_plaza', landmarkName: '宁城辽中京大明古砖塔', badgeTag: '千年辽中京故城' },
  '150523': { kind: 'xian_bell_goose_pagoda', landmarkName: '开鲁佛塔寺元代古塔院', badgeTag: '红干椒草原古塔' },
  '150581': { kind: 'industrial_heritage_loft', landmarkName: '霍林郭勒草原煤电工业', badgeTag: '科尔沁煤电铝城' },
  '150625': { kind: 'wind_solar_storage_base', landmarkName: '杭锦旗库布其风光储基地', badgeTag: '库布其治沙绿洲' },
  '150726': { kind: 'tibetan_white_pagoda', landmarkName: '新左旗甘珠尔庙草原塔', badgeTag: '呼伦贝尔甘珠尔' },
  '150822': { kind: 'dujiangyan_temple_weir', landmarkName: '磴口三盛公黄河拦河闸', badgeTag: '万里黄河第一闸' },
  '152522': { kind: 'mongol_ger_oboo', landmarkName: '阿巴嘎旗洪格尔岩画帐', badgeTag: '黑马之乡草原旗' },
  '150125': { kind: 'beacon_tower_greatwall', landmarkName: '武川大青山北魏长城烽燧', badgeTag: '敕勒川阴山长城' },
  '150205': { kind: 'potala_palace_fortress', landmarkName: '石拐五当召阴山藏传宫殿', badgeTag: '阴山深处布达拉' },
  '150207': { kind: 'beacon_tower_greatwall', landmarkName: '九原麻池汉城与秦长城墙', badgeTag: '鹿城九原秦长城' },
  '150303': { kind: 'industrial_heritage_loft', landmarkName: '海南乌海煤炭煤化工矿区', badgeTag: '乌金之海煤化区' },
  '150403': { kind: 'industrial_heritage_loft', landmarkName: '元宝山煤电能源高塔基地', badgeTag: '蒙东煤电能源城' },
  '150426': { kind: 'desert_observatory_solar', landmarkName: '翁牛特玉龙沙湖沙海观台', badgeTag: '中华第一玉龙乡' },
  '150522': { kind: 'mongol_ger_oboo', landmarkName: '科左后旗大青沟草原毡房', badgeTag: '孝庄故里沙地林' },
  '150623': { kind: 'red_revolution_memorial', landmarkName: '鄂托克前旗城川民族学院', badgeTag: '草原延安红色旗' },
  '150624': { kind: 'grotto_cliff_buddha', landmarkName: '鄂托克阿尔寨蒙元石窟群', badgeTag: '草原敦煌石窟群' },
  '150703': { kind: 'industrial_heritage_loft', landmarkName: '扎赉诺尔猛犸与百年煤矿', badgeTag: '呼伦湖畔猛犸乡' },
  '150823': { kind: 'ancient_water_wharf', landmarkName: '乌拉特前旗乌梁素海水门', badgeTag: '塞外明珠乌梁素' },
  '150824': { kind: 'inland_dryport_railhub', landmarkName: '乌拉特中旗甘其毛都口岸', badgeTag: '中蒙陆路口岸旗' },
  '150826': { kind: 'tea_house_heritage', landmarkName: '杭锦后旗河套百年酿酒坊', badgeTag: '八百里河套粮仓' },
  '150925': { kind: 'red_revolution_memorial', landmarkName: '凉城绥蒙区革命纪念碑院', badgeTag: '塞外岱海温泉县' },
  '150981': { kind: 'pingyao_city_gate', landmarkName: '丰镇明代隆盛庄茶马古城', badgeTag: '万里茶道蒙晋门' },
  '152221': { kind: 'mongol_ger_oboo', landmarkName: '科右前旗乌兰毛都草原帐', badgeTag: '兴安岭南大草原' },
  '152524': { kind: 'mongol_ger_oboo', landmarkName: '苏尼特右旗乌兰牧骑草原', badgeTag: '乌兰牧骑发源地' },
  '152527': { kind: 'mongol_ger_oboo', landmarkName: '太仆寺旗清代皇家御马场', badgeTag: '京北皇家御马苑' },
  '150222': { kind: 'beacon_tower_greatwall', landmarkName: '固阳秦长城遗址怀朔古城', badgeTag: '秦长城北魏镇' },
  '150304': { kind: 'ancient_water_wharf', landmarkName: '乌达黄河胡杨岛生态水岸', badgeTag: '黄河煤海转型' },
  '150404': { kind: 'yaodong_baota_hill', landmarkName: '松山夏家店青铜古城高台', badgeTag: '夏家店文化源' },
  '150521': { kind: 'tiananmen_gatehouse', landmarkName: '科左中旗孝庄园蒙古王府', badgeTag: '孝庄故里草原' },
  '150525': { kind: 'shanxi_courtyard_jinshang', landmarkName: '奈曼旗清代古王府大院落', badgeTag: '漠南清代王府' },
  '150526': { kind: 'mongol_ger_oboo', landmarkName: '扎鲁特罕山山地草原毡帐', badgeTag: '乌力格尔草原' },
  '150721': { kind: 'beacon_tower_greatwall', landmarkName: '阿荣旗金界壕边塞遗址堡', badgeTag: '兴安岭东金壕' },
  '150825': { kind: 'grotto_cliff_buddha', landmarkName: '乌拉特后旗阴山摩崖岩画', badgeTag: '阴山岩画驼乡' },
  '150921': { kind: 'mongol_ger_oboo', landmarkName: '卓资九十九泉草原敖包帐', badgeTag: '塞外熏鸡名县' },
  '150922': { kind: 'yaodong_baota_hill', landmarkName: '化德裕民八千年史前遗址', badgeTag: '裕民古文化源' },
  '150923': { kind: 'ancient_water_wharf', landmarkName: '商都七星湖湿地生态水阁', badgeTag: '察哈尔七星湖' },
  '150924': { kind: 'northeast_wooden_granary', landmarkName: '兴和苏木山华北林海木阁', badgeTag: '华北森林氧吧' },
  '150926': { kind: 'volcanic_stone_village', landmarkName: '察右前旗谷力脑包火山石', badgeTag: '黄旗海火山柱' },
  '150927': { kind: 'wind_solar_storage_base', landmarkName: '察右中旗辉腾锡勒风电海', badgeTag: '黄花沟高山草' },
  '150928': { kind: 'crater_tianchi_volcano_rim', landmarkName: '察右后旗乌兰哈达火山口群', badgeTag: '草原天然火山口' },
  '152222': { kind: 'tiananmen_gatehouse', landmarkName: '科右中旗图什业图亲王府', badgeTag: '草原五角枫王' },
  '152223': { kind: 'bamboo_courtyard_library', landmarkName: '扎赉特图牧吉大鸨湿地阁', badgeTag: '绰尔河稻渔乡' },
  '152224': { kind: 'beacon_tower_greatwall', landmarkName: '突泉金界壕草原古城烽台', badgeTag: '兴安南麓金壕' },
  '152523': { kind: 'mongol_ger_oboo', landmarkName: '苏尼特左旗满都拉图敖包', badgeTag: '苏尼特羊草原' },
  '152528': { kind: 'modern_civic_opera', landmarkName: '镶黄旗察哈尔文化博物院', badgeTag: '阿斯尔音乐乡' },
  '152529': { kind: 'ancient_star_observatory', landmarkName: '正镶白旗明安图观星天文', badgeTag: '草原观天圣地' },

  // === 辽宁省 ===
  '210103': { kind: 'tiananmen_gatehouse', landmarkName: '沈阳故宫大政殿十王亭', badgeTag: '盛京皇城故宫' },
  '210105': { kind: 'pingyao_city_gate', landmarkName: '沈阳北陵昭陵方城隆恩殿', badgeTag: '关东清代陵寝' },
  '210202': { kind: 'bund_shikumen', landmarkName: '大连中山广场近代建筑群', badgeTag: '北方折衷广场' },
  '210212': { kind: 'maritime_lighthouse_harbor', landmarkName: '旅顺老铁山百年灯塔港', badgeTag: '双海交汇灯塔' },
  '210422': { kind: 'pingyao_city_gate', landmarkName: '新宾赫图阿拉城汗王宫', badgeTag: '满族源起古城' },
  '210603': { kind: 'sea_crossing_cable_bridge', landmarkName: '丹东鸭绿江断桥铁架', badgeTag: '鸭绿江界江桥' },
  '211481': { kind: 'pingyao_city_gate', landmarkName: '兴城明代宁远卫古城楼', badgeTag: '明清完整古城' },
  '210522': { kind: 'karst_stone_watchtower', landmarkName: '桓仁五女山高句丽石城', badgeTag: '高句丽发祥山' },
  '210727': { kind: 'yingxian_timber_pagoda', landmarkName: '义县奉国寺辽代大雄殿', badgeTag: '辽代木构巨刹' },
  '210381': { kind: 'yiwu_tradecity_jiming', landmarkName: '海城西柳南台商贸市场', badgeTag: '东北服饰商都' },
  '210782': { kind: 'xian_bell_goose_pagoda', landmarkName: '北镇崇兴寺双塔北镇庙', badgeTag: '东北第一镇山' },
  '210881': { kind: 'maritime_lighthouse_harbor', landmarkName: '盖州北海团山灯塔古庙', badgeTag: '辽南古港果乡' },
  '210224': { kind: 'island_wind_turbine_bay', landmarkName: '长海獐子岛离岸风机海湾', badgeTag: '黄海岛群风电廊' },
  '211421': { kind: 'beacon_tower_greatwall', landmarkName: '绥中九门口水上长城关', badgeTag: '水上长城奇观' },
  '210521': { kind: 'subterranean_karst_cavern_hall', landmarkName: '本溪水洞地下暗河钟乳石穹厅', badgeTag: '北方地下暗河洞' },
  '210281': { kind: 'pingyao_city_gate', landmarkName: '瓦房店复州古城永丰塔', badgeTag: '辽南轴承古城' },
  '211122': { kind: 'bamboo_courtyard_library', landmarkName: '盘山红海滩芦苇观鸟栈', badgeTag: '盘锦河蟹湿地' },
  '210102': { kind: 'bund_shikumen', landmarkName: '沈阳中山广场百年欧楼', badgeTag: '奉天商埠老北市' },
  '210106': { kind: 'industrial_heritage_loft', landmarkName: '中国工业博物馆铸造厂', badgeTag: '共和国装备工业' },
  '210112': { kind: 'modern_civic_opera', landmarkName: '沈阳奥体与省博物穹馆', badgeTag: '沈阳高新自贸极' },
  '210203': { kind: 'harbin_sophia_dome', landmarkName: '大连俄罗斯风情街洋楼', badgeTag: '浪漫之都百年街' },
  '210213': { kind: 'karst_stone_watchtower', landmarkName: '大黑山千年卑沙石城垣', badgeTag: '辽东半岛自贸港' },
  '210681': { kind: 'maritime_lighthouse_harbor', landmarkName: '大鹿岛黄海百年古灯塔', badgeTag: '中国草莓边海港' },
  '210624': { kind: 'beacon_tower_greatwall', landmarkName: '虎山长城万里东端首堡', badgeTag: '万里长城东端起' },
  '210104': { kind: 'modern_civic_opera', landmarkName: '九一八历史纪念馆', badgeTag: '历史警钟汽车城' },
  '210204': { kind: 'sea_crossing_cable_bridge', landmarkName: '星海湾跨海大桥塔', badgeTag: '滨海会展高校区' },
  '210303': { kind: 'industrial_heritage_loft', landmarkName: '鞍钢工业博物馆红炉', badgeTag: '共和国钢铁长子' },
  '210311': { kind: 'wufeng_academy_cliff', landmarkName: '千山无量观与大佛崖', badgeTag: '东北明珠千朵莲' },
  '210323': { kind: 'tea_house_heritage', landmarkName: '岫岩玉都博物展馆', badgeTag: '中国玉都满族乡' },
  '210702': { kind: 'yingxian_timber_pagoda', landmarkName: '锦州大广济寺辽塔', badgeTag: '辽沈战役古塔城' },
  '210804': { kind: 'maritime_lighthouse_harbor', landmarkName: '鲅鱼圈海港灯塔礁', badgeTag: '辽东湾深水港城' },
  '211002': { kind: 'wanfo_pagoda_plaza', landmarkName: '辽阳广佑寺金代白塔', badgeTag: '东北第一古城芯' },
  '211103': { kind: 'industrial_heritage_loft', landmarkName: '辽河油田广场工业馆', badgeTag: '中国油城湿地城' },
  '211302': { kind: 'xian_bell_goose_pagoda', landmarkName: '朝阳北塔五世同堂', badgeTag: '三燕古都化石城' },
  '211403': { kind: 'maritime_lighthouse_harbor', landmarkName: '葫芦岛龙湾灯塔港', badgeTag: '辽西走廊海滨城' },
  '210113': { kind: 'modern_civic_opera', landmarkName: '沈北稻梦空间科教文化馆', badgeTag: '锡伯稻田画乡' },
  '210181': { kind: 'northeast_wooden_granary', landmarkName: '新民巨流河柳河稻田粮仓', badgeTag: '辽河平原粮仓' },
  '210211': { kind: 'maritime_lighthouse_harbor', landmarkName: '大连湾夏家河子海湾灯塔', badgeTag: '渤海工业港湾' },
  '210283': { kind: 'maritime_lighthouse_harbor', landmarkName: '庄河冰峪沟石城乡海岛灯', badgeTag: '黄海海岛明珠' },
  '210423': { kind: 'northeast_wooden_granary', landmarkName: '清原红河谷满族木构山仓', badgeTag: '辽东生态药谷' },
  '210682': { kind: 'wufeng_academy_cliff', landmarkName: '凤城凤凰山老牛背险崖阁', badgeTag: '辽东第一名山' },
  '210726': { kind: 'pingyao_city_gate', landmarkName: '黑山阻击战纪念馆锦州门', badgeTag: '辽西走廊粮仓' },
  '210781': { kind: 'maritime_lighthouse_harbor', landmarkName: '凌海东方华地城渤海湿地', badgeTag: '辽西湿地海湾' },
  '210921': { kind: 'mongol_ger_oboo', landmarkName: '阜新瑞应寺草原民俗敖包', badgeTag: '玛瑙之都草原' },
  '211021': { kind: 'wufeng_academy_cliff', landmarkName: '辽阳龙峰山汤河温泉古阁', badgeTag: '辽东矿产温泉' },
  '211104': { kind: 'bamboo_courtyard_library', landmarkName: '大洼稻蟹共作红海滩驿馆', badgeTag: '盘锦红滩蟹稻' },
  '211223': { kind: 'northeast_wooden_granary', landmarkName: '西丰皇家鹿苑关东林海仓', badgeTag: '中国梅花鹿乡' },
  '211324': { kind: 'mongol_ger_oboo', landmarkName: '喀左天成观浴龙谷蒙古帐', badgeTag: '辽西紫陶文化' },
  '211381': { kind: 'modern_civic_opera', landmarkName: '北票四合屯古生物化石馆', badgeTag: '中华龙鸟化石' },
  '210111': { kind: 'hsr_modern_hub', landmarkName: '苏家屯沈阳南站高铁翼', badgeTag: '辽中南高铁门户' },
  '210114': { kind: 'covered_bridge_pavilion', landmarkName: '于洪永安明清古石拱桥', badgeTag: '京沈御道古石桥' },
  '210115': { kind: 'ancient_water_wharf', landmarkName: '辽中蒲河水岸珍珠湖阁', badgeTag: '沈阳近海湿地乡' },
  '210124': { kind: 'bayong_lou', landmarkName: '法库白鹤楼辽风重檐阁', badgeTag: '中国白鹤陶瓷乡' },
  '210214': { kind: 'wufeng_academy_cliff', landmarkName: '普兰店巍霸山清泉古寺', badgeTag: '辽南古莲花名城' },
  '210302': { kind: 'wanfo_pagoda_plaza', landmarkName: '铁东二一九玉佛苑古塔', badgeTag: '钢都核心文脉区' },
  '210403': { kind: 'pingyao_city_gate', landmarkName: '东洲萨尔浒明清古战城', badgeTag: '大伙房水库山城' },
  '210404': { kind: 'memorial_archway_paifang', landmarkName: '望花雷锋纪念馆碑廊院', badgeTag: '雷锋精神发祥区' },
  '210502': { kind: 'industrial_heritage_loft', landmarkName: '平山老边沟铁矿工业记', badgeTag: '山城煤铁工业芯' },
  '210602': { kind: 'red_revolution_memorial', landmarkName: '元宝山抗美援朝纪念塔', badgeTag: '鸭绿江边境英雄' },
  '210703': { kind: 'tiananmen_gatehouse', landmarkName: '凌河辽沈战役纪念馆阙', badgeTag: '辽西英雄纪念城' },
  '210882': { kind: 'industrial_heritage_loft', landmarkName: '大石桥世界镁都工业坊', badgeTag: '中国镁都工业城' },
  '211224': { kind: 'pingyao_city_gate', landmarkName: '昌图八面城辽金古城门', badgeTag: '全国产粮大县' },
  '211282': { kind: 'xian_bell_goose_pagoda', landmarkName: '开原崇寿寺金代古砖塔', badgeTag: '辽北千年古城塔' },
  '211322': { kind: 'tiananmen_gatehouse', landmarkName: '建平牛河梁红山女神庙', badgeTag: '五千年红山文明' },
  '211422': { kind: 'wufeng_academy_cliff', landmarkName: '建昌白狼山辽西古刹阁', badgeTag: '辽西生态果乡' },
  '210123': { kind: 'ancient_water_wharf', landmarkName: '康平卧龙湖辽北湿地古渡', badgeTag: '辽北塞外明珠湖' },
  '210304': { kind: 'industrial_heritage_loft', landmarkName: '立山鞍钢矿山与孟泰纪念', badgeTag: '钢铁脊梁孟泰乡' },
  '210321': { kind: 'shanxi_courtyard_jinshang', landmarkName: '台安张学良出生地桑林院', badgeTag: '少帅故里辽河滩' },
  '210402': { kind: 'industrial_heritage_loft', landmarkName: '新抚西露天矿亚洲巨坑架', badgeTag: '煤都西露天奇迹' },
  '210411': { kind: 'wanfo_pagoda_plaza', landmarkName: '顺城高尔山辽代八角古塔', badgeTag: '辽代高尔山古塔' },
  '210421': { kind: 'red_revolution_memorial', landmarkName: '抚顺三块石抗联红色碑院', badgeTag: '辽东满族山珍乡' },
  '210503': { kind: 'industrial_heritage_loft', landmarkName: '溪湖百年煤铁第一高炉群', badgeTag: '中国近代煤铁源' },
  '210504': { kind: 'wufeng_academy_cliff', landmarkName: '明山平顶山森林公园望塔', badgeTag: '中国枫叶药都芯' },
  '210505': { kind: 'industrial_heritage_loft', landmarkName: '南芬百年铁矿与大冰沟峡', badgeTag: '辽东精品铁矿谷' },
  '210604': { kind: 'beacon_tower_greatwall', landmarkName: '振安虎山明万里长城东首', badgeTag: '明长城东端起点' },
  '210711': { kind: 'modern_civic_opera', landmarkName: '太和锦州东湖工业展博园', badgeTag: '辽西走廊枢纽区' },
  '210802': { kind: 'confucian_temple_qufu', landmarkName: '站前营口楞严禅寺重檐殿', badgeTag: '渤海东北第一港' },
  '210803': { kind: 'bund_shikumen', landmarkName: '西市营口辽河老街开埠楼', badgeTag: '东北首个开埠港' },
  '210811': { kind: 'ancient_water_wharf', landmarkName: '老边辽河入海稻蟹古渡口', badgeTag: '辽河入海稻田乡' },
  '210902': { kind: 'industrial_heritage_loft', landmarkName: '海州百年亚洲第一露天矿', badgeTag: '共和国煤炭功勋' },
  '210903': { kind: 'industrial_heritage_loft', landmarkName: '新邱百年矿坑赛道文旅园', badgeTag: '煤城赛道转型区' },
  '210904': { kind: 'red_revolution_memorial', landmarkName: '太平高德矿抗战纪念碑馆', badgeTag: '辽西煤炭纪念地' },
  '210905': { kind: 'jiayuguan_pass_fortress', landmarkName: '清河门清代柳条边古边门', badgeTag: '清代柳条边重门' },
  '210911': { kind: 'bamboo_courtyard_library', landmarkName: '细河玉龙湖大学城科教馆', badgeTag: '中华第一龙城芯' },
  '210922': { kind: 'desert_observatory_solar', landmarkName: '彰武章古台科学治沙纪念', badgeTag: '新中国治沙起点' },
  '211003': { kind: 'pingyao_city_gate', landmarkName: '文圣后金东京城八角殿门', badgeTag: '后金古都东京城' },
  '211004': { kind: 'industrial_heritage_loft', landmarkName: '宏伟辽阳石化现代化工塔', badgeTag: '东北石化产业城' },
  '211005': { kind: 'tea_house_heritage', landmarkName: '弓长岭汤河冷热双泉山庄', badgeTag: '中国温泉之乡区' },
  '211011': { kind: 'confucian_temple_qufu', landmarkName: '太子河汉魏壁画古墓博馆', badgeTag: '东北第一古城边' },
  '211081': { kind: 'pingyao_city_gate', landmarkName: '灯塔燕州城高句丽山城壁', badgeTag: '辽东高句丽石城' },
  '211102': { kind: 'memorial_archway_paifang', landmarkName: '双台子辽河碑林长廊石坊', badgeTag: '东北最大碑林园' },
  '211202': { kind: 'wanfo_pagoda_plaza', landmarkName: '银州龙首山圆通寺明古塔', badgeTag: '辽北曲艺小品城' },
  '211204': { kind: 'hydroelectric_arch_dam', landmarkName: '清河大型水库大坝灌溉枢', badgeTag: '辽北水源象牙山' },
  '211221': { kind: 'bamboo_courtyard_library', landmarkName: '铁岭凡河莲花湖湿地书院', badgeTag: '中国榛子之乡县' },
  '211281': { kind: 'inland_dryport_railhub', landmarkName: '调兵山百年蒸汽机车博物', badgeTag: '世界蒸汽机车库' },
  '211303': { kind: 'modern_civic_opera', landmarkName: '龙城朝阳鸟化石地质博馆', badgeTag: '世界第一只鸟地' },
  '211321': { kind: 'wufeng_academy_cliff', landmarkName: '朝阳清风岭抗联丹霞山寨', badgeTag: '辽西绿肺清风岭' },
  '211382': { kind: 'tiananmen_gatehouse', landmarkName: '凌源牛河梁红山文化坛庙', badgeTag: '五千年中华文明' },
  '211402': { kind: 'red_revolution_memorial', landmarkName: '连山塔山阻击战纪念碑馆', badgeTag: '辽沈战役关键地' },
  '211404': { kind: 'industrial_heritage_loft', landmarkName: '南票乌金塘与矿山生态园', badgeTag: '辽西煤城生态区' },

  // === 吉林省 ===
  '220102': { kind: 'confucian_temple_qufu', landmarkName: '长春文庙与老城红墙院', badgeTag: '春城文庙古韵' },
  '220104': { kind: 'modern_civic_opera', landmarkName: '长春地质宫与文化广场', badgeTag: '北国学府名殿' },
  '220204': { kind: 'bund_shikumen', landmarkName: '吉林松花江天主教堂双塔', badgeTag: '雾凇江畔双塔' },
  '220582': { kind: 'karst_stone_watchtower', landmarkName: '集安高句丽将军坟石坛', badgeTag: '鸭绿江边世遗' },
  '220721': { kind: 'mongol_ger_oboo', landmarkName: '前郭查干湖渔猎敖包亭', badgeTag: '冬捕圣湖敖包' },
  '222401': { kind: 'tea_house_heritage', landmarkName: '延吉朝鲜族民俗飞檐村落', badgeTag: '双语边城早市' },
  '220621': { kind: 'crater_tianchi_volcano_rim', landmarkName: '抚松长白山火山口天池缘', badgeTag: '长白山天池火山口' },
  '222426': { kind: 'crater_tianchi_volcano_rim', landmarkName: '安图长白山北坡天池火山口', badgeTag: '长白山北坡天池' },
  '222404': { kind: 'bayong_lou', landmarkName: '珲春防川龙虎阁望三国', badgeTag: '图们江口边城' },
  '222403': { kind: 'confucian_temple_qufu', landmarkName: '敦化六鼎山清祖祠古刹', badgeTag: '渤海古都名刹' },
  '220581': { kind: 'tengwang_yueyang_tower', landmarkName: '梅河口海龙湖水岸飞阁', badgeTag: '吉林松子之都' },
  '220122': { kind: 'wanfo_pagoda_plaza', landmarkName: '农安辽代黄龙府万金塔', badgeTag: '辽金黄龙故府' },
  '220882': { kind: 'ancient_water_wharf', landmarkName: '大安嫩江湾古渡生态港', badgeTag: '嫩江草原湿地' },
  '220623': { kind: 'xian_bell_goose_pagoda', landmarkName: '长白灵光塔唐渤海古塔', badgeTag: '鸭绿江源边城' },
  '220103': { kind: 'hsr_modern_hub', landmarkName: '长春百年车站站楼旧址', badgeTag: '北国春城老站区' },
  '220106': { kind: 'industrial_heritage_loft', landmarkName: '中国一汽红旗百年红厂', badgeTag: '新中国汽车摇篮' },
  '222402': { kind: 'border_port_railway_gate', landmarkName: '图们江铁路大桥口岸国门', badgeTag: '延边跨江铁路门' },
  '222405': { kind: 'tea_house_heritage', landmarkName: '海兰江朝鲜族飞檐民俗', badgeTag: '中国朝鲜族摇篮' },
  '220182': { kind: 'northeast_wooden_granary', landmarkName: '榆树天下第一粮仓木囤', badgeTag: '天下第一粮仓县' },
  '220184': { kind: 'bayong_lou', landmarkName: '公主岭响铃公园阁', badgeTag: '玉米之乡汽车城' },
  '220202': { kind: 'confucian_temple_qufu', landmarkName: '吉林文庙大成古殿', badgeTag: '松花江雾凇古岸' },
  '220211': { kind: 'hydroelectric_arch_dam', landmarkName: '松花湖水电站大坝', badgeTag: '雾凇滑雪名城区' },
  '220302': { kind: 'red_revolution_memorial', landmarkName: '四平战役红色纪念馆', badgeTag: '英雄城黑土粮仓' },
  '220322': { kind: 'bamboo_courtyard_library', landmarkName: '梨树黑土博物馆院', badgeTag: '黑土粮仓梨树地' },
  '220502': { kind: 'red_revolution_memorial', landmarkName: '杨靖宇烈士陵园殿', badgeTag: '东北抗联医药城' },
  '220602': { kind: 'red_revolution_memorial', landmarkName: '白山北山烈士塔院', badgeTag: '长白门户森林城' },
  '220702': { kind: 'confucian_temple_qufu', landmarkName: '松原龙华寺大雄殿', badgeTag: '查干湖渔猎粮仓' },
  '220822': { kind: 'bamboo_courtyard_library', landmarkName: '通榆向海湿地观鹤阁', badgeTag: '科尔沁鹤乡风电' },
  '220282': { kind: 'northeast_wooden_granary', landmarkName: '桦甸白桦林海松花木仓', badgeTag: '黄金之城林仓' },
  '220283': { kind: 'northeast_wooden_granary', landmarkName: '舒兰溪浪河黑土稻米仓', badgeTag: '关东贡米之乡' },
  '220622': { kind: 'red_revolution_memorial', landmarkName: '靖宇杨靖宇殉国地红碑', badgeTag: '长白山矿泉乡' },
  '220681': { kind: 'diaojiaolou_stilt', landmarkName: '临江鸭绿江边境木屋寨', badgeTag: '东北边城枫谷' },
  '222406': { kind: 'tea_house_heritage', landmarkName: '和龙光东朝鲜族稻田阁', badgeTag: '延边海兰稻乡' },
  '222424': { kind: 'northeast_wooden_granary', landmarkName: '汪清罗子沟林海木刻楞', badgeTag: '黑木耳红林海' },
  '220323': { kind: 'volcanic_stone_village', landmarkName: '伊通七星山火山玄武村', badgeTag: '火山群满族乡' },
  '220421': { kind: 'bamboo_courtyard_library', landmarkName: '东丰中国农民画艺博院', badgeTag: '梅花鹿画乡城' },
  '220521': { kind: 'tea_house_heritage', landmarkName: '通化鸭园山葡萄酒古窖', badgeTag: '长白山山葡萄' },
  '220781': { kind: 'northeast_wooden_granary', landmarkName: '扶余拉林河黑土玉米仓', badgeTag: '松花江黑土仓' },
  '220821': { kind: 'bamboo_courtyard_library', landmarkName: '镇赉莫莫格白鹤湿地阁', badgeTag: '中国白鹤之乡' },
  '220881': { kind: 'industrial_heritage_loft', landmarkName: '洮南黑水西瓜冰麦粮仓', badgeTag: '科尔沁边粮城' },
  '220105': { kind: 'industrial_heritage_loft', landmarkName: '二道长春拖拉机工业园', badgeTag: '长拖工业文创坊' },
  '220112': { kind: 'northeast_wooden_granary', landmarkName: '双阳鹿乡镇关东木屋苑', badgeTag: '中国梅花鹿之乡' },
  '220113': { kind: 'northeast_wooden_granary', landmarkName: '九台庙香山冰雪木屋寨', badgeTag: '关东萨满文化乡' },
  '220183': { kind: 'northeast_wooden_granary', landmarkName: '德惠松花江黑土大粮仓', badgeTag: '全国超级产粮市' },
  '220203': { kind: 'karst_stone_watchtower', landmarkName: '龙潭山高句丽古石山城', badgeTag: '北国江城化工芯' },
  '220281': { kind: 'northeast_wooden_granary', landmarkName: '蛟河红叶谷林海木刻楞', badgeTag: '长白山红叶名城' },
  '220382': { kind: 'bund_shikumen', landmarkName: '双辽郑家屯百年老商街', badgeTag: '辽河平原古驿城' },
  '220523': { kind: 'volcanic_stone_village', landmarkName: '辉南三角龙湾火山石门', badgeTag: '长白山火山湖群' },
  '220722': { kind: 'desert_observatory_solar', landmarkName: '长岭松原草原风电高塔', badgeTag: '松嫩草原绿电城' },
  '220802': { kind: 'confucian_temple_qufu', landmarkName: '洮北墨宝园辽金碑廊院', badgeTag: '鹤乡白城中心区' },
  '220221': { kind: 'northeast_wooden_granary', landmarkName: '永吉北大湖雪山滑雪木屋', badgeTag: '中国雾凇冰雪乡' },
  '220284': { kind: 'red_revolution_memorial', landmarkName: '磐石红石砬子抗联根据地', badgeTag: '东北抗联发祥地' },
  '220303': { kind: 'pingyao_city_gate', landmarkName: '四平叶赫那拉满族古城门', badgeTag: '清代皇室母族地' },
  '220402': { kind: 'tengwang_yueyang_tower', landmarkName: '辽源龙首山百年魁星楼', badgeTag: '中国琵琶之乡' },
  '220403': { kind: 'industrial_heritage_loft', landmarkName: '辽源百年煤矿工业遗产馆', badgeTag: '北方棉袜产业城' },
  '220422': { kind: 'bamboo_courtyard_library', landmarkName: '东辽鴜鹭湖湿地生态书院', badgeTag: '关东二人转之乡' },
  '220503': { kind: 'industrial_heritage_loft', landmarkName: '通化钢铁百年工业基地', badgeTag: '长白山麓医药钢' },
  '220524': { kind: 'pingyao_city_gate', landmarkName: '柳河罗通山高句丽古城壁', badgeTag: '中国火山岩大米' },
  '220605': { kind: 'bamboo_courtyard_library', landmarkName: '江源中国松花石奇石展馆', badgeTag: '中国松花石之乡' },
  '220723': { kind: 'karst_stone_watchtower', landmarkName: '乾安泥林地质奇观栈道', badgeTag: '松嫩平原碱泥林' },

  // === 黑龙江省 ===
  '230102': { kind: 'harbin_sophia_dome', landmarkName: '圣索菲亚教堂翡翠穹顶', badgeTag: '冰城拜占庭穹顶' },
  '230104': { kind: 'bund_shikumen', landmarkName: '哈尔滨中华巴洛克建筑群', badgeTag: '松花江巴洛克街' },
  '230184': { kind: 'bamboo_courtyard_library', landmarkName: '五常稻花香黑土农耕馆', badgeTag: '黑土名米之乡' },
  '230604': { kind: 'industrial_heritage_loft', landmarkName: '大庆铁人纪念馆采油架', badgeTag: '石油工业精神' },
  '231084': { kind: 'crater_tianchi_volcano_rim', landmarkName: '宁安镜泊湖吊水楼玄武岩柱', badgeTag: '火山堰塞湖玄武台' },
  '232701': { kind: 'snow_birch_timber_station', landmarkName: '漠河北极村雪原白桦木屋', badgeTag: '神州北极白桦屋' },
  '230883': { kind: 'maritime_lighthouse_harbor', landmarkName: '抚远东极日出高阁', badgeTag: '华夏东极第一' },
  '231182': { kind: 'crater_tianchi_volcano_rim', landmarkName: '五大连池老黑山火山口天池', badgeTag: '世界地质火山' },
  '231081': { kind: 'border_port_railway_gate', landmarkName: '绥芬河中东铁路口岸国门', badgeTag: '百年东铁换装门' },
  '230881': { kind: 'ancient_water_wharf', landmarkName: '同江三江口赫哲渔歌渡', badgeTag: '赫哲族发祥地' },
  '232721': { kind: 'beacon_tower_greatwall', landmarkName: '呼玛鹿鼎山黑龙江望哨', badgeTag: '大兴安岭界江' },
  '230722': { kind: 'snow_birch_timber_station', landmarkName: '嘉荫茅兰沟白桦雪林驿站', badgeTag: '龙江白桦森林驿' },
  '230183': { kind: 'harbin_sophia_dome', landmarkName: '尚志亚布力雪域木屋堡', badgeTag: '冰雪滑雪胜地' },
  '230381': { kind: 'beacon_tower_greatwall', landmarkName: '虎林珍宝岛乌苏里界江', badgeTag: '乌苏里船歌源' },
  '230204': { kind: 'bamboo_courtyard_library', landmarkName: '铁锋扎龙湿地观鹤木阁', badgeTag: '世界丹顶鹤乡' },
  '230524': { kind: 'diaojiaolou_stilt', landmarkName: '饶河乌苏里四排赫哲寨', badgeTag: '东北黑蜂之乡' },
  '230103': { kind: 'harbin_sophia_dome', landmarkName: '圣阿列克谢红砖绿顶堂', badgeTag: '百年冰城高校核' },
  '230109': { kind: 'modern_civic_opera', landmarkName: '哈尔滨大剧院雪峰曲壳', badgeTag: '北国冰雪文化岛' },
  '231102': { kind: 'bund_shikumen', landmarkName: '瑷珲历史陈列馆边城楼', badgeTag: '北疆黑河自贸口' },
  '230382': { kind: 'maritime_lighthouse_harbor', landmarkName: '兴凯湖畔北大荒灯塔湾', badgeTag: '中国空军摇篮城' },
  '231086': { kind: 'inland_dryport_railhub', landmarkName: '东宁中俄陆路口岸国门', badgeTag: '百年木耳边贸城' },
  '230108': { kind: 'modern_civic_opera', landmarkName: '平房七三一陈列馆', badgeTag: '哈飞航空工业城' },
  '230110': { kind: 'harbin_sophia_dome', landmarkName: '伏尔加庄园圣尼古拉', badgeTag: '俄式木屋电机城' },
  '230112': { kind: 'pingyao_city_gate', landmarkName: '阿城金上京会宁城', badgeTag: '金源文化发祥地' },
  '230202': { kind: 'kashgar_islamic_arcade', landmarkName: '齐齐哈尔卜奎清真寺', badgeTag: '鹤城百年商埠芯' },
  '230206': { kind: 'industrial_heritage_loft', landmarkName: '中国一重红砖厂区', badgeTag: '共和国重型装备' },
  '230602': { kind: 'modern_civic_opera', landmarkName: '大庆石油科技展馆', badgeTag: '百年油田现代芯' },
  '230717': { kind: 'snow_birch_timber_station', landmarkName: '伊美小兴安岭白桦森林驿', badgeTag: '林都雪原白桦屋' },
  '230882': { kind: 'northeast_wooden_granary', landmarkName: '富锦三江粮仓万亩木仓', badgeTag: '三江粮仓大豆乡' },
  '231083': { kind: 'northeast_wooden_granary', landmarkName: '海林雪乡木刻楞林海屋', badgeTag: '林海雪原猴头菇' },
  '231181': { kind: 'bund_shikumen', landmarkName: '北安省工委旧址红楼', badgeTag: '塞北延安粮食城' },
  '232722': { kind: 'northeast_wooden_granary', landmarkName: '塔河大兴安岭林海木刻楞', badgeTag: '鄂伦春林海乡' },
  '230718': { kind: 'northeast_wooden_granary', landmarkName: '乌翠兴安红松木刻楞仓', badgeTag: '小兴安岭氧吧' },
  '230723': { kind: 'snow_birch_timber_station', landmarkName: '汤旺河林海雪原白桦木屋', badgeTag: '兴安石林白桦屋' },
  '230724': { kind: 'northeast_wooden_granary', landmarkName: '丰林五营红松原始林仓', badgeTag: '红松故乡林海' },
  '230781': { kind: 'northeast_wooden_granary', landmarkName: '铁力日月峡林海木刻楞', badgeTag: '林都南大门仓' },
  '230123': { kind: 'pingyao_city_gate', landmarkName: '依兰五国城松花江古城', badgeTag: '千年古韵依兰' },
  '230111': { kind: 'harbin_sophia_dome', landmarkName: '呼兰萧红故居天主教堂', badgeTag: '呼兰河传文脉' },
  '230113': { kind: 'pingyao_city_gate', landmarkName: '双城魁星楼京旗古城门', badgeTag: '黑土玉米名城' },
  '230281': { kind: 'northeast_wooden_granary', landmarkName: '讷河黑土粮仓万亩木囤', badgeTag: '中国马铃薯乡' },
  '230522': { kind: 'northeast_wooden_granary', landmarkName: '友谊北大荒农垦木粮仓', badgeTag: '中苏友谊农场' },
  '230523': { kind: 'bamboo_courtyard_library', landmarkName: '宝清七星河湿地观鸟阁', badgeTag: '天府之县白瓜' },
  '230624': { kind: 'mongol_ger_oboo', landmarkName: '杜尔伯特连环湖蒙古包', badgeTag: '黑龙江西翼牧' },
  '231085': { kind: 'northeast_wooden_granary', landmarkName: '穆棱中东铁路林海木仓', badgeTag: '黑土有机粮仓' },
  '231123': { kind: 'northeast_wooden_granary', landmarkName: '逊克库尔滨雾凇木刻楞', badgeTag: '雾凇红玛瑙乡' },
  '231183': { kind: 'ancient_post_station', landmarkName: '嫩江墨尔根古驿道驿城', badgeTag: '黄金古驿嫩江' },
  '231281': { kind: 'mongol_ger_oboo', landmarkName: '安达乳都草原牧场穹庐', badgeTag: '中国牛城乳都' },
  '231282': { kind: 'northeast_wooden_granary', landmarkName: '肇东松嫩黑土大粮仓院', badgeTag: '寒地黑土粮仓' },
  '231283': { kind: 'northeast_wooden_granary', landmarkName: '海伦中国黑土硒都粮仓', badgeTag: '黑土富硒大豆' },
  '230124': { kind: 'northeast_wooden_granary', landmarkName: '方正寒地水稻黑土粮仓', badgeTag: '中国富硒大米乡' },
  '230125': { kind: 'northeast_wooden_granary', landmarkName: '宾县二龙山林海木屋群', badgeTag: '哈尔滨东郊明珠' },
  '230126': { kind: 'hsr_modern_hub', landmarkName: '巴彦兴隆森林窄轨驿站', badgeTag: '松花江北粮仓县' },
  '230203': { kind: 'modern_civic_opera', landmarkName: '建华嫩江畔鹤城大剧院', badgeTag: '嫩江湿地教育芯' },
  '230205': { kind: 'harbin_sophia_dome', landmarkName: '昂昂溪中东铁路俄式街', badgeTag: '百年中东铁路镇' },
  '230208': { kind: 'mongol_ger_oboo', landmarkName: '梅里斯哈拉新村斡尔营', badgeTag: '达斡尔民俗第一' },
  '230224': { kind: 'pingyao_city_gate', landmarkName: '泰来塔子城辽金古城门', badgeTag: '嫩江边陲绿色稻' },
  '230302': { kind: 'modern_civic_opera', landmarkName: '鸡冠区穆棱河文化剧院', badgeTag: '石墨之都中心区' },
  '230421': { kind: 'northeast_wooden_granary', landmarkName: '萝北名山岛界江木刻楞', badgeTag: '中俄界江名山岛' },
  '230521': { kind: 'northeast_wooden_granary', landmarkName: '集贤七星山抗联木营寨', badgeTag: '三江平原大粮仓' },
  '230603': { kind: 'industrial_heritage_loft', landmarkName: '龙凤大庆湿地石油展馆', badgeTag: '湿地油田共生区' },
  '230622': { kind: 'ancient_water_wharf', landmarkName: '肇源松花江三江口古渡', badgeTag: '松嫩两江交汇城' },
  '230719': { kind: 'northeast_wooden_granary', landmarkName: '友好上甘岭红松木刻楞', badgeTag: '小兴安岭森林城' },
  '230803': { kind: 'bund_shikumen', landmarkName: '向阳区松花江东极外滩', badgeTag: '华夏东极中心城' },
  '230826': { kind: 'northeast_wooden_granary', landmarkName: '桦川星火朝鲜稻乡木屋', badgeTag: '新中国第一集体' },
  '231002': { kind: 'harbin_sophia_dome', landmarkName: '东安牡丹江百年中东街', badgeTag: '雪城商贸老街区' },
  '231025': { kind: 'memorial_archway_paifang', landmarkName: '林口八女投江纪念碑坊', badgeTag: '牡丹江红松林海' },
  '231124': { kind: 'karst_stone_watchtower', landmarkName: '孙吴胜山二战地下碉堡', badgeTag: '大沾河红叶林海' },
  '231202': { kind: 'modern_civic_opera', landmarkName: '北林绥化寒地黑土展馆', badgeTag: '寒地黑土枢纽区' },
  '231222': { kind: 'shanxi_courtyard_jinshang', landmarkName: '兰西黄崖子关东大院村', badgeTag: '中国亚麻纺织乡' },
  '230127': { kind: 'red_revolution_memorial', landmarkName: '木兰鸡冠山东北抗联密营', badgeTag: '松花江畔抗联山' },
  '230128': { kind: 'northeast_wooden_granary', landmarkName: '通河铧子山森林与稻米仓', badgeTag: '松花江北稻米乡' },
  '230129': { kind: 'northeast_wooden_granary', landmarkName: '延寿蚂蜒河亚麻林海木仓', badgeTag: '中国优质亚麻乡' },
  '230207': { kind: 'beacon_tower_greatwall', landmarkName: '碾子山金代东北路界壕墙', badgeTag: '金代界壕长城口' },
  '230225': { kind: 'northeast_wooden_granary', landmarkName: '甘南兴十四现代农业木仓', badgeTag: '龙江葵花第一村' },
  '230227': { kind: 'tea_house_heritage', landmarkName: '富裕百年老窖与龙安桥渡', badgeTag: '中国富裕老窖乡' },
  '230229': { kind: 'northeast_wooden_granary', landmarkName: '克山黑土良种粮仓与双山', badgeTag: '中国马铃薯种都' },
  '230231': { kind: 'northeast_wooden_granary', landmarkName: '拜泉黑土水土保持林海仓', badgeTag: '黑土水保生态县' },
  '230303': { kind: 'industrial_heritage_loft', landmarkName: '恒山百年煤炭工业矿井架', badgeTag: '龙江石墨煤城芯' },
  '230403': { kind: 'industrial_heritage_loft', landmarkName: '工农鹤岗百年煤矿工业馆', badgeTag: '北方煤电石墨城' },
  '230422': { kind: 'ancient_water_wharf', landmarkName: '绥滨松花江入黑龙江古渡', badgeTag: '两江汇流俄边贸' },
  '230502': { kind: 'industrial_heritage_loft', landmarkName: '尖山双鸭山百年煤城高炉', badgeTag: '完达山麓煤粮芯' },
  '230605': { kind: 'industrial_heritage_loft', landmarkName: '红岗大庆油田抽油机采油', badgeTag: '铁人会战主产区' },
  '230623': { kind: 'ancient_water_wharf', landmarkName: '林甸北国温泉丹顶鹤湿地', badgeTag: '中国温泉之乡县' },
  '230822': { kind: 'inland_dryport_railhub', landmarkName: '桦南林海百年森林小火车', badgeTag: '龙江森林蒸汽轨' },
  '230828': { kind: 'red_revolution_memorial', landmarkName: '汤原东北抗联汤原游击馆', badgeTag: '东北抗联摇篮县' },
  '231004': { kind: 'inland_dryport_railhub', landmarkName: '爱民牡丹江百年中东铁路', badgeTag: '雪城中东铁路芯' },
  '231224': { kind: 'northeast_wooden_granary', landmarkName: '庆安绿色稻米黑土大粮仓', badgeTag: '中国绿色食品稻' },
  '230221': { kind: 'bamboo_courtyard_library', landmarkName: '龙江哈拉海湿地生态观阁', badgeTag: '嫩西小米生态' },
  '230223': { kind: 'porcelain_dragon_kiln', landmarkName: '依安北方白陶龙瓷文化窑', badgeTag: '北国瓷都依安' },
  '230230': { kind: 'pingyao_city_gate', landmarkName: '克东金代蒲峪路古城遗址', badgeTag: '腐乳名城金城' },
  '230304': { kind: 'industrial_heritage_loft', landmarkName: '滴道百年矿史馆老井架园', badgeTag: '鸡西煤城根源' },
  '230305': { kind: 'red_revolution_memorial', landmarkName: '梨树穆棱煤矿红史陈列馆', badgeTag: '煤城第一支部' },
  '230306': { kind: 'pingyao_city_gate', landmarkName: '城子河金代古城子遗址门', badgeTag: '金代山城黑土' },
  '230307': { kind: 'smart_science_twin_towers', landmarkName: '麻山烯望石墨新材科创馆', badgeTag: '中国石墨之都' },
  '230321': { kind: 'wufeng_academy_cliff', landmarkName: '鸡东麒麟山奇峰悬亭阁楼', badgeTag: '北国小黄山乡' },
  '230402': { kind: 'tengwang_yueyang_tower', landmarkName: '向阳区北山公园鹿迹山阁', badgeTag: '鹤岗城市文脉' },
  '230404': { kind: 'west_lake_leifeng', landmarkName: '南山区松鹤西湖生态长阁', badgeTag: '松鹤湖畔生态' },
  '230405': { kind: 'karst_stone_watchtower', landmarkName: '兴安区将军石森林山地营', badgeTag: '兴安余脉林海' },
  '230406': { kind: 'industrial_heritage_loft', landmarkName: '东山区鹤岗国家矿山公园', badgeTag: '矿山地质转型' },
  '230407': { kind: 'modern_civic_opera', landmarkName: '兴山区清源湖与电影记忆', badgeTag: '东北影史摇篮' },
  '230503': { kind: 'northeast_wooden_granary', landmarkName: '岭东青山国家森林木屋阁', badgeTag: '完达山林海区' },
  '230505': { kind: 'bamboo_courtyard_library', landmarkName: '四方台紫云岭森林观花阁', badgeTag: '紫云杜鹃花海' },
  '230506': { kind: 'industrial_heritage_loft', landmarkName: '宝山区完达山煤电矿井坊', badgeTag: '东翼能源重镇' },
  '230606': { kind: 'ancient_water_wharf', landmarkName: '大同西海湿地观鸟木栈渡', badgeTag: '大庆果蔬湿地' },
  '230621': { kind: 'pingyao_city_gate', landmarkName: '肇州金代古城遗址城垣门', badgeTag: '金代肇州故城' },
  '230725': { kind: 'northeast_wooden_granary', landmarkName: '大箐山乌带林海红松木屋', badgeTag: '最美森林公路' },
  '230726': { kind: 'wufeng_academy_cliff', landmarkName: '南岔仙翁山北国奇峰飞阁', badgeTag: '仙翁山林海城' },
  '230751': { kind: 'northeast_wooden_granary', landmarkName: '金林金山鹿苑兴安木刻楞', badgeTag: '兴安鹿谷林海' },
  '230804': { kind: 'west_lake_leifeng', landmarkName: '前进区水源山松花江观阁', badgeTag: '三江沿岸枢纽' },
  '230805': { kind: 'industrial_heritage_loft', landmarkName: '东风区佳纸百年造纸工业', badgeTag: '百年轻工基地' },
  '230811': { kind: 'diaojiaolou_stilt', landmarkName: '佳木斯敖其湾赫哲鱼皮寨', badgeTag: '松花江赫哲寨' },
  '230902': { kind: 'industrial_heritage_loft', landmarkName: '新兴区焦化煤城转型园区', badgeTag: '龙江煤焦重镇' },
  '230903': { kind: 'modern_civic_opera', landmarkName: '桃山区短道速滑冠军展馆', badgeTag: '冬奥冠军摇篮' },
  '230904': { kind: 'northeast_wooden_granary', landmarkName: '茄子河石龙山林海木屋栈', badgeTag: '完达山芝樱谷' },
  '230921': { kind: 'beacon_tower_greatwall', landmarkName: '勃利西大圈林海古寨哨所', badgeTag: '完达山红松乡' },
  '231003': { kind: 'ancient_water_wharf', landmarkName: '阳明铁岭河牡丹江畔古渡', badgeTag: '雪城东翼枢纽' },
  '231005': { kind: 'tea_house_heritage', landmarkName: '西安区牡丹江朝鲜民俗街', badgeTag: '北国朝鲜风情' },
  '231221': { kind: 'dongyang_luzhai_mansion', landmarkName: '望奎满族博物院与林枫馆', badgeTag: '满族剪纸皮影' },
  '231223': { kind: 'modern_civic_opera', landmarkName: '青冈猛犸象古生物博物院', badgeTag: '中国猛犸象乡' },
  '231225': { kind: 'bamboo_courtyard_library', landmarkName: '明水湿地大鸨保护观鸟阁', badgeTag: '寒地湿地候鸟' },
  '231226': { kind: 'inland_dryport_railhub', landmarkName: '绥棱森铁小火车木刻楞站', badgeTag: '小兴安岭林铁' },

  // === 上海市 ===
  '310101': { kind: 'bund_shikumen', landmarkName: '外滩万国钟楼与石库门', badgeTag: '海派外滩天际' },
  '310104': { kind: 'bund_shikumen', landmarkName: '徐家汇双塔教堂与武康楼', badgeTag: '梧桐洋房文脉' },
  '310106': { kind: 'confucian_temple_qufu', landmarkName: '静安古寺金顶与南京西路', badgeTag: '繁华古刹金顶' },
  '310114': { kind: 'jiangnan_gardens_gate', landmarkName: '嘉定州桥老街与汇龙潭', badgeTag: '教化嘉定孔庙' },
  '310115': { kind: 'oriental_pearl_lujiazui', landmarkName: '东方明珠与陆家嘴三高塔', badgeTag: '全球金融科创极' },
  '310118': { kind: 'floating_water_market', landmarkName: '青浦朱家角河埠船市', badgeTag: '沪西水乡古镇' },
  '310151': { kind: 'sea_crossing_cable_bridge', landmarkName: '上海长江大桥与崇明生态岛', badgeTag: '生态瀛洲跨海桥' },
  '310117': { kind: 'ancient_water_wharf', landmarkName: '松江广富林水下古檐馆', badgeTag: '上海之根松江' },
  '310116': { kind: 'covered_bridge_pavilion', landmarkName: '金山枫泾古镇三桥水巷', badgeTag: '沪郊画乡湾区' },
  '310109': { kind: 'oriental_pearl_lujiazui', landmarkName: '虹口北外滩航运天际线', badgeTag: '海派文化发祥' },
  '310110': { kind: 'industrial_heritage_loft', landmarkName: '杨浦滨江百年船厂科创', badgeTag: '工业锈带蝶变' },
  '310105': { kind: 'bund_shikumen', landmarkName: '愚园路洋房与虹桥门户', badgeTag: '国际时尚花园城' },
  '310107': { kind: 'industrial_heritage_loft', landmarkName: '苏州河畔纺织厂房创意园', badgeTag: '苏河工业艺文廊' },
  '310112': { kind: 'covered_bridge_pavilion', landmarkName: '七宝古镇蒲汇塘石拱桥', badgeTag: '大零号湾科创城' },
  '310113': { kind: 'maritime_lighthouse_harbor', landmarkName: '吴淞口邮轮港与灯塔湾', badgeTag: '百年钢厂邮轮港' },
  '310120': { kind: 'modern_civic_opera', landmarkName: '上海之鱼与九棵树艺术馆', badgeTag: '东方美谷海岸城' },

  // === 江苏省 ===
  '320102': { kind: 'ancient_star_observatory', landmarkName: '南京紫金山天文台与玄武门', badgeTag: '山水城林观星台' },
  '320104': { kind: 'tengwang_yueyang_tower', landmarkName: '夫子庙大成殿与秦淮水阁', badgeTag: '十里秦淮文枢' },
  '320211': { kind: 'west_lake_leifeng', landmarkName: '太湖鼋头渚长桥灯塔', badgeTag: '太湖山水名胜' },
  '320303': { kind: 'bayong_lou', landmarkName: '徐州云龙山与回龙窝古坊', badgeTag: '两汉彭城文脉' },
  '320508': { kind: 'jiangnan_gardens_gate', landmarkName: '苏州拙政园月洞门与北寺塔', badgeTag: '世界园林之城' },
  '320583': { kind: 'floating_water_market', landmarkName: '昆山周庄双桥水乡船市', badgeTag: '昆曲水乡百强首' },
  '320623': { kind: 'island_wind_turbine_bay', landmarkName: '如东洋口港黄海海上风电', badgeTag: '黄海绿电海上风' },
  '321002': { kind: 'covered_bridge_pavilion', landmarkName: '扬州瘦西湖五亭桥与白塔', badgeTag: '运河淮扬名桥' },
  '320581': { kind: 'west_lake_leifeng', landmarkName: '常熟虞山兴福禅寺塔', badgeTag: '琴川尚湖福地' },
  '320282': { kind: 'bamboo_sea_watchtower', landmarkName: '宜兴竹海太湖翡翠观涛阁', badgeTag: '中国陶都竹海' },
  '320281': { kind: 'sea_crossing_cable_bridge', landmarkName: '江阴长江大桥黄山炮台', badgeTag: '制造业第一县' },
  '320582': { kind: 'maritime_lighthouse_harbor', landmarkName: '张家港永联与长江港湾', badgeTag: '文明港城百强' },
  '320585': { kind: 'ancient_water_wharf', landmarkName: '太仓沙溪古镇郑和起锚', badgeTag: '德企之乡海港' },
  '321183': { kind: 'wufeng_academy_cliff', landmarkName: '句容茅山九霄万福道宫', badgeTag: '道教圣地草莓' },
  '320481': { kind: 'bamboo_sea_watchtower', landmarkName: '溧阳南山竹海翠峰观涛阁', badgeTag: '宁杭生态明珠' },
  '321084': { kind: 'ancient_post_station', landmarkName: '高邮盂城驿运河古驿站', badgeTag: '运河双蛋邮城' },
  '321281': { kind: 'tengwang_yueyang_tower', landmarkName: '兴化千垛水上油菜观阁', badgeTag: '里下河水上垛' },
  '321282': { kind: 'sea_crossing_cable_bridge', landmarkName: '靖江长江大桥与孤山庙', badgeTag: '江鲜名城百强' },
  '321181': { kind: 'yiwu_tradecity_jiming', landmarkName: '丹阳眼镜风尚馆万善塔', badgeTag: '世界眼镜之都' },
  '320722': { kind: 'modern_civic_opera', landmarkName: '东海水晶博物馆晶光穹', badgeTag: '世界水晶之都' },
  '320830': { kind: 'memorial_archway_paifang', landmarkName: '盱眙第一山明祖陵石坊', badgeTag: '中国龙虾之都' },
  '320509': { kind: 'jiangnan_gardens_gate', landmarkName: '吴江同里退思园水乡庭', badgeTag: '丝绸纺织百强' },
  '320506': { kind: 'jiangnan_gardens_gate', landmarkName: '吴中木渎古镇严家名园', badgeTag: '太湖洞庭碧螺' },
  '320322': { kind: 'floating_solar_reservoir_array', landmarkName: '沛县采煤沉陷湖水面漂浮光伏', badgeTag: '微山湖漂浮光伏' },
  '320413': { kind: 'dongyang_luzhai_mansion', landmarkName: '金坛东方盐湖城道风阁', badgeTag: '茅山盐湖茶乡' },
  '320685': { kind: 'hsr_modern_hub', landmarkName: '海安枢纽站城青墩古阁', badgeTag: '苏中纺织枢纽' },
  '320682': { kind: 'jiangnan_gardens_gate', landmarkName: '如皋水绘园碧落水墨亭', badgeTag: '长寿花木盆景' },
  '320803': { kind: 'grand_canal_granary', landmarkName: '淮安漕运总督署河下古仓', badgeTag: '运河之都淮扬' },
  '320105': { kind: 'smart_science_twin_towers', landmarkName: '河西青奥双塔与南京眼', badgeTag: '河西金融科创极' },
  '320106': { kind: 'tengwang_yueyang_tower', landmarkName: '阅江楼与鼓楼百年学府', badgeTag: '六朝文枢高校区' },
  '320111': { kind: 'bund_shikumen', landmarkName: '百年浦口火车站历史建筑', badgeTag: '江北枢纽科创区' },
  '320113': { kind: 'wanfo_pagoda_plaza', landmarkName: '栖霞寺舍利石塔与山门', badgeTag: '仙林大学城禅林' },
  '320114': { kind: 'smart_science_twin_towers', landmarkName: '中国软件谷研发双塔群', badgeTag: '软件科创名城核' },
  '320115': { kind: 'modern_civic_opera', landmarkName: '牛首山佛顶宫莲花穹顶', badgeTag: '江宁大学城智谷' },
  '320117': { kind: 'covered_bridge_pavilion', landmarkName: '溧水天生桥石拱与秦淮', badgeTag: '秦淮源头康养区' },
  '320118': { kind: 'jiangnan_gardens_gate', landmarkName: '高淳老街粉墙花窗慢城', badgeTag: '国际慢城水乡区' },
  '320205': { kind: 'ancient_water_wharf', landmarkName: '荡口古镇水巷石桥码头', badgeTag: '锡东智造高铁城' },
  '320206': { kind: 'tea_house_heritage', landmarkName: '阳山万亩桃园生态茶阁', badgeTag: '江南水蜜桃乡区' },
  '320213': { kind: 'ancient_water_wharf', landmarkName: '清名桥与南长街运河渡', badgeTag: '江南水弄堂母城' },
  '320214': { kind: 'smart_science_twin_towers', landmarkName: '无锡高新物联网双塔城', badgeTag: '吴文化科创高地' },
  '320402': { kind: 'wanfo_pagoda_plaza', landmarkName: '天宁禅寺宝塔与红梅阁', badgeTag: '龙城青果巷文脉' },
  '320411': { kind: 'smart_science_twin_towers', landmarkName: '常州高铁新城科创双塔', badgeTag: '新能源制造新区' },
  '320412': { kind: 'pingyao_city_gate', landmarkName: '淹城春秋三城三河遗址', badgeTag: '苏南智造强区首' },
  '320505': { kind: 'west_lake_leifeng', landmarkName: '虎丘云岩斜塔与剑池亭', badgeTag: '千年吴中第一山' },
  '320507': { kind: 'porcelain_dragon_kiln', landmarkName: '御窑金砖古窑博物馆群', badgeTag: '阳澄湖高铁枢纽' },
  '320613': { kind: 'bund_shikumen', landmarkName: '南通博物苑濠河近代楼', badgeTag: '中国近代第一城' },
  '320612': { kind: 'yiwu_tradecity_jiming', landmarkName: '南通家纺城与南山古阁', badgeTag: '家纺建筑百强区' },
  '320614': { kind: 'dongyang_luzhai_mansion', landmarkName: '张謇故里柳西半街门楼', badgeTag: '江海门户家纺城' },
  '320681': { kind: 'tidal_estuary_sluice_bridge', landmarkName: '启东圆陀角江海堤与挡潮闸桥', badgeTag: '江海交汇挡潮堤' },
  '321003': { kind: 'ancient_water_wharf', landmarkName: '瓜洲古渡与明月湖水阁', badgeTag: '扬州科创百强区' },
  '321012': { kind: 'dujiangyan_temple_weir', landmarkName: '江都水利枢纽与邵伯闸', badgeTag: '南水北调源头区' },
  '321081': { kind: 'wanfo_pagoda_plaza', landmarkName: '仪征天宁寺塔与白沙渡', badgeTag: '江淮化工汽车城' },
  '321102': { kind: 'bayong_lou', landmarkName: '北固山多景楼与铁塔阁', badgeTag: '京口北固名楼城' },
  '321111': { kind: 'west_lake_leifeng', landmarkName: '金山江天禅寺慈寿宝塔', badgeTag: '西津渡千年古街' },
  '321283': { kind: 'pingyao_city_gate', landmarkName: '黄桥古镇古街城楼与塔', badgeTag: '千年银杏化工城' },
  '320981': { kind: 'tidal_estuary_sluice_bridge', landmarkName: '东台条子泥滩涂海堤与潮汐闸', badgeTag: '世界遗产条子泥' },
  '320382': { kind: 'bamboo_courtyard_library', landmarkName: '邳州银杏时光林道展馆', badgeTag: '苏北百强板材城' },
  '320116': { kind: 'bamboo_courtyard_library', landmarkName: '六合竹镇止马岭书院', badgeTag: '茉莉花源雨花石' },
  '320302': { kind: 'tiananmen_gatehouse', landmarkName: '龟山汉墓与鼓楼遗址', badgeTag: '楚汉文化徐州芯' },
  '320311': { kind: 'confucian_temple_qufu', landmarkName: '泉山汉画像石艺术馆', badgeTag: '彭城汉文化科教' },
  '320404': { kind: 'jiangnan_gardens_gate', landmarkName: '瞿秋白纪念馆与三堡', badgeTag: '运河三堡老城芯' },
  '320703': { kind: 'maritime_lighthouse_harbor', landmarkName: '连岛苏马湾海港灯塔', badgeTag: '新亚欧大陆桥港' },
  '320706': { kind: 'wufeng_academy_cliff', landmarkName: '花果山玉皇阁云台崖', badgeTag: '西游圣境东海城' },
  '320812': { kind: 'ancient_water_wharf', landmarkName: '清江大闸与里运河阁', badgeTag: '南船北马运河城' },
  '320902': { kind: 'red_revolution_memorial', landmarkName: '盐城新四军纪念馆塔', badgeTag: '黄海湿地盐城芯' },
  '320904': { kind: 'harbin_sophia_dome', landmarkName: '大丰荷兰花海风车阁', badgeTag: '世界自然遗产麋鹿' },
  '321202': { kind: 'dongyang_luzhai_mansion', landmarkName: '梅兰芳纪念馆古戏楼', badgeTag: '京剧大师水城泰州' },
  '321302': { kind: 'pingyao_city_gate', landmarkName: '宿迁项王故里楚城门', badgeTag: '霸王故里洋河酒' },
  '321322': { kind: 'bamboo_courtyard_library', landmarkName: '沭阳花木园艺展示馆', badgeTag: '中国花木百强县' },
  '321023': { kind: 'grand_canal_granary', landmarkName: '宝应京杭运河漕运古仓', badgeTag: '荷藕运河水乡' },
  '320804': { kind: 'grand_canal_granary', landmarkName: '淮阴古淮河码头漕运仓', badgeTag: '韩信故里运河' },
  '320813': { kind: 'dujiangyan_temple_weir', landmarkName: '洪泽湖大堤古堰观澜阁', badgeTag: '百里洪泽湖堰' },
  '320831': { kind: 'ancient_water_wharf', landmarkName: '金湖万亩荷荡水上水门', badgeTag: '尧帝故里荷乡' },
  '320903': { kind: 'ancient_water_wharf', landmarkName: '盐城大纵湖水乡古渡阁', badgeTag: '里下河水韵区' },
  '320924': { kind: 'tidal_estuary_sluice_bridge', landmarkName: '射阳河口挡潮闸桥与黄海滩涂', badgeTag: '鹤乡黄海挡潮闸' },
  '321182': { kind: 'sea_crossing_cable_bridge', landmarkName: '扬中江心洲斜拉跨江桥', badgeTag: '万里长江岛市' },
  '321204': { kind: 'ancient_water_wharf', landmarkName: '姜堰溱潼古镇会船古渡', badgeTag: '溱湖会船水乡' },
  '320305': { kind: 'floating_solar_reservoir_array', landmarkName: '贾汪潘安湖水面漂浮光伏方阵', badgeTag: '矿区湖库光伏阵' },
  '320312': { kind: 'tiananmen_gatehouse', landmarkName: '铜山汉王镇拔剑泉汉阙', badgeTag: '彭城楚汉高新' },
  '320321': { kind: 'tiananmen_gatehouse', landmarkName: '丰县汉皇祖陵凤城古阙', badgeTag: '大汉龙源果都' },
  '320707': { kind: 'maritime_lighthouse_harbor', landmarkName: '赣榆秦山岛黄海灯塔港', badgeTag: '徐福东渡海湾' },
  '321323': { kind: 'grand_canal_granary', landmarkName: '泗阳大运河成子湖漕仓', badgeTag: '中国意杨酒乡' },
  '321324': { kind: 'floating_solar_reservoir_array', landmarkName: '泗洪洪泽湖领跑者漂浮光伏阵', badgeTag: '洪泽湖光伏领跑' },
  '320324': { kind: 'pingyao_city_gate', landmarkName: '睢宁下邳古城圯桥遗址', badgeTag: '苏北汉风古下邳' },
  '320381': { kind: 'ancient_water_wharf', landmarkName: '新沂窑湾古镇运河古埠', badgeTag: '苏北千年运河镇' },
  '320723': { kind: 'maritime_lighthouse_harbor', landmarkName: '灌云开山岛海防灯塔港', badgeTag: '时代楷模守岛城' },
  '320724': { kind: 'tea_house_heritage', landmarkName: '灌南汤沟千年古酒槽坊', badgeTag: '苏北名酒菌菇乡' },
  '320826': { kind: 'wanfo_pagoda_plaza', landmarkName: '涟水五岛湖妙通宋代塔', badgeTag: '淮安高教名酒县' },
  '320921': { kind: 'coastal_salt_pan_pyramid', landmarkName: '响水灌西淮盐田银垛风车', badgeTag: '淮盐古海晒场' },
  '320922': { kind: 'tidal_estuary_sluice_bridge', landmarkName: '滨海新滩海堤与黄海挡潮闸桥', badgeTag: '黄海滩涂能源闸' },
  '320923': { kind: 'dongyang_luzhai_mansion', landmarkName: '阜宁停翅港新四军旧址', badgeTag: '苏北铁军红色乡' },
  '320925': { kind: 'ancient_water_wharf', landmarkName: '建湖九龙口淮剧古水乡', badgeTag: '杂技淮剧湿地乡' },
  '321112': { kind: 'confucian_temple_qufu', landmarkName: '丹徒米芾书法公园碑廊', badgeTag: '米芾云山书法乡' },
  '321203': { kind: 'modern_civic_opera', landmarkName: '高港白马庙海军诞生地', badgeTag: '中国海军摇篮港' },
  '321311': { kind: 'grand_canal_granary', landmarkName: '宿豫大运河宿迁港漕仓', badgeTag: '运河港区电商城' },

  // === 浙江省（其余地市典型代表） ===
  '330102': { kind: 'tengwang_yueyang_tower', landmarkName: '杭州吴山城隍阁与南宋御街', badgeTag: '南宋皇城宋韵' },
  '330106': { kind: 'west_lake_leifeng', landmarkName: '西湖雷峰塔与断桥残雪', badgeTag: '西湖双遗名塔' },
  '330110': { kind: 'bamboo_courtyard_library', landmarkName: '良渚古城博物院玉琮馆', badgeTag: '五千年良渚圣地' },
  '330127': { kind: 'maritime_lighthouse_harbor', landmarkName: '淳安千岛湖湖心灯塔港湾', badgeTag: '千岛碧水康养' },
  '330212': { kind: 'modern_civic_opera', landmarkName: '宁波博物馆瓦爿墙与三江口', badgeTag: '书藏古今港通天下' },
  '330302': { kind: 'maritime_lighthouse_harbor', landmarkName: '温州江心屿东西古塔灯塔', badgeTag: '瓯江孤屿双塔' },
  '330326': { kind: 'dongyang_luzhai_mansion', landmarkName: '平阳顺溪百年木构古大屋', badgeTag: '浙南古屋印刷城' },
  '330402': { kind: 'ancient_water_wharf', landmarkName: '嘉兴南湖烟雨楼红船古渡', badgeTag: '南湖红色水城' },
  '330483': { kind: 'floating_water_market', landmarkName: '桐乡乌镇逢源水阁船市', badgeTag: '互联网乌镇水乡' },
  '330523': { kind: 'bamboo_sea_watchtower', landmarkName: '安吉中国大竹海观涛阁', badgeTag: '两山竹海村咖' },
  '330602': { kind: 'bayong_lou', landmarkName: '绍兴越王台与仓桥直街', badgeTag: '鉴湖越台名士乡' },
  '330902': { kind: 'sea_crossing_cable_bridge', landmarkName: '舟山跨海大桥与定海古城', badgeTag: '东海千岛跨海桥' },
  '331082': { kind: 'pingyao_city_gate', landmarkName: '临海台州府城墙江南长城', badgeTag: '千年台州府城' },
  '331181': { kind: 'ceramic_dragon_kiln_chimney', landmarkName: '龙泉大窑青瓷阶梯龙窑烟囱', badgeTag: '人类非遗青瓷窑' },
  '330281': { kind: 'confucian_temple_qufu', landmarkName: '余姚河姆渡与阳明故居', badgeTag: '七千年稻作祖' },
  '330282': { kind: 'sea_crossing_cable_bridge', landmarkName: '慈溪杭州湾跨海桥青瓷', badgeTag: '小家电慈孝乡' },
  '330225': { kind: 'island_wind_turbine_bay', landmarkName: '象山涂茨海湾风机海风廊', badgeTag: '东海渔湾风车阵' },
  '330226': { kind: 'classical_wood_opera_stage', landmarkName: '宁海平调耍牙重檐古戏台', badgeTag: '浙东清代古戏台群' },
  '330213': { kind: 'pingyao_city_gate', landmarkName: '奉化溪口武岭门雪窦阁', badgeTag: '弥勒圣地桃乡' },
  '330381': { kind: 'dongyang_luzhai_mansion', landmarkName: '瑞安玉海楼木活字藏馆', badgeTag: '千年玉海文脉' },
  '330382': { kind: 'wufeng_academy_cliff', landmarkName: '乐清雁荡山灵峰古刹崖', badgeTag: '中国电器之都' },
  '330324': { kind: 'covered_bridge_pavilion', landmarkName: '永嘉楠溪江丽水长廊亭', badgeTag: '山水诗发祥地' },
  '330329': { kind: 'covered_bridge_pavilion', landmarkName: '泰顺泗溪北涧古木廊桥', badgeTag: '中国廊桥之乡' },
  '330481': { kind: 'tidal_estuary_sluice_bridge', landmarkName: '海宁盐官观潮海塘与挡潮闸桥', badgeTag: '钱塘观潮古海塘' },
  '330482': { kind: 'west_lake_leifeng', landmarkName: '平湖东湖报本塔九峰亭', badgeTag: '金平湖服装城' },
  '330421': { kind: 'floating_water_market', landmarkName: '嘉善西塘古镇烟雨长廊', badgeTag: '千年水乡西塘' },
  '330521': { kind: 'smart_science_twin_towers', landmarkName: '德清地理信息莫干山居', badgeTag: '莫干洋家乐乡' },
  '330522': { kind: 'tea_house_heritage', landmarkName: '长兴大唐贡茶院紫笋阁', badgeTag: '新能源电池城' },
  '330503': { kind: 'ancient_water_wharf', landmarkName: '南浔百间楼小莲庄水巷', badgeTag: '江南丝商巨镇' },
  '330681': { kind: 'tengwang_yueyang_tower', landmarkName: '诸暨西施殿与枫桥驿馆', badgeTag: '珍珠袜业枫桥' },
  '330603': { kind: 'floating_water_market', landmarkName: '柯桥安昌古镇廊棚船市', badgeTag: '安昌古镇水市' },
  '330624': { kind: 'grotto_cliff_buddha', landmarkName: '新昌大佛寺南朝石窟阁', badgeTag: '浙东唐诗之路' },
  '330824': { kind: 'bamboo_courtyard_library', landmarkName: '开化根宫佛国钱江源馆', badgeTag: '钱江源生态县' },
  '331023': { kind: 'yingxian_timber_pagoda', landmarkName: '天台国清寺千年隋代塔', badgeTag: '佛宗道源和合' },
  '331024': { kind: 'dujiangyan_temple_weir', landmarkName: '仙居神仙居如意凌空桥', badgeTag: '杨梅康养仙境' },
  '331081': { kind: 'volcanic_stone_village', landmarkName: '温岭石塘海滨石屋曙光', badgeTag: '千年曙光渔港' },
  '331121': { kind: 'bund_shikumen', landmarkName: '青田石雕博物与欧陆街', badgeTag: '石雕侨乡咖啡' },
  '331124': { kind: 'cliffside_tea_terraces', landmarkName: '松阳大木山云雾阶梯茶海', badgeTag: '浙南云雾梯茶海' },
  '331127': { kind: 'dong_drum_tower', landmarkName: '景宁畲乡之窗凤凰飞檐', badgeTag: '中国畲乡祖庭' },
  '330122': { kind: 'bamboo_raft_karst_pier', landmarkName: '桐庐富春江山水竹筏码头', badgeTag: '富春江峰林竹筏' },
  '330112': { kind: 'wufeng_academy_cliff', landmarkName: '临安天目山禅源古刹阁', badgeTag: '吴越钱王故里' },
  '330182': { kind: 'pingyao_city_gate', landmarkName: '建德严州古城梅城澄门', badgeTag: '新安江清凉水' },
  '330105': { kind: 'covered_bridge_pavilion', landmarkName: '大运河拱宸桥三孔石拱', badgeTag: '千年运河商贸极' },
  '330108': { kind: 'modern_civic_opera', landmarkName: '奥体大莲花与滨江科创', badgeTag: '数字经济高新区' },
  '330109': { kind: 'modern_civic_opera', landmarkName: '跨湖桥遗址与湘湖展馆', badgeTag: '民营智造百强区' },
  '330111': { kind: 'bamboo_courtyard_library', landmarkName: '富春山居公望美术石馆', badgeTag: '黄公望山水画卷' },
  '330113': { kind: 'modern_civic_opera', landmarkName: '临平大剧院与艺尚小镇', badgeTag: '江南运河智造城' },
  '330114': { kind: 'smart_science_twin_towers', landmarkName: '金沙湖畔高教科创双塔', badgeTag: '杭州医药湾智城' },
  '330203': { kind: 'dongyang_luzhai_mansion', landmarkName: '天一阁百年藏书古木楼', badgeTag: '书香天一百年府' },
  '330205': { kind: 'bund_shikumen', landmarkName: '老外滩钟楼与慈城古县', badgeTag: '开埠外滩千年县' },
  '330206': { kind: 'automated_deepwater_port_crane', landmarkName: '北仑穿山自动化深水桥吊', badgeTag: '世界大港自动化港' },
  '330211': { kind: 'pingyao_city_gate', landmarkName: '招宝山威远城海防古关', badgeTag: '东方海防商帮源' },
  '330303': { kind: 'pingyao_city_gate', landmarkName: '永昌堡抗倭古石城门楼', badgeTag: '浙南高新航空港' },
  '330304': { kind: 'tea_house_heritage', landmarkName: '泽雅千年纸山古水碓屋', badgeTag: '温州高校眼镜城' },
  '330305': { kind: 'island_wind_turbine_bay', landmarkName: '洞头百岛离岸风机海湾廊', badgeTag: '百岛海上风电湾' },
  '330327': { kind: 'tidal_estuary_sluice_bridge', landmarkName: '苍南鳌江口挡潮闸桥与海堤群', badgeTag: '浙南山海潮汐堤' },
  '330328': { kind: 'confucian_temple_qufu', landmarkName: '刘基庙红墙古殿飞檐阁', badgeTag: '伯温故里侨乡县' },
  '330383': { kind: 'yiwu_tradecity_jiming', landmarkName: '龙港印艺新城与农民馆', badgeTag: '中国第一农民城' },
  '330411': { kind: 'covered_bridge_pavilion', landmarkName: '长虹古石拱桥与运河坊', badgeTag: '湿地水乡光伏城' },
  '330424': { kind: 'tidal_estuary_sluice_bridge', landmarkName: '海盐鱼鳞石海塘与潮汐挡潮闸', badgeTag: '百年鱼鳞石海塘' },
  '330502': { kind: 'west_lake_leifeng', landmarkName: '飞英千年塔中塔与太湖', badgeTag: '丝绸笔都南太湖' },
  '330604': { kind: 'tidal_estuary_sluice_bridge', landmarkName: '上虞曹娥江大闸潮汐挡潮闸桥', badgeTag: '中华第一河口闸' },
  '330683': { kind: 'classical_wood_opera_stage', landmarkName: '嵊州越剧小镇雕花木构古戏台', badgeTag: '越剧故里古戏台' },
  '330802': { kind: 'confucian_temple_qufu', landmarkName: '衢州南宗孔庙红墙大殿', badgeTag: '东南阙里礼仪城' },
  '330881': { kind: 'red_sandstone_danxia_arch', landmarkName: '江山江郎山丹霞赤壁三峰', badgeTag: '浙西丹霞三爿岩' },
  '330903': { kind: 'volcanic_basalt_sea_stack', landmarkName: '普陀朱家尖海蚀岩柱与石崖壁', badgeTag: '舟山海蚀礁柱崖' },
  '331002': { kind: 'maritime_lighthouse_harbor', landmarkName: '椒江海门卫灯塔与老街', badgeTag: '台州湾医药中心' },
  '331003': { kind: 'wanfo_pagoda_plaza', landmarkName: '黄岩九峰宝塔与永宁江', badgeTag: '中国模具橘乡区' },
  '331083': { kind: 'sea_crossing_cable_bridge', landmarkName: '乐清湾跨海桥与大麦屿', badgeTag: '东海阀门汽配城' },
  '331102': { kind: 'ancient_stone_aqueduct_weir', landmarkName: '丽水通济堰拱形石坝水闸', badgeTag: '千年通济石拱堰' },
  '331122': { kind: 'wufeng_academy_cliff', landmarkName: '仙都鼎湖峰与黄帝祠宇', badgeTag: '轩辕黄帝烧饼城' },
  '330803': { kind: 'confucian_temple_qufu', landmarkName: '衢江杨继洲针灸祠堂', badgeTag: '中华针灸康养区' },
  '330822': { kind: 'karst_stone_watchtower', landmarkName: '常山三衢石林喀斯特', badgeTag: '中国胡柚油茶乡' },
  '330825': { kind: 'dunhuang_mogao_nine', landmarkName: '龙游石窟地下奇观殿', badgeTag: '千年商帮龙游石窟' },
  '330921': { kind: 'coastal_salt_pan_pyramid', landmarkName: '岱山海岛古盐田银盐垛', badgeTag: '东海贡盐海岛田' },
  '330922': { kind: 'island_wind_turbine_bay', landmarkName: '嵊泗列岛离岸风机海湾阵', badgeTag: '东海离岸风电湾' },
  '331004': { kind: 'ancient_water_wharf', landmarkName: '路桥十里长街福星桥', badgeTag: '浙东商贸汽车城' },
  '331022': { kind: 'karst_stone_watchtower', landmarkName: '三门蛇蟠岛千年石窟', badgeTag: '中国青蟹海上核' },
  '331123': { kind: 'tea_house_heritage', landmarkName: '遂昌汤显祖纪念古院', badgeTag: '牡丹亭成稿竹炭' },
  '331125': { kind: 'terraced_rice_pavilion', landmarkName: '云和梅源梯田观云阁', badgeTag: '中国木制玩具乡' },
  '331126': { kind: 'covered_bridge_pavilion', landmarkName: '庆元兰溪桥古木廊桥', badgeTag: '世界香菇廊桥乡' },

  // === 安徽省 ===
  '340104': { kind: 'smart_science_twin_towers', landmarkName: '合肥科学岛与大蜀山科创塔', badgeTag: '科创量子走廊' },
  '340111': { kind: 'tengwang_yueyang_tower', landmarkName: '包河包公祠与清风阁', badgeTag: '包公清风江淮楼' },
  '340882': { kind: 'wanfo_pagoda_plaza', landmarkName: '潜山天柱山三祖寺古塔', badgeTag: '皖山禅宗古塔' },
  '341002': { kind: 'huizhou_matouqiang', landmarkName: '屯溪老街徽派马头墙', badgeTag: '三江口徽商老街' },
  '341021': { kind: 'memorial_archway_paifang', landmarkName: '歙县古城许国八脚石坊', badgeTag: '徽州府衙牌坊' },
  '341023': { kind: 'huizhou_matouqiang', landmarkName: '黟县宏村月沼徽派倒影', badgeTag: '画里乡村牛形村' },
  '341823': { kind: 'bamboo_courtyard_library', landmarkName: '泾县中国宣纸文化园', badgeTag: '宣纸徽墨非遗' },
  '340881': { kind: 'confucian_temple_qufu', landmarkName: '桐城六尺巷与千年文庙', badgeTag: '礼让桐城文派' },
  '341126': { kind: 'tiananmen_gatehouse', landmarkName: '凤阳明中都皇城午门阙', badgeTag: '大包干明故都' },
  '340422': { kind: 'ancient_stone_aqueduct_weir', landmarkName: '寿县芍陂安丰塘古蓄水堰', badgeTag: '天下第一塘古堰' },
  '341022': { kind: 'huizhou_matouqiang', landmarkName: '休宁齐云山月华天街居', badgeTag: '中国第一状元' },
  '341024': { kind: 'tea_house_heritage', landmarkName: '祁门百年红茶老作坊阁', badgeTag: '世界祁门红茶' },
  '341824': { kind: 'dongyang_luzhai_mansion', landmarkName: '绩溪龙川胡氏宗祠木雕', badgeTag: '徽菜徽墨之乡' },
  '340828': { kind: 'wufeng_academy_cliff', landmarkName: '岳西司空山二祖禅宗寺', badgeTag: '大别山避暑乡' },
  '341524': { kind: 'red_revolution_memorial', landmarkName: '金寨大别山红军广场塔', badgeTag: '大别山将军县' },
  '341723': { kind: 'potala_palace_fortress', landmarkName: '青阳九华山化城寺金殿', badgeTag: '地藏佛教名山' },
  '341602': { kind: 'classical_wood_opera_stage', landmarkName: '亳州花戏楼彩绘木雕戏台', badgeTag: '天下第一花戏楼' },
  '341322': { kind: 'confucian_temple_qufu', landmarkName: '萧县皇藏峪汉风古禅林', badgeTag: '中国书画之乡' },
  '340521': { kind: 'tengwang_yueyang_tower', landmarkName: '当涂采石矶太白楼悬崖', badgeTag: '诗仙太白终老' },
  '340181': { kind: 'west_lake_leifeng', landmarkName: '巢湖姥山岛七层文峰塔', badgeTag: '八百里大巢湖' },
  '341882': { kind: 'bamboo_sea_watchtower', landmarkName: '广德笄山竹海太极观涛阁', badgeTag: '长三角竹乡门' },
  '340123': { kind: 'covered_bridge_pavilion', landmarkName: '肥西三河古镇鹊渚廊桥', badgeTag: '安徽百强首县' },
  '340102': { kind: 'industrial_heritage_loft', landmarkName: '合钢老工业基地文创园', badgeTag: '江淮工业老城核' },
  '340103': { kind: 'bayong_lou', landmarkName: '逍遥津逍遥阁与明教寺', badgeTag: '千年庐州主城芯' },
  '340122': { kind: 'ancestral_taiji_hall', landmarkName: '肥东撮街古建与包公祠', badgeTag: '江淮百强新工业' },
  '340202': { kind: 'bund_shikumen', landmarkName: '芜湖老海关钟楼与洋楼', badgeTag: '江南米市开埠城' },
  '340207': { kind: 'huizhou_matouqiang', landmarkName: '鸠兹古镇徽派水街墙群', badgeTag: '江北机器人高新' },
  '340503': { kind: 'industrial_heritage_loft', landmarkName: '马钢工业遗址红砖高炉', badgeTag: '江东诗城钢铁城' },
  '341881': { kind: 'bamboo_courtyard_library', landmarkName: '宁国恩龙木屋与竹海阁', badgeTag: '耐磨铸件百强县' },
  '340281': { kind: 'confucian_temple_qufu', landmarkName: '无为米公祠碑廊与古刹', badgeTag: '全国特种电缆都' },
  '341181': { kind: 'ancient_water_wharf', landmarkName: '天长龙岗古镇与高邮湖', badgeTag: '皖东仪器仪表城' },
  '341502': { kind: 'memorial_archway_paifang', landmarkName: '金安皋陶文庙千年石坊', badgeTag: '皖西羽绒茶香城' },
  '340121': { kind: 'red_revolution_memorial', landmarkName: '长丰北乡支部纪念馆', badgeTag: '草莓产业百强县' },
  '340124': { kind: 'bayong_lou', landmarkName: '庐江周瑜故里聚星楼', badgeTag: '周瑜故里汤池泉' },
  '340209': { kind: 'smart_science_twin_towers', landmarkName: '芜湖高新科创江湾塔', badgeTag: '奇瑞智造科教区' },
  '340302': { kind: 'tengwang_yueyang_tower', landmarkName: '蚌埠龙子湖南北分界', badgeTag: '淮河明珠南北界' },
  '340405': { kind: 'confucian_temple_qufu', landmarkName: '八公山豆腐祖庭汉阙', badgeTag: '淮南王刘安豆腐' },
  '340523': { kind: 'confucian_temple_qufu', landmarkName: '和县乌江项羽霸王祠', badgeTag: '陋室铭乌江蔬菜' },
  '340802': { kind: 'wanfo_pagoda_plaza', landmarkName: '安庆迎江寺千年振风塔', badgeTag: '万里长江第一塔' },
  '341003': { kind: 'wufeng_academy_cliff', landmarkName: '黄山光明顶迎客松崖', badgeTag: '世界双遗太平茶' },
  '341102': { kind: 'tea_house_heritage', landmarkName: '滁州琅琊山醉翁古亭', badgeTag: '醉翁之意千年亭' },
  '341202': { kind: 'west_lake_leifeng', landmarkName: '阜阳文峰塔与颍州西湖', badgeTag: '欧苏遗韵淮粮仓' },
  '341321': { kind: 'tea_house_heritage', landmarkName: '砀山梨树王故道观阁', badgeTag: '中国酥梨故道乡' },
  '341621': { kind: 'confucian_temple_qufu', landmarkName: '涡阳天静宫道家祖庭', badgeTag: '老子故里苔干乡' },
  '340210': { kind: 'covered_bridge_pavilion', landmarkName: '芜湖青弋江陶辛水韵古桥', badgeTag: '江南航空水乡' },
  '340212': { kind: 'industrial_heritage_loft', landmarkName: '繁昌人字洞与宋代青白窑', badgeTag: '江南古窑智造' },
  '340321': { kind: 'wufeng_academy_cliff', landmarkName: '怀远涂山禹王宫石榴古殿', badgeTag: '大禹治水玉榴' },
  '340421': { kind: 'floating_solar_reservoir_array', landmarkName: '凤台沉陷水域漂浮光伏电站阵', badgeTag: '淮畔沉陷湖绿电' },
  '340522': { kind: 'tiananmen_gatehouse', landmarkName: '含山凌家滩玉器史前圣坛', badgeTag: '五千年凌家滩' },
  '340621': { kind: 'grand_canal_granary', landmarkName: '濉溪柳孜运河唐宋码头仓', badgeTag: '大运河柳孜仓' },
  '340722': { kind: 'confucian_temple_qufu', landmarkName: '枞阳桐城派浮山摩崖书院', badgeTag: '文风枞阳汉武' },
  '340825': { kind: 'wufeng_academy_cliff', landmarkName: '太湖花亭湖西风禅寺古阁', badgeTag: '禅宗二祖湖城' },
  '340826': { kind: 'bayong_lou', landmarkName: '宿松小孤山长江绝壁飞阁', badgeTag: '万里长江绝壁' },
  '341004': { kind: 'huizhou_matouqiang', landmarkName: '徽州呈坎八卦古村马头墙', badgeTag: '中国风水第一' },
  '341124': { kind: 'confucian_temple_qufu', landmarkName: '全椒吴敬梓故居儒林宗祠', badgeTag: '儒林外史故里' },
  '341226': { kind: 'jiangnan_gardens_gate', landmarkName: '颍上八里河管仲水韵名园', badgeTag: '管子故里湿地' },
  '341523': { kind: 'ancient_stone_aqueduct_weir', landmarkName: '舒城七门堰汉代古石堰渠', badgeTag: '汉代七门三堰渠' },
  '341722': { kind: 'diaojiaolou_stilt', landmarkName: '石台牯牛降富硒山乡木楼', badgeTag: '中国原生态乡' },
  '341825': { kind: 'huizhou_matouqiang', landmarkName: '旌德江村朱旺井水街古墙', badgeTag: '灵芝慢城徽韵' },
  '340223': { kind: 'industrial_heritage_loft', landmarkName: '南陵大工山古铜矿遗址', badgeTag: '江左千年古铜冶' },
  '340304': { kind: 'tiananmen_gatehouse', landmarkName: '禹会村大禹会诸侯古台', badgeTag: '大禹治水会盟地' },
  '340322': { kind: 'ancient_water_wharf', landmarkName: '五河五水汇流沱湖古埠', badgeTag: '淮河蟹都湿地乡' },
  '340403': { kind: 'modern_civic_opera', landmarkName: '田家庵春申湖奥体剧院', badgeTag: '淮河能源中心城' },
  '340504': { kind: 'yellow_crane_tower', landmarkName: '雨山采石矶翠螺太白楼', badgeTag: '长江三大名矶首' },
  '340603': { kind: 'wufeng_academy_cliff', landmarkName: '相山显通寺乾隆碑刻阁', badgeTag: '相山古刹煤城芯' },
  '340705': { kind: 'industrial_heritage_loft', landmarkName: '铜官山1978矿工文创园', badgeTag: '中国古铜都核心' },
  '340803': { kind: 'wanfo_pagoda_plaza', landmarkName: '大观迎江寺振风万里塔', badgeTag: '万里长江第一塔' },
  '340822': { kind: 'dongyang_luzhai_mansion', landmarkName: '怀宁石牌京黄戏曲古院', badgeTag: '黄梅戏京剧鼻祖' },
  '341122': { kind: 'memorial_archway_paifang', landmarkName: '来安半塔保卫战纪念坊', badgeTag: '皖东抗战红色城' },
  '341125': { kind: 'ancient_post_station', landmarkName: '定远池河古驿明文化城', badgeTag: '江淮明代古驿' },
  '341222': { kind: 'confucian_temple_qufu', landmarkName: '太和千年文庙大成古殿', badgeTag: '中华医药集散城' },
  '341525': { kind: 'hydroelectric_arch_dam', landmarkName: '霍山佛子岭连拱大坝堰', badgeTag: '新中国第一大坝' },
  '341622': { kind: 'confucian_temple_qufu', landmarkName: '蒙城庄子祠逍遥堂古院', badgeTag: '道家亚圣庄周里' },
  '341702': { kind: 'tea_house_heritage', landmarkName: '贵池杏花村牧童古茶亭', badgeTag: '千载诗城杏花村' },
  '340303': { kind: 'red_revolution_memorial', landmarkName: '蚌山渡江战役总前委旧址', badgeTag: '淮河珠城南北界' },
  '340311': { kind: 'ancient_water_wharf', landmarkName: '淮上淮河古渡与三汊湿地', badgeTag: '皖北冷链物流芯' },
  '340323': { kind: 'pingyao_city_gate', landmarkName: '固镇垓下汉楚古战场城垣', badgeTag: '霸王别姬垓下城' },
  '340402': { kind: 'industrial_heritage_loft', landmarkName: '大通九龙岗百年煤矿红楼', badgeTag: '百年煤海纪念地' },
  '340404': { kind: 'industrial_heritage_loft', landmarkName: '谢家集百年矿业春申园坊', badgeTag: '淮南煤矿工业源' },
  '340406': { kind: 'floating_solar_reservoir_array', landmarkName: '潘集采煤沉陷湖水面漂浮光伏', badgeTag: '水面漂浮光伏极' },
  '340506': { kind: 'industrial_heritage_loft', landmarkName: '博望横山刃具机床智造园', badgeTag: '中国刃具第一镇' },
  '340602': { kind: 'floating_solar_reservoir_array', landmarkName: '杜集南湖采煤沉陷漂浮光伏站', badgeTag: '皖北矿湖漂浮电' },
  '340604': { kind: 'porcelain_dragon_kiln', landmarkName: '烈山宋代古瓷窑址博物坊', badgeTag: '淮北古窑软籽石' },
  '340706': { kind: 'ancient_water_wharf', landmarkName: '义安大通千年古镇水码头', badgeTag: '江南铜都鱼米镇' },
  '340711': { kind: 'sea_crossing_cable_bridge', landmarkName: '铜陵长江公铁大桥江岸塔', badgeTag: '皖江跨江通道港' },
  '340811': { kind: 'red_revolution_memorial', landmarkName: '宜秀独秀园纪念牌楼松柏', badgeTag: '安庆新文化运动' },
  '340827': { kind: 'ancient_water_wharf', landmarkName: '望江古雷池渡口望江楼', badgeTag: '不敢越雷池故地' },
  '341103': { kind: 'tea_house_heritage', landmarkName: '南谯皇甫山森林茶亭古院', badgeTag: '江淮分水岭生态' },
  '341182': { kind: 'volcanic_stone_village', landmarkName: '明光女山湖古火山地质门', badgeTag: '皖东艾草凹凸棒' },
  '341203': { kind: 'dongyang_luzhai_mansion', landmarkName: '颍东程文炳清代将军宅院', badgeTag: '皖北铁路编组核' },
  '341204': { kind: 'ancient_water_wharf', landmarkName: '颍泉泉水古渡与生态湖湾', badgeTag: '阜阳城北交通门' },
  '341221': { kind: 'tiananmen_gatehouse', landmarkName: '临泉姜尚封神台古祭坛阙', badgeTag: '中华姜尚文化乡' },
  '341225': { kind: 'hydroelectric_arch_dam', landmarkName: '阜南淮河王家坝抗洪闸坝', badgeTag: '千里淮河第一闸' },
  '341282': { kind: 'porcelain_dragon_kiln', landmarkName: '界首三彩刻花古陶窑艺坊', badgeTag: '皖北小上海彩陶' },
  '341302': { kind: 'grand_canal_granary', landmarkName: '埇桥隋唐大运河古汴水仓', badgeTag: '中国烧鸡符离集' },
  '341323': { kind: 'jiangnan_gardens_gate', landmarkName: '灵璧奇石园与虞姬文化亭', badgeTag: '天下第一石灵璧' },
  '341324': { kind: 'grand_canal_granary', landmarkName: '泗县隋唐大运河通济渠仓', badgeTag: '世界遗产运河县' },
  '341503': { kind: 'red_revolution_memorial', landmarkName: '裕安独山六霍起义旧址群', badgeTag: '大别山苏维埃城' },
  '341504': { kind: 'yiwu_tradecity_jiming', landmarkName: '叶集大别山家居建材商贸', badgeTag: '皖豫门户家居城' },
  '341522': { kind: 'shanxi_courtyard_jinshang', landmarkName: '霍邱李氏庄园清代砖雕院', badgeTag: '淮河之滨鹅肥肝' },
  '341623': { kind: 'ancient_water_wharf', landmarkName: '利辛西淝河湿地古渡亭阁', badgeTag: '皖北黄牛生态乡' },
  '341721': { kind: 'huizhou_matouqiang', landmarkName: '东至周氏纸坑山马头墙院', badgeTag: '百年周氏家风乡' },
  '341802': { kind: 'bayong_lou', landmarkName: '宣州谢朓楼与敬亭太白阁', badgeTag: '江南诗山文房四' },
  '341821': { kind: 'ancient_water_wharf', landmarkName: '郎溪南漪湖古渡与侯国街', badgeTag: '皖苏浙黄金三角' },

  // === 福建省 ===
  '350102': { kind: 'minnan_swallowtail_qilou', landmarkName: '福州三坊七巷马鞍墙院', badgeTag: '三坊七巷闽都魂' },
  '350203': { kind: 'bund_shikumen', landmarkName: '鼓浪屿八卦楼红穹顶', badgeTag: '海上花园万国楼' },
  '350502': { kind: 'dali_three_pagodas', landmarkName: '泉州开元寺东西镇国双石塔', badgeTag: '刺桐海丝双塔' },
  '350524': { kind: 'cliffside_tea_terraces', landmarkName: '安溪铁观音高山云雾茶园', badgeTag: '铁观音云雾梯茶' },
  '350582': { kind: 'minnan_swallowtail_qilou', landmarkName: '晋江五店市闽南红砖古厝', badgeTag: '晋江品牌红砖厝' },
  '350782': { kind: 'cliffside_tea_terraces', landmarkName: '武夷山燕子窠岩茶崖梯田', badgeTag: '双世遗岩茶崖梯' },
  '350803': { kind: 'fujian_tulou_round', landmarkName: '永定振成楼客家圆土楼', badgeTag: '世界遗产土楼王' },
  '350526': { kind: 'ceramic_dragon_kiln_chimney', landmarkName: '德化屈斗宫古龙窑棚与窑烟囱', badgeTag: '世界瓷都德化窑' },
  '350821': { kind: 'pingyao_city_gate', landmarkName: '长汀汀州古城墙济川门', badgeTag: '客家首府红城' },
  '350823': { kind: 'red_revolution_memorial', landmarkName: '上杭古田会议会址庄院', badgeTag: '古田红色圣地' },
  '350825': { kind: 'minnan_swallowtail_qilou', landmarkName: '连城培田古村燕尾宗祠', badgeTag: '客家民间故宫' },
  '350429': { kind: 'red_sandstone_danxia_arch', landmarkName: '泰宁大金湖丹霞赤壁天桥', badgeTag: '水上丹霞赤壁拱' },
  '350921': { kind: 'maritime_lighthouse_harbor', landmarkName: '霞浦北岐滩涂海湾灯塔', badgeTag: '闽东滩涂摄影' },
  '350982': { kind: 'volcanic_basalt_sea_stack', landmarkName: '福鼎台山岛海蚀柱与火山岸壁', badgeTag: '东海玄武海蚀柱' },
  '350626': { kind: 'mangrove_bird_boardwalk', landmarkName: '东山红树林湿地观鸟栈道', badgeTag: '海峡风动红树湾' },
  '350627': { kind: 'fujian_tulou_round', landmarkName: '南靖田螺坑五座圆土楼', badgeTag: '世遗土楼奇观' },
  '350521': { kind: 'volcanic_stone_village', landmarkName: '惠安崇武石砌海防古城', badgeTag: '世界石雕之都' },
  '350405': { kind: 'tea_house_heritage', landmarkName: '沙县俞邦村古街寻味坊', badgeTag: '国民小吃之都' },
  '350128': { kind: 'island_wind_turbine_bay', landmarkName: '平潭长江澳岛风机海湾廊', badgeTag: '海岛风车海湾廊' },
  '350426': { kind: 'confucian_temple_qufu', landmarkName: '尤溪南溪书院朱熹讲堂', badgeTag: '理学宗师故里' },
  '350525': { kind: 'minnan_swallowtail_qilou', landmarkName: '永春五里古街红砖骑楼', badgeTag: '白鹤拳香醋乡' },
  '350581': { kind: 'maritime_lighthouse_harbor', landmarkName: '石狮洛伽寺海上观音灯', badgeTag: '海丝服装名城' },
  '350181': { kind: 'wanfo_pagoda_plaza', landmarkName: '福清瑞云塔与石竹仙山', badgeTag: '侨乡玻纤制造' },
  '350103': { kind: 'bund_shikumen', landmarkName: '上下杭三捷河百年商馆', badgeTag: '闽商文化古渡街' },
  '350104': { kind: 'bund_shikumen', landmarkName: '烟台山百年领事洋楼群', badgeTag: '万国建筑学府区' },
  '350105': { kind: 'industrial_heritage_loft', landmarkName: '中国船政百年船坞厂房', badgeTag: '近代海军摇篮港' },
  '350112': { kind: 'volcanic_basalt_sea_stack', landmarkName: '长乐金刚腿海蚀礁柱与石崖壁', badgeTag: '闽江口海蚀礁壁' },
  '350121': { kind: 'bamboo_courtyard_library', landmarkName: '旗山福州大学城书院群', badgeTag: '首邑青红大学城' },
  '350205': { kind: 'automated_deepwater_port_crane', landmarkName: '海沧远海全自动化集装箱港', badgeTag: '智慧远海自动化港' },
  '350206': { kind: 'industrial_heritage_loft', landmarkName: '厦门特区老厂房文创园', badgeTag: '鹭岛特区发祥地' },
  '350211': { kind: 'minnan_swallowtail_qilou', landmarkName: '集美学村嘉庚燕尾红楼', badgeTag: '华侨旗帜学村城' },
  '350212': { kind: 'confucian_temple_qufu', landmarkName: '同安千年文庙红墙大殿', badgeTag: '银城古城半导体' },
  '350213': { kind: 'sea_crossing_cable_bridge', landmarkName: '翔安大桥跨海门户飞虹', badgeTag: '厦金门户新机场' },
  '350302': { kind: 'ancient_stone_aqueduct_weir', landmarkName: '莆田木兰陂宋代拒咸石堰', badgeTag: '宋代木兰陂古堰' },
  '350305': { kind: 'minnan_swallowtail_qilou', landmarkName: '湄洲妈祖祖庙海天飞檐', badgeTag: '海上女神妈祖圣' },
  '350503': { kind: 'modern_civic_opera', landmarkName: '泉州东海海丝文化中心', badgeTag: '海丝都市核心区' },
  '350583': { kind: 'minnan_swallowtail_qilou', landmarkName: '蔡氏古民居红砖燕尾群', badgeTag: '海丝石材水暖城' },
  '350602': { kind: 'minnan_swallowtail_qilou', landmarkName: '漳州古城红砖骑楼老街', badgeTag: '水仙花海古城芯' },
  '350981': { kind: 'memorial_archway_paifang', landmarkName: '廉村千年进士古石牌坊', badgeTag: '按摩器具电机城' },
  '350111': { kind: 'wanfo_pagoda_plaza', landmarkName: '福州鼓山涌泉寺陶塔', badgeTag: '福州市肺生态区' },
  '350125': { kind: 'fujian_tulou_round', landmarkName: '永泰爱荆庄防御庄寨', badgeTag: '中国李梅庄寨乡' },
  '350303': { kind: 'bund_shikumen', landmarkName: '涵江萝苜田南洋老街', badgeTag: '东方威尼斯侨港' },
  '350322': { kind: 'dongyang_luzhai_mansion', landmarkName: '仙游红木古典工艺馆', badgeTag: '中国古典工艺都' },
  '350404': { kind: 'bamboo_courtyard_library', landmarkName: '三明万寿岩史前遗址', badgeTag: '全国林改发源芯' },
  '350604': { kind: 'minnan_swallowtail_qilou', landmarkName: '龙海埭美水上古厝群', badgeTag: '月港海丝食品城' },
  '350623': { kind: 'volcanic_basalt_sea_stack', landmarkName: '漳浦南碇岛火山玄武岩海蚀柱', badgeTag: '滨海玄武岩柱林' },
  '350703': { kind: 'ceramic_dragon_kiln_chimney', landmarkName: '建阳水吉建盏百年斜坡龙窑棚', badgeTag: '宋代建盏古龙窑' },
  '350923': { kind: 'covered_bridge_pavilion', landmarkName: '屏南万安桥宋代廊桥', badgeTag: '中国古廊桥菌菇' },
  '350424': { kind: 'hakka_weilongwu', landmarkName: '宁化石壁客家祖地宗祠围', badgeTag: '世界客家祖地' },
  '350428': { kind: 'subterranean_karst_cavern_hall', landmarkName: '将乐玉华洞石笋穹顶与暗河道', badgeTag: '闽山名洞玉华洞' },
  '350481': { kind: 'karst_stone_watchtower', landmarkName: '永安安贞堡客家方形古堡', badgeTag: '抗战文化笋都' },
  '350504': { kind: 'covered_bridge_pavilion', landmarkName: '洛江洛阳桥宋代跨海石桥', badgeTag: '海丝第一石桥' },
  '350624': { kind: 'fujian_tulou_round', landmarkName: '诏安在田楼闽南八角土楼', badgeTag: '中国书画青梅' },
  '350628': { kind: 'fujian_tulou_round', landmarkName: '平和绳武楼林语堂故居圆', badgeTag: '蜜柚世遗土楼' },
  '350629': { kind: 'fujian_tulou_round', landmarkName: '华安二宜楼大地土楼王寨', badgeTag: '世遗大地土楼' },
  '350725': { kind: 'tea_house_heritage', landmarkName: '政和白茶古廊桥楠木茶阁', badgeTag: '中国白茶竹乡' },
  '350783': { kind: 'confucian_temple_qufu', landmarkName: '建瓯千年建州文庙东岳殿', badgeTag: '千年建州笋都' },
  '350824': { kind: 'hakka_weilongwu', landmarkName: '武平梁野山客家围龙古村', badgeTag: '全国林改首县' },
  '350924': { kind: 'covered_bridge_pavilion', landmarkName: '寿宁鸾峰桥木拱廊桥奇观', badgeTag: '中国木拱廊桥' },
  '350925': { kind: 'covered_bridge_pavilion', landmarkName: '周宁鲤鱼溪古廊桥护鱼村', badgeTag: '高山云端避暑' },
  '350122': { kind: 'volcanic_basalt_sea_stack', landmarkName: '连江平流尾火山海蚀石林岸壁', badgeTag: '东海海蚀石林崖' },
  '350123': { kind: 'wufeng_academy_cliff', landmarkName: '罗源陈太尉宫宋构古殿', badgeTag: '畲族风情深水港' },
  '350124': { kind: 'minnan_swallowtail_qilou', landmarkName: '闽清宏琳厝清代古大厝', badgeTag: '全国最大单体厝' },
  '350304': { kind: 'dujiangyan_temple_weir', landmarkName: '荔城木兰陂宋代拒咸堰', badgeTag: '世界灌溉工程陂' },
  '350425': { kind: 'karst_stone_watchtower', landmarkName: '大田琵琶堡土堡古寨门', badgeTag: '中国高山茶土堡' },
  '350430': { kind: 'red_revolution_memorial', landmarkName: '建宁红军总司令部古院', badgeTag: '闽江正源莲子乡' },
  '350527': { kind: 'minnan_swallowtail_qilou', landmarkName: '金门莒光楼水头红砖厝', badgeTag: '闽南红砖侨乡岛' },
  '350603': { kind: 'minnan_swallowtail_qilou', landmarkName: '龙文湘桥红砖燕尾古厝', badgeTag: '闽南水乡花果城' },
  '350702': { kind: 'tengwang_yueyang_tower', landmarkName: '延平九峰双溪交汇飞阁', badgeTag: '闽江源头山水城' },
  '350781': { kind: 'memorial_archway_paifang', landmarkName: '邵武和平古镇大夫第坊', badgeTag: '闽北理学铁城邑' },
  '350802': { kind: 'covered_bridge_pavilion', landmarkName: '新罗文川桥登高古阁楼', badgeTag: '闽西中心红古田' },
  '350902': { kind: 'ancient_water_wharf', landmarkName: '蕉城霍童古镇溪岸老街', badgeTag: '宁德锂电三都澳' },
  '350421': { kind: 'wufeng_academy_cliff', landmarkName: '明溪玉虚洞丹崖生态观', badgeTag: '海峡西岸观鸟乡' },
  '350423': { kind: 'red_revolution_memorial', landmarkName: '清流林畲红军旧居纪念馆', badgeTag: '闽西苏区温泉乡' },
  '350505': { kind: 'maritime_lighthouse_harbor', landmarkName: '泉港峰尾海防古城与深水港', badgeTag: '闽南福船海港城' },
  '350605': { kind: 'confucian_temple_qufu', landmarkName: '长泰文庙大成殿状元坊', badgeTag: '闽南状元生态城' },
  '350622': { kind: 'minnan_swallowtail_qilou', landmarkName: '云霄开漳圣王祖庙燕尾殿', badgeTag: '开漳圣王祖地乡' },
  '350721': { kind: 'yingxian_timber_pagoda', landmarkName: '顺昌宝山元代木石大殿', badgeTag: '中国竹荪柑橘乡' },
  '350722': { kind: 'modern_civic_opera', landmarkName: '浦城梦笔山书院与美术馆', badgeTag: '中国丹桂剪纸乡' },
  '350723': { kind: 'jiayuguan_pass_fortress', landmarkName: '光泽杉关闽赣千年古关隘', badgeTag: '武夷西麓生态乡' },
  '350724': { kind: 'ancient_water_wharf', landmarkName: '松溪梅口埠古渡与湛卢山', badgeTag: '湛卢宝剑青瓷乡' },
  '350881': { kind: 'tea_house_heritage', landmarkName: '漳平永福高山台式茶园阁', badgeTag: '大陆阿里山花茶' },
  '350922': { kind: 'minnan_swallowtail_qilou', landmarkName: '古田临水宫古建筑祖庙群', badgeTag: '中国食用菌之都' },
  '350926': { kind: 'dongyang_luzhai_mansion', landmarkName: '柘荣凤岐古民居刀剪非遗', badgeTag: '中国太子参剪纸' },

  // === 江西省 ===
  '360102': { kind: 'tengwang_yueyang_tower', landmarkName: '南昌滕王阁重檐飞阁', badgeTag: '江南三大名楼' },
  '360203': { kind: 'porcelain_dragon_kiln', landmarkName: '景德镇御窑博物馆拱窑群', badgeTag: '千年瓷都御窑' },
  '360483': { kind: 'wufeng_academy_cliff', landmarkName: '庐山白鹿洞书院五老峰', badgeTag: '天下书院之首' },
  '360702': { kind: 'covered_bridge_pavilion', landmarkName: '赣州东河古浮桥与宋城墙', badgeTag: '宋城章贡浮桥' },
  '360881': { kind: 'red_revolution_memorial', landmarkName: '井冈山黄洋界胜利纪念碑', badgeTag: '红色摇篮井冈山' },
  '361027': { kind: 'memorial_archway_paifang', landmarkName: '金溪竹桥古村青石牌坊', badgeTag: '赣东古村香都' },
  '361130': { kind: 'huizhou_matouqiang', landmarkName: '婺源篁岭晒秋徽韵梯云屋', badgeTag: '梯云晒秋最美乡' },
  '360781': { kind: 'red_revolution_memorial', landmarkName: '瑞金叶坪红军烈士塔院', badgeTag: '共和国摇篮城' },
  '360731': { kind: 'covered_bridge_pavilion', landmarkName: '于都中央长征第一渡桥', badgeTag: '长征出发集结' },
  '361124': { kind: 'confucian_temple_qufu', landmarkName: '铅山鹅湖书院朱陆会讲', badgeTag: '中华理学圣殿' },
  '361126': { kind: 'red_sandstone_danxia_arch', landmarkName: '弋阳龟峰丹霞赤壁石拱道', badgeTag: '赣东龟峰赤壁霞' },
  '360222': { kind: 'huizhou_matouqiang', landmarkName: '浮梁瑶里徽韵瓷茶古镇', badgeTag: '瓷茶古县衙门' },
  '360982': { kind: 'bayong_lou', landmarkName: '樟树清江楼阁与药都坊', badgeTag: '中华千年药都' },
  '360925': { kind: 'bamboo_courtyard_library', landmarkName: '靖安宝峰禅林竹院书舍', badgeTag: '白茶生态竹乡' },
  '361128': { kind: 'tengwang_yueyang_tower', landmarkName: '鄱阳湖湿地观鸟水岸阁', badgeTag: '鄱阳湖湿地城' },
  '360424': { kind: 'bayong_lou', landmarkName: '修水南崖黄庭坚文脉楼', badgeTag: '江西诗派宗师' },
  '361030': { kind: 'huizhou_matouqiang', landmarkName: '广昌驿前白莲古村石门', badgeTag: '中国白莲之乡' },
  '360783': { kind: 'fujian_tulou_round', landmarkName: '龙南关西新围客家围屋', badgeTag: '世界围屋之都' },
  '360723': { kind: 'memorial_archway_paifang', landmarkName: '大余梅关古驿道石关坊', badgeTag: '世界钨都古驿' },
  '360725': { kind: 'terraced_rice_pavilion', landmarkName: '崇义上堡梯田古寨木楼', badgeTag: '世界灌溉梯田' },
  '360681': { kind: 'red_sandstone_danxia_arch', landmarkName: '贵溪龙虎山丹霞赤岩象鼻', badgeTag: '泸溪丹霞赤壁拱' },
  '360103': { kind: 'wanfo_pagoda_plaza', landmarkName: '南昌绳金塔与万寿宫街', badgeTag: '豫章故郡千古塔' },
  '360113': { kind: 'smart_science_twin_towers', landmarkName: '红谷滩赣江双子塔天际', badgeTag: '英雄城现代金融' },
  '360121': { kind: 'tea_house_heritage', landmarkName: '凤凰沟生态茶园观光阁', badgeTag: '江西百强首县区' },
  '360302': { kind: 'red_revolution_memorial', landmarkName: '安源路矿纪念馆红砖楼', badgeTag: '中国工人运动源' },
  '360732': { kind: 'red_revolution_memorial', landmarkName: '兴国将军园纪念馆红院', badgeTag: '中华第一将军县' },
  '360730': { kind: 'wufeng_academy_cliff', landmarkName: '翠微峰丹霞石壁一线天', badgeTag: '客家古县红色乡' },
  '360802': { kind: 'confucian_temple_qufu', landmarkName: '白鹭洲书院千年庐陵殿', badgeTag: '文章节义庐陵城' },
  '360402': { kind: 'bamboo_courtyard_library', landmarkName: '九江濂溪书院理学名园', badgeTag: '理学宗师生态城' },
  '360112': { kind: 'tiananmen_gatehouse', landmarkName: '汉代海昏侯国博物院', badgeTag: '西汉列侯考古地' },
  '360423': { kind: 'west_lake_leifeng', landmarkName: '武宁庐山西海沧浪岛', badgeTag: '山水武宁装饰乡' },
  '360429': { kind: 'bayong_lou', landmarkName: '湖口石钟山江天一览', badgeTag: '江湖交汇石钟山' },
  '360502': { kind: 'west_lake_leifeng', landmarkName: '新余仙女湖七仙女阁', badgeTag: '钢铁锂电七夕地' },
  '360602': { kind: 'hsr_modern_hub', landmarkName: '鹰潭高铁枢纽火车城', badgeTag: '华东铁路枢纽城' },
  '360703': { kind: 'dongyang_luzhai_mansion', landmarkName: '南康家居小镇木艺阁', badgeTag: '中国实木家居都' },
  '360822': { kind: 'memorial_archway_paifang', landmarkName: '吉水进士古村文昌坊', badgeTag: '杨万里故里文章' },
  '360902': { kind: 'wufeng_academy_cliff', landmarkName: '明月山月亮之都禅阁', badgeTag: '富硒温泉锂电城' },
  '361002': { kind: 'dongyang_luzhai_mansion', landmarkName: '抚州文昌里汤显祖阁', badgeTag: '东方戏圣临川才' },
  '361102': { kind: 'confucian_temple_qufu', landmarkName: '上饶信江书院千年堂', badgeTag: '四省通衢光学城' },
  '360428': { kind: 'west_lake_leifeng', landmarkName: '都昌老爷庙鄱阳湖水岸塔', badgeTag: '鄱阳湖百里岸' },
  '360704': { kind: 'hakka_weilongwu', landmarkName: '赣县白鹭古村客家围龙院', badgeTag: '客家摇篮白鹭' },
  '360722': { kind: 'hakka_weilongwu', landmarkName: '信丰大圣寺塔客家围龙院', badgeTag: '中国脐橙之乡' },
  '360728': { kind: 'hakka_weilongwu', landmarkName: '定南虎形围客家方围龙屋', badgeTag: '赣粤门户客家' },
  '360729': { kind: 'hakka_weilongwu', landmarkName: '全南雅溪围屋客家石围楼', badgeTag: '绝美雅溪围屋' },
  '360734': { kind: 'hakka_weilongwu', landmarkName: '寻乌调查旧址客家围龙屋', badgeTag: '东江源寻乌红' },
  '360735': { kind: 'hakka_weilongwu', landmarkName: '石城通天寨客家丹霞石围', badgeTag: '中国白莲丹霞' },
  '360825': { kind: 'confucian_temple_qufu', landmarkName: '永丰欧阳修泷冈阡表碑院', badgeTag: '欧阳修故里城' },
  '360829': { kind: 'wufeng_academy_cliff', landmarkName: '安福武功山金顶高山草甸', badgeTag: '武功山金顶阁' },
  '360981': { kind: 'bayong_lou', landmarkName: '丰城洪州窑与剑匣名楼阁', badgeTag: '丰城剑气百强' },
  '361022': { kind: 'covered_bridge_pavilion', landmarkName: '黎川新丰桥百里明清骑廊', badgeTag: '油画骑楼古镇' },
  '361025': { kind: 'huizhou_matouqiang', landmarkName: '乐安流坑千古第一村古巷', badgeTag: '千古第一古村' },
  '361123': { kind: 'wufeng_academy_cliff', landmarkName: '玉山三清山巨蟒出山道观', badgeTag: '世界自然三清' },
  '360104': { kind: 'jiangnan_gardens_gate', landmarkName: '青云谱八大山人梅湖院', badgeTag: '写意水墨文化区' },
  '360123': { kind: 'huizhou_matouqiang', landmarkName: '安义千年古村群马头墙', badgeTag: '赣派门窗古村群' },
  '360124': { kind: 'tea_house_heritage', landmarkName: '进贤李渡元代烧酒作坊', badgeTag: '中国毛笔白酒乡' },
  '360281': { kind: 'classical_wood_opera_stage', landmarkName: '乐平中国古戏台木雕群', badgeTag: '中国古戏台之乡' },
  '360403': { kind: 'tengwang_yueyang_tower', landmarkName: '浔阳九江浔阳楼锁江阁', badgeTag: '江州司马浔阳城' },
  '360481': { kind: 'industrial_heritage_loft', landmarkName: '瑞昌铜岭商周古铜矿井', badgeTag: '江南最早青铜冶' },
  '360482': { kind: 'smart_science_twin_towers', landmarkName: '共青城科教双塔青年城', badgeTag: '鄱阳湖滨青年城' },
  '360603': { kind: 'dongyang_luzhai_mansion', landmarkName: '余江血防纪念馆雕刻街', badgeTag: '中国血防雕刻乡' },
  '360826': { kind: 'bayong_lou', landmarkName: '泰和快阁赣江登临名楼', badgeTag: '白凤乌鸡快阁城' },
  '360827': { kind: 'tea_house_heritage', landmarkName: '遂川狗牯脑高山古茶楼', badgeTag: '江西名茶金橘乡' },
  '360921': { kind: 'wufeng_academy_cliff', landmarkName: '奉新百丈禅寺天下清规', badgeTag: '天下清规猕猴桃' },
  '360926': { kind: 'hakka_weilongwu', landmarkName: '铜鼓秋收起义纪念馆院', badgeTag: '赣西客家红色县' },
  '361023': { kind: 'dongyang_luzhai_mansion', landmarkName: '南丰琴城古傩戏台宗祠', badgeTag: '中国南丰蜜桔乡' },
  '361103': { kind: 'huizhou_matouqiang', landmarkName: '广丰十都王家大屋天井', badgeTag: '江南最大单屋宅' },
  '361127': { kind: 'tengwang_yueyang_tower', landmarkName: '余干康山大堤鄱湖水阁', badgeTag: '鄱阳湖鱼米古县' },
  '360111': { kind: 'modern_civic_opera', landmarkName: '青山湖艾溪湖湿地文化馆', badgeTag: '江南针织科创城' },
  '360202': { kind: 'porcelain_dragon_kiln', landmarkName: '景德镇古窑民俗青花瓷坊', badgeTag: '活态千年古龙窑' },
  '360313': { kind: 'porcelain_dragon_kiln', landmarkName: '湘东工业陶瓷博览古窑坊', badgeTag: '中国工业陶瓷都' },
  '360321': { kind: 'red_revolution_memorial', landmarkName: '莲花一支枪红色纪念馆院', badgeTag: '湘赣边界红色县' },
  '360322': { kind: 'yingxian_timber_pagoda', landmarkName: '上栗杨岐普通寺禅宗古刹', badgeTag: '中国花炮祖庭乡' },
  '360323': { kind: 'wufeng_academy_cliff', landmarkName: '芦溪武功山金顶古石殿阁', badgeTag: '江南户外云中巅' },
  '360404': { kind: 'jiangnan_gardens_gate', landmarkName: '柴桑陶渊明纪念馆东篱园', badgeTag: '五柳先生故里芯' },
  '360425': { kind: 'ancient_water_wharf', landmarkName: '永修吴城鄱阳湖候鸟古渡', badgeTag: '世界候鸟越冬港' },
  '360426': { kind: 'memorial_archway_paifang', landmarkName: '德安义门陈天下第一家坊', badgeTag: '三千九百义门陈' },
  '360430': { kind: 'karst_stone_watchtower', landmarkName: '彭泽龙宫洞溶洞崖壁亭阁', badgeTag: '陶令彭泽山水乡' },
  '360521': { kind: 'huizhou_matouqiang', landmarkName: '分宜介桥明代古村马头墙', badgeTag: '中国夏布绣发源' },
  '360724': { kind: 'hydroelectric_arch_dam', landmarkName: '上犹陡水湖水电站与森铁', badgeTag: '赣南绿色水电城' },
  '360726': { kind: 'hakka_weilongwu', landmarkName: '安远东生围最大方形围屋', badgeTag: '东江源头赣南脐' },
  '360733': { kind: 'red_revolution_memorial', landmarkName: '会昌风景独好园红军旧址', badgeTag: '风景这边独好地' },
  '360803': { kind: 'confucian_temple_qufu', landmarkName: '青原山阳明书院与净居寺', badgeTag: '庐陵心学名山城' },
  '360821': { kind: 'porcelain_dragon_kiln', landmarkName: '吉安永和宋代吉州窑古坊', badgeTag: '宋代吉州窑文山' },
  '360823': { kind: 'pingyao_city_gate', landmarkName: '峡江玉笥山与赣江巴邱门', badgeTag: '药乡巴邱赣江峡' },
  '360824': { kind: 'modern_civic_opera', landmarkName: '新干大洋洲商代青铜博物', badgeTag: '江南青铜王国源' },
  '360828': { kind: 'pingyao_city_gate', landmarkName: '万安赣江宋代古城墙门楼', badgeTag: '赣江十八滩首县' },
  '360830': { kind: 'red_revolution_memorial', landmarkName: '永新三湾改编纪念馆红院', badgeTag: '支部建在连上地' },
  '360922': { kind: 'ancestral_taiji_hall', landmarkName: '万载田下古城百年宗祠群', badgeTag: '中国花炮夏布城' },
  '360923': { kind: 'red_revolution_memorial', landmarkName: '上高抗日会战纪念碑廊院', badgeTag: '锦江粮仓名胜地' },
  '360924': { kind: 'yingxian_timber_pagoda', landmarkName: '宜丰洞山曹洞宗千年祖庭', badgeTag: '中国竹子长寿乡' },
  '360983': { kind: 'porcelain_dragon_kiln', landmarkName: '高安世界元青花陶瓷博物', badgeTag: '世界元青花宝库' },
  '361003': { kind: 'huizhou_matouqiang', landmarkName: '东乡王安石祖籍古村祠院', badgeTag: '赣东畜牧糖业芯' },
  '361021': { kind: 'tea_house_heritage', landmarkName: '南城麻姑山仙都药香古阁', badgeTag: '建昌帮千年药都' },
  '361024': { kind: 'huizhou_matouqiang', landmarkName: '崇仁相山古村马头墙书院', badgeTag: '中国变电设备城' },
  '361026': { kind: 'wufeng_academy_cliff', landmarkName: '宜黄曹山禅寺与抚州古戏', badgeTag: '宜黄戏非遗源头' },
  '361028': { kind: 'wufeng_academy_cliff', landmarkName: '资溪大觉山悬崖古寺飞阁', badgeTag: '中国面包纯净城' },
  '361104': { kind: 'chongqing_hongyadong', landmarkName: '广信望仙谷悬崖白鹤仙楼', badgeTag: '灵山道教丹霞谷' },
  '361125': { kind: 'red_revolution_memorial', landmarkName: '横峰葛源闽浙赣红色旧址', badgeTag: '方志敏革命圣地' },
  '361129': { kind: 'bamboo_courtyard_library', landmarkName: '万年仙人洞万年稻作博馆', badgeTag: '世界稻作文化源' },
  '361181': { kind: 'industrial_heritage_loft', landmarkName: '德兴千年铜矿露天采场架', badgeTag: '中国铜都银城山' },

  // === 山东省 ===
  '370102': { kind: 'tengwang_yueyang_tower', landmarkName: '济南大明湖超然楼飞阁', badgeTag: '泉城明湖名楼' },
  '370202': { kind: 'maritime_lighthouse_harbor', landmarkName: '青岛栈桥回澜阁海岸灯塔', badgeTag: '红瓦绿树栈桥湾' },
  '370614': { kind: 'island_wind_turbine_bay', landmarkName: '蓬莱长岛列岛风电海湾廊', badgeTag: '长岛海湾风车廊' },
  '370783': { kind: 'glass_greenhouse_agripark', landmarkName: '寿光蔬菜智能连栋玻璃棚', badgeTag: '中国菜都智能棚' },
  '370881': { kind: 'confucian_temple_qufu', landmarkName: '曲阜孔庙大成殿杏坛', badgeTag: '儒家三孔圣地' },
  '370902': { kind: 'wufeng_academy_cliff', landmarkName: '泰山南天门与岱庙天贶殿', badgeTag: '五岳独尊南天门' },
  '371721': { kind: 'memorial_archway_paifang', landmarkName: '曹县国潮汉服电商坊巷', badgeTag: '鲁西南汉服之都' },
  '370781': { kind: 'glass_greenhouse_agripark', landmarkName: '青州黄楼花卉连栋玻璃棚', badgeTag: '花卉连栋智能棚' },
  '371082': { kind: 'maritime_lighthouse_harbor', landmarkName: '荣成成山头天尽头灯塔', badgeTag: '东海海草房港' },
  '370685': { kind: 'industrial_heritage_loft', landmarkName: '招远罗山黄金博物矿楼', badgeTag: '中国金都百强' },
  '370681': { kind: 'maritime_lighthouse_harbor', landmarkName: '龙口南山禅寺与东海港', badgeTag: '胶东民企强县' },
  '370782': { kind: 'tengwang_yueyang_tower', landmarkName: '诸城苏轼超然台重檐阁', badgeTag: '恐龙之乡汽车' },
  '370883': { kind: 'confucian_temple_qufu', landmarkName: '邹城孟庙亚圣殿千年柏', badgeTag: '亚圣孟子故里' },
  '370832': { kind: 'karst_stone_watchtower', landmarkName: '水泊梁山忠义堂石寨门', badgeTag: '水浒文化发源' },
  '371325': { kind: 'dujiangyan_temple_weir', landmarkName: '费县蒙山天蒙望海索桥', badgeTag: '沂蒙小调故乡' },
  '371321': { kind: 'dongyang_luzhai_mansion', landmarkName: '沂南竹泉村与智圣故居', badgeTag: '诸葛故里温泉' },
  '370826': { kind: 'floating_solar_reservoir_array', landmarkName: '微山南四湖渔光互补漂浮电站', badgeTag: '南四湖渔光互补' },
  '370405': { kind: 'grand_canal_granary', landmarkName: '台儿庄运河古仓水门钞关', badgeTag: '天下第一庄城' },
  '370523': { kind: 'tiananmen_gatehouse', landmarkName: '广饶孙子兵圣宫重檐殿', badgeTag: '兵圣孙武故里' },
  '371122': { kind: 'confucian_temple_qufu', landmarkName: '莒县莒国古城文昌大殿', badgeTag: '千年古莒银杏' },
  '370481': { kind: 'smart_science_twin_towers', landmarkName: '滕州墨子科创馆微山荷', badgeTag: '科圣墨子故里' },
  '370304': { kind: 'ceramic_dragon_kiln_chimney', landmarkName: '博山颜神古镇阶梯窑棚圆烟囱', badgeTag: '颜神陶瓷古窑群' },
  '370281': { kind: 'hsr_modern_hub', landmarkName: '胶州上合枢纽与胶东港', badgeTag: '上合示范空港' },
  '371681': { kind: 'wufeng_academy_cliff', landmarkName: '邹平鹤伴山范公读书堂', badgeTag: '铝业棉纺强县' },
  '370305': { kind: 'tiananmen_gatehouse', landmarkName: '临淄齐文化院与临淄阙', badgeTag: '齐国故都蹴鞠' },
  '370103': { kind: 'bund_shikumen', landmarkName: '济南老商埠万字会旧址', badgeTag: '百年开埠泉城芯' },
  '370112': { kind: 'harbin_sophia_dome', landmarkName: '洪家楼百年双塔哥特殿', badgeTag: '齐鲁软件高校区' },
  '370113': { kind: 'wanfo_pagoda_plaza', landmarkName: '灵岩寺千年辟支宋代塔', badgeTag: '长清大学城禅林' },
  '370114': { kind: 'ancient_water_wharf', landmarkName: '明水古城百脉泉古水街', badgeTag: '清照故里铁匠乡' },
  '370203': { kind: 'industrial_heritage_loft', landmarkName: '青岛百年啤酒厂红砖楼', badgeTag: '百年工业大鲍岛' },
  '370211': { kind: 'automated_deepwater_port_crane', landmarkName: '青岛前湾全自动化集装箱港', badgeTag: '前湾自动化深水港' },
  '370212': { kind: 'wufeng_academy_cliff', landmarkName: '崂山太清宫海上仙山阁', badgeTag: '海上名山金家岭' },
  '370215': { kind: 'pingyao_city_gate', landmarkName: '即墨古城墙与千年文庙', badgeTag: '千年商都海洋城' },
  '370602': { kind: 'maritime_lighthouse_harbor', landmarkName: '烟台山百年领事馆灯塔', badgeTag: '近代开埠葡萄酒' },
  '371002': { kind: 'maritime_lighthouse_harbor', landmarkName: '刘公岛提督署与幸福门', badgeTag: '精致城市千里海' },
  '370785': { kind: 'dongyang_luzhai_mansion', landmarkName: '高密东北乡红高粱宅院', badgeTag: '文豪故里安防鞋' },
  '370683': { kind: 'coastal_salt_pan_pyramid', landmarkName: '莱州湾三山岛盐田银垛风车', badgeTag: '莱州海盐风车阵' },
  '370983': { kind: 'wanfo_pagoda_plaza', landmarkName: '肥城春秋古城与桃都阁', badgeTag: '中华佛桃百强县' },
  '371625': { kind: 'confucian_temple_qufu', landmarkName: '博兴兴国寺与董永祠堂', badgeTag: '厨具草柳编百强' },
  '370104': { kind: 'hsr_modern_hub', landmarkName: '济南西站齐鲁高铁港', badgeTag: '省会门户大剧院' },
  '370213': { kind: 'modern_civic_opera', landmarkName: '青岛世博园生态展馆', badgeTag: '胶东半岛枢纽门' },
  '370303': { kind: 'tengwang_yueyang_tower', landmarkName: '淄博齐盛湖海岱楼阁', badgeTag: '鲁中陶瓷齐文化' },
  '370502': { kind: 'industrial_heritage_loft', landmarkName: '胜利油田工业纪念馆', badgeTag: '黄河入海石油城' },
  '370682': { kind: 'modern_civic_opera', landmarkName: '莱阳白垩纪恐龙遗址', badgeTag: '中国恐龙之乡梨' },
  '370705': { kind: 'modern_civic_opera', landmarkName: '潍坊世界风筝博物馆', badgeTag: '世界风筝文创芯' },
  '370811': { kind: 'grand_canal_granary', landmarkName: '济宁河道总督署太白漕仓', badgeTag: '孔孟之乡运河都' },
  '370923': { kind: 'karst_stone_watchtower', landmarkName: '东平白佛山石窟水寨', badgeTag: '八百里水泊名湖' },
  '371302': { kind: 'jiangnan_gardens_gate', landmarkName: '临沂王羲之故居砚池', badgeTag: '书圣故里物流都' },
  '371502': { kind: 'bayong_lou', landmarkName: '聊城光岳楼水城古阁', badgeTag: '江北水城运河珠' },
  '371702': { kind: 'jiangnan_gardens_gate', landmarkName: '曹州牡丹园国花水亭', badgeTag: '中国牡丹之都芯' },
  '371402': { kind: 'grand_canal_granary', landmarkName: '德州苏禄王墓运河古仓', badgeTag: '九达天衢运河' },
  '371581': { kind: 'grand_canal_granary', landmarkName: '临清运河钞关舍利宝塔', badgeTag: '京杭运河钞关' },
  '371428': { kind: 'grand_canal_granary', landmarkName: '武城四女寺运河古渡仓', badgeTag: '弦歌故里运河' },
  '371521': { kind: 'grand_canal_granary', landmarkName: '阳谷景阳冈运河阿城仓', badgeTag: '千年运河古镇' },
  '370812': { kind: 'wanfo_pagoda_plaza', landmarkName: '兖州兴隆文化园舍利塔', badgeTag: '古九州端信城' },
  '370830': { kind: 'grand_canal_granary', landmarkName: '汶上南旺分水龙王漕仓', badgeTag: '运河水脊中都' },
  '370829': { kind: 'floating_solar_reservoir_array', landmarkName: '嘉祥沉陷湖库水面漂浮光伏阵', badgeTag: '鲁西南湖库绿电' },
  '370724': { kind: 'wufeng_academy_cliff', landmarkName: '临朐沂山东镇庙百丈崖', badgeTag: '中华五镇沂山' },
  '370306': { kind: 'bund_shikumen', landmarkName: '周村旱码头百年商埠街', badgeTag: '鲁商发祥丝城' },
  '370611': { kind: 'memorial_archway_paifang', landmarkName: '福山甲骨文之父故居坊', badgeTag: '鲁菜发源之乡' },
  '370612': { kind: 'maritime_lighthouse_harbor', landmarkName: '牟平养马岛秦皇海湾塔', badgeTag: '仙岛避暑海湾' },
  '371003': { kind: 'wufeng_academy_cliff', landmarkName: '文登昆嵛山道教圣境阁', badgeTag: '全真道教祖庭' },
  '371083': { kind: 'red_revolution_memorial', landmarkName: '乳山胶东育儿所红院馆', badgeTag: '母爱圣地牡蛎' },
  '371102': { kind: 'maritime_lighthouse_harbor', landmarkName: '日照万平口灯塔潮汐塔', badgeTag: '阳光海岸港城' },
  '371323': { kind: 'karst_stone_watchtower', landmarkName: '沂水地下画廊纪王崮寨', badgeTag: '千年春秋古崮' },
  '371328': { kind: 'red_revolution_memorial', landmarkName: '蒙阴孟良崮战役纪念塔', badgeTag: '沂蒙蜜桃红色' },
  '371621': { kind: 'pingyao_city_gate', landmarkName: '惠民魏氏庄园孙子兵城', badgeTag: '兵圣桑梓故里' },
  '371725': { kind: 'pingyao_city_gate', landmarkName: '郓城水浒好汉城宋代门', badgeTag: '好汉水浒武乡' },
  '370105': { kind: 'sea_crossing_cable_bridge', landmarkName: '天桥泺口百年黄河铁桥', badgeTag: '百年商埠黄河北' },
  '370116': { kind: 'tiananmen_gatehouse', landmarkName: '莱芜战役纪念馆鲁中阙', badgeTag: '齐鲁钢铁生姜都' },
  '370124': { kind: 'tea_house_heritage', landmarkName: '平阴东方玫瑰庄园古阁', badgeTag: '中国玫瑰之乡城' },
  '370214': { kind: 'hsr_modern_hub', landmarkName: '城阳动车小镇高铁智造', badgeTag: '中国轨道交通芯' },
  '370283': { kind: 'confucian_temple_qufu', landmarkName: '平度天柱山魏碑刻石殿', badgeTag: '胶东粮仓魏碑乡' },
  '370302': { kind: 'shanxi_courtyard_jinshang', landmarkName: '淄川蒲松龄故居聊斋院', badgeTag: '短篇小说之王里' },
  '370321': { kind: 'confucian_temple_qufu', landmarkName: '桓台王渔洋故居忠勤祠', badgeTag: '江北建筑第一县' },
  '370403': { kind: 'hsr_modern_hub', landmarkName: '薛城枣庄高铁铁道公园', badgeTag: '微山湖畔高铁城' },
  '370404': { kind: 'wufeng_academy_cliff', landmarkName: '峄城冠世榴园青檀古刹', badgeTag: '天下第一石榴园' },
  '370503': { kind: 'coastal_salt_pan_pyramid', landmarkName: '黄河口滨海盐田银垛风车', badgeTag: '黄河口滨海盐场' },
  '370613': { kind: 'maritime_lighthouse_harbor', landmarkName: '莱山渔人码头欧式灯塔', badgeTag: '胶东科创滨海区' },
  '370687': { kind: 'space_launch_gantry', landmarkName: '海阳东方航天港海发射塔', badgeTag: '中国航天海上港' },
  '370703': { kind: 'dongyang_luzhai_mansion', landmarkName: '寒亭杨家埠年画风筝院', badgeTag: '风筝年画发源地' },
  '370784': { kind: 'confucian_temple_qufu', landmarkName: '安丘青云山公冶长书院', badgeTag: '世界蔬菜出口乡' },
  '370982': { kind: 'wufeng_academy_cliff', landmarkName: '新泰莲花山石刻飞檐阁', badgeTag: '和圣柳下惠故里' },
  '371322': { kind: 'pingyao_city_gate', landmarkName: '郯城千年郯国故城土城', badgeTag: '天下第一银杏乡' },
  '371425': { kind: 'sea_crossing_cable_bridge', landmarkName: '齐河黄河斜拉桥文旅塔', badgeTag: '黄河生态省会圈' },
  '371524': { kind: 'grand_canal_granary', landmarkName: '东阿古城阿胶运河古仓', badgeTag: '中国阿胶千年乡' },
  '371623': { kind: 'wanfo_pagoda_plaza', landmarkName: '无棣古城大觉寺海丰塔', badgeTag: '鲁北古城贝壳堤' },
  '371724': { kind: 'grotto_cliff_buddha', landmarkName: '巨野金山摩崖石窟古阁', badgeTag: '中国工笔牡丹画' },
  '370115': { kind: 'confucian_temple_qufu', landmarkName: '济阳闻韶台齐鲁礼乐古殿', badgeTag: '孔子闻韶千年地' },
  '370117': { kind: 'industrial_heritage_loft', landmarkName: '钢城莱钢绿色钢铁智造园', badgeTag: '鲁中特钢工业区' },
  '370126': { kind: 'tiananmen_gatehouse', landmarkName: '商河鼓子秧歌非遗文化台', badgeTag: '中国温泉花卉乡' },
  '370285': { kind: 'ancient_water_wharf', landmarkName: '莱西莱西湖大沽河水门阁', badgeTag: '胶东半岛莱夷源' },
  '370322': { kind: 'ancient_water_wharf', landmarkName: '高青黄河安澜湾古渡堤阁', badgeTag: '黄河黑牛温泉县' },
  '370323': { kind: 'covered_bridge_pavilion', landmarkName: '沂源牛郎织女织女洞鹊桥', badgeTag: '中国牛郎织女乡' },
  '370402': { kind: 'industrial_heritage_loft', landmarkName: '市中枣庄百年中兴煤矿架', badgeTag: '中国民族工业源' },
  '370406': { kind: 'karst_stone_watchtower', landmarkName: '山亭翼云石头部落古石寨', badgeTag: '鲁南抱犊崮石村' },
  '370505': { kind: 'ancient_water_wharf', landmarkName: '垦利黄河口入海湿地栈道', badgeTag: '黄河入海新生洲' },
  '370522': { kind: 'ancient_water_wharf', landmarkName: '利津铁门关古渡老街水门', badgeTag: '黄河水煎包古津' },
  '370686': { kind: 'shanxi_courtyard_jinshang', landmarkName: '栖霞牟氏庄园胶东砖雕院', badgeTag: '中国苹果之都庄' },
  '370702': { kind: 'jiangnan_gardens_gate', landmarkName: '潍城十笏园胶东古典名园', badgeTag: '北方微缩园林城' },
  '370704': { kind: 'bund_shikumen', landmarkName: '坊子百年炭矿德式红砖楼', badgeTag: '胶济铁路百年镇' },
  '370725': { kind: 'volcanic_stone_village', landmarkName: '昌乐火山石柱群蓝宝石坊', badgeTag: '中国蓝宝石之都' },
  '370786': { kind: 'yiwu_tradecity_jiming', landmarkName: '昌邑柳疃百年茧丝绸商镇', badgeTag: '北方苗木丝绸城' },
  '370827': { kind: 'ancient_water_wharf', landmarkName: '鱼台微山湖西岸稻米古渡', badgeTag: '江北鱼米孔孟乡' },
  '370828': { kind: 'red_revolution_memorial', landmarkName: '金乡羊山鲁西南战役纪念', badgeTag: '世界大蒜之都县' },
  '370831': { kind: 'confucian_temple_qufu', landmarkName: '泗水仲子庙与泉林古泉亭', badgeTag: '海岱名泉卞桥乡' },
  '370911': { kind: 'tiananmen_gatehouse', landmarkName: '岱岳大汶口史前太阳台阙', badgeTag: '大汶口文化源头' },
  '370921': { kind: 'dujiangyan_temple_weir', landmarkName: '宁阳堽城坝明代大汶古堰', badgeTag: '中国蟋蟀大枣乡' },
  '371103': { kind: 'maritime_lighthouse_harbor', landmarkName: '岚山黄海深水港与海上碑', badgeTag: '日照绿茶深水港' },
  '371121': { kind: 'wufeng_academy_cliff', landmarkName: '五莲五莲山光明古刹丹崖', badgeTag: '江北奇秀五莲山' },
  '371311': { kind: 'porcelain_dragon_kiln', landmarkName: '罗庄古建陶瓷产业博物坊', badgeTag: '鲁南建筑陶瓷城' },
  '371312': { kind: 'ancient_water_wharf', landmarkName: '河东汤头千年温泉沂河渡', badgeTag: '临沂空港温泉城' },
  '371324': { kind: 'glass_greenhouse_agripark', landmarkName: '兰陵国家农园连栋玻璃棚', badgeTag: '沂蒙智能温室园' },
  '371326': { kind: 'grotto_cliff_buddha', landmarkName: '平邑蒙山龟蒙顶巨型寿星', badgeTag: '沂蒙主峰金银花' },
  '371327': { kind: 'red_revolution_memorial', landmarkName: '莒南大店115师旧址大院', badgeTag: '山东小延安大店' },
  '371329': { kind: 'red_revolution_memorial', landmarkName: '临沭朱村沂蒙支前红军院', badgeTag: '中国柳编第一县' },
  '371403': { kind: 'confucian_temple_qufu', landmarkName: '陵城东方朔画赞唐碑古祠', badgeTag: '颜真卿名碑古郡' },
  '371422': { kind: 'modern_civic_opera', landmarkName: '宁津中国杂技艺术展演馆', badgeTag: '中华杂技家具城' },
  '371423': { kind: 'wanfo_pagoda_plaza', landmarkName: '庆云海岛金山寺重檐古塔', badgeTag: '渤海千年古刹城' },
  '371424': { kind: 'bamboo_courtyard_library', landmarkName: '临邑邢侗纪念馆草圣书院', badgeTag: '明代书圣邢侗里' },
  '371426': { kind: 'bayong_lou', landmarkName: '平原汉代古郡琵琶湾名阁', badgeTag: '汉代平原郡古地' },
  '371427': { kind: 'grand_canal_granary', landmarkName: '夏津黄河故道千年古桑园', badgeTag: '全球农遗古桑林' },
  '371481': { kind: 'red_revolution_memorial', landmarkName: '乐陵冀鲁边区革命纪念馆', badgeTag: '中国金丝小枣都' },
  '371482': { kind: 'dujiangyan_temple_weir', landmarkName: '禹城大禹治水具丘古堰亭', badgeTag: '中国功能糖之都' },
  '371503': { kind: 'ancient_water_wharf', landmarkName: '茌平金牛湖与信发产业城', badgeTag: '鲁西铝业大县芯' },
  '371522': { kind: 'glass_greenhouse_agripark', landmarkName: '莘县瓜菜现代连栋玻璃棚', badgeTag: '鲁西智能温室群' },
  '371525': { kind: 'confucian_temple_qufu', landmarkName: '冠县武训祠堂兴学义学院', badgeTag: '千年梨园冠县城' },
  '371526': { kind: 'bamboo_courtyard_library', landmarkName: '高唐李苦禅美术馆水墨院', badgeTag: '中国书画高唐城' },
  '371602': { kind: 'red_revolution_memorial', landmarkName: '滨城渤海革命老区纪念馆', badgeTag: '黄河三角洲中心' },
  '371603': { kind: 'coastal_salt_pan_pyramid', landmarkName: '沾化埕口海盐方阵银垛', badgeTag: '鲁北古海盐晒场' },
  '371622': { kind: 'dongyang_luzhai_mansion', landmarkName: '阳信水落坡古典家具民俗', badgeTag: '中国第一鸭梨乡' },
  '371703': { kind: 'pingyao_city_gate', landmarkName: '定陶仿山古曹国陶朱古城', badgeTag: '天下之中陶朱公' },
  '371722': { kind: 'memorial_archway_paifang', landmarkName: '单县百寿百狮清代石牌坊', badgeTag: '中国牌坊之乡县' },
  '371723': { kind: 'confucian_temple_qufu', landmarkName: '成武文亭山文庙与伯乐祠', badgeTag: '伯乐相马故里地' },
  '371726': { kind: 'confucian_temple_qufu', landmarkName: '鄄城孙膑兵法古城亿城寺', badgeTag: '兵圣孙膑故里乡' },
  '371728': { kind: 'ancient_water_wharf', landmarkName: '东明黄河入鲁第一湾古渡', badgeTag: '庄子故里西瓜乡' },

  // === 河南省 ===
  '410105': { kind: 'smart_science_twin_towers', landmarkName: '郑东如意湖千玺大厦地标', badgeTag: '中原现代CBD极' },
  '410185': { kind: 'ancient_star_observatory', landmarkName: '登封周公测景台古观星台', badgeTag: '天地之中观星台' },
  '410202': { kind: 'tengwang_yueyang_tower', landmarkName: '开封龙亭与清明上河御阁', badgeTag: '八朝东京宋韵' },
  '410225': { kind: 'bamboo_courtyard_library', landmarkName: '兰考泡桐焦裕禄纪念馆', badgeTag: '泡桐乐器圣地' },
  '410302': { kind: 'tiananmen_gatehouse', landmarkName: '洛阳应天门隋唐宫阙', badgeTag: '神都盛唐应天门' },
  '410502': { kind: 'wanfo_pagoda_plaza', landmarkName: '安阳文峰塔与甲骨文字殿', badgeTag: '殷墟甲骨文峰塔' },
  '411522': { kind: 'huizhou_matouqiang', landmarkName: '光山司马光书院豫南古院', badgeTag: '大别山麓书院乡' },
  '410581': { kind: 'ancient_stone_aqueduct_weir', landmarkName: '林州红旗渠青年洞分水闸', badgeTag: '人工天河红旗渠' },
  '411081': { kind: 'ceramic_dragon_kiln_chimney', landmarkName: '禹州神垕钧瓷古龙窑与高烟囱', badgeTag: '神垕钧瓷千年窑' },
  '410782': { kind: 'karst_stone_watchtower', landmarkName: '辉县郭亮绝壁挂壁长廊', badgeTag: '太行挂壁公路' },
  '410825': { kind: 'ancestral_taiji_hall', landmarkName: '温县陈家沟太极拳祖祠', badgeTag: '世界太极圣地' },
  '410821': { kind: 'wufeng_academy_cliff', landmarkName: '修武云台山红石峡悬阁', badgeTag: '云台山民宿乡' },
  '410523': { kind: 'ancestral_taiji_hall', landmarkName: '汤阴羑里八卦城岳飞庙', badgeTag: '精忠报国周易' },
  '410621': { kind: 'pingyao_city_gate', landmarkName: '浚县黎阳古城墙云溪桥', badgeTag: '社火千年古县' },
  '410181': { kind: 'shanxi_courtyard_jinshang', landmarkName: '巩义康百万庄园青砖院', badgeTag: '中原豫商巨族' },
  '410184': { kind: 'tiananmen_gatehouse', landmarkName: '新郑黄帝故里轩辕大殿', badgeTag: '人文始祖故里' },
  '410425': { kind: 'confucian_temple_qufu', landmarkName: '郏县三苏祠百年古柏殿', badgeTag: '三苏文化铁锅' },
  '411326': { kind: 'dujiangyan_temple_weir', landmarkName: '淅川丹江口南水北调源', badgeTag: '一渠清水北送' },
  '411323': { kind: 'modern_civic_opera', landmarkName: '西峡伏牛山恐龙遗迹馆', badgeTag: '恐龙香菇之乡' },
  '411628': { kind: 'confucian_temple_qufu', landmarkName: '鹿邑太清宫老子道德殿', badgeTag: '道家鼻祖故里' },
  '411403': { kind: 'pingyao_city_gate', landmarkName: '商丘古城拱阳门应天院', badgeTag: '华商始祖圣地' },
  '411603': { kind: 'tiananmen_gatehouse', landmarkName: '淮阳太昊陵统天伏羲殿', badgeTag: '人祖伏羲太昊' },
  '411481': { kind: 'beacon_tower_greatwall', landmarkName: '永城芒砀山大汉雄风阙', badgeTag: '大汉之源煤城' },
  '410421': { kind: 'porcelain_dragon_kiln', landmarkName: '宝丰清凉寺宋代汝官窑', badgeTag: '宋代汝瓷曲艺' },
  '411523': { kind: 'red_revolution_memorial', landmarkName: '新县大别山红军首府院', badgeTag: '大别山红色乡' },
  '410102': { kind: 'industrial_heritage_loft', landmarkName: '郑州二砂百年厂房文创', badgeTag: '百年老工业蝶变' },
  '410103': { kind: 'wanfo_pagoda_plaza', landmarkName: '郑州二七纪念双联古塔', badgeTag: '京汉铁路百年街' },
  '410104': { kind: 'pingyao_city_gate', landmarkName: '三千六百年商代城垣墙', badgeTag: '商都古城文脉芯' },
  '410182': { kind: 'jiayuguan_pass_fortress', landmarkName: '荥阳虎牢关三英战雄关', badgeTag: '象棋楚河汉界源' },
  '410305': { kind: 'industrial_heritage_loft', landmarkName: '洛阳一拖红砖苏式厂区', badgeTag: '共和国工业长子' },
  '410311': { kind: 'grotto_cliff_buddha', landmarkName: '龙门石窟卢舍那崖壁阁', badgeTag: '世界遗产石窟核' },
  '411082': { kind: 'confucian_temple_qufu', landmarkName: '长葛葛天氏与钟繇书院', badgeTag: '超硬材料蜂业城' },
  '411303': { kind: 'confucian_temple_qufu', landmarkName: '南阳卧龙岗武侯祠大殿', badgeTag: '躬耕南阳诸葛乡' },
  '410902': { kind: 'modern_civic_opera', landmarkName: '濮阳中华第一龙文化馆', badgeTag: '华夏龙都中原油' },
  '419001': { kind: 'wufeng_academy_cliff', landmarkName: '王屋山愚公村与济渎庙', badgeTag: '愚公移山白银城' },
  '410108': { kind: 'tiananmen_gatehouse', landmarkName: '黄河风景名胜炎黄坛', badgeTag: '黄河文化生态门' },
  '410122': { kind: 'modern_civic_opera', landmarkName: '只有河南夯土戏剧城', badgeTag: '中原文旅戏剧核' },
  '410204': { kind: 'xian_bell_goose_pagoda', landmarkName: '开封鼓楼与大相国寺', badgeTag: '东京夜市宋韵芯' },
  '410308': { kind: 'hydroelectric_arch_dam', landmarkName: '黄河小浪底水利枢纽', badgeTag: '河图洛书始祖地' },
  '410505': { kind: 'tiananmen_gatehouse', landmarkName: '殷墟博物院商代宗庙', badgeTag: '三千年甲骨圣地' },
  '410611': { kind: 'ancient_water_wharf', landmarkName: '鹤壁淇河诗经古渡亭', badgeTag: '诗经文化镁基城' },
  '410783': { kind: 'yiwu_tradecity_jiming', landmarkName: '长垣起重卫材会展城', badgeTag: '中国厨师起重乡' },
  '411002': { kind: 'confucian_temple_qufu', landmarkName: '许昌春秋楼与曹魏城', badgeTag: '汉魏故都莲城芯' },
  '411203': { kind: 'yaodong_baota_hill', landmarkName: '陕州天井窑院地坑村', badgeTag: '黄土地坑院民俗' },
  '411282': { kind: 'jiayuguan_pass_fortress', landmarkName: '灵宝函谷关老子著经', badgeTag: '紫气东来函谷关' },
  '411324': { kind: 'yiwu_tradecity_jiming', landmarkName: '镇平玉雕石佛寺商街', badgeTag: '中华玉都玉雕乡' },
  '411502': { kind: 'cliffside_tea_terraces', landmarkName: '信阳浉河车云山毛尖茶园', badgeTag: '信阳毛尖云雾山' },
  '411725': { kind: 'red_revolution_memorial', landmarkName: '确山竹沟小延安院落', badgeTag: '手工提琴红色地' },
  '410183': { kind: 'pingyao_city_gate', landmarkName: '新密打虎亭汉墓与县衙楼', badgeTag: '岐伯密玉古邑' },
  '410221': { kind: 'grand_canal_granary', landmarkName: '杞县东大寺明清古漕粮仓', badgeTag: '大蒜百强粮仓' },
  '410307': { kind: 'tiananmen_gatehouse', landmarkName: '偃师二里头夏都博物馆阙', badgeTag: '最早中国夏都' },
  '410324': { kind: 'wufeng_academy_cliff', landmarkName: '栾川老君山金顶云海道殿', badgeTag: '伏牛仙山奇观' },
  '410423': { kind: 'wufeng_academy_cliff', landmarkName: '鲁山尧山中原大佛云崖阁', badgeTag: '墨子故里温泉' },
  '410482': { kind: 'porcelain_dragon_kiln', landmarkName: '汝州张公巷宋代官窑遗址', badgeTag: '千年汝瓷之都' },
  '410526': { kind: 'grand_canal_granary', landmarkName: '滑县道口古镇运河古粮仓', badgeTag: '道口烧鸡运河' },
  '410622': { kind: 'wufeng_academy_cliff', landmarkName: '淇县云梦山战国古军校阁', badgeTag: '朝歌鬼谷谋略' },
  '410781': { kind: 'confucian_temple_qufu', landmarkName: '卫辉比干庙千年太公石殿', badgeTag: '牧野财神祖庙' },
  '410823': { kind: 'dujiangyan_temple_weir', landmarkName: '武陟嘉应观黄河铁犀古殿', badgeTag: '万里黄河第一观' },
  '410882': { kind: 'wanfo_pagoda_plaza', landmarkName: '沁阳天宁寺宋代三圣砖塔', badgeTag: '怀药怀商故里' },
  '411024': { kind: 'bamboo_courtyard_library', landmarkName: '鄢陵中原花木生态展示院', badgeTag: '中国花木之都' },
  '411122': { kind: 'covered_bridge_pavilion', landmarkName: '临颍小商桥宋代古石拱桥', badgeTag: '南街食品名城' },
  '411325': { kind: 'pingyao_city_gate', landmarkName: '内乡千年清代古县衙大堂', badgeTag: '天下第一古衙' },
  '411327': { kind: 'classical_wood_opera_stage', landmarkName: '社旗山陕会馆悬鉴古戏台', badgeTag: '清代会馆古戏楼' },
  '411524': { kind: 'tea_house_heritage', landmarkName: '商城金刚台高山毛尖茶阁', badgeTag: '大别山茶竹乡' },
  '411623': { kind: 'confucian_temple_qufu', landmarkName: '商水寿圣寺塔与叶氏庄园', badgeTag: '豫东农业强县' },
  '411727': { kind: 'west_lake_leifeng', landmarkName: '汝南南海禅寺天中山古塔', badgeTag: '天下之中古城' },
  '410106': { kind: 'industrial_heritage_loft', landmarkName: '上街中国铝都红砖厂房', badgeTag: '中原通航铝工业' },
  '410203': { kind: 'wanfo_pagoda_plaza', landmarkName: '顺河开封铁塔宋代琉璃', badgeTag: '天下第一铁色塔' },
  '410205': { kind: 'wanfo_pagoda_plaza', landmarkName: '禹王台开封繁塔古吹台', badgeTag: '李白杜甫吟诗台' },
  '410223': { kind: 'xian_bell_goose_pagoda', landmarkName: '尉氏兴国寺北宋古砖塔', badgeTag: '建安七子阮籍里' },
  '410303': { kind: 'tiananmen_gatehouse', landmarkName: '西工周王城天子驾六阙', badgeTag: '东周王城核心区' },
  '410323': { kind: 'jiayuguan_pass_fortress', landmarkName: '新安汉函谷关丝路雄关', badgeTag: '世界遗产函谷关' },
  '410325': { kind: 'wufeng_academy_cliff', landmarkName: '嵩县白云山伊河程颢阁', badgeTag: '伏牛山嵩县库区' },
  '410422': { kind: 'pingyao_city_gate', landmarkName: '叶县明代古县衙正堂楼', badgeTag: '全国唯一明县衙' },
  '410481': { kind: 'industrial_heritage_loft', landmarkName: '舞钢特厚宽板工业遗产', badgeTag: '中国特钢山水城' },
  '410527': { kind: 'confucian_temple_qufu', landmarkName: '内黄三杨庄汉代庭院馆', badgeTag: '中国庞贝汉遗址' },
  '410724': { kind: 'tiananmen_gatehouse', landmarkName: '获嘉同盟山武王誓师坛', badgeTag: '牧野之战盟誓地' },
  '410822': { kind: 'bamboo_courtyard_library', landmarkName: '博爱月山寺竹林清幽院', badgeTag: '太行山南竹林乡' },
  '410883': { kind: 'confucian_temple_qufu', landmarkName: '孟州韩愈陵园昌黎祠殿', badgeTag: '唐宋八大家韩里' },
  '410927': { kind: 'ancient_water_wharf', landmarkName: '台前孙口黄河强渡古渡', badgeTag: '千里跃进渡河处' },
  '411025': { kind: 'pingyao_city_gate', landmarkName: '襄城紫云书院明代古城', badgeTag: '千年烟草书院城' },
  '411121': { kind: 'tiananmen_gatehouse', landmarkName: '舞阳贾湖九千年骨笛馆', badgeTag: '中华最早乐器源' },
  '411221': { kind: 'yaodong_baota_hill', landmarkName: '渑池仰韶文化彩陶窑台', badgeTag: '中华考古发祥地' },
  '411322': { kind: 'beacon_tower_greatwall', landmarkName: '方城大关口楚长城遗址', badgeTag: '中国最早万里城' },
  '411381': { kind: 'tengwang_yueyang_tower', landmarkName: '邓州花洲书院春风堂阁', badgeTag: '岳阳楼记撰写地' },
  '411422': { kind: 'west_lake_leifeng', landmarkName: '睢县北湖袁家山湖心阁', badgeTag: '中原制鞋水城县' },
  '411423': { kind: 'tea_house_heritage', landmarkName: '宁陵黄河故道百年梨阁', badgeTag: '中国酥梨长寿乡' },
  '411525': { kind: 'memorial_archway_paifang', landmarkName: '固始闽台根亲祖地牌坊', badgeTag: '中原第一侨乡县' },
  '411526': { kind: 'pingyao_city_gate', landmarkName: '潢川黄国故城春秋城垣', badgeTag: '天下黄姓发源地' },
  '411622': { kind: 'tiananmen_gatehouse', landmarkName: '西华女娲城古祭坛殿阙', badgeTag: '逍遥胡辣汤发源' },
  '411722': { kind: 'pingyao_city_gate', landmarkName: '上蔡春秋蔡国故城遗址', badgeTag: '千年古蔡重阳源' },
  '410212': { kind: 'pingyao_city_gate', landmarkName: '祥符朱仙镇千年运河古城', badgeTag: '中国木版年画镇' },
  '410304': { kind: 'kashgar_islamic_arcade', landmarkName: '瀍河东关百年清真拱门巷', badgeTag: '古都民族商贸区' },
  '410326': { kind: 'tea_house_heritage', landmarkName: '汝阳杜康仙庄千年酿酒坊', badgeTag: '中华酒祖杜康乡' },
  '410327': { kind: 'confucian_temple_qufu', landmarkName: '宜阳灵山莲花寺与甘棠祠', badgeTag: '甘棠遗爱诗经地' },
  '410328': { kind: 'ancestral_taiji_hall', landmarkName: '洛宁洛出书处神龟太极坛', badgeTag: '河图洛书洛书源' },
  '410329': { kind: 'confucian_temple_qufu', landmarkName: '伊川伊皋书院二程夫子祠', badgeTag: '宋明理学二程里' },
  '410402': { kind: 'modern_civic_opera', landmarkName: '新华平顶山白龟湖文化馆', badgeTag: '中原煤电尼龙城' },
  '410725': { kind: 'grand_canal_granary', landmarkName: '原阳黄河故道黄金大米仓', badgeTag: '中国厨师原阳米' },
  '410727': { kind: 'tiananmen_gatehouse', landmarkName: '封丘陈桥驿北宋黄袍古驿', badgeTag: '北宋开国陈桥驿' },
  '410922': { kind: 'red_revolution_memorial', landmarkName: '清丰单拐冀鲁豫革命旧址', badgeTag: '中华孝道之乡县' },
  '410926': { kind: 'bamboo_courtyard_library', landmarkName: '范县郑板桥曾任竹韵书院', badgeTag: '郑板桥为官古邑' },
  '411003': { kind: 'tiananmen_gatehouse', landmarkName: '建安汉魏许都受禅古台阙', badgeTag: '三国曹魏发祥地' },
  '411103': { kind: 'covered_bridge_pavilion', landmarkName: '郾城杨再兴小商桥宋石桥', badgeTag: '岳家军小商桥碑' },
  '411202': { kind: 'hydroelectric_arch_dam', landmarkName: '湖滨三门峡黄河万里第一', badgeTag: '万里黄河第一坝' },
  '411224': { kind: 'red_revolution_memorial', landmarkName: '卢氏红二十五军军部旧址', badgeTag: '秦岭东麓中药谷' },
  '411281': { kind: 'grotto_cliff_buddha', landmarkName: '义马鸿庆寺北魏石窟造像', badgeTag: '丝路北魏石窟煤' },
  '411321': { kind: 'wufeng_academy_cliff', landmarkName: '南召五朵山金顶道观丹崖', badgeTag: '伏牛山生态玉兰' },
  '411330': { kind: 'red_revolution_memorial', landmarkName: '桐柏中共中央中原局旧址', badgeTag: '千里淮河正源地' },
  '411421': { kind: 'smart_science_twin_towers', landmarkName: '民权中国冷谷制冷科创园', badgeTag: '中国制冷装备都' },
  '411425': { kind: 'confucian_temple_qufu', landmarkName: '虞城花木兰祠千年巾帼殿', badgeTag: '巾帼英雄木兰乡' },
  '411521': { kind: 'red_revolution_memorial', landmarkName: '罗山何家冲红25军长征地', badgeTag: '大别山长征出发' },
  '411627': { kind: 'wanfo_pagoda_plaza', landmarkName: '太康寿圣寺塔与夏都古城', badgeTag: '夏朝都城锅炉乡' },
  '411681': { kind: 'shanxi_courtyard_jinshang', landmarkName: '项城袁寨清代砖雕高墙院', badgeTag: '豫东防水医药城' },
  '411726': { kind: 'red_revolution_memorial', landmarkName: '泌阳焦竹园鄂豫边革命院', badgeTag: '中国夏南牛香菇' },
  '410222': { kind: 'memorial_archway_paifang', landmarkName: '通许建安才子曹植墓碑坊', badgeTag: '建安文学酸辣' },
  '410403': { kind: 'industrial_heritage_loft', landmarkName: '卫东平煤百年矿区转型园', badgeTag: '中原煤电核心' },
  '410404': { kind: 'industrial_heritage_loft', landmarkName: '石龙区宝丰煤矿工矿遗址', badgeTag: '豫西煤炭工业' },
  '410411': { kind: 'ancient_water_wharf', landmarkName: '湛河白鹭洲滨水生态廊阁', badgeTag: '鹰城滨水新区' },
  '410503': { kind: 'memorial_archway_paifang', landmarkName: '北关洹水北岸袁林石牌坊', badgeTag: '洹水近代遗存' },
  '410506': { kind: 'grotto_cliff_buddha', landmarkName: '龙安善应清凉山唐代石窟', badgeTag: '太行东麓石窟' },
  '410522': { kind: 'grotto_cliff_buddha', landmarkName: '安阳县灵泉寺北齐石窟群', badgeTag: '河朔第一古刹' },
  '410602': { kind: 'porcelain_dragon_kiln', landmarkName: '鹤山唐宋鹤壁古瓷窑遗址', badgeTag: '太行古窑药山' },
  '410603': { kind: 'red_revolution_memorial', landmarkName: '山城石林军事会议旧址院', badgeTag: '红色石林山城' },
  '410702': { kind: 'modern_civic_opera', landmarkName: '红旗区平原博物院文化馆', badgeTag: '牧野文教中心' },
  '410703': { kind: 'hsr_modern_hub', landmarkName: '卫滨区新乡百年铁路商埠', badgeTag: '豫北铁路枢纽' },
  '410704': { kind: 'tiananmen_gatehouse', landmarkName: '凤泉明代潞简王陵石殿阙', badgeTag: '中原定陵凤泉' },
  '410711': { kind: 'tiananmen_gatehouse', landmarkName: '牧野周武王牧野会战古坛', badgeTag: '牧野古战遗风' },
  '410721': { kind: 'bamboo_courtyard_library', landmarkName: '新乡县七里营刘庄展示馆', badgeTag: '中原新农村样' },
  '410726': { kind: 'wanfo_pagoda_plaza', landmarkName: '延津大觉寺唐代万寿古塔', badgeTag: '黄河故道古塔' },
  '410802': { kind: 'tiananmen_gatehouse', landmarkName: '解放区焦作北山仿唐城阙', badgeTag: '山阳煤城中心' },
  '410803': { kind: 'ancient_star_observatory', landmarkName: '中站朱载堉乐律纪念馆台', badgeTag: '乐律圣宗故里' },
  '410804': { kind: 'industrial_heritage_loft', landmarkName: '马村百年煤炭老矿井架园', badgeTag: '怀川煤电新区' },
  '410811': { kind: 'wufeng_academy_cliff', landmarkName: '山阳百家岩竹林七贤山阁', badgeTag: '竹林七贤隐地' },
  '410923': { kind: 'confucian_temple_qufu', landmarkName: '南乐仓颉陵庙中华文字殿', badgeTag: '造字圣人故里' },
  '410928': { kind: 'pingyao_city_gate', landmarkName: '濮阳戚城春秋卫国古城垣', badgeTag: '澶渊之盟故地' },
  '411102': { kind: 'ancient_water_wharf', landmarkName: '源汇沙澧双河交汇古渡阁', badgeTag: '沙澧食品名城' },
  '411104': { kind: 'confucian_temple_qufu', landmarkName: '召陵许慎文化园说文大殿', badgeTag: '中华字圣故里' },
  '411302': { kind: 'confucian_temple_qufu', landmarkName: '宛城医圣祠与明清南阳衙', badgeTag: '医圣故里府衙' },
  '411328': { kind: 'dongyang_luzhai_mansion', landmarkName: '唐河古戏楼与友兰哲学馆', badgeTag: '哲学大师故里' },
  '411329': { kind: 'tiananmen_gatehouse', landmarkName: '新野三国汉议事台古殿阙', badgeTag: '汉桑三国古邑' },
  '411402': { kind: 'jiangnan_gardens_gate', landmarkName: '梁园汉赋园林与日月湖阁', badgeTag: '汉梁辞赋圣地' },
  '411424': { kind: 'smart_science_twin_towers', landmarkName: '柘城中国培育钻石科创塔', badgeTag: '中国钻石之都' },
  '411426': { kind: 'confucian_temple_qufu', landmarkName: '夏邑千年孔子还乡祠大殿', badgeTag: '孔圣祖籍栗邑' },
  '411503': { kind: 'huizhou_matouqiang', landmarkName: '平桥郝堂豫南砖瓦茶居村', badgeTag: '中国乡建典范' },
  '411527': { kind: 'ancient_water_wharf', landmarkName: '淮滨千里淮河航运古港渡', badgeTag: '淮河造船名港' },
  '411528': { kind: 'pingyao_city_gate', landmarkName: '息县千年古息城与息夫人', badgeTag: '中华第一古县' },
  '411602': { kind: 'dongyang_luzhai_mansion', landmarkName: '川汇周口关帝庙山陕戏楼', badgeTag: '沙颍漕运会馆' },
  '411621': { kind: 'red_revolution_memorial', landmarkName: '扶沟吉鸿昌将军故居红馆', badgeTag: '抗日名将故里' },
  '411624': { kind: 'kashgar_islamic_arcade', landmarkName: '沈丘槐店明清清真古寺门', badgeTag: '沙颍槐园古寺' },
  '411625': { kind: 'grand_canal_granary', landmarkName: '郸城段寨古遗址黄淮粮仓', badgeTag: '黄淮优质麦仓' },
  '411702': { kind: 'ancient_post_station', landmarkName: '驿城皇家驿站古驿门楼', badgeTag: '天中千年驿站' },
  '411721': { kind: 'tiananmen_gatehouse', landmarkName: '西平中华嫘祖故里始祖殿', badgeTag: '嫘祖冶铁古源' },
  '411723': { kind: 'wanfo_pagoda_plaza', landmarkName: '平舆金代秀公戒师古砖塔', badgeTag: '防水之乡沈城' },
  '411724': { kind: 'memorial_archway_paifang', landmarkName: '正阳东汉画像石阙古牌坊', badgeTag: '中国花生之都' },
  '411728': { kind: 'wufeng_academy_cliff', landmarkName: '遂平嵖岈山丹崖石林飞阁', badgeTag: '中原盆景名山' },
  '411729': { kind: 'pingyao_city_gate', landmarkName: '新蔡春秋顿丘古城垣门楼', badgeTag: '汝水古蔡名城' },

  // === 湖北省 ===
  '420102': { kind: 'bund_shikumen', landmarkName: '汉口江汉关百年钟楼', badgeTag: '江城百年关楼' },
  '420106': { kind: 'yellow_crane_tower', landmarkName: '武汉黄鹤楼重檐千古名楼', badgeTag: '天下江山第一楼' },
  '420381': { kind: 'wufeng_academy_cliff', landmarkName: '武当山天柱峰金顶红墙', badgeTag: '太极道教仙山' },
  '420502': { kind: 'hydroelectric_arch_dam', landmarkName: '宜昌葛洲坝与西陵峡门', badgeTag: '万里长江首坝' },
  '421003': { kind: 'pingyao_city_gate', landmarkName: '荆州古城宾阳楼瓮城', badgeTag: '三国铁打荆州城' },
  '421222': { kind: 'karst_stone_watchtower', landmarkName: '通城药姑山古瑶石屋垒', badgeTag: '湘鄂赣古瑶石寨' },
  '429005': { kind: 'ancient_water_wharf', landmarkName: '潜江曹禺文化水乡楼阁', badgeTag: '江汉龙虾戏韵乡' },
  '429021': { kind: 'wufeng_academy_cliff', landmarkName: '神农架神农祭坛云海林', badgeTag: '华中屋脊生态' },
  '422801': { kind: 'cliffside_tea_terraces', landmarkName: '恩施玉露硒谷云雾梯田茶', badgeTag: '世界硒都玉露茶' },
  '422802': { kind: 'high_speed_viaduct_mountain_tunnel', landmarkName: '利川宜万高铁齐岳山隧道高架', badgeTag: '武陵高铁隧桥网' },
  '420527': { kind: 'hydroelectric_arch_dam', landmarkName: '秭归三峡高峡平湖屈原祠', badgeTag: '诗祖屈原脐橙' },
  '421181': { kind: 'high_speed_viaduct_mountain_tunnel', landmarkName: '麻城大别山高铁跨谷枢纽大桥', badgeTag: '大别山高铁枢纽' },
  '421122': { kind: 'red_revolution_memorial', landmarkName: '红安七里坪长胜街红院', badgeTag: '红安将军摇篮' },
  '421126': { kind: 'tea_house_heritage', landmarkName: '蕲春李时珍本草百草阁', badgeTag: '医圣本草艾都' },
  '420881': { kind: 'tiananmen_gatehouse', landmarkName: '钟祥明显陵红墙琉璃坊', badgeTag: '世界长寿之乡' },
  '421281': { kind: 'tea_house_heritage', landmarkName: '赤壁羊楼洞青砖茶古街', badgeTag: '万里茶道源头' },
  '421083': { kind: 'ancient_water_wharf', landmarkName: '洪湖瞿家湾百里荷塘渡', badgeTag: '红色水乡荷莲' },
  '421303': { kind: 'confucian_temple_qufu', landmarkName: '曾都炎帝神农大殿编钟', badgeTag: '编钟古乐之乡' },
  '420602': { kind: 'pingyao_city_gate', landmarkName: '襄城襄阳临汉门与隆中', badgeTag: '华夏第一城池' },
  '420281': { kind: 'industrial_heritage_loft', landmarkName: '大冶铜绿山古铜矿遗址', badgeTag: '千年青铜古都' },
  '429004': { kind: 'covered_bridge_pavilion', landmarkName: '仙桃沔阳小镇古戏水阁', badgeTag: '中国体操之乡' },
  '420103': { kind: 'bund_shikumen', landmarkName: '汉口老水塔与中山大道', badgeTag: '百年商埠金融芯' },
  '420104': { kind: 'yiwu_tradecity_jiming', landmarkName: '汉正街百年商埠与古巷', badgeTag: '天下第一街商脉' },
  '420105': { kind: 'yellow_crane_tower', landmarkName: '晴川阁与古琴台知音水', badgeTag: '高山流水知音城' },
  '420107': { kind: 'industrial_heritage_loft', landmarkName: '武钢一号高炉与红房子', badgeTag: '十里钢城文创区' },
  '420111': { kind: 'smart_science_twin_towers', landmarkName: '中国光谷研发双塔校园', badgeTag: '大学之城光谷芯' },
  '420115': { kind: 'bayong_lou', landmarkName: '江夏谭鑫培京剧古戏楼', badgeTag: '京剧鼻祖百强区' },
  '420116': { kind: 'tiananmen_gatehouse', landmarkName: '盘龙城三千年商代宫殿', badgeTag: '武汉之根木兰乡' },
  '420506': { kind: 'hydroelectric_arch_dam', landmarkName: '夷陵三峡大坝与垂直升船', badgeTag: '大国重器水电枢' },
  '420581': { kind: 'ancient_water_wharf', landmarkName: '宜都清江古渡与青林寺', badgeTag: '湖北百强化工城' },
  '420583': { kind: 'tea_house_heritage', landmarkName: '枝江百年老酒坊古木楼', badgeTag: '三峡门户酿造城' },
  '420606': { kind: 'confucian_temple_qufu', landmarkName: '樊城米公祠海岳庵古殿', badgeTag: '汉江水运商贸城' },
  '429006': { kind: 'tea_house_heritage', landmarkName: '天门陆羽茶经楼飞檐阁', badgeTag: '茶圣陆羽状元乡' },
  '420114': { kind: 'jiangnan_gardens_gate', landmarkName: '蔡甸知音湖畔花博园', badgeTag: '中法生态知音乡' },
  '420302': { kind: 'industrial_heritage_loft', landmarkName: '十堰东风汽车老厂房', badgeTag: '中国商用卡车都' },
  '420582': { kind: 'confucian_temple_qufu', landmarkName: '当阳关陵庙与玉泉寺', badgeTag: '三国长坂坡古城' },
  '420683': { kind: 'tiananmen_gatehouse', landmarkName: '枣阳汉城光武帝故里', badgeTag: '千古一帝汉乡桃' },
  '420704': { kind: 'bayong_lou', landmarkName: '鄂州观音阁万里长江', badgeTag: '吴王古都万里阁' },
  '421002': { kind: 'bund_shikumen', landmarkName: '沙市洋码头文创钟楼', badgeTag: '百年开埠轻工港' },
  '421102': { kind: 'tengwang_yueyang_tower', landmarkName: '黄州东坡赤壁二赋堂', badgeTag: '东坡文化黄冈城' },
  '421127': { kind: 'yingxian_timber_pagoda', landmarkName: '黄梅五祖寺东山禅庭', badgeTag: '禅宗祖庭黄梅戏' },
  '421202': { kind: 'geothermal_hot_spring_pavilion', landmarkName: '咸安桂花源头地热温泉亭榭', badgeTag: '中华桂花温泉乡' },
  '422823': { kind: 'diaojiaolou_stilt', landmarkName: '巴东神农溪纤夫吊脚', badgeTag: '巫峡纤夫恩施门' },
  '420222': { kind: 'west_lake_leifeng', landmarkName: '阳新仙岛湖百岛千帆望阁', badgeTag: '百湖之县仙岛' },
  '420325': { kind: 'tea_house_heritage', landmarkName: '房县西关印象千年黄酒坊', badgeTag: '诗经黄酒古县' },
  '420526': { kind: 'ancient_water_wharf', landmarkName: '兴山昭君村水上古生态廊', badgeTag: '绝美水上公路' },
  '420528': { kind: 'diaojiaolou_stilt', landmarkName: '长阳清江画廊土家吊脚楼', badgeTag: '清江巴人源头' },
  '420624': { kind: 'karst_stone_watchtower', landmarkName: '南漳春秋寨古山寨石碉楼', badgeTag: '中国最美山寨' },
  '420625': { kind: 'tea_house_heritage', landmarkName: '谷城堰河生态茶乡民俗阁', badgeTag: '汉江绿茶生态' },
  '420882': { kind: 'bamboo_courtyard_library', landmarkName: '京山网球温泉观鸟生态馆', badgeTag: '中国网球之乡' },
  '420923': { kind: 'tiananmen_gatehouse', landmarkName: '云梦睡虎地秦简博物馆阙', badgeTag: '秦简圣地云梦' },
  '421022': { kind: 'tengwang_yueyang_tower', landmarkName: '公安三袁故里荆江分洪阁', badgeTag: '三袁公安文学' },
  '421123': { kind: 'wufeng_academy_cliff', landmarkName: '罗田天堂寨大别山云海阁', badgeTag: '板栗大别明珠' },
  '421124': { kind: 'tea_house_heritage', landmarkName: '英山大别山云雾茶毕昇坊', badgeTag: '活字毕昇茶乡' },
  '422825': { kind: 'dong_wind_rain_bridge', landmarkName: '宣恩贡水河墨达楼风雨桥', badgeTag: '浪漫宣恩廊桥' },
  '422827': { kind: 'dong_wind_rain_bridge', landmarkName: '来凤卯洞土家杨梅古廊桥', badgeTag: '摆手舞文化乡' },
  '422828': { kind: 'diaojiaolou_stilt', landmarkName: '鹤峰屏山峡谷土司木屋寨', badgeTag: '容美土司茶乡' },
  '420112': { kind: 'smart_science_twin_towers', landmarkName: '东西湖国家网安科创塔', badgeTag: '武汉临空网安谷' },
  '420117': { kind: 'confucian_temple_qufu', landmarkName: '新洲问津书院千年讲坛', badgeTag: '荆楚第一古书院' },
  '420203': { kind: 'bayong_lou', landmarkName: '西塞山长江矶头古亭阁', badgeTag: '张志和渔歌子地' },
  '420303': { kind: 'industrial_heritage_loft', landmarkName: '张湾东风汽车工业遗存', badgeTag: '东方卡车之都芯' },
  '420304': { kind: 'dujiangyan_temple_weir', landmarkName: '郧阳汉江青龙山博物馆', badgeTag: '南水北调汉江源' },
  '420324': { kind: 'diaojiaolou_stilt', landmarkName: '竹溪夯土漆树山寨木楼', badgeTag: '秦巴贡茶生态县' },
  '420505': { kind: 'pingyao_city_gate', landmarkName: '猇亭三国夷陵古战城门', badgeTag: '三峡机场石化港' },
  '420529': { kind: 'tea_house_heritage', landmarkName: '五峰采花毛尖古茶坊楼', badgeTag: '武陵土家茶乡县' },
  '420682': { kind: 'ancient_water_wharf', landmarkName: '老河口汉江古水运码头', badgeTag: '楚北名埠梨花城' },
  '420684': { kind: 'tiananmen_gatehouse', landmarkName: '宜城楚皇城战国古都阙', badgeTag: '楚国故都大虾乡' },
  '420702': { kind: 'west_lake_leifeng', landmarkName: '梁子湖梁子岛江心古阁', badgeTag: '武昌鱼原产湖岛' },
  '420822': { kind: 'grand_canal_granary', landmarkName: '沙洋平湖古镇汉江漕仓', badgeTag: '江汉油菜花运河' },
  '420982': { kind: 'bayong_lou', landmarkName: '安陆白兆山李白太白楼', badgeTag: '李白十年寓居地' },
  '421081': { kind: 'ancient_water_wharf', landmarkName: '石首天鹅洲长江故道渡', badgeTag: '长江麋鹿江豚乡' },
  '421182': { kind: 'maritime_lighthouse_harbor', landmarkName: '武穴长江广济港航灯塔', badgeTag: '佛手山药鄂东港' },
  '420113': { kind: 'smart_science_twin_towers', landmarkName: '汉南车谷通航科创双塔区', badgeTag: '武汉车谷低空港' },
  '420202': { kind: 'industrial_heritage_loft', landmarkName: '黄石华新百年水泥窑遗址', badgeTag: '中国近代水泥源' },
  '420204': { kind: 'yingxian_timber_pagoda', landmarkName: '下陆东方山千年古刹山门', badgeTag: '三楚第一奇山' },
  '420205': { kind: 'industrial_heritage_loft', landmarkName: '铁山百年大冶铁矿天坑架', badgeTag: '中国矿山公园源' },
  '420322': { kind: 'covered_bridge_pavilion', landmarkName: '郧西天河七夕水乡廊桥阁', badgeTag: '中华七夕文化乡' },
  '420323': { kind: 'wufeng_academy_cliff', landmarkName: '竹山女娲山古庙与松石坊', badgeTag: '中国绿松石之乡' },
  '420503': { kind: 'sea_crossing_cable_bridge', landmarkName: '伍家岗宜昌长江大桥与塔', badgeTag: '三峡门户核心区' },
  '420504': { kind: 'tengwang_yueyang_tower', landmarkName: '点军磨基山望江楼与夷陵', badgeTag: '三峡南岸生态芯' },
  '420525': { kind: 'confucian_temple_qufu', landmarkName: '远安鸣凤山与嫘祖故里殿', badgeTag: '中华养蚕始祖地' },
  '420607': { kind: 'wufeng_academy_cliff', landmarkName: '襄州鹿门山诗隐古刹亭阁', badgeTag: '孟浩然诗隐名山' },
  '420626': { kind: 'wufeng_academy_cliff', landmarkName: '保康尧治河高山峡谷飞阁', badgeTag: '鄂西北磷矿转型' },
  '420703': { kind: 'bamboo_courtyard_library', landmarkName: '华容红莲湖武鄂科创书院', badgeTag: '武鄂同城光谷东' },
  '420802': { kind: 'confucian_temple_qufu', landmarkName: '东宝象山书院陆九渊讲堂', badgeTag: '心学象山讲学地' },
  '420804': { kind: 'smart_science_twin_towers', landmarkName: '掇刀新能源动力电池科创', badgeTag: '华中新能源智造' },
  '420902': { kind: 'memorial_archway_paifang', landmarkName: '孝南董永公园中华孝德坊', badgeTag: '中华孝文化之都' },
  '420921': { kind: 'karst_stone_watchtower', landmarkName: '孝昌双峰山白云古石寨门', badgeTag: '大别山南麓茶乡' },
  '420922': { kind: 'red_revolution_memorial', landmarkName: '大悟中原突围纪念馆红楼', badgeTag: '全国著名将军县' },
  '420981': { kind: 'salt_well_derrick', landmarkName: '应城千年膏盐古井与盐池', badgeTag: '中华膏盐矿之都' },
  '420984': { kind: 'ancient_water_wharf', landmarkName: '汉川汈汊湖百里荷塘古渡', badgeTag: '江汉百强纺织城' },
  '421024': { kind: 'ancient_water_wharf', landmarkName: '江陵镇安寺铁牛古矶码头', badgeTag: '千里荆江镇水牛' },
  '421087': { kind: 'hydroelectric_arch_dam', landmarkName: '松滋洈水土坝水利生态区', badgeTag: '荆楚江南白云边' },
  '421088': { kind: 'red_revolution_memorial', landmarkName: '监利周老嘴湘鄂西红军院', badgeTag: '中国面点师之乡' },
  '421121': { kind: 'huizhou_matouqiang', landmarkName: '团风林家大塆鄂东古民居', badgeTag: '鄂东钢构建筑乡' },
  '421125': { kind: 'bamboo_courtyard_library', landmarkName: '浠水闻一多纪念馆红烛书', badgeTag: '闻一多红烛故里' },
  '421221': { kind: 'ancient_water_wharf', landmarkName: '嘉鱼簰洲湾江堤古渡水阁', badgeTag: '江南蔬菜之乡城' },
  '421223': { kind: 'dujiangyan_temple_weir', landmarkName: '崇阳白霓千年古堰水利桥', badgeTag: '世界灌溉遗产堰' },
  '421224': { kind: 'wufeng_academy_cliff', landmarkName: '通山九宫山真君石殿飞阁', badgeTag: '鄂南避暑核电城' },
  '421321': { kind: 'tiananmen_gatehouse', landmarkName: '随县炎帝神农故里谒祖殿', badgeTag: '中华始祖炎帝乡' },
  '421381': { kind: 'jiayuguan_pass_fortress', landmarkName: '广水武胜关千年荆楚雄关', badgeTag: '中华九大名关城' },
  '422822': { kind: 'high_speed_viaduct_mountain_tunnel', landmarkName: '建始宜万高铁野三河高架大桥', badgeTag: '鄂西绝壁高铁桥' },
  '422826': { kind: 'karst_stone_watchtower', landmarkName: '咸丰唐崖土司世界遗产城', badgeTag: '世界遗产唐崖城' },

  // === 湖南省 ===
  '430104': { kind: 'confucian_temple_qufu', landmarkName: '岳麓书院讲堂与爱晚亭', badgeTag: '千年学府岳麓山' },
  '430181': { kind: 'modern_civic_opera', landmarkName: '浏阳天空剧院数字焰火馆', badgeTag: '世界花炮之都' },
  '430382': { kind: 'red_revolution_memorial', landmarkName: '韶山红瓦农舍与铜像广场', badgeTag: '伟人故里红旅核' },
  '430602': { kind: 'tengwang_yueyang_tower', landmarkName: '岳阳楼洞庭湖纯木盔顶阁', badgeTag: '洞庭天下水名楼' },
  '430811': { kind: 'wufeng_academy_cliff', landmarkName: '武陵源天子山奇峰云阁', badgeTag: '三千奇峰张家界' },
  '433123': { kind: 'diaojiaolou_stilt', landmarkName: '凤凰古城沱江吊脚楼群', badgeTag: '湘西边城吊脚楼' },
  '430182': { kind: 'modern_civic_opera', landmarkName: '宁乡炭河里青铜博物院', badgeTag: '南中国青铜城' },
  '430281': { kind: 'ceramic_dragon_kiln_chimney', landmarkName: '醴陵沩山古龙窑与釉下五彩窑', badgeTag: '釉下五彩古龙窑' },
  '430225': { kind: 'tiananmen_gatehouse', landmarkName: '炎陵炎帝陵午门古柏殿', badgeTag: '中华民族始祖' },
  '430412': { kind: 'wufeng_academy_cliff', landmarkName: '南岳衡山祝融峰古殿阁', badgeTag: '五岳独秀南岳' },
  '431230': { kind: 'dong_wind_rain_bridge', landmarkName: '通道皇都回龙五亭风雨桥', badgeTag: '百里侗文化廊' },
  '431228': { kind: 'memorial_archway_paifang', landmarkName: '芷江受降纪念血字石坊', badgeTag: '胜利之城和平' },
  '431281': { kind: 'huizhou_matouqiang', landmarkName: '洪江古商城青砖窨子屋', badgeTag: '中华商业故宫' },
  '433127': { kind: 'diaojiaolou_stilt', landmarkName: '永顺芙蓉镇瀑布吊脚楼', badgeTag: '挂在瀑布古镇' },
  '433130': { kind: 'dong_wind_rain_bridge', landmarkName: '龙山惹巴拉土家风雨桥', badgeTag: '里耶秦简之乡' },
  '430528': { kind: 'red_sandstone_danxia_arch', landmarkName: '新宁崀山丹霞赤壁天生桥', badgeTag: '崀山赤岩天生拱' },
  '431081': { kind: 'ancient_water_wharf', landmarkName: '资兴小东江翠雾渔舟渡', badgeTag: '雾漫东江湖影' },
  '431125': { kind: 'ancestral_taiji_hall', landmarkName: '江永上甘棠月陂亭古村', badgeTag: '世界女书圣地' },
  '430923': { kind: 'tea_horse_caravan_gate', landmarkName: '安化万里茶道黑茶古驿坊', badgeTag: '万里茶道黑茶' },
  '430725': { kind: 'bamboo_courtyard_library', landmarkName: '桃源桃花源秦谷竹林院', badgeTag: '世外桃源原型' },
  '430626': { kind: 'karst_stone_watchtower', landmarkName: '平江石牛寨丹霞悬崖堡', badgeTag: '将军县幕阜山' },
  '433124': { kind: 'diaojiaolou_stilt', landmarkName: '花垣边城茶峒吊脚渡亭', badgeTag: '翠翠边城茶峒' },
  '430102': { kind: 'smart_science_twin_towers', landmarkName: '长沙国金双塔与五一芯', badgeTag: '星城商贸金融核' },
  '430103': { kind: 'pingyao_city_gate', landmarkName: '长沙天心阁明清古城楼', badgeTag: '楚汉名城古阁芯' },
  '430105': { kind: 'modern_civic_opera', landmarkName: '马栏山视谷馆与开福寺', badgeTag: '中国视谷文创极' },
  '430111': { kind: 'hsr_modern_hub', landmarkName: '长沙高铁南站飞翼枢纽', badgeTag: '中部高铁商贸极' },
  '430121': { kind: 'industrial_heritage_loft', landmarkName: '星沙智造工程机械基地', badgeTag: '中西部百强首县' },
  '430224': { kind: 'pingyao_city_gate', landmarkName: '茶陵南宋古城墙与铁犀', badgeTag: '茶祖红色古州城' },
  '430822': { kind: 'red_revolution_memorial', landmarkName: '桑植红二方面军纪念馆', badgeTag: '民歌之乡红色县' },
  '431026': { kind: 'geothermal_hot_spring_pavilion', landmarkName: '汝城热水高温氡温泉亭榭', badgeTag: '华南高温氡温泉' },
  '430702': { kind: 'ancient_water_wharf', landmarkName: '常德诗墙与大小河街渡', badgeTag: '桃花源里沅江城' },
  '430112': { kind: 'porcelain_dragon_kiln', landmarkName: '望城铜官窑古窑遗址', badgeTag: '海上丝路唐彩瓷' },
  '430203': { kind: 'yiwu_tradecity_jiming', landmarkName: '株洲芦淞服饰商贸城', badgeTag: '中南服饰动力城' },
  '430302': { kind: 'bayong_lou', landmarkName: '湘潭万楼与窑湾古渡', badgeTag: '莲城湘潭齐白石' },
  '430407': { kind: 'confucian_temple_qufu', landmarkName: '衡阳石鼓书院合江亭', badgeTag: '四大书院湘蒸汇' },
  '430524': { kind: 'diaojiaolou_stilt', landmarkName: '隆回花瑶虎形山古寨', badgeTag: '魏源故里金银花' },
  '430681': { kind: 'tengwang_yueyang_tower', landmarkName: '汨罗屈子祠与端午阁', badgeTag: '端午源头诗歌乡' },
  '430802': { kind: 'wufeng_academy_cliff', landmarkName: '张家界天门山绝壁阁', badgeTag: '天门奇观土家门' },
  '431002': { kind: 'tengwang_yueyang_tower', landmarkName: '郴州北湖公园与义帝', badgeTag: '湘粤门户仰天湖' },
  '431102': { kind: 'confucian_temple_qufu', landmarkName: '零陵柳子庙千年古街', badgeTag: '潇湘源头柳宗元' },
  '431322': { kind: 'terraced_rice_pavilion', landmarkName: '新化紫鹊界秦人梯田', badgeTag: '梅山武术文印乡' },
  '433101': { kind: 'sea_crossing_cable_bridge', landmarkName: '吉首矮寨悬索奇观桥', badgeTag: '湘西州府乾州城' },
  '431227': { kind: 'dong_wind_rain_bridge', landmarkName: '新晃夜郎古寨龙溪风雨桥', badgeTag: '湘西侗乡黄牛' },
  '431229': { kind: 'dong_wind_rain_bridge', landmarkName: '靖州地笋苗寨五亭风雨桥', badgeTag: '中国杨梅苗侗' },
  '430529': { kind: 'dong_wind_rain_bridge', landmarkName: '城步南山牧场侗苗风雨桥', badgeTag: '南方呼伦贝尔' },
  '430527': { kind: 'dong_wind_rain_bridge', landmarkName: '绥宁上堡侗寨黄桑风雨桥', badgeTag: '神奇绿洲侗寨' },
  '431225': { kind: 'dongyang_luzhai_mansion', landmarkName: '会同高椅古村明清梅花宅', badgeTag: '湘西南古村落' },
  '430423': { kind: 'wufeng_academy_cliff', landmarkName: '衡山萱洲古镇湘江书院阁', badgeTag: '南岳东麓古镇' },
  '430481': { kind: 'bamboo_courtyard_library', landmarkName: '耒阳蔡伦纪念园古造纸馆', badgeTag: '千年纸圣故里' },
  '430581': { kind: 'pingyao_city_gate', landmarkName: '武冈古城凌云塔明城墙门', badgeTag: '卤菜古都王城' },
  '430922': { kind: 'bamboo_sea_watchtower', landmarkName: '桃江桃花江竹海观涛阁', badgeTag: '中国竹海美人' },
  '431021': { kind: 'memorial_archway_paifang', landmarkName: '桂阳阳山古村明清石牌坊', badgeTag: '湘南千年古郡' },
  '431022': { kind: 'high_speed_viaduct_mountain_tunnel', landmarkName: '宜章京广高铁南岭跨谷隧道桥', badgeTag: '南岭穿山高铁群' },
  '431124': { kind: 'confucian_temple_qufu', landmarkName: '道县周敦颐故里濂溪书院', badgeTag: '理学鼻祖脐橙' },
  '431126': { kind: 'tiananmen_gatehouse', landmarkName: '宁远九嶷山舜帝陵重檐殿', badgeTag: '德孝九嶷圣地' },
  '431129': { kind: 'diaojiaolou_stilt', landmarkName: '江华瑶都水口古镇吊脚楼', badgeTag: '神州瑶都电机' },
  '431222': { kind: 'wufeng_academy_cliff', landmarkName: '沅陵二酉山中华书山圣阁', badgeTag: '中华书山碣滩' },
  '431321': { kind: 'dongyang_luzhai_mansion', landmarkName: '双峰曾国藩故居富厚堂宅', badgeTag: '湘军故里农机' },
  '433122': { kind: 'ancient_water_wharf', landmarkName: '泸溪浦市古镇沅水商码头', badgeTag: '沅水明珠浦市' },
  '433126': { kind: 'tea_house_heritage', landmarkName: '古丈墨戎苗寨古丈毛尖阁', badgeTag: '中国毛尖茶乡' },
  '430204': { kind: 'hsr_modern_hub', landmarkName: '石峰中车电力机车智园', badgeTag: '中国电力机车都' },
  '430223': { kind: 'wufeng_academy_cliff', landmarkName: '攸县阳升观书院湘东阁', badgeTag: '湘东门户油茶乡' },
  '430381': { kind: 'confucian_temple_qufu', landmarkName: '湘乡东山书院晚清古院', badgeTag: '湖湘书院伟人母' },
  '430406': { kind: 'tengwang_yueyang_tower', landmarkName: '雁峰回雁峰南岳第一阁', badgeTag: '衡阳雁城历史芯' },
  '430482': { kind: 'industrial_heritage_loft', landmarkName: '常宁水口山工人运动馆', badgeTag: '世界铅都茶油乡' },
  '430611': { kind: 'tea_house_heritage', landmarkName: '君山岛洞庭银针古茶楼', badgeTag: '君山银针爱情岛' },
  '430624': { kind: 'dongyang_luzhai_mansion', landmarkName: '湘阴左宗棠柳庄古宅院', badgeTag: '左公故里柳庄乡' },
  '430721': { kind: 'ancient_water_wharf', landmarkName: '安乡汤家岗遗址水乡渡', badgeTag: '洞庭鱼米酱卤城' },
  '430723': { kind: 'pingyao_city_gate', landmarkName: '澧县城头山中国第一城', badgeTag: '中华农耕稻作源' },
  '430726': { kind: 'tea_house_heritage', landmarkName: '石门夹山寺茶禅祖庭阁', badgeTag: '中华茶禅之源县' },
  '430821': { kind: 'sea_crossing_cable_bridge', landmarkName: '慈利大峡谷云天渡大桥', badgeTag: '世界最长峡谷桥' },
  '431027': { kind: 'memorial_archway_paifang', landmarkName: '桂东沙田三大纪律牌坊', badgeTag: '罗霄山红军军规' },
  '431103': { kind: 'dongyang_luzhai_mansion', landmarkName: '冷水滩湘江文昌古阁院', badgeTag: '永州中心生态城' },
  '431123': { kind: 'bamboo_courtyard_library', landmarkName: '双牌阳明山十万亩竹院', badgeTag: '潇湘竹海和文化' },
  '431223': { kind: 'industrial_heritage_loft', landmarkName: '辰溪抗战西南兵工遗址', badgeTag: '沅江中游书香县' },
  '431224': { kind: 'wufeng_academy_cliff', landmarkName: '溆浦思蒙丹霞屈原书院', badgeTag: '湘西抗日雪峰城' },
  '431381': { kind: 'industrial_heritage_loft', landmarkName: '冷水江锡矿山世界锑都', badgeTag: '世界锑都百年矿' },
  '433125': { kind: 'tea_house_heritage', landmarkName: '保靖吕洞山黄金茶寨楼', badgeTag: '湘西黄金茶之乡' },
  '430202': { kind: 'smart_science_twin_towers', landmarkName: '荷塘航空动力智造研发塔', badgeTag: '中国中小航空核' },
  '430211': { kind: 'wanfo_pagoda_plaza', landmarkName: '天元神农城神农塔大剧院', badgeTag: '动力之都炎帝城' },
  '430212': { kind: 'red_revolution_memorial', landmarkName: '渌口杨得志故居红色纪念', badgeTag: '将军故里湘江湾' },
  '430304': { kind: 'wufeng_academy_cliff', landmarkName: '岳塘昭山古寺湘江悬崖阁', badgeTag: '长株潭绿心昭山' },
  '430321': { kind: 'red_revolution_memorial', landmarkName: '湘潭乌石彭德怀纪念馆院', badgeTag: '元帅故里莲湘乡' },
  '430405': { kind: 'red_revolution_memorial', landmarkName: '珠晖衡阳保卫战纪念碑阁', badgeTag: '湘南抗战名城芯' },
  '430408': { kind: 'bamboo_courtyard_library', landmarkName: '蒸湘雨母山生态书院古观', badgeTag: '雁城西郊大学城' },
  '430421': { kind: 'confucian_temple_qufu', landmarkName: '衡阳王船山故居湘西草堂', badgeTag: '船山思想发源地' },
  '430422': { kind: 'ancient_water_wharf', landmarkName: '衡南江口鸟洲湘江古渡洲', badgeTag: '江南候鸟天堂洲' },
  '430424': { kind: 'red_revolution_memorial', landmarkName: '衡东荣桓镇罗荣桓纪念馆', badgeTag: '元帅故里土菜都' },
  '430426': { kind: 'tea_house_heritage', landmarkName: '祁东洪桥黄花菜非遗古坊', badgeTag: '中国黄花菜之乡' },
  '430502': { kind: 'wanfo_pagoda_plaza', landmarkName: '双清邵阳东塔与蔡锷旧居', badgeTag: '护国军神邵阳芯' },
  '430503': { kind: 'pingyao_city_gate', landmarkName: '大祥宝庆古城墙与双江楼', badgeTag: '千年宝庆古城芯' },
  '430511': { kind: 'wanfo_pagoda_plaza', landmarkName: '北塔资江明代北塔古寺阁', badgeTag: '资水镇洪明代塔' },
  '430522': { kind: 'wufeng_academy_cliff', landmarkName: '新邵白水洞悬崖飞瀑古亭', badgeTag: '湘中秘境白水洞' },
  '430523': { kind: 'red_revolution_memorial', landmarkName: '邵阳塘田市战时讲学旧址', badgeTag: '中国油茶夫夷城' },
  '430525': { kind: 'ancestral_taiji_hall', landmarkName: '洞口高沙古镇百年宗祠群', badgeTag: '中国雪峰蜜橘乡' },
  '430582': { kind: 'dongyang_luzhai_mansion', landmarkName: '邵东荫家堂清代百间古宅', badgeTag: '百工之乡南药都' },
  '430603': { kind: 'industrial_heritage_loft', landmarkName: '云溪巴陵石化与陆城古渡', badgeTag: '长江绿色石化城' },
  '430621': { kind: 'ancestral_taiji_hall', landmarkName: '岳阳张谷英村明清巨族屋', badgeTag: '民间故宫第一村' },
  '430623': { kind: 'wanfo_pagoda_plaza', landmarkName: '华容状元湖宝慈观古石塔', badgeTag: '中国芥菜洞庭乡' },
  '430682': { kind: 'tea_house_heritage', landmarkName: '临湘聂市黑茶万里茶道坊', badgeTag: '万里茶道源头镇' },
  '430703': { kind: 'covered_bridge_pavilion', landmarkName: '鼎城花岩溪白鹭湖木廊桥', badgeTag: '中华诗词之市芯' },
  '430722': { kind: 'ancient_water_wharf', landmarkName: '汉寿西洞庭湖湿地古渡口', badgeTag: '中国甲鱼之乡县' },
  '430724': { kind: 'red_revolution_memorial', landmarkName: '临澧林伯渠故居红色纪念', badgeTag: '延安五老林老里' },
  '430781': { kind: 'ancient_water_wharf', landmarkName: '津市澧水古埠头与药山寺', badgeTag: '湘北工业古埠头' },
  '430902': { kind: 'bayong_lou', landmarkName: '资阳资江明清古巷魁星楼', badgeTag: '千里银城明清巷' },
  '430903': { kind: 'bamboo_courtyard_library', landmarkName: '赫山清溪村周立波文学馆', badgeTag: '中国文学清溪村' },
  '430921': { kind: 'red_revolution_memorial', landmarkName: '南县厂窖纪念碑馆松柏院', badgeTag: '洞庭湖稻虾米乡' },
  '430981': { kind: 'wanfo_pagoda_plaza', landmarkName: '沅江南洞庭湖凌云古塔影', badgeTag: '洞庭湖鱼米芦苇' },
  '431003': { kind: 'red_sandstone_danxia_arch', landmarkName: '苏仙飞天山高椅岭赤丹霞', badgeTag: '郴州赤壁丹霞道' },
  '431023': { kind: 'red_sandstone_danxia_arch', landmarkName: '永兴便江高椅岭丹霞栈道', badgeTag: '湘南赤壁丹霞奇' },
  '431024': { kind: 'dongyang_luzhai_mansion', landmarkName: '嘉禾普济古镇百年民居堂', badgeTag: '江南铸都伴嫁歌' },
  '431025': { kind: 'wanfo_pagoda_plaza', landmarkName: '临武秀岩风景区文峰古塔', badgeTag: '湘南通天玉石城' },
  '431028': { kind: 'terraced_rice_pavilion', landmarkName: '安仁神农故地千亩稻田亭', badgeTag: '中华药王赶分社' },
  '431122': { kind: 'dongyang_luzhai_mansion', landmarkName: '东安树德山庄民国砖木院', badgeTag: '中华武术之乡县' },
  '431127': { kind: 'terraced_rice_pavilion', landmarkName: '蓝山云冰山高山云海竹屋', badgeTag: '湘江源头皮具城' },
  '431128': { kind: 'ancestral_taiji_hall', landmarkName: '新田龙家大院千年楹联祠', badgeTag: '中国富硒长寿乡' },
  '431181': { kind: 'grotto_cliff_buddha', landmarkName: '祁阳浯溪碑林摩崖石刻壁', badgeTag: '元结颜真卿碑林' },
  '431202': { kind: 'inland_dryport_railhub', landmarkName: '鹤城怀化国际陆港班列枢', badgeTag: '西部陆海东盟港' },
  '431221': { kind: 'ancestral_taiji_hall', landmarkName: '中方荆坪古村潘氏古宗祠', badgeTag: '舞水古村葡萄乡' },
  '431226': { kind: 'diaojiaolou_stilt', landmarkName: '麻阳苗乡长寿盘瓠吊脚寨', badgeTag: '中国冰糖橙长寿' },
  '431302': { kind: 'modern_civic_opera', landmarkName: '娄星娄底体育中心与珠山', badgeTag: '湘中钢城娄底芯' },
  '431382': { kind: 'wufeng_academy_cliff', landmarkName: '涟源湄江十里画廊丹崖阁', badgeTag: '湘中龙山药材乡' },

  // === 广东省 ===
  '440104': { kind: 'canton_tower_qilou', landmarkName: '镇海楼与北京路广府骑楼', badgeTag: '千年羊城越秀脉' },
  '440106': { kind: 'canton_tower_qilou', landmarkName: '广州塔小蛮腰与珠江双塔', badgeTag: '花城羊城天际线' },
  '440304': { kind: 'mangrove_bird_boardwalk', landmarkName: '福田红树林湿地观鸟栈', badgeTag: '鹏城红树林湾' },
  '440305': { kind: 'smart_science_twin_towers', landmarkName: '深圳湾春笋与高新双塔', badgeTag: '中国硅谷南山极' },
  '440402': { kind: 'modern_civic_opera', landmarkName: '珠海日月贝大剧院海岛', badgeTag: '伶仃洋畔日月贝' },
  '440606': { kind: 'floating_water_market', landmarkName: '顺德逢简水乡廊棚船市', badgeTag: '世界美食智造核' },
  '440783': { kind: 'karst_stone_watchtower', landmarkName: '开平赤坎中西合璧古碉楼', badgeTag: '世界遗产侨乡碉楼' },
  '445102': { kind: 'covered_bridge_pavilion', landmarkName: '潮州广济桥十八梭船古亭', badgeTag: '中国四大古名桥' },
  '445103': { kind: 'minnan_swallowtail_qilou', landmarkName: '潮安龙湖古寨与单丛茶舍', badgeTag: '潮汕侨乡单丛茶' },
  '440523': { kind: 'island_wind_turbine_bay', landmarkName: '南澳岛海湾风机群与风廊', badgeTag: '南海海岛风电场' },
  '445122': { kind: 'fujian_tulou_round', landmarkName: '饶平道韵楼八角客家楼', badgeTag: '八角客家土楼' },
  '441881': { kind: 'karst_stone_watchtower', landmarkName: '英德英西峰林喀斯特阁', badgeTag: '中国红茶之乡' },
  '441826': { kind: 'karst_stone_watchtower', landmarkName: '连南南岗千年瑶寨石楼', badgeTag: '排瑶歌唱之乡' },
  '440224': { kind: 'red_sandstone_danxia_arch', landmarkName: '仁化丹霞山赤壁石拱栈道', badgeTag: '中国红石丹霞地' },
  '440282': { kind: 'memorial_archway_paifang', landmarkName: '南雄珠玑古巷寻根牌坊', badgeTag: '广府祖源银杏' },
  '441323': { kind: 'maritime_lighthouse_harbor', landmarkName: '惠东双月湾灯塔海湾亭', badgeTag: '双月湾女鞋城' },
  '441322': { kind: 'wufeng_academy_cliff', landmarkName: '博罗罗浮山冲虚古观阁', badgeTag: '岭南第一名山' },
  '440781': { kind: 'bund_shikumen', landmarkName: '台山梅家大院南洋洋楼', badgeTag: '第一侨乡排球' },
  '440705': { kind: 'jiangnan_gardens_gate', landmarkName: '新会梁启超故居与陈皮', badgeTag: '千年陈皮侨乡' },
  '440825': { kind: 'volcanic_basalt_sea_stack', landmarkName: '徐闻灯楼角火山玄武岩海蚀柱', badgeTag: '大陆最南火山礁' },
  '440882': { kind: 'mangrove_bird_boardwalk', landmarkName: '雷州九龙山红树林候鸟塔', badgeTag: '雷州红树林湿地' },
  '441403': { kind: 'hakka_weilongwu', landmarkName: '梅县雁南飞半月塘围龙屋', badgeTag: '世界客都茶田' },
  '441422': { kind: 'fujian_tulou_round', landmarkName: '大埔花萼楼客家大圆楼', badgeTag: '客家圆楼陶都' },
  '441581': { kind: 'minnan_swallowtail_qilou', landmarkName: '陆丰玄武山元山寺飞檐', badgeTag: '福佬滨海名刹' },
  '440604': { kind: 'lingnan_wok_ear_hall', landmarkName: '佛山祖庙镬耳山墙戏台', badgeTag: '岭南武术陶艺' },
  '440118': { kind: 'canton_tower_qilou', landmarkName: '增城正果老街广府骑楼', badgeTag: '挂绿荔枝生态' },
  '445281': { kind: 'minnan_swallowtail_qilou', landmarkName: '普宁德安里潮汕大厝群', badgeTag: '中药纺织名城' },
  '440103': { kind: 'lingnan_wok_ear_hall', landmarkName: '陈家祠镬耳山墙宗祠书院', badgeTag: '千年西关广府源' },
  '440105': { kind: 'modern_civic_opera', landmarkName: '琶洲国际会展穹顶水岸', badgeTag: '数字会展湿地岛' },
  '440111': { kind: 'hsr_modern_hub', landmarkName: '白云国际航空枢纽双翼', badgeTag: '空港物流白云山' },
  '440112': { kind: 'smart_science_twin_towers', landmarkName: '黄埔科学城科创研发塔', badgeTag: '湾区智造科学城' },
  '440113': { kind: 'lingnan_wok_ear_hall', landmarkName: '番禺沙湾留耕堂镬耳宗祠', badgeTag: '广州大学城珠江' },
  '440114': { kind: 'lingnan_wok_ear_hall', landmarkName: '花都资政大夫祠镬耳古院', badgeTag: '中国皮具花都港' },
  '440115': { kind: 'automated_deepwater_port_crane', landmarkName: '广州南沙四期自动化码头', badgeTag: '湾区自动化深水港' },
  '440117': { kind: 'geothermal_hot_spring_pavilion', landmarkName: '从化流溪河苏打温泉亭榭', badgeTag: '北回归线苏打温泉' },
  '440303': { kind: 'pingan_harbor_skyline', landmarkName: '罗湖京基双塔与口岸湾', badgeTag: '特区商贸发祥地' },
  '440306': { kind: 'hsr_modern_hub', landmarkName: '宝安空港飞翼与滨海湾', badgeTag: '湾区先进制造极' },
  '440307': { kind: 'hakka_weilongwu', landmarkName: '鹤湖新居客家围龙大屋', badgeTag: '深圳东部科创核' },
  '440308': { kind: 'automated_deepwater_port_crane', landmarkName: '盐田国际深水集装箱岸桥港', badgeTag: '华南深水集装箱港' },
  '440309': { kind: 'hsr_modern_hub', landmarkName: '深圳北站高铁飞翼枢纽', badgeTag: '湾区数字制造极' },
  '440310': { kind: 'smart_science_twin_towers', landmarkName: '坪山新能源汽车智造塔', badgeTag: '新能源医药新城' },
  '440311': { kind: 'smart_science_twin_towers', landmarkName: '光明科学城科创双子塔', badgeTag: '湾区科学城新城' },
  '440605': { kind: 'pingan_harbor_skyline', landmarkName: '千灯湖高新与西樵山阁', badgeTag: '广佛智造百强区' },
  '440607': { kind: 'wanfo_pagoda_plaza', landmarkName: '三水魁岗文塔与老车站', badgeTag: '中国饮料之都区' },
  '440403': { kind: 'canton_tower_qilou', landmarkName: '斗门古街骑楼与菉猗堂', badgeTag: '珠江西岸生态城' },
  '440511': { kind: 'canton_tower_qilou', landmarkName: '汕头小公园百载商埠楼', badgeTag: '百年开埠侨乡芯' },
  '440515': { kind: 'lingnan_wok_ear_hall', landmarkName: '澄海陈慈黉故居镬耳大院', badgeTag: '中国玩具礼品都' },
  '441302': { kind: 'west_lake_leifeng', landmarkName: '惠州西湖泗洲古塔与桥', badgeTag: '半城山色半城湖' },
  '441202': { kind: 'pingyao_city_gate', landmarkName: '肇庆宋城墙与披云古楼', badgeTag: '岭南端砚历史城' },
  '440803': { kind: 'bund_shikumen', landmarkName: '广州湾法式公使署旧址', badgeTag: '湛江开埠港湾城' },
  '440204': { kind: 'canton_tower_qilou', landmarkName: '韶关风采楼与百年街', badgeTag: '粤北门户张九龄' },
  '440404': { kind: 'modern_civic_opera', landmarkName: '金湾市民艺术中心馆', badgeTag: '珠海航空航天城' },
  '440513': { kind: 'wanfo_pagoda_plaza', landmarkName: '潮阳文光塔宋代古塔', badgeTag: '潮剧英歌千年县' },
  '440608': { kind: 'tea_house_heritage', landmarkName: '高明皂幕山生态茶阁', badgeTag: '佛山西部绿色城' },
  '440703': { kind: 'bund_shikumen', landmarkName: '江门启明里百年侨宅', badgeTag: '中国侨都摩托城' },
  '440802': { kind: 'canton_tower_qilou', landmarkName: '湛江赤坎老街古商埠', badgeTag: '南路商埠老城芯' },
  '440904': { kind: 'maritime_lighthouse_harbor', landmarkName: '电白中国第一滩灯塔', badgeTag: '沉香之乡滨海区' },
  '441203': { kind: 'wufeng_academy_cliff', landmarkName: '鼎湖山庆云寺飞水阁', badgeTag: '北回归线绿洲氧' },
  '441402': { kind: 'hakka_weilongwu', landmarkName: '梅州客天下围龙古院落', badgeTag: '世界客都嘉应城' },
  '441521': { kind: 'red_revolution_memorial', landmarkName: '海丰红宫红场纪念院', badgeTag: '革命先驱红宫城' },
  '441702': { kind: 'modern_civic_opera', landmarkName: '海陵岛南海一号展馆', badgeTag: '海上丝路沉船湾' },
  '441802': { kind: 'ancient_water_wharf', landmarkName: '清远飞霞古渡北江阁', badgeTag: '北江山水温泉城' },
  '445202': { kind: 'pingyao_city_gate', landmarkName: '揭阳进贤门与孔学宫', badgeTag: '岭南古城玉都芯' },
  '441423': { kind: 'geothermal_hot_spring_pavilion', landmarkName: '丰顺地热温泉雾气疗养亭', badgeTag: '粤东温泉之城' },
  '441424': { kind: 'hakka_weilongwu', landmarkName: '五华狮雄山客家围龙屋', badgeTag: '足球之乡围龙' },
  '441426': { kind: 'hakka_weilongwu', landmarkName: '平远南台山五指围龙屋', badgeTag: '橙乡客家围屋' },
  '441427': { kind: 'hakka_weilongwu', landmarkName: '蕉岭丘逢甲故居围龙屋', badgeTag: '世界长寿客乡' },
  '441481': { kind: 'hakka_weilongwu', landmarkName: '兴宁熙和湾花萼围龙屋', badgeTag: '中国围龙屋乡' },
  '441622': { kind: 'hakka_weilongwu', landmarkName: '龙川佗城越王井客家围', badgeTag: '岭南千年古邑' },
  '440222': { kind: 'hakka_weilongwu', landmarkName: '始兴满堂客家大围石屋', badgeTag: '中国围楼之乡' },
  '441303': { kind: 'hakka_weilongwu', landmarkName: '惠阳秋长碧滟楼客家围', badgeTag: '吉他客家围屋' },
  '440784': { kind: 'lingnan_wok_ear_hall', landmarkName: '鹤山古劳水乡镬耳宗祠', badgeTag: '咏春水乡宗祠' },
  '440981': { kind: 'lingnan_wok_ear_hall', landmarkName: '高州冼太庙镬耳飞檐殿', badgeTag: '荔枝龙眼古城' },
  '441226': { kind: 'lingnan_wok_ear_hall', landmarkName: '德庆学宫龙母祖庙宗祠', badgeTag: '岭南千年孔庙' },
  '441284': { kind: 'lingnan_wok_ear_hall', landmarkName: '四会贞山古村镬耳书院', badgeTag: '中国柑桔玉器' },
  '445321': { kind: 'lingnan_wok_ear_hall', landmarkName: '新兴国恩寺禅宗六祖堂', badgeTag: '禅宗六祖祖庭' },
  '445381': { kind: 'lingnan_wok_ear_hall', landmarkName: '罗定学宫文塔镬耳古堂', badgeTag: '肉桂稻米名城' },
  '440203': { kind: 'smart_science_twin_towers', landmarkName: '韶关武江科创中心大桥', badgeTag: '粤北枢纽新城' },
  '440507': { kind: 'canton_tower_qilou', landmarkName: '汕头龙湖海湾金融商街', badgeTag: '特区海湾商芯' },
  '440881': { kind: 'tea_house_heritage', landmarkName: '廉江鹤地水库红橙茶阁', badgeTag: '中国红橙家电' },
  '441882': { kind: 'subterranean_karst_cavern_hall', landmarkName: '连州地下河溶洞石笋暗河栈道', badgeTag: '岭南地下河溶洞' },
  '440205': { kind: 'wufeng_academy_cliff', landmarkName: '曲江南华禅寺六祖祖庭', badgeTag: '禅宗六祖马坝人' },
  '440232': { kind: 'diaojiaolou_stilt', landmarkName: '乳源过山瑶云门大峡谷', badgeTag: '世界过山瑶之乡' },
  '440281': { kind: 'wufeng_academy_cliff', landmarkName: '乐昌坪石国立中山大学', badgeTag: '粤北华南研学地' },
  '440512': { kind: 'pingyao_city_gate', landmarkName: '濠江达濠袖珍明清古城', badgeTag: '中国最小袖珍城' },
  '440785': { kind: 'hsr_modern_hub', landmarkName: '恩平冯如故居航空文化馆', badgeTag: '温泉航空华侨城' },
  '440804': { kind: 'maritime_lighthouse_harbor', landmarkName: '坡头南三岛海湾灯塔岸', badgeTag: '湛江湾海工港城' },
  '440883': { kind: 'volcanic_stone_village', landmarkName: '吴川茂山书院滨海炮台', badgeTag: '粤西建筑飘色乡' },
  '440982': { kind: 'confucian_temple_qufu', landmarkName: '化州学宫孔庙橘红古城', badgeTag: '中国化橘红之乡' },
  '440983': { kind: 'canton_tower_qilou', landmarkName: '信宜窦州古城大成骑楼', badgeTag: '粤西玉都三华李' },
  '441204': { kind: 'ancestral_taiji_hall', landmarkName: '高要黎槎八卦古村祠堂', badgeTag: '粤西广府八卦村' },
  '441225': { kind: 'tengwang_yueyang_tower', landmarkName: '封开两广交汇广信塔楼', badgeTag: '岭南古都广信源' },
  '441324': { kind: 'geothermal_hot_spring_pavilion', landmarkName: '龙门南昆山地热温泉木亭榭', badgeTag: '岭南温泉康养乡' },
  '441625': { kind: 'hakka_weilongwu', landmarkName: '东源仙坑客家八角围屋', badgeTag: '万绿湖生态水源' },
  '441803': { kind: 'lingnan_wok_ear_hall', landmarkName: '清新太和古洞镬耳古宗', badgeTag: '清远鸡漂流之乡' },
  '445224': { kind: 'island_wind_turbine_bay', landmarkName: '惠来石碑山海上风电海湾', badgeTag: '粤东海上风电湾' },
  '440229': { kind: 'hakka_weilongwu', landmarkName: '翁源湖心坝明清客家围楼', badgeTag: '中国兰花之乡县' },
  '440233': { kind: 'tea_house_heritage', landmarkName: '新丰云髻山古道茶亭阁', badgeTag: '粤北生态佛手瓜' },
  '440514': { kind: 'minnan_swallowtail_qilou', landmarkName: '潮南祥符塔与潮汕下山虎', badgeTag: '粤东纺织家居都' },
  '440704': { kind: 'wanfo_pagoda_plaza', landmarkName: '江海白水带龙光塔广场', badgeTag: '侨乡高新激光城' },
  '440811': { kind: 'mangrove_bird_boardwalk', landmarkName: '麻章金牛岛红树林观鸟栈', badgeTag: '中国红树林城' },
  '440823': { kind: 'confucian_temple_qufu', landmarkName: '遂溪孔子文化城大成殿', badgeTag: '中国醒狮甜瓜乡' },
  '440902': { kind: 'industrial_heritage_loft', landmarkName: '茂南露天矿百年油页岩园', badgeTag: '南方油城好心城' },
  '441223': { kind: 'bamboo_sea_watchtower', landmarkName: '广宁万顷竹海翡翠观涛阁', badgeTag: '中国竹子武术乡' },
  '441224': { kind: 'karst_stone_watchtower', landmarkName: '怀集燕岩溶洞石壁古刹阁', badgeTag: '粤西北稻米竹茶' },
  '441502': { kind: 'maritime_lighthouse_harbor', landmarkName: '汕尾品清湖凤山妈祖灯塔', badgeTag: '南海渔港红海湾' },
  '441523': { kind: 'hakka_weilongwu', landmarkName: '陆河螺洞梅园客家古围屋', badgeTag: '中国青梅客韵乡' },
  '441602': { kind: 'wanfo_pagoda_plaza', landmarkName: '源城宋代龟峰塔与恐龙馆', badgeTag: '中华恐龙之乡芯' },
  '441621': { kind: 'red_revolution_memorial', landmarkName: '紫金苏区革命旧址花朝馆', badgeTag: '中国蝉茶红城县' },
  '441623': { kind: 'wufeng_academy_cliff', landmarkName: '连平圣迹苍岩丹霞古阁', badgeTag: '中国鹰嘴蜜桃乡' },
  '441624': { kind: 'hakka_weilongwu', landmarkName: '和平林寨明清四角客家楼', badgeTag: '粤东北九连山乡' },
  '441704': { kind: 'maritime_lighthouse_harbor', landmarkName: '阳东东平渔港海丝古灯塔', badgeTag: '中国刀剪渔业港' },
  '441721': { kind: 'maritime_lighthouse_harbor', landmarkName: '阳西沙扒湾月亮湾灯塔港', badgeTag: '中国调味品之都' },
  '441781': { kind: 'karst_stone_watchtower', landmarkName: '阳春凌霄岩与春湾石林寨', badgeTag: '粤西春砂仁山水' },
  '441821': { kind: 'lingnan_wok_ear_hall', landmarkName: '佛冈上岳宋元锅耳楼古村', badgeTag: '粤北汤塘温泉乡' },
  '441823': { kind: 'confucian_temple_qufu', landmarkName: '阳山贤令山韩愈祠摩崖阁', badgeTag: '韩愈过化古阳山' },
  '441825': { kind: 'terraced_rice_pavilion', landmarkName: '连山欧家万亩梯田观云阁', badgeTag: '粤西北壮瑶梯田' },
  '445203': { kind: 'minnan_swallowtail_qilou', landmarkName: '揭东阳美玉都牌楼红厝坊', badgeTag: '亚洲玉都青橄榄' },
  '445222': { kind: 'lingnan_wok_ear_hall', landmarkName: '揭西霖田三山国王祖庙殿', badgeTag: '潮客交融祖庙乡' },
  '445302': { kind: 'karst_stone_watchtower', landmarkName: '云城蟠龙洞喀斯特石艺阁', badgeTag: '中国石都硫铁城' },
  '445303': { kind: 'ancient_water_wharf', landmarkName: '云安六都西江古渡码头', badgeTag: '西江黄金水道港' },
  '445322': { kind: 'lingnan_wok_ear_hall', landmarkName: '郁南大湾镬耳山墙古村群', badgeTag: '南江文化无核黄' },

  // === 广西壮族自治区 ===
  '450103': { kind: 'modern_civic_opera', landmarkName: '南宁会展朱槿花盛开穹顶', badgeTag: '东盟门户朱槿花' },
  '450226': { kind: 'dong_wind_rain_bridge', landmarkName: '三江程阳永济五亭风雨桥', badgeTag: '百节之乡侗族楼' },
  '450304': { kind: 'wufeng_academy_cliff', landmarkName: '桂林象鼻山普贤宝塔水月', badgeTag: '桂林山水城徽' },
  '450321': { kind: 'bamboo_raft_karst_pier', landmarkName: '阳朔遇龙河峰林竹筏码头', badgeTag: '漓江遇龙竹筏廊' },
  '450328': { kind: 'terraced_rice_pavilion', landmarkName: '龙胜龙脊梯田红瑶吊脚楼', badgeTag: '世界梯田瑶寨' },
  '450502': { kind: 'volcanic_basalt_sea_stack', landmarkName: '海城涠洲鳄鱼山火山海蚀柱崖', badgeTag: '涠洲火山海蚀崖' },
  '451424': { kind: 'bamboo_raft_karst_pier', landmarkName: '大新明仕田园喀斯特竹筏', badgeTag: '明仕峰林碧水筏' },
  '451481': { kind: 'border_port_railway_gate', landmarkName: '凭祥友谊关中越铁路国门', badgeTag: '南疆跨轨铁路门' },
  '451422': { kind: 'bamboo_raft_karst_pier', landmarkName: '宁明左江花山崖壁竹筏渡', badgeTag: '左江花山峰林筏' },
  '451227': { kind: 'subterranean_karst_cavern_hall', landmarkName: '巴马百魔洞喀斯特暗河天坑穹', badgeTag: '盘阳河百魔洞乡' },
  '450225': { kind: 'dong_drum_tower', landmarkName: '融水梦呜苗寨木构鼓楼', badgeTag: '百节之乡苗山' },
  '450325': { kind: 'ancient_stone_aqueduct_weir', landmarkName: '兴安秦代灵渠铧嘴分水堰', badgeTag: '秦代灵渠分水堰' },
  '451081': { kind: 'bamboo_raft_karst_pier', landmarkName: '靖西鹅泉峰林古桥竹筏渡', badgeTag: '桂西峰林鹅泉筏' },
  '450681': { kind: 'inland_dryport_railhub', landmarkName: '东兴北仑河国门京族滩', badgeTag: '中越陆海口岸' },
  '450521': { kind: 'ancient_water_wharf', landmarkName: '合浦汉墓博物与丝路港', badgeTag: '汉代海丝始发' },
  '451324': { kind: 'diaojiaolou_stilt', landmarkName: '金秀大瑶山盘王界木楼', badgeTag: '世界瑶都氧吧' },
  '451121': { kind: 'covered_bridge_pavilion', landmarkName: '昭平黄姚古镇带龙石桥', badgeTag: '梦境千年古镇' },
  '450921': { kind: 'tengwang_yueyang_tower', landmarkName: '容县真武阁悬柱纯木楼', badgeTag: '江南四大奇楼' },
  '450881': { kind: 'wufeng_academy_cliff', landmarkName: '桂平西山龙华古刹塔阁', badgeTag: '岭南佛教名山' },
  '450102': { kind: 'canton_tower_qilou', landmarkName: '南宁三街两巷岭南骑楼', badgeTag: '千年邕城商埠芯' },
  '450107': { kind: 'dong_drum_tower', landmarkName: '相思湖壮乡木构民俗城', badgeTag: '绿城科教大学城' },
  '450108': { kind: 'modern_civic_opera', landmarkName: '五象新区铜鼓文化穹顶', badgeTag: '面向东盟金融核' },
  '451423': { kind: 'bund_shikumen', landmarkName: '龙州法国领事馆红八军', badgeTag: '中越边贸红八军' },
  '450603': { kind: 'mangrove_bird_boardwalk', landmarkName: '防城北仑河口红树林栈道', badgeTag: '北部湾红树林港' },
  '450202': { kind: 'confucian_temple_qufu', landmarkName: '柳州柳侯祠与东门楼', badgeTag: '龙城山水紫荆芯' },
  '450302': { kind: 'tiananmen_gatehouse', landmarkName: '桂林靖江王府承运门', badgeTag: '桂林山水名城芯' },
  '450381': { kind: 'karst_stone_watchtower', landmarkName: '荔浦银子岩喀斯特洞', badgeTag: '中国衣架芋头都' },
  '450403': { kind: 'canton_tower_qilou', landmarkName: '梧州百年骑楼商埠城', badgeTag: '百年商埠六堡茶' },
  '450702': { kind: 'automated_deepwater_port_crane', landmarkName: '钦州港海铁联运自动化桥吊', badgeTag: '西部陆海自动化港' },
  '450902': { kind: 'dongyang_luzhai_mansion', landmarkName: '玉林云天宫木雕楼阁', badgeTag: '中国南方香料都' },
  '451002': { kind: 'red_revolution_memorial', landmarkName: '百色起义纪念馆红楼', badgeTag: '芒果之乡红城芯' },
  '451102': { kind: 'hakka_weilongwu', landmarkName: '贺州客家围屋古楼院', badgeTag: '粤港澳生态寿城' },
  '451203': { kind: 'diaojiaolou_stilt', landmarkName: '宜州刘三姐歌仙竹楼', badgeTag: '中国桑蚕歌仙乡' },
  '451402': { kind: 'covered_bridge_pavilion', landmarkName: '崇左太平古城风雨桥', badgeTag: '中国糖都边关门' },
  '450224': { kind: 'dong_wind_rain_bridge', landmarkName: '融安长安骑楼柳江风雨桥', badgeTag: '金桔木商廊桥' },
  '450329': { kind: 'dong_wind_rain_bridge', landmarkName: '资源资江丹霞五亭风雨桥', badgeTag: '桂北丹霞廊桥' },
  '450110': { kind: 'dong_drum_tower', landmarkName: '武鸣壮乡三月三歌圩铜鼓', badgeTag: '壮族文化发源' },
  '450181': { kind: 'tea_house_heritage', landmarkName: '横州中华茉莉园香茶花阁', badgeTag: '世界茉莉花都' },
  '450323': { kind: 'covered_bridge_pavilion', landmarkName: '灵川大圩古镇万寿古石桥', badgeTag: '漓江千年古圩' },
  '450324': { kind: 'red_revolution_memorial', landmarkName: '全州湘江战役纪念园红馆', badgeTag: '湘江红色丰碑' },
  '450332': { kind: 'confucian_temple_qufu', landmarkName: '恭城文庙武庙与瑶乡油茶', badgeTag: '中国月柿油茶' },
  '450422': { kind: 'memorial_archway_paifang', landmarkName: '藤县太平狮山舞狮文化坊', badgeTag: '东方狮王玉桂' },
  '450721': { kind: 'dongyang_luzhai_mansion', landmarkName: '灵山大芦村明清古宅楹联', badgeTag: '中国荔枝古宅' },
  '450821': { kind: 'tengwang_yueyang_tower', landmarkName: '平南北帝山大成文庙飞阁', badgeTag: '千年龚州纺织' },
  '450981': { kind: 'karst_stone_watchtower', landmarkName: '北流勾漏洞天南第一洞天', badgeTag: '中国陶瓷荔枝' },
  '451028': { kind: 'karst_radio_telescope', landmarkName: '乐业大石围天坑云海天台', badgeTag: '世界天坑之都' },
  '451123': { kind: 'pingyao_city_gate', landmarkName: '富川明代古城潇贺古道门', badgeTag: '潇贺古道瑶乡' },
  '451225': { kind: 'karst_stone_watchtower', landmarkName: '罗城棉花天坑仫佬石寨群', badgeTag: '仫佬自治县城' },
  '451226': { kind: 'karst_stone_watchtower', landmarkName: '环江喀斯特世遗木论寨门', badgeTag: '毛南族香牛乡' },
  '451321': { kind: 'tiananmen_gatehouse', landmarkName: '忻城莫土司衙署壮族宫殿', badgeTag: '壮乡土司故宫' },
  '450105': { kind: 'industrial_heritage_loft', landmarkName: '江南百益上河城红砖坊', badgeTag: '南宁工业文创园' },
  '450126': { kind: 'lingnan_wok_ear_hall', landmarkName: '宾阳蔡氏书院岭南古宅', badgeTag: '非遗炮龙古宅乡' },
  '450203': { kind: 'industrial_heritage_loft', landmarkName: '鱼峰柳州工业博物馆厂', badgeTag: '螺蛳粉汽车工业' },
  '450223': { kind: 'pingyao_city_gate', landmarkName: '鹿寨中渡古镇和家巷门', badgeTag: '桂中千年古镇城' },
  '450303': { kind: 'wanfo_pagoda_plaza', landmarkName: '叠彩木龙古塔漓江山水', badgeTag: '漓江北门山水城' },
  '450305': { kind: 'covered_bridge_pavilion', landmarkName: '七星区花桥宋代石拱桥', badgeTag: '桂林山水科教芯' },
  '450405': { kind: 'canton_tower_qilou', landmarkName: '长洲西江六堡茶骑楼街', badgeTag: '西江黄金水道港' },
  '450602': { kind: 'maritime_lighthouse_harbor', landmarkName: '防城港西湾灯塔深水港', badgeTag: '西南海运第一港' },
  '450722': { kind: 'lingnan_wok_ear_hall', landmarkName: '浦北越州天湖镬耳宗祠', badgeTag: '世界长寿陈皮乡' },
  '450922': { kind: 'jiangnan_gardens_gate', landmarkName: '陆川谢鲁山庄岭南名园', badgeTag: '中国四大名庄园' },
  '450923': { kind: 'hakka_weilongwu', landmarkName: '博白王力故居客家古宅', badgeTag: '世界客家第一县' },
  '451024': { kind: 'karst_stone_watchtower', landmarkName: '德保吉星岩喀斯特石寨', badgeTag: '中国矮马红枫乡' },
  '451027': { kind: 'tea_house_heritage', landmarkName: '凌云白毫茶千年古茶阁', badgeTag: '中国白毫茶之乡' },
  '451122': { kind: 'karst_stone_watchtower', landmarkName: '钟山十里画廊喀斯特寨', badgeTag: '桂东贡柑生态县' },
  '451221': { kind: 'dong_drum_tower', landmarkName: '南丹歌娅思谷白裤瑶仓', badgeTag: '世界白裤瑶之乡' },
  '451223': { kind: 'karst_radio_telescope', landmarkName: '凤山三门海天窗天坑群', badgeTag: '世界长寿天坑群' },
  '451322': { kind: 'lingnan_wok_ear_hall', landmarkName: '象州古象城古巷镬耳院', badgeTag: '桂中汤泉古象州' },
  '451421': { kind: 'bamboo_courtyard_library', landmarkName: '扶绥中国恐龙之乡展馆', badgeTag: '左江甘蔗坚果城' },
  '450109': { kind: 'ancient_water_wharf', landmarkName: '邕宁顶蛳山遗址邕江古渡', badgeTag: '壮乡八音生榨粉' },
  '450123': { kind: 'karst_stone_watchtower', landmarkName: '隆安龙虎山喀斯特石林寨', badgeTag: '中国那文化稻乡' },
  '450124': { kind: 'bamboo_raft_karst_pier', landmarkName: '马山红水河峰林竹筏码头', badgeTag: '桂中峰林碧水筏' },
  '450125': { kind: 'ancient_water_wharf', landmarkName: '上林大龙湖喀斯特水门渡', badgeTag: '徐霞客最恋山水' },
  '450204': { kind: 'inland_dryport_railhub', landmarkName: '柳南桂中铁路物流枢纽港', badgeTag: '中国螺蛳粉产业' },
  '450205': { kind: 'industrial_heritage_loft', landmarkName: '柳北柳钢百年工业高炉群', badgeTag: '桂中钢城智能园' },
  '450206': { kind: 'ancient_water_wharf', landmarkName: '柳江百朋万亩荷塘古渡亭', badgeTag: '中国玉藕第一乡' },
  '450222': { kind: 'diaojiaolou_stilt', landmarkName: '柳城古砦仫佬族蓬坡古寨', badgeTag: '桂中蜜桔云片糕' },
  '450311': { kind: 'jiangnan_gardens_gate', landmarkName: '雁山清代雁山名园古月门', badgeTag: '桂林四大名园芯' },
  '450312': { kind: 'modern_civic_opera', landmarkName: '临桂桂林新区一院两馆穹', badgeTag: '桂林新中心两江' },
  '450326': { kind: 'grotto_cliff_buddha', landmarkName: '永福百寿岩宋代百寿石刻', badgeTag: '中国罗汉果长寿' },
  '450327': { kind: 'red_revolution_memorial', landmarkName: '灌阳酒海井红军烈士纪念', badgeTag: '湘江战役红军地' },
  '450330': { kind: 'tengwang_yueyang_tower', landmarkName: '平乐漓江三江口印山古亭', badgeTag: '中国柿饼十八酿' },
  '450406': { kind: 'ancient_water_wharf', landmarkName: '龙圩苍海湖西江生态水岸', badgeTag: '西江明珠粤桂门' },
  '450421': { kind: 'tea_house_heritage', landmarkName: '苍梧六堡千年茶船古道楼', badgeTag: '中国六堡茶原乡' },
  '450423': { kind: 'pingyao_city_gate', landmarkName: '蒙山太平天国永安古城门', badgeTag: '太平天国永安城' },
  '450481': { kind: 'wanfo_pagoda_plaza', landmarkName: '岑溪南渡石庙丹霞古塔阁', badgeTag: '中国花岗岩之都' },
  '450503': { kind: 'mangrove_bird_boardwalk', landmarkName: '银海金海湾红树林观鸟栈', badgeTag: '北海银滩红树林' },
  '450512': { kind: 'maritime_lighthouse_harbor', landmarkName: '铁山港北部湾深水港口塔', badgeTag: '西南出海新枢纽' },
  '450621': { kind: 'wufeng_academy_cliff', landmarkName: '上思十万大山林海云崖阁', badgeTag: '十万大山香糯乡' },
  '450703': { kind: 'memorial_archway_paifang', landmarkName: '钦北刘永福冯子材故居坊', badgeTag: '镇南关英雄故里' },
  '450802': { kind: 'tengwang_yueyang_tower', landmarkName: '港北贵港东湖翼王古亭楼', badgeTag: '西江内河第一港' },
  '450803': { kind: 'grotto_cliff_buddha', landmarkName: '港南贵港南山寺宋代石窟', badgeTag: '古桂州南山石窟' },
  '450804': { kind: 'ancient_water_wharf', landmarkName: '覃塘布山古郡荷花水乡渡', badgeTag: '古郁林郡荷花乡' },
  '450903': { kind: 'yiwu_tradecity_jiming', landmarkName: '福绵世界裤都服装商贸阁', badgeTag: '世界裤都八角乡' },
  '450924': { kind: 'karst_stone_watchtower', landmarkName: '兴业鹿峰山喀斯特古石寨', badgeTag: '桂东南石灰岩城' },
  '451003': { kind: 'confucian_temple_qufu', landmarkName: '田阳敢壮山壮族布洛陀殿', badgeTag: '壮族始祖布洛陀' },
  '451022': { kind: 'red_revolution_memorial', landmarkName: '田东右江工农政府旧址院', badgeTag: '中国芒果之乡红' },
  '451026': { kind: 'karst_stone_watchtower', landmarkName: '那坡黑衣壮高山石砌古寨', badgeTag: '中越边关黑衣壮' },
  '451029': { kind: 'diaojiaolou_stilt', landmarkName: '田林潞城岑氏土司木构楼', badgeTag: '壮剧鼻祖油茶乡' },
  '451030': { kind: 'dongyang_luzhai_mansion', landmarkName: '西林那劳岑氏宫保府古院', badgeTag: '古句町国西林姜' },
  '451031': { kind: 'diaojiaolou_stilt', landmarkName: '隆林德峨五彩民族吊脚楼', badgeTag: '活态少数民族馆' },
  '451082': { kind: 'industrial_heritage_loft', landmarkName: '平果亚洲铝都氧化铝工业', badgeTag: '百色铝工业强县' },
  '451103': { kind: 'wufeng_academy_cliff', landmarkName: '平桂姑婆山瀑布群丹霞阁', badgeTag: '华南最大天然氧' },
  '451202': { kind: 'karst_stone_watchtower', landmarkName: '金城江小三峡喀斯特石寨', badgeTag: '桂西北交通枢纽' },
  '451222': { kind: 'hydroelectric_arch_dam', landmarkName: '天峨龙滩水电站高峡大坝', badgeTag: '红水河巨型水电' },
  '451224': { kind: 'red_revolution_memorial', landmarkName: '东兰列宁岩韦拔群纪念馆', badgeTag: '右江革命摇篮县' },
  '451228': { kind: 'ancient_water_wharf', landmarkName: '都安澄江地下河海菜花渡', badgeTag: '世界地下河之都' },
  '451229': { kind: 'hydroelectric_arch_dam', landmarkName: '大化红水河水电站七百弄', badgeTag: '中国奇石七百弄' },
  '451302': { kind: 'tea_house_heritage', landmarkName: '兴宾麒麟山古亭与甘蔗坊', badgeTag: '中国糖都桂中芯' },
  '451323': { kind: 'wufeng_academy_cliff', landmarkName: '武宣百崖大峡谷飞瀑丹崖', badgeTag: '桂中仙城武宣县' },
  '451381': { kind: 'industrial_heritage_loft', landmarkName: '合山百年煤海国家矿山园', badgeTag: '广西煤炭工业源' },
  '451425': { kind: 'karst_stone_watchtower', landmarkName: '天等独秀峰石林壮乡石寨', badgeTag: '中国指天椒之乡' },

  // === 海南省 ===
  '460108': { kind: 'volcanic_stone_village', landmarkName: '海口骑楼老街与东坡钟楼', badgeTag: '南洋骑楼海口港' },
  '460203': { kind: 'modern_civic_opera', landmarkName: '三亚鹿回头与凤凰岛帆塔', badgeTag: '热带海湾国际港' },
  '469002': { kind: 'modern_civic_opera', landmarkName: '博鳌亚洲论坛海滨穹顶', badgeTag: '万泉河畔国际港' },
  '469005': { kind: 'space_launch_gantry', landmarkName: '文昌龙楼商业航天发射塔', badgeTag: '椰林航天发射港' },
  '469023': { kind: 'volcanic_stone_village', landmarkName: '澄迈罗驿火山玄武石村门', badgeTag: '火山长寿咖啡乡' },
  '469006': { kind: 'subtropical_coffee_drying_terrace', landmarkName: '万宁兴隆侨乡咖啡庄园晒场', badgeTag: '兴隆侨乡咖啡庄园' },
  '469028': { kind: 'maritime_lighthouse_harbor', landmarkName: '陵水南湾猴岛疍家渔港', badgeTag: '北纬十八度湾' },
  '460107': { kind: 'tengwang_yueyang_tower', landmarkName: '琼山五公祠海南第一楼', badgeTag: '千年琼州府城' },
  '469001': { kind: 'volcanic_stone_village', landmarkName: '五指山毛纳村黎族船屋', badgeTag: '热带雨林翡翠' },
  '469007': { kind: 'maritime_lighthouse_harbor', landmarkName: '东方鱼鳞洲百年白灯塔', badgeTag: '感恩文化花梨' },
  '469026': { kind: 'volcanic_stone_village', landmarkName: '昌江棋子湾火山角海湾', badgeTag: '霸王岭木棉海' },
  '460105': { kind: 'crater_tianchi_volcano_rim', landmarkName: '海口雷琼马鞍岭火山口台', badgeTag: '琼北热带火山口' },
  '460106': { kind: 'sea_crossing_cable_bridge', landmarkName: '海口世纪大桥与云洞湾', badgeTag: '自贸港滨海核心' },
  '460202': { kind: 'modern_civic_opera', landmarkName: '海棠湾国际免税穹城', badgeTag: '国际免税康养湾' },
  '460204': { kind: 'maritime_lighthouse_harbor', landmarkName: '天涯海角南天石灯塔', badgeTag: '热带海角百年湾' },
  '460205': { kind: 'pingyao_city_gate', landmarkName: '崖州古城文明门南山', badgeTag: '南繁育种千年城' },
  '469021': { kind: 'wufeng_academy_cliff', landmarkName: '定安文笔峰道观飞阁', badgeTag: '琼剧发祥母瑞红' },
  '469024': { kind: 'volcanic_basalt_sea_stack', landmarkName: '临高角火山玄武岩海蚀石林壁', badgeTag: '琼北火山海蚀岸' },
  '469025': { kind: 'tea_house_heritage', landmarkName: '白沙陨石坑生态茶阁', badgeTag: '黎族生态有机茶' },
  '469027': { kind: 'coastal_salt_pan_pyramid', landmarkName: '莺歌海百年海盐田银盐垛', badgeTag: '南海最大日晒盐场' },
  '469029': { kind: 'diaojiaolou_stilt', landmarkName: '保亭槟榔谷黎苗船屋', badgeTag: '雨林温泉黎苗乡' },
  '469030': { kind: 'diaojiaolou_stilt', landmarkName: '琼中黎母山百花村寨', badgeTag: '海南绿心琼剧乡' },
  '460302': { kind: 'maritime_lighthouse_harbor', landmarkName: '西沙永兴岛南海灯塔哨所', badgeTag: '南海璀璨明珠' },
  '460303': { kind: 'maritime_lighthouse_harbor', landmarkName: '南沙永暑礁南海灯塔港湾', badgeTag: '祖国南疆海礁' },
  '469022': { kind: 'volcanic_stone_village', landmarkName: '屯昌梦幻香山石屋沉香坊', badgeTag: '琼中沉香石屋' },

  // === 重庆市 ===
  '500101': { kind: 'chongqing_hongyadong', landmarkName: '万州天生城平湖江桥阁', badgeTag: '三峡腹心港城' },
  '500103': { kind: 'chongqing_hongyadong', landmarkName: '重庆洪崖洞与长江索道', badgeTag: '8D魔幻山城母城' },
  '500106': { kind: 'diaojiaolou_stilt', landmarkName: '磁器口古镇巴渝山梯木楼', badgeTag: '嘉陵江千年古镇' },
  '500111': { kind: 'grotto_cliff_buddha', landmarkName: '大足宝顶山摩崖石刻护阁', badgeTag: '世界石刻宝库' },
  '500156': { kind: 'karst_stone_watchtower', landmarkName: '武隆天生三桥天福官驿', badgeTag: '喀斯特天坑古驿' },
  '500236': { kind: 'high_speed_viaduct_mountain_tunnel', landmarkName: '奉节郑渝高铁梅溪河跨谷大桥', badgeTag: '三峡高铁桥隧群' },
  '500237': { kind: 'high_speed_viaduct_mountain_tunnel', landmarkName: '巫山郑渝高铁神女峰隧道桥群', badgeTag: '巫峡高铁隧道群' },
  '500242': { kind: 'chongqing_hongyadong', landmarkName: '酉阳龚滩古镇崖壁木楼', badgeTag: '世外桃源乌江' },
  '500117': { kind: 'karst_stone_watchtower', landmarkName: '合川钓鱼城护国门石寨', badgeTag: '上帝折鞭古城' },
  '500151': { kind: 'bayong_lou', landmarkName: '铜梁安居古城波仑亭阁', badgeTag: '中华龙灯之乡' },
  '500230': { kind: 'memorial_archway_paifang', landmarkName: '丰都名山古刹奈何石坊', badgeTag: '长江神曲名山' },
  '500235': { kind: 'tengwang_yueyang_tower', landmarkName: '云阳张飞庙江风临崖阁', badgeTag: '高峡平湖面都' },
  '500153': { kind: 'covered_bridge_pavilion', landmarkName: '荣昌万灵古镇大荣古桥', badgeTag: '非遗夏布陶瓷' },
  '500119': { kind: 'wufeng_academy_cliff', landmarkName: '南川金佛山绝壁云海阁', badgeTag: '双遗产金佛山' },
  '500241': { kind: 'diaojiaolou_stilt', landmarkName: '秀山洪安边城三省木楼', badgeTag: '边城原型武陵' },
  '500102': { kind: 'ancient_water_wharf', landmarkName: '白鹤梁题刻与两江渡口', badgeTag: '千年榨菜白鹤梁' },
  '500104': { kind: 'industrial_heritage_loft', landmarkName: '重钢工业遗址高炉文博', badgeTag: '钢城蝶变义渡口' },
  '500107': { kind: 'industrial_heritage_loft', landmarkName: '黄桷坪艺术厂区涂鸦街', badgeTag: '巴渝美院文创极' },
  '500108': { kind: 'chongqing_hongyadong', landmarkName: '南山一棵树与弹子石阁', badgeTag: '南滨两江夜色城' },
  '500109': { kind: 'bamboo_courtyard_library', landmarkName: '北碚金刚碑古村温泉院', badgeTag: '嘉陵温泉大学城' },
  '500113': { kind: 'karst_stone_watchtower', landmarkName: '丰盛古镇清代石砌碉楼', badgeTag: '巴渝温泉古镇城' },
  '500114': { kind: 'covered_bridge_pavilion', landmarkName: '濯水古镇阿蓬江风雨桥', badgeTag: '武陵土家风情廊' },
  '500116': { kind: 'diaojiaolou_stilt', landmarkName: '中山古镇吊脚木楼老街', badgeTag: '富硒长寿古城门' },
  '500118': { kind: 'tea_house_heritage', landmarkName: '茶山竹海飞檐品茶楼阁', badgeTag: '渝西职教数字城' },
  '500157': { kind: 'smart_science_twin_towers', landmarkName: '两江数字经济智慧双塔', badgeTag: '重庆科创会展极' },
  '500233': { kind: 'dunhuang_mogao_nine', landmarkName: '石宝寨玉印山九层悬阁', badgeTag: '长江孤岛木塔寨' },
  '500240': { kind: 'diaojiaolou_stilt', landmarkName: '西沱云梯街土家吊脚楼', badgeTag: '千里石柱康养寨' },
  '500243': { kind: 'dong_drum_tower', landmarkName: '蚩尤九黎城九进苗乡楼', badgeTag: '乌江画廊苗乡城' },
  '500110': { kind: 'covered_bridge_pavilion', landmarkName: '綦江东溪古镇太平桥', badgeTag: '农民版画南州驿' },
  '500115': { kind: 'ancient_water_wharf', landmarkName: '长寿古镇菩提山缆街', badgeTag: '巴渝寿乡重化城' },
  '500120': { kind: 'jiangnan_gardens_gate', landmarkName: '璧山秀湖水街仿古院', badgeTag: '渝西门户高新区' },
  '500152': { kind: 'dongyang_luzhai_mansion', landmarkName: '潼南双江古镇清代院', badgeTag: '中国柠檬之都乡' },
  '500154': { kind: 'wanfo_pagoda_plaza', landmarkName: '开州汉丰湖举子文峰', badgeTag: '帅乡故里汉丰湖' },
  '500155': { kind: 'bamboo_courtyard_library', landmarkName: '梁平双桂堂竹海禅院', badgeTag: '国际湿地柚子乡' },
  '500229': { kind: 'diaojiaolou_stilt', landmarkName: '城口大巴山亢谷木屋', badgeTag: '川陕苏区老腊肉' },
  '500231': { kind: 'tea_house_heritage', landmarkName: '垫江恺之峰牡丹茶阁', badgeTag: '巴渝山水牡丹乡' },
  '500238': { kind: 'salt_well_derrick', landmarkName: '巫溪宁厂古盐泉栈道', badgeTag: '上古盐都大宁河' },

  // === 四川省 ===
  '510104': { kind: 'smart_science_twin_towers', landmarkName: '成都太古里IFS双塔天际', badgeTag: '天府时尚核心区' },
  '510105': { kind: 'jiangnan_gardens_gate', landmarkName: '成都杜甫草堂川西青瓦院', badgeTag: '诗圣草堂宽窄巷' },
  '510117': { kind: 'bamboo_courtyard_library', landmarkName: '郫都望丛祠川菜豆瓣工坊', badgeTag: '川菜之魂科创城' },
  '510181': { kind: 'ancient_stone_aqueduct_weir', landmarkName: '都江堰鱼嘴分水堤宝瓶口', badgeTag: '千年鱼嘴分水堰' },
  '510184': { kind: 'jiangnan_gardens_gate', landmarkName: '崇州罨画池川西古园亭阁', badgeTag: '蜀州名园板式家具' },
  '510681': { kind: 'modern_civic_opera', landmarkName: '广汉三星堆青铜新馆飞檐', badgeTag: '古蜀文明三星堆' },
  '511181': { kind: 'wufeng_academy_cliff', landmarkName: '峨眉山金顶普贤云海殿', badgeTag: '双遗产佛教名山' },
  '511381': { kind: 'pingyao_city_gate', landmarkName: '阆中古城华光楼与中天楼', badgeTag: '春节文化发源城' },
  '513225': { kind: 'potala_palace_fortress', landmarkName: '九寨沟藏式彩海生态寨楼', badgeTag: '童话世界九寨沟' },
  '513337': { kind: 'potala_palace_fortress', landmarkName: '稻城亚丁冲古寺神山', badgeTag: '蓝色星球净土' },
  '513301': { kind: 'glacier_snow_peak_station', landmarkName: '康定贡嘎雪峰冰川索道站', badgeTag: '贡嘎雪峰冰川门' },
  '513334': { kind: 'tibetan_white_pagoda', landmarkName: '理塘白塔公园与经幡阵', badgeTag: '天空之城理塘' },
  '513333': { kind: 'potala_palace_fortress', landmarkName: '色达金马草原坛城红屋', badgeTag: '雪域草原佛韵' },
  '513323': { kind: 'karst_stone_watchtower', landmarkName: '丹巴甲居藏寨梭坡古碉', badgeTag: '中国千碉之国' },
  '513221': { kind: 'karst_stone_watchtower', landmarkName: '汶川水磨古镇羌族碉楼', badgeTag: '大爱水磨羌寨' },
  '513224': { kind: 'pingyao_city_gate', landmarkName: '松潘松州古城墙和亲门', badgeTag: '川西北古边城' },
  '513232': { kind: 'alpine_yak_meadow_pass', landmarkName: '若尔盖高寒草甸经幡垭口毡房', badgeTag: '川甘高寒牧湿地' },
  '510823': { kind: 'ancient_post_station', landmarkName: '剑阁剑门蜀道翠云古驿', badgeTag: '千年蜀道古柏' },
  '511802': { kind: 'covered_bridge_pavilion', landmarkName: '雅安上里古镇茶马石桥', badgeTag: '川藏茶马起点' },
  '511803': { kind: 'tea_horse_caravan_gate', landmarkName: '名山蒙顶山茶马古道牌坊', badgeTag: '世界茶文化源' },
  '511502': { kind: 'ancient_water_wharf', landmarkName: '宜宾李庄古镇长江渡头', badgeTag: '万里长江首城' },
  '511528': { kind: 'karst_stone_watchtower', landmarkName: '兴文石海天坑僰人岩寨', badgeTag: '神秘僰人悬棺' },
  '510302': { kind: 'salt_well_derrick', landmarkName: '自贡燊海井木架天车塔', badgeTag: '千年盐都灯会' },
  '510981': { kind: 'tea_house_heritage', landmarkName: '射洪陈子昂台与沱牌坊', badgeTag: '唐诗初祖锂电' },
  '510521': { kind: 'covered_bridge_pavilion', landmarkName: '泸县龙脑桥宋代石雕桥', badgeTag: '中国龙文化乡' },
  '511722': { kind: 'diaojiaolou_stilt', landmarkName: '宣汉巴山大峡谷巴人寨', badgeTag: '巴人故里气田' },
  '511324': { kind: 'dongyang_luzhai_mansion', landmarkName: '仪陇朱德故里客家丁宅', badgeTag: '川北剪纸红色' },
  '513401': { kind: 'space_launch_gantry', landmarkName: '西昌卫星发射塔架与邛海', badgeTag: '航天月城发射港' },
  '510683': { kind: 'tea_house_heritage', landmarkName: '绵竹年画村与剑南酒坊', badgeTag: '非遗年画名酒' },
  '512021': { kind: 'grotto_cliff_buddha', landmarkName: '安岳石刻圆觉洞摩崖佛', badgeTag: '中国石刻之乡' },
  '510726': { kind: 'karst_stone_watchtower', landmarkName: '北川吉娜羌寨白石碉楼', badgeTag: '大禹故里羌城' },
  '510106': { kind: 'bamboo_courtyard_library', landmarkName: '天府艺术公园水畔川阁', badgeTag: '蜀都北门枢纽极' },
  '510107': { kind: 'confucian_temple_qufu', landmarkName: '成都武侯祠红墙竹影殿', badgeTag: '三国圣地锦里街' },
  '510108': { kind: 'industrial_heritage_loft', landmarkName: '东郊记忆老厂房文创园', badgeTag: '熊猫基地工业园' },
  '510116': { kind: 'hsr_modern_hub', landmarkName: '双流空港与黄龙溪古渡', badgeTag: '空港自贸百强区' },
  '510115': { kind: 'bamboo_courtyard_library', landmarkName: '温江光祈公园川派书院', badgeTag: '金温江花木学城' },
  '510114': { kind: 'wanfo_pagoda_plaza', landmarkName: '新都宝光寺唐代舍利塔', badgeTag: '状元桂湖轨道城' },
  '510185': { kind: 'hsr_modern_hub', landmarkName: '天府国际机场神鸟枢翼', badgeTag: '成渝东进航空港' },
  '511102': { kind: 'grotto_cliff_buddha', landmarkName: '乐山大佛凌云山摩崖阁', badgeTag: '三江汇流世遗佛' },
  '513322': { kind: 'iron_chain_canyon_bridge', landmarkName: '大渡河飞夺泸定铁索桥', badgeTag: '红色长征飞夺桥' },
  '510703': { kind: 'tengwang_yueyang_tower', landmarkName: '绵阳越王楼重檐江岸阁', badgeTag: '中国科技城核心' },
  '510112': { kind: 'fujian_tulou_round', landmarkName: '龙泉洛带博客客家楼', badgeTag: '天府汽车东安湖' },
  '510129': { kind: 'bund_shikumen', landmarkName: '大邑安仁民国公馆群', badgeTag: '中国博物馆小镇' },
  '510183': { kind: 'covered_bridge_pavilion', landmarkName: '邛崃平乐古镇乐善桥', badgeTag: '天府南来第一城' },
  '510402': { kind: 'industrial_heritage_loft', landmarkName: '攀枝花三线建设展馆', badgeTag: '万里长江钒钛城' },
  '510502': { kind: 'wanfo_pagoda_plaza', landmarkName: '泸州报恩塔与老窖池', badgeTag: '中国酒城长江港' },
  '510781': { kind: 'confucian_temple_qufu', landmarkName: '江油青莲李白故居殿', badgeTag: '诗仙故里特钢城' },
  '510802': { kind: 'grotto_cliff_buddha', landmarkName: '广元皇泽寺千佛崖阁', badgeTag: '女皇故里蜀道口' },
  '511025': { kind: 'confucian_temple_qufu', landmarkName: '资中千年文庙重龙阁', badgeTag: '苌弘故里血橙城' },
  '511302': { kind: 'tengwang_yueyang_tower', landmarkName: '南充西山万卷楼重阁', badgeTag: '三国文化川北绸' },
  '511402': { kind: 'confucian_temple_qufu', landmarkName: '眉山三苏祠千年古院', badgeTag: '东坡故里泡菜都' },
  '511524': { kind: 'bamboo_sea_watchtower', landmarkName: '长宁蜀南竹海翡翠观涛阁', badgeTag: '世界竹海生态游' },
  '511827': { kind: 'karst_stone_watchtower', landmarkName: '宝兴大熊猫起源藏寨', badgeTag: '大熊猫科学发现' },
  '513201': { kind: 'karst_stone_watchtower', landmarkName: '马尔康卓克基嘉绒寨', badgeTag: '嘉绒藏族文化芯' },
  '513330': { kind: 'potala_palace_fortress', landmarkName: '德格印经院藏式红殿', badgeTag: '雪域文化藏经库' },
  '513402': { kind: 'pingyao_city_gate', landmarkName: '会理古城拱极钟鼓楼', badgeTag: '南方丝路石榴城' },
  '510118': { kind: 'wufeng_academy_cliff', landmarkName: '新津老君山宝资山书院阁', badgeTag: '天府水城津渡' },
  '510182': { kind: 'wanfo_pagoda_plaza', landmarkName: '彭州龙兴寺宋代舍利古塔', badgeTag: '天府牡丹古刹' },
  '510322': { kind: 'confucian_temple_qufu', landmarkName: '富顺千年豆花文庙大成殿', badgeTag: '才子豆花名城' },
  '510421': { kind: 'karst_stone_watchtower', landmarkName: '米易颛顼龙洞阳光康养寨', badgeTag: '阳光康养花城' },
  '510522': { kind: 'ancient_water_wharf', landmarkName: '合江尧坝古镇驿道水码头', badgeTag: '荔枝古镇驿道' },
  '510725': { kind: 'confucian_temple_qufu', landmarkName: '梓潼七曲山文昌祖庭大殿', badgeTag: '文昌文化祖庭' },
  '510811': { kind: 'pingyao_city_gate', landmarkName: '昭化古城剑门蜀道三国门', badgeTag: '巴蜀第一古城' },
  '511123': { kind: 'industrial_heritage_loft', landmarkName: '犍为嘉阳小火车百年煤矿', badgeTag: '千年文庙蒸汽' },
  '511321': { kind: 'ancient_water_wharf', landmarkName: '南部升钟湖嘉陵江古渡阁', badgeTag: '升钟钓鱼名城' },
  '511423': { kind: 'diaojiaolou_stilt', landmarkName: '洪雅柳江古镇瓦屋山吊脚', badgeTag: '绿海明珠瓦屋' },
  '511725': { kind: 'tiananmen_gatehouse', landmarkName: '渠县汉阙城坝賨人古国阙', badgeTag: '中国汉阙之乡' },
  '511824': { kind: 'iron_chain_canyon_bridge', landmarkName: '石棉安顺场大渡河铁索桥', badgeTag: '红色安顺渡口' },
  '513222': { kind: 'karst_stone_watchtower', landmarkName: '理县桃坪羌寨千年石碉群', badgeTag: '东方古堡羌寨' },
  '513223': { kind: 'karst_stone_watchtower', landmarkName: '茂县中国古羌城白石碉楼', badgeTag: '中国最大羌城' },
  '513227': { kind: 'karst_stone_watchtower', landmarkName: '小金四姑娘山夹金山碉楼', badgeTag: '东方阿尔卑斯' },
  '513328': { kind: 'tibetan_white_pagoda', landmarkName: '甘孜白利寺格萨尔白塔阵', badgeTag: '康北格萨尔乡' },
  '513423': { kind: 'diaojiaolou_stilt', landmarkName: '盐源泸沽湖摩梭木楞祖母', badgeTag: '女儿国苹果乡' },
  '510113': { kind: 'inland_dryport_railhub', landmarkName: '青白江成都国际铁路港', badgeTag: '蓉欧班列始发港' },
  '510121': { kind: 'ancient_water_wharf', landmarkName: '金堂五凤溪半边山古埠', badgeTag: '天府水城五凤溪' },
  '510131': { kind: 'bamboo_courtyard_library', landmarkName: '蒲江明月村国际陶艺院', badgeTag: '川西林盘茶柑乡' },
  '510304': { kind: 'salt_well_derrick', landmarkName: '大安燊海井千年木天车', badgeTag: '世界首口千米井' },
  '510321': { kind: 'grotto_cliff_buddha', landmarkName: '荣县唐代石刻大佛山阁', badgeTag: '中国第二大石佛' },
  '510422': { kind: 'karst_stone_watchtower', landmarkName: '盐边红格彝寨高山碉楼', badgeTag: '攀西康养钒钛县' },
  '510524': { kind: 'dongyang_luzhai_mansion', landmarkName: '叙永春秋祠清代古戏楼', badgeTag: '乌蒙竹海川南关' },
  '510525': { kind: 'ancient_water_wharf', landmarkName: '古蔺太平渡四渡赤水渡', badgeTag: '赤水河酱酒名城' },
  '510603': { kind: 'confucian_temple_qufu', landmarkName: '旌阳德阳文庙大成殿', badgeTag: '中国重装之都芯' },
  '510682': { kind: 'tea_house_heritage', landmarkName: '什邡中国雪茄博物馆院', badgeTag: '川西雪茄磷化工' },
  '510722': { kind: 'pingyao_city_gate', landmarkName: '三台潼川古城郪江汉阙', badgeTag: '诗圣杜甫寓居城' },
  '510727': { kind: 'yingxian_timber_pagoda', landmarkName: '平武报恩寺明代深山宫', badgeTag: '大熊猫第一古县' },
  '510812': { kind: 'dujiangyan_temple_weir', landmarkName: '朝天明月峡古蜀道栈道', badgeTag: '蜀道咽喉核桃乡' },
  '510923': { kind: 'industrial_heritage_loft', landmarkName: '大英宋代卓筒井活化石', badgeTag: '世界钻井鼻祖乡' },
  '511024': { kind: 'karst_stone_watchtower', landmarkName: '威远穹窿高石梯古石寨', badgeTag: '世界无花果穹窿' },
  '511126': { kind: 'bamboo_courtyard_library', landmarkName: '夹江千佛岩千年手工竹', badgeTag: '中国书画纸之乡' },
  '511323': { kind: 'confucian_temple_qufu', landmarkName: '蓬安相如故城玉环书院', badgeTag: '大辞赋家相如里' },
  '511421': { kind: 'bayong_lou', landmarkName: '仁寿奎星阁川南文昌楼', badgeTag: '天府南门黑龙滩' },
  '511425': { kind: 'bamboo_courtyard_library', landmarkName: '青神国际竹艺城非遗馆', badgeTag: '东坡初恋竹编乡' },
  '511523': { kind: 'dongyang_luzhai_mansion', landmarkName: '江安夕佳山明清庄园院', badgeTag: '中国竹簧剧学院' },
  '511622': { kind: 'karst_stone_watchtower', landmarkName: '武胜宝箴塞川东古石堡', badgeTag: '蜀中第一古石塞' },
  '511724': { kind: 'bamboo_courtyard_library', landmarkName: '大竹五峰山竹海生态院', badgeTag: '川东苎麻香椿乡' },
  '511822': { kind: 'porcelain_dragon_kiln', landmarkName: '荥经千年黑砂古窑作坊', badgeTag: '国家级非遗黑砂' },
  '511921': { kind: 'red_revolution_memorial', landmarkName: '通江王坪红军烈士陵园', badgeTag: '红军之乡银耳都' },
  '513226': { kind: 'karst_stone_watchtower', landmarkName: '金川东女国千年古碉群', badgeTag: '中国雪梨之乡峡' },
  '513228': { kind: 'glacier_snow_peak_station', landmarkName: '黑水达古冰川雪峰云端索道站', badgeTag: '达古冰川雪峰索道' },
  '513326': { kind: 'potala_palace_fortress', landmarkName: '道孚崩科木构藏居宫院', badgeTag: '康巴藏居建筑花' },
  '513331': { kind: 'tibetan_white_pagoda', landmarkName: '白玉噶陀寺高原白塔阵', badgeTag: '金沙江畔藏雕乡' },
  '513424': { kind: 'diaojiaolou_stilt', landmarkName: '德昌安宁河傈僳族木寨', badgeTag: '阳光康养凤凰城' },
  '513433': { kind: 'memorial_archway_paifang', landmarkName: '冕宁彝海结盟纪念碑坊', badgeTag: '长征红色民族盟' },
  '510303': { kind: 'salt_well_derrick', landmarkName: '贡井东源井古盐场木天车', badgeTag: '千年盐都自流源' },
  '510411': { kind: 'porcelain_dragon_kiln', landmarkName: '仁和苴却砚石艺与钒钛园', badgeTag: '中国苴却砚之乡' },
  '510503': { kind: 'red_revolution_memorial', landmarkName: '纳溪护国战争棉花坡碑院', badgeTag: '中国特早茶护国' },
  '510623': { kind: 'red_revolution_memorial', landmarkName: '中江黄继光烈士纪念碑馆', badgeTag: '英雄故里手工面' },
  '510704': { kind: 'tengwang_yueyang_tower', landmarkName: '游仙唐风越王楼与科学城', badgeTag: '剑南首楼科学城' },
  '510723': { kind: 'tiananmen_gatehouse', landmarkName: '盐亭中华嫘祖陵祭祖宫阙', badgeTag: '华夏之母嫘祖乡' },
  '510821': { kind: 'red_revolution_memorial', landmarkName: '旺苍中国红军城木门会议', badgeTag: '川陕苏区红军城' },
  '510822': { kind: 'bamboo_courtyard_library', landmarkName: '青川唐家河大熊猫生态馆', badgeTag: '阴平古道黑木耳' },
  '510824': { kind: 'red_revolution_memorial', landmarkName: '苍溪红军渡强渡嘉陵江馆', badgeTag: '红四方面军渡江' },
  '510903': { kind: 'yingxian_timber_pagoda', landmarkName: '船山广德寺宋代古塔圣莲', badgeTag: '中国观音文化乡' },
  '510921': { kind: 'red_revolution_memorial', landmarkName: '蓬溪旷继勋牛角沟起义馆', badgeTag: '中国书法之乡县' },
  '511002': { kind: 'jiangnan_gardens_gate', landmarkName: '内江张大千纪念馆大风堂', badgeTag: '国画大师大千里' },
  '511083': { kind: 'memorial_archway_paifang', landmarkName: '隆昌明清青石立体牌坊群', badgeTag: '中国石牌坊之乡' },
  '511111': { kind: 'dongyang_luzhai_mansion', landmarkName: '沙湾郭沫若故居川南院落', badgeTag: '文豪郭沫若故里' },
  '511112': { kind: 'salt_well_derrick', landmarkName: '五通桥牛华古盐井小西湖', badgeTag: '千年井盐小西湖' },
  '511322': { kind: 'grotto_cliff_buddha', landmarkName: '营山太蓬山唐宋摩崖石窟', badgeTag: '川北明珠进士乡' },
  '511403': { kind: 'ancient_water_wharf', landmarkName: '彭山江口沉银古渡博物院', badgeTag: '中华长寿彭祖山' },
  '511503': { kind: 'pingyao_city_gate', landmarkName: '南溪万里长江第一古城门', badgeTag: '川南千年明古城' },
  '511602': { kind: 'red_revolution_memorial', landmarkName: '广安邓小平故里纪念碑馆', badgeTag: '伟人故里川东门' },
  '511681': { kind: 'red_revolution_memorial', landmarkName: '华蓥山游击队红岩纪念馆', badgeTag: '红岩魂华蓥宝鼎' },
  '511702': { kind: 'tengwang_yueyang_tower', landmarkName: '通川凤凰山红军亭与巴渠', badgeTag: '巴人故里红军亭' },
  '511823': { kind: 'hydroelectric_arch_dam', landmarkName: '汉源瀑布沟大渡河水电站', badgeTag: '大渡河平湖花椒' },
  '511826': { kind: 'memorial_archway_paifang', landmarkName: '芦山汉代樊敏石阙与姜城', badgeTag: '中国乌木根雕都' },
  '511902': { kind: 'grotto_cliff_buddha', landmarkName: '巴州南龛山唐代彩绘摩崖', badgeTag: '盛唐彩绘石窟城' },
  '511923': { kind: 'red_revolution_memorial', landmarkName: '平昌刘伯坚烈士纪念碑馆', badgeTag: '带镣行英雄故里' },
  '512022': { kind: 'red_revolution_memorial', landmarkName: '乐至陈毅元帅故居纪念馆', badgeTag: '元帅故里桑蚕城' },
  '513231': { kind: 'alpine_yak_meadow_pass', landmarkName: '阿坝曼扎塘高寒垭口黑牦牛帐', badgeTag: '安多牦牛高寒乡' },
  '513233': { kind: 'alpine_yak_meadow_pass', landmarkName: '红原查真梁子高寒垭口牦牛牧', badgeTag: '麦洼牦牛高寒牧' },
  '513426': { kind: 'hydroelectric_arch_dam', landmarkName: '会东乌东德金沙江高拱坝', badgeTag: '川滇金沙江拱坝' },
  '513427': { kind: 'hydroelectric_arch_dam', landmarkName: '宁南白鹤滩金沙江特高坝', badgeTag: '金沙江桑蚕大国' },
  '513437': { kind: 'hydroelectric_arch_dam', landmarkName: '雷波溪洛渡水电站双曲坝', badgeTag: '大小凉山马湖坝' },
  '510311': { kind: 'salt_well_derrick', landmarkName: '沿滩永二井天车与仙市镇', badgeTag: '釜溪古盐码镇' },
  '510403': { kind: 'industrial_heritage_loft', landmarkName: '攀枝花西区宝鼎矿三线园', badgeTag: '金沙江三线煤' },
  '510504': { kind: 'tea_house_heritage', landmarkName: '龙马潭黄舣白酒酒庄楼阁', badgeTag: '长江酒港枢纽' },
  '510604': { kind: 'confucian_temple_qufu', landmarkName: '罗江白马关三国庞统祠殿', badgeTag: '三国蜀道凤雏' },
  '510705': { kind: 'wufeng_academy_cliff', landmarkName: '安州罗浮山羌峰飞鸣禅阁', badgeTag: '温泉花海安州' },
  '510904': { kind: 'bamboo_courtyard_library', landmarkName: '安居琼江畔川中生态书院', badgeTag: '天然气化工区' },
  '511011': { kind: 'dongyang_luzhai_mansion', landmarkName: '东兴范长江故居川南院落', badgeTag: '新闻巨子故里' },
  '511113': { kind: 'hydroelectric_arch_dam', landmarkName: '金口河大渡峡谷铁道桥隧', badgeTag: '中国十大峡谷' },
  '511124': { kind: 'dongyang_luzhai_mansion', landmarkName: '井研雷畅故居明清木院落', badgeTag: '川南柑橘研城' },
  '511129': { kind: 'bamboo_sea_watchtower', landmarkName: '沐川永兴竹海生态观涛阁', badgeTag: '中国竹子之乡' },
  '511132': { kind: 'diaojiaolou_stilt', landmarkName: '峨边黑竹沟彝族木构山寨', badgeTag: '神秘黑竹沟彝' },
  '511133': { kind: 'tea_house_heritage', landmarkName: '马边大风顶高山绿茶古寨', badgeTag: '小凉山生态茶' },
  '511303': { kind: 'wanfo_pagoda_plaza', landmarkName: '高坪凌云山白塔与江岸阁', badgeTag: '嘉陵东岸绸都' },
  '511304': { kind: 'yiwu_tradecity_jiming', landmarkName: '嘉陵凤垭山丝绸商贸小镇', badgeTag: '中国绸都智造' },
  '511325': { kind: 'bamboo_courtyard_library', landmarkName: '西充张澜故居表方山书院', badgeTag: '中国有机之乡' },
  '511424': { kind: 'confucian_temple_qufu', landmarkName: '丹棱北宋黄庭坚大雅堂殿', badgeTag: '大雅堂桔橙乡' },
  '511504': { kind: 'ancient_water_wharf', landmarkName: '叙州横江古镇金沙江古渡', badgeTag: '金沙岷江汇流' },
  '511525': { kind: 'tea_house_heritage', landmarkName: '高县大雁岭乌蒙早茶古阁', badgeTag: '川南早茶丝乡' },
  '511526': { kind: 'grotto_cliff_buddha', landmarkName: '珙县麻塘坝僰人绝壁悬棺', badgeTag: '千古之谜悬棺' },
  '511527': { kind: 'tea_house_heritage', landmarkName: '筠连巡司温泉工夫红茶楼', badgeTag: '川红工夫茶乡' },
  '511529': { kind: 'grotto_cliff_buddha', landmarkName: '屏山八仙山丹霞摩崖立佛', badgeTag: '龙华古镇大佛' },
  '511603': { kind: 'karst_stone_watchtower', landmarkName: '前锋南宋大良山城古石寨', badgeTag: '南宋抗蒙山城' },
  '511621': { kind: 'wanfo_pagoda_plaza', landmarkName: '岳池清代白塔与银城戏台', badgeTag: '中国曲艺米粉' },
  '511623': { kind: 'wufeng_academy_cliff', landmarkName: '邻水五华山悬崖云海飞阁', badgeTag: '川渝门户脐橙' },
  '511703': { kind: 'wufeng_academy_cliff', landmarkName: '达川真佛山川东千年名刹', badgeTag: '巴渠真佛福地' },
  '511723': { kind: 'ancient_water_wharf', landmarkName: '开江宝石湖万亩荷塘水阁', badgeTag: '中国田城开江' },
  '511781': { kind: 'red_revolution_memorial', landmarkName: '万源保卫战陈列馆红军城', badgeTag: '巴山红军名城' },
  '511825': { kind: 'covered_bridge_pavilion', landmarkName: '天全二郎山茶马古道廊桥', badgeTag: '川藏门户鱼子' },
  '511903': { kind: 'diaojiaolou_stilt', landmarkName: '恩阳明清古镇川东北吊脚', badgeTag: '千年米仓古镇' },
  '511922': { kind: 'wufeng_academy_cliff', landmarkName: '南江光雾山红叶米仓飞阁', badgeTag: '中国红叶第一' },
  '512002': { kind: 'grotto_cliff_buddha', landmarkName: '雁江半月山唐代摩崖大佛', badgeTag: '成渝柠檬字库' },
  '513230': { kind: 'tibetan_white_pagoda', landmarkName: '壤塘棒托寺明代白塔石刻', badgeTag: '藏式觉囊文化' },
  '513324': { kind: 'potala_palace_fortress', landmarkName: '九龙伍须海雪山藏彝金刹', badgeTag: '秘境伍须藏彝' },
  '513325': { kind: 'karst_stone_watchtower', landmarkName: '雅江相克宗茶马藏寨石碉', badgeTag: '中国松茸之乡' },
  '513327': { kind: 'potala_palace_fortress', landmarkName: '炉霍寿灵寺鲜水河金顶殿', badgeTag: '唐卡之乡崩科' },
  '513329': { kind: 'covered_bridge_pavilion', landmarkName: '新龙雅砻江波日伸臂木桥', badgeTag: '藏地伸臂古桥' },
  '513332': { kind: 'tibetan_white_pagoda', landmarkName: '石渠松格嘛呢石经城白塔', badgeTag: '太阳部落石经' },
  '513335': { kind: 'potala_palace_fortress', landmarkName: '巴塘措普寺雪山措普湖刹', badgeTag: '高原江南弦子' },
  '513336': { kind: 'karst_stone_watchtower', landmarkName: '乡城白色藏房碉楼与桑披', badgeTag: '香巴拉白藏房' },
  '513338': { kind: 'ancient_water_wharf', landmarkName: '得荣金沙江月亮湾太阳谷', badgeTag: '西部太阳谷酒' },
  '513422': { kind: 'potala_palace_fortress', landmarkName: '木里大寺雪山黄教古殿群', badgeTag: '香格里拉后花' },
  '513428': { kind: 'wufeng_academy_cliff', landmarkName: '普格螺髻山冰川瀑布飞阁', badgeTag: '彝族火把温泉' },
  '513429': { kind: 'karst_stone_watchtower', landmarkName: '布拖阿布洛哈峡谷云端寨', badgeTag: '中国火把之乡' },
  '513430': { kind: 'terraced_rice_pavilion', landmarkName: '金阳金沙江谷索玛花梯坡', badgeTag: '中国青花椒乡' },
  '513431': { kind: 'karst_stone_watchtower', landmarkName: '昭觉阿土勒尔悬崖村石寨', badgeTag: '大凉山悬崖村' },
  '513432': { kind: 'diaojiaolou_stilt', landmarkName: '喜德小相岭彝族漆艺木寨', badgeTag: '彝族漆器之乡' },
  '513434': { kind: 'confucian_temple_qufu', landmarkName: '越西水观音文昌祖殿古宫', badgeTag: '文昌故里南丝' },
  '513435': { kind: 'inland_dryport_railhub', landmarkName: '甘洛成昆铁路大渡河险隧', badgeTag: '成昆铁龙峡谷' },
  '513436': { kind: 'diaojiaolou_stilt', landmarkName: '美姑大风顶彝族毕摩木寨', badgeTag: '彝族毕摩圣地' },

  // === 贵州省 ===
  '520102': { kind: 'bayong_lou', landmarkName: '贵阳甲秀楼南明河浮玉桥', badgeTag: '筑城文脉甲秀楼' },
  '520302': { kind: 'red_revolution_memorial', landmarkName: '遵义会议灰砖木柱二层楼', badgeTag: '转折之城红色楼' },
  '520382': { kind: 'tea_house_heritage', landmarkName: '仁怀茅台古镇酱酒古酿坊', badgeTag: '中国酱酒之都' },
  '522630': { kind: 'dong_drum_tower', landmarkName: '台江苗疆姊妹街飞檐鼓楼', badgeTag: '村BA苗绣鼓楼乡' },
  '522631': { kind: 'dong_drum_tower', landmarkName: '黎平肇兴侗寨礼团五鼓楼', badgeTag: '侗族大歌鼓楼群' },
  '522722': { kind: 'bamboo_raft_karst_pier', landmarkName: '荔波樟江小七孔竹筏码头', badgeTag: '樟江碧水竹筏码' },
  '522634': { kind: 'diaojiaolou_stilt', landmarkName: '西江千户苗寨千灯楼', badgeTag: '全球最大苗寨' },
  '522625': { kind: 'hanging_cliff_monastery', landmarkName: '镇远青龙洞中元洞绝壁悬阁', badgeTag: '西南崖壁贴崖寺' },
  '522632': { kind: 'dong_drum_tower', landmarkName: '榕江三宝侗寨鼓楼村超', badgeTag: '村超发源侗乡' },
  '522633': { kind: 'terraced_rice_pavilion', landmarkName: '从江加榜云海梯田鼓楼', badgeTag: '最后枪手部落' },
  '522636': { kind: 'terraced_rice_pavilion', landmarkName: '丹寨高要云海梯田廊桥', badgeTag: '非遗古法造纸' },
  '522301': { kind: 'bamboo_raft_karst_pier', landmarkName: '兴义万峰林纳灰河竹筏渡', badgeTag: '万峰林田园竹筏' },
  '522325': { kind: 'iron_chain_canyon_bridge', landmarkName: '贞丰花江大峡谷铁索桥', badgeTag: '花江峡谷布依' },
  '520524': { kind: 'subterranean_karst_cavern_hall', landmarkName: '织金洞石笋穹顶与暗河观景道', badgeTag: '中华溶洞之王' },
  '520526': { kind: 'bamboo_courtyard_library', landmarkName: '威宁草海高原黑颈鹤阁', badgeTag: '黔西北阳光城' },
  '520381': { kind: 'bamboo_sea_watchtower', landmarkName: '赤水竹海丹霞观涛飞檐阁', badgeTag: '丹霞瀑布竹都' },
  '520328': { kind: 'cliffside_tea_terraces', landmarkName: '湄潭翠芽万亩云海阶梯茶', badgeTag: '黔北云海生态茶' },
  '520402': { kind: 'karst_stone_watchtower', landmarkName: '西秀天龙屯堡石头巷寨', badgeTag: '明代屯堡遗风' },
  '520423': { kind: 'dujiangyan_temple_weir', landmarkName: '镇宁黄果树瀑布观瀑桥', badgeTag: '亚洲第一大瀑' },
  '522727': { kind: 'karst_radio_telescope', landmarkName: '平塘中国天眼FAST巨阵', badgeTag: '观天巨眼天文' },
  '520621': { kind: 'wufeng_academy_cliff', landmarkName: '江口梵净山红云金顶刹', badgeTag: '世界自然遗产' },
  '520103': { kind: 'bayong_lou', landmarkName: '贵阳明代文昌阁九角楼', badgeTag: '爽爽贵阳文昌芯' },
  '520111': { kind: 'pingyao_city_gate', landmarkName: '青岩古镇明代定广石城', badgeTag: '高原明珠大学城' },
  '520115': { kind: 'smart_science_twin_towers', landmarkName: '观山湖数博金融双子塔', badgeTag: '中国数谷金融芯' },
  '520330': { kind: 'iron_chain_canyon_bridge', landmarkName: '习水土城赤水河铁索渡桥', badgeTag: '赤水河谷酱酒红' },
  '520304': { kind: 'karst_stone_watchtower', landmarkName: '海龙屯宋明土司石关寨', badgeTag: '世界遗产海龙屯' },
  '520122': { kind: 'red_revolution_memorial', landmarkName: '息烽红色历史纪念馆', badgeTag: '红色研学磷化工' },
  '520201': { kind: 'industrial_heritage_loft', landmarkName: '六盘水三线建设展馆', badgeTag: '中国凉都煤炭城' },
  '520322': { kind: 'jiayuguan_pass_fortress', landmarkName: '桐梓娄山关雄关栈阁', badgeTag: '雄关漫道避暑门' },
  '520502': { kind: 'karst_stone_watchtower', landmarkName: '毕节鸡鸣三省赤水峡', badgeTag: '乌蒙枢纽试验芯' },
  '520602': { kind: 'diaojiaolou_stilt', landmarkName: '铜仁中南门古城木楼', badgeTag: '梵净门户锦江城' },
  '522601': { kind: 'diaojiaolou_stilt', landmarkName: '凯里下司古镇清水楼', badgeTag: '苗侗首府酸汤都' },
  '522623': { kind: 'wufeng_academy_cliff', landmarkName: '施秉云台山喀斯特峰', badgeTag: '世界遗产漂流乡' },
  '522701': { kind: 'pingyao_city_gate', landmarkName: '都匀百子古桥石板街', badgeTag: '高原桥城毛尖茶' },
  '522732': { kind: 'dong_drum_tower', landmarkName: '三都水书文化端节楼', badgeTag: '中国唯一水族县' },
  '522628': { kind: 'dong_wind_rain_bridge', landmarkName: '锦屏隆里古城杉木风雨桥', badgeTag: '清水江木商桥' },
  '522627': { kind: 'dong_wind_rain_bridge', landmarkName: '天柱三门塘清水江风雨桥', badgeTag: '北侗宗祠廊桥' },
  '520622': { kind: 'dong_wind_rain_bridge', landmarkName: '玉屏舞阳河箫笛五亭桥', badgeTag: '中国箫笛侗乡' },
  '522728': { kind: 'karst_radio_telescope', landmarkName: '罗甸大小井喀斯特天坑台', badgeTag: '高原天眼绿谷' },
  '522731': { kind: 'karst_radio_telescope', landmarkName: '惠水好花红喀斯特天眼谷', badgeTag: '布依民歌科创' },
  '520123': { kind: 'confucian_temple_qufu', landmarkName: '修文阳明文化园龙场悟道', badgeTag: '阳明心学圣地' },
  '520281': { kind: 'tea_house_heritage', landmarkName: '盘州妥乐古银杏村落民居', badgeTag: '乌蒙金色银杏' },
  '520323': { kind: 'subterranean_karst_cavern_hall', landmarkName: '绥阳双河洞地下暗河石笋穹厅', badgeTag: '亚洲第一长溶洞' },
  '520424': { kind: 'sea_crossing_cable_bridge', landmarkName: '关岭坝陵河谷特大悬索桥', badgeTag: '云端跨谷大桥' },
  '520521': { kind: 'tiananmen_gatehouse', landmarkName: '大方慕俄格古城奢香宫院', badgeTag: '古彝圣地漆器' },
  '520581': { kind: 'karst_stone_watchtower', landmarkName: '黔西化屋村乌江画廊苗寨', badgeTag: '百里画廊苗寨' },
  '520623': { kind: 'geothermal_hot_spring_pavilion', landmarkName: '石阡夜郎古温泉疗养亭榭', badgeTag: '中国温泉苔茶' },
  '520628': { kind: 'diaojiaolou_stilt', landmarkName: '松桃苗王城千户吊脚石寨', badgeTag: '千里苗疆王城' },
  '522324': { kind: 'jiayuguan_pass_fortress', landmarkName: '晴隆二十四道拐抗战雄关', badgeTag: '史迪威抗战路' },
  '522328': { kind: 'bayong_lou', landmarkName: '安龙招堤十里荷花半山亭', badgeTag: '荷都加油文化' },
  '522702': { kind: 'pingyao_city_gate', landmarkName: '福泉明代古城墙葛镜石桥', badgeTag: '磷都太极古城' },
  '520112': { kind: 'karst_stone_watchtower', landmarkName: '乌当偏坡布依石头古寨', badgeTag: '贵阳泉城医药谷' },
  '520121': { kind: 'covered_bridge_pavilion', landmarkName: '开阳水头寨布依风雨桥', badgeTag: '中国富硒磷化工' },
  '520181': { kind: 'karst_stone_watchtower', landmarkName: '清镇时光贵州屯堡石巷', badgeTag: '红枫湖生态新城' },
  '520203': { kind: 'diaojiaolou_stilt', landmarkName: '六枝梭戛长角苗木寨楼', badgeTag: '世界首座生态馆' },
  '520303': { kind: 'karst_stone_watchtower', landmarkName: '汇川海龙屯世界遗产堡', badgeTag: '贵州唯一世遗城' },
  '520327': { kind: 'tea_house_heritage', landmarkName: '凤冈茶海之心仙人岭楼', badgeTag: '中国富锌富硒茶' },
  '520403': { kind: 'karst_stone_watchtower', landmarkName: '平坝天龙屯堡明代石城', badgeTag: '大明遗风石头堡' },
  '520425': { kind: 'subterranean_karst_cavern_hall', landmarkName: '紫云格凸河地下溶洞暗河栈道', badgeTag: '格凸河穿洞奇观' },
  '520624': { kind: 'ancient_water_wharf', landmarkName: '思南乌江陈家湾古盐埠', badgeTag: '乌江千年古郡城' },
  '520625': { kind: 'wufeng_academy_cliff', landmarkName: '印江梵净山西门护国寺', badgeTag: '中国名茶书法乡' },
  '522622': { kind: 'memorial_archway_paifang', landmarkName: '黄平飞云崖明代古牌坊', badgeTag: '黔南第一洞天阁' },
  '522626': { kind: 'dong_wind_rain_bridge', landmarkName: '岑巩思州古城龙鳌廊桥', badgeTag: '思州石砚杂交稻' },
  '522725': { kind: 'dongyang_luzhai_mansion', landmarkName: '瓮安猴场会议青砖古院', badgeTag: '长征转折前夜城' },
  '522730': { kind: 'covered_bridge_pavilion', landmarkName: '龙里油画大草原玻璃桥', badgeTag: '贵阳东大门刺梨' },
  '520113': { kind: 'wanfo_pagoda_plaza', landmarkName: '白云泉湖梵华古阁与铝城', badgeTag: '贵阳铝工业生态' },
  '520204': { kind: 'karst_stone_watchtower', landmarkName: '水城海坪彝寨火把石碉楼', badgeTag: '凉都猕猴桃彝乡' },
  '520324': { kind: 'modern_civic_opera', landmarkName: '正安国际吉他文化产业园', badgeTag: '世界吉他制造之都' },
  '520325': { kind: 'diaojiaolou_stilt', landmarkName: '道真中国傩城古戏楼寨门', badgeTag: '仡佬族傩戏之乡' },
  '520326': { kind: 'karst_stone_watchtower', landmarkName: '务川龙潭千年仡佬石寨门', badgeTag: '中华仡佬丹砂祖' },
  '520329': { kind: 'diaojiaolou_stilt', landmarkName: '余庆飞龙寨乌江吊脚楼群', badgeTag: '中国苦丁茶四在' },
  '520422': { kind: 'karst_stone_watchtower', landmarkName: '普定穿洞古遗址与夜郎湖', badgeTag: '黔中穿洞文化乡' },
  '520523': { kind: 'red_revolution_memorial', landmarkName: '金沙钱壮飞纪念馆与石刻', badgeTag: '黔北酱酒茶业县' },
  '520525': { kind: 'covered_bridge_pavilion', landmarkName: '纳雍总溪河古桥与珙桐谷', badgeTag: '中国高山滚山珠' },
  '520527': { kind: 'wufeng_academy_cliff', landmarkName: '赫章韭菜坪贵州屋脊石阁', badgeTag: '夜郎故地天麻核' },
  '520603': { kind: 'industrial_heritage_loft', landmarkName: '万山朱砂古镇千年矿洞坊', badgeTag: '中华千年丹砂城' },
  '520626': { kind: 'red_revolution_memorial', landmarkName: '德江枫香溪红军会址院馆', badgeTag: '黔东北天麻傩堂' },
  '520627': { kind: 'diaojiaolou_stilt', landmarkName: '沿河乌江山峡土家吊脚楼', badgeTag: '乌江百里画廊乡' },
  '522302': { kind: 'tengwang_yueyang_tower', landmarkName: '兴仁薏仁米文化与东湖阁', badgeTag: '中国薏仁米之都' },
  '522323': { kind: 'tea_house_heritage', landmarkName: '普安万年四球古茶树茶楼', badgeTag: '中国古茶树之乡' },
  '522326': { kind: 'dong_wind_rain_bridge', landmarkName: '望谟布依古寨风雨亭桥', badgeTag: '中国山茶油芒果' },
  '522327': { kind: 'diaojiaolou_stilt', landmarkName: '册亨布依戏高脚木楼古寨', badgeTag: '中华布依第一县' },
  '522624': { kind: 'dong_wind_rain_bridge', landmarkName: '三穗潕阳河畔侗苗风雨桥', badgeTag: '黔东麻鸭竹编城' },
  '522629': { kind: 'diaojiaolou_stilt', landmarkName: '剑河仰阿莎广场与温泉寨', badgeTag: '千年锡绣苗乡城' },
  '522635': { kind: 'terraced_rice_pavilion', landmarkName: '麻江乌卡坪梯田苗寨观阁', badgeTag: '中国蓝莓锌硒乡' },
  '522723': { kind: 'terraced_rice_pavilion', landmarkName: '贵定音寨金海雪山梯田寨', badgeTag: '云雾雪芽都匀茶' },
  '522726': { kind: 'memorial_archway_paifang', landmarkName: '独山深河桥抗战纪念牌坊', badgeTag: '黔桂边关盐酸菜' },
  '522729': { kind: 'bamboo_courtyard_library', landmarkName: '长顺中华银杏王生态书院', badgeTag: '黔南绿壳蛋长顺' },

  // === 云南省 ===
  '530102': { kind: 'memorial_archway_paifang', landmarkName: '昆明金马碧鸡坊双牌坊', badgeTag: '春城金马碧鸡坊' },
  '530425': { kind: 'bayong_lou', landmarkName: '易门龙泉书院飞檐古阁', badgeTag: '滇中菌乡资源县' },
  '530581': { kind: 'huizhou_matouqiang', landmarkName: '腾冲和顺古镇百年图书馆', badgeTag: '极边侨乡温泉城' },
  '530702': { kind: 'lijiang_naxi_gate', landmarkName: '丽江古城大水车与木府宫', badgeTag: '东巴纳西水车城' },
  '532524': { kind: 'pingyao_city_gate', landmarkName: '建水朝阳楼与十七孔双龙桥', badgeTag: '滇南千年紫陶城' },
  '532801': { kind: 'dai_peacock_temple', landmarkName: '景洪曼飞龙白塔与总佛寺', badgeTag: '傣乡澜沧热带塔' },
  '532901': { kind: 'dali_three_pagodas', landmarkName: '大理崇圣寺三塔与苍山雪', badgeTag: '苍洱风花雪月塔' },
  '533401': { kind: 'potala_palace_fortress', landmarkName: '香格里拉松赞林寺金顶群', badgeTag: '滇藏雪域金顶殿' },
  '530126': { kind: 'karst_stone_watchtower', landmarkName: '石林喀斯特剑峰石林门', badgeTag: '阿诗玛石林城' },
  '532504': { kind: 'industrial_heritage_loft', landmarkName: '弥勒东风韵万花筒红砖', badgeTag: '滇南葡萄酒城' },
  '532528': { kind: 'terraced_rice_pavilion', landmarkName: '元阳哈尼梯田蘑菇山寨', badgeTag: '千年哈尼梯田' },
  '532931': { kind: 'lijiang_naxi_gate', landmarkName: '剑川沙溪古镇玉津戏台', badgeTag: '茶马古道木雕' },
  '532927': { kind: 'pingyao_city_gate', landmarkName: '巍山南诏古城拱辰城楼', badgeTag: '南诏国发祥地' },
  '532930': { kind: 'dali_three_pagodas', landmarkName: '洱源凤羽古村与温泉亭', badgeTag: '洱海源头乳扇' },
  '533102': { kind: 'border_port_railway_gate', landmarkName: '瑞丽姐告中缅口岸国门楼', badgeTag: '西南边城口岸门' },
  '533422': { kind: 'potala_palace_fortress', landmarkName: '德钦飞来寺梅里十三塔', badgeTag: '日照金山神山' },
  '533301': { kind: 'iron_chain_canyon_bridge', landmarkName: '泸水怒江峡谷飞虹索桥', badgeTag: '东方大峡谷门' },
  '532626': { kind: 'west_lake_leifeng', landmarkName: '丘北普者黑青龙山荷亭', badgeTag: '山水田园三七' },
  '530828': { kind: 'tea_horse_caravan_gate', landmarkName: '澜沧景迈山古茶林茶马坊', badgeTag: '世遗古茶林山' },
  '530721': { kind: 'glacier_snow_peak_station', landmarkName: '玉龙雪山冰川索道与观测站', badgeTag: '雪山冰川索道站' },
  '530324': { kind: 'karst_stone_watchtower', landmarkName: '罗平金鸡峰丛喀斯特峰', badgeTag: '喀斯特油菜海' },
  '530326': { kind: 'dongyang_luzhai_mansion', landmarkName: '会泽江西会馆清代古坊', badgeTag: '万里京运铜都' },
  '532503': { kind: 'bund_shikumen', landmarkName: '蒙自碧色寨滇越百年站', badgeTag: '过桥米线石榴' },
  '530927': { kind: 'dong_drum_tower', landmarkName: '沧源翁丁原始佤族寨门', badgeTag: '司岗里佤族乡' },
  '530481': { kind: 'modern_civic_opera', landmarkName: '澄江帽天山寒武纪博物', badgeTag: '抚仙湖化石乡' },
  '532328': { kind: 'desert_observatory_solar', landmarkName: '元谋土林奇观与古猿馆', badgeTag: '东方人类故乡' },
  '530103': { kind: 'bund_shikumen', landmarkName: '云南铁路百年老站洋楼', badgeTag: '春城商贸枢纽芯' },
  '530111': { kind: 'dali_three_pagodas', landmarkName: '官渡古镇妙湛寺金刚塔', badgeTag: '滇池古渡商贸区' },
  '530112': { kind: 'wufeng_academy_cliff', landmarkName: '西山龙门三清阁悬崖阁', badgeTag: '滇池睡美人胜景' },
  '530114': { kind: 'hsr_modern_hub', landmarkName: '昆明南站孔雀高铁枢纽', badgeTag: '亚洲花都大学城' },
  '532532': { kind: 'border_port_railway_gate', landmarkName: '河口中越滇越铁路国门桥', badgeTag: '滇越米轨口岸门' },
  '532823': { kind: 'border_port_railway_gate', landmarkName: '磨憨中老跨国铁路国门楼', badgeTag: '中老铁路国门枢' },
  '532624': { kind: 'inland_dryport_railhub', landmarkName: '天保中越边贸国门边关', badgeTag: '南疆英雄老山城' },
  '533103': { kind: 'subtropical_coffee_drying_terrace', landmarkName: '芒市德宏小粒咖啡晒场坊', badgeTag: '德宏小粒咖啡基地' },
  '530115': { kind: 'tiananmen_gatehouse', landmarkName: '晋宁古滇文化王宫阙', badgeTag: '郑和故里古滇城' },
  '530302': { kind: 'confucian_temple_qufu', landmarkName: '曲靖爨宝子碑刻古殿', badgeTag: '珠江源头爨文化' },
  '530423': { kind: 'memorial_archway_paifang', landmarkName: '通海秀山古建文庙坊', badgeTag: '滇南礼乐金属城' },
  '530502': { kind: 'subtropical_coffee_drying_terrace', landmarkName: '保山潞江坝小粒咖啡晒场', badgeTag: '保山小粒咖啡原产' },
  '530602': { kind: 'bamboo_courtyard_library', landmarkName: '昭通大山包黑颈鹤台', badgeTag: '乌蒙磅礴苹果城' },
  '530802': { kind: 'subtropical_coffee_drying_terrace', landmarkName: '思茅云南咖啡庄园日晒场', badgeTag: '世界茶源咖啡都' },
  '532301': { kind: 'karst_stone_watchtower', landmarkName: '楚雄彝人古镇火把坛', badgeTag: '中国彝乡恐龙州' },
  '532525': { kind: 'confucian_temple_qufu', landmarkName: '石屏古城文庙与状元', badgeTag: '文献名邦豆腐乡' },
  '532601': { kind: 'tea_house_heritage', landmarkName: '文山三七产业展示阁', badgeTag: '中国三七之乡芯' },
  '532822': { kind: 'tea_horse_caravan_gate', landmarkName: '勐海茶马古道古茶树坊', badgeTag: '中国普洱茶名县' },
  '532932': { kind: 'tea_horse_caravan_gate', landmarkName: '鹤庆滇藏茶马古道马帮坊', badgeTag: '高原茶马银匠都' },
  '530125': { kind: 'subterranean_karst_cavern_hall', landmarkName: '宜良九乡地下溶洞穹顶暗河道', badgeTag: '九乡溶洞暗河群' },
  '530181': { kind: 'geothermal_hot_spring_pavilion', landmarkName: '安宁天下第一汤温泉亭榭', badgeTag: '滇中温泉第一汤' },
  '530381': { kind: 'high_speed_viaduct_mountain_tunnel', landmarkName: '宣威沪昆高铁北盘江跨谷大桥', badgeTag: '乌蒙高铁跨谷桥' },
  '530427': { kind: 'diaojiaolou_stilt', landmarkName: '新平哀牢山磨盘山花腰寨', badgeTag: '花腰傣哀牢山' },
  '530523': { kind: 'red_revolution_memorial', landmarkName: '龙陵松山抗战遗址纪念碑', badgeTag: '滇西抗战石斛' },
  '530821': { kind: 'tea_horse_caravan_gate', landmarkName: '宁洱那柯里茶马古道驿坊', badgeTag: '茶马古道源头' },
  '530822': { kind: 'desert_observatory_solar', landmarkName: '墨江北回归线标志天文塔', badgeTag: '双胞太阳回归' },
  '530921': { kind: 'tea_house_heritage', landmarkName: '凤庆滇红茶老厂锦秀茶阁', badgeTag: '世界滇红之乡' },
  '532501': { kind: 'industrial_heritage_loft', landmarkName: '个旧百年滇越锡矿工业楼', badgeTag: '世界锡都红河' },
  '532627': { kind: 'bamboo_courtyard_library', landmarkName: '广南坝美世外桃源竹林寨', badgeTag: '壮乡世外桃源' },
  '532924': { kind: 'wufeng_academy_cliff', landmarkName: '宾川鸡足山金顶寺朝圣阁', badgeTag: '佛教圣山葡萄' },
  '532928': { kind: 'iron_chain_canyon_bridge', landmarkName: '永平博南古道霁虹铁索桥', badgeTag: '南方丝路核桃' },
  '533123': { kind: 'dai_peacock_temple', landmarkName: '盈江大盈江允燕傣乡白塔', badgeTag: '孔雀犀鸟秘境' },
  '533324': { kind: 'dujiangyan_temple_weir', landmarkName: '贡山丙中洛怒江第一湾桥', badgeTag: '人神共居怒江' },
  '530113': { kind: 'desert_observatory_solar', landmarkName: '东川红土地落霞沟观台', badgeTag: '中国红土地铜都' },
  '530127': { kind: 'dongyang_luzhai_mansion', landmarkName: '嵩明兰茂故里滇南古院', badgeTag: '昆明职教花卉园' },
  '530322': { kind: 'confucian_temple_qufu', landmarkName: '陆良爨龙颜碑亭古书院', badgeTag: '滇东大坝爨乡城' },
  '530402': { kind: 'wanfo_pagoda_plaza', landmarkName: '红塔区红塔山七级古塔', badgeTag: '高原云烟创新极' },
  '530403': { kind: 'tiananmen_gatehouse', landmarkName: '江川李家山古滇青铜馆', badgeTag: '星云湖古滇文化' },
  '530521': { kind: 'bamboo_courtyard_library', landmarkName: '施甸善洲林场木构林院', badgeTag: '滇西生态林海乡' },
  '530621': { kind: 'industrial_heritage_loft', landmarkName: '鲁甸乐马厂千年古银矿', badgeTag: '汉代朱提银发源' },
  '530623': { kind: 'high_speed_viaduct_mountain_tunnel', landmarkName: '盐津成贵高铁峡谷穿山隧道桥', badgeTag: '乌蒙深谷高铁廊' },
  '530629': { kind: 'dongyang_luzhai_mansion', landmarkName: '威信扎西会议川滇古院', badgeTag: '长征扎西红色城' },
  '530681': { kind: 'hydroelectric_arch_dam', landmarkName: '水富向家坝金沙江大坝', badgeTag: '万里长江第一港' },
  '530724': { kind: 'lijiang_naxi_gate', landmarkName: '宁蒗泸沽湖摩梭木楞院', badgeTag: '东方女儿国明珠' },
  '530827': { kind: 'subtropical_coffee_drying_terrace', landmarkName: '孟连精品咖啡庄园日晒场', badgeTag: '云南精品咖啡高地' },
  '530829': { kind: 'subtropical_coffee_drying_terrace', landmarkName: '西盟佤山生态咖啡日晒坊', badgeTag: '佤山生态咖啡产区' },
  '530926': { kind: 'dai_peacock_temple', landmarkName: '耿马总佛寺金塔甘蔗乡', badgeTag: '滇西南边贸糖都' },
  '532302': { kind: 'modern_civic_opera', landmarkName: '禄丰世界恐龙谷遗址穹', badgeTag: '东方恐龙之乡城' },
  '532325': { kind: 'lijiang_naxi_gate', landmarkName: '姚安光禄古镇高氏府院', badgeTag: '滇中千年文化州' },
  '532502': { kind: 'bund_shikumen', landmarkName: '开远百年滇越铁路站楼', badgeTag: '米轨火车历史城' },
  '532527': { kind: 'karst_stone_watchtower', landmarkName: '泸西城子古村百户土掌', badgeTag: '亚洲奇观土掌村' },
  '532925': { kind: 'tea_house_heritage', landmarkName: '弥渡密祉古驿茶马客栈', badgeTag: '小河淌水发源地' },
  '532929': { kind: 'salt_well_derrick', landmarkName: '云龙诺邓千年盐井古村', badgeTag: '茶马古道诺邓火' },
  '530124': { kind: 'ancient_water_wharf', landmarkName: '富民螳螂川水电站与古渡', badgeTag: '滇中杨梅温泉乡' },
  '530128': { kind: 'hydroelectric_arch_dam', landmarkName: '禄劝乌东德水电站双曲拱坝', badgeTag: '金沙江巨型拱坝' },
  '530129': { kind: 'red_revolution_memorial', landmarkName: '寻甸红军长征柯渡纪念馆', badgeTag: '乌蒙长征红色驿' },
  '530303': { kind: 'dujiangyan_temple_weir', landmarkName: '沾益珠江源头牌坊生态潭', badgeTag: '万里珠江正源地' },
  '530304': { kind: 'red_revolution_memorial', landmarkName: '马龙红军长征过马龙碑院', badgeTag: '滇东高原牧场芯' },
  '530323': { kind: 'karst_stone_watchtower', landmarkName: '师宗凤凰谷喀斯特溶洞寨', badgeTag: '南盘江壮乡柠檬' },
  '530325': { kind: 'jiayuguan_pass_fortress', landmarkName: '富源胜境关入滇第一古关', badgeTag: '入滇第一古关城' },
  '530424': { kind: 'porcelain_dragon_kiln', landmarkName: '华宁碗窑村百年古龙窑坊', badgeTag: '滇中百年泉润陶' },
  '530426': { kind: 'diaojiaolou_stilt', landmarkName: '峨山彝族第一县花鼓木寨', badgeTag: '中国第一彝族县' },
  '530428': { kind: 'terraced_rice_pavilion', landmarkName: '元江那诺哈尼云海梯田阁', badgeTag: '红河谷热带梯田' },
  '530524': { kind: 'tea_house_heritage', landmarkName: '昌宁千年古茶林飞檐茶坊', badgeTag: '中国千年茶乡县' },
  '530622': { kind: 'hydroelectric_arch_dam', landmarkName: '巧家白鹤滩水电站特高拱坝', badgeTag: '世界第二水电站' },
  '530624': { kind: 'wufeng_academy_cliff', landmarkName: '大关黄连河瀑布群崖壁栈', badgeTag: '滇川五尺道竹乡' },
  '530625': { kind: 'hydroelectric_arch_dam', landmarkName: '永善溪洛渡水电站双曲拱坝', badgeTag: '金沙江巨型水电' },
  '530626': { kind: 'ancient_water_wharf', landmarkName: '绥江金沙江高峡平湖码头', badgeTag: '万里长江竹海港' },
  '530627': { kind: 'karst_stone_watchtower', landmarkName: '镇雄赤水河源头天坑石寨', badgeTag: '赤水河源头第一' },
  '530628': { kind: 'red_revolution_memorial', landmarkName: '彝良罗炳辉将军纪念馆院', badgeTag: '世界天麻原产地' },
  '530722': { kind: 'lijiang_naxi_gate', landmarkName: '永胜程海边屯古城水车门', badgeTag: '中国螺旋藻之乡' },
  '530723': { kind: 'bamboo_courtyard_library', landmarkName: '华坪桂梅精神教育书院楼', badgeTag: '攀西芒果能源城' },
  '530823': { kind: 'confucian_temple_qufu', landmarkName: '景东清代文庙与无量山阁', badgeTag: '西南最大古文庙' },
  '530824': { kind: 'dai_peacock_temple', landmarkName: '景谷勐卧总佛寺树包双塔', badgeTag: '滇南树包塔奇观' },
  '530825': { kind: 'salt_well_derrick', landmarkName: '镇沅按板古盐井与千家寨', badgeTag: '古茶树千年盐井' },
  '530826': { kind: 'memorial_archway_paifang', landmarkName: '江城十层大山一城连三国', badgeTag: '中老越三国界碑' },
  '530902': { kind: 'porcelain_dragon_kiln', landmarkName: '临翔博尚碗窑七彩古龙窑', badgeTag: '世界茶乡第一城' },
  '530922': { kind: 'hydroelectric_arch_dam', landmarkName: '云县漫湾水电站澜沧江坝', badgeTag: '澜沧江百万水电' },
  '530923': { kind: 'tea_house_heritage', landmarkName: '永德忙肺古茶山云海茶楼', badgeTag: '中国芒果乌木乡' },
  '530924': { kind: 'inland_dryport_railhub', landmarkName: '镇康南伞中缅边境口岸门', badgeTag: '滇西边关阿数瑟' },
  '530925': { kind: 'subtropical_coffee_drying_terrace', landmarkName: '双江高山生态咖啡日晒场', badgeTag: '临沧咖啡茶香基地' },
  '532322': { kind: 'terraced_rice_pavilion', landmarkName: '双柏鄂嘉雾海梯田彝寨阁', badgeTag: '中国彝族虎文化' },
  '532323': { kind: 'diaojiaolou_stilt', landmarkName: '牟定化佛山古刹与左脚舞', badgeTag: '中国左脚舞之乡' },
  '532324': { kind: 'tea_house_heritage', landmarkName: '南华沙桥茶马古驿菌菇坊', badgeTag: '世界野生菌王国' },
  '532326': { kind: 'salt_well_derrick', landmarkName: '大姚石羊千年古盐井孔庙', badgeTag: '千年盐都孔子铜' },
  '532327': { kind: 'desert_observatory_solar', landmarkName: '永仁高原光伏小镇方山台', badgeTag: '中国阳光城石榴' },
  '532329': { kind: 'wufeng_academy_cliff', landmarkName: '武定狮子山正续禅寺丹阁', badgeTag: '滇中第一奇山城' },
  '532523': { kind: 'covered_bridge_pavilion', landmarkName: '屏边滇越铁路百年人字桥', badgeTag: '百年铁路人字桥' },
  '532529': { kind: 'terraced_rice_pavilion', landmarkName: '红河撒玛坝万亩哈尼梯田', badgeTag: '世界最大连片田' },
  '532530': { kind: 'terraced_rice_pavilion', landmarkName: '金平马鞍底蝴蝶谷哈尼田', badgeTag: '中国蝴蝶谷瑶乡' },
  '532531': { kind: 'terraced_rice_pavilion', landmarkName: '绿春黄连山哈尼云海梯田', badgeTag: '世界最长哈尼宴' },
  '532622': { kind: 'mongol_ger_oboo', landmarkName: '砚山黑巴高原草场毡房区', badgeTag: '中国三七核心区' },
  '532623': { kind: 'karst_stone_watchtower', landmarkName: '西畴石漠化治理绝壁石山', badgeTag: '石漠化治理标杆' },
  '532625': { kind: 'inland_dryport_railhub', landmarkName: '马关都龙中越边贸国门驿', badgeTag: '滇东南草果边境' },
  '532628': { kind: 'ancient_water_wharf', landmarkName: '富宁剥隘驮娘江百年古埠', badgeTag: '云南第一出海口' },
  '532922': { kind: 'wufeng_academy_cliff', landmarkName: '漾濞苍山石门关绝壁栈道', badgeTag: '中国核桃第一县' },
  '532923': { kind: 'dali_three_pagodas', landmarkName: '祥云水目山古塔与云南驿', badgeTag: '彩云之南发源地' },
  '532926': { kind: 'tea_house_heritage', landmarkName: '南涧无量山樱花茶园阁楼', badgeTag: '无量山冬樱茶谷' },
  '533122': { kind: 'dai_peacock_temple', landmarkName: '梁河南甸傣族宣抚司土司', badgeTag: '中国葫芦丝之乡' },
  '533124': { kind: 'dai_peacock_temple', landmarkName: '陇川户撒阿昌皇阁寺金顶', badgeTag: '中国目瑙纵歌乡' },
  '533323': { kind: 'karst_stone_watchtower', landmarkName: '福贡怒江石月亮高黎贡寨', badgeTag: '怒江大峡谷奇观' },
  '533325': { kind: 'salt_well_derrick', landmarkName: '兰坪啦井千年盐井与罗古', badgeTag: '三江并流铅锌盐' },
  '533423': { kind: 'tibetan_white_pagoda', landmarkName: '维西达摩祖师洞雪山白塔', badgeTag: '滇金丝猴秘境乡' },

  // === 西藏自治区 ===
  '540102': { kind: 'potala_palace_fortress', landmarkName: '拉萨布达拉宫雪域宫堡', badgeTag: '日光圣城布达拉' },
  '540202': { kind: 'potala_palace_fortress', landmarkName: '日喀则扎什伦布寺红墙金顶', badgeTag: '后藏重镇珠峰门' },
  '540402': { kind: 'karst_stone_watchtower', landmarkName: '林芝工布藏寨桃花石碉楼', badgeTag: '西藏江南林芝门' },
  '540502': { kind: 'karst_stone_watchtower', landmarkName: '乃东雍布拉康雪域第一宫堡', badgeTag: '藏源第一古宫堡' },
  '540222': { kind: 'tibetan_white_pagoda', landmarkName: '江孜白居寺十万佛白塔', badgeTag: '英雄抗英古城' },
  '540223': { kind: 'glacier_snow_peak_station', landmarkName: '定日珠峰冰川观测与雪域站', badgeTag: '珠峰冰川高寒站' },
  '540224': { kind: 'potala_palace_fortress', landmarkName: '萨迦寺三色城垣大经堂', badgeTag: '藏传第二敦煌' },
  '542522': { kind: 'potala_palace_fortress', landmarkName: '札达古格王朝土林遗址', badgeTag: '阿里秘境古国' },
  '542521': { kind: 'tibetan_white_pagoda', landmarkName: '普兰冈仁波齐白塔经幡', badgeTag: '神山圣湖边贸' },
  '540423': { kind: 'dujiangyan_temple_weir', landmarkName: '墨脱雅鲁藏布大拐弯桥', badgeTag: '雪域莲花秘境' },
  '540424': { kind: 'glacier_snow_peak_station', landmarkName: '波密米堆冰川科考观测与索站', badgeTag: '中国最美冰川乡' },
  '540524': { kind: 'karst_stone_watchtower', landmarkName: '琼结藏王墓与青瓦石堡', badgeTag: '吐蕃藏王陵群' },
  '540122': { kind: 'alpine_yak_meadow_pass', landmarkName: '当雄那根拉垭口经幡与黑牦牛', badgeTag: '藏北雪山垭口牧' },
  '540328': { kind: 'salt_well_derrick', landmarkName: '芒康澜沧江千年木架盐', badgeTag: '茶马古道入藏' },
  '540103': { kind: 'potala_palace_fortress', landmarkName: '楚布寺雪域经堂与白墙', badgeTag: '拉萨西大门青稞' },
  '540233': { kind: 'potala_palace_fortress', landmarkName: '亚东康布藏式边贸古堡', badgeTag: '喜马拉雅绿谷口' },
  '540234': { kind: 'karst_stone_watchtower', landmarkName: '吉隆乃村石堡与帕巴寺', badgeTag: '百年蕃尼古道口' },
  '540235': { kind: 'potala_palace_fortress', landmarkName: '希夏邦马雪域边关寨堡', badgeTag: '雪峰边贸樟木口' },
  '542523': { kind: 'desert_observatory_solar', landmarkName: '阿里暗夜天文观测穹塔', badgeTag: '世界屋脊观星台' },
  '540127': { kind: 'potala_palace_fortress', landmarkName: '甲玛沟松赞干布故居', badgeTag: '直贡梯寺藏药源' },
  '540225': { kind: 'karst_stone_watchtower', landmarkName: '拉孜藏刀古驿民居坊', badgeTag: '堆谐故里珠峰路' },
  '540302': { kind: 'potala_palace_fortress', landmarkName: '昌都强巴林寺金顶殿', badgeTag: '康巴重镇茶马城' },
  '540421': { kind: 'potala_palace_fortress', landmarkName: '巴松措错宗工巴湖寺', badgeTag: '红教圣湖工布林' },
  '540481': { kind: 'karst_stone_watchtower', landmarkName: '雅鲁藏布峡谷索松村', badgeTag: '藏医药源南迦巴' },
  '540521': { kind: 'tibetan_white_pagoda', landmarkName: '扎囊桑耶寺白塔与经幡', badgeTag: '雪域古刹剃度寺' },
  '540602': { kind: 'tibetan_white_pagoda', landmarkName: '那曲孝登寺白塔经幡阵', badgeTag: '藏北草原虫草芯' },
  '540104': { kind: 'tibetan_white_pagoda', landmarkName: '达孜甘丹寺红白殿白塔', badgeTag: '格鲁祖庭雪域' },
  '540121': { kind: 'tibetan_white_pagoda', landmarkName: '林周热振寺千年白塔林', badgeTag: '热振圣地黑颈' },
  '540123': { kind: 'tibetan_white_pagoda', landmarkName: '尼木吞巴藏香白塔水磨', badgeTag: '藏香藏纸源头' },
  '540124': { kind: 'dujiangyan_temple_weir', landmarkName: '曲水雅鲁藏布曲水铁桥', badgeTag: '拉萨河谷门户' },
  '540226': { kind: 'tibetan_white_pagoda', landmarkName: '昂仁桑桑草原白塔经幡', badgeTag: '后藏温泉草原' },
  '540232': { kind: 'tibetan_white_pagoda', landmarkName: '仲巴雅江源头白塔经幡', badgeTag: '马泉河源牧乡' },
  '540236': { kind: 'tibetan_white_pagoda', landmarkName: '萨嘎喜马拉雅北麓白塔', badgeTag: '边陲草原通道' },
  '540321': { kind: 'karst_stone_watchtower', landmarkName: '江达岗托金沙江十八军', badgeTag: '西藏解放首村' },
  '540323': { kind: 'potala_palace_fortress', landmarkName: '类乌齐查杰玛大殿金顶', badgeTag: '康巴牦牛古刹' },
  '540326': { kind: 'dujiangyan_temple_weir', landmarkName: '八宿怒江七十二拐天险', badgeTag: '然乌湖雪山廊' },
  '540327': { kind: 'tibetan_white_pagoda', landmarkName: '左贡东达山五色经幡塔', badgeTag: '川藏滇藏交汇' },
  '540425': { kind: 'diaojiaolou_stilt', landmarkName: '察隅僜人谷雨林木楼寨', badgeTag: '雪域边城茶谷' },
  '540522': { kind: 'hsr_modern_hub', landmarkName: '贡嘎拉萨航空港飞翼站', badgeTag: '雪域空中门户' },
  '540527': { kind: 'karst_stone_watchtower', landmarkName: '洛扎赛卡古托九层石碉', badgeTag: '玛尔巴千年碉' },
  '540531': { kind: 'tibetan_white_pagoda', landmarkName: '浪卡子羊卓雍措白塔幡', badgeTag: '羊湖圣水雪峰' },
  '540624': { kind: 'mongol_ger_oboo', landmarkName: '安多唐古拉山口牧野帐', badgeTag: '藏北青藏门户' },
  '540629': { kind: 'tibetan_white_pagoda', landmarkName: '尼玛当惹雍措苯教白塔', badgeTag: '羌塘秘境圣湖' },
  '542524': { kind: 'tibetan_white_pagoda', landmarkName: '日土班公湖古岩画白塔', badgeTag: '阿里界湖岩画' },
  '540221': { kind: 'tibetan_white_pagoda', landmarkName: '南木林热拉雍仲林白塔', badgeTag: '雅江北岸藏戏乡' },
  '540228': { kind: 'potala_palace_fortress', landmarkName: '白朗年楚河高原藏式庄', badgeTag: '西藏蔬果第一县' },
  '540230': { kind: 'karst_stone_watchtower', landmarkName: '康马多庆措高原古石堡', badgeTag: '喜马拉雅北通道' },
  '540324': { kind: 'potala_palace_fortress', landmarkName: '丁青孜珠寺绝壁红白殿', badgeTag: '天空之城苯教寺' },
  '540325': { kind: 'grotto_cliff_buddha', landmarkName: '察雅仁达摩崖大日如来', badgeTag: '茶马古道藏东门' },
  '540426': { kind: 'karst_stone_watchtower', landmarkName: '朗县列山古墓群古碉堡', badgeTag: '雅江下游核桃乡' },
  '540523': { kind: 'potala_palace_fortress', landmarkName: '桑日丹萨梯寺废墟宫堡', badgeTag: '雅砻河东藏药谷' },
  '540528': { kind: 'tibetan_white_pagoda', landmarkName: '加查拉姆拉措琼果白塔', badgeTag: '圣湖奇观核桃县' },
  '540581': { kind: 'diaojiaolou_stilt', landmarkName: '错那勒布沟门巴林木楼', badgeTag: '喜马拉雅南麓茶' },
  '540622': { kind: 'tibetan_white_pagoda', landmarkName: '比如萨普神山雪域白塔', badgeTag: '那曲虫草萨普雪' },
  '540630': { kind: 'mongol_ger_oboo', landmarkName: '双湖普若岗日雪域毡帐', badgeTag: '世界海拔最高县' },
  '542526': { kind: 'mongol_ger_oboo', landmarkName: '改则羌塘高原牧民黑帐', badgeTag: '阿里草原重镇县' },
  '540227': { kind: 'tibetan_white_pagoda', landmarkName: '谢通门卡嘎温泉与藏寺塔', badgeTag: '藏西温泉牦牛乡' },
  '540229': { kind: 'potala_palace_fortress', landmarkName: '仁布强钦寺古经院红白堡', badgeTag: '雅江中游手工艺' },
  '540231': { kind: 'karst_stone_watchtower', landmarkName: '定结陈塘夏尔巴石砌碉寨', badgeTag: '夏尔巴人秘境乡' },
  '540237': { kind: 'potala_palace_fortress', landmarkName: '岗巴曲登尼玛圣泉古石堡', badgeTag: '世界屋脊岗巴羊' },
  '540322': { kind: 'karst_stone_watchtower', landmarkName: '贡觉三岩藏东古碉楼群', badgeTag: '康巴三岩父系寨' },
  '540329': { kind: 'potala_palace_fortress', landmarkName: '洛隆硕督茶马古镇红墙寺', badgeTag: '藏东茶马古道驿' },
  '540330': { kind: 'tibetan_white_pagoda', landmarkName: '边坝萨普神山雪峰白塔阵', badgeTag: '藏东萨普圣山湖' },
  '540525': { kind: 'potala_palace_fortress', landmarkName: '曲松拉加里王宫百年宫堡', badgeTag: '雅砻古王宫遗址' },
  '540526': { kind: 'mongol_ger_oboo', landmarkName: '措美哲古高原草场经幡帐', badgeTag: '喜马拉雅北麓牧' },
  '540529': { kind: 'red_revolution_memorial', landmarkName: '隆子玉麦守边红色纪念馆', badgeTag: '家是玉麦国中国' },
  '540621': { kind: 'tibetan_white_pagoda', landmarkName: '嘉黎麦地卡湿地高原白塔', badgeTag: '藏北高原虫草乡' },
  '540623': { kind: 'mongol_ger_oboo', landmarkName: '聂荣藏北那曲赛马草原帐', badgeTag: '藏北纯牧黑账房' },
  '540625': { kind: 'mongol_ger_oboo', landmarkName: '申扎色林错黑颈鹤草原帐', badgeTag: '西藏第一大湖岸' },
  '540626': { kind: 'potala_palace_fortress', landmarkName: '索县赞丹寺藏北小布达拉', badgeTag: '藏北小布达拉宫' },
  '540627': { kind: 'tibetan_white_pagoda', landmarkName: '班戈纳木错北岸白塔经幡', badgeTag: '念青唐古拉北湖' },
  '540628': { kind: 'tibetan_white_pagoda', landmarkName: '巴青布加雪山苯教白塔阵', badgeTag: '怒江上游虫草乡' },
  '542525': { kind: 'salt_well_derrick', landmarkName: '革吉阿里盐湖高原晒盐滩', badgeTag: '羌塘高原牧盐地' },
  '542527': { kind: 'tibetan_white_pagoda', landmarkName: '措勤扎日南木错雪峰白塔', badgeTag: '藏西羌塘大湖区' },

  // === 陕西省 ===
  '610103': { kind: 'xian_bell_goose_pagoda', landmarkName: '西安碑林钟楼与南门城垣', badgeTag: '十三朝古都碑林' },
  '610113': { kind: 'xian_bell_goose_pagoda', landmarkName: '大雁塔玄奘藏经唐风塔', badgeTag: '大唐盛景大雁塔' },
  '610403': { kind: 'glass_greenhouse_agripark', landmarkName: '杨凌农科智能连栋温室园', badgeTag: '国家农科温室示范' },
  '610581': { kind: 'dongyang_luzhai_mansion', landmarkName: '韩城党家村明清四合院群', badgeTag: '关中民居活化石' },
  '610602': { kind: 'yaodong_baota_hill', landmarkName: '延安宝塔山九层古塔窑洞', badgeTag: '圣地延安宝塔山' },
  '610881': { kind: 'beacon_tower_greatwall', landmarkName: '神木石峁古城石垒皇城台', badgeTag: '四千年石城能源极' },
  '610622': { kind: 'yaodong_baota_hill', landmarkName: '延川乾坤湾黄河窑院', badgeTag: '黄河蛇曲奇观' },
  '610582': { kind: 'wufeng_academy_cliff', landmarkName: '华阴西岳华山长空栈阁', badgeTag: '奇险天下名山' },
  '610324': { kind: 'xian_bell_goose_pagoda', landmarkName: '扶风法门寺合十舍利塔', badgeTag: '盛唐佛骨地宫' },
  '610323': { kind: 'confucian_temple_qufu', landmarkName: '岐山周公庙周原礼乐殿', badgeTag: '周礼发源臊子' },
  '610115': { kind: 'tiananmen_gatehouse', landmarkName: '临潼华清宫长生殿骊山', badgeTag: '兵马俑华清宫' },
  '610425': { kind: 'dongyang_luzhai_mansion', landmarkName: '礼泉袁家村关中灰砖街', badgeTag: '关中民俗典范' },
  '610481': { kind: 'tiananmen_gatehouse', landmarkName: '兴平汉武茂陵石刻展馆', badgeTag: '丝路开拓汉陵' },
  '610632': { kind: 'confucian_temple_qufu', landmarkName: '黄陵轩辕庙人文始祖殿', badgeTag: '中华第一古陵' },
  '610630': { kind: 'dujiangyan_temple_weir', landmarkName: '宜川壶口瀑布孟门渡头', badgeTag: '秦晋黄河壶口' },
  '610827': { kind: 'yaodong_baota_hill', landmarkName: '米脂姜氏庄园石筑窑堡', badgeTag: '陕北窑堡小米' },
  '610828': { kind: 'bayong_lou', landmarkName: '佳县香炉寺黄河孤石阁', badgeTag: '黄河红枣歌乡' },
  '610725': { kind: 'confucian_temple_qufu', landmarkName: '勉县武侯祠与定军山阁', badgeTag: '定军山武侯祠' },
  '610723': { kind: 'bamboo_courtyard_library', landmarkName: '洋县朱鹮生态园与纸坊', badgeTag: '朱鹮之乡蔡伦' },
  '610729': { kind: 'bamboo_courtyard_library', landmarkName: '留坝张良庙秦岭古书院', badgeTag: '秦岭避暑山地' },
  '611026': { kind: 'diaojiaolou_stilt', landmarkName: '柞水终南山寨秦岭木屋', badgeTag: '小木耳大产业' },
  '610204': { kind: 'ceramic_dragon_kiln_chimney', landmarkName: '耀州黄堡宋代青瓷古窑烟囱群', badgeTag: '北方青瓷耀州窑' },
  '610102': { kind: 'tiananmen_gatehouse', landmarkName: '西安火车站仿唐城阙楼', badgeTag: '丝路枢纽火车城' },
  '610104': { kind: 'pingyao_city_gate', landmarkName: '西安明城墙安远门箭楼', badgeTag: '丝路起点古坊城' },
  '610111': { kind: 'inland_dryport_railhub', landmarkName: '西安国际港务丝路枢纽', badgeTag: '丝路内陆第一港' },
  '610112': { kind: 'tiananmen_gatehouse', landmarkName: '大明宫丹凤门与汉城阙', badgeTag: '汉唐皇城遗址芯' },
  '610114': { kind: 'smart_science_twin_towers', landmarkName: '中国航空城飞机研发塔', badgeTag: '中国航空制造城' },
  '610116': { kind: 'wufeng_academy_cliff', landmarkName: '终南翠华山与古刹书院', badgeTag: '秦岭北麓大学城' },
  '610522': { kind: 'jiayuguan_pass_fortress', landmarkName: '天下第一关潼关黄河垒', badgeTag: '黄河拐弯千年关' },
  '610625': { kind: 'yaodong_baota_hill', landmarkName: '保安红大旧址陕北窑院', badgeTag: '红都保安革命城' },
  '610626': { kind: 'yaodong_baota_hill', landmarkName: '吴起红军长征胜利碑院', badgeTag: '长征落脚胜利山' },
  '610802': { kind: 'beacon_tower_greatwall', landmarkName: '榆林镇北台万里第一台', badgeTag: '塞上驼城煤炭极' },
  '610118': { kind: 'bamboo_courtyard_library', landmarkName: '鄠邑终南农民画展馆', badgeTag: '秦岭北麓画乡区' },
  '610122': { kind: 'confucian_temple_qufu', landmarkName: '蓝田水陆庵千年彩塑', badgeTag: '蓝田美玉猿人乡' },
  '610302': { kind: 'modern_civic_opera', landmarkName: '宝鸡青铜器博物石鼓', badgeTag: '中国青铜器之乡' },
  '610422': { kind: 'memorial_archway_paifang', landmarkName: '三原城隍庙木构牌坊', badgeTag: '关中明清古建县' },
  '610424': { kind: 'tiananmen_gatehouse', landmarkName: '乾县乾陵神道朱雀门', badgeTag: '盛唐皇陵锅盔乡' },
  '610528': { kind: 'industrial_heritage_loft', landmarkName: '富平陶艺村黑陶展馆', badgeTag: '中国柿饼羊乳乡' },
  '610702': { kind: 'bayong_lou', landmarkName: '汉中古汉台与拜将坛', badgeTag: '两汉三国天府芯' },
  '610826': { kind: 'pingyao_city_gate', landmarkName: '绥德天下名州石狮门', badgeTag: '陕北秧歌石雕乡' },
  '610902': { kind: 'ancient_water_wharf', landmarkName: '安康瀛湖汉江古渡阁', badgeTag: '秦巴明珠富硒茶' },
  '610117': { kind: 'xian_bell_goose_pagoda', landmarkName: '高陵昭慧院唐代三阳塔', badgeTag: '关中白菜古塔' },
  '610124': { kind: 'wufeng_academy_cliff', landmarkName: '周至楼观台老子说经台阁', badgeTag: '天下第一福地' },
  '610305': { kind: 'dongyang_luzhai_mansion', landmarkName: '凤翔西凤酒古窖东湖喜阁', badgeTag: '秦都雍城美酒' },
  '610326': { kind: 'wufeng_academy_cliff', landmarkName: '眉县太白山拔仙台云海阁', badgeTag: '中华猕猴桃乡' },
  '610327': { kind: 'mongol_ger_oboo', landmarkName: '陇县关山草原秦风牧场帐', badgeTag: '关山牧场奶羊' },
  '610423': { kind: 'ancient_stone_aqueduct_weir', landmarkName: '泾阳郑国渠龙洞古石堰闸', badgeTag: '关中郑国渠古堰' },
  '610482': { kind: 'grotto_cliff_buddha', landmarkName: '彬州大佛寺丝路唐代石窟', badgeTag: '丝路盛唐石窟' },
  '610503': { kind: 'dongyang_luzhai_mansion', landmarkName: '华州渭华起义与皮影古院', badgeTag: '千年老腔皮影' },
  '610523': { kind: 'shanxi_courtyard_jinshang', landmarkName: '大荔丰图义仓清代粮仓堡', badgeTag: '天下第一粮仓' },
  '610524': { kind: 'ancient_water_wharf', landmarkName: '合阳洽川处女泉黄河湿地', badgeTag: '诗经发源黄河' },
  '610526': { kind: 'ancient_star_observatory', landmarkName: '蒲城时间观象台与唐桥陵', badgeTag: '将相故里授时源' },
  '610629': { kind: 'yaodong_baota_hill', landmarkName: '洛川会议旧址陕北苹果院', badgeTag: '中国苹果圣地' },
  '610722': { kind: 'confucian_temple_qufu', landmarkName: '城固张骞纪念馆汉代丝路', badgeTag: '丝路开拓张骞' },
  '610824': { kind: 'beacon_tower_greatwall', landmarkName: '靖边统万城大夏白城遗址', badgeTag: '波浪谷白城墙' },
  '610921': { kind: 'terraced_rice_pavilion', landmarkName: '汉阴凤堰古梯田三沈文化', badgeTag: '三沈故里梯田' },
  '611022': { kind: 'ancient_water_wharf', landmarkName: '丹凤棣花古镇商洛古驿渡', badgeTag: '商於古道酒城' },
  '610202': { kind: 'industrial_heritage_loft', landmarkName: '王益区王家河煤炭遗存', badgeTag: '铜川工业记忆芯' },
  '610303': { kind: 'bayong_lou', landmarkName: '金台区金台观玉皇阁', badgeTag: '宝鸡城市文化源' },
  '610304': { kind: 'ancient_water_wharf', landmarkName: '陈仓钓鱼台渭水姜尚亭', badgeTag: '周礼青铜之乡门' },
  '610330': { kind: 'covered_bridge_pavilion', landmarkName: '凤县嘉陵江源凤凰廊桥', badgeTag: '七彩凤县花椒乡' },
  '610402': { kind: 'ancient_water_wharf', landmarkName: '秦都区咸阳古渡廊桥阁', badgeTag: '大秦故都科教城' },
  '610404': { kind: 'tiananmen_gatehouse', landmarkName: '渭城汉阳陵帝王阙遗址', badgeTag: '汉代遗址空港城' },
  '610429': { kind: 'wanfo_pagoda_plaza', landmarkName: '旬邑泰塔北宋七级砖塔', badgeTag: '关中红色马栏山' },
  '610431': { kind: 'confucian_temple_qufu', landmarkName: '武功教稼台后稷古祠堂', badgeTag: '中华农耕始祖里' },
  '610525': { kind: 'porcelain_dragon_kiln', landmarkName: '澄城尧头窑宋元古瓷窑', badgeTag: '中国民间黑瓷窑' },
  '610603': { kind: 'yaodong_baota_hill', landmarkName: '安塞冯家营腰鼓窑洞村', badgeTag: '中国腰鼓剪纸乡' },
  '610621': { kind: 'industrial_heritage_loft', landmarkName: '延长陆一井百年采油井', badgeTag: '中国陆上石油源' },
  '610822': { kind: 'pingyao_city_gate', landmarkName: '府谷府州千年古石城墙', badgeTag: '晋陕蒙能源古城' },
  '610825': { kind: 'beacon_tower_greatwall', landmarkName: '定边三边长城古堡盐田', badgeTag: '陕甘宁能源新极' },
  '610922': { kind: 'ancient_water_wharf', landmarkName: '石泉汉江古码头明清街', badgeTag: '中国鬼谷子蚕丝' },
  '610981': { kind: 'ancestral_taiji_hall', landmarkName: '旬阳汉江天然太极城楼', badgeTag: '中华天然太极城' },
  '611025': { kind: 'wufeng_academy_cliff', landmarkName: '镇安塔云山绝顶金顶观', badgeTag: '秦岭最险道教观' },
  '610203': { kind: 'porcelain_dragon_kiln', landmarkName: '印台陈炉古镇罐罐墙龙窑', badgeTag: '千年耀州陶瓷镇' },
  '610222': { kind: 'terraced_rice_pavilion', landmarkName: '宜君哭泉黄土旱作梯田阁', badgeTag: '渭北旱作梯田县' },
  '610328': { kind: 'ancient_water_wharf', landmarkName: '千阳千湖生态湿地绣坊阁', badgeTag: '西秦刺绣燕伋乡' },
  '610329': { kind: 'memorial_archway_paifang', landmarkName: '麟游唐九成宫醴泉铭碑亭', badgeTag: '欧阳询楷书圣碑' },
  '610331': { kind: 'northeast_wooden_granary', landmarkName: '太白黄柏塬秦岭生态木屋', badgeTag: '秦岭雪域蔬菜乡' },
  '610426': { kind: 'pingyao_city_gate', landmarkName: '永寿武陵寺塔与古驿城门', badgeTag: '丝路古驿槐蜜乡' },
  '610428': { kind: 'yingxian_timber_pagoda', landmarkName: '长武昭仁寺唐代大雄宝殿', badgeTag: '唐代八柱纯木殿' },
  '610430': { kind: 'red_revolution_memorial', landmarkName: '淳化爷台山战役红色纪念', badgeTag: '关中秦直道荞麦' },
  '610502': { kind: 'sea_crossing_cable_bridge', landmarkName: '临渭渭南跨渭大桥与钟楼', badgeTag: '东府门户渭南芯' },
  '610527': { kind: 'confucian_temple_qufu', landmarkName: '白水仓颉庙千年古柏祠堂', badgeTag: '中华造字始祖乡' },
  '610627': { kind: 'karst_stone_watchtower', landmarkName: '甘泉雨岔黄土丹霞大峡谷', badgeTag: '陕北雨岔峡谷奇' },
  '610628': { kind: 'grotto_cliff_buddha', landmarkName: '富县石泓寺宋金摩崖石窟', badgeTag: '直罗镇战役古县' },
  '610631': { kind: 'wufeng_academy_cliff', landmarkName: '黄龙无量山石崖古道观阁', badgeTag: '陕北天然绿肺县' },
  '610681': { kind: 'red_revolution_memorial', landmarkName: '子长瓦窑堡会议革命旧址', badgeTag: '中国将军之乡城' },
  '610703': { kind: 'wufeng_academy_cliff', landmarkName: '南郑龙头山悬崖云海栈阁', badgeTag: '巴山龙头云海乡' },
  '610724': { kind: 'tea_house_heritage', landmarkName: '西乡午子山生态茶园茶楼', badgeTag: '陕南仙毫名茶乡' },
  '610726': { kind: 'dongyang_luzhai_mansion', landmarkName: '宁强青木川古镇魏氏庄园', badgeTag: '汉江发源羌绣乡' },
  '610727': { kind: 'grotto_cliff_buddha', landmarkName: '略阳灵岩寺汉魏摩崖石刻', badgeTag: '陕南郙阁颂圣碑' },
  '610728': { kind: 'red_revolution_memorial', landmarkName: '镇巴川陕苏区红色纪念馆', badgeTag: '巴山天坑苗乡茶' },
  '610730': { kind: 'bamboo_courtyard_library', landmarkName: '佛坪秦岭大熊猫谷生态馆', badgeTag: '大熊猫秦岭故乡' },
  '610803': { kind: 'beacon_tower_greatwall', landmarkName: '横山波罗堡古驿长城边墙', badgeTag: '陕北信天游腰鼓' },
  '610829': { kind: 'karst_stone_watchtower', landmarkName: '吴堡黄河绝壁千年石城寨', badgeTag: '天下第一石城堡' },
  '610830': { kind: 'yaodong_baota_hill', landmarkName: '清涧袁家沟窑洞与路遥馆', badgeTag: '平凡世界红枣乡' },
  '610831': { kind: 'yaodong_baota_hill', landmarkName: '子洲南丰寨黄土窑洞古堡', badgeTag: '黄土高原黄芪乡' },
  '610923': { kind: 'covered_bridge_pavilion', landmarkName: '宁陕子午古道秦岭木廊桥', badgeTag: '秦岭之心绿肺县' },
  '610924': { kind: 'cliffside_tea_terraces', landmarkName: '紫阳富硒崖畔云雾阶梯茶', badgeTag: '秦巴富硒云雾茶' },
  '610925': { kind: 'wufeng_academy_cliff', landmarkName: '岚皋南宫山绝壁金顶禅阁', badgeTag: '大巴山富硒魔芋' },
  '610926': { kind: 'cliffside_tea_terraces', landmarkName: '平利蒋家坪高山云雾茶园', badgeTag: '秦巴高山云雾茶' },
  '610927': { kind: 'memorial_archway_paifang', landmarkName: '镇坪鸡心岭自然国心界碑', badgeTag: '中国自然国心碑' },
  '610929': { kind: 'terraced_rice_pavilion', landmarkName: '白河天宝石坎梯田观景阁', badgeTag: '秦楚边城石坎田' },
  '611002': { kind: 'yingxian_timber_pagoda', landmarkName: '商州明代大云寺彩绘古殿', badgeTag: '秦岭南麓商山芯' },
  '611021': { kind: 'confucian_temple_qufu', landmarkName: '洛南玄扈台仓颉造字碑殿', badgeTag: '华夏汉字发祥地' },
  '611023': { kind: 'wufeng_academy_cliff', landmarkName: '商南金丝峡奇峰崖壁栈阁', badgeTag: '秦岭南麓名茶县' },
  '611024': { kind: 'dongyang_luzhai_mansion', landmarkName: '山阳漫川关古镇双戏楼院', badgeTag: '朝秦暮楚古骡帮' },

  // === 甘肃省 ===
  '620102': { kind: 'sea_crossing_cable_bridge', landmarkName: '兰州黄河中山铁桥与白塔', badgeTag: '天下黄河第一桥' },
  '620503': { kind: 'grotto_cliff_buddha', landmarkName: '天水麦积山悬空石窟栈道', badgeTag: '东方雕塑麦积崖' },
  '620702': { kind: 'xian_bell_goose_pagoda', landmarkName: '张掖大佛寺与木塔广场', badgeTag: '金张掖丝路重镇' },
  '620902': { kind: 'jiayuguan_pass_fortress', landmarkName: '酒泉钟鼓楼与丝路雄关', badgeTag: '河西走廊航天城' },
  '620982': { kind: 'dunhuang_mogao_nine', landmarkName: '敦煌莫高窟九层楼飞天窟', badgeTag: '世界敦煌莫高窟' },
  '623022': { kind: 'potala_palace_fortress', landmarkName: '卓尼禅定寺藏式红墙院阁', badgeTag: '洮河红墙古禅院' },
  '623027': { kind: 'alpine_yak_meadow_pass', landmarkName: '夏河桑科草原经幡垭口牦牛帐', badgeTag: '甘南桑科高寒牧' },
  '623024': { kind: 'karst_stone_watchtower', landmarkName: '迭部扎尕那石城塌板寨', badgeTag: '甘南石城秘境' },
  '623001': { kind: 'potala_palace_fortress', landmarkName: '合作米拉日巴九层佛阁', badgeTag: '羚城安多中心' },
  '623021': { kind: 'pingyao_city_gate', landmarkName: '临潭洮州卫古城墙龙神', badgeTag: '洮州花儿古城' },
  '622923': { kind: 'grotto_cliff_buddha', landmarkName: '永靖炳灵寺黄河石窟阁', badgeTag: '黄河三峡石窟' },
  '620721': { kind: 'dunhuang_mogao_nine', landmarkName: '肃南马蹄寺三十三天窟', badgeTag: '裕固草原雪山' },
  '620621': { kind: 'ancient_silk_caravanserai_gate', landmarkName: '民勤瑞安堡丝路夯土古驿烽燧', badgeTag: '河西沙海古驿堡' },
  '620922': { kind: 'ancient_silk_caravanserai_gate', landmarkName: '瓜州锁阳城丝路土夯古驿城门', badgeTag: '锁阳城丝路古驿' },
  '620981': { kind: 'wind_solar_storage_base', landmarkName: '玉门河西风光氢储大基地', badgeTag: '铁人故里风电' },
  '620723': { kind: 'red_sandstone_danxia_arch', landmarkName: '临泽张掖七彩丹霞石拱台', badgeTag: '河西七彩丹霞壁' },
  '620422': { kind: 'red_revolution_memorial', landmarkName: '会宁红军长征会师纪念', badgeTag: '三军会师状元' },
  '620602': { kind: 'xian_bell_goose_pagoda', landmarkName: '凉州罗什寺塔与雷台馆', badgeTag: '天马故里葡萄' },
  '621122': { kind: 'pingyao_city_gate', landmarkName: '陇西威远楼与李氏龙宫', badgeTag: '千年药乡李氏' },
  '620522': { kind: 'bamboo_courtyard_library', landmarkName: '秦安大地湾史前博物院', badgeTag: '八千年华夏源' },
  '620103': { kind: 'modern_civic_opera', landmarkName: '兰州奥体中心与黄河楼', badgeTag: '丝路黄河文化核' },
  '620105': { kind: 'bamboo_courtyard_library', landmarkName: '安宁桃海与西北大学城', badgeTag: '黄河之滨大学城' },
  '620725': { kind: 'mongol_ger_oboo', landmarkName: '山丹军马场祁连草原帐', badgeTag: '千年皇家军马场' },
  '620826': { kind: 'red_revolution_memorial', landmarkName: '界石铺长征纪念馆窑院', badgeTag: '中国苹果之乡县' },
  '621023': { kind: 'yaodong_baota_hill', landmarkName: '南梁陕甘苏维埃窑洞院', badgeTag: '两点一存红色城' },
  '620123': { kind: 'dongyang_luzhai_mansion', landmarkName: '榆中青城古镇水烟院', badgeTag: '高原夏菜兰山门' },
  '620302': { kind: 'industrial_heritage_loft', landmarkName: '金昌镍都矿山地质园', badgeTag: '中国镍都紫金花' },
  '620423': { kind: 'karst_stone_watchtower', landmarkName: '景泰永泰龟城黄河林', badgeTag: '丝路黄河石林堡' },
  '620502': { kind: 'confucian_temple_qufu', landmarkName: '天水伏羲庙先天古殿', badgeTag: '人文始祖羲皇里' },
  '620802': { kind: 'wufeng_academy_cliff', landmarkName: '平凉崆峒山凌空古塔', badgeTag: '道教名山武术城' },
  '621002': { kind: 'yaodong_baota_hill', landmarkName: '庆阳北石窟寺黄土崖', badgeTag: '岐黄故里陕甘红' },
  '622901': { kind: 'kashgar_islamic_arcade', landmarkName: '临夏八坊十三巷砖雕', badgeTag: '河州花儿砖雕巷' },
  '623023': { kind: 'karst_stone_watchtower', landmarkName: '舟曲拉尕山藏乡塌板', badgeTag: '藏乡江南白龙谷' },
  '620121': { kind: 'potala_palace_fortress', landmarkName: '永登鲁土司衙门连城古刹', badgeTag: '高原玫瑰土司' },
  '620321': { kind: 'beacon_tower_greatwall', landmarkName: '永昌骊靬古城汉长城烽燧', badgeTag: '丝路古罗马城' },
  '620421': { kind: 'ancient_water_wharf', landmarkName: '靖远水岸三滩黄河古渡口', badgeTag: '黄河古渡枸杞' },
  '620523': { kind: 'grotto_cliff_buddha', landmarkName: '甘谷大像山北魏悬崖大佛', badgeTag: '华夏第一县佛' },
  '620524': { kind: 'grotto_cliff_buddha', landmarkName: '武山水帘洞拉梢寺摩崖窟', badgeTag: '北周第一大佛' },
  '620622': { kind: 'yaodong_baota_hill', landmarkName: '古浪八步沙六老汉治沙林', badgeTag: '当代愚公治沙' },
  '620623': { kind: 'tibetan_white_pagoda', landmarkName: '天祝天堂寺抓喜秀龙白塔', badgeTag: '高原白牦牛乡' },
  '620724': { kind: 'red_revolution_memorial', landmarkName: '高台中国工农红军西路馆', badgeTag: '河西走廊红城' },
  '620821': { kind: 'grotto_cliff_buddha', landmarkName: '泾川王母宫南石窟寺崖阁', badgeTag: '西王母祖庭窟' },
  '621021': { kind: 'pingyao_city_gate', landmarkName: '庆城周祖陵千年药王古城', badgeTag: '农耕祖地岐黄' },
  '621124': { kind: 'beacon_tower_greatwall', landmarkName: '临洮战国秦长城西起点墙', badgeTag: '战国长城西首' },
  '621222': { kind: 'diaojiaolou_stilt', landmarkName: '文县白马藏寨天池木构楼', badgeTag: '陇南白马山寨' },
  '623025': { kind: 'alpine_yak_meadow_pass', landmarkName: '玛曲阿万仓黄河首曲牦牛牧场', badgeTag: '甘南首曲牦牛牧' },
  '623026': { kind: 'tibetan_white_pagoda', landmarkName: '碌曲郎木寺白龙江畔白塔', badgeTag: '甘南仙境白塔' },
  '620104': { kind: 'industrial_heritage_loft', landmarkName: '西固兰州石化百年工业', badgeTag: '共和国石化摇篮' },
  '620111': { kind: 'industrial_heritage_loft', landmarkName: '红古窑街百年煤矿遗址', badgeTag: '甘青门户工业区' },
  '620402': { kind: 'industrial_heritage_loft', landmarkName: '白银火焰山矿业遗产园', badgeTag: '中国铜城工业芯' },
  '620521': { kind: 'tiananmen_gatehouse', landmarkName: '清水轩辕丘古祭坛宫阙', badgeTag: '秦人发祥温泉城' },
  '620722': { kind: 'beacon_tower_greatwall', landmarkName: '民乐扁都口古汉长城关', badgeTag: '河西走廊南大门' },
  '620825': { kind: 'grotto_cliff_buddha', landmarkName: '庄浪云崖寺丹霞古石窟', badgeTag: '梯田之乡石窟城' },
  '620923': { kind: 'mongol_ger_oboo', landmarkName: '肃北盐池湾雪山蒙古包', badgeTag: '祁连雪山草原旗' },
  '620924': { kind: 'desert_observatory_solar', landmarkName: '阿克塞博罗转井戈壁城', badgeTag: '当金山哈萨克乡' },
  '621022': { kind: 'pingyao_city_gate', landmarkName: '环县环州故城灵武台门', badgeTag: '中国皮影羊肉乡' },
  '621123': { kind: 'covered_bridge_pavilion', landmarkName: '渭源灞陵桥纯木叠梁桥', badgeTag: '万里渭河发源地' },
  '621126': { kind: 'tea_house_heritage', landmarkName: '岷县中国当归城药商阁', badgeTag: '中国当归之都县' },
  '621202': { kind: 'karst_stone_watchtower', landmarkName: '武都万象洞崖壁栈道亭', badgeTag: '中国花椒橄榄城' },
  '621221': { kind: 'confucian_temple_qufu', landmarkName: '成县西狭颂汉代摩崖馆', badgeTag: '汉代三颂文化乡' },
  '622925': { kind: 'modern_civic_opera', landmarkName: '和政古动物化石博物院', badgeTag: '世界古哺乳宝库' },
  '620122': { kind: 'ancient_water_wharf', landmarkName: '皋兰什川世界第一古梨园', badgeTag: '百年古梨黄河湾' },
  '620403': { kind: 'porcelain_dragon_kiln', landmarkName: '平川磁窑千年黑瓷古龙窑', badgeTag: '西北陶瓷煤电城' },
  '620525': { kind: 'mongol_ger_oboo', landmarkName: '张家川关山草原牧场毡房', badgeTag: '丝路关山皮毛乡' },
  '620822': { kind: 'tiananmen_gatehouse', landmarkName: '灵台周文王古灵台祭天阙', badgeTag: '周礼皇甫谧故里' },
  '620823': { kind: 'bamboo_courtyard_library', landmarkName: '崇信龙泉寺古柏泉亭院落', badgeTag: '陇东红牛苹果乡' },
  '620881': { kind: 'porcelain_dragon_kiln', landmarkName: '华亭安口古镇千年龙窑坊', badgeTag: '陇东煤电陶瓷都' },
  '620921': { kind: 'space_launch_gantry', landmarkName: '金塔东风航天城发射塔架', badgeTag: '东风航天发射港' },
  '621024': { kind: 'beacon_tower_greatwall', landmarkName: '合水秦直道古塞与古象馆', badgeTag: '黄河古象出土地' },
  '621025': { kind: 'tiananmen_gatehouse', landmarkName: '正宁子午岭黄帝衣冠古冢', badgeTag: '陇东子午岭生态' },
  '621026': { kind: 'wanfo_pagoda_plaza', landmarkName: '宁县凝寿寺宋代砖塔广场', badgeTag: '古义渠国香包乡' },
  '621027': { kind: 'grotto_cliff_buddha', landmarkName: '镇原玉山寺唐宋崖壁石窟', badgeTag: '陇东书法之乡县' },
  '621102': { kind: 'modern_civic_opera', landmarkName: '安定中国马铃薯博览中心', badgeTag: '中国薯都核心区' },
  '621121': { kind: 'red_revolution_memorial', landmarkName: '通渭榜罗镇长征会议旧址', badgeTag: '中国书画之乡县' },
  '621125': { kind: 'salt_well_derrick', landmarkName: '漳县千年盐井遗址贵清阁', badgeTag: '西秦盐井当归乡' },
  '621223': { kind: 'red_revolution_memorial', landmarkName: '宕昌哈达铺长征纪念馆街', badgeTag: '长征加油站药乡' },
  '621224': { kind: 'covered_bridge_pavilion', landmarkName: '康县阳坝亚热带林海廊桥', badgeTag: '陇上江南中国茶' },
  '621225': { kind: 'wufeng_academy_cliff', landmarkName: '西和仇池古国崖壁云端阁', badgeTag: '中国乞巧文化乡' },
  '621226': { kind: 'confucian_temple_qufu', landmarkName: '礼县祁山武侯祠与秦公墓', badgeTag: '早期秦文化摇篮' },
  '621227': { kind: 'tea_house_heritage', landmarkName: '徽县陇南春千年酿酒古坊', badgeTag: '秦岭南麓银杏城' },
  '621228': { kind: 'red_revolution_memorial', landmarkName: '两当兵变纪念馆青砖院落', badgeTag: '陇南红色兵变地' },
  '622921': { kind: 'wufeng_academy_cliff', landmarkName: '临夏莲花山花儿歌会丹崖', badgeTag: '河州花儿发祥山' },
  '622922': { kind: 'mongol_ger_oboo', landmarkName: '康乐草长沟太子山草原帐', badgeTag: '甘南门户高原乡' },
  '622924': { kind: 'bamboo_courtyard_library', landmarkName: '广河齐家文化史前博物馆', badgeTag: '华夏青铜时代源' },
  '622926': { kind: 'wufeng_academy_cliff', landmarkName: '东乡唐汪川丹霞杏花谷阁', badgeTag: '全国唯一东乡县' },
  '622927': { kind: 'kashgar_islamic_arcade', landmarkName: '积石山大墩峡与保安腰刀', badgeTag: '唯一保安族县乡' },

  // === 青海省 ===
  '630103': { kind: 'kashgar_islamic_arcade', landmarkName: '西宁东关清真大寺宣礼阁', badgeTag: '河湟多元古都门' },
  '630106': { kind: 'tibetan_white_pagoda', landmarkName: '湟中塔尔寺八宝如意白塔', badgeTag: '雪域圣境塔尔寺' },
  '632521': { kind: 'wind_solar_storage_base', landmarkName: '共和塔拉滩风光储大基地', badgeTag: '青海湖牧光互补' },
  '632802': { kind: 'desert_observatory_solar', landmarkName: '德令哈光热熔盐高塔绿洲', badgeTag: '柴达木光热诗城' },
  '632301': { kind: 'potala_palace_fortress', landmarkName: '同仁隆务寺热贡艺术院', badgeTag: '热贡唐卡艺术' },
  '632523': { kind: 'lijiang_naxi_gate', landmarkName: '贵德玉皇阁黄河古水车', badgeTag: '天下黄河贵德' },
  '632221': { kind: 'mongol_ger_oboo', landmarkName: '门源青石嘴花海草原帐', badgeTag: '百里黄金花海' },
  '632222': { kind: 'potala_palace_fortress', landmarkName: '祁连阿柔大寺卓尔山阁', badgeTag: '祁连风光牧乡' },
  '632701': { kind: 'potala_palace_fortress', landmarkName: '玉树结古寺文成公主庙', badgeTag: '三江之源康巴' },
  '632801': { kind: 'desert_observatory_solar', landmarkName: '格尔木昆仑山门光热塔', badgeTag: '盐湖化工昆仑' },
  '632626': { kind: 'mongol_ger_oboo', landmarkName: '玛多黄河源头牛头碑帐', badgeTag: '中华水塔源头' },
  '630225': { kind: 'kashgar_islamic_arcade', landmarkName: '循化街子撒拉族古清真', badgeTag: '唯一撒拉族县' },
  '630102': { kind: 'hsr_modern_hub', landmarkName: '青藏铁路东关门户枢纽', badgeTag: '高原铁路商贸窗' },
  '630104': { kind: 'modern_civic_opera', landmarkName: '海湖新区青海大剧院馆', badgeTag: '高原夏都现代芯' },
  '632223': { kind: 'mongol_ger_oboo', landmarkName: '金银滩草原与原子城碑', badgeTag: '两弹一星功勋地' },
  '630223': { kind: 'tea_house_heritage', landmarkName: '互助彩虹部落与青稞坊', badgeTag: '中国唯一土族县' },
  '630105': { kind: 'hanging_cliff_monastery', landmarkName: '西宁北禅寺红崖悬空栈阁', badgeTag: '高原悬空道佛地' },
  '630202': { kind: 'potala_palace_fortress', landmarkName: '乐都瞿昙寺明代回廊', badgeTag: '河湟高原明古刹' },
  '630222': { kind: 'yaodong_baota_hill', landmarkName: '民和喇家史前古台馆', badgeTag: '青海东门古遗址' },
  '632224': { kind: 'mongol_ger_oboo', landmarkName: '刚察青海湖圣泉经幡', badgeTag: '海北湟鱼草原湾' },
  '632322': { kind: 'wufeng_academy_cliff', landmarkName: '尖扎坎布拉丹霞黄河', badgeTag: '神箭之乡黄河湾' },
  '632803': { kind: 'salt_well_derrick', landmarkName: '茫崖翡翠湖盐滩观台', badgeTag: '柴达木西陲盐湖' },
  '630121': { kind: 'wufeng_academy_cliff', landmarkName: '大通老爷山丹霞古刹阁', badgeTag: '夏都北川生态' },
  '630123': { kind: 'pingyao_city_gate', landmarkName: '湟源丹噶尔古城拱海门', badgeTag: '茶马商都古城' },
  '630203': { kind: 'tibetan_white_pagoda', landmarkName: '平安夏宗寺白塔高原村', badgeTag: '古驿富硒驿站' },
  '632324': { kind: 'mongol_ger_oboo', landmarkName: '河南蒙旗纯牧草原毡房', badgeTag: '有机牧业草原' },
  '632524': { kind: 'tibetan_white_pagoda', landmarkName: '兴海赛宗寺白塔经幡坛', badgeTag: '温泉雪山草原' },
  '632621': { kind: 'tibetan_white_pagoda', landmarkName: '玛沁阿尼玛卿雪山白塔', badgeTag: '三江源头雪峰' },
  '632622': { kind: 'karst_stone_watchtower', landmarkName: '班玛红军沟藏寨石碉楼', badgeTag: '果洛江南红军' },
  '632725': { kind: 'tibetan_white_pagoda', landmarkName: '囊谦澜沧江畔嘎尔白塔', badgeTag: '康巴盐泉圣境' },
  '632821': { kind: 'salt_well_derrick', landmarkName: '乌兰茶卡盐湖天空之镜', badgeTag: '柴达木盐湖镜' },
  '632822': { kind: 'desert_observatory_solar', landmarkName: '都兰热水吐谷浑古墓台', badgeTag: '丝路古道枸杞' },
  '630224': { kind: 'kashgar_islamic_arcade', landmarkName: '化隆群科清真拱北古街', badgeTag: '中华拉面之乡县' },
  '632323': { kind: 'tibetan_white_pagoda', landmarkName: '泽库和日寺石刻经墙塔', badgeTag: '黄南石刻藏经乡' },
  '632522': { kind: 'potala_palace_fortress', landmarkName: '同德宗日遗址丹霞藏院', badgeTag: '黄河谷地古彩陶' },
  '632525': { kind: 'mongol_ger_oboo', landmarkName: '贵南木格滩治沙草原帐', badgeTag: '高原黑藏羊牧乡' },
  '632623': { kind: 'tibetan_white_pagoda', landmarkName: '甘德隆格寺果洛白塔林', badgeTag: '黄河上游草原县' },
  '632624': { kind: 'potala_palace_fortress', landmarkName: '达日格萨尔狮龙宫殿堡', badgeTag: '格萨尔文化核心' },
  '632625': { kind: 'alpine_yak_meadow_pass', landmarkName: '久治年保玉则雪山垭口经幡牧', badgeTag: '果洛高寒牧经幡' },
  '632722': { kind: 'karst_stone_watchtower', landmarkName: '杂多昂赛大峡谷雪豹营', badgeTag: '澜沧江源虫草乡' },
  '632723': { kind: 'alpine_yak_meadow_pass', landmarkName: '称多嘉塘高寒草甸经幡牦牛场', badgeTag: '三江源高寒牧野' },
  '632724': { kind: 'mongol_ger_oboo', landmarkName: '治多长江源可可西里站', badgeTag: '可可西里生态哨' },
  '632726': { kind: 'tibetan_white_pagoda', landmarkName: '曲麻莱约古宗列源白塔', badgeTag: '万里黄河正源乡' },
  '632823': { kind: 'mongol_ger_oboo', landmarkName: '天峻布哈河源雪山牧帐', badgeTag: '青海湖源神山乡' },

  // === 宁夏回族自治区 ===
  '640104': { kind: 'xian_bell_goose_pagoda', landmarkName: '银川承天寺塔与鼓楼双标', badgeTag: '塞上湖城西夏塔' },
  '640105': { kind: 'yaodong_baota_hill', landmarkName: '西夏王陵夯土金字塔陵台', badgeTag: '贺兰山麓西夏陵' },
  '640302': { kind: 'kashgar_islamic_arcade', landmarkName: '吴忠黄河楼与早茶美食街', badgeTag: '黄河早茶康养城' },
  '640502': { kind: 'desert_observatory_solar', landmarkName: '中卫沙坡头黄河星空宿集', badgeTag: '治沙方格大漠宿' },
  '640381': { kind: 'ancient_stone_aqueduct_weir', landmarkName: '青铜峡宁夏引黄古灌区堰', badgeTag: '黄河古灌区渠首' },
  '640181': { kind: 'beacon_tower_greatwall', landmarkName: '灵武水洞沟明长城烽台', badgeTag: '史前长绒羊绒' },
  '640323': { kind: 'pingyao_city_gate', landmarkName: '盐池花马池明长城古城', badgeTag: '中国滩羊之乡' },
  '640423': { kind: 'yaodong_baota_hill', landmarkName: '隆德六盘山长征纪念阁', badgeTag: '胜利之山非遗' },
  '640424': { kind: 'bamboo_courtyard_library', landmarkName: '泾源六盘山老龙潭林院', badgeTag: '泾水发源避暑' },
  '640521': { kind: 'tea_house_heritage', landmarkName: '中宁中国枸杞馆红宝楼', badgeTag: '中国枸杞之乡' },
  '640106': { kind: 'smart_science_twin_towers', landmarkName: '阅海湾金融商务双子塔', badgeTag: '塞上湖城现代芯' },
  '640122': { kind: 'dali_three_pagodas', landmarkName: '贺兰山拜寺口西夏双塔', badgeTag: '贺兰山下葡萄酒' },
  '640121': { kind: 'kashgar_islamic_arcade', landmarkName: '永宁纳家户百年清真', badgeTag: '闽宁协作葡萄乡' },
  '640202': { kind: 'industrial_heritage_loft', landmarkName: '大武口洗煤工业遗址', badgeTag: '贺兰山煤炭工业' },
  '640221': { kind: 'bamboo_courtyard_library', landmarkName: '平罗沙湖苇荡飞鸟阁', badgeTag: '塞上明珠沙湖乡' },
  '640303': { kind: 'yaodong_baota_hill', landmarkName: '红寺堡移民史纪念馆', badgeTag: '生态移民示范区' },
  '640324': { kind: 'kashgar_islamic_arcade', landmarkName: '同心清真大寺西征碑', badgeTag: '红军西征红色地' },
  '640402': { kind: 'grotto_cliff_buddha', landmarkName: '固原须弥山石窟大佛', badgeTag: '丝路东段六盘城' },
  '640422': { kind: 'red_revolution_memorial', landmarkName: '西吉将台堡会师纪念', badgeTag: '三军会师薯乡城' },
  '640205': { kind: 'industrial_heritage_loft', landmarkName: '惠农银河湾黄河工业文创', badgeTag: '塞上煤城转型' },
  '640425': { kind: 'terraced_rice_pavilion', landmarkName: '彭阳梯田茹河瀑布黄土坡', badgeTag: '六盘山最美田' },
  '640522': { kind: 'yaodong_baota_hill', landmarkName: '海原牌路山西安州黄土台', badgeTag: '非遗花儿牧乡' },

  // === 新疆维吾尔自治区 ===
  '650102': { kind: 'kashgar_islamic_arcade', landmarkName: '乌鲁木齐国际大巴扎金塔', badgeTag: '丝路枢纽大巴扎' },
  '650203': { kind: 'industrial_heritage_loft', landmarkName: '克拉玛依黑油山石油纪念塔', badgeTag: '戈壁石油生态城' },
  '650402': { kind: 'yaodong_baota_hill', landmarkName: '吐鲁番交河故城与苏公塔', badgeTag: '火洲坎儿井遗迹' },
  '650522': { kind: 'beacon_tower_greatwall', landmarkName: '伊吾东天山胡杨烽燧堡', badgeTag: '东天山边关烽燧' },
  '653101': { kind: 'kashgar_islamic_arcade', landmarkName: '喀什艾提尕尔与高台民居', badgeTag: '活态丝路生土城' },
  '654002': { kind: 'harbin_sophia_dome', landmarkName: '伊宁喀赞其蓝白拱门庭院', badgeTag: '伊犁河谷蓝调城' },
  '654321': { kind: 'snow_birch_timber_station', landmarkName: '布尔津禾木雪原白桦尖屋', badgeTag: '喀纳斯白桦雪屋' },
  '652902': { kind: 'ancient_silk_caravanserai_gate', landmarkName: '库车龟兹故城土夯拱门与烽燧', badgeTag: '龟兹古驿土夯门' },
  '653131': { kind: 'glacier_snow_peak_station', landmarkName: '塔县慕士塔格冰川科考站', badgeTag: '帕米尔冰川科考极' },
  '654027': { kind: 'ancestral_taiji_hall', landmarkName: '特克斯八卦城太极观坛', badgeTag: '无红绿灯八卦' },
  '654026': { kind: 'mongol_ger_oboo', landmarkName: '昭苏天马文化园雪山帐', badgeTag: '中国天马之乡' },
  '654004': { kind: 'border_port_railway_gate', landmarkName: '霍尔果斯中哈双轨国门楼', badgeTag: '西域双轨铁路门' },
  '654322': { kind: 'industrial_heritage_loft', landmarkName: '富蕴可可托海功勋矿坑', badgeTag: '额尔齐斯功勋' },
  '652302': { kind: 'glacier_snow_peak_station', landmarkName: '阜康博格达雪峰冰川观测站', badgeTag: '天山博格达冰川' },
  '650421': { kind: 'desert_observatory_solar', landmarkName: '鄯善库木塔格沙海驿站', badgeTag: '最近城市沙漠' },
  '653201': { kind: 'kashgar_islamic_arcade', landmarkName: '和田团城鸽子巷阿以旺', badgeTag: '昆仑玉都丝路' },
  '652824': { kind: 'dunhuang_mogao_nine', landmarkName: '若羌楼兰博物古佛塔壁', badgeTag: '中国红枣楼兰' },
  '652701': { kind: 'mongol_ger_oboo', landmarkName: '博乐赛里木湖东门毡房', badgeTag: '大西洋泪湖湾' },
  '659001': { kind: 'industrial_heritage_loft', landmarkName: '石河子军垦博物馆红楼', badgeTag: '戈壁军垦新城' },
  '652801': { kind: 'modern_civic_opera', landmarkName: '库尔勒孔雀河梨城帆塔', badgeTag: '丝路香梨油城' },
  '650103': { kind: 'wanfo_pagoda_plaza', landmarkName: '乌鲁木齐红山九级宝塔', badgeTag: '天山脚下中心城' },
  '650104': { kind: 'hsr_modern_hub', landmarkName: '乌鲁木齐天山国际空港', badgeTag: '丝路空铁科创极' },
  '652702': { kind: 'inland_dryport_railhub', landmarkName: '阿拉山口亚欧大陆国门', badgeTag: '亚欧陆桥第一关' },
  '654201': { kind: 'harbin_sophia_dome', landmarkName: '塔城百年红楼与手风琴', badgeTag: '油画塔城边贸港' },
  '654023': { kind: 'pingyao_city_gate', landmarkName: '惠远古城伊犁将军府门', badgeTag: '中国薰衣草古城' },
  '653024': { kind: 'jiayuguan_pass_fortress', landmarkName: '中国西极伊尔克什坦关', badgeTag: '神州西极第一城' },
  '652822': { kind: 'ancient_silk_caravanserai_gate', landmarkName: '轮台奎玉克协海尔汉唐古驿门', badgeTag: '西域都护府古驿' },
  '650105': { kind: 'modern_civic_opera', landmarkName: '乌鲁木齐雪莲山会展', badgeTag: '首府生态文旅区' },
  '650205': { kind: 'desert_observatory_solar', landmarkName: '乌尔禾魔鬼城雅丹台', badgeTag: '丝路雅丹戈壁城' },
  '650502': { kind: 'wind_solar_storage_base', landmarkName: '哈密伊州风光储氢大基地', badgeTag: '丝路风光储城' },
  '652301': { kind: 'glass_greenhouse_agripark', landmarkName: '昌吉新疆农博智能玻璃棚', badgeTag: '天山北麓智能棚' },
  '652325': { kind: 'mongol_ger_oboo', landmarkName: '奇台江布拉克麦海帐', badgeTag: '天山麦海古城面' },
  '652829': { kind: 'maritime_lighthouse_harbor', landmarkName: '博斯腾湖大河口灯塔', badgeTag: '博斯腾内陆湖湾' },
  '652901': { kind: 'kashgar_islamic_arcade', landmarkName: '阿克苏多浪河老街塔', badgeTag: '冰糖心苹果丝路' },
  '653125': { kind: 'kashgar_islamic_arcade', landmarkName: '莎车叶尔羌汗王宫门', badgeTag: '十二木卡姆古城' },
  '654025': { kind: 'mongol_ger_oboo', landmarkName: '新源那拉提空中草原', badgeTag: '天山绿谷杏花乡' },
  '654301': { kind: 'harbin_sophia_dome', landmarkName: '阿勒泰将军山雪都馆', badgeTag: '人类滑雪起源地' },
  '659002': { kind: 'industrial_heritage_loft', landmarkName: '阿拉尔三五九旅红楼', badgeTag: '塔河源头屯垦城' },
  '650107': { kind: 'wind_solar_storage_base', landmarkName: '达坂城百里风区风光基地', badgeTag: '天山风电古城' },
  '650121': { kind: 'mongol_ger_oboo', landmarkName: '南山板房沟丝绸之路滑雪帐', badgeTag: '天山冰雪牧场' },
  '650521': { kind: 'mongol_ger_oboo', landmarkName: '巴里坤草原古城汉文化馆', badgeTag: '东疆草原古城' },
  '652327': { kind: 'pingyao_city_gate', landmarkName: '吉木萨尔北庭故城唐代城', badgeTag: '唐代北庭都护' },
  '652723': { kind: 'mongol_ger_oboo', landmarkName: '温泉圣泉北鲵博尔塔拉帐', badgeTag: '北疆康养边城' },
  '652823': { kind: 'desert_observatory_solar', landmarkName: '尉犁罗布人村寨塔河胡杨', badgeTag: '塔里木胡杨乡' },
  '652826': { kind: 'kashgar_islamic_arcade', landmarkName: '焉耆七个星佛寺丝路古街', badgeTag: '丝路辣椒酿酒' },
  '652827': { kind: 'mongol_ger_oboo', landmarkName: '巴音布鲁克九曲天鹅湖帐', badgeTag: '草原九曲天鹅' },
  '652922': { kind: 'karst_stone_watchtower', landmarkName: '温宿托木尔天山大峡谷岩', badgeTag: '南疆冰川红崖' },
  '652925': { kind: 'ancient_silk_caravanserai_gate', landmarkName: '新和通古斯巴什古驿土夯拱门', badgeTag: '汉唐龟兹古驿城' },
  '653001': { kind: 'kashgar_islamic_arcade', landmarkName: '阿图什天门与无花果拱街', badgeTag: '无花果之乡门' },
  '653123': { kind: 'kashgar_islamic_arcade', landmarkName: '英吉沙土陶小刀古匠村街', badgeTag: '非遗小刀色买' },
  '653226': { kind: 'kashgar_islamic_arcade', landmarkName: '于田达里雅布依沙漠绿洲', badgeTag: '昆仑玫瑰沙洲' },
  '654022': { kind: 'pingyao_city_gate', landmarkName: '察布查尔锡伯古城靖远寺', badgeTag: '中国箭乡锡伯' },
  '654203': { kind: 'desert_observatory_solar', landmarkName: '沙湾鹿角湾大盘鸡丝路驿', badgeTag: '天山温泉大盘' },
  '654324': { kind: 'northeast_wooden_granary', landmarkName: '哈巴河白桦林西北第一木屋', badgeTag: '西北第一桦林' },
  '650106': { kind: 'inland_dryport_railhub', landmarkName: '头屯河乌鲁木齐高铁陆港', badgeTag: '丝路陆港核心区' },
  '650109': { kind: 'kashgar_islamic_arcade', landmarkName: '米东贡米巷丝路商街拱', badgeTag: '首府稻乡化工城' },
  '650202': { kind: 'memorial_archway_paifang', landmarkName: '独山子独库公路零公里', badgeTag: '中国最美公路源' },
  '652323': { kind: 'dunhuang_mogao_nine', landmarkName: '呼图壁康家石门子岩画', badgeTag: '天山北麓古岩画' },
  '652324': { kind: 'bamboo_courtyard_library', landmarkName: '玛纳斯湿地公园观鸟阁', badgeTag: '中国碧玉之都县' },
  '652328': { kind: 'northeast_wooden_granary', landmarkName: '木垒天山万亩旱田木仓', badgeTag: '丝路鹰嘴豆古城' },
  '652722': { kind: 'tea_house_heritage', landmarkName: '精河中国枸杞博览楼阁', badgeTag: '北疆枸杞丝路站' },
  '652825': { kind: 'ancient_silk_caravanserai_gate', landmarkName: '且末丝路南道夯土驿门胡杨烽', badgeTag: '昆仑丝路古驿门' },
  '653022': { kind: 'mongol_ger_oboo', landmarkName: '阿克陶白沙湖柯尔克孜', badgeTag: '帕米尔冰山绿湖' },
  '653124': { kind: 'bamboo_courtyard_library', landmarkName: '泽普金湖杨叶尔羌林阁', badgeTag: '南疆最美胡杨林' },
  '653126': { kind: 'memorial_archway_paifang', landmarkName: '叶城新藏公路零公里坊', badgeTag: '天路零公里起点' },
  '653127': { kind: 'desert_observatory_solar', landmarkName: '麦盖提N39沙漠营地塔', badgeTag: '塔漠探险刀郎乡' },
  '654003': { kind: 'smart_science_twin_towers', landmarkName: '奎屯丝路枢纽政务双塔', badgeTag: '北疆金三角重镇' },
  '654024': { kind: 'northeast_wooden_granary', landmarkName: '巩留库尔德宁云杉木屋', badgeTag: '天山雪岭云杉源' },
  '654221': { kind: 'pingyao_city_gate', landmarkName: '额敏也迷里辽金古城垣', badgeTag: '北疆油画塔额谷' },
  '654323': { kind: 'maritime_lighthouse_harbor', landmarkName: '福海乌伦古湖黄金海岸', badgeTag: '阿勒泰渔乡湖湾' },
  '659004': { kind: 'industrial_heritage_loft', landmarkName: '五家渠兵团将军楼红楼', badgeTag: '天山北麓兵团城' },
  '650204': { kind: 'industrial_heritage_loft', landmarkName: '白碱滩戈壁石化采油高塔', badgeTag: '克拉玛依石化芯' },
  '650422': { kind: 'karst_stone_watchtower', landmarkName: '托克逊盘吉尔风蚀怪石林', badgeTag: '中国第一早春城' },
  '652828': { kind: 'maritime_lighthouse_harbor', landmarkName: '和硕博斯腾湖金沙滩灯塔', badgeTag: '焉耆盆地葡萄酒' },
  '652924': { kind: 'ancient_water_wharf', landmarkName: '沙雅塔里木河胡杨林古渡', badgeTag: '世界原始胡杨林' },
  '652926': { kind: 'grotto_cliff_buddha', landmarkName: '拜城克孜尔千佛洞龟兹窟', badgeTag: '世界遗产龟兹窟' },
  '652927': { kind: 'beacon_tower_greatwall', landmarkName: '乌什别迭里古道长城烽燧', badgeTag: '西域千年燕泉山' },
  '653121': { kind: 'kashgar_islamic_arcade', landmarkName: '疏附民族乐器村丝路拱坊', badgeTag: '中国民族乐器乡' },
  '653130': { kind: 'ancient_silk_caravanserai_gate', landmarkName: '巴楚唐王城丝路夯土驿门胡杨', badgeTag: '唐王城古驿胡杨' },
  '653222': { kind: 'tea_house_heritage', landmarkName: '墨玉千年桑皮纸手工古坊', badgeTag: '人类非遗桑皮纸' },
  '653227': { kind: 'dunhuang_mogao_nine', landmarkName: '民丰尼雅精绝古城丝路壁', badgeTag: '五星出东方尼雅' },
  '654028': { kind: 'mongol_ger_oboo', landmarkName: '尼勒克唐布拉草原百里帐', badgeTag: '天山蜂蜜黑蜂乡' },
  '654202': { kind: 'industrial_heritage_loft', landmarkName: '乌苏乌苏啤酒与奎屯河驿', badgeTag: '北疆交通枢纽城' },
  '654226': { kind: 'potala_palace_fortress', landmarkName: '和布克赛尔东归江格尔宫', badgeTag: '江格尔史诗草原' },
  '654325': { kind: 'karst_stone_watchtower', landmarkName: '青河三道海子古草原石冢', badgeTag: '阿勒泰青格里狼' },
  '654326': { kind: 'inland_dryport_railhub', landmarkName: '吉木乃中哈边境口岸国门', badgeTag: '百年丝路北口岸' },
  '659003': { kind: 'red_revolution_memorial', landmarkName: '图木舒克新疆屯垦历史馆', badgeTag: '南疆屯垦军垦城' },
  '652928': { kind: 'kashgar_islamic_arcade', landmarkName: '阿瓦提刀郎部落西域拱门', badgeTag: '中国长绒棉乡' },
  '652929': { kind: 'beacon_tower_greatwall', landmarkName: '柯坪齐兰古道汉唐古烽燧', badgeTag: '驼城白山羊乡' },
  '653023': { kind: 'mongol_ger_oboo', landmarkName: '阿合奇托什干河玛纳斯帐', badgeTag: '中国猎鹰之乡' },
  '653122': { kind: 'jiayuguan_pass_fortress', landmarkName: '疏勒张骞西域故城丝路门', badgeTag: '汉唐疏勒古都' },
  '653128': { kind: 'desert_observatory_solar', landmarkName: '岳普湖达瓦昆大漠绿洲台', badgeTag: '大漠明珠绿洲' },
  '653129': { kind: 'kashgar_islamic_arcade', landmarkName: '伽师丝路新梅巴扎拱门街', badgeTag: '中国伽师瓜梅' },
  '653221': { kind: 'kashgar_islamic_arcade', landmarkName: '和田约特干于阗故城拱阙', badgeTag: '玉龙喀什绿洲' },
  '653223': { kind: 'karst_stone_watchtower', landmarkName: '皮山桑株丝路古道石碉驿', badgeTag: '昆仑藏茶古道' },
  '653224': { kind: 'dunhuang_mogao_nine', landmarkName: '洛浦山普鲁丝路织锦古馆', badgeTag: '山普鲁古于阗' },
  '653225': { kind: 'grotto_cliff_buddha', landmarkName: '策勒达玛沟千年小佛寺壁', badgeTag: '沙漠防风绿洲' },
  '653228': { kind: 'beacon_tower_greatwall', landmarkName: '和康昆岭喀喇昆仑雪域哨', badgeTag: '喀喇昆仑新县' },
  '653229': { kind: 'desert_observatory_solar', landmarkName: '和安红柳镇昆仑光热驿站', badgeTag: '昆仑南麓新县' },
  '654021': { kind: 'west_lake_leifeng', landmarkName: '伊宁县天鹅泉雾凇湿地阁', badgeTag: '塞外天鹅泉乡' },
  '654224': { kind: 'mongol_ger_oboo', landmarkName: '托里老风口巴尔鲁克毡帐', badgeTag: '塔额风电牧乡' },
  '654225': { kind: 'northeast_wooden_granary', landmarkName: '裕民巴尔鲁克山花木屋村', badgeTag: '山花之城巴旦' },
  '659005': { kind: 'modern_civic_opera', landmarkName: '北屯额尔齐斯玉带河展馆', badgeTag: '阿勒泰军垦城' },
  '659006': { kind: 'jiayuguan_pass_fortress', landmarkName: '铁门关丝路孔雀河古雄关', badgeTag: '丝路险隘雄关' },
  '659007': { kind: 'karst_stone_watchtower', landmarkName: '双河怪石峪丝路石城奇观', badgeTag: '博河屯垦新城' },
  '659008': { kind: 'sea_crossing_cable_bridge', landmarkName: '可克达拉大桥草原之夜城', badgeTag: '伊犁军垦花城' },
  '659009': { kind: 'red_revolution_memorial', landmarkName: '昆玉老兵进军和田纪念馆', badgeTag: '昆仑美玉兵团' },
  '659010': { kind: 'ancient_water_wharf', landmarkName: '胡杨河军垦水利渠首生态', badgeTag: '天北金三角城' },
  '659011': { kind: 'red_revolution_memorial', landmarkName: '新星红星军垦博物地窝子', badgeTag: '东疆红星兵团' },
  '659012': { kind: 'beacon_tower_greatwall', landmarkName: '白杨塔额边陲小白杨哨所', badgeTag: '小白杨戍边城' },

  // === 台港澳特别行政与省级示范单元 ===
  '710000-taipei': { kind: 'taipei_101_memorial', landmarkName: '台北101与大稻埕红砖楼', badgeTag: '设计书店都会极' },
  '710000-tainan': { kind: 'minnan_swallowtail_qilou', landmarkName: '台南赤嵌楼与安平红砖巷', badgeTag: '百年府城古巷风' },
  '810000-central': { kind: 'hk_boc_harbour', landmarkName: '香港中银棱柱与维港天际', badgeTag: '维港国际金融核' },
  '810000-shamshuipo': { kind: 'canton_tower_qilou', landmarkName: '深水埗雷生春百年骑楼街', badgeTag: '市井布艺骑楼街' },
  '820000-peninsula': { kind: 'macau_st_pauls', landmarkName: '澳门大三巴牌坊世遗石阶', badgeTag: '中西世遗大三巴' },
  '820000-coloane': { kind: 'volcanic_stone_village', landmarkName: '路环圣方济各渔村广场', badgeTag: '滨海渔村慢生活' },
};

const ARCHETYPE_GENERIC_META: Readonly<Record<LandmarkArchetypeId, { suffix: string; badge: string; backdrop: BackdropZone; waterfront?: boolean }>> = {
  bayong_lou: { suffix: '双檐临江名楼', badge: '古楼词韵地标', backdrop: 'jiangnan', waterfront: true },
  wanfo_pagoda_plaza: { suffix: '古塔与文体广场', badge: '塔影现代新城', backdrop: 'urban' },
  covered_bridge_pavilion: { suffix: '古韵风雨廊桥', badge: '古廊桥水乡', backdrop: 'jiangnan', waterfront: true },
  memorial_archway_paifang: { suffix: '百年石雕牌坊群', badge: '宗祠古牌坊', backdrop: 'mountain' },
  tea_house_heritage: { suffix: '飞檐古茶坊楼', badge: '生态名茶楼阁', backdrop: 'mountain' },
  ancestral_taiji_hall: { suffix: '宗祠水池古村落', badge: '宗祠八卦村落', backdrop: 'jiangnan', waterfront: true },
  yiwu_tradecity_jiming: { suffix: '商贸枢纽与文阁', badge: '商贸会展地标', backdrop: 'urban' },
  dongyang_luzhai_mansion: { suffix: '雕梁画栋古门楼', badge: '木雕明清古建', backdrop: 'jiangnan' },
  wufeng_academy_cliff: { suffix: '丹崖书院飞阁', badge: '山岳丹霞书院', backdrop: 'mountain' },
  tiananmen_gatehouse: { suffix: '重檐丹壁宫阙门', badge: '皇城礼制阙楼', backdrop: 'urban' },
  temple_of_heaven: { suffix: '三重蓝瓦圆殿坛', badge: '礼天古坛名殿', backdrop: 'urban' },
  summer_palace_foxxiang: { suffix: '临湖八角楼阁群', badge: '皇家山水园林', backdrop: 'jiangnan', waterfront: true },
  oriental_pearl_lujiazui: { suffix: '高塔摩天金融天际', badge: '超大型都会天际', backdrop: 'urban', waterfront: true },
  bund_shikumen: { suffix: '百年钟楼与洋房群', badge: '开埠历史建筑', backdrop: 'urban', waterfront: true },
  canton_tower_qilou: { suffix: '岭南骑楼与都市塔', badge: '岭南骑楼商街', backdrop: 'urban', waterfront: true },
  pingan_harbor_skyline: { suffix: '海湾超高层科创极', badge: '湾区摩天港湾', backdrop: 'coastal', waterfront: true },
  hk_boc_harbour: { suffix: '棱柱大厦与海港湾', badge: '港湾金融地标', backdrop: 'coastal', waterfront: true },
  macau_st_pauls: { suffix: '巴洛克石雕大牌坊', badge: '中西合璧石坊', backdrop: 'coastal' },
  taipei_101_memorial: { suffix: '竹节高塔与红砖街', badge: '都会文创双标', backdrop: 'urban' },
  jiangnan_gardens_gate: { suffix: '月洞门与粉墙黛瓦', badge: '江南古典园林', backdrop: 'jiangnan', waterfront: true },
  west_lake_leifeng: { suffix: '湖畔古塔与单孔桥', badge: '湖光塔影名胜', backdrop: 'jiangnan', waterfront: true },
  yellow_crane_tower: { suffix: '多檐雄峙临江名楼', badge: '重檐千古名楼', backdrop: 'jiangnan', waterfront: true },
  tengwang_yueyang_tower: { suffix: '水岸飞阁与重檐楼', badge: '水岸文化名楼', backdrop: 'jiangnan', waterfront: true },
  huizhou_matouqiang: { suffix: '马头墙古村落倒影', badge: '徽派马头墙群', backdrop: 'mountain', waterfront: true },
  fujian_tulou_round: { suffix: '圆形夯土围屋楼寨', badge: '客家圆土楼寨', backdrop: 'mountain' },
  minnan_swallowtail_qilou: { suffix: '红砖燕尾脊古大厝', badge: '闽潮燕尾红厝', backdrop: 'coastal' },
  potala_palace_fortress: { suffix: '雪域红白藏式宫堡', badge: '高原金顶宫堡', backdrop: 'plateau' },
  diaojiaolou_stilt: { suffix: '临江木构吊脚楼群', badge: '山水吊脚木楼', backdrop: 'karst', waterfront: true },
  dong_drum_tower: { suffix: '九重飞檐杉木鼓楼', badge: '民族鼓楼廊桥', backdrop: 'karst' },
  dali_three_pagodas: { suffix: '苍山映水三古塔', badge: '高原佛塔水映', backdrop: 'plateau', waterfront: true },
  lijiang_naxi_gate: { suffix: '古镇水车与雪山府', badge: '古镇水车木府', backdrop: 'plateau', waterfront: true },
  dai_peacock_temple: { suffix: '热带金顶白塔佛殿', badge: '热带民族白塔', backdrop: 'karst' },
  xian_bell_goose_pagoda: { suffix: '唐风方塔与钟鼓楼', badge: '关中汉唐古塔', backdrop: 'loess' },
  yaodong_baota_hill: { suffix: '黄土坡拱形窑洞塔', badge: '黄土窑洞宝塔', backdrop: 'loess' },
  yingxian_timber_pagoda: { suffix: '斗拱重檐纯木古塔', badge: '辽宋古建木塔', backdrop: 'loess' },
  pingyao_city_gate: { suffix: '垛口瓮城与谯楼门', badge: '明清古城城楼', backdrop: 'loess' },
  dunhuang_mogao_nine: { suffix: '丹崖石窟悬空飞阁', badge: '丝路石窟九阁', backdrop: 'desert' },
  jiayuguan_pass_fortress: { suffix: '戈壁夯土关城雄关', badge: '丝路边关长城', backdrop: 'desert' },
  kashgar_islamic_arcade: { suffix: '拱门宣礼塔与生土楼', badge: '西域拱门古街', backdrop: 'desert' },
  harbin_sophia_dome: { suffix: '红砖绿顶洋葱穹教堂', badge: '欧陆风情穹顶', backdrop: 'urban' },
  mongol_ger_oboo: { suffix: '草原白色穹庐与敖包', badge: '草原蒙古包群', backdrop: 'grassland' },
  dujiangyan_temple_weir: { suffix: '江堰索桥与山门庙', badge: '蜀水索桥古堰', backdrop: 'mountain', waterfront: true },
  chongqing_hongyadong: { suffix: '崖壁层叠山城吊脚阁', badge: '立体山城江阁', backdrop: 'karst', waterfront: true },
  confucian_temple_qufu: { suffix: '红柱金瓦文庙大成殿', badge: '孔孟书院礼乐', backdrop: 'urban' },
  maritime_lighthouse_harbor: { suffix: '海湾灯塔与开埠港楼', badge: '海岸灯塔港湾', backdrop: 'coastal', waterfront: true },
  sea_crossing_cable_bridge: { suffix: '双塔斜拉跨海大桥', badge: '跨海斜拉枢纽', backdrop: 'coastal', waterfront: true },
  hsr_modern_hub: { suffix: '飞翼流线高铁枢纽站', badge: '现代高铁站城', backdrop: 'urban' },
  modern_civic_opera: { suffix: '弧线壳体文化大剧院', badge: '现代文博剧院', backdrop: 'urban', waterfront: true },
  smart_science_twin_towers: { suffix: '科创玻璃双子研发塔', badge: '现代科创双塔', backdrop: 'urban' },
  ancient_water_wharf: { suffix: '古运河石阶水门码头', badge: '运河古渡水门', backdrop: 'jiangnan', waterfront: true },
  bamboo_courtyard_library: { suffix: '竹林木构现代乡村馆', badge: '生态乡建书院', backdrop: 'mountain' },
  beacon_tower_greatwall: { suffix: '山脊长城垛口烽燧楼', badge: '边塞长城烽燧', backdrop: 'loess' },
  industrial_heritage_loft: { suffix: '红砖锯齿工业文创园', badge: '工业遗产焕新', backdrop: 'urban' },
  desert_observatory_solar: { suffix: '大漠光热高塔与宿集', badge: '戈壁绿电星空', backdrop: 'desert' },
  volcanic_stone_village: { suffix: '玄武火山石门与椰林', badge: '热带石屋村门', backdrop: 'coastal' },
  karst_stone_watchtower: { suffix: '悬崖石砌古碉楼寨门', badge: '山地石砌碉楼', backdrop: 'karst' },
  hakka_weilongwu: { suffix: '客家半月塘围龙古居', badge: '客都围龙民居', backdrop: 'mountain', waterfront: true },
  shanxi_courtyard_jinshang: { suffix: '晋商高墙深宅砖雕院', badge: '晋商高墙大院', backdrop: 'loess' },
  tibetan_white_pagoda: { suffix: '雪域覆钵白塔经幡阵', badge: '高原白塔经幡', backdrop: 'plateau' },
  dong_wind_rain_bridge: { suffix: '五亭飞檐风雨廊桥', badge: '侗寨风雨廊桥', backdrop: 'karst', waterfront: true },
  northeast_wooden_granary: { suffix: '关东木刻楞林海粮仓', badge: '关东木刻楞仓', backdrop: 'mountain' },
  lingnan_wok_ear_hall: { suffix: '岭南镬耳山墙古宗祠', badge: '广府镬耳书院', backdrop: 'mountain' },
  grand_canal_granary: { suffix: '大运河漕运古仓钞关', badge: '运河漕运钞关', backdrop: 'jiangnan', waterfront: true },
  karst_radio_telescope: { suffix: '喀斯特天眼射电巨阵', badge: '天眼射电奇观', backdrop: 'karst' },
  grotto_cliff_buddha: { suffix: '摩崖石窟造像群', badge: '千年石窟造像', backdrop: 'loess' },
  porcelain_dragon_kiln: { suffix: '古龙窑青花瓷坊', badge: '千年窑火瓷韵', backdrop: 'mountain' },
  salt_well_derrick: { suffix: '天车盐井晒盐池', badge: '井盐湖盐遗产', backdrop: 'mountain', waterfront: true },
  terraced_rice_pavilion: { suffix: '云海梯田观景阁', badge: '高山云海梯田', backdrop: 'karst', waterfront: true },
  ancient_star_observatory: { suffix: '古观星台浑仪阁', badge: '观象授时古台', backdrop: 'loess' },
  red_revolution_memorial: { suffix: '红色会址纪念馆', badge: '红色革命圣地', backdrop: 'mountain' },
  hydroelectric_arch_dam: { suffix: '高峡大坝水电枢', badge: '大国水电重器', backdrop: 'karst', waterfront: true },
  inland_dryport_railhub: { suffix: '陆港班列国门枢', badge: '丝路陆港国门', backdrop: 'grassland' },
  ancient_post_station: { suffix: '古驿道驿城门楼', badge: '千年古驿驿道', backdrop: 'loess' },
  floating_water_market: { suffix: '水乡廊棚船市', badge: '河埠廊棚水市', backdrop: 'jiangnan', waterfront: true },
  wind_solar_storage_base: { suffix: '风光储氢大基地', badge: '沙戈荒绿能极', backdrop: 'desert' },
  iron_chain_canyon_bridge: { suffix: '峡谷古铁索桥', badge: '飞渡天堑索桥', backdrop: 'karst', waterfront: true },
  bamboo_sea_watchtower: { suffix: '竹海飞檐观涛阁', badge: '万亩翠竹林海', backdrop: 'mountain' },
  tea_horse_caravan_gate: { suffix: '茶马古道驿坊', badge: '千年茶马古道', backdrop: 'mountain' },
  mangrove_bird_boardwalk: { suffix: '红树林观鸟栈', badge: '滨海红树林湾', backdrop: 'coastal', waterfront: true },
  space_launch_gantry: { suffix: '航天发射塔架', badge: '商业航天母港', backdrop: 'urban' },
  coastal_salt_pan_pyramid: { suffix: '海滨晒盐方阵银垛', badge: '海盐方阵风车', backdrop: 'coastal', waterfront: true },
  hanging_cliff_monastery: { suffix: '绝壁悬空栈阁古寺', badge: '危崖飞阁奇观', backdrop: 'mountain' },
  crater_tianchi_volcano_rim: { suffix: '火山口天池玄武台', badge: '火山天池奇观', backdrop: 'plateau', waterfront: true },
  automated_deepwater_port_crane: { suffix: '深水自动化桥吊港', badge: '智慧深水大港', backdrop: 'coastal', waterfront: true },
  glacier_snow_peak_station: { suffix: '雪山冰川索道科考站', badge: '雪域冰川极地站', backdrop: 'plateau' },
  classical_wood_opera_stage: { suffix: '重檐雕花古戏台', badge: '雕花木构古戏台', backdrop: 'jiangnan' },
  geothermal_hot_spring_pavilion: { suffix: '地热温泉雾气亭榭', badge: '地热汤泉康养亭', backdrop: 'mountain', waterfront: true },
  subtropical_coffee_drying_terrace: { suffix: '咖啡庄园晒场焙坊', badge: '精品咖啡庄园坊', backdrop: 'mountain' },
  ancient_stone_aqueduct_weir: { suffix: '古石堰渠分水闸', badge: '千年石堰水利', backdrop: 'mountain', waterfront: true },
  cliffside_tea_terraces: { suffix: '云雾崖畔阶梯茶园', badge: '高山云雾茶梯', backdrop: 'mountain' },
  island_wind_turbine_bay: { suffix: '海岛离岸风机风廊', badge: '海岛海上风电', backdrop: 'coastal', waterfront: true },
  border_port_railway_gate: { suffix: '口岸国门铁路门楼', badge: '跨轨铁路国门', backdrop: 'grassland' },
  bamboo_raft_karst_pier: { suffix: '峰林碧水竹筏码头', badge: '喀斯特竹筏画廊', backdrop: 'karst', waterfront: true },
  glass_greenhouse_agripark: { suffix: '连栋智能玻璃温室', badge: '智慧设施温室园', backdrop: 'urban' },
  red_sandstone_danxia_arch: { suffix: '赤壁丹霞石拱栈道', badge: '赤壁丹霞奇观', backdrop: 'mountain' },
  snow_birch_timber_station: { suffix: '雪原白桦森林驿站', badge: '林海雪原白桦驿', backdrop: 'plateau' },
  tidal_estuary_sluice_bridge: { suffix: '河口潮汐挡潮闸海堤', badge: '河口潮汐闸桥', backdrop: 'coastal', waterfront: true },
  volcanic_basalt_sea_stack: { suffix: '火山玄武岩海蚀柱壁', badge: '火山海蚀柱崖', backdrop: 'coastal', waterfront: true },
  subterranean_karst_cavern_hall: { suffix: '溶洞石笋暗河栈道厅', badge: '溶洞石笋穹厅', backdrop: 'karst', waterfront: true },
  floating_solar_reservoir_array: { suffix: '水面漂浮光伏电站阵', badge: '湖库漂浮绿电', backdrop: 'jiangnan', waterfront: true },
  high_speed_viaduct_mountain_tunnel: { suffix: '山岳高铁跨谷隧道桥', badge: '高铁跨谷隧道', backdrop: 'karst', waterfront: true },
  ceramic_dragon_kiln_chimney: { suffix: '古龙窑阶梯窑棚烟囱', badge: '古龙窑瓷韵烟', backdrop: 'mountain' },
  alpine_yak_meadow_pass: { suffix: '高寒垭口经幡牦牛牧', badge: '垭口经幡牦牛', backdrop: 'plateau' },
  ancient_silk_caravanserai_gate: { suffix: '丝路土夯古驿门胡杨', badge: '丝路古驿胡杨', backdrop: 'desert' },
};

type BackdropZone =
  | 'jiangnan'
  | 'mountain'
  | 'karst'
  | 'plateau'
  | 'desert'
  | 'grassland'
  | 'coastal'
  | 'urban'
  | 'loess';

const PROVINCE_ARCHETYPE_POOLS: Readonly<Record<string, readonly LandmarkArchetypeId[]>> = {
  '110000': ['temple_of_heaven', 'tiananmen_gatehouse', 'summer_palace_foxxiang', 'smart_science_twin_towers', 'beacon_tower_greatwall', 'modern_civic_opera'],
  '120000': ['bund_shikumen', 'maritime_lighthouse_harbor', 'sea_crossing_cable_bridge', 'memorial_archway_paifang', 'hsr_modern_hub', 'industrial_heritage_loft'],
  '130000': ['pingyao_city_gate', 'ceramic_dragon_kiln_chimney', 'ancient_post_station', 'beacon_tower_greatwall', 'yaodong_baota_hill', 'hsr_modern_hub', 'confucian_temple_qufu', 'maritime_lighthouse_harbor', 'grand_canal_granary'],
  '140000': ['shanxi_courtyard_jinshang', 'yingxian_timber_pagoda', 'hanging_cliff_monastery', 'classical_wood_opera_stage', 'pingyao_city_gate', 'ancient_post_station', 'confucian_temple_qufu', 'yaodong_baota_hill', 'memorial_archway_paifang'],
  '150000': ['mongol_ger_oboo', 'ancient_silk_caravanserai_gate', 'snow_birch_timber_station', 'border_port_railway_gate', 'wind_solar_storage_base', 'modern_civic_opera', 'desert_observatory_solar', 'crater_tianchi_volcano_rim', 'industrial_heritage_loft', 'beacon_tower_greatwall', 'northeast_wooden_granary'],
  '210000': ['tiananmen_gatehouse', 'subterranean_karst_cavern_hall', 'island_wind_turbine_bay', 'bund_shikumen', 'maritime_lighthouse_harbor', 'industrial_heritage_loft', 'sea_crossing_cable_bridge', 'northeast_wooden_granary'],
  '220000': ['northeast_wooden_granary', 'border_port_railway_gate', 'crater_tianchi_volcano_rim', 'tea_house_heritage', 'harbin_sophia_dome', 'industrial_heritage_loft', 'mongol_ger_oboo', 'confucian_temple_qufu'],
  '230000': ['northeast_wooden_granary', 'snow_birch_timber_station', 'border_port_railway_gate', 'crater_tianchi_volcano_rim', 'harbin_sophia_dome', 'bund_shikumen', 'industrial_heritage_loft', 'bamboo_courtyard_library', 'maritime_lighthouse_harbor'],
  '310000': ['oriental_pearl_lujiazui', 'bund_shikumen', 'floating_water_market', 'smart_science_twin_towers', 'jiangnan_gardens_gate', 'covered_bridge_pavilion', 'modern_civic_opera'],
  '320000': ['jiangnan_gardens_gate', 'tidal_estuary_sluice_bridge', 'floating_solar_reservoir_array', 'island_wind_turbine_bay', 'floating_water_market', 'grand_canal_granary', 'ancient_water_wharf', 'coastal_salt_pan_pyramid', 'bamboo_sea_watchtower', 'covered_bridge_pavilion', 'smart_science_twin_towers', 'sea_crossing_cable_bridge'],
  '330000': ['west_lake_leifeng', 'tidal_estuary_sluice_bridge', 'volcanic_basalt_sea_stack', 'ceramic_dragon_kiln_chimney', 'cliffside_tea_terraces', 'island_wind_turbine_bay', 'bamboo_raft_karst_pier', 'red_sandstone_danxia_arch', 'floating_water_market', 'automated_deepwater_port_crane', 'classical_wood_opera_stage', 'bamboo_sea_watchtower', 'bayong_lou', 'covered_bridge_pavilion', 'ancient_water_wharf', 'bamboo_courtyard_library', 'dongyang_luzhai_mansion', 'memorial_archway_paifang', 'sea_crossing_cable_bridge'],
  '340000': ['huizhou_matouqiang', 'floating_solar_reservoir_array', 'ancient_stone_aqueduct_weir', 'classical_wood_opera_stage', 'bamboo_sea_watchtower', 'ancient_post_station', 'memorial_archway_paifang', 'smart_science_twin_towers', 'tengwang_yueyang_tower', 'tea_house_heritage', 'bamboo_courtyard_library'],
  '350000': ['minnan_swallowtail_qilou', 'volcanic_basalt_sea_stack', 'subterranean_karst_cavern_hall', 'ceramic_dragon_kiln_chimney', 'cliffside_tea_terraces', 'island_wind_turbine_bay', 'red_sandstone_danxia_arch', 'fujian_tulou_round', 'automated_deepwater_port_crane', 'mangrove_bird_boardwalk', 'hakka_weilongwu', 'tea_house_heritage', 'maritime_lighthouse_harbor', 'sea_crossing_cable_bridge'],
  '360000': ['tengwang_yueyang_tower', 'red_sandstone_danxia_arch', 'classical_wood_opera_stage', 'huizhou_matouqiang', 'hakka_weilongwu', 'covered_bridge_pavilion', 'wufeng_academy_cliff', 'tea_house_heritage'],
  '370000': ['confucian_temple_qufu', 'floating_solar_reservoir_array', 'ceramic_dragon_kiln_chimney', 'glass_greenhouse_agripark', 'island_wind_turbine_bay', 'coastal_salt_pan_pyramid', 'automated_deepwater_port_crane', 'grand_canal_granary', 'maritime_lighthouse_harbor', 'space_launch_gantry', 'tengwang_yueyang_tower', 'sea_crossing_cable_bridge', 'hsr_modern_hub'],
  '410000': ['tiananmen_gatehouse', 'ceramic_dragon_kiln_chimney', 'ancient_stone_aqueduct_weir', 'cliffside_tea_terraces', 'yingxian_timber_pagoda', 'classical_wood_opera_stage', 'confucian_temple_qufu', 'smart_science_twin_towers', 'grand_canal_granary', 'memorial_archway_paifang'],
  '420000': ['yellow_crane_tower', 'high_speed_viaduct_mountain_tunnel', 'cliffside_tea_terraces', 'bund_shikumen', 'geothermal_hot_spring_pavilion', 'ancient_water_wharf', 'karst_stone_watchtower', 'dujiangyan_temple_weir', 'dong_wind_rain_bridge'],
  '430000': ['tengwang_yueyang_tower', 'high_speed_viaduct_mountain_tunnel', 'ceramic_dragon_kiln_chimney', 'red_sandstone_danxia_arch', 'diaojiaolou_stilt', 'geothermal_hot_spring_pavilion', 'dong_wind_rain_bridge', 'confucian_temple_qufu', 'wufeng_academy_cliff', 'covered_bridge_pavilion'],
  '440000': ['lingnan_wok_ear_hall', 'volcanic_basalt_sea_stack', 'subterranean_karst_cavern_hall', 'island_wind_turbine_bay', 'red_sandstone_danxia_arch', 'geothermal_hot_spring_pavilion', 'automated_deepwater_port_crane', 'mangrove_bird_boardwalk', 'floating_water_market', 'hakka_weilongwu', 'canton_tower_qilou', 'pingan_harbor_skyline', 'minnan_swallowtail_qilou', 'sea_crossing_cable_bridge'],
  '450000': ['dong_wind_rain_bridge', 'volcanic_basalt_sea_stack', 'subterranean_karst_cavern_hall', 'bamboo_raft_karst_pier', 'border_port_railway_gate', 'ancient_stone_aqueduct_weir', 'automated_deepwater_port_crane', 'mangrove_bird_boardwalk', 'dong_drum_tower', 'diaojiaolou_stilt', 'karst_stone_watchtower', 'canton_tower_qilou', 'covered_bridge_pavilion'],
  '460000': ['volcanic_stone_village', 'volcanic_basalt_sea_stack', 'subtropical_coffee_drying_terrace', 'coastal_salt_pan_pyramid', 'space_launch_gantry', 'mangrove_bird_boardwalk', 'maritime_lighthouse_harbor', 'modern_civic_opera', 'sea_crossing_cable_bridge', 'smart_science_twin_towers', 'canton_tower_qilou'],
  '500000': ['chongqing_hongyadong', 'high_speed_viaduct_mountain_tunnel', 'diaojiaolou_stilt', 'karst_stone_watchtower', 'sea_crossing_cable_bridge', 'covered_bridge_pavilion', 'hsr_modern_hub'],
  '510000': ['dujiangyan_temple_weir', 'alpine_yak_meadow_pass', 'ancient_stone_aqueduct_weir', 'glacier_snow_peak_station', 'iron_chain_canyon_bridge', 'bamboo_sea_watchtower', 'tea_horse_caravan_gate', 'space_launch_gantry', 'jiangnan_gardens_gate', 'tea_house_heritage', 'karst_stone_watchtower', 'wufeng_academy_cliff', 'tibetan_white_pagoda'],
  '520000': ['dong_wind_rain_bridge', 'subterranean_karst_cavern_hall', 'bamboo_raft_karst_pier', 'cliffside_tea_terraces', 'hanging_cliff_monastery', 'geothermal_hot_spring_pavilion', 'iron_chain_canyon_bridge', 'bamboo_sea_watchtower', 'dong_drum_tower', 'karst_radio_telescope', 'karst_stone_watchtower', 'tea_house_heritage', 'covered_bridge_pavilion'],
  '530000': ['dali_three_pagodas', 'subterranean_karst_cavern_hall', 'high_speed_viaduct_mountain_tunnel', 'border_port_railway_gate', 'subtropical_coffee_drying_terrace', 'glacier_snow_peak_station', 'tea_horse_caravan_gate', 'iron_chain_canyon_bridge', 'lijiang_naxi_gate', 'dai_peacock_temple', 'tea_house_heritage', 'karst_stone_watchtower', 'potala_palace_fortress'],
  '540000': ['potala_palace_fortress', 'alpine_yak_meadow_pass', 'glacier_snow_peak_station', 'tibetan_white_pagoda', 'karst_stone_watchtower', 'dali_three_pagodas', 'mongol_ger_oboo'],
  '610000': ['xian_bell_goose_pagoda', 'ceramic_dragon_kiln_chimney', 'ancient_stone_aqueduct_weir', 'cliffside_tea_terraces', 'glass_greenhouse_agripark', 'yaodong_baota_hill', 'shanxi_courtyard_jinshang', 'beacon_tower_greatwall', 'smart_science_twin_towers', 'confucian_temple_qufu'],
  '620000': ['dunhuang_mogao_nine', 'alpine_yak_meadow_pass', 'ancient_silk_caravanserai_gate', 'red_sandstone_danxia_arch', 'wind_solar_storage_base', 'space_launch_gantry', 'jiayuguan_pass_fortress', 'tibetan_white_pagoda', 'desert_observatory_solar', 'xian_bell_goose_pagoda', 'yaodong_baota_hill'],
  '630000': ['tibetan_white_pagoda', 'alpine_yak_meadow_pass', 'hanging_cliff_monastery', 'wind_solar_storage_base', 'potala_palace_fortress', 'desert_observatory_solar', 'mongol_ger_oboo', 'kashgar_islamic_arcade'],
  '640000': ['xian_bell_goose_pagoda', 'ancient_stone_aqueduct_weir', 'wind_solar_storage_base', 'desert_observatory_solar', 'kashgar_islamic_arcade', 'yaodong_baota_hill', 'beacon_tower_greatwall'],
  '650000': ['kashgar_islamic_arcade', 'ancient_silk_caravanserai_gate', 'border_port_railway_gate', 'glass_greenhouse_agripark', 'snow_birch_timber_station', 'glacier_snow_peak_station', 'wind_solar_storage_base', 'jiayuguan_pass_fortress', 'desert_observatory_solar', 'mongol_ger_oboo', 'northeast_wooden_granary', 'beacon_tower_greatwall'],
  '710000': ['taipei_101_memorial', 'minnan_swallowtail_qilou', 'maritime_lighthouse_harbor', 'bamboo_courtyard_library'],
  '810000': ['hk_boc_harbour', 'canton_tower_qilou', 'pingan_harbor_skyline', 'sea_crossing_cable_bridge'],
  '820000': ['macau_st_pauls', 'volcanic_stone_village', 'bund_shikumen', 'modern_civic_opera'],
};

const PREFECTURE_LANDMARK_SPECS: Readonly<Record<string, readonly LandmarkArchetypeId[]>> = {
  '330100': ['west_lake_leifeng', 'tengwang_yueyang_tower', 'bamboo_courtyard_library', 'smart_science_twin_towers', 'covered_bridge_pavilion'],
  '330200': ['maritime_lighthouse_harbor', 'sea_crossing_cable_bridge', 'modern_civic_opera', 'ancient_water_wharf', 'dongyang_luzhai_mansion'],
  '330300': ['maritime_lighthouse_harbor', 'minnan_swallowtail_qilou', 'dongyang_luzhai_mansion', 'wufeng_academy_cliff', 'sea_crossing_cable_bridge'],
  '330400': ['ancient_water_wharf', 'covered_bridge_pavilion', 'jiangnan_gardens_gate', 'smart_science_twin_towers'],
  '330500': ['bamboo_courtyard_library', 'tea_house_heritage', 'jiangnan_gardens_gate', 'ancient_water_wharf'],
  '330600': ['bayong_lou', 'covered_bridge_pavilion', 'ancestral_taiji_hall', 'jiangnan_gardens_gate', 'hsr_modern_hub'],
  '330700': ['bayong_lou', 'wanfo_pagoda_plaza', 'covered_bridge_pavilion', 'memorial_archway_paifang', 'tea_house_heritage', 'ancestral_taiji_hall', 'yiwu_tradecity_jiming', 'dongyang_luzhai_mansion', 'wufeng_academy_cliff'],
  '330800': ['confucian_temple_qufu', 'wufeng_academy_cliff', 'memorial_archway_paifang', 'tea_house_heritage'],
  '330900': ['sea_crossing_cable_bridge', 'maritime_lighthouse_harbor', 'volcanic_stone_village'],
  '331000': ['pingyao_city_gate', 'maritime_lighthouse_harbor', 'wufeng_academy_cliff', 'sea_crossing_cable_bridge'],
  '331100': ['tea_house_heritage', 'covered_bridge_pavilion', 'bamboo_courtyard_library', 'wufeng_academy_cliff'],
  '320100': ['pingyao_city_gate', 'tengwang_yueyang_tower', 'smart_science_twin_towers', 'hsr_modern_hub'],
  '320500': ['jiangnan_gardens_gate', 'ancient_water_wharf', 'covered_bridge_pavilion', 'smart_science_twin_towers'],
  '341000': ['huizhou_matouqiang', 'memorial_archway_paifang', 'ancestral_taiji_hall', 'tea_house_heritage'],
  '350500': ['minnan_swallowtail_qilou', 'tea_house_heritage', 'dali_three_pagodas', 'maritime_lighthouse_harbor'],
  '360700': ['hakka_weilongwu', 'covered_bridge_pavilion', 'huizhou_matouqiang', 'fujian_tulou_round', 'memorial_archway_paifang'],
  '370200': ['maritime_lighthouse_harbor', 'sea_crossing_cable_bridge', 'bund_shikumen', 'modern_civic_opera'],
  '410300': ['tiananmen_gatehouse', 'wufeng_academy_cliff', 'confucian_temple_qufu', 'yingxian_timber_pagoda'],
  '420100': ['yellow_crane_tower', 'bund_shikumen', 'smart_science_twin_towers', 'modern_civic_opera'],
  '433100': ['diaojiaolou_stilt', 'dong_wind_rain_bridge', 'karst_stone_watchtower', 'covered_bridge_pavilion', 'dong_drum_tower'],
  '440100': ['lingnan_wok_ear_hall', 'canton_tower_qilou', 'jiangnan_gardens_gate', 'smart_science_twin_towers', 'modern_civic_opera'],
  '440300': ['pingan_harbor_skyline', 'smart_science_twin_towers', 'sea_crossing_cable_bridge', 'modern_civic_opera'],
  '450300': ['wufeng_academy_cliff', 'dong_wind_rain_bridge', 'karst_stone_watchtower', 'diaojiaolou_stilt', 'covered_bridge_pavilion'],
  '510100': ['dujiangyan_temple_weir', 'jiangnan_gardens_gate', 'bamboo_courtyard_library', 'smart_science_twin_towers'],
  '522600': ['dong_wind_rain_bridge', 'dong_drum_tower', 'diaojiaolou_stilt', 'covered_bridge_pavilion', 'tea_house_heritage'],
  '530700': ['lijiang_naxi_gate', 'potala_palace_fortress', 'karst_stone_watchtower'],
  '610100': ['xian_bell_goose_pagoda', 'tiananmen_gatehouse', 'smart_science_twin_towers', 'hsr_modern_hub'],
  '620200': ['jiayuguan_pass_fortress', 'beacon_tower_greatwall'],
  '620900': ['dunhuang_mogao_nine', 'jiayuguan_pass_fortress', 'desert_observatory_solar'],
  '653100': ['kashgar_islamic_arcade', 'jiayuguan_pass_fortress', 'desert_observatory_solar'],
};

function hashCode(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shortCountyTitle(name: string): string {
  const cleaned = name
    .replace(/（.*?）|\(.*?\)/gu, '')
    .replace(/·.*$/u, '')
    .replace(/(?:维吾尔|哈萨克|蒙古族|藏族|回族|壮族|苗族|侗族|瑶族|土家族|布依族|彝族|朝鲜族|满族|白族|纳西族|傣族|黎族|哈尼族|傈僳族|各族|自治县|自治旗|自治州|林区|矿区|新区|市|县|区|旗)$/u, '');
  return cleaned.length >= 2 ? cleaned : name.replace(/(?:市|县|区|旗)$/u, '') || name;
}

function pickToponymicPool(
  name: string,
  provinceCode: string,
  prefectureCode: string | null,
): readonly LandmarkArchetypeId[] {
  const prefPool = prefectureCode ? PREFECTURE_LANDMARK_SPECS[prefectureCode] : undefined;
  const provPool = PROVINCE_ARCHETYPE_POOLS[provinceCode] ?? PROVINCE_ARCHETYPE_POOLS['330000'];

  if (/挡潮闸|海塘|海堤|潮汐|盐官|曹娥江|射阳|条子泥/u.test(name)) {
    return ['tidal_estuary_sluice_bridge', 'sea_crossing_cable_bridge', 'maritime_lighthouse_harbor'];
  }
  if (/玄武岩|海蚀柱|石林岸|涠洲|南碇|海蚀崖/u.test(name)) {
    return ['volcanic_basalt_sea_stack', 'crater_tianchi_volcano_rim', 'volcanic_stone_village'];
  }
  if (/溶洞|石笋|地下河|暗河|织金|九乡|双河洞|玉华洞|水洞|百魔洞/u.test(name)) {
    return ['subterranean_karst_cavern_hall', 'karst_stone_watchtower', 'bamboo_raft_karst_pier'];
  }
  if (/漂浮光伏|沉陷区|采煤沉陷|渔光互补|水面光伏|潘集|凤台/u.test(name)) {
    return ['floating_solar_reservoir_array', 'wind_solar_storage_base', 'hydroelectric_arch_dam'];
  }
  if (/高铁|特大桥|跨谷|隧道群|奉节|巫山|利川/u.test(name)) {
    return ['high_speed_viaduct_mountain_tunnel', 'hsr_modern_hub', 'sea_crossing_cable_bridge'];
  }
  if (/龙窑|窑棚|龙泉|德化|禹州|博山|醴陵|磁县|耀州|建阳|青瓷/u.test(name)) {
    return ['ceramic_dragon_kiln_chimney', 'porcelain_dragon_kiln', 'industrial_heritage_loft'];
  }
  if (/垭口|牦牛|经幡|高寒草甸|红原|若尔盖|玛曲|夏河|称多|久治/u.test(name)) {
    return ['alpine_yak_meadow_pass', 'tibetan_white_pagoda', 'mongol_ger_oboo'];
  }
  if (/古驿城|古驿门|锁阳城|瓜州|额济纳|库车|新和|且末|轮台|巴楚|胡杨|烽燧/u.test(name)) {
    return ['ancient_silk_caravanserai_gate', 'ancient_post_station', 'jiayuguan_pass_fortress'];
  }
  if (/红旗渠|灵渠|郑国渠|青铜峡|木兰陂|通济堰|芍陂|都江堰|分水/u.test(name)) {
    return ['ancient_stone_aqueduct_weir', 'dujiangyan_temple_weir', 'ancient_water_wharf'];
  }
  if (/安溪|武夷山|平利|紫阳|浉河|松阳|湄潭|铁观音|毛尖|云雾茶/u.test(name)) {
    return ['cliffside_tea_terraces', 'tea_house_heritage', 'terraced_rice_pavilion'];
  }
  if (/平潭|南澳|嵊泗|长岛|如东|离岸风|风电湾/u.test(name)) {
    return ['island_wind_turbine_bay', 'maritime_lighthouse_harbor', 'sea_crossing_cable_bridge'];
  }
  if (/满洲里|凭祥|绥芬河|瑞丽|二连浩特|霍尔果斯|磨憨|勐腊|河口|口岸|国门/u.test(name)) {
    return ['border_port_railway_gate', 'inland_dryport_railhub', 'ancient_post_station'];
  }
  if (/阳朔|荔波|靖西|兴义|桐庐|宁明|马山|大新|竹筏/u.test(name)) {
    return ['bamboo_raft_karst_pier', 'karst_stone_watchtower', 'covered_bridge_pavilion'];
  }
  if (/寿光|兰陵|青州|杨陵|杨凌|昌吉|莘县|新绛|饶阳|温室|菜博/u.test(name)) {
    return ['glass_greenhouse_agripark', 'smart_science_twin_towers', 'hsr_modern_hub'];
  }
  if (/仁化|泰宁|临泽|贵溪|永兴|新宁|江山|弋阳|苏仙|丹霞|赤壁/u.test(name)) {
    return ['red_sandstone_danxia_arch', 'wufeng_academy_cliff', 'hanging_cliff_monastery'];
  }
  if (/根河|漠河|阿尔山|额尔古纳|嘉荫|伊美|汤旺|牙克石|布尔津|白桦|雪原/u.test(name)) {
    return ['snow_birch_timber_station', 'northeast_wooden_granary', 'crater_tianchi_volcano_rim'];
  }
  if (/驿|邮/u.test(name)) {
    return ['ancient_post_station', 'pingyao_city_gate', 'ancient_water_wharf'];
  }
  if (/咖啡|兴隆|思茅|芒市/u.test(name)) {
    return ['subtropical_coffee_drying_terrace', 'tea_horse_caravan_gate', 'tea_house_heritage'];
  }
  if (/温泉|汤池|汤泉|从化/u.test(name)) {
    return ['geothermal_hot_spring_pavilion', 'bamboo_courtyard_library', 'tea_house_heritage'];
  }
  if (/戏台|戏楼|乐平|嵊州/u.test(name)) {
    return ['classical_wood_opera_stage', 'dongyang_luzhai_mansion', 'ancestral_taiji_hall'];
  }
  if (/冰川|雪峰|雪山|定日|珠峰/u.test(name)) {
    return ['glacier_snow_peak_station', 'potala_palace_fortress', 'tibetan_white_pagoda'];
  }
  if (/北仑|深水港|自动化港|集装箱/u.test(name)) {
    return ['automated_deepwater_port_crane', 'maritime_lighthouse_harbor', 'sea_crossing_cable_bridge'];
  }
  if (/火山|天池|五大连池|抚松/u.test(name)) {
    return ['crater_tianchi_volcano_rim', 'volcanic_stone_village', 'wufeng_academy_cliff'];
  }
  if (/悬空|浑源|娲皇/u.test(name)) {
    return ['hanging_cliff_monastery', 'dunhuang_mogao_nine', 'wufeng_academy_cliff'];
  }
  if (/晒盐|盐田|莺歌海|莱州/u.test(name)) {
    return ['coastal_salt_pan_pyramid', 'salt_well_derrick', 'maritime_lighthouse_harbor'];
  }
  if (/竹海|翠竹|竹都|竹乡/u.test(name)) {
    return ['bamboo_sea_watchtower', 'bamboo_courtyard_library', 'tea_house_heritage'];
  }
  if (/普洱|勐海|宁洱|名山|茶马/u.test(name)) {
    return ['tea_horse_caravan_gate', 'tea_house_heritage', 'lijiang_naxi_gate'];
  }
  if (/红树|银海|防城|麻章|湿地|鹭/u.test(name)) {
    return ['mangrove_bird_boardwalk', 'maritime_lighthouse_harbor', 'volcanic_stone_village'];
  }
  if (/航天|卫星|发射|龙楼/u.test(name)) {
    return ['space_launch_gantry', 'smart_science_twin_towers', 'karst_radio_telescope'];
  }
  if (/铁索|索桥|泸定|渡口/u.test(name)) {
    return ['iron_chain_canyon_bridge', 'dujiangyan_temple_weir', 'covered_bridge_pavilion'];
  }
  if (/水乡|西塘|周庄|乌镇|朱家角|安昌/u.test(name)) {
    return ['floating_water_market', 'ancient_water_wharf', 'covered_bridge_pavilion'];
  }
  if (/风光|光伏|风电|光热|储能|瓜州|玉门/u.test(name)) {
    return ['wind_solar_storage_base', 'desert_observatory_solar', 'industrial_heritage_loft'];
  }
  if (/苗|侗|瑶|壮|土家|布依|畲/u.test(name)) {
    return ['dong_drum_tower', 'dong_wind_rain_bridge', 'diaojiaolou_stilt', 'karst_stone_watchtower', 'covered_bridge_pavilion'];
  }
  if (/藏|羌|喇嘛|香格|林芝|果洛|玉树/u.test(name)) {
    return ['potala_palace_fortress', 'tibetan_white_pagoda', 'karst_stone_watchtower', 'dali_three_pagodas'];
  }
  if (/蒙古|旗$|巴音|锡林|呼伦|科尔沁|鄂尔/u.test(name)) {
    return ['mongol_ger_oboo', 'desert_observatory_solar', 'beacon_tower_greatwall'];
  }
  if (/傣|景洪|勐|澜沧/u.test(name)) {
    return ['dai_peacock_temple', 'lijiang_naxi_gate', 'diaojiaolou_stilt'];
  }
  if (/港|海|湾|岛|滩|澳|潮|礁|渔/u.test(name)) {
    const coastal = ['maritime_lighthouse_harbor', 'sea_crossing_cable_bridge', 'volcanic_stone_village', 'canton_tower_qilou'] as const;
    return prefPool ? [...coastal.slice(0, 2), ...prefPool.slice(0, 2)] : coastal;
  }
  if (/山|岭|峰|岩|茶|竹|松|林|坪|谷|阳|苍/u.test(name)) {
    const mtn = ['tea_house_heritage', 'wufeng_academy_cliff', 'bamboo_courtyard_library', 'covered_bridge_pavilion', 'karst_stone_watchtower'] as const;
    return prefPool ? [mtn[0], prefPool[0], mtn[1], mtn[2], prefPool[prefPool.length - 1]] : mtn;
  }
  if (/河|江|湖|浦|溪|水|塘|池|泽|津|淀|洲|桥/u.test(name)) {
    const water = ['ancient_water_wharf', 'covered_bridge_pavilion', 'jiangnan_gardens_gate', 'bayong_lou', 'tengwang_yueyang_tower'] as const;
    return prefPool ? [water[0], prefPool[0], water[1], water[2]] : water;
  }
  if (/关|塞|城|堡|卫|营|州|府|台|楼|陵|古/u.test(name)) {
    const fort = ['pingyao_city_gate', 'memorial_archway_paifang', 'confucian_temple_qufu', 'beacon_tower_greatwall', 'dongyang_luzhai_mansion'] as const;
    return prefPool ? [fort[0], prefPool[0], fort[1], fort[2]] : fort;
  }
  if (/沙|漠|戈壁|敦煌|酒泉|哈密|喀什|吐鲁/u.test(name)) {
    return ['desert_observatory_solar', 'jiayuguan_pass_fortress', 'kashgar_islamic_arcade', 'dunhuang_mogao_nine'];
  }
  if (/盐|卤/u.test(name)) {
    return ['salt_well_derrick', 'ancient_water_wharf', 'karst_stone_watchtower'];
  }
  if (/窑|瓷|陶/u.test(name)) {
    return ['ceramic_dragon_kiln_chimney', 'porcelain_dragon_kiln', 'industrial_heritage_loft'];
  }
  if (/矿|钢|煤|油|铁|新|高新|经开|开发|区$/u.test(name)) {
    const urban = ['smart_science_twin_towers', 'hsr_modern_hub', 'modern_civic_opera', 'industrial_heritage_loft', 'wanfo_pagoda_plaza'] as const;
    return prefPool ? [urban[0], prefPool[0], urban[1], urban[2]] : urban;
  }

  return prefPool ?? provPool;
}

export function resolveCountyLandmark(input: {
  code: string;
  name: string;
  provinceCode: string;
  prefectureCode: string | null;
  prefectureName: string;
  tags?: readonly string[];
  visualMotif?: string;
  customLandmarkName?: string;
  customLandmarkKind?: LandmarkArchetypeId;
}): LandmarkResolution {
  if (input.customLandmarkKind && input.customLandmarkName) {
    const meta = ARCHETYPE_GENERIC_META[input.customLandmarkKind];
    return {
      kind: input.customLandmarkKind,
      landmarkName: input.customLandmarkName,
      badgeTag: meta.badge,
    };
  }

  const exact = COUNTY_EXACT_LANDMARKS[input.code];
  if (exact) {
    return exact;
  }

  const seed = hashCode(`${input.code}:${input.name}`);
  const pool = pickToponymicPool(input.name, input.provinceCode, input.prefectureCode);
  const kind = pool[seed % pool.length];
  const meta = ARCHETYPE_GENERIC_META[kind];
  const shortName = shortCountyTitle(input.name);
  const landmarkName = `${shortName}${meta.suffix}`;

  return {
    kind,
    landmarkName,
    badgeTag: meta.badge,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textWidthUnits(value: string): number {
  let units = 0;
  for (const ch of value) {
    units += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/u.test(ch) ? 1.0 : 0.62;
  }
  return units;
}

function formatPlaqueName(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

// =============================================================================
// Shared Pure-Vector Architectural Primitives (assertTrueVector 100% safe)
// =============================================================================

const INK_DARK = '#1E293B';
const INK_MID = '#334155';
const GOLD = '#C4933F';
const GOLD_LIGHT = '#E9DFC9';
const PAPER = '#FAF8F4';
const IVORY = '#FFFDF9';
const STONE = '#E6DFD3';
const STONE_DEEP = '#C9BFA9';
const TERRACOTTA = '#A94438';

function drawAtmosphericBackdrop(
  zone: BackdropZone,
  waterfront: boolean,
  seed: number,
  primary: string,
  secondary: string,
): string {
  const parts: string[] = [];

  // Xuan-paper base & hairline border
  parts.push(`<rect x="0" y="0" width="360" height="225" rx="10" fill="${PAPER}"/>`);
  parts.push(`<rect x="4" y="4" width="352" height="217" rx="8" stroke="${primary}" stroke-opacity="0.14" stroke-width="1"/>`);

  // Layered sky wash (no gradient needed)
  parts.push(`<rect x="6" y="6" width="348" height="106" rx="6" fill="#F4EFE4" fill-opacity="0.58"/>`);
  parts.push(`<ellipse cx="180" cy="108" rx="154" ry="74" fill="#EFE8D8" fill-opacity="0.62"/>`);

  // Sun / Moon placement modulated deterministically by county code
  const sunRight = seed % 2 === 0;
  const sunX = sunRight ? 286 - (seed % 30) : 84 + (seed % 26);
  const sunY = 42 + (seed % 14);
  const isCrescent = seed % 5 === 4;

  parts.push(`<circle cx="${sunX}" cy="${sunY}" r="21" fill="${GOLD_LIGHT}" fill-opacity="0.72"/>`);
  parts.push(`<circle cx="${sunX}" cy="${sunY}" r="12" fill="${GOLD}" fill-opacity="0.34"/>`);
  if (isCrescent) {
    parts.push(`<circle cx="${sunX + 4}" cy="${sunY - 2}" r="9.5" fill="#F4EFE4" fill-opacity="0.92"/>`);
  }

  // Auspicious light clouds
  const cloudX = sunRight ? 66 + (seed % 34) : 238 + (seed % 30);
  const cloudY = 44 + ((seed >> 2) % 16);
  parts.push(
    `<path d="M ${cloudX} ${cloudY} Q ${cloudX + 14} ${cloudY - 6} ${cloudX + 26} ${cloudY} Q ${cloudX + 38} ${cloudY - 4} ${cloudX + 48} ${cloudY + 2}" stroke="${primary}" stroke-opacity="0.22" stroke-width="1.3" stroke-linecap="round"/>`
      + `<path d="M ${cloudX + 8} ${cloudY + 5} H ${cloudX + 38}" stroke="${GOLD}" stroke-opacity="0.32" stroke-width="1.1" stroke-linecap="round"/>`,
  );

  // Culture-zone horizon silhouette
  const phase = (seed % 3) * 6;
  switch (zone) {
    case 'karst':
      parts.push(
        `<path d="M 8 184 L 34 ${118 + phase} L 62 152 L 94 ${96 - phase} L 128 148 L 166 112 L 204 150 L 244 ${98 + phase} L 284 146 L 320 ${114 - phase} L 352 184 Z" fill="${primary}" fill-opacity="0.11"/>`
          + `<path d="M 8 184 Q 90 156 180 166 T 352 158 L 352 184 Z" fill="${primary}" fill-opacity="0.15"/>`,
      );
      break;
    case 'plateau':
      parts.push(
        `<polygon points="8,184 56,112 104,158 158,${92 + phase} 214,154 276,${98 - phase} 324,148 352,184" fill="${primary}" fill-opacity="0.15"/>`
          + `<polygon points="158,${92 + phase} 140,122 154,116 164,126 176,118" fill="#FFFFFF" fill-opacity="0.86"/>`
          + `<polygon points="276,${98 - phase} 258,124 272,118 282,126 294,119" fill="#FFFFFF" fill-opacity="0.82"/>`
          + `<polygon points="56,112 42,134 55,129 67,135" fill="#FFFFFF" fill-opacity="0.74"/>`,
      );
      break;
    case 'desert':
      parts.push(
        `<path d="M 8 184 Q 82 ${128 + phase} 174 154 T 352 138 L 352 184 Z" fill="${GOLD}" fill-opacity="0.16"/>`
          + `<path d="M 8 184 Q 120 152 232 ${168 - phase} T 352 162 L 352 184 Z" fill="${secondary}" fill-opacity="0.11"/>`,
      );
      break;
    case 'grassland':
      parts.push(
        `<path d="M 8 184 Q 96 ${136 + phase} 190 150 T 352 142 L 352 184 Z" fill="${primary}" fill-opacity="0.13"/>`
          + `<path d="M 8 184 Q 130 160 264 166 T 352 160 L 352 184 Z" fill="${GOLD}" fill-opacity="0.12"/>`,
      );
      break;
    case 'loess':
      parts.push(
        `<path d="M 8 184 V 146 H 68 L 88 126 H 152 L 172 142 H 242 L 266 124 H 322 L 352 144 V 184 Z" fill="${GOLD}" fill-opacity="0.15"/>`
          + `<path d="M 8 184 V 162 H 104 L 122 148 H 222 L 242 164 H 352 V 184 Z" fill="${primary}" fill-opacity="0.11"/>`,
      );
      break;
    case 'coastal':
      parts.push(
        `<path d="M 8 164 Q 92 152 184 160 T 352 156 L 352 184 L 8 184 Z" fill="${primary}" fill-opacity="0.13"/>`
          + `<path d="M 24 176 Q 76 170 128 176 T 248 176 T 336 176" stroke="${primary}" stroke-opacity="0.28" stroke-width="1.2"/>`,
      );
      break;
    case 'urban':
      parts.push(
        `<rect x="18" y="138" width="18" height="46" fill="${primary}" fill-opacity="0.09"/>`
          + `<rect x="40" y="122" width="22" height="62" fill="${INK_DARK}" fill-opacity="0.07"/>`
          + `<rect x="284" y="128" width="20" height="56" fill="${primary}" fill-opacity="0.09"/>`
          + `<rect x="308" y="114" width="24" height="70" fill="${INK_DARK}" fill-opacity="0.07"/>`
          + `<line x1="8" y1="184" x2="352" y2="184" stroke="${primary}" stroke-opacity="0.22" stroke-width="1"/>`,
      );
      break;
    case 'mountain':
      parts.push(
        `<path d="M 8 184 Q 76 ${116 + phase} 152 146 T 292 ${120 - phase} L 352 156 L 352 184 Z" fill="${primary}" fill-opacity="0.13"/>`
          + `<path d="M 8 184 Q 108 148 206 164 T 352 152 L 352 184 Z" fill="${primary}" fill-opacity="0.17"/>`,
      );
      break;
    case 'jiangnan':
    default:
      parts.push(
        `<path d="M 8 184 Q 88 ${134 + phase} 178 150 T 352 140 L 352 184 Z" fill="${primary}" fill-opacity="0.12"/>`
          + `<path d="M 8 184 Q 104 160 206 168 T 352 162 L 352 184 Z" fill="${primary}" fill-opacity="0.16"/>`,
      );
      break;
  }

  // Foreground plinth or water reflection ground (`y=184..220`)
  if (waterfront) {
    parts.push(`<rect x="6" y="184" width="348" height="36" rx="4" fill="${primary}" fill-opacity="0.09"/>`);
    parts.push(`<line x1="16" y1="184" x2="344" y2="184" stroke="${primary}" stroke-opacity="0.34" stroke-width="1.2"/>`);
    parts.push(
      `<line x1="56" y1="190" x2="128" y2="190" stroke="${primary}" stroke-opacity="0.28" stroke-width="1.1" stroke-linecap="round"/>`
        + `<line x1="224" y1="190" x2="298" y2="190" stroke="${primary}" stroke-opacity="0.28" stroke-width="1.1" stroke-linecap="round"/>`
        + `<line x1="112" y1="195" x2="246" y2="195" stroke="${GOLD}" stroke-opacity="0.30" stroke-width="1" stroke-linecap="round"/>`,
    );
  } else {
    parts.push(`<rect x="6" y="184" width="348" height="36" rx="4" fill="${STONE}" fill-opacity="0.48"/>`);
    parts.push(`<line x1="16" y1="184" x2="344" y2="184" stroke="${INK_MID}" stroke-opacity="0.28" stroke-width="1.2"/>`);
  }

  return parts.join('');
}

function drawChineseEaveTier(
  cx: number,
  yTop: number,
  topW: number,
  botW: number,
  h: number,
  fill: string,
  stroke = INK_DARK,
  ridgeFill = GOLD,
  curl = 6,
): string {
  const xTL = cx - topW / 2;
  const xTR = cx + topW / 2;
  const xBL = cx - botW / 2;
  const xBR = cx + botW / 2;
  const yBot = yTop + h;
  const cX = botW * 0.24;
  return (
    `<path d="M ${xTL} ${yTop} L ${xTR} ${yTop} Q ${xTR + cX * 0.4} ${yBot - curl} ${xBR} ${yBot - curl} Q ${cx + botW * 0.25} ${yBot + 2} ${cx} ${yBot} Q ${cx - botW * 0.25} ${yBot + 2} ${xBL} ${yBot - curl} Q ${xTL - cX * 0.4} ${yBot - curl} ${xTL} ${yTop} Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/>`
    + `<line x1="${xTL - 2}" y1="${yTop}" x2="${xTR + 2}" y2="${yTop}" stroke="${ridgeFill}" stroke-width="2.2" stroke-linecap="round"/>`
    + `<circle cx="${xTL - 2}" cy="${yTop - 1}" r="1.7" fill="${ridgeFill}"/>`
    + `<circle cx="${xTR + 2}" cy="${yTop - 1}" r="1.7" fill="${ridgeFill}"/>`
  );
}

function drawXieshanRoof(
  cx: number,
  yTop: number,
  ridgeW: number,
  eaveW: number,
  h: number,
  fill: string,
  stroke = INK_DARK,
  ridgeFill = GOLD,
): string {
  const rL = cx - ridgeW / 2;
  const rR = cx + ridgeW / 2;
  const eL = cx - eaveW / 2;
  const eR = cx + eaveW / 2;
  const yBot = yTop + h;
  return (
    `<path d="M ${rL} ${yTop} L ${rR} ${yTop} Q ${rR + (eR - rR) * 0.45} ${yBot - 5} ${eR} ${yBot - 5} L ${cx + ridgeW * 0.56} ${yBot} L ${cx - ridgeW * 0.56} ${yBot} L ${eL} ${yBot - 5} Q ${rL - (rL - eL) * 0.45} ${yBot - 5} ${rL} ${yTop} Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>`
    + `<polygon points="${rL},${yTop + 2} ${cx - ridgeW * 0.52},${yBot - 2} ${rL + 10},${yBot - 2}" fill="${IVORY}" fill-opacity="0.35"/>`
    + `<polygon points="${rR},${yTop + 2} ${cx + ridgeW * 0.52},${yBot - 2} ${rR - 10},${yBot - 2}" fill="${IVORY}" fill-opacity="0.35"/>`
    + `<line x1="${rL - 3}" y1="${yTop}" x2="${rR + 3}" y2="${yTop}" stroke="${ridgeFill}" stroke-width="2.5" stroke-linecap="round"/>`
    + `<path d="M ${rL - 3} ${yTop} L ${rL - 5} ${yTop - 5} M ${rR + 3} ${yTop} L ${rR + 5} ${yTop - 5}" stroke="${ridgeFill}" stroke-width="2" stroke-linecap="round"/>`
  );
}

function drawDougongRow(x: number, y: number, w: number, count: number, color = GOLD): string {
  const step = w / count;
  let out = `<rect x="${x}" y="${y}" width="${w}" height="4" fill="${INK_DARK}" fill-opacity="0.18"/>`;
  for (let i = 0; i < count; i++) {
    const bx = x + step * (i + 0.5);
    out += `<rect x="${bx - 2.5}" y="${y}" width="5" height="4.2" rx="0.8" fill="${color}" stroke="${INK_DARK}" stroke-width="0.6"/>`;
  }
  return out;
}

function drawColonnade(
  x: number,
  y: number,
  w: number,
  h: number,
  bays: number,
  wallFill: string,
  pillarFill: string,
  doorFill = INK_DARK,
): string {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${wallFill}" stroke="${INK_DARK}" stroke-width="1.3"/>`;
  const bayW = w / bays;
  for (let i = 0; i < bays; i++) {
    const bx = x + i * bayW;
    if (i > 0) {
      out += `<rect x="${bx - 1.5}" y="${y}" width="3" height="${h}" fill="${pillarFill}" stroke="${INK_DARK}" stroke-width="0.7"/>`;
    }
    const dw = Math.max(4, bayW * 0.44);
    const dx = bx + (bayW - dw) / 2;
    out += `<rect x="${dx}" y="${y + h * 0.25}" width="${dw}" height="${h * 0.68}" rx="1" fill="${doorFill}" fill-opacity="0.72"/>`;
  }
  out += `<rect x="${x - 1.5}" y="${y}" width="3" height="${h}" fill="${pillarFill}" stroke="${INK_DARK}" stroke-width="0.7"/>`;
  out += `<rect x="${x + w - 1.5}" y="${y}" width="3" height="${h}" fill="${pillarFill}" stroke="${INK_DARK}" stroke-width="0.7"/>`;
  return out;
}

function drawStoneBalustrade(x: number, y: number, w: number, h: number, posts: number, fill = IVORY): string {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${INK_DARK}" stroke-width="1.1"/>`;
  out += `<line x1="${x}" y1="${y + h * 0.45}" x2="${x + w}" y2="${y + h * 0.45}" stroke="${INK_MID}" stroke-width="0.8"/>`;
  const step = w / posts;
  for (let i = 0; i <= posts; i++) {
    const px = x + i * step;
    out += `<line x1="${px}" y1="${y - 2}" x2="${px}" y2="${y + h}" stroke="${INK_DARK}" stroke-width="1"/>`;
  }
  return out;
}

function drawPagodaTower(
  cx: number,
  yBase: number,
  tiers: number,
  baseW: number,
  totalH: number,
  roofFill: string,
  wallFill: string,
  primary: string,
): string {
  const tierH = totalH / tiers;
  let out = '';
  for (let i = 0; i < tiers; i++) {
    const frac = i / Math.max(1, tiers - 1);
    const w = baseW * (1 - frac * 0.48);
    const wallW = w * 0.62;
    const yBottom = yBase - i * tierH;
    const yRoofBot = yBottom - tierH * 0.45;
    const yRoofTop = yBottom - tierH * 0.92;
    out += `<rect x="${cx - wallW / 2}" y="${yRoofBot}" width="${wallW}" height="${tierH * 0.45}" fill="${wallFill}" stroke="${INK_DARK}" stroke-width="1.1"/>`;
    out += `<path d="M ${cx - 2.4} ${yBottom} V ${yRoofBot + 4} A 2.4 2.4 0 0 1 ${cx + 2.4} ${yRoofBot + 4} V ${yBottom} Z" fill="${INK_DARK}" fill-opacity="0.78"/>`;
    out += drawChineseEaveTier(cx, yRoofTop, wallW * 0.72, w, tierH * 0.47, roofFill, INK_DARK, GOLD, 3.2);
  }
  const topY = yBase - tiers * tierH;
  out += `<line x1="${cx}" y1="${topY + 2}" x2="${cx}" y2="${topY - 14}" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"/>`;
  out += `<circle cx="${cx}" cy="${topY - 7}" r="2.2" fill="${primary}" stroke="${GOLD}" stroke-width="1"/>`;
  out += `<circle cx="${cx}" cy="${topY - 14}" r="1.8" fill="${GOLD}"/>`;
  return out;
}

function drawTreeAccent(cx: number, yBase: number, kind: 'cypress' | 'bamboo' | 'palm' | 'willow', scale: number, color: string): string {
  if (kind === 'cypress') {
    return (
      `<line x1="${cx}" y1="${yBase}" x2="${cx}" y2="${yBase - 22 * scale}" stroke="${INK_DARK}" stroke-width="1.6"/>`
      + `<polygon points="${cx},${yBase - 32 * scale} ${cx - 8 * scale},${yBase - 16 * scale} ${cx + 8 * scale},${yBase - 16 * scale}" fill="${color}" fill-opacity="0.78" stroke="${INK_DARK}" stroke-width="0.9"/>`
      + `<polygon points="${cx},${yBase - 24 * scale} ${cx - 10 * scale},${yBase - 8 * scale} ${cx + 10 * scale},${yBase - 8 * scale}" fill="${color}" fill-opacity="0.88" stroke="${INK_DARK}" stroke-width="0.9"/>`
    );
  }
  if (kind === 'palm') {
    return (
      `<path d="M ${cx} ${yBase} Q ${cx + 3 * scale} ${yBase - 18 * scale} ${cx + 1 * scale} ${yBase - 32 * scale}" stroke="${INK_DARK}" stroke-width="2" stroke-linecap="round"/>`
      + `<path d="M ${cx + 1 * scale} ${yBase - 32 * scale} Q ${cx - 12 * scale} ${yBase - 35 * scale} ${cx - 16 * scale} ${yBase - 26 * scale}" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`
      + `<path d="M ${cx + 1 * scale} ${yBase - 32 * scale} Q ${cx + 14 * scale} ${yBase - 36 * scale} ${cx + 17 * scale} ${yBase - 25 * scale}" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`
      + `<path d="M ${cx + 1 * scale} ${yBase - 32 * scale} Q ${cx - 6 * scale} ${yBase - 42 * scale} ${cx - 12 * scale} ${yBase - 38 * scale}" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`
      + `<path d="M ${cx + 1 * scale} ${yBase - 32 * scale} Q ${cx + 8 * scale} ${yBase - 43 * scale} ${cx + 14 * scale} ${yBase - 38 * scale}" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`
    );
  }
  if (kind === 'bamboo') {
    const h = 38 * scale;
    return (
      `<line x1="${cx}" y1="${yBase}" x2="${cx - 2}" y2="${yBase - h}" stroke="${color}" stroke-width="2"/>`
      + `<line x1="${cx + 6}" y1="${yBase}" x2="${cx + 7}" y2="${yBase - h * 0.85}" stroke="${color}" stroke-width="1.6"/>`
      + `<path d="M ${cx - 1} ${yBase - h * 0.6} L ${cx - 9} ${yBase - h * 0.68} M ${cx - 2} ${yBase - h * 0.85} L ${cx + 8} ${yBase - h * 0.94}" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`
    );
  }
  // willow
  return (
    `<path d="M ${cx} ${yBase} Q ${cx - 2} ${yBase - 16 * scale} ${cx} ${yBase - 24 * scale}" stroke="${INK_DARK}" stroke-width="2"/>`
    + `<path d="M ${cx} ${yBase - 24 * scale} Q ${cx - 12 * scale} ${yBase - 18 * scale} ${cx - 11 * scale} ${yBase - 6 * scale}" stroke="${color}" stroke-width="1.3" stroke-opacity="0.72"/>`
    + `<path d="M ${cx} ${yBase - 24 * scale} Q ${cx + 12 * scale} ${yBase - 18 * scale} ${cx + 11 * scale} ${yBase - 6 * scale}" stroke="${color}" stroke-width="1.3" stroke-opacity="0.72"/>`
    + `<path d="M ${cx} ${yBase - 26 * scale} Q ${cx} ${yBase - 16 * scale} ${cx - 2} ${yBase - 5 * scale}" stroke="${color}" stroke-width="1.3" stroke-opacity="0.72"/>`
  );
}

// =============================================================================
// 104 Intricate Architectural Landmark Archetypes
// =============================================================================

function renderArchetypeBody(
  kind: LandmarkArchetypeId,
  seed: number,
  primary: string,
  secondary: string,
): string {
  const cx = 180;
  const flipTree = seed % 2 === 0;

  switch (kind) {
    // 1. 婺城区 · 八咏楼 (Double-eaved Song cliff pavilion on stone bastion + stairs + river reflection)
    case 'bayong_lou':
      return (
        // Stone city-wall cliff bastion
        `<polygon points="82,184 96,138 264,138 278,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="106" y="138" width="148" height="10" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Central stone archway & climbing stairs
        + `<path d="M 164 184 V 158 A 16 16 0 0 1 196 158 V 184 Z" fill="${INK_DARK}" fill-opacity="0.82"/>`
        + `<line x1="166" y1="176" x2="194" y2="176" stroke="${IVORY}" stroke-width="1.2"/>`
        + `<line x1="168" y1="169" x2="192" y2="169" stroke="${IVORY}" stroke-width="1.2"/>`
        + drawStoneBalustrade(102, 130, 156, 8, 10, IVORY)
        // Lower story colonnade & first eave
        + drawColonnade(122, 104, 116, 26, 5, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(cx, 88, 92, 146, 17, primary, INK_DARK, GOLD, 5.5)
        // Upper story gallery & soaring Song roof
        + drawColonnade(136, 66, 88, 22, 4, IVORY, TERRACOTTA, INK_DARK)
        + drawDougongRow(134, 63, 92, 9, GOLD)
        + drawXieshanRoof(cx, 38, 66, 132, 26, primary, INK_DARK, GOLD)
        // Plaque "八咏"
        + `<rect x="171" y="70" width="18" height="10" rx="1.5" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="0.9"/>`
        + `<line x1="175" y1="75" x2="185" y2="75" stroke="${GOLD}" stroke-width="1.2"/>`
        // Flanking cypresses
        + drawTreeAccent(flipTree ? 72 : 288, 184, 'cypress', 1.15, primary)
      );

    // 2. 金东区 · 万佛塔与施光南音乐广场
    case 'wanfo_pagoda_plaza':
      return (
        // Modern curved musical plaza pavilion on right
        `<path d="M 164 184 Q 214 142 308 148 L 296 184 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 156 150 Q 228 118 314 144 Q 246 134 166 158 Z" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="206" y="156" width="68" height="28" fill="${primary}" fill-opacity="0.16" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<line x1="222" y1="156" x2="222" y2="184" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<line x1="240" y1="156" x2="240" y2="184" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<line x1="258" y1="156" x2="258" y2="184" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Monumental 9-tier Wanfo Pagoda on left-center
        + `<rect x="92" y="172" width="70" height="12" rx="2" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawPagodaTower(127, 172, 7, 62, 130, primary, IVORY, secondary)
        // Plaza fountain arcs
        + `<path d="M 284 184 Q 284 166 274 176 M 284 184 Q 284 164 294 176" stroke="${primary}" stroke-opacity="0.55" stroke-width="1.3"/>`
      );

    // 3. 武义县 · 熟溪古廊桥
    case 'covered_bridge_pavilion':
      return (
        // Stone piers & masonry abutments
        `<rect x="44" y="146" width="38" height="38" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="278" y="146" width="38" height="38" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="114,184 120,152 134,152 140,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="220,184 226,152 240,152 246,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Timber arch struts underneath deck
        + `<path d="M 82 168 Q 100 150 118 168 M 136 168 Q 180 144 224 168 M 242 168 Q 260 150 278 168" stroke="${TERRACOTTA}" stroke-width="2.6"/>`
        // Bridge deck & timber corridor gallery
        + `<rect x="48" y="138" width="264" height="10" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawColonnade(54, 114, 252, 24, 11, IVORY, TERRACOTTA, INK_DARK)
        // Sweeping gallery roof
        + drawChineseEaveTier(cx, 96, 232, 274, 19, primary, INK_DARK, GOLD, 5)
        // Central 3-tier bridge pavilion tower rising above corridor
        + drawColonnade(148, 82, 64, 16, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(cx, 66, 52, 84, 16, primary, INK_DARK, GOLD, 4.5)
        + drawColonnade(158, 52, 44, 14, 2, IVORY, TERRACOTTA, INK_DARK)
        + drawXieshanRoof(cx, 32, 34, 68, 20, secondary, INK_DARK, GOLD)
        + `<circle cx="${cx}" cy="29" r="2.2" fill="${GOLD}"/>`
      );

    // 4. 浦江县 · 郑义门江南第一家牌坊群
    case 'memorial_archway_paifang':
      return (
        // Perspective receding smaller archway behind
        `<line x1="156" y1="154" x2="156" y2="110" stroke="${STONE_DEEP}" stroke-width="2.4"/>`
        + `<line x1="204" y1="154" x2="204" y2="110" stroke="${STONE_DEEP}" stroke-width="2.4"/>`
        + drawChineseEaveTier(cx, 98, 42, 66, 12, primary, INK_DARK, GOLD, 3)
        // Perspective stone causeway path
        + `<polygon points="122,184 152,152 208,152 238,184" fill="${STONE}" fill-opacity="0.82" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Grand foreground 4-pillar 3-bay Stone Paifang
        + `<rect x="74" y="88" width="7" height="96" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="128" y="68" width="8.5" height="116" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="223.5" y="68" width="8.5" height="116" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="279" y="88" width="7" height="96" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Carved drum plinths at column bases
        + [77.5, 132.2, 227.7, 282.5].map(px => `<rect x="${px - 7}" y="176" width="14" height="8" rx="2" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`).join('')
        // Side bay lintels & eaves
        + `<rect x="76" y="102" width="54" height="12" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="230" y="102" width="54" height="12" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawChineseEaveTier(103, 84, 42, 68, 17, primary, INK_DARK, GOLD, 4.5)
        + drawChineseEaveTier(257, 84, 42, 68, 17, primary, INK_DARK, GOLD, 4.5)
        // Central grand bay double beams, imperial plaque & soaring roof
        + `<rect x="132" y="92" width="96" height="16" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="160" y="74" width="40" height="18" rx="2" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1.3"/>`
        + `<line x1="168" y1="83" x2="192" y2="83" stroke="${GOLD}" stroke-width="1.8"/>`
        + drawChineseEaveTier(cx, 54, 72, 118, 20, primary, INK_DARK, GOLD, 6)
        + drawChineseEaveTier(cx, 38, 42, 74, 15, secondary, INK_DARK, GOLD, 4)
      );

    // 5. 磐安县 · 玉山古茶场飞檐茶楼
    case 'tea_house_heritage':
      return (
        // Stepped green tea terraces behind
        `<path d="M 28 184 Q 76 122 134 150 T 332 136 L 332 184 Z" fill="${primary}" fill-opacity="0.16" stroke="${primary}" stroke-opacity="0.32" stroke-width="1"/>`
        + `<path d="M 38 164 Q 84 146 130 158 M 234 154 Q 278 142 324 152" stroke="${primary}" stroke-opacity="0.45" stroke-width="1.4" stroke-dasharray="5 3"/>`
        // Stone plinth & timber courtyard veranda
        + `<rect x="78" y="170" width="204" height="14" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawColonnade(86, 134, 188, 36, 6, IVORY, TERRACOTTA, INK_DARK)
        // Hanging red tea lanterns under eaves
        + [106, 154, 206, 254].map(lx =>
          `<line x1="${lx}" y1="134" x2="${lx}" y2="141" stroke="${INK_DARK}" stroke-width="0.9"/>`
          + `<ellipse cx="${lx}" cy="145" rx="3.4" ry="4.4" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="0.8"/>`,
        ).join('')
        + drawChineseEaveTier(cx, 116, 154, 214, 19, primary, INK_DARK, GOLD, 5.5)
        // Upper tea-tasting loft
        + drawColonnade(116, 86, 128, 30, 4, IVORY, TERRACOTTA, INK_DARK)
        + drawDougongRow(114, 82, 132, 10, GOLD)
        + drawXieshanRoof(cx, 50, 96, 166, 32, primary, INK_DARK, GOLD)
        + drawTreeAccent(56, 184, 'bamboo', 1.15, primary)
        + drawTreeAccent(306, 184, 'bamboo', 1.05, primary)
      );

    // 6. 兰溪市 · 诸葛八卦村钟池大公堂
    case 'ancestral_taiji_hall':
      return (
        // Flanking Hui-Zhe stepped horse-head walls (Matouqiang)
        `<path d="M 56 184 V 118 H 76 V 104 H 96 V 90 H 116 V 184 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 54 118 H 78 M 74 104 H 98 M 94 90 H 118" stroke="${INK_DARK}" stroke-width="3.2" stroke-linecap="round"/>`
        + `<path d="M 304 184 V 118 H 284 V 104 H 264 V 90 H 244 V 184 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 282 118 H 306 M 262 104 H 286 M 242 90 H 266" stroke="${INK_DARK}" stroke-width="3.2" stroke-linecap="round"/>`
        // Central Great Ancestral Hall (Dagongtang)
        + `<rect x="116" y="102" width="128" height="58" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + drawColonnade(124, 110, 112, 48, 4, IVORY, TERRACOTTA, INK_DARK)
        + `<rect x="164" y="106" width="32" height="10" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="0.9"/>`
        + drawXieshanRoof(cx, 62, 108, 152, 40, primary, INK_DARK, GOLD)
        // Foreground semi-circular Taiji Bell Pool (钟池) with yin-yang S-curve divider
        + `<ellipse cx="${cx}" cy="176" rx="84" ry="15" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<ellipse cx="${cx}" cy="176" rx="76" ry="11.5" fill="${primary}" fill-opacity="0.26" stroke="${primary}" stroke-width="1"/>`
        + `<path d="M ${cx} 164.5 Q ${cx + 16} 170 ${cx} 176 Q ${cx - 16} 182 ${cx} 187.5" stroke="${IVORY}" stroke-width="2" stroke-linecap="round"/>`
        + `<circle cx="${cx - 24}" cy="175" r="2.6" fill="${IVORY}"/>`
        + `<circle cx="${cx + 24}" cy="177" r="2.6" fill="${primary}" fill-opacity="0.72"/>`
      );

    // 7. 义乌市 · 国际商贸城与鸡鸣阁
    case 'yiwu_tradecity_jiming':
      return (
        // Distant sunlit hill & multi-tiered illuminated Jiming Pavilion on right-back
        `<path d="M 192 162 Q 258 96 340 144 L 340 184 L 192 184 Z" fill="${primary}" fill-opacity="0.14"/>`
        + `<rect x="266" y="104" width="28" height="22" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + drawChineseEaveTier(280, 92, 24, 42, 12, GOLD, INK_DARK, GOLD, 3.5)
        + `<rect x="270" y="78" width="20" height="14" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + drawChineseEaveTier(280, 62, 16, 36, 16, secondary, INK_DARK, GOLD, 4)
        + `<line x1="280" y1="62" x2="280" y2="52" stroke="${GOLD}" stroke-width="1.8"/>`
        // Foreground monumental International Trade City modern colonnade & wave atrium canopy
        + `<rect x="34" y="168" width="234" height="16" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 38 122 L 150 96 L 262 122 L 262 168 H 38 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 32 124 Q 150 86 268 124 L 258 130 Q 150 96 42 130 Z" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Rhythmic international trade arcade bays & glass atrium
        + [52, 82, 112, 142, 172, 202, 232].map((ax, idx) =>
          idx === 3
            ? `<path d="M ${ax - 6} 168 V 126 A 14 14 0 0 1 ${ax + 22} 126 V 168 Z" fill="${primary}" fill-opacity="0.28" stroke="${INK_DARK}" stroke-width="1.3"/>`
            : `<path d="M ${ax} 168 V 136 A 9 9 0 0 1 ${ax + 18} 136 V 168 Z" fill="${primary}" fill-opacity="0.18" stroke="${INK_DARK}" stroke-width="1.1"/>`,
        ).join('')
        // International flags row in plaza
        + [46, 70, 94, 214, 238].map((fx, i) =>
          `<line x1="${fx}" y1="184" x2="${fx}" y2="152" stroke="${INK_DARK}" stroke-width="1"/>`
          + `<polygon points="${fx},152 ${fx + 9},155 ${fx},159" fill="${i % 2 === 0 ? primary : GOLD}"/>`,
        ).join('')
      );

    // 8. 东阳市 · 卢宅肃雍堂木雕门楼
    case 'dongyang_luzhai_mansion':
      return (
        // Outer whitewashed courtyard walls flanking carved mansion gate
        `<rect x="44" y="128" width="272" height="56" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 42 128 H 104 M 256 128 H 318" stroke="${INK_DARK}" stroke-width="3.2" stroke-linecap="round"/>`
        // Carved brick Zhaobi screen wall detail & twin stone gate drums
        + `<rect x="56" y="142" width="38" height="28" rx="2" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="266" y="142" width="38" height="28" rx="2" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1"/>`
        // Monumental central wood-carved Shimen gatehouse
        + `<rect x="110" y="106" width="140" height="78" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="150" y="132" width="60" height="52" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="180" y1="132" x2="180" y2="184" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<circle cx="175" cy="158" r="2.2" fill="${GOLD}"/>`
        + `<circle cx="185" cy="158" r="2.2" fill="${GOLD}"/>`
        // Stone drum piers
        + `<circle cx="144" cy="176" r="6" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<circle cx="216" cy="176" r="6" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Rich Dongyang wood-carving Dougong frieze & soaring swallowtail roofs
        + drawDougongRow(112, 102, 136, 12, GOLD)
        + `<rect x="156" y="112" width="48" height="14" rx="1.5" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1.2"/>`
        + `<line x1="164" y1="119" x2="196" y2="119" stroke="${GOLD}" stroke-width="1.8"/>`
        + drawChineseEaveTier(cx, 78, 120, 174, 24, primary, INK_DARK, GOLD, 7)
        + drawXieshanRoof(cx, 44, 88, 146, 32, secondary, INK_DARK, GOLD)
      );

    // 9. 永康市 · 方岩五峰书院与胡公祠
    case 'wufeng_academy_cliff':
      return (
        // Dramatic towering flat-topped Danxia cliff pillars
        `<path d="M 38 184 L 44 64 L 84 48 L 116 62 L 122 184 Z" fill="${secondary}" fill-opacity="0.22" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 118 184 L 124 44 L 178 36 L 236 46 L 244 184 Z" fill="${secondary}" fill-opacity="0.28" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 242 184 L 248 68 L 288 54 L 318 72 L 324 184 Z" fill="${secondary}" fill-opacity="0.20" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Vertical Danxia sandstone striations
        + `<line x1="142" y1="54" x2="140" y2="128" stroke="${INK_DARK}" stroke-opacity="0.22" stroke-width="1"/>`
        + `<line x1="216" y1="56" x2="218" y2="132" stroke="${INK_DARK}" stroke-opacity="0.22" stroke-width="1"/>`
        // Rock-cut zigzag pilgrimage stairs
        + `<path d="M 142 184 L 166 154 H 196 L 168 128 H 198" stroke="${IVORY}" stroke-width="4" stroke-linecap="round"/>`
        + `<path d="M 142 184 L 166 154 H 196 L 168 128 H 198" stroke="${INK_DARK}" stroke-width="1.2" stroke-dasharray="3 3"/>`
        // Cliff-perched Confucian Wufeng Academy & Hugong Temple pavilion
        + `<rect x="134" y="102" width="92" height="26" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawColonnade(140, 104, 80, 24, 4, IVORY, TERRACOTTA, INK_DARK)
        + drawXieshanRoof(cx, 78, 72, 114, 24, primary, INK_DARK, GOLD)
        + drawTreeAccent(72, 184, 'cypress', 1.1, primary)
        + drawTreeAccent(292, 184, 'cypress', 1.0, primary)
      );

    // 10. 天安门 / 皇城宫阙
    case 'tiananmen_gatehouse':
      return (
        // Marble Jinshui bridges in foreground
        `<path d="M 122 184 Q 140 170 158 184 M 162 184 Q 180 168 198 184 M 202 184 Q 220 170 238 184" stroke="${IVORY}" stroke-width="3.5"/>`
        + `<path d="M 122 184 Q 140 170 158 184 M 162 184 Q 180 168 198 184 M 202 184 Q 220 170 238 184" stroke="${INK_DARK}" stroke-width="1"/>`
        // Crimson fortress terrace with 5 arched gates
        + `<rect x="52" y="126" width="256" height="58" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + [84, 130, 180, 230, 276].map((gx, i) => {
          const rw = i === 2 ? 12 : 8.5;
          const rh = i === 2 ? 30 : 22;
          return `<path d="M ${gx - rw} 184 V ${184 - rh} A ${rw} ${rw} 0 0 1 ${gx + rw} ${184 - rh} V 184 Z" fill="${INK_DARK}" fill-opacity="0.82" stroke="${STONE}" stroke-width="1"/>`;
        }).join('')
        + drawStoneBalustrade(52, 118, 256, 8, 16, IVORY)
        // Double-eaved golden imperial gatehouse
        + drawColonnade(88, 92, 184, 26, 9, TERRACOTTA, TERRACOTTA, GOLD)
        + drawChineseEaveTier(cx, 74, 160, 214, 19, GOLD, INK_DARK, GOLD, 5.5)
        + drawColonnade(108, 56, 144, 18, 7, TERRACOTTA, TERRACOTTA, GOLD)
        + drawXieshanRoof(cx, 32, 110, 174, 24, GOLD, INK_DARK, GOLD)
        // Twin Huabiao marble columns
        + [76, 284].map(hx =>
          `<rect x="${hx - 2.5}" y="142" width="5" height="42" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1"/>`
          + `<line x1="${hx - 7}" y1="149" x2="${hx + 7}" y2="149" stroke="${IVORY}" stroke-width="2.4"/>`,
        ).join('')
      );

    // 11. 天坛祈年殿
    case 'temple_of_heaven':
      return (
        // Triple-tiered circular marble Altar terrace
        `<rect x="66" y="168" width="228" height="16" rx="2" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawStoneBalustrade(74, 160, 212, 8, 14, IVORY)
        + `<rect x="86" y="146" width="188" height="14" rx="2" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawStoneBalustrade(92, 138, 176, 8, 12, IVORY)
        + `<rect x="106" y="124" width="148" height="14" rx="2" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Vermilion circular hall body
        + drawColonnade(124, 96, 112, 28, 6, TERRACOTTA, TERRACOTTA, GOLD)
        // Iconic triple-eaved conical deep-blue roofs
        + drawChineseEaveTier(cx, 78, 108, 152, 19, primary, INK_DARK, GOLD, 4)
        + drawChineseEaveTier(cx, 58, 78, 122, 20, primary, INK_DARK, GOLD, 3.5)
        + `<path d="M ${cx} 28 Q ${cx + 26} 46 ${cx + 46} 58 H ${cx - 46} Q ${cx - 26} 46 ${cx} 28 Z" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.4" stroke-linejoin="round"/>`
        + `<circle cx="${cx}" cy="24" r="4" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
      );

    // 12. 颐和园佛香阁
    case 'summer_palace_foxxiang':
      return (
        // Distant 17-arch bridge on left
        `<rect x="26" y="166" width="110" height="8" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1"/>`
        + [34, 52, 70, 88, 106, 124].map(bx => `<path d="M ${bx} 184 V 174 A 5 5 0 0 1 ${bx + 10} 174 V 184 Z" fill="${primary}" fill-opacity="0.32"/>`).join('')
        // Octagonal Xumi stone foundation platform
        + `<polygon points="118,184 128,136 276,136 286,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 188 184 L 194 136 H 214 L 220 184 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // 3-story octagonal Foxiangge Pavilion
        + drawColonnade(150, 112, 104, 24, 5, TERRACOTTA, TERRACOTTA, GOLD)
        + drawChineseEaveTier(202, 96, 94, 134, 17, GOLD, INK_DARK, GOLD, 4.5)
        + drawColonnade(160, 76, 84, 20, 4, TERRACOTTA, TERRACOTTA, GOLD)
        + drawChineseEaveTier(202, 60, 74, 116, 17, GOLD, INK_DARK, GOLD, 4.5)
        + drawColonnade(170, 46, 64, 15, 3, TERRACOTTA, TERRACOTTA, GOLD)
        + `<polygon points="202,24 162,46 242,46" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.4" stroke-linejoin="round"/>`
        + `<circle cx="202" cy="21" r="2.8" fill="${GOLD}"/>`
      );

    // 13. 东方明珠与陆家嘴三高塔
    case 'oriental_pearl_lujiazui':
      return (
        // Jin Mao stepped skyscraper
        `<rect x="178" y="88" width="28" height="96" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="183" y="64" width="18" height="24" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<line x1="192" y1="64" x2="192" y2="44" stroke="${INK_DARK}" stroke-width="1.6"/>`
        // SWFC bottle-opener trapezoid portal tower
        + `<polygon points="222,184 228,52 254,52 260,184" fill="${primary}" fill-opacity="0.24" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="234" y="62" width="14" height="14" fill="${PAPER}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Spiral Shanghai Tower
        + `<path d="M 272 184 L 278 44 Q 290 36 300 44 L 306 184 Z" fill="${primary}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 278 76 Q 290 88 302 82 M 276 116 Q 290 128 304 122 M 274 156 Q 290 168 305 162" stroke="${IVORY}" stroke-width="1.1"/>`
        // Iconic Oriental Pearl Tower on left-center
        + `<line x1="86" y1="184" x2="112" y2="128" stroke="${INK_DARK}" stroke-width="3.2"/>`
        + `<line x1="142" y1="184" x2="116" y2="128" stroke="${INK_DARK}" stroke-width="3.2"/>`
        + `<line x1="114" y1="184" x2="114" y2="54" stroke="${INK_DARK}" stroke-width="4.5"/>`
        + `<circle cx="114" cy="128" r="15" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<circle cx="114" cy="128" r="11" fill="${IVORY}" fill-opacity="0.28"/>`
        + `<circle cx="114" cy="76" r="10.5" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<circle cx="114" cy="54" r="4.5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<line x1="114" y1="49" x2="114" y2="26" stroke="${INK_DARK}" stroke-width="2" stroke-linecap="round"/>`
      );

    // 14. 外滩万国钟楼与石库门
    case 'bund_shikumen':
      return (
        // Neoclassical Bund Customs Clock Tower on left
        `<rect x="52" y="106" width="128" height="78" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="94" y="54" width="44" height="52" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="94,54 116,32 138,54" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<circle cx="116" cy="76" r="10" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="116" y1="76" x2="116" y2="70" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="116" y1="76" x2="121" y2="78" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Classical portico columns
        + [66, 82, 98, 114, 130, 146, 162].map(cxCol => `<line x1="${cxCol}" y1="120" x2="${cxCol}" y2="184" stroke="${INK_MID}" stroke-width="2"/>`).join('')
        + `<rect x="52" y="114" width="128" height="8" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Traditional Shanghai Shikumen brick archway on right
        + `<rect x="206" y="106" width="98" height="78" fill="${TERRACOTTA}" fill-opacity="0.82" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 206 106 Q 255 82 304 106 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 236 184 V 134 A 19 16 0 0 1 274 134 V 184 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="241" y="138" width="28" height="46" fill="${INK_DARK}" fill-opacity="0.82"/>`
        + `<line x1="255" y1="138" x2="255" y2="184" stroke="${GOLD}" stroke-width="1.2"/>`
      );

    // 15. 广州塔与岭南骑楼街
    case 'canton_tower_qilou':
      return (
        // Hyperboloid Canton Tower rising behind right
        `<path d="M 232 184 Q 254 112 246 46 L 266 46 Q 258 112 280 184 Z" fill="${primary}" fill-opacity="0.22" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="242" y1="158" x2="269" y2="108" stroke="${primary}" stroke-width="1.1"/>`
        + `<line x1="270" y1="158" x2="243" y2="108" stroke="${primary}" stroke-width="1.1"/>`
        + `<line x1="246" y1="108" x2="264" y2="62" stroke="${primary}" stroke-width="1.1"/>`
        + `<line x1="266" y1="108" x2="248" y2="62" stroke="${primary}" stroke-width="1.1"/>`
        + `<line x1="256" y1="46" x2="256" y2="24" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"/>`
        // Foreground Lingnan Qilou arcade shophouses
        + `<rect x="46" y="108" width="174" height="76" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 46 108 L 75 94 L 104 108 L 133 94 L 162 108 L 191 94 L 220 108" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [60, 118, 176].map((qx, i) =>
          // Qilou street-level arcade arch + Manchu stained upper window
          `<path d="M ${qx} 184 V 154 A 14 14 0 0 1 ${qx + 28} 154 V 184 Z" fill="${INK_DARK}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1.2"/>`
          + `<rect x="${qx + 3}" y="116" width="22" height="18" rx="3" fill="${i === 1 ? GOLD : primary}" fill-opacity="0.45" stroke="${INK_DARK}" stroke-width="1"/>`,
        ).join('')
      );

    // 16. 深圳平安金融中心与湾区天际
    case 'pingan_harbor_skyline':
      return (
        // Civic center gull-wing roof on left
        `<rect x="48" y="144" width="118" height="40" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 38 144 Q 106 116 176 144 L 162 150 Q 106 130 50 150 Z" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Sleek faceted tapered Ping An Financial Center spire
        + `<polygon points="186,184 200,52 214,30 228,52 242,184" fill="${primary}" fill-opacity="0.26" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<line x1="214" y1="30" x2="214" y2="184" stroke="${IVORY}" stroke-width="1.2"/>`
        + `<line x1="200" y1="68" x2="228" y2="68" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<line x1="196" y1="106" x2="232" y2="106" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<line x1="192" y1="144" x2="236" y2="144" stroke="${INK_DARK}" stroke-width="1"/>`
        // Neighboring coastal bay towers & palms
        + `<rect x="256" y="102" width="32" height="82" rx="3" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="256" y1="122" x2="288" y2="122" stroke="${primary}" stroke-width="1.2"/>`
        + drawTreeAccent(308, 184, 'palm', 1.15, primary)
      );

    // 17. 香港中银棱柱与维港天际线
    case 'hk_boc_harbour':
      return (
        // Convention Centre gull-wing roof on left foreground
        `<path d="M 46 184 L 54 156 Q 92 140 128 156 L 138 184 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Iconic diagonal-truss triangular Bank of China Tower
        + `<polygon points="146,184 158,48 192,48 204,184" fill="${primary}" fill-opacity="0.28" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<line x1="175" y1="48" x2="175" y2="24" stroke="${INK_DARK}" stroke-width="1.8"/>`
        + `<line x1="158" y1="48" x2="196" y2="112" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="192" y1="48" x2="154" y2="112" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="154" y1="112" x2="202" y2="176" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="196" y1="112" x2="148" y2="176" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Two IFC stepped supertall on right
        + `<rect x="224" y="62" width="38" height="122" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="232" y="48" width="22" height="14" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="272" y="104" width="30" height="80" fill="${primary}" fill-opacity="0.18" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Star Ferry crossing Victoria Harbour
        + `<polygon points="74,182 114,182 110,188 78,188" fill="${primary}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="82" y="176" width="24" height="6" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="0.9"/>`
      );

    // 18. 澳门大三巴牌坊
    case 'macau_st_pauls':
      return (
        // Monumental sweeping granite stairs
        `<polygon points="72,184 96,158 264,158 288,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + [164, 170, 176].map(sy => `<line x1="90" y1="${sy}" x2="270" y2="${sy}" stroke="${INK_MID}" stroke-opacity="0.55" stroke-width="1"/>`).join('')
        // Tier 1 & Tier 2 Baroque granite facade
        + `<rect x="116" y="96" width="128" height="62" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        // 3 arched doors on bottom tier
        + `<path d="M 168 158 V 134 A 12 12 0 0 1 192 134 V 158 Z" fill="${INK_DARK}" fill-opacity="0.82"/>`
        + `<path d="M 130 158 V 140 A 8 8 0 0 1 146 140 V 158 Z" fill="${INK_DARK}" fill-opacity="0.72"/>`
        + `<path d="M 214 158 V 140 A 8 8 0 0 1 230 140 V 158 Z" fill="${INK_DARK}" fill-opacity="0.72"/>`
        // Classical pairs of Corinthian pillars across tiers
        + [124, 156, 204, 236].map(px => `<line x1="${px}" y1="96" x2="${px}" y2="158" stroke="${INK_MID}" stroke-width="2.2"/>`).join('')
        + `<line x1="112" y1="124" x2="248" y2="124" stroke="${INK_DARK}" stroke-width="1.6"/>`
        // Tier 3 tapering Baroque gable with arched niche & scrolls
        + `<rect x="136" y="66" width="88" height="30" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 116 96 Q 126 78 136 82 M 244 96 Q 234 78 224 82" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 172 92 V 76 A 8 8 0 0 1 188 76 V 92 Z" fill="${primary}" fill-opacity="0.52" stroke="${INK_DARK}" stroke-width="1"/>`
        // Top triangular pediment & bronze cross finial
        + `<polygon points="152,66 180,38 208,66" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="180" y1="38" x2="180" y2="26" stroke="${GOLD}" stroke-width="2"/>`
        + `<line x1="175" y1="31" x2="185" y2="31" stroke="${GOLD}" stroke-width="1.8"/>`
      );

    // 19. 台北101与大稻埕红砖楼
    case 'taipei_101_memorial':
      return (
        // Dadaocheng red-brick Baroque facade on left
        `<rect x="58" y="122" width="102" height="62" fill="${TERRACOTTA}" fill-opacity="0.82" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 58 122 Q 109 98 160 122 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [72, 102, 132].map(bx => `<path d="M ${bx} 184 V 150 A 8 8 0 0 1 ${bx + 16} 150 V 184 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1"/>`).join('')
        // 8-section bamboo-segment Taipei 101 tower on right-center
        + `<rect x="206" y="158" width="44" height="26" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [0, 1, 2, 3, 4, 5, 6].map(seg => {
          const yBot = 158 - seg * 15;
          const wTop = 38 - seg * 1.4;
          const wBot = 32 - seg * 1.2;
          return `<polygon points="${228 - wBot / 2},${yBot} ${228 - wTop / 2},${yBot - 15} ${228 + wTop / 2},${yBot - 15} ${228 + wBot / 2},${yBot}" fill="${primary}" fill-opacity="${0.22 + seg * 0.04}" stroke="${INK_DARK}" stroke-width="1.2"/>`;
        }).join('')
        + `<rect x="218" y="42" width="20" height="11" fill="${GOLD}" fill-opacity="0.6" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<line x1="228" y1="42" x2="228" y2="23" stroke="${INK_DARK}" stroke-width="2" stroke-linecap="round"/>`
      );

    // 20. 苏州园林月洞门与粉墙黛瓦
    case 'jiangnan_gardens_gate':
      return (
        // Inner garden upturned pavilion peeking behind wall
        `<rect x="148" y="96" width="64" height="54" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawXieshanRoof(cx, 66, 48, 86, 30, primary, INK_DARK, GOLD)
        // Whitewashed Jiangnan garden wall with black tile coping
        + `<rect x="46" y="102" width="268" height="82" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 42 102 H 318" stroke="${INK_DARK}" stroke-width="4" stroke-linecap="round"/>`
        // Circular Moon Gate framing Taihu rockery & pond
        + `<circle cx="${cx}" cy="146" r="32" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + `<circle cx="${cx}" cy="146" r="28" fill="${PAPER}" stroke="${primary}" stroke-width="1.2"/>`
        // Taihu scholar stone inside Moon Gate
        + `<path d="M 166 172 L 172 140 Q 182 132 190 144 Q 196 156 188 172 Z" fill="${primary}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Hexagonal lattice garden windows on flanks
        + [84, 276].map(wx =>
          `<polygon points="${wx},124 ${wx + 12},132 ${wx + 12},148 ${wx},156 ${wx - 12},148 ${wx - 12},132" fill="${primary}" fill-opacity="0.16" stroke="${INK_DARK}" stroke-width="1.2"/>`
          + `<line x1="${wx - 12}" y1="140" x2="${wx + 12}" y2="140" stroke="${INK_DARK}" stroke-width="0.8"/>`
          + `<line x1="${wx}" y1="124" x2="${wx}" y2="156" stroke="${INK_DARK}" stroke-width="0.8"/>`,
        ).join('')
        + drawTreeAccent(58, 184, 'willow', 1.2, primary)
      );

    // 21. 西湖雷峰塔与断桥
    case 'west_lake_leifeng':
      return (
        // Sunset Hill mound
        `<path d="M 136 184 Q 214 134 294 184 Z" fill="${primary}" fill-opacity="0.22" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // 5-tier octagonal bronze Leifeng Pagoda atop hill
        + drawPagodaTower(216, 152, 5, 62, 108, GOLD, TERRACOTTA, primary)
        // Broken Bridge (断桥) single arch in foreground left
        + `<path d="M 38 184 Q 98 148 162 184 H 134 Q 98 162 66 184 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 52 172 Q 98 152 146 172" stroke="${IVORY}" stroke-width="2.4"/>`
        // Lotus leaves & willow accent
        + drawTreeAccent(52, 184, 'willow', 1.25, primary)
      );

    // 22. 黄鹤楼飞檐名楼
    case 'yellow_crane_tower':
      return (
        // Snake Hill stone terrace
        `<polygon points="74,184 88,162 272,162 286,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // 5 stacked multi-gabled upturned golden-eave stories
        + [0, 1, 2, 3].map(lvl => {
          const yBot = 162 - lvl * 26;
          const wallW = 114 - lvl * 18;
          const eaveW = 166 - lvl * 22;
          return (
            drawColonnade(cx - wallW / 2, yBot - 14, wallW, 14, 5 - Math.floor(lvl / 2), TERRACOTTA, TERRACOTTA, GOLD)
            + drawChineseEaveTier(cx, yBot - 28, wallW * 0.85, eaveW, 15, GOLD, INK_DARK, GOLD, 5.5)
          );
        }).join('')
        + drawColonnade(cx - 22, 46, 44, 12, 2, TERRACOTTA, TERRACOTTA, GOLD)
        + drawXieshanRoof(cx, 24, 28, 68, 22, GOLD, INK_DARK, GOLD)
        + `<circle cx="${cx}" cy="21" r="2.6" fill="${GOLD}"/>`
      );

    // 23. 滕王阁 / 岳阳楼飞阁
    case 'tengwang_yueyang_tower':
      return (
        // Monumental stepped riverbank terrace
        `<rect x="52" y="164" width="256" height="20" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="154,184 166,164 194,164 206,184" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawStoneBalustrade(54, 156, 252, 8, 16, IVORY)
        // Flanking corner watch-turrets (Que)
        + `<rect x="64" y="124" width="32" height="32" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawChineseEaveTier(80, 108, 22, 44, 16, primary, INK_DARK, GOLD, 4)
        + `<rect x="264" y="124" width="32" height="32" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawChineseEaveTier(280, 108, 22, 44, 16, primary, INK_DARK, GOLD, 4)
        // Central grand 3-tier riverfront pavilion
        + drawColonnade(108, 124, 144, 32, 6, TERRACOTTA, TERRACOTTA, GOLD)
        + drawChineseEaveTier(cx, 104, 124, 174, 20, primary, INK_DARK, GOLD, 5.5)
        + drawColonnade(122, 82, 116, 22, 5, TERRACOTTA, TERRACOTTA, GOLD)
        + drawChineseEaveTier(cx, 64, 96, 148, 18, primary, INK_DARK, GOLD, 5)
        + drawXieshanRoof(cx, 36, 70, 122, 28, secondary, INK_DARK, GOLD)
      );

    // 24. 徽派马头墙古村落
    case 'huizhou_matouqiang':
      return (
        // Cluster of stepped Matouqiang whitewashed residences
        `<path d="M 48 184 V 126 H 66 V 110 H 84 V 96 H 122 V 184 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 46 126 H 68 M 64 110 H 86 M 82 96 H 124" stroke="${INK_DARK}" stroke-width="3.2" stroke-linecap="round"/>`
        + `<path d="M 118 184 V 90 H 142 V 74 H 178 V 90 H 204 V 184 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 116 90 H 144 M 140 74 H 180 M 176 90 H 206" stroke="${INK_DARK}" stroke-width="3.4" stroke-linecap="round"/>`
        + `<path d="M 204 184 V 112 H 232 V 98 H 270 V 184 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 202 112 H 234 M 230 98 H 272" stroke="${INK_DARK}" stroke-width="3.2" stroke-linecap="round"/>`
        // Carved wood doorways & small Huizhou lattice windows
        + `<rect x="148" y="138" width="24" height="46" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="78" y="132" width="14" height="14" fill="${INK_DARK}" fill-opacity="0.72"/>`
        + `<rect x="153" y="106" width="14" height="14" fill="${INK_DARK}" fill-opacity="0.72"/>`
        // Small arched village bridge on right
        + `<path d="M 270 184 Q 294 162 318 184 H 302 Q 294 174 286 184 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
      );

    // 25. 福建永定圆土楼
    case 'fujian_tulou_round':
      return (
        // Monumental cylindrical rammed-earth outer wall & curved roof ring
        `<ellipse cx="${cx}" cy="84" rx="112" ry="30" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<ellipse cx="${cx}" cy="86" rx="74" ry="18" fill="${PAPER}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Inner concentric timber courtyard galleries visible in upper opening
        + `<ellipse cx="${cx}" cy="92" rx="64" ry="14" fill="${TERRACOTTA}" fill-opacity="0.28" stroke="${INK_DARK}" stroke-width="1"/>`
        // Outer rammed-earth curved wall cylinder
        + `<path d="M 68 84 V 170 Q 180 198 292 170 V 84 Q 180 112 68 84 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        // Upper window ring along rammed earth wall
        + [-76, -46, -16, 16, 46, 76].map(dx => {
          const wy = 112 + Math.round((1 - (dx * dx) / 10000) * 14);
          return `<rect x="${cx + dx - 4}" y="${wy}" width="8" height="10" rx="1" fill="${INK_DARK}" fill-opacity="0.74"/>`;
        }).join('')
        // Central arched Tulou ancestral gateway with stone frame
        + `<path d="M 164 184 V 150 A 16 14 0 0 1 196 150 V 184 Z" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="166" y="132" width="28" height="10" rx="1" fill="${IVORY}" stroke="${GOLD}" stroke-width="1"/>`
      );

    // 26. 闽南红砖燕尾脊古厝
    case 'minnan_swallowtail_qilou':
      return (
        // Flanking red-brick side wings (HuCuo)
        `<rect x="52" y="128" width="52" height="56" fill="${TERRACOTTA}" fill-opacity="0.86" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="256" y="128" width="52" height="56" fill="${TERRACOTTA}" fill-opacity="0.86" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawChineseEaveTier(78, 112, 34, 62, 16, primary, INK_DARK, GOLD, 6)
        + drawChineseEaveTier(282, 112, 34, 62, 16, primary, INK_DARK, GOLD, 6)
        // Central main mansion hall with white stone plinth & red-brick Auspicious patterns
        + `<rect x="104" y="108" width="152" height="76" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="104" y="156" width="152" height="28" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="158" y="132" width="44" height="52" fill="${INK_DARK}" fill-opacity="0.78" stroke="${IVORY}" stroke-width="1.4"/>`
        + `<rect x="122" y="132" width="18" height="18" rx="9" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="220" y="132" width="18" height="18" rx="9" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Dramatic sweeping Minnan Swallowtail (Yanwei) roof ridge
        + `<path d="M 100 110 Q 124 94 134 72 Q 180 80 226 72 Q 236 94 260 110 Z" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.5" stroke-linejoin="round"/>`
        + `<path d="M 120 62 Q 144 76 180 74 Q 216 76 240 62" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>`
        + `<path d="M 120 62 L 114 54 M 240 62 L 246 54" stroke="${GOLD}" stroke-width="2.2" stroke-linecap="round"/>`
      );

    // 27. 拉萨布达拉宫雪域宫堡
    case 'potala_palace_fortress':
      return (
        // Stepped zigzag White Palace fortress ramparts climbing Red Hill
        `<polygon points="48,184 72,118 288,118 312,184" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 94 184 L 154 140 H 226 L 178 184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Central Crimson Palace (Potrang Marpo) crowned with golden Dharma roofs
        + `<rect x="136" y="76" width="88" height="46" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="92" y="98" width="44" height="24" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="224" y="98" width="44" height="24" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Black-framed trapezoidal Tibetan palace windows
        + [148, 168, 188, 208].map(wx => `<rect x="${wx - 3.5}" y="88" width="7" height="10" fill="${INK_DARK}"/>`).join('')
        + [104, 120, 236, 252].map(wx => `<rect x="${wx - 3}" y="106" width="6" height="8" fill="${INK_DARK}"/>`).join('')
        // Golden Jinchuang spires & dark-red upper frieze
        + `<rect x="136" y="70" width="88" height="6" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<polygon points="148,70 162,56 176,70" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<polygon points="184,70 198,56 212,70" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.1"/>`
      );

    // 28. 湘西/巴渝吊脚楼群
    case 'diaojiaolou_stilt':
      return (
        // River bluff cliff & stone quay
        `<polygon points="36,184 54,132 138,144 138,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Tall diagonal wooden stilts supporting multi-level cantilevered Diaojiaolou
        + [138, 162, 188, 214, 240, 266].map(sx => `<line x1="${sx}" y1="184" x2="${sx}" y2="128" stroke="${TERRACOTTA}" stroke-width="2.6"/>`).join('')
        + `<line x1="138" y1="168" x2="188" y2="128" stroke="${TERRACOTTA}" stroke-width="1.8"/>`
        + `<line x1="214" y1="168" x2="266" y2="128" stroke="${TERRACOTTA}" stroke-width="1.8"/>`
        // Layered cantilevered wooden stilt houses
        + drawColonnade(66, 98, 92, 34, 4, IVORY, TERRACOTTA, INK_DARK)
        + drawXieshanRoof(112, 70, 62, 108, 28, primary, INK_DARK, GOLD)
        + drawColonnade(156, 84, 118, 44, 5, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(215, 62, 86, 134, 22, secondary, INK_DARK, GOLD, 5)
        + `<rect x="184" y="48" width="62" height="16" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawXieshanRoof(215, 32, 40, 78, 17, primary, INK_DARK, GOLD)
        // Moored wooden river ferry boat
        + `<polygon points="274,180 318,180 312,186 280,186" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.1"/>`
      );

    // 29. 黔东南/三江侗族鼓楼与风雨桥
    case 'dong_drum_tower':
      return (
        // Multi-tier octagonal cedar-shingle Dong Drum Tower (7+ visible overlapping eaves)
        `<rect x="122" y="164" width="66" height="20" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawPagodaTower(155, 164, 7, 74, 126, primary, TERRACOTTA, secondary)
        // Adjacent Wind-and-Rain cedar bridge pavilion extending right
        + `<rect x="206" y="156" width="96" height="28" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<path d="M 224 184 V 168 A 10 10 0 0 1 244 168 V 184 Z" fill="${primary}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<path d="M 264 184 V 168 A 10 10 0 0 1 284 168 V 184 Z" fill="${primary}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + drawColonnade(208, 134, 92, 22, 4, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(254, 116, 72, 108, 18, secondary, INK_DARK, GOLD, 4.5)
      );

    // 30. 大理崇圣寺三塔与苍山
    case 'dali_three_pagodas':
      return (
        // Monumental central square 11-tier Qianxun Main Pagoda + two symmetrical flanking sister pagodas
        `<rect x="148" y="172" width="64" height="12" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawPagodaTower(cx, 172, 9, 44, 136, IVORY, IVORY, GOLD)
        + `<rect x="78" y="175" width="38" height="9" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawPagodaTower(97, 175, 6, 28, 92, STONE, IVORY, primary)
        + `<rect x="244" y="175" width="38" height="9" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawPagodaTower(263, 175, 6, 28, 92, STONE, IVORY, primary)
      );

    // 31. 丽江大研古城大水车与木府
    case 'lijiang_naxi_gate':
      return (
        // Multi-tiered Naxi Mufu palace behind right
        drawColonnade(168, 128, 132, 56, 5, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(234, 106, 102, 152, 22, primary, INK_DARK, GOLD, 5.5)
        + drawXieshanRoof(234, 72, 72, 118, 34, secondary, INK_DARK, GOLD)
        // Stone canal wall & iconic Twin Wooden Waterwheels on left
        + `<rect x="44" y="156" width="128" height="28" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + [84, 128].map((wx, idx) => {
          const r = idx === 0 ? 28 : 22;
          const cy = 152;
          return (
            `<circle cx="${wx}" cy="${cy}" r="${r}" fill="none" stroke="${TERRACOTTA}" stroke-width="3"/>`
            + `<circle cx="${wx}" cy="${cy}" r="${r * 0.72}" fill="none" stroke="${INK_DARK}" stroke-width="1.2"/>`
            + [0, 45, 90, 135].map(deg => {
              const rad = (deg * Math.PI) / 180;
              const dx = Math.cos(rad) * r;
              const dy = Math.sin(rad) * r;
              return `<line x1="${wx - dx}" y1="${cy - dy}" x2="${wx + dx}" y2="${cy + dy}" stroke="${TERRACOTTA}" stroke-width="1.5"/>`;
            }).join('')
            + `<circle cx="${wx}" cy="${cy}" r="3.5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
          );
        }).join('')
      );

    // 32. 傣族曼飞龙白塔 / 金顶佛寺
    case 'dai_peacock_temple':
      return (
        // Cluster of gleaming white bottle-shaped Dai Buddhist stupas (Manfeilong) + triple-eave hall
        `<rect x="64" y="168" width="232" height="16" rx="2" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Central mother white stupa
        + `<path d="M 152 168 Q 154 132 168 118 L 176 58 L 180 34 L 184 58 L 192 118 Q 206 132 208 168 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<line x1="180" y1="34" x2="180" y2="23" stroke="${GOLD}" stroke-width="2.2"/>`
        + `<circle cx="180" cy="23" r="2.6" fill="${GOLD}"/>`
        // Flanking daughter white stupas
        + [104, 132, 228, 256].map((sx, idx) => {
          const h = idx === 1 || idx === 2 ? 78 : 56;
          return (
            `<path d="M ${sx - 13} 168 Q ${sx - 11} ${168 - h * 0.45} ${sx - 4} ${168 - h * 0.65} L ${sx} ${168 - h} L ${sx + 4} ${168 - h * 0.65} Q ${sx + 11} ${168 - h * 0.45} ${sx + 13} 168 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
            + `<line x1="${sx}" y1="${168 - h}" x2="${sx}" y2="${168 - h - 9}" stroke="${GOLD}" stroke-width="1.6"/>`
          );
        }).join('')
        + drawTreeAccent(52, 184, 'palm', 1.15, primary)
        + drawTreeAccent(308, 184, 'palm', 1.15, primary)
      );

    // 33. 西安大雁塔 / 钟鼓楼
    case 'xian_bell_goose_pagoda':
      return (
        // Broad brick Tang terrace base
        `<rect x="108" y="164" width="144" height="20" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Monumental 7-story square brick Tang Dayanta Pagoda with crisp tiered brick eaves
        + [0, 1, 2, 3, 4, 5, 6].map(t => {
          const yBot = 164 - t * 18;
          const w = 96 - t * 7.5;
          return (
            `<rect x="${cx - w / 2}" y="${yBot - 15}" width="${w}" height="15" fill="${GOLD}" fill-opacity="0.28" stroke="${INK_DARK}" stroke-width="1.3"/>`
            + `<rect x="${cx - w / 2 - 4}" y="${yBot - 18}" width="${w + 8}" height="3.5" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.1"/>`
            + `<path d="M ${cx - 3.5} ${yBot} V ${yBot - 9} A 3.5 3.5 0 0 1 ${cx + 3.5} ${yBot - 9} V ${yBot} Z" fill="${INK_DARK}" fill-opacity="0.72"/>`
          );
        }).join('')
        // Tang conical gourd finial
        + `<polygon points="164,38 180,26 196,38" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<circle cx="180" cy="24" r="2.6" fill="${GOLD}"/>`
      );

    // 34. 延安宝塔山与陕北窑洞
    case 'yaodong_baota_hill':
      return (
        // Terraced loess mountain ridge
        `<path d="M 46 184 Q 98 110 180 96 Q 262 110 314 184 Z" fill="${GOLD}" fill-opacity="0.28" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Iconic arched Yaodong cave dwellings nestled in two hill tiers
        + [106, 144, 180, 216, 254].map(yx =>
          `<path d="M ${yx - 12} 178 V 156 A 12 11 0 0 1 ${yx + 12} 156 V 178 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
          + `<path d="M ${yx - 7} 178 V 160 A 7 7 0 0 1 ${yx + 7} 160 V 178 Z" fill="${primary}" fill-opacity="0.48" stroke="${INK_DARK}" stroke-width="0.9"/>`,
        ).join('')
        + [136, 180, 224].map(yx =>
          `<path d="M ${yx - 10} 138 V 122 A 10 9 0 0 1 ${yx + 10} 122 V 138 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
          + `<rect x="${yx - 5}" y="124" width="10" height="14" fill="${TERRACOTTA}" fill-opacity="0.7"/>`,
        ).join('')
        // 9-story octagonal Baota Pagoda crowning summit
        + drawPagodaTower(cx, 102, 7, 38, 74, TERRACOTTA, STONE, GOLD)
      );

    // 35. 山西应县木塔
    case 'yingxian_timber_pagoda':
      return (
        // Octagonal stone terrace plinth
        `<polygon points="104,184 118,166 242,166 256,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // 5 stories + 6 eave belts with visible Dougong wooden brackets & red timber columns
        + [0, 1, 2, 3, 4].map(t => {
          const yBot = 166 - t * 24;
          const wallW = 104 - t * 11;
          const eaveW = 138 - t * 13;
          return (
            drawColonnade(cx - wallW / 2, yBot - 13, wallW, 13, 5, TERRACOTTA, TERRACOTTA, INK_DARK)
            + drawDougongRow(cx - wallW / 2 - 2, yBot - 16, wallW + 4, 8, GOLD)
            + drawChineseEaveTier(cx, yBot - 24, wallW * 0.85, eaveW, 11, primary, INK_DARK, GOLD, 3.5)
          );
        }).join('')
        + `<polygon points="154,46 180,32 206,46" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="180" y1="32" x2="180" y2="18" stroke="${GOLD}" stroke-width="2.2" stroke-linecap="round"/>`
      );

    // 36. 平遥古城墙垛口与市楼
    case 'pingyao_city_gate':
      return (
        // Background tall wooden Market Tower (Shilou) rising inside walls
        `<rect x="148" y="64" width="64" height="58" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawChineseEaveTier(cx, 56, 52, 82, 16, secondary, INK_DARK, GOLD, 4)
        + drawXieshanRoof(cx, 32, 36, 66, 24, primary, INK_DARK, GOLD)
        // Crenellated Ming brick city ramparts & barbican archway
        + `<rect x="46" y="122" width="268" height="62" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + Array.from({ length: 14 }, (_, i) => `<rect x="${48 + i * 19}" y="114" width="11" height="8" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`).join('')
        + `<path d="M 160 184 V 150 A 20 20 0 0 1 200 150 V 184 Z" fill="${INK_DARK}" fill-opacity="0.86" stroke="${STONE}" stroke-width="1.3"/>`
        // Flanking corner watchtowers
        + `<rect x="52" y="96" width="44" height="26" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawXieshanRoof(74, 78, 30, 56, 18, primary, INK_DARK, GOLD)
        + `<rect x="264" y="96" width="44" height="26" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawXieshanRoof(286, 78, 30, 56, 18, primary, INK_DARK, GOLD)
      );

    // 37. 敦煌莫高窟九层楼
    case 'dunhuang_mogao_nine':
      return (
        // Stratified sandstone cliff face of Mingsha Mountain
        `<path d="M 38 184 L 46 68 Q 92 48 134 52 L 226 52 Q 268 48 314 68 L 322 184 Z" fill="${GOLD}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<line x1="46" y1="98" x2="314" y2="98" stroke="${secondary}" stroke-opacity="0.28" stroke-width="1"/>`
        + `<line x1="42" y1="138" x2="318" y2="138" stroke="${secondary}" stroke-opacity="0.28" stroke-width="1"/>`
        // Flanking carved grotto cave niches
        + [76, 108, 252, 284].map(gx =>
          `<path d="M ${gx - 8} 174 V 154 A 8 8 0 0 1 ${gx + 8} 154 V 174 Z" fill="${INK_DARK}" fill-opacity="0.72"/>`
          + `<path d="M ${gx - 7} 126 V 110 A 7 7 0 0 1 ${gx + 7} 110 V 126 Z" fill="${INK_DARK}" fill-opacity="0.62"/>`,
        ).join('')
        // Cliff-embedded 9-tier red-timber Nine-Story Pagoda (Jiucenglou)
        + drawPagodaTower(cx, 184, 7, 86, 146, primary, TERRACOTTA, GOLD)
      );

    // 38. 嘉峪关雄关城楼
    case 'jiayuguan_pass_fortress':
      return (
        // Stepped rammed-earth frontier fortress pass walls
        `<polygon points="44,184 56,128 304,128 316,184" fill="${GOLD}" fill-opacity="0.45" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="56" y="120" width="248" height="8" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<path d="M 162 184 V 150 A 18 18 0 0 1 198 150 V 184 Z" fill="${INK_DARK}" fill-opacity="0.86" stroke="${STONE}" stroke-width="1.2"/>`
        // Flanking watch-turrets
        + `<rect x="64" y="98" width="38" height="24" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawXieshanRoof(83, 82, 26, 48, 16, primary, INK_DARK, GOLD)
        + `<rect x="258" y="98" width="38" height="24" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawXieshanRoof(277, 82, 26, 48, 16, primary, INK_DARK, GOLD)
        // Central 3-tier Jiayuguan Gatehouse
        + drawColonnade(126, 94, 108, 26, 5, TERRACOTTA, TERRACOTTA, GOLD)
        + drawChineseEaveTier(cx, 76, 94, 134, 18, primary, INK_DARK, GOLD, 5)
        + drawColonnade(140, 58, 80, 18, 4, TERRACOTTA, TERRACOTTA, GOLD)
        + drawXieshanRoof(cx, 32, 62, 106, 26, secondary, INK_DARK, GOLD)
      );

    // 39. 喀什艾提尕尔与高台民居
    case 'kashgar_islamic_arcade':
      return (
        // High-platform adobe courtyard terraces on flanks
        `<rect x="44" y="138" width="76" height="46" fill="${GOLD}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="240" y="138" width="76" height="46" fill="${GOLD}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + [60, 88, 256, 284].map(ax => `<path d="M ${ax} 184 V 158 A 8 8 0 0 1 ${ax + 16} 158 V 184 Z" fill="${INK_DARK}" fill-opacity="0.72"/>`).join('')
        // Central yellow-ochre Id Kah Mosque pointed Iwan portal & melon dome
        + `<rect x="118" y="94" width="124" height="90" fill="${GOLD}" fill-opacity="0.58" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 150 184 V 136 Q 180 106 210 136 V 184 Z" fill="${INK_DARK}" fill-opacity="0.82" stroke="${IVORY}" stroke-width="1.4"/>`
        + `<path d="M 154 78 Q 180 46 206 78 Z" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Twin flanking Minarets
        + `<rect x="112" y="54" width="18" height="130" fill="${GOLD}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="110,54 121,34 132,54" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="230" y="54" width="18" height="130" fill="${GOLD}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="228,54 239,34 250,54" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
      );

    // 40. 哈尔滨圣索菲亚教堂穹顶
    case 'harbin_sophia_dome':
      return (
        // Red-brick Byzantine cathedral nave & blind arched masonry
        `<rect x="74" y="114" width="212" height="70" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="116" y="88" width="128" height="28" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [96, 134, 180, 226, 264].map(ax =>
          `<path d="M ${ax - 8} 184 V 142 A 8 8 0 0 1 ${ax + 8} 142 V 184 Z" fill="${IVORY}" fill-opacity="0.22" stroke="${IVORY}" stroke-width="1.2"/>`,
        ).join('')
        // Central grand emerald-green onion-tent dome
        + `<path d="M 142 88 Q 146 66 180 34 Q 214 66 218 88 Z" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<line x1="180" y1="34" x2="180" y2="21" stroke="${GOLD}" stroke-width="2"/>`
        // Flanking smaller onion domes
        + [96, 132, 228, 264].map((dx, i) => {
          const baseY = i === 1 || i === 2 ? 88 : 114;
          return `<path d="M ${dx - 11} ${baseY} Q ${dx - 14} ${baseY - 14} ${dx} ${baseY - 26} Q ${dx + 14} ${baseY - 14} ${dx + 11} ${baseY} Z" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`;
        }).join('')
      );

    // 41. 草原蒙古包群与敖包
    case 'mongol_ger_oboo':
      return (
        // Flanking smaller Ger yurt & sacred stone Oboo prayer cairn
        `<path d="M 52 184 V 156 L 84 140 L 116 156 V 184 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="52" y1="164" x2="116" y2="164" stroke="${primary}" stroke-width="1.6"/>`
        + `<rect x="77" y="162" width="14" height="22" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1"/>`
        // Central grand Mongolian Ger with red-gold Toono crown & lattice patterns
        + `<rect x="132" y="138" width="112" height="46" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 126 138 Q 188 102 250 138 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 168 118 Q 188 108 208 118" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>`
        + `<line x1="132" y1="146" x2="244" y2="146" stroke="${primary}" stroke-width="2.4"/>`
        + `<rect x="176" y="150" width="24" height="34" rx="2" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1.3"/>`
        // Sacred Oboo stone cairn & prayer pole on right
        + `<polygon points="274,184 288,154 304,154 318,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="296" y1="154" x2="296" y2="122" stroke="${INK_DARK}" stroke-width="2"/>`
        + `<path d="M 296 124 Q 312 126 320 132 M 296 130 Q 310 134 318 140" stroke="${primary}" stroke-width="1.6" stroke-linecap="round"/>`
      );

    // 42. 都江堰安澜索桥与二王庙
    case 'dujiangyan_temple_weir':
      return (
        // Terraced riverside Erwang temple roofs on left slope
        `<path d="M 38 184 L 46 116 L 128 134 L 128 184 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawColonnade(54, 98, 64, 24, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawXieshanRoof(86, 74, 48, 80, 24, primary, INK_DARK, GOLD)
        // Sweeping Anlan bamboo-cable suspension bridge across Minjiang River
        + `<rect x="128" y="128" width="12" height="56" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="292" y="128" width="12" height="56" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 134 134 Q 216 158 298 134" stroke="${INK_DARK}" stroke-width="2.2" fill="none"/>`
        + `<path d="M 134 152 Q 216 170 298 152" stroke="${TERRACOTTA}" stroke-width="3" fill="none"/>`
        + [154, 174, 194, 216, 238, 258, 278].map(sx => `<line x1="${sx}" y1="145" x2="${sx}" y2="160" stroke="${INK_MID}" stroke-width="1.1"/>`).join('')
        + drawXieshanRoof(134, 114, 16, 28, 14, secondary, INK_DARK, GOLD)
        + drawXieshanRoof(298, 114, 16, 28, 14, secondary, INK_DARK, GOLD)
      );

    // 43. 重庆洪崖洞与过江索道山城
    case 'chongqing_hongyadong':
      return (
        // Steep vertical river cliffside
        `<polygon points="44,184 54,60 220,66 230,184" fill="${STONE_DEEP}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // 4 dramatic stacked illuminated cliffside Hongyadong timber stilt levels
        + [0, 1, 2, 3].map(lvl => {
          const yBot = 178 - lvl * 31;
          const w = 152 - lvl * 14;
          return (
            drawColonnade(66, yBot - 19, w, 19, 6 - Math.floor(lvl / 2), TERRACOTTA, TERRACOTTA, GOLD)
            + drawChineseEaveTier(66 + w / 2, yBot - 31, w * 0.88, w + 18, 13, primary, INK_DARK, GOLD, 4)
          );
        }).join('')
        // Yangtze River arched bridge + crossing aerial cable-car gondola on right
        + `<path d="M 220 156 H 324 M 224 184 Q 272 150 320 184" stroke="${INK_DARK}" stroke-width="2.2"/>`
        + `<line x1="196" y1="68" x2="328" y2="118" stroke="${INK_MID}" stroke-width="1.4"/>`
        + `<rect x="262" y="88" width="22" height="14" rx="2" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1.2"/>`
        + `<line x1="273" y1="88" x2="273" y2="96" stroke="${INK_DARK}" stroke-width="1"/>`
      );

    // 44. 曲阜孔庙大成殿 / 文庙
    case 'confucian_temple_qufu':
      return (
        // Broad stone Apricot Altar terrace (Xingtan)
        `<rect x="64" y="160" width="232" height="24" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="154,184 166,160 194,160 206,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawStoneBalustrade(66, 152, 228, 8, 14, IVORY)
        // Dragon-carved crimson portico columns
        + drawColonnade(84, 118, 192, 34, 7, TERRACOTTA, TERRACOTTA, GOLD)
        + [96, 124, 152, 208, 236, 264].map(px => `<line x1="${px}" y1="118" x2="${px}" y2="152" stroke="${GOLD}" stroke-width="1.4" stroke-dasharray="3 2"/>`).join('')
        // Double-eaved golden imperial glazed hall roof
        + drawChineseEaveTier(cx, 94, 174, 230, 24, GOLD, INK_DARK, GOLD, 6)
        + drawDougongRow(112, 90, 136, 11, GOLD)
        + `<rect x="114" y="76" width="132" height="14" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawXieshanRoof(cx, 40, 102, 184, 36, GOLD, INK_DARK, GOLD)
      );

    // 45. 海岸灯塔与开埠港楼
    case 'maritime_lighthouse_harbor':
      return (
        // Coastal stone seawall pier
        `<rect x="44" y="168" width="272" height="16" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Red-roof harbor customs hall on right
        + `<rect x="164" y="128" width="112" height="40" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="158,128 220,100 282,128" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [180, 206, 232, 258].map(wx => `<path d="M ${wx} 168 V 144 A 6 6 0 0 1 ${wx + 12} 144 V 168 Z" fill="${primary}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1"/>`).join('')
        // Striped coastal lighthouse casting luminous beacon beams
        + `<polygon points="94,168 102,64 126,64 134,168" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<polygon points="98,136 130,136 128,116 100,116" fill="${secondary}"/>`
        + `<polygon points="101,94 127,94 126,76 102,76" fill="${secondary}"/>`
        + `<rect x="101" y="50" width="26" height="14" fill="${GOLD}" fill-opacity="0.85" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="99,50 114,36 129,50" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Geometric lighthouse light beams
        + `<polygon points="127,56 218,34 218,74" fill="${GOLD}" fill-opacity="0.22"/>`
        + `<polygon points="101,56 44,40 44,72" fill="${GOLD}" fill-opacity="0.18"/>`
      );

    // 46. 双塔斜拉跨海大桥
    case 'sea_crossing_cable_bridge':
      return (
        // Bridge deck & roadbed spanning full horizon
        `<rect x="30" y="144" width="300" height="8" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Twin monumental A-frame / diamond cable-stayed pylons
        + [116, 244].map(px => {
          const cables = [-58, -42, -26, 26, 42, 58].map(dx =>
            `<line x1="${px}" y1="54" x2="${px + dx}" y2="144" stroke="${primary}" stroke-opacity="0.72" stroke-width="1.1"/>`,
          ).join('');
          return (
            cables
            + `<polygon points="${px},38 ${px - 18},184 ${px - 10},184 ${px},58 ${px + 10},184 ${px + 18},184" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
            + `<rect x="${px - 12}" y="114" width="24" height="6" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
          );
        }).join('')
        // Passing cargo vessel / sailboat underneath
        + `<polygon points="164,178 198,178 192,184 170,184" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="174" y="172" width="14" height="6" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="0.9"/>`
      );

    // 47. 现代高铁飞翼枢纽站
    case 'hsr_modern_hub':
      return (
        // Glazed structural Y-pier facade
        `<rect x="52" y="132" width="256" height="52" fill="${primary}" fill-opacity="0.14" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + [84, 132, 180, 228, 276].map(yx =>
          `<line x1="${yx}" y1="184" x2="${yx}" y2="132" stroke="${INK_DARK}" stroke-width="1.6"/>`
          + `<path d="M ${yx} 144 L ${yx - 14} 118 M ${yx} 144 L ${yx + 14} 118" stroke="${INK_DARK}" stroke-width="1.4"/>`,
        ).join('')
        // Sweeping bionic gull-wing HSR terminal canopy
        + `<path d="M 30 124 Q 108 66 180 96 Q 252 66 330 124 Q 252 108 180 122 Q 108 108 30 124 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + `<path d="M 46 118 Q 112 80 180 104 Q 248 80 314 118" stroke="${primary}" stroke-width="2.2" fill="none"/>`
        // Sleek streamlined Fuxing bullet-train silhouette in forecourt
        + `<path d="M 102 184 L 122 162 H 264 V 184 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="120" y1="173" x2="262" y2="173" stroke="${secondary}" stroke-width="2.6"/>`
        + `<polygon points="118,166 138,166 136,172 114,172" fill="${primary}" fill-opacity="0.72"/>`
      );

    // 48. 现代文化大剧院
    case 'modern_civic_opera':
      return (
        // Stepped waterfront civic plaza
        `<rect x="48" y="170" width="264" height="14" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Twin sculptural curved shell theater domes
        + `<path d="M 64 170 Q 116 62 178 170 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 92 170 Q 134 92 176 170" stroke="${primary}" stroke-opacity="0.52" stroke-width="1.5"/>`
        + `<path d="M 156 170 Q 222 44 296 170 Z" fill="${primary}" fill-opacity="0.22" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + `<path d="M 188 170 Q 234 78 278 170 Z" fill="${IVORY}" fill-opacity="0.78" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<path d="M 212 170 Q 242 114 270 170" stroke="${GOLD}" stroke-width="2"/>`
      );

    // 49. 科创双子研发塔
    case 'smart_science_twin_towers':
      return (
        // Elevated landscaped science-park plinth
        `<rect x="64" y="168" width="232" height="16" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Left glass diagrid R&D tower
        + `<polygon points="94,168 100,46 154,40 158,168" fill="${primary}" fill-opacity="0.26" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<line x1="100" y1="68" x2="156" y2="108" stroke="${IVORY}" stroke-width="1.1"/>`
        + `<line x1="154" y1="68" x2="96" y2="108" stroke="${IVORY}" stroke-width="1.1"/>`
        + `<line x1="98" y1="112" x2="156" y2="152" stroke="${IVORY}" stroke-width="1.1"/>`
        + `<line x1="156" y1="112" x2="94" y2="152" stroke="${IVORY}" stroke-width="1.1"/>`
        // Right glass diagrid R&D tower
        + `<polygon points="202,168 206,40 260,46 266,168" fill="${primary}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<line x1="206" y1="68" x2="262" y2="108" stroke="${IVORY}" stroke-width="1.1"/>`
        + `<line x1="260" y1="68" x2="204" y2="108" stroke="${IVORY}" stroke-width="1.1"/>`
        + `<line x1="204" y1="112" x2="264" y2="152" stroke="${IVORY}" stroke-width="1.1"/>`
        + `<line x1="264" y1="112" x2="202" y2="152" stroke="${IVORY}" stroke-width="1.1"/>`
        // Mid-air suspended skybridge linking twin towers
        + `<rect x="150" y="96" width="60" height="14" rx="2" fill="${GOLD}" fill-opacity="0.82" stroke="${INK_DARK}" stroke-width="1.3"/>`
      );

    // 50. 古运河水门码头与文昌阁
    case 'ancient_water_wharf':
      return (
        // Stepped canal wharf masonry & brick water-gate (Shuimen)
        `<rect x="52" y="138" width="128" height="46" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 88 184 V 154 A 24 22 0 0 1 136 154 V 184 Z" fill="${primary}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + drawChineseEaveTier(116, 122, 86, 134, 16, primary, INK_DARK, GOLD, 4.5)
        // Corner 2-story Wenchang Pavilion on embankment
        + `<rect x="196" y="124" width="76" height="60" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + drawColonnade(204, 128, 60, 26, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(234, 110, 56, 92, 18, primary, INK_DARK, GOLD, 4.5)
        + `<rect x="212" y="88" width="44" height="22" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawXieshanRoof(234, 62, 30, 68, 26, secondary, INK_DARK, GOLD)
        // Moored black-awning Wupeng boat
        + `<polygon points="56,180 104,180 96,186 64,186" fill="${INK_DARK}"/>`
        + `<path d="M 68 180 Q 80 166 92 180 Z" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1"/>`
      );

    // 51. 竹林书院与现代乡村美术馆
    case 'bamboo_courtyard_library':
      return (
        // Minimalist contemporary rammed-earth & timber-louvered pavilion
        `<rect x="74" y="168" width="212" height="16" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="92" y="106" width="176" height="62" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="82" y="96" width="196" height="12" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Vertical timber louver screen & serene glass courtyard opening
        + [104, 114, 124, 134, 226, 236, 246, 256].map(lx => `<line x1="${lx}" y1="108" x2="${lx}" y2="168" stroke="${GOLD}" stroke-width="2"/>`).join('')
        + `<rect x="148" y="120" width="64" height="48" fill="${primary}" fill-opacity="0.20" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<circle cx="180" cy="142" r="11" fill="${GOLD}" fill-opacity="0.42" stroke="${INK_DARK}" stroke-width="1"/>`
        // Articulated bamboo stalks framing both sides
        + drawTreeAccent(56, 184, 'bamboo', 1.35, primary)
        + drawTreeAccent(294, 184, 'bamboo', 1.25, primary)
      );

    // 52. 长城烽燧关隘与敌楼
    case 'beacon_tower_greatwall':
      return (
        // Winding crenellated Great Wall rising across mountain crest
        `<path d="M 38 184 L 116 134 L 222 134 L 316 178 L 316 184 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 38 164 L 116 116 L 222 116 L 316 160" stroke="${INK_DARK}" stroke-width="3" stroke-dasharray="9 6"/>`
        // Central 2-story arched brick watchtower (Dilou)
        + `<rect x="134" y="82" width="92" height="62" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + Array.from({ length: 6 }, (_, i) => `<rect x="${137 + i * 15}" y="74" width="9" height="8" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1"/>`).join('')
        + [152, 180, 208].map(ax => `<path d="M ${ax - 6} 128 V 104 A 6 6 0 0 1 ${ax + 6} 104 V 128 Z" fill="${INK_DARK}" fill-opacity="0.82"/>`).join('')
        // Upper wooden beacon turret
        + `<rect x="150" y="54" width="60" height="20" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawXieshanRoof(cx, 34, 46, 78, 20, primary, INK_DARK, GOLD)
      );

    // 53. 百年工业遗址文创园
    case 'industrial_heritage_loft':
      return (
        // Saw-tooth red-brick historic factory halls
        `<polygon points="52,184 52,118 96,94 96,118 140,94 140,118 184,94 184,184" fill="${TERRACOTTA}" fill-opacity="0.82" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [68, 112, 156].map(wx => `<rect x="${wx}" y="132" width="16" height="28" fill="${IVORY}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1"/>`).join('')
        // Tall industrial smokestack / blast furnace steel gantry transformed into creative hub
        + `<polygon points="204,184 214,48 232,48 242,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="208" y="64" width="30" height="6" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="248" y="96" width="58" height="88" fill="${primary}" fill-opacity="0.22" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="248" y1="126" x2="306" y2="126" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<line x1="248" y1="156" x2="306" y2="156" stroke="${INK_DARK}" stroke-width="1.2"/>`
      );

    // 54. 大漠光热熔盐塔与星空宿集
    case 'desert_observatory_solar':
      return (
        // Radiant Concentrated Solar Power Tower
        `<polygon points="168,184 173,62 187,62 192,184" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="171" y="44" width="18" height="18" rx="2" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<circle cx="180" cy="53" r="18" fill="${GOLD}" fill-opacity="0.24"/>`
        // Curved heliostat solar mirror arrays flanking tower
        + [76, 106, 136, 224, 254, 284].map(mx =>
          `<line x1="${mx}" y1="184" x2="${mx}" y2="168" stroke="${INK_DARK}" stroke-width="1.3"/>`
          + `<polygon points="${mx - 11},166 ${mx + 11},162 ${mx + 9},172 ${mx - 13},176" fill="${primary}" fill-opacity="0.46" stroke="${INK_DARK}" stroke-width="1.1"/>`,
        ).join('')
        // Desert lodge dome silhouette on right
        + `<path d="M 244 184 Q 268 152 292 184 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
      );

    // 55. 琼雷火山玄武石古村门
    case 'volcanic_stone_village':
      return (
        // Dark porous basalt volcanic stone archway gate & coral stone walls
        `<rect x="64" y="136" width="232" height="48" fill="${INK_MID}" fill-opacity="0.62" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="118" y="96" width="124" height="88" fill="${INK_MID}" fill-opacity="0.78" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 156 184 V 142 A 24 22 0 0 1 204 142 V 184 Z" fill="${PAPER}" stroke="${GOLD}" stroke-width="1.5"/>`
        + drawChineseEaveTier(cx, 78, 102, 144, 18, secondary, INK_DARK, GOLD, 4.5)
        // Coral/basalt block stone courses
        + `<line x1="124" y1="114" x2="236" y2="114" stroke="${STONE}" stroke-opacity="0.48" stroke-width="1"/>`
        + `<line x1="68" y1="158" x2="116" y2="158" stroke="${STONE}" stroke-opacity="0.48" stroke-width="1"/>`
        + `<line x1="244" y1="158" x2="292" y2="158" stroke="${STONE}" stroke-opacity="0.48" stroke-width="1"/>`
        + drawTreeAccent(56, 184, 'palm', 1.25, primary)
        + drawTreeAccent(304, 184, 'palm', 1.2, primary)
      );

    // 56. 藏羌碉楼与喀斯特石寨
    case 'karst_stone_watchtower':
      return (
        // Mountain stone terrace base & village wall
        `<polygon points="54,184 72,146 288,146 306,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Flanking traditional stone village houses
        + `<rect x="74" y="114" width="66" height="34" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="220" y="114" width="66" height="34" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Iconic tapering 8-story stone Diaolou blockhouse tower
        + `<polygon points="148,166 158,42 202,42 212,166" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="155" y="36" width="50" height="6" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + [56, 76, 96, 116, 136].map(wy =>
          `<rect x="170" y="${wy}" width="6" height="9" fill="${INK_DARK}"/>`
          + `<rect x="184" y="${wy}" width="6" height="9" fill="${INK_DARK}"/>`,
        ).join('')
        + `<path d="M 172 166 V 150 A 8 8 0 0 1 188 150 V 166 Z" fill="${INK_DARK}" fill-opacity="0.82"/>`
      );

    // 57. 梅州客家半月塘围龙屋
    case 'hakka_weilongwu':
      return (
        // Outer semicircular tiered Weilong crescent wings embracing the rear Huatai slope
        `<path d="M 52 136 A 128 76 0 0 1 308 136 L 294 136 A 114 64 0 0 0 66 136 Z" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 64 136 A 116 62 0 0 1 296 136 V 158 H 64 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 88 122 A 92 48 0 0 1 272 122 L 260 122 A 80 38 0 0 0 100 122 Z" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Defensive perimeter windows along the outer curved Weilong arc
        + [-88, -64, -40, 40, 64, 88].map(dx => {
          const wy = Math.round(132 - Math.sqrt(Math.max(0, 1 - (dx * dx) / 12000)) * 46);
          return `<rect x="${cx + dx - 3.5}" y="${wy}" width="7" height="8" rx="1" fill="${INK_DARK}" fill-opacity="0.76"/>`;
        }).join('')
        // Central three-hall Hakka ancestral spine (Upper, Middle, and Lower Halls)
        + `<rect x="136" y="102" width="88" height="24" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawXieshanRoof(cx, 80, 56, 98, 22, primary, INK_DARK, GOLD)
        // Flanking symmetrical Hengwu side wings
        + `<rect x="66" y="122" width="46" height="36" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="62,122 89,106 116,122" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="248" y="122" width="46" height="36" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="244,122 271,106 298,122" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Front ancestral gatehouse hall with carved stone portal & golden clan plaque
        + `<rect x="114" y="122" width="132" height="36" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + drawXieshanRoof(cx, 100, 82, 146, 22, secondary, INK_DARK, GOLD)
        + `<rect x="166" y="132" width="28" height="26" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="168" y="124" width="24" height="6" rx="1" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.8"/>`
        + [128, 146, 206, 224].map(wx => `<rect x="${wx}" y="136" width="8" height="10" rx="1" fill="${INK_DARK}" fill-opacity="0.72"/>`).join('')
        // Sun-drying Hepin terrace & twin scholar flagstaff stone pillars
        + `<rect x="58" y="158" width="244" height="6" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<line x1="90" y1="158" x2="90" y2="112" stroke="${INK_DARK}" stroke-width="1.8"/>`
        + `<polygon points="90,113 100,117 90,121" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.8"/>`
        + `<line x1="270" y1="158" x2="270" y2="112" stroke="${INK_DARK}" stroke-width="1.8"/>`
        + `<polygon points="270,113 260,117 270,121" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.8"/>`
        // Iconic Half-Moon Fengshui Pond in front of the main courtyard
        + `<path d="M 96 164 H 264 A 84 22 0 0 1 96 164 Z" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 103 165 H 257 A 77 18 0 0 1 103 165 Z" fill="${primary}" fill-opacity="0.32" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<line x1="146" y1="172" x2="214" y2="172" stroke="${IVORY}" stroke-opacity="0.82" stroke-width="1.1" stroke-linecap="round"/>`
        + `<line x1="160" y1="178" x2="200" y2="178" stroke="${IVORY}" stroke-opacity="0.7" stroke-width="1" stroke-linecap="round"/>`
        + drawTreeAccent(42, 184, 'bamboo', 1.1, primary)
        + drawTreeAccent(316, 184, 'cypress', 0.95, primary)
      );

    // 58. 晋商高墙深宅砖雕大院
    case 'shanxi_courtyard_jinshang':
      return (
        // Inner courtyard stepped single-slope Jinshang roofs peeking behind fortress walls
        `<polygon points="62,102 134,82 134,114 62,114" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="226,82 298,102 298,114 226,114" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Elevated central inner Guanjiage / ancestral pavilion
        + `<rect x="148" y="68" width="64" height="44" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawDougongRow(152, 68, 56, 5, GOLD)
        + drawXieshanRoof(cx, 40, 48, 86, 28, secondary, INK_DARK, GOLD)
        // Towering grey-brick perimeter castle ramparts with stepped bastions
        + `<polygon points="46,184 52,110 144,110 144,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<polygon points="216,184 216,110 308,110 314,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        // Brick parapet battlements & high clerestory relief medallions
        + [56, 74, 92, 110, 128, 224, 242, 260, 278, 296].map(bx =>
          `<rect x="${bx}" y="102" width="10" height="8" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1"/>`,
        ).join('')
        + `<line x1="50" y1="138" x2="142" y2="138" stroke="${INK_MID}" stroke-opacity="0.34" stroke-width="1"/>`
        + `<line x1="218" y1="138" x2="310" y2="138" stroke="${INK_MID}" stroke-opacity="0.34" stroke-width="1"/>`
        + `<rect x="86" y="144" width="20" height="16" rx="2" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="254" y="144" width="20" height="16" rx="2" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Central grand brick-carved Jinshang Gatehouse & overhanging floral eaves
        + `<rect x="140" y="96" width="80" height="88" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + drawChineseEaveTier(cx, 76, 66, 102, 20, primary, INK_DARK, GOLD, 5.5)
        + `<rect x="160" y="104" width="40" height="10" rx="1" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        // Recessed arched brick doorway & vermilion timber gates with brass studs
        + `<path d="M 162 184 V 138 A 18 16 0 0 1 198 138 V 184 Z" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<line x1="180" y1="126" x2="180" y2="184" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<circle cx="174" cy="158" r="1.8" fill="${GOLD}"/>`
        + `<circle cx="186" cy="158" r="1.8" fill="${GOLD}"/>`
        // Signature twin crimson lanterns hanging beneath the gatehouse eaves
        + [150, 210].map(lx =>
          `<line x1="${lx}" y1="94" x2="${lx}" y2="101" stroke="${INK_DARK}" stroke-width="1"/>`
          + `<ellipse cx="${lx}" cy="107" rx="4.8" ry="6" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1"/>`
          + `<line x1="${lx}" y1="113" x2="${lx}" y2="117" stroke="${GOLD}" stroke-width="1.2"/>`,
        ).join('')
        // Carved granite mounting stones flanking the entrance
        + `<rect x="145" y="172" width="10" height="12" rx="1" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="205" y="172" width="10" height="12" rx="1" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
      );

    // 59. 藏地覆钵白塔与经幡圣境
    case 'tibetan_white_pagoda':
      return (
        // Tibetan stone terrace & flanking red-frieze prayer-wheel cloister walls
        `<rect x="56" y="164" width="248" height="20" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="64" y="140" width="66" height="24" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="64" y="134" width="66" height="6" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="230" y="140" width="66" height="24" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="230" y="134" width="66" height="6" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1"/>`
        // Golden prayer wheel cylinders along cloister gallery
        + [76, 92, 108, 252, 268, 284].map(px =>
          `<rect x="${px - 4}" y="146" width="8" height="13" rx="1" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.9"/>`,
        ).join('')
        // Flanking companion guardian white stupas
        + [96, 264].map(sx =>
          `<rect x="${sx - 14}" y="122" width="28" height="12" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
          + `<path d="M ${sx - 11} 122 C ${sx - 13} 110 ${sx - 7} 102 ${sx} 102 C ${sx + 7} 102 ${sx + 13} 110 ${sx + 11} 122 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
          + `<polygon points="${sx - 4},102 ${sx},86 ${sx + 4},102" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`,
        ).join('')
        // Sweeping five-color Tibetan prayer-flag ropes from main stupa to flanking poles
        + `<line x1="44" y1="184" x2="44" y2="112" stroke="${INK_DARK}" stroke-width="1.8"/>`
        + `<line x1="316" y1="184" x2="316" y2="112" stroke="${INK_DARK}" stroke-width="1.8"/>`
        + `<path d="M 173 68 Q 110 96 44 114" stroke="${INK_MID}" stroke-width="1.1"/>`
        + `<path d="M 187 68 Q 250 96 316 114" stroke="${INK_MID}" stroke-width="1.1"/>`
        + [0, 1, 2, 3, 4, 5, 6].map(i => {
          const colors = [primary, GOLD, IVORY, TERRACOTTA, secondary];
          const t = (i + 1) / 8;
          const lx = Math.round(173 - t * 124);
          const ly = Math.round(68 + t * 44 + Math.sin(t * Math.PI) * 9);
          const rx = Math.round(187 + t * 124);
          return (
            `<polygon points="${lx - 3},${ly} ${lx + 4},${ly + 2} ${lx + 3},${ly + 9} ${lx - 4},${ly + 7}" fill="${colors[i % 5]}" stroke="${INK_DARK}" stroke-width="0.6"/>`
            + `<polygon points="${rx - 4},${ly + 2} ${rx + 3},${ly} ${rx + 4},${ly + 7} ${rx - 3},${ly + 9}" fill="${colors[(i + 2) % 5]}" stroke="${INK_DARK}" stroke-width="0.6"/>`
          );
        }).join('')
        // Monumental central White Chörten: stepped Lion Throne base
        + `<rect x="132" y="150" width="96" height="14" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="140" y="138" width="80" height="12" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="146" y="128" width="68" height="10" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Iconic inverted-bowl white dome (Bumpa) & gilded shrine niche
        + `<path d="M 148 128 C 142 104 154 88 180 88 C 206 88 218 104 212 128 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 170 128 V 108 A 10 10 0 0 1 190 108 V 128 Z" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1.3"/>`
        + `<circle cx="180" cy="112" r="3" fill="${GOLD}"/>`
        // Harmika crown, 13-ring golden conical spire, canopy & sun-moon jewel
        + `<rect x="166" y="76" width="28" height="12" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="171" y="79" width="18" height="5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.8"/>`
        + `<polygon points="168,76 177,46 183,46 192,76" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + [52, 58, 64, 70].map(ry => `<line x1="173" y1="${ry}" x2="187" y2="${ry}" stroke="${INK_DARK}" stroke-width="0.9"/>`).join('')
        + `<path d="M 166 46 Q 180 39 194 46 Z" fill="${primary}" stroke="${GOLD}" stroke-width="1.2"/>`
        + `<line x1="180" y1="41" x2="180" y2="29" stroke="${GOLD}" stroke-width="2"/>`
        + `<circle cx="180" cy="29" r="2.8" fill="${GOLD}"/>`
      );

    // 60. 侗乡五亭飞檐风雨廊桥
    case 'dong_wind_rain_bridge':
      return (
        // Five battered masonry river piers with triangular cutwater prows
        [58, 114, 180, 246, 302].map(px =>
          `<polygon points="${px - 14},184 ${px - 10},156 ${px + 10},156 ${px + 14},184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
          + `<polygon points="${px - 5},184 ${px},158 ${px + 5},184" fill="${IVORY}" fill-opacity="0.48"/>`,
        ).join('')
        // Long cantilevered cedar bridge deck & continuous 12-bay covered corridor
        + `<rect x="34" y="150" width="292" height="6" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawColonnade(38, 134, 284, 16, 12, IVORY, TERRACOTTA, INK_DARK)
        + `<rect x="30" y="128" width="300" height="6" rx="1.5" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Five symmetrical multi-tiered Dong cedar pavilion towers rising off the bridge
        + drawPagodaTower(58, 128, 2, 32, 36, primary, IVORY, GOLD)
        + drawPagodaTower(114, 128, 3, 40, 56, secondary, TERRACOTTA, GOLD)
        + drawPagodaTower(cx, 128, 4, 52, 82, primary, TERRACOTTA, GOLD)
        + drawPagodaTower(246, 128, 3, 40, 56, secondary, TERRACOTTA, GOLD)
        + drawPagodaTower(302, 128, 2, 32, 36, primary, IVORY, GOLD)
      );

    // 61. 关东木刻楞林海粮仓
    case 'northeast_wooden_granary':
      return (
        // Flanking northern taiga conifers
        drawTreeAccent(50, 184, 'cypress', 1.32, primary)
        + drawTreeAccent(312, 184, 'cypress', 1.24, primary)
        // Raised stone sleeper foundation beneath the log cabin
        + `<rect x="74" y="172" width="160" height="12" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Interlocking Mukeleng round-log cabin body
        + `<rect x="82" y="114" width="144" height="58" fill="${GOLD}" fill-opacity="0.46" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [122, 130, 138, 146, 154, 162].map(ly =>
          `<line x1="82" y1="${ly}" x2="226" y2="${ly}" stroke="${INK_MID}" stroke-opacity="0.52" stroke-width="1"/>`
          + `<circle cx="79" cy="${ly - 3}" r="3.4" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1"/>`
          + `<circle cx="229" cy="${ly - 3}" r="3.4" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1"/>`,
        ).join('')
        // Carved wooden entrance doorway & multipane double-shutter windows
        + `<rect x="139" y="136" width="28" height="36" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + [102, 182].map(wx =>
          `<rect x="${wx}" y="132" width="22" height="22" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
          + `<line x1="${wx + 11}" y1="132" x2="${wx + 11}" y2="154" stroke="${INK_DARK}" stroke-width="1"/>`
          + `<line x1="${wx}" y1="143" x2="${wx + 22}" y2="143" stroke="${INK_DARK}" stroke-width="1"/>`
          + `<rect x="${wx - 4}" y="132" width="4" height="22" fill="${primary}" stroke="${INK_DARK}" stroke-width="0.9"/>`
          + `<rect x="${wx + 22}" y="132" width="4" height="22" fill="${primary}" stroke="${INK_DARK}" stroke-width="0.9"/>`,
        ).join('')
        // Chimney & steep snow-blanketed A-frame timber gable roof
        + `<rect x="184" y="58" width="14" height="30" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<path d="M 191 54 Q 198 44 192 36" stroke="${primary}" stroke-opacity="0.34" stroke-width="1.4" stroke-linecap="round"/>`
        + `<polygon points="68,116 154,66 240,116" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.5" stroke-linejoin="round"/>`
        + `<path d="M 68 116 Q 112 86 154 66 Q 196 86 240 116 L 234 108 Q 194 80 154 62 Q 114 80 74 108 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<circle cx="154" cy="96" r="7" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Raised cylindrical wooden-slat Northeast grain silo / crib on right
        + [246, 266, 286].map(lx => `<line x1="${lx}" y1="168" x2="${lx}" y2="184" stroke="${INK_DARK}" stroke-width="2.4"/>`).join('')
        + `<rect x="240" y="116" width="52" height="52" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [250, 261, 272, 282].map(rx => `<line x1="${rx}" y1="116" x2="${rx}" y2="168" stroke="${INK_MID}" stroke-opacity="0.48" stroke-width="1"/>`).join('')
        + [130, 144, 158].map(hy => `<line x1="240" y1="${hy}" x2="292" y2="${hy}" stroke="${INK_DARK}" stroke-width="1.3"/>`).join('')
        + `<polygon points="234,116 266,90 298,116" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 234 116 Q 250 100 266 90 Q 282 100 298 116 L 293 111 Q 279 98 266 88 Q 253 98 239 111 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1"/>`
      );

    // 62. 岭南镬耳山墙宗祠书院
    case 'lingnan_wok_ear_hall':
      return (
        // Twin granite scholar flagstone plinths in front courtyard
        `<rect x="64" y="128" width="8" height="56" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="288" y="128" width="8" height="56" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Flanking wing halls with outer rounded Lingnan Wok-Ear (Huoguo-ear) gables
        + `<rect x="58" y="118" width="48" height="66" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 56 120 V 94 Q 72 72 88 94 V 120 Z" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 62 114 V 96 Q 72 82 82 96" stroke="${IVORY}" stroke-width="1.4"/>`
        + `<rect x="254" y="118" width="48" height="66" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 272 120 V 94 Q 288 72 304 94 V 120 Z" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 278 114 V 96 Q 288 82 298 96" stroke="${IVORY}" stroke-width="1.4"/>`
        // Central blue-brick three-bay Lingnan Ancestral Hall with towering inner twin Wok-Ear gables
        + `<rect x="106" y="106" width="148" height="78" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="106" y="168" width="148" height="16" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Inner hall twin monumental Wok-Ear arch gables & glazed Ao-fish ridge roof
        + `<polygon points="114,106 130,68 230,68 246,106" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 106 108 V 68 Q 120 42 134 68 V 108 Z" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 112 100 V 71 Q 120 53 128 71" stroke="${IVORY}" stroke-width="1.6"/>`
        + `<path d="M 226 108 V 68 Q 240 42 254 68 V 108 Z" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 232 100 V 71 Q 240 53 248 71" stroke="${IVORY}" stroke-width="1.6"/>`
        + `<line x1="130" y1="68" x2="230" y2="68" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>`
        + `<path d="M 132 68 L 128 60 M 228 68 L 232 60" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"/>`
        // Recessed central ancestral portal with Tanglong sliding timber bars & gold tablet
        + `<rect x="160" y="128" width="40" height="56" fill="${INK_DARK}" fill-opacity="0.8" stroke="${IVORY}" stroke-width="1.3"/>`
        + [136, 144, 152, 160].map(ty => `<line x1="164" y1="${ty}" x2="196" y2="${ty}" stroke="${TERRACOTTA}" stroke-width="2.2"/>`).join('')
        + `<rect x="163" y="112" width="34" height="10" rx="1" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        // Flanking colorful Manchu stained-glass lattice windows
        + [122, 214].map(wx =>
          `<rect x="${wx}" y="128" width="24" height="24" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
          + `<rect x="${wx + 2}" y="130" width="9" height="9" fill="${primary}" fill-opacity="0.78"/>`
          + `<rect x="${wx + 13}" y="130" width="9" height="9" fill="${GOLD}" fill-opacity="0.86"/>`
          + `<rect x="${wx + 2}" y="141" width="9" height="9" fill="${TERRACOTTA}" fill-opacity="0.82"/>`
          + `<rect x="${wx + 13}" y="141" width="9" height="9" fill="${secondary}" fill-opacity="0.72"/>`,
        ).join('')
      );

    // 63. 京杭大运河漕运古仓钞关
    case 'grand_canal_granary':
      return (
        // Stone Grand Canal embankment quay & stepped unloading wharf
        `<rect x="38" y="166" width="284" height="18" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Left-center rhythmic Imperial Tribute Granary row (Ao-jian) with 3 raised ventilation clerestories
        + `<rect x="46" y="118" width="166" height="48" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="46" y="152" width="166" height="14" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + [68, 120, 172].map(bx =>
          `<path d="M ${bx} 166 V 138 A 9 9 0 0 1 ${bx + 18} 138 V 166 Z" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.2"/>`
          + `<rect x="${bx + 3}" y="124" width="12" height="5" fill="${INK_DARK}" fill-opacity="0.68"/>`,
        ).join('')
        + `<polygon points="40,118 56,92 202,92 218,118" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Three iconic raised pitched ventilation lantern clerestories along granary roof
        + [78, 129, 180].map(vx =>
          `<rect x="${vx - 12}" y="80" width="24" height="12" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.1"/>`
          + `<polygon points="${vx - 15},80 ${vx},70 ${vx + 15},80" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.1"/>`
          + `<line x1="${vx - 7}" y1="86" x2="${vx + 7}" y2="86" stroke="${INK_DARK}" stroke-width="1"/>`,
        ).join('')
        // Right two-story Canal Customs Checkpoint Tower (Chaoguan)
        + `<rect x="220" y="118" width="82" height="48" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 248 166 V 140 A 13 13 0 0 1 274 140 V 166 Z" fill="${INK_DARK}" fill-opacity="0.8" stroke="${IVORY}" stroke-width="1.2"/>`
        + drawColonnade(226, 86, 70, 32, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawXieshanRoof(261, 56, 48, 86, 30, secondary, INK_DARK, GOLD)
        // Moored flat-bottomed Imperial Tribute Grain Barge in foreground canal
        + `<polygon points="116,178 206,178 196,188 126,188" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 136 178 Q 161 162 186 178 Z" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<line x1="162" y1="130" x2="162" y2="178" stroke="${INK_DARK}" stroke-width="1.8"/>`
        + `<polygon points="163,134 188,144 184,162 163,162" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<polygon points="162,130 174,133 162,136" fill="${secondary}"/>`
      );

    // 64. 喀斯特天眼射电望远镜巨阵
    case 'karst_radio_telescope':
      return (
        // Natural karst peak-cluster crater depression flanking the giant dish
        `<polygon points="32,184 44,104 68,128 90,86 118,136 126,184" fill="${primary}" fill-opacity="0.24" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="234,184 244,134 274,84 294,122 316,102 328,184" fill="${primary}" fill-opacity="0.24" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="266" y="138" width="44" height="8" rx="1" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Six peripheral steel feed-cabin support lattice towers
        + [
          { x: 68, top: 72, base: 146 },
          { x: 104, top: 60, base: 134 },
          { x: 140, top: 56, base: 128 },
          { x: 220, top: 56, base: 128 },
          { x: 256, top: 60, base: 134 },
          { x: 292, top: 72, base: 146 },
        ].map(t =>
          `<line x1="${t.x - 3}" y1="${t.base}" x2="${t.x}" y2="${t.top}" stroke="${INK_MID}" stroke-width="1.5"/>`
          + `<line x1="${t.x + 3}" y1="${t.base}" x2="${t.x}" y2="${t.top}" stroke="${INK_MID}" stroke-width="1.5"/>`
          + `<circle cx="${t.x}" cy="${t.top}" r="2" fill="${TERRACOTTA}"/>`
          + `<line x1="${t.x}" y1="${t.top}" x2="180" y2="75" stroke="${INK_DARK}" stroke-opacity="0.54" stroke-width="1"/>`,
        ).join('')
        // Steel ring-truss piers supporting dish perimeter above Dawodang karst floor
        + [86, 114, 146, 214, 246, 274].map(px =>
          `<line x1="${px}" y1="140" x2="${px}" y2="184" stroke="${INK_MID}" stroke-width="1.8"/>`,
        ).join('')
        // Monumental 500m spherical parabolic reflector bowl & geodesic mesh lines
        + `<path d="M 76 126 Q 180 196 284 126 Z" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<ellipse cx="180" cy="126" rx="104" ry="27" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<ellipse cx="180" cy="127" rx="80" ry="20" fill="${primary}" fill-opacity="0.08" stroke="${primary}" stroke-opacity="0.42" stroke-width="1"/>`
        + `<ellipse cx="180" cy="128" rx="54" ry="13" fill="${primary}" fill-opacity="0.1" stroke="${primary}" stroke-opacity="0.46" stroke-width="1"/>`
        + `<ellipse cx="180" cy="129" rx="26" ry="6.5" fill="${primary}" fill-opacity="0.14" stroke="${primary}" stroke-opacity="0.52" stroke-width="1"/>`
        + [0, 30, 60, 90, 120, 150].map(deg => {
          const rad = (deg * Math.PI) / 180;
          const dx = Math.round(Math.cos(rad) * 102);
          const dy = Math.round(Math.sin(rad) * 26);
          return `<line x1="${180 - dx}" y1="${126 - dy}" x2="${180 + dx}" y2="${126 + dy}" stroke="${INK_MID}" stroke-opacity="0.22" stroke-width="0.9"/>`;
        }).join('')
        // Suspended central Feed Cabin & cosmic radio-signal arcs
        + `<polygon points="168,72 192,72 187,82 173,82" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<ellipse cx="180" cy="72" rx="12" ry="3.4" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<path d="M 164 56 Q 180 46 196 56" stroke="${GOLD}" stroke-opacity="0.65" stroke-width="1.2" stroke-dasharray="3 2"/>`
        + `<path d="M 156 48 Q 180 34 204 48" stroke="${primary}" stroke-opacity="0.45" stroke-width="1.1" stroke-dasharray="3 2"/>`
      );

    // 65. 石窟摩崖大佛与石刻造像龛群
    case 'grotto_cliff_buddha':
      return (
        // Stratified sculpted sandstone/limestone cliff massif
        `<path d="M 36 184 L 46 58 Q 88 38 132 42 Q 180 32 228 42 Q 272 38 314 58 L 324 184 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<line x1="46" y1="84" x2="128" y2="84" stroke="${secondary}" stroke-opacity="0.24" stroke-width="1.1"/>`
        + `<line x1="232" y1="84" x2="314" y2="84" stroke="${secondary}" stroke-opacity="0.24" stroke-width="1.1"/>`
        + `<line x1="40" y1="126" x2="122" y2="126" stroke="${secondary}" stroke-opacity="0.24" stroke-width="1.1"/>`
        + `<line x1="238" y1="126" x2="320" y2="126" stroke="${secondary}" stroke-opacity="0.24" stroke-width="1.1"/>`
        // Flanking upper & lower carved Buddha grotto niches
        + [76, 284].map(nx =>
          `<path d="M ${nx - 14} 112 V 82 A 14 14 0 0 1 ${nx + 14} 82 V 112 Z" fill="${INK_DARK}" fill-opacity="0.72" stroke="${STONE_DEEP}" stroke-width="1"/>`
          + `<circle cx="${nx}" cy="84" r="4" fill="${GOLD_LIGHT}"/>`
          + `<path d="M ${nx - 8} 110 Q ${nx} 90 ${nx + 8} 110 Z" fill="${GOLD_LIGHT}"/>`
          + `<path d="M ${nx - 16} 166 V 132 A 16 16 0 0 1 ${nx + 16} 132 V 166 Z" fill="${INK_DARK}" fill-opacity="0.76" stroke="${STONE_DEEP}" stroke-width="1"/>`
          + `<circle cx="${nx}" cy="136" r="4.5" fill="${GOLD}" fill-opacity="0.82"/>`
          + `<path d="M ${nx - 10} 164 Q ${nx} 142 ${nx + 10} 164 Z" fill="${GOLD_LIGHT}"/>`,
        ).join('')
        // Central monumental arched cave niche housing Cliff Buddha
        + `<path d="M 130 184 V 96 A 50 48 0 0 1 230 96 V 184 Z" fill="${INK_DARK}" fill-opacity="0.82" stroke="${INK_DARK}" stroke-width="1.5"/>`
        // Mandorla & head halo
        + `<ellipse cx="180" cy="112" rx="34" ry="44" fill="${GOLD}" fill-opacity="0.18" stroke="${GOLD}" stroke-width="1.1"/>`
        + `<circle cx="180" cy="76" r="18" fill="${GOLD}" fill-opacity="0.34" stroke="${GOLD}" stroke-width="1.3"/>`
        // Monumental carved Seated Buddha silhouette with draped Kasaya folds
        + `<circle cx="180" cy="64" r="4.8" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<ellipse cx="180" cy="76" rx="9" ry="11" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 148 134 Q 152 94 180 92 Q 208 94 212 134 L 222 152 H 138 Z" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 164 96 Q 180 116 198 100 M 156 112 Q 180 128 204 116 M 150 128 Q 180 140 208 130" stroke="${TERRACOTTA}" stroke-opacity="0.65" stroke-width="1.2"/>`
        + `<path d="M 138 152 Q 180 142 222 152 Q 214 162 180 162 Q 146 162 138 152 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Multi-tiered Lotus Pedestal & forecourt incense cauldron
        + `<polygon points="136,162 224,162 216,174 144,174" fill="${primary}" fill-opacity="0.46" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="132" y="174" width="96" height="10" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="171" y="174" width="18" height="10" rx="2" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1"/>`
        // Timber rock-cut shelter eave crowning central cliff cave
        + drawChineseEaveTier(cx, 28, 76, 114, 16, primary, INK_DARK, GOLD, 4.5)
        + drawTreeAccent(48, 184, 'cypress', 1.1, primary)
        + drawTreeAccent(312, 184, 'cypress', 1.05, primary)
      );

    // 66. 古法阶梯龙窑、匣钵墙与青花瓷坊
    case 'porcelain_dragon_kiln':
      return (
        // Sloping wooded mountain kiln hill rising on left
        `<path d="M 32 184 L 46 84 Q 112 72 178 124 L 236 168 L 236 184 Z" fill="${primary}" fill-opacity="0.14" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Tall brick Dragon-Kiln chimney stack with smoke wisps at upper tail
        + `<polygon points="56,94 61,32 75,32 80,94" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="59" y="40" width="18" height="5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<path d="M 68 28 Q 76 19 66 11" stroke="${primary}" stroke-opacity="0.38" stroke-width="1.6" stroke-linecap="round"/>`
        // Stepped climbing Dragon Kiln chambers & overlapping protective tile canopies
        + [0, 1, 2, 3].map(step => {
          const kx = 74 + step * 30;
          const ky = 84 + step * 19;
          return (
            `<rect x="${kx}" y="${ky + 8}" width="32" height="22" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
            + `<path d="M ${kx + 9} ${ky + 30} V ${ky + 18} A 7 7 0 0 1 ${kx + 23} ${ky + 18} V ${ky + 30} Z" fill="${GOLD}" fill-opacity="0.72" stroke="${TERRACOTTA}" stroke-width="1.2"/>`
            + `<polygon points="${kx - 4},${ky + 10} ${kx + 16},${ky} ${kx + 36},${ky + 10}" fill="${step % 2 === 0 ? primary : secondary}" stroke="${INK_DARK}" stroke-width="1.2"/>`
          );
        }).join('')
        // Iconic Jingdezhen Saggar Wall (匣钵墙) of stacked cylindrical clay saggars on lower-left
        + `<rect x="40" y="176" width="60" height="8" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + [46, 63, 80].map(sx =>
          [166, 156, 146, 136].map((sy, r) =>
            `<rect x="${sx}" y="${sy}" width="13" height="9" rx="2" fill="${r % 2 === 0 ? STONE : GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="0.9"/>`,
          ).join(''),
        ).join('')
        // Right foreground Qinghua Porcelain Workshop Pavilion
        + `<rect x="192" y="172" width="108" height="12" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawColonnade(198, 134, 96, 38, 4, IVORY, TERRACOTTA, INK_DARK)
        + drawXieshanRoof(246, 98, 66, 118, 36, primary, INK_DARK, GOLD)
        // Sculptural Blue-and-White Meiping Porcelain Vase on foreground stone plinth
        + `<rect x="302" y="168" width="24" height="16" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<path d="M 308 168 Q 302 150 306 138 Q 310 132 310 128 H 318 Q 318 132 322 138 Q 326 150 320 168 Z" fill="${IVORY}" stroke="${primary}" stroke-width="1.5"/>`
        + `<line x1="305" y1="144" x2="323" y2="144" stroke="${primary}" stroke-width="1.6"/>`
        + `<circle cx="314" cy="154" r="3" fill="${primary}" fill-opacity="0.65"/>`
      );

    // 67. 千年竹笕天车盐井架与卤水晒盐池
    case 'salt_well_derrick':
      return (
        // Left Timber Winding Drum House (牛车绞盘屋)
        `<rect x="44" y="172" width="56" height="12" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawColonnade(48, 144, 48, 28, 2, IVORY, TERRACOTTA, INK_DARK)
        + `<polygon points="40,144 72,116 104,144" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Center-left towering Zigong Bamboo-Hooped Timber Salt-Well Derrick (天车井架)
        + `<rect x="114" y="168" width="58" height="16" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<ellipse cx="143" cy="168" rx="16" ry="4.2" fill="${INK_DARK}" fill-opacity="0.72"/>`
        + `<line x1="122" y1="168" x2="138" y2="30" stroke="${TERRACOTTA}" stroke-width="3.2"/>`
        + `<line x1="164" y1="168" x2="148" y2="30" stroke="${TERRACOTTA}" stroke-width="3.2"/>`
        + `<line x1="143" y1="168" x2="143" y2="30" stroke="${INK_DARK}" stroke-width="1.6"/>`
        // Horizontal bamboo binding collars & diagonal X-bracing struts
        + [54, 74, 94, 114, 134, 152].map((hy, idx) => {
          const halfW = 7 + idx * 2.4;
          return (
            `<line x1="${143 - halfW}" y1="${hy}" x2="${143 + halfW}" y2="${hy}" stroke="${GOLD}" stroke-width="2.2"/>`
            + `<line x1="${143 - halfW}" y1="${hy}" x2="${143 + halfW + 2}" y2="${hy + 16}" stroke="${INK_DARK}" stroke-opacity="0.52" stroke-width="0.9"/>`
            + `<line x1="${143 + halfW}" y1="${hy}" x2="${143 - halfW - 2}" y2="${hy + 16}" stroke="${INK_DARK}" stroke-opacity="0.52" stroke-width="0.9"/>`
          );
        }).join('')
        // Crown pulley wheel & taut haulage cable to winding house
        + `<circle cx="143" cy="28" r="7" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="138" y1="30" x2="86" y2="146" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Elevated Bamboo Brine Pipelines (竹笕) on forked trestles to boiling workshop
        + `<line x1="152" y1="110" x2="232" y2="124" stroke="${GOLD}" stroke-width="2.6"/>`
        + `<line x1="152" y1="115" x2="232" y2="129" stroke="${TERRACOTTA}" stroke-width="2"/>`
        + `<line x1="184" y1="116" x2="180" y2="168" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<line x1="212" y1="121" x2="216" y2="168" stroke="${INK_DARK}" stroke-width="1.5"/>`
        // Salt-boiling pan workshop & steam vents on back-right
        + drawColonnade(226, 128, 82, 34, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(267, 110, 62, 96, 18, primary, INK_DARK, GOLD, 4)
        // Stepped geometric Brine Evaporation Salt Pans & gleaming white salt crystal mounds
        + `<polygon points="184,184 202,164 318,164 328,184" fill="${primary}" fill-opacity="0.24" stroke="${IVORY}" stroke-width="1.4"/>`
        + `<line x1="226" y1="164" x2="220" y2="184" stroke="${IVORY}" stroke-width="1.5"/>`
        + `<line x1="274" y1="164" x2="278" y2="184" stroke="${IVORY}" stroke-width="1.5"/>`
        + `<polygon points="236,178 248,164 260,178" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<polygon points="284,178 298,162 312,178" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
      );

    // 68. 高山云海层叠梯田与观景挑檐阁
    case 'terraced_rice_pavilion':
      return (
        // Sweeping stacked contoured mountain rice terraces alternating water-mirror & golden harvest
        `<path d="M 28 184 L 34 78 Q 112 66 196 86 Q 268 102 332 82 L 332 184 Z" fill="${primary}" fill-opacity="0.16" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<path d="M 28 184 L 28 98 Q 108 82 192 104 Q 272 122 332 100 L 332 184 Z" fill="${GOLD}" fill-opacity="0.26" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<path d="M 28 184 L 28 118 Q 114 102 204 126 Q 278 142 332 120 L 332 184 Z" fill="${primary}" fill-opacity="0.24" stroke="${IVORY}" stroke-width="1.4"/>`
        + `<path d="M 28 184 L 28 138 Q 118 124 214 146 Q 282 160 332 142 L 332 184 Z" fill="${GOLD}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<path d="M 28 184 L 28 158 Q 124 146 224 166 Q 284 176 332 162 L 332 184 Z" fill="${primary}" fill-opacity="0.28" stroke="${IVORY}" stroke-width="1.4"/>`
        + `<path d="M 28 184 L 28 174 Q 148 164 248 178 Q 294 184 332 176 L 332 184 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Drifting morning sea-of-clouds mist ribbons
        + `<path d="M 48 106 Q 108 98 168 106 Q 122 114 58 112 Z" fill="${IVORY}" fill-opacity="0.82"/>`
        + `<path d="M 152 122 Q 214 114 276 122 Q 228 130 164 128 Z" fill="${IVORY}" fill-opacity="0.72"/>`
        // Traditional Hani/Yao mushroom-roof terraced village house on lower-left terrace
        + `<rect x="52" y="138" width="44" height="24" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<path d="M 44 140 Q 74 114 104 140 Z" fill="${GOLD}" fill-opacity="0.82" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="68" y="146" width="12" height="16" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1"/>`
        // Upper-right Cantilevered Terrace Viewing Pavilion overlooking the valley
        + [220, 240, 260, 280].map(px => `<line x1="${px}" y1="94" x2="${px}" y2="118" stroke="${TERRACOTTA}" stroke-width="2.4"/>`).join('')
        + `<rect x="208" y="92" width="84" height="6" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawStoneBalustrade(210, 84, 80, 8, 8, IVORY)
        + drawColonnade(222, 62, 56, 22, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawXieshanRoof(250, 36, 40, 82, 26, primary, INK_DARK, GOLD)
        + drawTreeAccent(314, 184, 'bamboo', 1.15, primary)
      );

    // 69. 古代观星台圭表砖筑高台与浑仪阁
    case 'ancient_star_observatory':
      return (
        // Subtle astronomical star-constellation lines in upper-right sky
        `<path d="M 222 44 L 248 34 L 274 42 L 298 30" stroke="${GOLD}" stroke-opacity="0.48" stroke-width="1.1" stroke-dasharray="3 2"/>`
        + [
          { x: 222, y: 44 },
          { x: 248, y: 34 },
          { x: 274, y: 42 },
          { x: 298, y: 30 },
        ].map(s => `<circle cx="${s.x}" cy="${s.y}" r="2.2" fill="${GOLD}"/>`).join('')
        // Iconic Gaocheng-style battered brick Star Observatory Platform (观星台)
        + `<polygon points="56,184 78,76 164,76 186,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + [104, 130, 156].map(ly => `<line x1="72" y1="${ly}" x2="170" y2="${ly}" stroke="${INK_MID}" stroke-opacity="0.28" stroke-width="1"/>`).join('')
        + drawStoneBalustrade(76, 68, 90, 8, 8, IVORY)
        // Twin top shadow-measuring observation chambers flanking central vertical gnomon notch
        + `<rect x="82" y="48" width="24" height="20" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<polygon points="79,48 94,36 109,48" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="136" y="48" width="24" height="20" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<polygon points="133,48 148,36 163,48" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Deep central vertical gnomon shadow-slot & horizontal cross-bar
        + `<rect x="114" y="68" width="14" height="116" fill="${INK_DARK}" fill-opacity="0.8" stroke="${GOLD}" stroke-width="1.2"/>`
        + `<line x1="108" y1="84" x2="134" y2="84" stroke="${GOLD}" stroke-width="2.4"/>`
        // Long horizontal calibrated stone Shigui Sun-Shadow Ruler (量天圭尺)
        + `<rect x="120" y="172" width="182" height="12" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="124" y1="178" x2="298" y2="178" stroke="${primary}" stroke-width="1.6"/>`
        + Array.from({ length: 12 }, (_, i) => `<line x1="${136 + i * 14}" y1="172" x2="${136 + i * 14}" y2="176" stroke="${INK_DARK}" stroke-width="1"/>`).join('')
        // Bronze Armillary Sphere (浑天仪) on stepped stone altar on right
        + `<rect x="234" y="152" width="60" height="20" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="248,152 256,134 272,134 280,152" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<circle cx="264" cy="108" r="24" fill="none" stroke="${GOLD}" stroke-width="2.4"/>`
        + `<ellipse cx="264" cy="108" rx="24" ry="8.5" transform="rotate(-28 264 108)" fill="none" stroke="${primary}" stroke-width="1.8"/>`
        + `<ellipse cx="264" cy="108" rx="24" ry="8.5" transform="rotate(28 264 108)" fill="none" stroke="${GOLD}" stroke-width="1.8"/>`
        + `<line x1="244" y1="126" x2="284" y2="90" stroke="${INK_DARK}" stroke-width="2.2" stroke-linecap="round"/>`
      );

    // 70. 红色革命圣地青砖坡顶会址与纪念碑廊
    case 'red_revolution_memorial':
      return (
        // Left-center Historic Two-Story Blue-Brick Revolutionary Congress Hall (青砖坡顶会址楼)
        `<rect x="44" y="170" width="168" height="14" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="52" y="110" width="152" height="60" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [64, 92, 120, 148, 176].map(ax =>
          `<path d="M ${ax} 170 V 148 A 8 8 0 0 1 ${ax + 16} 148 V 170 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
          + `<path d="M ${ax + 2} 134 V 120 A 6 6 0 0 1 ${ax + 14} 120 V 134 Z" fill="${TERRACOTTA}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1"/>`,
        ).join('')
        + drawStoneBalustrade(52, 134, 152, 6, 12, IVORY)
        // Pitched tile roof & central triangular pediment with Crimson Five-Pointed Star
        + `<polygon points="44,110 64,84 192,84 212,110" fill="${INK_MID}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="108,110 128,74 148,110" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<circle cx="128" cy="96" r="8" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1.1"/>`
        + `<polygon points="128,90 130,94 134,94 131,97 132,101 128,99 124,101 125,97 122,94 126,94" fill="${GOLD}"/>`
        // Right-center Monumental Granite Obelisk Stele & Memorial Colonnade Screen Wall
        + `<rect x="220" y="166" width="96" height="18" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="226" y="138" width="84" height="28" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + [238, 254, 282, 298].map(px => `<line x1="${px}" y1="138" x2="${px}" y2="166" stroke="${INK_MID}" stroke-width="1.8"/>`).join('')
        + `<polygon points="256,166 260,44 268,28 276,44 280,166" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="264" y="64" width="8" height="58" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="0.9"/>`
        + drawTreeAccent(36, 184, 'cypress', 1.15, primary)
        + drawTreeAccent(320, 184, 'cypress', 1.2, primary)
      );

    // 71. 高山峡谷双曲特高拱坝与泄洪升船枢纽
    case 'hydroelectric_arch_dam':
      return (
        // Steep V-shaped river gorge cliffs flanking the arch dam
        `<polygon points="24,184 24,54 78,68 102,134 92,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="336,184 336,52 282,66 258,134 268,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="36" y1="88" x2="82" y2="108" stroke="${INK_MID}" stroke-opacity="0.34" stroke-width="1.1"/>`
        + `<line x1="278" y1="108" x2="324" y2="88" stroke="${INK_MID}" stroke-opacity="0.34" stroke-width="1.1"/>`
        // Left ridge steel hydropower transmission pylon
        + `<polygon points="44,62 50,28 56,28 62,62" fill="none" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="40" y1="38" x2="66" y2="38" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="38" y1="48" x2="68" y2="48" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Reservoir water gleaming behind curved crest
        + `<path d="M 76 80 Q 166 70 256 80 L 256 94 Q 166 84 76 94 Z" fill="${primary}" fill-opacity="0.32"/>`
        // Double-Curved Concrete Arch Dam Face & vertical monolith ribs
        + `<path d="M 68 82 Q 166 104 264 82 L 246 174 Q 166 184 86 174 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + [106, 136, 166, 196, 226].map(dx => {
          const botX = 166 + (dx - 166) * 0.85;
          return `<path d="M ${dx} 92 Q ${(dx + botX) / 2} 134 ${botX} 176" stroke="${STONE_DEEP}" stroke-width="1.2"/>`;
        }).join('')
        + `<path d="M 68 82 Q 166 104 264 82" stroke="${INK_DARK}" stroke-width="2.6"/>`
        // Active deep-hole spillway jets plunging into foamy spray clouds
        + [118, 142, 166, 190, 214].map(sx =>
          `<rect x="${sx - 4}" y="108" width="8" height="7" fill="${INK_DARK}" fill-opacity="0.82"/>`
          + `<path d="M ${sx - 3} 115 Q ${sx} 148 ${sx - 6} 174 H ${sx + 8} Q ${sx + 4} 148 ${sx + 3} 115 Z" fill="${primary}" fill-opacity="0.28"/>`
          + `<path d="M ${sx} 115 Q ${sx + 2} 146 ${sx} 172" stroke="${IVORY}" stroke-width="2.4" stroke-linecap="round"/>`
          + `<ellipse cx="${sx}" cy="176" rx="12" ry="5.5" fill="${IVORY}" fill-opacity="0.92" stroke="${primary}" stroke-opacity="0.4" stroke-width="1"/>`,
        ).join('')
        // Right abutment Vertical Ship-Lift Tower Hub (垂直升船机枢纽)
        + `<rect x="260" y="72" width="12" height="112" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="284" y="72" width="12" height="112" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="256" y="64" width="44" height="10" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="272" y="114" width="12" height="18" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
      );

    // 72. 中欧班列内陆陆港龙门吊与国门联检楼
    case 'inland_dryport_railhub':
      return (
        // Left-center Monumental National Border Gate & Joint-Inspection Archway (国门联检楼)
        `<rect x="44" y="98" width="38" height="86" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="144" y="98" width="38" height="86" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [110, 128, 146].map(wy =>
          `<rect x="52" y="${wy}" width="22" height="8" fill="${primary}" fill-opacity="0.34"/>`
          + `<rect x="152" y="${wy}" width="22" height="8" fill="${primary}" fill-opacity="0.34"/>`,
        ).join('')
        + `<rect x="38" y="60" width="150" height="38" rx="2" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="44" y="67" width="138" height="24" fill="${IVORY}" fill-opacity="0.92"/>`
        + `<polygon points="34,60 52,48 174,48 192,60" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<circle cx="113" cy="79" r="8.5" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1.6"/>`
        + `<circle cx="113" cy="79" r="3.5" fill="${GOLD}"/>`
        // Right-center Intermodal Container Yard & Rail-Mounted Portal Gantry Crane (龙门吊)
        + `<line x1="208" y1="184" x2="218" y2="56" stroke="${TERRACOTTA}" stroke-width="3.2"/>`
        + `<line x1="226" y1="184" x2="220" y2="56" stroke="${TERRACOTTA}" stroke-width="2.2"/>`
        + `<line x1="308" y1="184" x2="300" y2="56" stroke="${TERRACOTTA}" stroke-width="3.2"/>`
        + `<line x1="292" y1="184" x2="298" y2="56" stroke="${TERRACOTTA}" stroke-width="2.2"/>`
        + `<rect x="196" y="45" width="128" height="11" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="252" y="56" width="18" height="7" fill="${INK_DARK}"/>`
        + `<line x1="256" y1="63" x2="256" y2="84" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<line x1="266" y1="63" x2="266" y2="84" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="240" y="84" width="42" height="18" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Ground stacked TEU shipping containers
        + `<rect x="224" y="148" width="42" height="16" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="268" y="148" width="42" height="16" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="246" y="132" width="42" height="16" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // China-Europe Railway Express (中欧班列) freight locomotive & container cars emerging through Gate
        + `<line x1="32" y1="182" x2="328" y2="182" stroke="${INK_DARK}" stroke-width="2"/>`
        + `<rect x="86" y="156" width="38" height="22" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="126" y="156" width="24" height="22" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<path d="M 152 178 V 148 H 184 L 198 164 V 178 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="152" y1="168" x2="197" y2="168" stroke="${TERRACOTTA}" stroke-width="3"/>`
        + `<polygon points="180,152 186,152 193,162 180,162" fill="${primary}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="0.9"/>`
      );

    // 73. 古驿道鸡鸣驿城楼与车辙石街
    case 'ancient_post_station':
      return (
        // Left courier post-office courtyard wall & saddle-roofed gatehouse (驿丞署门楼)
        `<rect x="44" y="132" width="88" height="52" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="58" y="106" width="58" height="26" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="48,108 87,84 126,108" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 74 184 V 154 A 13 12 0 0 1 100 154 V 184 Z" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="87" y1="142" x2="87" y2="184" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Wooden post-carriage wheel & stone hitching post (栓马桩)
        + `<circle cx="56" cy="172" r="10" fill="none" stroke="${INK_DARK}" stroke-width="1.8"/>`
        + `<circle cx="56" cy="172" r="2.5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<line x1="46" y1="172" x2="66" y2="172" stroke="${INK_MID}" stroke-width="1"/>`
        + `<line x1="56" y1="162" x2="56" y2="182" stroke="${INK_MID}" stroke-width="1"/>`
        + `<rect x="114" y="156" width="6" height="28" rx="1" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Tall courier signal banner pole & swallowtail post pennant
        + `<line x1="132" y1="64" x2="132" y2="184" stroke="${INK_DARK}" stroke-width="2"/>`
        + `<polygon points="132,66 162,72 153,78 162,84 132,88" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1"/>`
        // Center-right Jiming-style ancient post-station fortified city wall & drum gate tower
        + `<polygon points="150,184 162,118 268,118 280,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + [164, 180, 196, 212, 228, 244, 260].map(bx =>
          `<rect x="${bx}" y="110" width="9" height="8" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1"/>`,
        ).join('')
        + `<path d="M 188 184 V 146 A 18 16 0 0 1 224 146 V 184 Z" fill="${INK_DARK}" fill-opacity="0.82" stroke="${IVORY}" stroke-width="1.3"/>`
        + `<circle cx="206" cy="140" r="4" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1"/>`
        // Upper timber post-station drum tower & Xieshan roof
        + drawColonnade(176, 82, 78, 28, 4, IVORY, TERRACOTTA, INK_DARK)
        + drawDougongRow(174, 78, 82, 8, GOLD)
        + drawXieshanRoof(215, 48, 56, 114, 30, primary, INK_DARK, GOLD)
        + `<rect x="206" y="86" width="18" height="8" rx="1" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        // Sweeping perspective flagstone post road with twin carved wheel ruts (车辙石街)
        + `<polygon points="98,184 190,148 222,148 256,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 134 184 Q 168 167 198 149" stroke="${INK_MID}" stroke-opacity="0.68" stroke-width="2.2" stroke-linecap="round"/>`
        + `<path d="M 192 184 Q 207 167 215 149" stroke="${INK_MID}" stroke-opacity="0.68" stroke-width="2.2" stroke-linecap="round"/>`
        + [158, 168, 177].map((sy, idx) =>
          `<line x1="${164 - idx * 20}" y1="${sy}" x2="${232 + idx * 8}" y2="${sy}" stroke="${INK_MID}" stroke-opacity="0.32" stroke-width="1"/>`,
        ).join('')
        // Courier distance milestone stele & ancient cypress on right
        + `<rect x="288" y="148" width="14" height="36" rx="2" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<line x1="295" y1="155" x2="295" y2="174" stroke="${TERRACOTTA}" stroke-width="1.5"/>`
        + drawTreeAccent(320, 184, 'cypress', 1.15, primary)
      );

    // 74. 江南岭南水乡河埠廊棚与乌篷船市
    case 'floating_water_market':
      return (
        // Background whitewashed Jiangnan/Lingnan gable shopfronts behind canal veranda
        `<rect x="42" y="92" width="60" height="38" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="38,92 72,72 106,92" fill="${INK_MID}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="104" y="84" width="68" height="46" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="100,84 138,64 176,84" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Stone canal quay & stepped waterside boat-landing stairs (河埠头)
        + `<rect x="34" y="166" width="184" height="18" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="118" y="170" width="38" height="4" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<rect x="122" y="175" width="38" height="4" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<rect x="126" y="180" width="38" height="4" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        // Waterside Covered Corridor Market (烟雨廊棚) with timber colonnade & market pennants
        + `<rect x="38" y="124" width="176" height="42" fill="${STONE}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + [46, 78, 110, 142, 174, 206].map(px =>
          `<line x1="${px}" y1="124" x2="${px}" y2="166" stroke="${TERRACOTTA}" stroke-width="2.6"/>`,
        ).join('')
        + `<polygon points="32,124 44,104 214,104 224,124" fill="${INK_MID}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Hanging red market lanterns & shop banners along covered veranda
        + [62, 94, 126, 158, 190].map((lx, idx) =>
          `<line x1="${lx}" y1="124" x2="${lx}" y2="131" stroke="${INK_DARK}" stroke-width="0.9"/>`
          + `<ellipse cx="${lx}" cy="135" rx="3.5" ry="4.6" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="0.9"/>`
          + (idx % 2 === 0 ? `<rect x="${lx + 9}" y="127" width="8" height="18" rx="1" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.8"/>` : ''),
        ).join('')
        // Single-arch stone humpback canal bridge on right
        + `<path d="M 206 168 Q 261 116 316 168 L 316 184 H 294 A 33 32 0 0 0 228 184 H 206 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 226 184 A 35 34 0 0 1 296 184" stroke="${INK_MID}" stroke-width="2" fill="none"/>`
        + `<path d="M 208 162 Q 261 110 314 162" stroke="${IVORY}" stroke-width="2" fill="none"/>`
        + drawTreeAccent(322, 184, 'willow', 1.24, primary)
        // Flotilla of 3 black-awning Wupeng market boats in foreground canal
        + `<polygon points="44,178 104,178 96,185 52,185" fill="${INK_DARK}"/>`
        + `<path d="M 58 178 Q 74 163 90 178 Z" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<circle cx="51" cy="175" r="3.4" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.8"/>`
        + `<circle cx="97" cy="174" r="2.6" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="0.8"/>`
        + `<polygon points="122,180 192,180 183,187 131,187" fill="${INK_DARK}"/>`
        + `<path d="M 140 180 Q 158 164 176 180 Z" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="128" y="173" width="6" height="7" rx="1" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="0.8"/>`
        + `<line x1="184" y1="168" x2="198" y2="186" stroke="${INK_DARK}" stroke-width="1.4" stroke-linecap="round"/>`
        + `<polygon points="236,179 288,179 282,185 242,185" fill="${INK_DARK}"/>`
        + `<path d="M 248 179 Q 262 167 276 179 Z" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1"/>`
      );

    // 75. 沙戈荒风光储氢大基地定日镜塔与风机阵列
    case 'wind_solar_storage_base':
      return (
        // Three staggered giant desert wind turbines on left-center horizon
        [
          { x: 58, yTop: 62, yBase: 174, r: 28, phase: -20 },
          { x: 104, yTop: 76, yBase: 170, r: 24, phase: 22 },
          { x: 144, yTop: 92, yBase: 166, r: 20, phase: 55 },
        ].map(t => {
          const blades = [0, 120, 240].map(deg => {
            const rad = ((deg + t.phase) * Math.PI) / 180;
            const bx = Math.round(t.x + Math.cos(rad) * t.r);
            const by = Math.round(t.yTop + Math.sin(rad) * t.r);
            return `<line x1="${t.x}" y1="${t.yTop}" x2="${bx}" y2="${by}" stroke="${INK_DARK}" stroke-width="2" stroke-linecap="round"/>`
              + `<line x1="${t.x}" y1="${t.yTop}" x2="${bx}" y2="${by}" stroke="${IVORY}" stroke-width="1.1" stroke-linecap="round"/>`;
          }).join('');
          return (
            `<polygon points="${t.x - 3},${t.yBase} ${t.x - 1.2},${t.yTop} ${t.x + 1.2},${t.yTop} ${t.x + 3},${t.yBase}" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
            + blades
            + `<circle cx="${t.x}" cy="${t.yTop}" r="3" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.1"/>`
          );
        }).join('')
        // Molten-salt Concentrated Solar Power (CSP) tower with glowing solar crown
        + `<circle cx="196" cy="53" r="22" fill="${GOLD}" fill-opacity="0.16"/>`
        + `<circle cx="196" cy="53" r="14" fill="${GOLD}" fill-opacity="0.28"/>`
        + `<polygon points="187,174 191,62 201,62 205,174" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="190" y="44" width="12" height="18" rx="1.5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Concentric desert heliostat mirror crescents around CSP tower
        + [154, 174, 218, 238].map(mx =>
          `<line x1="${mx}" y1="164" x2="${mx}" y2="152" stroke="${INK_MID}" stroke-width="1.2"/>`
          + `<polygon points="${mx - 8},150 ${mx + 8},148 ${mx + 6},156 ${mx - 10},158" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1"/>`,
        ).join('')
        // Foreground rows of tilted blue-teal PV photovoltaic solar arrays (光伏矩阵海)
        + [52, 88, 124, 160, 196].map(px =>
          `<line x1="${px + 14}" y1="176" x2="${px + 14}" y2="184" stroke="${INK_DARK}" stroke-width="1.4"/>`
          + `<polygon points="${px},176 ${px + 6},164 ${px + 32},164 ${px + 26},176" fill="${primary}" fill-opacity="0.64" stroke="${INK_DARK}" stroke-width="1.1"/>`
          + `<line x1="${px + 13}" y1="164" x2="${px + 19}" y2="176" stroke="${IVORY}" stroke-opacity="0.65" stroke-width="0.9"/>`,
        ).join('')
        // Right green-hydrogen spherical storage tanks, battery substation & UHV pylon
        + `<line x1="262" y1="158" x2="258" y2="172" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="278" y1="158" x2="282" y2="172" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<circle cx="270" cy="146" r="13" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="257" y1="146" x2="283" y2="146" stroke="${GOLD}" stroke-width="1.8"/>`
        + `<line x1="294" y1="158" x2="290" y2="172" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="310" y1="158" x2="314" y2="172" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<circle cx="302" cy="146" r="13" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="289" y1="146" x2="315" y2="146" stroke="${primary}" stroke-width="1.8"/>`
        + `<rect x="252" y="170" width="66" height="14" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<polygon points="318,170 322,98 326,98 330,170" fill="none" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<line x1="314" y1="112" x2="334" y2="112" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="312" y1="126" x2="336" y2="126" stroke="${INK_DARK}" stroke-width="1.3"/>`
      );

    // 76. 高山深谷古铁索桥与飞夺渡口桥亭
    case 'iron_chain_canyon_bridge':
      return (
        // Steep rocky gorge cliffs flanking deep canyon rapids
        `<polygon points="24,184 24,56 76,68 96,132 88,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<polygon points="336,184 336,52 284,66 264,132 272,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<line x1="34" y1="92" x2="82" y2="112" stroke="${INK_MID}" stroke-opacity="0.34" stroke-width="1.2"/>`
        + `<line x1="278" y1="110" x2="326" y2="90" stroke="${INK_MID}" stroke-opacity="0.34" stroke-width="1.2"/>`
        + drawTreeAccent(42, 108, 'cypress', 0.86, primary)
        + drawTreeAccent(318, 104, 'cypress', 0.86, primary)
        // Roaring canyon river whitewater waves below the bridge
        + `<path d="M 88 184 Q 118 168 148 178 Q 180 186 212 174 Q 242 166 272 184 Z" fill="${primary}" fill-opacity="0.28"/>`
        + `<path d="M 96 177 Q 124 167 152 177 T 208 177 T 264 177" stroke="${IVORY}" stroke-width="2" stroke-linecap="round"/>`
        // Twin masonry bridgehead towers with Xieshan bridge-gate pavilions
        + `<rect x="64" y="114" width="32" height="70" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 73 144 V 126 A 7 7 0 0 1 87 126 V 144 Z" fill="${INK_DARK}" fill-opacity="0.82"/>`
        + `<rect x="72" y="152" width="16" height="10" rx="1" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="0.9"/>`
        + drawColonnade(66, 94, 28, 20, 2, IVORY, TERRACOTTA, INK_DARK)
        + drawXieshanRoof(80, 74, 20, 44, 20, primary, INK_DARK, GOLD)
        + `<rect x="264" y="114" width="32" height="70" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 273 144 V 126 A 7 7 0 0 1 287 126 V 144 Z" fill="${INK_DARK}" fill-opacity="0.82"/>`
        + drawColonnade(266, 94, 28, 20, 2, IVORY, TERRACOTTA, INK_DARK)
        + drawXieshanRoof(280, 74, 20, 44, 20, primary, INK_DARK, GOLD)
        // Catenary wrought-iron handrail chains & main bearing deck chains
        + `<path d="M 94 118 Q 180 140 266 118" stroke="${INK_DARK}" stroke-width="2.2"/>`
        + `<path d="M 94 123 Q 180 145 266 123" stroke="${INK_MID}" stroke-width="1.6"/>`
        + `<path d="M 94 138 Q 180 160 266 138" stroke="${INK_DARK}" stroke-width="2.8"/>`
        + `<path d="M 94 143 Q 180 165 266 143" stroke="${INK_MID}" stroke-width="2.2"/>`
        // Vertical suspender rods, wrought-iron link studs & wooden bridge planks
        + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => {
          const t = (i + 1) / 12;
          const x = Math.round(94 + t * 172);
          const sag = Math.round(4 * t * (1 - t) * 22);
          const yTop = 118 + sag;
          const yBot = 139 + sag;
          const hasPlank = i !== 5 && i !== 6;
          return (
            `<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yBot}" stroke="${INK_DARK}" stroke-width="1.1"/>`
            + `<circle cx="${x}" cy="${yTop}" r="1.7" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.6"/>`
            + (hasPlank ? `<rect x="${x - 5}" y="${yBot - 2}" width="10" height="4" rx="0.6" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="0.8"/>` : '')
          );
        }).join('')
      );

    // 77. 万亩翠竹林海与飞檐观涛阁
    case 'bamboo_sea_watchtower':
      return (
        // Rolling emerald bamboo-covered mountain waves in background
        `<path d="M 28 184 Q 82 114 146 136 T 254 124 T 332 138 L 332 184 Z" fill="${primary}" fill-opacity="0.22" stroke="${primary}" stroke-opacity="0.35" stroke-width="1.1"/>`
        + `<path d="M 28 184 Q 96 138 176 154 T 332 146 L 332 184 Z" fill="${primary}" fill-opacity="0.30"/>`
        // Dense clusters of articulated tall bamboo stalks & leaf sprays flanking hill
        + [
          { x: 42, h: 74 },
          { x: 56, h: 92 },
          { x: 70, h: 80 },
          { x: 86, h: 98 },
          { x: 102, h: 76 },
          { x: 258, h: 78 },
          { x: 274, h: 96 },
          { x: 290, h: 82 },
          { x: 304, h: 92 },
          { x: 318, h: 72 },
        ].map((b, idx) => {
          const yTop = 184 - b.h;
          const dir = idx % 2 === 0 ? -1 : 1;
          return (
            `<line x1="${b.x}" y1="184" x2="${b.x}" y2="${yTop}" stroke="${primary}" stroke-width="2.1" stroke-linecap="round"/>`
            + [0.3, 0.55, 0.8].map(f => {
              const ny = Math.round(184 - b.h * f);
              return `<line x1="${b.x - 2.5}" y1="${ny}" x2="${b.x + 2.5}" y2="${ny}" stroke="${INK_DARK}" stroke-width="1"/>`;
            }).join('')
            + `<path d="M ${b.x} ${yTop + 8} Q ${b.x + dir * 10} ${yTop + 2} ${b.x + dir * 14} ${yTop + 10}" stroke="${primary}" stroke-width="1.5" stroke-linecap="round"/>`
            + `<path d="M ${b.x} ${yTop + 18} Q ${b.x - dir * 9} ${yTop + 12} ${b.x - dir * 13} ${yTop + 20}" stroke="${primary}" stroke-width="1.4" stroke-linecap="round"/>`
          );
        }).join('')
        // Central stone hilltop viewing terrace & staircase
        + `<polygon points="116,184 124,156 236,156 244,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="164,184 170,156 190,156 196,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + drawStoneBalustrade(122, 148, 116, 8, 9, IVORY)
        // Soaring 3-tiered classical Watchtower rising above the bamboo sea (飞檐观涛阁)
        + drawColonnade(136, 120, 88, 28, 4, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(cx, 102, 82, 130, 18, primary, INK_DARK, GOLD, 5.5)
        + drawColonnade(146, 80, 68, 22, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(cx, 63, 62, 104, 17, secondary, INK_DARK, GOLD, 5)
        + drawColonnade(156, 44, 48, 19, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawDougongRow(154, 41, 52, 6, GOLD)
        + drawXieshanRoof(cx, 22, 32, 78, 20, primary, INK_DARK, GOLD)
        + `<line x1="180" y1="22" x2="180" y2="14" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"/>`
        + `<circle cx="180" cy="14" r="2.2" fill="${GOLD}"/>`
      );

    // 78. 茶马古道石牌坊、马帮驿店与古茶树台地
    case 'tea_horse_caravan_gate':
      return (
        // Left terraced ancient tea tree hillside (古茶树台地)
        `<path d="M 28 184 L 28 122 Q 74 112 126 134 L 144 184 Z" fill="${primary}" fill-opacity="0.16" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<path d="M 28 184 L 28 144 Q 76 134 128 156 L 136 184 Z" fill="${primary}" fill-opacity="0.24" stroke="${primary}" stroke-opacity="0.4" stroke-width="1"/>`
        // Gnarled ancient broad-crown Pu'er tea trees on upper terrace
        + [
          { x: 54, y: 124 },
          { x: 88, y: 132 },
        ].map(t =>
          `<path d="M ${t.x} ${t.y} Q ${t.x - 2} ${t.y - 12} ${t.x + 2} ${t.y - 20}" stroke="${INK_DARK}" stroke-width="2.4" stroke-linecap="round"/>`
          + `<ellipse cx="${t.x}" cy="${t.y - 24}" rx="15" ry="9" fill="${primary}" fill-opacity="0.78" stroke="${INK_DARK}" stroke-width="1.1"/>`
          + `<circle cx="${t.x - 6}" cy="${t.y - 26}" r="2" fill="${GOLD}"/>`
          + `<circle cx="${t.x + 5}" cy="${t.y - 23}" r="2" fill="${GOLD}"/>`,
        ).join('')
        // Flagstone Tea-Horse trail winding through stone archway
        + `<polygon points="56,184 134,154 176,154 210,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Center-left weathered carved stone Tea-Horse Archway (茶马古道石牌坊)
        + `<rect x="114" y="92" width="12" height="92" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="170" y="92" width="12" height="92" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="108" y="172" width="22" height="12" rx="3" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="166" y="172" width="22" height="12" rx="3" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="108" y="88" width="80" height="16" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="136" y="89" width="24" height="12" rx="1" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="0.9"/>`
        + drawXieshanRoof(148, 64, 44, 86, 24, primary, INK_DARK, GOLD)
        // Right timber Caravan Inn & Tea Warehouse (马帮驿店)
        + `<rect x="200" y="170" width="118" height="14" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawColonnade(204, 134, 110, 36, 4, IVORY, TERRACOTTA, INK_DARK)
        + drawColonnade(210, 106, 98, 28, 4, IVORY, TERRACOTTA, INK_DARK)
        + drawXieshanRoof(259, 74, 78, 126, 32, secondary, INK_DARK, GOLD)
        // Stacked circular Pu'er tea bales & hanging caravan lantern at inn doorway
        + `<circle cx="218" cy="162" r="7" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<circle cx="232" cy="162" r="7" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<circle cx="225" cy="151" r="6" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<line x1="258" y1="106" x2="258" y2="115" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<ellipse cx="258" cy="119" rx="3.8" ry="4.8" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="0.9"/>`
        // Stylized laden Tea-Caravan Pack-Horse silhouette stepping through archway
        + `<rect x="138" y="160" width="20" height="11" rx="3" fill="${INK_MID}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<polygon points="156,162 162,150 168,153 163,164" fill="${INK_MID}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="141" y="154" width="13" height="8" rx="1.5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<line x1="141" y1="171" x2="140" y2="184" stroke="${INK_DARK}" stroke-width="1.8" stroke-linecap="round"/>`
        + `<line x1="146" y1="171" x2="147" y2="184" stroke="${INK_DARK}" stroke-width="1.8" stroke-linecap="round"/>`
        + `<line x1="154" y1="171" x2="153" y2="184" stroke="${INK_DARK}" stroke-width="1.8" stroke-linecap="round"/>`
        + `<line x1="157" y1="171" x2="159" y2="184" stroke="${INK_DARK}" stroke-width="1.8" stroke-linecap="round"/>`
      );

    // 79. 滨海红树林湿地栈道与候鸟科研观测塔
    case 'mangrove_bird_boardwalk':
      return (
        // Flock of soaring migratory coastal egrets in sky
        [
          { x: 86, y: 58, s: 1 },
          { x: 112, y: 48, s: 1.15 },
          { x: 138, y: 64, s: 0.9 },
          { x: 158, y: 52, s: 1.05 },
          { x: 294, y: 60, s: 0.95 },
        ].map(b =>
          `<path d="M ${b.x - 10 * b.s} ${b.y + 3 * b.s} Q ${b.x - 4 * b.s} ${b.y - 5 * b.s} ${b.x} ${b.y} Q ${b.x + 4 * b.s} ${b.y - 5 * b.s} ${b.x + 10 * b.s} ${b.y + 3 * b.s}" stroke="${INK_DARK}" stroke-width="1.4" stroke-linecap="round"/>`,
        ).join('')
        // Tidal estuary sandbars & shallow lagoon water
        + `<ellipse cx="102" cy="176" rx="68" ry="8" fill="${primary}" fill-opacity="0.20"/>`
        + `<ellipse cx="268" cy="176" rx="58" ry="8" fill="${primary}" fill-opacity="0.22"/>`
        // Left & right coastal mangrove groves with arching stilt prop-roots
        + [
          { cx: 64, cy: 134, r: 22 },
          { cx: 100, cy: 142, r: 19 },
          { cx: 294, cy: 138, r: 21 },
        ].map(m => {
          const roots = [-14, -7, 0, 7, 14].map(dx =>
            `<path d="M ${m.cx + dx * 0.4} ${m.cy + 8} Q ${m.cx + dx * 1.1} ${m.cy + 24} ${m.cx + dx * 1.3} 180" stroke="${TERRACOTTA}" stroke-width="1.6" stroke-linecap="round"/>`,
          ).join('');
          return (
            roots
            + `<circle cx="${m.cx - 8}" cy="${m.cy - 2}" r="${m.r * 0.72}" fill="${primary}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1.1"/>`
            + `<circle cx="${m.cx + 9}" cy="${m.cy}" r="${m.r * 0.68}" fill="${primary}" fill-opacity="0.82" stroke="${INK_DARK}" stroke-width="1.1"/>`
            + `<circle cx="${m.cx}" cy="${m.cy - 10}" r="${m.r * 0.78}" fill="${primary}" fill-opacity="0.88" stroke="${INK_DARK}" stroke-width="1.2"/>`
          );
        }).join('')
        // Center-right Ecological Birdwatching & Research Tower (候鸟科研观测塔)
        + `<line x1="204" y1="184" x2="212" y2="104" stroke="${INK_DARK}" stroke-width="2.2"/>`
        + `<line x1="258" y1="184" x2="250" y2="104" stroke="${INK_DARK}" stroke-width="2.2"/>`
        + `<line x1="207" y1="158" x2="253" y2="122" stroke="${TERRACOTTA}" stroke-width="1.3"/>`
        + `<line x1="255" y1="158" x2="209" y2="122" stroke="${TERRACOTTA}" stroke-width="1.3"/>`
        + `<rect x="194" y="98" width="74" height="7" rx="1" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="202" y="72" width="58" height="26" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="208" y="78" width="46" height="8" fill="${INK_DARK}" fill-opacity="0.78"/>`
        + `<polygon points="188,72 231,52 274,72" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="231" y1="52" x2="231" y2="34" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<circle cx="231" cy="34" r="2.2" fill="${GOLD}"/>`
        // Zigzagging elevated timber boardwalk across tidal wetlands
        + [76, 102, 128, 154, 180, 206].map((wx, idx) =>
          `<line x1="${wx}" y1="${168 - idx * 2}" x2="${wx}" y2="184" stroke="${INK_DARK}" stroke-width="1.6"/>`,
        ).join('')
        + `<polygon points="56,184 128,162 214,154 214,160 132,169 72,184" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 60 176 L 128 154 L 214 146" stroke="${TERRACOTTA}" stroke-width="1.5"/>`
      );

    // 80. 现代商业航天发射塔架、导流槽与测控雷达天线
    case 'space_launch_gantry':
      return (
        // Left deep-space telemetry parabolic dish antenna & mission control bunker (测控雷达天线)
        `<rect x="40" y="154" width="58" height="30" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="48" y="160" width="42" height="7" fill="${primary}" fill-opacity="0.42" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<polygon points="62,154 66,130 74,130 78,154" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<path d="M 48 112 Q 68 140 94 122 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="70" y1="126" x2="82" y2="104" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<circle cx="82" cy="104" r="2.4" fill="${TERRACOTTA}"/>`
        // Flanking lattice lightning protection masts (避雷塔)
        + `<polygon points="110,164 114,44 118,44 122,164" fill="none" stroke="${INK_MID}" stroke-width="1.2"/>`
        + `<polygon points="234,164 238,44 242,44 246,164" fill="none" stroke="${INK_MID}" stroke-width="1.2"/>`
        // Center monumental steel umbilical launch gantry tower (发射塔架)
        + `<rect x="136" y="42" width="32" height="120" fill="${primary}" fill-opacity="0.14" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [62, 82, 102, 122, 142].map(gy =>
          `<line x1="136" y1="${gy}" x2="168" y2="${gy}" stroke="${INK_DARK}" stroke-width="1.2"/>`
          + `<line x1="136" y1="${gy - 20}" x2="168" y2="${gy}" stroke="${INK_MID}" stroke-opacity="0.56" stroke-width="1"/>`
          + `<line x1="168" y1="${gy - 20}" x2="136" y2="${gy}" stroke="${INK_MID}" stroke-opacity="0.56" stroke-width="1"/>`,
        ).join('')
        + `<rect x="132" y="34" width="44" height="8" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Swing-away umbilical service arms contacting the rocket
        + `<line x1="168" y1="68" x2="188" y2="68" stroke="${GOLD}" stroke-width="2.4"/>`
        + `<line x1="168" y1="94" x2="188" y2="94" stroke="${GOLD}" stroke-width="2.4"/>`
        + `<line x1="168" y1="122" x2="188" y2="122" stroke="${GOLD}" stroke-width="2.4"/>`
        // Multi-stage Launch Vehicle Rocket with twin strap-on boosters (运载火箭)
        + `<path d="M 188 58 Q 196 28 204 58 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="188" y="58" width="16" height="104" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="188" y="72" width="16" height="8" fill="${primary}"/>`
        + `<rect x="188" y="106" width="16" height="6" fill="${TERRACOTTA}"/>`
        + `<path d="M 180 112 Q 184 98 188 112 V 162 H 180 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<path d="M 204 112 Q 208 98 212 112 V 162 H 204 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Beveled concrete launch pad & recessed flame deflector trench (导流槽)
        + `<polygon points="118,184 128,162 232,162 242,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 164 184 V 168 H 214 V 184 Z" fill="${INK_DARK}" fill-opacity="0.82"/>`
        + `<ellipse cx="196" cy="176" rx="18" ry="5" fill="${GOLD}" fill-opacity="0.72"/>`
        + `<ellipse cx="182" cy="179" rx="12" ry="4" fill="${TERRACOTTA}" fill-opacity="0.58"/>`
        // Right Vertical Rocket Integration & Assembly Hall (总装厂房)
        + `<rect x="256" y="104" width="60" height="80" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="272" y="120" width="28" height="64" fill="${primary}" fill-opacity="0.26" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<line x1="286" y1="104" x2="286" y2="86" stroke="${INK_DARK}" stroke-width="1.5"/>`
      );

    // 81. 海滨晒盐方阵与雪白盐垛风车
    case 'coastal_salt_pan_pyramid':
      return (
        // Soaring coastal gulls over distant horizon sea band
        `<path d="M 142 54 Q 147 49 152 53 Q 157 49 162 54" stroke="${INK_DARK}" stroke-width="1.3" stroke-linecap="round"/>`
        + `<path d="M 226 48 Q 230 44 234 47 Q 238 44 242 48" stroke="${INK_DARK}" stroke-width="1.2" stroke-linecap="round"/>`
        // Terraced geometric coastal brine evaporation ponds (阶梯蒸发晒盐方阵)
        + `<polygon points="36,162 66,134 294,134 324,162" fill="${primary}" fill-opacity="0.16" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<polygon points="28,184 52,162 308,162 332,184" fill="${primary}" fill-opacity="0.24" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Brine pan subdivision dikes & shimmering mineral crystallization cells
        + `<polygon points="62,158 76,140 128,140 120,158" fill="${GOLD_LIGHT}" fill-opacity="0.52" stroke="${IVORY}" stroke-width="1.2"/>`
        + `<polygon points="134,158 140,140 206,140 208,158" fill="${primary}" fill-opacity="0.28" stroke="${IVORY}" stroke-width="1.2"/>`
        + `<polygon points="214,158 212,140 278,140 290,158" fill="${GOLD_LIGHT}" fill-opacity="0.46" stroke="${IVORY}" stroke-width="1.2"/>`
        + `<polygon points="44,180 60,166 134,166 126,180" fill="${primary}" fill-opacity="0.34" stroke="${IVORY}" stroke-width="1.3"/>`
        + `<polygon points="136,180 142,166 218,166 224,180" fill="${IVORY}" fill-opacity="0.62" stroke="${primary}" stroke-opacity="0.45" stroke-width="1.1"/>`
        + `<polygon points="228,180 222,166 296,166 312,180" fill="${primary}" fill-opacity="0.32" stroke="${IVORY}" stroke-width="1.3"/>`
        // Raised stone salt-pan causeway ridge
        + `<rect x="34" y="158" width="292" height="5" rx="1" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Left Wooden Brine-Pumping Salt Windmill (提卤木构风车)
        + `<polygon points="74,158 84,82 100,82 110,158" fill="${STONE}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="82" y1="106" x2="102" y2="106" stroke="${TERRACOTTA}" stroke-width="1.6"/>`
        + `<line x1="79" y1="130" x2="105" y2="130" stroke="${TERRACOTTA}" stroke-width="1.6"/>`
        + `<line x1="80" y1="106" x2="106" y2="156" stroke="${INK_MID}" stroke-width="1.1"/>`
        + `<line x1="104" y1="106" x2="78" y2="156" stroke="${INK_MID}" stroke-width="1.1"/>`
        + `<polygon points="80,82 92,66 104,82" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Four-sail bamboo-lattice windmill blades
        + [35, 125, 215, 305].map(deg => {
          const rad = (deg * Math.PI) / 180;
          const x2 = Math.round(92 + Math.cos(rad) * 34);
          const y2 = Math.round(78 + Math.sin(rad) * 34);
          const px = Math.round(-Math.sin(rad) * 6);
          const py = Math.round(Math.cos(rad) * 6);
          const x1 = Math.round(92 + Math.cos(rad) * 9);
          const y1 = Math.round(78 + Math.sin(rad) * 9);
          return (
            `<polygon points="${x1},${y1} ${x2},${y2} ${x2 + px},${y2 + py} ${x1 + px},${y1 + py}" fill="${IVORY}" fill-opacity="0.88" stroke="${GOLD}" stroke-width="1"/>`
            + `<line x1="92" y1="78" x2="${x2}" y2="${y2}" stroke="${INK_DARK}" stroke-width="1.7" stroke-linecap="round"/>`
          );
        }).join('')
        + `<circle cx="92" cy="78" r="4" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Brine chute trough feeding pans
        + `<line x1="102" y1="134" x2="136" y2="148" stroke="${TERRACOTTA}" stroke-width="2.4" stroke-linecap="round"/>`
        // Monumental faceted gleaming white Sea-Salt Crystal Pyramids (银白盐垛山阵)
        + `<polygon points="128,158 148,118 168,158" fill="#FFFFFF" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<polygon points="148,118 168,158 148,158" fill="${STONE}" fill-opacity="0.65"/>`
        + `<polygon points="156,158 190,90 226,158" fill="#FFFFFF" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="190,90 226,158 190,158" fill="${primary}" fill-opacity="0.16"/>`
        + `<line x1="190" y1="90" x2="190" y2="158" stroke="${INK_MID}" stroke-opacity="0.42" stroke-width="1.1"/>`
        + `<polygon points="214,158 242,106 270,158" fill="#FFFFFF" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="242,106 270,158 242,158" fill="${primary}" fill-opacity="0.18"/>`
        + `<line x1="242" y1="106" x2="242" y2="158" stroke="${INK_MID}" stroke-opacity="0.42" stroke-width="1"/>`
        // Right Salt Packing Shed & timber pier trestle
        + `<rect x="274" y="128" width="44" height="30" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="269,128 296,110 323,128" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="288" y="140" width="16" height="18" fill="${TERRACOTTA}" fill-opacity="0.82" stroke="${INK_DARK}" stroke-width="1"/>`
      );

    // 82. 绝壁悬空栈阁古寺
    case 'hanging_cliff_monastery':
      return (
        // Towering overhanging sheer cliff massif (恒山翠屏峰百米绝壁)
        `<path d="M 52 184 L 58 64 L 68 32 Q 180 18 292 34 L 306 72 L 302 184 Z" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        // Deep shadowed cliff-face overhang recess sheltering the hanging pavilions
        + `<path d="M 76 146 L 82 58 Q 180 44 278 60 L 284 146 Q 180 156 76 146 Z" fill="${INK_DARK}" fill-opacity="0.24"/>`
        // Horizontal sedimentary cliff strata lines
        + `<line x1="60" y1="86" x2="84" y2="82" stroke="${secondary}" stroke-opacity="0.34" stroke-width="1.2"/>`
        + `<line x1="276" y1="82" x2="302" y2="86" stroke="${secondary}" stroke-opacity="0.34" stroke-width="1.2"/>`
        + `<line x1="56" y1="154" x2="112" y2="148" stroke="${INK_MID}" stroke-opacity="0.32" stroke-width="1.2"/>`
        + `<line x1="248" y1="150" x2="302" y2="156" stroke="${INK_MID}" stroke-opacity="0.32" stroke-width="1.2"/>`
        // Iconic slender vertical & angled Ironwood Support Stilts embedded in sheer rock (铁杉立柱斜撑)
        + [90, 102, 114, 126, 138, 152, 166, 180, 194, 210, 224, 238, 252, 264].map((sx, idx) => {
          const topY = sx < 148 ? 124 : sx < 206 ? 114 : 126;
          const botY = 160 + (idx % 3) * 5;
          return (
            `<line x1="${sx}" y1="${topY}" x2="${sx}" y2="${botY}" stroke="${TERRACOTTA}" stroke-width="1.8" stroke-linecap="round"/>`
            + (idx % 2 === 0 ? `<line x1="${sx}" y1="${topY + 6}" x2="${sx - 5}" y2="${botY - 8}" stroke="${INK_DARK}" stroke-width="1"/>` : '')
          );
        }).join('')
        // Left Two-Tier Suspended Pavilion (南楼三官殿)
        + `<rect x="82" y="120" width="66" height="5" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + drawColonnade(86, 98, 58, 22, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(115, 84, 48, 74, 14, primary, INK_DARK, GOLD, 4.5)
        + drawColonnade(94, 66, 42, 18, 2, IVORY, TERRACOTTA, INK_DARK)
        + drawXieshanRoof(115, 48, 30, 62, 18, secondary, INK_DARK, GOLD)
        // Central Cantilevered Sky-Walkway Corridor linking North & South Halls (凌空木栈道)
        + `<rect x="148" y="108" width="58" height="6" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + drawStoneBalustrade(148, 101, 58, 7, 7, IVORY)
        + `<line x1="158" y1="88" x2="158" y2="108" stroke="${TERRACOTTA}" stroke-width="1.6"/>`
        + `<line x1="177" y1="88" x2="177" y2="108" stroke="${TERRACOTTA}" stroke-width="1.6"/>`
        + `<line x1="196" y1="88" x2="196" y2="108" stroke="${TERRACOTTA}" stroke-width="1.6"/>`
        + `<polygon points="145,88 153,78 201,78 209,88" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Right Three-Tier Towering Hanging Hall tucked beneath cliff crown (北楼三教殿)
        + `<rect x="204" y="122" width="68" height="5" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + drawColonnade(208, 100, 60, 22, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(238, 86, 50, 76, 14, primary, INK_DARK, GOLD, 4.5)
        + drawColonnade(214, 68, 48, 18, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawDougongRow(212, 65, 52, 6, GOLD)
        + drawXieshanRoof(238, 46, 36, 70, 20, primary, INK_DARK, GOLD)
        // Lower Gorge Mountain Gate & Stone Stairway ascending cliff base
        + `<rect x="64" y="162" width="38" height="22" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 76 184 V 169 A 7 7 0 0 1 90 169 V 184 Z" fill="${INK_DARK}" fill-opacity="0.82"/>`
        + `<polygon points="60,162 83,150 106,162" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawTreeAccent(44, 184, 'cypress', 1.15, primary)
        + drawTreeAccent(316, 184, 'cypress', 1.15, primary)
      );

    // 83. 火山口天池与玄武岩柱峰观景台
    case 'crater_tianchi_volcano_rim':
      return (
        // Outer Jagged Volcanic Caldera Rim Peaks (长白山天池十六峰剪影)
        `<polygon points="24,184 36,92 64,62 94,86 122,56 154,84 180,74 208,86 242,52 278,84 304,64 336,102 336,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        // Snow-filled volcanic couloir gullies on high crater peaks
        + `<polygon points="64,62 56,82 68,78 76,84" fill="${IVORY}" fill-opacity="0.84"/>`
        + `<polygon points="122,56 112,80 124,75 134,82" fill="${IVORY}" fill-opacity="0.86"/>`
        + `<polygon points="242,52 232,78 244,72 254,80" fill="${IVORY}" fill-opacity="0.88"/>`
        + `<polygon points="304,64 294,88 306,82 316,92" fill="${IVORY}" fill-opacity="0.82"/>`
        // Vertical Columnar Basalt Rock Prisms along left & right caldera walls (玄武岩柱状节理壁)
        + [52, 62, 72, 82, 266, 276, 286, 296].map((bx, idx) => {
          const topY = 88 + (idx % 3) * 8;
          return `<rect x="${bx}" y="${topY}" width="8" height="${138 - topY}" fill="${idx % 2 === 0 ? INK_MID : STONE}" stroke="${INK_DARK}" stroke-width="1"/>`;
        }).join('')
        // Luminous Azure Volcanic Crater Lake (火山口天池碧水)
        + `<ellipse cx="180" cy="126" rx="108" ry="26" fill="${primary}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<ellipse cx="180" cy="128" rx="92" ry="18" fill="${primary}" fill-opacity="0.48"/>`
        + `<path d="M 118 126 Q 152 121 184 126 T 244 126" stroke="${IVORY}" stroke-opacity="0.72" stroke-width="1.4" stroke-linecap="round"/>`
        + `<path d="M 138 134 Q 178 130 222 134" stroke="${IVORY}" stroke-opacity="0.58" stroke-width="1.1" stroke-linecap="round"/>`
        // Foreground Volcanic Tuff Ridge & Stepped Timber Observation Boardwalk
        + `<path d="M 24 184 Q 96 142 180 144 Q 264 142 336 184 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="56,184 114,154 142,154 102,184" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Center Volcanic Rim Geopark Observatory Deck & Glass Viewing Pavilion (天池边缘观景台)
        + `<rect x="134" y="138" width="92" height="10" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawStoneBalustrade(134, 131, 92, 7, 9, IVORY)
        + `<rect x="148" y="108" width="64" height="23" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="154" y="113" width="52" height="10" fill="${primary}" fill-opacity="0.46" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<polygon points="138,108 180,90 222,108" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="142" y1="106" x2="218" y2="106" stroke="${GOLD}" stroke-width="1.8"/>`
        // Right Crater Azimuth Marker & Basalt Observation Cairn
        + `<rect x="262" y="150" width="22" height="22" rx="2" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<circle cx="273" cy="146" r="5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
      );

    // 84. 深水自动化远控集装箱桥吊
    case 'automated_deepwater_port_crane':
      return (
        // Left Smart Port 5G Remote-Control Tower & Radar Dome (港口智慧远控中心)
        `<rect x="26" y="106" width="32" height="46" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="22" y="92" width="40" height="14" rx="2" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="26" y="95" width="32" height="6" fill="${GOLD_LIGHT}"/>`
        + `<line x1="42" y1="92" x2="42" y2="76" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<circle cx="42" cy="75" r="3.2" fill="${TERRACOTTA}"/>`
        + `<path d="M 48 70 Q 56 64 62 72" stroke="${GOLD}" stroke-width="1.3" stroke-dasharray="2 2" stroke-linecap="round"/>`
        // Partner Background Automated Quay Crane #2
        + `<line x1="176" y1="150" x2="188" y2="62" stroke="${primary}" stroke-width="2.2"/>`
        + `<line x1="210" y1="150" x2="202" y2="62" stroke="${primary}" stroke-width="2.2"/>`
        + `<line x1="170" y1="74" x2="254" y2="62" stroke="${primary}" stroke-width="2.2"/>`
        + `<line x1="195" y1="50" x2="246" y2="63" stroke="${INK_MID}" stroke-width="1.1"/>`
        // Foreground Hero Ship-to-Shore Automated Quay Crane #1 (远控双40尺岸桥)
        + `<line x1="92" y1="150" x2="110" y2="38" stroke="${TERRACOTTA}" stroke-width="3.4" stroke-linecap="round"/>`
        + `<line x1="146" y1="150" x2="128" y2="38" stroke="${TERRACOTTA}" stroke-width="3.4" stroke-linecap="round"/>`
        + `<line x1="99" y1="114" x2="139" y2="114" stroke="${INK_DARK}" stroke-width="2"/>`
        + `<line x1="103" y1="84" x2="135" y2="84" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + `<rect x="108" y="32" width="22" height="10" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Cantilevered horizontal outreach boom & back-stays
        + `<line x1="74" y1="58" x2="246" y2="58" stroke="${TERRACOTTA}" stroke-width="3.2"/>`
        + `<line x1="74" y1="63" x2="246" y2="63" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<line x1="119" y1="32" x2="78" y2="58" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="119" y1="32" x2="184" y2="58" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="119" y1="32" x2="242" y2="58" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Automated trolley spreader lifting an ISO container mid-air
        + `<rect x="192" y="56" width="18" height="8" fill="${INK_DARK}"/>`
        + `<line x1="196" y1="64" x2="196" y2="88" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<line x1="206" y1="64" x2="206" y2="88" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="182" y="88" width="38" height="16" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Moored Deepwater Ocean Container Vessel (万吨远洋集装箱船)
        + `<polygon points="174,148 334,148 320,172 192,172" fill="${INK_DARK}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="184,162 326,162 320,172 192,172" fill="${TERRACOTTA}"/>`
        + `<rect x="292" y="108" width="30" height="40" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="296" y="114" width="22" height="7" fill="${primary}" fill-opacity="0.52"/>`
        + `<line x1="307" y1="108" x2="307" y2="90" stroke="${INK_DARK}" stroke-width="1.5"/>`
        // Stacked shipboard container tiers
        + `<rect x="186" y="134" width="32" height="14" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="220" y="134" width="32" height="14" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="254" y="134" width="32" height="14" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="202" y="120" width="32" height="14" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="236" y="120" width="32" height="14" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Concrete deepwater wharf apron & autonomous IGV guided vehicle on quay
        + `<rect x="22" y="150" width="144" height="16" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="66" y="132" width="44" height="12" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="62" y="144" width="52" height="5" rx="1.5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<circle cx="72" cy="149" r="2.6" fill="${INK_DARK}"/>`
        + `<circle cx="104" cy="149" r="2.6" fill="${INK_DARK}"/>`
      );

    // 85. 高寒雪山冰川索道与科考观测站
    case 'glacier_snow_peak_station':
      return (
        // Monumental Himalayan / Alpine Snow Peak Ridge (主峰雪山与高寒旗云)
        `<polygon points="24,184 58,92 94,108 134,54 176,22 218,58 262,88 308,64 338,136 338,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        // Shaded granite arête rock facets contrasting sunlit white snowfields
        + `<polygon points="176,22 176,128 134,96 154,60" fill="${primary}" fill-opacity="0.34"/>`
        + `<polygon points="176,22 218,58 238,118 176,128" fill="#FFFFFF" fill-opacity="0.94"/>`
        + `<polygon points="134,54 134,110 94,108" fill="#FFFFFF" fill-opacity="0.88"/>`
        + `<polygon points="308,64 338,136 286,122" fill="#FFFFFF" fill-opacity="0.86"/>`
        // Summit snow-plume banner cloud (珠峰旗云)
        + `<path d="M 178 24 Q 212 18 246 25 Q 222 30 184 28 Z" fill="#FFFFFF" fill-opacity="0.88" stroke="${primary}" stroke-opacity="0.34" stroke-width="0.9"/>`
        // Cascading Valley Glacier Tongue & Serac Ice Pinnacles (冰川冰舌与冰塔林)
        + `<path d="M 152 104 Q 134 138 92 184 H 204 Q 194 142 186 102 Z" fill="#FFFFFF" stroke="${primary}" stroke-width="1.3"/>`
        + `<path d="M 122 152 Q 146 144 176 152 M 108 168 Q 144 158 188 168" stroke="${primary}" stroke-opacity="0.54" stroke-width="1.3" stroke-linecap="round"/>`
        + `<polygon points="118,176 126,158 134,176" fill="${IVORY}" stroke="${primary}" stroke-width="1"/>`
        + `<polygon points="136,178 146,156 156,178" fill="#FFFFFF" stroke="${primary}" stroke-width="1"/>`
        + `<polygon points="158,176 168,160 178,176" fill="${IVORY}" stroke="${primary}" stroke-width="1"/>`
        // High-Altitude Glacier Ropeway Cableway & Suspended Gondola Cabins (高寒冰川索道)
        + `<polygon points="116,136 122,94 128,94 134,136" fill="none" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="118" y1="94" x2="132" y2="94" stroke="${TERRACOTTA}" stroke-width="2.2"/>`
        + `<line x1="42" y1="138" x2="125" y2="94" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="125" y1="94" x2="216" y2="62" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Suspended panoramic gondola cabins
        + `<line x1="86" y1="115" x2="86" y2="125" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="78" y="125" width="16" height="12" rx="2.5" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="81" y="128" width="10" height="5" fill="${IVORY}"/>`
        + `<line x1="172" y1="77" x2="172" y2="87" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="164" y="87" width="16" height="12" rx="2.5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="167" y="90" width="10" height="5" fill="${IVORY}"/>`
        // Elevated High-Altitude Scientific Research Station & Geodesic Radome (科考观测站与气象穹顶)
        + `<polygon points="198,184 214,154 328,154 334,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [222, 246, 270, 294].map(px =>
          `<line x1="${px}" y1="146" x2="${px}" y2="158" stroke="${INK_DARK}" stroke-width="2"/>`,
        ).join('')
        + `<rect x="210" y="128" width="96" height="20" rx="2" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="210" y="142" width="96" height="5" fill="${TERRACOTTA}"/>`
        + `<rect x="218" y="133" width="38" height="7" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<path d="M 278 128 A 14 14 0 0 1 306 128 Z" fill="#FFFFFF" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="292" y1="114" x2="292" y2="100" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<circle cx="292" cy="100" r="2" fill="${TERRACOTTA}"/>`
        // Left mountain expedition prayer-flag cord
        + `<line x1="40" y1="158" x2="40" y2="184" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + `<path d="M 40 160 Q 62 168 82 154" stroke="${primary}" stroke-width="1.3"/>`
      );

    // 86. 古镇重檐雕花木构戏台
    case 'classical_wood_opera_stage':
      return (
        // Left & Right Flanking Two-Story Acoustic Audience Viewing Galleries (左右观戏看楼)
        `<rect x="34" y="114" width="44" height="70" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="30,114 56,94 82,114" fill="${INK_MID}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="42" y="122" width="28" height="16" fill="${TERRACOTTA}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="282" y="114" width="44" height="70" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="278,114 304,94 330,114" fill="${INK_MID}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="290" y="122" width="28" height="16" fill="${TERRACOTTA}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1"/>`
        // Raised Carved Stone & Brick Opera Stage Podium (雕砖戏台须弥台基)
        + `<rect x="86" y="148" width="188" height="36" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="108" y="156" width="144" height="20" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<circle cx="180" cy="166" r="7" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1.1"/>`
        + `<polygon points="68,184 86,154 86,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<polygon points="292,184 274,154 274,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Open Proscenium Stage Floor, Carved Spandrels & "出将/入相" Screen Backdrop
        + `<rect x="102" y="102" width="156" height="46" fill="${GOLD_LIGHT}" fill-opacity="0.48" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Traditional "守旧" painted screen & twin side doorways
        + `<rect x="142" y="108" width="76" height="40" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="150" y="114" width="60" height="28" fill="${primary}" fill-opacity="0.22" stroke="${GOLD}" stroke-width="1.1"/>`
        + `<rect x="114" y="114" width="20" height="34" fill="${INK_DARK}" fill-opacity="0.82" stroke="${GOLD}" stroke-width="1"/>`
        + `<rect x="226" y="114" width="20" height="34" fill="${INK_DARK}" fill-opacity="0.82" stroke="${GOLD}" stroke-width="1"/>`
        // Four crimson lacquered stage pillars & carved golden bracket spandrels (牛腿雀替)
        + [102, 138, 222, 258].map(px =>
          `<rect x="${px - 2}" y="102" width="4" height="46" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="0.9"/>`,
        ).join('')
        + `<rect x="104" y="102" width="152" height="7" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        // Twin palace stage lanterns hanging inside proscenium
        + `<line x1="126" y1="109" x2="126" y2="117" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<ellipse cx="126" cy="122" rx="4.5" ry="6" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1"/>`
        + `<line x1="234" y1="109" x2="234" y2="117" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<ellipse cx="234" cy="122" rx="4.5" ry="6" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1"/>`
        // Ornate Double-Eaved Flying-Corner Timber Roof & Inscribed Stage Plaque (重檐飞角歇山戏台顶)
        + drawChineseEaveTier(cx, 82, 134, 208, 20, primary, INK_DARK, GOLD, 6.5)
        + drawColonnade(132, 62, 96, 20, 4, IVORY, TERRACOTTA, INK_DARK)
        + `<rect x="166" y="66" width="28" height="10" rx="1" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1"/>`
        + drawDougongRow(130, 58, 100, 9, GOLD)
        + drawXieshanRoof(cx, 28, 72, 152, 30, secondary, INK_DARK, GOLD)
        + `<circle cx="180" cy="24" r="2.8" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.8"/>`
      );

    // 87. 地热温泉雾气亭榭与疗养浴池
    case 'geothermal_hot_spring_pavilion':
      return (
        // Left Volcanic Rockery Cascade feeding the Geothermal Hot Spring Pool (温泉叠瀑山石)
        `<path d="M 38 184 L 46 116 Q 68 98 94 114 L 116 146 L 116 184 Z" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 74 118 Q 84 138 78 156" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/>`
        + `<path d="M 86 122 Q 96 140 92 156" stroke="${IVORY}" stroke-width="2" stroke-linecap="round"/>`
        // Wide Steaming Turquoise-Mineral Thermal Bathing Pool & Pebble Coping (汤泉浴池)
        + `<ellipse cx="176" cy="166" rx="134" ry="18" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<ellipse cx="176" cy="167" rx="122" ry="13" fill="${primary}" fill-opacity="0.34" stroke="${primary}" stroke-opacity="0.52" stroke-width="1.1"/>`
        + `<ellipse cx="164" cy="167" rx="84" ry="8" fill="${primary}" fill-opacity="0.26"/>`
        // Curving Rising Geothermal Steam Mist Ribbons (地热温泉袅袅白雾)
        + [84, 118, 154, 214, 254].map((sx, idx) =>
          `<path d="M ${sx} 164 Q ${sx - 8} 150 ${sx + 2} 138 Q ${sx + 10} 126 ${sx - 2} 114" stroke="#FFFFFF" stroke-opacity="${idx % 2 === 0 ? '0.88' : '0.74'}" stroke-width="3" stroke-linecap="round"/>`
          + `<path d="M ${sx + 6} 162 Q ${sx + 14} 148 ${sx + 4} 136" stroke="${IVORY}" stroke-opacity="0.68" stroke-width="1.8" stroke-linecap="round"/>`,
        ).join('')
        // Waterside Timber Thermal Pavilion & Covered Bathhouse Corridor (临泉木构亭榭)
        + `<line x1="146" y1="142" x2="146" y2="162" stroke="${INK_DARK}" stroke-width="2.4"/>`
        + `<line x1="184" y1="142" x2="184" y2="162" stroke="${INK_DARK}" stroke-width="2.4"/>`
        + `<line x1="222" y1="142" x2="222" y2="162" stroke="${INK_DARK}" stroke-width="2.4"/>`
        + `<rect x="136" y="136" width="96" height="6" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawStoneBalustrade(136, 128, 96, 8, 8, IVORY)
        + drawColonnade(146, 98, 76, 30, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(184, 80, 68, 114, 18, primary, INK_DARK, GOLD, 5.5)
        + drawXieshanRoof(184, 54, 42, 88, 26, secondary, INK_DARK, GOLD)
        // Right Connected Covered Boardwalk Wing & Warm Stone Garden Lantern (石灯笼)
        + `<rect x="228" y="114" width="76" height="24" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="222,114 236,98 302,98 312,114" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="234" y="138" width="72" height="18" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="116" y="144" width="12" height="16" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="118" y="136" width="8" height="8" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<polygon points="113,136 122,128 131,136" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + drawTreeAccent(318, 184, 'bamboo', 1.15, primary)
      );

    // 88. 热带咖啡庄园晒场与木构焙坊
    case 'subtropical_coffee_drying_terrace':
      return (
        // Left Terraced Subtropical Coffee-Estate Hillside with Coffee Bushes (热带咖啡山坡台地)
        `<path d="M 28 184 L 28 106 Q 82 94 142 118 L 172 152 L 172 184 Z" fill="${primary}" fill-opacity="0.18" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<path d="M 28 184 L 28 126 Q 86 116 146 138 L 164 184 Z" fill="${primary}" fill-opacity="0.26"/>`
        + [
          { x: 54, y: 108 },
          { x: 86, y: 112 },
          { x: 118, y: 122 },
          { x: 64, y: 132 },
          { x: 100, y: 136 },
        ].map(b =>
          `<ellipse cx="${b.x}" cy="${b.y}" rx="12" ry="7" fill="${primary}" fill-opacity="0.78" stroke="${INK_DARK}" stroke-width="1"/>`
          + `<circle cx="${b.x - 4}" cy="${b.y - 1}" r="1.8" fill="${TERRACOTTA}"/>`
          + `<circle cx="${b.x + 3}" cy="${b.y + 1}" r="1.8" fill="${TERRACOTTA}"/>`,
        ).join('')
        // Foreground Elevated Timber African-Style Coffee Sun-Drying Beds (咖啡高架日晒床)
        + `<line x1="48" y1="168" x2="48" y2="184" stroke="${INK_DARK}" stroke-width="2"/>`
        + `<line x1="128" y1="168" x2="128" y2="184" stroke="${INK_DARK}" stroke-width="2"/>`
        + `<line x1="112" y1="154" x2="112" y2="168" stroke="${INK_DARK}" stroke-width="1.8"/>`
        + `<line x1="184" y1="154" x2="184" y2="168" stroke="${INK_DARK}" stroke-width="1.8"/>`
        // Upper terrace drying bed
        + `<polygon points="94,154 114,140 194,140 176,154" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="102,151 116,142 186,142 172,151" fill="${GOLD}" fill-opacity="0.78"/>`
        // Foreground large sunlit drying bed with raked parchment & natural coffee cherries
        + `<polygon points="38,170 62,152 154,152 136,170" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="46,167 65,155 144,155 130,167" fill="${TERRACOTTA}" fill-opacity="0.62"/>`
        + `<line x1="60" y1="161" x2="136" y2="161" stroke="${GOLD}" stroke-width="1.6"/>`
        + `<line x1="54" y1="164" x2="132" y2="164" stroke="${GOLD_LIGHT}" stroke-width="1.2"/>`
        // Right Subtropical Timber Coffee Roastery, Washing Barn & Tasting Veranda (木构咖啡焙坊)
        + `<rect x="192" y="166" width="122" height="18" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + drawColonnade(198, 124, 110, 42, 4, IVORY, TERRACOTTA, INK_DARK)
        // Ventilated double-tier tropical estate gable roof with clerestory louver ridge
        + `<polygon points="184,124 202,94 304,94 322,124" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="218" y="82" width="70" height="12" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<polygon points="208,82 253,58 298,82" fill="${secondary}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Copper Drum Roaster Flue Chimney rising above roastery roof
        + `<rect x="278" y="42" width="10" height="32" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="275" y="40" width="16" height="4" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<path d="M 283 36 Q 290 28 282 20" stroke="${primary}" stroke-opacity="0.44" stroke-width="1.6" stroke-linecap="round"/>`
        // Stacked Burlap Green-Coffee Sacks & Hanging Warm Café Lanterns on Veranda
        + `<ellipse cx="212" cy="159" rx="9" ry="7" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<ellipse cx="228" cy="159" rx="9" ry="7" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<ellipse cx="220" cy="150" rx="8" ry="6" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<line x1="252" y1="124" x2="252" y2="133" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<circle cx="252" cy="136" r="3.6" fill="${GOLD}" stroke="${TERRACOTTA}" stroke-width="1"/>`
        // Tropical Palm Fronds framing both sides
        + drawTreeAccent(36, 184, 'palm', 1.0, primary)
        + drawTreeAccent(324, 184, 'palm', 1.08, primary)
      );

    // 89. 古石堰渠与分水鱼嘴枢纽
    case 'ancient_stone_aqueduct_weir':
      return (
        // Left & Right Steep Canyon Limestone Abutments supporting Cliff Aqueduct (太行悬崖石砌渡槽)
        `<polygon points="24,184 24,86 78,66 102,102 98,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="262,184 262,102 288,68 336,88 336,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Elevated Multi-Arch Stone Aqueduct Viaduct carrying turquoise canal water across gorge
        + `<path d="M 74 74 H 286 V 114 H 262 V 98 A 14 14 0 0 0 234 98 V 114 H 222 V 98 A 14 14 0 0 0 194 98 V 114 H 182 V 98 A 14 14 0 0 0 154 98 V 114 H 142 V 98 A 14 14 0 0 0 114 98 V 114 H 102 V 98 A 14 14 0 0 0 74 98 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="74" y="69" width="212" height="6" fill="${primary}" fill-opacity="0.56" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<line x1="88" y1="72" x2="146" y2="72" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round"/>`
        + `<line x1="178" y1="72" x2="254" y2="72" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round"/>`
        // Aqueduct stone pier buttresses descending into river bed
        + [108, 148, 188, 228].map(px =>
          `<rect x="${px - 5}" y="110" width="10" height="32" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`,
        ).join('')
        // Twin Flanking Weir Sluice-Gate Piers & Timber Lifting Gates (分水陡门闸)
        + `<rect x="116" y="132" width="38" height="24" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="122" y="138" width="26" height="14" fill="${TERRACOTTA}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="112" y="126" width="46" height="6" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="206" y="132" width="38" height="24" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="212" y="138" width="26" height="14" fill="${TERRACOTTA}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="202" y="126" width="46" height="6" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        // Central Fish-Mouth Stone Diversion Dike ("鱼嘴"分水堤) splitting inner & outer canals
        + `<path d="M 180 124 Q 204 146 210 184 H 150 Q 156 146 180 124 Z" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 180 128 Q 196 148 200 184 H 160 Q 164 148 180 128 Z" fill="${STONE_DEEP}"/>`
        + `<polygon points="172,144 188,144 180,124" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Surging river currents & whitewater spray curves flanking the Fish-Mouth weir
        + `<path d="M 102 156 Q 134 156 148 184 H 96 Z" fill="${primary}" fill-opacity="0.34"/>`
        + `<path d="M 258 156 Q 226 156 212 184 H 264 Z" fill="${primary}" fill-opacity="0.34"/>`
        + `<path d="M 118 164 Q 134 166 140 180 M 242 164 Q 226 166 220 180" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>`
        // Left Cliffside Weir-Guardian Pavilion & Stele + Cypress
        + `<rect x="38" y="114" width="42" height="18" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + drawChineseEaveTier(59, 98, 34, 58, 16, primary, INK_DARK, GOLD, 4)
        + `<rect x="284" y="136" width="16" height="28" rx="1.5" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<line x1="292" y1="142" x2="292" y2="158" stroke="${TERRACOTTA}" stroke-width="1.6"/>`
        + drawTreeAccent(318, 184, 'cypress', 1.12, primary)
      );

    // 90. 高山云雾崖畔阶梯茶园
    case 'cliffside_tea_terraces':
      return (
        // Towering Misty High-Mountain Crag Backdrop
        `<polygon points="24,184 36,92 86,58 142,84 198,48 266,76 322,64 336,112 336,184" fill="${primary}" fill-opacity="0.16" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // 6 Sweeping Layered Cliffside Contour Tea Terraces (层叠高山阶梯茶垄)
        + `<path d="M 24 184 L 24 108 Q 108 86 206 110 T 336 102 L 336 184 Z" fill="${primary}" fill-opacity="0.24" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<path d="M 24 184 L 24 124 Q 112 104 214 124 T 336 118 L 336 184 Z" fill="${primary}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<path d="M 24 184 L 24 140 Q 116 122 222 140 T 336 134 L 336 184 Z" fill="${primary}" fill-opacity="0.46" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<path d="M 24 184 L 24 156 Q 118 140 228 156 T 336 150 L 336 184 Z" fill="${primary}" fill-opacity="0.58" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<path d="M 24 184 L 24 170 Q 124 158 236 170 T 336 166 L 336 184 Z" fill="${primary}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1"/>`
        // Sculpted Rounded Tea-Bush Hedge Tufts crowning upper & middle terrace contours
        + [44, 68, 92, 118, 144, 170, 56, 82, 110, 138, 166].map((tx, idx) => {
          const ty = idx < 6 ? 114 + idx * 1.5 : 136 + (idx - 6) * 2;
          return `<ellipse cx="${tx}" cy="${ty}" rx="11" ry="5.5" fill="${primary}" fill-opacity="0.86" stroke="${INK_DARK}" stroke-width="0.9"/>`;
        }).join('')
        // Drifting Horizontal Sea-of-Clouds Mist Ribbons weaving through tea crags (云雾缭绕)
        + `<path d="M 30 88 Q 76 78 128 88 Q 162 94 196 84 Q 162 98 112 96 Q 66 96 30 88 Z" fill="#FFFFFF" fill-opacity="0.88" stroke="${primary}" stroke-opacity="0.26" stroke-width="0.8"/>`
        + `<path d="M 134 106 Q 190 96 248 106 Q 288 112 324 102 Q 282 116 226 114 Q 174 114 134 106 Z" fill="#FFFFFF" fill-opacity="0.82" stroke="${primary}" stroke-opacity="0.26" stroke-width="0.8"/>`
        // Cliffside Stone Retaining Terrace & Timber Cloud-Tea Pavilion (崖畔观茶亭)
        + `<polygon points="212,184 222,126 304,126 314,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + drawStoneBalustrade(220, 119, 86, 7, 8, IVORY)
        + drawColonnade(230, 92, 66, 27, 3, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(263, 76, 54, 92, 17, primary, INK_DARK, GOLD, 5)
        + drawXieshanRoof(263, 52, 34, 72, 24, secondary, INK_DARK, GOLD)
        // Stepped stone tea-picking path climbing foreground slope & bamboo sun-withering trays
        + `<polygon points="154,184 186,144 202,144 178,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<ellipse cx="242" cy="166" rx="14" ry="7" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<ellipse cx="274" cy="168" rx="14" ry="7" fill="${GOLD}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + drawTreeAccent(320, 184, 'bamboo', 1.05, primary)
      );

    // 91. 海岛离岸风机群与海湾风廊
    case 'island_wind_turbine_bay':
      return (
        // Left Coastal Sea-Island Headland Cliff & Stone Coastal Village Cluster (海岛礁岩村落)
        `<polygon points="24,184 24,114 58,104 94,124 128,158 128,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="24,146 66,132 108,156 128,184 24,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="38" y="134" width="24" height="18" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<polygon points="35,134 50,123 65,134" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="68" y="142" width="22" height="16" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<polygon points="65,142 79,132 93,142" fill="${primary}" stroke="${INK_DARK}" stroke-width="1"/>`
        // Flowing Sea-Breeze Wind Corridor Streams across the Bay (海湾风廊气流线)
        + `<path d="M 48 62 Q 140 44 244 62 T 332 54" stroke="${primary}" stroke-opacity="0.34" stroke-width="1.3" stroke-dasharray="6 4" stroke-linecap="round"/>`
        + `<path d="M 68 84 Q 168 68 274 84 T 336 78" stroke="${GOLD}" stroke-opacity="0.42" stroke-width="1.1" stroke-dasharray="5 4" stroke-linecap="round"/>`
        // Sweeping Open Ocean Bay Horizon & Waves (`y=154..184`)
        + `<path d="M 118 162 Q 186 154 260 160 T 346 158 V 184 H 118 Z" fill="${primary}" fill-opacity="0.22" stroke="${primary}" stroke-opacity="0.42" stroke-width="1.1"/>`
        + `<path d="M 134 174 Q 178 169 222 174 T 318 174" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round"/>`
        // 5 Staggered Island & Offshore Wind Turbines with Yellow Monopile Transition Bases
        + [
          { x: 96, yTop: 68, yBase: 146, r: 22, phase: -25, offshore: false },
          { x: 148, yTop: 52, yBase: 174, r: 30, phase: 12, offshore: true },
          { x: 204, yTop: 44, yBase: 178, r: 34, phase: 45, offshore: true },
          { x: 260, yTop: 58, yBase: 174, r: 27, phase: 78, offshore: true },
          { x: 308, yTop: 72, yBase: 170, r: 23, phase: 105, offshore: true },
        ].map(t => {
          const blades = [0, 120, 240].map(deg => {
            const rad = ((deg + t.phase) * Math.PI) / 180;
            const perp = rad + Math.PI / 2;
            const bx = Math.round(t.x + Math.cos(rad) * t.r);
            const by = Math.round(t.yTop + Math.sin(rad) * t.r);
            const w1x = Math.round(t.x + Math.cos(rad) * 5 + Math.cos(perp) * 2.4);
            const w1y = Math.round(t.yTop + Math.sin(rad) * 5 + Math.sin(perp) * 2.4);
            const w2x = Math.round(t.x + Math.cos(rad) * 5 - Math.cos(perp) * 1.4);
            const w2y = Math.round(t.yTop + Math.sin(rad) * 5 - Math.sin(perp) * 1.4);
            return `<polygon points="${t.x},${t.yTop} ${w1x},${w1y} ${bx},${by} ${w2x},${w2y}" fill="#FFFFFF" stroke="${INK_DARK}" stroke-width="1.1" stroke-linejoin="round"/>`;
          }).join('');
          const baseCollar = t.offshore
            ? `<rect x="${t.x - 4}" y="${t.yBase - 11}" width="8" height="11" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.1"/>`
              + `<line x1="${t.x - 7}" y1="${t.yBase}" x2="${t.x + 7}" y2="${t.yBase}" stroke="#FFFFFF" stroke-width="1.5"/>`
            : '';
          return (
            `<polygon points="${t.x - 3.2},${t.yBase} ${t.x - 1.3},${t.yTop} ${t.x + 1.3},${t.yTop} ${t.x + 3.2},${t.yBase}" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
            + baseCollar
            + blades
            + `<circle cx="${t.x}" cy="${t.yTop}" r="3.4" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.1"/>`
          );
        }).join('')
        // Coastal wind-operation service vessel sailing across bay
        + `<polygon points="164,178 190,178 186,183 168,183" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="172" y="172" width="10" height="6" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + drawTreeAccent(34, 184, 'cypress', 0.92, primary)
      );

    // 92. 口岸国门与跨轨铁路换装门楼
    case 'border_port_railway_gate':
      return (
        // Left & Right Stepped Border-Inspection Wing Pavilions & National Pennant Masts (国门侧翼联检翼楼)
        `<rect x="38" y="124" width="38" height="60" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="284" y="124" width="38" height="60" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="44" y="132" width="24" height="10" fill="${primary}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<rect x="292" y="132" width="24" height="10" fill="${primary}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="0.9"/>`
        // Boundary Milestone Stele ("界碑") on left plaza
        + `<rect x="28" y="150" width="12" height="34" rx="2" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="28" y="156" width="12" height="6" fill="${TERRACOTTA}"/>`
        + `<circle cx="34" cy="153" r="1.8" fill="${GOLD}"/>`
        // Monumental Ceremonial National Border Gate Piers & Spanning Lintel Bridge (跨轨铁路国门主楼)
        + `<rect x="74" y="88" width="42" height="96" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="244" y="88" width="42" height="96" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + [102, 120, 138, 156].map(wy =>
          `<rect x="82" y="${wy}" width="26" height="9" fill="${primary}" fill-opacity="0.38" stroke="${INK_DARK}" stroke-width="0.8"/>`
          + `<rect x="252" y="${wy}" width="26" height="9" fill="${primary}" fill-opacity="0.38" stroke="${INK_DARK}" stroke-width="0.8"/>`,
        ).join('')
        // Upper Ceremonial Lintel Span & Crimson-Gold National Emblem Fascia
        + `<rect x="64" y="50" width="232" height="44" rx="2" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="70" y="56" width="220" height="32" fill="${IVORY}" fill-opacity="0.94" stroke="${GOLD}" stroke-width="1.1"/>`
        + `<polygon points="58,50 76,38 284,38 302,50" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="78" y1="38" x2="282" y2="38" stroke="${GOLD}" stroke-width="2.2"/>`
        // National Gate Emblem Medallion & Crimson Plaque Banner
        + `<rect x="122" y="61" width="116" height="22" rx="2" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="1.2"/>`
        + `<circle cx="180" cy="72" r="8.5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<circle cx="180" cy="72" r="4" fill="${TERRACOTTA}"/>`
        // Twin Ceremonial Flagpoles with Fluttering Red Banners
        + `<line x1="56" y1="74" x2="56" y2="124" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + `<polygon points="56,76 76,81 56,87" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="0.8"/>`
        + `<line x1="304" y1="74" x2="304" y2="124" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + `<polygon points="304,76 324,81 304,87" fill="${TERRACOTTA}" stroke="${GOLD}" stroke-width="0.8"/>`
        // Dual-Gauge Perspective Railway Tracks & Catenary Portal passing straight through Gate Arch
        + `<polygon points="116,184 146,120 214,120 244,184" fill="${STONE}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<line x1="128" y1="184" x2="154" y2="120" stroke="${INK_DARK}" stroke-width="2.2"/>`
        + `<line x1="232" y1="184" x2="206" y2="120" stroke="${INK_DARK}" stroke-width="2.2"/>`
        + `<line x1="146" y1="184" x2="164" y2="120" stroke="${INK_MID}" stroke-width="1.5"/>`
        + `<line x1="214" y1="184" x2="196" y2="120" stroke="${INK_MID}" stroke-width="1.5"/>`
        + [136, 148, 160, 172, 181].map((ty, idx) =>
          `<line x1="${152 - idx * 6}" y1="${ty}" x2="${208 + idx * 6}" y2="${ty}" stroke="${INK_DARK}" stroke-width="1.6"/>`,
        ).join('')
        // Cross-Border Freight Locomotive emerging beneath the National Gate Portal
        + `<rect x="150" y="132" width="60" height="36" rx="4" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="156" y="138" width="48" height="12" rx="1.5" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<line x1="150" y1="156" x2="210" y2="156" stroke="${TERRACOTTA}" stroke-width="3.2"/>`
        + `<circle cx="163" cy="162" r="3.4" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<circle cx="197" cy="162" r="3.4" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<path d="M 168 132 L 174 122 H 186 L 192 132" fill="none" stroke="${INK_DARK}" stroke-width="1.3"/>`
      );

    // 93. 喀斯特峰林碧水竹筏码头
    case 'bamboo_raft_karst_pier':
      return (
        // Iconic Steep Rounded Guilin/Guangxi Karst Limestone Peaks (喀斯特翠峰林)
        `<path d="M 28 164 Q 44 64 68 62 Q 92 64 108 164 Z" fill="${primary}" fill-opacity="0.22" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<path d="M 88 164 Q 112 42 138 38 Q 164 42 184 164 Z" fill="${primary}" fill-opacity="0.32" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 164 164 Q 192 52 218 48 Q 246 52 266 164 Z" fill="${primary}" fill-opacity="0.26" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<path d="M 244 164 Q 272 68 298 64 Q 322 68 336 164 Z" fill="${primary}" fill-opacity="0.36" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Vertical karst cliff limestone striations & morning river mist veil
        + `<line x1="134" y1="54" x2="132" y2="118" stroke="${INK_DARK}" stroke-opacity="0.24" stroke-width="1.1"/>`
        + `<line x1="216" y1="64" x2="218" y2="126" stroke="${INK_DARK}" stroke-opacity="0.24" stroke-width="1.1"/>`
        + `<path d="M 46 132 Q 124 122 204 132 T 326 128 Q 254 140 172 138 T 46 132 Z" fill="#FFFFFF" fill-opacity="0.72"/>`
        // Emerald Karst River Bend (`y=154..184`)
        + `<path d="M 24 160 Q 124 152 224 158 T 336 154 V 184 H 24 Z" fill="${primary}" fill-opacity="0.24" stroke="${primary}" stroke-opacity="0.46" stroke-width="1.1"/>`
        // Left Stone-and-Bamboo Ferry Wharf Steps & Waterside Pavilion (碧水竹筏码头)
        + `<polygon points="28,184 28,144 98,144 114,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="86" y="154" width="22" height="5" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<rect x="92" y="162" width="22" height="5" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<rect x="98" y="170" width="22" height="5" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + drawColonnade(38, 118, 52, 26, 2, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(64, 102, 40, 74, 17, primary, INK_DARK, GOLD, 4.5)
        // Mooring bamboo post & riverside bamboo/willow framing
        + `<line x1="116" y1="158" x2="116" y2="178" stroke="${INK_DARK}" stroke-width="2.2"/>`
        + drawTreeAccent(308, 184, 'bamboo', 1.15, primary)
        + drawTreeAccent(324, 184, 'willow', 1.05, primary)
        // 3 Lashed Upturned-Prow Bamboo Rafts ("竹筏") gliding across jade river
        + [
          { x: 138, y: 174, w: 68, pole: true },
          { x: 222, y: 164, w: 54, pole: false },
          { x: 248, y: 180, w: 62, pole: true },
        ].map(r => {
          const rx = r.x;
          const ry = r.y;
          const rw = r.w;
          const canopy = `<path d="M ${rx + rw * 0.24} ${ry - 2} Q ${rx + rw * 0.48} ${ry - 14} ${rx + rw * 0.72} ${ry - 2} Z" fill="${TERRACOTTA}" fill-opacity="0.86" stroke="${INK_DARK}" stroke-width="1"/>`;
          const poler = r.pole
            ? `<line x1="${rx + rw * 0.82}" y1="${ry - 14}" x2="${rx + rw * 0.82}" y2="${ry - 3}" stroke="${INK_DARK}" stroke-width="1.8"/>`
              + `<polygon points="${rx + rw * 0.82 - 6},${ry - 14} ${rx + rw * 0.82},${ry - 18} ${rx + rw * 0.82 + 6},${ry - 14}" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.9"/>`
              + `<line x1="${rx + rw * 0.8}" y1="${ry - 11}" x2="${rx + rw + 6}" y2="${ry + 6}" stroke="${GOLD}" stroke-width="1.4" stroke-linecap="round"/>`
            : '';
          return (
            `<path d="M ${rx} ${ry - 4} Q ${rx + 6} ${ry + 2} ${rx + 14} ${ry + 2} H ${rx + rw - 10} Q ${rx + rw - 3} ${ry + 2} ${rx + rw} ${ry - 3} L ${rx + rw - 4} ${ry - 1} H ${rx + 8} Z" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.2"/>`
            + `<line x1="${rx + 8}" y1="${ry - 1}" x2="${rx + rw - 6}" y2="${ry - 1}" stroke="${GOLD}" stroke-width="1.2"/>`
            + canopy
            + poler
            + `<path d="M ${rx + 10} ${ry + 5} Q ${rx + rw * 0.5} ${ry + 7} ${rx + rw - 6} ${ry + 5}" stroke="#FFFFFF" stroke-width="1.1" stroke-linecap="round"/>`
          );
        }).join('')
      );

    // 94. 现代化连栋智能玻璃温室农园
    case 'glass_greenhouse_agripark':
      return (
        // Left-Center 5-Bay Venlo-Style Multi-Span Smart Glass Greenhouse Complex (连栋智能玻璃温室)
        [36, 78, 120, 162, 204].map(gx =>
          `<polygon points="${gx},102 ${gx + 21},76 ${gx + 42},102" fill="${primary}" fill-opacity="0.28" stroke="${INK_DARK}" stroke-width="1.3"/>`
          + `<polygon points="${gx + 4},102 ${gx + 21},80 ${gx + 28},102" fill="#FFFFFF" fill-opacity="0.48"/>`
          // Automated rooftop climate ventilation louver open at ridge
          + `<line x1="${gx + 14}" y1="74" x2="${gx + 28}" y2="74" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"/>`
          + `<rect x="${gx}" y="102" width="42" height="68" fill="${primary}" fill-opacity="0.16" stroke="${INK_DARK}" stroke-width="1.2"/>`
          // Interior visible hydroponic green crop racks & warm LED grow lights inside glass bays
          + `<line x1="${gx + 6}" y1="112" x2="${gx + 36}" y2="112" stroke="${GOLD}" stroke-width="1.8"/>`
          + `<rect x="${gx + 6}" y="124" width="30" height="8" rx="1.5" fill="${primary}" fill-opacity="0.62" stroke="${INK_DARK}" stroke-width="0.7"/>`
          + `<rect x="${gx + 6}" y="138" width="30" height="8" rx="1.5" fill="${primary}" fill-opacity="0.74" stroke="${INK_DARK}" stroke-width="0.7"/>`
          + `<rect x="${gx + 6}" y="152" width="30" height="10" rx="1.5" fill="${primary}" fill-opacity="0.84" stroke="${INK_DARK}" stroke-width="0.7"/>`,
        ).join('')
        // Steel gutter beam & diagonal glass glare bars across greenhouse facade
        + `<rect x="34" y="100" width="214" height="4" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<line x1="50" y1="106" x2="72" y2="164" stroke="#FFFFFF" stroke-opacity="0.65" stroke-width="2.4" stroke-linecap="round"/>`
        + `<line x1="134" y1="106" x2="156" y2="164" stroke="#FFFFFF" stroke-opacity="0.65" stroke-width="2.4" stroke-linecap="round"/>`
        // Right Modern Glass-Dome Agripark Atrium & IoT Climate Sensor Mast (智慧农科主馆穹顶)
        + `<path d="M 248 92 A 38 36 0 0 1 324 92 Z" fill="${primary}" fill-opacity="0.32" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<path d="M 262 92 A 24 34 0 0 1 310 92" fill="none" stroke="#FFFFFF" stroke-width="1.3"/>`
        + `<rect x="248" y="92" width="76" height="78" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="256" y="102" width="60" height="42" fill="${primary}" fill-opacity="0.28" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<path d="M 272 170 V 150 A 14 14 0 0 1 300 150 V 170 Z" fill="${INK_DARK}" fill-opacity="0.78" stroke="${GOLD}" stroke-width="1.2"/>`
        // IoT Weather & Solar Sensor Tower above Dome
        + `<line x1="286" y1="56" x2="286" y2="36" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + `<line x1="278" y1="42" x2="294" y2="42" stroke="${TERRACOTTA}" stroke-width="1.8"/>`
        + `<circle cx="286" cy="36" r="2.8" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        // Foreground Concrete Agripark Plaza & Landscaped Crop Planter Beds
        + `<rect x="28" y="170" width="302" height="14" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + [54, 108, 162, 216].map(px =>
          `<rect x="${px}" y="173" width="34" height="7" rx="3" fill="${primary}" fill-opacity="0.64" stroke="${INK_DARK}" stroke-width="0.8"/>`,
        ).join('')
      );

    // 95. 赤壁丹霞赤岩峰林与石拱栈道
    case 'red_sandstone_danxia_arch':
      return (
        // Distant Layered Crimson Danxia Peaks visible behind the Natural Arch
        `<path d="M 110 184 L 128 88 Q 160 64 196 86 L 234 184 Z" fill="${TERRACOTTA}" fill-opacity="0.28" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<path d="M 142 184 L 164 102 Q 184 86 206 106 L 224 184 Z" fill="${TERRACOTTA}" fill-opacity="0.44"/>`
        // Grand Sculpted Red Sandstone Danxia Monoliths & Natural Arch Bridge (赤壁丹霞天生石拱)
        + `<path d="M 28 184 L 34 62 Q 58 36 92 48 L 122 66 Q 180 56 238 66 L 268 44 Q 304 38 326 68 L 334 184 H 242 V 144 A 62 56 0 0 0 118 144 V 184 Z" fill="${TERRACOTTA}" fill-opacity="0.84" stroke="${INK_DARK}" stroke-width="1.5"/>`
        // Horizontal Sedimentary Sandstone Strata Bands across Left & Right Cliffs (水平丹霞岩层纹理)
        + [76, 94, 114, 136, 158].map((sy, idx) =>
          `<line x1="${36 + idx * 2}" y1="${sy}" x2="${112 - idx * 2}" y2="${sy}" stroke="${GOLD_LIGHT}" stroke-opacity="0.58" stroke-width="2" stroke-linecap="round"/>`
          + `<line x1="${246 + idx * 2}" y1="${sy}" x2="${324 - idx * 2}" y2="${sy}" stroke="${GOLD_LIGHT}" stroke-opacity="0.58" stroke-width="2" stroke-linecap="round"/>`,
        ).join('')
        + `<line x1="128" y1="74" x2="232" y2="74" stroke="${GOLD}" stroke-opacity="0.72" stroke-width="2.2" stroke-linecap="round"/>`
        + `<line x1="146" y1="84" x2="214" y2="84" stroke="${GOLD_LIGHT}" stroke-opacity="0.62" stroke-width="1.6" stroke-linecap="round"/>`
        // Cliffside Timber Plank-Way Walkway & Cantilevered Viewing Gallery inside Archway (赤壁悬崖栈道)
        + `<line x1="118" y1="140" x2="242" y2="140" stroke="${INK_DARK}" stroke-width="2.4"/>`
        + `<line x1="126" y1="154" x2="118" y2="140" stroke="${INK_DARK}" stroke-width="1.8"/>`
        + `<line x1="158" y1="154" x2="152" y2="140" stroke="${INK_DARK}" stroke-width="1.8"/>`
        + `<line x1="202" y1="154" x2="208" y2="140" stroke="${INK_DARK}" stroke-width="1.8"/>`
        + `<line x1="234" y1="154" x2="242" y2="140" stroke="${INK_DARK}" stroke-width="1.8"/>`
        + drawStoneBalustrade(120, 132, 120, 8, 12, GOLD_LIGHT)
        // Cliff-Ledge Danxia Viewing Pavilion perched at Right Arch Shoulder
        + drawColonnade(244, 108, 42, 24, 2, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(265, 92, 34, 62, 16, primary, INK_DARK, GOLD, 4.5)
        // Foreground Stone Stairway ascending beneath the Arch & Clinging Valley Pines
        + `<polygon points="154,184 166,158 194,158 206,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<line x1="162" y1="166" x2="198" y2="166" stroke="${INK_MID}" stroke-width="1"/>`
        + `<line x1="158" y1="175" x2="202" y2="175" stroke="${INK_MID}" stroke-width="1"/>`
        + drawTreeAccent(86, 184, 'cypress', 1.15, primary)
        + drawTreeAccent(282, 184, 'cypress', 1.1, primary)
      );

    // 96. 林海雪原白桦林屋与森林驿站
    case 'snow_birch_timber_station':
      return (
        // Distant Snow-Dusted Boreal Spruce Forest Ridge (雪原针叶林带)
        `<polygon points="24,184 42,108 58,154 78,94 96,148 264,148 284,92 304,148 320,104 336,184" fill="${primary}" fill-opacity="0.24" stroke="${INK_DARK}" stroke-width="1"/>`
        // Slender White-Barked Birch Trees with Horizontal Dark Lenticel Marks (雪原白桦林)
        + [
          { x: 40, h: 112, w: 7 },
          { x: 64, h: 128, w: 8 },
          { x: 86, h: 98, w: 6 },
          { x: 274, h: 116, w: 7 },
          { x: 298, h: 130, w: 8 },
          { x: 320, h: 102, w: 6 },
        ].map(b => {
          const yTop = 180 - b.h;
          return (
            `<ellipse cx="${b.x}" cy="${yTop + 8}" rx="16" ry="12" fill="${GOLD}" fill-opacity="0.38" stroke="${primary}" stroke-opacity="0.34" stroke-width="1"/>`
            + `<rect x="${b.x - b.w / 2}" y="${yTop}" width="${b.w}" height="${b.h}" rx="2" fill="#FFFFFF" stroke="${INK_DARK}" stroke-width="1.2"/>`
            + `<line x1="${b.x - b.w / 2 + 1}" y1="${yTop + 20}" x2="${b.x + 1}" y2="${yTop + 20}" stroke="${INK_DARK}" stroke-width="1.4"/>`
            + `<line x1="${b.x - 1}" y1="${yTop + 42}" x2="${b.x + b.w / 2 - 1}" y2="${yTop + 42}" stroke="${INK_DARK}" stroke-width="1.4"/>`
            + `<line x1="${b.x - b.w / 2 + 1}" y1="${yTop + 66}" x2="${b.x + 1}" y2="${yTop + 66}" stroke="${INK_DARK}" stroke-width="1.4"/>`
          );
        }).join('')
        // Soft Rolling Foreground Snowdrifts (`y=158..184`)
        + `<path d="M 24 184 Q 96 154 180 168 Q 264 156 336 184 Z" fill="#FFFFFF" stroke="${primary}" stroke-opacity="0.38" stroke-width="1.2"/>`
        // Central Snow-Capped Mukeleng Timber Forestry Station Cabin (白桦森林木刻楞驿站)
        + `<rect x="114" y="114" width="132" height="58" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + [124, 134, 144, 154, 164].map(ly =>
          `<line x1="114" y1="${ly}" x2="246" y2="${ly}" stroke="${STONE_DEEP}" stroke-width="1"/>`,
        ).join('')
        // Stone Chimney with Rising Warm Hearth Smoke
        + `<rect x="210" y="54" width="14" height="36" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 217 50 Q 224 40 215 30 Q 210 24 218 18" stroke="${primary}" stroke-opacity="0.46" stroke-width="1.8" stroke-linecap="round"/>`
        // Steep Pitched Roof with Thick Overhanging Snow Blanket
        + `<polygon points="100,116 180,64 260,116" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 98 114 L 180 60 L 262 114 Q 248 122 232 114 Q 214 122 196 114 Q 180 122 164 114 Q 146 122 128 114 Q 112 122 98 114 Z" fill="#FFFFFF" stroke="${INK_DARK}" stroke-width="1.3"/>`
        // Glowing Amber Cabin Windows, Attic Gable Window & Timber Front Porch
        + `<rect x="170" y="84" width="20" height="16" rx="2" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<line x1="180" y1="84" x2="180" y2="100" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="128" y="128" width="24" height="22" rx="1.5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<line x1="140" y1="128" x2="140" y2="150" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<line x1="128" y1="139" x2="152" y2="139" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="208" y="128" width="24" height="22" rx="1.5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<line x1="220" y1="128" x2="220" y2="150" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<line x1="208" y1="139" x2="232" y2="139" stroke="${INK_DARK}" stroke-width="1"/>`
        // Central Wooden Cabin Door & Covered Porch Balustrade
        + `<rect x="168" y="132" width="24" height="40" rx="1.5" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<circle cx="187" cy="153" r="1.8" fill="${GOLD}"/>`
        + drawStoneBalustrade(116, 162, 48, 10, 5, IVORY)
        + drawStoneBalustrade(196, 162, 48, 10, 5, IVORY)
        // Stacked Firewood & Timber Trailhead Signpost on right
        + `<rect x="94" y="160" width="18" height="14" rx="2" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<circle cx="99" cy="164" r="2.2" fill="${GOLD_LIGHT}"/>`
        + `<circle cx="106" cy="164" r="2.2" fill="${GOLD_LIGHT}"/>`
        + `<circle cx="102" cy="169" r="2.2" fill="${GOLD_LIGHT}"/>`
        + `<line x1="258" y1="142" x2="258" y2="178" stroke="${INK_DARK}" stroke-width="2"/>`
        + `<polygon points="246,144 272,144 278,149 272,154 246,154" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
      );

    // 97. 河口潮汐挡潮闸桥与滩涂海堤
    case 'tidal_estuary_sluice_bridge':
      return (
        // Armored Left & Right Stone Seawall Embankments (鱼鳞石海塘与护滩大堤)
        `<polygon points="24,184 24,116 66,116 92,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="268,184 294,116 336,116 336,184" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [132, 148, 164].map((ry, idx) =>
          `<line x1="24" y1="${ry}" x2="${70 + idx * 8}" y2="${ry}" stroke="${STONE_DEEP}" stroke-width="1.2"/>`
          + `<line x1="${290 - idx * 8}" y1="${ry}" x2="336" y2="${ry}" stroke="${STONE_DEEP}" stroke-width="1.2"/>`,
        ).join('')
        // Tidal Mudflat Reed Clumps & Riprap Armor Blocks on Left Seawall Toe
        + `<path d="M 30 184 L 28 164 M 35 184 L 36 160 M 40 184 L 43 166" stroke="${primary}" stroke-width="1.6" stroke-linecap="round"/>`
        + `<polygon points="74,184 82,172 94,174 98,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<polygon points="262,184 268,172 280,174 286,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1"/>`
        // Right Embankment Tide-Watching Pavilion (海塘观潮亭)
        + drawColonnade(296, 92, 34, 24, 2, IVORY, TERRACOTTA, INK_DARK)
        + drawChineseEaveTier(313, 76, 26, 48, 16, primary, INK_DARK, GOLD, 4)
        // Estuary Water Surface & Surging Tidal Bore Wave Crest (钱塘涌潮浪涌)
        + `<path d="M 80 158 Q 140 152 180 156 T 280 154 V 184 H 80 Z" fill="${primary}" fill-opacity="0.28" stroke="${primary}" stroke-opacity="0.45" stroke-width="1"/>`
        + `<path d="M 88 172 Q 130 158 172 170 Q 214 156 266 172 L 266 180 Q 214 166 172 178 Q 130 168 88 180 Z" fill="#FFFFFF" fill-opacity="0.9" stroke="${primary}" stroke-opacity="0.48" stroke-width="1.1"/>`
        // 5-Bay Sluice Gate Bridge Piers & Hoist-Tower Control Cabins (挡潮闸桥启闭塔楼)
        + [70, 114, 158, 202, 246, 290].map(px =>
          `<polygon points="${px - 7},184 ${px - 5},106 ${px + 5},106 ${px + 7},184" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
          + `<rect x="${px - 8}" y="82" width="16" height="24" rx="1.5" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
          + `<polygon points="${px - 10},82 ${px},73 ${px + 10},82" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.1"/>`
          + `<rect x="${px - 4}" y="88" width="8" height="8" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.8"/>`,
        ).join('')
        // Suspended Steel Sluice Gates with Lifting Hoist Cables between Piers
        + [
          { x: 77, open: 8 },
          { x: 121, open: 14 },
          { x: 165, open: 18 },
          { x: 209, open: 14 },
          { x: 253, open: 8 },
        ].map(g => {
          const gy = 132 - g.open * 0.45;
          return (
            `<line x1="${g.x + 8}" y1="106" x2="${g.x + 8}" y2="${gy}" stroke="${GOLD}" stroke-width="1.4"/>`
            + `<line x1="${g.x + 22}" y1="106" x2="${g.x + 22}" y2="${gy}" stroke="${GOLD}" stroke-width="1.4"/>`
            + `<rect x="${g.x}" y="${gy}" width="30" height="24" fill="${TERRACOTTA}" fill-opacity="0.82" stroke="${INK_DARK}" stroke-width="1.2"/>`
            + `<line x1="${g.x + 2}" y1="${gy + 8}" x2="${g.x + 28}" y2="${gy + 8}" stroke="${INK_DARK}" stroke-width="1"/>`
            + `<line x1="${g.x + 2}" y1="${gy + 16}" x2="${g.x + 28}" y2="${gy + 16}" stroke="${INK_DARK}" stroke-width="1"/>`
          );
        }).join('')
        // Upper Roadway Deck Span & Balustrade across All 5 Tidal Bays
        + `<rect x="62" y="106" width="236" height="10" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + drawStoneBalustrade(64, 99, 232, 7, 16, IVORY)
      );

    // 98. 火山玄武岩海蚀柱与石林岸壁
    case 'volcanic_basalt_sea_stack':
      return (
        // Distant Volcanic Sea Horizon & Breaking Ocean Swell (`y=146..184`)
        `<path d="M 24 150 Q 112 142 204 148 T 336 144 V 184 H 24 Z" fill="${primary}" fill-opacity="0.24" stroke="${primary}" stroke-opacity="0.45" stroke-width="1.1"/>`
        + `<path d="M 32 168 Q 92 162 152 168 T 274 166 T 328 168" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/>`
        // Left-Center Cluster of Hexagonal Columnar-Jointed Basalt Sea Stacks (玄武岩柱状节理海蚀柱群)
        + [
          { x: 52, yTop: 108, w: 14, shade: STONE_DEEP },
          { x: 66, yTop: 78, w: 15, shade: INK_MID },
          { x: 81, yTop: 52, w: 16, shade: STONE_DEEP },
          { x: 97, yTop: 38, w: 17, shade: INK_DARK },
          { x: 114, yTop: 48, w: 16, shade: INK_MID },
          { x: 130, yTop: 72, w: 15, shade: STONE_DEEP },
          { x: 145, yTop: 98, w: 14, shade: INK_MID },
        ].map(col => (
          `<polygon points="${col.x},${col.yTop + 4} ${col.x + col.w * 0.5},${col.yTop} ${col.x + col.w},${col.yTop + 4} ${col.x + col.w},176 ${col.x},176" fill="${col.shade}" stroke="${INK_DARK}" stroke-width="1.3"/>`
          + `<polygon points="${col.x},${col.yTop + 4} ${col.x + col.w * 0.5},${col.yTop} ${col.x + col.w},${col.yTop + 4} ${col.x + col.w * 0.5},${col.yTop + 8}" fill="${STONE}" stroke="${INK_DARK}" stroke-width="0.9"/>`
          + `<line x1="${col.x + 2}" y1="${col.yTop + 26}" x2="${col.x + col.w - 2}" y2="${col.yTop + 26}" stroke="${INK_DARK}" stroke-opacity="0.42" stroke-width="1"/>`
          + `<line x1="${col.x + 2}" y1="${col.yTop + 52}" x2="${col.x + col.w - 2}" y2="${col.yTop + 52}" stroke="${INK_DARK}" stroke-opacity="0.42" stroke-width="1"/>`
        )).join('')
        // Detached Offshore Basalt Needle Sea Stack Spire (海上孤立海蚀岩柱)
        + `<polygon points="174,178 179,76 188,68 196,78 202,178" fill="${INK_MID}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<line x1="188" y1="70" x2="188" y2="174" stroke="${STONE}" stroke-opacity="0.35" stroke-width="1.3"/>`
        // Right Wave-Undercut Basalt Sea-Arch Headland Cliff (海蚀拱门石林岸壁)
        + `<path d="M 218 184 L 222 86 L 246 72 L 288 64 L 334 78 L 336 184 H 286 V 148 A 20 26 0 0 0 246 148 V 184 Z" fill="${INK_MID}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + [232, 248, 266, 284, 302, 318].map((rx, idx) =>
          `<line x1="${rx}" y1="${74 + (idx % 2) * 8}" x2="${rx}" y2="${idx === 2 || idx === 3 ? 118 : 176}" stroke="${STONE}" stroke-opacity="0.38" stroke-width="1.2"/>`,
        ).join('')
        // Cliff-Top Coastal Beacon & Pine + White Sea-Foam Collars at Stack Bases
        + `<rect x="292" y="42" width="12" height="26" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="292" y="50" width="12" height="6" fill="${TERRACOTTA}"/>`
        + `<polygon points="290,42 298,34 306,42" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<path d="M 46 176 Q 102 170 158 176 M 168 178 Q 188 172 208 178 M 214 180 Q 272 172 332 180" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>`
        + `<path d="M 152 42 Q 158 37 164 42 Q 170 37 176 42" stroke="${INK_DARK}" stroke-width="1.2" stroke-linecap="round"/>`
        + `<path d="M 212 34 Q 217 30 222 34 Q 227 30 232 34" stroke="${INK_DARK}" stroke-width="1.1" stroke-linecap="round"/>`
        + drawTreeAccent(322, 78, 'cypress', 0.85, primary)
      );

    // 99. 喀斯特溶洞石笋穹顶与暗河观景栈道
    case 'subterranean_karst_cavern_hall':
      return (
        // Outer Dark Limestone Cavern Frame & Warmly Lit Subterranean Dome Vault (喀斯特溶洞天然穹顶)
        `<path d="M 24 184 L 24 44 Q 180 14 336 44 L 336 184 Z" fill="${INK_DARK}" fill-opacity="0.86" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<path d="M 38 184 L 44 82 Q 112 28 180 30 Q 252 28 316 82 L 322 184 Z" fill="${primary}" fill-opacity="0.24" stroke="${STONE_DEEP}" stroke-width="1.2"/>`
        + `<ellipse cx="180" cy="108" rx="108" ry="62" fill="${GOLD_LIGHT}" fill-opacity="0.28"/>`
        // Ceiling Curtains of Hanging Tapered Stalactites (钟乳石群)
        + [
          { x: 70, y: 52, w: 12, h: 36 },
          { x: 92, y: 42, w: 10, h: 28 },
          { x: 114, y: 36, w: 14, h: 46 },
          { x: 138, y: 32, w: 9, h: 26 },
          { x: 162, y: 30, w: 13, h: 40 },
          { x: 184, y: 30, w: 15, h: 52 },
          { x: 208, y: 32, w: 10, h: 32 },
          { x: 230, y: 35, w: 14, h: 44 },
          { x: 254, y: 40, w: 11, h: 30 },
          { x: 278, y: 48, w: 12, h: 38 },
        ].map(st =>
          `<polygon points="${st.x - st.w / 2},${st.y} ${st.x + st.w / 2},${st.y} ${st.x},${st.y + st.h}" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1"/>`,
        ).join('')
        // Monumental Uplighted Karst Stalagmites & Floor-to-Ceiling Limestone Pillars (巨型石笋与石柱)
        + `<polygon points="56,166 70,78 86,166" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="104,162 118,92 134,162" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<polygon points="222,160 236,68 250,160" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="268,166 284,48 302,166" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<ellipse cx="70" cy="162" rx="18" ry="6" fill="${GOLD}" fill-opacity="0.46"/>`
        + `<ellipse cx="236" cy="158" rx="18" ry="6" fill="${TERRACOTTA}" fill-opacity="0.38"/>`
        // Terraced Travertine Rimstone Pools on Left (钙华梯田池)
        + `<path d="M 42 150 Q 74 142 108 152 L 108 164 H 42 Z" fill="${primary}" fill-opacity="0.44" stroke="${GOLD_LIGHT}" stroke-width="1.2"/>`
        // Subterranean Dark River Channel Winding Across Cavern Floor (地下暗河)
        + `<path d="M 38 164 Q 130 156 226 164 T 322 162 V 184 H 38 Z" fill="${primary}" fill-opacity="0.38" stroke="${primary}" stroke-opacity="0.6" stroke-width="1"/>`
        // Illuminated Curved Cavern Viewing Boardwalk & Balustrade (溶洞观景栈道)
        + `<path d="M 88 154 Q 180 134 276 154 L 276 160 Q 180 140 88 160 Z" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + [96, 124, 152, 180, 208, 236, 266].map(px => {
          const py = 148 + Math.abs(px - 180) * 0.06;
          return `<line x1="${px}" y1="${py - 7}" x2="${px}" y2="${py + 4}" stroke="${IVORY}" stroke-width="1.2"/>`;
        }).join('')
        + `<path d="M 94 146 Q 180 126 268 146" stroke="${IVORY}" stroke-width="1.3" stroke-linecap="round"/>`
        // Lantern-Lit Subterranean Sightseeing Boat Gliding on Dark River
        + `<polygon points="154,174 198,174 190,181 162,181" fill="${TERRACOTTA}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<circle cx="176" cy="170" r="3" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<line x1="158" y1="183" x2="194" y2="183" stroke="${GOLD_LIGHT}" stroke-width="1.1" stroke-linecap="round"/>`
      );

    // 100. 水面漂浮光伏方阵与湖库绿色电站
    case 'floating_solar_reservoir_array':
      return (
        // Distant Reclaimed Coal-Subsidence Lake Shoreline & Twin High-Voltage Pylons (采煤沉陷湖绿岸与输电塔)
        `<path d="M 24 114 Q 120 104 220 112 T 336 108 V 120 H 24 Z" fill="${primary}" fill-opacity="0.28" stroke="${INK_DARK}" stroke-width="1"/>`
        + [46, 314].map(tx =>
          `<polygon points="${tx - 9},108 ${tx - 3},60 ${tx + 3},60 ${tx + 9},108" fill="none" stroke="${INK_DARK}" stroke-width="1.2"/>`
          + `<line x1="${tx - 12}" y1="72" x2="${tx + 12}" y2="72" stroke="${INK_DARK}" stroke-width="1.3"/>`
          + `<line x1="${tx - 9}" y1="86" x2="${tx + 9}" y2="86" stroke="${INK_DARK}" stroke-width="1.2"/>`
          + `<line x1="${tx - 6}" y1="86" x2="${tx + 6}" y2="98" stroke="${INK_DARK}" stroke-width="0.9"/>`,
        ).join('')
        + `<path d="M 54 72 Q 180 86 306 72" stroke="${INK_DARK}" stroke-opacity="0.34" stroke-width="0.9"/>`
        // Expansive Tranquil Reservoir Water Basin (`y=116..184`)
        + `<rect x="24" y="116" width="312" height="68" fill="${primary}" fill-opacity="0.18" stroke="${primary}" stroke-opacity="0.38" stroke-width="1"/>`
        // 3 Perspective Rows of Buoyant Floating Photovoltaic Solar Panel Arrays (水面漂浮光伏方阵)
        + [
          { y: 124, h: 11, xs: [56, 94, 132, 170] },
          { y: 142, h: 13, xs: [46, 88, 130, 172] },
          { y: 162, h: 15, xs: [36, 82, 128, 174] },
        ].map(row =>
          row.xs.map(px =>
            `<rect x="${px - 2}" y="${row.y + row.h - 2}" width="34" height="4" rx="1" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="0.8"/>`
            + `<polygon points="${px},${row.y + row.h - 1} ${px + 6},${row.y} ${px + 36},${row.y} ${px + 30},${row.y + row.h - 1}" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.1"/>`
            + `<line x1="${px + 13}" y1="${row.y + 1}" x2="${px + 9}" y2="${row.y + row.h - 2}" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="0.9"/>`
            + `<line x1="${px + 25}" y1="${row.y + 1}" x2="${px + 21}" y2="${row.y + row.h - 2}" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="0.9"/>`,
          ).join(''),
        ).join('')
        // Central Floating Inverter & Booster Substation Pontoon Platform (水上漂浮升压站)
        + `<rect x="220" y="142" width="52" height="10" rx="1.5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="226" y="124" width="18" height="18" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<rect x="248" y="128" width="18" height="14" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + `<rect x="230" y="128" width="10" height="6" fill="${primary}" fill-opacity="0.65"/>`
        // Articulated Pontoon Maintenance Bridge linking Floating Substation to Shoreline Control Hub
        + `<rect x="272" y="138" width="22" height="5" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="288" y="96" width="44" height="36" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<polygon points="284,96 310,82 336,96" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<rect x="296" y="106" width="28" height="12" fill="${primary}" fill-opacity="0.34" stroke="${INK_DARK}" stroke-width="0.9"/>`
        + `<path d="M 48 182 Q 112 178 182 182 M 234 176 Q 272 172 314 176" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round"/>`
      );

    // 101. 山岳高铁跨谷高架特大桥与隧道群
    case 'high_speed_viaduct_mountain_tunnel':
      return (
        // Distant Karst Gorge Valley Peak & Gorge River (`y=162..184`)
        `<polygon points="104,184 146,96 184,126 226,88 264,184" fill="${primary}" fill-opacity="0.16" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<path d="M 96 168 Q 180 162 264 168 V 184 H 96 Z" fill="${primary}" fill-opacity="0.28" stroke="${primary}" stroke-opacity="0.45" stroke-width="1"/>`
        // Left & Right Towering Mountain Canyon Rock Cliffs with Horseshoe HSR Tunnel Portals
        + `<polygon points="24,184 24,48 72,38 106,82 102,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<polygon points="258,184 254,82 288,38 336,48 336,184" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        // Left & Right Tunnel Portal Concrete Wing-Walls & Dark Horseshoe Tunnel Bores (高铁隧道洞门)
        + `<rect x="64" y="66" width="34" height="30" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 71 96 V 78 A 10 10 0 0 1 91 78 V 96 Z" fill="${INK_DARK}"/>`
        + `<rect x="262" y="66" width="34" height="30" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<path d="M 269 96 V 78 A 10 10 0 0 1 289 78 V 96 Z" fill="${INK_DARK}"/>`
        // Sweeping Parabolic Arch Span & Tall Concrete Hollow Viaduct Piers spanning the Chasm
        + [108, 142, 218, 252].map(px =>
          `<polygon points="${px - 5},180 ${px - 3},98 ${px + 3},98 ${px + 5},180" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.2"/>`,
        ).join('')
        + `<path d="M 110 164 Q 180 96 250 164" fill="none" stroke="${TERRACOTTA}" stroke-width="5.5" stroke-linecap="round"/>`
        + `<path d="M 110 164 Q 180 96 250 164" fill="none" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + [126, 152, 180, 208, 234].map(sx => {
          const dist = Math.abs(sx - 180) / 70;
          const yArch = Math.round(130 + dist * dist * 32);
          return `<line x1="${sx}" y1="98" x2="${sx}" y2="${yArch}" stroke="${INK_MID}" stroke-width="2"/>`;
        }).join('')
        // High-Speed Viaduct Box-Girder Deck & Catenary Portal Masts (高架箱梁与接触网)
        + `<rect x="78" y="92" width="204" height="8" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + [108, 156, 204, 252].map(mx =>
          `<line x1="${mx}" y1="74" x2="${mx}" y2="92" stroke="${INK_DARK}" stroke-width="1.4"/>`
          + `<line x1="${mx - 4}" y1="77" x2="${mx + 4}" y2="77" stroke="${TERRACOTTA}" stroke-width="1.3"/>`,
        ).join('')
        + `<line x1="94" y1="79" x2="266" y2="79" stroke="${INK_DARK}" stroke-opacity="0.45" stroke-width="0.9"/>`
        // Sleek Fuxing High-Speed Bullet Train Gliding Across Gorge Viaduct (复兴号动车组)
        + `<path d="M 92 92 V 83 H 224 Q 240 83 246 92 Z" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="94" y1="88" x2="242" y2="88" stroke="${TERRACOTTA}" stroke-width="2.2"/>`
        + [102, 118, 134, 150, 166, 182, 198, 214].map(wx =>
          `<rect x="${wx}" y="84.5" width="10" height="3" rx="0.8" fill="${primary}"/>`,
        ).join('')
        + `<polygon points="228,84.5 236,84.5 241,87.5 228,87.5" fill="${INK_DARK}"/>`
        + drawTreeAccent(42, 116, 'cypress', 0.9, primary)
        + drawTreeAccent(318, 116, 'cypress', 0.9, primary)
      );

    // 102. 古龙窑阶梯窑棚与青瓷窑烟囱
    case 'ceramic_dragon_kiln_chimney':
      return (
        // Verdant Hillside Ridge ascending rightwards supporting the Stepped Dragon Kiln (依山坡地)
        `<path d="M 24 184 L 24 154 Q 130 132 232 94 L 336 68 V 184 Z" fill="${primary}" fill-opacity="0.2" stroke="${INK_DARK}" stroke-width="1.2"/>`
        // Tall Tapered Ancient Brick Kiln Chimney at Kiln Head (`x=244..268, y=24..116`)
        + `<polygon points="244,114 250,28 262,28 268,114" fill="${TERRACOTTA}" fill-opacity="0.86" stroke="${INK_DARK}" stroke-width="1.4"/>`
        + `<rect x="247" y="25" width="18" height="5" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        + [46, 66, 86].map(hy =>
          `<line x1="248" y1="${hy}" x2="264" y2="${hy}" stroke="${INK_DARK}" stroke-width="1.5"/>`,
        ).join('')
        + `<path d="M 256 22 Q 266 14 254 8" stroke="${primary}" stroke-opacity="0.48" stroke-width="2" stroke-linecap="round"/>`
        // 6-Tier Stepped Ascending Dragon Kiln Shed & Brick Firebox Arches (阶梯式古龙窑长棚与窑门)
        + [
          { x: 54, y: 138 },
          { x: 86, y: 126 },
          { x: 118, y: 114 },
          { x: 150, y: 102 },
          { x: 182, y: 90 },
          { x: 214, y: 78 },
        ].map(seg =>
          `<rect x="${seg.x}" y="${seg.y + 12}" width="34" height="22" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.2"/>`
          + `<path d="M ${seg.x + 11} ${seg.y + 34} V ${seg.y + 22} A 6 6 0 0 1 ${seg.x + 23} ${seg.y + 22} V ${seg.y + 34} Z" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1.1"/>`
          + `<circle cx="${seg.x + 17}" cy="${seg.y + 26}" r="2.8" fill="${TERRACOTTA}"/>`
          + `<polygon points="${seg.x - 4},${seg.y + 13} ${seg.x + 17},${seg.y} ${seg.x + 38},${seg.y + 13}" fill="${primary}" stroke="${INK_DARK}" stroke-width="1.3"/>`
          + `<line x1="${seg.x + 6}" y1="${seg.y + 5}" x2="${seg.x + 28}" y2="${seg.y + 5}" stroke="${GOLD}" stroke-width="1.6"/>`,
        ).join('')
        // Foreground Porcelain Drying Rack & Celadon Vases + Stacked Kiln Saggars (青瓷晾坯架与匣钵)
        + `<rect x="46" y="158" width="96" height="4" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<rect x="46" y="170" width="96" height="4" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<line x1="52" y1="152" x2="52" y2="184" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + `<line x1="136" y1="152" x2="136" y2="184" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + [66, 86, 106, 124].map(vx =>
          `<ellipse cx="${vx}" cy="154" rx="4.5" ry="5" fill="${primary}" fill-opacity="0.72" stroke="${INK_DARK}" stroke-width="0.9"/>`
          + `<rect x="${vx - 2}" y="147" width="4" height="3" fill="${IVORY}" stroke="${INK_DARK}" stroke-width="0.7"/>`,
        ).join('')
        + [164, 180, 196].map(sx =>
          `<rect x="${sx}" y="168" width="12" height="14" rx="1.5" fill="${STONE_DEEP}" stroke="${INK_DARK}" stroke-width="1"/>`
          + `<line x1="${sx}" y1="175" x2="${sx + 12}" y2="175" stroke="${INK_DARK}" stroke-width="0.9"/>`,
        ).join('')
        + drawTreeAccent(308, 184, 'cypress', 1.2, primary)
        + drawTreeAccent(324, 184, 'bamboo', 1.1, primary)
      );

    // 103. 高寒垭口经幡牧场与牦牛毡房
    case 'alpine_yak_meadow_pass':
      return (
        // Towering Snow-Capped Mountain Pass Saddle Framing Central Notch (雪山垭口)
        `<polygon points="24,146 66,52 118,96 180,98 242,96 294,46 336,146" fill="${primary}" fill-opacity="0.22" stroke="${INK_DARK}" stroke-width="1.2"/>`
        + `<polygon points="66,52 50,86 64,80 74,90 88,78" fill="#FFFFFF" fill-opacity="0.88"/>`
        + `<polygon points="294,46 276,82 290,76 302,86 314,76" fill="#FFFFFF" fill-opacity="0.86"/>`
        // Rolling Alpine Cushion Meadow (`y=114..184`)
        + `<path d="M 24 184 Q 100 112 180 122 Q 260 112 336 184 Z" fill="${primary}" fill-opacity="0.22" stroke="${INK_DARK}" stroke-width="1.1"/>`
        // Pass Crest Mani Stone Oboo Cairn & 5-Color Prayer Flag Strings (垭口经幡阵)
        + `<polygon points="164,122 174,104 186,104 196,122" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="180" y1="54" x2="180" y2="106" stroke="${INK_DARK}" stroke-width="2"/>`
        + `<line x1="94" y1="68" x2="94" y2="128" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + `<line x1="266" y1="68" x2="266" y2="128" stroke="${INK_DARK}" stroke-width="1.6"/>`
        + `<path d="M 94 74 Q 137 92 180 62 Q 223 92 266 74" stroke="${INK_DARK}" stroke-width="1.1"/>`
        + [
          { x: 108, y: 80, c: TERRACOTTA },
          { x: 124, y: 82, c: GOLD },
          { x: 142, y: 78, c: primary },
          { x: 158, y: 72, c: IVORY },
          { x: 198, y: 72, c: TERRACOTTA },
          { x: 214, y: 78, c: GOLD },
          { x: 232, y: 82, c: primary },
          { x: 248, y: 80, c: IVORY },
        ].map(f =>
          `<rect x="${f.x}" y="${f.y}" width="10" height="9" fill="${f.c}" stroke="${INK_DARK}" stroke-width="0.7"/>`,
        ).join('')
        // Highland Black Yak-Hair Woven Nomadic Tent (黑牦牛帐篷) on Right Meadow
        + `<polygon points="218,162 232,134 276,134 290,162" fill="${INK_DARK}" fill-opacity="0.88" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + `<line x1="232" y1="134" x2="276" y2="134" stroke="#FFFFFF" stroke-width="2.2"/>`
        + `<line x1="232" y1="134" x2="210" y2="162" stroke="${GOLD}" stroke-width="1"/>`
        + `<line x1="276" y1="134" x2="298" y2="162" stroke="${GOLD}" stroke-width="1"/>`
        + `<rect x="248" y="146" width="12" height="16" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="1"/>`
        + `<path d="M 254 128 Q 260 118 252 108" stroke="#FFFFFF" stroke-opacity="0.75" stroke-width="1.8" stroke-linecap="round"/>`
        // Foreground Grazing Highland Yaks (高原长毛牦牛剪影)
        + [
          { x: 64, y: 162, s: 1.0 },
          { x: 118, y: 168, s: 1.15 },
          { x: 168, y: 156, s: 0.85 },
        ].map(yak => {
          const w = Math.round(24 * yak.s);
          const h = Math.round(13 * yak.s);
          return (
            `<ellipse cx="${yak.x}" cy="${yak.y}" rx="${w / 2}" ry="${h / 2}" fill="${INK_DARK}"/>`
            + `<circle cx="${yak.x - w * 0.42}" cy="${yak.y - h * 0.15}" r="${Math.round(4.5 * yak.s)}" fill="${INK_DARK}"/>`
            + `<path d="M ${yak.x - w * 0.45} ${yak.y - h * 0.35} Q ${yak.x - w * 0.65} ${yak.y - h * 0.75} ${yak.x - w * 0.38} ${yak.y - h * 0.68}" stroke="${IVORY}" stroke-width="1.4" stroke-linecap="round"/>`
            + `<line x1="${yak.x - w * 0.25}" y1="${yak.y + h * 0.3}" x2="${yak.x - w * 0.25}" y2="${yak.y + h * 0.82}" stroke="${INK_DARK}" stroke-width="2"/>`
            + `<line x1="${yak.x + w * 0.25}" y1="${yak.y + h * 0.3}" x2="${yak.x + w * 0.25}" y2="${yak.y + h * 0.82}" stroke="${INK_DARK}" stroke-width="2"/>`
          );
        }).join('')
        + `<path d="M 48 182 Q 130 172 206 182" stroke="${primary}" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round"/>`
      );

    // 104. 丝路古驿城土夯拱门与胡杨烽燧
    case 'ancient_silk_caravanserai_gate':
    default:
      return (
        // Distant Han-Tang Rammed-Earth Beacon Watchtower on Left Dune (丝路汉唐夯土烽燧)
        `<polygon points="40,162 48,80 68,80 76,162" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.3"/>`
        + [96, 114, 132, 148].map(by =>
          `<line x1="${44 + (by > 120 ? 0 : 2)}" y1="${by}" x2="${72 - (by > 120 ? 0 : 2)}" y2="${by}" stroke="${STONE_DEEP}" stroke-width="1.2"/>`,
        ).join('')
        // Central Monumental Rammed-Earth Caravanserai Fortress Gate & Corner Bastions (丝路土夯古驿城门)
        + `<polygon points="94,182 100,66 136,66 138,182" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<polygon points="222,182 224,66 260,66 266,182" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        + `<rect x="134" y="76" width="92" height="106" fill="${STONE}" stroke="${INK_DARK}" stroke-width="1.5"/>`
        // Weathered Adobe Battlement Crenellations & Tamped-Earth Strata Seams (版筑夯土层理)
        + [102, 118, 138, 156, 174, 192, 210, 226, 242].map(cxPos =>
          `<rect x="${cxPos}" y="${cxPos < 136 || cxPos > 220 ? 58 : 68}" width="10" height="8" fill="${GOLD_LIGHT}" stroke="${INK_DARK}" stroke-width="1.1"/>`,
        ).join('')
        + [94, 112, 132, 152].map(sy =>
          `<line x1="102" y1="${sy}" x2="132" y2="${sy}" stroke="${TERRACOTTA}" stroke-opacity="0.34" stroke-width="1.4"/>`
          + `<line x1="228" y1="${sy}" x2="258" y2="${sy}" stroke="${TERRACOTTA}" stroke-opacity="0.34" stroke-width="1.4"/>`,
        ).join('')
        // Deep Pointed Desert Caravan Portal Arch revealing Vaulted Inner Courtyard Arcade
        + `<path d="M 152 182 V 132 Q 152 106 180 100 Q 208 106 208 132 V 182 Z" fill="${INK_DARK}" fill-opacity="0.82" stroke="${TERRACOTTA}" stroke-width="2"/>`
        + `<path d="M 162 182 V 142 A 18 18 0 0 1 198 142 V 182 Z" fill="${GOLD}" fill-opacity="0.28" stroke="${GOLD_LIGHT}" stroke-width="1"/>`
        + `<circle cx="180" cy="118" r="3" fill="${GOLD}" stroke="${INK_DARK}" stroke-width="0.9"/>`
        // Golden Populus Euphratica Desert Trees on Right Flank (大漠千年胡杨树)
        + [
          { x: 288, h: 66 },
          { x: 318, h: 52 },
        ].map(p =>
          `<path d="M ${p.x} 182 Q ${p.x - 4} ${182 - p.h * 0.5} ${p.x + 4} ${182 - p.h}" stroke="${INK_DARK}" stroke-width="2.8" stroke-linecap="round"/>`
          + `<ellipse cx="${p.x - 6}" cy="${182 - p.h}" rx="14" ry="11" fill="${GOLD}" fill-opacity="0.84" stroke="${INK_DARK}" stroke-width="1.1"/>`
          + `<ellipse cx="${p.x + 10}" cy="${182 - p.h + 6}" rx="12" ry="9" fill="${TERRACOTTA}" fill-opacity="0.62" stroke="${INK_DARK}" stroke-width="1"/>`,
        ).join('')
        // Foreground Silk Road Camel Caravan Silhouette walking toward Gate Portal (丝路驼队剪影)
        + [116, 138, 160].map(kx =>
          `<ellipse cx="${kx}" cy="172" rx="6" ry="4" fill="${INK_DARK}"/>`
          + `<circle cx="${kx - 2}" cy="167" r="2.6" fill="${INK_DARK}"/>`
          + `<path d="M ${kx + 5} 171 Q ${kx + 9} 166 ${kx + 11} 162" stroke="${INK_DARK}" stroke-width="1.8" stroke-linecap="round"/>`
          + `<line x1="${kx - 3}" y1="175" x2="${kx - 3}" y2="182" stroke="${INK_DARK}" stroke-width="1.4"/>`
          + `<line x1="${kx + 3}" y1="175" x2="${kx + 3}" y2="182" stroke="${INK_DARK}" stroke-width="1.4"/>`,
        ).join('')
        + `<path d="M 32 182 Q 110 176 180 182 T 328 180" stroke="${TERRACOTTA}" stroke-opacity="0.38" stroke-width="1.4" stroke-linecap="round"/>`
      );
  }
}

export function renderLandmarkCardSvg(spec: LandmarkRenderSpec, ink?: FigureInk): string {
  const primary = typeof ink === 'string' ? ink : ink?.primary ?? spec.accentHex;
  const secondary = typeof ink === 'object' && ink?.secondary ? ink.secondary : '#8A3449';
  const seed = hashCode(`${spec.code}:${spec.kind}`);
  const meta = ARCHETYPE_GENERIC_META[spec.kind];

  const backdrop = drawAtmosphericBackdrop(meta.backdrop, Boolean(meta.waterfront), seed, primary, secondary);
  const landmarkSvg = renderArchetypeBody(spec.kind, seed, primary, secondary);

  // Top-left 5-dimension dot badge
  const dimDots =
    `<rect x="10" y="10" width="54" height="16" rx="8" fill="#FFFFFF" fill-opacity="0.88" stroke="${primary}" stroke-opacity="0.22" stroke-width="0.9"/>`
    + [0, 1, 2, 3, 4]
      .map(
        i =>
          `<circle cx="${19 + i * 9}" cy="18" r="2.6" fill="${i % 2 === 0 ? primary : GOLD}" fill-opacity="${i === 0 ? '0.96' : '0.72'}"/>`,
      )
      .join('');

  // Bottom floating landmark plaque pill (`🏛️ 地标 · ${shortLandmarkName}`)
  const shortName = formatPlaqueName(spec.landmarkName);
  const labelText = `🏛️ 地标 · ${shortName}`;
  const fontSize = shortName.length > 12 ? 9.2 : 10.2;
  const pillW = Math.min(342, Math.max(140, Math.round(textWidthUnits(labelText) * fontSize + 34)));
  const pillX = Math.round(180 - pillW / 2);
  const plaque =
    `<rect x="${pillX}" y="196" width="${pillW}" height="20" rx="10" fill="#FFFFFF" fill-opacity="0.94" stroke="${primary}" stroke-opacity="0.34" stroke-width="1"/>`
    + `<text x="180" y="209.5" text-anchor="middle" font-family="PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif" font-size="${fontSize}" font-weight="600" fill="${INK_DARK}">${escapeXml(labelText)}</text>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 225" width="360" height="225" fill="none">`
    + backdrop
    + landmarkSvg
    + dimDots
    + plaque
    + `</svg>`
  );
}
