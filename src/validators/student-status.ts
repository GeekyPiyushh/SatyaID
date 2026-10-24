import { z } from 'zod';
// Institution-submitted declarations, independent of seat category and of one another.
export const studentStatusValues = ['YES', 'NO', 'UNKNOWN'] as const;
export const studentStatusFields = ['nriStatus', 'ociStatus', 'foreignNationalStatus'] as const;
export const studentStatus = z.enum(studentStatusValues);
export const studentStatuses = { nriStatus: studentStatus.optional(), ociStatus: studentStatus.optional(), foreignNationalStatus: studentStatus.optional() };
export function profileView(profile: any) {
 const data = typeof profile.toObject === 'function' ? profile.toObject() : profile;
 return { ...data, ...Object.fromEntries(studentStatusFields.map(key => [key, data[key] ?? 'UNKNOWN'])) };
}
