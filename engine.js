/**
 * engine.js — PPC Audit Analysis Engine
 * Runs all analysis modules including ROAS, CVR, and Bid Health
 */

const Engine = (() => {

  function runAudit(rows, settings, meta) {
    const s = Object.assign({
      targetAcos: 30, targetRoas: 3, targetCtr: 2.5, targetCvr: 10,
      minClicksNeg: 20, brandNames: []
    }, settings);

    const overview       = calcOverview(rows);
    const healthScore    = calcHealthScore(overview, s);
    const classified     = classifyTerms(rows, s);
    const spendDist      = calcSpendDistribution(rows, s);
    const matchTypes     = analyzeMatchTypes(rows);
    const ngrams         = ngramAnalysis(rows);
    const brandAnalysis  = analyzeBrand(rows, s.brandNames);
    const campaignSummary= summarizeByCampaign(rows);
    const adGroupSummary = summarizeByAdGroup(rows);
    const wastedTerms    = classified.filter(r => r._class === 'Wasteful — No Sales' || r._class === 'Wasteful — Low ROI');
    const winners        = classified.filter(r => r._class === 'Efficient Winner' || r._class === 'Profitable');
    const acosDistribution = calcAcosDistribution(rows, s);
    const cvrDistribution  = calcCvrDistribution(rows);
    const roasDistribution = calcRoasDistribution(rows, s);
    const conversionFunnel = calcFunnel(overview);
    const topBySpend     = [...rows].sort((a, b) => b.spend - a.spend).slice(0, 50);
    const targetingAnalysis = analyzeTargeting(rows);
    const keywordMapping = mapSearchToKeyword(rows);

    // Bid health + keyword status (only if data available)
    const bidHealth      = meta.hasKeywordBid ? analyzeBidHealth(rows, s) : null;
    const keywordStatus  = meta.hasKeywordStatus ? analyzeKeywordStatus(rows) : null;

    const actionItems    = generateActionItems(overview, spendDist, matchTypes, roasDistribution, bidHealth, s);
    const roadmap        = generateRoadmap(actionItems);
    const successMetrics = calcSuccessMetrics(overview, s);

    return {
      overview, healthScore, classified, spendDist, matchTypes,
      ngrams, brandAnalysis, campaignSummary, adGroupSummary,
      wastedTerms, winners, acosDistribution, cvrDistribution,
      roasDistribution, conversionFunnel, topBySpend, targetingAnalysis,
      keywordMapping, bidHealth, keywordStatus,
      actionItems, roadmap, successMetrics, settings: s, rowCount: rows.length
    };
  }

  // ── Aggregate overview ──
  function calcOverview(rows) {
    const o = { impressions:0, clicks:0, spend:0, sales:0, orders:0, units:0 };
    for (const r of rows) {
      o.impressions += r.impressions; o.clicks += r.clicks; o.spend += r.spend;
      o.sales += r.sales; o.orders += r.orders; o.units += r.units || 0;
    }
    o.ctr  = o.impressions > 0 ? (o.clicks / o.impressions) * 100 : 0;
    o.cvr  = o.clicks > 0 ? (o.orders / o.clicks) * 100 : 0;
    o.acos = o.sales > 0 ? (o.spend / o.sales) * 100 : 0;
    o.roas = o.spend > 0 ? o.sales / o.spend : 0;
    o.cpc  = o.clicks > 0 ? o.spend / o.clicks : 0;
    o.aov  = o.orders > 0 ? o.sales / o.orders : 0;
    o.cpo  = o.orders > 0 ? o.spend / o.orders : 0;
    o.upo  = o.orders > 0 ? o.units / o.orders : 0;
    return o;
  }

  // ── Health Score (0-100) — now uses ROAS and CVR ──
  function calcHealthScore(o, s) {
    let score = 0;
    // Profitability — ROAS based (35 pts)
    if (o.roas > 0) {
      const roasRatio = Math.min(o.roas / s.targetRoas, 2);
      score += Math.round(roasRatio * 17.5); // max 35
    }
    // Efficiency — ACOS based (20 pts)
    if (o.acos > 0 && o.acos !== Infinity) {
      const acosRatio = s.targetAcos / o.acos;
      score += Math.min(20, Math.round(acosRatio * 20));
    }
    // Traffic — CTR (15 pts)
    const ctrRatio = o.ctr / Math.max(s.targetCtr, 0.1);
    score += Math.min(15, Math.round(ctrRatio * 15));
    // Conversion — CVR (20 pts)
    const cvrRatio = o.cvr / Math.max(s.targetCvr, 0.1);
    score += Math.min(20, Math.round(cvrRatio * 20));
    // Structure (10 pts)
    score += 6;

    const clamped = Math.max(0, Math.min(100, score));
    let label = 'Critical';
    if (clamped >= 90) label = 'Excellent';
    else if (clamped >= 75) label = 'Good';
    else if (clamped >= 60) label = 'Fair';
    else if (clamped >= 40) label = 'Needs Work';
    return { score: clamped, label };
  }

  // ── Classify terms — uses ROAS + CVR ──
  function classifyTerms(rows, s) {
    return rows.map(r => {
      let cls = 'Low Volume', color = '#94A3B8';

      if (r.orders >= 3 && r.roas >= s.targetRoas * 1.2) {
        cls = 'Efficient Winner'; color = '#22C55E';
      } else if (r.orders >= 2 && r.roas >= s.targetRoas) {
        cls = 'Profitable'; color = '#86EFAC';
      } else if (r.orders >= 1 && r.roas >= s.targetRoas * 0.5 && r.roas < s.targetRoas) {
        cls = 'High Potential'; color = '#FDE047';
      } else if (r.clicks >= s.minClicksNeg && r.orders === 0) {
        cls = 'Wasteful — No Sales'; color = '#EF4444';
      } else if (r.orders >= 1 && r.roas > 0 && r.roas < s.targetRoas * 0.3) {
        cls = 'Wasteful — Low ROI'; color = '#F97316';
      } else if (r.clicks >= 10 && r.orders === 0 && r.spend > 0) {
        cls = 'Monitor — No Conv'; color = '#FB923C';
      } else if (r.impressions > 0 && r.ctr >= s.targetCtr && r.cvr >= s.targetCvr * 0.5 && r.orders >= 1) {
        cls = 'Scaling Opportunity'; color = '#3B82F6';
      } else if (r.impressions > 500 && r.ctr < s.targetCtr * 0.4 && r.clicks < 3) {
        cls = 'Low Relevance'; color = '#A78BFA';
      } else if (r.orders >= 1) {
        cls = 'Moderate'; color = '#67E8F9';
      } else if (r.clicks >= 1) {
        cls = 'Low Volume'; color = '#94A3B8';
      } else {
        cls = 'Impression Only'; color = '#64748B';
      }
      return { ...r, _class: cls, _color: color };
    });
  }

  // ── Spend distribution ──
  function calcSpendDistribution(rows, s) {
    const buckets = [
      { label:'Profitable', range:[0, s.targetAcos], color:'#22C55E', spend:0 },
      { label:'Break-Even', range:[s.targetAcos, s.targetAcos*1.5], color:'#FDE047', spend:0 },
      { label:'Unprofitable', range:[s.targetAcos*1.5, 100], color:'#F97316', spend:0 },
      { label:'Critical (>100%)', range:[100, Infinity], color:'#EF4444', spend:0 },
      { label:'Zero Sales', range:null, color:'#DC2626', spend:0 }
    ];
    for (const r of rows) {
      if (r.sales === 0 && r.spend > 0) buckets[4].spend += r.spend;
      else if (r.acos <= s.targetAcos) buckets[0].spend += r.spend;
      else if (r.acos <= s.targetAcos * 1.5) buckets[1].spend += r.spend;
      else if (r.acos <= 100) buckets[2].spend += r.spend;
      else buckets[3].spend += r.spend;
    }
    const total = rows.reduce((s, r) => s + r.spend, 0);
    return buckets.map(b => ({ ...b, pct: total > 0 ? (b.spend / total) * 100 : 0 }));
  }

  // ── ROAS Distribution — NEW ──
  function calcRoasDistribution(rows, s) {
    const withSpend = rows.filter(r => r.spend > 0);
    const buckets = [
      { label:'Zero (no sales)', min:-0.01, max:0.01, count:0, spend:0, sales:0, color:'#EF4444' },
      { label:'Poor (0-' + (s.targetRoas*0.5).toFixed(1) + 'x)', min:0.01, max:s.targetRoas*0.5, count:0, spend:0, sales:0, color:'#F97316' },
      { label:'Below Target (' + (s.targetRoas*0.5).toFixed(1) + '-' + s.targetRoas + 'x)', min:s.targetRoas*0.5, max:s.targetRoas, count:0, spend:0, sales:0, color:'#FDE047' },
      { label:'On Target (' + s.targetRoas + '-' + (s.targetRoas*1.5).toFixed(1) + 'x)', min:s.targetRoas, max:s.targetRoas*1.5, count:0, spend:0, sales:0, color:'#86EFAC' },
      { label:'Excellent (>' + (s.targetRoas*1.5).toFixed(1) + 'x)', min:s.targetRoas*1.5, max:Infinity, count:0, spend:0, sales:0, color:'#22C55E' },
    ];
    for (const r of withSpend) {
      for (const b of buckets) {
        if (r.roas >= b.min && r.roas < b.max) {
          b.count++; b.spend += r.spend; b.sales += r.sales; break;
        }
      }
    }
    return buckets;
  }

  // ── Match types ──
  function analyzeMatchTypes(rows) {
    const map = {};
    for (const r of rows) {
      const mt = r.matchType || 'unknown';
      if (!map[mt]) map[mt] = { matchType:mt, impressions:0, clicks:0, spend:0, sales:0, orders:0, terms:0 };
      const m = map[mt];
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
    }));
  }

  // ── N-gram analysis ──
  function ngramAnalysis(rows, maxN) {
    maxN = maxN || 3;
    const map = {};
    for (const r of rows) {
      const words = r.searchTerm.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      for (let n = 1; n <= Math.min(maxN, words.length); n++) {
        for (let i = 0; i <= words.length - n; i++) {
          const ng = words.slice(i, i + n).join(' ');
          if (!map[ng]) map[ng] = { ngram:ng, type:n+'-gram', frequency:0, impressions:0, clicks:0, spend:0, sales:0, orders:0 };
          const e = map[ng];
          e.frequency++; e.impressions += r.impressions; e.clicks += r.clicks;
          e.spend += r.spend; e.sales += r.sales; e.orders += r.orders;
        }
      }
    }
    return Object.values(map).map(e => ({
      ...e,
      ctr: e.impressions > 0 ? (e.clicks / e.impressions) * 100 : 0,
      cvr: e.clicks > 0 ? (e.orders / e.clicks) * 100 : 0,
      acos: e.sales > 0 ? (e.spend / e.sales) * 100 : 0,
      roas: e.spend > 0 ? e.sales / e.spend : 0,
      cpc: e.clicks > 0 ? e.spend / e.clicks : 0,
    })).sort((a, b) => b.frequency - a.frequency);
  }

  // ── Brand analysis ──
  function analyzeBrand(rows, brandNames) {
    if (!brandNames || brandNames.length === 0) return { hasBrands: false, branded: [], nonBranded: rows, summary: null };
    const brands = brandNames.map(b => b.toLowerCase().trim()).filter(b => b);
    const branded = [], nonBranded = [];
    for (const r of rows) {
      (brands.some(b => r.searchTerm.toLowerCase().includes(b)) ? branded : nonBranded).push(r);
    }
    return {
      hasBrands: true, branded, nonBranded,
      summary: {
        brandedTerms: branded.length, nonBrandedTerms: nonBranded.length,
        brandedSpend: branded.reduce((s, r) => s + r.spend, 0),
        nonBrandedSpend: nonBranded.reduce((s, r) => s + r.spend, 0),
        brandedSales: branded.reduce((s, r) => s + r.sales, 0),
        nonBrandedSales: nonBranded.reduce((s, r) => s + r.sales, 0),
      }
    };
  }

  function summarizeByCampaign(rows) {
    const map = {};
    for (const r of rows) {
      const k = r.campaignName || '(no campaign)';
      if (!map[k]) map[k] = { campaign:k, impressions:0, clicks:0, spend:0, sales:0, orders:0, terms:0 };
      const m = map[k]; m.impressions+=r.impressions; m.clicks+=r.clicks; m.spend+=r.spend; m.sales+=r.sales; m.orders+=r.orders; m.terms++;
    }
    return Object.values(map).map(m => ({ ...m,
      ctr:m.impressions>0?(m.clicks/m.impressions)*100:0, cvr:m.clicks>0?(m.orders/m.clicks)*100:0,
      acos:m.sales>0?(m.spend/m.sales)*100:0, roas:m.spend>0?m.sales/m.spend:0, cpc:m.clicks>0?m.spend/m.clicks:0,
    })).sort((a,b)=>b.spend-a.spend);
  }

  function summarizeByAdGroup(rows) {
    const map = {};
    for (const r of rows) {
      const k = (r.campaignName||'') + ' > ' + (r.adGroupName||'(none)');
      if (!map[k]) map[k] = { adGroup:k, impressions:0, clicks:0, spend:0, sales:0, orders:0, terms:0 };
      const m = map[k]; m.impressions+=r.impressions; m.clicks+=r.clicks; m.spend+=r.spend; m.sales+=r.sales; m.orders+=r.orders; m.terms++;
    }
    return Object.values(map).map(m => ({ ...m,
      ctr:m.impressions>0?(m.clicks/m.impressions)*100:0, cvr:m.clicks>0?(m.orders/m.clicks)*100:0,
      acos:m.sales>0?(m.spend/m.sales)*100:0, roas:m.spend>0?m.sales/m.spend:0,
    })).sort((a,b)=>b.spend-a.spend);
  }

  function calcAcosDistribution(rows, s) {
    const d = rows.filter(r => r.sales > 0);
    const b = [
      { label:'0-'+s.targetAcos+'%', min:0, max:s.targetAcos, count:0, spend:0, sales:0 },
      { label:s.targetAcos+'-'+(s.targetAcos*1.5)+'%', min:s.targetAcos, max:s.targetAcos*1.5, count:0, spend:0, sales:0 },
      { label:(s.targetAcos*1.5)+'-100%', min:s.targetAcos*1.5, max:100, count:0, spend:0, sales:0 },
      { label:'>100%', min:100, max:Infinity, count:0, spend:0, sales:0 }
    ];
    for (const r of d) { for (const x of b) { if (r.acos>=x.min && r.acos<x.max) { x.count++; x.spend+=r.spend; x.sales+=r.sales; break; } } }
    return b;
  }

  function calcCvrDistribution(rows) {
    const d = rows.filter(r => r.clicks > 0);
    const b = [
      { label:'0% (no conv)', min:-1, max:0.01, count:0, spend:0, clicks:0 },
      { label:'0.1-5%', min:0.01, max:5, count:0, spend:0, clicks:0 },
      { label:'5-15%', min:5, max:15, count:0, spend:0, clicks:0 },
      { label:'15-30%', min:15, max:30, count:0, spend:0, clicks:0 },
      { label:'30%+', min:30, max:Infinity, count:0, spend:0, clicks:0 }
    ];
    for (const r of d) { for (const x of b) { if (r.cvr>=x.min && r.cvr<x.max) { x.count++; x.spend+=r.spend; x.clicks+=r.clicks; break; } } }
    return b;
  }

  function calcFunnel(o) {
    return [
      { stage:'Impressions', value:o.impressions, rate:'100%' },
      { stage:'Clicks', value:o.clicks, rate:fmt.pct(o.ctr) },
      { stage:'Orders', value:o.orders, rate:fmt.pct(o.cvr) },
      { stage:'Sales', value:o.sales, rate:o.orders>0?fmt.money(o.aov)+' AOV':'—' }
    ];
  }

  function analyzeTargeting(rows) {
    const map = {};
    for (const r of rows) {
      const type = r.targetingKeyword && r.targetingKeyword.startsWith('asin=') ? 'Product' : 'Keyword';
      if (!map[type]) map[type] = { type, impressions:0, clicks:0, spend:0, sales:0, orders:0, terms:0 };
      const m = map[type]; m.impressions+=r.impressions; m.clicks+=r.clicks; m.spend+=r.spend; m.sales+=r.sales; m.orders+=r.orders; m.terms++;
    }
    return Object.values(map).map(m => ({ ...m,
      ctr:m.impressions>0?(m.clicks/m.impressions)*100:0, cvr:m.clicks>0?(m.orders/m.clicks)*100:0,
      acos:m.sales>0?(m.spend/m.sales)*100:0, roas:m.spend>0?m.sales/m.spend:0,
    }));
  }

  function mapSearchToKeyword(rows) {
    return rows.filter(r => r.targetingKeyword).map(r => ({
      searchTerm:r.searchTerm, keyword:r.targetingKeyword, matchType:r.matchType,
      impressions:r.impressions, clicks:r.clicks, spend:r.spend, orders:r.orders,
      sales:r.sales, acos:r.acos, roas:r.roas, cvr:r.cvr,
    })).sort((a,b)=>b.spend-a.spend).slice(0, 100);
  }

  // ── BID HEALTH ANALYSIS — NEW ──
  function analyzeBidHealth(rows, s) {
    const withBid = rows.filter(r => r.keywordBid > 0);
    if (withBid.length === 0) return null;

    // Group by keyword + match type
    const kwMap = {};
    for (const r of withBid) {
      const key = (r.targetingKeyword || '') + '|' + r.matchType;
      if (!kwMap[key]) kwMap[key] = {
        keyword: r.targetingKeyword || '(unknown)',
        matchType: r.matchType,
        keywordBid: r.keywordBid,
        impressions:0, clicks:0, spend:0, sales:0, orders:0, terms:0
      };
      const m = kwMap[key];
      m.impressions += r.impressions; m.clicks += r.clicks; m.spend += r.spend;
      m.sales += r.sales; m.orders += r.orders; m.terms++;
    }

    const keywords = Object.values(kwMap).map(m => {
      m.cpc = m.clicks > 0 ? m.spend / m.clicks : 0;
      m.ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
      m.cvr = m.clicks > 0 ? (m.orders / m.clicks) * 100 : 0;
      m.roas = m.spend > 0 ? m.sales / m.spend : 0;
      m.acos = m.sales > 0 ? (m.spend / m.sales) * 100 : 0;
      m.bidUtilization = m.keywordBid > 0 && m.cpc > 0 ? (m.cpc / m.keywordBid) * 100 : 0;
      m.bidHeadroom = m.keywordBid > 0 && m.cpc > 0 ? ((m.keywordBid - m.cpc) / m.keywordBid) * 100 : 0;

      // Bid verdict
      if (m.clicks === 0) {
        m.bidVerdict = 'No clicks — bid may be too low or keyword irrelevant';
        m.bidHealth = 'warning';
      } else if (m.roas >= s.targetRoas && m.bidUtilization < 70) {
        m.bidVerdict = 'Profitable + headroom — consider increasing bid to scale';
        m.bidHealth = 'scale';
      } else if (m.roas >= s.targetRoas) {
        m.bidVerdict = 'Healthy — profitable at current bid';
        m.bidHealth = 'healthy';
      } else if (m.roas > 0 && m.roas < s.targetRoas * 0.5) {
        m.bidVerdict = 'Unprofitable — reduce bid or pause';
        m.bidHealth = 'danger';
      } else if (m.roas > 0) {
        m.bidVerdict = 'Below target — reduce bid by 15-25%';
        m.bidHealth = 'caution';
      } else {
        m.bidVerdict = 'No sales — review relevance or reduce bid';
        m.bidHealth = 'danger';
      }
      return m;
    }).sort((a, b) => b.spend - a.spend);

    // Summary
    const avgBid = withBid.reduce((s, r) => s + r.keywordBid, 0) / withBid.length;
    const avgCpc = rows.filter(r => r.cpc > 0).reduce((s, r) => s + r.cpc, 0) / (rows.filter(r => r.cpc > 0).length || 1);
    const avgUtil = avgBid > 0 ? (avgCpc / avgBid) * 100 : 0;

    return {
      keywords,
      summary: {
        avgBid, avgCpc, avgUtilization: avgUtil,
        totalKeywords: keywords.length,
        healthy: keywords.filter(k => k.bidHealth === 'healthy').length,
        scale: keywords.filter(k => k.bidHealth === 'scale').length,
        caution: keywords.filter(k => k.bidHealth === 'caution').length,
        danger: keywords.filter(k => k.bidHealth === 'danger').length,
        warning: keywords.filter(k => k.bidHealth === 'warning').length,
      }
    };
  }

  // ── KEYWORD STATUS ANALYSIS — NEW ──
  function analyzeKeywordStatus(rows) {
    const map = {};
    for (const r of rows) {
      const status = r.keywordStatus || 'UNKNOWN';
      if (!map[status]) map[status] = { status, impressions:0, clicks:0, spend:0, sales:0, orders:0, terms:0 };
      const m = map[status];
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

  // ── Action items — now uses ROAS, CVR, bid health ──
  function generateActionItems(o, spendDist, matchTypes, roasDist, bidHealth, s) {
    const items = [];
    const totalSpend = matchTypes.reduce((sum, m) => sum + m.spend, 0);

    // 1. Overall ROAS check
    if (o.roas < s.targetRoas) {
      const gap = ((s.targetRoas - o.roas) / s.targetRoas * 100).toFixed(0);
      items.push({
        severity: o.roas < s.targetRoas * 0.5 ? 'critical' : 'high',
        category: 'ROAS', priority: 1,
        title: 'ROAS Below Target',
        finding: 'Current ROAS: ' + fmt.ratio(o.roas) + ' — target is ' + fmt.ratio(s.targetRoas) + ' (' + gap + '% gap)',
        impact: 'Every £1 spent returns only £' + o.roas.toFixed(2) + ' in sales',
        action: 'Focus spend on keywords with ROAS > ' + s.targetRoas + 'x, negate zero-sales terms, reduce bids on underperformers'
      });
    }

    // 2. Unprofitable spend
    const unprofPct = spendDist.filter(b => b.label.includes('Unprofitable') || b.label.includes('Critical')).reduce((sum, b) => sum + b.pct, 0);
    if (unprofPct > 15) {
      items.push({
        severity: unprofPct > 30 ? 'critical' : 'high', category: 'Profitability', priority: 2,
        title: 'High Unprofitable Spend',
        finding: fmt.pct(unprofPct) + ' of budget on terms with ACOS > ' + (s.targetAcos*1.5) + '%',
        impact: 'Improve profitability by 20-30% by cutting waste',
        action: 'Reduce bids by 40-60% on high-ACOS terms, pause if ACOS >100%'
      });
    }

    // 3. Conversion rate
    if (o.cvr < s.targetCvr) {
      items.push({
        severity: o.cvr < s.targetCvr * 0.5 ? 'critical' : 'medium',
        category: 'Conversion Rate', priority: 3,
        title: 'Low Conversion Rate',
        finding: 'Current CVR: ' + fmt.pct(o.cvr) + ' — target is ' + fmt.pct(s.targetCvr),
        impact: 'You are paying for clicks that don\'t convert to sales',
        action: 'Improve listing quality (title, images, price), add negative keywords for irrelevant traffic, check competitor pricing'
      });
    }

    // 4. Zero sales spend
    const zeroSalesPct = spendDist.find(b => b.label === 'Zero Sales')?.pct || 0;
    if (zeroSalesPct > 5) {
      items.push({
        severity: zeroSalesPct > 20 ? 'critical' : 'high', category: 'Budget Waste', priority: 2,
        title: 'Significant Zero-Sales Spend',
        finding: fmt.pct(zeroSalesPct) + ' of budget generates absolutely no sales',
        impact: 'Recover wasted budget for profitable terms',
        action: 'Add top zero-sales search terms as negative keywords, review listing relevance'
      });
    }

    // 5. Match type issues
    const worstMT = matchTypes.reduce((w, m) => m.spend > 0 && m.roas < (w?.roas ?? Infinity) ? m : w, null);
    if (worstMT && worstMT.roas < s.targetRoas * 0.7 && worstMT.spend / totalSpend > 0.2) {
      items.push({
        severity: 'high', category: 'Match Type', priority: 3,
        title: worstMT.matchType.charAt(0).toUpperCase() + worstMT.matchType.slice(1) + ' Match Underperforming',
        finding: worstMT.matchType + ' match has ROAS of ' + fmt.ratio(worstMT.roas) + ' with ' + fmt.pct((worstMT.spend/totalSpend)*100) + ' of spend',
        impact: 'Reallocating budget to better match types improves overall ROAS',
        action: 'Reduce ' + worstMT.matchType + ' bids by 20-30%, shift budget to higher-ROAS match types'
      });
    }

    // 6. CTR
    if (o.ctr < s.targetCtr * 0.8) {
      items.push({
        severity: 'medium', category: 'Click-Through Rate', priority: 4,
        title: 'Low Click-Through Rate',
        finding: 'CTR: ' + fmt.pct(o.ctr) + ' vs target ' + fmt.pct(s.targetCtr),
        impact: 'Low CTR = low relevance — you\'re paying for impressions that don\'t click',
        action: 'Improve listing title, main image, price competitiveness, and review badge eligibility'
      });
    }

    // 7. Bid health issues
    if (bidHealth) {
      const dangerKws = bidHealth.summary.danger;
      if (dangerKws > 0) {
        items.push({
          severity: dangerKws > 2 ? 'high' : 'medium', category: 'Bid Health', priority: 3,
          title: dangerKws + ' Keyword(s) with Unhealthy Bids',
          finding: dangerKws + ' keywords are unprofitable at current bid levels',
          impact: 'Reducing overbid keywords frees budget for winners',
          action: 'Review the Bid Health table — reduce or pause danger-flagged keywords'
        });
      }
      if (bidHealth.summary.scale > 0) {
        items.push({
          severity: 'low', category: 'Bid Health', priority: 5,
          title: bidHealth.summary.scale + ' Keyword(s) Ready to Scale',
          finding: 'Profitable keywords with bid headroom — your CPC is well below your max bid',
          impact: 'Increasing bids on winners can capture more volume',
          action: 'Increase bids by 10-20% on scale-flagged keywords to gain impression share'
        });
      }
    }

    return items.sort((a, b) => {
      const sevOrder = { critical:0, high:1, medium:2, low:3 };
      return (sevOrder[a.severity]??9) - (sevOrder[b.severity]??9) || a.priority - b.priority;
    });
  }

  function generateRoadmap(actionItems) {
    return [
      { phase:'Week 1 — Critical', cls:'p1', items:actionItems.filter(a => a.severity==='critical').map(a => a.category) },
      { phase:'Week 2-3 — High Priority', cls:'p2', items:actionItems.filter(a => a.severity==='high').map(a => a.category) },
      { phase:'Week 4-6 — Optimization', cls:'p3', items:actionItems.filter(a => a.severity==='medium').map(a => a.category) },
      { phase:'Ongoing — Growth', cls:'p4', items:[...actionItems.filter(a => a.severity==='low').map(a => a.category), 'Performance monitoring', 'Keyword expansion'] }
    ];
  }

  function calcSuccessMetrics(o, s) {
    return [
      { label:'ROAS', target:'>'+s.targetRoas+'x', current:o.roas, format:'ratio', good:o.roas>=s.targetRoas },
      { label:'ACOS', target:'<'+s.targetAcos+'%', current:o.acos, format:'pct', good:o.acos<=s.targetAcos },
      { label:'CVR', target:'>'+s.targetCvr+'%', current:o.cvr, format:'pct', good:o.cvr>=s.targetCvr },
      { label:'CTR', target:'>'+s.targetCtr+'%', current:o.ctr, format:'pct', good:o.ctr>=s.targetCtr },
      { label:'CPC', target:'Minimize', current:o.cpc, format:'money', good:true },
    ];
  }

  const fmt = {
    num: (v) => v >= 1000 ? v.toLocaleString('en-GB',{maximumFractionDigits:0}) : String(Math.round(v*100)/100),
    money: (v) => '£' + v.toLocaleString('en-GB',{minimumFractionDigits:2, maximumFractionDigits:2}),
    pct: (v) => (Math.round(v*100)/100) + '%',
    ratio: (v) => (Math.round(v*100)/100) + 'x',
  };

  return { runAudit, fmt };
})();
