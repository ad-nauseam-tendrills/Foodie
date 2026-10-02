'use strict';

// Direct, no-login-required password reset for when you're locked out of
// every admin account (the in-app reset button needs an admin session to
// use it -- this doesn't). Run it on the server itself, e.g.:
//
//   docker compose exec foodie npm run reset-password -- admin
//   docker compose exec foodie npm run reset-password -- admin 'a-specific-new-password-24chars'
//
// With no password argument, generates a random one and prints it once --
// same as the first-boot admin bootstrap. Either way, the account is
// forced to change it again on next login, and every existing session
// for it is killed, same as the in-app admin reset.

const db = require('../db');
const { hashPassword, validatePassword, generateTempPassword } = require('../services/auth');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [, , email, providedPassword] = process.argv;

if (!email) {
  fail(
    'Usage: npm run reset-password -- <email> [newPassword]\n' +
      '  <email> is the login identifier, not necessarily a real email address -- the bootstrap admin account is just "admin".\n' +
      '  [newPassword] is optional -- omit it to get a random one printed here.\n\n' +
      'Not sure what email to use? List every account with:\n' +
      "  docker compose exec foodie node -e \"require('./server/db').prepare('SELECT email, is_admin FROM users ORDER BY email').all().forEach(u => console.log(u.email, u.is_admin ? '(admin)' : ''))\""
  );
}

const user = db.prepare(`SELECT * FROM users WHERE email = ? COLLATE NOCASE`).get(email);
if (!user) {
  const knownEmails = db.prepare(`SELECT email FROM users ORDER BY email COLLATE NOCASE`).all().map((u) => u.email);
  fail(
    `No account with email "${email}".\n` +
      (knownEmails.length ? `Known accounts: ${knownEmails.join(', ')}` : 'There are no accounts in this database at all.')
  );
}

let password = providedPassword;
if (password) {
  const passwordError = validatePassword(password, { email: user.email });
  if (passwordError) fail(`That password won't work: ${passwordError}`);
} else {
  password = generateTempPassword();
}

const { salt, hash } = hashPassword(password);
db.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 1 WHERE id = ?`).run(
  hash,
  salt,
  user.id
);
db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id);

console.log(
  `\n==============================================================\n` +
    `Password reset for ${user.email}\n` +
    (providedPassword ? `  (the password you provided was accepted)\n` : `  Password:  ${password}\n`) +
    `They'll be required to set a new password on next login, and every\n` +
    `existing session for this account has been signed out.\n` +
    `==============================================================\n`
);
