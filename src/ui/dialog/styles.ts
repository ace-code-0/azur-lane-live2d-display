import { css } from 'lit';

export const dialogStyles = css`
  :host {
    position: fixed;
    inset: 0;
    z-index: 1000;
    pointer-events: none;
    color: #f8fafc;
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
  }

  .overlay {
    position: absolute;
    inset: 0;
    background: rgb(0 0 0 / 15%);
    pointer-events: auto;
    backdrop-filter: blur(1px);
  }

  .dialog {
    position: absolute;
    left: 50%;
    bottom: max(32px, env(safe-area-inset-bottom));
    width: min(360px, calc(100vw - 40px));
    padding: 14px 18px;
    border: 1px solid rgb(255 255 255 / 12%);
    border-radius: 12px;
    background: rgb(15 23 42 / 92%);
    box-shadow: 0 10px 30px rgb(0 0 0 / 50%);
    backdrop-filter: blur(20px);
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    transform: translateX(-50%);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
  }

  .text {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.5;
    overflow-wrap: anywhere;
    text-shadow: 0 1px 2px rgb(0 0 0 / 40%);
    flex: 1;
    color: rgb(255 255 255 / 90%);
  }

  .close-button {
    background: none;
    border: none;
    color: rgb(255 255 255 / 60%);
    cursor: pointer;
    padding: 4px;
    margin: -4px -4px 0 8px;
    font-size: 20px;
    line-height: 1;
    border-radius: 4px;
    transition:
      color 0.2s,
      background 0.2s;
  }

  .close-button:hover {
    color: #fff;
    background: rgb(255 255 255 / 10%);
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  button.choice {
    min-height: 44px;
    padding: 8px 16px;
    border: 1px solid rgb(255 255 255 / 20%);
    border-radius: 8px;
    background: rgb(255 255 255 / 8%);
    color: inherit;
    font: inherit;
    font-weight: 500;
    text-align: left;
    line-height: 1.4;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  button.choice:hover {
    background: rgb(255 255 255 / 18%);
    border-color: rgb(255 255 255 / 40%);
    transform: translateY(-1px);
  }

  button.choice:active {
    transform: translateY(0);
  }

  button:focus-visible {
    outline: 2px solid #f8fafc;
    outline-offset: 2px;
  }
`;
