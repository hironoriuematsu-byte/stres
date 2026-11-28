// ============================================================
// 電子契約(産業医業務委託契約)の契約内容と契約書の文面。
//
// 画面(実施者の作成フォーム・プレビュー・署名ページ)とサーバー(送信時の確定・ハッシュ計算)で
// 同じ関数を使う。ここには暗号・データベース・メールの処理は置かない(contract-crypto.ts / contract-server.ts)。
//
// 契約の当事者:
//   甲 = 契約先の企業(事業者)
//   乙 = メステート合同会社(うえまつ産業医事務所)。担当医師は 上松 弘典(産業医)
// ============================================================

import { IMPLEMENTER, SELLER } from "@/lib/org";
import { formatJpDate, taxIncluded } from "@/lib/plan";

// 契約書の文面の版。文面(条文)を変えたときは +1 する。送信済みの契約書は送信時の文面を保存しているので影響しない
export const CONTRACT_TEMPLATE_VERSION = 1;

// 署名用リンクの有効期間(日)。期限が切れたら実施者が再送する
export const SIGN_LINK_DAYS = 14;
// アクセスコードの入力ミスの上限(超えたら実施者が再送して新しいリンクにする)
export const CODE_MAX_ATTEMPTS = 10;

export type VisitFrequency = "monthly" | "bimonthly";
export type PaymentTiming = "month_end" | "next_month_end";

export const VISIT_OPTIONS: { value: VisitFrequency; label: string }[] = [
  { value: "monthly", label: "月1回" },
  { value: "bimonthly", label: "2か月に1回" },
];
export const PAYMENT_OPTIONS: { value: PaymentTiming; label: string }[] = [
  { value: "month_end", label: "当月末日" },
  { value: "next_month_end", label: "翌月末日" },
];
export const visitLabel = (v: string | null | undefined): string => VISIT_OPTIONS.find((o) => o.value === v)?.label ?? "月1回";
export const paymentLabel = (v: string | null | undefined): string => PAYMENT_OPTIONS.find((o) => o.value === v)?.label ?? "翌月末日";

// 契約の内容(実施者が入力する)
export type ContractFields = {
  partyName: string; // 甲: 会社名(法人名)
  partyOfficeName: string; // 甲: 事業場名(本社・○○工場など。空でもよい)
  partyAddress: string; // 甲: 事業場の所在地
  partyRepTitle: string; // 甲: 代表者の役職
  partyRepName: string; // 甲: 代表者の氏名
  signerName: string; // 甲側で電子署名する人の氏名(代表者本人または権限のある担当者)
  signerTitle: string; // 署名者の役職
  signerEmail: string; // 署名用リンクの送り先
  workers: number | null; // 事業場の労働者数(おおよそ)
  startDate: string; // 契約開始日 YYYY-MM-DD
  termMonths: number; // 契約期間(か月)
  autoRenew: boolean; // 自動更新
  visitFrequency: VisitFrequency; // 訪問の頻度
  hoursPerVisit: number; // 1回の訪問時間(時間)
  monthlyFee: number; // 月額報酬(税込・円)
  paymentTiming: PaymentTiming; // 支払期日
  includeStressCheck: boolean; // ストレスチェックの実施者業務を含める
  specialTerms: string; // 特記事項(空なら条項を入れない)
};

