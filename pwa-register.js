const KSR_PWA_VERSION = '2026.07.13.2';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        `./service-worker.js?v=${encodeURIComponent(KSR_PWA_VERSION)}`,
        { scope: './', updateViaCache: 'none' }
      );
      await registration.update();
    } catch (error) {
      console.error('KSR PWA registration failed:', error);
    }
  });
}
