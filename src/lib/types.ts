export type Role = "office" | "jimu" | "company" | "employee";

export type Profile = {
  user_id: string;
  role: Role;
  name: string;
  emp_id: string | null;
  dept: string | null;
  company_id: string | null;
  no_personnel_authority: boolean;
  attested_at: string | null;
};

export type Company = {
  id: string;
  name: string;
  code: string;
};

export type ResultRow = {
  id: string;
  user_id: string;
  company_id: string;
  dept: string;
  fiscal_year: number;
  score_a: number;
  score_b: number;
  score_c: number;
  score_d: number;
  high_stress: boolean;
  consent: boolean;
  created_at: string;
};

export type InterviewRequest = {
  id: string;
  result_id: string;
  user_id: string;
  company_id: string;
  message: string | null;
  preferred: string | null;
  status: "pending" | "scheduled" | "done" | "cancelled";
  created_at: string;
};

export type GroupAnalysisRow = {
  dept: string;
  n: number;
  high_n: number;
  high_rate: number;
  avg_a: number;
  avg_b: number;
  avg_c: number;
};

export const ROLE_LABEL: Record<Role, string> = {
  office: "産業医事務所",
  jimu: "実施事務従事者",
  company: "事業者担当者",
  employee: "従業員",
};

export const STATUS_LABEL: Record<InterviewRequest["status"], string> = {
  pending: "申出受付",
  scheduled: "日程調整済",
  done: "実施済",
  cancelled: "取消",
};
