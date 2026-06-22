// scripts/seed.mjs — M1 seed: demo client + THREE consecutive, fully-articulated periods.
//
// The three TBs form a coherent mini-ledger so the engine's delta metrics (cash flow,
// burn, MoM) and the §4.5 identity invariants are genuinely exercisable across 2->3
// (Bible §3.5). Numbers are EXERCISE data, NOT a golden fixture — the golden fixture is
// a CA-checked external input (Bible §10.6) and is produced UNVERIFIED at M5.
//
// Before inserting anything, this script ASSERTS the accounting identities on the model
// (TB balances, Assets = Liab + Equity, retained-earnings roll). A bad seed fails here.
//
//   node scripts/seed.mjs
import { loadEnv } from './_env.mjs';

// Single-project model: this seeds a re-seedable DEMO org (Acme) into the one shared project. It coexists
// with any real client orgs, isolated by RLS — re-seed on demand for testing; delete via clean-prod.
const env = loadEnv();
const { default: pg } = await import('pg');

const R = (rupees) => Math.round(rupees * 100); // rupees -> paise (integer money, §5)

// --- The model: per period, balance-sheet (period-end) + P&L (period) in RUPEES. ---
// re_opening = retained earnings at the START of the month (prior month's close); the
// month's profit lives in the P&L lines, so the TB's equity carries opening RE only.
//
// NOTE (DECISIONS D-003): `cash` is the balancing residual that makes Assets = L+E+NP
// articulate exactly, and `re_opening` rolls on the prior month's TRUE net profit. The
// first-draft figures were each off by exactly that month's electricity (it reduced P&L
// profit but had been omitted from cash + the RE roll); corrected here. Exercise data only
// — NOT the CA golden fixture (Bible §10.6). The assertions below are the contract.
const PERIODS = [
  {
    month: '2026-04-01', label: 'Apr 2026', status: 'locked',
    bs: { cash: 5135000, ar: 2200000, inventory: 1100000, prepaid: 200000,
          ppe_gross: 4000000, accum_dep: 900000,
          ap: 1350000, st_borrow: 800000, statutory: 362500, tds: 62500, lt_borrow: 2400000,
          share_capital: 5000000, re_opening: 1600000 },
    pl: { revenue: 3000000, cogs: 1200000, employee: 700000, rent: 150000, electricity: 40000,
          sm: 200000, tech: 80000, prof: 60000, admin: 110000, da: 100000, finance: 50000, tax: 87500 },
  },
  {
    month: '2026-05-01', label: 'May 2026', status: 'reviewed',
    bs: { cash: 4989500, ar: 2400000, inventory: 1150000, prepaid: 180000,
          ppe_gross: 4300000, accum_dep: 1000000,
          ap: 1400000, st_borrow: 800000, statutory: 400000, tds: 75000, lt_borrow: 2300000,
          share_capital: 5000000, re_opening: 1822500 },
    pl: { revenue: 3300000, cogs: 1320000, employee: 720000, rent: 150000, electricity: 42000,
          sm: 240000, tech: 85000, prof: 65000, admin: 120000, da: 100000, finance: 48000, tax: 113000 },
  },
  {
    month: '2026-06-01', label: 'Jun 2026', status: 'draft',
    bs: { cash: 5369750, ar: 2600000, inventory: 1200000, prepaid: 180000,
          ppe_gross: 4400000, accum_dep: 1105000,
          ap: 1480000, st_borrow: 1000000, statutory: 450000, tds: 90000, lt_borrow: 2200000,
          share_capital: 5000000, re_opening: 2119500 },
    pl: { revenue: 3630000, cogs: 1452000, employee: 740000, rent: 155000, electricity: 45000,
          sm: 260000, tech: 90000, prof: 70000, admin: 125000, da: 105000, finance: 46000, tax: 146750 },
  },
];

const netProfit = (pl) =>
  pl.revenue - pl.cogs - (pl.employee + pl.rent + pl.electricity + pl.sm + pl.tech + pl.prof + pl.admin)
  - pl.da - pl.finance - pl.tax;

