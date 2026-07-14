"use client";

// ブラウザ・スマホの翻訳機能(Google翻訳等)はDOMのテキストノードを
// <font>タグ等に置き換えるため、Reactが画面を更新する際に
// removeChild / insertBefore が「対象ノードが見つからない」エラーで
// 落ちる(Application error)。既知の問題への標準的な回避策として、
// 親子関係が崩れている場合は安全にスキップするようパッチする。
// 参考: facebook/react #11538
if (typeof window !== "undefined" && typeof Node === "function" && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      return child; // 翻訳機能等により既に別の場所へ移されたノードは無視
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // 基準ノードが翻訳機能により移動済みの場合は末尾に追加して継続する
      return this.appendChild(newNode) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}

export function DomSafety() {
  return null;
}
