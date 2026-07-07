const { getStore } = require('@netlify/blobs');

function getSackStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'heaviest-sack', siteID, token });
  }
  return getStore('heaviest-sack');
}

const TIER_BITS_DEFAULT = { '1000': 258, '2000': 417, '3000': 1205 };
const TIER_DOLLARS_DEFAULT = { '1000': 3.60, '2000': 5.82, '3000': 16.81 };

function emptyState() {
  return {
    donors: {},
    processedMsgIds: [],
    processedGiftIds: [],
    lastManualId: null
  };
}

function trimArray(arr, max) {
  if (arr.length > max) return arr.slice(arr.length - max);
  return arr;
}

function planTierKey(plan) {
  if (plan === '2000') return 't2';
  if (plan === '3000') return 't3';
  return 't1';
}

function ensureDonor(state, user) {
  if (!state.donors[user]) {
    state.donors[user] = {
      bits: 0,
      subCount: 0,
      subBits: 0,
      subDollars: 0,
      subTiers: { t1: 0, t2: 0, t3: 0 },
      lastUpdated: 0
    };
  }
  return state.donors[user];
}

function addBits(state, user, amount) {
  const d = ensureDonor(state, user);
  d.bits += amount;
  d.lastUpdated = Date.now();
}

function addSubs(state, user, plan, count, tierBits, tierDollars) {
  const d = ensureDonor(state, user);
  const bitsVal = tierBits[plan] || tierBits['1000'];
  const dollarsVal = tierDollars[plan] || tierDollars['1000'];
  d.subBits += bitsVal * count;
  d.subDollars += dollarsVal * count;
  d.subCount += count;
  d.subTiers[planTierKey(plan)] += count;
  d.lastUpdated = Date.now();
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const store = getSackStore();

  if (event.httpMethod === 'GET') {
    const streamID = (event.queryStringParameters && event.queryStringParameters.streamID) || 'default';
    const raw = await store.get(streamID, { type: 'json' });
    const state = raw || emptyState();
    return { statusCode: 200, headers, body: JSON.stringify({ donors: state.donors }) };
  }

  if (event.httpMethod === 'POST') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid json' }) };
    }

    const streamID = payload.streamID || 'default';
    const raw = await store.get(streamID, { type: 'json' });
    const state = raw || emptyState();

    const tierBits = {
      '1000': parseInt(payload.tier1Bits, 10) || TIER_BITS_DEFAULT['1000'],
      '2000': parseInt(payload.tier2Bits, 10) || TIER_BITS_DEFAULT['2000'],
      '3000': parseInt(payload.tier3Bits, 10) || TIER_BITS_DEFAULT['3000']
    };
    const tierDollars = {
      '1000': parseFloat(payload.tier1Dollars) || TIER_DOLLARS_DEFAULT['1000'],
      '2000': parseFloat(payload.tier2Dollars) || TIER_DOLLARS_DEFAULT['2000'],
      '3000': parseFloat(payload.tier3Dollars) || TIER_DOLLARS_DEFAULT['3000']
    };

    const kind = payload.kind;
    let skipped = false;

    if (kind === 'cheer') {
      const msgId = payload.msgId;
      if (msgId) {
        if (state.processedMsgIds.includes(msgId)) {
          skipped = true;
        } else {
          state.processedMsgIds = trimArray([...state.processedMsgIds, msgId], 1000);
        }
      }
      if (!skipped) addBits(state, payload.user, payload.bits);
    } else if (kind === 'sub') {
      const msgId = payload.msgId;
      if (msgId) {
        if (state.processedMsgIds.includes(msgId)) {
          skipped = true;
        } else {
          state.processedMsgIds = trimArray([...state.processedMsgIds, msgId], 1000);
        }
      }
      if (!skipped) addSubs(state, payload.user, payload.plan, payload.count || 1, tierBits, tierDollars);
    } else if (kind === 'subgift' || kind === 'submysterygift') {
      const giftId = payload.giftId;
      if (giftId) {
        if (state.processedGiftIds.includes(giftId)) {
          skipped = true;
        } else {
          state.processedGiftIds = trimArray([...state.processedGiftIds, giftId], 1000);
        }
      }
      if (!skipped) addSubs(state, payload.user, payload.plan, payload.count || 1, tierBits, tierDollars);
    } else if (kind === 'manual') {
      const id = payload.id;
      if (!id || id === state.lastManualId) {
        skipped = true;
      } else {
        state.lastManualId = id;
        if (payload.type === 'bits') {
          addBits(state, payload.user, payload.amount || 1);
        } else {
          const planMap = { t1: '1000', t2: '2000', t3: '3000' };
          addSubs(state, payload.user, planMap[payload.type] || '1000', payload.amount || 1, tierBits, tierDollars);
        }
      }
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'unknown kind' }) };
    }

    if (!skipped) {
      await store.setJSON(streamID, state);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ donors: state.donors, skipped }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'method not allowed' }) };
};
