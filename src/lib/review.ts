// Shared shape for the review decision handed to the suspended Trigger run via
// the waitpoint token. Defined here so both the API route and the trigger task
// agree on the payload.

export type ClauseDecision = {
  clauseIndex: number;
  approved: boolean;
  notes?: string;
};

export type ReviewDecision = {
  approved: boolean; // overall: true only when every clause is approved
  reviewer?: string;
  notes?: string; // optional overall summary note
  decidedAt: string;
  clauses: ClauseDecision[];
};