// --- Generate TB source lines (paise) for a period. Demonstrates many-to-one mapping:
//     6100+6110 -> rent_utilities, 2200+2210 -> statutory_dues. ---
function tbLines({ bs, pl }) {
  const L = [];
  const dr = (code, name, cat, rupees) => L.push({ code, name, cat, debit: R(rupees), credit: 0 });
  const cr = (code, name, cat, rupees) => L.push({ code, name, cat, debit: 0, credit: R(rupees) });

  cr('4000', 'Sales – Services',          'operating_revenue',        pl.revenue);
  dr('5000', 'Cost of Services',               'cogs',                     pl.cogs);
  dr('6000', 'Salaries & Wages',               'employee_benefits',        pl.employee);
  dr('6100', 'Rent – Office',             'rent_utilities',           pl.rent);
  dr('6110', 'Electricity & Utilities',        'rent_utilities',           pl.electricity);
  dr('6200', 'Marketing & Advertising',        'sales_marketing',          pl.sm);
  dr('6300', 'Software Subscriptions',         'technology_software',      pl.tech);
  dr('6400', 'Legal & Professional',           'professional_fees',        pl.prof);
  dr('6500', 'Office & Admin',                 'admin_other_opex',         pl.admin);
  dr('7000', 'Depreciation',                   'depreciation_amortisation',pl.da);
  dr('7100', 'Interest on Term Loan',          'finance_costs',            pl.finance);
  dr('7200', 'Income Tax Provision',           'tax_expense',              pl.tax);
  dr('1000', 'HDFC Bank – Current A/c',   'cash_bank',                bs.cash);
  dr('1100', 'Trade Receivables',              'trade_receivables',        bs.ar);
  dr('1200', 'Inventory',                      'inventory',                bs.inventory);
  dr('1300', 'Prepaid Expenses',               'prepaid_advances',         bs.prepaid);
  dr('1500', 'Plant & Equipment',              'ppe',                      bs.ppe_gross);
  cr('1590', 'Accumulated Depreciation',       'ppe',                      bs.accum_dep);
  cr('2000', 'Trade Payables',                 'trade_payables',           bs.ap);
  cr('2100', 'Working Capital Loan',           'short_term_borrowings',    bs.st_borrow);
  cr('2200', 'GST Payable',                    'statutory_dues',           bs.statutory - bs.tds);
  cr('2210', 'TDS Payable',                    'statutory_dues',           bs.tds);
  cr('2500', 'Term Loan (HDFC)',               'long_term_borrowings',     bs.lt_borrow);
  cr('3000', 'Share Capital',                  'share_capital',            bs.share_capital);
  cr('3100', 'Retained Earnings',              'reserves_surplus',         bs.re_opening);
  return L;
}

// --- Pre-flight assertions on the model (fail before touching the DB) -------
function assertArticulated() {
  PERIODS.forEach((p, i) => {
    const { bs, pl } = p;
    const np = netProfit(pl);
    const assets = bs.cash + bs.ar + bs.inventory + bs.prepaid + bs.ppe_gross - bs.accum_dep;
    const liab = bs.ap + bs.st_borrow + bs.statutory + bs.lt_borrow;
    const equityExclNp = bs.share_capital + bs.re_opening;
    if (assets !== liab + equityExclNp + np) {
      throw new Error(`[seed] ${p.label}: BS identity fails — assets ${assets} != L+E+NP ${liab + equityExclNp + np}`);
    }
    const lines = tbLines(p);
    const sd = lines.reduce((s, l) => s + l.debit, 0);
    const sc = lines.reduce((s, l) => s + l.credit, 0);
    if (sd !== sc) throw new Error(`[seed] ${p.label}: TB does not balance — Σdr ${sd} != Σcr ${sc} (paise)`);
    if (lines.some((l) => l.debit < 0 || l.credit < 0)) throw new Error(`[seed] ${p.label}: negative amount`);
    if (i > 0) {
      const prev = PERIODS[i - 1];
      const expected = prev.bs.re_opening + netProfit(prev.pl);
      if (bs.re_opening !== expected) {
        throw new Error(`[seed] ${p.label}: RE roll fails — opening ${bs.re_opening} != prior open + prior NP ${expected}`);
      }
    }
  });
  console.log('  ✓ model articulates: TB balances, Assets=L+E, RE rolls (all 3 periods)');
}

// --- Schedule helpers (reconcile to TB totals) -----------------------------
const ageBuckets = (total) => {
  const b31 = Math.round(total * 0.23), b61 = Math.round(total * 0.06), b90 = Math.round(total * 0.03);
  return { current: total - b31 - b61 - b90, b31, b61, b90 };
};

