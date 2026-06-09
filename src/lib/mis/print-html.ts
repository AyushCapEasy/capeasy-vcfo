// src/lib/mis/print-html.ts — builds the print-ready (A4) HTML for the MIS pack PDF. Reads the SAME
// engine results via present.ts as the on-screen view, so the PDF's numbers trace to the engine with
// no recomputation. The SAMPLE watermark comes from the single flag (src/lib/watermark.ts) and tiles
// across every page. puppeteer renders this with printBackground:true so the watermark + fills show.
import type { MisChain } from '@/lib/engine/mis-data';
import { pnlRows, bsAssetRows, bsLiabEquityRows, cfRows, ratioCards, kpis, trendSeries, inr, type StmtRow } from './present';
import { WATERMARK_ENABLED, WATERMARK_TEXT } from '../watermark';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function stmt(rows: StmtRow[]): string {
  return rows
    .map((r) => {
      const cls = r.kind === 'total' ? 'total' : r.kind === 'subtotal' ? 'subtotal' : 'line';
      const note = r.note ? `<span class="note"> · ${esc(r.note)}</span>` : '';
      return `<tr class="${cls}"><td>${esc(r.label)}${note}</td><td class="num">${esc(inr(r.paise))}</td></tr>`;
    })
    .join('');
}

function sparkSvg(values: number[]): string {
  const w = 150;
  const h = 40;
  const max = Math.max(...values.map((v) => Math.abs(v)), 1);
  const slot = w / Math.max(values.length, 1);
  const bars = values
    .map((v, i) => {
      const bh = Math.max((Math.abs(v) / max) * (h - 3), 1);
      const fill = v < 0 ? '#b91c1c' : '#1e4fa8';
      const op = i === values.length - 1 ? 1 : 0.45;
      return `<rect x="${(i * slot + slot * 0.22).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(slot * 0.56).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${fill}" opacity="${op}"/>`;
    })
    .join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
}

