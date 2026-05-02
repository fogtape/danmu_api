import test from 'node:test';
import assert from 'node:assert';
import { handleRequest } from './worker.js';
import { Globals } from './configs/globals.js';

class MockRequest {
  constructor(url, options = {}) {
    this.url = url;
    this.method = options.method || 'GET';
    this.headers = new Headers(options.headers || {});
    this._body = options.body;
  }

  clone() {
    return new MockRequest(this.url, {
      method: this.method,
      headers: Object.fromEntries(this.headers.entries()),
      body: this._body
    });
  }

  async json() {
    return typeof this._body === 'string' ? JSON.parse(this._body) : this._body;
  }

  async text() {
    return typeof this._body === 'string' ? this._body : (this._body ? JSON.stringify(this._body) : '');
  }

  async formData() {
    return new URLSearchParams(await this.text());
  }
}

async function parseResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createSearchResult(anime) {
  return {
    animeId: anime.animeId,
    bangumiId: anime.bangumiId,
    animeTitle: anime.animeTitle,
    type: anime.type,
    typeDescription: anime.typeDescription,
    imageUrl: anime.imageUrl,
    startDate: anime.startDate,
    episodeCount: anime.episodeCount,
    rating: anime.rating,
    isFavorited: anime.isFavorited,
    source: anime.source
  };
}

function resetSearchState() {
  Globals.init({});
  Globals.animes = [];
  Globals.episodeIds = [];
  Globals.episodeNum = 10001;
  Globals.searchCache = new Map();
  Globals.commentCache = new Map();
  Globals.requestHistory = new Map();
  Globals.envs.rateLimitMaxRequests = 0;
  delete Globals.requestAnimeDetailsMap;
}

function cacheSearchAnime(anime, keyword = anime.animeTitle) {
  Globals.searchCache.set(keyword, {
    results: [createSearchResult(anime)],
    details: [anime],
    timestamp: Date.now()
  });
}

function buildAnime({ title, id, episodeId }) {
  return {
    animeId: id,
    bangumiId: String(id),
    animeTitle: title,
    type: 'tvseries',
    typeDescription: 'TV',
    imageUrl: '',
    startDate: '2024-01-01T00:00:00.000Z',
    episodeCount: 1,
    rating: 0,
    isFavorited: true,
    source: 'tencent',
    links: [
      { id: episodeId, url: `https://v.qq.com/x/cover/fongmi-root/${episodeId}.html`, title: '【qq】 第1集' }
    ]
  };
}

const urlPrefix = 'http://localhost:9321';

test('Fongmi root entry without /danmaku should return candidates for token GET', async () => {
  resetSearchState();
  const anime = buildAnime({ title: '无danmaku入口番剧', id: 910100, episodeId: 61001 });
  cacheSearchAnime(anime);

  const req = new MockRequest(`${urlPrefix}/token123?name=${encodeURIComponent(anime.animeTitle)}&episode=1`, {
    method: 'GET'
  });
  const res = await handleRequest(req, { TOKEN: 'token123', RATE_LIMIT_MAX_REQUESTS: '0', USE_BANGUMI_DATA: 'false' }, 'test', '127.0.0.1');
  const body = await parseResponse(res);

  assert.equal(res.status, 200);
  assert.deepEqual(body, [
    {
      name: `${anime.animeTitle} - 【qq】 第1集`,
      url: `${urlPrefix}/token123/api/v2/comment/61001?format=xml`
    }
  ]);
});

test('Fongmi root entry without /danmaku should parse token POST form body', async () => {
  resetSearchState();
  const anime = buildAnime({ title: '根POST入口番剧', id: 910101, episodeId: 61002 });
  cacheSearchAnime(anime);

  const req = new MockRequest(`${urlPrefix}/token123`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `name=${encodeURIComponent(anime.animeTitle)}&episode=1`
  });
  const res = await handleRequest(req, { TOKEN: 'token123', RATE_LIMIT_MAX_REQUESTS: '0', USE_BANGUMI_DATA: 'false' }, 'test', '127.0.0.1');
  const body = await parseResponse(res);

  assert.equal(res.status, 200);
  assert.equal(body[0]?.url, `${urlPrefix}/token123/api/v2/comment/61002?format=xml`);
});
