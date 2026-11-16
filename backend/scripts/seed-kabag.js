#!/usr/bin/env node
/**
 * Seed akun Kabag pertama.
 * Jalankan dari folder backend:
 *   node scripts/seed-kabag.js
 * Atau dengan variabel environment:
 *   KABAG_USERNAME=admin KABAG_PASSWORD=rahasia node scripts/seed-kabag.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const DEFAULT_USERNAME = 'kabag';

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const username = process.env.KABAG_USERNAME || (await ask('Username Kabag (default: kabag): ')) || DEFAULT_USERNAME;
  let password = process.env.KABAG_PASSWORD;
  if (!password) {
    password = await ask('Password Kabag (min. 8 karakter): ');
    if (password.length < 8) {
      console.error('Password minimal 8 karakter.');
      process.exit(1);
    }
  }

  const conn = await pool.getConnection();
  try {
    const hash = await bcrypt.hash(password, 10);
    const [existing] = await conn.execute(
      'SELECT id, username, role FROM users WHERE username = ?',
      [username]
    );
    if (existing.length > 0) {
      console.log(`User "${username}" sudah ada (role: ${existing[0].role}). Update password? (y/N)`);
      const answer = await ask('');
      if (answer.toLowerCase() === 'y') {
        await conn.execute('UPDATE users SET password_hash = ?, is_active = 1 WHERE username = ?', [hash, username]);
        console.log(`Password "${username}" diperbarui.`);
      } else {
        console.log('Tidak ada perubahan.');
      }
      process.exit(0);
    }

    await conn.execute(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, hash, 'kabag']
    );
    console.log(`Akun Kabag "${username}" berhasil dibuat.`);
  } catch (err) {
    console.error('Gagal seed Kabag:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
