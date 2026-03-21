import admin from "firebase-admin";

function getServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing");
  }
  // 일부 환경에서 줄바꿈/이스케이프가 섞일 수 있어 정리
  const fixed = raw.replace(/\n/g, "\\n");
  return JSON.parse(fixed);
}

export function getFirebaseAdmin() {
  if (admin.apps.length) return admin;

  const serviceAccount = getServiceAccountFromEnv();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin;
}
