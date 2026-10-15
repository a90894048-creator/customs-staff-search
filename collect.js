// 관세청·전국 세관 직원/업무 목록 수집기
// 실행: node collect.js            → data.json 생성
//       node collect.js --push     → data.json 생성 후 GitHub에 게시 (config.json 필요)
// 외부 패키지 없이 Node.js 기본 모듈만 사용한다.
const https = require('https');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const DATA_FILE = path.join(DIR, 'data.json');
const CONFIG_FILE = path.join(DIR, 'config.json');

// 세관별 [업무안내 메뉴번호(mi), 기관코드(searchOrg)]. 관세청이 번호를 바꾸는 일이 있어
// 실행할 때마다 discover() 가 사이트에서 최신 값을 읽어 덮어쓰고, 실패하면 아래 값을 쓴다. (2026-10-15 확인)
const ORG_MAP = {
  kcs: ['2956', ''], cclss: ['3270', '000000508'], seoul: ['3793', '000000240'], busan: ['7212', '000000338'], incheon: ['3685', '000000408'],
  incheon_airport: ['12666', '030011036'], daegu: ['3901', '000000445'], gwangju: ['3978', '000000472'], pyeongtaek: ['4104', '000000614'],
  kimpo: ['4186', '030010739'], seongnam: ['4279', '000000280'], anyang: ['4379', '000000282'], changwon: ['4579', '000000386'], ulsan: ['4679', '000000464'],
  yangsan: ['4779', '000000390'], masan: ['4879', '000000394'], jeju: ['4979', '000000500'], suwon: ['5079', '000000435'], ansan: ['5179', '000000440'],
  pohang: ['5279', '000000456'], gumi: ['5379', '000000460'], gunsan: ['5479', '000000482'], mokpo: ['5579', '000000489'], yeosu: ['5679', '000000495'],
  cheongju: ['5779', '000000299'], cheonan: ['5879', '000000294'], gwangyang: ['5979', '000000686'], sokcho: ['6079', '030010670'], jeonju: ['6179', '000000486'],
  paju: ['6279', '010002445'], yongdang: ['6479', '030010857'], gimhae: ['6579', '030010735'], geoje: ['6679', '030010737'], jinju: ['6779', '030010738'],
  donghae: ['4479', '030010671'], daejeon: ['6979', '030010672'],
};

const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

function request(url, { method = 'GET', headers = {}, body = null, insecure = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, agent: insecure ? agent : undefined, timeout: 60000 }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const decode = s => s
  .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/\s+/g, ' ').trim();

function parseRows(html) {
  const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbody) return [];
  const rows = [];
  for (const tr of tbody[1].match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(m => decode(m[1]));
    if (cells.length >= 4) rows.push(cells);
  }
  return rows;
}

