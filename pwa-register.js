const KSR_PWA_VERSION = '2026.07.12.1';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`./service-worker.js?v=${KSR_PWA_VERSION}`, { scope: './' });
      registration.update();
    } catch (error) {
      console.error('KSR PWA registration failed:', error);
    }
  });
}
