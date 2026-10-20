"""Deterministic editorial draft builder. No network and no auto-publication."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
APP = ROOT / 'apps/frontend'
CATALOG = json.loads((APP / 'content/topic-advisor/regions.catalog.json').read_text(encoding='utf-8'))
VERSION = CATALOG['catalogVersion']
CAPTURES = {s['id']: s for s in json.loads((HERE / 'captures.json').read_text(encoding='utf-8'))['sources']}
RECOVERY = {s['id']: s for s in json.loads((HERE / 'recovery.json').read_text(encoding='utf-8'))['sources']}

SOURCE_NOTES = {
 'miit-2025-clusters': ('2025年度（第四批）中小企业特色产业集群名单', None, 'official_ministry_listing', '附件1；对应集群序号及物理页码见facts与本包说明'),
 'mct-rural-2022': ('全国乡村旅游重点村数据服务', None, 'official_ministry_data', '页面数据截止日期2022-12-07；对应省份下的具体村名'),
 'tongcheng-gig-2024': ('通城：“零工驿站”拓宽就业路', '2024-05-10', 'official_provincial_department_county_authored', '正文介绍挂牌驿站、服务窗口和求职登记的段落'),
 'jinxi-chain-2025': ('聚焦·科技创新丨促进创新源泉充分涌流', None, 'unread_official_page', '检索线索，正文获取失败；不进入公开来源和事实'),
 'wenxi-visit-2025': ('市工信局调研闻喜工业产业发展情况', '2025-07-01', 'official_city_department', '全文调研对象、镁精深加工、特钢及技能竞赛段落'),
 'pingyang-plan-2025': ('平阳县工业经济提升发展三年行动计划（2025—2027年）', None, 'unread_official_page', '检索线索，正文获取失败；不进入公开来源和事实'),
 'anxi-report-2024': ('2024年安溪县人民政府工作报告', '2024-01-12', 'official_county_report_metadata_conflict', '工作安排中藤铁工艺园、设计节、行业标准和市场拓展段；meta来源字段待复核'),
 'guangshan-digital-2026': ('光山县：40年羽绒制品产业迎来“数智蝶变”', None, 'unread_official_page', '检索线索，403未读取正文；不进入公开来源和事实'),
 'chengmai-report-2025': ('2025年澄迈县政府工作报告', None, 'unread_official_page', '检索线索，正文获取失败；不进入公开来源和事实'),
 'yimen-pesticide-2024': ('易门县农业农村局组织开展农药包装废弃物回收处理工作', '2024-11-29', 'official_county_department', '正文启动年份、农业面源污染与回收处理工作段'),
 'yiwu-jobs-2025': ('伊吾县人力资源和社会保障局2025年度工作报告', '2026-04-01', 'official_county_department', '一、坚持就业优先；职业技能培训及就业支持措施段'),
 'pingshan-tourism-2020': ('传承红色基因 打造一流乡村旅游度假区——河北省石家庄市李家庄', '2020-04-23', 'official_national_department_case', '案例介绍的红色资源、农业科普及旅游组织段'),
 'wushen-tourism': ('乌审旗旅游概况', '2026-03-12', 'official_county_department', '页面发布日期；四、巴图湾红色文化小镇简介，正文第1—3段'),
 'xinbin-heritage-2025': ('赫图阿拉城（4A）', '2025-10-11', 'official_province_tourism_information', '景区介绍中位置、建筑遗迹及旗袍博物馆段；不以URL日期代替发布日期'),
 'qianguo-lake-2026': ('精准施策护生态 履职尽责守湖清 前郭县分局全面推进查干湖巡查与水质监测工作', '2026-02-09', 'official_provincial_environment_department', '巡查范围、监测和计划采购无人机的段落'),
 'mohe-homestay-2023': ('山村巨变入画中、生态宜居美名扬——漠河市北极镇北红村龙江民居省级试点村', None, 'official_provincial_agriculture_department', '正文村庄介绍、家庭宾馆及生活环境段；正文2023-10-10与meta2023-10-18日期冲突'),
 'longsheng-culture-2022': ('中国广西大寨村和重庆荆竹村入选联合国世界旅游组织“最佳旅游乡村”', '2022-12-20', 'official_ministry_article', '大寨村段；农耕梯田、红瑶文化与旅游体验的介绍'),
 'taijiang-crafts': ('初心 筑梦乡村振兴', '2024-12-30', 'official_prefecture_people_congress', '发展旅游、兴乡村奔小康段；刺绣、蜡染及线上线下销售培训'),
 'zhuoni-tourism': ('卓尼县：以拳拳之力共同绘就乡村振兴时代画卷', None, 'unread_official_page', '检索线索，正文获取失败；不进入公开来源和事实'),
}

# Each direction is an authored proposal, never an observed demand or completed study.
# fields: title, question, decision owner, decision, population, access, specific evidence.
ROWS = [
 {'name':'通城县','cluster':('云母电子材料',66,4),'extra':('tongcheng-gig-2024','2024年的部门报道介绍通城零工驿站及服务窗口，服务包含招聘信息发布、求职登记和休息补给。','2024-05-10','公共就业服务'),'directions':[
  ('产业岗位信息如何被本地青年理解','岗位描述、技能要求与生活条件信息如何影响青年进一步咨询的选择？','拟合作的招聘服务方','优化岗位信息展示及咨询渠道','自愿参加的本地成年求职者',['jobseekers'],'岗位材料核验、信息理解任务与实际咨询意愿分开记录'),
  ('零工驿站的使用与未使用人群比较','使用者和未使用者在知晓渠道、到达便利与服务组合需求上有何差异？','当地公共就业服务方','调整宣传、服务时间与基础设施配置','已使用或可能使用驿站的成年零工与求职者',['jobseekers','employees'],'先核实当前服务点，再按使用经历分组招募并记录到访经历'),
  ('产业职工培训安排与课程需求','不同岗位职工希望怎样安排培训时间、形式与技能内容？','获准接触的培训组织方','形成可执行的课程和时间安排','经许可接触的产业从业者',['employees','training_partner'],'岗位分层、已有培训安排及参与条件，不收企业保密工艺'),
 ]},
 {'name':'金溪县','cluster':('香料加工',50,3),'unavailable':'jinxi-chain-2025','directions':[
  ('香型产品的标签理解与选择','产地、香型与成分说明如何影响受访者对指定香型产品的理解和试用选择？','拟合作的产品或零售服务方','选择更清楚的标签及试用说明','明确产品类别后的成年消费者',['community_residents'],'使用真实合规标签材料；区分理解程度、偏好和购买行为'),
  ('香料相关岗位的职业认知','本地求职者了解哪些岗位，又希望通过什么渠道认识岗位要求？','拟合作的招聘服务方','改进岗位说明和职业体验安排','对当地产业岗位感兴趣的成年求职者',['jobseekers'],'先核验实际岗位类别，再记录信息来源和咨询行为'),
  ('小批量采购服务中的信息需求','采购者在样品、规格说明、交期和沟通环节如何取舍？','获准接触的供应与采购服务方','安排样品说明与客户沟通流程','经许可联系的采购经办人员',['firms'],'取得采购者渠道，仅采非保密的服务体验与实际流程'),
 ]},
 {'name':'潜山市','cluster':('制刷',42,3),'village':'天柱山镇茶庄村','directions':[
  ('制刷产品采购的信息与售后选择','不同用途的采购者需要怎样的规格、寿命说明与售后支持？','获准接触的制刷企业或经销方','改进产品信息和售后服务组合','已确认接触渠道的采购者或经销者',['firms','merchants'],'限定产品用途，核验真实产品材料并收集采购经历'),
  ('本地青年对制刷岗位的认知','青年如何理解生产、设计、销售等岗位，哪些条件影响继续了解意愿？','拟合作的招聘和培训方','设计岗位介绍和培训入口','自愿参与的成年求职者',['jobseekers'],'核实当地开放岗位，将岗位认知与求职行动分开'),
  ('茶庄村旅游信息与服务路径','首次和再次到访者在交通、住宿与活动信息上有何不同需求？','拟合作的当地旅游服务方','调整行前说明与服务衔接','在获准场所接触的成年游客',['tourists'],'先核实当前开放与交通条件，再按真实到访经历招募'),
 ]},
 {'name':'闻喜县','cluster':('镁基新材料及精深加工',15,1),'extra':('wenxi-visit-2025','2025年7月的市工信局报道涉及闻喜镁精深加工与特钢材料企业，并记录对职工职业技能竞赛的观摩。','2025-07-01','产业技能'),'directions':[
  ('材料产业岗位的技能信息匹配','不同岗位从业者如何理解技能要求，与培训内容有什么对应关系？','拟合作的企业培训方','优化岗位技能说明及培训课程','经许可接触的材料产业职工',['employees','training_partner'],'岗位类别、培训材料与职工实际经历相互核对'),
  ('青年选择本地产业岗位的条件','薪酬说明、成长路径、通勤和生活条件分别如何进入青年择业考虑？','拟合作的招聘服务方','完善招聘信息与咨询服务','成年本地求职者及返乡求职者',['jobseekers'],'核实真实岗位，收集实际比较过的工作信息'),
  ('材料企业客户沟通与服务体验','采购经办人在规格解释、质量证明和售后沟通中最需要什么支持？','获准接触的材料供应服务方','改进客户说明与售后流程','具备许可渠道的采购经办人员',['firms'],'仅使用允许公开的产品资料与非保密采购经历'),
 ]},
 {'name':'如东县','cluster':('海上风电装备',29,2),'missing':'补充产业认定名单之外的县域就业、服务或统计官方来源。','directions':[
  ('风电产业相关岗位的就业认知','求职者对装备制造、运维及相关服务岗位的理解和顾虑有哪些差异？','拟合作的招聘服务方','改进岗位信息与咨询安排','对相关岗位感兴趣的成年求职者',['jobseekers'],'先确认实际开放岗位与资格，不把产业规模当岗位可得性'),
  ('风电装备服务中的协作信息需求','经许可的经办人员如何评价设备说明、交付和售后沟通？','获准接触的装备服务方','改进服务信息与协作流程','获得许可的供应或采购服务人员',['firms'],'访谈不进入海上作业现场，不收保密工程参数'),
  ('产业职工生活服务与通勤选择','不同工作地点的职工如何安排通勤、就餐与日常服务？','拟合作的园区生活服务方','确定生活服务的时间和布局优先级','经许可接触的当地产业职工',['employees'],'记录实际工作生活地点、频次与服务使用经历'),
 ]},
 {'name':'平阳县','cluster':('印刷包装成套装备',34,2),'unavailable':'pingyang-plan-2025','directions':[
  ('包装装备采购说明与理解','不同采购经验的人如何理解性能、适配范围和维护成本信息？','获准接触的装备供应服务方','完善采购说明与咨询流程','已有渠道的采购或生产管理人员',['firms'],'以真实公开规格为材料，避免使用企业保密成本'),
  ('装备售后服务的渠道组合','远程指导、上门服务和培训手册如何满足不同用户情境？','拟合作的售后服务组织方','安排售后渠道与培训材料','经许可接触的设备使用或维护人员',['employees','firms'],'收集具体使用情境，并区分服务需要与实际故障'),
  ('青年对装备产业职业发展的理解','哪些岗位及学习路径信息会影响青年了解本地装备产业的意愿？','拟合作的招聘和培训服务方','改进职业信息与培训入口','成年求职者及可接触的在校成年学生',['jobseekers'],'先核实岗位和课程入口，再比较信息理解与咨询行为'),
 ]},
 {'name':'安溪县','cluster':('藤铁工艺',47,3),'extra':('anxi-report-2024','2024年政府工作报告提出藤铁工艺园、设计节、行业标准及市场拓展等工作安排；这些安排不等于已经完成。','2024-01-12','家居设计'),'directions':[
  ('藤铁家居产品的场景与风格偏好','居住空间、使用用途与设计信息如何影响受访者对产品的比较？','拟合作的家居产品设计方','选择产品呈现和试用场景','明确使用场景的成年家居消费者',['community_residents'],'使用授权产品样例并记录实际居住与选购经历'),
  ('工艺产品线上线下展示的取舍','消费者在实体陈列、短视频和产品详情中需要什么信息？','拟合作的商户或品牌服务方','安排展示内容及到店咨询路径','可接触的成年购买者与零售商户',['community_residents','merchants'],'同一产品材料比较，区分观看、咨询与购买'),
  ('工艺学习与岗位成长需求','从业者和潜在学习者对设计、制作与销售技能有何需求差异？','拟合作的工艺培训组织方','规划培训内容与学习形式','经许可接触的从业者及成年学习者',['employees','training_partner'],'核实可用培训入口、岗位任务及既往学习经历'),
 ]},
 {'name':'光山县','cluster':('羽绒制品',62,4),'unavailable':'guangshan-digital-2026','directions':[
  ('羽绒产品质量信息的理解','充绒量、蓬松度、面料与保养说明怎样影响受访者的产品比较？','拟合作的产品或零售方','改进质量信息与选购指引','有相关选购经历的成年消费者',['community_residents'],'核验真实标签与标准术语，不把主观感知当检测结果'),
  ('定制与成衣服务的选择条件','尺码、交付时间、试穿及售后安排如何影响定制或成衣选择？','拟合作的制衣或零售服务方','确定服务组合与预约方式','可接触的成年消费者与商户',['community_residents','merchants'],'记录实际购买或定制经历，检验交付承诺的可实现性'),
  ('羽绒相关岗位的培训与成长','不同岗位从业者希望怎样获取生产、销售或服务技能？','获准接触的培训或企业服务方','制定分岗位培训安排','经许可接触的服装产业从业者',['employees','training_partner'],'核实岗位类别、已有课程和职工可参与时间'),
 ]},
 {'name':'澄迈县','cluster':('深海油气勘探生产服务',82,5),'unavailable':'chengmai-report-2025','directions':[
  ('油服相关岗位的职业信息需求','成年求职者如何了解资格要求、岗位内容与职业成长路径？','拟合作的招聘或培训服务方','安排准确的岗位介绍与培训咨询','对相关岗位感兴趣的成年求职者',['jobseekers'],'核实岗位与资格，避免把产业认定当招聘机会'),
  ('产业职工的生活服务选择','工作安排、居住地点和通勤方式如何影响日常服务使用？','拟合作的园区生活服务方','优化服务时间与配套信息','获得接触许可的产业从业者',['employees'],'只记录非敏感生活经历，不进入受限作业区域'),
  ('技术服务采购中的信息沟通','客户在服务范围、交付验收与培训说明中需要哪些信息？','获准接触的技术服务组织方','改进公开服务说明与协作流程','具备明确许可渠道的业务经办人员',['firms'],'确认可公开范围，仅使用允许引用的服务案例'),
 ]},
 {'name':'易门县','cluster':('有色及稀贵金属资源回收利用',92,5),'extra':('yimen-pesticide-2024','县农业农村局2024年的信息介绍2023年启动农药包装废弃物回收处理工作，涉及农业面源污染防治。','2024-11-29','农业回收'),'directions':[
  ('居民废旧物品交投的便利性','居民如何比较回收点距离、可交物品、价格说明和预约方式？','拟合作的生活回收服务方','调整交投说明与服务渠道','有废旧物品处理经历的成年居民',['community_residents','merchants'],'先核实合规回收渠道，再记录真实交投经历'),
  ('农药包装回收信息与参与条件','农业经营者如何理解回收要求，运输、存放及交投便利性如何影响参与？','拟合作的农业回收服务方','优化回收告知与交投安排','经许可联系的成年农业经营者',['farmers'],'核实当前回收规则和点位，不进行危险物品操作'),
  ('资源回收企业的协作服务需求','经许可的业务人员在合规材料、交付与检测说明方面需要什么支持？','获准接触的回收服务组织方','改进非保密协作信息与服务流程','拥有明确许可渠道的业务经办人员',['firms'],'明确可引用材料范围，不采商业秘密或未经许可的流向数据'),
 ]},
 {'name':'伊吾县','cluster':('富油煤热解',94,5),'extra':('yiwu-jobs-2025','县人社局2025年度工作报告记录职业技能培训、就业支持及面向企业和劳动者的服务措施。','2025-12-31','就业培训'),'directions':[
  ('本地与外来求职者的岗位信息需求','两类求职者在工作内容、资格、住宿与咨询渠道上需要什么不同信息？','拟合作的公共招聘服务方','完善岗位展示与咨询分流','自愿参加的本地及外来成年求职者',['jobseekers'],'核验实际岗位并记录真实求职经历，保护个人联系信息'),
  ('职业技能培训的知晓与参与','不同工作经历者如何获知培训机会，哪些安排影响实际参加？','拟合作的培训服务方','优化培训宣传、时间与课程安排','已参加或具备参加条件的成年劳动者',['employees','training_partner'],'核实当前可参加的培训，不把历史补贴当现行资格'),
  ('产业职工的日常生活服务','轮班、居住与交通条件如何进入职工日常服务选择？','拟合作的生活服务组织方','确定生活服务配置与开放时间','获得接触许可的当地产业职工',['employees'],'采集真实生活与服务经历，不进入矿区或受限生产现场'),
 ]},
 {'name':'崇州市','cluster':('板式家具',87,5),'missing':'补充产业认定之外的县域消费、就业或统计官方来源；异地采购公告不能代表本地需求。','directions':[
  ('板式家具信息的理解与选购','材质、尺寸、环保及安装说明如何进入消费者的比较过程？','拟合作的家具产品或零售方','优化产品信息与选购指引','有明确家居使用场景的成年消费者',['community_residents'],'使用真实合规标签，区分材料理解、偏好与实际购买'),
  ('家具交付安装服务的取舍','交期、预约、安装和售后保障如何影响用户选择与满意经历？','拟合作的家具交付服务方','设计可兑现的交付服务组合','可接触的近期购买者及服务商户',['community_residents','merchants'],'核对实际订单经历与允许公开的服务承诺'),
  ('家具产业职工的技能与培训需求','生产、安装、销售岗位的技能学习需求及可参与时间有何差异？','拟合作的培训组织方','形成分岗位课程与实践安排','经许可接触的家具相关从业者',['employees','training_partner'],'核实岗位任务与现有培训，不推断企业已同意合作'),
 ]},
 {'name':'平山县','village':'岗南镇李家庄村','extra':('pingshan-tourism-2020','2020年的国家发改委案例介绍李家庄围绕红色资源与现代农业科普等内容组织乡村旅游。','2020-04-23','红色与农业体验'),'directions':[
  ('行前信息与村内游线的衔接','游客出发前和到村后分别需要哪些交通、停留与活动信息？','拟合作的村落旅游服务方','改进行前说明及村内导览','在获准场所接触的成年游客',['tourists'],'核实当前开放安排，按真实行程而非宣传预期记录'),
  ('红色与农业科普体验的内容选择','成年游客对展陈理解、农业体验和休憩服务有何不同期待？','拟合作的文化旅游活动方','安排体验内容与讲解层次','自愿参与的成年游客及活动组织者',['tourists','event_organizer'],'以已开放的内容为材料，记录理解与参与体验'),
  ('村民经营参与与公共空间需求','村民和商户如何看待旅游服务机会及日常生活空间安排？','拟合作的社区与旅游服务方','确定经营支持及公共空间改进优先级','获准联系的成年村民与经营者',['community_residents','merchants'],'分别记录经营参与、生活使用与具体建议，不预设旅游带来净收益'),
 ]},
 {'name':'乌审旗','village':'无定河镇巴图湾村','extra':('wushen-tourism','旗文旅部门2026年的旅游概况将巴图湾村与红色文化小镇对应，并介绍多媒体、场景复原等展陈方式。','2026-03-12','红色文化展示'),'directions':[
  ('巴图湾游客的信息与游线选择','首次和再次到访者如何组合交通、展馆、休憩与游览时间？','拟合作的旅游服务组织方','优化导览及游线说明','实际到访的成年游客',['tourists'],'核实当前展馆开放和交通，不据历史介绍推断接待能力'),
  ('不同展陈方式的理解与参与','文字、图像和多媒体材料在成年游客理解中各起什么作用？','拟合作的文化展示服务方','调整讲解内容与展陈辅助材料','自愿参加材料理解任务的成年游客',['tourists','event_organizer'],'使用获准材料，以理解任务和自报感受分别记录'),
  ('旅游服务与村民日常生活的协调','村民、商户和游客对公共空间、服务时间与活动安排有何不同需求？','拟合作的村落服务方','协商服务时间与公共设施配置','获准接触的成年村民、商户及游客',['community_residents','merchants'],'分群收集具体使用场景，不用单一群体代表全村意见'),
 ]},
 {'name':'新宾满族自治县','village':'永陵镇赫图阿拉村','extra':('xinbin-heritage-2025','省级旅游介绍将赫图阿拉城的位置、建筑遗迹和旗袍博物馆列为文化展示资源。','2025-10-11','满族文化展示'),'directions':[
  ('文化景区的导览与理解','成年游客在哪些游览节点需要背景、方向和讲解支持？','拟合作的景区导览服务方','调整导览层次和讲解入口','实际到访的成年游客',['tourists'],'核实开放路线，开展获准的材料理解或路径任务'),
  ('文化主题产品的信息与场景偏好','游客对文化含义、产地、制作方式和使用场景如何取舍？','拟合作的文化产品经营方','选择产品说明和展示方式','可接触的成年游客及商户',['tourists','merchants'],'使用授权产品素材，区分文化理解与购买经历'),
  ('村民参与旅游服务的条件','不同经营经历的村民希望通过哪些方式参与服务或学习技能？','拟合作的村落与培训服务方','安排参与渠道和服务培训','获准接触的成年村民',['community_residents','training_partner'],'先了解现有参与安排和许可，再提出可执行建议'),
 ]},
 {'name':'前郭尔罗斯蒙古族自治县','village':'查干湖渔场查干湖屯','extra':('qianguo-lake-2026','2026年的生态环境部门报道介绍查干湖周边村屯、旅游及餐饮住宿点的巡查监测，并提及计划采用无人机。','2026-02-09','湖区生态服务'),'directions':[
  ('湖区旅游信息的季节与场景差异','不同到访季节与出行方式的游客需要怎样的信息及服务？','拟合作的湖区旅游服务方','调整行前指引和分季服务内容','实际到访的成年游客',['tourists'],'按真实到访时间分组，核实当前开放与季节条件'),
  ('游客对生态提示的理解与行动','哪些生态保护信息容易被理解，游客在具体行为情境中如何选择？','拟合作的生态与旅游服务方','改进生态提示和参与方式','自愿参加理解任务的成年游客',['tourists'],'以现行公开提示为材料，不将意愿直接解释为环保行为'),
  ('餐饮住宿服务中的绿色选择','游客与经营者如何理解节水、减废及服务便利性之间的取舍？','拟合作的餐饮住宿服务方','选择可实施的服务说明与改进事项','有真实服务经历的成年游客和商户',['tourists','merchants'],'分别记录服务措施、使用经历与成本条件，不推断污染程度'),
 ]},
 {'name':'漠河市','village':'北极镇北红村','extra':('mohe-homestay-2023','省农业农村厅2023年的介绍提到北红村家庭宾馆、特色民居和旅游经营；具体经营数量不作为当前状态使用。',None,'民宿与民居'),'directions':[
  ('民宿预订信息与实际体验','游客在预订时怎样理解价格、设施、交通和服务说明？','拟合作的民宿经营服务方','完善预订信息与到店沟通','实际入住或完成预订的成年游客',['tourists','merchants'],'核实当期房型与服务，按实际订单经历记录'),
  ('不同季节出行的准备与安全信息','成年游客在衣着、交通和住宿准备中需要哪些信息支持？','拟合作的旅游服务组织方','优化行前准备与公开安全告知','有真实到访经历的成年游客',['tourists'],'引用当前主管部门公开提示，不开展危险或低温实验'),
  ('旅游经营与村民生活服务','经营参与程度不同的村民对公共服务和经营支持有何不同需要？','拟合作的村落服务方','确定生活与经营服务支持事项','获准接触的成年居民与经营者',['community_residents','merchants'],'核实当期经营与生活安排，避免以历史宣传替代居民意见'),
 ]},
 {'name':'龙胜各族自治县','village':'龙脊镇大寨村','extra':('longsheng-culture-2022','文旅部2022年的介绍描述大寨村以农耕梯田、红瑶文化和传统技艺组织乡村旅游体验。','2022-12-20','梯田与红瑶文化'),'directions':[
  ('梯田游线信息与停留选择','不同出行经验的游客如何理解路线、观景、休息和时间安排？','拟合作的当地旅游服务方','改进导览与行程说明','实际到访的成年游客',['tourists'],'核实开放路线与交通，不引导进入未经许可的农田'),
  ('文化体验的理解与参与意愿','游客如何理解不同文化体验内容，其参与选择受哪些信息影响？','拟合作的文化体验组织方','调整体验说明与活动组合','自愿参与的成年游客',['tourists','event_organizer'],'使用经授权的文化材料，尊重传承人与社区表达'),
  ('居民对旅游与耕作空间的需求','不同经营和耕作经历的居民如何看待公共空间、服务与参与安排？','拟合作的村落服务方','形成需要进一步协商的空间和服务事项','获准接触的成年居民与农业经营者',['community_residents','farmers'],'分别记录耕作、经营和生活经历，不预设收益分配结论'),
 ]},
 {'name':'台江县','village':'老屯乡长滩村','extra':('taijiang-crafts','州人大网站2024年的报道介绍长滩村刺绣、蜡染及线上线下销售和技能培训安排。','2024-12-30','苗绣与培训'),'directions':[
  ('苗绣文创的信息与使用场景','游客如何理解纹样含义、制作方式和日常使用场景？','拟合作的工艺产品经营方','改进产品说明和展示方式','可接触的成年游客与商户',['tourists','merchants'],'使用获准纹样与产品材料，区分理解、偏好和购买'),
  ('工艺学习与技能培训的参与条件','不同经验的成年学习者需要哪些课程、时间与销售支持？','拟合作的培训或工艺服务方','设计分层课程与参与安排','经许可接触的成年工艺从业者和学习者',['employees','training_partner'],'核实已有培训及真实参与经历，不承诺培训收入'),
  ('乡村体验活动的内容与服务组合','成年游客如何组合工艺体验、游览、休憩和购买活动？','拟合作的乡村旅游活动方','调整活动预约、讲解和服务组合','实际到访的成年游客',['tourists','event_organizer'],'核实当前活动及接待许可，再记录真实选择与体验'),
 ]},
 {'name':'卓尼县','village':'木耳镇博峪村','unavailable':'zhuoni-tourism','directions':[
  ('博峪村旅游信息的可达性','游客从哪里获取到达、住宿、活动和返程信息，哪些信息需要进一步核实？','拟合作的村落旅游服务方','完善行前与现场信息衔接','实际到访的成年游客',['tourists'],'先核实当前开放、路线和服务点，记录真实信息获取过程'),
  ('村落住宿与服务组合选择','成年游客如何比较住宿、餐饮、停留和活动服务？','拟合作的住宿餐饮服务方','形成服务说明与预约组合','有实际消费经历的成年游客及商户',['tourists','merchants'],'以当期真实可用服务为材料，不使用历史接待量估算需求'),
  ('村民对旅游参与和生活服务的需求','不同参与经历的村民希望怎样参与服务，又需要哪些生活配套？','拟合作的村落服务组织方','提出参与支持与公共服务改进事项','获准接触的成年村民',['community_residents'],'先确认社区进入许可，分别记录参与意愿和实际经历'),
 ]},
]

ACCESS = {'campus_students','campus_ops','community_residents','community_partner','older_adults','merchants','firms','employees','jobseekers','farmers','tourists','event_organizer','logistics_partner','training_partner'}
I, T = 'miit-2025-clusters', 'mct-rural-2022'
DIRECTION_SOURCES = {
 '通城县': [[I], ['tongcheng-gig-2024'], [I]],
 '潜山市': [[I], [I], [T]],
 '闻喜县': [['wenxi-visit-2025'], [I, 'wenxi-visit-2025'], [I]],
 '安溪县': [[I], [I, 'anxi-report-2024'], [I, 'anxi-report-2024']],
 '易门县': [[I], ['yimen-pesticide-2024'], [I]],
 '伊吾县': [['yiwu-jobs-2025'], ['yiwu-jobs-2025'], [I]],
 '平山县': [[T, 'pingshan-tourism-2020'], ['pingshan-tourism-2020'], [T, 'pingshan-tourism-2020']],
 '乌审旗': [[T], ['wushen-tourism'], [T]],
 '新宾满族自治县': [['xinbin-heritage-2025'], ['xinbin-heritage-2025'], [T]],
 '前郭尔罗斯蒙古族自治县': [[T], ['qianguo-lake-2026'], ['qianguo-lake-2026']],
 '漠河市': [['mohe-homestay-2023'], [T, 'mohe-homestay-2023'], [T, 'mohe-homestay-2023']],
 '龙胜各族自治县': [[T], ['longsheng-culture-2022'], ['longsheng-culture-2022']],
 '台江县': [['taijiang-crafts'], ['taijiang-crafts'], [T, 'taijiang-crafts']],
}
usable = {sid for sid, s in CAPTURES.items() if s['status'] == 'retrieved'} | {sid for sid, s in RECOVERY.items() if s['status'] == 'retrieved'}
sources = []
for sid in SOURCE_NOTES:
    if sid not in usable: continue
    title, published, authority, locator = SOURCE_NOTES[sid]
    sources.append({'id': sid, 'title': title, 'url': CAPTURES[sid]['url'], 'publishedAt': published, 'retrievedAt': '2026-10-15', 'authority': authority, 'locator': locator, 'supportedClaims': []})
source_by_id = {s['id']: s for s in sources}
profiles = []
editorial = []
for raw in ROWS:
    matches = [r for r in CATALOG['records'] if r['level'] == 'county' and r['name'] == raw['name']]
    if len(matches) != 1: raise ValueError('County mapping not unique: ' + raw['name'])
    region = matches[0]; profile_id = 'county-' + region['code']
    facts = []; tags = []; gaps = ['完成独立内容复核后再发布。', '补充当前招募渠道、团队资源和接触许可验证。']
    def fact(text, source_id, as_of=None):
        if source_id not in usable: raise ValueError('Unread source cannot support facts: ' + source_id)
        item = {'id': profile_id + '-fact-' + str(len(facts)+1), 'text': text, 'sourceIds': [source_id], 'temporalKind': 'historical_reference', 'asOfDate': as_of}
        facts.append(item); source_by_id[source_id]['supportedClaims'].append(text)
    if raw.get('cluster'):
        label, number, page = raw['cluster']; sid = 'miit-2025-clusters'
        fact('2025年度第四批名单列有' + raw['name'] + label + '产业集群；定位为第' + str(number) + '项、物理第' + str(page) + '页。', sid)
        tags.append({'label': label, 'sourceIds': [sid]})
    if raw.get('village'):
        sid = 'mct-rural-2022'
        fact('数据截止2022年12月7日的文旅部乡村旅游重点村页面列有' + raw['name'] + raw['village'] + '。', sid, '2022-12-07')
        tags.append({'label': '乡村旅游', 'sourceIds': [sid]})
    if raw.get('extra'):
        sid, text, as_of, tag = raw['extra']
        fact(text, sid, as_of)
        tags.append({'label': tag, 'sourceIds': [sid]})
    if raw.get('unavailable'):
        sid = raw['unavailable']
        gaps.append('补充第二条不同事实的官方来源；已发现的“' + SOURCE_NOTES[sid][0] + '”正文读取失败，尚未采纳其内容。')
    if raw.get('missing'): gaps.append(raw['missing'])
    if raw['name'] == '安溪县': gaps.append('复核政府报告页面元信息：来源字段写石狮，标题、正文与URL指向安溪；暂仅引用明确标识的计划内容。')
    if raw['name'] == '漠河市': gaps.append('核对来源发布日期：正文标2023-10-10，meta标2023-10-18；publishedAt保持null。')
    directions = []
    supported_sources = list(dict.fromkeys(s for f in facts for s in f['sourceIds']))
    for i, row in enumerate(raw['directions'], 1):
        title, question, owner, decision, population, access, evidence = row
        if not set(access) <= ACCESS: raise ValueError('Unknown access option')
        direction_sources = DIRECTION_SOURCES.get(raw['name'], [supported_sources] * 3)[i-1]
        if not set(direction_sources) <= set(supported_sources): raise ValueError('Direction must use profile evidence')
        directions.append({'id': profile_id + '-direction-' + str(i), 'title': title, 'question': question, 'decisionOwner': owner, 'decision': decision, 'population': population, 'requiredAccess': access, 'minimumEvidence': ['明确研究范围、目标人群与招募渠道。', '取得接触、材料使用与引用许可。', evidence], 'sourceIds': direction_sources, 'classification': 'proposed'})
    profiles.append({'id': profile_id, 'regionRef': {'code': region['code'], 'catalogVersion': VERSION}, 'displayName': raw['name'], 'tags': tags, 'facts': facts, 'directions': directions, 'status': 'draft', 'gaps': gaps})
    editorial.append({'profileId': profile_id, 'regionCode': region['code'], 'countyName': raw['name'], 'distinctSourceCount': len(supported_sources), 'publicationDecision': 'draft_pending_independent_review', 'sourceIds': supported_sources, 'unreadCandidateSourceId': raw.get('unavailable'), 'factIds': [f['id'] for f in facts]})

pack = {'schemaVersion': 1, 'id': 'county-pack-01', 'contentVersion': '2026-10-15.1', 'catalogVersion': VERSION, 'sources': sources, 'profiles': profiles}
if len(profiles) != 20 or sum(len(p['directions']) for p in profiles) != 60: raise ValueError('Incomplete editorial package')
out = APP / 'content/topic-advisor/county-pack-01.json'
out.write_bytes((json.dumps(pack, ensure_ascii=False, indent=2) + '\n').replace('\n', '\r\n').encode('utf-8'))
evidence = {'schemaVersion': 1, 'packSha256': hashlib.sha256(out.read_bytes()).hexdigest(), 'dataClass': 'official_source_facts_and_authored_proposals', 'sources': [], 'profiles': editorial}
for source in sources:
    capture = CAPTURES[source['id']]
    summary = {'id': source['id'], 'title': source['title'], 'locator': source['locator'], 'supportedClaims': source['supportedClaims']}
    evidence['sources'].append({'id': source['id'], 'rawSha256': capture.get('rawSha256'), 'rawBytes': capture.get('rawBytes'), 'captureStatus': capture['status'], 'recoveredWithWebText': source['id'] in RECOVERY and RECOVERY[source['id']]['status'] == 'retrieved', 'originalSummarySha256': hashlib.sha256(json.dumps(summary, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest(), 'fingerprintScope': 'original_http_body_when_available_and_original_summary', 'reviewStatus': 'pending'})
(HERE / 'editorial-evidence.json').write_bytes((json.dumps(evidence, ensure_ascii=False, indent=2) + '\n').replace('\n', '\r\n').encode('utf-8'))
print(json.dumps({'profiles': len(profiles), 'directions': 60, 'sources': len(sources), 'twoSourceProfiles': sum(p['distinctSourceCount'] >= 2 for p in editorial), 'draftProfiles': 20, 'packSha256': evidence['packSha256']}, ensure_ascii=False))
