/**
 * Update the 15-16 November Cappadocia hotel change.
 * Run after patch-itinerary.mjs and leave all other hotel bookings intact.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'public/index.html';
let html = readFileSync(file, 'utf8');
const oldHotel = 'Angels City Cave Hotel Cappadocia';
const newHotel = 'Ala Stone Hotel Goreme';
const address = 'İsalı Gaferli Avcılar Mahallesi, Kapadokya Sokak No:15, Göreme / Nevşehir';

function replaceOne(from, to, label) {
  const first = html.indexOf(from);
  if (first < 0 || html.indexOf(from, first + from.length) !== -1)
    throw new Error('Cannot uniquely replace ' + label);
  html = html.slice(0, first) + to + html.slice(first + from.length);
}

const start = html.indexOf('const days = ');
const stop = html.indexOf('\n];', start);
if (start < 0 || stop < 0) throw new Error('Could not locate days array.');
const dataStart = start + 'const days = '.length;
const days = JSON.parse(html.slice(dataStart, stop + 2));
if (days.length !== 17) throw new Error('Unexpected day count.');
const day = date => {
  const selected = days.filter(d => d.date === date);
  if (selected.length !== 1) throw new Error('Missing date ' + date);
  return selected[0];
};
const d15 = day('11/15');
const d16 = day('11/16');
const arrival = d15.items.find(i => i.title.includes('纳尔入住'));
const flight = d15.items.find(i => i.title.includes('VF3270'));
const chase = d16.items.find(i => i.title.includes('老爷车追热气球'));
const luggage = d16.items.find(i => i.title.includes('直接到Mithra寄存'));
if (!arrival || !flight || !chase || !luggage ||
    d15.route.at(-1) !== oldHotel || d16.route[0] !== oldHotel)
  throw new Error('Could not identify original Nar accommodation.');

d15.route[d15.route.length - 1] = newHotel;
d16.route[0] = newHotel;
flight.desc = '21:10抵达内夫谢希尔NAV机场后前往Göreme的Ala Stone Hotel – Balloon View Experience。夜间先确认接机、车费与晚到入住，别把落地时间当作酒店到达时间。';
arrival.title = '格雷梅入住｜Ala Stone Hotel · Balloon View Experience';
arrival.time = '约22:15以后｜以实际出机场和接送时间为准';
arrival.map = newHotel;
arrival.desc = '11/15入住、11/16退房（1晚）。Ala Stone Hotel在Göreme镇，不在Nar。酒店地址：' + address +
  '。落地NAV后按事先约好的车前往酒店，夜间入住需提前联系前台确认。11/16清晨追球从这里出发，之后换到同镇Mithra Cave Hotel。露台能否看到热气球取决于当天放飞及天气。';
const chaseMarker = '11/16清晨在Nar办理退房';
const chaseIndex = chase.desc.indexOf(chaseMarker);
if (chaseIndex < 0) throw new Error('Missing original Nar chase plan.');
chase.desc = chase.desc.slice(0, chaseIndex) +
  '11/16清晨从Göreme的Ala Stone Hotel出发追热气球。事前书面确认老爷车能到Ala Stone接人、接车时间、拍摄套餐和停飞退改；当地日出约07:23，具体集合按当天放飞安排。' +
  '当天换酒店，优先问Ala Stone可否暂存行李：拍完回Ala Stone取箱，再去同镇的Mithra寄存。' +
  '如果希望随追球车直接到Mithra，则须确认车辆能否放两人行李、途中保管安全和结束后送达的额外费用；不能默认老爷车能装箱。' +
  '17号仍保留Mithra露台拍热气球，18号不挪用睡懒觉与酒店补拍。';
const timing = luggage.desc.indexOf('10:15左右出发去Ikman');
if (timing < 0) throw new Error('Missing Ikman timing in luggage plan.');
luggage.desc = '追球结束后在Göreme镇内转酒店：如行李寄存在Ala Stone，先回去取箱，再到Mithra寄存；如摄影接送商已同意带行李，则可直接送到Mithra。' +
  '两个酒店都在Göreme，无需从Nar跨镇赶来。提前向Mithra确认早间寄存，不默认提前入住或供应早餐。早餐可问Ala Stone是否能打包，或在Göreme吃。' + luggage.desc.slice(timing);

html = html.slice(0, dataStart) + JSON.stringify(days, null, 2) + html.slice(stop + 2);

// Booking card, address and contact info (from official hotel website).
replaceOne(
  "{type:'已确认住宿',title:'11/15｜Angels City Cave Cappadocia · Nar',rows:['地址：Orta Mah. Aliağa Sok. No:13, Nar, Nevşehir','电话：+90 501 634 50 50','深夜落地后立即休息；次晨11/16追球需确认 Nar 酒店接送'],map:'Angels City Cave Hotel Cappadocia'},",
  "{type:'已确认住宿',title:'11/15–11/16｜Ala Stone Hotel – Balloon View Experience · Göreme',rows:['11/15入住｜11/16退房｜1晚','地址：" + address + "','电话：+90 505 890 21 98','NAV机场到Göreme夜间接送需事先预约；11/16早上追球后换Mithra'],map:'" + newHotel + "'},",
  '15 Nov booking card'
);

// Logistics and checklist snippets outside the days array.
const replacements = [
  ['"k": "NAV → Nar"', '"k": "NAV → Göreme · Ala Stone"', 'NAV heading'],
  [
    '11/15 21:10 落地后不要临时找公共交通。提前让 Nar 酒店或接送公司举牌接机；卡帕多奇亚各镇分散，夜间 dolmuş 不适合作为深夜落地方案。Mithra 官方 FAQ 也明确提供付费机场接送。',
    '11/15 21:10落地NAV后，目的地改为Göreme的Ala Stone Hotel（Kapadokya Sokak No:15）。提前联系酒店或接送公司确认司机接人、总价和晚到入住；夜间不依赖dolmuş临时找车。',
    'NAV transfer'
  ],
  [
    'Nar清晨退房、全部行李随追球车，结束直接到Mithra寄存；提前确认箱子空间和异地送达，装不下则安排独立行李转运。早餐打包或到Göreme吃，不再折返Nar。',
    'Ala Stone和Mithra都在Göreme：11/16先确认Ala Stone可否寄存行李，追球结束取箱后去Mithra寄存。如要追球车直接带箱送Mithra，需事前确认容量及费用。早餐可询问Ala Stone能否打包。',
    '16 Nov transfer'
  ],
  [
    '15号Nar是深夜落地过渡夜；可完整安排傍晚的是16号Göreme与17号Sacred House两晚。',
    '15号Ala Stone（Göreme）是深夜落地过渡夜；16号Mithra和17号Sacred House的住宿不变。可完整安排傍晚的是16号Göreme与17号Sacred House两晚。',
    'hotel notes'
  ],
  [
    '11/16清晨Nar退房带全部行李追球，结束直送Mithra；确认行李容量、早退房与打包早餐、Mithra早间寄存。',
    '11/16清晨从Göreme的Ala Stone出发追球；优先确认退房后暂存行李，再在镇内转至Mithra。若拍摄车带箱直送，先确认容量、送达费用、早餐打包及Mithra寄存。',
    'pre-trip checklist'
  ],
  [
    '确认Nar接人、全部行李容量、结束送Mithra、车数、时长、摄影师和停飞退改。',
    '确认Göreme的Ala Stone接人；如需拍摄车带箱直送Mithra，还应核对容量、费用、车数、时长、摄影师和停飞退改。',
    'balloon photo budget'
  ],
  ["'Angels City Cave Hotel':'纳尔洞穴酒店｜Angels City Cave Hotel'", "'Ala Stone Hotel':'阿拉石头酒店｜Ala Stone Hotel'", 'map label short'],
  ["'Angels City Cave Hotel Cappadocia':'纳尔洞穴酒店｜Angels City Cave Hotel'", "'Ala Stone Hotel Goreme':'阿拉石头酒店｜Ala Stone Hotel'", 'map label long']
];
for (const [from, to, label] of replacements) replaceOne(from, to, label);

// Map data: coordinates from the Ala Stone Hotel listing at 38.650034, 34.831687.
// Full hotel address remains authoritative for the actual entrance.
const oldPoint = /"Angels City Cave Hotel Cappadocia":\s*\[\s*38\.648,\s*34\.715,\s*"Nar镇区域，酒店确认入口"\s*\]/g;
if ([...html.matchAll(oldPoint)].length !== 1) throw new Error('Missing unique original Nar map point.');
html = html.replace(oldPoint, '"Ala Stone Hotel Goreme": [38.650034, 34.831687, "Göreme：Ala Stone Hotel所在区域，酒店入口以实际导航为准"]');

if (/\bAngels City\b|\bNar\b|纳尔/.test(html))
  throw new Error('Old Nar hotel references remain after patch.');
if (!html.includes('11/16｜Mithra Cave Hotel') || !html.includes('11/17｜Sacred House'))
  throw new Error('Later Cappadocia hotels unexpectedly missing.');
writeFileSync(file, html, 'utf8');
console.log('Updated 15-16 Nov Ala Stone Hotel: booking, map, arrival and next-day logistics.');
