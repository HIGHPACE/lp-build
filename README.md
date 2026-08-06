# @highpace/lp-build

HIGHPACE のLP制作で共通利用する gulp ビルド定義。SCSS コンパイル（sass +
autoprefixer）、画像圧縮、webp 生成、BrowserSync による監視を提供する。

## なぜこのパッケージがあるか

以前は各プロジェクトが独自の `gulpfile.js` を持っていて、棚卸しした時点で
**7種類に分岐**していた。SCSS のコンパイル方法もばらばらで、多くは VSCode 拡張
（Live Sass Compiler）任せだった。拡張の「バージョン」は設定ファイルで固定できない
ため、誰か一人が自動アップデートすると内蔵 autoprefixer の世代が変わり、同じ SCSS
でも出力が変わって無関係なプロジェクトの CSS に差分が出ていた。

ビルド定義をこのパッケージ1箇所に集約し、出力に影響する依存をここで厳密固定する
ことで、この分岐そのものを無くしている。

## 使い方

`package.json`:

```json
{
  "scripts": {
    "dev": "gulp",
    "build:css": "gulp css:all",
    "build:images": "gulp images",
    "build:webp": "gulp webp"
  },
  "browserslist": ["last 2 versions", "ios_saf >= 12", "Android >= 5", "not dead"],
  "overrides": {
    "browserslist": "4.28.7",
    "caniuse-lite": "1.0.30001806"
  },
  "devDependencies": {
    "gulp": "4.0.2",
    "@highpace/lp-build": "git+https://github.com/HIGHPACE/lp-build.git#v1.2.1"
  }
}
```

`gulpfile.js`:

```js
require('@highpace/lp-build')({ images: 'flat' });
```

インストールは **`npm ci`**。`npm install` は依存を更新してしまう可能性がある。

### `browserslist` は各プロジェクトに必須

autoprefixer は CSS ファイルのパスから上方向に `package.json` / `.browserslistrc` を
探索してターゲットを決める。つまり **`browserslist` はプロジェクト側に無いと効かず、
このパッケージに既定を置いても読まれない**。書き忘れると autoprefixer 自身の既定値
`defaults` で動き、気付かないまま別の出力になるため、タスク登録時にエラーで止める。

### `overrides` も各プロジェクトに書く

`caniuse-lite` は `browserslist` の推移的依存で、更新されると `last 2 versions` の
解決結果が変わり、付与されるプレフィックスが変わり得る。npm の `overrides` は
ルートの `package.json` でしか効かないため、各プロジェクトに書く必要がある。

プロジェクト側の `overrides` が実際に効くことは、意図的に古い版を指定して確認済み。

### オプション

| オプション | 値 | 既定 | 内容 |
| --- | --- | --- | --- |
| `images` | `'flat'` | ○ | `srcImg/sub/x.jpg` → `img/sub/x.jpg` |
| `images` | `'perPage'` | | `srcImg/<page>/<type>/x.jpg` → `<page>/<type>/img/x.jpg` |
| `exclude` | `string[]` | `[]` | コンパイル対象から外すパターン（後述） |

SCSS は `['./**/*.scss', '!./**/_*.scss', '!./node_modules/**']` の1本で全レイアウト
（`css/`・`assets/css/`・`lp01/assets/css/`・`<page>/<type>/css/`）を賄うため、
レイアウト指定のオプションは不要。

### タスク

| タスク | 内容 |
| --- | --- |
| `css` / `css:min` / `css:all` | 全 SCSS をコンパイル |
| `css:staged` | 環境変数 `SCSS_FILES` で渡された SCSS のみ（pre-commit 用） |
| `images` | jpg/png を圧縮（`gulp-changed` で増分） |
| `webp` | webp を生成（既存はスキップ） |
| `svgs` | SVG をコピー |
| `dev`（`default`） | 一括ビルド → BrowserSync → 監視 |

監視中の SCSS 保存では、保存したファイルに対応するページだけをコンパイルする。
パーシャル（`_*.scss`）を保存した場合は同じディレクトリのエントリが再生成される。
どのファイルが対象になったかは `[scss] ...` としてターミナルに表示される。

