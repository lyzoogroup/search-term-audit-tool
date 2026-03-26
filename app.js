/**
 * app.js — Main application orchestrator
 * Handles file upload, screen switching, and event wiring
 */

(function() {
  'use strict';

  // ── DOM refs ──
  const uploadScreen = document.getElementById('upload-screen');
  const loadingScreen = document.getElementById('loading-screen');
  const dashboard = document.getElementById('dashboard');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const browseBtn = document.getElementById('browse-btn');
  const loadingMsg = document.getElementById('loading-msg');

  let currentAudit = null;

  // ── Screen switching ──
  function showScreen(screen) {
    uploadScreen.classList.add('hidden');
    loadingScreen.classList.add('hidden');
    dashboard.classList.add('hidden');
    screen.classList.remove('hidden');
    if (screen === dashboard) {
      window.scrollTo(0, 0);
    }
  }

  // ── Read settings from UI ──
  function getSettings() {
    return {
      targetAcos: parseFloat(document.getElementById('target-acos').value) || 30,
      targetRoas: parseFloat(document.getElementById('target-roas').value) || 3,
      targetCtr: parseFloat(document.getElementById('target-ctr').value) || 2.5,
      targetCvr: parseFloat(document.getElementById('target-cvr').value) || 10,
      minClicksNeg: parseInt(document.getElementById('min-clicks-neg').value) || 20,
      brandNames: (document.getElementById('brand-names').value || '')
        .split(',').map(s => s.trim()).filter(s => s.length > 0)
    };
  }

  // ── Process uploaded file ──
  async function processFile(file) {
    showScreen(loadingScreen);

    const steps = [
      'Parsing file...',
      'Detecting platform...',
      'Normalizing data...',
      'Running classification engine...',
      'Analyzing n-grams...',
      'Generating recommendations...',
      'Building dashboard...'
    ];

    let stepIdx = 0;
    const stepInterval = setInterval(() => {
      stepIdx++;
      if (stepIdx < steps.length) {
        loadingMsg.textContent = steps[stepIdx];
      }
    }, 400);

    try {
      loadingMsg.textContent = steps[0];

      const parsed = await Parser.parseFile(file);

      if (parsed.rows.length === 0) {
        throw new Error('No valid search term data found in the file.');
      }

      const settings = getSettings();
      const audit = Engine.runAudit(parsed.rows, settings);
      currentAudit = { audit, meta: parsed };

      clearInterval(stepInterval);
      loadingMsg.textContent = 'Building dashboard...';

      // Small delay for visual feedback
      await new Promise(r => setTimeout(r, 300));

      showScreen(dashboard);
      UI.renderDashboard(audit, parsed);

    } catch (err) {
      clearInterval(stepInterval);
      showScreen(uploadScreen);
      alert('Error: ' + err.message);
      console.error(err);
    }
  }

  // ── File upload events ──
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  });

  // Drag & drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  });

  // ── Dashboard actions ──
  document.getElementById('btn-new').addEventListener('click', () => {
    currentAudit = null;
    fileInput.value = '';
    showScreen(uploadScreen);
  });

  document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (currentAudit) {
      UI.exportAllCSV(currentAudit.audit);
    }
  });

})();
