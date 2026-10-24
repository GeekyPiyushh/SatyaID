export type MockOutcome = 'MATCH' | 'MISMATCH' | 'NOT_FOUND' | 'TIMEOUT' | 'UNAVAILABLE';
export interface VerificationInput { identifier: string }
export interface VerificationResult { outcome: MockOutcome; provider: 'MOCK_APAAR'; providerVersion: '1'; official: false }
export interface ApaarVerificationProvider { verify(input: VerificationInput): Promise<VerificationResult> }
// Project-local synthetic registry. These are not officially reserved national identifiers.
export const mockFixtures: Readonly<Record<string, MockOutcome>> = Object.freeze({
 '000000000001': 'MATCH', '000000000002': 'MISMATCH', '000000000003': 'NOT_FOUND', '000000000004': 'TIMEOUT', '000000000005': 'UNAVAILABLE',
});
export class MockApaarVerificationProvider implements ApaarVerificationProvider {
 async verify(input: VerificationInput): Promise<VerificationResult> { return { outcome: mockFixtures[input.identifier] ?? 'NOT_FOUND', provider: 'MOCK_APAAR', providerVersion: '1', official: false }; }
}
export const providers: Readonly<Record<string, ApaarVerificationProvider>> = Object.freeze({ MOCK_APAAR: new MockApaarVerificationProvider() });
