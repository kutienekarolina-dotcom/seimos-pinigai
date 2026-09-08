(() => {
  const SUPABASE_URL = "https://ojsdrzpydcxdvyfqbhim.supabase.co";
  const SUPABASE_KEY = "sb_publishable_DBBwIUzqtlrM1kD7qnlYrQ_OtmnLPGu";

  if (!window.supabase?.createClient) return;

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  window.SeimosSupabaseClient = client;

  function emit(event, session) {
    window.dispatchEvent(new CustomEvent("seimos-auth-change", {
      detail: {
        event,
        session: session || null,
        user: session?.user || null,
        client
      }
    }));
  }

  client.auth.onAuthStateChange((event, session) => emit(event, session));

  client.auth.getSession().then(({ data }) => {
    emit("INITIAL_SESSION", data?.session || null);
  }).catch(() => {});
})();
