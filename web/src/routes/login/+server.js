import { redirect } from '@sveltejs/kit';
import { getServices, STATE_COOKIE } from '$lib/server/services.js';

export async function GET({ url, cookies }) {
    const { config, verification } = getServices();
    const token = url.searchParams.get('s');

    let result;
    try {
        result = await verification.startLogin(token);
    } catch (err) {
        console.error('startLogin failed:', err);
        result = { code: 'error' };
    }

    if (result.code !== 'redirect') redirect(303, `/result?r=${result.code}`);

    // Binds the flow to this browser: /callback only accepts the state that matches this cookie.
    cookies.set(STATE_COOKIE, token, {
        path: '/callback',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.secureCookies,
        maxAge: 10 * 60,
    });
    redirect(303, result.redirectUrl);
}
