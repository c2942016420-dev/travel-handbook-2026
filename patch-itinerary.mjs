/**
 * Apply the confirmed Istanbul itinerary (2026-11-14, 15, 18 and 19).
 * The original single-file HTML is reconstructed and hash-checked by build.sh.
 * Only the "days" itinerary data is altered. The design and other dates remain.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'public/index.html';
const START = 'const days = ';
const END = '\n];\n\nfunction renderBookings';

function applyItinerary(original) {
  const begin = original.indexOf(START);
  const finish = original.indexOf(END, begin);
  if (begin < 0 || finish < 0) {
    throw new Error('Could not locate the original days array; refusing to modify the page.');
  }
  const jsonStart = begin + START.length;
  const originalDays = original.slice(jsonStart, finish + 2);
  const days = JSON.parse(originalDays);
  if (days.length !== 17) throw new Error('Expected 17 daily itineraries.');
  const byDate = (date) => {
    const matches = days.filter((d) => d.date === date);
    if (matches.length !== 1) throw new Error('Missing or repeated day: ' + date);
    return matches[0];
  };
  const find = (date, titlePart) => {
    const matches = byDate(date).items.filter((item) => item.title.includes(titlePart));
    if (matches.length !== 1) throw new Error('Could not find unique "' + titlePart + '" on ' + date);
    return { ...matches[0] };
  };
  const date14 = byDate('11/14');
  const date15 = byDate('11/15');
  const date18 = byDate('11/18');
  const date19 = byDate('11/19');
  const original20 = JSON.stringify(byDate('11/20'));
  const unchanged = days
    .filter((d) => !['11/14', '11/15', '11/18', '11/19'].includes(d.date))
    .map((d) => [d.date, JSON.stringify(d)]);

  const tz = date14.items.find((item) => item.tz)?.tz || 'TRT · UTC+3';
  const add = (time, title, desc, map, other = {}) => ({
    time, tz, title, ...(map ? { map } : {}), desc, ...other
  });

  // Sat 14 Nov: Galata Tower -> Galata Konak blue hour -> Galata Bridge -> night ferry.
  const arrival14 = find('11/14', 'PC1192');
  const hotel14 = find('11/14', '酒店寄存 / 入住');
  const tower14 = find('11/14', '加拉塔塔｜Galata Tower');
  const cafe14 = find('11/14', 'Galata Konak Cafe｜露台');
  const bridgeFrom19 = find('11/19', '加拉塔大桥｜蓝调必拍');
  const ferry14 = find('11/14', '公共轮渡夜景与晚饭');
  const sevenFrom14 = find('11/14', 'Seven Hills｜屋顶');
  date14.route = [
    'Sabiha Gokcen Airport',
    'Constantinopolis Hotel Istanbul',
    'Galata Tower',
    'Galata Konak Cafe',
    'Galata Bridge Istanbul',
    'Karakoy Ferry Terminal Istanbul',
    'Constantinopolis Hotel Istanbul'
  ];
  date14.items = [
    arrival14,
    {
      ...hotel14,
      time: '约14:30–15:15｜视机场交通而定',
      desc: '11:55抵达SAW后仍需入境、提取行李并前往旧城酒店。14:30–15:15是顺利情况下的预计入住/寄存时间，不能当作保证；若交通延误，以17:00前赶到Galata Konak、保住日落和蓝调为优先。下午在咖啡馆补充餐食，不再跨城去Seven Hills。'
    },
    add(
      '15:15–16:00｜预留45分钟',
      '旧城酒店 → 加拉塔塔｜T1电车 + 上坡步行',
      '从酒店步行到Sultanahmet电车站，乘T1往Kabataş方向，依次经过Gülhane、Sirkeci、Eminönü，到Karaköy下车；再步行上坡约10–15分钟到加拉塔塔。预计门到门35–45分钟，交通及候车以现场为准。如机场延误压缩拍塔时间，先保住Galata Konak的日落机位。',
      'Galata Tower'
    ),
    {
      ...tower14,
      time: '16:00–16:30',
      title: '加拉塔塔｜Galata Tower · 外景与街巷',
      desc: '先拍加拉塔塔外立面、广场和有坡度的周边小巷，不安排登塔排队。塔与Galata Konak Cafe相距步行几分钟。14世纪的石塔曾是热那亚商人聚落的地标，周围街巷顺着港口山坡展开。外景免费；如因交通延误，只拍几张塔外观照片后直接前往咖啡馆。'
    },
    {
      ...cafe14,
      time: '16:35–18:15',
      title: 'Galata Konak Cafe｜日落 + 蓝调必拍',
      desc: '重点保留！11月14日伊斯坦布尔日落约17:46，蓝调可拍至18:15左右（天气会影响观感）。提前在Galata Konak Cafe的露台选位，拍加拉塔塔、金角湾、老城清真寺穹顶与夕阳；不要把Galata Konak Cafe和Galata Tower两个导航点混淆。餐饮消费、低消、景观位及露台开放情况须事前确认。今天的蓝调主要留在这里，不为赶大桥而提前离开。'
    },
    add(
      '18:15–18:30',
      'Galata Konak → 加拉塔大桥｜下坡步行',
      '咖啡馆拍完蓝调后沿Galata/Karaköy方向下坡步行，约10–15分钟到加拉塔大桥。若天雨、石板路湿滑或人多，放慢脚步。',
      'Galata Bridge Istanbul'
    ),
    {
      ...bridgeFrom19,
      time: '18:30–18:55',
      title: '加拉塔大桥｜金角湾夜景与旧城灯光',
      desc: '在桥上拍金角湾、清真寺轮廓与水面灯光，预留约25分钟。14日的夕阳和蓝调已经安排在Galata Konak Cafe，这里拍入夜后的桥景，不重复守一次日落。拍摄时留意钓鱼线、车流和行人。之后步行到Karaköy轮渡码头。'
    },
    {
      ...ferry14,
      time: '19:25（备选19:45）–约21:00',
      title: 'Karaköy ↔ Kadıköy｜公共轮渡夜景往返',
      desc: '加拉塔大桥拍完后步行到Karaköy码头，提前找正确的Şehir Hatları登船口。按目前官方时刻表，Karaköy往Kadıköy有19:25（约19:55抵达）及19:45（约20:15抵达）班次；Kadıköy可考虑20:30返航、约20:55回Karaköy。两人可短暂看亚洲岸夜景，重点是公共轮渡上欣赏海峡灯光，不另排亚洲岸景点。船班与码头须临行再核。回Karaköy后乘T1往Sultanahmet返回酒店；晚餐按船班灵活安排。'
    },
    add(
      '约21:00后｜按实际返程',
      '晚餐 / 返回Sultanahmet酒店',
      '夜间轮渡结束后在Karaköy附近用餐或直接乘T1回Sultanahmet，步行返回酒店。15日早上要去蓝色清真寺，晚上尽量早休息。',
      'Constantinopolis Hotel Istanbul'
    )
  ];

  // Sun 15 Nov: Blue Mosque -> Seven Hills -> Dolmabahce -> SAW airport.
  const breakfast15 = find('11/15', '早餐、退房');
  const mosque15 = find('11/15', '苏丹艾哈迈德清真寺');
  const palace15 = find('11/15', '多尔玛巴赫切新皇宫');
  const toAirport15 = find('11/15', '回酒店取行李 →');
  const flight15 = find('11/15', 'VF3270');
  const hotelNar15 = find('11/15', '纳尔入住');
  date15.route = [
    'Constantinopolis Hotel Istanbul',
    'Blue Mosque Istanbul',
    'Seven Hills Restaurant Istanbul',
    'Dolmabahce Palace',
    'Constantinopolis Hotel Istanbul',
    'Sabiha Gokcen Airport',
    'Nevsehir Kapadokya Airport',
    'Angels City Cave Hotel Cappadocia'
  ];
  date15.items = [
    breakfast15,
    {
      ...mosque15,
      time: '08:30–09:15',
      desc: mosque15.desc
        .replace('给室内、庭院和外部拍照合计留75分钟', '给室内和庭院拍照合计留45分钟')
        .replace('给室内、庭院和外部拍照合计留约75分钟', '给室内和庭院拍照合计留约45分钟')
        + '\n\n09:15左右步行前往附近的Seven Hills，不在清真寺继续停留过久。如遇礼拜暂停游客入内，先拍外观，不为等候而耽误上午后续行程。'
    },
    {
      ...sevenFrom14,
      time: '09:20–10:05',
      title: 'Seven Hills｜屋顶视角、早餐与海鸥拍照',
      desc: '从蓝色清真寺步行数分钟抵达Seven Hills Restaurant（Tevkifhane Sokak No:8，勿错选Seven Hills Palace）。在露台拍蓝色清真寺、圣索菲亚与海景，按需要点早餐或饮品，预留45分钟拍照。官网早餐服务08:00开始；露台座位、喂鸟许可及具体收费须向餐厅确认，不能保证海鸥出现。10:05准时离开前往新皇宫。'
    },
    add(
      '10:05–11:00',
      'Seven Hills → 多尔玛巴赫切新皇宫｜T1 + 步行',
      '从Seven Hills步行约7–10分钟至Sultanahmet站，乘T1往Kabataş方向至终点，再步行约10–15分钟到多尔玛巴赫切宫入口；含候车与步行预留约55分钟。不要绕到Taksim。',
      'Dolmabahce Palace'
    ),
    {
      ...palace15,
      time: '11:00–13:15',
      desc: palace15.desc.replace('预留约2.5小时', '预留约2小时15分钟').replace('13:15离开，预留60分钟原路回酒店；14:15–15:00取行李、吃简餐并留缓冲，15:00出发去SAW，不挤占航班余量。', '13:15必须离开，优先参观主宫殿和临海庭院。之后预留约60分钟回酒店，15:00启程去SAW，不挤占航班余量。')
    },
    add(
      '13:15–14:15',
      '多尔玛巴赫切宫 → Sultanahmet酒店',
      '离开宫殿后步行至Kabataş站，乘T1回Sultanahmet，步行回酒店取行李。为候车、交通及步行预留约1小时，不再增加沿途景点。',
      'Constantinopolis Hotel Istanbul'
    ),
    add(
      '14:15–15:00',
      '取行李、简餐与机场出发缓冲',
      '在酒店取回寄存行李，快速吃简餐并检查证件和机票。15:00开始前往SAW机场；如宫殿排队较长，宁可缩短参观，不压缩机场预留时间。',
      'Constantinopolis Hotel Istanbul'
    ),
    toAirport15,
    flight15,
    hotelNar15
  ];

  // Wed 18 Nov: explicitly include the late-night airport-to-hotel transfer.
  const flight18 = find('11/18', 'VF3271');
  const flight18Index = date18.items.findIndex((item) => item.title === flight18.title);
  if (flight18Index !== date18.items.length - 1) throw new Error('Unexpected 18 Nov flight position.');
  date18.items.push(add(
    '23:00后｜以实际出机场时间为准',
    'SAW机场 → Sultanahmet酒店｜深夜交通与入住',
    '23:00是航班落地时间，不是抵达酒店时间。取行李后先核实M4及Marmaray最后班次是否仍能衔接；如果不能，改选HAVABÜS去Taksim，再安排最后一段合规交通到旧城。夜间班次、末班与费用出发前再确认。抵达后直接睡觉，19日09:00开始参观圣索菲亚。',
    'Constantinopolis Hotel Istanbul'
  ));
  date18.route = [
    ...date18.route,
    'Sabiha Gokcen Airport',
    'Constantinopolis Hotel Istanbul'
  ];

  // Thu 19 Nov: old city -> Ortakoy -> 15:50 ferry -> Uskudar -> Salacak sunset.
  const sophia19 = find('11/19', '圣索菲亚｜');
  const walk19 = find('11/19', '旧城 → 苏莱曼尼耶');
  const sule19 = find('11/19', '苏莱曼尼耶清真寺｜');
  const lunch19 = find('11/19', '午饭与休息');
  const toOrtakoy19 = find('11/19', '苏莱曼尼耶 → 奥塔科伊');
  const mosqueOrtakoy19 = find('11/19', '奥塔科伊清真寺｜');
  const pier19 = find('11/19', 'Ortaköy İskelesi｜');
  date19.route = [
    'Constantinopolis Hotel Istanbul',
    'Hagia Sophia Istanbul',
    'Suleymaniye Mosque Istanbul',
    'Ortakoy Mosque Istanbul',
    'Ortakoy Iskelesi Istanbul',
    'Uskudar Ferry Terminal Istanbul',
    'Salacak Sahili Istanbul',
    'Constantinopolis Hotel Istanbul'
  ];
  date19.items = [
    sophia19,
    walk19,
    sule19,
    lunch19,
    toOrtakoy19,
    {
      ...mosqueOrtakoy19,
      time: '14:15–15:00',
      desc: '奥塔科伊清真寺紧贴博斯普鲁斯海岸，19世纪的装饰和大窗把海水、清真寺与海峡大桥框在一起。免费入内，带头巾并避开礼拜时段；如室内暂停入内，先拍外景。15:00转去紧邻的公共滨水广场和码头拍照，不得拖延到错过15:50去Üsküdar的船班。'
    },
    {
      ...pier19,
      time: '15:00–15:30',
      desc: '定位Ortaköy İskelesi，沿清真寺旁的公共滨水广场及岸边步道拍清真寺、博斯普鲁斯大桥和海面。码头与清真寺紧邻。只留约30分钟拍摄，15:30开始找轮渡登船口和排队，重点保证15:50准时上船。不开入登船限制区或封闭栈桥。'
    },
    add(
      '15:30–15:50｜提前候船',
      'Ortaköy码头｜找对Şehir Hatları登船口',
      '15:30左右结束拍摄，核对目的地为Üsküdar的Şehir Hatları公共轮渡、购票/刷交通卡并排队。15:50是当前官方工作日班表时间；若当日调整或错过，后续17:15班次会明显压缩少女塔日落拍摄，须优先寻找可靠的替代跨岸交通而非默认能够赶上。',
      'Ortakoy Iskelesi Istanbul'
    ),
    add(
      '15:50–16:00｜工作日班次',
      'Ortaköy → Üsküdar｜跨海峡公共轮渡',
      'Şehir Hatları官网当前工作日时刻表列明Ortaköy 15:50出发、Üsküdar 16:00到达。11月19日是周四，因此按此班次安排；仍需在出行前核对11月实际运营及现场码头公告。约10分钟船程，注意不要一路坐到Kadıköy。',
      'Uskudar Ferry Terminal Istanbul'
    ),
    add(
      '16:00–16:30｜沿海步行',
      'Üsküdar码头 → Salacak海滨｜少女塔拍摄机位',
      '从Üsküdar轮渡码头沿海边向南步行约20–30分钟，到Salacak Sahili一带寻找正对少女塔（Kız Kulesi）的公共岸边摄影位置。这里安排的是岸边看少女塔，并非登岛游览少女塔内部；留足找机位和架设备的时间。',
      'Salacak Sahili Istanbul'
    ),
    add(
      '16:30–18:15｜日落约17:42',
      'Salacak海滨｜少女塔 + 历史半岛日落与蓝调',
      '19号重点日落机位：从亚洲岸Salacak海滨拍少女塔、博斯普鲁斯海峡与欧洲旧城剪影。建议16:30前到，17:42左右日落，随后留到约18:12–18:15拍蓝调，实际天空色彩视天气而定。不要改去加拉塔大桥；14日已经安排大桥夜景。这一站以海滨拍照为主，不包含少女塔内部参观门票。',
      'Salacak Sahili Istanbul',
      { weather: '拍照以现场天气和安全为准' }
    ),
    add(
      '18:15以后',
      'Üsküdar晚餐 → Marmaray返回旧城酒店',
      '蓝调拍完后沿海边返回Üsküdar，在附近晚餐；乘Marmaray到Sirkeci，再步行回Sultanahmet酒店。请注意Marmaray车站与轮渡码头不是同一个入口，按当晚导航选择步行路线。20日上午只安排地下水宫，今晚整理行李并休息。',
      'Constantinopolis Hotel Istanbul'
    )
  ];

  // Verify coverage and prevent accidental changes to the rest of the trip.
  for (const [date, snapshot] of unchanged) {
    if (JSON.stringify(byDate(date)) !== snapshot) {
      throw new Error('Unexpected changes outside Istanbul itinerary on ' + date);
    }
  }
  if (JSON.stringify(byDate('11/20')) !== original20) throw new Error('20 Nov must remain unchanged.');
  const titles = (date) => byDate(date).items.map((item) => item.title).join(' | ');
  for (const [date, required] of [
    ['11/14', ['加拉塔塔', 'Galata Konak Cafe', '加拉塔大桥', '公共轮渡']],
    ['11/15', ['蓝色清真寺', 'Seven Hills', '多尔玛巴赫切']],
    ['11/19', ['圣索菲亚', '苏莱曼尼耶', '奥塔科伊清真寺', 'Ortaköy', 'Üsküdar', 'Salacak', '少女塔']],
    ['11/20', ['地下水宫']]
  ]) {
    for (const name of required) {
      if (!titles(date).includes(name)) throw new Error('Missing stop ' + date + ': ' + name);
    }
  }
  const modifiedJson = JSON.stringify(days, null, 2);
  const updated = original.slice(0, jsonStart) + modifiedJson + original.slice(finish + 2);
  if (!updated.includes('function renderBookings')) throw new Error('Incomplete output.');
  return updated;
}

const original = readFileSync(FILE, 'utf8');
const updated = applyItinerary(original);
writeFileSync(FILE, updated, 'utf8');
console.log('Updated Istanbul itinerary: 14, 15, 18, 19 Nov; all other dates and page design retained.');
