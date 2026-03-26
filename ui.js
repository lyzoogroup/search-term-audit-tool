/**
 * ui.js — Dashboard rendering
 * Includes ROAS distribution, Bid Health, Keyword Status
 */

const UI = (() => {
  const fmt = Engine.fmt;

  function renderDashboard(audit, meta) {
    document.getElementById('meta-file').textContent = meta.fileName;
    document.getElementById('meta-platform').textContent = Parser.platformLabel(meta.platform);
    document.getElementById('meta-rows').textContent = audit.rowCount + ' terms';

    renderHealthSection(audit);
    renderKPIGrid(audit.overview, audit.settings);
    renderSpendDist(audit.spendDist);
    renderActionItems(audit.actionItems);
    renderRoadmap(audit.roadmap);
    renderTables(audit, meta);
    renderSuccessMetrics(audit.successMetrics);
  }

  function renderHealthSection(audit) {
    const el = document.getElementById('health-section');
    const h = audit.healthScore;
    const o = audit.overview;
    const total = o.spend;
    const profSpend = audit.spendDist.find(b => b.label === 'Profitable')?.spend || 0;
    const budgetEff = total > 0 ? (profSpend / total * 100) : 0;
    const bestMT = audit.matchTypes.reduce((best, m) => m.roas > (best?.roas || 0) ? m : best, null);
    const brandSplit = audit.brandAnalysis.hasBrands
      ? fmt.pct((audit.brandAnalysis.summary.brandedSpend / Math.max(total,1)) * 100) + ' / ' + fmt.pct((audit.brandAnalysis.summary.nonBrandedSpend / Math.max(total,1)) * 100)
      : 'N/A';
    const scoreColor = h.score >= 75 ? 'var(--green)' : h.score >= 60 ? 'var(--yellow)' : h.score >= 40 ? 'var(--orange)' : 'var(--red)';
    const circ = 2 * Math.PI * 52;
    const offset = circ - (h.score / 100) * circ;

    el.innerHTML = `
      <div class="health-ring-wrap">
        <div class="health-ring">
          <svg viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="52"/><circle class="ring-fg" cx="60" cy="60" r="52" style="stroke:${scoreColor};stroke-dasharray:${circ};stroke-dashoffset:${offset}"/></svg>
          <div class="health-num" style="color:${scoreColor}">${h.score}</div>
        </div>
        <div class="health-label">Account Health</div>
        <div class="health-sublabel" style="color:${scoreColor}">${h.label}</div>
      </div>
      <div class="top-cards">
        <div class="top-card"><div class="tc-label">Overall ROAS</div><div class="tc-value" style="color:${o.roas>=audit.settings.targetRoas?'var(--green)':'var(--red)'}">${fmt.ratio(o.roas)}</div><div class="tc-detail">Target: ${fmt.ratio(audit.settings.targetRoas)}</div></div>
        <div class="top-card"><div class="tc-label">Conversion Rate</div><div class="tc-value" style="color:${o.cvr>=audit.settings.targetCvr?'var(--green)':'var(--red)'}">${fmt.pct(o.cvr)}</div><div class="tc-detail">Target: ${fmt.pct(audit.settings.targetCvr)}</div></div>
        <div class="top-card"><div class="tc-label">Budget Efficiency</div><div class="tc-value">${fmt.pct(budgetEff)}</div><div class="tc-detail">% of spend generating sales</div></div>
        <div class="top-card"><div class="tc-label">Top Match Type</div><div class="tc-value">${bestMT ? bestMT.matchType.charAt(0).toUpperCase()+bestMT.matchType.slice(1) : 'N/A'}</div><div class="tc-detail">${bestMT ? 'ROAS: '+fmt.ratio(bestMT.roas) : ''}</div></div>
        <div class="top-card"><div class="tc-label">Brand vs Non-Brand</div><div class="tc-value">${brandSplit}</div><div class="tc-detail">Spend distribution</div></div>
        ${audit.bidHealth ? `<div class="top-card"><div class="tc-label">Avg Bid vs CPC</div><div class="tc-value">${fmt.money(audit.bidHealth.summary.avgBid)} / ${fmt.money(audit.bidHealth.summary.avgCpc)}</div><div class="tc-detail">Bid utilization: ${fmt.pct(audit.bidHealth.summary.avgUtilization)}</div></div>` : ''}
      </div>`;
  }

  function renderKPIGrid(o, s) {
    const kpis = [
      { label:'Impressions', value:fmt.num(o.impressions), cat:'traffic', dot:'#3B82F6' },
      { label:'Clicks', value:fmt.num(o.clicks), cat:'traffic', dot:'#8B5CF6' },
      { label:'CTR', value:fmt.pct(o.ctr), cat:'traffic', dot:'#22C55E', target:s.targetCtr+'%', status:o.ctr>=s.targetCtr?'good':'below' },
      { label:'Spend', value:fmt.money(o.spend), cat:'efficiency', dot:'#F97316' },
      { label:'Sales', value:fmt.money(o.sales), cat:'revenue', dot:'#22C55E' },
      { label:'ROAS', value:fmt.ratio(o.roas), cat:'efficiency', dot:'#14B8A6', target:s.targetRoas+'x', status:o.roas>=s.targetRoas?'good':'below' },
      { label:'Orders', value:fmt.num(o.orders), cat:'conversion', dot:'#EC4899' },
      { label:'CVR', value:fmt.pct(o.cvr), cat:'conversion', dot:'#F43F5E', target:s.targetCvr+'%', status:o.cvr>=s.targetCvr?'good':'below' },
      { label:'CPC', value:fmt.money(o.cpc), cat:'efficiency', dot:'#6366F1' },
      { label:'ACOS', value:fmt.pct(o.acos), cat:'efficiency', dot:'#EF4444', target:s.targetAcos+'%', status:o.acos<=s.targetAcos?'good':'above' },
      { label:'AOV', value:fmt.money(o.aov), cat:'revenue', dot:'#0EA5E9' },
      { label:'CPO', value:fmt.money(o.cpo), cat:'efficiency', dot:'#A855F7' },
    ];

    const grid = document.getElementById('kpi-grid');
    const tabs = document.getElementById('cat-tabs');
    const cats = ['all','traffic','efficiency','revenue','conversion'];
    tabs.innerHTML = cats.map(c => `<button class="tab-btn ${c==='all'?'active':''}" data-cat="${c}">${c.charAt(0).toUpperCase()+c.slice(1)}</button>`).join('');

    function render(cat) {
      const f = cat === 'all' ? kpis : kpis.filter(k => k.cat === cat);
      grid.innerHTML = f.map(k => `
        <div class="kpi-card">
          <div class="kpi-label"><span class="kpi-dot" style="background:${k.dot}"></span>${k.label}</div>
          <div class="kpi-value">${k.value}</div>
          ${k.target ? `<div class="kpi-target kpi-status-${k.status}">Target: ${k.target} ${k.status==='good'?'✓':k.status==='above'?'▲':'▼'}</div>` : ''}
        </div>`).join('');
    }
    render('all');
    tabs.addEventListener('click', e => {
      if (e.target.classList.contains('tab-btn')) {
        tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        render(e.target.dataset.cat);
      }
    });
  }

  function renderSpendDist(dist) {
    const bar = document.getElementById('spend-dist');
    const legend = document.getElementById('spend-legend');
    bar.innerHTML = dist.filter(b => b.pct > 0).map(b => `<div class="dist-segment" style="flex:${b.pct};background:${b.color}" title="${b.label}: ${fmt.pct(b.pct)}">${b.pct>5?Math.round(b.pct)+'%':''}</div>`).join('');
    legend.innerHTML = dist.map(b => `<div class="dist-legend-item"><div class="dist-legend-dot" style="background:${b.color}"></div>${b.label}: ${fmt.pct(b.pct)} (${fmt.money(b.spend)})</div>`).join('');
  }

  function renderActionItems(items) {
    const el = document.getElementById('action-items');
    if (items.length === 0) { el.innerHTML = '<p style="color:var(--text2)">No issues detected — your account looks healthy!</p>'; return; }
    el.innerHTML = items.map((a, i) => `
      <div class="action-item ${a.severity}">
        <span class="ai-severity ${a.severity}">${a.severity}</span>
        <span class="ai-category">${a.category} &bull; Priority ${i+1}/${items.length}</span>
        <div class="ai-title">${a.title}</div>
        <div class="ai-finding">${a.finding}</div>
        <div class="ai-action"><strong>Expected Impact:</strong> ${a.impact}</div>
        <div class="ai-action"><strong>Action:</strong> ${a.action}</div>
      </div>`).join('');
  }

  function renderRoadmap(phases) {
    document.getElementById('roadmap').innerHTML = phases.map(p => `
      <div class="roadmap-phase ${p.cls}">
        <div class="rp-title">${p.phase}</div>
        <ul class="rp-items">${p.items.length>0?p.items.map(i=>`<li>${i}</li>`).join(''):'<li>No actions</li>'}</ul>
      </div>`).join('');
  }

  // ── Build all analysis tables ──
  function renderTables(audit, meta) {
    const container = document.getElementById('tables-container');
    const tables = [];

    // Bid Health (if available)
    if (audit.bidHealth) {
      tables.push({
        title:'Bid Health Analysis', count:audit.bidHealth.keywords.length,
        desc:'Keyword bid vs actual CPC — identifies overbidding and scaling opportunities',
        cols:['keyword','matchType','keywordBid','cpc','bidUtilization','impressions','clicks','orders','roas','acos','bidVerdict'],
        labels:['Keyword','Match','Bid','Avg CPC','Bid Use %','Impr','Clicks','Orders','ROAS','ACOS %','Verdict'],
        types:['text','text','money','money','pct','num','num','num','ratio','pct','text'],
        data:audit.bidHealth.keywords,
      });
    }

    // Keyword Status (if available)
    if (audit.keywordStatus) {
      tables.push({
        title:'Keyword Status Breakdown', count:audit.keywordStatus.length,
        desc:'Performance comparison between active and inactive keywords',
        cols:['status','terms','impressions','clicks','ctr','spend','orders','sales','roas','acos','cvr'],
        labels:['Status','Terms','Impr','Clicks','CTR %','Spend','Orders','Sales','ROAS','ACOS %','CVR %'],
        types:['text','num','num','num','pct','money','num','money','ratio','pct','pct'],
        data:audit.keywordStatus,
      });
    }

    // Campaign Summary
    if (audit.campaignSummary.length > 0)
      tables.push({ title:'Campaign Summary', count:audit.campaignSummary.length, desc:'Performance by campaign',
        cols:['campaign','impressions','clicks','ctr','spend','orders','sales','roas','acos','cvr','cpc'],
        labels:['Campaign','Impr','Clicks','CTR %','Spend','Orders','Sales','ROAS','ACOS %','CVR %','CPC'],
        types:['text','num','num','pct','money','num','money','ratio','pct','pct','money'], data:audit.campaignSummary });

    // Ad Group Summary
    if (audit.adGroupSummary.length > 0)
      tables.push({ title:'Ad Group Summary', count:audit.adGroupSummary.length, desc:'Performance by ad group',
        cols:['adGroup','impressions','clicks','ctr','spend','orders','sales','roas','acos','cvr'],
        labels:['Ad Group','Impr','Clicks','CTR %','Spend','Orders','Sales','ROAS','ACOS %','CVR %'],
        types:['text','num','num','pct','money','num','money','ratio','pct','pct'], data:audit.adGroupSummary });

    // ROAS Distribution
    tables.push({ title:'ROAS Distribution', count:audit.roasDistribution.length, desc:'How spend is distributed across ROAS brackets',
      cols:['label','count','spend','sales','color'],
      labels:['ROAS Bracket','Terms','Spend','Sales',''],
      types:['text','num','money','money','hidden'], data:audit.roasDistribution });

    // Top 50 by spend
    tables.push({ title:'Top Search Terms by Spend', count:Math.min(50, audit.topBySpend.length), desc:'Highest spending search terms',
      cols:['searchTerm','matchType','impressions','clicks','ctr','spend','orders','sales','roas','acos','cvr'],
      labels:['Search Term','Match','Impr','Clicks','CTR %','Spend','Orders','Sales','ROAS','ACOS %','CVR %'],
      types:['text','text','num','num','pct','money','num','money','ratio','pct','pct'], data:audit.topBySpend });

    // Wasted
    tables.push({ title:'Wasted Terms', count:audit.wastedTerms.length, desc:'Terms with high spend but poor/no returns — negative keyword candidates',
      cols:['searchTerm','_class','matchType','impressions','clicks','ctr','spend','orders','sales','roas'],
      labels:['Search Term','Class','Match','Impr','Clicks','CTR %','Spend','Orders','Sales','ROAS'],
      types:['text','text','text','num','num','pct','money','num','money','ratio'], data:audit.wastedTerms });

    // Winners
    tables.push({ title:'Efficient Winners', count:audit.winners.length, desc:'High-performing terms — scaling candidates',
      cols:['searchTerm','_class','matchType','impressions','clicks','ctr','spend','orders','sales','roas','cvr'],
      labels:['Search Term','Class','Match','Impr','Clicks','CTR %','Spend','Orders','Sales','ROAS','CVR %'],
      types:['text','text','text','num','num','pct','money','num','money','ratio','pct'], data:audit.winners });

    // Match Type
    tables.push({ title:'Match Type Performance', count:audit.matchTypes.length, desc:'Comparison across match types',
      cols:['matchType','terms','impressions','clicks','ctr','spend','orders','sales','roas','acos','cpc','cvr'],
      labels:['Match Type','Terms','Impr','Clicks','CTR %','Spend','Orders','Sales','ROAS','ACOS %','CPC','CVR %'],
      types:['text','num','num','num','pct','money','num','money','ratio','pct','money','pct'], data:audit.matchTypes });

    // ACOS Distribution
    tables.push({ title:'ACOS Distribution', count:audit.acosDistribution.length, desc:'Spend across ACOS brackets',
      cols:['label','count','spend','sales'], labels:['ACOS Bracket','Terms','Spend','Sales'],
      types:['text','num','money','money'], data:audit.acosDistribution });

    // CVR Distribution
    tables.push({ title:'CVR Distribution', count:audit.cvrDistribution.length, desc:'Terms grouped by conversion rate',
      cols:['label','count','spend','clicks'], labels:['CVR Bracket','Terms','Spend','Clicks'],
      types:['text','num','money','num'], data:audit.cvrDistribution });

    // Keyword mapping
    if (audit.keywordMapping.length > 0)
      tables.push({ title:'Search Term ↔ Keyword Mapping', count:audit.keywordMapping.length, desc:'Cross-reference between searches and targeting keywords',
        cols:['searchTerm','keyword','matchType','impressions','clicks','spend','orders','sales','roas','cvr'],
        labels:['Search Term','Keyword','Match','Impr','Clicks','Spend','Orders','Sales','ROAS','CVR %'],
        types:['text','text','text','num','num','money','num','money','ratio','pct'], data:audit.keywordMapping });

    // Funnel
    tables.push({ title:'Conversion Funnel', count:audit.conversionFunnel.length, desc:'Impression → Click → Order → Sale flow',
      cols:['stage','value','rate'], labels:['Stage','Value','Rate'],
      types:['text','num','text'], data:audit.conversionFunnel });

    // N-grams
    tables.push({ title:'N-gram Analysis', count:audit.ngrams.length, desc:'Word/phrase frequency + performance (1-gram, 2-gram, 3-gram)',
      cols:['ngram','type','frequency','impressions','clicks','ctr','spend','cpc','orders','cvr','sales','roas','acos'],
      labels:['N-gram','Type','Freq','Impr','Clicks','CTR %','Spend','CPC','Orders','CVR %','Sales','ROAS','ACOS %'],
      types:['text','text','num','num','num','pct','money','money','num','pct','money','ratio','pct'],
      data:audit.ngrams.slice(0, 300) });

    // Render
    container.innerHTML = tables.map((t, idx) => buildAccordion(t, idx)).join('');
    container.querySelectorAll('.table-accordion-header').forEach(hdr => hdr.addEventListener('click', () => hdr.parentElement.classList.toggle('open')));
    container.querySelectorAll('.table-accordion').forEach((acc, idx) => attachFeatures(acc, tables[idx]));
  }

  function buildAccordion(t, idx) {
    // Filter out hidden columns
    const visibleCols = t.cols.map((c, i) => t.types[i] !== 'hidden' ? i : -1).filter(i => i >= 0);
    return `
      <div class="table-accordion" data-idx="${idx}">
        <div class="table-accordion-header">
          <div class="ta-left"><span class="ta-arrow">&#9654;</span><span class="ta-title">${t.title}</span><span class="ta-count">${t.count} rows</span></div>
          <span class="ta-desc">${t.desc}</span>
        </div>
        <div class="table-accordion-body">
          <div class="table-controls">
            <input class="table-search" placeholder="Search...">
            <div style="display:flex;gap:8px;align-items:center">
              <button class="table-export-btn">⬇ CSV</button>
              <div class="table-pagination"><button class="pg-prev" disabled>‹</button><span class="pg-info">1</span><button class="pg-next">›</button></div>
            </div>
          </div>
          <table class="data-table">
            <thead><tr>${visibleCols.map(ci => `<th data-col="${ci}">${t.labels[ci]} <span class="sort-arrow"></span></th>`).join('')}</tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>`;
  }

  function attachFeatures(acc, td) {
    const PAGE = 25;
    let sortCol = -1, sortDir = 'none', filterText = '', page = 0;
    let filtered = [...td.data];
    const visibleCols = td.cols.map((c, i) => td.types[i] !== 'hidden' ? i : -1).filter(i => i >= 0);
    const tbody = acc.querySelector('tbody');
    const search = acc.querySelector('.table-search');
    const prev = acc.querySelector('.pg-prev');
    const next = acc.querySelector('.pg-next');
    const info = acc.querySelector('.pg-info');
    const exp = acc.querySelector('.table-export-btn');

    function render() {
      const total = Math.ceil(filtered.length / PAGE) || 1;
      page = Math.max(0, Math.min(page, total - 1));
      const slice = filtered.slice(page * PAGE, (page + 1) * PAGE);
      tbody.innerHTML = slice.map(row => '<tr>' + visibleCols.map(ci => {
        const val = row[td.cols[ci]];
        const type = td.types[ci];
        return `<td class="${type!=='text'?'num':''}">${fmtCell(val, type)}</td>`;
      }).join('') + '</tr>').join('');
      info.textContent = `${page+1}/${total}`;
      prev.disabled = page === 0;
      next.disabled = page >= total - 1;
    }

    search.addEventListener('input', e => {
      filterText = e.target.value.toLowerCase();
      filtered = td.data.filter(row => td.cols.some(c => String(row[c]).toLowerCase().includes(filterText)));
      page = 0; render();
    });
    prev.addEventListener('click', e => { e.stopPropagation(); page--; render(); });
    next.addEventListener('click', e => { e.stopPropagation(); page++; render(); });

    acc.querySelectorAll('th').forEach(th => th.addEventListener('click', () => {
      const ci = parseInt(th.dataset.col);
      const col = td.cols[ci], type = td.types[ci];
      if (sortCol === ci) sortDir = sortDir==='asc'?'desc':sortDir==='desc'?'none':'asc';
      else { sortCol = ci; sortDir = 'asc'; }
      acc.querySelectorAll('th .sort-arrow').forEach(a => a.textContent = '');
      th.querySelector('.sort-arrow').textContent = sortDir==='asc'?'▲':sortDir==='desc'?'▼':'';
      if (sortDir === 'none') { filtered = td.data.filter(row => !filterText || td.cols.some(c => String(row[c]).toLowerCase().includes(filterText))); }
      else { filtered.sort((a, b) => { let va=a[col], vb=b[col]; if(type!=='text'){va=typeof va==='number'?va:parseFloat(va)||0;vb=typeof vb==='number'?vb:parseFloat(vb)||0;}else{va=String(va).toLowerCase();vb=String(vb).toLowerCase();} return va<vb?(sortDir==='asc'?-1:1):va>vb?(sortDir==='asc'?1:-1):0; }); }
      page = 0; render();
    }));

    exp.addEventListener('click', e => {
      e.stopPropagation();
      const csvRows = [visibleCols.map(ci => td.labels[ci]).join(',')];
      for (const row of td.data) csvRows.push(visibleCols.map(ci => { let v = row[td.cols[ci]]; if(typeof v==='number') v=Math.round(v*100)/100; if(typeof v==='string'&&v.includes(',')) v='"'+v+'"'; return v??''; }).join(','));
      dlCSV(csvRows.join('\n'), td.title.replace(/\s+/g,'_')+'.csv');
    });

    render();
  }

  function fmtCell(val, type) {
    if (val===null||val===undefined) return '—';
    if (val===Infinity) return '∞';
    switch(type) { case 'money':return fmt.money(val); case 'pct':return fmt.pct(val); case 'ratio':return fmt.ratio(val); case 'num':return fmt.num(val); default:return String(val); }
  }

  function renderSuccessMetrics(metrics) {
    document.getElementById('success-metrics').innerHTML = metrics.map(m => {
      const v = m.format==='money'?fmt.money(m.current):m.format==='pct'?fmt.pct(m.current):fmt.ratio(m.current);
      return `<div class="sm-card"><div class="sm-label">${m.label}</div><div class="sm-target">Target: ${m.target}</div><div class="sm-current" style="color:${m.good?'var(--green)':'var(--red)'}">${v}</div><div class="sm-status" style="color:${m.good?'var(--green)':'var(--red)'}">${m.good?'✓ On Target':'✗ Below Target'}</div></div>`;
    }).join('');
  }

  function dlCSV(content, filename) {
    const blob = new Blob([content], {type:'text/csv;charset=utf-8;'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportAllCSV(audit) {
    const cols = ['searchTerm','campaignName','adGroupName','targetingKeyword','matchType','keywordStatus','keywordBid','_class','impressions','clicks','ctr','spend','orders','sales','roas','acos','cvr','cpc','aov','bidUtilization'];
    const labels = ['Search Term','Campaign','Ad Group','Keyword','Match Type','Status','Bid','Classification','Impressions','Clicks','CTR','Spend','Orders','Sales','ROAS','ACOS','CVR','CPC','AOV','Bid Util %'];
    const csvRows = [labels.join(',')];
    for (const row of audit.classified) {
      csvRows.push(cols.map(c => {
        let v = row[c]; if(typeof v==='number') v=Math.round(v*100)/100;
        if(typeof v==='string'&&v.includes(',')) v='"'+v+'"'; return v??'';
      }).join(','));
    }
    dlCSV(csvRows.join('\n'), 'ppc_audit_full_export.csv');
  }

  return { renderDashboard, exportAllCSV };
})();
