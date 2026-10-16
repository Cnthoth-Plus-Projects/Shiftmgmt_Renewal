const fs = require('fs');
const p = 'C:/Projects/Active/교대근무관리 시스템/시안/2026-08-29/재작업-지시서.md';
const L = fs.readFileSync(p, 'utf8').split('\n');

// 표 행 수를 세는 도우미: 헤더 정규식 뒤의 |---| 를 건너뛰고 연속된 | 행을 센다
const tableRows = (headerRe) => {
  const i = L.findIndex((l) => headerRe.test(l));
  if (i < 0) return `헤더 못 찾음 (${headerRe})`;
  let j = i + 1;
  if (/^\|[-\s|]+\|$/.test(L[j])) j++;
  let c = 0;
  while (j < L.length && L[j].startsWith('|')) { c++; j++; }
  return c;
};
const countLines = (re) => L.filter((l) => re.test(l)).length;
const sectionCount = (re) => L.filter((l) => re.test(l)).length;

const checks = [
  ['§0 잘된 것 표',            tableRows(/^\| 잘된 것 \| 어디 \|/),            '§7의 "잘된 것 N가지"'],
  ['§0 깨뜨리면 안 되는 규칙',  tableRows(/^\| # \| 깨뜨리면 안 되는 것 \|/),   '§7의 "규칙 N가지"'],
  ['우선순위 표 행',            tableRows(/^\| # \| 발주서\(11\) \| 이 지시서 \| 어디 \|/), '머리말 "N 곳"'],
  ['최소 JavaScript 표',        tableRows(/^\| # \| 동작 \|/),                  '제목 "N가지"'],
  ['일부러 다르게 표',          tableRows(/^\| 지금 프로그램 \| 이번 시안 \| 왜 \|/), '제목 "N군데"'],
  ['§4 MINOR 표',              tableRows(/^\| # \| 내용 \|/),                  '제목 "N건"'],
  ['§6 20상태 표',             tableRows(/^\| # \| 파일 \| 상태 \| 역할 \|/),   '"20상태"'],
  ['다섯상태 매트릭스 행',      tableRows(/^\| 화면 \| 로딩 \| 빈 상태 \| 오류 \| 권한 없음 \| 처리 중 \|/), '3행'],
  ['§2 소절 (## 2-N)',         sectionCount(/^## 2-\d/),                       '제목 "N건"'],
  ['§3 소절 (## 3-N)',         sectionCount(/^## 3-\d/),                       '제목 "N건"'],
  ['§5 소절 (## 5-N)',         sectionCount(/^## 5-\d/),                       '제목 "N가지"'],
  ['업데이트 문구 종수',        (() => { const i = L.findIndex(l=>/^### `업데이트` 칸에 쓸 수 있는 문구/.test(l)); if(i<0) return '못 찾음';
                                 let j=i; while(j<L.length && !L[j].startsWith('```')) j++; j++; let c=0;
                                 while(j<L.length && !L[j].startsWith('```')) { if(L[j].trim()) c++; j++; } return c; })(), '"일곱 가지"'],
  ['자동검증 번호 항목',        countLines(/^\d\. (Tab 순서|표 키보드|모달|비활성 버튼|마법사 침범|승인)/), '"N항목"'],
  ['동작 정의표 열 수',         (() => { const l = L.find(x=>/^\| \*\*화면·상태\*\* \| 요소 \|/.test(x)); return l ? l.split('|').filter(s=>s.trim()).length : '못 찾음'; })(), '"10개 항목"'],
];

console.log('항목'.padEnd(28), '실제', ' ', '대조 대상');
console.log('-'.repeat(72));
for (const [name, n, vs] of checks) console.log(String(name).padEnd(28), String(n).padStart(4), ' ', vs);

console.log('\n=== 문서에 적힌 개수 표기 (수동 대조용) ===');
const claims = [
  /일곱 곳입니다/, /최소 JavaScript \S+가지/, /네 군데입니다/, /MINOR\) — \S+건/,
  /BLOCKER\) — \S+건/, /MAJOR\) — \S+건/, /제출해 주셔야 하는 것 \S+가지/,
  /잘된 것 \S+가지/, /규칙 \S+가지/, /일곱 가지/, /자동 검증 \*\*\S+항목\*\*/,
  /\*\*10개 항목\*\*/, /채워짐 \d+칸/, /후속 \d+칸/, /해당 없음 \d+칸/, /= 15칸/,
  /배지는 10종/, /공통 배지는 10종/, /최대 3개/, /20상태/, /25장/, /89장/,
];
L.forEach((l, i) => { for (const re of claims) if (re.test(l)) { console.log(`${String(i+1).padStart(4)}: ${l.trim().slice(0,110)}`); break; } });
