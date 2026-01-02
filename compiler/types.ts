export interface ZenFile {
  html: string;
  scripts: ScriptBlock[];
  styles: StyleBlock[];
  functionProps?: Set<string>; // Function names passed as props to components
}

export interface ScriptBlock {
  content: string;
  index: number;
}

export interface StyleBlock {
  content: string;
  index: number;
}

export interface Binding {
  stateName: string;
  nodeIndex: number; // For tracking multiple bindings to the same state
}

export interface StateBinding {
  stateName: string;
  bindings: Binding[];
}

export interface StateDeclaration {
  name: string;
  initialValue: string; // The expression after the = sign
}

