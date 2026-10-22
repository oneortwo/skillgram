export type StepType = 'action' | 'gate' | 'human' | 'human gate' | 'skill';
export type Severity = 'error' | 'warning';
export type Join = 'any' | 'all';
export type DiffKind = 'added' | 'removed' | 'changed' | 'renamed';

export interface Problem {
  code: string;
  severity: Severity;
  /** 1-based line number. */
  line: number;
  message: string;
  /** Id of the step the problem belongs to, if any. */
  stepId: string | null;
}

export interface Step {
  id: string;
  name: string;
  /** 1-based line of the step heading. */
  line: number;
  type: StepType;
  outcomes: string[];
  skill: string | null;
  until: string | null;
  join: Join | null;
  /** Instructions, joined into one line with light Markdown removed. */
  text: string;
  /** Raw directive values by canonical key. */
  directives: Record<string, string>;
  /** 1-based line of each directive by canonical key. */
  directiveLines: Record<string, number>;
  /** True when the step has at least one error. */
  invalid: boolean;
  start: boolean;
  end: boolean;
  diff?: DiffKind;
  diffNotes?: string[];
}

export interface Edge {
  from: Step;
  to: Step;
  outcome: string | null;
  /** True when the dependency has an error but the edge is still drawn. */
  invalid: boolean;
  diff?: 'added' | 'removed';
}

export interface Model {
  steps: Step[];
  edges: Edge[];
  problems: Problem[];
  /** 1-based line of the `## Steps` heading, or null. */
  sectionLine: number | null;
}

export interface Change {
  kind: DiffKind;
  stepId: string;
  message: string;
}

export interface DiffModel {
  steps: Step[];
  edges: Edge[];
  changes: Change[];
}
