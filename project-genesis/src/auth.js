// Accounts for humans (name + password) and AI agents (API key).
// Passwords use scrypt; tokens/keys are random and stored only as SHA-256.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const NAME_RE = /^[A-Za-z0-9_-]{3,24}$/;
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export class AuthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export class Auth {
  constructor(db) {
    this.db = db;
    this.qInsert = db.prepare(
      'INSERT INTO accounts(kind, name, name_key, pass_hash, persona, goals, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)');
    this.qByNameKey = db.prepare('SELECT * FROM accounts WHERE name_key = ?');
    this.qById = db.prepare('SELECT * FROM accounts WHERE id = ?');
    this.qToken = db.prepare('INSERT INTO tokens(token_hash, account_id, created_at) VALUES(?, ?, ?)');
    this.qByToken = db.prepare('SELECT a.* FROM tokens t JOIN accounts a ON a.id = t.account_id WHERE t.token_hash = ?');
  }

  #validateName(name) {
    if (typeof name !== 'string' || !NAME_RE.test(name))
      throw new AuthError(400, 'name must be 3-24 chars: letters, digits, _ or -');
    if (this.qByNameKey.get(name.toLowerCase())) throw new AuthError(409, 'name already taken');
  }

  #issueToken(accountId, prefix) {
    const token = prefix + randomBytes(32).toString('base64url');
    this.qToken.run(sha256(token), accountId, Date.now());
    return token;
  }

  registerHuman(name, password) {
    this.#validateName(name);
    if (typeof password !== 'string' || password.length < 8 || password.length > 200)
      throw new AuthError(400, 'password must be 8-200 characters');
    const r = this.qInsert.run('human', name, name.toLowerCase(), hashPassword(password), '', '', Date.now());
    const id = Number(r.lastInsertRowid);
    return { account: this.publicAccount(this.qById.get(id)), token: this.#issueToken(id, 'gh_') };
  }

  login(name, password) {
    const acc = typeof name === 'string' ? this.qByNameKey.get(name.toLowerCase()) : null;
    // Run scrypt even when the account is missing so timing does not leak existence.
    const ok = verifyPassword(String(password ?? ''), acc?.pass_hash ?? 'scrypt$00$' + '00'.repeat(32));
    if (!acc || acc.kind !== 'human' || !ok) throw new AuthError(401, 'invalid name or password');
    return { account: this.publicAccount(acc), token: this.#issueToken(acc.id, 'gh_') };
  }

  registerAgent(name, persona = '', goals = '') {
    this.#validateName(name);
    if (typeof persona !== 'string' || persona.length > 2000) throw new AuthError(400, 'persona must be a string <= 2000 chars');
    if (typeof goals !== 'string' || goals.length > 2000) throw new AuthError(400, 'goals must be a string <= 2000 chars');
    const r = this.qInsert.run('agent', name, name.toLowerCase(), null, persona, goals, Date.now());
    const id = Number(r.lastInsertRowid);
    return { account: this.publicAccount(this.qById.get(id)), apiKey: this.#issueToken(id, 'ga_') };
  }

  resolve(token) {
    if (typeof token !== 'string' || token.length < 10 || token.length > 200) return null;
    return this.qByToken.get(sha256(token)) ?? null;
  }

  publicAccount(a) {
    return { id: a.id, kind: a.kind, name: a.name, persona: a.persona, goals: a.goals, createdAt: a.created_at };
  }
}
