export type ApiSuccess<T> = { success: true; message: string; data: T };
export type ApiFailure = { success: false; error: { code: string; message: string } };
