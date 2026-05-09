export interface WindowCommandOptions {
  width: number;
  height: number;
  title: string;
}

export interface ShowCommandOptions extends WindowCommandOptions {
  formSubmit: boolean;
}

export interface EvalRequest {
  type: 'eval';
  js: string;
}
