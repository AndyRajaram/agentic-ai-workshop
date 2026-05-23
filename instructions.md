# ShopEasy Data Analyst Agent — Operations & Engineering Instructions

This document outlines the detailed system configurations, operational rules, API interactions, and user interface policies for the multi-agent dashboard.

---

## 1. System-Wide Constraints & Standards

### A. Date Parsing & Representation
* **Strict Format**: `DD-MM-YYYY`.
* **Behavior**: 
  * Any date column parsed by the Ingestion Agent must use this regex pattern: `^\d{1,2}-\d{1,2}-\d{4}$`.
  * Display all dates in the UI matching this format exactly. 
  * For calculations (e.g., date ranges, chart sorting), internal parsing should convert this format to javascript dates, sort, and reconstruct using strict zero-padded strings: `DD-MM-YYYY`.

### B. Gemini 2.5 Flash API Specification
* **Model ID**: `gemini-2.5-flash`
* **Direct REST Endpoints**:
  * **Non-Streaming (Recommendations)**:
    `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={API_KEY}`
  * **Streaming (Insights)**:
    `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key={API_KEY}`
* **Security**: API key input field provided to the user, saved locally to `localStorage` for seamless recurring usage without server side leaks.

---

## 2. Multi-Agent Pipeline Orchestration

The application executes in a strictly coordinated client-side lifecycle. State and execution logs are posted live to the **Agent Status Panel** and **Agent Operations Console**.

### Phase 1: Exploration and Ingestion (Step 1 & Step 2)
1. **User Action**: Enters Google Sheet CSV URL and Gemini API Key.
2. **Ingestion Agent**: Fetches CSV, parses structure, infers types, and validates dates.
3. **Schema Presentation**: Renders the 3-row sample table and schema details.
4. **User Action**: Confirms schema and enters up to 5 business questions.

### Phase 2: Cognitive Planning (Step 3)
1. **Visualization & Planning Agent**:
   * Evaluates each input question against the extracted schema.
   * Prompts Gemini to return a structured JSON response specifying the suggested chart type, X-axis column, Y-axis column, and rationale.
   * Renders the recommendation cards.
2. **Interactive Preview**:
   * Displays editable configuration fields (dropdowns) for the user.
   * Runs a lightweight thumbnail visual preview that updates dynamically on any change.
3. **User Action**: Clicks "Confirm Configurations" to lock in settings.

### Phase 3: Analytical Execution & Rendering (Step 4 & Step 5)
1. **Status Update**: Status Panel updates the Data Ingestion and Planning states to `Complete`. Execution Agent switches to `Running`.
2. **Execution & KPI Agent**:
   * Computes dynamic global indicators (Revenue, Orders, Delivery Times).
   * Renders metric cards on the dashboard immediately.
   * Logs activity timestamps to the log terminal.
3. **Visualization Agent**:
   * Runs in sequence to transform, sort, group, and plot charts one-by-one.
   * Each completed chart transitions its state indicator in the Status Panel.
4. **Insight Generator Agent**:
   * Takes the center stage once all charts are plotted.
   * Sends a structured summary of the data and findings to Gemini.
   * Streams strategic recommendations bullet by bullet in real-time.
   * Switches its Status state to `Complete`.

---

## 3. Inferred Schema & Type Rules

The system must automatically classify CSV columns without manual hardcoding:
* **Date**: If >80% of non-empty values match the format `DD-MM-YYYY`.
* **Number**: If >90% of non-empty values can be parsed as a float (ignoring currency symbols `$, £, €` and commas).
* **Category**: If the column is text, has fewer than 15 unique values, and forms groups.
* **Text**: Standard textual data (highly unique sentences or IDs).

---

## 4. LLM Prompts & Structured Instructions

### A. Recommendation Prompt Structure
```json
{
  "contents": [{
    "parts": [{
      "text": "You are a professional Data Analyst Agent. Analyze this dataset schema:\nColumns: {SCHEMA_DETAILS}\nSample Rows: {SAMPLE_ROWS}\n\nFor each of the following business questions, recommend the best visual presentation.\nQuestions:\n1. {QUESTION_1}\n...\n\nYour output must be a valid JSON array matching this structure. Do not include markdown code block formatting (like ```json). Return ONLY the raw JSON string.\n[\n  {\n    \"questionIndex\": 0,\n    \"chartType\": \"bar\" | \"line\" | \"donut\" | \"scatter\",\n    \"xAxisColumn\": \"exact_column_name\",\n    \"yAxisColumn\": \"exact_column_name\",\n    \"reasoning\": \"Crisp one-sentence business reason explaining why this chart and axes suit the question.\"\n  }\n]"
    }]
  }]
}
```

### B. Strategic Insight Streaming Prompt Structure
```json
{
  "contents": [{
    "parts": [{
      "text": "You are a world-class strategic business growth advisor. Analyze this summary of e-commerce data:\nKPIs: {KPI_DATA}\nAggregated Chart Summaries:\n{CHART_SUMMARIES}\n\nGenerate exactly up to 5 strategic insights tailored for the business founder.\n\nStrict Rules:\n1. Keep each insight under 25 words.\n2. Must be highly actionable, outlining a specific problem and a direct business recommendation.\n3. Each insight must explicitly reference at least one precise number or metric from the analyzed summaries.\n4. Write for business leaders (no developer, SQL, or chart configuration jargon).\n5. Format as clean bullet points. Return only the bullet points."
    }]
  }]
}
```

---

## 5. UI/UX Tokens & Design Parameters

* **Dark Glassmorphism**: Cards feature `rgba(10, 10, 16, 0.4)` background, `rgba(255, 255, 255, 0.08)` border, and a strong backdrop blur of `20px`.
* **Glowing Borders**: Add subtle gradients on focus/hover that glow with Indigo (`#6366f1`), Violet (`#8b5cf6`), or Teal (`#14b8a6`).
* **Micro-Animations**: Transitions must be smooth (`0.3s cubic-bezier(0.4, 0, 0.2, 1)`).
* **Visual Integrity**: Active live indicator in the header, custom terminal scrolling, and polished step-to-step sliding cards.
