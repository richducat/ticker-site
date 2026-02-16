import fs from 'fs';
import path from 'path';

const credsPath = '/Users/RichardDucat_1/.config/simmer/credentials.json';
const apiBase = 'https://api.simmer.markets';

const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
const apiKey = creds.api_key;

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function fmtUsd(n) {
  if (n == null || Number.isNaN(n)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

(async () => {
  const [portfolio, trades, positions] = await Promise.all([
    getJson(`${apiBase}/api/sdk/portfolio`),
    getJson(`${apiBase}/api/sdk/trades?limit=5`),
    getJson(`${apiBase}/api/sdk/positions`)
  ]);

  const tradesArr = Array.isArray(trades) ? trades : (trades?.trades || trades?.data || []);
  const positionsArr = Array.isArray(positions) ? positions : (positions?.positions || positions?.data || []);

  const balanceRaw = portfolio?.balance_usd ?? portfolio?.balanceUsd;
  const exposureRaw = portfolio?.exposure_usd ?? portfolio?.exposureUsd;
  const pnlRaw = portfolio?.total_pnl_usd ?? portfolio?.totalPnlUsd;

  const fallbackExposure = positions?.total_value ?? positions?.totalValue;
  const fallbackPnl = positions?.polymarket_pnl ?? positions?.sim_pnl ?? positions?.pnl;

  const data = {
    balanceUsd: fmtUsd(balanceRaw),
    exposureUsd: fmtUsd((Number(exposureRaw)||0) ? exposureRaw : fallbackExposure),
    positionsCount: positionsArr.length || (positions?.count ?? 0),
    totalPnlUsd: fmtUsd((Number(pnlRaw)||0) ? pnlRaw : fallbackPnl),
    lastTrades: tradesArr.slice(0,5).map(t => ({
      side: (t.action ? t.action.toUpperCase() : '') + (t.side ? ` ${t.side.toUpperCase()}` : '') || 'TRADE',
      symbol: t.market_question || t.question || t.symbol || t.market || t.asset || 'UNKNOWN',
      price: t.price_before != null ? `$${Number(t.price_before).toFixed(3)}` : (t.price != null ? `$${Number(t.price).toFixed(3)}` : '--'),
      size: t.shares != null ? Number(t.shares).toFixed(2) : (t.size != null ? Number(t.size).toFixed(2) : '--')
    })),
    updatedAt: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET'
  };

  const outJson = path.resolve('docs/data.json');
  fs.writeFileSync(outJson, JSON.stringify(data, null, 2));

  const outJs = path.resolve('docs/data.js');
  fs.writeFileSync(outJs, `window.TICKER_DATA = ${JSON.stringify(data)};`);

  const indexPath = path.resolve('docs/index.html');
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  indexHtml = indexHtml.replace(
    /\/\/ __TICKER_DATA__\n/, 
    `window.TICKER_DATA = ${JSON.stringify(data)};\n`
  );

  const statsHtml = [
    ['Balance', data.balanceUsd],
    ['Exposure', data.exposureUsd],
    ['Positions', data.positionsCount],
    ['PnL', data.totalPnlUsd],
  ].map(([label, value]) => (
    `<div class=\"card\"><div class=\"label\">${label}</div><div class=\"value\">${value}</div></div>`
  )).join('');

  const tickerText = (data.lastTrades || []).map(t => `${t.side} ${t.symbol} ${t.price} (${t.size})`).join('  •  ') || 'NO RECENT TRADES';

  indexHtml = indexHtml
    .replace(/<!-- STATS_HTML -->[\s\S]*?<!--/m, `<!-- STATS_HTML -->${statsHtml}<!--`)
    .replace(/<!-- TICKER_TEXT -->[\s\S]*?<!--/m, `<!-- TICKER_TEXT -->${tickerText}<!--`)
    .replace(/<!-- UPDATED_AT -->[\s\S]*?<!--/m, `<!-- UPDATED_AT -->${data.updatedAt}<!--`);

  fs.writeFileSync(indexPath, indexHtml);

  console.log('Updated', outJson, outJs, 'and inline data in index.html');
})();
