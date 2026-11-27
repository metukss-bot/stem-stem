# 안드로이드 앱 (APK)

웹 앱(`web/`)을 [Capacitor](https://capacitorjs.com/)로 감싼 안드로이드 앱이에요.
`main`에 변경이 들어가면 GitHub Actions(`Android APK`)가 APK를 만들어 릴리스에 올려요.

## 설치

1. 폰에서 <https://github.com/metukss-bot/stem-stem/releases/latest/download/StemStem.apk> 를 열어 받기
2. 받은 파일을 열고, "출처를 알 수 없는 앱 설치"를 허용한 뒤 설치
3. 새 버전도 같은 방법으로 받아 설치하면 기존 앱 위에 업데이트돼요 (저장한 곡 유지)

## 개발

```bash
cd web
npm run android:sync          # 웹 빌드 후 android/ 에 복사
cd android && ./gradlew assembleRelease   # 안드로이드 SDK가 있을 때
```

서명 키 `web/android/app/stemstem-sideload.keystore`는 개인 설치용 공개 키예요.
플레이스토어에 올릴 때는 새 비공개 키를 만들어 써야 해요.
