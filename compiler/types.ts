export interface ZenFile {
  html: string;
  scripts: ScriptBlock[];
  styles: StyleBlock[];
}

export interface ScriptBlock {
  content: string;
  index: number;
}

export interface StyleBlock {
  content: string;
  index: number;
}

