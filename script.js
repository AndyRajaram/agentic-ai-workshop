/**
 * ShopEasy Data Analyst Agent — Collaborative Client-Side Multi-Agent System
 * Powered by Gemini 2.5 Flash
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Global Application State (The Blackboard Pattern Context) ---
    const state = {
        apiKey: '',
        sheetUrl: '',
        rawCsvData: '',
        parsedRecords: [], // Array of row objects: { Col1: Val1, Col2: Val2 }
        schema: {},        // { ColumnName: 'date' | 'number' | 'category' | 'text' }
        columns: [],       // Array of column strings
        dateRange: '',     // Formatted range: "DD-MM-YYYY to DD-MM-YYYY"
        questions: [],     // User entered plain-English questions
        configs: [],       // Array of confirmed chart configurations
        charts: []         // Active Chart.js instances
    };

    // --- DOM Selectors ---
    const el = {
        body: document.body,
        globalHeader: document.getElementById('global-header'),
        headerDateSpan: document.getElementById('header-date-span'),
        headerSheetUrl: document.getElementById('header-sheet-url'),
        headerRefreshBtn: document.getElementById('header-refresh-btn'),
        metaDateRange: document.getElementById('meta-date-range'),
        metaSheetLink: document.getElementById('meta-sheet-link'),
        
        apiKeyInput: document.getElementById('gemini-api-key'),
        sheetUrlInput: document.getElementById('sheet-url'),
        btnFetchData: document.getElementById('btn-fetch-data'),
        
        schemaPreviewCard: document.getElementById('schema-preview-container'),
        ingestSummaryMeta: document.getElementById('ingest-summary-meta'),
        schemaProfileGrid: document.getElementById('schema-profile-grid'),
        sampleTableHeaders: document.getElementById('sample-table-headers'),
        sampleTableRows: document.getElementById('sample-table-rows'),
        btnConfirmSchema: document.getElementById('btn-confirm-schema'),
        
        questionInputs: document.querySelectorAll('.question-input'),
        btnBackToStep1: document.getElementById('btn-back-to-step1'),
        btnSubmitQuestions: document.getElementById('btn-submit-questions'),
        
        recommendationsContainer: document.getElementById('recommendations-cards-container'),
        btnBackToStep2: document.getElementById('btn-back-to-step2'),
        btnConfirmConfigs: document.getElementById('btn-confirm-configs'),
        
        agentStatusRows: document.getElementById('agent-status-rows'),
        dashboardConsoleBody: document.getElementById('dashboard-console-body'),
        kpiRevenue: document.getElementById('kpi-val-revenue'),
        kpiSrcRevenue: document.getElementById('kpi-src-revenue'),
        kpiOrders: document.getElementById('kpi-val-orders'),
        kpiSrcOrders: document.getElementById('kpi-src-orders'),
        kpiDelivery: document.getElementById('kpi-val-delivery'),
        kpiSrcDelivery: document.getElementById('kpi-src-delivery'),
        chartsGalleryGrid: document.getElementById('charts-gallery-grid'),
        insightsStreamList: document.getElementById('insights-stream-list'),
        insightLoaderPlaceholder: document.getElementById('insight-loader-placeholder'),
        manualCsvContainer: document.getElementById('manual-csv-container'),
        manualCsvData: document.getElementById('manual-csv-data'),
        
        // Main container steps wrapper
        mainContainer: document.getElementById('main-container'),
        step1: document.getElementById('step-1'),
        step2: document.getElementById('step-2'),
        step3: document.getElementById('step-3'),
        step4: document.getElementById('step-4')
    };

    // --- Active 3D Tilt effect on Card ---
    const stepCards = document.querySelectorAll('.glass-card');
    stepCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const tiltX = (y - centerY) / 35; 
            const tiltY = -(x - centerX) / 35;
            card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-2px)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
        });
    });

    // --- API Key & local caching load ---
    function loadCachedKey() {
        const cached = localStorage.getItem('shopeasy_gemini_key');
        if (cached) {
            el.apiKeyInput.value = cached;
            state.apiKey = cached;
        }
    }
    loadCachedKey();

    // --- Navigation Logic ---
    function switchToStep(stepNum) {
        // Remove active-step from all steps
        el.step1.classList.remove('active-step');
        el.step2.classList.remove('active-step');
        el.step3.classList.remove('active-step');
        el.step4.classList.remove('active-step');
        
        el.step1.classList.add('hidden');
        el.step2.classList.add('hidden');
        el.step3.classList.add('hidden');
        el.step4.classList.add('hidden');

        // Reset workspace margins on dashboard steps
        if (stepNum === 4) {
            el.body.classList.add('dashboard-layout-mode');
            el.globalHeader.classList.remove('hidden');
        } else {
            el.body.classList.remove('dashboard-layout-mode');
            // Show global header only if data is loaded
            if (state.parsedRecords.length > 0) {
                el.globalHeader.classList.remove('hidden');
            } else {
                el.globalHeader.classList.add('hidden');
            }
        }

        // Activate step
        const activeContainer = el[`step${stepNum}`];
        activeContainer.classList.remove('hidden');
        // Let UI settle before sliding in
        setTimeout(() => {
            activeContainer.classList.add('active-step');
        }, 50);
    }

    // --- Terminal Operations Logger ---
    function logToConsole(agentName, message, statusType = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.className = 'line';
        
        let statusSpan = '';
        if (statusType === 'success') {
            statusSpan = `<span class="status-success">[OK]</span>`;
        } else if (statusType === 'error') {
            statusSpan = `<span class="text-red-500 font-bold" style="color: #ef4444;">[FAILED]</span>`;
        } else if (statusType === 'running') {
            statusSpan = `<span class="text-indigo-400 font-bold" style="color: #818cf8;">[EXECUTING]</span>`;
        }

        line.innerHTML = `<span class="text-slate-500" style="color: #64748b; font-size: 0.72rem;">[${timestamp}]</span> <span class="cmd">&gt;</span> <span style="font-weight: 500;">${agentName}:</span> <span>${message}</span> ${statusSpan}`;
        el.dashboardConsoleBody.appendChild(line);
        el.dashboardConsoleBody.scrollTop = el.dashboardConsoleBody.scrollHeight;
    }

    // --- Agent Status Indicator Controllers ---
    function updateAgentStatus(agentId, status) {
        // status = 'waiting' | 'running' | 'complete' | 'failed'
        const strip = document.getElementById(`status-${agentId}`);
        if (!strip) return;
        
        const badge = strip.querySelector('.state-badge');
        badge.className = `state-badge ${status}`;
        badge.textContent = status;
        
        strip.className = 'agent-status-strip';
        if (status === 'running') {
            strip.classList.add('active-running');
        } else if (status === 'complete') {
            strip.classList.add('done-complete');
        } else if (status === 'failed') {
            strip.classList.add('error-failed');
        }
    }

    function resetAllAgentStatuses() {
        ['ingestion', 'planning', 'kpis', 'rendering', 'insights'].forEach(id => {
            updateAgentStatus(id, 'waiting');
        });
    }

    // --- STEP 1 & Ingestion Agent: CSV Parser ---
    function parseCSV(text) {
        const lines = [];
        let row = [""];
        let inQuotes = false;
        
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            const next = text[i+1];
            
            if (c === '"') {
                if (inQuotes && next === '"') {
                    row[row.length - 1] += '"';
                    i++; // Skip double quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (c === ',' && !inQuotes) {
                row.push("");
            } else if ((c === '\r' || c === '\n') && !inQuotes) {
                if (c === '\r' && next === '\n') {
                    i++; // Skip \n
                }
                lines.push(row);
                row = [""];
            } else {
                row[row.length - 1] += c;
            }
        }
        if (row.length > 1 || row[0] !== "") {
            lines.push(row);
        }
        
        // Trim headers and values
        return lines.filter(l => l.length > 0 && l.some(cell => cell.trim() !== ''));
    }

    // Strict DD-MM-YYYY validator (allows single digits e.g. D-M-YYYY)
    function isStrictDate(val) {
        const regex = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
        if (!regex.test(val)) return false;
        
        const parts = val.split('-');
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        
        if (month < 1 || month > 12 || day < 1 || day > 31) return false;
        const d = new Date(year, month - 1, day);
        return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
    }

    // Helper: Parse DD-MM-YYYY to standard JS Date
    function parseDateString(str) {
        const parts = str.split('-');
        return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }

    // Helper: format Date back to strict DD-MM-YYYY
    function formatDateToString(d) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    }

    // Dynamic schema column profiling
    function profileSchema(headers, rows) {
        const schema = {};
        headers.forEach((col, colIdx) => {
            let matchesDate = 0;
            let matchesNumber = 0;
            let filledCount = 0;
            const uniqueValues = new Set();
            
            rows.forEach(row => {
                const val = (row[colIdx] || '').trim();
                if (val !== "") {
                    filledCount++;
                    uniqueValues.add(val);
                    
                    if (isStrictDate(val)) {
                        matchesDate++;
                    }
                    
                    // Strip currency characters and check float compatibility
                    const numString = val.replace(/[$,£,€,%]/g, '').replace(/,/g, '').trim();
                    if (numString !== "" && !isNaN(parseFloat(numString)) && isFinite(numString)) {
                        matchesNumber++;
                    }
                }
            });
            
            if (filledCount === 0) {
                schema[col] = 'text'; // Fallback
                return;
            }
            
            // Criteria: 80% dates -> Date
            if (matchesDate / filledCount > 0.8) {
                schema[col] = 'date';
            }
            // Criteria: 90% numbers -> Number
            else if (matchesNumber / filledCount > 0.9) {
                schema[col] = 'number';
            }
            // Criteria: Text under 15 unique values -> Category
            else if (uniqueValues.size < 15 || uniqueValues.size / filledCount < 0.15) {
                schema[col] = 'category';
            }
            else {
                schema[col] = 'text';
            }
        });
        return schema;
    }

    // --- Action: Step 1 Fetch Data ---
    el.btnFetchData.addEventListener('click', async () => {
        const key = el.apiKeyInput.value.trim();
        let url = el.sheetUrlInput.value.trim();
        const manualCsvText = el.manualCsvData.value.trim();
        
        if (!key) {
            alert('Please enter a valid Google Gemini API Key.');
            return;
        }

        // Check if we have pasted manual data ready
        const usingManualFallback = !el.manualCsvContainer.classList.contains('hidden') && manualCsvText !== "";

        if (!usingManualFallback && !url) {
            alert('Please enter a Google Sheet published CSV URL (or paste CSV data directly in the fallback area).');
            return;
        }
        
        // Cache API key
        localStorage.setItem('shopeasy_gemini_key', key);
        state.apiKey = key;

        // Reset elements
        el.btnFetchData.disabled = true;
        el.btnFetchData.style.opacity = '0.6';
        el.btnFetchData.querySelector('span').textContent = 'Silent Profiling Active...';
        el.schemaPreviewCard.classList.add('hidden');
        resetAllAgentStatuses();
        
        logToConsole('System', 'Bootstrapping Ingestion Agent...', 'info');
        updateAgentStatus('ingestion', 'running');
        
        try {
            let rawText = "";

            if (usingManualFallback) {
                logToConsole('Ingestion Agent', 'Ingesting pasted CSV content directly...', 'running');
                rawText = manualCsvText;
            } else {
                state.sheetUrl = url;
                
                // Auto-conversion of Google Sheets edit links to CSV exports
                // Handles URLs like: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0
                const sheetIdMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
                if (sheetIdMatch && !url.includes('/pub') && !url.includes('/export')) {
                    const spreadsheetId = sheetIdMatch[1];
                    let gid = '0';
                    const gidMatch = url.match(/[#&]gid=([0-9]+)/);
                    if (gidMatch) gid = gidMatch[1];
                    
                    url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
                    logToConsole('Ingestion Agent', 'Detected standard Google Sheet URL. Auto-converting to CSV export stream...', 'info');
                }

                logToConsole('Ingestion Agent', `Initiating fetch to: ${url.substring(0, 45)}...`, 'running');
                
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP network error: status ${response.status}`);
                
                rawText = await response.text();
            }

            state.rawCsvData = rawText;
            
            logToConsole('Ingestion Agent', 'CSV data ingested successfully. Conducting record tokenization...', 'info');
            
            const recordsList = parseCSV(rawText);
            if (recordsList.length < 2) {
                throw new Error("Dataset is empty or has insufficient rows (requires header row and data rows).");
            }
            
            const headers = recordsList[0].map(h => h.trim());
            state.columns = headers;
            
            const dataRows = recordsList.slice(1);
            state.parsedRecords = dataRows.map(row => {
                const obj = {};
                headers.forEach((header, idx) => {
                    obj[header] = row[idx] !== undefined ? row[idx].trim() : '';
                });
                return obj;
            });
            
            // Profile schema columns
            state.schema = profileSchema(headers, dataRows);
            
            logToConsole('Ingestion Agent', `Schema profiling finalized. Dynamic profiles mapping: ${JSON.stringify(state.schema)}`, 'info');
            
            // Calculate date ranges if date columns exist
            let dateMetaText = 'No Date ranges detected in dataset';
            const dateCols = Object.keys(state.schema).filter(c => state.schema[c] === 'date');
            if (dateCols.length > 0) {
                const datesArray = [];
                state.parsedRecords.forEach(r => {
                    const dStr = r[dateCols[0]];
                    if (isStrictDate(dStr)) {
                        datesArray.push(parseDateString(dStr));
                    }
                });
                if (datesArray.length > 0) {
                    datesArray.sort((a, b) => a - b);
                    const minD = datesArray[0];
                    const maxD = datesArray[datesArray.length - 1];
                    state.dateRange = `${formatDateToString(minD)} to ${formatDateToString(maxD)}`;
                    dateMetaText = `Date range: <strong style="color: #fff;">${state.dateRange}</strong>`;
                }
            }
            
            // Update global Header branding UI values
            el.headerDateSpan.textContent = state.dateRange || 'Dynamic Range';
            if (usingManualFallback) {
                el.headerSheetUrl.parentNode.classList.add('hidden');
            } else {
                el.headerSheetUrl.href = url.replace(/\/export\?format=csv.*/, '').replace(/\/pub\?output=csv.*/, '');
                el.headerSheetUrl.parentNode.classList.remove('hidden');
            }
            el.metaDateRange.classList.remove('hidden');
            el.metaSheetLink.classList.remove('hidden');
            el.globalHeader.classList.remove('hidden');
            
            // Render Table schema Badges
            el.ingestSummaryMeta.innerHTML = `Found <strong style="color: #fff;">${state.parsedRecords.length} records</strong>. ${dateMetaText}`;
            el.schemaProfileGrid.innerHTML = '';
            
            headers.forEach(header => {
                const type = state.schema[header];
                const item = document.createElement('div');
                item.className = 'schema-profile-item';
                item.innerHTML = `
                    <span class="col-name-label" title="${header}">${header}</span>
                    <span class="type-badge ${type}">${type}</span>
                `;
                el.schemaProfileGrid.appendChild(item);
            });
            
            // Render First 3 rows sample table
            el.sampleTableHeaders.innerHTML = '';
            el.sampleTableRows.innerHTML = '';
            
            headers.forEach(h => {
                const th = document.createElement('th');
                th.textContent = h;
                el.sampleTableHeaders.appendChild(th);
            });
            
            dataRows.slice(0, 3).forEach(row => {
                const tr = document.createElement('tr');
                headers.forEach((h, hIdx) => {
                    const td = document.createElement('td');
                    td.textContent = row[hIdx] !== undefined ? row[hIdx] : '';
                    td.title = td.textContent;
                    tr.appendChild(td);
                });
                el.sampleTableRows.appendChild(tr);
            });
            
            // Reveal presentation
            el.schemaPreviewCard.classList.remove('hidden');
            updateAgentStatus('ingestion', 'complete');
            logToConsole('Ingestion Agent', `Table profiles formatted. Awaiting stakeholder confirmation...`, 'success');
            
            // Auto scroll down to complete container
            setTimeout(() => {
                el.schemaPreviewCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 300);
            
        } catch (err) {
            console.error(err);
            updateAgentStatus('ingestion', 'failed');
            logToConsole('Ingestion Agent', `Fetch failed: ${err.message}. Activating Manual Copy-Paste Fallback...`, 'error');
            
            // Reveal manual CSV container
            el.manualCsvContainer.classList.remove('hidden');
            setTimeout(() => {
                el.manualCsvContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 200);

            alert(`Ingestion Warning:\n\nDirect network fetch failed. This is typically due to browser CORS policies (common when loading local html files via file://) or restricted Google Sheets sharing permissions.\n\nWe have revealed a manual 'Paste CSV Raw Data' box below! Please copy-paste your CSV text there and click 'Analyze Data Source' again to proceed seamlessly.`);
        } finally {
            el.btnFetchData.disabled = false;
            el.btnFetchData.style.opacity = '1';
            el.btnFetchData.querySelector('span').textContent = 'Analyze Data Source';
        }
    });

    // Action: Step 1 Confirmation -> Move to Step 2
    el.btnConfirmSchema.addEventListener('click', () => {
        switchToStep(2);
    });

    // Action: Step 2 Back
    el.btnBackToStep1.addEventListener('click', () => {
        switchToStep(1);
    });

    // --- STEP 3: Planner Agent Recommendation fetcher ---
    el.btnSubmitQuestions.addEventListener('click', async () => {
        // Collect question inputs
        const questions = [];
        el.questionInputs.forEach(input => {
            const val = input.value.trim();
            if (val !== "") {
                questions.push(val);
            }
        });
        
        if (questions.length === 0) {
            alert('Please enter at least one business question before formulating recommendations.');
            return;
        }
        
        state.questions = questions;
        
        // Show spinner / load in button
        el.btnSubmitQuestions.disabled = true;
        el.btnSubmitQuestions.style.opacity = '0.6';
        el.btnSubmitQuestions.querySelector('span').textContent = 'Structuring Configs...';
        
        logToConsole('System', 'Activating Visual Planner Agent...', 'info');
        updateAgentStatus('planning', 'running');
        logToConsole('Visual Planner Agent', `Extracting analytical intent from ${questions.length} questions...`, 'running');
        
        try {
            // Pack schema details for prompt
            const schemaText = Object.entries(state.schema)
                .map(([col, type]) => `- Column "${col}": Detected Data-Type [${type}]`)
                .join('\n');
                
            const sampleRowsText = JSON.stringify(state.parsedRecords.slice(0, 3));
            
            const prompt = `You are a professional Data Analyst Agent. Analyze this dataset schema:
Columns:
${schemaText}

Sample Rows:
${sampleRowsText}

For each of the following business questions, recommend the best visual presentation from options: "bar", "line", "donut", "scatter".
Choose appropriate compatible columns for X and Y axes. Important formatting parameters:
1. "xAxisColumn": Must be one of the exact column headers from the dataset. Category, Text, or Date variables fit here.
2. "yAxisColumn": Must be one of the exact column headers representing Numeric values.
3. For scatter charts, ensure both X and Y represent numeric variables if possible.
4. "reasoning": A crisp one-sentence business justification for the choice of chart and axes.

Questions list:
${questions.map((q, idx) => `${idx + 1}. "${q}"`).join('\n')}

Your response must be a valid JSON array matching this exact Javascript structure. Do not include markdown code block formatting (like \`\`\`json). Return ONLY the raw JSON string.

[
  {
    "questionIndex": 0,
    "chartType": "bar" | "line" | "donut" | "scatter",
    "xAxisColumn": "exact_column_name_from_headers",
    "yAxisColumn": "exact_column_name_from_headers",
    "reasoning": "A short, sharp, action-oriented business reason."
  }
]`;

            logToConsole('Visual Planner Agent', 'Invoking Gemini 2.5 Flash node REST parameters...', 'info');
            
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            });
            
            if (!response.ok) throw new Error(`Gemini API connection error: HTTP status ${response.status}`);
            
            const resJson = await response.json();
            const rawJsonText = resJson.candidates[0].content.parts[0].text;
            
            logToConsole('Visual Planner Agent', 'Visual configurations calculated successfully. Parsing array contexts...', 'info');
            
            let recommendedConfigs = JSON.parse(rawJsonText);
            
            // Normalize configs to ensure indices align correctly
            recommendedConfigs = recommendedConfigs.map((cfg, idx) => ({
                questionIndex: idx,
                chartType: cfg.chartType || 'bar',
                xAxisColumn: cfg.xAxisColumn || state.columns[0],
                yAxisColumn: cfg.yAxisColumn || state.columns[1],
                reasoning: cfg.reasoning || 'Suggested presentation for numeric aggregation.'
            }));
            
            state.configs = recommendedConfigs;
            
            // Build card interfaces for confirming
            renderRecommendationCards();
            
            updateAgentStatus('planning', 'complete');
            logToConsole('Visual Planner Agent', 'Configuration cards loaded. Transferring visual control panel to user.', 'success');
            
            switchToStep(3);
            
        } catch (err) {
            console.error(err);
            updateAgentStatus('planning', 'failed');
            logToConsole('Visual Planner Agent', `Failed to construct configurations. Error: ${err.message}`, 'error');
            alert(`Planning Agent Error: ${err.message}`);
        } finally {
            el.btnSubmitQuestions.disabled = false;
            el.btnSubmitQuestions.style.opacity = '1';
            el.btnSubmitQuestions.querySelector('span').textContent = 'Formulate Recommendations';
        }
    });

    // Action: Step 3 Back
    el.btnBackToStep2.addEventListener('click', () => {
        switchToStep(2);
    });

    // --- Dynamic recommendation card builder with active Live Thumbnails ---
    function renderRecommendationCards() {
        el.recommendationsContainer.innerHTML = '';
        
        state.configs.forEach((config, idx) => {
            const questionText = state.questions[idx];
            const card = document.createElement('div');
            card.className = 'recommendation-card';
            card.id = `rec-card-${idx}`;
            
            // Populate selection dropdowns
            const chartOptions = ['bar', 'line', 'donut', 'scatter']
                .map(opt => `<option value="${opt}" ${config.chartType === opt ? 'selected' : ''}>${opt.toUpperCase()}</option>`)
                .join('');
                
            const xOptions = state.columns
                .map(col => `<option value="${col}" ${config.xAxisColumn === col ? 'selected' : ''}>${col}</option>`)
                .join('');
                
            const yOptions = state.columns
                .map(col => `<option value="${col}" ${config.yAxisColumn === col ? 'selected' : ''}>${col}</option>`)
                .join('');
                
            card.innerHTML = `
                <div class="rec-card-details">
                    <h3 class="rec-question-title">
                        <span class="rec-num-badge">${idx + 1}</span>
                        <span>${questionText}</span>
                    </h3>
                    
                    <p class="rec-reasoning-para" id="reasoning-p-${idx}">${config.reasoning}</p>
                    
                    <div class="rec-selectors-row">
                        <div class="field-container">
                            <label class="field-label" style="font-size: 0.65rem;">Chart Format</label>
                            <select class="rec-select-chart" data-idx="${idx}">
                                ${chartOptions}
                            </select>
                        </div>
                        <div class="field-container">
                            <label class="field-label" style="font-size: 0.65rem;">X-Axis Label</label>
                            <select class="rec-select-xaxis" data-idx="${idx}">
                                ${xOptions}
                            </select>
                        </div>
                        <div class="field-container">
                            <label class="field-label" style="font-size: 0.65rem;">Y-Axis Metric</label>
                            <select class="rec-select-yaxis" data-idx="${idx}">
                                ${yOptions}
                            </select>
                        </div>
                    </div>
                </div>
                
                <div class="rec-thumbnail-preview" id="thumb-preview-${idx}">
                    <canvas id="thumb-canvas-${idx}"></canvas>
                    <span class="thumbnail-no-preview" id="thumb-fallback-text-${idx}">Rendering live thumbnail...</span>
                </div>
            `;
            
            el.recommendationsContainer.appendChild(card);
            
            // Draw live thumbnail
            setTimeout(() => {
                drawLiveThumbnail(idx);
            }, 100);
        });
        
        // Attach change listeners to dropdown fields
        document.querySelectorAll('.rec-select-chart').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                state.configs[idx].chartType = e.target.value;
                drawLiveThumbnail(idx);
            });
        });
        
        document.querySelectorAll('.rec-select-xaxis').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                state.configs[idx].xAxisColumn = e.target.value;
                drawLiveThumbnail(idx);
            });
        });

        document.querySelectorAll('.rec-select-yaxis').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                state.configs[idx].yAxisColumn = e.target.value;
                drawLiveThumbnail(idx);
            });
        });
    }

    // --- Dynamic aggregation data builder ---
    function aggregateData(xCol, yCol) {
        const xType = state.schema[xCol];
        
        // Group and reduce rows
        const grouped = {};
        
        state.parsedRecords.forEach(r => {
            const xVal = r[xCol] || 'Unknown';
            // Strip float constraints
            const numString = (r[yCol] || '').replace(/[$,£,€,%]/g, '').replace(/,/g, '').trim();
            const yVal = parseFloat(numString) || 0;
            
            if (!grouped[xVal]) {
                grouped[xVal] = { sum: 0, count: 0 };
            }
            grouped[xVal].sum += yVal;
            grouped[xVal].count += 1;
        });
        
        // Decide Sum vs Avg based on column semantics
        const lowerY = yCol.toLowerCase();
        const useAverage = lowerY.includes('days') || lowerY.includes('time') || lowerY.includes('duration') || 
                           lowerY.includes('lead') || lowerY.includes('transit') || lowerY.includes('price') || 
                           lowerY.includes('rate') || lowerY.includes('avg') || lowerY.includes('average');
                           
        let series = Object.entries(grouped).map(([x, data]) => {
            return {
                x: x,
                y: useAverage ? (data.sum / data.count) : data.sum
            };
        });
        
        // Sort keys logically
        if (xType === 'date') {
            series = series.filter(item => isStrictDate(item.x));
            series.sort((a, b) => parseDateString(a.x) - parseDateString(b.x));
        } else if (xType === 'number') {
            series.sort((a, b) => parseFloat(a.x) - parseFloat(b.x));
        } else {
            // Sort categories by volume desc
            series.sort((a, b) => b.y - a.y);
        }
        
        return {
            labels: series.map(s => s.x),
            data: series.map(s => s.y),
            metricLabel: useAverage ? `Avg. of ${yCol}` : `Sum of ${yCol}`
        };
    }

    // --- Live Thumbnail Drawing (using miniature Chart.js) ---
    const activeThumbnails = {};
    
    function drawLiveThumbnail(idx) {
        const config = state.configs[idx];
        const canvas = document.getElementById(`thumb-canvas-${idx}`);
        const fallbackText = document.getElementById(`thumb-fallback-text-${idx}`);
        
        if (!canvas) return;
        
        // Destroy existing
        if (activeThumbnails[idx]) {
            activeThumbnails[idx].destroy();
        }
        
        try {
            const agg = aggregateData(config.xAxisColumn, config.yAxisColumn);
            
            // Truncate to maximum 6 elements in thumbnail to look neat
            const maxElements = 6;
            const labels = agg.labels.slice(0, maxElements);
            const data = agg.data.slice(0, maxElements);
            
            fallbackText.classList.add('hidden');
            canvas.style.display = 'block';
            
            const ctx = canvas.getContext('2d');
            
            // Standard dynamic gradient fills
            let fillBg = 'rgba(99, 102, 241, 0.4)';
            let strokeColor = '#6366f1';
            
            if (config.chartType === 'line') {
                fillBg = 'rgba(20, 184, 166, 0.05)';
                strokeColor = '#14b8a6';
            } else if (config.chartType === 'donut') {
                fillBg = ['#6366f1', '#8b5cf6', '#14b8a6', '#ec4899', '#f59e0b', '#10b981'];
                strokeColor = 'transparent';
            }
            
            const chartCfg = {
                type: config.chartType === 'donut' ? 'doughnut' : (config.chartType === 'scatter' ? 'scatter' : config.chartType),
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: fillBg,
                        borderColor: strokeColor,
                        borderWidth: 1.5,
                        pointRadius: config.chartType === 'line' ? 2 : 0,
                        fill: config.chartType === 'line'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    },
                    scales: config.chartType === 'donut' ? {} : {
                        x: { display: false },
                        y: { display: false }
                    },
                    animation: { duration: 300 }
                }
            };
            
            activeThumbnails[idx] = new Chart(ctx, chartCfg);
            
        } catch (err) {
            console.warn(err);
            canvas.style.display = 'none';
            fallbackText.classList.remove('hidden');
            fallbackText.textContent = 'Mapping Error';
        }
    }

    // --- STEP 4 & 5 Execution Panel Orchestrator ---
    el.btnConfirmConfigs.addEventListener('click', async () => {
        switchToStep(4);
        runDashboardPipeline();
    });

    async function runDashboardPipeline() {
        resetAllAgentStatuses();
        el.chartsGalleryGrid.innerHTML = '';
        el.insightsStreamList.innerHTML = `
            <li class="insight-placeholder-row" id="insight-loader-placeholder">
                <div class="spinner-mini"></div>
                <span class="placeholder-text">Waiting for rendering and metrics aggregation to execute Insights streaming...</span>
            </li>
        `;
        
        // 1. Data Ingest Completion State
        updateAgentStatus('ingestion', 'complete');
        logToConsole('Ingestion Agent', 'Records buffered in local context.', 'success');
        
        // 2. Planning State
        updateAgentStatus('planning', 'complete');
        logToConsole('Visual Planner Agent', `Visual blueprints logged and locked: ${JSON.stringify(state.configs)}`, 'success');
        
        // 3. Execution KPI Agent
        updateAgentStatus('kpis', 'running');
        logToConsole('Analytical KPI Agent', 'Evaluating dynamic columns to extract metric headers...', 'running');
        
        await new Promise(resolve => setTimeout(resolve, 800));
        
        let revenueCol = '', ordersCol = '', deliveryCol = '';
        
        // Locate column match using semantic regex arrays
        const revKeys = [/revenue/i, /sales/i, /amount/i, /total/i, /price/i];
        const ordKeys = [/order/i, /id/i, /transaction/i];
        const delKeys = [/delivery/i, /shipping/i, /days/i, /transit/i, /lead/i];
        
        state.columns.forEach(col => {
            const type = state.schema[col];
            if (type === 'number') {
                if (!revenueCol && revKeys.some(r => r.test(col))) revenueCol = col;
                if (!deliveryCol && delKeys.some(r => r.test(col))) deliveryCol = col;
            }
            if (!ordersCol && ordKeys.some(r => r.test(col))) ordersCol = col;
        });
        
        // Perform KPI calculations
        let totalRevenue = 0, totalOrders = state.parsedRecords.length, avgDelivery = 0;
        
        if (revenueCol) {
            state.parsedRecords.forEach(r => {
                const clean = (r[revenueCol] || '').replace(/[$,£,€,%]/g, '').replace(/,/g, '').trim();
                totalRevenue += parseFloat(clean) || 0;
            });
            el.kpiRevenue.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalRevenue);
            el.kpiSrcRevenue.textContent = `Column: ${revenueCol}`;
        } else {
            el.kpiRevenue.textContent = 'N/A';
            el.kpiSrcRevenue.textContent = 'Revenue Column not found';
            logToConsole('Analytical KPI Agent', 'Revenue semantic tags missing in schema profiles.', 'info');
        }
        
        if (ordersCol) {
            // Count unique or count rows
            const uniqueOrders = new Set(state.parsedRecords.map(r => r[ordersCol]).filter(v => v !== ''));
            totalOrders = uniqueOrders.size > 0 ? uniqueOrders.size : state.parsedRecords.length;
            el.kpiOrders.textContent = new Intl.NumberFormat().format(totalOrders);
            el.kpiSrcOrders.textContent = `Column: ${ordersCol}`;
        } else {
            el.kpiOrders.textContent = new Intl.NumberFormat().format(totalOrders);
            el.kpiSrcOrders.textContent = 'Raw Row Count (IDs missing)';
        }
        
        if (deliveryCol) {
            let filled = 0, sum = 0;
            state.parsedRecords.forEach(r => {
                const clean = (r[deliveryCol] || '').replace(/[$,£,€,%]/g, '').replace(/,/g, '').trim();
                const val = parseFloat(clean);
                if (!isNaN(val)) {
                    sum += val;
                    filled++;
                }
            });
            avgDelivery = filled > 0 ? (sum / filled) : 0;
            el.kpiDelivery.textContent = `${avgDelivery.toFixed(1)} days`;
            el.kpiSrcDelivery.textContent = `Column: ${deliveryCol}`;
        } else {
            el.kpiDelivery.textContent = 'N/A';
            el.kpiSrcDelivery.textContent = 'Transit column not found';
            logToConsole('Analytical KPI Agent', 'Transit/shipping semantic tags missing in schema profiles.', 'info');
        }
        
        updateAgentStatus('kpis', 'complete');
        logToConsole('Analytical KPI Agent', `Total calculated Metrics: Revenue=${totalRevenue.toFixed(2)}, Orders=${totalOrders}, AvgTransit=${avgDelivery.toFixed(2)}`, 'success');
        
        // 4. Visual Rendering Agent
        updateAgentStatus('rendering', 'running');
        logToConsole('Visualization Agent', 'Injecting chart canvases and mapping aggregate calculations...', 'running');
        
        for (let i = 0; i < state.configs.length; i++) {
            const config = state.configs[i];
            const questionText = state.questions[i];
            
            logToConsole('Visualization Agent', `Rendering Question ${i+1} visual canvas...`, 'info');
            
            // Build panel layout
            const panel = document.createElement('div');
            panel.className = 'glass-card chart-panel-card';
            panel.innerHTML = `
                <div class="chart-header">
                    <span class="chart-title font-bold">${questionText}</span>
                    <span class="type-badge ${state.schema[config.xAxisColumn]}" style="font-size: 0.6rem;">By: ${config.xAxisColumn}</span>
                </div>
                <div class="chart-visual-wrapper">
                    <canvas id="dashboard-chart-canvas-${i}"></canvas>
                    <div class="chart-spinner-container" id="chart-loader-${i}">
                        <div class="spinner-mini"></div>
                        <span class="text-xs color-secondary font-medium">Aggregating series...</span>
                    </div>
                </div>
            `;
            el.chartsGalleryGrid.appendChild(panel);
            
            await new Promise(resolve => setTimeout(resolve, 400));
            
            // Aggregate and plot Chart.js
            drawDashboardChart(i);
        }
        
        updateAgentStatus('rendering', 'complete');
        logToConsole('Visualization Agent', 'All questions fully rendered inside responsive dashboard frameworks.', 'success');
        
        // 5. Stream Strategic Insights Agent
        updateAgentStatus('insights', 'running');
        logToConsole('Strategic Insight Agent', 'Collating data snapshots to package prompt contexts...', 'running');
        
        await runInsightsStreaming();
    }

    // --- Draw beautiful large charts for Dashboard ---
    function drawDashboardChart(idx) {
        const config = state.configs[idx];
        const canvas = document.getElementById(`dashboard-chart-canvas-${idx}`);
        const loader = document.getElementById(`chart-loader-${idx}`);
        
        if (!canvas) return;
        
        try {
            const agg = aggregateData(config.xAxisColumn, config.yAxisColumn);
            
            // Remove Loader indicator
            if (loader) loader.classList.add('hidden');
            
            const ctx = canvas.getContext('2d');
            
            // Custom Neon Gradients mapping for lines/bars
            const gradientIndigo = ctx.createLinearGradient(0, 0, 0, 240);
            gradientIndigo.addColorStop(0, 'rgba(99, 102, 241, 0.45)');
            gradientIndigo.addColorStop(1, 'rgba(99, 102, 241, 0.01)');
            
            const gradientTeal = ctx.createLinearGradient(0, 0, 0, 240);
            gradientTeal.addColorStop(0, 'rgba(20, 184, 166, 0.45)');
            gradientTeal.addColorStop(1, 'rgba(20, 184, 166, 0.01)');

            let fillBg = gradientIndigo;
            let strokeColor = '#6366f1';
            
            if (config.chartType === 'line') {
                fillBg = gradientTeal;
                strokeColor = '#14b8a6';
            } else if (config.chartType === 'donut') {
                fillBg = [
                    'rgba(99, 102, 241, 0.8)',
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(20, 184, 166, 0.8)',
                    'rgba(236, 72, 153, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(99, 102, 241, 0.5)',
                    'rgba(20, 184, 166, 0.5)'
                ];
                strokeColor = '#1e1b4b'; // Border gaps
            }
            
            const chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: config.chartType === 'donut',
                        position: 'right',
                        labels: {
                            color: '#94a3b8',
                            font: { family: 'Outfit', size: 10 }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#0c0a0f',
                        titleColor: '#fff',
                        bodyColor: '#e2e8f0',
                        titleFont: { family: 'Outfit', weight: 'bold' },
                        bodyFont: { family: 'Plus Jakarta Sans' },
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1
                    }
                },
                scales: config.chartType === 'donut' ? {} : {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.02)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Outfit', size: 10 }
                        }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.02)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Outfit', size: 10 }
                        }
                    }
                }
            };
            
            const chartCfg = {
                type: config.chartType === 'donut' ? 'doughnut' : (config.chartType === 'scatter' ? 'scatter' : config.chartType),
                data: {
                    labels: agg.labels,
                    datasets: [{
                        label: agg.metricLabel,
                        data: agg.data,
                        backgroundColor: fillBg,
                        borderColor: strokeColor,
                        borderWidth: config.chartType === 'line' ? 2.5 : 1,
                        fill: config.chartType === 'line',
                        tension: config.chartType === 'line' ? 0.35 : 0
                    }]
                },
                options: chartOptions
            };
            
            const newChart = new Chart(ctx, chartCfg);
            state.charts.push(newChart);
            
        } catch (err) {
            console.error(err);
            if (loader) {
                loader.innerHTML = `<span class="text-xs text-rose-400 font-bold" style="color:#f43f5e;">Rendering Error</span>`;
            }
        }
    }

    // --- Stream Strategic Insights from Gemini 2.5 Flash ---
    async function runInsightsStreaming() {
        el.insightsStreamList.innerHTML = '';
        logToConsole('Strategic Insight Agent', 'Contacting Gemini Streaming SSE Channel API...', 'running');
        
        try {
            // Aggregate summaries for prompt content
            const summariesText = state.configs.map((config, idx) => {
                const agg = aggregateData(config.xAxisColumn, config.yAxisColumn);
                // Package first 8 items
                const sliceLength = 8;
                const itemsText = agg.labels.slice(0, sliceLength)
                    .map((lbl, id) => `  * ${lbl}: ${agg.data[id].toFixed(2)}`)
                    .join('\n');
                    
                return `Question "${state.questions[idx]}" (Analyzed "${config.yAxisColumn}" aggregated by "${config.xAxisColumn}"):\n${itemsText}`;
            }).join('\n\n');
            
            const prompt = `You are a world-class strategic business growth advisor. Analyze this summary of e-commerce data:
KPIs:
- Total Orders: ${state.parsedRecords.length}
- Dynamic Calculations: (Check charts for sums/averages)

Aggregated Chart Summaries:
${summariesText}

Generate exactly up to 5 strategic insights tailored for the business founder.

Strict Rules:
1. Keep each insight bullet point under 35 words.
2. Must be highly actionable, outlining a specific problem and a direct business recommendation.
3. Each insight must explicitly reference at least one precise number or metric from the analyzed summaries.
4. Write for business leaders (no developer, SQL, Chart.js, or configuration jargon).
5. Format as clean bullet points. Return only the bullet points.`;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${state.apiKey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });
            
            if (!response.ok) throw new Error(`Gemini streaming connection error: HTTP status ${response.status}`);
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";
            let fullText = "";
            
            // Build 5 bullet containers to type content into dynamically
            const bulletsElements = [];
            
            function ensureBulletRow(bulletIndex) {
                if (!bulletsElements[bulletIndex]) {
                    const li = document.createElement('li');
                    li.className = 'insight-row';
                    li.style.opacity = '0';
                    li.style.transform = 'translateX(-10px)';
                    li.innerHTML = `
                        <span class="insight-bullet-dot">•</span>
                        <div class="insight-text-wrapper"><span class="bullet-content-text"></span><span class="typing-caret"></span></div>
                    `;
                    el.insightsStreamList.appendChild(li);
                    
                    bulletsElements[bulletIndex] = {
                        el: li,
                        textSpan: li.querySelector('.bullet-content-text'),
                        caret: li.querySelector('.typing-caret'),
                        typedLength: 0,
                        targetText: ""
                    };
                    
                    // Animate entry
                    setTimeout(() => {
                        li.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                        li.style.opacity = '1';
                        li.style.transform = 'translateX(0)';
                    }, 50);
                }
                return bulletsElements[bulletIndex];
            }
            
            // Active typewriter processing queue
            let typingInterval = null;
            
            function triggerTypewriter() {
                if (typingInterval) return;
                
                typingInterval = setInterval(() => {
                    let activeTyping = false;
                    
                    bulletsElements.forEach(bullet => {
                        if (bullet.typedLength < bullet.targetText.length) {
                            activeTyping = true;
                            // Append next character
                            const nextChar = bullet.targetText.charAt(bullet.typedLength);
                            bullet.textSpan.textContent += nextChar;
                            bullet.typedLength++;
                        } else {
                            // Hide typewriter caret once completed
                            if (bullet.caret) {
                                bullet.caret.style.display = 'none';
                            }
                        }
                    });
                    
                    if (!activeTyping && streamEnded) {
                        clearInterval(typingInterval);
                        typingInterval = null;
                    }
                }, 18); // Fast typing pace
            }
            
            let streamEnded = false;
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                
                // Parse chunks using dual-engine parser
                let pos;
                while ((pos = buffer.indexOf('}\n,')) >= 0 || (pos = buffer.indexOf('}\r\n,')) >= 0 || (pos = buffer.indexOf('}\n]')) >= 0 || (pos = buffer.indexOf('}\r\n]')) >= 0) {
                    const cutoff = buffer.indexOf('}', pos) + 1;
                    const rawChunk = buffer.slice(0, cutoff).trim();
                    buffer = buffer.slice(cutoff);
                    
                    // Clean chunk boundaries
                    let clean = rawChunk;
                    if (clean.startsWith('[')) clean = clean.slice(1);
                    if (clean.startsWith(',')) clean = clean.slice(1);
                    if (clean.endsWith(']')) clean = clean.slice(0, -1);
                    clean = clean.trim();
                    
                    try {
                        const parsed = JSON.parse(clean);
                        const newText = parsed.candidates[0].content.parts[0].text;
                        fullText += newText;
                        distributeBullets(fullText);
                    } catch (e) {
                        // Regex fallback
                        const matches = clean.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
                        for (const match of matches) {
                            let unescaped = match[1]
                                .replace(/\\n/g, '\n')
                                .replace(/\\t/g, '\t')
                                .replace(/\\"/g, '"')
                                .replace(/\\\\/g, '\\');
                            fullText += unescaped;
                            distributeBullets(fullText);
                        }
                    }
                }
            }
            
            // Finalize remaining stream buffer
            streamEnded = true;
            if (buffer.trim() !== "") {
                const clean = buffer.trim();
                const matches = clean.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
                for (const match of matches) {
                    let unescaped = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                    fullText += unescaped;
                }
                distributeBullets(fullText);
            }
            
            // Fallback: If no bullets were successfully generated via chunks
            if (bulletsElements.length === 0 && fullText.trim() !== "") {
                distributeBullets(fullText);
            }
            
            triggerTypewriter();
            
            function distributeBullets(text) {
                // Split text into lines, matching typical bullet points (•, *, -, numbers)
                const lines = text.split('\n')
                    .map(l => l.replace(/^[•\*\-\s\d\.]+/g, '').trim())
                    .filter(l => l !== "");
                    
                lines.forEach((line, bulletIdx) => {
                    if (bulletIdx < 5) {
                        const bulletObj = ensureBulletRow(bulletIdx);
                        // Convert double asterisks to strong styles dynamically in targeted text
                        const boldText = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                        bulletObj.targetText = boldText;
                        triggerTypewriter();
                    }
                });
            }
            
            updateAgentStatus('insights', 'complete');
            logToConsole('Strategic Insight Agent', 'Action points streaming complete.', 'success');
            
        } catch (err) {
            console.error(err);
            updateAgentStatus('insights', 'failed');
            logToConsole('Strategic Insight Agent', `Streaming failed. Error: ${err.message}`, 'error');
            
            el.insightsStreamList.innerHTML = `
                <li class="insight-placeholder-row">
                    <span class="text-rose-500 font-bold" style="color: #f43f5e;">Failed to stream strategic insights. Check API Key validity and Sheet published CSV configurations.</span>
                </li>
            `;
        }
    }

    // --- REFRESH mechanics (Action: Header Refresh button) ---
    el.headerRefreshBtn.addEventListener('click', async () => {
        // Reruns the entire agent pipeline from scratch
        logToConsole('System', 'Refresh trigger received. Rerunning entire operations pipeline...', 'info');
        
        // Destroy existing Chart.js instances to avoid canvas duplicates
        state.charts.forEach(chart => chart.destroy());
        state.charts = [];
        
        switchToStep(4);
        runDashboardPipeline();
    });

    // Make step switching and testing easier
    window.dataAnalystAgent = {
        state: state,
        switchToStep: switchToStep,
        logToConsole: logToConsole,
        updateAgentStatus: updateAgentStatus
    };
});
