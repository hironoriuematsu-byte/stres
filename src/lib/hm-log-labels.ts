// 健康管理Webの操作ログ(hm_access_logs)を、ストレスチェックWebのログ画面で読める日本語にする

// 対象の表
const HM_TABLE_LABEL: Record<string, string> = {
  hm_minutes: "衛生委員会議事録",
  hm_minute_files: "議事録の添付ファイル",
  hm_checkups: "健診結果",
  hm_csv_uploads: "健診CSV",
  hm_persons: "個人カルテ",
  hm_person_files: "カルテの書類",
  hm_person_documents: "産業医の作成文書",
  hm_patrols: "産業医巡視記録",
  hm_patrol_files: "巡視の写真・資料",
  hm_hygiene_patrols: "衛生管理者巡視記録",
  hm_env_measurements: "作業環境測定",
  hm_meet_rooms: "面談ルーム",
  hm_interviews: "産業医面談",
  hm_interview_opinions: "意見書",
  hm_pneumo_workers: "じん肺健康管理台帳",
  hm_pneumo_exams: "じん肺健診の記録",
  interview_intakes: "事前問診",
  results: "ストレスチェック結果",
  profiles: "アカウント",
};

// 操作(対象の表と組み合わせて「◯◯の表示」のように出す)
const HM_VERB: Record<string, string> = {
  view: "表示",
  create: "作成",
  update: "更新",
  delete: "削除",
  upload: "アップロード",
  download: "ダウンロード",
  print_batch: "一括印刷",
};

// それだけで意味が通る操作
const HM_ACTION_LABEL: Record<string, string> = {
  report_summary: "報告書の集計の表示",
  meet_room_create: "面談ルームの作成",
  meet_room_update: "面談ルームの更新",
  meet_enter: "面談ルームへの入室",
  checkup_notices: "受診勧奨・面談の通知書の表示",
  view_sheet: "意見書の表示(印刷用)",
  view_person: "統合ビューの表示",
  save_opinion: "意見書の保存",
  link_accounts: "カルテとアカウントの紐付け",
  export_work_judgment: "就業判定のCSV出力",
  export_checkup_list: "健診一覧のCSV出力",
  csv_upload_purge: "健診CSVの削除",
  mark_done: "面談を実施済にする",
  save_pre_info: "面談の事前情報の保存",
  save_record: "面談の実施記録の保存",
  view_record: "面談の実施記録の表示",
  work_judgment_note: "就業判定の所見の保存",
  report_mail: "意見書の発行を事業者担当者にメールで報告",
  auto_create: "面接指導の申出から面談を自動登録",
  view_requested_stress_results: "申出者のストレスチェック結果の表示",
};

export function hmActionLabel(action: string, table: string | null): string {
  if (HM_ACTION_LABEL[action]) return HM_ACTION_LABEL[action];
  const what = (table && HM_TABLE_LABEL[table]) || table || "";
  const verb = HM_VERB[action] ?? action;
  return what ? `${what}の${verb}` : verb;
}

// 閲覧(表示・ダウンロード・入室)か、データに影響する操作か
export function hmIsView(action: string): boolean {
  return action.startsWith("view") || action === "download" || action === "meet_enter" || action === "report_summary" || action === "checkup_notices";
}
