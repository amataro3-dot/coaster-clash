// COASTER CLASH 専用の Firebase プロジェクト(coaster-clash-e0449。2026-11-23 作成)
// databaseURL は、Realtime Database をシンガポール(asia-southeast1)に作ったときのアドレス
// この設定は秘密ではない(使えるサイトは Google Cloud の APIキーの制限でしぼる)
const firebaseConfig = {
  apiKey: "AIzaSyBqawBz__D5PM9dChFxJboFhMmD5MOuj9o",
  authDomain: "coaster-clash-e0449.firebaseapp.com",
  databaseURL: "https://coaster-clash-e0449-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "coaster-clash-e0449",
  storageBucket: "coaster-clash-e0449.firebasestorage.app",
  messagingSenderId: "888650225879",
  appId: "1:888650225879:web:b63602f68f1f61debef892"
};
// App Check(reCAPTCHA Enterprise)のサイトキー。キーを作ったらここに入れる(公開してよい)。空なら使わない
const APP_CHECK_KEY = '';
