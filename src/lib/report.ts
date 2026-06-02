import type { RiskLevel } from "./analysis";

export type ReportClause = {
  number: number;
  text: string;
  riskLevel: RiskLevel;
  explanation: string;
  ambiguousTerms: string[];
  recommendations: string[];
};

export type ReportGroup = {
  riskLevel: RiskLevel;
  clauses: ReportClause[];
};

export type ReviewReport = {
  generatedAt: string;
  stats: {
    totalClauses: number;
    analysedClauses: number;
    byRisk: Record<RiskLevel, number>;
    clausesWithAmbiguity: number;
    totalRecommendations: number;
  };
  groups: ReportGroup[];
};

type ClauseWithAnalysis = {
  index: number;
  text: string;
  analysis: {
    riskLevel: RiskLevel;
    explanation: string;
    ambiguousTerms: string[];
    recommendations: string[];
  } | null;
};

// Highest-severity first so the reviewer tackles the riskiest clauses up top.
const RISK_ORDER: RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export function buildReviewReport(clauses: ClauseWithAnalysis[]): ReviewReport {
  const byRisk: Record<RiskLevel, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  let clausesWithAmbiguity = 0;
  let totalRecommendations = 0;
  let analysedClauses = 0;

  const reportClauses: ReportClause[] = [];
  for (const clause of clauses) {
    const a = clause.analysis;
    if (!a) continue;
    analysedClauses++;
    byRisk[a.riskLevel]++;
    if (a.ambiguousTerms.length > 0) clausesWithAmbiguity++;
    totalRecommendations += a.recommendations.length;
    reportClauses.push({
      number: clause.index,
      text: clause.text,
      riskLevel: a.riskLevel,
      explanation: a.explanation,
      ambiguousTerms: a.ambiguousTerms,
      recommendations: a.recommendations,
    });
  }

  const groups: ReportGroup[] = RISK_ORDER.map((riskLevel) => ({
    riskLevel,
    clauses: reportClauses
      .filter((c) => c.riskLevel === riskLevel)
      .sort((a, b) => a.number - b.number),
  })).filter((g) => g.clauses.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      totalClauses: clauses.length,
      analysedClauses,
      byRisk,
      clausesWithAmbiguity,
      totalRecommendations,
    },
    groups,
  };
}