export function buildMisPrintHtml(chain: MisChain, selectedIdx: number): string {
  const periodMeta = chain.periods[selectedIdx];
  const result = chain.results[selectedIdx];
  const k = kpis(chain.results, selectedIdx);
  const cf = cfRows(result);
  const trends = trendSeries(chain.results);

  const watermarkTile = WATERMARK_ENABLED
    ? `<svg xmlns='http://www.w3.org/2000/svg' width='460' height='300'><text x='10' y='160' transform='rotate(-28 230 150)' font-family='Inter, Segoe UI, sans-serif' font-size='19' font-weight='700' fill='rgba(30,79,168,0.12)'>${WATERMARK_TEXT}</text></svg>`
    : '';

  const kpiHtml = k
    .map((c) => {
      const delta = c.deltaPct === null ? '<span class="muted">— first period</span>' : `<span class="${c.deltaPct >= 0 ? 'pos' : 'neg'}">${c.deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(c.deltaPct).toFixed(1)}% MoM</span>`;
      return `<div class="kpi"><div class="kpi-l">${esc(c.label)}</div><div class="kpi-v">${esc(inr(c.paise))}</div><div class="kpi-d">${delta}</div></div>`;
    })
    .join('');

  const ratioHtml = ratioCards(result)
    .map((c) => `<div class="ratio"><div class="ratio-l">${esc(c.label)}</div><div class="ratio-v">${esc(c.value)}</div></div>`)
    .join('');

  const trendHtml = trends
    .map((t) => `<div class="trend"><div class="trend-l">${esc(t.label)}</div>${sparkSvg(t.points.map((p) => p.paise))}<div class="trend-v">${esc(inr(t.points[t.points.length - 1].paise))}</div></div>`)
    .join('');

  const cfHtml = cf
    ? `<table class="stmt">${stmt(cf)}</table>`
    : `<p class="muted pad">n/a — needs a prior period (first period in the chain).</p>`;

  const commentary = periodMeta.commentary ? `<div class="card"><h3>Analyst commentary</h3><p class="comment">${esc(periodMeta.commentary)}</p></div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Inter','Segoe UI',Roboto,-apple-system,sans-serif; color:#0f172a; font-size:11px; margin:0; background:#ffffff; }
  .watermark { position: fixed; inset:0; z-index:50; pointer-events:none; ${WATERMARK_ENABLED ? `background-image:url("data:image/svg+xml,${encodeURIComponent(watermarkTile)}"); background-repeat:repeat;` : ''} }
  .page { position: relative; z-index:1; }
  .ribbon { background:#fef0e6; color:#c2540f; border:1px solid #f7c79f; font-weight:700; font-size:10px; letter-spacing:.04em; text-align:center; padding:5px; border-radius:6px; margin-bottom:10px; }
  header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1e4fa8; padding-bottom:8px; margin-bottom:12px; }
  .brand { color:#64748b; font-size:10px; }
  h1 { font-size:20px; margin:2px 0 0; letter-spacing:-.01em; }
  .sub { color:#475569; font-size:11px; margin-top:2px; }
  .badge { display:inline-block; border:1px solid #cbd5e1; border-radius:4px; padding:1px 6px; font-size:9px; text-transform:uppercase; font-weight:700; color:#475569; margin-left:6px; }
  .kpis { display:flex; gap:8px; margin-bottom:12px; }
  .kpi { flex:1; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; }
  .kpi-l { color:#94a3b8; font-size:9px; text-transform:uppercase; letter-spacing:.04em; }
  .kpi-v { font-size:15px; font-weight:700; margin-top:2px; }
  .kpi-d { font-size:9px; margin-top:2px; }
  .grid2 { display:flex; gap:12px; }
  .grid2 > * { flex:1; }
  .card { border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; margin-bottom:12px; background:#fff; }
  .card h3 { font-size:11px; margin:0; padding:7px 10px; border-bottom:1px solid #eef2f6; background:#f8fafc; }
  table.stmt { width:100%; border-collapse:collapse; }
  table.stmt td { padding:3px 10px; font-size:11px; border-top:1px solid #f1f5f9; }
  table.stmt td.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  tr.subtotal td { background:#f8fafc; font-weight:600; }
  tr.total td { background:#eef3fb; font-weight:700; color:#1e4fa8; }
  .note { color:#94a3b8; font-weight:400; }
  .ratios { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:#eef2f6; }
  .ratio { background:#fff; padding:6px 10px; }
  .ratio-l { color:#94a3b8; font-size:9px; }
  .ratio-v { font-weight:600; font-size:13px; margin-top:1px; font-variant-numeric:tabular-nums; }
  .trends { display:flex; gap:14px; padding:10px; }
  .trend { flex:1; }
  .trend-l { font-size:10px; color:#475569; font-weight:600; }
  .trend-v { font-size:12px; font-weight:700; margin-top:2px; font-variant-numeric:tabular-nums; }
  .comment { padding:8px 10px; white-space:pre-wrap; font-size:11px; color:#334155; }
  .muted { color:#94a3b8; } .pad { padding:10px; }
  .pos { color:#15803d; } .neg { color:#b91c1c; }
  footer { text-align:center; color:#94a3b8; font-size:9px; margin-top:8px; }
  </style></head><body>
  <div class="watermark"></div>
  <div class="page">
    ${WATERMARK_ENABLED ? `<div class="ribbon">${WATERMARK_TEXT}</div>` : ''}
    <header>
      <div><div class="brand">CapEasy vCFO · Management MIS Pack</div><h1>${esc(chain.org.legalName)}</h1><div class="sub">${esc(periodMeta.label)}<span class="badge">${esc(periodMeta.status)}</span></div></div>
      <div class="brand" style="text-align:right">Figures computed by the engine<br/><b>UNVERIFIED</b> — pending CA sign-off</div>
    </header>
    <div class="kpis">${kpiHtml}</div>
    <div class="grid2">
      <div class="card"><h3>Profit &amp; Loss</h3><table class="stmt">${stmt(pnlRows(result))}</table></div>
      <div class="card"><h3>Balance Sheet</h3><table class="stmt">${stmt(bsAssetRows(result))}<tr><td colspan="2" style="height:4px;background:#f1f5f9"></td></tr>${stmt(bsLiabEquityRows(result))}</table></div>
    </div>
    <div class="card"><h3>Cash Flow — indirect</h3>${cfHtml}</div>
    <div class="card"><h3>Key ratios &amp; working capital</h3><div class="ratios">${ratioHtml}</div></div>
    <div class="card"><h3>Month-on-month trend</h3><div class="trends">${trendHtml}</div></div>
    ${commentary}
    <footer>Generated by CapEasy vCFO · all figures UNVERIFIED until CA sign-off · ₹ = INR.</footer>
  </div>
  </body></html>`;
}