export const DEFAULT_FIELDS: ContractFields = {
  partyName: "",
  partyOfficeName: "",
  partyAddress: "",
  partyRepTitle: "代表取締役",
  partyRepName: "",
  signerName: "",
  signerTitle: "",
  signerEmail: "",
  workers: null,
  startDate: "",
  termMonths: 12,
  autoRenew: true,
  visitFrequency: "monthly",
  hoursPerVisit: 2,
  monthlyFee: 55000,
  paymentTiming: "next_month_end",
  includeStressCheck: true,
  specialTerms: "",
};

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function validDate(s: string): boolean {
  const m = RE_DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

// 入力の確認。画面とサーバーで同じ検査をする
export function parseContractFields(raw: Record<string, unknown>): { ok: true; value: ContractFields } | { ok: false; error: string } {
  const workersN = num(raw.workers);
  const v: ContractFields = {
    partyName: str(raw.partyName, 100),
    partyOfficeName: str(raw.partyOfficeName, 100),
    partyAddress: str(raw.partyAddress, 200),
    partyRepTitle: str(raw.partyRepTitle, 60),
    partyRepName: str(raw.partyRepName, 60),
    signerName: str(raw.signerName, 60),
    signerTitle: str(raw.signerTitle, 60),
    signerEmail: str(raw.signerEmail, 200).toLowerCase(),
    workers: Number.isFinite(workersN) ? Math.floor(workersN) : null,
    startDate: str(raw.startDate, 10),
    termMonths: Math.floor(num(raw.termMonths)),
    autoRenew: raw.autoRenew !== false,
    visitFrequency: raw.visitFrequency === "bimonthly" ? "bimonthly" : "monthly",
    hoursPerVisit: num(raw.hoursPerVisit),
    monthlyFee: Math.floor(num(raw.monthlyFee)),
    paymentTiming: raw.paymentTiming === "month_end" ? "month_end" : "next_month_end",
    includeStressCheck: raw.includeStressCheck !== false,
    specialTerms: str(raw.specialTerms, 2000),
  };
  if (!v.partyName) return { ok: false, error: "契約先の会社名を入力してください" };
  if (!v.partyAddress) return { ok: false, error: "契約先の所在地を入力してください" };
  if (!v.partyRepName) return { ok: false, error: "契約先の代表者の氏名を入力してください" };
  if (!v.partyRepTitle) return { ok: false, error: "契約先の代表者の役職を入力してください" };
  if (!v.signerName) return { ok: false, error: "署名する方の氏名を入力してください" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.signerEmail)) return { ok: false, error: "署名する方のメールアドレスを正しく入力してください" };
  if (v.workers != null && !(v.workers >= 1 && v.workers <= 100000)) return { ok: false, error: "労働者数は1〜100000の範囲で入力してください(空でもかまいません)" };
  if (!validDate(v.startDate)) return { ok: false, error: "契約開始日を入力してください" };
  if (!(v.termMonths >= 1 && v.termMonths <= 60)) return { ok: false, error: "契約期間は1〜60か月で入力してください" };
  if (!(v.hoursPerVisit >= 0.5 && v.hoursPerVisit <= 8) || Math.round(v.hoursPerVisit * 2) !== v.hoursPerVisit * 2) {
    return { ok: false, error: "1回の訪問時間は0.5〜8時間(0.5時間刻み)で入力してください" };
  }
  if (!(v.monthlyFee >= 0 && v.monthlyFee <= 10_000_000)) return { ok: false, error: "月額報酬を入力してください(税込・円)" };
  return { ok: true, value: v };
}

// アクセスコード(任意): 4〜8桁の数字。送信者が電話などで別に伝える
export function parseAccessCode(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { ok: true, value: "" };
  if (!/^\d{4,8}$/.test(s)) return { ok: false, error: "アクセスコードは4〜8桁の数字で入力してください(使わない場合は空のまま)" };
  return { ok: true, value: s };
}

// ---- 日付 ----

