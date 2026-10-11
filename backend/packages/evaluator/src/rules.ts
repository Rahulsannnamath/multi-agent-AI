// packages/evaluator/src/rules.ts
// Deterministic architecture evaluation rules
// NO ML model required — pure rule-based evaluation

import type {
  ArchitectureOutput,
  DatabaseOutput,
  ApiOutput,
  SecurityOutput,
  RequirementsOutput,
  EvalRuleResult,
} from '@multi-agent/schemas';

export interface EvalContext {
  requirements: RequirementsOutput;
  architecture: ArchitectureOutput;
  database: DatabaseOutput;
  api: ApiOutput;
  security: SecurityOutput;
}

type RuleCheck = (ctx: EvalContext) => EvalRuleResult;

// ─── SCALABILITY RULES ────────────────────────────────────────────────────────

const scaleRules: RuleCheck[] = [
  (ctx) => {
    const hasLb = ctx.architecture.components.some((c) => c.type === 'loadbalancer');
    const highLoad = ctx.requirements.scaleAssumptions.peakRequestsPerSecond > 100;
    return {
      ruleId: 'SCALE-001',
      category: 'scalability',
      severity: highLoad && !hasLb ? 'WARNING' : 'INFO',
      passed: !highLoad || hasLb,
      message: highLoad && !hasLb
        ? `High load (${ctx.requirements.scaleAssumptions.peakRequestsPerSecond} RPS) but no load balancer in architecture`
        : 'Load balancing check passed',
      affectedComponent: 'backend-api',
      recommendation: 'Add a load balancer component (nginx, AWS ALB, etc.) for high-load scenarios',
    };
  },
  (ctx) => {
    const hasCache = ctx.architecture.components.some((c) => c.type === 'cache');
    const highLoad = ctx.requirements.scaleAssumptions.peakRequestsPerSecond > 50;
    return {
      ruleId: 'SCALE-002',
      category: 'scalability',
      severity: highLoad && !hasCache ? 'WARNING' : 'INFO',
      passed: !highLoad || hasCache,
      message: highLoad && !hasCache
        ? 'High load expected but no caching layer (Redis/Memcached) in architecture'
        : 'Caching check passed',
      affectedComponent: 'backend-api',
      recommendation: 'Add Redis caching for session data and frequently accessed resources',
    };
  },
  (ctx) => {
    const dbComponent = ctx.architecture.components.find((c) => c.type === 'database');
    const spof = dbComponent?.isSinglePointOfFailure ?? false;
    const highAvail = ctx.requirements.nonFunctionalRequirements.some(
      (n) => n.category === 'availability' && n.description.toLowerCase().includes('99')
    );
    return {
      ruleId: 'SCALE-003',
      category: 'scalability',
      severity: highAvail && spof ? 'ERROR' : 'INFO',
      passed: !(highAvail && spof),
      message: highAvail && spof
        ? 'High availability required but database is a single point of failure'
        : 'Database resilience check passed',
      affectedComponent: dbComponent?.id ?? 'database',
      recommendation: 'Use MongoDB replica set or Atlas for high availability',
    };
  },
];

// ─── AVAILABILITY RULES ───────────────────────────────────────────────────────

const availabilityRules: RuleCheck[] = [
  (ctx) => {
    const spofs = ctx.architecture.components.filter((c) => c.isSinglePointOfFailure);
    return {
      ruleId: 'AVAIL-001',
      category: 'availability',
      severity: spofs.length > 2 ? 'ERROR' : spofs.length > 0 ? 'WARNING' : 'INFO',
      passed: spofs.length === 0,
      message: spofs.length > 0
        ? `${spofs.length} single point(s) of failure: ${spofs.map((s) => s.name).join(', ')}`
        : 'No single points of failure detected',
      affectedComponent: spofs[0]?.id ?? 'architecture',
      recommendation: 'Implement redundancy or failover for each identified SPOF',
    };
  },
  (ctx) => {
    const hasMonitoring = ctx.architecture.components.some((c) => c.type === 'monitoring');
    return {
      ruleId: 'AVAIL-002',
      category: 'availability',
      severity: hasMonitoring ? 'INFO' : 'WARNING',
      passed: hasMonitoring,
      message: hasMonitoring ? 'Monitoring component present' : 'No monitoring/observability component in architecture',
      recommendation: 'Add monitoring (Prometheus/Grafana, Datadog, etc.) for production observability',
    };
  },
];

// ─── SECURITY RULES ───────────────────────────────────────────────────────────

