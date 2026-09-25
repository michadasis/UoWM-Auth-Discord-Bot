// Lazily wires the real dependencies for the SvelteKit routes.

import { loadConfig } from './config.js';
import { createPool, createMariaRepository } from './repository.js';
import { createProvider } from './provider/index.js';
import { createDiscordClient } from './discord.js';
import { createVerificationService } from './verification.js';
import { createEmailVerificationService } from './emailVerification.js';
import { createMailer } from './mailer.js';
import { loadFacultyLocals } from './emailPolicy.js';

export const STATE_COOKIE = 'uowm_verify_state';

let services;

export function getServices() {
    if (!services) {
        const config = loadConfig();
        const repo = createMariaRepository(createPool(config.db));
        const verification = createVerificationService({
            config,
            repo,
            provider: config.oidc ? createProvider(config) : null,
            discord: createDiscordClient(config.discord),
        });
        services = {
            config,
            verification,
            emailVerification: config.email
                ? createEmailVerificationService({
                      config,
                      repo,
                      mailer: createMailer(config.email),
                      loadFacultyLocals: () => loadFacultyLocals(config.email.facultyFile, config.email.domain),
                      linker: verification,
                  })
                : null,
        };
    }
    return services;
}
