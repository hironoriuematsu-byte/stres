// ============================================================
// 実施者・実施事務局の表記(帳票・メールで共通利用)
//
// 労働安全衛生法上、ストレスチェックの「実施者」は医師等の個人であり、
// 事業所(法人)は実施者になれない。したがって実施者は医師名で表記し、
// 事務所名は実施事務局(所属)として併記する。
// ============================================================

export const IMPLEMENTER = {
  name: "上松 弘典", // 実施者(医師)
  title: "医師(産業医)", // 資格
  full: "医師(産業医) 上松 弘典", // 帳票の「実施者」欄に表示する表記
  officeName: "うえまつ産業医事務所", // 実施事務局(所属機関)
  officeAddress: "京都府京都市中京区錦小路通室町西入天神山町280 4階",
  corporateName: "Mestate LLC",
} as const;

// 宣伝ページ・社内検討用資料に載せる実施者の紹介。経歴・資格は1行ずつ。空の場合は表示しない
// (photo: public/ に置いた顔写真のパス。例 "/plan/doctor.jpg")
export const IMPLEMENTER_PROFILE: { career: string[]; photo: string } = {
  career: [],
  photo: "",
};

// Web申込(クレジットカード決済)の販売事業者。特定商取引法に基づく表記・領収書で使う
export const SELLER = {
  name: "メステート合同会社",
  issuerName: "メステート合同会社 うえまつ産業医事務所", // 領収書(適格請求書)の発行者名
  representative: "上松 弘典",
  address: IMPLEMENTER.officeAddress,
  email: "support@mestate.jp",
  // 適格請求書発行事業者の登録番号(国税庁の公表サイトで公開されている情報)
  invoiceRegistrationNo: "T7130003006446",
} as const;

// 帳票フッターなどで使う発行者表記
export const ISSUER_LINE = `実施者: ${IMPLEMENTER.full} / 実施事務局: ${IMPLEMENTER.officeName}`;

// 健康管理Web(別アプリ)のURL。環境変数が未設定の場合は連携の導線を表示しない。
// ストレスチェックWebは健康管理Webに依存せず、単独で動作する。
export const KENKO_URL = process.env.NEXT_PUBLIC_KENKO_URL ?? "";
