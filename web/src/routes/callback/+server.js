import { redirect } from '@sveltejs/kit';
import { getServices, STATE_COOKIE } from '$lib/server/services.js';

export async function GET({ url, cookies }) {
    const { config, verification } = getServices();

    // Rebuild the URL from the configured public origin so that it matches the
    // registered redirect_uri even behind a reverse proxy.
    const callbackUrl = new URL(config.redirectUri + url.search);
    const cookieToken = cookies.get(STATE_COOKIE);
    cookies.delete(STATE_COOKIE, { path: '/callback', secure: config.secureCookies });

    let result;
    try {
        result = await verification.completeLogin({ callbackUrl, cookieToken });
    } catch (err) {
        console.error('completeLogin failed:', err);
        result = { code: 'error' };
    }
    redirect(303, `/result?r=${result.code}`);
}
