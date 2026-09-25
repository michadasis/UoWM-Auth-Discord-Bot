// User-facing result messages (Greek). Used for the result page and for the Discord DM.
// Keys are the result codes returned by the verification service.

export const colors = {
    success: 0x57f287,
    info: 0x0d86e3,
    warning: 0xe67e22,
    error: 0xed4245,
};

export const resultMessages = {
    verified_student: {
        tone: 'success',
        title: 'Επιτυχής επιβεβαίωση',
        text: 'Ο λογαριασμός σας επιβεβαιώθηκε και λάβατε τον ρόλο «Φοιτητής». Μπορείτε πλέον να επιλέξετε τα εξάμηνά σας στο κανάλι #epilogh-eksamhnou.',
    },
    verified_professor: {
        tone: 'success',
        title: 'Επιτυχής επιβεβαίωση',
        text: 'Ο λογαριασμός σας επιβεβαιώθηκε και λάβατε τον ρόλο «Καθηγητής».',
    },
    already_verified: {
        tone: 'info',
        title: 'Ήδη επιβεβαιωμένος λογαριασμός',
        text: 'Ο λογαριασμός σας στο Discord είναι ήδη συνδεδεμένος με αυτόν τον ιδρυματικό λογαριασμό. Δεν χρειάζεται κάποια άλλη ενέργεια.',
    },
    discord_already_linked: {
        tone: 'warning',
        title: 'Ήδη συνδεδεμένος λογαριασμός Discord',
        text: 'Ο λογαριασμός σας στο Discord είναι ήδη συνδεδεμένος με άλλον ιδρυματικό λογαριασμό. Χρησιμοποιήστε πρώτα την εντολή /unverify και δοκιμάστε ξανά.',
    },
    uni_account_in_use: {
        tone: 'error',
        title: 'Ο ιδρυματικός λογαριασμός χρησιμοποιείται ήδη',
        text: 'Αυτός ο ιδρυματικός λογαριασμός είναι ήδη συνδεδεμένος με άλλον λογαριασμό Discord. Κάθε ιδρυματικός λογαριασμός μπορεί να συνδεθεί με έναν μόνο λογαριασμό Discord. Αν πιστεύετε ότι πρόκειται για λάθος, επικοινωνήστε με τους διαχειριστές.',
    },
    not_eligible: {
        tone: 'error',
        title: 'Δεν είναι δυνατή η επιβεβαίωση',
        text: 'Ο λογαριασμός δεν αντιστοιχεί σε φοιτητή ή διδάσκοντα του Τμήματος Πληροφορικής. Αν είστε διδάσκων και δεν αναγνωριστήκατε, επικοινωνήστε με τους διαχειριστές.',
    },
    wrong_home_org: {
        tone: 'error',
        title: 'Μη αποδεκτός λογαριασμός',
        text: 'Η επιβεβαίωση γίνεται μόνο με ιδρυματικό λογαριασμό του Πανεπιστημίου Δυτικής Μακεδονίας (uowm.gr).',
    },
    wrong_department: {
        tone: 'error',
        title: 'Μόνο για φοιτητές του Τμήματος Πληροφορικής',
        text: 'Ο ρόλος «Φοιτητής» δίνεται μόνο σε φοιτητές του Τμήματος Πληροφορικής. Αν πιστεύετε ότι πρόκειται για λάθος, επικοινωνήστε με τους διαχειριστές.',
    },
    not_in_guild: {
        tone: 'error',
        title: 'Δεν είστε μέλος του διακομιστή',
        text: 'Για να ολοκληρωθεί η επιβεβαίωση πρέπει να είστε μέλος του διακομιστή Discord. Μπείτε πρώτα στον διακομιστή και χρησιμοποιήστε ξανά την εντολή /auth.',
    },
    expired: {
        tone: 'warning',
        title: 'Ο σύνδεσμος έληξε',
        text: 'Ο σύνδεσμος ισχύει για 10 λεπτά. Χρησιμοποιήστε ξανά την εντολή /auth στο Discord για να λάβετε νέο σύνδεσμο.',
    },
    used: {
        tone: 'warning',
        title: 'Ο σύνδεσμος έχει ήδη χρησιμοποιηθεί',
        text: 'Κάθε σύνδεσμος χρησιμοποιείται μόνο μία φορά. Χρησιμοποιήστε ξανά την εντολή /auth στο Discord για να λάβετε νέο σύνδεσμο.',
    },
    invalid_link: {
        tone: 'error',
        title: 'Μη έγκυρος σύνδεσμος',
        text: 'Ο σύνδεσμος δεν είναι έγκυρος. Χρησιμοποιήστε την εντολή /auth στο Discord για να λάβετε νέο σύνδεσμο.',
    },
    session_mismatch: {
        tone: 'error',
        title: 'Η σύνδεση δεν ολοκληρώθηκε',
        text: 'Η σύνδεση πρέπει να ολοκληρωθεί στον ίδιο browser όπου ανοίξατε τον σύνδεσμο. Χρησιμοποιήστε ξανά την εντολή /auth στο Discord.',
    },
    provider_error: {
        tone: 'error',
        title: 'Η σύνδεση δεν ολοκληρώθηκε',
        text: 'Η σύνδεση με την Κεντρική Υπηρεσία Πιστοποίησης του Πανεπιστημίου απέτυχε ή ακυρώθηκε. Χρησιμοποιήστε ξανά την εντολή /auth στο Discord.',
    },
    // Email code flow. Most of these are shown on the form, not on the result page.
    invalid_address: {
        tone: 'error',
        title: 'Μη έγκυρη διεύθυνση',
        text: 'Γράψτε το όνομα χρήστη του ιδρυματικού σας λογαριασμού (π.χ. cs01234) ή ολόκληρη τη διεύθυνση @uowm.gr.',
    },
    address_needed: {
        tone: 'warning',
        title: 'Χρειάζεται διεύθυνση email',
        text: 'Γράψτε πρώτα το ιδρυματικό σας email για να λάβετε κωδικό.',
    },
    wrong_code: {
        tone: 'error',
        title: 'Λάθος κωδικός',
        text: 'Ο κωδικός δεν είναι σωστός.',
    },
    resend_too_soon: {
        tone: 'warning',
        title: 'Περιμένετε λίγο',
        text: 'Μόλις στάλθηκε κωδικός. Περιμένετε ένα λεπτό πριν ζητήσετε νέο.',
    },
    rate_limited: {
        tone: 'warning',
        title: 'Πολλές προσπάθειες',
        text: 'Έχουν σταλεί πολλοί κωδικοί την τελευταία ώρα. Δοκιμάστε ξανά αργότερα.',
    },
    email_send_failed: {
        tone: 'error',
        title: 'Η αποστολή απέτυχε',
        text: 'Δεν ήταν δυνατή η αποστολή του email. Δοκιμάστε ξανά σε λίγο ή επικοινωνήστε με τους διαχειριστές.',
    },
    too_many_attempts: {
        tone: 'error',
        title: 'Πολλές λανθασμένες προσπάθειες',
        text: 'Ο σύνδεσμος ακυρώθηκε μετά από πολλούς λάθος κωδικούς. Χρησιμοποιήστε ξανά την εντολή /auth στο Discord.',
    },
    error: {
        tone: 'error',
        title: 'Κάτι πήγε στραβά',
        text: 'Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά αργότερα ή επικοινωνήστε με τους διαχειριστές.',
    },
};

export function messageFor(code) {
    return resultMessages[code] ?? resultMessages.error;
}

export function embedFor(code) {
    const msg = messageFor(code);
    return {
        color: colors[msg.tone],
        title: msg.title,
        description: msg.text,
        footer: { text: 'Πληροφορική UoWM Discord' },
    };
}
