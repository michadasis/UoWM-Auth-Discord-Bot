// "Login with Discord" (OAuth2 authorization code flow, scope "identify" only: the panel learns the
// user's ID, name and avatar, nothing else).

const API = "https://discord.com/api/v10";

function authorizeUrl({ clientId, redirectUri, state }) {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "identify",
        state,
        prompt: "none",
    });
    return `https://discord.com/oauth2/authorize?${params}`;
}

// Exchanges the code for a token and returns the Discord user.
async function fetchUser({ clientId, clientSecret, redirectUri, code }, fetchImpl = fetch) {
    const tokenResponse = await fetchImpl(`${API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    if (!tokenResponse.ok) throw new Error(`token exchange failed (${tokenResponse.status})`);
    const { access_token: accessToken } = await tokenResponse.json();

    const userResponse = await fetchImpl(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!userResponse.ok) throw new Error(`user lookup failed (${userResponse.status})`);
    const user = await userResponse.json();
    if (!user || !/^\d{17,20}$/.test(user.id)) throw new Error("unexpected user response");
    return user;
}

module.exports = { authorizeUrl, fetchUser };
