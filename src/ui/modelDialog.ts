import { html, LitElement } from 'lit';
import { modelDialogStyles } from './modelDialog.styles';

const TEXT_BASE_DURATION_MS = 1_200;
const TEXT_PER_UNIT_MS = 60;
const TEXT_MIN_DURATION_MS = 1_800;
const TEXT_MAX_DURATION_MS = 6_000;
const CHOICES_DURATION_MS = 30_000;

function estimateUnits(text: string): number {
  let units = 0;

  for (const ch of text) {
    if (/\p{Script=Han}/u.test(ch)) {
      // 所有汉字（完整覆盖 CJK）
      units += 1;
    } else if (/\p{Alphabetic}|\p{Number}/u.test(ch)) {
      // 所有语言字母 + 数字（不止 ASCII）
      units += 0.5;
    } else if (/\p{White_Space}/u.test(ch)) {
      // 所有空白字符
      units += 0.2;
    } else if (/\p{Punctuation}/u.test(ch)) {
      // 标点符号
      units += 0.3;
    } else {
      // 其他符号（emoji、控制符等）
      units += 0.3;
    }
  }

  return units;
}

type ModelDialogState =
  | {
      visible: false;
    }
  | {
      visible: true;
      text: string;
      choices: DialogChoice[];
    };

export type DialogChoice = {
  label: string;
  onSelect: () => void;
};

export class ModelDialogElement extends LitElement {
  static override styles = modelDialogStyles;
  private dialogState: ModelDialogState = { visible: false };
  private closeTimer: number | undefined;

  get isVisible(): boolean {
    return this.dialogState.visible;
  }

  hide(): void {
    window.clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
    this.dialogState = { visible: false };
    this.requestUpdate();
  }

  protected override render(): unknown {
    if (!this.dialogState.visible) {
      return null;
    }

    const hasChoices = this.dialogState.choices.length > 0;

    return html`
      ${hasChoices
        ? html`<div class="overlay" @click=${() => this.hide()}></div>`
        : null}
      <section class="dialog" @click=${(e: Event) => e.stopPropagation()}>
        <div class="header">
          ${this.dialogState.text
            ? html`<p class="text">${this.dialogState.text}</p>`
            : html`<div class="text"></div>`}
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
                ${this.dialogState.choices.map(
                  (choice) => html`
                    <button
                      class="choice"
                      @click=${() => this.selectChoice(choice)}
                    >
                      ${choice.label}
                    </button>
                  `,
                )}
              </div>
            `
          : null}
      </section>
    `;
  }

  showText(text: string): void {
    this.setDialog({ visible: true, text, choices: [] });
    this.closeTimer = window.setTimeout(
      () => this.hide(),
      getTextDurationMs(text),
    );
  }

  showChoices(
    text: string,
    choices: DialogChoice[],
  ): void {
    this.setDialog({ visible: true, text, choices });
    this.closeTimer = window.setTimeout(() => this.hide(), CHOICES_DURATION_MS);
  }

  private setDialog(state: ModelDialogState): void {
    window.clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
    this.dialogState = state;
    this.requestUpdate();
  }

  private selectChoice(choice: DialogChoice): void {
    const onSelect = choice.onSelect;

    this.hide();
    onSelect();
  }
}

export function createModelDialog(root: HTMLElement): ModelDialogElement {
  const dialog = document.createElement('model-dialog') as ModelDialogElement;
  root.append(dialog);

  return dialog;
}

function getTextDurationMs(text: string): number {
  const duration =
    TEXT_BASE_DURATION_MS + estimateUnits(text) * TEXT_PER_UNIT_MS;

  return Math.min(
    Math.max(duration, TEXT_MIN_DURATION_MS),
    TEXT_MAX_DURATION_MS,
  );
}

customElements.define('model-dialog', ModelDialogElement);
