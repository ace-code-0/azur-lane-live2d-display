import { css, html, LitElement } from 'lit';

import type { Choice, MotionItem } from '../live2d/modelSettings';

const TEXT_BASE_DURATION_MS = 500;
const TEXT_PER_CHARACTER_MS = 90;
const CHOICES_DURATION_MS = 30000;

type DialogState =
  | {
      visible: false;
    }
  | {
      visible: true;
      text: string;
      choices: Choice[];
    };

export class ModelDialogElement extends LitElement {
  static override properties = {
    state: { state: true },
  };

  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 10;
      pointer-events: none;
      color: #f8fafc;
      font-family:
        Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
        "Segoe UI", sans-serif;
    }

    .dialog {
      position: absolute;
      left: 50%;
      bottom: max(24px, env(safe-area-inset-bottom));
      width: min(720px, calc(100vw - 32px));
      transform: translateX(-50%);
      padding: 16px 18px;
      border: 1px solid rgb(255 255 255 / 24%);
      border-radius: 8px;
      background: rgb(8 13 22 / 76%);
      box-shadow: 0 18px 50px rgb(0 0 0 / 38%);
      backdrop-filter: blur(16px);
      pointer-events: auto;
    }

    .text {
      margin: 0;
      font-size: 16px;
      line-height: 1.65;
      overflow-wrap: anywhere;
      text-shadow: 0 1px 2px rgb(0 0 0 / 40%);
    }

    .choices {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
      gap: 8px;
      margin-top: 14px;
    }

    button {
      min-height: 38px;
      border: 1px solid rgb(255 255 255 / 22%);
      border-radius: 6px;
      background: rgb(255 255 255 / 12%);
      color: inherit;
      font: inherit;
      line-height: 1.2;
      cursor: pointer;
    }

    button:hover {
      background: rgb(255 255 255 / 20%);
    }

    button:focus-visible {
      outline: 2px solid #f8fafc;
      outline-offset: 2px;
    }
  `;

  private declare state: DialogState;
  private closeTimer: number | undefined;
  private choiceHandler: ((choice: Choice) => void) | undefined;

  constructor() {
    super();
    this.state = { visible: false };
  }

  showMotion(
    motion: MotionItem,
    onChoice: (choice: Choice) => void,
  ): void {
    if (motion.Choices) {
      this.showChoices(motion.Text ?? '', motion.Choices, onChoice);
      return;
    }

    if (motion.Text) {
      this.showText(motion.Text);
    }
  }

  hide(): void {
    window.clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
    this.choiceHandler = undefined;
    this.state = { visible: false };
  }

  protected override render(): unknown {
    if (!this.state.visible) {
      return null;
    }

    return html`
      <section class="dialog">
        ${this.state.text ? html`<p class="text">${this.state.text}</p>` : null}
        ${this.state.choices.length
          ? html`
              <div class="choices">
                ${this.state.choices.map(
                  (choice) => html`
                    <button @click=${() => this.selectChoice(choice)}>
                      ${choice.Text}
                    </button>
                  `,
                )}
              </div>
            `
          : null}
      </section>
    `;
  }

  private showText(text: string): void {
    this.setDialog({ visible: true, text, choices: [] });
    this.closeTimer = window.setTimeout(
      () => this.hide(),
      getTextDurationMs(text),
    );
  }

  private showChoices(
    text: string,
    choices: Choice[],
    onChoice: (choice: Choice) => void,
  ): void {
    this.choiceHandler = onChoice;
    this.setDialog({ visible: true, text, choices });
    this.closeTimer = window.setTimeout(() => this.hide(), CHOICES_DURATION_MS);
  }

  private setDialog(state: DialogState): void {
    window.clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
    this.state = state;
  }

  private selectChoice(choice: Choice): void {
    const choiceHandler = this.choiceHandler;

    this.hide();
    choiceHandler?.(choice);
  }
}

export function createModelDialog(root: HTMLElement): ModelDialogElement {
  const dialog = document.createElement('model-dialog') as ModelDialogElement;
  root.append(dialog);

  return dialog;
}

function getTextDurationMs(text: string): number {
  return TEXT_BASE_DURATION_MS + Array.from(text).length * TEXT_PER_CHARACTER_MS;
}

customElements.define('model-dialog', ModelDialogElement);
