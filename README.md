# 単語帳アプリ (word-app)

英単語・古文単語などを管理し、カード型UIで学習できるWebアプリです。

## 機能

- 管理者画面で単語帳(英単語/古文単語など)と単語(word, mean, remarks)を作成・編集・削除
- 管理者画面からCSVインポート(列: `word,mean,remarks`)
- カード型のフラッシュカードUI、スマホ対応
- 4種類の出題モード
  - 英単語セット: 日→英 / 英→日
  - 古文単語セット: 現→古 / 古→現
- 出題結果を学習ログとして記録し、統計画面でグラフ表示
  - 日別の学習数・正答率の推移
  - 単語帳ごとの正答率
  - 出題モードごとの正答率

## セットアップ手順

### 1. Supabaseプロジェクトを作成

1. https://supabase.com にログインし、新規プロジェクトを作成
2. プロジェクト作成後、左メニューの **SQL Editor** を開く
3. このリポジトリの `supabase/schema.sql` の内容を貼り付けて実行
   - `word_sets` / `words` / `study_logs` の3テーブルが作成されます
4. **Project Settings > API** から以下をコピー
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` キー → `SUPABASE_SERVICE_ROLE_KEY`(絶対に公開しない)

### 2. 環境変数を設定

```bash
cp .env.local.example .env.local
```

`.env.local` を開いて、上でコピーした3つの値を貼り付けてください。

### 3. ローカルで起動

```bash
npm install
npm run dev
```

http://localhost:3000 で以下のページが使えます。

- `/` … 単語帳選択・出題モード選択
- `/admin` … 管理者画面(単語帳・単語の管理、CSVインポート)
- `/stats` … 学習データの統計

### 4. Vercelにデプロイ

1. このプロジェクトをGitHubリポジトリにpush
2. Vercelで新規プロジェクトとしてimport(koryo-fes-resultsとは別プロジェクトにする)
3. Vercelの Project Settings > Environment Variables に、`.env.local` と同じ3つの環境変数を設定
4. Deploy

## 現状の制限・今後の拡張ポイント

- **管理者画面は現在認証なし**でアクセスできます。公開後は以下のいずれかで保護することを推奨します。
  - Vercelの「Password Protection」機能(Pro以上)
  - `/admin` 配下にBasic認証をかけるmiddleware.tsの追加
  - Supabase Authを使ったログイン画面の追加(将来的にユーザーごとの学習履歴管理にも拡張可能)
- 現在は学習ログにユーザー識別子がないため、全員の記録が1つに集計されます。個人ごとに分けたい場合はSupabase Authの導入が必要です。
- CSVの文字コードはUTF-8を想定しています。Excelで作成したCSVがShift-JISの場合、文字化けすることがあるため「UTF-8で保存」してから読み込んでください。

## CSVインポートのフォーマット例

```csv
word,mean,remarks
apple,りんご,
run,走る,不規則変化動詞(ran/run)
いと,とても,程度副詞
をかし,趣がある,枕草子などで頻出
```
