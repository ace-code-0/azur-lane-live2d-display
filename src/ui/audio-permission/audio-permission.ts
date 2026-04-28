import { LitElement, css, html } from 'lit';

const silentAudio =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==';

class AudioPermissionOverlay extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: grid;
      place-items: center;
      background: rgba(17, 17, 17, 0.92);
    }

    button {
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 14px 18px;
      color: #fff;
      font: 16px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
        sans-serif;
      background: rgba(255, 255, 255, 0.1);
      cursor: pointer;
    }

    button:hover {
      background: rgba(255, 255, 255, 0.16);
    }
  `;

  render() {
    return html`
      <button type="button" @click=${this.#handleClick}>
        点击授权音频权限以继续
      </button>
    `;
  }

  async #handleClick() {
    await unlockAudioPlayback();
    this.dispatchEvent(
      new CustomEvent('audio-permission-ready', {
        bubbles: true,
        composed: true,
      }),
    );
    this.remove();
  }
}

customElements.define('audio-permission-overlay', AudioPermissionOverlay);

window.audioPlaybackPermissionReady = new Promise((resolve) => {
  const showOverlay = () => {
    const overlay = document.createElement('audio-permission-overlay');

    overlay.addEventListener(
      'audio-permission-ready',
      () => {
        resolve();
      },
      { once: true },
    );

    document.body.append(overlay);
  };

  if (document.body) {
    showOverlay();
    return;
  }

  document.addEventListener('DOMContentLoaded', showOverlay, { once: true });
});

async function unlockAudioPlayback() {
  const audio = new Audio(silentAudio);
  await audio.play();
  audio.pause();
  audio.remove();
}