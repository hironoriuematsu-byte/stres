"use client";

import { useEffect, useRef, useState } from "react";
import { brand } from "@/lib/brand";

// 音声入力(パソコン向け)。ブラウザ標準の音声認識(Web Speech API)を使う。
//   ・Chrome / Edge で動作。非対応のブラウザとスマートフォン・タブレットでは表示しない
//     (スマートフォンはキーボードのマイクで音声入力できるため)
//   ・押すと聞き取りを開始し、もう一度押すまで続ける。確定した文を onAppend で入力欄の末尾に足す
//   ・音声はブラウザの音声認識サービス(Chrome: Google / Edge: Microsoft)で文字に変換される。
//     ストレスチェックWebのサーバーには音声は送られず、変換後の文字だけが入力欄に入る

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// パソコンで音声入力ボタンが使えるか(画面の案内文の出し分けに使う)
export function useVoiceSupport(): { desktopVoice: boolean; touch: boolean } {
  const [s, setS] = useState({ desktopVoice: false, touch: false });
  useEffect(() => {
    const fine = window.matchMedia?.("(pointer: fine)").matches ?? false;
    setS({ desktopVoice: !!getRecognitionCtor() && fine, touch: !fine });
  }, []);
  return s;
}

export function VoiceInputButton({ onAppend, disabled }: { onAppend: (chunk: string) => void; disabled?: boolean }) {
  const { desktopVoice } = useVoiceSupport();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const wantRef = useRef(false);
  const appendRef = useRef(onAppend);
  appendRef.current = onAppend;

  useEffect(
    () => () => {
      wantRef.current = false;
      recRef.current?.abort();
    },
    []
  );
  useEffect(() => {
    if (disabled && listening) {
      wantRef.current = false;
      recRef.current?.stop();
      setListening(false);
    }
  }, [disabled, listening]);

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText) appendRef.current(finalText);
      if (finalText || interimText) window.dispatchEvent(new Event("sc-activity"));
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantRef.current = false;
        setError("マイクの使用が許可されていません。アドレスバーのマイクの設定で「許可」にしてください。");
      } else if (e.error === "audio-capture") {
        wantRef.current = false;
        setError("マイクが見つかりません。マイクの接続を確認してください。");
      } else if (e.error === "network") {
        wantRef.current = false;
        setError("音声認識サービスに接続できませんでした。通信状況を確認してください。");
      }
    };
    rec.onend = () => {
      setInterim("");
      if (wantRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* 再開できなければ終了 */
        }
      }
      setListening(false);
    };
    recRef.current = rec;
    wantRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("音声入力を開始できませんでした。");
    }
  };
  const stop = () => {
    wantRef.current = false;
    recRef.current?.stop();
    setListening(false);
  };

  if (!desktopVoice) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled}
        aria-pressed={listening}
        style={{
          background: listening ? "#C0392B" : "#fff",
          color: listening ? "#fff" : brand.tealDark,
          border: `1px solid ${listening ? "#C0392B" : brand.teal}`,
          borderRadius: 10,
          padding: "9px 16px",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {listening ? "■ 音声入力を止める" : "🎤 音声で入力"}
      </button>
      {listening && <span style={{ fontSize: 12, color: "#5B6B6A" }}>聞き取り中…{interim && `「${interim}」`}</span>}
      {error && <span style={{ fontSize: 12, color: "#B02A2A" }}>{error}</span>}
    </span>
  );
}
