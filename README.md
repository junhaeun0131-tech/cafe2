<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# 바이브 카페 주문 시스템

## Supabase 연결

1. Supabase 프로젝트의 SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql)을 실행합니다. 주문 테이블은 익명 주문 INSERT만 허용하며, 고객 정보 노출을 막기 위해 브라우저 조회 권한은 부여하지 않습니다.
2. 프로젝트의 Settings > API에서 Project URL과 anon key를 확인합니다. `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`를 `.env.local`에 설정합니다. `.env.example`을 참고하세요.
3. 개발 서버를 실행하거나 재시작합니다. 주문 접수 내역은 DB INSERT가 성공한 뒤에만 화면에 표시됩니다.

## 로컬 실행

```sh
npm install --legacy-peer-deps
npm run dev
```

현재 의존성의 Vite/esbuild peer 버전이 충돌해 `npm install`에는 `--legacy-peer-deps` 옵션이 필요합니다.