// n か月後の前日(契約の終了日)。月末をまたぐときは月末に合わせる(1/31 の 1か月後 → 2/28 の前日ではなく 2月末日)
export function termEndDate(start: string, months: number): string {
  const m = RE_DATE.exec(start)!;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  // 開始日の n か月後(同じ日。存在しない日は月末に丸める)の前日
  const target = new Date(Date.UTC(y, mo + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  target.setUTCDate(target.getUTCDate() - 1);
  return target.toISOString().slice(0, 10);
}

// 契約番号: 作成した年と id の先頭8文字(領収書番号と同じ方式)
export const contractNo = (id: string, createdAt: string): string => `E${createdAt.slice(0, 4)}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

export const feeText = (fee: number): string => `月額 ${fee.toLocaleString()}円(税込。うち消費税 ${taxIncluded(fee).toLocaleString()}円)`;

// ---- 契約書の文面 ----

export type ContractItem = string | { text: string; subs: string[] };
export type ContractArticle = { no: number; title: string; items: ContractItem[] };
export type ContractParty = { label: "甲" | "乙"; address: string; name: string; rep: string; note?: string };
export type ContractDoc = {
  title: string;
  contractNo: string;
  templateVersion: number;
  preamble: string;
  articles: ContractArticle[];
  closing: string;
  ko: ContractParty;
  otsu: ContractParty;
};

export const OFFICE_PARTY = {
  name: `${SELLER.name}(${IMPLEMENTER.officeName})`,
  address: SELLER.address,
  repTitle: "代表社員",
  repName: SELLER.representative,
  doctor: IMPLEMENTER.full,
  email: SELLER.email,
} as const;

export function partyDisplayName(f: Pick<ContractFields, "partyName" | "partyOfficeName">): string {
  return f.partyOfficeName ? `${f.partyName} ${f.partyOfficeName}` : f.partyName;
}

export function renderContract(f: ContractFields, meta: { contractNo: string; templateVersion?: number }): ContractDoc {
  const end = termEndDate(f.startDate, f.termMonths);
  const site = `${partyDisplayName(f)}(${f.partyAddress})${f.workers ? ` 労働者数 約${f.workers.toLocaleString()}名` : ""}`;
  const articles: ContractArticle[] = [];
  let n = 0;
  const art = (title: string, items: ContractItem[]) => articles.push({ no: ++n, title, items });

  art("目的", [
    `甲は、労働安全衛生法(以下「法」という)第13条に基づき、甲の次の事業場(以下「本事業場」という)における産業医の業務を乙に委託し、乙はこれを受託する。\n本事業場: ${site}`,
    `乙は、乙に所属する医師 ${IMPLEMENTER.name}(以下「担当医師」という)を本業務に従事させ、甲は担当医師を本事業場の産業医として選任する。`,
  ]);

  const duties: string[] = [
    "健康診断の実施およびその結果に基づく労働者の健康を保持するための措置に関すること",
    "長時間労働者等に対する面接指導およびその結果に基づく措置に関すること",
    "ストレスチェック(心理的な負担の程度を把握するための検査)の結果に基づく面接指導およびその結果に基づく措置に関すること",
    "作業環境の維持管理、作業の管理その他労働者の健康管理に関すること",
    "健康教育、健康相談その他労働者の健康の保持増進を図るための措置に関すること",
    "衛生教育に関すること",
    "労働者の健康障害の原因の調査および再発防止のための措置に関すること",
    "衛生委員会(安全衛生委員会を含む)への出席および意見の陳述",
    "職場巡視(次条)",
    "前各号に関し、甲に対して必要な勧告、指導および助言を行うこと",
  ];
  if (f.includeStressCheck) {
    duties.push(
      "ストレスチェックの実施者としての業務(調査票の選定、高ストレス者の選定基準の決定、結果の確認および面接指導の要否の判断等)。" +
        "ただし、Web上の受検環境(ストレスチェックWeb)の利用料は本契約の報酬に含まず、別途その申込および利用規約による"
    );
  }
  art("業務の内容", [
    { text: "乙が担当医師により行う業務(以下「本業務」という)は、法第13条および労働安全衛生規則第14条に定める産業医の職務のうち、次のとおりとする。", subs: duties },
    "本業務は、本事業場の労働者を対象とし、本事業場以外の事業場を対象とする場合は、甲乙協議のうえ別に定める。",
  ]);

  const monthly = f.visitFrequency === "monthly";
  art("訪問および職場巡視", [
    `乙は、担当医師を${visitLabel(f.visitFrequency)}、1回あたり${f.hoursPerVisit}時間を標準として本事業場に訪問させ、職場巡視、衛生委員会への出席、面接指導、健康相談等の本業務を行う。訪問の日時は、甲乙協議のうえ定める。`,
    monthly
      ? "担当医師は、職場巡視を少なくとも毎月1回行う。"
      : "甲は、労働安全衛生規則第15条第1項に定める情報(衛生管理者が行う巡視の結果、労働者の健康障害を防止し、または労働者の健康を保持するために必要な情報)を毎月1回以上乙に提供するものとし、担当医師は、甲の同意に基づき、職場巡視を少なくとも2か月に1回行う。",
    "訪問の日以外においても、乙は、電子メール、電話、オンライン会議等により甲からの相談に応じる。",
    "標準の訪問回数または訪問時間を超える訪問、面接指導が多数に及ぶ場合、健康教育の講師、意見書・報告書の作成その他の追加の業務に係る費用は、甲乙協議のうえ別に定める。",
  ]);

  art("甲の協力", [
    "甲は、本業務の遂行に必要な情報(労働者の健康診断の結果、労働時間の状況、作業環境、衛生委員会の議事等)を乙に提供し、面接指導および健康相談に必要な場所および設備を用意する。",
    "甲は、法第13条第4項に基づき、産業医が労働者の健康管理等を適切に行うために必要な情報を担当医師に提供する。",
    "甲は、担当医師の勧告を受けたときは、これを尊重し、勧告の内容および勧告を踏まえて講じた措置の内容(措置を講じない場合はその旨およびその理由)を衛生委員会に報告する。",
    "甲は、本事業場が常時50人以上の労働者を使用するときは、本契約の締結後遅滞なく担当医師を産業医として選任し、選任後14日以内に所轄労働基準監督署長に報告する。乙は、報告に必要な書面(医師免許証の写し、産業医の資格を証する書面等)を甲に提供する。",
  ]);

  art("報酬", [
    `本業務の報酬は、${feeText(f.monthlyFee)}とする。`,
    `乙は、毎月末日までに当月分の請求書を甲に送付し、甲は、${paymentLabel(f.paymentTiming)}までに乙の指定する銀行口座に振り込んで支払う。振込手数料は甲の負担とする。`,
    "契約期間の開始または終了が月の途中である場合においても、その月の報酬は日割りせず、月額とする。",
    "報酬は、前々条第1項に定める標準の訪問に対するものとし、追加の業務に係る費用は前々条第4項による。",
    "法令の改正、本事業場の労働者数または業務量の著しい変動等があったときは、甲乙協議のうえ報酬を改定することができる。",
  ]);

  art("契約期間", [
    `本契約の有効期間は、${formatJpDate(f.startDate)}から${formatJpDate(end)}までの${f.termMonths}か月間とする。`,
    f.autoRenew
      ? "有効期間の満了する日の1か月前までに、甲または乙から書面または電磁的方法による終了の申出がないときは、本契約は同一の条件でさらに1年間更新されるものとし、以後も同様とする。"
      : "有効期間の満了後の本契約の継続については、有効期間の満了する日の1か月前までに甲乙協議のうえ定める。",
  ]);

  art("産業医の独立性および権限", [
    "甲は、担当医師が産業医としての職務を医学的な知見に基づき独立して遂行することを尊重し、産業医の職務に関して不当な影響を及ぼさない。",
    "担当医師は、法第13条第5項に基づき、労働者の健康を確保するため必要があると認めるときは、甲に対し、労働者の健康管理等について必要な勧告をすることができる。",
    "甲は、担当医師の勧告を理由として、担当医師または乙に対し、本契約の解除その他の不利益な取扱いをしない。",
  ]);

  art("秘密保持および個人情報の取扱い", [
    "甲および乙は、本契約に関して知り得た相手方の秘密情報を、相手方の事前の承諾なく第三者に開示または漏洩してはならず、本契約の目的以外に使用しない。本契約の終了後も同様とする。",
    "乙および担当医師は、本業務により知り得た労働者の健康情報その他の個人情報を、個人情報の保護に関する法律、法および厚生労働省の指針に従って取り扱い、労働者本人の同意がある場合または法令に定めがある場合を除き、甲を含む第三者に提供しない。",
    "甲は、本業務のために乙から提供を受けた労働者の健康情報を、労働者の心身の状態に関する情報の適正な取扱いに関する法令および指針に従って取り扱い、労働者の健康の確保に必要な範囲を超えて利用しない。",
    "甲は、担当医師が医師としての守秘義務(法第105条等)および職業倫理に基づいて行う情報の取扱いを妨げない。",
  ]);

  art("再委託", [
    "乙は、担当医師が疾病、休暇その他の事由により本業務を行うことができないときは、甲の承諾を得て、産業医の要件を備える他の医師に本業務の一部を代行させることができる。この場合、乙は、当該医師に本契約と同等の義務を負わせる。",
  ]);

  art("解除および解約", [
    "甲または乙は、相手方が本契約に違反し、相当の期間を定めて催告したにもかかわらず是正されないときは、本契約を解除することができる。",
    {
      text: "甲または乙は、相手方に次の事由があるときは、催告なく直ちに本契約を解除することができる。",
      subs: [
        "支払の停止、または破産手続開始、民事再生手続開始その他これらに類する手続の申立てがあったとき",
        "反社会的勢力の排除に関する条項の表明または保証に反したとき",
        "その他本契約を継続しがたい重大な事由があるとき",
      ],
    },
    "甲および乙は、3か月前までに書面または電磁的方法により相手方に通知することにより、本契約を解約することができる。",
  ]);

  art("損害賠償", [
    "甲または乙は、本契約に違反して相手方に損害を与えたときは、その直接かつ通常の損害を賠償する。ただし、乙の賠償額は、乙の故意または重大な過失による場合を除き、損害の原因が生じた月の直前12か月間に甲が乙に支払った報酬の額を上限とする。",
  ]);

  art("反社会的勢力の排除", [
    "甲および乙は、自らまたはその役員が、暴力団、暴力団員、暴力団準構成員、暴力団関係企業、総会屋その他これらに準ずる者(以下「反社会的勢力」という)に該当しないこと、および反社会的勢力と社会的に非難されるべき関係を有しないことを表明し、保証する。",
    "甲および乙は、自らまたは第三者を利用して、相手方に対し、暴力的な要求行為、法的な責任を超えた不当な要求行為、脅迫的な言動または業務を妨害する行為をしない。",
  ]);

  if (f.specialTerms) {
    art("特記事項", f.specialTerms.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean));
  }

  art("協議および管轄", [
    "本契約に定めのない事項または本契約の解釈に疑義が生じた事項は、甲乙誠意をもって協議し、解決する。",
    "本契約に関する紛争は、京都地方裁判所を第一審の専属的合意管轄裁判所とする。",
  ]);

  art("電子契約", [
    "本契約は、電磁的記録により作成し、甲および乙がそれぞれ電子署名(電子署名及び認証業務に関する法律第2条第1項に定める電子署名)を行うことによって成立する。",
    "甲および乙は、本契約の電磁的記録を原本として保管し、書面の作成および押印は行わない。",
  ]);

  return {
    title: "産業医業務委託契約書",
    contractNo: meta.contractNo,
    templateVersion: meta.templateVersion ?? CONTRACT_TEMPLATE_VERSION,
    preamble: `${f.partyName}(以下「甲」という)と、${OFFICE_PARTY.name}(以下「乙」という)は、甲の事業場における産業医の業務の委託に関し、次のとおり契約(以下「本契約」という)を締結する。`,
    articles,
    closing: "本契約の成立を証するため、本契約の電磁的記録を作成し、甲および乙が電子署名を行う。",
    ko: {
      label: "甲",
      address: f.partyAddress,
      name: partyDisplayName(f),
      rep: `${f.partyRepTitle} ${f.partyRepName}`,
    },
    otsu: {
      label: "乙",
      address: OFFICE_PARTY.address,
      name: OFFICE_PARTY.name,
      rep: `${OFFICE_PARTY.repTitle} ${OFFICE_PARTY.repName}`,
      note: `担当医師: ${OFFICE_PARTY.doctor}`,
    },
  };
}

// ハッシュを取るための文面(契約書の内容を1つの文字列に並べたもの)。
// 同じ契約内容からは必ず同じ文字列になる。表示の見た目(字体・余白)は含まない
export function contractText(doc: ContractDoc): string {
  const lines: string[] = [doc.title, `契約番号 ${doc.contractNo}`, `文面の版 ${doc.templateVersion}`, "", doc.preamble, ""];
  for (const a of doc.articles) {
    lines.push(`第${a.no}条(${a.title})`);
    a.items.forEach((it, i) => {
      const prefix = a.items.length > 1 ? `${i + 1}. ` : "";
      if (typeof it === "string") {
        lines.push(`${prefix}${it}`);
      } else {
        lines.push(`${prefix}${it.text}`);
        it.subs.forEach((s, k) => lines.push(`  (${k + 1}) ${s}`));
      }
    });
    lines.push("");
  }
  lines.push(doc.closing, "");
  for (const p of [doc.ko, doc.otsu]) {
    lines.push(`${p.label}: ${p.address} / ${p.name} / ${p.rep}${p.note ? ` / ${p.note}` : ""}`);
  }
  return lines.join("\n");
}

// ---- 状態 ----

export type ContractStatus = "draft" | "sent" | "signed" | "declined" | "cancelled";

export const STATUS_LABEL: Record<ContractStatus | "expired", { label: string; tone: "gray" | "orange" | "teal" | "red" }> = {
  draft: { label: "下書き", tone: "gray" },
  sent: { label: "署名待ち", tone: "orange" },
  expired: { label: "期限切れ(再送できます)", tone: "red" },
  signed: { label: "締結済み", tone: "teal" },
  declined: { label: "辞退", tone: "red" },
  cancelled: { label: "取消", tone: "gray" },
};

// 署名待ちのリンクの期限が切れているか(状態は 'sent' のまま。表示上は「期限切れ」)
export function isExpired(status: string, tokenExpiresAt: string | null | undefined, now: Date = new Date()): boolean {
  return status === "sent" && !!tokenExpiresAt && new Date(tokenExpiresAt).getTime() < now.getTime();
}

export function displayStatus(status: string, tokenExpiresAt: string | null | undefined, now: Date = new Date()): ContractStatus | "expired" {
  if (isExpired(status, tokenExpiresAt, now)) return "expired";
  return status as ContractStatus;
}

// 記録(監査証跡)の事象
export type ContractEventKind = "created" | "updated" | "sent" | "resent" | "viewed" | "signed" | "completed" | "declined" | "cancelled";
export const EVENT_LABEL: Record<ContractEventKind, string> = {
  created: "作成(下書き)",
  updated: "下書きの変更",
  sent: "送信・乙の合意(電子署名)",
  resent: "再送(新しいリンク)",
  viewed: "甲が閲覧",
  signed: "甲の合意(電子署名)",
  completed: "締結完了・事業者署名の付与",
  declined: "甲が辞退",
  cancelled: "送信者が取消",
};

export type ContractEvent = {
  id: string;
  contract_id: string;
  seq: number;
  event: ContractEventKind;
  actor: "office" | "party" | "system";
  actor_name: string | null;
  actor_email: string | null;
  ip: string | null;
  user_agent: string | null;
  at: string;
  detail: Record<string, unknown> | null;
  prev_hash: string | null;
  hash: string;
};

export type ContractRow = {
  id: string;
  contract_no: string;
  kind: string;
  status: ContractStatus;
  company_id: string | null;
  fields: ContractFields;
  template_version: number | null;
  document: ContractDoc | null;
  document_hash: string | null;
  party_name: string;
  signer_name: string;
  signer_email: string;
  signer_title: string | null;
  monthly_fee: number | null;
  start_date: string | null;
  token_expires_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signed_name: string | null;
  signed_title: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  cancelled_at: string | null;
  completion_hash: string | null;
  service_signature: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

// ログイン利用者(office / jimu)が読める列。トークン・アクセスコードのハッシュなどは SQL の列権限で読めないため、
// select("*") ではなく必ずこの列を指定する
export const CONTRACT_COLS =
  "id, contract_no, kind, status, company_id, fields, template_version, document, document_hash, party_name, signer_name, signer_email, signer_title, " +
  "monthly_fee, start_date, token_expires_at, sent_at, viewed_at, signed_at, signed_name, signed_title, declined_at, decline_reason, cancelled_at, " +
  "completion_hash, service_signature, note, created_at, updated_at";

// 日本時間の日時表示(監査証跡・署名欄)
export function formatJst(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${j.getUTCFullYear()}年${j.getUTCMonth() + 1}月${j.getUTCDate()}日 ${p(j.getUTCHours())}:${p(j.getUTCMinutes())}:${p(j.getUTCSeconds())}`;
}
