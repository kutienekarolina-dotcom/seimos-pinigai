(() => {
  let client = null;
  let user = null;
  let ready = false;
  let activeUserId = null;
  let queue = Promise.resolve();

  function status(state, text) {
    window.dispatchEvent(new CustomEvent("seimos-cloud-status", { detail: { state, text } }));
  }

  function toCloud(t) {
    return {
      id: String(t.id),
      user_id: user.id,
      type: t.type,
      amount: Number(t.amount) || 0,
      date: t.date,
      name: t.name || "",
      category: t.category || "",
      child: t.child || "",
      payer: t.payer || "",
      note: t.note || "",
      import_batch_id: t.importBatchId || null,
      created_at: Number(t.createdAt) || Date.now(),
      updated_at: Number(t.updatedAt) || Date.now()
    };
  }

  function fromCloud(r) {
    return {
      id: String(r.id),
      type: r.type,
      amount: Number(r.amount) || 0,
      date: r.date,
      name: r.name || "",
      category: r.category || "",
      child: r.child || "",
      payer: r.payer || "",
      note: r.note || "",
      importBatchId: r.import_batch_id || "",
      createdAt: Number(r.created_at) || Date.now(),
      updatedAt: Number(r.updated_at) || Date.now()
    };
  }

  function mergeTransactions(localRows, cloudRows) {
    const map = new Map();
    cloudRows.forEach(t => map.set(String(t.id), t));
    localRows.forEach(t => {
      const key = String(t.id);
      const existing = map.get(key);
      if (!existing || Number(t.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
        map.set(key, t);
      }
    });
    return [...map.values()];
  }

  async function uploadAll(rows) {
    if (!client || !user || !rows.length) return;
    const payload = rows.map(toCloud);
    const { error } = await client
      .from("transactions")
      .upsert(payload, { onConflict: "user_id,id" });
    if (error) throw error;
  }

  async function syncForUser(nextClient, nextUser) {
    if (!nextClient || !nextUser) return;
    if (ready && activeUserId === nextUser.id) return;

    client = nextClient;
    user = nextUser;
    activeUserId = nextUser.id;
    ready = false;
    status("syncing", "Sinchronizuojami finansiniai duomenys…");

    try {
      const { data, error } = await client
        .from("transactions")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;

      const cloudRows = (data || []).map(fromCloud);
      const localRows = Array.isArray(transactions) ? transactions : [];
      const merged = mergeTransactions(localRows, cloudRows);

      if (merged.length) await uploadAll(merged);

      transactions = merged;
      await persistTransactionsToDb();
      render();
      ready = true;
      status("ready", `Duomenys sinchronizuoti · ${merged.length} įrašų`);
    } catch (error) {
      ready = false;
      console.error("Cloud sync error", error);
      status("error", "Nepavyko sinchronizuoti. Vietiniai duomenys liko telefone.");
    }
  }

  async function upsertCurrent() {
    if (!ready || !client || !user) return;
    try {
      status("syncing", "Išsaugoma debesyje…");
      await uploadAll(transactions);
      status("ready", "Duomenys išsaugoti debesyje");
    } catch (error) {
      console.error("Cloud save error", error);
      status("error", "Pakeitimas liko telefone, bet debesyje dar neišsaugotas.");
    }
  }

  async function deleteCloudTransaction(id) {
    if (!ready || !client || !user || !id) return;
    try {
      const { error } = await client
        .from("transactions")
        .delete()
        .eq("user_id", user.id)
        .eq("id", String(id));
      if (error) throw error;
      status("ready", "Įrašas ištrintas ir iš debesies");
    } catch (error) {
      console.error("Cloud delete error", error);
      status("error", "Telefone įrašas ištrintas, bet debesies trynimą reikės pakartoti.");
    }
  }

  async function clearLocalAfterSignOut() {
    ready = false;
    activeUserId = null;
    user = null;
    client = null;
    transactions = [];
    await persistTransactionsToDb();
    render();
    status("signedout", "Atsijungta");
  }

  const originalSave = save;
  save = function () {
    originalSave();
    if (ready) {
      queue = queue.then(upsertCurrent).catch(() => {});
    }
  };

  const originalDoDelete = doDelete;
  doDelete = function () {
    const id = deleteId;
    originalDoDelete();
    if (ready && id) {
      queue = queue.then(() => deleteCloudTransaction(id)).catch(() => {});
    }
  };

  window.addEventListener("seimos-auth-change", event => {
    const detail = event.detail || {};
    if (detail.event === "SIGNED_OUT") {
      clearLocalAfterSignOut();
      return;
    }
    if (detail.user && detail.client) syncForUser(detail.client, detail.user);
  });

  window.SeimosCloud = {
    syncNow: () => client && user ? syncForUser(client, user) : Promise.resolve(),
    isReady: () => ready
  };
})();