// condition 1 = 직원(성명) 목록, 2 = 부서·업무 목록. 검색어 없이 전체를 한 페이지로 받는다.
async function fetchList(sysId, condition) {
  const [mi, searchOrg] = ORG_MAP[sysId];
  const body = new URLSearchParams({
    mi, sysId, searchCondition: condition, searchOrg, searchKeyword: '', currPage: '1', pageIndex: '5000',
  }).toString();
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await request(`https://www.customs.go.kr/${sysId}/ad/de/selectEmpName.do`, {
        method: 'POST', insecure: true, body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': UA,
        },
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return parseRows(res.body);
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// 각 세관 메인 → 업무안내 메뉴번호, 업무안내 페이지 → 기관코드를 읽어 ORG_MAP 갱신
async function discover() {
  const changed = [];
  await Promise.all(Object.keys(ORG_MAP).map(async id => {
    try {
      const headers = { 'User-Agent': UA, Accept: 'text/html' };
      const main = await request(`https://www.customs.go.kr/${id}/main.do`, { insecure: true, headers });
      const mi = (main.body.match(/selectEmpName\.do\?(?:[^"']*&)?mi=(\d+)/) || [])[1] || ORG_MAP[id][0];
      const page = await request(`https://www.customs.go.kr/${id}/ad/de/selectEmpName.do?mi=${mi}`, { insecure: true, headers });
      const org = (page.body.match(/selectEmpName\.do\?searchOrg=(\d+)/) || [])[1] || '';
      if (mi !== ORG_MAP[id][0] || org !== ORG_MAP[id][1]) changed.push(`${id} ${ORG_MAP[id].join('/')}→${mi}/${org}`);
      ORG_MAP[id] = [mi, org];
    } catch (e) {
      console.log(`  ! ${id} 코드 확인 실패(기본값 사용): ${e.message}`);
    }
  }));
  if (changed.length) console.log(`  코드 갱신: ${changed.join(', ')}`);
}

// 행 형식: [세관코드, 소속기관, 부서, 직위, 성명, 주요업무, 전화번호]
function toRecord(sysId, cells) {
  if (cells.length === 6) return [sysId, cells[0], cells[1], cells[2], cells[3], cells[4], cells[5]];
  if (cells.length === 5) return [sysId, cells[0], cells[1], '', '', cells[2], cells[3]]; // 부서 단위 (FAX 제외)
  if (/없습니다/.test(cells.join(''))) return null;
  return [sysId, cells[0] || '', '', cells[1] || '', cells[2] || '', cells[3] || '', cells[4] || ''];
}

async function collect() {
  await discover();
  const prev = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : { rows: [] };
  const jobs = Object.keys(ORG_MAP).flatMap(id => [[id, '1'], [id, '2']]);
  const bySys = {}, failed = new Set();
  let i = 0;
  async function worker() {
    while (i < jobs.length) {
      const [id, cond] = jobs[i++];
      try {
        const rows = await fetchList(id, cond);
        (bySys[id] ||= []).push(...rows.map(c => toRecord(id, c)).filter(Boolean));
      } catch (e) {
        failed.add(id);
        console.log(`  ! ${id} (조건 ${cond}) 실패: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));

  // 실패한 세관은 이전 데이터를 유지한다
  for (const id of failed) bySys[id] = prev.rows.filter(r => r[0] === id);

  const seen = new Set(), rows = [];
  for (const id of Object.keys(ORG_MAP)) {
    for (const r of bySys[id] || []) {
      const key = r.slice(1).join('|');
      if (!seen.has(key)) { seen.add(key); rows.push(r); }
    }
  }
  return { rows, failed: [...failed], prevCount: prev.rows.length };
}

async function pushToGitHub(content, cfg) {
  const api = `https://api.github.com/repos/${cfg.repo}/contents/data.json`;
  const headers = {
    Authorization: `Bearer ${cfg.token}`, 'User-Agent': 'customs-staff-search', Accept: 'application/vnd.github+json',
  };
  const cur = await request(`${api}?ref=${cfg.branch || 'main'}`, { headers });
  const sha = cur.status === 200 ? JSON.parse(cur.body).sha : undefined;
  const body = JSON.stringify({
    message: `직원 목록 자동 갱신 (${content.updated.slice(0, 10)}, ${content.rows.length}건)`,
    content: Buffer.from(JSON.stringify(content)).toString('base64'),
    branch: cfg.branch || 'main', sha,
  });
  const res = await request(api, {
    method: 'PUT', body, headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  });
  if (res.status !== 200 && res.status !== 201) throw new Error(`GitHub 게시 실패 HTTP ${res.status}: ${res.body.slice(0, 200)}`);
  console.log(`게시 완료 (HTTP ${res.status})`);
}

(async () => {
  const started = Date.now();
  console.log(`[${new Date().toLocaleString('ko-KR')}] 수집 시작`);
  const { rows, failed, prevCount } = await collect();
  console.log(`수집 ${rows.length}건 (이전 ${prevCount}건, 실패 세관 ${failed.length}개) ${((Date.now() - started) / 1000).toFixed(1)}초`);

  // 사이트 장애 등으로 대량 누락되면 기존 데이터를 덮어쓰지 않는다
  if (prevCount && rows.length < prevCount * 0.5) {
    console.log('수집 건수가 이전의 절반 미만이라 저장하지 않습니다.');
    process.exit(1);
  }
  const content = { updated: new Date().toISOString(), failed, rows };
  fs.writeFileSync(DATA_FILE, JSON.stringify(content));
  console.log(`저장: ${DATA_FILE}`);

  if (process.argv.includes('--push')) {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    await pushToGitHub(content, cfg);
  }
})().catch(e => { console.error('오류:', e.message); process.exit(1); });
