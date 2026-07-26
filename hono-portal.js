/* HONO Sales OS — client-side engine for the public portal.
   Runs entirely in the browser: no server, no accounts. Data persists in
   localStorage and can be exported/imported to share across the team.
   Requires (loaded per page from cdnjs): XLSX (SheetJS) and JSZip. */
(function () {
  "use strict";

  // ---------- storage ----------
  const LS = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  };
  function dl(filename, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function dlText(filename, text, type) {
    dl(filename, new Blob([text], { type: type || "application/json" }));
  }

  // ---------- text matching ----------
  const STOP = new Set(("the a an of to and or for in on at is are be with as by from your our you we do does " +
    "can will please provide describe list what how which").split(" "));
  function tokens(s) {
    return (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => t.length > 1 && !STOP.has(t));
  }
  function counter(arr) { const c = {}; for (const t of arr) c[t] = (c[t] || 0) + 1; return c; }
  function cosine(a, b) {
    const ca = counter(a), cb = counter(b);
    let num = 0; for (const t in ca) if (cb[t]) num += ca[t] * cb[t];
    const da = Math.sqrt(Object.values(ca).reduce((s, v) => s + v * v, 0));
    const db = Math.sqrt(Object.values(cb).reduce((s, v) => s + v * v, 0));
    return da && db ? num / (da * db) : 0;
  }

  // ---------- RFP answer bank ----------
  const RFP = {
    key: "hono_rfp_bank",
    bank() { return LS.get(this.key, []); },
    save(b) { LS.set(this.key, b); },
    summary() {
      const b = this.bank();
      const tags = [...new Set(b.flatMap(e => e.tags || []))].sort();
      return { count: b.length, tags };
    },
    // rows: array-of-arrays from a sheet; returns {added}
    importRows(rows, source, tag) {
      if (!rows.length) return { added: 0 };
      const header = (rows[0] || []).map(h => String(h || "").toLowerCase());
      let qcol = header.findIndex(h => h.includes("question") || h.includes("requirement"));
      let acol = header.findIndex(h => h.includes("answer") || h.includes("response") || h.includes("reply"));
      if (qcol < 0) qcol = 0; if (acol < 0) acol = 1;
      const bank = this.bank();
      const seen = new Set(bank.map(e => e.question.trim().toLowerCase()));
      let added = 0;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (!r) continue;
        const q = r[qcol], a = r[acol];
        if (q && a && !seen.has(String(q).trim().toLowerCase())) {
          bank.push({ question: String(q).trim(), answer: String(a).trim(), source: source || "import", tags: tag ? [tag] : [] });
          seen.add(String(q).trim().toLowerCase()); added++;
        }
      }
      this.save(bank);
      return { added };
    },
    best(question) {
      const qt = tokens(question); let best = null, score = 0;
      for (const e of this.bank()) { const s = cosine(qt, tokens(e.question)); if (s > score) { best = e; score = s; } }
      return { best, score: Math.round(score * 1000) / 1000 };
    },
    autofill(questions, threshold) {
      const rows = []; let filled = 0, review = 0;
      for (const q of questions) {
        const { best, score } = this.best(q);
        if (best && score >= threshold) { rows.push({ question: q, answer: best.answer, confidence: score, source: best.source, status: "filled" }); filled++; }
        else { rows.push({ question: q, answer: best ? best.answer : "", confidence: score, source: best ? best.source : "", status: "review" }); review++; }
      }
      return { rows, filled, review, total: rows.length };
    },
  };

  // ---------- Sales Assets catalog ----------
  const ASSETS = {
    key: "hono_assets",
    all() { return LS.get(this.key, []); },
    save(a) { LS.set(this.key, a); },
    add(item) { const a = this.all(); a.push(Object.assign({ added: new Date().toISOString().slice(0, 16).replace("T", " ") }, item)); this.save(a); },
    remove(idx) { const a = this.all(); a.splice(idx, 1); this.save(a); },
  };

  // ---------- xlsx helpers (SheetJS) ----------
  async function readSheetRows(file) {
    const buf = await file.arrayBuffer();
    if (file.name.toLowerCase().endsWith(".csv")) {
      const text = new TextDecoder().decode(buf);
      return text.split(/\r?\n/).filter(l => l.length).map(l => l.split(","));
    }
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  }
  function writeXlsx(filename, aoa) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auto-filled RFP");
    XLSX.writeFile(wb, filename);
  }

  // ---------- DOCX proposal patcher (JS port of patch_proposal.py) ----------
  function ordinal(day) { const d = +day; if (d >= 11 && d <= 13) return "th"; return ({ 1: "st", 2: "nd", 3: "rd" })[d % 10] || "th"; }
  function fmtNum(n) { return Math.round(n).toLocaleString("en-US"); }
  function monthNum(name) {
    return ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(String(name).toLowerCase()) + 1;
  }
  // conservative run-merge: join adjacent simple <w:t> runs with identical rPr
  function mergeRuns(xml) {
    return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (para) => {
      const runRe = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
      const runs = para.match(runRe); if (!runs || runs.length < 2) return para;
      const complex = /<w:(br|tab|drawing|pict|fldChar|instrText|sym|cr|object|noBreakHyphen)|<mc:/;
      const rprOf = r => (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
      const simple = r => !complex.test(r) && /<w:t[ >]/.test(r) &&
        r.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, "").replace(/^<w:r(?:\s[^>]*)?>/, "").replace(/<\/w:r>$/, "").replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, "").trim() === "";
      const textOf = r => (r.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, "")).join("");
      const out = []; let i = 0;
      while (i < runs.length) {
        if (simple(runs[i])) {
          const props = rprOf(runs[i]); let text = textOf(runs[i]); let j = i + 1;
          while (j < runs.length && simple(runs[j]) && rprOf(runs[j]) === props) { text += textOf(runs[j]); j++; }
          if (j > i + 1) { out.push("<w:r>" + props + '<w:t xml:space="preserve">' + text + "</w:t></w:r>"); i = j; continue; }
        }
        out.push(runs[i]); i++;
      }
      let k = 0; return para.replace(runRe, () => out[k++]);
    });
  }
  function countryVolume(cs) { return cs.map(c => `${c.name}: ${c.count}`).join(" · "); }
  function countryProse(cs) { const p = cs.map(c => `${c.name} (${c.count})`); return p.length === 1 ? p[0] : p.slice(0, -1).join(", ") + ", and " + p[p.length - 1]; }

  function patchXml(xml, c) {
    const log = [], err = [];
    const rep = (old, nw, label) => { if (xml.indexOf(old) < 0) { err.push("NOT FOUND: " + label); } else { xml = xml.split(old).join(nw); log.push("✓ " + label); } };
    rep("Singapore Institute of Management", c.client_name, "Client name");
    rep("Dear Keerthana,", "Dear " + c.contact_name + ",", "Salutation");
    // proposal ID
    const d = c.date;
    const newId = `${c.client_code}-${c.scope.toUpperCase()}-${String(d.day).padStart(2, "0")}07${d.year}`;
    let idDone = false;
    for (const oid of ["SIM-FULLSUITE-01072026", "SIM-PAYROLL-01072026"]) if (xml.indexOf(oid) >= 0) { xml = xml.split(oid).join(newId); log.push("✓ Proposal ID"); idDone = true; break; }
    if (!idDone) err.push("Proposal ID: no known old ID");
    // cover date superscript
    const dateRe = /(<w:t xml:space="preserve"> )\d+?(<\/w:t><\/w:r><w:r><w:rPr>(?:(?!<\/w:rPr>)[\s\S])*?<w:vertAlign w:val="superscript"\/>(?:(?!<\/w:rPr>)[\s\S])*?<\/w:rPr><w:t>)\w+(<\/w:t><\/w:r><w:r><w:rPr>(?:(?!<\/w:rPr>)[\s\S])*?<\/w:rPr><w:t xml:space="preserve"> )\w+ \d{4}/;
    const suf = c.suffix || ordinal(d.day);
    if (dateRe.test(xml)) { xml = xml.replace(dateRe, (m, a, b, e) => a + d.day + b + suf + e + `${d.month} ${d.year}`); log.push("✓ Cover date"); }
    else err.push("Cover date: pattern not matched");
    // headcount
    const total = c.headcount.total, ts = fmtNum(total), n = c.headcount.countries.length;
    xml = xml.replace(/\b(1,377|527|1,696) Employees\b/g, ts + " Employees");
    xml = xml.replace(/\b(1,377|527|1,696) employees\b/g, ts + " employees");
    log.push("✓ Headcount");
    // country breakdown
    const nb = countryVolume(c.headcount.countries);
    const bdRe = /Singapore: \d+ ·[^<]{0,400}(?:Philippines: \d+|Malaysia: \d+)/;
    if (bdRe.test(xml)) { xml = xml.replace(bdRe, nb); log.push("✓ Country breakdown"); } else err.push("Country breakdown: not matched");
    // proposal note SIM strip
    const simRe = / — \d+ Full-Time,? \d+ Part-Time,? and \d+ Contingent employees in [\d,]+ employees across \d+ countries: [^<]+\./;
    const prose = ` across ${n} countries: ${countryProse(c.headcount.countries)}.`;
    if (simRe.test(xml)) { xml = xml.replace(simRe, prose); log.push("✓ Stripped SIM breakdown"); }
    else { const partial = / across \d+ countries: [^<]+\./; if (partial.test(xml)) { xml = xml.replace(partial, prose); log.push("✓ Note country list"); } else err.push("Proposal Note: not matched"); }
    xml = xml.replace(/in [\d,]+ employees across \d+ countries: [^<]+\./, `in ${ts} employees across ${n} countries: ${countryProse(c.headcount.countries)}.`);
    // pricing
    const pepm = c.pricing.pepm, cur = c.pricing.currency, annual = total * pepm * 12, impl = Math.round(annual * 0.75);
    const as = fmtNum(annual), is = fmtNum(impl);
    let annDone = false;
    for (const oa of ["132,192", "50,592", "162,816", "99,144"]) if (xml.indexOf(">" + oa + " </w:t>") >= 0) { xml = xml.split(">" + oa + " </w:t>").join(">" + as + " </w:t>"); log.push("✓ Annual fee"); annDone = true; break; }
    if (!annDone) err.push("Annual fee: not found (expected " + as + ")");
    xml = xml.replace(/[\d,]+ employees x [A-Z]+ \d+ x 12 months/, `${ts} employees x ${cur} ${pepm} x 12 months`);
    let implDone = false;
    for (const oi of ["99,144", "37,944", "122,112", "74,358"]) { if (xml.indexOf(">" + oi + " </w:t>") >= 0) { xml = xml.replace(">" + oi + " </w:t>", ">" + is + " </w:t>"); log.push("✓ Impl fee"); implDone = true; break; } else if (xml.indexOf(oi) >= 0) { xml = xml.replace(oi, is); log.push("✓ Impl fee"); implDone = true; break; } }
    if (!implDone) err.push("Impl fee: not found (expected " + is + ")");
    // modules
    const m = c.modules || {};
    for (const mod of (m.remove || [])) {
      const re = new RegExp("<w:p [^>]+>(?:(?!<w:p )[\\s\\S])*?" + mod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?</w:p>");
      if (re.test(xml)) { xml = xml.replace(re, ""); log.push("✓ Removed " + mod); } else err.push("Remove: " + mod + " not found");
    }
    if (m.defer_attendance) { const o = "• Leave Management </w:t>"; if (xml.indexOf(o) >= 0) { xml = xml.replace(o, "• Leave Management (Note: Attendance &amp; Overtime deferred to future phase) </w:t>"); log.push("✓ Attendance deferred"); } }
    else { for (const o of ["• Leave Management (Note: Attendance &amp; Overtime deferred to future phase) </w:t>", "• Leave Management </w:t>"]) if (xml.indexOf(o) >= 0) { xml = xml.replace(o, "• Leave, Attendance, and Overtime Management </w:t>"); log.push("✓ Attendance included"); break; } }
    if (m.phase2_lms !== false) { const o = "• Learning Management System and assessment </w:t>"; if (xml.indexOf(o) >= 0) { xml = xml.replace(o, "• Learning Management System and assessment (Note: Phase 2 – to be scoped in future phase) </w:t>"); log.push("✓ LMS Phase 2"); } }
    const pe = m.payroll_exclude || [];
    if (pe.length) { const o = "• Payroll and Compliance </w:t>"; if (xml.indexOf(o) >= 0) { xml = xml.replace(o, `• Payroll and Compliance (Note: Excludes ${pe.join(" & ")} – Payroll module not available for these countries in current scope) </w:t>`); log.push("✓ Payroll exclusion"); } }
    if (pe.includes("Hong Kong") || pe.includes("China")) { if (xml.indexOf("actively scoped for China, Myanmar") >= 0) { xml = xml.replace("actively scoped for China, Myanmar", "actively scoped for China, Hong Kong, Myanmar"); log.push("✓ Compliance HK"); } }
    const headless = xml.indexOf("Headless API") >= 0;
    return { xml, log, err, headless, pricing: { total, annual, impl, cur, id: newId } };
  }

  const DOCX = {
    async generate(templateBuf, config) {
      const zip = await JSZip.loadAsync(templateBuf);
      let xml = await zip.file("word/document.xml").async("string");
      xml = mergeRuns(xml);
      const res = patchXml(xml, config);
      if (!res.headless) return { ok: false, error: "Headless API & Token Usage clause missing — not generated.", report: res.log.join("\n") };
      zip.file("word/document.xml", res.xml);
      const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      return { ok: true, blob, report: res.log.join("\n") + (res.err.length ? "\n\nReview:\n" + res.err.join("\n") : ""), clean: res.err.length === 0, pricing: res.pricing };
    },
  };

  // ---------- IndexedDB (remember the uploaded template) ----------
  const IDB = {
    db: null,
    open() {
      return new Promise((res) => {
        if (this.db) return res(this.db);
        const r = indexedDB.open("hono_portal", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => res(null);
      });
    },
    async put(k, v) { const db = await this.open(); if (!db) return; return new Promise(r => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => r(); t.onerror = () => r(); }); },
    async get(k) { const db = await this.open(); if (!db) return null; return new Promise(r => { const t = db.transaction("kv", "readonly"); const q = t.objectStore("kv").get(k); q.onsuccess = () => r(q.result || null); q.onerror = () => r(null); }); },
  };

  // ---------- File storage (folders + real file bytes in IndexedDB) ----------
  const FDB = {
    db: null,
    open() {
      return new Promise((res) => {
        if (this.db) return res(this.db);
        const r = indexedDB.open("hono_files", 1);
        r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs"); };
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => res(null);
      });
    },
    async put(id, blob) { const db = await this.open(); if (!db) throw new Error("Storage unavailable"); return new Promise((res, rej) => { const t = db.transaction("blobs", "readwrite"); t.objectStore("blobs").put(blob, id); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
    async get(id) { const db = await this.open(); if (!db) return null; return new Promise((res) => { const t = db.transaction("blobs", "readonly"); const q = t.objectStore("blobs").get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); },
    async del(id) { const db = await this.open(); if (!db) return; return new Promise((res) => { const t = db.transaction("blobs", "readwrite"); t.objectStore("blobs").delete(id); t.oncomplete = () => res(); t.onerror = () => res(); }); },
  };

  const DEFAULT_FOLDERS = ["Corporate Decks", "Solution Decks", "Case Studies", "One-Pagers", "Battlecards", "Pricing", "Proposals", "RFPs", "Contracts", "Other"];
  const FILES = {
    meta() { return LS.get("hono_files_meta", []); },
    saveMeta(m) { LS.set("hono_files_meta", m); },
    folders() { return LS.get("hono_folders", DEFAULT_FOLDERS.slice()); },
    saveFolders(f) { LS.set("hono_folders", f); },
    addFolder(name) { name = (name || "").trim(); const f = this.folders(); if (name && !f.includes(name)) { f.push(name); this.saveFolders(f); } return f; },
    renameFolder(oldN, newN) { newN = (newN || "").trim(); if (!newN) return; const f = this.folders().map(x => x === oldN ? newN : x); this.saveFolders(f); const m = this.meta(); m.forEach(it => { if (it.folder === oldN) it.folder = newN; }); this.saveMeta(m); },
    removeFolder(name) { this.saveFolders(this.folders().filter(x => x !== name)); const m = this.meta(); m.forEach(it => { if (it.folder === name) it.folder = "Other"; }); this.saveMeta(m); },
    async upload(file, folder) {
      const id = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      await FDB.put(id, file);
      const m = this.meta();
      m.push({ id, name: file.name, folder: folder || "Other", ext: (file.name.split(".").pop() || "").toLowerCase(), size: file.size, added: new Date().toISOString().slice(0, 16).replace("T", " ") });
      this.saveMeta(m); return id;
    },
    async remove(id) { await FDB.del(id); this.saveMeta(this.meta().filter(x => x.id !== id)); },
    rename(id, name) { const m = this.meta(); const it = m.find(x => x.id === id); if (it && name) { it.name = name; this.saveMeta(m); } },
    move(id, folder) { const m = this.meta(); const it = m.find(x => x.id === id); if (it) { it.folder = folder; this.saveMeta(m); } },
    async download(id) { const it = this.meta().find(x => x.id === id); const blob = await FDB.get(id); if (blob) dl(it ? it.name : "file", blob instanceof Blob ? blob : new Blob([blob])); },
    async open(id) { const blob = await FDB.get(id); if (blob) { const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob])); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000); } },
    async usage() { try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; } } catch (e) {} return null; },
  };

  // ---------- AI engine (browser-only; user supplies their own key) ----------
  // Calls Anthropic or OpenAI directly from the browser. The key is stored ONLY
  // in this browser's localStorage and is never sent anywhere except the model API.
  const AI = {
    key: "hono_ai_cfg",
    MODELS: {
      anthropic: [
        { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 (recommended)" },
        { id: "claude-opus-4-1", label: "Claude Opus 4.1 (deepest)" },
        { id: "claude-3-5-haiku-latest", label: "Claude Haiku (fastest/cheapest)" },
      ],
      openai: [
        { id: "gpt-4o", label: "GPT-4o (recommended)" },
        { id: "gpt-4o-mini", label: "GPT-4o mini (fast/cheap)" },
      ],
    },
    cfg() { return LS.get(this.key, { provider: "anthropic", apiKey: "", model: "claude-sonnet-4-5" }); },
    save(c) { LS.set(this.key, c); },
    ready() { const c = this.cfg(); return !!(c.apiKey && c.provider && c.model); },
    forget() { const c = this.cfg(); c.apiKey = ""; this.save(c); },
    // messages: [{role:'user'|'assistant', content:'...'}]; onToken(delta) optional for streaming.
    async chat(system, messages, onToken, opts) {
      const c = this.cfg(); opts = opts || {};
      if (!c.apiKey) throw new Error("No API key set. Click ⚙ Settings and paste your key.");
      const maxTokens = opts.maxTokens || 2000;
      if (c.provider === "anthropic") {
        return this._anthropic(c, system, messages, maxTokens, onToken);
      }
      return this._openai(c, system, messages, maxTokens, onToken);
    },
    async _anthropic(c, system, messages, maxTokens, onToken) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": c.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model: c.model, max_tokens: maxTokens, system: system || "", messages, stream: !!onToken }),
      });
      if (!res.ok) throw new Error(await this._err(res));
      if (!onToken) { const j = await res.json(); return (j.content || []).map(b => b.text || "").join(""); }
      let full = "";
      await this._sse(res, (evt) => {
        try {
          const d = JSON.parse(evt);
          if (d.type === "content_block_delta" && d.delta && d.delta.text) { full += d.delta.text; onToken(d.delta.text); }
        } catch (e) {}
      });
      return full;
    },
    async _openai(c, system, messages, maxTokens, onToken) {
      const msgs = (system ? [{ role: "system", content: system }] : []).concat(messages);
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + c.apiKey },
        body: JSON.stringify({ model: c.model, max_tokens: maxTokens, messages: msgs, stream: !!onToken }),
      });
      if (!res.ok) throw new Error(await this._err(res));
      if (!onToken) { const j = await res.json(); return j.choices[0].message.content; }
      let full = "";
      await this._sse(res, (evt) => {
        if (evt === "[DONE]") return;
        try { const d = JSON.parse(evt); const t = d.choices[0].delta.content; if (t) { full += t; onToken(t); } } catch (e) {}
      });
      return full;
    },
    async _sse(res, onEvent) {
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop();
        for (const p of parts) {
          for (const line of p.split("\n")) {
            const s = line.trim();
            if (s.startsWith("data:")) onEvent(s.slice(5).trim());
          }
        }
      }
    },
    async _err(res) {
      let msg = "HTTP " + res.status;
      try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
      if (res.status === 401) msg = "Invalid API key (401). Check the key in ⚙ Settings.";
      if (res.status === 429) msg = "Rate limited or out of credit (429). " + msg;
      return msg;
    },
    // Build a compact grounding context from the portal's own data.
    context(opts) {
      opts = opts || {}; const parts = [];
      if (opts.assets !== false) {
        const a = (ASSETS.all() || []).slice(0, 200);
        if (a.length) parts.push("ASSET LIBRARY (title — category — link):\n" +
          a.map(x => `- ${x.title} — ${x.category}${x.link ? " — " + x.link : ""}`).join("\n"));
      }
      if (opts.rfp !== false) {
        const b = (RFP.bank() || []).slice(0, 80);
        if (b.length) parts.push("RFP ANSWER BANK (Q → A):\n" +
          b.map(e => `Q: ${e.question}\nA: ${e.answer}`).join("\n\n"));
      }
      if (opts.files !== false) {
        const m = (FILES.meta() || []).slice(0, 120);
        if (m.length) parts.push("FILES ON PORTAL (name — folder):\n" +
          m.map(x => `- ${x.name} — ${x.folder}`).join("\n"));
      }
      return parts.join("\n\n");
    },
  };

  window.HONO = { LS, dl, dlText, RFP, ASSETS, DOCX, IDB, FILES, AI, readSheetRows, writeXlsx, tokens, cosine };
})();
