/**
 * ui.js — Dashboard rendering
 * Builds all visual components from audit results
 */

const UI = (() => {

  const fmt = Engine.fmt;

  // ── Render full dashboard ──
  function renderDashboard(audit, meta) {
    document.getElementById('meta-file').textContent = meta.fileName;
    document.getElementById('meta-platform').textContent = Parser.platformLabel(meta.platform);
    document.getElementById('meta-rows').textContent = audit.rowCount + ' terms';

    renderHealthSection(audit);
    renderKPIGrid(audit.overview, audit.settings);
    renderSpendDist(audit.spendDist);
    renderActionItems(audit.actionItems);
    renderRoadmap(audit.roadmap);
    renderTables(audit);
    renderSuccessMetrics(audit.successMetrics);
  }

  // ── Health section ──
  function renderHealthSection(audit) {
    const el = document.getElementById('health-section');
    const h = audit.healthScore;
    const o = audit.overview;
    const totalSpend = o.spend;
    const profitableSpend = audit.spendDist.find(b => b.label === 'Profitable')?.spend || 0;
    const budgetEff = totalSpend > 0 ? (profitableSpend / totalSpend * 100) : 0;
    const bestMT = audit.matchTypes.reduce((best, m) => m.roas > (best?.roas || 0) ? m : best, null);
    const brandSplit = audit.brandAnalysis.hasBrands
      ? fmt.pct((audit.brandAnalysis.summary.brandedSpend / Math.max(totalSpend,1)) * 100) + ' / ' + fmt.pct((audit.brandAnalysis.summary.nonBrandedSpend / Math.max(totalSpend,1)) * 100)
      : 'N/A';

    const scoreColor = h.score >= 75 ? 'var(--green)' : h.score >= 60 ? 'var(--yellow)' : h.score >= 40 ? 'var(--orange)' : 'var(--red)';
    const circumference = 2 * Math.PI * 52; // ~327
    const offset = circumference - (h.score / 100) * circumference;

    el.innerHTML = `
      <div class="health-ring-wrap">
        <div class="health-ring">
          <svg viewBox="0 0 120 120">
            <circle class="ring-bg" cx="60" cy="60" r="52"/>
            <circle class="ring-fg" cx="60" cy="60" r="52" style="stroke:${scoreColor};stroke-dasharray:${circumference};stroke-dashoffset:${offset}"/>
          </svg>
          <div class="health-num" style="color:${scoreColor}">${h.score}</div>
        </div>
        <div class="health-label">Account Health</div>
        <div class="health-sublabel" style="color:${scoreColor}">${h.label}</div>
      </div>
      <div class="top-cards">
        <div class="top-card">
          <div class="tc-label">Budget Efficiency</div>
          <div class="tc-value">${fmt.pct(budgetEff)}</div>
          <div class="tc-detail">% of spend generating sales</div>
        </div>
        <div class="top-card">
          <div class="tc-label">Top Match Type</div>
          <div class="tc-value">${bestMT ? bestMT.matchType.charAt(0).toUpperCase() + bestMT.matchType.slice(1) : 'N/A'}</div>
          <div class="tc-detail">${bestMT ? 'ROAS: ' + fmt.ratio(bestMT.roas) : 'No data'}</div>
        </div>
        <div class="top-card">
          <div class="tc-label">Brand vs Non-Brand</div>
          <div class="tc-value">${brandSplit}</div>
          <div class="tc-detail">Spend distribution</div>
        </div>
      </div>`;
  }

  // ── KPI grid ──
  function renderKPIGrid(o, s) {
    const kpis = [
      { label:'Impressions', value: fmt.num(o.impressions), cat:'traffic', dot:'#3B82F6' },
      { label:'Clicks', value: fmt.num(o.clicks), cat:'traffic', dot:'#8B5CF6' },
      { label:'CTR', value: fmt.pct(o.ctr), cat:'traffic', dot:'#22C55E', target: s.targetCtr+'%', status: o.ctr >= s.targetCtr ? 'good' : 'below' },
      { label:'Spend', value: fmt.money(o.spend), cat:'efficiency', dot:'#F97316' },
      { label:'Sales', value: fmt.money(o.sales), cat:'revenue', dot:'#22C55E' },
      { label:'Orders', value: fmt.num(o.orders), cat:'conversion', dot:'#EC4899' },
      { label:'Units', value: fmt.num(o.units), cat:'conversion', dot:'#F59E0B' },
      { label:'CPC', value: fmt.money(o.cpc), cat:'efficiency', dot:'#6366F1' },
      { label:'ACOS', value: fmt.pct(o.acos), cat:'efficiency', dot:'#EF4444', target: s.targetAcos+'%', status: o.acos <= s.targetAcos ? 'good' : 'above' },
      { label:'ROAS', value: fmt.ratio(o.roas), cat:'efficiency', dot:'#14B8A6', target: s.targetRoas+'x', status: o.roas >= s.targetRoas ? 'good' : 'below' },
      { label:'CVR', value: fmt.pct(o.cvr), cat:'conversion', dot:'#F43F5E', target: s.targetCvr+'%', status: o.cvr >= s.targetCvr ? 'good' : 'below' },
      { label:'AOV', value: fmt.money(o.aov), cat:'revenue', dot:'#0EA5E9' },
      { label:'UPO', value: fmt.ratio(o.upo), cat:'revenue', dot:'#F59E0B' },
      { label:'CPO', value: fmt.money(o.cpo), cat:'efficiency', dot:'#A855F7' },
    ];

    const grid = document.getElementById('kpi-grid');
    const tabs = document.getElementById('cat-tabs');

    // Render tabs
    const cats = ['all','traffic','efficiency','revenue','conversion'];
    tabs.innerHTML = cats.map(c =>
      `<button class="tab-btn ${c==='all'?'active':''}" data-cat="${c}">${c.charAt(0).toUpperCase()+c.slice(1)}</button>`
    ).join('');

    // Render cards
    function renderCards(cat) {
      const filtered = cat === 'all' ? kpis : kpis.filter(k => k.cat === cat);
      grid.innerHTML = filtered.map(k => `
        <div class="kpi-card">
          <div class="kpi-label"><span class="kpi-dot" style="background:${k.dot}"></span>${k.label}</div>
          <div class="kpi-value">${k.value}</div>
          ${k.target ? `<div class="kpi-target kpi-status-${k.status}">Target: ${k.target} ${k.status === 'good' ? '✓' : k.status === 'above' ? '▲' : '▼'}</div>` : ''}
        </div>
      `).join('');
    }

    renderCards('all');

    tabs.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-btn')) {
        tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderCards(e.target.dataset.cat);
      }
    });
  }

  // ── Spend distribution bar ──
  function renderSpendDist(dist) {
    const bar = document.getElementById('spend-dist');
    const legend = document.getElementById('spend-legend');

    bar.innerHTML = dist.filter(b => b.pct > 0).map(b =>
      `<div class="dist-segment" style="flex:${b.pct};background:${b.color}" title="${b.label}: ${fmt.pct(b.pct)}">${b.pct > 5 ? Math.round(b.pct)+'%' : ''}</div>`
    ).join('');

    legend.innerHTML = dist.map(b =>
      `<div class="dist-legend-item"><div class="dist-legend-dot" style="background:${b.color}"></div>${b.label}: ${fmt.pct(b.pct)} (${fmt.money(b.spend)})</div>`
    ).join('');
  }

  // ── Action items ──
  function renderActionItems(items) {
    const el = document.getElementById('action-items');
    if (items.length === 0) {
      el.innerHTML = '<p style="color:var(--text2)">No critical issues detected. Your account looks healthy!</p>';
      return;
    }
    el.innerHTML = items.map((a, i) => `
      <div class="action-item ${a.severity}">
        <span class="ai-severity ${a.severity}">${a.severity}</span>
        <span class="ai-category">${a.category} &bull; Priority ${i+1}/${items.length}</span>
        <div class="ai-title">${a.title}</div>
        <div class="ai-finding">${a.finding}</div>
        <div class="ai-action"><strong>Expected Impact:</strong> ${a.impact}</div>
        <div class="ai-action"><strong>Action Required:</strong> ${a.action}</div>
      </div>
    `).join('');
  }

  // ── Roadmap ──
  function renderRoadmap(phases) {
    const el = document.getElementById('roadmap');
    el.innerHTML = phases.map(p =>
      `<div class="roadmap-phase ${p.cls}">
        <div class="rp-title">${p.phase}</div>
        <ul class="rp-items">${p.items.length > 0 ? p.items.map(i => `<li>${i}</li>`).join('') : '<li>No actions needed</li>'}</ul>
      </div>`
    ).join('');
  }

  // ── Analysis tables ──
  function renderTables(audit) {
    const container = document.getElementById('tables-container');
    const tables = [];

    // Campaign Summary
    if (audit.campaignSummary.length > 0) {
      tables.push({
        title: 'Campaign Summary', count: audit.campaignSummary.length,
        desc: 'Performance metrics grouped by campaign',
        cols: ['campaign','impressions','clicks','ctr','spend','orders','sales','acos','roas','cpc','cvr'],
        labels: ['Campaign','Impr','Clicks','CTR %','Spend','Orders','Sales','ACOS %','ROAS','CPC','CVR %'],
        types: ['text','num','num','pct','money','num','money','pct','ratio','money','pct'],
        data: audit.campaignSummary,
      });
    }

    // Ad Group Summary
    if (audit.adGroupSummary.length > 0) {
      tables.push({
        title: 'Ad Group Summary', count: audit.adGroupSummary.length,
        desc: 'Performance metrics grouped by ad group within campaigns',
        cols: ['adGroup','impressions','clicks','ctr','spend','orders','sales','acos','roas'],
        labels: ['Ad Group','Impr','Clicks','CTR %','Spend','Orders','Sales','ACOS %','ROAS'],
        types: ['text','num','num','pct','money','num','money','pct','ratio'],
        data: audit.adGroupSummary,
      });
    }

    // Brand Analysis
    if (audit.brandAnalysis.hasBrands) {
      tables.push({
        title: 'Branded Terms', count: audit.brandAnalysis.branded.length,
        desc: 'Search terms matching your brand names',
        cols: ['searchTerm','impressions','clicks','ctr','spend','orders','sales','acos','roas'],
        labels: ['Search Term','Impr','Clicks','CTR %','Spend','Orders','Sales','ACOS %','ROAS'],
        types: ['text','num','num','pct','money','num','money','pct','ratio'],
        data: audit.brandAnalysis.branded,
      });
      tables.push({
        title: 'Non-Branded Terms', count: audit.brandAnalysis.nonBranded.length,
        desc: 'Search terms not matching your brand names',
        cols: ['searchTerm','impressions','clicks','ctr','spend','orders','sales','acos','roas'],
        labels: ['Search Term','Impr','Clicks','CTR %','Spend','Orders','Sales','ACOS %','ROAS'],
        types: ['text','num','num','pct','money','num','money','pct','ratio'],
        data: audit.brandAnalysis.nonBranded,
      });
    }

    // Top 50 by spend
    tables.push({
      title: 'Top Search Terms by Spend', count: Math.min(50, audit.topBySpend.length),
      desc: 'Highest spending search terms for budget optimization',
      cols: ['searchTerm','matchType','impressions','clicks','ctr','spend','orders','sales','acos','roas','cvr'],
      labels: ['Search Term','Match','Impr','Clicks','CTR %','Spend','Orders','Sales','ACOS %','ROAS','CVR %'],
      types: ['text','text','num','num','pct','money','num','money','pct','ratio','pct'],
      data: audit.topBySpend,
    });

    // Wasted terms
    tables.push({
      title: 'Wasted Terms', count: audit.wastedTerms.length,
      desc: 'Search terms with high spend but poor or no returns',
      cols: ['searchTerm','_class','matchType','impressions','clicks','ctr','spend','orders','sales','acos'],
      labels: ['Search Term','Class','Match','Impr','Clicks','CTR %','Spend','Orders','Sales','ACOS %'],
      types: ['text','text','text','num','num','pct','money','num','money','pct'],
      data: audit.wastedTerms,
    });

    // Winners
    tables.push({
      title: 'Efficient Winner Terms', count: audit.winners.length,
      desc: 'High-performing search terms with good efficiency',
      cols: ['searchTerm','_class','matchType','impressions','clicks','ctr','spend','orders','sales','acos','roas'],
      labels: ['Search Term','Class','Match','Impr','Clicks','CTR %','Spend','Orders','Sales','ACOS %','ROAS'],
      types: ['text','text','text','num','num','pct','money','num','money','pct','ratio'],
      data: audit.winners,
    });

    // Match Type
    tables.push({
      title: 'Match Type Performance', count: audit.matchTypes.length,
      desc: 'Performance comparison across Exact, Phrase, and Broad match types',
      cols: ['matchType','terms','impressions','clicks','ctr','spend','orders','sales','acos','roas','cpc','cvr'],
      labels: ['Match Type','Terms','Impr','Clicks','CTR %','Spend','Orders','Sales','ACOS %','ROAS','CPC','CVR %'],
      types: ['text','num','num','num','pct','money','num','money','pct','ratio','money','pct'],
      data: audit.matchTypes,
    });

    // ACOS Distribution
    tables.push({
      title: 'ACOS Distribution', count: audit.acosDistribution.length,
      desc: 'Spend distribution across different ACOS brackets',
      cols: ['label','count','spend','sales'],
      labels: ['ACOS Bracket','Terms','Spend','Sales'],
      types: ['text','num','money','money'],
      data: audit.acosDistribution,
    });

    // CVR Distribution
    tables.push({
      title: 'CVR Distribution', count: audit.cvrDistribution.length,
      desc: 'Spend distribution across different conversion rate brackets',
      cols: ['label','count','spend','clicks'],
      labels: ['CVR Bracket','Terms','Spend','Clicks'],
      types: ['text','num','money','num'],
      data: audit.cvrDistribution,
    });

    // Targeting Analysis
    if (audit.targetingAnalysis.length > 0) {
      tables.push({
        title: 'Targeting Type Analysis', count: audit.targetingAnalysis.length,
        desc: 'Keyword vs Product targeting performance comparison',
        cols: ['type','terms','impressions','clicks','ctr','spend','orders','sales','acos','roas'],
        labels: ['Type','Terms','Impr','Clicks','CTR %','Spend','Orders','Sales','ACOS %','ROAS'],
        types: ['text','num','num','num','pct','money','num','money','pct','ratio'],
        data: audit.targetingAnalysis,
      });
    }

    // Keyword mapping
    if (audit.keywordMapping.length > 0) {
      tables.push({
        title: 'Search Term vs. Targeting Keyword Mapping', count: audit.keywordMapping.length,
        desc: 'Cross-reference between customer search terms and targeting keywords',
        cols: ['searchTerm','keyword','matchType','impressions','clicks','spend','orders','sales','acos'],
        labels: ['Search Term','Keyword','Match','Impr','Clicks','Spend','Orders','Sales','ACOS %'],
        types: ['text','text','text','num','num','money','num','money','pct'],
        data: audit.keywordMapping,
      });
    }

    // Conversion Funnel
    tables.push({
      title: 'Conversion Funnel', count: audit.conversionFunnel.length,
      desc: 'Complete funnel from impressions to conversions with rates',
      cols: ['stage','value','rate'],
      labels: ['Stage','Value','Rate'],
      types: ['text','num','text'],
      data: audit.conversionFunnel,
    });

    // N-gram Analysis
    tables.push({
      title: 'N-gram Analysis', count: audit.ngrams.length,
      desc: 'Word and phrase frequency analysis from search terms (1-gram, 2-gram, 3-gram)',
      cols: ['ngram','type','frequency','impressions','clicks','ctr','spend','cpc','orders','cvr','sales','acos'],
      labels: ['N-gram','Type','Freq','Impr','Clicks','CTR %','Spend','CPC','Orders','CVR %','Sales','ACOS %'],
      types: ['text','text','num','num','num','pct','money','money','num','pct','money','pct'],
      data: audit.ngrams.slice(0, 200), // limit for performance
    });

    // Render all
    container.innerHTML = tables.map((t, idx) => buildTableAccordion(t, idx)).join('');

    // Attach events
    container.querySelectorAll('.table-accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const acc = header.parentElement;
        acc.classList.toggle('open');
      });
    });

    // Attach sort, search, pagination
    container.querySelectorAll('.table-accordion').forEach((acc, idx) => {
      attachTableFeatures(acc, tables[idx]);
    });
  }

  // ── Build a single table accordion ──
  function buildTableAccordion(t, idx) {
    const PAGE_SIZE = 25;
    return `
      <div class="table-accordion" data-idx="${idx}">
        <div class="table-accordion-header">
          <div class="ta-left">
            <span class="ta-arrow">&#9654;</span>
            <span class="ta-title">${t.title}</span>
            <span class="ta-count">${t.count} rows</span>
          </div>
          <span class="ta-desc">${t.desc}</span>
        </div>
        <div class="table-accordion-body">
          <div class="table-controls">
            <input class="table-search" placeholder="Search all columns..." data-idx="${idx}">
            <div style="display:flex;gap:8px;align-items:center">
              <button class="table-export-btn" data-idx="${idx}">⬇ CSV</button>
              <div class="table-pagination" data-idx="${idx}">
                <button class="pg-prev" disabled>‹ Prev</button>
                <span class="pg-info">Page 1</span>
                <button class="pg-next">Next ›</button>
              </div>
            </div>
          </div>
          <table class="data-table" data-idx="${idx}">
            <thead><tr>${t.labels.map((l, ci) => `<th data-col="${ci}" data-sort="none">${l} <span class="sort-arrow"></span></th>`).join('')}</tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>`;
  }

  // ── Table interactivity ──
  function attachTableFeatures(acc, tableDef) {
    const PAGE_SIZE = 25;
    let sortCol = -1;
    let sortDir = 'none';
    let filterText = '';
    let page = 0;
    let filteredData = [...tableDef.data];

    const tbody = acc.querySelector('tbody');
    const search = acc.querySelector('.table-search');
    const prevBtn = acc.querySelector('.pg-prev');
    const nextBtn = acc.querySelector('.pg-next');
    const pgInfo = acc.querySelector('.pg-info');
    const exportBtn = acc.querySelector('.table-export-btn');

    function renderPage() {
      const totalPages = Math.ceil(filteredData.length / PAGE_SIZE) || 1;
      page = Math.max(0, Math.min(page, totalPages - 1));
      const start = page * PAGE_SIZE;
      const slice = filteredData.slice(start, start + PAGE_SIZE);

      tbody.innerHTML = slice.map(row => {
        return '<tr>' + tableDef.cols.map((col, ci) => {
          const val = row[col];
          const type = tableDef.types[ci];
          const formatted = formatCell(val, type);
          return `<td class="${type !== 'text' ? 'num' : ''}">${formatted}</td>`;
        }).join('') + '</tr>';
      }).join('');

      pgInfo.textContent = `Page ${page+1} of ${totalPages}`;
      prevBtn.disabled = page === 0;
      nextBtn.disabled = page >= totalPages - 1;
    }

    // Search
    search.addEventListener('input', (e) => {
      filterText = e.target.value.toLowerCase();
      filteredData = tableDef.data.filter(row =>
        tableDef.cols.some(col => String(row[col]).toLowerCase().includes(filterText))
      );
      page = 0;
      renderPage();
    });

    // Pagination
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); page--; renderPage(); });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); page++; renderPage(); });

    // Sort
    acc.querySelectorAll('th').forEach(th => {
      th.addEventListener('click', () => {
        const ci = parseInt(th.dataset.col);
        const col = tableDef.cols[ci];
        const type = tableDef.types[ci];

        if (sortCol === ci) {
          sortDir = sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? 'none' : 'asc';
        } else {
          sortCol = ci;
          sortDir = 'asc';
        }

        // Reset arrows
        acc.querySelectorAll('th .sort-arrow').forEach(a => a.textContent = '');
        th.querySelector('.sort-arrow').textContent = sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : '';

        if (sortDir === 'none') {
          filteredData = tableDef.data.filter(row =>
            !filterText || tableDef.cols.some(c => String(row[c]).toLowerCase().includes(filterText))
          );
        } else {
          filteredData.sort((a, b) => {
            let va = a[col], vb = b[col];
            if (type !== 'text') {
              va = typeof va === 'number' ? va : parseFloat(va) || 0;
              vb = typeof vb === 'number' ? vb : parseFloat(vb) || 0;
            } else {
              va = String(va).toLowerCase();
              vb = String(vb).toLowerCase();
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
          });
        }
        page = 0;
        renderPage();
      });
    });

    // Export CSV
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const csvRows = [tableDef.labels.join(',')];
      for (const row of tableDef.data) {
        csvRows.push(tableDef.cols.map(col => {
          let v = row[col];
          if (typeof v === 'string' && v.includes(',')) v = '"' + v + '"';
          return v;
        }).join(','));
      }
      downloadCSV(csvRows.join('\n'), tableDef.title.replace(/\s+/g, '_') + '.csv');
    });

    renderPage();
  }

  // ── Format cell ──
  function formatCell(val, type) {
    if (val === null || val === undefined) return '-';
    if (val === Infinity) return '∞';
    switch (type) {
      case 'money': return fmt.money(val);
      case 'pct': return fmt.pct(val);
      case 'ratio': return fmt.ratio(val);
      case 'num': return fmt.num(val);
      default: return String(val);
    }
  }

  // ── Success metrics ──
  function renderSuccessMetrics(metrics) {
    const el = document.getElementById('success-metrics');
    el.innerHTML = metrics.map(m => {
      const formatted = m.format === 'money' ? fmt.money(m.current)
        : m.format === 'pct' ? fmt.pct(m.current)
        : fmt.ratio(m.current);
      return `
        <div class="sm-card">
          <div class="sm-label">${m.label}</div>
          <div class="sm-target">Target: ${m.target}</div>
          <div class="sm-current" style="color:${m.good ? 'var(--green)' : 'var(--red)'}">${formatted}</div>
          <div class="sm-status" style="color:${m.good ? 'var(--green)' : 'var(--red)'}">${m.good ? '✓ On Target' : '✗ Below Target'}</div>
        </div>`;
    }).join('');
  }

  // ── CSV download ──
  function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ── Export all tables ──
  function exportAllCSV(audit) {
    // Export the classified data with all metrics
    const cols = ['searchTerm','campaignName','adGroupName','matchType','_class','impressions','clicks','ctr','spend','orders','sales','acos','roas','cvr','cpc','aov'];
    const labels = ['Search Term','Campaign','Ad Group','Match Type','Classification','Impressions','Clicks','CTR','Spend','Orders','Sales','ACOS','ROAS','CVR','CPC','AOV'];
    const csvRows = [labels.join(',')];
    for (const row of audit.classified) {
      csvRows.push(cols.map(c => {
        let v = row[c];
        if (typeof v === 'number') v = Math.round(v * 100) / 100;
        if (typeof v === 'string' && v.includes(',')) v = '"' + v + '"';
        return v ?? '';
      }).join(','));
    }
    downloadCSV(csvRows.join('\n'), 'ppc_audit_full_export.csv');
  }

  return { renderDashboard, exportAllCSV };
})();
