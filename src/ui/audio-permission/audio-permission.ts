import { LitElement, html } from "lit";
import { audioPermissionStyles } from "./styles";

const silentAudio =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==";

async function unlockAudioPlayback() {
  const audio = new Audio(silentAudio);
  await audio.play();
  audio.pause();
  audio.remove();
}
class AudioPermissionOverlay extends LitElement {
  static override styles = audioPermissionStyles;
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
      new CustomEvent("audio-permission-ready", {
        bubbles: true,
        composed: true,
      }),
    );
    this.remove();
  }
}

export async function checkAudioPermission() {
  return new Promise<void>((resolve) => {
    const showOverlay = () => {
      const overlay = document.createElement("audio-permission-overlay");
      overlay.addEventListener(
        "audio-permission-ready",
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
    } else {
      document.addEventListener("DOMContentLoaded", showOverlay, {
        once: true,
      });
    }
  });
}

customElements.define("audio-permission-overlay", AudioPermissionOverlay);
