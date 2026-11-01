# AGENTS.md

## Project Setup

Aplikasi monitoring kunjungan Jasa Raharja (Bot WA Baileys + REST API Express + MySQL).

- **Install:** `npm install`
- **Jalankan:** `node server.js` (atau `npm start`)
- **Database:** Import `schema.sql` ke MySQL database `db_monitoring_jr`
- **Konfigurasi:** Salin `.env.example` ke `.env`
- **Entry point:** `server.js` -> `src/server.js`
- **Testing:** `node tests/unit_test.js` (unit test parser & geo)
