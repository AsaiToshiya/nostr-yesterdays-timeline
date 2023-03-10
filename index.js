import * as fs from "fs";

import * as dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });
import { marked } from "marked";
import { SimplePool, nip19 } from "nostr-tools";
import "websocket-polyfill";

// アカウントの公開鍵
const PK = nip19.decode(process.env.NPUB).data;

// リレー サーバー
const RELAYS = JSON.parse(process.env.RELAYS.replace(/'/g, '"'));

const byCreateAt = (a, b) => a.created_at - b.created_at;

const byCreateAtDesc = (a, b) => b.created_at - a.created_at;

const escape = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/ /g, "&nbsp;");

// UNIX 時間を返す
const getTodayWithoutTime = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor(today.getTime() / 1000);
};

const todayUnixTime = getTodayWithoutTime();
const yesterdayUnixTime = todayUnixTime - 86400;
const yesterday = new Date(yesterdayUnixTime * 1000);

const pool = new SimplePool({
  eoseSubTimeout: 3 * 60 * 1000,
  getTimeout: 3 * 60 * 1000,
});

// フォロー
const following = (
  await pool.list(RELAYS, [
    {
      authors: [PK],
      kinds: [3],
    },
  ])
)
  .sort(byCreateAtDesc)
  .shift();

// ベースのアカウントとフォローの pubkey
const authors = [PK, ...following.tags?.map((tag) => tag[1])];

// 投稿
const posts = (
  await pool.list(RELAYS, [
    {
      authors,
      kinds: [1],
      since: yesterdayUnixTime - 1,
      until: todayUnixTime,
    },
  ])
).sort(byCreateAtDesc);

// 投稿者の pubkey
const postAuthors = posts.map((post) => post.pubkey);

// プロフィール
const profiles = (
  await pool.list(RELAYS, [
    {
      authors: postAuthors,
      kinds: [0],
    },
  ])
)
  .sort(byCreateAt)
  .reduce(
    (acc, obj) => ({ ...acc, [obj.pubkey]: JSON.parse(obj.content) }),
    {}
  );

// HTML を作成する
const date = yesterday.toLocaleDateString();
const html =
  `<!DOCTYPE html>
  <html lang="ja">
    <head>
      <meta charset="utf8" />
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="github-markdown.css">
      <style>
        .markdown-body {
          box-sizing: border-box;
          min-width: 200px;
          max-width: 980px;
          margin: 0 auto;
          padding: 45px;
        }
      
        @media (max-width: 767px) {
          .markdown-body {
            padding: 15px;
          }
        }
      </style>
      <title>${date} のタイムライン</title>
    </head>
    <body class="markdown-body">
      <h1>${date} のタイムライン</h1>
` +
  posts
    .map((post) => {
      const author = profiles[post.pubkey] ?? {};
      const displayName = author.display_name ?? author.displayName;
      const name = author.name ?? author.username;
      const content = marked.parse(escape(post.content));
      const date = new Date(post.created_at * 1000);
      const time = date.toLocaleTimeString();
      return `      <p>${displayName}@${name}</p>
      <p>${content}</p>
      <p>${time}</p>`;
    })
    .join("\n") +
  `
    </body>
  </html>`;

// ファイルに出力する
fs.writeFileSync("index.html", html);

// await pool.close(RELAYS); // TypeError: Cannot read properties of undefined (reading 'sendCloseFrame')
process.exit(); // HACK: 強制終了する
