(function () {
  const silentAudio =
    'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==';

  window.audioPlaybackPermissionReady = new Promise((resolve) => {
    const showOverlay = () => {
      const overlay = document.createElement('div');
      overlay.className = 'audio-permission-overlay';

      const button = document.createElement('button');
      button.className = 'audio-permission-button';
      button.type = 'button';
      button.textContent = '点击授权音频权限以继续';

      overlay.append(button);
      document.body.append(overlay);

      button.addEventListener(
        'click',
        () => {
          void unlockAudioPlayback().finally(() => {
            overlay.remove();
            resolve();
          });
        },
        { once: true },
      );
    };

    if (document.body) {
      showOverlay();
      return;
    }

    document.addEventListener('DOMContentLoaded', showOverlay, { once: true });
  });

  async function unlockAudioPlayback() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (AudioContextClass) {
      const audioContext = new AudioContextClass();
      await audioContext.resume();
      await audioContext.close();
    }

    const audio = new Audio(silentAudio);
    audio.muted = true;
    audio.volume = 0;
    await audio.play();
    audio.pause();
    audio.remove();
  }
})();