### ソースマップ

展開形の `.css` と圧縮形の `.min.css` の**両方**にソースマップを付ける。

v1.1.x では展開形だけに付けていたが、`.min.css` を参照しているページ（open-lp では
`careet` / `fudousan` / `mercurop` の12ファイル）で devtools から SCSS を追えなかったため、
v1.2.0 で圧縮形にも付けるようにした。

生成した `.css.map` は**コミットする**。コミットしないと、CSS 末尾の
`sourceMappingURL` コメントが参照先の無い状態になり、devtools で 404 警告が出る。

`sources` は **マップファイルのあるディレクトリ基準**の相対パスに正規化している。
dart-sass は絶対 `file://` URL を埋め込むため、そのままコミットすると人によって内容が
変わり CI が全員で落ちる。正規化により2つの異なるディレクトリでビルドしても同一になる。

**基準はマップの位置でなければならない。** ブラウザは `sources` をマップの URL からの
相対として解決するため、`process.cwd()` 基準にすると

```
css/style.css.map の sources が "a/b/css/style.scss"
→ /a/b/css/a/b/css/style.scss を取りに行って 404
```

となり、devtools に架空のフォルダが並んで SCSS を開けなくなる（v1.1.0 で実際に起きた）。
マップのディレクトリ基準なら `style.scss` になり正しく解決できる。テストで
「解決先が実在すること」を固定してある。

`sourcesContent` は埋め込まない（リポジトリに SCSS の中身が二重に入るのを避ける）。

コンパイル時間への影響は、保存1ファイルでは計測誤差の範囲（49ms → 49ms）。
`npm run build:css`（全105件）の実測は 4.06秒。全件ビルドを回すのは `npm run dev` の
起動時と CI のときだけ。

### `exclude` オプション

パーシャルが欠落してビルドできない過去の納品物を、コンパイル対象から外す。

```js
require('@highpace/lp-build')({
  images: 'flat',
  exclude: ['納品/**', 'lp02-b/**']
});
```

`css` / `css:min` / `css:staged` の対象と watch の監視グロブ、それに pre-commit の
CLI（`lp-build-scss-targets`）すべてに効く。除外したディレクトリを保存しても
何も起きない。

**`.gitignore` 済みでも `exclude` は必要。** グロブはディスクを見るため、git 管理外でも
ローカルに存在すればコンパイル対象になる。パーシャルが欠落していれば
`Can't find stylesheet to import.` でビルドが落ちる。CI（クリーンチェックアウト）は
通るのにローカルの `npm run build:css` だけが失敗する、という形で出る。

**プロジェクト単位の除外を復活させるものではない。** かつて `gulpfile.js` に
`!./shinshade/**` のような除外があり、そこだけ拡張任せになって差分の再発源になっていた。

### 既存の画像と webp は再生成しない

`images` は `gulp-changed` で `srcImg` 側が新しいものだけ処理し、`webp` は出力が既に
存在する場合はスキップする。これがないと `npm run dev` を1回実行しただけで既存の
全画像が新しい設定で再圧縮され、バイナリが全差分になる。

## このリポジトリを public にしている理由

git 依存として参照するため、**各プロジェクトの CI がこのリポジトリを読める必要がある**。
GitHub Actions の既定の `GITHUB_TOKEN` は同じ組織の別 private リポジトリを読めないため、
private のままだと全プロジェクトの CI に PAT を Secret として配る運用が必要になる。
展開先が13リポジトリに増えるとその管理コストが見合わないため public にしている。

公開しているのは gulp のビルド定義とバージョン固定だけで、顧客情報・素材・サイトの
中身は含まれない。

依存の指定は `git+https://` を明示する。`github:` 短縮形でも動くが、意図を明示しておく。

認証情報なし・SSH 不可の状態で `npm ci` が成功することを確認済み（lockfile の
`resolved` は npm の仕様で `git+ssh://` になるが、public なら匿名 HTTPS で解決される）。

## CI での注意

CI では `npm ci --ignore-scripts` を使う。`imagemin-pngquant` が依存する
`pngquant-bin` は postinstall でバイナリをビルドし、ubuntu では `libpng-dev` が
無いと失敗するため。

