import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { z } from 'zod';
import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import { endpointInventory } from '../src/contracts/inventory';
import { schemas, responseContract, obj, str, bool, arr } from '../src/contracts/responses';
import { policy, successStatus } from '../src/contracts/policies';
export function example(schema: any, field = ''): any {
 if (schema.$ref) return example(schemas[schema.$ref.split('/').pop()!], field);
 if ('example' in schema) return schema.example;
 if ('default' in schema) return schema.default;
 if ('const' in schema) return schema.const;
 if (schema.enum) return schema.enum[0];
 if (schema.anyOf || schema.oneOf) return example((schema.anyOf ?? schema.oneOf)[0], field);
 if (schema.type === 'null') return null;
 if (schema.type === 'object' || schema.properties) return Object.fromEntries(Object.entries(schema.properties ?? {}).filter(([k]) => (schema.required ?? Object.keys(schema.properties ?? {})).includes(k)).map(([k,v]) => [k, example(v,k)]));
 if (schema.type === 'array') return [];
 if (schema.type === 'number' || schema.type === 'integer') return schema.minimum ?? 1;
 if (schema.type === 'boolean') return false;
 if (schema.format === 'date-time') return field === 'endsOn' || field === 'effectiveUntil' ? '2027-12-31T00:00:00Z' : '2026-08-01T00:00:00Z';
 if (schema.format === 'date' || /startsOn|admissionDate|dateOfBirth/.test(field)) return '2026-08-01';
 if (schema.format === 'email') return 'synthetic@example.invalid';
 if (schema.pattern?.includes('{24}') || /^(institution|program|academicYear|student|allocation|category|offering|user|employer|enrolment|request|existingStudent|sourceEnrolment|targetAllocation)$/.test(field)) return '000000000000000000000001';
 if (/token/i.test(field)) return '<runtime-token-only>';
 if (field === 'password') return '<local-generated-password>';
 if (field === 'apaarId') return '<synthetic-12-digit-fixture-only>';
 if (schema.pattern?.includes('evidence:')) return 'evidence:synthetic-review';
 return 'Synthetic example';
}
async function main() {
 const endpoints = endpointInventory(), paths: any = {}, collection: any = { info: { name: 'SatyaID API — synthetic examples only', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [] };
 const error = obj({ success: { const: false }, error: obj({ code: str, message: str }) }); schemas.Error = error;
 const envelope = (data: any) => obj({ success: { const: true }, message: str, data });
 for (const e of endpoints) {
  const { roles, scope } = policy(e), browser = e.path.includes('/auth/browser/'), file = /\/(template|error-report|download)$/.test(e.path), multipart = e.path === '/api/v1/uploads/students';
  const operationId = e.method + e.path.replace(/[^a-zA-Z0-9]+/g, '_'), status = successStatus(e);
  const parameters: any[] = [...e.path.matchAll(/\{(\w+)\}/g)].map(m => ({ name: m[1], in: 'path', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } }));
  let body: any;
  for (const validation of e.validations) {
   const json: any = z.toJSONSchema(validation.schema, { io: 'input', unrepresentable: 'any' }); delete json.$schema;
   if (validation.target === 'query') { const output: any = z.toJSONSchema(validation.schema, { io: 'output', unrepresentable: 'any' }); for (const [k,v] of Object.entries(json.properties ?? {})) if (!Object.keys(v as any).some(key => ['type','anyOf','oneOf'].includes(key))) json.properties[k] = output.properties[k]; }
   if (validation.target === 'query') for (const [name, schema] of Object.entries(json.properties ?? {})) parameters.push({ name, in: 'query', required: json.required?.includes(name) ?? false, schema, description: 'Strict query input; see scope/semantic notes. Numbers may be encoded as query strings.' });
   else if (validation.target === 'body') body = json;
  }
  if (multipart) { body = { ...body, properties: { ...body.properties, file: { type: 'string', format: 'binary', description: 'CSV or XLSX, maximum 2 MiB / 1000 rows; exact ten-column template.' } }, required: [...body.required, 'file'] }; }
  if (browser) parameters.push({ in: 'header', name: 'Origin', required: true, schema: { type: 'string', format: 'uri' }, example: 'http://localhost:5173' });
  if (browser && !e.path.endsWith('/csrf')) parameters.push({ in: 'header', name: 'X-CSRF-Token', required: true, schema: str, description: 'Nonce returned by bootstrap/login/refresh. Send matching HttpOnly cookies through credentials:include.' });
  let content: any;
  if (file) content = e.path.endsWith('/download') ? { 'application/json': { schema: obj({ metadata: { type: 'object', additionalProperties: true }, summary: { type: 'object', additionalProperties: true }, rows: arr({ type: 'object', additionalProperties: true }) }) }, 'text/csv': { schema: str } } : { 'text/csv': { schema: str, example: e.path.endsWith('/template') ? 'institutionStudentId,displayName,dateOfBirth,apaarId,allocation,academicYear,admissionDate,startsOn,endsOn,entryType\n' : 'rowNumber,errorCodes\n' } };
  else { const schema = envelope(responseContract(e)); content = { 'application/json': { schema, example: example(schema) } }; }
  const responses: any = { [status]: { description: status === 202 ? 'Queued; poll job status. This is not completion.' : 'Success; synthetic illustrative response.', content, headers: { 'X-Request-ID': { schema: str, description: 'Safe generated correlation ID' }, ...(browser ? { 'Set-Cookie': { schema: str, description: 'HttpOnly CSRF cookie; login/refresh also rotate refresh cookie. Logout clears both.' }, 'Cache-Control': { schema: { const: 'no-store' } } } : {}) } } };
  for (const code of [400,401,403,404,409,413,415,422,429,503,500]) responses[code] = { description: ({ 400:'Malformed JSON/request',401:'Authentication/session unavailable',403:'Role, origin, CSRF or object scope denied',404:'Resource unavailable; may conceal authorization',409:'State, capacity, duplicate or idempotency conflict',413:'Body/file size exceeded',415:'Unsupported encoding/media type',422:'Strict input validation failed',429:'Rate limited; use Retry-After',503:'Database, provider or key unavailable',500:'Unexpected internal failure; no private diagnostics' } as any)[code], content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
  const security = e.authenticated ? [{ bearerAuth: [] }] : browser && /\/(refresh|logout)$/.test(e.path) ? [{ refreshCookie: [], csrfCookie: [] }] : [];
  const op: any = { operationId, summary: e.method.toUpperCase() + ' ' + e.path, description: scope + ' ' + (e.path.endsWith('/verify-apaar') ? 'MOCKED only; no official APAAR integration; disabled in production.' : '') + ' Application semantic refinements (date ordering, claim subsets, current ownership/capacity) remain server-validated.', tags: [e.path.split('/')[3] ?? 'Operations'], 'x-roles': roles, 'x-scope': scope, security, parameters, responses };
  if (body) op.requestBody = { required: true, content: { [multipart ? 'multipart/form-data' : 'application/json']: { schema: body, ...(!multipart ? { example: example(body) } : {}) } } };
  (paths[e.path] ??= {})[e.method] = op;
  const group = op.tags[0], items = collection.item.find((g: any) => g.name === group) ?? (() => { const g = { name: group, item: [] }; collection.item.push(g); return g; })();
  const query = parameters.filter(p => p.in === 'query').map(p => ({ key: p.name, value: String(example(p.schema, p.name)), disabled: !p.required }));
  const urlPath = e.path.replace(/\{(\w+)\}/g, '{{$1}}');
  const req: any = { name: op.summary, request: { method: e.method.toUpperCase(), description: op.description + '\nRoles: ' + roles.join(', '), header: [...(e.authenticated ? [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }] : []), ...(browser ? [{ key: 'Origin', value: '{{frontendOrigin}}' }, ...(!e.path.endsWith('/csrf') ? [{ key: 'X-CSRF-Token', value: '{{csrfToken}}' }] : [])] : [])], url: { raw: '{{baseUrl}}' + urlPath, host: ['{{baseUrl}}'], path: urlPath.slice(1).split('/'), query } }, response: [] };
  if (body) req.request.body = multipart ? { mode: 'formdata', formdata: [{ key: 'institution', value: '{{institutionId}}', type: 'text' }, { key: 'idempotencyKey', value: 'synthetic-upload-unique-key', type: 'text' }, { key: 'file', type: 'file', src: [] }] } : { mode: 'raw', raw: JSON.stringify(example(body),null,2), options: { raw: { language: 'json' } } };
  if (body && !multipart) req.request.header.push({ key: 'Content-Type', value: 'application/json' });
  items.item.push(req);
 }
 const document = { openapi: '3.1.0', info: { title: 'SatyaID — institution-submitted student data', version: '4.0.0', description: 'Development/demo contracts. No official government identity or degree certification. Requests extracted from live Zod handlers; response projections reviewed against services. All examples are synthetic. Error statuses describe shared middleware/service possibilities, not a promise that every endpoint emits every status.' }, servers: [{ url: 'http://localhost:3000', description: 'Local development only' }], paths, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, refreshCookie: { type: 'apiKey', in: 'cookie', name: 'satyaid_refresh' }, csrfCookie: { type: 'apiKey', in: 'cookie', name: 'satyaid_csrf' } }, schemas } };
 await SwaggerParser.validate(document as any);
 await mkdir('docs/postman', { recursive: true });
 await writeFile('docs/openapi.yaml', YAML.stringify(document, { aliasDuplicateObjects: false }));
 await writeFile('docs/postman/SatyaID_API.postman_collection.json', JSON.stringify(collection,null,2)+'\n');
 await writeFile('docs/postman/SatyaID_Local.postman_environment.json', JSON.stringify({ name: 'SatyaID Local — placeholders only', values: [{key:'baseUrl',value:'http://localhost:3000',enabled:true},{key:'frontendOrigin',value:'http://localhost:5173',enabled:true}, ...['accessToken','csrfToken','id','membershipId','institutionId'].map(key=>({key,value:'',enabled:true}))], _postman_variable_scope: 'environment' },null,2)+'\n');
 const master = await readFile('FRONTEND_INTEGRATION_MASTER.md','utf8');
 const errorsFor = (p: string) => p.includes('/auth/') ? 'INVALID_CREDENTIALS, INVALID_REFRESH_TOKEN, CSRF_INVALID, BROWSER_ORIGIN_DENIED, BROWSER_TRANSPORT_REQUIRED' : p.includes('/students') ? 'IDENTITY_REVIEW_REQUIRED, IDENTITY_ALREADY_LINKED, WRITE_CONFLICT, INVALID_STUDENT_ACCOUNT, IDENTITY_KEY_VERSION_UNAVAILABLE, MOCK_PROVIDER_DISABLED' : p.includes('/enrolments') || p.includes('/transfers') ? 'CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION' : p.includes('/uploads') ? 'UPLOAD_NOT_VALIDATED, UPLOAD_NOT_FAILED, UPLOAD_PAYLOAD_EXPIRED, IDEMPOTENCY_CONFLICT, FILE_REQUIRED, UNSUPPORTED_UPLOAD_TYPE' : p.includes('/consents') || p.includes('/verification') || p.includes('/credentials') ? 'VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT' : p.includes('/reports') ? 'REPORT_UNAVAILABLE, REPORT_NOT_READY, REPORT_CONTENT_MISMATCH' : p.includes('/conflicts') ? 'CONFLICT_STATE_CHANGED, INVALID_REVIEWER' : p.includes('/intelligence') ? 'INVALID_ACADEMIC_YEAR, SIMULATION_PERIOD_INVALID, SIMULATION_SCOPE_TOO_LARGE' : 'CAPACITY_CONFLICT, DUPLICATE_RECORD';
 const catalog = endpoints.map((e, index) => {
  const op = paths[e.path][e.method], code = String(successStatus(e)), request = op.requestBody?.content, body = request && Object.values(request)[0] as any;
  const query = op.parameters.filter((p: any) => p.in === 'query');
  const success = op.responses[code].content;
  const sample = success['application/json']?.example ?? (success['text/csv']?.example || 'Raw JSON/CSV artifact: metadata, summary, rows; no success envelope.');
  const response = success['application/json']?.schema;
  const schemaNote = response?.properties?.data?.$ref ?? (response ? JSON.stringify(response.properties?.data ?? response) : 'Raw file response');
  return '\n### ' + (index+1) + '. ' + e.method.toUpperCase() + ' `' + e.path + '`\n\n' +
    '**Roles:** ' + (op['x-roles'].join(', ') || 'Public/session transport as described') + '. **Scope:** ' + op['x-scope'] + '\n\n' +
    '**Headers:** ' + (e.authenticated ? 'Authorization: Bearer <accessToken>. ' : '') + op.parameters.filter((p: any) => p.in === 'header').map((p: any) => p.name + ' required.').join(' ') + (body ? ' Content-Type: ' + Object.keys(request)[0] + (Object.keys(request)[0] === 'multipart/form-data' ? ' (browser sets boundary).' : '.') : '') + '\n\n' +
    '**Query schema:**\n```json\n' + JSON.stringify(query.map((p: any) => ({ name:p.name,required:p.required,schema:p.schema })),null,2) + '\n```\n\n' +
    '**Request body schema:**\n```json\n' + JSON.stringify(body?.schema ?? null,null,2) + '\n```\n\n' +
    '**HTTP ' + code + ' success example (synthetic):**\n```json\n' + JSON.stringify(sample,null,2) + '\n```\n\n' +
    '**Response contract:** `' + schemaNote + '`. See `docs/openapi.yaml` operation `' + op.operationId + '` and generated `paths` types for nested fields/optional projections.\n\n' +
    '**Relevant errors:** common errors above plus ' + errorsFor(e.path) + '. These family lists include service possibilities; inspect status/code, never infer identity existence.\n\n' +
    '**Frontend handling:** ' + (code === '202' ? 'Queued, not complete: save job ID, poll, review status and expiry. ' : e.method === 'get' ? 'Show scoped loading/empty/error state; clear previous account/institution data on scope change. ' : 'Submit once; preserve idempotency key if applicable, reload state/version on 409. ') + (e.path.includes('/browser/') ? 'Use credentials include and latest CSRF nonce; no refresh token JSON. ' : '') + (e.path.endsWith('/verify-apaar') ? 'MOCKED, never government-certified. ' : '') + '\n';
 }).join('');
 await writeFile('FRONTEND_INTEGRATION_MASTER.md', master.replace(/<!-- API_CATALOG_START -->[\s\S]*?<!-- API_CATALOG_END -->/, '<!-- API_CATALOG_START -->\n' + catalog + '\n<!-- API_CATALOG_END -->').replace(/[ \t]+\n/g, '\n'));
 console.log(`Validated OpenAPI 3.1 and generated ${endpoints.length} operations and Postman requests`);
}
main().catch(e=>{console.error(e); process.exitCode=1;});
