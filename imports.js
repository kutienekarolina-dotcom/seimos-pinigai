(() => {
  const LEGACY_PDF_BATCH_NAME = "Ankstesnis banko PDF importas";
  let lastCsvName = "Banko CSV importas";
  let lastPdfName = "Banko PDF importas";
  let historyCard = null;
  let historyList = null;
  let historyStatus = null;

  const originalLoadBankCsv = window.loadBankCsv;
  if (typeof originalLoadBankCsv === "function") {
    window.loadBankCsv = async function(file) {
      lastCsvName = file?.name || "Banko CSV importas";
      return originalLoadBankCsv(file);
    };
  }

  const originalLoadBankPdf = window.loadBankPdf;
  if (typeof originalLoadBankPdf === "function") {
    window.loadBankPdf = async function(file) {
      lastPdfName = file?.name || "Banko PDF importas";
      return originalLoadBankPdf(file);
    };
  }

  function uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async function getClientAndUser() {
    const client = window.SeimosSupabaseClient;
    if (!client) return { client: null, user: null };
    const { data } = await client.auth.getSession();
    return { client, user: data?.session?.user || null };
  }

  function ensureHistoryCard() {
    if (historyCard) return;
    const panel = document.querySelector("#dataTab .panel");
    if (!panel) return;

    historyCard = document.createElement("div");
    historyCard.className = "data-card";
    historyCard.innerHTML = `
      <strong>🧾 Importų istorija</strong>
      <p>Čia gali ištrinti visą konkretų banko importą vienu kartu, neieškodama kiekvienos operacijos atskirai.</p>
      <div id="importHistoryStatus" class="tagline" style="margin:8px 0"></div>
      <div id="importHistoryList"></div>`;

    const pdfCard = [...panel.querySelectorAll(".data-card")].find(el => el.textContent.includes("Banko PDF importas"));
    if (pdfCard?.nextSibling) panel.insertBefore(historyCard, pdfCard.nextSibling);
    else panel.appendChild(historyCard);

    historyList = historyCard.querySelector("#importHistoryList");
    historyStatus = historyCard.querySelector("#importHistoryStatus");
  }

  async function createBatch(batchId, source, filename, count) {
    const { client, user } = await getClientAndUser();
    if (!client || !user) throw new Error("Pirmiausia prisijunk prie paskyros.");
    const { error } = await client.from("import_batches").insert({
      id: batchId,
      user_id: user.id,
      source,
      filename: filename || "",
      imported_count: count
    });
    if (error) throw error;
  }

  function buildBankRecords(selected, batchId) {
    const existing = new Set(transactions.map(makeBankDedupKey));
    const added = [];
    let skipped = 0;

    selected.forEach(r => {
      const rec = {
        id: `bank-${Date.now()}-${r.sourceIndex}-${Math.random()}`,
        type: r.type,
        amount: Math.round(r.amount * 100) / 100,
        date: r.date,
        name: r.desc,
        category: r.category,
        child: "",
        payer: r.type === "expense" ? "Bendri pinigai" : "",
        note: "Importuota iš banko CSV",
        importBatchId: batchId,
        createdAt: Date.now() + r.sourceIndex,
        updatedAt: Date.now()
      };
      const key = makeBankDedupKey(rec);
      if (existing.has(key)) { skipped++; return; }
      existing.add(key);
      added.push(rec);

      if (r.type === "expense" && r.category !== "Kita") {
        const merchant = normalizeMerchant(r.desc);
        const useful = merchant.split(" ").filter(x => x.length >= 4).slice(0, 2).join(" ");
        if (useful) bankRules[useful] = r.category;
      }
    });

    return { added, skipped };
  }

  function buildPdfRecords(selected, batchId) {
    const existing = new Set(transactions.map(makeBankDedupKey));
    const added = [];
    let skipped = 0;

    selected.forEach(r => {
      const rec = {
        id: `pdf-${Date.now()}-${r.sourceIndex}-${Math.random()}`,
        type: r.type,
        amount: Math.round(r.amount * 100) / 100,
        date: r.date,
        name: r.desc,
        category: r.category,
        child: "",
        payer: r.type === "expense" ? "Bendri pinigai" : "",
        note: "Importuota iš banko PDF",
        importBatchId: batchId,
        createdAt: Date.now() + r.sourceIndex,
        updatedAt: Date.now()
      };
      const key = makeBankDedupKey(rec);
      if (existing.has(key)) { skipped++; return; }
      existing.add(key);
      added.push(rec);

      if (r.type === "expense" && r.category !== "Kita") {
        const merchant = normalizeMerchant(r.desc);
        const useful = merchant.split(" ").filter(x => x.length >= 4).slice(0, 2).join(" ");
        if (useful) bankRules[useful] = r.category;
      }
    });

    return { added, skipped };
  }

  window.confirmBankImport = async function() {
    const selected = bankPreviewRows.filter(r => r.selected);
    if (!selected.length) {
      $("bankImportStatus").textContent = "Nepažymėta nė viena operacija.";
      return;
    }

    const batchId = uuid();
    const { added, skipped } = buildBankRecords(selected, batchId);
    if (!added.length) {
      $("bankImportStatus").textContent = `Naujų operacijų nėra${skipped ? `, pasikartojančių: ${skipped}` : ""}.`;
      return;
    }

    try {
      await createBatch(batchId, "bank_csv", lastCsvName, added.length);
      transactions.push(...added);
      save();
      saveBankRules();
      if (added[0]?.date) $("monthInput").value = added[0].date.slice(0, 7);
      render();
      $("bankImportStatus").textContent = `Importuota ${added.length} operacijų${skipped ? `, praleista pasikartojančių: ${skipped}` : ""}.`;
      refreshImportHistory();
    } catch (e) {
      $("bankImportStatus").textContent = e?.message || "Importo išsaugoti nepavyko.";
    }
  };

  window.confirmPdfImport = async function() {
    const selected = pdfPreviewRows.filter(r => r.selected);
    if (!selected.length) {
      $("bankPdfStatus").textContent = "Nepažymėta nė viena operacija.";
      return;
    }

    const batchId = uuid();
    const { added, skipped } = buildPdfRecords(selected, batchId);
    if (!added.length) {
      $("bankPdfStatus").textContent = `Naujų operacijų nėra${skipped ? `, pasikartojančių: ${skipped}` : ""}.`;
      return;
    }

    try {
      await createBatch(batchId, "bank_pdf", lastPdfName, added.length);
      transactions.push(...added);
      save();
      saveBankRules();
      if (added[0]?.date) $("monthInput").value = added[0].date.slice(0, 7);
      render();
      $("bankPdfStatus").textContent = `Importuota ${added.length} operacijų${skipped ? `, praleista pasikartojančių: ${skipped}` : ""}.`;
      refreshImportHistory();
    } catch (e) {
      $("bankPdfStatus").textContent = e?.message || "Importo išsaugoti nepavyko.";
    }
  };

  async function mapLegacyBatch(batch) {
    if (batch.filename !== LEGACY_PDF_BATCH_NAME) return;
    let changed = false;
    transactions.forEach(t => {
      if (!t.importBatchId && t.note === "Importuota iš banko PDF") {
        t.importBatchId = batch.id;
        t.updatedAt = Date.now();
        changed = true;
      }
    });
    if (changed) {
      await persistTransactionsToDb();
      save();
      render();
    }
  }

  async function undoBatch(batch) {
    const count = Number(batch.imported_count || 0);
    const ok = window.confirm(`Ištrinti šį importą ir ${count} jo operacijų?\n\nŠio veiksmo atšaukti nepavyks.`);
    if (!ok) return;

    const { client, user } = await getClientAndUser();
    if (!client || !user) return;
    historyStatus.textContent = "Trinamas importas…";

    try {
      const { error: txError } = await client
        .from("transactions")
        .delete()
        .eq("user_id", user.id)
        .eq("import_batch_id", batch.id);
      if (txError) throw txError;

      const { error: batchError } = await client
        .from("import_batches")
        .delete()
        .eq("user_id", user.id)
        .eq("id", batch.id);
      if (batchError) throw batchError;

      transactions = transactions.filter(t => t.importBatchId !== batch.id);
      await persistTransactionsToDb();
      render();
      historyStatus.textContent = `Importas ištrintas. Pašalinta ${count} operacijų.`;
      await refreshImportHistory(false);
    } catch (e) {
      historyStatus.textContent = "Importo ištrinti nepavyko. Bandyk dar kartą.";
    }
  }

  async function refreshImportHistory(clearStatus = true) {
    ensureHistoryCard();
    if (!historyList || !historyStatus) return;
    if (clearStatus) historyStatus.textContent = "Kraunama importų istorija…";

    const { client, user } = await getClientAndUser();
    if (!client || !user) {
      historyStatus.textContent = "Prisijunk prie paskyros, kad matytum importų istoriją.";
      historyList.innerHTML = "";
      return;
    }

    const { data, error } = await client
      .from("import_batches")
      .select("id,source,filename,imported_count,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      historyStatus.textContent = "Importų istorijos įkelti nepavyko.";
      return;
    }

    const batches = data || [];
    for (const batch of batches) await mapLegacyBatch(batch);

    if (clearStatus) historyStatus.textContent = batches.length ? "" : "Importų istorija tuščia.";
    historyList.innerHTML = "";

    batches.forEach(batch => {
      const row = document.createElement("div");
      row.style.cssText = "display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:12px 0;border-top:1px solid #e7edf5";
      const date = batch.created_at ? new Date(batch.created_at).toLocaleString("lt-LT") : "";
      const source = batch.source === "bank_pdf" ? "Banko PDF" : "Banko CSV";
      row.innerHTML = `
        <div>
          <div style="font-weight:700;color:#18304f">${esc(batch.filename || source)}</div>
          <div class="tagline">${source} · ${date} · ${Number(batch.imported_count || 0)} operacijų</div>
        </div>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "danger";
      btn.textContent = "Ištrinti importą";
      btn.addEventListener("click", () => undoBatch(batch));
      row.appendChild(btn);
      historyList.appendChild(row);
    });
  }

  window.addEventListener("seimos-auth-change", event => {
    if (event.detail?.user) setTimeout(() => refreshImportHistory(), 300);
    else if (historyList) historyList.innerHTML = "";
  });

  window.addEventListener("seimos-cloud-status", event => {
    if (event.detail?.state === "ready") refreshImportHistory(false);
  });

  ensureHistoryCard();
  setTimeout(refreshImportHistory, 1500);
})();