**`--ignore-scripts` では `images` タスクは動かない**（pngquant / mozjpeg の
バイナリが入らない）。CSS のコンパイルと webp 生成（`sharp` は prebuilt バイナリで
postinstall 不要）は動くので、CI で CSS の一致を検証する用途には十分。
ローカルでは通常の `npm ci` を使う。

## バージョンを上げる手順

v1.1.0 以降はソースマップをコミットするため、各プロジェクトの `.gitignore` に
`*.css.map` があれば削除する。CI の検証対象にも `*.css.map` を含める必要がある。

v1.2.0 では `.min.css.map` もコミットする。v1.1.x のときに `*.min.css.map` を
`.gitignore` へ入れた場合は撤去すること。

1. このリポジトリで修正してコミットする
2. `npm test` が通ることを確認する
3. `git tag v1.x.y && git push origin main --tags`
4. 各プロジェクトの `package.json` の `#v1.x.y` を書き換えて `npm install` し、
   `package-lock.json` をコミットする

**パッケージを直しても、各プロジェクトがバージョンを上げるまで反映されない。**

## 開発

```bash
npm ci                    # 画像タスクを試すなら --ignore-scripts を付けない
npm test                  # node --test（css / exclude / scss-targets / images / index / project-options）
node test/webp-smoke.js   # sharp が webp を出力できることの確認
```

## 検証済みの事項

open-lp（SCSS 105エントリ）を対象に実機で確認した。

- **CSS が移行前とバイト単位で一致する**（`css:all` 実行後の差分ゼロ）
- `sharp` は `npm ci --ignore-scripts` でも動作する（prebuilt バイナリ）
- gulp CLI からタスクが見える（`require('gulp')` の二重インスタンス化が起きない）
- `browserslist` が無いとタスク登録時にエラーで止まる
- SCSS 保存から反映まで 508ms、パーシャル保存で 926ms。他プロジェクトの CSS を
  巻き込まない
- `images` / `webp` が既存を再生成しない。`srcImg` を新しくすると再処理し、
  全ファイルの mtime が揃った状態（新規クローン相当）でも既存を守る
- プロジェクト側の `overrides` が実際に効く

v1.1.0（ソースマップ対応）で追加で確認した事項。

- **`.min.css` が差分ゼロ**。`gulp-sass` / `gulp-postcss` を外して `sass` / `postcss` の
  直接呼び出しに変えても、圧縮形の出力は1バイトも変わらない
- 展開形 `.css` の差分は末尾の `sourceMappingURL` コメント1行のみ。105ファイルすべてで
  それ以外の差分がゼロ
- マップ105件に絶対パスが含まれない。`.min.css.map` は生成されない
- 2つの異なるディレクトリでビルドしたマップ105件が完全一致する
- マップの構造が妥当（`version` が3、`mappings` が空でない、`sources` のファイルが実在）
- `npm run build:css`（全105件）の実測が 4.06秒

v1.1.1 で修正した点。

- **`sources` の基準をマップのディレクトリに変更**。v1.1.0 は `process.cwd()` 基準で、
  ブラウザがマップ位置からの相対として解決するため 404 になり、devtools に架空の
  フォルダが並んで SCSS を開けなかった。「解決先が実在すること」をテストで固定した

v1.2.0 で変えた点。

- **圧縮形 `.min.css` にもソースマップを付けるようにした**。`.min.css` を参照している
  ページで devtools から SCSS を追えなかったため。open-lp では `.min.css.map` が43件増える

v1.2.1 で修正した点。

- **pre-commit の CLI が `exclude` を無視していた**。CLI は gulp のタスクを通らないため
  `gulpfile.js` のオプションを知らず、除外したディレクトリの SCSS をコミットすると
  生成されない `.css.map` を `git add` しようとして pre-commit が失敗し、そのファイルを
  コミットできなくなっていた（sbivc の `lp02-b/` で実測）。CLI が `gulpfile.js` を
  読み込んで `exclude` を取るようにした。読み込み時はタスク登録をスキップするため
  gulp と browser-sync は読み込まれない
