(function(){
  const DEFAULT_SCOPES = ["User.Read", "Files.Read"];
  const REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;
  let app = null;
  let appClientId = "";

  function currentConfig(){
    if (typeof window.getOneDriveJobConfig === "function") return window.getOneDriveJobConfig();
    return { clientId: (window.ONE_DRIVE_CLIENT_ID || "").trim() };
  }

  function ensureApp(){
    if (!window.msal || !window.msal.PublicClientApplication){
      throw new Error("MSAL is not loaded.");
    }
    const cfg = currentConfig();
    const clientId = String(cfg?.clientId || "").trim();
    if (!clientId) throw new Error("Missing OneDrive client ID in setup.");
    if (!app || appClientId !== clientId){
      appClientId = clientId;
      app = new window.msal.PublicClientApplication({
        auth: {
          clientId,
          authority: "https://login.microsoftonline.com/common",
          redirectUri: REDIRECT_URI
        },
        cache: {
          cacheLocation: "localStorage",
          storeAuthStateInCookie: false
        }
      });
    }
    return app;
  }

  async function signIn(scopes = DEFAULT_SCOPES){
    const pca = ensureApp();
    const login = await pca.loginPopup({ scopes });
    if (login && login.account) pca.setActiveAccount(login.account);
    return login;
  }

  function getAccount(){
    const pca = ensureApp();
    let acct = pca.getActiveAccount();
    if (!acct){
      const list = pca.getAllAccounts();
      acct = list && list.length ? list[0] : null;
      if (acct) pca.setActiveAccount(acct);
    }
    return acct;
  }

  async function getAccessToken(scopes = DEFAULT_SCOPES){
    const pca = ensureApp();
    let account = getAccount();
    if (!account){
      await signIn(scopes);
      account = getAccount();
    }
    try {
      const resp = await pca.acquireTokenSilent({ scopes, account });
      return resp.accessToken;
    } catch (_err){
      const resp = await pca.acquireTokenPopup({ scopes, account });
      return resp.accessToken;
    }
  }

  async function signOut(){
    const pca = ensureApp();
    const account = getAccount();
    await pca.logoutPopup({ account });
  }

  window.oneDriveAuth = { signIn, getAccessToken, signOut, getAccount };
})();
