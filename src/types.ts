export type Shape = "rectangle" | "ellipse" | "diamond";

export type Color =
  | "default"
  | "red"
  | "green"
  | "blue"
  | "yellow"
  | "violet"
  | "orange";

export type Direction = "down" | "right";

export type Font = "normal" | "hand-drawn" | "code";

export type EdgeStyle = "solid" | "dashed" | "dotted";

export interface NodeSpec {
  id: string;
  label: string;
  shape?: Shape;
  color?: Color;
}

export interface EdgeSpec {
  from: string;
  to: string;
  label?: string;
  style?: EdgeStyle;
}

export interface DiagramSpec {
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  direction?: Direction;
  font?: Font;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Any Excalidraw element, loosely typed — we only build a known subset. */
export type ExcalidrawElement = Record<string, unknown> & {
  id: string;
  type: string;
};

export interface Scene {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: ExcalidrawElement[];
  appState: Record<string, unknown>;
  files: Record<string, never>;
}
