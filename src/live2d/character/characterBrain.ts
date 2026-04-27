export type CharacterState =
  | 'start'
  | 'idle'
  | 'reacting'
  | 'dragging'
  | 'leaving';

export type CharacterEvent =
  | { type: 'MOTION_DONE' }
  | { type: 'MOTION_REQUEST'; motion: string }
  | { type: 'TOUCH'; area: string; motion?: string }
  | { type: 'DRAG_START'; area: string; motion?: string }
  | { type: 'DRAG_END' }
  | { type: 'IDLE_TIMEOUT' };

export function transitionCharacterState(
  state: CharacterState,
  event: CharacterEvent,
): CharacterState {
  switch (state) {
    case 'start':
      return event.type === 'MOTION_DONE' ? 'idle' : state;

    case 'idle':
      if (event.type === 'MOTION_REQUEST') {
        return 'reacting';
      }

      if (event.type === 'TOUCH') {
        return 'reacting';
      }

      if (event.type === 'DRAG_START') {
        return 'dragging';
      }

      if (event.type === 'IDLE_TIMEOUT') {
        return 'leaving';
      }

      return state;

    case 'reacting':
      return event.type === 'MOTION_DONE' ? 'idle' : state;

    case 'dragging':
      return event.type === 'DRAG_END' || event.type === 'MOTION_DONE'
        ? 'idle'
        : state;

    case 'leaving':
      return event.type === 'MOTION_DONE' ? 'idle' : state;
  }
}
