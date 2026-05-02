export type DialogContent = {
  text: string;
  onSelect?: () => void;
};

export type DialogState =
  | {
      visible: false;
    }
  | {
      visible: true;
      contents: DialogContent[];
    };