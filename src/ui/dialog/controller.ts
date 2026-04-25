import './element';
import type { DialogElement } from './element';
import type { DialogContent } from './types';

let dialog: DialogElement | undefined;

function getDialog(): DialogElement {
  if (dialog) {
    return dialog;
  }

  dialog = document.createElement('ui-dialog') as DialogElement;
  document.body.append(dialog);

  return dialog;
}

export const dialogController = {
  show(contents: DialogContent[]): void {
    getDialog().show(contents);
  },

  hide(): void {
    dialog?.hide();
  },
};