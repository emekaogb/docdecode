export enum Type {
  TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
  STRING = "STRING",
  NUMBER = "NUMBER",
  INTEGER = "INTEGER",
  BOOLEAN = "BOOLEAN",
  ARRAY = "ARRAY",
  OBJECT = "OBJECT",
  NULL = "NULL",
}

export interface ExplanationSlide {
  topic: string;
  content: string;
  laymanSummary: string;
}

export interface DischargeAnalysis {
  slides: ExplanationSlide[];
  overallSummary: string;
}

export interface Message {
  role: 'user' | 'model';
  text: string;
}

export interface HistoryItem {
  id: number;
  timestamp: string;
  original_input: string;
  analysis_json: string;
}
