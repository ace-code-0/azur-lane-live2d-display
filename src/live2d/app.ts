import * as PIXI from 'pixi.js';

export type PixiApplication = PIXI.Application<PIXI.Renderer>;

export async function createApplication(
  root: HTMLElement,
): Promise<PixiApplication> {
  const app = new PIXI.Application<PIXI.Renderer>();
  await app.init({
    preference: 'webgl',
    resizeTo: window,
    autoDensity: true,
    resolution: window.devicePixelRatio | 1,
    backgroundAlpha: 0,
    antialias: true,
  });
  root.replaceChildren(app.canvas);
  app.stage.eventMode = 'static';
  updateStageHitArea(app);
  return app;
}

export function updateStageHitArea(app: PixiApplication): void {
  app.stage.hitArea = new PIXI.Rectangle(
    0,
    0,
    app.screen.width,
    app.screen.height,
  );
}
