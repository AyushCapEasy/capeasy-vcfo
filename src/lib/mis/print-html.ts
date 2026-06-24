// src/lib/mis/print-html.ts — builds the print-ready (A4) HTML for the MIS pack PDF. Reads the SAME
// engine results via present.ts as the on-screen view, so the PDF's numbers trace to the engine with
// no recomputation. The SAMPLE watermark comes from the single flag (src/lib/watermark.ts) and tiles
// across every page. puppeteer renders this with printBackground:true so the watermark + fills show.
import type { MisChain } from '@/lib/engine/mis-data';
import { cfRows, ratioCards, kpis, trendSeries, inr, type StmtRow } from './present';
import { plScheduleIII, bsScheduleIII, SCH3_PL_FOOTNOTES, SCH3_BS_FOOTNOTES, type Sch3Row } from './schedule3';
import { computeObservations } from '../insight/observations';
import { computeDiagnoses } from '../insight/diagnoses';
import { computeRecommendations, computeGoalTracking } from '../insight/recommendations';
import { WATERMARK_ENABLED, WATERMARK_TEXT } from '../watermark';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function stmt(rows: StmtRow[]): string {
  return rows
    .map((r) => {
      const cls = r.kind === 'total' ? ((r.paise ?? 0) < 0 ? 'total loss' : 'total') : r.kind === 'subtotal' ? 'subtotal' : 'line';
      const note = r.note ? `<span class="note"> · ${esc(r.note)}</span>` : '';
      return `<tr class="${cls}"><td>${esc(r.label)}${note}</td><td class="num">${esc(inr(r.paise))}</td></tr>`;
    })
    .join('');
}

// Schedule III statutory statement → 3-column table (Particulars · current · prior-year comparative).
function stmt3(rows: Sch3Row[], curLabel: string, priorLabel: string | null, footnotes: string[]): string {
  const amt = (p: number | null) => (p === null ? '—' : inr(p));
  const head = `<tr class="hdr"><td>Particulars</td><td class="num">${esc(curLabel)}</td><td class="num">${esc(priorLabel ?? 'Prior year')}</td></tr>`;
  const body = rows
    .map((r) => {
      const cls = r.kind === 'total' ? ((r.curPaise ?? 0) < 0 ? 'total loss' : 'total') : r.kind === 'subtotal' ? 'subtotal' : r.kind === 'header' ? 'header' : 'line';
      const no = r.no ? `<b>${esc(r.no)}</b> ` : '';
      const note = r.note ? `<span class="note"> · ${esc(r.note)}</span>` : '';
      const pad = r.indent ? ' style="padding-left:22px"' : '';
      if (r.kind === 'header') return `<tr class="${cls}"><td colspan="3"${pad}>${no}${esc(r.label)}${note}</td></tr>`;
      return `<tr class="${cls}"><td${pad}>${no}${esc(r.label)}${note}</td><td class="num">${esc(amt(r.curPaise))}</td><td class="num">${esc(amt(r.priorPaise))}</td></tr>`;
    })
    .join('');
  const fn = footnotes.length ? `<tr class="fn"><td colspan="3"><ol>${footnotes.map((f) => `<li>${esc(f)}</li>`).join('')}</ol></td></tr>` : '';
  return `<table class="stmt">${head}${body}${fn}</table>`;
}

function sparkSvg(values: number[]): string {
  const w = 150;
  const h = 40;
  const max = Math.max(...values.map((v) => Math.abs(v)), 1);
  const slot = w / Math.max(values.length, 1);
  const bars = values
    .map((v, i) => {
      const bh = Math.max((Math.abs(v) / max) * (h - 3), 1);
      const fill = v < 0 ? '#dc2626' : '#047857';
      const op = i === values.length - 1 ? 1 : 0.45;
      return `<rect x="${(i * slot + slot * 0.22).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(slot * 0.56).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${fill}" opacity="${op}"/>`;
    })
    .join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
}

