import { html, LitElement } from "lit";
import { dialogStyles } from "./styles";
import type { DialogContent, DialogState } from "./types";
import log from "loglevel";

export class DialogElement extends LitElement {
  static override styles = dialogStyles;

  private dialogState: DialogState = { visible: false };

  hide(): void {
    this.dialogState = { visible: false };
    this.requestUpdate();
  }

  show(contents: DialogContent[]): void {
    if (contents.length === 0) {
      log.info("show(contents: DialogContent[]), No dialog content to display");
      this.hide();
      return;
    }
    this.setDialog({ visible: true, contents });
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

      <div
        class=${hasChoices ? "dialog has-choices" : "dialog"}
        @click=${(event: Event) => event.stopPropagation()}
      >
        <button
          class="close-button"
          @click=${() => this.hide()}
          aria-label="关闭"
        >
          &times;
        </button>

        ${hasChoices
          ? null
          : html`<p class="text">${contents[0]?.text ?? ""}</p>`}
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
      </div>
    `;
  }

  private setDialog(state: DialogState): void {
    this.dialogState = state;
    this.requestUpdate();
  }

  private selectContent(content: DialogContent): void {
    this.hide();
    content.onSelect?.();
  }
}
customElements.define("ui-dialog", DialogElement);
