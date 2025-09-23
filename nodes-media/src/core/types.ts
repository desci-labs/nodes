export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  message?: string;
  errors?: { field: string; message: string }[];
}
