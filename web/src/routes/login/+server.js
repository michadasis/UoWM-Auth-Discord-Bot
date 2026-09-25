import { redirect } from '@sveltejs/kit';
import { getServices, STATE_COOKIE } from '$lib/server/services.js';

export async function GET({ url, cookies }) {
    const { config, verification, emailVerification } = getServices();
    const token = url.searchParams.get('s');

    let result;
    try {
        result = emailVerification ? await emailVerification.begin(token) : await verification.startLogin(token);
    } catch (err) {
        console.error('Starting login failed:', err);
        result = { code: 'error' };
    }

    const next = emailVerification ? '/email' : result.redirectUrl;
    const ok = emailVerification ? ['address_needed', 'code_pending'].includes(result.code) : result.code === 'redirect';
    if (!ok) redirect(303, `/result?r=${result.code}`);

    // Binds the flow to this browser: later steps only accept the token from this cookie,
    // and it never appears in another URL.
    cookies.set(STATE_COOKIE, token, {
        path: emailVerification ? '/email' : '/callback',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.secureCookies,
        maxAge: 10 * 60,
    });
    redirect(303, next);
}