export function buildMisPrintHtml(chain: MisChain, selectedIdx: number): string {
  const periodMeta = chain.periods[selectedIdx];
  const result = chain.results[selectedIdx];
  const prior = selectedIdx > 0 ? chain.results[selectedIdx - 1] : null;
  const priorMeta = selectedIdx > 0 ? chain.periods[selectedIdx - 1] : null;
  const k = kpis(chain.results, selectedIdx);
  const cf = cfRows(result);
  const trends = trendSeries(chain.results);
  const observations = computeObservations(chain.results).filter((o) => o.periodsCompared[1] === periodMeta.label);
  const diagnoses = computeDiagnoses(observations, chain.results);
  const recommendations = computeRecommendations(observations, diagnoses, chain.results);
  const goalTracking = computeGoalTracking(chain.results);

  const watermarkTile = WATERMARK_ENABLED
    ? `<svg xmlns='http://www.w3.org/2000/svg' width='460' height='300'><text x='10' y='160' transform='rotate(-28 230 150)' font-family='Public Sans, Segoe UI, sans-serif' font-size='19' font-weight='700' fill='rgba(11,31,77,0.12)'>${WATERMARK_TEXT}</text></svg>`
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

  const obsHtml = observations.length
    ? `<table class="stmt">${observations
        .map((o) => `<tr class="line"><td>${esc(o.statement)}<span class="note"> · traces: ${esc([...new Set(o.traces.map((t) => t.enginePath))].join(', '))}</span></td></tr>`)
        .join('')}</table>`
    : `<p class="muted pad">No period-over-period move cleared the notability thresholds for this period.</p>`;

  const drvFmt = (dr: { contributionPp?: number; contributionPaise?: number; effectAbs?: number }) =>
    dr.contributionPp !== undefined ? `${dr.contributionPp >= 0 ? '+' : '−'}${Math.abs(dr.contributionPp).toFixed(2)}pp`
      : dr.contributionPaise !== undefined ? inr(dr.contributionPaise)
        : dr.effectAbs !== undefined ? `${dr.effectAbs >= 0 ? '+' : '−'}${Math.abs(dr.effectAbs).toFixed(2)}` : '';
  const diagHtml = diagnoses.length
    ? `<table class="stmt">${diagnoses
        .map((d) => `<tr class="subtotal"><td colspan="2">${esc(d.metric)} — ${esc(d.cause)}<span class="note"> · ${esc(d.ruleId)}</span></td></tr>` +
          d.drivers.map((dr) => `<tr><td style="padding-left:22px;color:#5b6b82">${esc(dr.driver)} <span class="note">· ${esc(dr.detail)}</span></td><td class="num">${esc(drvFmt(dr))}</td></tr>`).join(''))
        .join('')}</table>`
    : `<p class="muted pad">No observations this period, so nothing to diagnose.</p>`;
  const recHtml = recommendations.length
    ? `<table class="stmt">${recommendations
        .map((r) => `<tr class="subtotal"><td colspan="2">${esc(r.action)}<span class="note"> · ${esc(r.ruleId)} · ${esc(r.confidence)}</span></td></tr><tr><td colspan="2" style="padding-left:22px;color:#5b6b82">Impact: ${esc(r.quantifiedImpact.basis)}</td></tr>`)
        .join('')}</table>`
    : `<p class="muted pad">No recommendations — no observed move this period implies an actionable lever (favourable moves don't generate advice).</p>`;
  const goalsHtml = `<p class="muted pad">⚠ PLACEHOLDER targets (D-013) — real client goals are a TODO; tracking is live against the engine.</p><table class="stmt">${goalTracking
    .map((g) => `<tr class="line"><td>${esc(g.metric)} <span class="note">· ${esc(g.detail)}</span></td><td class="num">${esc(g.trackStatus.replace('_', ' ').toUpperCase())}</td></tr>`)
    .join('')}</table>`;

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Public+Sans:wght@400;500;600;700&display=swap');
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Navy+emerald (Meridian). Sora for headings/figures, Public Sans for body; both fall back to the
     system stack if the web fonts can't be fetched at render time. */
  body { font-family: 'Public Sans','Segoe UI',Roboto,-apple-system,sans-serif; color:#334155; font-size:11px; margin:0; background:#ffffff; }
  h1, h3 { font-family: 'Sora','Public Sans','Segoe UI',sans-serif; }
  .watermark { position: fixed; inset:0; z-index:50; pointer-events:none; ${WATERMARK_ENABLED ? `background-image:url("data:image/svg+xml,${encodeURIComponent(watermarkTile)}"); background-repeat:repeat;` : ''} }
  .page { position: relative; z-index:1; }
  .ribbon { background:#fffbeb; color:#b45309; border:1px solid #fde68a; font-weight:700; font-size:10px; letter-spacing:.04em; text-align:center; padding:5px; border-radius:6px; margin-bottom:10px; }
  header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #0b1f4d; padding-bottom:8px; margin-bottom:12px; }
  .brand { color:#5b6b82; font-size:10px; }
  h1 { font-size:20px; margin:2px 0 0; letter-spacing:-.01em; color:#0b1f4d; font-weight:700; }
  .sub { color:#5b6b82; font-size:11px; margin-top:2px; }
  .badge { display:inline-block; border:1px solid #d8e0ec; border-radius:4px; padding:1px 6px; font-size:9px; text-transform:uppercase; font-weight:700; color:#5b6b82; margin-left:6px; }
  .kpis { display:flex; gap:8px; margin-bottom:12px; }
  .kpi { flex:1; border:1px solid #e7edf4; border-radius:10px; padding:8px 10px; }
  .kpi-l { color:#94a3b8; font-size:9px; text-transform:uppercase; letter-spacing:.06em; font-weight:600; }
  .kpi-v { font-size:16px; font-weight:700; margin-top:3px; color:#0b1f4d; font-variant-numeric:tabular-nums lining-nums; }
  .kpi-d { font-size:9px; margin-top:2px; }
  .grid2 { display:flex; gap:12px; }
  .grid2 > * { flex:1; }
  .card { border:1px solid #e7edf4; border-radius:12px; overflow:hidden; margin-bottom:12px; background:#fff; }
  .card h3 { font-size:11px; margin:0; padding:7px 10px; border-bottom:1px solid #e7edf4; background:#f6f8fb; color:#0b1f4d; font-weight:600; }
  table.stmt { width:100%; border-collapse:collapse; }
  table.stmt td { padding:3.5px 11px; font-size:11px; border-top:1px solid #f1f5f9; }
  table.stmt td.num { text-align:right; font-variant-numeric:tabular-nums lining-nums; white-space:nowrap; }
  tr.subtotal td { background:#f6f8fb; font-weight:600; color:#0b1f4d; }
  tr.total td { background:#fff; font-weight:700; color:#0b1f4d; border-top:2px solid #0b1f4d; }
  tr.total.loss td.num { color:#dc2626; }
  tr.hdr td { font-size:8.5px; text-transform:uppercase; letter-spacing:.04em; color:#94a3b8; font-weight:700; border-bottom:1px solid #d8e0ec; }
  tr.header td { font-weight:700; background:#f6f8fb; color:#0b1f4d; }
  tr.fn td { font-size:8.5px; color:#94a3b8; background:#f6f8fb; }
  tr.fn ol { margin:3px 0 0 15px; padding:0; } tr.fn li { margin:1px 0; }
  .note { color:#94a3b8; font-weight:400; }
  .ratios { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:#f1f5f9; }
  .ratio { background:#fff; padding:6px 10px; }
  .ratio-l { color:#94a3b8; font-size:9px; text-transform:uppercase; letter-spacing:.04em; font-weight:600; }
  .ratio-v { font-weight:600; font-size:14px; margin-top:2px; font-variant-numeric:tabular-nums lining-nums; color:#0b1f4d; }
  .trends { display:flex; gap:14px; padding:10px; }
  .trend { flex:1; }
  .trend-l { font-size:10px; color:#5b6b82; font-weight:600; }
  .trend-v { font-size:12px; font-weight:700; margin-top:2px; color:#0b1f4d; font-variant-numeric:tabular-nums; }
  .comment { padding:8px 10px; white-space:pre-wrap; font-size:11px; color:#334155; }
  .muted { color:#94a3b8; } .pad { padding:10px; }
  .pos { color:#047857; } .neg { color:#dc2626; }
  footer { text-align:center; color:#94a3b8; font-size:9px; margin-top:8px; }
  </style></head><body>
  <div class="watermark"></div>
  <div class="page">
    ${WATERMARK_ENABLED ? `<div class="ribbon">${WATERMARK_TEXT}</div>` : ''}
    <header>
      <div><div class="brand">CapEasy vCFO · Management MIS Pack</div><h1>${esc(chain.org.legalName)}</h1><div class="sub">${esc(periodMeta.label)}<span class="badge">${esc(periodMeta.status)}</span></div></div>
      <div class="brand" style="text-align:right">Engine statements <b>CONSISTENCY-CHECKED</b> (identity battery)<br/>CA-reviewed</div>
    </header>
    <div class="kpis">${kpiHtml}</div>
    <div class="card"><h3>Statement of Profit and Loss <span class="badge">Schedule III · Div I</span></h3>${stmt3(plScheduleIII(result, prior), periodMeta.label, priorMeta?.label ?? null, SCH3_PL_FOOTNOTES)}</div>
    <div class="card"><h3>Balance Sheet <span class="badge">Schedule III · Div I</span></h3>${stmt3(bsScheduleIII(result, prior), periodMeta.label, priorMeta?.label ?? null, SCH3_BS_FOOTNOTES)}</div>
    <div class="card"><h3>Cash Flow — indirect</h3>${cfHtml}</div>
    <div class="card"><h3>Observations <span class="badge">Tier 1</span></h3>${obsHtml}</div>
    <div class="card"><h3>Diagnoses <span class="badge">Tier 2</span></h3>${diagHtml}</div>
    <div class="card"><h3>Recommendations <span class="badge">Tier 3</span></h3>${recHtml}</div>
    <div class="card"><h3>Goal tracking <span class="badge">Tier 3 · placeholder targets</span></h3>${goalsHtml}</div>
    <div class="card"><h3>Key ratios &amp; working capital</h3><div class="ratios">${ratioHtml}</div></div>
    <div class="card"><h3>Month-on-month trend</h3><div class="trends">${trendHtml}</div></div>
    ${commentary}
    <footer>Generated by CapEasy vCFO · engine statements CONSISTENCY-CHECKED (identity battery) and CA-reviewed · ₹ = INR.</footer>
  </div>
  </body></html>`;
}
