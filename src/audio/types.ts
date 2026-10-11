export interface Track {
  id: string;
  name: string;
  shortName: string;
  sampleFile: string;
}

export type Pattern = Record<string, boolean[]>;
