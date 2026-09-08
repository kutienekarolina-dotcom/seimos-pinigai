(() => {
  const SUPABASE_URL = "https://ojsdrzpydcxdvyfqbhim.supabase.co";
  const SUPABASE_KEY = "sb_publishable_DBBwIUzqtlrM1kD7qnlYrQ_OtmnLPGu";
  const SITE_URL = "https://kutienekarolina-dotcom.github.io/seimos-pinigai/";

  const body = document.body;
  body.classList.add("auth-locked");

  const overlay = document.createElement("div");
  overlay.id = "authOverlay";
  overlay.className = "auth-overlay";
  overlay.innerHTML = `
    <section class="auth-card" aria-labelledby="authTitle">
      <div class="auth-brand">
        <img src="icons/icon.svg" alt="">
        <div><h2 id="authTitle">Šeimos pinigai</h2><p>Daugiau aiškumo, mažiau rūpesčių</p></div>
      </div>

      <div id="authLoginBox" class="auth-login-box">
        <div class="auth-tabs" role="tablist">
          <button id="loginTab" class="auth-tab active" type="button">Prisijungti</button>
          <button id="signupTab" class="auth-tab" type="button">Registruotis</button>
        </div>
        <form id="authForm" class="auth-form">
          <label>El. paštas<input id="authEmail" type="email" autocomplete="email" required></label>
          <label>Slaptažodis<input id="authPassword" type="password" autocomplete="current-password" minlength="6" required></label>
          <label id="confirmPasswordLabel" style="display:none">Pakartok slaptažodį<input id="authPasswordConfirm" type="password" autocomplete="new-password" minlength="6"></label>
          <button id="authSubmit" class="auth-primary" type="submit">Prisijungti</button>
          <button id="forgotPasswordBtn" class="auth-link" type="button">Pamiršau slaptažodį</button>
        </form>
      </div>

      <div id="recoveryBox" class="recovery-box">
        <h3 style="margin:0;color:#18304f">Nustatyti naują slaptažodį</h3>
        <form id="recoveryForm" class="auth-form">
          <label>Naujas slaptažodis<input id="newPassword" type="password" autocomplete="new-password" minlength="6" required></label>
          <label>Pakartok slaptažodį<input id="newPasswordConfirm" type="password" autocomplete="new-password" minlength="6" required></label>
          <button id="saveNewPasswordBtn" class="auth-primary" type="submit">Išsaugoti naują slaptažodį</button>
        </form>
      </div>

      <div id="authMessage" class="auth-message"></div>
      <p class="auth-note">Finansinius duomenis prie paskyros prijungsime kitame žingsnyje. Šiame etape sutvarkome registraciją ir prisijungimą.</p>
    </section>`;
  body.appendChild(overlay);

  const accountDialog = document.createElement("dialog");
  accountDialog.id = "accountDialog";
  accountDialog.className = "account-panel";
  accountDialog.innerHTML = `
    <div class="account-panel-inner">
      <h2>Mano paskyra</h2>
      <div id="accountEmail" class="account-email"></div>
      <div class="account-actions">
        <button id="accountSignOut" class="account-signout" type="button">Atsijungti</button>
        <button id="accountClose" class="account-close" type="button">Uždaryti</button>
      </div>
    </div>`;
  body.appendChild(accountDialog);

  const message = document.getElementById("authMessage");
  const loginBox = document.getElementById("authLoginBox");
  const recoveryBox = document.getElementById("recoveryBox");
  const form = document.getElementById("authForm");
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const confirmLabel = document.getElementById("confirmPasswordLabel");
  const confirmInput = document.getElementById("authPasswordConfirm");
  const submitBtn = document.getElementById("authSubmit");
  const forgotBtn = document.getElementById("forgotPasswordBtn");
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const avatar = document.querySelector(".avatar");

  let mode = "login";
  let client = null;

  function setMessage(text = "", kind = "") {
    message.textContent = text;
    message.className = `auth-message${kind ? ` ${kind}` : ""}`;
  }

  function setMode(next) {
    mode = next;
    const signup = next === "signup";
    loginTab.classList.toggle("active", !signup);
    signupTab.classList.toggle("active", signup);
    confirmLabel.style.display = signup ? "grid" : "none";
    confirmInput.required = signup;
    passwordInput.autocomplete = signup ? "new-password" : "current-password";
    submitBtn.textContent = signup ? "Sukurti paskyrą" : "Prisijungti";
    forgotBtn.style.display = signup ? "none" : "inline-block";
    setMessage();
  }

  function lockApp() {
    body.classList.add("auth-locked");
    overlay.classList.remove("hidden");
  }

  function unlockApp(user) {
    body.classList.remove("auth-locked");
    overlay.classList.add("hidden");
    recoveryBox.classList.remove("active");
    loginBox.classList.remove("hidden");
    if (avatar) {
      avatar.classList.add("auth-avatar");
      avatar.setAttribute("role", "button");
      avatar.setAttribute("tabindex", "0");
      avatar.setAttribute("aria-label", "Atidaryti paskyrą");
      const letter = (user?.email || "K").trim().charAt(0).toUpperCase();
      avatar.textContent = letter || "K";
    }
  }

  async function showAccount() {
    if (!client) return;
    const { data } = await client.auth.getUser();
    if (!data?.user) return;
    document.getElementById("accountEmail").textContent = data.user.email || "";
    accountDialog.showModal();
  }

  loginTab.addEventListener("click", () => setMode("login"));
  signupTab.addEventListener("click", () => setMode("signup"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || password.length < 6) {
      setMessage("Įvesk el. paštą ir bent 6 simbolių slaptažodį.", "error");
      return;
    }
    if (mode === "signup" && password !== confirmInput.value) {
      setMessage("Slaptažodžiai nesutampa.", "error");
      return;
    }

    submitBtn.disabled = true;
    setMessage(mode === "signup" ? "Kuriama paskyra…" : "Jungiamasi…");
    try {
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: SITE_URL }
        });
        if (error) throw error;
        if (data?.session) {
          unlockApp(data.user);
        } else {
          setMessage("Paskyra sukurta. Patikrink el. paštą ir paspausk patvirtinimo nuorodą.", "success");
        }
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        unlockApp(data.user);
        setMessage();
      }
    } catch (error) {
      const raw = String(error?.message || error || "");
      let text = "Nepavyko atlikti veiksmo.";
      if (/invalid login credentials/i.test(raw)) text = "Neteisingas el. paštas arba slaptažodis.";
      else if (/email not confirmed/i.test(raw)) text = "Pirmiausia patvirtink el. paštą gautame laiške.";
      else if (/already registered|user already registered/i.test(raw)) text = "Tokia paskyra jau egzistuoja. Bandyk prisijungti.";
      else if (/password/i.test(raw) && /6|characters|weak/i.test(raw)) text = "Slaptažodis per silpnas. Įvesk bent 6 simbolius.";
      setMessage(text, "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  forgotBtn.addEventListener("click", async () => {
    if (!client) return;
    const email = emailInput.value.trim();
    if (!email) {
      setMessage("Pirmiausia įrašyk savo el. pašto adresą.", "error");
      emailInput.focus();
      return;
    }
    forgotBtn.disabled = true;
    setMessage("Siunčiama slaptažodžio atkūrimo nuoroda…");
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
      if (error) throw error;
      setMessage("Atkūrimo nuoroda išsiųsta. Patikrink el. paštą.", "success");
    } catch {
      setMessage("Nepavyko išsiųsti atkūrimo laiško. Bandyk dar kartą.", "error");
    } finally {
      forgotBtn.disabled = false;
    }
  });

  document.getElementById("recoveryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const p1 = document.getElementById("newPassword").value;
    const p2 = document.getElementById("newPasswordConfirm").value;
    if (p1.length < 6) {
      setMessage("Naujas slaptažodis turi būti bent 6 simbolių.", "error");
      return;
    }
    if (p1 !== p2) {
      setMessage("Slaptažodžiai nesutampa.", "error");
      return;
    }
    const btn = document.getElementById("saveNewPasswordBtn");
    btn.disabled = true;
    try {
      const { data, error } = await client.auth.updateUser({ password: p1 });
      if (error) throw error;
      setMessage("Slaptažodis pakeistas.", "success");
      unlockApp(data.user);
    } catch {
      setMessage("Slaptažodžio pakeisti nepavyko. Atidaryk atkūrimo nuorodą iš naujo.", "error");
    } finally {
      btn.disabled = false;
    }
  });

  if (avatar) {
    avatar.addEventListener("click", showAccount);
    avatar.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") showAccount();
    });
  }
  document.getElementById("accountClose").addEventListener("click", () => accountDialog.close());
  document.getElementById("accountSignOut").addEventListener("click", async () => {
    if (!client) return;
    await client.auth.signOut();
    accountDialog.close();
    setMode("login");
    form.reset();
    lockApp();
    setMessage("Atsijungta.", "success");
  });

  async function initAuth() {
    if (!window.supabase?.createClient) {
      setMessage("Prisijungimui nepavyko užkrauti saugaus ryšio modulio. Patikrink interneto ryšį ir atidaryk programėlę iš naujo.", "error");
      return;
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        lockApp();
        loginBox.classList.add("hidden");
        recoveryBox.classList.add("active");
        setMessage("Įvesk naują slaptažodį.");
        return;
      }
      if (session?.user) unlockApp(session.user);
      else if (event === "SIGNED_OUT") lockApp();
    });

    const { data, error } = await client.auth.getSession();
    if (error) {
      setMessage("Nepavyko patikrinti prisijungimo būsenos.", "error");
      lockApp();
      return;
    }
    if (data?.session?.user) unlockApp(data.session.user);
    else lockApp();
  }

  initAuth();
})();