const securityRules: RuleCheck[] = [
  (ctx) => {
    const unprotectedEndpoints = ctx.api.endpoints.filter(
      (ep) => !ep.authentication && ep.method !== 'GET' && !ep.path.includes('auth')
    );
    return {
      ruleId: 'SEC-001',
      category: 'security',
      severity: unprotectedEndpoints.length > 0 ? 'CRITICAL' : 'INFO',
      passed: unprotectedEndpoints.length === 0,
      message: unprotectedEndpoints.length > 0
        ? `${unprotectedEndpoints.length} non-GET endpoint(s) without authentication: ${unprotectedEndpoints.map((e) => e.path).join(', ')}`
        : 'All write endpoints are authenticated',
      affectedComponent: 'backend-api',
      recommendation: 'Add JWT authentication middleware to all state-modifying endpoints',
    };
  },
  (ctx) => {
    const publicEndpoints = ctx.api.endpoints.filter((ep) => !ep.authentication);
    const unratedPublic = publicEndpoints.filter((ep) => !ep.rateLimited);
    return {
      ruleId: 'SEC-002',
      category: 'security',
      severity: unratedPublic.length > 0 ? 'ERROR' : 'INFO',
      passed: unratedPublic.length === 0,
      message: unratedPublic.length > 0
        ? `${unratedPublic.length} public endpoint(s) without rate limiting: ${unratedPublic.map((e) => e.path).join(', ')}`
        : 'All public endpoints have rate limiting',
      affectedComponent: 'backend-api',
      recommendation: 'Apply express-rate-limit to all public endpoints to prevent abuse',
    };
  },
  (ctx) => {
    const hasCriticalFindings = ctx.security.findings.some((f) => f.severity === 'CRITICAL');
    return {
      ruleId: 'SEC-003',
      category: 'security',
      severity: hasCriticalFindings ? 'CRITICAL' : 'INFO',
      passed: !hasCriticalFindings,
      message: hasCriticalFindings
        ? 'Security analysis found CRITICAL vulnerabilities that must be addressed'
        : 'No critical security findings',
      affectedComponent: 'architecture',
      recommendation: 'Address all CRITICAL security findings before code generation',
    };
  },
  (ctx) => {
    return {
      ruleId: 'SEC-004',
      category: 'security',
      severity: ctx.security.encryptionInTransit ? 'INFO' : 'ERROR',
      passed: ctx.security.encryptionInTransit,
      message: ctx.security.encryptionInTransit
        ? 'Transport encryption (HTTPS) is configured'
        : 'No transport encryption specified — application should use HTTPS',
      recommendation: 'Enforce HTTPS in production; use TLS certificates',
    };
  },
];

// ─── PERFORMANCE RULES ───────────────────────────────────────────────────────

const performanceRules: RuleCheck[] = [
  (ctx) => {
    const entitiesWithoutIndexes = ctx.database.entities.filter(
      (e) => e.indexes.length === 0 && e.fields.length > 3
    );
    return {
      ruleId: 'PERF-001',
      category: 'performance',
      severity: entitiesWithoutIndexes.length > 0 ? 'WARNING' : 'INFO',
      passed: entitiesWithoutIndexes.length === 0,
      message: entitiesWithoutIndexes.length > 0
        ? `${entitiesWithoutIndexes.length} entity(s) have no indexes: ${entitiesWithoutIndexes.map((e) => e.name).join(', ')}`
        : 'All entities have appropriate indexes',
      recommendation: 'Add indexes on frequently queried fields for performance',
    };
  },
  (ctx) => {
    const perfNfr = ctx.requirements.nonFunctionalRequirements.filter(
      (n) => n.category === 'performance'
    );
    const hasCacheOrCdn = ctx.architecture.components.some(
      (c) => c.type === 'cache' || c.type === 'cdn'
    );
    const needsCache = perfNfr.some((n) => n.description.toLowerCase().includes('fast'));
    return {
      ruleId: 'PERF-002',
      category: 'performance',
      severity: needsCache && !hasCacheOrCdn ? 'WARNING' : 'INFO',
      passed: !needsCache || hasCacheOrCdn,
      message: needsCache && !hasCacheOrCdn
        ? 'Performance requirements mention fast responses but no cache/CDN in architecture'
        : 'Performance architecture check passed',
      recommendation: 'Add CDN for static assets and Redis for dynamic data caching',
    };
  },
];

// ─── MAINTAINABILITY RULES ────────────────────────────────────────────────────

