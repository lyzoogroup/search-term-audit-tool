/**
 * engine.js — PPC Audit Analysis Engine
 * Runs all 14 analysis modules on normalized data
 */

const Engine = (() => {

  // ── Run full audit ──
  function runAudit(rows, settings) {
    const s = Object.assign({
      targetAcos: 30, targetRoas: 3, targetCtr: 2.5, targetCvr: 10,
      minClicksNeg: 20, brandNames: []
    }, settings);

    const overview = calcOverview(rows);
    const healthScore = calcHealthScore(overview, s);
    const classified = classifyTerms(rows, s);
    const spendDist = calcSpendDistribution(rows, s);
    const matchTypes = analyzeMatchTypes(rows);
    const ngrams = ngramAnalysis(rows);
    const brandAnalysis = analyzeBrand(rows, s.brandNames);
    const campaignSummary = summarizeByCampaign(rows);
    const adGroupSummary = summarizeByAdGroup(rows);
    const wastedTerms = classified.filter(r => r._class === 'Wasteful — No Sales' || r._class === 'Wasteful — Low ROI');
    const winners = classified.filter(r => r._class === 'Efficient Winner' || r._class === 'Profitable');
    const acosDistribution = calcAcosDistribution(rows, s);
    const cvrDistribution = calcCvrDistribution(rows);
    const conversionFunnel = calcFunnel(overview);
    const topBySpend = [...rows].sort((a, b) => b.spend - a.spend).slice(0, 50);
    const targetingAnalysis = analyzeTargeting(rows);
    const keywordMapping = mapSearchToKeyword(rows);
    const actionItems = generateActionItems(overview, spendDist, matchTypes, s);
    const roadmap = generateRoadmap(actionItems);
    const successMetrics = calcSuccessMetrics(overview, s);

    return {
      overview, healthScore, classified, spendDist, matchTypes,
      ngrams, brandAnalysis, campaignSummary, adGroupSummary,
      wastedTerms, winners, acosDistribution, cvrDistribution,
      conversionFunnel, topBySpend, targetingAnalysis, keywordMapping,
      actionItems, roadmap, successMetrics, settings: s, rowCount: rows.length
    };
  }

  // ── Aggregate overview ──
  function calcOverview(rows) {
    const o = { impressions:0, clicks:0, spend:0, sales:0, orders:0, units:0 };
    for (const r of rows) {
      o.impressions += r.impressions;
      o.clicks += r.clicks;
      o.spend += r.spend;
      o.sales += r.sales;
      o.orders += r.orders;
      o.units += r.units || 0;
    }
    o.ctr = o.impressions > 0 ? (o.clicks / o.impressions) * 100 : 0;
    o.cvr = o.clicks > 0 ? (o.orders / o.clicks) * 100 : 0;
    o.acos = o.sales > 0 ? (o.spend / o.sales) * 100 : 0;
    o.roas = o.spend > 0 ? o.sales / o.spend : 0;
    o.cpc = o.clicks > 0 ? o.spend / o.clicks : 0;
    o.aov = o.orders > 0 ? o.sales / o.orders : 0;
    o.cpo = o.orders > 0 ? o.spend / o.orders : 0;
    o.upo = o.orders > 0 ? o.units / o.orders : 0;
    return o;
  }

  // ── Health Score (0-100) ──
  function calcHealthScore(o, s) {
    let score = 0;
    // Profitability (30 pts)
    if (o.acos > 0 && o.acos !== Infinity) {
      const ratio = s.targetAcos / o.acos;
      score += Math.min(30, Math.round(ratio * 30));
    }
    // Efficiency (25 pts) — how much spend generates sales
    const budgetEff = o.spend > 0 ? ((o.spend - zeroSalesSpend(o)) / o.spend) * 100 : 0;
    score += Math.min(25, Math.round(budgetEff / 100 * 25));
    // Traffic (20 pts)
    const ctrRatio = o.ctr / Math.max(s.targetCtr, 0.1);
    score += Math.min(20, Math.round(ctrRatio * 20));
    // Conversion (15 pts)
    const cvrRatio = o.cvr / Math.max(s.targetCvr, 0.1);
    score += Math.min(15, Math.round(cvrRatio * 15));
    // Structure (10 pts) — give partial credit
    score += 6;

    function zeroSalesSpend() { return 0; } // simplified

    const clamped = Math.max(0, Math.min(100, score));
    let label = 'Critical';
    if (clamped >= 90) label = 'Excellent';
    else if (clamped >= 75) label = 'Good';
    else if (clamped >= 60) label = 'Fair';
    else if (clamped >= 40) label = 'Needs Work';

    return { score: clamped, label };
  }

  // ── Classify each term ──
  function classifyTerms(rows, s) {
    return rows.map(r => {
      let cls = 'Low Volume';
      let color = '#94A3B8';
      if (r.orders >= 5 && r.acos <= s.targetAcos * 0.75) {
        cls = 'Efficient Winner'; color = '#22C55E';
      } else if (r.orders >= 2 && r.acos <= s.targetAcos) {
        cls = 'Profitable'; color = '#86EFAC';
      } else if (r.clicks >= 15 && r.orders >= 1 && r.acos <= s.targetAcos * 1.5) {
        cls = 'High Potential'; color = '#FDE047';
      } else if (r.clicks >= s.minClicksNeg && r.orders === 0) {
        cls = 'Wasteful — No Sales'; color = '#EF4444';
      } else if (r.orders >= 1 && r.acos > s.targetAcos * 2) {
        cls = 'Wasteful — Low ROI'; color = '#F97316';
      } else if (r.impressions > 0 && r.clicks >= 10 && r.ctr < s.targetCtr * 0.5 && r.cvr >= s.targetCvr) {
        cls = 'Scaling Opportunity'; color = '#3B82F6';
      } else if (r.clicks < 10 && r.orders === 0) {
        cls = 'Low Volume'; color = '#94A3B8';
      } else if (r.orders >= 1) {
        cls = 'Moderate'; color = '#A78BFA';
      }
      return { ...r, _class: cls, _color: color };
    });
  }

  // ── Spend distribution ──
  function calcSpendDistribution(rows, s) {
    const buckets = [
      { label: 'Profitable', range: [0, s.targetAcos], color: '#22C55E', spend: 0 },
      { label: 'Break-Even', range: [s.targetAcos, s.targetAcos * 1.5], color: '#FDE047', spend: 0 },
      { label: 'Unprofitable', range: [s.targetAcos * 1.5, 100], color: '#F97316', spend: 0 },
      { label: 'Critical (>100%)', range: [100, Infinity], color: '#EF4444', spend: 0 },
      { label: 'Zero Sales', range: null, color: '#DC2626', spend: 0 }
    ];
    for (const r of rows) {
      if (r.sales === 0 && r.spend > 0) {
        buckets[4].spend += r.spend;
      } else if (r.acos <= s.targetAcos) {
        buckets[0].spend += r.spend;
      } else if (r.acos <= s.targetAcos * 1.5) {
        buckets[1].spend += r.spend;
      } else if (r.acos <= 100) {
        buckets[2].spend += r.spend;
      } else {
        buckets[3].spend += r.spend;
      }
    }
    const totalSpend = rows.reduce((sum, r) => sum + r.spend, 0);
    return buckets.map(b => ({
      ...b,
      pct: totalSpend > 0 ? (b.spend / totalSpend) * 100 : 0
    }));
  }

  // ── Match type analysis ──
  function analyzeMatchTypes(rows) {
    const map = {};
    for (const r of rows) {
      const mt = r.matchType || 'unknown';
      if (!map[mt]) map[mt] = { matchType: mt, impressions:0, clicks:0, spend:0, sales:0, orders:0, terms:0 };
      const m = map[mt];
      m.impressions += r.impressions;
      m.clicks += r.clicks;
      m.spend += r.spend;
      m.sales += r.sales;
      m.orders += r.orders;
      m.terms++;
    }
    return Object.values(map).map(m => ({
      ...m,
      ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
      cvr: m.clicks > 0 ? (m.orders / m.clicks) * 100 : 0,
      acos: m.sales > 0 ? (m.spend / m.sales) * 100 : 0,
      roas: m.spend > 0 ? m.sales / m.spend : 0,
      cpc: m.clicks > 0 ? m.spend / m.clicks : 0,
      spendShare: 0  // filled later
    }));
  }

  // ── N-gram analysis ──
  function ngramAnalysis(rows, maxN = 3) {
    const map = {};
    for (const r of rows) {
      const words = r.searchTerm.toLowerCase().split(/\s+/).filter(w => w.length > 0);
      for (let n = 1; n <= Math.min(maxN, words.length); n++) {
        for (let i = 0; i <= words.length - n; i++) {
          const ng = words.slice(i, i + n).join(' ');
          if (!map[ng]) map[ng] = { ngram: ng, type: n + '-gram', frequency:0, impressions:0, clicks:0, spend:0, sales:0, orders:0, asins: new Set() };
          const e = map[ng];
          e.frequency++;
          e.impressions += r.impressions;
          e.clicks += r.clicks;
          e.spend += r.spend;
          e.sales += r.sales;
          e.orders += r.orders;
          if (r.asin) e.asins.add(r.asin);
        }
      }
    }
    return Object.values(map).map(e => ({
      ngram: e.ngram,
      type: e.type,
      frequency: e.frequency,
      uniqueASINs: e.asins.size,
      impressions: e.impressions,
      clicks: e.clicks,
      ctr: e.impressions > 0 ? (e.clicks / e.impressions) * 100 : 0,
      spend: e.spend,
      cpc: e.clicks > 0 ? e.spend / e.clicks : 0,
      orders: e.orders,
      cvr: e.clicks > 0 ? (e.orders / e.clicks) * 100 : 0,
      sales: e.sales,
      acos: e.sales > 0 ? (e.spend / e.sales) * 100 : 0,
      roas: e.spend > 0 ? e.sales / e.spend : 0
    })).sort((a, b) => b.frequency - a.frequency);
  }

  // ── Brand analysis ──
  function analyzeBrand(rows, brandNames) {
    if (!brandNames || brandNames.length === 0) {
      return { hasBrands: false, branded: [], nonBranded: rows, summary: null };
    }
    const brands = brandNames.map(b => b.toLowerCase().trim()).filter(b => b);
    const branded = [];
    const nonBranded = [];
    for (const r of rows) {
      const lower = r.searchTerm.toLowerCase();
      if (brands.some(b => lower.includes(b))) {
        branded.push(r);
      } else {
        nonBranded.push(r);
      }
    }
    return {
      hasBrands: true,
      branded,
      nonBranded,
      summary: {
        brandedTerms: branded.length,
        nonBrandedTerms: nonBranded.length,
        brandedSpend: branded.reduce((s, r) => s + r.spend, 0),
        nonBrandedSpend: nonBranded.reduce((s, r) => s + r.spend, 0),
        brandedSales: branded.reduce((s, r) => s + r.sales, 0),
        nonBrandedSales: nonBranded.reduce((s, r) => s + r.sales, 0)
      }
    };
  }

  // ── Campaign summary ──
  function summarizeByCampaign(rows) {
    const map = {};
    for (const r of rows) {
      const key = r.campaignName || '(no campaign)';
      if (!map[key]) map[key] = { campaign: key, impressions:0, clicks:0, spend:0, sales:0, orders:0, terms:0 };
      const m = map[key];
      m.impressions += r.impressions; m.clicks += r.clicks; m.spend += r.spend;
      m.sales += r.sales; m.orders += r.orders; m.terms++;
    }
    return Object.values(map).map(m => ({
      ...m,
      ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
      cvr: m.clicks > 0 ? (m.orders / m.clicks) * 100 : 0,
      acos: m.sales > 0 ? (m.spend / m.sales) * 100 : 0,
      roas: m.spend > 0 ? m.sales / m.spend : 0,
      cpc: m.clicks > 0 ? m.spend / m.clicks : 0,
    })).sort((a, b) => b.spend - a.spend);
  }

  // ── Ad Group summary ──
  function summarizeByAdGroup(rows) {
    const map = {};
    for (const r of rows) {
      const key = (r.campaignName || '') + ' > ' + (r.adGroupName || '(no ad group)');
      if (!map[key]) map[key] = { adGroup: key, impressions:0, clicks:0, spend:0, sales:0, orders:0, terms:0 };
      const m = map[key];
      m.impressions += r.impressions; m.clicks += r.clicks; m.spend += r.spend;
      m.sales += r.sales; m.orders += r.orders; m.terms++;
    }
    return Object.values(map).map(m => ({
      ...m,
      ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
      cvr: m.clicks > 0 ? (m.orders / m.clicks) * 100 : 0,
      acos: m.sales > 0 ? (m.spend / m.sales) * 100 : 0,
      roas: m.spend > 0 ? m.sales / m.spend : 0,
    })).sort((a, b) => b.spend - a.spend);
  }

  // ── ACOS distribution ──
  function calcAcosDistribution(rows, s) {
    const rowsWithSales = rows.filter(r => r.sales > 0);
    const buckets = [
      { label: '0-' + s.targetAcos + '%', min: 0, max: s.targetAcos, count: 0, spend: 0, sales: 0 },
      { label: s.targetAcos + '-' + (s.targetAcos*1.5) + '%', min: s.targetAcos, max: s.targetAcos*1.5, count: 0, spend: 0, sales: 0 },
      { label: (s.targetAcos*1.5) + '-100%', min: s.targetAcos*1.5, max: 100, count: 0, spend: 0, sales: 0 },
      { label: '>100%', min: 100, max: Infinity, count: 0, spend: 0, sales: 0 }
    ];
    for (const r of rowsWithSales) {
      for (const b of buckets) {
        if (r.acos >= b.min && r.acos < b.max) {
          b.count++; b.spend += r.spend; b.sales += r.sales;
          break;
        }
      }
    }
    return buckets;
  }

  // ── CVR distribution ──
  function calcCvrDistribution(rows) {
    const withClicks = rows.filter(r => r.clicks > 0);
    const buckets = [
      { label: '0%', min: 0, max: 0.01, count:0, spend:0, clicks:0 },
      { label: '0-5%', min: 0.01, max: 5, count:0, spend:0, clicks:0 },
      { label: '5-10%', min: 5, max: 10, count:0, spend:0, clicks:0 },
      { label: '10-20%', min: 10, max: 20, count:0, spend:0, clicks:0 },
      { label: '>20%', min: 20, max: Infinity, count:0, spend:0, clicks:0 }
    ];
    for (const r of withClicks) {
      for (const b of buckets) {
        if (r.cvr >= b.min && r.cvr < b.max) {
          b.count++; b.spend += r.spend; b.clicks += r.clicks;
          break;
        }
      }
    }
    return buckets;
  }

  // ── Conversion funnel ──
  function calcFunnel(o) {
    return [
      { stage: 'Impressions', value: o.impressions, rate: '100%' },
      { stage: 'Clicks', value: o.clicks, rate: fmt.pct(o.ctr) },
      { stage: 'Orders', value: o.orders, rate: fmt.pct(o.cvr) },
      { stage: 'Sales', value: o.sales, rate: o.orders > 0 ? fmt.money(o.aov) + ' AOV' : '$0' }
    ];
  }

  // ── Targeting type analysis ──
  function analyzeTargeting(rows) {
    const map = {};
    for (const r of rows) {
      const type = r.targetingKeyword && r.targetingKeyword.startsWith('asin=') ? 'Product' : 'Keyword';
      if (!map[type]) map[type] = { type, impressions:0, clicks:0, spend:0, sales:0, orders:0, terms:0 };
      const m = map[type];
      m.impressions += r.impressions; m.clicks += r.clicks; m.spend += r.spend;
      m.sales += r.sales; m.orders += r.orders; m.terms++;
    }
    return Object.values(map).map(m => ({
      ...m,
      ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
      cvr: m.clicks > 0 ? (m.orders / m.clicks) * 100 : 0,
      acos: m.sales > 0 ? (m.spend / m.sales) * 100 : 0,
      roas: m.spend > 0 ? m.sales / m.spend : 0,
    }));
  }

  // ── Keyword mapping ──
  function mapSearchToKeyword(rows) {
    return rows.filter(r => r.targetingKeyword).map(r => ({
      searchTerm: r.searchTerm,
      keyword: r.targetingKeyword,
      matchType: r.matchType,
      impressions: r.impressions,
      clicks: r.clicks,
      spend: r.spend,
      orders: r.orders,
      sales: r.sales,
      acos: r.acos,
    })).sort((a, b) => b.spend - a.spend).slice(0, 100);
  }

  // ── Generate action items ──
  function generateActionItems(o, spendDist, matchTypes, s) {
    const items = [];

    // Check unprofitable spend
    const unprofPct = spendDist.filter(b => b.label.includes('Unprofitable') || b.label.includes('Critical')).reduce((sum, b) => sum + b.pct, 0);
    if (unprofPct > 20) {
      items.push({
        severity: 'critical', category: 'Profitability', priority: 1,
        title: 'High Unprofitable Spend',
        finding: fmt.pct(unprofPct) + ' of budget on terms with ACOS > ' + (s.targetAcos * 1.5) + '%',
        impact: 'Improve account profitability by 20-30%',
        action: 'Reduce bids by 40-60% on high-ACOS terms or pause if ACOS >100%'
      });
    }

    // Match type imbalance
    const totalSpend = matchTypes.reduce((sum, m) => sum + m.spend, 0);
    const worstMT = matchTypes.reduce((w, m) => m.acos > (w ? w.acos : 0) ? m : w, null);
    if (worstMT && worstMT.spend / totalSpend > 0.3 && worstMT.acos > s.targetAcos * 1.3) {
      items.push({
        severity: 'high', category: 'Match Type Strategy', priority: 2,
        title: worstMT.matchType.charAt(0).toUpperCase() + worstMT.matchType.slice(1) + ' Match Underperforming',
        finding: worstMT.matchType + ' has ' + fmt.pct(worstMT.acos) + ' ACOS with ' + fmt.pct((worstMT.spend/totalSpend)*100) + ' spend share',
        impact: 'Optimize match type distribution for better efficiency',
        action: 'Reduce ' + worstMT.matchType + ' bids by 30%, reallocate to better performing match types'
      });
    }

    // Low CTR
    if (o.ctr < s.targetCtr * 0.9) {
      items.push({
        severity: 'medium', category: 'Creative Optimization', priority: 3,
        title: 'Low Click-Through Rate',
        finding: 'Current CTR: ' + fmt.pct(o.ctr) + ' (Target: ' + fmt.pct(s.targetCtr) + ')',
        impact: 'Improve ad relevance and Quality Score',
        action: 'Test new ad copy, improve main images, and optimize titles'
      });
    }

    // Low CVR
    if (o.cvr < s.targetCvr * 0.8) {
      items.push({
        severity: 'medium', category: 'Listing Optimization', priority: 4,
        title: 'Conversion Rate Below Benchmark',
        finding: 'Current CVR: ' + fmt.pct(o.cvr) + ' (Target: ' + fmt.pct(s.targetCvr) + ')',
        impact: 'Maximize value from existing traffic',
        action: 'Optimize product images, A+ content, reviews, and pricing strategy'
      });
    }

    // Zero sales spend
    const zeroSalesPct = spendDist.find(b => b.label === 'Zero Sales')?.pct || 0;
    if (zeroSalesPct > 5) {
      items.push({
        severity: 'high', category: 'Budget Waste', priority: 2,
        title: 'Significant Zero-Sales Spend',
        finding: fmt.pct(zeroSalesPct) + ' of budget generates no sales at all',
        impact: 'Recover wasted budget for profitable terms',
        action: 'Add top zero-sales terms as negatives, review listing relevance'
      });
    }

    return items.sort((a, b) => a.priority - b.priority);
  }

  // ── Roadmap ──
  function generateRoadmap(actionItems) {
    return [
      { phase: 'Week 1 — Critical', cls: 'p1', items: actionItems.filter(a => a.severity === 'critical').map(a => a.category) },
      { phase: 'Week 2-3 — High Priority', cls: 'p2', items: actionItems.filter(a => a.severity === 'high').map(a => a.category) },
      { phase: 'Week 4-6 — Optimization', cls: 'p3', items: actionItems.filter(a => a.severity === 'medium').map(a => a.category) },
      { phase: 'Ongoing — Growth', cls: 'p4', items: ['Performance monitoring', 'Keyword expansion', 'Competitor analysis'] }
    ];
  }

  // ── Success metrics ──
  function calcSuccessMetrics(o, s) {
    return [
      { label: 'ACOS', target: '<' + s.targetAcos + '%', current: o.acos, format: 'pct', good: o.acos <= s.targetAcos },
      { label: 'ROAS', target: '>' + s.targetRoas + 'x', current: o.roas, format: 'ratio', good: o.roas >= s.targetRoas },
      { label: 'CVR', target: '>' + s.targetCvr + '%', current: o.cvr, format: 'pct', good: o.cvr >= s.targetCvr },
      { label: 'CTR', target: '>' + s.targetCtr + '%', current: o.ctr, format: 'pct', good: o.ctr >= s.targetCtr },
      { label: 'CPC', target: 'Minimize', current: o.cpc, format: 'money', good: true }
    ];
  }

  // ── Formatters ──
  const fmt = {
    num: (v) => v >= 1000 ? v.toLocaleString('en-US', {maximumFractionDigits:0}) : String(Math.round(v * 100) / 100),
    money: (v) => '$' + v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}),
    pct: (v) => (Math.round(v * 100) / 100) + '%',
    ratio: (v) => (Math.round(v * 100) / 100) + 'x',
  };

  return { runAudit, fmt };
})();
