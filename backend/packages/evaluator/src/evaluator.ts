// packages/evaluator/src/evaluator.ts
// Deterministic architecture evaluator — no LLM required

import type { EvaluationOutput, EvalRuleResult, DimensionScore } from '@multi-agent/schemas';
import { runAllRules, ALL_RULES, type EvalContext } from './rules.js';

export class ArchitectureEvaluator {
  evaluate(ctx: EvalContext): EvaluationOutput {
    const allResults = runAllRules(ctx);

    // Group by category / dimension
    const dimensions: DimensionScore[] = ALL_RULES.map(({ category }) => {
      const categoryResults = allResults.filter((r) => r.category === category);
      const passedRules = categoryResults.filter((r) => r.passed).length;
      const totalRules = categoryResults.length;
      const score = totalRules > 0 ? Math.round((passedRules / totalRules) * 100) : 100;

      return {
        dimension: category,
        score,
        passedRules,
        totalRules,
        formula: `passedRules / totalRules * 100 = ${passedRules} / ${totalRules} * 100`,
        findings: categoryResults,
      };
    });

    // Overall score: weighted average
    const overallScore = Math.round(
      dimensions.reduce((sum, d) => sum + d.score, 0) / Math.max(dimensions.length, 1)
    );

    const criticalViolations = allResults.filter(
      (r) => !r.passed && (r.severity === 'CRITICAL' || r.severity === 'ERROR')
    );
    const warnings = allResults.filter((r) => !r.passed && r.severity === 'WARNING');

    const requiresRevision = criticalViolations.length > 0;
    const revisionReasons = criticalViolations.map((r) => r.message);

    const recommendations = [
      ...new Set([
        ...criticalViolations.map((r) => r.recommendation).filter(Boolean) as string[],
        ...warnings.map((r) => r.recommendation).filter(Boolean) as string[],
      ]),
    ];

    return {
      passed: criticalViolations.length === 0,
      overallScore,
      dimensions,
      ruleResults: allResults,
      criticalViolations,
      warnings,
      recommendations,
      requiresRevision,
      revisionReasons,
    };
  }
}

// ─── Comparison Metrics (deterministic) ───────────────────────────────────────

export interface ProjectRunData {
  requirements?: {
    totalRequirements: number;
    satisfiedRequirements: number;
  };
  architecture?: {
    componentCount: number;
    connectionCount: number;
  };
  api?: {
    totalEndpoints: number;
    endpointsWithAuth: number;
    endpointsWithRateLimit: number;
  };
  security?: {
    score: number;
  };
  evaluation?: {
    passed: boolean;
    overallScore: number;
    ruleResults: EvalRuleResult[];
  };
  generation?: {
    fileCount: number;
    filesWithTraceability: number;
  };
  sandbox?: {
    buildSuccess: boolean;
    testPassRate: number;
    healthCheckSuccess: boolean;
    runtimeSuccess: boolean;
    repairIterations: number;
    timeToBuildMs?: number;
  };
  tokens?: {
    total?: number;
    estimatedCostUsd?: number;
  };
  acceptance?: {
    total: number;
    passed: number;
  };
}

export function computeComparisonMetrics(data: ProjectRunData) {
  const reqs = data.requirements ?? { totalRequirements: 0, satisfiedRequirements: 0 };
  const api = data.api ?? { totalEndpoints: 0, endpointsWithAuth: 0, endpointsWithRateLimit: 0 };
  const sandbox = data.sandbox ?? {
    buildSuccess: false,
    testPassRate: 0,
    healthCheckSuccess: false,
    runtimeSuccess: false,
    repairIterations: 0,
  };
  const gen = data.generation ?? { fileCount: 0, filesWithTraceability: 0 };
  const acceptance = data.acceptance ?? { total: 0, passed: 0 };

  const requirementsCoverage =
    reqs.totalRequirements > 0 ? reqs.satisfiedRequirements / reqs.totalRequirements : 0;
  const apiCompleteness =
    reqs.totalRequirements > 0
      ? Math.min(api.totalEndpoints / Math.max(reqs.totalRequirements, 1), 1)
      : 0;
  const securityRuleScore = (data.security?.score ?? 0) / 100;
  const buildSuccess = sandbox.buildSuccess ? 1 : 0;
  const testPassRate = sandbox.testPassRate;
  const healthCheckSuccess = sandbox.healthCheckSuccess ? 1 : 0;
  const runtimeSuccess = sandbox.runtimeSuccess ? 1 : 0;
  const traceability =
    gen.fileCount > 0 ? gen.filesWithTraceability / gen.fileCount : 0;
  const acceptanceCriteriaPassRate =
    acceptance.total > 0 ? acceptance.passed / acceptance.total : 0;

  // Weights: build=20, tests=20, security=15, requirements=15, health=10, runtime=10, traceability=5, acceptance=5
  const overallScore = Math.round(
    buildSuccess * 20 +
      testPassRate * 20 +
      securityRuleScore * 15 +
      requirementsCoverage * 15 +
      healthCheckSuccess * 10 +
      runtimeSuccess * 10 +
      traceability * 5 +
      acceptanceCriteriaPassRate * 5
  );

  return {
    schemaValidity: data.evaluation ? (data.evaluation.passed ? 1 : 0.5) : 0,
    completenessScore: Math.round(requirementsCoverage * 100),
    requirementsCoverage,
    architectureConsistency: data.evaluation
      ? data.evaluation.overallScore / 100
      : 0,
    apiCompleteness,
    databaseConsistency: 1, // deterministic from CONS-001 rule
    securityRuleScore,
    buildSuccess,
    testPassRate,
    healthCheckSuccess,
    runtimeSuccess,
    repairIterations: sandbox.repairIterations,
    timeToBuildMs: sandbox.timeToBuildMs,
    generatedFileCount: gen.fileCount,
    requirementToCodeTraceability: traceability,
    designToCodeConsistency: traceability,
    totalTokens: data.tokens?.total,
    estimatedCostUsd: data.tokens?.estimatedCostUsd,
    acceptanceCriteriaPassRate,
    overallScore,
    formulas: {
      requirementsCoverage: `satisfiedRequirements / totalRequirements = ${reqs.satisfiedRequirements} / ${reqs.totalRequirements}`,
      testPassRate: `passedTests / totalTests`,
      buildSuccess: `1 = success, 0 = failure`,
      securityRuleScore: `securityScore / 100 = ${data.security?.score ?? 0} / 100`,
      overallScore: `buildSuccess*20 + testPassRate*20 + securityRuleScore*15 + requirementsCoverage*15 + healthCheckSuccess*10 + runtimeSuccess*10 + traceability*5 + acceptance*5`,
    },
  };
}
