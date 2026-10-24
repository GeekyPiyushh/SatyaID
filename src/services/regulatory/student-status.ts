import type { ClientSession } from 'mongoose';
import * as m from '../../models';
import { aggregate, enrolmentStages } from './analytics';
import type { AnalyticsFilters } from '../../validators/regulatory';
import { studentStatusFields } from '../../validators/student-status';
export async function identityPresenceCounts(filters: AnalyticsFilters, session: ClientSession) {
 return aggregate(m.Enrolment, [...enrolmentStages(filters), { $group: { _id: '$student' } }, { $lookup: { from: m.ApaarIdentityVault.collection.name, localField: '_id', foreignField: 'student', pipeline: [{ $project: { _id: 1 } }], as: '_vault' } }, { $group: { _id: { $cond: [{ $gt: [{ $size: '$_vault' }, 0] }, 'LINKED', 'MISSING'] }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }], session);
}
export async function studentStatusDistribution(filters: AnalyticsFilters, session: ClientSession) {
 return aggregate(m.Enrolment, [...enrolmentStages(filters), { $lookup: { from: m.StudentInstitution.collection.name, let: { student: '$student', institution: '$institution' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$student', '$$student'] }, { $eq: ['$institution', '$$institution'] }] } } }, { $project: { _id: 0, nriStatus: 1, ociStatus: 1, foreignNationalStatus: 1 } }], as: '_profile' } }, { $set: { _profile: { $arrayElemAt: ['$_profile', 0] } } }, { $group: { _id: { ...Object.fromEntries(studentStatusFields.map(key => [key, { $ifNull: ['$_profile.' + key, 'UNKNOWN'] }])), enrolmentStatus: '$status' }, enrolmentCount: { $sum: 1 }, _students: { $addToSet: '$student' } } }, { $project: { _id: 0, nriStatus: '$_id.nriStatus', ociStatus: '$_id.ociStatus', foreignNationalStatus: '$_id.foreignNationalStatus', enrolmentStatus: '$_id.enrolmentStatus', enrolmentCount: 1, distinctStudents: { $size: '$_students' } } }, { $sort: { nriStatus: 1, ociStatus: 1, foreignNationalStatus: 1, enrolmentStatus: 1 } }], session);
}
