const { scanAndSendReminders } = require('./notificationDelivery');

/**
 * Jalankan scheduler pengingat batas waktu SLA kunjungan (24h, 12h, 3h).
 * Menggunakan timer interval non-blocking agar tidak menambah dependency luar.
 *
 * @param {Function} getSocketFn fungsi getter socket aktif WhatsApp (() => sock)
 * @param {object} [options]
 * @param {number} [options.intervalMs] default 15 menit (15 * 60 * 1000)
 * @param {boolean} [options.runImmediately] default true (langsung scan saat start)
 * @returns {{stop: Function}} handle untuk menghentikan timer saat shutdown
 */
function startNotificationScheduler(getSocketFn, options = {}) {
  const intervalMs = options.intervalMs || 15 * 60 * 1000;
  const runImmediately = options.runImmediately !== false;
  let isRunning = false;
  let timer = null;

  async function executeScan() {
    if (isRunning) return;
    isRunning = true;
    try {
      const sock = typeof getSocketFn === 'function' ? getSocketFn() : null;
      if (!sock && !options.allowDisconnected) {
        // WhatsApp belum terhubung / putus -> lewati siklus scan ini tanpa error beruntun
        return;
      }
      const summary = await scanAndSendReminders(sock, {
        now: new Date(),
        dryRun: false
      });
      if (summary.sent > 0 || summary.errors > 0) {
        console.log(
          `[SCHEDULER] Scan selesai: scanned=${summary.scanned}, sent=${summary.sent}, errors=${summary.errors}`
        );
      }
    } catch (err) {
      console.error('[SCHEDULER] Error saat scan pengingat SLA:', err.message);
    } finally {
      isRunning = false;
    }
  }

  if (runImmediately) {
    executeScan().catch(() => {});
  }

  timer = setInterval(executeScan, intervalMs);
  console.log(`[SCHEDULER] Pengingat SLA aktif (interval: ${Math.round(intervalMs / 1000)}s)`);

  return {
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
        console.log('[SCHEDULER] Pengingat SLA dihentikan.');
      }
    }
  };
}

module.exports = { startNotificationScheduler };
