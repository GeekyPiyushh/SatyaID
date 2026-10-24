import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020';
import { endpointInventory } from '../src/contracts/inventory';
import { responseContract } from '../src/contracts/responses';
const spec = YAML.parse(readFileSync('docs/openapi.yaml', 'utf8'));
describe('published API contract parity', () => {
 it('validates OpenAPI 3.1 and exact method/path parity including browser routes', async () => {
  await expect(SwaggerParser.validate(structuredClone(spec))).resolves.toBeTruthy();
  const actual = endpointInventory().map(e => e.method + ' ' + e.path).sort();
  const documented = Object.entries(spec.paths).flatMap(([p, ops]: any) => Object.keys(ops).map(m => m + ' ' + p)).sort(); expect(documented).toEqual(actual); expect(actual).toHaveLength(98);
  for (const endpoint of endpointInventory()) if (!/\/(template|error-report|download)$/.test(endpoint.path)) expect(responseContract(endpoint)).toBeTruthy();
 });
 it('validates Postman collection shape, endpoint count and placeholder environment', () => {
  const collection = JSON.parse(readFileSync('docs/postman/SatyaID_API.postman_collection.json','utf8'));
  const validator = new Ajv2020({ strict: false }).compile({ type:'object', required:['info','item'], properties:{ info:{ type:'object', required:['name','schema'] }, item:{ type:'array', items:{ type:'object', required:['name','item'], properties:{ item:{ type:'array', items:{ type:'object', required:['name','request'], properties:{ request:{ type:'object', required:['method','url','header'], properties:{ method:{ enum:['GET','POST','PATCH','PUT','DELETE'] }, url:{ type:'object', required:['raw','path'] }, header:{ type:'array' } } } } } } } } } } });
  expect(validator(collection), JSON.stringify(validator.errors)).toBe(true);
  const entries = collection.item.flatMap((g: any) => g.item); expect(entries).toHaveLength(98);
  const env = JSON.parse(readFileSync('docs/postman/SatyaID_Local.postman_environment.json','utf8')); expect(env.values.filter((v: any) => /token/i.test(v.key)).every((v: any) => v.value === '')).toBe(true);
 });
});