async function main() {
  assertArticulated();

  const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('begin');

    // Idempotent: wipe any prior demo org (cascades to periods/tb/schedules/mappings).
    await client.query(`delete from public.orgs where legal_name = $1`, ['Acme Foods Pvt Ltd']);

    const cats = new Map(
      (await client.query('select id, code from public.account_categories')).rows.map((r) => [r.code, r.id])
    );

    const org = (await client.query(
      `insert into public.orgs (legal_name, entity_type, state, gst_scheme, has_employees)
       values ($1,'pvt_ltd','Maharashtra','monthly',true) returning id`,
      ['Acme Foods Pvt Ltd']
    )).rows[0].id;

    // Account mappings (one-time per client): unique source codes -> category.
    const seen = new Set();
    for (const l of tbLines(PERIODS[0])) {
      if (seen.has(l.code)) continue;
      seen.add(l.code);
      await client.query(
        `insert into public.account_mappings (org_id, source_account_code, source_account_name, category_id)
         values ($1,$2,$3,$4)`,
        [org, l.code, l.name, cats.get(l.cat)]
      );
    }

    // Periods (chained via prior_period_id), TB lines, and schedules.
    let priorId = null;
    for (const p of PERIODS) {
      const periodId = (await client.query(
        `insert into public.periods (org_id, tax_year, period_month, label, prior_period_id, status)
         values ($1,'TY2026-27',$2,$3,$4,$5) returning id`,
        [org, p.month, p.label, priorId, p.status]
      )).rows[0].id;

      for (const l of tbLines(p)) {
        await client.query(
          `insert into public.trial_balance_lines (period_id, org_id, source_account_code, source_account_name, debit_amount, credit_amount)
           values ($1,$2,$3,$4,$5,$6)`,
          [periodId, org, l.code, l.name, l.debit, l.credit]
        );
      }

      // AR / AP aging (reconcile to TB AR / AP totals).
      for (const [tbl, name, total] of [
        ['schedule_ar_aging', 'customer_name', R(p.bs.ar)],
        ['schedule_ap_aging', 'vendor_name', R(p.bs.ap)],
      ]) {
        const b = ageBuckets(total);
        await client.query(
          `insert into public.${tbl} (period_id, org_id, ${name}, current_0_30, days_31_60, days_61_90, days_90_plus)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [periodId, org, 'Aggregate (demo)', b.current, b.b31, b.b61, b.b90]
        );
      }

      // Cash by bank (reconciles to Cash & bank).
      const cash = R(p.bs.cash);
      const bank1 = Math.round(cash * 0.8);
      await client.query(
        `insert into public.schedule_cash_balances (period_id, org_id, bank_name, balance) values
         ($1,$2,'HDFC Bank – Current A/c',$3), ($1,$2,'ICICI Bank – Savings',$4)`,
        [periodId, org, bank1, cash - bank1]
      );

      // Revenue detail: recurring vs one-time (for MRR/ARR, §4.4).
      const rev = R(p.pl.revenue);
      const recurring = Math.round(rev * 0.7);
      await client.query(
        `insert into public.schedule_revenue_detail (period_id, org_id, segment, amount, is_recurring) values
         ($1,$2,'Subscriptions',$3,true), ($1,$2,'One-time projects',$4,false)`,
        [periodId, org, recurring, rev - recurring]
      );

      // Headcount + debt (+ capex only where PP&E grew).
      await client.query(
        `insert into public.schedule_headcount (period_id, org_id, department, headcount) values ($1,$2,'All',$3)`,
        [periodId, org, 18 + PERIODS.indexOf(p)]
      );
      await client.query(
        `insert into public.schedule_debt (period_id, org_id, lender, kind, principal_outstanding, interest_rate) values
         ($1,$2,'HDFC Working Capital','short_term',$3,11.5),
         ($1,$2,'HDFC Term Loan','long_term',$4,12.0)`,
        [periodId, org, R(p.bs.st_borrow), R(p.bs.lt_borrow)]
      );

      priorId = periodId;
    }

    await client.query('commit');

    const counts = await client.query(`
      select
        (select count(*) from public.periods where org_id=$1) as periods,
        (select count(*) from public.trial_balance_lines where org_id=$1) as tb_lines,
        (select count(*) from public.account_mappings where org_id=$1) as mappings
    `, [org]);
    const c = counts.rows[0];
    console.log(`  ✓ seeded org ${org}`);
    console.log(`    Acme Foods Pvt Ltd — ${c.periods} periods, ${c.tb_lines} TB lines, ${c.mappings} account mappings`);
    console.log('  Done. (Numbers are exercise data — golden fixture is a CA input, produced UNVERIFIED at M5.)');
  } catch (e) {
    await client.query('rollback');
    console.error('  ✗ seed failed, rolled back: ' + (e?.message || String(e)));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

await main();
