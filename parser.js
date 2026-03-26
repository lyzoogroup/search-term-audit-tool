/**
 * parser.js — File parsing + column auto-detection
 * Supports CSV, TSV, XLSX, XLS
 * Auto-detects Amazon SP/SB, Google Ads, Microsoft Ads, eBay
 */

const Parser = (() => {

  // Column maps for each platform
  const COLUMN_MAPS = {
    amazon_sp: {
      'customer search term': 'searchTerm',
      'campaign name': 'campaignName',
      'ad group name': 'adGroupName',
      'targeting': 'targetingKeyword',
      'match type': 'matchType',
      'impressions': 'impressions',
      'clicks': 'clicks',
      'spend': 'spend',
      'cost': 'spend',
      '7 day total sales': 'sales',
      '7 day total orders (#)': 'orders',
      '7 day total orders': 'orders',
      '7 day total units (#)': 'units',
      '7 day total units': 'units',
      'total advertising cost of sales (acos)': 'acos',
      'acos': 'acos',
      'click-thru rate (ctr)': 'ctr',
      'cost per click (cpc)': 'cpc',
      'ctr': 'ctr',
      'cpc': 'cpc',
    },
    amazon_sb: {
      'customer search term': 'searchTerm',
      'campaign name': 'campaignName',
      'impressions': 'impressions',
      'clicks': 'clicks',
      'cost': 'spend',
      'spend': 'spend',
      '14 day total sales': 'sales',
      '14 day total orders (#)': 'orders',
      '14 day total orders': 'orders',
      'acos': 'acos',
      'ctr': 'ctr',
      'cpc': 'cpc',
    },
    google_ads: {
      'search term': 'searchTerm',
      'search terms': 'searchTerm',
      'campaign': 'campaignName',
      'campaign name': 'campaignName',
      'ad group': 'adGroupName',
      'ad group name': 'adGroupName',
      'keyword': 'targetingKeyword',
      'match type': 'matchType',
      'impr.': 'impressions',
      'impr': 'impressions',
      'impressions': 'impressions',
      'clicks': 'clicks',
      'cost': 'spend',
      'spend': 'spend',
      'conversions': 'orders',
      'conv.': 'orders',
      'conv. value': 'sales',
      'conversion value': 'sales',
      'ctr': 'ctr',
      'avg. cpc': 'cpc',
      'avg cpc': 'cpc',
    },
    microsoft_ads: {
      'search query': 'searchTerm',
      'campaign name': 'campaignName',
      'campaign': 'campaignName',
      'ad group': 'adGroupName',
      'ad group name': 'adGroupName',
      'keyword': 'targetingKeyword',
      'delivered match type': 'matchType',
      'match type': 'matchType',
      'impressions': 'impressions',
      'clicks': 'clicks',
      'spend': 'spend',
      'conversions': 'orders',
      'revenue': 'sales',
      'ctr': 'ctr',
      'avg. cpc': 'cpc',
    }
  };

  // Detect platform from headers
  function detectPlatform(headers) {
    const lower = headers.map(h => h.toLowerCase().trim());
    let best = { platform: 'custom', score: 0 };

    for (const [platform, map] of Object.entries(COLUMN_MAPS)) {
      const keys = Object.keys(map);
      let hits = 0;
      for (const h of lower) {
        if (keys.includes(h)) hits++;
      }
      const score = hits / Math.max(keys.length * 0.4, 1);
      if (score > best.score) {
        best = { platform, score };
      }
    }

    return best.score > 0.3 ? best.platform : 'custom';
  }

  // Map columns from raw headers to internal fields
  function mapColumns(headers, platform) {
    const map = COLUMN_MAPS[platform] || {};
    const result = {};
    const lower = headers.map(h => h.toLowerCase().trim());

    for (let i = 0; i < headers.length; i++) {
      const key = lower[i];
      if (map[key]) {
        result[headers[i]] = map[key];
      }
    }

    // Fallback: try generic matching for custom platform
    if (!result[headers.find(h => map[h.toLowerCase().trim()] === 'searchTerm')]) {
      for (const h of headers) {
        const l = h.toLowerCase().trim();
        if (!Object.values(result).includes('searchTerm') && (l.includes('search term') || l.includes('search query') || l === 'query')) result[h] = 'searchTerm';
        if (!Object.values(result).includes('impressions') && l.includes('impression')) result[h] = 'impressions';
        if (!Object.values(result).includes('clicks') && l === 'clicks') result[h] = 'clicks';
        if (!Object.values(result).includes('spend') && (l === 'spend' || l === 'cost')) result[h] = 'spend';
        if (!Object.values(result).includes('orders') && (l.includes('order') || l.includes('conversion'))) result[h] = 'orders';
        if (!Object.values(result).includes('sales') && (l.includes('sales') || l.includes('revenue') || l.includes('conv. value'))) result[h] = 'sales';
        if (!Object.values(result).includes('matchType') && l.includes('match type')) result[h] = 'matchType';
        if (!Object.values(result).includes('campaignName') && l.includes('campaign')) result[h] = 'campaignName';
        if (!Object.values(result).includes('adGroupName') && l.includes('ad group')) result[h] = 'adGroupName';
      }
    }

    return result;
  }

  // Clean numeric value
  function cleanNum(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleaned = String(val).replace(/[$£€¥,\s%]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  // Normalize match type string
  function normalizeMatchType(val) {
    if (!val) return 'unknown';
    const l = String(val).toLowerCase().trim();
    if (l.includes('exact')) return 'exact';
    if (l.includes('phrase')) return 'phrase';
    if (l.includes('broad')) return 'broad';
    if (l.includes('auto') || l.includes('close') || l.includes('loose') || l.includes('complement') || l.includes('substitute')) return 'auto';
    return l || 'unknown';
  }

  // Normalize rows to standard schema
  function normalizeRows(rawRows, colMap) {
    const NUMERIC = ['impressions','clicks','spend','sales','orders','units','ctr','cvr','acos','roas','cpc'];
    return rawRows.map(row => {
      const n = {};
      for (const [rawCol, field] of Object.entries(colMap)) {
        let val = row[rawCol];
        if (NUMERIC.includes(field)) {
          val = cleanNum(val);
        } else if (field === 'matchType') {
          val = normalizeMatchType(val);
        } else {
          val = val != null ? String(val).trim() : '';
        }
        n[field] = val;
      }

      // Derive missing metrics
      if (!n.impressions) n.impressions = 0;
      if (!n.clicks) n.clicks = 0;
      if (!n.spend) n.spend = 0;
      if (!n.orders) n.orders = 0;
      if (!n.sales) n.sales = 0;
      if (!n.units) n.units = n.orders;

      n.ctr = n.impressions > 0 ? (n.clicks / n.impressions) * 100 : 0;
      n.cvr = n.clicks > 0 ? (n.orders / n.clicks) * 100 : 0;
      n.acos = n.sales > 0 ? (n.spend / n.sales) * 100 : (n.spend > 0 ? Infinity : 0);
      n.roas = n.spend > 0 ? n.sales / n.spend : 0;
      n.cpc = n.clicks > 0 ? n.spend / n.clicks : 0;
      n.aov = n.orders > 0 ? n.sales / n.orders : 0;
      n.cpo = n.orders > 0 ? n.spend / n.orders : 0;

      return n;
    }).filter(r => r.searchTerm && r.searchTerm.length > 0);
  }

  // Parse a file (returns Promise)
  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const name = file.name.toLowerCase();

      if (name.endsWith('.csv') || name.endsWith('.tsv')) {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false,
          complete: (results) => {
            if (!results.data || results.data.length === 0) {
              return reject(new Error('No data found in file'));
            }
            const headers = results.meta.fields || Object.keys(results.data[0]);
            const platform = detectPlatform(headers);
            const colMap = mapColumns(headers, platform);

            if (!Object.values(colMap).includes('searchTerm')) {
              return reject(new Error('Could not find a "Search Term" column. Please check your file format.'));
            }

            const rows = normalizeRows(results.data, colMap);
            resolve({ rows, platform, headers, colMap, fileName: file.name });
          },
          error: (err) => reject(err)
        });
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const wb = XLSX.read(e.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });

            if (!rawData || rawData.length === 0) {
              return reject(new Error('No data found in file'));
            }

            const headers = Object.keys(rawData[0]);
            const platform = detectPlatform(headers);
            const colMap = mapColumns(headers, platform);

            if (!Object.values(colMap).includes('searchTerm')) {
              return reject(new Error('Could not find a "Search Term" column. Please check your file format.'));
            }

            const rows = normalizeRows(rawData, colMap);
            resolve({ rows, platform, headers, colMap, fileName: file.name });
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
      } else {
        reject(new Error('Unsupported file type. Please use CSV, XLSX, or XLS.'));
      }
    });
  }

  // Platform display names
  function platformLabel(p) {
    const labels = {
      amazon_sp: 'Amazon SP',
      amazon_sb: 'Amazon SB',
      google_ads: 'Google Ads',
      microsoft_ads: 'Microsoft Ads',
      custom: 'Custom'
    };
    return labels[p] || p;
  }

  return { parseFile, platformLabel };
})();
