#!/usr/bin/env node
/**
 * Prints the value to put in DASHBOARD_PASSWORD_VIEW_HASH or
 * DASHBOARD_PASSWORD_ADMIN_HASH for a password you type, plus a fresh
 * DASHBOARD_SESSION_SECRET. The password is read from the terminal with echo
 * off (or from stdin when piped), never from an argument, so it does not land
 * in shell history or `ps` output. Nothing is written anywhere.
 *
 *   npm run password-hash
 *   echo -n 'the password' | npm run -s password-hash
 *
 * Same scrypt settings as src/auth/password.ts (OWASP N=2^15, r=8, p=3).
 */
import { randomBytes, scryptSync } from "node:crypto";
import { stdin, stdout } from "node:process";

const LOG_N = 15;
const R = 8;
const P = 3;
/** NIST SP 800-63B minimum for a password a person chooses. */
const MIN_LENGTH = 8;

function hash(password) {
  const salt = randomBytes(16);
  const N = 2 ** LOG_N;
  const key = scryptSync(Buffer.from(password, "utf8"), salt, 32, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return ["scrypt", LOG_N, R, P, salt.toString("base64url"), key.toString("base64url")].join(":");
}

/**
 * Hidden input on a terminal, with the documented tty API: raw mode turns off
 * the terminal's own echo and line editing (node:tty, setRawMode), so the
 * script reads keys itself: Enter finishes, Backspace deletes, Ctrl-C quits,
 * escape sequences (arrow keys) are ignored.
 */
function readHidden(prompt) {
  return new Promise((resolve) => {
    let value = "";
    const finish = (code) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      if (code !== undefined) process.exit(code);
      resolve(value);
    };
    const onData = (chunk) => {
      if (chunk.startsWith("\u001b")) return;
      for (const ch of chunk) {
        if (ch === "\u0003") return finish(130);
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdout.write(prompt);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function readPassword() {
  if (stdin.isTTY) return readHidden("Password (not shown): ");
  let data = "";
  for await (const chunk of stdin) data += chunk;
  return data.replace(/\r?\n$/, "");
}

const password = await readPassword();
if (password.length < MIN_LENGTH) {
  console.error(`Use at least ${MIN_LENGTH} characters: this password guards the whole dashboard.`);
  process.exit(1);
}
console.log(`\nHash of the password you just typed (paste as DASHBOARD_PASSWORD_VIEW_HASH or DASHBOARD_PASSWORD_ADMIN_HASH, whichever that password is):\n${hash(password)}`);
console.log(`\nA fresh random session secret, unrelated to the password (DASHBOARD_SESSION_SECRET; you need one, from any run):\n${randomBytes(32).toString("base64url")}\n`);
