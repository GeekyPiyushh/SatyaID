import { describe, it, expect } from 'vitest';
import { qualityScore } from '../src/services/regulatory/intelligence';
import { csvCell } from '../src/services/regulatory/reports';
describe('transparent governance formulas', () => {
 const inputs = { profileCompleteness: { numerator: 18, denominator: 20 }, identityAssurance: { numerator: 10, denominator: 20 }, uploadValidity: { numerator: 15, denominator: 20 }, overlapReview: { numerator: 19, denominator: 20 }, intakeConfiguration: { numerator: 3, denominator: 4 }, reconciliation: { numerator: 18, denominator: 20 } };
 it('uses the published weights and produces a stable score', () => { const score = qualityScore(inputs); expect(score.score).toBe(79.5); expect(score.insufficientData).toBe(false); expect(score.components.reduce((sum, c) => sum + c.weight, 0)).toBe(100); });
 it('does not rank missing/tiny or truncated observations', () => { expect(qualityScore({ ...inputs, uploadValidity: { numerator: 0, denominator: 0 } }).score).toBeNull(); expect(qualityScore(inputs, true).insufficientData).toBe(true); });
 it('neutralizes CSV formula prefixes even after whitespace', () => { for (const value of ['=1+1', '+SUM(1)', '-2+3', '@SUM(1)', '\t=1', '  =1']) expect(csvCell(value)).toMatch(/^"'/); expect(csvCell('ordinary,"text"')).toBe('"ordinary,""text"""'); });
});
