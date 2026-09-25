// Decides who may verify and as what, from the claims released by the identity provider.
//
// Result: { ok: true, affiliation: 'student' | 'faculty' | 'staff' }
//      or { ok: false, reason: 'wrong_home_org' | 'not_eligible' | 'wrong_department' }

function values(claim) {
    if (claim === undefined || claim === null) return [];
    const list = Array.isArray(claim) ? claim : [claim];
    return list
        .flatMap((v) => String(v).split(','))
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
}

// Returns the affiliations vouched for by the expected home organization,
// or null when the account does not belong to that organization.
function homeOrgAffiliations(claims, expectedHomeOrg) {
    const scoped = values(claims.eduPersonScopedAffiliation);

    // Scoped values ("student@uowm.gr") state which institution vouches for them,
    // so when they are present they are the only source we trust.
    if (scoped.length) {
        const own = scoped
            .map((v) => v.split('@'))
            .filter(([, scope]) => !expectedHomeOrg || scope === expectedHomeOrg)
            .map(([affiliation]) => affiliation);
        return own.length || !expectedHomeOrg ? own : null;
    }

    if (expectedHomeOrg && !values(claims.schacHomeOrganization).includes(expectedHomeOrg)) return null;
    return [...values(claims.eduPersonAffiliation), ...values(claims.eduPersonPrimaryAffiliation)];
}

export function classify(claims, policy) {
    const affiliations = homeOrgAffiliations(claims, policy.expectedHomeOrg);
    if (affiliations === null) return { ok: false, reason: 'wrong_home_org' };

    const set = new Set(affiliations);
    // Faculty wins over staff wins over student (e.g. a PhD candidate who teaches).
    if (set.has('faculty')) return { ok: true, affiliation: 'faculty' };
    if (set.has('staff') || set.has('employee')) return { ok: true, affiliation: 'staff' };

    if (set.has('student')) {
        const filter = policy.departmentFilter;
        if (filter && !values(claims[filter.claim]).some((v) => filter.pattern.test(v))) {
            return { ok: false, reason: 'wrong_department' };
        }
        return { ok: true, affiliation: 'student' };
    }

    return { ok: false, reason: 'not_eligible' };
}
