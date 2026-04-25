import { html, LitElement } from 'lit';
import { dialogStyles } from './styles';
import type { DialogContent, DialogState } from './types';

const TEXT_BASE_DURATION_MS = 1_200;
const TEXT_PER_UNIT_MS = 60;
const TEXT_MIN_DURATION_MS = 1_800;
const TEXT_MAX_DURATION_MS = 6_000;
const CHOICES_DURATION_MS = 30_000;

export class DialogElement extends LitElement {
  static override styles = dialogStyles;

  private dialogState: DialogState = { visible: false };
  private closeTimer: number | undefined;

  hide(): void {
    window.clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
    this.dialogState = { visible: false };
    this.requestUpdate();
  }

  show(contents: DialogContent[]): void {
    if (contents.length === 0) {
      this.hide();
      return;
    }

    this.setDialog({ visible: true, contents });

    this.closeTimer = window.setTimeout(
      () => this.hide(),
      getDialogDurationMs(contents),
    );
  }

  protected override render(): unknown {
    if (!this.dialogState.visible) {
      return null;
    }

    const { contents } = this.dialogState;
    const hasChoices = contents.length > 1;

    return html`
      ${hasChoices
        ? html`<div class="overlay" @click=${() => this.hide()}></div>`
        : null}

      <section class="dialog" @click=${(event: Event) => event.stopPropagation()}>
        <div class="header">
          ${hasChoices
            ? null
            : html`<p class="text">${contents[0]?.text ?? ''}</p>`}

          <button
            class="close-button"
            @click=${() => this.hide()}
            aria-label="关闭"
          >
            &times;
          </button>
        </div>

        ${hasChoices
          ? html`
              <div class="choices">
                ${contents.map(
                  (content) => html`
                    <button
                      class="choice"
                      @click=${() => this.selectContent(content)}
                    >
                      ${content.text}
                    </button>
                  `,
                )}
              </div>
            `
          : null}
      </section>
    `;
  }

  private setDialog(state: DialogState): void {
    window.clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
    this.dialogState = state;
    this.requestUpdate();
  }

  private selectContent(content: DialogContent): void {
    this.hide();
    content.onSelect?.();
  }
}

function getDialogDurationMs(contents: DialogContent[]): number {
  if (contents.length > 1) {
    return CHOICES_DURATION_MS;
  }

  return getTextDurationMs(contents[0]?.text ?? '');
}

function getTextDurationMs(text: string): number {
  const duration =
    TEXT_BASE_DURATION_MS + estimateUnits(text) * TEXT_PER_UNIT_MS;

  return Math.min(
    Math.max(duration, TEXT_MIN_DURATION_MS),
    TEXT_MAX_DURATION_MS,
  );
}

function estimateUnits(text: string): number {
  let units = 0;

  for (const ch of text) {
    if (/\p{Script=Han}/u.test(ch)) {
      units += 1;
    } else if (/\p{Alphabetic}|\p{Number}/u.test(ch)) {
      units += 0.5;
    } else if (/\p{White_Space}/u.test(ch)) {
      units += 0.2;
    } else {
      units += 0.3;
    }
  }

  return units;
}

customElements.define('ui-dialog', DialogElement);