const maintainabilityRules: RuleCheck[] = [
  (ctx) => {
    // Check that all REQ IDs are referenced somewhere in architecture
    const allReqIds = ctx.requirements.functionalRequirements.map((r) => r.id);
    const referencedReqIds = new Set(
      ctx.architecture.components.flatMap((c) => c.requirements)
    );
    const unreferenced = allReqIds.filter((id) => !referencedReqIds.has(id));
    return {
      ruleId: 'MAINT-001',
      category: 'maintainability',
      severity: unreferenced.length > allReqIds.length / 2 ? 'WARNING' : 'INFO',
      passed: unreferenced.length < allReqIds.length / 2,
      message: unreferenced.length > 0
        ? `${unreferenced.length} requirement(s) not referenced in architecture: ${unreferenced.slice(0, 5).join(', ')}`
        : 'All requirements are referenced in architecture',
      recommendation: 'Ensure architecture components explicitly reference the requirements they satisfy',
    };
  },
  (ctx) => {
    const hasAuth = ctx.architecture.components.some((c) => c.type === 'auth');
    const authRequired = ctx.requirements.functionalRequirements.some(
      (r) =>
        r.title.toLowerCase().includes('login') ||
        r.title.toLowerCase().includes('auth') ||
        r.description.toLowerCase().includes('authentication')
    );
    return {
      ruleId: 'MAINT-002',
      category: 'maintainability',
      severity: authRequired && !hasAuth ? 'ERROR' : 'INFO',
      passed: !authRequired || hasAuth,
      message: authRequired && !hasAuth
        ? 'Application requires authentication but no auth component in architecture'
        : 'Authentication architecture check passed',
      affectedComponent: 'backend-api',
      recommendation: 'Add explicit authentication service/component to architecture',
    };
  },
];

// ─── CONSISTENCY RULES ────────────────────────────────────────────────────────

const consistencyRules: RuleCheck[] = [
  (ctx) => {
    // All API endpoints that reference DB entities should exist in DB design
    const dbEntityIds = new Set(ctx.database.entities.map((e) => e.id));
    const missingEntities: string[] = [];
    for (const ep of ctx.api.endpoints) {
      for (const entityId of ep.dbEntities) {
        if (!dbEntityIds.has(entityId)) {
          missingEntities.push(`${ep.path} references ${entityId}`);
        }
      }
    }
    return {
      ruleId: 'CONS-001',
      category: 'consistency',
      severity: missingEntities.length > 0 ? 'ERROR' : 'INFO',
      passed: missingEntities.length === 0,
      message: missingEntities.length > 0
        ? `API endpoints reference undefined DB entities: ${missingEntities.slice(0, 3).join('; ')}`
        : 'API/Database entity references are consistent',
      recommendation: 'Ensure all DB entities referenced in API endpoints are defined in the database design',
    };
  },
  (ctx) => {
    // REQ coverage by API
    const funcReqIds = ctx.requirements.functionalRequirements.map((r) => r.id);
    const coveredByApi = new Set(ctx.api.endpoints.flatMap((ep) => ep.requirements));
    const uncovered = funcReqIds.filter((id) => !coveredByApi.has(id));
    const coverage = 1 - uncovered.length / Math.max(funcReqIds.length, 1);
    return {
      ruleId: 'CONS-002',
      category: 'consistency',
      severity: coverage < 0.5 ? 'ERROR' : coverage < 0.8 ? 'WARNING' : 'INFO',
      passed: coverage >= 0.8,
      message: `Requirement coverage by API: ${Math.round(coverage * 100)}% (${funcReqIds.length - uncovered.length}/${funcReqIds.length})`,
      affectedComponent: 'backend-api',
      recommendation: 'Ensure all functional requirements are implemented via API endpoints',
    };
  },
];

// ─── All rules combined ───────────────────────────────────────────────────────

export const ALL_RULES: { category: string; rules: RuleCheck[] }[] = [
  { category: 'scalability', rules: scaleRules },
  { category: 'availability', rules: availabilityRules },
  { category: 'security', rules: securityRules },
  { category: 'performance', rules: performanceRules },
  { category: 'maintainability', rules: maintainabilityRules },
  { category: 'consistency', rules: consistencyRules },
];

export function runAllRules(ctx: EvalContext): EvalRuleResult[] {
  const results: EvalRuleResult[] = [];
  for (const group of ALL_RULES) {
    for (const rule of group.rules) {
      try {
        results.push(rule(ctx));
      } catch (err) {
        results.push({
          ruleId: 'RULE-ERROR',
          category: group.category as EvalRuleResult['category'],
          severity: 'WARNING',
          passed: false,
          message: `Rule evaluation error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }
  return results;
}
