
export interface Prize {
  id: string;
  name: string;
  count: number;
  description: string;
  announced: boolean;
}

export interface ScriptItem {
  id: string;
  title: string;
  content: string;
}

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}
